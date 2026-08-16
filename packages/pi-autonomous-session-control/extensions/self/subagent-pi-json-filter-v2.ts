import { spawn, spawnSync } from "node:child_process";
import { writeSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { acquireSharedSubagentCapacityTransition } from "./subagent-capacity.ts";
import {
  type SubagentCapacityCustodyBinding,
  writeSubagentCapacityCustody,
  writeSubagentCapacitySpawnCommitted,
} from "./subagent-capacity-custody.ts";
// Protocol generation v2: raw_child_spawn_intent synchronously precedes raw Pi spawn.
// Keep this event-order contract stable; a future incompatible protocol gets a new helper file.
import {
  createIsolatedSubagentAgentDir,
  type IsolatedSubagentAgentDir,
  SUBAGENT_CHILD_AGENT_DIR_ENV,
} from "./subagent-child-agent-dir.ts";
import { createSubagentHelperLivenessController } from "./subagent-helper-liveness.ts";
import {
  type AssistantMessageEndProtocolEvent,
  classifyPiSettlementMode,
  isRecognizedPiJsonEventLine,
  type SubagentProtocolEvent,
  type SubagentSettlementMode,
  type TransportReadyProtocolEvent,
  translatePiJsonEventLineToSubagentProtocol,
} from "./subagent-protocol-v2.ts";
import { getProcessStartTicks } from "./subagent-session-status.ts";

const DEFAULT_SUBAGENT_OUTPUT_CHARS = 64_000;
const DEFAULT_FILTERED_PROTOCOL_EVENT_BUFFER_BYTES = 256 * 1024;
const DEFAULT_RAW_PI_EVENT_BUFFER_BYTES = 8 * 1024 * 1024;
const DEFAULT_HELPER_STARTUP_TIMEOUT_MS = 30_000;
const DEFAULT_HELPER_EXECUTION_TIMEOUT_MS = 4 * 60 * 60 * 1_000;

const RAW_SUPERVISOR_BASENAME = "subagent-raw-supervisor-v1";

export function resolveRawSupervisorPath(moduleUrl = import.meta.url): string {
  const modulePath = fileURLToPath(moduleUrl);
  const extension = modulePath.endsWith(".js") ? ".js" : ".ts";
  return join(dirname(modulePath), `${RAW_SUPERVISOR_BASENAME}${extension}`);
}

interface RunnerOptions {
  cwd: string;
  model: string;
  tools: string;
  thinking: string;
  sessionFile: string;
  objective: string;
  startupTimeoutMs: number;
  executionTimeoutMs: number;
  parentPid?: number;
  parentPidStartedAt?: number;
  capacityCustody?: SubagentCapacityCustodyBinding;
  /** Accepted only for already-loaded v2 parents; new dispatches keep task variation in objective. */
  legacySystemPrompt?: string;
  extensionSources: string[];
  noSkills: boolean;
  skillSources: string[];
}

async function main(): Promise<void> {
  const options = parseArgs(process.argv.slice(2));
  const maxFinalTextChars = readNonNegativeIntEnv(
    ["PI_SUBAGENT_OUTPUT_CHARS", "PI_ORCH_SUBAGENT_OUTPUT_CHARS"],
    DEFAULT_SUBAGENT_OUTPUT_CHARS,
  );
  const maxFilteredProtocolEventBytes = readNonNegativeIntEnv(
    ["PI_SUBAGENT_EVENT_BUFFER_BYTES", "PI_ORCH_SUBAGENT_EVENT_BUFFER_BYTES"],
    DEFAULT_FILTERED_PROTOCOL_EVENT_BUFFER_BYTES,
  );
  const maxRawPiEventBufferBytes = readNonNegativeIntEnv(
    ["PI_SUBAGENT_RAW_PI_EVENT_BUFFER_BYTES", "PI_ORCH_SUBAGENT_RAW_PI_EVENT_BUFFER_BYTES"],
    DEFAULT_RAW_PI_EVENT_BUFFER_BYTES,
  );
  const backpressureTimeoutMs = readPositiveIntEnv(
    ["PI_SUBAGENT_HELPER_BACKPRESSURE_TIMEOUT_MS"],
    60_000,
  );

  const settlementContract = detectPiSettlementContract(options.cwd || process.cwd());
  if (!settlementContract) {
    process.stdout.write(
      `${JSON.stringify({
        type: "protocol_error",
        errorMessage:
          "Unable to establish a supported Pi settlement contract. ASC supports explicit Pi 0.76 legacy finality and authoritative agent_settled on Pi >=0.80.",
      })}\n`,
    );
    process.exitCode = 1;
    return;
  }

  const args = ["--mode", "json", "-p", "--no-extensions"];

  for (const extensionSource of options.extensionSources) {
    args.push("--extension", extensionSource);
  }

  if (options.noSkills) {
    args.push("--no-skills");
  }

  for (const skillSource of options.skillSources) {
    args.push("--skill", skillSource);
  }

  args.push(
    "--model",
    options.model,
    "--tools",
    options.tools,
    "--thinking",
    options.thinking || "off",
    "--session",
    options.sessionFile,
  );

  // New ASC parents place role/envelope/task instructions in the initial user
  // message (`objective`) so Pi's host + project context remains the shared
  // prefix. Keep the old flag additive for already-loaded v2 parents only.
  if (options.legacySystemPrompt) {
    args.push("--append-system-prompt", options.legacySystemPrompt);
  }

  args.push(options.objective);

  let isolatedAgentDir: IsolatedSubagentAgentDir | undefined;
  try {
    isolatedAgentDir = await createIsolatedSubagentAgentDir();
  } catch (error) {
    process.stderr.write(
      `Warning: Failed to isolate subagent child settings: ${error instanceof Error ? error.message : String(error)}\n`,
    );
  }

  // The detached raw supervisor remains dormant until exact custody and the durable spawn marker
  // are published. Parent/helper death before the gate therefore cannot leave an unowned raw Pi.
  const child = spawn(
    process.execPath,
    [resolveRawSupervisorPath(), "--cwd", options.cwd, "--", ...args],
    {
      stdio: ["pipe", "pipe", "pipe"],
      env: {
        ...process.env,
        ...(isolatedAgentDir ? { [SUBAGENT_CHILD_AGENT_DIR_ENV]: isolatedAgentDir.agentDir } : {}),
      },
      cwd: options.cwd || process.cwd(),
      detached: process.platform !== "win32",
    },
  );

  const cleanupIsolatedAgentDir = async () => {
    if (!isolatedAgentDir) {
      return;
    }

    const current = isolatedAgentDir;
    isolatedAgentDir = undefined;
    await current.cleanup().catch(() => undefined);
  };

  const cleanupIsolatedAgentDirSync = () => {
    if (!isolatedAgentDir) {
      return;
    }

    const current = isolatedAgentDir;
    isolatedAgentDir = undefined;
    current.cleanupSync();
  };

  let rawBuffer = "";
  let discardingOversizedLine = false;
  const liveness = createSubagentHelperLivenessController({
    child,
    startupTimeoutMs: options.startupTimeoutMs,
    executionTimeoutMs: options.executionTimeoutMs,
    cleanupSync: cleanupIsolatedAgentDirSync,
    parentPid: options.parentPid,
    parentPidStartedAt: options.parentPidStartedAt,
    backpressureTimeoutMs,
  });

  const capacityTransition = options.capacityCustody
    ? acquireSharedSubagentCapacityTransition(options.capacityCustody)
    : undefined;
  if (options.capacityCustody && !capacityTransition) {
    process.stderr.write("Unable to fence the exact ASC capacity start transition.\n");
    liveness.handleHelperFailure(1);
    liveness.start();
    return;
  }

  if (options.capacityCustody) {
    const rawChildPid = typeof child.pid === "number" && child.pid > 0 ? child.pid : undefined;
    const rawChildPidStartedAt = rawChildPid ? getProcessStartTicks(rawChildPid) : null;
    const helperPidStartedAt = getProcessStartTicks(process.pid);
    if (
      rawChildPid === undefined ||
      rawChildPidStartedAt === null ||
      helperPidStartedAt === null ||
      process.platform === "win32"
    ) {
      capacityTransition?.release();
      process.stderr.write("Unable to establish exact ASC raw-child custody.\n");
      liveness.handleHelperFailure(1);
      liveness.start();
      return;
    }
    try {
      writeSubagentCapacityCustody(options.capacityCustody, {
        helperPid: process.pid,
        helperPidStartedAt,
        rawChildPid,
        rawChildPidStartedAt,
        rawChildProcessGroupId: rawChildPid,
      });
      writeSubagentCapacitySpawnCommitted(options.capacityCustody);
    } catch (error) {
      capacityTransition?.release();
      process.stderr.write(
        `Unable to publish ASC raw-child custody: ${error instanceof Error ? error.message : String(error)}\n`,
      );
      liveness.handleHelperFailure(1);
      liveness.start();
      return;
    }
  }

  child.stdout?.setEncoding("utf-8");
  child.stderr?.setEncoding("utf-8");

  const emitProtocolError = (errorMessage: string) => {
    liveness.writeProtocolLine(`${JSON.stringify({ type: "protocol_error", errorMessage })}\n`);
  };

  const emitProtocolEvent = (event: SubagentProtocolEvent) => {
    const serialized = serializeProtocolEventWithinLimit(event, maxFilteredProtocolEventBytes);
    if (!serialized) {
      emitProtocolError(
        `Filtered subagent protocol event exceeded ${maxFilteredProtocolEventBytes} bytes after translation.`,
      );
      return;
    }

    liveness.writeProtocolLine(`${serialized}\n`);
  };

  let transportReadyEmitted = false;
  const emitTransportReady = () => {
    if (transportReadyEmitted) return;
    transportReadyEmitted = true;
    liveness.markTransportReady();
    const rawChildPid = typeof child.pid === "number" && child.pid > 0 ? child.pid : undefined;
    const rawChildPidStartedAt = rawChildPid ? getProcessStartTicks(rawChildPid) : null;
    const baseEvent: TransportReadyProtocolEvent = {
      type: "transport_ready",
      ...(rawChildPid ? { rawChildPid } : {}),
      settlementMode: settlementContract.mode,
      piVersion: settlementContract.version,
    };
    const custodyEvent: TransportReadyProtocolEvent = {
      ...baseEvent,
      ...(rawChildPidStartedAt !== null ? { rawChildPidStartedAt } : {}),
      ...(rawChildPid && process.platform !== "win32"
        ? { rawChildProcessGroupId: rawChildPid }
        : {}),
    };
    emitProtocolEvent(
      Buffer.byteLength(JSON.stringify(custodyEvent), "utf-8") <= maxFilteredProtocolEventBytes
        ? custodyEvent
        : baseEvent,
    );
  };

  const emitFilteredEventFromRawLine = (line: string) => {
    if (Buffer.byteLength(line, "utf-8") > maxRawPiEventBufferBytes) {
      emitProtocolError(`Raw pi JSON event line exceeded ${maxRawPiEventBufferBytes} bytes.`);
      return;
    }

    const event = translatePiJsonEventLineToSubagentProtocol(line, { maxFinalTextChars });
    if (!event) {
      if (isRecognizedPiJsonEventLine(line)) emitTransportReady();
      return;
    }
    if (event.type === "protocol_error" || event.type === "stdout_noise") {
      emitProtocolEvent(event);
      return;
    }

    emitTransportReady();
    emitProtocolEvent(event);
  };

  const processChunk = (chunk: string) => {
    let remaining = chunk;

    if (discardingOversizedLine) {
      const newlineIndex = remaining.indexOf("\n");
      if (newlineIndex === -1) {
        return;
      }
      remaining = remaining.slice(newlineIndex + 1);
      discardingOversizedLine = false;
    }

    rawBuffer += remaining;

    while (true) {
      const newlineIndex = rawBuffer.indexOf("\n");
      if (newlineIndex >= 0) {
        const line = rawBuffer.slice(0, newlineIndex);
        rawBuffer = rawBuffer.slice(newlineIndex + 1);
        emitFilteredEventFromRawLine(line);
        continue;
      }

      if (Buffer.byteLength(rawBuffer, "utf-8") > maxRawPiEventBufferBytes) {
        emitProtocolError(
          `Raw pi JSON event buffer exceeded ${maxRawPiEventBufferBytes} bytes without a newline delimiter.`,
        );
        rawBuffer = "";
        discardingOversizedLine = true;
      }
      break;
    }
  };

  child.stdout?.on("data", (chunk: string) => {
    processChunk(chunk);
  });

  child.stderr?.on("data", (chunk: string) => {
    liveness.writeDiagnosticChunk(chunk);
  });

  child.on("close", (code, signal) => {
    void cleanupIsolatedAgentDir();
    if (!discardingOversizedLine && rawBuffer.trim()) {
      emitFilteredEventFromRawLine(rawBuffer);
    }
    rawBuffer = "";
    liveness.handleChildClose(code, signal);
  });

  child.on("error", (error) => {
    void cleanupIsolatedAgentDir();
    liveness.writeDiagnosticChunk(
      `Error spawning pi: ${error instanceof Error ? error.message : String(error)}\n`,
    );
    liveness.handleChildError();
  });

  liveness.start();
  // This synchronous owner-issued intent still precedes raw Pi spawn. The supervisor starts Pi
  // only after receiving the gate, while new parents already have immutable custody on disk. The
  // shared transition lock makes lease takeover and custody publication/start mutually exclusive.
  try {
    writeSync(process.stdout.fd, `${JSON.stringify({ type: "raw_child_spawn_intent" })}\n`);
    if (!child.stdin) throw new Error("Raw supervisor start gate is unavailable.");
    child.stdin.once("error", () => liveness.handleHelperFailure(1));
    child.stdin.write("start\n");
  } catch (error) {
    process.stderr.write(
      `Unable to open ASC raw-child start gate: ${error instanceof Error ? error.message : String(error)}\n`,
    );
    liveness.handleHelperFailure(1);
  } finally {
    capacityTransition?.release();
  }
}

function detectPiSettlementContract(
  cwd: string,
): { version: string; mode: SubagentSettlementMode } | undefined {
  const probe = spawnSync("pi", ["--version"], {
    cwd,
    env: process.env,
    encoding: "utf8",
    timeout: 5_000,
    maxBuffer: 64 * 1024,
  });
  if (probe.error || probe.status !== 0) return undefined;

  const version = String(probe.stdout || probe.stderr || "").trim();
  const mode = classifyPiSettlementMode(version);
  return mode ? { version, mode } : undefined;
}

function parseArgs(argv: string[]): RunnerOptions {
  const values = new Map<string, string[]>();

  for (let index = 0; index < argv.length; index += 1) {
    const key = argv[index];
    if (!key?.startsWith("--")) {
      throw new Error(`Unexpected argument: ${key}`);
    }

    const value = argv[index + 1];
    if (typeof value !== "string") {
      throw new Error(`Missing value for ${key}`);
    }

    const existing = values.get(key) ?? [];
    existing.push(value);
    values.set(key, existing);
    index += 1;
  }

  const cwd = requireArg(values, "--cwd");
  const model = requireArg(values, "--model");
  const tools = requireArg(values, "--tools");
  const thinking = firstArg(values, "--thinking") || "off";
  const sessionFile = requireArg(values, "--session-file");
  const objective = requireArg(values, "--objective");
  const legacySystemPrompt = firstArg(values, "--system-prompt") || undefined;
  const parentPid = optionalNonNegativeIntegerArg(values, "--parent-pid");
  const parentPidStartedAt = optionalNonNegativeIntegerArg(values, "--parent-pid-started-at");
  if ((parentPid === undefined) !== (parentPidStartedAt === undefined) || parentPid === 0) {
    throw new Error(
      "Parent process identity must provide a positive PID and start ticks together.",
    );
  }
  const capacityCustody = parseCapacityCustodyBinding(values);

  return {
    cwd,
    model,
    tools,
    thinking,
    sessionFile,
    objective,
    startupTimeoutMs: nonNegativeIntegerArg(
      values,
      "--startup-timeout-ms",
      DEFAULT_HELPER_STARTUP_TIMEOUT_MS,
    ),
    executionTimeoutMs: nonNegativeIntegerArg(
      values,
      "--execution-timeout-ms",
      DEFAULT_HELPER_EXECUTION_TIMEOUT_MS,
    ),
    parentPid,
    parentPidStartedAt,
    capacityCustody,
    legacySystemPrompt,
    extensionSources: values.get("--extension") ?? [],
    noSkills: firstArg(values, "--no-skills") === "true",
    skillSources: values.get("--skill") ?? [],
  };
}

function firstArg(values: Map<string, string[]>, key: string): string | undefined {
  return values.get(key)?.[0];
}

function requireArg(values: Map<string, string[]>, key: string): string {
  const value = firstArg(values, key);
  if (typeof value !== "string") {
    throw new Error(`Missing required argument: ${key}`);
  }
  return value;
}

function nonNegativeIntegerArg(
  values: Map<string, string[]>,
  key: string,
  fallback: number,
): number {
  return optionalNonNegativeIntegerArg(values, key) ?? fallback;
}

function optionalNonNegativeIntegerArg(
  values: Map<string, string[]>,
  key: string,
): number | undefined {
  const raw = firstArg(values, key);
  if (raw === undefined) return undefined;
  const parsed = Number(raw);
  if (!Number.isSafeInteger(parsed) || parsed < 0) {
    throw new Error(`${key} must be a non-negative integer.`);
  }
  return parsed;
}

function parseCapacityCustodyBinding(
  values: Map<string, string[]>,
): SubagentCapacityCustodyBinding | undefined {
  const path = firstArg(values, "--capacity-custody-path");
  const keys = [
    "--capacity-path",
    "--capacity-slot",
    "--capacity-spawn-committed-path",
    "--capacity-token",
    "--capacity-dispatch-id",
    "--capacity-attempt-id",
    "--capacity-parent-pid",
    "--capacity-parent-pid-started-at",
  ];
  if (path === undefined && keys.every((key) => firstArg(values, key) === undefined)) {
    return undefined;
  }
  if (!path) throw new Error("Incomplete ASC capacity custody binding.");
  const capacityPath = requireArg(values, "--capacity-path");
  const spawnCommittedPath = requireArg(values, "--capacity-spawn-committed-path");
  const token = requireArg(values, "--capacity-token");
  const dispatchId = requireArg(values, "--capacity-dispatch-id");
  const attemptId = requireArg(values, "--capacity-attempt-id");
  const slot = optionalNonNegativeIntegerArg(values, "--capacity-slot");
  const parentPid = optionalNonNegativeIntegerArg(values, "--capacity-parent-pid");
  const parentPidStartedAt = optionalNonNegativeIntegerArg(
    values,
    "--capacity-parent-pid-started-at",
  );
  if (
    slot === undefined ||
    parentPid === undefined ||
    parentPid <= 0 ||
    parentPidStartedAt === undefined
  ) {
    throw new Error("Invalid ASC capacity custody process identity.");
  }
  return {
    path,
    capacityPath,
    spawnCommittedPath,
    slot,
    token,
    dispatchId,
    attemptId,
    parentPid,
    parentPidStartedAt,
  };
}

function serializeProtocolEventWithinLimit(
  event: SubagentProtocolEvent,
  maxBytes: number,
): string | undefined {
  const serialized = JSON.stringify(event);
  if (Buffer.byteLength(serialized, "utf-8") <= maxBytes) {
    return serialized;
  }

  if (event.type !== "assistant_message_end") {
    return undefined;
  }

  return serializeBoundedAssistantMessageEndEvent(event, maxBytes);
}

function serializeBoundedAssistantMessageEndEvent(
  event: AssistantMessageEndProtocolEvent,
  maxBytes: number,
): string | undefined {
  const baseCandidate: AssistantMessageEndProtocolEvent = {
    ...event,
    text: undefined,
    textTruncated: true,
  };
  const baseSerialized = JSON.stringify(baseCandidate);
  if (Buffer.byteLength(baseSerialized, "utf-8") > maxBytes) {
    return undefined;
  }

  if (typeof event.text !== "string" || event.text.length === 0) {
    return baseSerialized;
  }

  let bestSerialized = baseSerialized;
  let low = 0;
  let high = event.text.length;

  while (low <= high) {
    const mid = Math.floor((low + high) / 2);
    const candidate: AssistantMessageEndProtocolEvent = {
      ...event,
      text: mid > 0 ? event.text.slice(0, mid) : undefined,
      textTruncated: true,
    };
    const serialized = JSON.stringify(candidate);
    if (Buffer.byteLength(serialized, "utf-8") <= maxBytes) {
      bestSerialized = serialized;
      low = mid + 1;
    } else {
      high = mid - 1;
    }
  }

  return bestSerialized;
}

function readPositiveIntEnv(names: string[], fallback: number): number {
  const value = readNonNegativeIntEnv(names, fallback);
  return value > 0 ? value : fallback;
}

function readNonNegativeIntEnv(names: string[], fallback: number): number {
  for (const name of names) {
    const raw = process.env[name]?.trim();
    if (!raw) {
      continue;
    }

    const parsed = Number.parseInt(raw, 10);
    if (Number.isFinite(parsed) && parsed >= 0) {
      return parsed;
    }
  }

  return fallback;
}

main().catch((error) => {
  process.stderr.write(`${error instanceof Error ? error.message : String(error)}\n`);
  process.exitCode = 1;
});

import { spawn, spawnSync } from "node:child_process";
import { writeSync } from "node:fs";

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

interface RunnerOptions {
  cwd: string;
  model: string;
  tools: string;
  thinking: string;
  sessionFile: string;
  objective: string;
  startupTimeoutMs: number;
  executionTimeoutMs: number;
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

  // This synchronous owner-issued intent is ordered before raw Pi spawn. ASC may
  // attest confirmed_no_effects only when the helper exits without this marker.
  writeSync(process.stdout.fd, `${JSON.stringify({ type: "raw_child_spawn_intent" })}\n`);
  const child = spawn("pi", args, {
    stdio: ["ignore", "pipe", "pipe"],
    env: {
      ...process.env,
      ...(isolatedAgentDir ? { [SUBAGENT_CHILD_AGENT_DIR_ENV]: isolatedAgentDir.agentDir } : {}),
    },
    cwd: options.cwd || process.cwd(),
    detached: process.platform !== "win32",
  });

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
  });

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
    process.stderr.write(chunk);
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
    process.stderr.write(
      `Error spawning pi: ${error instanceof Error ? error.message : String(error)}\n`,
    );
    liveness.handleChildError();
  });

  liveness.start();
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
  const raw = firstArg(values, key);
  if (raw === undefined) return fallback;
  const parsed = Number(raw);
  if (!Number.isSafeInteger(parsed) || parsed < 0) {
    throw new Error(`${key} must be a non-negative integer.`);
  }
  return parsed;
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

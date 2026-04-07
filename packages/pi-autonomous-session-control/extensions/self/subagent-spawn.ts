import type { ChildProcessByStdio } from "node:child_process";
import { spawn } from "node:child_process";
import { join } from "node:path";
import type { Readable } from "node:stream";
import { fileURLToPath } from "node:url";
import { type SubagentState, writeSessionStatus } from "./subagent-session.ts";

export interface SubagentDef {
  name: string;
  objective: string;
  tools: string;
  systemPrompt?: string;
  sessionFile: string | null;
  timeout?: number; // milliseconds, 0 = no timeout
  executionSlotReserved?: boolean;
  parentSessionKey?: string;
  parentRepoRoot?: string;
  extensionSources?: string[];
}

export const ASSISTANT_STOP_REASONS = ["stop", "length", "toolUse", "error", "aborted"] as const;

export type AssistantStopReason = (typeof ASSISTANT_STOP_REASONS)[number];
export type SubagentStatus = "done" | "error" | "timeout" | "aborted";

export interface TransportExecutionState {
  kind: "transport";
  exitCode: number;
  aborted: boolean;
  timedOut: boolean;
  rawChildPid?: number;
}

export interface AssistantProtocolExecutionState {
  kind: "assistant_protocol";
  stopReason: AssistantStopReason;
  errorMessage?: string;
}

export interface AssistantProtocolParseErrorState {
  kind: "assistant_protocol_parse_error";
  errorMessage: string;
}

export type ProtocolExecutionState =
  | AssistantProtocolExecutionState
  | AssistantProtocolParseErrorState;

export interface ExecutionState {
  transport: TransportExecutionState;
  protocol?: ProtocolExecutionState;
}

export interface SubagentResult {
  output: string;
  exitCode: number;
  elapsed: number;
  status: SubagentStatus;
  stderr?: string;
  outputTruncated?: boolean;
  timedOut?: boolean;
  aborted?: boolean;
  assistantStopReason?: AssistantStopReason;
  assistantErrorMessage?: string;
  executionState?: ExecutionState;
}

export type SubagentSpawner = (
  def: SubagentDef,
  model: string,
  ctx: { cwd: string },
  state: SubagentState,
  signal?: AbortSignal,
) => Promise<SubagentResult>;

const DEFAULT_SUBAGENT_TIMEOUT_MS = 5 * 60 * 1000; // 5 minutes
const DEFAULT_SUBAGENT_OUTPUT_CHARS = 64_000;
const DEFAULT_SUBAGENT_EVENT_BUFFER_BYTES = 256 * 1024;
const DEFAULT_STATUS_RESULT_PREVIEW_CHARS = 280;
const SUBAGENT_CLOSE_GRACE_MS = 250;
const SUBAGENT_STOP_REQUESTED_CLOSE_GRACE_MS = 25;
const SUBAGENT_FORCE_KILL_GRACE_MS = 500;
const ASSISTANT_ERROR_EXIT_CODE = 1;
const ASSISTANT_ABORT_EXIT_CODE = 130;
const SUBAGENT_PROTOCOL_HELPER_PATH = fileURLToPath(
  new URL("./subagent-pi-json-filter.ts", import.meta.url),
);

function isAssistantStopReason(value: unknown): value is AssistantStopReason {
  return (
    typeof value === "string" && ASSISTANT_STOP_REASONS.some((candidate) => candidate === value)
  );
}

function toStatusResultPreview(value: string | undefined): string | undefined {
  if (typeof value !== "string") {
    return undefined;
  }

  const normalized = value.replace(/\s+/g, " ").trim();
  if (normalized.length === 0) {
    return undefined;
  }

  return normalized.length > DEFAULT_STATUS_RESULT_PREVIEW_CHARS
    ? `${normalized.slice(0, DEFAULT_STATUS_RESULT_PREVIEW_CHARS - 1)}…`
    : normalized;
}

function formatTimeoutDuration(timeoutMs: number): string {
  if (!Number.isFinite(timeoutMs) || timeoutMs <= 0) {
    return "0ms";
  }

  if (timeoutMs < 1000) {
    return `${Math.max(1, Math.round(timeoutMs))}ms`;
  }

  if (timeoutMs % 1000 === 0) {
    return `${timeoutMs / 1000}s`;
  }

  return `${(timeoutMs / 1000).toFixed(1).replace(/\.0$/, "")}s`;
}

function consumeSubagentEventLine(params: {
  line: string;
  appendTextDelta: (value: string) => void;
  setFinalAssistantText: (value: string) => void;
  markAssistantOutputTruncated: () => void;
  setFinalAssistantState: (state: {
    stopReason?: AssistantStopReason;
    errorMessage?: string;
  }) => void;
  markTransportReady: (rawChildPid?: number) => void;
}): { parseError?: string; protocolError?: string; stdoutNoiseLine?: string } {
  const trimmed = params.line.trim();
  if (!trimmed) {
    return {};
  }

  if (!trimmed.startsWith("{")) {
    return {
      parseError: `Non-JSON stdout while parsing the subagent protocol: ${trimmed.slice(0, 200)}`,
    };
  }

  try {
    const event = JSON.parse(trimmed);

    if (event.type === "transport_ready") {
      params.markTransportReady(
        typeof event.rawChildPid === "number" && event.rawChildPid > 0
          ? event.rawChildPid
          : undefined,
      );
      return {};
    }

    if (event.type === "assistant_text_delta") {
      params.markTransportReady();
      params.appendTextDelta(typeof event.delta === "string" ? event.delta : "");
      return {};
    }

    if (event.type === "assistant_message_end") {
      params.markTransportReady();
      const rawStopReason = event.stopReason;
      const stopReason =
        rawStopReason === undefined
          ? undefined
          : isAssistantStopReason(rawStopReason)
            ? rawStopReason
            : null;

      if (typeof event.text === "string" && event.text.length > 0) {
        params.setFinalAssistantText(event.text);
      }
      if (event.textTruncated === true) {
        params.markAssistantOutputTruncated();
      }

      if (stopReason === null) {
        return {
          parseError: `Unknown assistant stop reason from subagent protocol: ${String(rawStopReason)}`,
        };
      }

      params.setFinalAssistantState({
        stopReason,
        errorMessage: typeof event.errorMessage === "string" ? event.errorMessage : undefined,
      });
      return {};
    }

    if (event.type === "stdout_noise") {
      params.markTransportReady();
      return { stdoutNoiseLine: typeof event.line === "string" ? event.line : "" };
    }

    if (event.type === "protocol_error") {
      params.markTransportReady();
      return {
        protocolError:
          typeof event.errorMessage === "string"
            ? event.errorMessage
            : "Subagent protocol reported an unspecified error.",
      };
    }

    return {
      parseError: `Unexpected subagent protocol event type: ${typeof event.type === "string" ? event.type : "unknown"}`,
    };
  } catch (error) {
    return {
      parseError: error instanceof Error ? error.message : String(error),
    };
  }
}

function getAssistantProtocolFallbackOutput(params: {
  stopReason?: AssistantStopReason;
  errorMessage?: string;
  combinedStderr: string;
  transportExitCode: number;
}): string {
  switch (params.stopReason) {
    case "error":
      return (
        params.errorMessage ||
        params.combinedStderr ||
        "Assistant reported an error before producing a final response."
      );
    case "aborted":
      return params.errorMessage || "Assistant aborted execution.";
    case "length":
      return (
        params.errorMessage ||
        "Assistant stopped because it hit its response length limit before producing a final response."
      );
    case "toolUse":
      return (
        params.errorMessage || "Assistant stopped for tool use before producing a final response."
      );
    case "stop":
    case undefined:
      return params.combinedStderr || `pi exited with code ${params.transportExitCode}`;
    default: {
      const exhaustive: never = params.stopReason;
      return exhaustive;
    }
  }
}

function getSemanticStatus(params: {
  transportExitCode: number;
  aborted: boolean;
  timedOut: boolean;
  protocolFailed: boolean;
  assistantStopReason?: AssistantStopReason;
}): SubagentStatus {
  if (params.aborted || params.assistantStopReason === "aborted") {
    return "aborted";
  }
  if (params.timedOut) {
    return "timeout";
  }
  if (params.protocolFailed) {
    return "error";
  }
  switch (params.assistantStopReason) {
    case "error":
    case "length":
    case "toolUse":
      return "error";
    case "stop":
      // Once the assistant protocol emits a final stop message, treat that as the semantic truth
      // even if the transport exits non-zero afterward. Preserve the transport exit code separately
      // in executionState so diagnostics can still explain the drift.
      return "done";
    case undefined:
      return params.transportExitCode === 0 ? "done" : "error";
    default: {
      const exhaustive: never = params.assistantStopReason;
      return exhaustive;
    }
  }
}

function getSemanticExitCode(params: {
  transportExitCode: number;
  aborted: boolean;
  timedOut: boolean;
  protocolFailed: boolean;
  assistantStopReason?: AssistantStopReason;
}): number {
  if (params.aborted || params.assistantStopReason === "aborted") {
    return ASSISTANT_ABORT_EXIT_CODE;
  }
  if (params.timedOut) {
    return 124;
  }
  if (params.protocolFailed) {
    return ASSISTANT_ERROR_EXIT_CODE;
  }
  switch (params.assistantStopReason) {
    case "error":
      return ASSISTANT_ERROR_EXIT_CODE;
    case "stop":
      return 0;
    case "length":
    case "toolUse":
    case undefined:
      return params.transportExitCode;
    default: {
      const exhaustive: never = params.assistantStopReason;
      return exhaustive;
    }
  }
}

export function spawnSubagentWithSpawn(
  def: SubagentDef,
  model: string,
  ctx: { cwd: string },
  state: SubagentState,
  spawnImpl: typeof spawn = spawn,
  signal?: AbortSignal,
): Promise<SubagentResult> {
  const startTime = Date.now();
  const timeout = def.timeout ?? DEFAULT_SUBAGENT_TIMEOUT_MS;
  const maxOutputChars = readNonNegativeIntEnv(
    ["PI_SUBAGENT_OUTPUT_CHARS", "PI_ORCH_SUBAGENT_OUTPUT_CHARS"],
    DEFAULT_SUBAGENT_OUTPUT_CHARS,
  );
  const maxEventBufferBytes = readNonNegativeIntEnv(
    ["PI_SUBAGENT_EVENT_BUFFER_BYTES", "PI_ORCH_SUBAGENT_EVENT_BUFFER_BYTES"],
    DEFAULT_SUBAGENT_EVENT_BUFFER_BYTES,
  );

  const args = [
    SUBAGENT_PROTOCOL_HELPER_PATH,
    "--cwd",
    ctx.cwd || process.cwd(),
    "--model",
    model,
    "--tools",
    def.tools,
    "--session-file",
    def.sessionFile || join(state.sessionsDir, `${def.name}.json`),
    "--objective",
    def.objective,
  ];

  for (const extensionSource of def.extensionSources ?? []) {
    if (typeof extensionSource === "string" && extensionSource.trim().length > 0) {
      args.push("--extension", extensionSource);
    }
  }

  if (def.systemPrompt) {
    args.push("--system-prompt", def.systemPrompt);
  }

  return new Promise((resolve) => {
    const createdAt = new Date().toISOString();
    const managesExecutionSlot = def.executionSlotReserved !== true;
    let proc: ChildProcessByStdio<null, Readable, Readable> | null = null;
    let buffer = "";
    let discardingOversizedProtocolLine = false;
    let settled = false;
    let timeoutHandle: ReturnType<typeof setTimeout> | null = null;
    let closeGraceHandle: ReturnType<typeof setTimeout> | null = null;
    let forceKillHandle: ReturnType<typeof setTimeout> | null = null;
    let observedExitCode: number | null = null;
    let abortHandler: (() => void) | null = null;
    let aborted = false;
    let timedOut = false;
    let stopRequested = false;
    let transportReady = false;
    let rawChildPid: number | undefined;
    let streamedAssistantText = "";
    let finalAssistantText = "";
    let finalAssistantStopReason: AssistantStopReason | undefined;
    let finalAssistantErrorMessage: string | undefined;
    let assistantOutputTruncated = false;
    const stderrChunks: string[] = [];
    const parseErrors: string[] = [];
    const reportedProtocolErrors: string[] = [];
    const stdoutNoiseLines: string[] = [];
    let stdoutNoiseCount = 0;

    const clearTimers = () => {
      if (timeoutHandle) {
        clearTimeout(timeoutHandle);
        timeoutHandle = null;
      }
      if (closeGraceHandle) {
        clearTimeout(closeGraceHandle);
        closeGraceHandle = null;
      }
      if (forceKillHandle) {
        clearTimeout(forceKillHandle);
        forceKillHandle = null;
      }
    };

    const removeAbortListener = () => {
      if (signal && abortHandler) {
        signal.removeEventListener("abort", abortHandler);
        abortHandler = null;
      }
    };

    const handleSubagentEventParse = (parsed: {
      parseError?: string;
      protocolError?: string;
      stdoutNoiseLine?: string;
    }) => {
      if (parsed.parseError && parseErrors.length < 3) {
        parseErrors.push(parsed.parseError);
      }
      if (parsed.protocolError && reportedProtocolErrors.length < 3) {
        reportedProtocolErrors.push(parsed.protocolError);
      }
      if (parsed.stdoutNoiseLine) {
        stdoutNoiseCount += 1;
        if (stdoutNoiseLines.length < 3) {
          stdoutNoiseLines.push(parsed.stdoutNoiseLine.slice(0, 200));
        }
      }
    };

    const armExecutionTimeoutIfNeeded = () => {
      if (settled || timeoutHandle || timeout <= 0) {
        return;
      }

      timeoutHandle = setTimeout(() => {
        requestStop("timed-out");
      }, timeout);
      timeoutHandle.unref?.();
    };

    const markTransportReady = (candidateRawChildPid?: number) => {
      if (
        typeof candidateRawChildPid === "number" &&
        Number.isInteger(candidateRawChildPid) &&
        candidateRawChildPid > 0 &&
        rawChildPid === undefined
      ) {
        rawChildPid = candidateRawChildPid;
      }

      if (transportReady) {
        return;
      }

      transportReady = true;
      armExecutionTimeoutIfNeeded();
    };

    const appendAssistantText = (value: string) => {
      const bounded = appendBoundedString(streamedAssistantText, value, maxOutputChars);
      streamedAssistantText = bounded.value;
      assistantOutputTruncated = assistantOutputTruncated || bounded.truncated;
    };

    const setFinalAssistantText = (value: string) => {
      const bounded = appendBoundedString("", value, maxOutputChars);
      finalAssistantText = bounded.value;
      assistantOutputTruncated = assistantOutputTruncated || bounded.truncated;
    };

    const setFinalAssistantState = (executionState: {
      stopReason?: AssistantStopReason;
      errorMessage?: string;
    }) => {
      finalAssistantStopReason = executionState.stopReason;
      finalAssistantErrorMessage = executionState.errorMessage;
    };

    const markAssistantOutputTruncated = () => {
      assistantOutputTruncated = true;
    };

    const handleCompleteProtocolLine = (line: string) => {
      if (Buffer.byteLength(line, "utf-8") > maxEventBufferBytes) {
        handleSubagentEventParse({
          parseError: `Subagent protocol event line exceeded ${maxEventBufferBytes} bytes.`,
        });
        return;
      }

      handleSubagentEventParse(
        consumeSubagentEventLine({
          line,
          appendTextDelta: appendAssistantText,
          setFinalAssistantText,
          markAssistantOutputTruncated,
          setFinalAssistantState,
          markTransportReady,
        }),
      );
    };

    const consumeBufferedLine = () => {
      if (!buffer.trim() || discardingOversizedProtocolLine) {
        buffer = "";
        return;
      }
      handleCompleteProtocolLine(buffer);
      buffer = "";
    };

    const finalize = (result: SubagentResult) => {
      if (settled) return;
      settled = true;
      clearTimers();
      removeAbortListener();
      writeSessionStatus(state.sessionsDir, def.name, {
        status: result.status,
        pid: proc?.pid ?? process.pid,
        ppid: process.pid,
        createdAt,
        objective: def.objective,
        exitCode: result.exitCode,
        elapsed: result.elapsed,
        parentSessionKey: def.parentSessionKey,
        parentRepoRoot: def.parentRepoRoot,
        resultPreview: toStatusResultPreview(result.output),
      });
      if (managesExecutionSlot) {
        state.activeCount = Math.max(0, state.activeCount - 1);
        state.completedCount++;
      }
      resolve(result);
    };

    const requestStop = (reason: "aborted" | "timed-out") => {
      if (settled) return;
      if (reason === "aborted") {
        aborted = true;
      } else {
        timedOut = true;
      }
      if (stopRequested) return;
      stopRequested = true;

      try {
        proc?.kill("SIGTERM");
      } catch {
        // Best effort stop request.
      }

      forceKillHandle = setTimeout(() => {
        try {
          proc?.kill("SIGKILL");
        } catch {
          // Best effort force kill.
        }
      }, SUBAGENT_FORCE_KILL_GRACE_MS);
      forceKillHandle.unref?.();
    };

    const finalizeFromExitCode = (exitCode: number | null) => {
      consumeBufferedLine();
      const transportExitCode =
        exitCode ?? (aborted ? ASSISTANT_ABORT_EXIT_CODE : timedOut ? 124 : 1);
      const parseErrorSummary =
        parseErrors.length > 0
          ? `Failed to parse ${parseErrors.length} subagent protocol event line(s).`
          : "";
      const parseErrorDetails = parseErrors.join("\n");
      const reportedProtocolErrorDetails = reportedProtocolErrors.join("\n");
      const stdoutNoiseSummary =
        stdoutNoiseCount > 0
          ? `Observed ${stdoutNoiseCount} stdout noise line(s) from raw pi while translating to the subagent protocol.`
          : "";
      const stdoutNoiseDetails = stdoutNoiseLines
        .map((line) => `raw pi stdout noise: ${line}`)
        .join("\n");
      const truncationSummary = assistantOutputTruncated
        ? `Assistant output truncated to ${maxOutputChars} characters.`
        : "";
      const combinedStderr = [
        stderrChunks.join("").trim(),
        stdoutNoiseSummary,
        stdoutNoiseDetails,
        reportedProtocolErrorDetails,
        parseErrorSummary,
        parseErrorDetails,
        truncationSummary,
      ]
        .filter(Boolean)
        .join("\n");
      const fallbackOutput = aborted
        ? "Subagent aborted."
        : timedOut
          ? `Subagent timed out after ${formatTimeoutDuration(timeout)}`
          : getAssistantProtocolFallbackOutput({
              stopReason: finalAssistantStopReason,
              errorMessage: finalAssistantErrorMessage,
              combinedStderr,
              transportExitCode,
            });
      const protocolFailed = parseErrors.length > 0 || reportedProtocolErrors.length > 0;
      const protocolFailureOutput = [
        reportedProtocolErrorDetails,
        parseErrorSummary,
        parseErrorDetails,
      ]
        .filter(Boolean)
        .join("\n");
      const protocolAwareOutput = protocolFailed
        ? [streamedAssistantText || finalAssistantText, protocolFailureOutput]
            .filter(Boolean)
            .join("\n\n") || fallbackOutput
        : streamedAssistantText || finalAssistantText || fallbackOutput;
      const output = assistantOutputTruncated
        ? `${protocolAwareOutput}\n\n...[assistant output truncated]`
        : protocolAwareOutput;
      const status = getSemanticStatus({
        transportExitCode,
        aborted,
        timedOut,
        protocolFailed,
        assistantStopReason: finalAssistantStopReason,
      });
      const semanticExitCode = getSemanticExitCode({
        transportExitCode,
        aborted,
        timedOut,
        protocolFailed,
        assistantStopReason: finalAssistantStopReason,
      });
      const executionState: ExecutionState = {
        transport: {
          kind: "transport",
          exitCode: transportExitCode,
          aborted,
          timedOut,
          ...(typeof rawChildPid === "number" ? { rawChildPid } : {}),
        },
        protocol: protocolFailed
          ? {
              kind: "assistant_protocol_parse_error",
              errorMessage:
                protocolFailureOutput || "Failed to parse the subagent protocol event stream.",
            }
          : finalAssistantStopReason
            ? {
                kind: "assistant_protocol",
                stopReason: finalAssistantStopReason,
                errorMessage: finalAssistantErrorMessage,
              }
            : undefined,
      };

      finalize({
        output,
        exitCode: semanticExitCode,
        elapsed: Date.now() - startTime,
        status,
        stderr: combinedStderr || undefined,
        outputTruncated: assistantOutputTruncated,
        timedOut,
        aborted,
        assistantStopReason: finalAssistantStopReason,
        assistantErrorMessage: finalAssistantErrorMessage,
        executionState,
      });
    };

    if (signal?.aborted) {
      requestStop("aborted");
      finalizeFromExitCode(null);
      return;
    }

    try {
      proc = spawnImpl(process.execPath, args, {
        stdio: ["ignore", "pipe", "pipe"],
        env: { ...process.env },
        cwd: ctx.cwd || process.cwd(),
      });
      writeSessionStatus(state.sessionsDir, def.name, {
        status: "running",
        pid: proc.pid ?? process.pid,
        ppid: process.pid,
        createdAt,
        objective: def.objective,
        parentSessionKey: def.parentSessionKey,
        parentRepoRoot: def.parentRepoRoot,
      });
      if (managesExecutionSlot) {
        state.activeCount++;
      }
    } catch (error) {
      finalize({
        output: `Error spawning subagent: ${error instanceof Error ? error.message : String(error)}`,
        exitCode: 1,
        elapsed: Date.now() - startTime,
        status: "error",
        executionState: {
          transport: {
            kind: "transport",
            exitCode: 1,
            aborted: false,
            timedOut: false,
          },
        },
      });
      return;
    }

    if (signal) {
      abortHandler = () => {
        requestStop("aborted");
      };
      signal.addEventListener("abort", abortHandler, { once: true });
    }

    proc.stdout?.setEncoding("utf-8");
    proc.stdout?.on("data", (chunk: string) => {
      let remaining = chunk;

      if (discardingOversizedProtocolLine) {
        const newlineIndex = remaining.indexOf("\n");
        if (newlineIndex === -1) {
          return;
        }
        remaining = remaining.slice(newlineIndex + 1);
        discardingOversizedProtocolLine = false;
      }

      buffer += remaining;

      while (true) {
        const newlineIndex = buffer.indexOf("\n");
        if (newlineIndex >= 0) {
          const line = buffer.slice(0, newlineIndex);
          buffer = buffer.slice(newlineIndex + 1);
          handleCompleteProtocolLine(line);
          continue;
        }

        if (Buffer.byteLength(buffer, "utf-8") > maxEventBufferBytes) {
          handleSubagentEventParse({
            parseError: `Subagent protocol event buffer exceeded ${maxEventBufferBytes} bytes without a newline delimiter.`,
          });
          buffer = "";
          discardingOversizedProtocolLine = true;
        }
        break;
      }
    });

    proc.stderr?.setEncoding("utf-8");
    proc.stderr?.on("data", (chunk: string) => {
      stderrChunks.push(chunk);
      if (stderrChunks.length > 50) {
        stderrChunks.splice(0, stderrChunks.length - 50);
      }
    });

    proc.on("exit", (code) => {
      observedExitCode = code ?? observedExitCode ?? null;
      if (closeGraceHandle || settled) return;
      const closeGraceMs = stopRequested
        ? SUBAGENT_STOP_REQUESTED_CLOSE_GRACE_MS
        : SUBAGENT_CLOSE_GRACE_MS;
      closeGraceHandle = setTimeout(() => {
        finalizeFromExitCode(observedExitCode);
      }, closeGraceMs);
      closeGraceHandle.unref?.();
    });

    proc.on("close", (code) => {
      observedExitCode = code ?? observedExitCode ?? null;
      finalizeFromExitCode(observedExitCode);
    });

    proc.on("error", (err) => {
      finalize({
        output: `Error spawning subagent: ${err.message}`,
        exitCode: 1,
        elapsed: Date.now() - startTime,
        status: aborted ? "aborted" : timedOut ? "timeout" : "error",
        aborted,
        timedOut,
        executionState: {
          transport: {
            kind: "transport",
            exitCode: 1,
            aborted,
            timedOut,
          },
        },
      });
    });
  });
}

export function spawnSubagent(
  def: SubagentDef,
  model: string,
  ctx: { cwd: string },
  state: SubagentState,
  signal?: AbortSignal,
): Promise<SubagentResult> {
  return spawnSubagentWithSpawn(def, model, ctx, state, spawn, signal);
}

function appendBoundedString(
  current: string,
  addition: string,
  maxChars: number,
): { value: string; truncated: boolean } {
  if (maxChars <= 0) {
    return { value: "", truncated: current.length > 0 || addition.length > 0 };
  }

  if (current.length >= maxChars) {
    return { value: current, truncated: addition.length > 0 };
  }

  const remaining = maxChars - current.length;
  if (addition.length <= remaining) {
    return { value: current + addition, truncated: false };
  }

  return {
    value: current + addition.slice(0, remaining),
    truncated: true,
  };
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

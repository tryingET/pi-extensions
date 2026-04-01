import type { ChildProcessByStdio } from "node:child_process";
import { spawn } from "node:child_process";
import { join } from "node:path";
import type { Readable } from "node:stream";
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
}

export const ASSISTANT_STOP_REASONS = ["stop", "length", "toolUse", "error", "aborted"] as const;

export type AssistantStopReason = (typeof ASSISTANT_STOP_REASONS)[number];
export type SubagentStatus = "done" | "error" | "timeout" | "aborted";

export interface TransportExecutionState {
  kind: "transport";
  exitCode: number;
  aborted: boolean;
  timedOut: boolean;
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
const SUBAGENT_FORCE_KILL_GRACE_MS = 500;
const ASSISTANT_ERROR_EXIT_CODE = 1;
const ASSISTANT_ABORT_EXIT_CODE = 130;

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

function extractAssistantText(content: unknown): string {
  if (!Array.isArray(content)) {
    return "";
  }

  return content
    .filter(
      (item): item is { type: string; text?: string } =>
        typeof item === "object" && item !== null && "type" in item,
    )
    .filter((item) => item.type === "text")
    .map((item) => item.text || "")
    .join("");
}

function consumePiEventLine(params: {
  line: string;
  appendTextDelta: (value: string) => void;
  setFinalAssistantText: (value: string) => void;
  setFinalAssistantState: (state: {
    stopReason?: AssistantStopReason;
    errorMessage?: string;
  }) => void;
}): { parseError?: string; ignoredNonJsonLine?: string } {
  const trimmed = params.line.trim();
  if (!trimmed) {
    return {};
  }

  if (!trimmed.startsWith("{")) {
    return { ignoredNonJsonLine: trimmed };
  }

  try {
    const event = JSON.parse(trimmed);
    if (event.type === "message_update" && event.assistantMessageEvent?.type === "text_delta") {
      params.appendTextDelta(event.assistantMessageEvent.delta || "");
      return {};
    }

    if (event.type === "message_end" && event.message?.role === "assistant") {
      const rawStopReason = event.message.stopReason;
      const stopReason =
        rawStopReason === undefined
          ? undefined
          : isAssistantStopReason(rawStopReason)
            ? rawStopReason
            : null;

      const text = extractAssistantText(event.message.content);
      if (text) {
        params.setFinalAssistantText(text);
      }

      if (stopReason === null) {
        return {
          parseError: `Unknown assistant stop reason from pi JSON protocol: ${String(rawStopReason)}`,
        };
      }

      params.setFinalAssistantState({
        stopReason,
        errorMessage:
          typeof event.message.errorMessage === "string" ? event.message.errorMessage : undefined,
      });
    }

    return {};
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
    "--mode",
    "json",
    "-p",
    "--no-extensions",
    "--model",
    model,
    "--tools",
    def.tools,
    "--thinking",
    "off",
    "--session",
    def.sessionFile || join(state.sessionsDir, `${def.name}.json`),
  ];

  if (def.systemPrompt) {
    args.push("--append-system-prompt", def.systemPrompt);
  }

  args.push(def.objective);

  return new Promise((resolve) => {
    const createdAt = new Date().toISOString();
    const managesExecutionSlot = def.executionSlotReserved !== true;
    let proc: ChildProcessByStdio<null, Readable, Readable> | null = null;
    let buffer = "";
    let settled = false;
    let timeoutHandle: ReturnType<typeof setTimeout> | null = null;
    let closeGraceHandle: ReturnType<typeof setTimeout> | null = null;
    let forceKillHandle: ReturnType<typeof setTimeout> | null = null;
    let observedExitCode: number | null = null;
    let abortHandler: (() => void) | null = null;
    let aborted = false;
    let timedOut = false;
    let stopRequested = false;
    let streamedAssistantText = "";
    let finalAssistantText = "";
    let finalAssistantStopReason: AssistantStopReason | undefined;
    let finalAssistantErrorMessage: string | undefined;
    let assistantOutputTruncated = false;
    const stderrChunks: string[] = [];
    const parseErrors: string[] = [];
    const ignoredNonJsonStdoutLines: string[] = [];
    let ignoredNonJsonStdoutCount = 0;

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

    const handlePiEventParse = (parsed: { parseError?: string; ignoredNonJsonLine?: string }) => {
      if (parsed.parseError && parseErrors.length < 3) {
        parseErrors.push(parsed.parseError);
      }
      if (parsed.ignoredNonJsonLine) {
        ignoredNonJsonStdoutCount += 1;
        if (ignoredNonJsonStdoutLines.length < 3) {
          ignoredNonJsonStdoutLines.push(parsed.ignoredNonJsonLine.slice(0, 200));
        }
      }
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

    const consumeBufferedLine = () => {
      if (!buffer.trim()) return;
      handlePiEventParse(
        consumePiEventLine({
          line: buffer,
          appendTextDelta: appendAssistantText,
          setFinalAssistantText,
          setFinalAssistantState,
        }),
      );
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
          ? `Failed to parse ${parseErrors.length} pi JSON event line(s).`
          : "";
      const parseErrorDetails = parseErrors.join("\n");
      const ignoredStdoutSummary =
        ignoredNonJsonStdoutCount > 0
          ? `Ignored ${ignoredNonJsonStdoutCount} non-JSON stdout line(s) while parsing pi JSON mode.`
          : "";
      const ignoredStdoutDetails = ignoredNonJsonStdoutLines
        .map((line) => `stdout noise: ${line}`)
        .join("\n");
      const truncationSummary = assistantOutputTruncated
        ? `Assistant output truncated to ${maxOutputChars} characters.`
        : "";
      const combinedStderr = [
        stderrChunks.join("").trim(),
        ignoredStdoutSummary,
        ignoredStdoutDetails,
        parseErrorSummary,
        parseErrorDetails,
        truncationSummary,
      ]
        .filter(Boolean)
        .join("\n");
      const fallbackOutput = aborted
        ? "Subagent aborted."
        : timedOut
          ? `Subagent timed out after ${Math.round(timeout / 1000)}s`
          : getAssistantProtocolFallbackOutput({
              stopReason: finalAssistantStopReason,
              errorMessage: finalAssistantErrorMessage,
              combinedStderr,
              transportExitCode,
            });
      const protocolFailed = parseErrors.length > 0;
      const parseErrorOutput = [parseErrorSummary, parseErrorDetails].filter(Boolean).join("\n");
      const protocolAwareOutput = protocolFailed
        ? [streamedAssistantText || finalAssistantText, parseErrorOutput]
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
        },
        protocol: protocolFailed
          ? {
              kind: "assistant_protocol_parse_error",
              errorMessage:
                [parseErrorSummary, parseErrorDetails].filter(Boolean).join("\n") ||
                "Failed to parse pi JSON event stream.",
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
      proc = spawnImpl("pi", args, {
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

    if (timeout > 0) {
      timeoutHandle = setTimeout(() => {
        requestStop("timed-out");
      }, timeout);
      timeoutHandle.unref?.();
    }

    if (signal) {
      abortHandler = () => {
        requestStop("aborted");
      };
      signal.addEventListener("abort", abortHandler, { once: true });
    }

    proc.stdout?.setEncoding("utf-8");
    proc.stdout?.on("data", (chunk: string) => {
      buffer += chunk;
      if (Buffer.byteLength(buffer, "utf-8") > maxEventBufferBytes) {
        handlePiEventParse({
          parseError: `Pi JSON event buffer exceeded ${maxEventBufferBytes} bytes without a newline delimiter.`,
        });
        buffer = "";
        return;
      }

      const lines = buffer.split("\n");
      buffer = lines.pop() || "";
      for (const line of lines) {
        handlePiEventParse(
          consumePiEventLine({
            line,
            appendTextDelta: appendAssistantText,
            setFinalAssistantText,
            setFinalAssistantState,
          }),
        );
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
      closeGraceHandle = setTimeout(() => {
        finalizeFromExitCode(observedExitCode);
      }, SUBAGENT_CLOSE_GRACE_MS);
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

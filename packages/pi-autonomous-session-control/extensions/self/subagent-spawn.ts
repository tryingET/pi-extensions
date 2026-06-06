import type { ChildProcessByStdio } from "node:child_process";
import { spawn } from "node:child_process";
import type { Readable } from "node:stream";
import type { SubagentState } from "./subagent-session.ts";
import { createSubagentProtocolArgs } from "./subagent-spawn-args.ts";
import { assertSafeSubagentRequestEnv } from "./subagent-spawn-env.ts";
import {
  consumeSubagentEventLine,
  createExecutionState,
  formatTimeoutDuration,
  getAssistantProtocolFallbackOutput,
  getSemanticExitCode,
  getSemanticStatus,
} from "./subagent-spawn-events.ts";
import {
  writeCompletedSubagentStatus,
  writeRunningSubagentStatus,
} from "./subagent-spawn-status.ts";
import type { AssistantStopReason, SubagentDef, SubagentResult } from "./subagent-spawn-types.ts";
import { appendBoundedString, readNonNegativeIntEnv } from "./subagent-spawn-utils.ts";

export * from "./subagent-spawn-env.ts";
export * from "./subagent-spawn-types.ts";

const DEFAULT_SUBAGENT_TIMEOUT_MS = 5 * 60 * 1000; // 5 minutes
const DEFAULT_SUBAGENT_OUTPUT_CHARS = 64_000;
const DEFAULT_SUBAGENT_EVENT_BUFFER_BYTES = 256 * 1024;
const SUBAGENT_CLOSE_GRACE_MS = 250;
const SUBAGENT_STOP_REQUESTED_CLOSE_GRACE_MS = 25;
const SUBAGENT_FORCE_KILL_GRACE_MS = 500;
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

  const args = createSubagentProtocolArgs({
    def,
    model,
    cwd: ctx.cwd,
    state,
  });

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
      writeCompletedSubagentStatus({
        state,
        def,
        result,
        createdAt,
        pid: proc?.pid ?? process.pid,
        model,
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
      const transportExitCode = exitCode ?? (aborted ? 130 : timedOut ? 124 : 1);
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
      const executionState = createExecutionState({
        transportExitCode,
        aborted,
        timedOut,
        rawChildPid,
        protocolFailed,
        protocolFailureOutput,
        finalAssistantStopReason,
        finalAssistantErrorMessage,
      });

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
      const requestEnv = assertSafeSubagentRequestEnv(def.env);
      proc = spawnImpl(process.execPath, args, {
        stdio: ["ignore", "pipe", "pipe"],
        env: { ...process.env, ...(requestEnv ?? {}) },
        cwd: ctx.cwd || process.cwd(),
      });
      const childPid = proc.pid ?? process.pid;
      writeRunningSubagentStatus({
        state,
        def,
        createdAt,
        childPid,
        model,
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

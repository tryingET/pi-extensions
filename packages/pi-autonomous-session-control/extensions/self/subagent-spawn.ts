import type { ChildProcessByStdio } from "node:child_process";
import { spawn } from "node:child_process";
import type { Readable } from "node:stream";
import { getMatchingSubagentCancelRequest } from "./subagent-control.ts";
import type { SubagentSettlementMode } from "./subagent-protocol.ts";
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
import {
  appendBoundedString,
  readNonNegativeIntEnv,
  redactSubagentDiagnosticText,
} from "./subagent-spawn-utils.ts";

export * from "./subagent-spawn-env.ts";
export * from "./subagent-spawn-types.ts";

const DEFAULT_SUBAGENT_TIMEOUT_MS = 5 * 60 * 1000; // 5 minutes
const DEFAULT_SUBAGENT_STARTUP_TIMEOUT_MS = 30 * 1000;
const DEFAULT_SUBAGENT_PROGRESS_HEARTBEAT_MS = 2 * 1000;
const DEFAULT_SUBAGENT_OUTPUT_CHARS = 64_000;
const DEFAULT_SUBAGENT_STDERR_CHARS = 16_000;
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
  onProgress?: (event: import("./subagent-spawn-types.ts").SubagentProgressEvent) => void,
): Promise<SubagentResult> {
  const startTime = Date.now();
  const timeout = def.timeout ?? DEFAULT_SUBAGENT_TIMEOUT_MS;
  const startupTimeout = def.startupTimeout ?? DEFAULT_SUBAGENT_STARTUP_TIMEOUT_MS;
  const maxOutputChars = readNonNegativeIntEnv(
    ["PI_SUBAGENT_OUTPUT_CHARS", "PI_ORCH_SUBAGENT_OUTPUT_CHARS"],
    DEFAULT_SUBAGENT_OUTPUT_CHARS,
  );
  const maxStderrChars = readNonNegativeIntEnv(
    ["PI_SUBAGENT_STDERR_CHARS", "PI_ORCH_SUBAGENT_STDERR_CHARS"],
    DEFAULT_SUBAGENT_STDERR_CHARS,
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
    let startupTimeoutHandle: ReturnType<typeof setTimeout> | null = null;
    let progressHeartbeatHandle: ReturnType<typeof setInterval> | null = null;
    let closeGraceHandle: ReturnType<typeof setTimeout> | null = null;
    let forceKillHandle: ReturnType<typeof setTimeout> | null = null;
    let observedExitCode: number | null = null;
    let observedExitSignal: NodeJS.Signals | null = null;
    let abortHandler: (() => void) | null = null;
    let aborted = false;
    let timedOut = false;
    let timeoutPhase: "startup" | "execution" | undefined;
    let stopRequested = false;
    let transportReady = false;
    let rawChildPid: number | undefined;
    let settlementMode: SubagentSettlementMode | undefined;
    let piVersion: string | undefined;
    let lifecycleEventOrdinal = 0;
    let lastTerminalAssistantEventOrdinal = 0;
    let finalAgentRunEndEventOrdinal = 0;
    let agentSettledEventOrdinal = 0;
    let streamedAssistantText = "";
    let finalAssistantText = "";
    let finalAssistantStopReason: AssistantStopReason | undefined;
    let finalAssistantErrorMessage: string | undefined;
    let terminalAssistantEventCount = 0;
    let agentRunEndEventCount = 0;
    let finalAgentRunWillRetry: boolean | undefined;
    let agentSettledEventCount = 0;
    let assistantOutputTruncated = false;
    let latestTool: string | undefined;
    let lastActivityAt = startTime;
    let lastProgressEmitAt = 0;
    const usage = {
      turns: 0,
      input: 0,
      output: 0,
      cacheRead: 0,
      cacheWrite: 0,
      cost: 0,
      contextTokens: 0,
    };
    let stderrText = "";
    let stderrTruncated = false;
    const parseErrors: string[] = [];
    const reportedProtocolErrors: string[] = [];
    const stdoutNoiseLines: string[] = [];
    let stdoutNoiseCount = 0;

    const clearTimers = () => {
      if (timeoutHandle) {
        clearTimeout(timeoutHandle);
        timeoutHandle = null;
      }
      if (startupTimeoutHandle) {
        clearTimeout(startupTimeoutHandle);
        startupTimeoutHandle = null;
      }
      if (progressHeartbeatHandle) {
        clearInterval(progressHeartbeatHandle);
        progressHeartbeatHandle = null;
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

    const emitProgress = (phase: "spawning" | "running" | "finalizing", force = false) => {
      if (!onProgress) return;
      const now = Date.now();
      if (!force && now - lastProgressEmitAt < 250) return;
      lastProgressEmitAt = now;
      onProgress({
        phase,
        elapsedMs: now - startTime,
        lastActivityAt,
        outputChars: streamedAssistantText.length || finalAssistantText.length,
        latestTool,
        usage: { ...usage },
      });
    };

    const markActivity = () => {
      lastActivityAt = Date.now();
      emitProgress(transportReady ? "running" : "spawning");
    };

    const armStartupTimeout = () => {
      if (settled || startupTimeoutHandle || startupTimeout <= 0) return;
      startupTimeoutHandle = setTimeout(() => {
        timeoutPhase = "startup";
        requestStop("timed-out");
      }, startupTimeout);
      startupTimeoutHandle.unref?.();
    };

    const armExecutionTimeoutIfNeeded = () => {
      if (settled || timeoutHandle || timeout <= 0) {
        return;
      }

      timeoutHandle = setTimeout(() => {
        timeoutPhase = "execution";
        requestStop("timed-out");
      }, timeout);
      timeoutHandle.unref?.();
    };

    const markTransportReady = (
      candidateRawChildPid: number | undefined,
      candidateSettlementMode: SubagentSettlementMode,
      candidatePiVersion: string,
    ) => {
      if (
        typeof candidateRawChildPid === "number" &&
        Number.isInteger(candidateRawChildPid) &&
        candidateRawChildPid > 0 &&
        rawChildPid === undefined
      ) {
        rawChildPid = candidateRawChildPid;
      }
      settlementMode = candidateSettlementMode;
      piVersion = candidatePiVersion;
      transportReady = true;
      if (startupTimeoutHandle) {
        clearTimeout(startupTimeoutHandle);
        startupTimeoutHandle = null;
      }
      markActivity();
      emitProgress("running", true);
      armExecutionTimeoutIfNeeded();
    };

    const appendAssistantText = (value: string) => {
      markActivity();
      const bounded = appendBoundedString(streamedAssistantText, value, maxOutputChars);
      streamedAssistantText = bounded.value;
      assistantOutputTruncated = assistantOutputTruncated || bounded.truncated;
    };

    const setFinalAssistantText = (value: string) => {
      markActivity();
      const bounded = appendBoundedString("", value, maxOutputChars);
      finalAssistantText = bounded.value;
      assistantOutputTruncated = assistantOutputTruncated || bounded.truncated;
    };

    const setFinalAssistantState = (executionState: {
      stopReason?: AssistantStopReason;
      errorMessage?: string;
    }) => {
      lifecycleEventOrdinal += 1;
      finalAssistantStopReason = executionState.stopReason;
      finalAssistantErrorMessage = executionState.errorMessage;
      if (executionState.stopReason && executionState.stopReason !== "toolUse") {
        terminalAssistantEventCount += 1;
        lastTerminalAssistantEventOrdinal = lifecycleEventOrdinal;
      }
      usage.turns += 1;
      markActivity();
    };

    const addUsage = (eventUsage: {
      input: number;
      output: number;
      cacheRead: number;
      cacheWrite: number;
      cost: number;
      contextTokens: number;
    }) => {
      usage.input += eventUsage.input;
      usage.output += eventUsage.output;
      usage.cacheRead += eventUsage.cacheRead;
      usage.cacheWrite += eventUsage.cacheWrite;
      usage.cost += eventUsage.cost;
      usage.contextTokens = eventUsage.contextTokens;
      markActivity();
    };

    const setLatestTool = (toolName: string) => {
      latestTool = toolName;
      markActivity();
    };

    const markAgentRunEnd = (willRetry: boolean | undefined) => {
      lifecycleEventOrdinal += 1;
      agentRunEndEventCount += 1;
      finalAgentRunWillRetry = willRetry;
      finalAgentRunEndEventOrdinal = lifecycleEventOrdinal;
      markActivity();
    };

    const markAgentSettled = () => {
      lifecycleEventOrdinal += 1;
      agentSettledEventCount += 1;
      agentSettledEventOrdinal = lifecycleEventOrdinal;
      markActivity();
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
          addUsage,
          setLatestTool,
          markAgentRunEnd,
          markAgentSettled,
          isTransportReady: () => transportReady,
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
      emitProgress("finalizing", true);
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

    const finalizeFromExitCode = (
      exitCode: number | null,
      exitSignal: NodeJS.Signals | null = observedExitSignal,
    ) => {
      consumeBufferedLine();
      const cancelRequest = getMatchingSubagentCancelRequest({
        sessionsDir: state.sessionsDir,
        sessionName: def.name,
        dispatchId: def.dispatchId,
        attemptId: def.attemptId,
      });
      if (cancelRequest) aborted = true;
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
      const protocolFailed = parseErrors.length > 0 || reportedProtocolErrors.length > 0;
      // Pi >=0.80 declares authoritative agent_settled finality in the transport handshake.
      // The observed settlement must follow the final terminal assistant outcome. Pi 0.76's
      // explicitly declared compatibility mode instead requires a clean foreground JSON exit and
      // final agent_end.willRetry=false after that outcome. An undeclared stream can prove modern
      // finality by emitting agent_settled, but can never claim the legacy fallback.
      const modernHostSettled =
        settlementMode === "agent_settled" &&
        agentSettledEventCount === 1 &&
        terminalAssistantEventCount >= 1 &&
        agentSettledEventOrdinal > lastTerminalAssistantEventOrdinal;
      const legacyHostSettled =
        settlementMode === "legacy_agent_end_exit" &&
        agentSettledEventCount === 0 &&
        exitCode === 0 &&
        terminalAssistantEventCount >= 1 &&
        agentRunEndEventCount >= 1 &&
        finalAgentRunWillRetry === false &&
        finalAgentRunEndEventOrdinal > lastTerminalAssistantEventOrdinal;
      const terminalSequenceValid = modernHostSettled || legacyHostSettled;
      const protocolIncomplete = !aborted && !timedOut && !protocolFailed && !terminalSequenceValid;
      const transportSignalDetail = exitSignal ? `, transportSignal=${exitSignal}` : "";
      const incompleteSummary = protocolIncomplete
        ? `Expected finality for settlementMode=${settlementMode ?? "undeclared"}: Pi >=0.80 requires exactly one agent_settled after the final terminal assistant outcome; explicit Pi 0.76 compatibility requires clean exit plus final agent_end.willRetry=false after that outcome. Observed piVersion=${piVersion ?? "undeclared"}, settlements=${agentSettledEventCount}, settlementOrdinal=${agentSettledEventOrdinal}, outcomes=${terminalAssistantEventCount}, finalOutcomeOrdinal=${lastTerminalAssistantEventOrdinal}, agentEnds=${agentRunEndEventCount}, finalAgentEndOrdinal=${finalAgentRunEndEventOrdinal}, finalWillRetry=${String(finalAgentRunWillRetry)}, transportExit=${String(transportExitCode)}${transportSignalDetail}.`
        : "";
      const truncationSummary = assistantOutputTruncated
        ? `Assistant output truncated to ${maxOutputChars} characters.`
        : "";
      const stderrTruncationSummary = stderrTruncated
        ? `Subagent transport stderr truncated to ${maxStderrChars} characters.`
        : "";
      const childStderrText = redactSubagentDiagnosticText(stderrText.trim());
      const childStderrDetails = childStderrText
        ? `Subagent transport stderr:\n${childStderrText}`
        : "";
      const combinedStderr = redactSubagentDiagnosticText(
        [
          childStderrDetails,
          stderrTruncationSummary,
          stdoutNoiseSummary,
          stdoutNoiseDetails,
          reportedProtocolErrorDetails,
          parseErrorSummary,
          parseErrorDetails,
          incompleteSummary,
          truncationSummary,
        ]
          .filter(Boolean)
          .join("\n"),
      );
      const fallbackOutput = aborted
        ? "Subagent aborted."
        : timedOut
          ? `Subagent timed out during ${timeoutPhase ?? "execution"} after ${formatTimeoutDuration(
              timeoutPhase === "startup" ? startupTimeout : timeout,
            )}`
          : getAssistantProtocolFallbackOutput({
              stopReason: finalAssistantStopReason,
              errorMessage: finalAssistantErrorMessage,
              combinedStderr,
              transportExitCode,
            });
      const protocolFailureOutput = [
        reportedProtocolErrorDetails,
        parseErrorSummary,
        parseErrorDetails,
        incompleteSummary,
      ]
        .filter(Boolean)
        .join("\n");
      const protocolAwareOutput =
        protocolFailed || protocolIncomplete
          ? [streamedAssistantText || finalAssistantText, combinedStderr]
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
        protocolIncomplete,
        assistantStopReason: finalAssistantStopReason,
      });
      const semanticExitCode = getSemanticExitCode({
        transportExitCode,
        aborted,
        timedOut,
        protocolFailed,
        protocolIncomplete,
        assistantStopReason: finalAssistantStopReason,
      });
      const executionState = createExecutionState({
        transportExitCode,
        transportSignal: exitSignal ?? undefined,
        aborted,
        timedOut,
        rawChildPid,
        protocolFailed,
        protocolIncomplete,
        transportExitedBeforeSettlement:
          protocolIncomplete && transportExitCode !== 0 && terminalAssistantEventCount === 0,
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
        timeoutPhase,
        aborted,
        usage: { ...usage },
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
      const hasSignalSafeChildPid =
        typeof proc.pid === "number" && Number.isInteger(proc.pid) && proc.pid > 0;
      writeRunningSubagentStatus({
        state,
        def,
        createdAt,
        childPid: hasSignalSafeChildPid ? (proc.pid as number) : process.pid,
        model,
        cancelSupported: hasSignalSafeChildPid,
      });
      if (managesExecutionSlot) {
        state.activeCount++;
      }
      emitProgress("spawning", true);
      armStartupTimeout();
      progressHeartbeatHandle = setInterval(() => {
        emitProgress(transportReady ? "running" : "spawning", true);
      }, DEFAULT_SUBAGENT_PROGRESS_HEARTBEAT_MS);
      progressHeartbeatHandle.unref?.();
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
      const bounded = appendBoundedString(stderrText, chunk, maxStderrChars);
      stderrText = bounded.value;
      stderrTruncated = stderrTruncated || bounded.truncated;
    });

    proc.on("exit", (code, exitSignal) => {
      observedExitCode = code ?? observedExitCode ?? null;
      observedExitSignal = exitSignal ?? observedExitSignal;
      if (closeGraceHandle || settled) return;
      const closeGraceMs = stopRequested
        ? SUBAGENT_STOP_REQUESTED_CLOSE_GRACE_MS
        : SUBAGENT_CLOSE_GRACE_MS;
      closeGraceHandle = setTimeout(() => {
        finalizeFromExitCode(observedExitCode, observedExitSignal);
      }, closeGraceMs);
      closeGraceHandle.unref?.();
    });

    proc.on("close", (code, exitSignal) => {
      observedExitCode = code ?? observedExitCode ?? null;
      observedExitSignal = exitSignal ?? observedExitSignal;
      finalizeFromExitCode(observedExitCode, observedExitSignal);
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
  onProgress?: (event: import("./subagent-spawn-types.ts").SubagentProgressEvent) => void,
): Promise<SubagentResult> {
  return spawnSubagentWithSpawn(def, model, ctx, state, spawn, signal, onProgress);
}

import { join } from "node:path";
import {
  getMatchingSubagentCancelRequest,
  removeMatchingSubagentCancelRequest,
} from "./subagent-control.ts";
import {
  getProcessStartTicks,
  listSubagentSessionStatuses,
  type SubagentState,
  writeSessionStatus,
} from "./subagent-session.ts";
import { toStatusResultPreview } from "./subagent-spawn-events.ts";
import type { SubagentDef, SubagentResult } from "./subagent-spawn-types.ts";

export function getSubagentSessionFile(def: SubagentDef, state: SubagentState): string {
  return def.sessionFile || join(state.sessionsDir, `${def.name}.jsonl`);
}

function exitedBeforeSettlement(result: SubagentResult): boolean {
  return (
    result.executionState?.protocol?.kind === "assistant_protocol_incomplete" &&
    result.executionState.protocol.transportExitedBeforeSettlement === true
  );
}

export function writeRunningSubagentStatus(params: {
  state: SubagentState;
  def: SubagentDef;
  createdAt: string;
  childPid: number;
  model: string;
  cancelSupported?: boolean;
  rawChildPid?: number;
  rawChildPidStartedAt?: number;
  rawChildProcessGroupId?: number;
}): void {
  const pidStartedAt = getProcessStartTicks(params.childPid);
  writeSessionStatus(params.state.sessionsDir, params.def.name, {
    status: "running",
    pid: params.childPid,
    ppid: process.pid,
    createdAt: params.createdAt,
    pidStartedAt: pidStartedAt ?? undefined,
    pidIdentity: pidStartedAt === null ? "unsupported" : "proc-start-ticks",
    rawChildPid: params.rawChildPid,
    rawChildPidStartedAt:
      params.rawChildPidStartedAt ??
      (typeof params.rawChildPid === "number"
        ? (getProcessStartTicks(params.rawChildPid) ?? undefined)
        : undefined),
    rawChildProcessGroupId: params.rawChildProcessGroupId,
    objective: params.def.objective,
    dispatchId: params.def.dispatchId,
    attemptId: params.def.attemptId,
    resumed: params.def.resumed,
    configuredThinking: params.def.thinking,
    startupTimeoutMs: params.def.startupTimeout,
    executionTimeoutMs: params.def.timeout,
    cancelSupported: params.cancelSupported ?? true,
    parentSessionKey: params.def.parentSessionKey,
    parentRepoRoot: params.def.parentRepoRoot,
    sessionKind: "subagent",
    sessionFile: getSubagentSessionFile(params.def, params.state),
    profile: params.def.profile,
    model: params.model,
    tools: params.def.tools,
  });
}

export function writeCompletedSubagentStatus(params: {
  state: SubagentState;
  def: SubagentDef;
  result: SubagentResult;
  createdAt: string;
  pid: number;
  model: string;
}): void {
  const prior = listSubagentSessionStatuses(params.state.sessionsDir).find(
    (status) => status.sessionName === params.def.name,
  );
  const completedPidStartedAt =
    getProcessStartTicks(params.pid) ??
    (prior?.pid === params.pid ? prior.pidStartedAt : undefined);
  const cancelRequest = getMatchingSubagentCancelRequest({
    sessionsDir: params.state.sessionsDir,
    sessionName: params.def.name,
    dispatchId: params.def.dispatchId,
    attemptId: params.def.attemptId,
  });
  writeSessionStatus(params.state.sessionsDir, params.def.name, {
    status: params.result.status,
    pid: params.pid,
    ppid: process.pid,
    createdAt: params.createdAt,
    pidStartedAt: completedPidStartedAt,
    pidIdentity: completedPidStartedAt === undefined ? prior?.pidIdentity : "proc-start-ticks",
    rawChildPid: prior?.rawChildPid ?? params.result.executionState?.transport.rawChildPid,
    rawChildPidStartedAt:
      prior?.rawChildPidStartedAt ??
      (typeof params.result.executionState?.transport.rawChildPid === "number"
        ? (getProcessStartTicks(params.result.executionState.transport.rawChildPid) ?? undefined)
        : undefined),
    rawChildProcessGroupId: prior?.rawChildProcessGroupId,
    objective: params.def.objective,
    dispatchId: params.def.dispatchId,
    attemptId: params.def.attemptId,
    resumed: params.def.resumed,
    configuredThinking: params.def.thinking,
    startupTimeoutMs: params.def.startupTimeout,
    executionTimeoutMs: params.def.timeout,
    timeoutPhase: params.result.timeoutPhase,
    cancelRequestedAt: cancelRequest?.requestedAt ?? prior?.cancelRequestedAt,
    cancelRequestedBy: cancelRequest?.requestedBy ?? prior?.cancelRequestedBy,
    cancelReason: cancelRequest?.reason ?? prior?.cancelReason,
    cancelSupported: prior?.cancelSupported,
    exitCode: params.result.exitCode,
    exitSignal: params.result.executionState?.transport.signal,
    failureKind: exitedBeforeSettlement(params.result)
      ? params.result.executionState?.transport.rawChildSpawnIntent === false
        ? "subagent_helper_bootstrap_failed"
        : "transport_exited_before_settlement"
      : undefined,
    elapsed: params.result.elapsed,
    parentSessionKey: params.def.parentSessionKey,
    parentRepoRoot: params.def.parentRepoRoot,
    resultPreview: toStatusResultPreview(params.result.output),
    stderrPreview: toStatusResultPreview(params.result.stderr),
    sessionKind: "subagent",
    sessionFile: getSubagentSessionFile(params.def, params.state),
    profile: params.def.profile,
    model: params.model,
    tools: params.def.tools,
  });
  removeMatchingSubagentCancelRequest({
    sessionsDir: params.state.sessionsDir,
    sessionName: params.def.name,
    attemptId: params.def.attemptId,
    token: cancelRequest?.token,
  });
}

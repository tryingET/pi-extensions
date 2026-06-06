import { join } from "node:path";
import {
  getProcessStartTicks,
  type SubagentState,
  writeSessionStatus,
} from "./subagent-session.ts";
import { toStatusResultPreview } from "./subagent-spawn-events.ts";
import type { SubagentDef, SubagentResult } from "./subagent-spawn-types.ts";

export function getSubagentSessionFile(def: SubagentDef, state: SubagentState): string {
  return def.sessionFile || join(state.sessionsDir, `${def.name}.jsonl`);
}

export function writeRunningSubagentStatus(params: {
  state: SubagentState;
  def: SubagentDef;
  createdAt: string;
  childPid: number;
  model: string;
}): void {
  const pidStartedAt = getProcessStartTicks(params.childPid);
  writeSessionStatus(params.state.sessionsDir, params.def.name, {
    status: "running",
    pid: params.childPid,
    ppid: process.pid,
    createdAt: params.createdAt,
    pidStartedAt: pidStartedAt ?? undefined,
    pidIdentity: pidStartedAt === null ? "unsupported" : "proc-start-ticks",
    objective: params.def.objective,
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
  writeSessionStatus(params.state.sessionsDir, params.def.name, {
    status: params.result.status,
    pid: params.pid,
    ppid: process.pid,
    createdAt: params.createdAt,
    pidStartedAt: getProcessStartTicks(params.pid) ?? undefined,
    objective: params.def.objective,
    exitCode: params.result.exitCode,
    elapsed: params.result.elapsed,
    parentSessionKey: params.def.parentSessionKey,
    parentRepoRoot: params.def.parentRepoRoot,
    resultPreview: toStatusResultPreview(params.result.output),
    sessionKind: "subagent",
    sessionFile: getSubagentSessionFile(params.def, params.state),
    profile: params.def.profile,
    model: params.model,
    tools: params.def.tools,
  });
}

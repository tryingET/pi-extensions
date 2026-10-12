import type { ExtensionContext } from "@earendil-works/pi-coding-agent";
import { stripTerminalSequences } from "@earendil-works/pi-tui";
import { getContextRepoRoot, getContextSessionKey } from "./session-context.ts";
import {
  readSubagentCockpit,
  requestSubagentSteering,
  type SubagentCockpitSnapshot,
} from "./subagent-cockpit-data.ts";
import { cancelSubagentDispatch } from "./subagent-control.ts";
import {
  createSubagentDashboardSnapshot,
  type SubagentDashboardRow,
} from "./subagent-dashboard-data.ts";
import { readLifecycleOwnedSessionStatus, type SubagentState } from "./subagent-session.ts";

export const COCKPIT_FILTERS = [
  "all",
  "running",
  "done",
  "error",
  "timeout",
  "aborted",
  "abandoned",
] as const;
export type CockpitFilter = (typeof COCKPIT_FILTERS)[number];
export interface CockpitTarget {
  sessionName: string;
  dispatchId?: string;
  attemptId?: string;
}
export interface CockpitActionResult {
  ok: boolean;
  status: string;
  requestId?: string;
  error?: string;
}
export interface CockpitSource {
  rows(): SubagentDashboardRow[];
  read(name: string): SubagentCockpitSnapshot;
  send(target: CockpitTarget, message: string): CockpitActionResult;
  cancel(target: CockpitTarget): CockpitActionResult;
}

// Local artifact text is data, never terminal instructions or Markdown commands.
export function cockpitText(value: string, limit = 4000): string {
  return stripTerminalSequences(value.slice(0, limit)).replace(
    // biome-ignore lint/suspicious/noControlCharactersInRegex: explicitly exclude terminal control bytes.
    /[\u0000-\u0008\u000b-\u001f\u007f-\u009f\u202a-\u202e\u2066-\u2069]/g,
    "",
  );
}

export function attemptKey(target: CockpitTarget): string {
  return JSON.stringify([target.sessionName, target.dispatchId ?? "", target.attemptId ?? ""]);
}

export function createCockpitSource(state: SubagentState, ctx: ExtensionContext): CockpitSource {
  const initialScope = {
    currentSessionKey: getContextSessionKey(ctx),
    currentRepoRoot: getContextRepoRoot(ctx),
  };
  const sameScope = () =>
    !!initialScope.currentSessionKey &&
    !!initialScope.currentRepoRoot &&
    getContextSessionKey(ctx) === initialScope.currentSessionKey &&
    getContextRepoRoot(ctx) === initialScope.currentRepoRoot;
  const reject = (): CockpitActionResult => ({
    ok: false,
    status: "stale",
    error: "Attempt or parent ownership changed; no action taken.",
  });
  const currentAttempt = (target: CockpitTarget) => {
    if (!sameScope() || !target.dispatchId || !target.attemptId) return false;
    const current = readLifecycleOwnedSessionStatus(state.sessionsDir, target.sessionName);
    return (
      current?.status === "running" &&
      current.dispatchId === target.dispatchId &&
      current.attemptId === target.attemptId &&
      current.parentSessionKey === initialScope.currentSessionKey &&
      current.parentRepoRoot === initialScope.currentRepoRoot
    );
  };
  return {
    rows: () =>
      sameScope()
        ? createSubagentDashboardSnapshot(state.sessionsDir, {
            ...initialScope,
            sessionScope: "current",
            limit: Number.MAX_SAFE_INTEGER,
          }).rows
        : [],
    read: (name) => readSubagentCockpit(state.sessionsDir, name, initialScope),
    send: (target, message) => {
      const { dispatchId, attemptId } = target;
      const { currentSessionKey, currentRepoRoot } = initialScope;
      if (
        !dispatchId ||
        !attemptId ||
        !currentSessionKey ||
        !currentRepoRoot ||
        !currentAttempt(target)
      )
        return reject();
      return requestSubagentSteering({
        state,
        dispatchId,
        attemptId,
        parentSessionKey: currentSessionKey,
        parentRepoRoot: currentRepoRoot,
        requestedBy: "subagent-cockpit-ui",
        message,
      });
    },
    cancel: (target) => {
      // No await/retry between this exact-attempt check and the existing signal-safe API.
      if (!target.dispatchId || !currentAttempt(target)) return reject();
      return cancelSubagentDispatch({
        state,
        dispatchId: target.dispatchId,
        parentRepoRoot: initialScope.currentRepoRoot,
        expectedAttemptId: target.attemptId,
        expectedParentSessionKey: initialScope.currentSessionKey,
        expectedSessionName: target.sessionName,
        requestedBy: "subagent-cockpit-ui",
        reason: "Operator confirmed cancellation in cockpit",
      });
    },
  };
}

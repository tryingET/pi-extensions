// summary: hardens ASC session-root and capacity identity on caller-visible subagent state.
// read_when:
//   - changing public runtime state injection, session-root custody, or capacity policy.

import type { SubagentState } from "./subagent-session.ts";

export function hardenSubagentStateIdentity(
  state: SubagentState,
  expected?: { sessionsDir?: string; maxConcurrent?: number },
): SubagentState {
  const sessionsDir = state.sessionsDir;
  const maxConcurrent = state.maxConcurrent;
  if (typeof sessionsDir !== "string" || !sessionsDir) {
    throw new Error("SubagentState sessionsDir must be a non-empty string.");
  }
  if (!Number.isSafeInteger(maxConcurrent) || maxConcurrent <= 0) {
    throw new Error("SubagentState maxConcurrent must be a positive safe integer.");
  }
  if (expected?.sessionsDir !== undefined && sessionsDir !== expected.sessionsDir) {
    throw new Error(
      `SubagentState sessionsDir (${sessionsDir}) must match the owner sessionsDir (${expected.sessionsDir}).`,
    );
  }
  if (expected?.maxConcurrent !== undefined && maxConcurrent !== expected.maxConcurrent) {
    throw new Error(
      `SubagentState maxConcurrent (${maxConcurrent}) must match the owner maxConcurrent (${expected.maxConcurrent}).`,
    );
  }
  Object.defineProperties(state, {
    sessionsDir: {
      value: sessionsDir,
      writable: false,
      configurable: false,
      enumerable: true,
    },
    maxConcurrent: {
      value: maxConcurrent,
      writable: false,
      configurable: false,
      enumerable: true,
    },
  });
  return state;
}

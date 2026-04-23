import { ASC_REWIND_LEDGER_VERSION, type BindingTuple } from "./types.ts";

export const ASC_REWIND_TURN_CUSTOM_TYPE = "asc-rewind-turn";
export const ASC_REWIND_OP_CUSTOM_TYPE = "asc-rewind-op";
export const ASC_REWIND_FORK_PENDING_CUSTOM_TYPE = "asc-rewind-fork-pending";

export interface AscRewindTurnData {
  v: typeof ASC_REWIND_LEDGER_VERSION;
  snapshots: string[];
  bindings: BindingTuple[];
}

export interface AscRewindOpData {
  v: typeof ASC_REWIND_LEDGER_VERSION;
  snapshots: string[];
  bindings?: BindingTuple[];
  current?: number;
  undo?: number;
}

export interface AscRewindForkPendingData {
  v: typeof ASC_REWIND_LEDGER_VERSION;
  current: string;
  undo?: string;
}

function isBindingTuple(value: unknown): value is BindingTuple {
  return (
    Array.isArray(value) &&
    value.length === 2 &&
    typeof value[0] === "string" &&
    Number.isInteger(value[1])
  );
}

export function isAscRewindTurnData(value: unknown): value is AscRewindTurnData {
  if (!value || typeof value !== "object") {
    return false;
  }

  const data = value as Partial<AscRewindTurnData>;
  return (
    data.v === ASC_REWIND_LEDGER_VERSION &&
    Array.isArray(data.snapshots) &&
    Array.isArray(data.bindings) &&
    data.bindings.every(isBindingTuple)
  );
}

export function isAscRewindOpData(value: unknown): value is AscRewindOpData {
  if (!value || typeof value !== "object") {
    return false;
  }

  const data = value as Partial<AscRewindOpData>;
  return (
    data.v === ASC_REWIND_LEDGER_VERSION &&
    Array.isArray(data.snapshots) &&
    (data.bindings === undefined ||
      (Array.isArray(data.bindings) && data.bindings.every(isBindingTuple)))
  );
}

export function isAscRewindForkPendingData(value: unknown): value is AscRewindForkPendingData {
  if (!value || typeof value !== "object") {
    return false;
  }

  const data = value as Partial<AscRewindForkPendingData>;
  return (
    data.v === ASC_REWIND_LEDGER_VERSION &&
    typeof data.current === "string" &&
    data.current.length > 0 &&
    (data.undo === undefined || typeof data.undo === "string")
  );
}

export function applyRewindBindings(
  entryToCommit: Map<string, string>,
  snapshots: string[],
  bindings: BindingTuple[] = [],
): void {
  for (const [entryId, snapshotIndex] of bindings) {
    const commitSha = snapshots[snapshotIndex];
    if (!commitSha) {
      continue;
    }

    entryToCommit.set(entryId, commitSha);
  }
}

export function getCommitFromRewindOp(
  data: AscRewindOpData,
  key: "current" | "undo",
): string | undefined {
  const snapshotIndex = data[key];
  if (typeof snapshotIndex !== "number" || !Number.isInteger(snapshotIndex) || snapshotIndex < 0) {
    return undefined;
  }

  const commitSha = data.snapshots[snapshotIndex];
  return typeof commitSha === "string" && commitSha.length > 0 ? commitSha : undefined;
}

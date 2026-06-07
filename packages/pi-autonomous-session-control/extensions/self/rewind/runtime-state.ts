import type { ExtensionAPI, ExtensionContext, SessionEntry } from "@earendil-works/pi-coding-agent";
import type { AscRewindForkPendingData, AscRewindOpData } from "./session-ledger.ts";
import {
  ASC_REWIND_FORK_PENDING_CUSTOM_TYPE,
  ASC_REWIND_OP_CUSTOM_TYPE,
  ASC_REWIND_TURN_CUSTOM_TYPE,
  applyRewindBindings,
  getCommitFromRewindOp,
  isAscRewindOpData,
  isAscRewindTurnData,
} from "./session-ledger.ts";
import type { BindingTuple, GitRunner, SnapshotRef } from "./types.ts";

export const REWIND_STATUS_KEY = "asc-rewind";
export const REWIND_LEDGER_VERSION = 1;
export const TREE_KEEP_CURRENT_FILES = "Keep current files";
export const TREE_REWIND_TO_POINT = "Rewind files to that point";
export const TREE_UNDO_LAST_REWIND = "Undo last file rewind";
export const TREE_CANCEL_NAVIGATION = "Cancel navigation";

export type SessionLikeMessageEntry = Extract<SessionEntry, { type: "message" }> & {
  message: {
    role?: string;
  };
};

export interface PendingPromptCollector {
  snapshots: string[];
  bindings: BindingTuple[];
}

export interface PendingResultingState {
  currentCommitSha: string;
  undoCommitSha?: string;
}

export interface RewindRuntimeState {
  entryToCommit: Map<string, string>;
  git: GitRunner | null;
  isGitRepo: boolean;
  lastExact: SnapshotRef | null;
  currentCommitSha?: string;
  undoCommitSha?: string;
  promptCollector: PendingPromptCollector | null;
  pendingTreeState: PendingResultingState | null;
}

export interface ParsedCustomEntryLike {
  type?: string;
  customType?: string;
  data?: unknown;
}

export function createRewindRuntimeState(): RewindRuntimeState {
  return {
    entryToCommit: new Map(),
    git: null,
    isGitRepo: false,
    lastExact: null,
    currentCommitSha: undefined,
    undoCommitSha: undefined,
    promptCollector: null,
    pendingTreeState: null,
  };
}

function isMessageEntry(entry: SessionEntry | undefined): entry is SessionLikeMessageEntry {
  return entry?.type === "message";
}

export function isRoleEntry(
  entry: SessionEntry | undefined,
  role: "user" | "assistant",
): entry is SessionLikeMessageEntry {
  return isMessageEntry(entry) && entry.message?.role === role;
}

export function notify(
  ctx: ExtensionContext,
  message: string,
  level: "info" | "warning" | "error" = "info",
): void {
  if (!ctx.hasUI) {
    return;
  }

  ctx.ui.notify(message, level);
}

export function updateStatus(ctx: ExtensionContext, state: RewindRuntimeState): void {
  if (!ctx.hasUI) {
    return;
  }

  if (!state.isGitRepo) {
    ctx.ui.setStatus(REWIND_STATUS_KEY, undefined);
    return;
  }

  const uniqueSnapshots = new Set(state.entryToCommit.values()).size;
  const theme = ctx.ui.theme;
  ctx.ui.setStatus(
    REWIND_STATUS_KEY,
    theme.fg("dim", "◆ ") +
      theme.fg("muted", `${state.entryToCommit.size} rewind points / ${uniqueSnapshots} snapshots`),
  );
}

export function applyCurrentExactState(
  state: RewindRuntimeState,
  commitSha: string,
  treeSha: string,
): void {
  state.currentCommitSha = commitSha;
  state.lastExact = {
    commitSha,
    treeSha,
  };
}

export function appendRewindOp(
  pi: ExtensionAPI,
  state: RewindRuntimeState,
  data: AscRewindOpData,
): void {
  const hasBindings = Boolean(data.bindings?.length);
  const hasCurrent = typeof data.current === "number";
  const hasUndo = typeof data.undo === "number";
  if (!hasBindings && !hasCurrent && !hasUndo) {
    return;
  }

  pi.appendEntry(ASC_REWIND_OP_CUSTOM_TYPE, data);
  applyRewindBindings(state.entryToCommit, data.snapshots, data.bindings ?? []);

  const currentCommitSha = getCommitFromRewindOp(data, "current");
  if (currentCommitSha) {
    state.currentCommitSha = currentCommitSha;
  }

  const undoCommitSha = getCommitFromRewindOp(data, "undo");
  if (undoCommitSha) {
    state.undoCommitSha = undoCommitSha;
  }
}

export function appendForkPendingState(pi: ExtensionAPI, nextState: PendingResultingState): void {
  const data: AscRewindForkPendingData = {
    v: REWIND_LEDGER_VERSION,
    current: nextState.currentCommitSha,
  };

  if (nextState.undoCommitSha) {
    data.undo = nextState.undoCommitSha;
  }

  pi.appendEntry(ASC_REWIND_FORK_PENDING_CUSTOM_TYPE, data);
}

export function finalizePromptCollector(
  ctx: ExtensionContext,
  pi: ExtensionAPI,
  state: RewindRuntimeState,
): void {
  const collector = state.promptCollector;
  state.promptCollector = null;
  if (!collector || collector.bindings.length === 0) {
    updateStatus(ctx, state);
    return;
  }

  pi.appendEntry(ASC_REWIND_TURN_CUSTOM_TYPE, {
    v: REWIND_LEDGER_VERSION,
    snapshots: collector.snapshots,
    bindings: collector.bindings,
  });
  applyRewindBindings(state.entryToCommit, collector.snapshots, collector.bindings);

  const latestBinding = collector.bindings.at(-1);
  if (latestBinding) {
    const latestCommitSha = collector.snapshots[latestBinding[1]];
    if (latestCommitSha) {
      state.currentCommitSha = latestCommitSha;
    }
  }

  updateStatus(ctx, state);
}

export function reconstructStateFromSession(
  ctx: ExtensionContext,
  state: RewindRuntimeState,
): void {
  state.entryToCommit.clear();
  state.currentCommitSha = undefined;
  state.undoCommitSha = undefined;

  let latestVisibleBindingCommitSha: string | undefined;

  for (const entry of ctx.sessionManager.getEntries()) {
    if (entry.type === "custom" && entry.customType === ASC_REWIND_TURN_CUSTOM_TYPE) {
      if (!isAscRewindTurnData(entry.data)) {
        continue;
      }

      applyRewindBindings(state.entryToCommit, entry.data.snapshots, entry.data.bindings);
      const latestBinding = entry.data.bindings.at(-1);
      if (latestBinding) {
        latestVisibleBindingCommitSha = entry.data.snapshots[latestBinding[1]];
      }
      continue;
    }

    if (entry.type === "custom" && entry.customType === ASC_REWIND_OP_CUSTOM_TYPE) {
      if (!isAscRewindOpData(entry.data)) {
        continue;
      }

      applyRewindBindings(state.entryToCommit, entry.data.snapshots, entry.data.bindings ?? []);
      const currentCommitSha = getCommitFromRewindOp(entry.data, "current");
      if (currentCommitSha) {
        state.currentCommitSha = currentCommitSha;
      }
      const undoCommitSha = getCommitFromRewindOp(entry.data, "undo");
      if (undoCommitSha) {
        state.undoCommitSha = undoCommitSha;
      }
    }
  }

  if (!state.currentCommitSha) {
    state.currentCommitSha = latestVisibleBindingCommitSha;
  }
}

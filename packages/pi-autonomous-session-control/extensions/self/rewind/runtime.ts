import { readFile } from "node:fs/promises";
import type {
  AgentEndEvent,
  ExtensionAPI,
  ExtensionContext,
  SessionBeforeForkEvent,
  SessionBeforeTreeEvent,
  SessionCompactEvent,
  SessionEntry,
  SessionStartEvent,
  SessionTreeEvent,
  TurnEndEvent,
  TurnStartEvent,
} from "@mariozechner/pi-coding-agent";
import { restoreCommitExactly } from "./exact-restore.ts";
import { createExecFileGitRunner } from "./git-runner.ts";
import {
  captureWorktreeTree,
  commitExists,
  ensureSnapshotForCurrentWorktree,
  getCommitTreeSha,
} from "./git-snapshot.ts";
import {
  buildRewindCheckpointRef,
  projectRecoveryMilestoneIfConfigured,
} from "./replay-fabric-projection.ts";
import type { AscRewindForkPendingData, AscRewindOpData } from "./session-ledger.ts";
import {
  ASC_REWIND_FORK_PENDING_CUSTOM_TYPE,
  ASC_REWIND_OP_CUSTOM_TYPE,
  ASC_REWIND_TURN_CUSTOM_TYPE,
  applyRewindBindings,
  getCommitFromRewindOp,
  isAscRewindForkPendingData,
  isAscRewindOpData,
  isAscRewindTurnData,
} from "./session-ledger.ts";
import type { BindingTuple, GitRunner, SnapshotRef } from "./types.ts";

const REWIND_STATUS_KEY = "asc-rewind";
const REWIND_LEDGER_VERSION = 1;
const TREE_KEEP_CURRENT_FILES = "Keep current files";
const TREE_REWIND_TO_POINT = "Rewind files to that point";
const TREE_UNDO_LAST_REWIND = "Undo last file rewind";
const TREE_CANCEL_NAVIGATION = "Cancel navigation";

type SessionLikeMessageEntry = Extract<SessionEntry, { type: "message" }> & {
  message: {
    role?: string;
  };
};

interface PendingPromptCollector {
  snapshots: string[];
  bindings: BindingTuple[];
}

interface PendingResultingState {
  currentCommitSha: string;
  undoCommitSha?: string;
}

interface RewindRuntimeState {
  entryToCommit: Map<string, string>;
  git: GitRunner | null;
  isGitRepo: boolean;
  lastExact: SnapshotRef | null;
  currentCommitSha?: string;
  undoCommitSha?: string;
  promptCollector: PendingPromptCollector | null;
  pendingTreeState: PendingResultingState | null;
}

interface ParsedCustomEntryLike {
  type?: string;
  customType?: string;
  data?: unknown;
}

function createRewindRuntimeState(): RewindRuntimeState {
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

function isRoleEntry(
  entry: SessionEntry | undefined,
  role: "user" | "assistant",
): entry is SessionLikeMessageEntry {
  return isMessageEntry(entry) && entry.message?.role === role;
}

function notify(
  ctx: ExtensionContext,
  message: string,
  level: "info" | "warning" | "error" = "info",
): void {
  if (!ctx.hasUI) {
    return;
  }

  ctx.ui.notify(message, level);
}

function updateStatus(ctx: ExtensionContext, state: RewindRuntimeState): void {
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

function applyCurrentExactState(
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

function appendRewindOp(pi: ExtensionAPI, state: RewindRuntimeState, data: AscRewindOpData): void {
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

function appendForkPendingState(pi: ExtensionAPI, nextState: PendingResultingState): void {
  const data: AscRewindForkPendingData = {
    v: REWIND_LEDGER_VERSION,
    current: nextState.currentCommitSha,
  };

  if (nextState.undoCommitSha) {
    data.undo = nextState.undoCommitSha;
  }

  pi.appendEntry(ASC_REWIND_FORK_PENDING_CUSTOM_TYPE, data);
}

function reconstructStateFromSession(ctx: ExtensionContext, state: RewindRuntimeState): void {
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

async function readPendingForkState(
  sessionFile: string,
): Promise<AscRewindForkPendingData | undefined> {
  try {
    const content = await readFile(sessionFile, "utf8");
    let latestPending: AscRewindForkPendingData | undefined;

    for (const line of content.split("\n")) {
      if (!line.trim()) {
        continue;
      }

      let parsed: ParsedCustomEntryLike | null = null;
      try {
        const candidate = JSON.parse(line);
        if (candidate && typeof candidate === "object") {
          parsed = candidate as ParsedCustomEntryLike;
        }
      } catch {
        continue;
      }

      if (
        parsed?.type === "custom" &&
        parsed.customType === ASC_REWIND_FORK_PENDING_CUSTOM_TYPE &&
        isAscRewindForkPendingData(parsed.data)
      ) {
        latestPending = parsed.data;
      }
    }

    return latestPending;
  } catch {
    return undefined;
  }
}

async function initializeSession(ctx: ExtensionContext, state: RewindRuntimeState): Promise<void> {
  if (typeof ctx.cwd !== "string" || !ctx.sessionManager) {
    state.git = null;
    state.isGitRepo = false;
    state.lastExact = null;
    state.promptCollector = null;
    state.pendingTreeState = null;
    updateStatus(ctx, state);
    return;
  }

  state.git = createExecFileGitRunner(ctx.cwd);
  state.isGitRepo = false;
  state.lastExact = null;
  state.promptCollector = null;
  state.pendingTreeState = null;

  try {
    const git = state.git;
    if (!git) {
      updateStatus(ctx, state);
      return;
    }

    const result = await git(["rev-parse", "--is-inside-work-tree"]);
    state.isGitRepo = result.code === 0 && result.stdout.trim() === "true";
    if (!state.isGitRepo) {
      updateStatus(ctx, state);
      return;
    }

    reconstructStateFromSession(ctx, state);

    if (state.currentCommitSha && (await commitExists(git, state.currentCommitSha))) {
      const worktreeSnapshot = await captureWorktreeTree(git);
      const currentTreeSha = await getCommitTreeSha(git, state.currentCommitSha);
      if (worktreeSnapshot.treeSha === currentTreeSha) {
        applyCurrentExactState(state, state.currentCommitSha, currentTreeSha);
      }
    }
  } catch {
    state.isGitRepo = false;
    state.lastExact = null;
  }

  updateStatus(ctx, state);
}

async function ensureCurrentCommitSha(state: RewindRuntimeState): Promise<string> {
  if (!state.git) {
    throw new Error("rewind runtime is not initialized");
  }

  if (state.lastExact) {
    state.currentCommitSha = state.lastExact.commitSha;
    return state.lastExact.commitSha;
  }

  const snapshot = await ensureSnapshotForCurrentWorktree(state.git, {
    lastExact: state.lastExact,
  });
  state.lastExact = snapshot.snapshot;
  state.currentCommitSha = snapshot.snapshot.commitSha;
  return snapshot.snapshot.commitSha;
}

async function projectRecoveryMilestoneBestEffort(
  ctx: ExtensionContext,
  state: RewindRuntimeState,
  options: {
    eventKind: "restore.started" | "restore.completed" | "restore.failed" | "restore.undo";
    mode: string;
    targetEntryId?: string;
    targetCommitSha?: string;
    undoCommitSha?: string;
    status?: "success" | "failure";
    failureReason?: string;
  },
): Promise<void> {
  if (!state.git) {
    return;
  }

  try {
    await projectRecoveryMilestoneIfConfigured({
      git: state.git,
      eventKind: options.eventKind,
      sessionId: ctx.sessionManager.getSessionId(),
      checkpointRef: buildRewindCheckpointRef({
        sessionId: ctx.sessionManager.getSessionId(),
        targetEntryId: options.targetEntryId,
        targetCommitSha: options.targetCommitSha,
        mode: options.mode,
      }),
      restoreMode: options.mode,
      status: options.status,
      targetEntryId: options.targetEntryId,
      targetCommitSha: options.targetCommitSha,
      undoCommitSha: options.undoCommitSha,
      failureReason: options.failureReason,
    });
  } catch (error) {
    notify(
      ctx,
      `ASC rewind: failed to project recovery milestone (${error instanceof Error ? error.message : String(error)})`,
      "warning",
    );
  }
}

async function resolveTargetCommitSha(
  state: RewindRuntimeState,
  entryId: string,
): Promise<string | undefined> {
  if (!state.git) {
    return undefined;
  }

  const commitSha = state.entryToCommit.get(entryId);
  if (!commitSha) {
    return undefined;
  }

  return (await commitExists(state.git, commitSha)) ? commitSha : undefined;
}

async function initializeForkPendingState(
  pi: ExtensionAPI,
  ctx: ExtensionContext,
  state: RewindRuntimeState,
  previousSessionFile: string,
): Promise<void> {
  if (!state.isGitRepo || !state.git) {
    return;
  }

  const pendingFork = await readPendingForkState(previousSessionFile);
  if (!pendingFork) {
    return;
  }

  if (!(await commitExists(state.git, pendingFork.current))) {
    return;
  }

  const snapshots = [pendingFork.current];
  const data: AscRewindOpData = {
    v: REWIND_LEDGER_VERSION,
    snapshots,
    current: 0,
  };

  if (pendingFork.undo && (await commitExists(state.git, pendingFork.undo))) {
    data.snapshots.push(pendingFork.undo);
    data.undo = 1;
  }

  appendRewindOp(pi, state, data);
  reconstructStateFromSession(ctx, state);
  updateStatus(ctx, state);
}

async function handleTurnStart(
  event: TurnStartEvent,
  ctx: ExtensionContext,
  state: RewindRuntimeState,
): Promise<void> {
  if (!state.isGitRepo || !state.git) {
    return;
  }

  if (event.turnIndex !== 0) {
    return;
  }

  const userEntry = ctx.sessionManager.getLeafEntry();
  if (!isRoleEntry(userEntry, "user")) {
    state.promptCollector = null;
    return;
  }

  try {
    const snapshot = await ensureSnapshotForCurrentWorktree(state.git, {
      lastExact: state.lastExact,
    });
    state.lastExact = snapshot.snapshot;
    state.currentCommitSha = snapshot.snapshot.commitSha;
    state.promptCollector = {
      snapshots: [snapshot.snapshot.commitSha],
      bindings: [[userEntry.id, 0]],
    };
  } catch (error) {
    state.promptCollector = null;
    notify(
      ctx,
      `ASC rewind: failed to capture start snapshot (${error instanceof Error ? error.message : String(error)})`,
      "warning",
    );
  }
}

async function handleTurnEnd(
  event: TurnEndEvent,
  ctx: ExtensionContext,
  state: RewindRuntimeState,
): Promise<void> {
  if (!state.isGitRepo || !state.git || !state.promptCollector) {
    return;
  }

  if ((event.message as { role?: string }).role !== "assistant") {
    return;
  }

  const assistantEntry = ctx.sessionManager.getLeafEntry();
  if (!isRoleEntry(assistantEntry, "assistant")) {
    return;
  }

  try {
    const snapshot = await ensureSnapshotForCurrentWorktree(state.git, {
      lastExact: state.lastExact,
    });
    state.lastExact = snapshot.snapshot;
    state.currentCommitSha = snapshot.snapshot.commitSha;

    const existingSnapshotIndex = state.promptCollector.snapshots.indexOf(
      snapshot.snapshot.commitSha,
    );
    const snapshotIndex =
      existingSnapshotIndex >= 0
        ? existingSnapshotIndex
        : state.promptCollector.snapshots.push(snapshot.snapshot.commitSha) - 1;
    state.promptCollector.bindings.push([assistantEntry.id, snapshotIndex]);
  } catch (error) {
    notify(
      ctx,
      `ASC rewind: failed to capture assistant snapshot (${error instanceof Error ? error.message : String(error)})`,
      "warning",
    );
  }
}

function finalizePromptCollector(
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

async function handleAgentEnd(
  _event: AgentEndEvent,
  ctx: ExtensionContext,
  pi: ExtensionAPI,
  state: RewindRuntimeState,
): Promise<void> {
  if (!state.isGitRepo) {
    state.promptCollector = null;
    return;
  }

  finalizePromptCollector(ctx, pi, state);
}

async function handleSessionCompact(
  event: SessionCompactEvent,
  ctx: ExtensionContext,
  pi: ExtensionAPI,
  state: RewindRuntimeState,
): Promise<void> {
  if (!state.isGitRepo || !state.git) {
    return;
  }

  try {
    const currentCommitSha = await ensureCurrentCommitSha(state);
    appendRewindOp(pi, state, {
      v: REWIND_LEDGER_VERSION,
      snapshots: [currentCommitSha],
      bindings: [[event.compactionEntry.id, 0]],
      current: 0,
    });
    updateStatus(ctx, state);
  } catch (error) {
    notify(
      ctx,
      `ASC rewind: failed to record compaction alias (${error instanceof Error ? error.message : String(error)})`,
      "warning",
    );
  }
}

async function handleSessionBeforeFork(
  event: SessionBeforeForkEvent,
  ctx: ExtensionContext,
  pi: ExtensionAPI,
  state: RewindRuntimeState,
) {
  if (!state.isGitRepo || !state.git) {
    return;
  }

  try {
    if (!ctx.hasUI) {
      const currentCommitSha = await ensureCurrentCommitSha(state);
      appendForkPendingState(pi, { currentCommitSha });
      return;
    }

    const targetCommitSha = await resolveTargetCommitSha(state, event.entryId);
    const hasUndo = Boolean(
      state.undoCommitSha && (await commitExists(state.git, state.undoCommitSha)),
    );

    const options = ["Conversation only (keep current files)"];
    if (targetCommitSha) {
      options.push(
        "Restore all (files + conversation)",
        "Code only (restore files, keep conversation)",
      );
    }
    if (hasUndo) {
      options.push("Undo last file rewind");
    }

    const choice = await ctx.ui.select("Restore Options", options);
    if (!choice) {
      notify(ctx, "ASC rewind: fork cancelled", "info");
      return { cancel: true };
    }

    if (choice === "Conversation only (keep current files)") {
      const currentCommitSha = await ensureCurrentCommitSha(state);
      appendForkPendingState(pi, { currentCommitSha });
      return;
    }

    if (choice === "Undo last file rewind") {
      if (!state.undoCommitSha) {
        return { cancel: true };
      }

      await projectRecoveryMilestoneBestEffort(ctx, state, {
        eventKind: "restore.started",
        mode: "fork-undo-last-rewind",
        targetCommitSha: state.undoCommitSha,
      });

      try {
        const restore = await restoreCommitExactly(state.git, state.undoCommitSha, {
          lastExact: state.lastExact,
        });
        applyCurrentExactState(state, state.undoCommitSha, restore.targetTreeSha);
        appendForkPendingState(pi, {
          currentCommitSha: state.undoCommitSha,
          undoCommitSha: restore.undoCommitSha,
        });
        await projectRecoveryMilestoneBestEffort(ctx, state, {
          eventKind: "restore.undo",
          mode: "fork-undo-last-rewind",
          targetCommitSha: state.undoCommitSha,
          undoCommitSha: restore.undoCommitSha,
          status: "success",
        });
        notify(ctx, "ASC rewind: files restored to before last rewind", "info");
        return { skipConversationRestore: true };
      } catch (error) {
        await projectRecoveryMilestoneBestEffort(ctx, state, {
          eventKind: "restore.failed",
          mode: "fork-undo-last-rewind",
          targetCommitSha: state.undoCommitSha,
          status: "failure",
          failureReason: error instanceof Error ? error.message : String(error),
        });
        throw error;
      }
    }

    if (!targetCommitSha) {
      notify(ctx, "ASC rewind: no exact rewind point available for that entry", "error");
      return { cancel: true };
    }

    const restoreMode =
      choice === "Code only (restore files, keep conversation)"
        ? "fork-code-only"
        : "fork-restore-all";

    await projectRecoveryMilestoneBestEffort(ctx, state, {
      eventKind: "restore.started",
      mode: restoreMode,
      targetEntryId: event.entryId,
      targetCommitSha,
    });

    try {
      const restore = await restoreCommitExactly(state.git, targetCommitSha, {
        lastExact: state.lastExact,
      });
      applyCurrentExactState(state, targetCommitSha, restore.targetTreeSha);
      appendForkPendingState(pi, {
        currentCommitSha: targetCommitSha,
        undoCommitSha: restore.undoCommitSha,
      });
      await projectRecoveryMilestoneBestEffort(ctx, state, {
        eventKind: "restore.completed",
        mode: restoreMode,
        targetEntryId: event.entryId,
        targetCommitSha,
        undoCommitSha: restore.undoCommitSha,
        status: "success",
      });
      notify(ctx, "ASC rewind: files restored from rewind point", "info");

      if (choice === "Code only (restore files, keep conversation)") {
        return { skipConversationRestore: true };
      }
    } catch (error) {
      await projectRecoveryMilestoneBestEffort(ctx, state, {
        eventKind: "restore.failed",
        mode: restoreMode,
        targetEntryId: event.entryId,
        targetCommitSha,
        status: "failure",
        failureReason: error instanceof Error ? error.message : String(error),
      });
      throw error;
    }
  } catch (error) {
    notify(
      ctx,
      `ASC rewind failed before fork: ${error instanceof Error ? error.message : String(error)}`,
      "error",
    );
    return { cancel: true };
  }
}

async function handleSessionBeforeTree(
  event: SessionBeforeTreeEvent,
  ctx: ExtensionContext,
  pi: ExtensionAPI,
  state: RewindRuntimeState,
) {
  if (!state.isGitRepo || !state.git) {
    return;
  }

  try {
    if (!ctx.hasUI) {
      return;
    }

    const targetCommitSha = await resolveTargetCommitSha(state, event.preparation.targetId);
    const hasUndo = Boolean(
      state.undoCommitSha && (await commitExists(state.git, state.undoCommitSha)),
    );

    const options = [TREE_KEEP_CURRENT_FILES, TREE_REWIND_TO_POINT];
    if (hasUndo) {
      options.push(TREE_UNDO_LAST_REWIND);
    }
    options.push(TREE_CANCEL_NAVIGATION);

    const choice = await ctx.ui.select("Restore Options", options);
    if (!choice || choice === TREE_CANCEL_NAVIGATION) {
      notify(ctx, "ASC rewind: navigation cancelled", "info");
      return { cancel: true };
    }

    if (choice === TREE_UNDO_LAST_REWIND) {
      if (!state.undoCommitSha) {
        return { cancel: true };
      }

      await projectRecoveryMilestoneBestEffort(ctx, state, {
        eventKind: "restore.started",
        mode: "tree-undo-last-rewind",
        targetCommitSha: state.undoCommitSha,
      });

      try {
        const restore = await restoreCommitExactly(state.git, state.undoCommitSha, {
          lastExact: state.lastExact,
        });
        applyCurrentExactState(state, state.undoCommitSha, restore.targetTreeSha);

        const snapshots = [state.undoCommitSha];
        const data: AscRewindOpData = {
          v: REWIND_LEDGER_VERSION,
          snapshots,
          current: 0,
        };
        if (restore.undoCommitSha) {
          data.snapshots.push(restore.undoCommitSha);
          data.undo = 1;
        }

        appendRewindOp(pi, state, data);
        updateStatus(ctx, state);
        await projectRecoveryMilestoneBestEffort(ctx, state, {
          eventKind: "restore.undo",
          mode: "tree-undo-last-rewind",
          targetCommitSha: state.undoCommitSha,
          undoCommitSha: restore.undoCommitSha,
          status: "success",
        });
        notify(ctx, "ASC rewind: files restored to before last rewind", "info");
        return { cancel: true };
      } catch (error) {
        await projectRecoveryMilestoneBestEffort(ctx, state, {
          eventKind: "restore.failed",
          mode: "tree-undo-last-rewind",
          targetCommitSha: state.undoCommitSha,
          status: "failure",
          failureReason: error instanceof Error ? error.message : String(error),
        });
        throw error;
      }
    }

    if (choice === TREE_KEEP_CURRENT_FILES) {
      const currentCommitSha = await ensureCurrentCommitSha(state);
      state.pendingTreeState = { currentCommitSha };
      return;
    }

    if (!targetCommitSha) {
      notify(
        ctx,
        "ASC rewind: no exact rewind point for the selected tree node. Choose Keep current files, or continue the session for one turn so ASC can capture a rewind snapshot before trying again.",
        "error",
      );
      return { cancel: true };
    }

    await projectRecoveryMilestoneBestEffort(ctx, state, {
      eventKind: "restore.started",
      mode: "tree-restore",
      targetEntryId: event.preparation.targetId,
      targetCommitSha,
    });

    try {
      const restore = await restoreCommitExactly(state.git, targetCommitSha, {
        lastExact: state.lastExact,
      });
      applyCurrentExactState(state, targetCommitSha, restore.targetTreeSha);
      state.pendingTreeState = {
        currentCommitSha: targetCommitSha,
        undoCommitSha: restore.undoCommitSha,
      };
      await projectRecoveryMilestoneBestEffort(ctx, state, {
        eventKind: "restore.completed",
        mode: "tree-restore",
        targetEntryId: event.preparation.targetId,
        targetCommitSha,
        undoCommitSha: restore.undoCommitSha,
        status: "success",
      });
      notify(ctx, "ASC rewind: files restored to rewind point", "info");
    } catch (error) {
      await projectRecoveryMilestoneBestEffort(ctx, state, {
        eventKind: "restore.failed",
        mode: "tree-restore",
        targetEntryId: event.preparation.targetId,
        targetCommitSha,
        status: "failure",
        failureReason: error instanceof Error ? error.message : String(error),
      });
      throw error;
    }
  } catch (error) {
    state.pendingTreeState = null;
    notify(
      ctx,
      `ASC rewind failed before tree navigation: ${error instanceof Error ? error.message : String(error)}`,
      "error",
    );
    return { cancel: true };
  }
}

function handleSessionTree(
  event: SessionTreeEvent,
  ctx: ExtensionContext,
  pi: ExtensionAPI,
  state: RewindRuntimeState,
): void {
  if (!state.isGitRepo) {
    return;
  }

  if (!state.pendingTreeState) {
    reconstructStateFromSession(ctx, state);
    updateStatus(ctx, state);
    return;
  }

  const snapshots = [state.pendingTreeState.currentCommitSha];
  const data: AscRewindOpData = {
    v: REWIND_LEDGER_VERSION,
    snapshots,
    current: 0,
  };

  if (state.pendingTreeState.undoCommitSha) {
    data.snapshots.push(state.pendingTreeState.undoCommitSha);
    data.undo = 1;
  }

  if (event.summaryEntry?.id) {
    data.bindings = [[event.summaryEntry.id, 0]];
  }

  appendRewindOp(pi, state, data);
  state.pendingTreeState = null;
  reconstructStateFromSession(ctx, state);
  updateStatus(ctx, state);
}

export function registerRewindRuntime(pi: ExtensionAPI): void {
  const state = createRewindRuntimeState();

  pi.on("session_start", async (event: SessionStartEvent, ctx) => {
    await initializeSession(ctx, state);

    if (event.reason === "fork" && event.previousSessionFile) {
      await initializeForkPendingState(pi, ctx, state, event.previousSessionFile);
    }

    if (event.reason === "reload") {
      updateStatus(ctx, state);
    }
  });

  pi.on("session_before_fork", async (event: SessionBeforeForkEvent, ctx) => {
    return handleSessionBeforeFork(event, ctx, pi, state);
  });

  pi.on("session_before_tree", async (event: SessionBeforeTreeEvent, ctx) => {
    return handleSessionBeforeTree(event, ctx, pi, state);
  });

  pi.on("session_tree", async (event: SessionTreeEvent, ctx) => {
    handleSessionTree(event, ctx, pi, state);
  });

  pi.on("turn_start", async (event: TurnStartEvent, ctx) => {
    await handleTurnStart(event, ctx, state);
  });

  pi.on("turn_end", async (event: TurnEndEvent, ctx) => {
    await handleTurnEnd(event, ctx, state);
  });

  pi.on("agent_end", async (event: AgentEndEvent, ctx) => {
    await handleAgentEnd(event, ctx, pi, state);
  });

  pi.on("session_compact", async (event: SessionCompactEvent, ctx) => {
    await handleSessionCompact(event, ctx, pi, state);
  });

  pi.on("session_shutdown", async (_event, ctx) => {
    state.promptCollector = null;
    state.pendingTreeState = null;
    state.lastExact = null;
    state.currentCommitSha = undefined;
    state.undoCommitSha = undefined;
    state.entryToCommit.clear();
    state.isGitRepo = false;
    state.git = null;
    if (ctx.hasUI) {
      ctx.ui.setStatus(REWIND_STATUS_KEY, undefined);
    }
  });
}

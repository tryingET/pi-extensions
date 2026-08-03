import type {
  AgentSettledEvent,
  ExtensionAPI,
  ExtensionContext,
  SessionBeforeForkEvent,
  SessionBeforeTreeEvent,
  SessionCompactEvent,
  SessionStartEvent,
  SessionTreeEvent,
  TurnEndEvent,
  TurnStartEvent,
} from "@earendil-works/pi-coding-agent";
import { restoreCommitExactly } from "./exact-restore.ts";
import { createExecFileGitRunner } from "./git-runner.ts";
import {
  captureWorktreeTree,
  commitExists,
  ensureSnapshotForCurrentWorktree,
  getCommitTreeSha,
} from "./git-snapshot.ts";
import { removeRewindRetentionLease } from "./retention-leases.ts";
import { readPendingForkState } from "./runtime-fork-pending.ts";
import {
  type RewindRuntimeRetentionOptions,
  resolveRewindRetentionConfig,
  runRuntimeRetentionForState as runRuntimeRetention,
} from "./runtime-retention.ts";
import {
  appendForkPendingState,
  appendRewindOp,
  applyCurrentExactState,
  createRewindRuntimeState,
  finalizePromptCollector,
  isRoleEntry,
  notify,
  REWIND_LEDGER_VERSION,
  REWIND_STATUS_KEY,
  type RewindRuntimeState,
  reconstructStateFromSession,
  updateStatus,
} from "./runtime-state.ts";
import { registerRewindStatusCommand } from "./runtime-status.ts";
import {
  ensureCurrentCommitSha,
  projectRecoveryMilestoneBestEffort,
  resolveTargetCommitSha,
} from "./runtime-support.ts";
import { handleSessionBeforeTree, handleSessionTree } from "./runtime-tree.ts";
import type { AscRewindOpData } from "./session-ledger.ts";

async function initializeSession(ctx: ExtensionContext, state: RewindRuntimeState): Promise<void> {
  await removeRewindRetentionLease(
    state.git,
    state.retentionLeaseRef,
    state.retentionLeaseObjectId,
  );
  state.retentionLeaseRef = undefined;
  state.retentionLeaseObjectId = undefined;

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

async function handleAgentSettled(
  _event: AgentSettledEvent,
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

export function registerRewindRuntime(
  pi: ExtensionAPI,
  retentionOptions: RewindRuntimeRetentionOptions = {},
): void {
  const state = createRewindRuntimeState();
  const retentionConfig = resolveRewindRetentionConfig(retentionOptions);
  registerRewindStatusCommand(pi, state, retentionConfig);

  pi.on("session_start", async (event: SessionStartEvent, ctx) => {
    await initializeSession(ctx, state);

    if (event.reason === "fork" && event.previousSessionFile) {
      await initializeForkPendingState(pi, ctx, state, event.previousSessionFile);
    }

    await runRuntimeRetention(ctx, state, retentionConfig);
  });

  pi.on("session_before_fork", async (event: SessionBeforeForkEvent, ctx) => {
    const result = await handleSessionBeforeFork(event, ctx, pi, state);
    await runRuntimeRetention(ctx, state, retentionConfig);
    return result;
  });

  pi.on("session_before_tree", async (event: SessionBeforeTreeEvent, ctx) => {
    const result = await handleSessionBeforeTree(event, ctx, pi, state);
    await runRuntimeRetention(ctx, state, retentionConfig);
    return result;
  });

  pi.on("session_tree", async (event: SessionTreeEvent, ctx) => {
    handleSessionTree(event, ctx, pi, state);
    await runRuntimeRetention(ctx, state, retentionConfig);
  });

  pi.on("turn_start", async (event: TurnStartEvent, ctx) => {
    await handleTurnStart(event, ctx, state);
    await runRuntimeRetention(ctx, state, retentionConfig);
  });

  pi.on("turn_end", async (event: TurnEndEvent, ctx) => {
    await handleTurnEnd(event, ctx, state);
    await runRuntimeRetention(ctx, state, retentionConfig);
  });

  pi.on("agent_settled", async (event: AgentSettledEvent, ctx) => {
    await handleAgentSettled(event, ctx, pi, state);
    await runRuntimeRetention(ctx, state, retentionConfig);
  });

  pi.on("session_compact", async (event: SessionCompactEvent, ctx) => {
    await handleSessionCompact(event, ctx, pi, state);
    await runRuntimeRetention(ctx, state, retentionConfig);
  });

  pi.on("session_shutdown", async (_event, ctx) => {
    await removeRewindRetentionLease(
      state.git,
      state.retentionLeaseRef,
      state.retentionLeaseObjectId,
    );
    state.retentionLeaseRef = undefined;
    state.retentionLeaseObjectId = undefined;
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

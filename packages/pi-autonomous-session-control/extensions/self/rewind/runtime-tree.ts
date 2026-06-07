import type {
  ExtensionAPI,
  ExtensionContext,
  SessionBeforeTreeEvent,
  SessionTreeEvent,
} from "@earendil-works/pi-coding-agent";
import { restoreCommitExactly } from "./exact-restore.ts";
import { commitExists } from "./git-snapshot.ts";
import {
  appendRewindOp,
  applyCurrentExactState,
  notify,
  REWIND_LEDGER_VERSION,
  type RewindRuntimeState,
  reconstructStateFromSession,
  TREE_CANCEL_NAVIGATION,
  TREE_KEEP_CURRENT_FILES,
  TREE_REWIND_TO_POINT,
  TREE_UNDO_LAST_REWIND,
  updateStatus,
} from "./runtime-state.ts";
import {
  ensureCurrentCommitSha,
  projectRecoveryMilestoneBestEffort,
  resolveTargetCommitSha,
} from "./runtime-support.ts";
import type { AscRewindOpData } from "./session-ledger.ts";

export async function handleSessionBeforeTree(
  event: SessionBeforeTreeEvent,
  ctx: ExtensionContext,
  pi: ExtensionAPI,
  state: RewindRuntimeState,
) {
  if (!ctx.hasUI) {
    return;
  }

  try {
    if (!state.isGitRepo || !state.git) {
      const choice = await ctx.ui.select("Restore Options", [
        TREE_KEEP_CURRENT_FILES,
        TREE_REWIND_TO_POINT,
        TREE_CANCEL_NAVIGATION,
      ]);
      if (!choice || choice === TREE_CANCEL_NAVIGATION) {
        notify(ctx, "ASC rewind: navigation cancelled", "info");
        return { cancel: true };
      }
      if (choice === TREE_REWIND_TO_POINT) {
        notify(
          ctx,
          "ASC rewind: file rewind is unavailable because this session is not in an initialized git worktree. Choose Keep current files to navigate conversation only, or restart Pi from a git worktree after installing/reloading ASC.",
          "error",
        );
        return { cancel: true };
      }
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

export function handleSessionTree(
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

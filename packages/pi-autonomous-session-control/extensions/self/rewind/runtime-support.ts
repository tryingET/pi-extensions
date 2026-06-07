import type { ExtensionContext } from "@earendil-works/pi-coding-agent";
import { commitExists, ensureSnapshotForCurrentWorktree } from "./git-snapshot.ts";
import {
  buildRewindCheckpointRef,
  projectRecoveryMilestoneIfConfigured,
} from "./replay-fabric-projection.ts";
import type { RewindRuntimeState } from "./runtime-state.ts";
import { notify } from "./runtime-state.ts";

export async function ensureCurrentCommitSha(state: RewindRuntimeState): Promise<string> {
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

export async function projectRecoveryMilestoneBestEffort(
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

export async function resolveTargetCommitSha(
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

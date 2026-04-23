export {
  deletePathsFromWorkingTree,
  getDeletedPaths,
  isInsidePath,
  type RestoreCommitOptions,
  restoreCommitExactly,
} from "./exact-restore.ts";
export {
  createExecFileGitRunner,
  execGitChecked,
  execGitStdout,
} from "./git-runner.ts";
export {
  captureWorktreeTree,
  commitExists,
  type EnsureSnapshotOptions,
  type EnsureSnapshotResult,
  ensureSnapshotForCurrentWorktree,
  ensureSnapshotForTree,
  getCommitTreeSha,
  getRepoRoot,
} from "./git-snapshot.ts";
export {
  appendSnapshotToStore,
  createStoreKeepaliveCommit,
  getStoreHead,
  type RewriteStoreResult,
  rewriteStoreToLiveSet,
} from "./keepalive-store.ts";
export {
  buildRewindCheckpointRef,
  buildRewindCorrelationId,
  getReplayFabricProjectionConfig,
  projectRecoveryMilestoneIfConfigured,
  type ReplayFabricProjectionConfig,
  type ReplayFabricRecoveryProjectionInput,
} from "./replay-fabric-projection.ts";
export {
  type PlannedRetentionLiveSet,
  planRetentionLiveSet,
  type RewindLedgerReference,
  type RewindRetentionSettings,
} from "./retention.ts";
export { registerRewindRuntime } from "./runtime.ts";
export {
  ASC_REWIND_FORK_PENDING_CUSTOM_TYPE,
  ASC_REWIND_OP_CUSTOM_TYPE,
  ASC_REWIND_TURN_CUSTOM_TYPE,
  type AscRewindForkPendingData,
  type AscRewindOpData,
  type AscRewindTurnData,
  applyRewindBindings,
  getCommitFromRewindOp,
  isAscRewindForkPendingData,
  isAscRewindOpData,
  isAscRewindTurnData,
} from "./session-ledger.ts";
export {
  ASC_REWIND_LEDGER_VERSION,
  type BindingTuple,
  EMPTY_TREE_SHA,
  type GitCommandOptions,
  type GitCommandResult,
  type GitRunner,
  REWIND_STORE_REF,
  type RestoreExactResult,
  type SnapshotRef,
} from "./types.ts";

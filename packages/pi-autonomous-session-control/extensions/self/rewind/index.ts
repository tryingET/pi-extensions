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
  type ExpectedRefHead,
  getStoreHead,
  type RewriteStoreDetailedResult,
  type RewriteStoreResult,
  rewriteStoreToLiveSet,
  rewriteStoreToLiveSetDetailed,
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
export {
  type ActiveRewindLeaseHead,
  type ActiveRewindRetentionLeases,
  publishAndCollectActiveRewindLeases,
  removeRewindRetentionLease,
} from "./retention-leases.ts";
export { registerRewindRuntime } from "./runtime.ts";
export {
  collectRewindRetentionReferences,
  DEFAULT_REWIND_MAX_AGE_DAYS,
  DEFAULT_REWIND_MAX_SNAPSHOTS,
  executeRewindStoreRetention,
  REWIND_MAX_AGE_DAYS_ENV,
  REWIND_MAX_SNAPSHOTS_ENV,
  REWIND_PINNED_COMMITS_ENV,
  type ResolvedRewindRetentionConfig,
  type RewindRetentionExecution,
  type RewindRuntimeRetentionOptions,
  resolveRewindRetentionConfig,
} from "./runtime-retention.ts";
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

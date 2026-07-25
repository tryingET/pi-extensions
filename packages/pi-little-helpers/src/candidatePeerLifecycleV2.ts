/**
 * Compatibility façade for candidate lifecycle v2.
 *
 * Public runtime and type exports remain anchored here; implementation modules are internal.
 */

export { adoptExistingCandidateWorktree } from "./candidatePeerLifecycleV2Adoption.ts";
export type {
  CandidateDisposition,
  CandidateDispositionReceipt,
  CandidateIntegrationProof,
  CandidateInventoryResource,
  CandidateLifecycleAdoptionInput,
  CandidateLifecycleAdoptionReceipt,
  CandidateLifecycleInventory,
  CandidateLifecycleRecord,
  CandidateLifecycleState,
  CandidateReviewSnapshot,
  CandidateSnapshotObject,
} from "./candidatePeerLifecycleV2Core.ts";
export {
  assertCandidateGenerationId,
  assertCandidateResourceId,
  CANDIDATE_LIFECYCLE_SCHEMA_VERSION,
  digestObject,
  getCandidateLifecycleEventsPath,
  getCandidateLifecycleRecordPath,
  getCandidateLifecycleRoot,
  stableJson,
} from "./candidatePeerLifecycleV2Core.ts";
export {
  inventoryCandidatePeerResources,
  resourceName,
} from "./candidatePeerLifecycleV2Inventory.ts";
export {
  assertIntegrationProofCoversDisposition,
  captureCandidateReviewSnapshot,
  createDispositionReceipt,
  unresolvedReviewBlockers,
  verifyAdditiveContentCoverageProof,
  verifyCommitInclusionProof,
  verifyPatchEquivalenceProof,
} from "./candidatePeerLifecycleV2Review.ts";
export {
  appendLifecycleEvent,
  migrateCandidateInventory,
  readLifecycleRecord,
  reconcileCandidateOwnerRoot,
  reconcileMissingResource,
  updateLifecycleRecord,
  withResourceLock,
  writeLockedLifecycleRecord,
} from "./candidatePeerLifecycleV2State.ts";

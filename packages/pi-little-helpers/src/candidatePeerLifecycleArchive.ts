/**
 * Compatibility facade for lifecycle-v2 archive and cleanup operations.
 *
 * Public runtime and type exports remain anchored at this module while the
 * implementation stays in bounded internal modules.
 */

export { createRestorationVerifiedArchive } from "./candidatePeerLifecycleArchiveCreation.ts";
export type {
  CandidateArchiveReceipt,
  CandidateCleanupAuthorization,
  CandidateCleanupEffect,
} from "./candidatePeerLifecycleArchiveTypes.ts";
export {
  authorizeCandidateCleanup,
  reissueExpiredCandidateCleanupAuthorization,
} from "./candidatePeerLifecycleCleanupAuthorization.ts";
export { executeAuthorizedCandidateCleanup } from "./candidatePeerLifecycleCleanupExecution.ts";
export { verifyCleanedCandidateTerminalRecord } from "./candidatePeerLifecycleTerminalVerification.ts";

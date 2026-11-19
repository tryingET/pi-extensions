// ---
// summary: exposes the public peer-messaging contracts, path helpers, presence helpers, and runtime factory
// read_when:
//   - reviewing or changing the package public API
// ---
export type {
  DeliveryResult,
  PeerAskNoReplyReason,
  PeerAttachment,
  PeerAttachmentType,
  PeerMessage,
  PeerMessagingBoundary,
  PeerMessagingRuntime,
  PeerPresence,
  PeerReplyContract,
  PeerRuntimeStatus,
} from "./src/contracts.ts";
export {
  assertDeliveryResult,
  assertPeerAttachment,
  assertPeerMessage,
  assertPeerPresence,
  assertPeerRuntimeStatus,
  createStubPeerMessagingRuntime,
  DEFAULT_ASK_TIMEOUT_MS,
  definePeerMessagingRuntime,
  isPeerAskNoReply,
  PEER_ASK_NO_REPLY_REASONS,
  PEER_ATTACHMENT_TYPES,
  PEER_MESSAGING_BOUNDARY,
  PeerAskCancelledError,
  PeerAskInFlightError,
  PeerAskNoReplyError,
  peerAskOutcome,
} from "./src/contracts.ts";
export type { FileFreshnessStatus } from "./src/mycel-hygiene.ts";
export {
  checkAttachmentFreshness,
  checkHopLimit,
  computeFileSha256,
  DEFAULT_MAX_HOPS,
  formatAttachmentFreshnessTag,
  formatReplyContract,
  pinFileAttachments,
  validateReplyContract,
} from "./src/mycel-hygiene.ts";
export type { PeerMessagingPaths } from "./src/paths.ts";
export {
  getDefaultPeerMessagingRuntimeDir,
  resolvePeerMessagingPaths,
  sanitizePipeSegment,
} from "./src/paths.ts";
export type { PeerPresenceUpdate, PeerRegistration } from "./src/presence.ts";
export {
  applyPresenceUpdate,
  buildPeerPresence,
  createRuntimeFallbackAddressLabel,
  DEFAULT_RUNTIME_ALIAS_PREFIX,
  resolvePeerAddressLabel,
} from "./src/presence.ts";
export type {
  CreatePeerMessagingRuntimeOptions,
  ManagedPeerMessagingRuntime,
  PeerMessageListener,
} from "./src/runtime.ts";
export { createPeerMessagingRuntime } from "./src/runtime.ts";

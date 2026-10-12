/** Native attached-view membrane. Execution/transport contracts remain separate. */
export {
  ATTACHMENT_EVENT,
  type AttachmentIdentity,
  type AttachmentItem,
  type AttachmentRead,
  type AttachmentRequest,
  type AttachmentSettlement,
  claimAttachment,
  MAX_ATTACHMENT_GENERATIONS,
  prepareAttachment,
  readAttachment,
  settleAttachment,
  VIEWER_FLAGS,
  viewerArgv,
} from "./extensions/self/subagent-attachment-registry.ts";

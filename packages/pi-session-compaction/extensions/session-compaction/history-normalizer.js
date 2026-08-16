/**
summary: "Public facade for session-history sanitization and bounded selection."
read_when:
  - "Using or changing the guarded compaction history pipeline."
*/
export {
  contentText,
  estimateMessageChars,
  estimateMessagesChars,
  messageFromEntry,
  messagesFromEntries,
  sanitizeBranchEntries,
  sanitizeMessageForCompaction,
  sanitizeMessagesForCompaction,
  toolCallId,
} from "./history-sanitizer.js";
export { selectMessagesWithinBudget } from "./history-selector.js";

/**
summary: "Builds bounded evidence anchors that connect compacted claims to exact session recall."
read_when:
  - "Changing evidence references, recall hints, or anchor selection."
*/
import { buildManagedBlock } from "./managed-block-codec.js";
import { sanitizeDisplayText } from "./redaction.js";

export const EVIDENCE_ANCHORS_TYPE = "evidence-anchors";
export const EVIDENCE_ANCHORS_HEADING = "## Evidence anchors";

function visibleText(message) {
  if (!message || typeof message !== "object") return "";
  if (typeof message.content === "string") return message.content;
  if (!Array.isArray(message.content)) return String(message.summary ?? message.output ?? "");
  return message.content
    .filter((part) => part && typeof part === "object" && part.type === "text")
    .map((part) => part.text)
    .filter((value) => typeof value === "string")
    .join("\n");
}

function safeRef(value) {
  const normalized = String(value ?? "")
    .replace(/[^A-Za-z0-9._:-]/gu, "-")
    .slice(0, 160);
  return normalized || undefined;
}

function summary(value, maxChars = 300) {
  return sanitizeDisplayText(value, { maxChars, singleLine: true }).text;
}

export function buildEvidenceAnchors(input = {}) {
  const anchors = [];
  const messages = Array.isArray(input.messages) ? input.messages : [];
  const latestUser = [...messages]
    .reverse()
    .find((message) => message?.role === "user" && visibleText(message));
  if (latestUser) {
    const entry = safeRef(latestUser._entryId ?? latestUser.entryId);
    anchors.push({
      id: entry ? `anchor-${entry}` : "anchor-latest-user",
      kind: "intent",
      text: `ref=${entry ? `E:${entry}` : "unavailable"} | kind=current_user_intent | ${summary(visibleText(latestUser))}`,
      timestamp: latestUser.timestamp ?? Date.now(),
      sourceEntryId: entry,
      priority: 120,
      pinned: true,
    });
  }

  for (const receipt of Array.isArray(input.receipts) ? input.receipts : []) {
    if (!receipt?.sourceEntryId) continue;
    const entry = safeRef(receipt.sourceEntryId);
    if (!entry) continue;
    const kind =
      receipt.status === "failed" ? "failure" : receipt.isValidation ? "validation" : "execution";
    anchors.push({
      id: `anchor-${entry}-${safeRef(receipt.id) ?? receipt.status ?? "receipt"}`,
      kind,
      text: `ref=E:${entry} | kind=${kind} | ${summary(receipt.text ?? receipt.resultSummary ?? receipt.toolName)}`,
      timestamp: receipt.timestamp ?? 0,
      sourceEntryId: entry,
      priority: receipt.status === "failed" ? 115 : receipt.isValidation ? 105 : 80,
      pinned: receipt.status === "failed",
    });
  }

  if (input.worktree?.ok && input.worktree?.verified && input.worktree.state) {
    const state = input.worktree.state;
    anchors.push({
      id: "anchor-git-worktree-live",
      kind: "verified_worktree",
      text: `ref=G:worktree-live | kind=verified_worktree | branch=${summary(state.branch, 100)} | clean=${state.clean === true} | staged=${state.counts?.staged ?? 0} | unstaged=${state.counts?.unstaged ?? 0} | untracked=${state.counts?.untracked ?? 0} | conflicted=${state.counts?.conflicted ?? 0}`,
      timestamp: Date.parse(input.worktree.generatedAt ?? "") || Date.now(),
      source: "pi-context-packer/git-worktree-v1",
      priority: 110,
      pinned: true,
    });
  }

  const compactedMessageCount = Number.isFinite(input.compactedMessageCount)
    ? Math.max(0, Math.floor(input.compactedMessageCount))
    : messages.length;
  const omittedMessageCount = Number.isFinite(input.omittedMessageCount)
    ? Math.max(0, Math.floor(input.omittedMessageCount))
    : 0;
  if (compactedMessageCount > 0) {
    anchors.push({
      id: "anchor-recall-guidance",
      kind: "recall_hint",
      text: `ref=R:session_compaction_recall | kind=recall_hint | ${compactedMessageCount} historical message(s) crossed the compaction boundary; ${omittedMessageCount} lower-priority message(s) were omitted from the model packet. Resolve E:<entry-id> anchors with session_compaction_recall refs before guessing from the summary.`,
      timestamp: Date.now(),
      priority: 118,
      pinned: true,
    });
  }

  return anchors;
}

export function renderEvidenceAnchorsBlock(anchors, options = {}) {
  return buildManagedBlock({
    type: EVIDENCE_ANCHORS_TYPE,
    heading: EVIDENCE_ANCHORS_HEADING,
    records: anchors,
    maxItems: options.maxItems ?? 16,
    maxChars: options.maxChars ?? 4_000,
    maxRecordChars: options.maxRecordChars ?? 700,
  });
}

/**
summary: "Renders a deterministic continuation checkpoint when model summarization is unavailable."
read_when:
  - "Changing emergency fallback shape, objective extraction, or evidence presentation."
*/
import { sanitizeDisplayText } from "./redaction.js";

const CONSTRAINT_RE =
  /\b(?:must|never|always|do not|don't|prefer|constraint|only|without|avoid|require|required)\b/iu;

function normalizeText(value) {
  return typeof value === "string" ? value.trim() : String(value ?? "").trim();
}

export function extractVisibleText(message) {
  if (!message || typeof message !== "object") return "";
  if (typeof message.content === "string") return message.content.trim();
  if (Array.isArray(message.content)) {
    return message.content
      .map((part) => {
        if (!part || typeof part !== "object") return "";
        if (part.type === "thinking" || part.type === "toolCall") return "";
        return typeof part.text === "string" ? part.text : "";
      })
      .filter(Boolean)
      .join("\n")
      .trim();
  }
  return normalizeText(message.summary ?? message.output ?? message.command);
}

function latestMessage(messages, role) {
  const list = Array.isArray(messages) ? messages : [];
  for (let index = list.length - 1; index >= 0; index -= 1) {
    if (list[index]?.role === role && extractVisibleText(list[index])) return list[index];
  }
  return undefined;
}

function clip(value, maxChars = 800) {
  const sanitized = sanitizeDisplayText(value, { maxChars, singleLine: true });
  return sanitized.text || "(not available)";
}

function constraintLines(messages, maxItems = 8) {
  const out = [];
  for (const message of Array.isArray(messages) ? messages : []) {
    if (message?.role !== "user") continue;
    const text = extractVisibleText(message);
    if (!text || !CONSTRAINT_RE.test(text)) continue;
    const value = clip(text, 500);
    if (!out.includes(value)) out.push(value);
  }
  return out.slice(-maxItems);
}

function observedFileLines(files, maxItems = 12) {
  return (Array.isArray(files) ? files : [])
    .slice(0, maxItems)
    .map((file) => {
      const path = clip(file.displayPath ?? file.path ?? "unknown", 300);
      const operations = [...(file.operations ?? [])].join(", ") || "observed activity";
      return `${path} — ${operations}`;
    });
}

function receiptLines(receipts, predicate, maxItems = 8) {
  return (Array.isArray(receipts) ? receipts : [])
    .filter(predicate)
    .sort((left, right) => (right.timestamp ?? 0) - (left.timestamp ?? 0))
    .slice(0, maxItems)
    .map((receipt) => clip(receipt.text, 700));
}

function bullets(items, emptyText) {
  if (!Array.isArray(items) || items.length === 0) return `- ${emptyText}`;
  return items.map((item) => `- ${item}`).join("\n");
}

export function buildDeterministicCompactionSummary(input = {}) {
  const messages = Array.isArray(input.messages) ? input.messages : [];
  const latestUser = latestMessage(messages, "user");
  const latestAssistant = latestMessage(messages, "assistant");
  const objective = clip(
    extractVisibleText(latestUser) || input.focusText || "Recover current intent from the retained tail.",
    1_000,
  );
  const assistantState = clip(
    extractVisibleText(latestAssistant) ||
      "No visible assistant state was recoverable; use retained context and evidence receipts.",
    1_000,
  );
  const constraints = constraintLines(messages);
  const files = observedFileLines(input.files);
  const failures = receiptLines(input.receipts, (receipt) => receipt.status === "failed");
  const validations = receiptLines(input.receipts, (receipt) => receipt.isValidation === true);
  const successfulWork = receiptLines(
    input.receipts,
    (receipt) => receipt.status === "success" && receipt.isValidation !== true,
  );
  const omitted = Number.isFinite(input.omittedMessageCount)
    ? Math.max(0, input.omittedMessageCount)
    : 0;

  return [
    "## Self-contained continuation snapshot",
    `- Current repo/cwd: ${clip(input.cwd ?? "unknown", 500)}`,
    `- Latest explicit user request: ${objective}`,
    `- Current implementation state: ${assistantState}`,
    "- Evidence posture: this deterministic checkpoint is derived continuity context, not canonical git, task, or evidence truth.",
    "- Current blocker or risk: model-generated compaction was unavailable or invalid; verify state from retained context and owner sources.",
    "",
    "## Compaction boundary",
    `- This checkpoint replaces the selected older history span; ${omitted} lower-priority message(s) were omitted from the model packet when budgeting required it.`,
    `- Split-turn compaction: ${input.isSplitTurn === true ? "yes" : "no"}.`,
    "- More recent kept context may supersede this checkpoint.",
    "",
    "## Next action",
    "1. Read the retained recent context and confirm the latest user request.",
    "2. Verify current git/worktree and task state from their owning surfaces.",
    "3. Resolve the newest failed or unverified receipt before claiming completion.",
    "4. Continue with the smallest reversible step; fall back or roll back if verification disagrees.",
    "",
    "## Constraints and preferences",
    bullets(constraints, "No deterministic constraint phrase was extracted; preserve retained user instructions."),
    "",
    "## Work performed",
    bullets(successfulWork, "No successful execution receipt was recovered."),
    ...(files.length > 0
      ? ["", "Observed session file activity:", bullets(files, "No tracked files.")]
      : []),
    "",
    "## Evidence and verification",
    ...(validations.length > 0
      ? ["Observed validation receipts:", bullets(validations, "No validation receipts.")]
      : ["- No validation receipt was recovered; completion remains unverified."]),
    ...(failures.length > 0
      ? ["", "Observed failures:", bullets(failures, "No failures.")]
      : []),
    "",
    "## Open issues and uncertainties",
    "- The fallback does not infer current dirty state, completion, or external task authority.",
    "- Exact prompts, failures, file activity, and the latest assistant message are preserved in bounded managed records when available.",
  ].join("\n");
}

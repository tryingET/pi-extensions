/**
summary: "Maintains bounded lifecycle-aware continuity facts across repeated compactions."
read_when:
  - "Changing repeated-compaction merge semantics, current intent, or durable fact classes."
*/
import { buildManagedBlock, managedRecordsFromSummary } from "./managed-block-codec.js";
import { sanitizeDisplayText } from "./redaction.js";

export const CONTINUITY_STATE_TYPE = "continuity-state";
export const CONTINUITY_STATE_HEADING = "## Structured continuity state";

const CONSTRAINT_RE =
  /\b(?:must|never|always|do not|don't|only|without|avoid|prefer|require|required|constraint)\b/iu;
const DECISION_RE =
  /\b(?:decided|decision|choose|chosen|selected|adopt|adopted|reject|rejected|instead|do not use|don't use|will use|we'll use)\b/iu;
const VOLATILE_KINDS = new Set(["intent", "assistant_state", "worktree"]);
const KIND_CAPS = Object.freeze({
  intent: 1,
  assistant_state: 1,
  worktree: 1,
  constraint: 8,
  decision: 8,
  failure: 8,
  validation: 8,
});

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

function clip(value, maxChars = 700) {
  return sanitizeDisplayText(value, { maxChars, singleLine: true }).text;
}

function safeRef(value) {
  const normalized = String(value ?? "")
    .replace(/[^A-Za-z0-9._:-]/gu, "-")
    .slice(0, 160);
  return normalized || undefined;
}

function timestamp(value, fallback = 0) {
  if (Number.isFinite(value)) return value;
  if (typeof value === "string") {
    const parsed = Date.parse(value);
    if (Number.isFinite(parsed)) return parsed;
  }
  return fallback;
}

function factText(kind, value, extras = {}) {
  const fields = [
    `status=${extras.status ?? "current"}`,
    `epistemic=${extras.epistemic ?? "observed"}`,
    extras.owner ? `owner=${clip(extras.owner, 120)}` : undefined,
    extras.ref ? `ref=${extras.ref}` : undefined,
    `${kind}=${clip(value)}`,
  ].filter(Boolean);
  return fields.join(" | ");
}

function messageRecord(message, kind, priority, pinned = false) {
  const text = visibleText(message);
  if (!text) return undefined;
  const sourceEntryId = safeRef(message._entryId ?? message.entryId);
  return {
    id: `${kind}-${sourceEntryId ?? timestamp(message.timestamp, Date.now())}`,
    kind,
    text: factText(kind, text, {
      ref: sourceEntryId ? `E:${sourceEntryId}` : undefined,
    }),
    timestamp: timestamp(message.timestamp, Date.now()),
    sourceEntryId,
    priority,
    pinned,
  };
}

function sentenceFacts(messages, kind, pattern, priority) {
  const out = [];
  for (const message of Array.isArray(messages) ? messages : []) {
    if (message?.role !== "user") continue;
    const sourceEntryId = safeRef(message._entryId ?? message.entryId);
    for (const line of visibleText(message).split(/(?<=[.!?])\s+|\n+/u)) {
      const normalized = line.trim();
      if (!normalized || !pattern.test(normalized)) continue;
      out.push({
        id: `${kind}-${sourceEntryId ?? timestamp(message.timestamp, out.length)}-${out.length}`,
        kind,
        text: factText(kind, normalized, {
          ref: sourceEntryId ? `E:${sourceEntryId}` : undefined,
        }),
        timestamp: timestamp(message.timestamp, out.length),
        sourceEntryId,
        priority,
      });
    }
  }
  return out;
}

function worktreeRecord(worktree) {
  if (!worktree?.ok || !worktree?.verified || !worktree.state) {
    const reasons = (worktree?.omissions ?? [])
      .map((omission) => clip(omission?.reason, 60))
      .filter(Boolean)
      .slice(0, 4);
    return {
      id: "worktree-current-unverified",
      kind: "worktree",
      text: factText(
        "worktree",
        `live snapshot unavailable${reasons.length > 0 ? `; reasons=${reasons.join(",")}` : ""}; verify from the git owner surface`,
        {
          status: "current_unverified",
          epistemic: "provider_observation",
          owner: "pi-context-packer/git-worktree-v1",
        },
      ),
      timestamp: Date.now(),
      source: "pi-context-packer/git-worktree-v1",
      priority: 118,
      pinned: true,
    };
  }

  const state = worktree.state;
  const paths = (state.changedPaths ?? [])
    .slice(0, 8)
    .map((entry) => `${entry.status} ${entry.path}`)
    .join(", ");
  return {
    id: "worktree-live",
    kind: "worktree",
    text: factText(
      "worktree",
      `branch=${state.branch}; clean=${state.clean === true}; staged=${state.counts?.staged ?? 0}; unstaged=${state.counts?.unstaged ?? 0}; untracked=${state.counts?.untracked ?? 0}; conflicted=${state.counts?.conflicted ?? 0}${paths ? `; paths=${paths}` : ""}`,
      {
        status: "current_verified",
        owner: "pi-context-packer/git-worktree-v1",
        ref: "G:worktree-live",
      },
    ),
    timestamp: timestamp(worktree.generatedAt, Date.now()),
    source: "pi-context-packer/git-worktree-v1",
    priority: 118,
    pinned: true,
  };
}

function receiptRecords(receipts) {
  return (Array.isArray(receipts) ? receipts : [])
    .filter((receipt) => receipt?.status === "failed" || receipt?.isValidation === true)
    .map((receipt) => {
      const kind = receipt.status === "failed" ? "failure" : "validation";
      const sourceEntryId = safeRef(receipt.sourceEntryId);
      return {
        id: `continuity-${safeRef(receipt.id) ?? sourceEntryId ?? kind}`,
        kind,
        text: factText(kind, receipt.text ?? receipt.resultSummary ?? receipt.toolName, {
          status: kind === "failure" ? "failed" : "verified_at_time",
          ref: sourceEntryId ? `E:${sourceEntryId}` : undefined,
        }),
        timestamp: timestamp(receipt.timestamp),
        sourceEntryId,
        priority: kind === "failure" ? 112 : 100,
        pinned: kind === "failure",
      };
    });
}

function replaceField(text, field, value) {
  const pattern = new RegExp(`(?:^|\\s\\|\\s)${field}=[^|]*`, "u");
  if (pattern.test(text)) {
    return text.replace(pattern, (match) => {
      const prefix = match.startsWith(" | ") ? " | " : "";
      return `${prefix}${field}=${value}`;
    });
  }
  return `${field}=${value} | ${text}`;
}

function carryPreviousRecord(record) {
  const status =
    record.kind === "failure"
      ? "historical_failed"
      : record.kind === "validation"
        ? "historical_verified"
        : "carried_unverified";
  return {
    ...record,
    text: replaceField(
      replaceField(String(record.text ?? ""), "status", status),
      "epistemic",
      "carried_summary",
    ),
    fromPrevious: true,
    pinned: record.kind === "failure" ? record.pinned : false,
  };
}

function canonicalFactText(value) {
  return String(value ?? "")
    .replace(/(?:^|\s\|\s)(?:status|epistemic)=[^|]*/gu, "")
    .replace(/\s+/gu, " ")
    .trim()
    .toLowerCase();
}

function dedupeKey(record) {
  return `${record.kind}:${canonicalFactText(record.text)}`;
}

function shouldReplace(prior, candidate) {
  if (prior.fromPrevious && !candidate.fromPrevious) return true;
  if (!prior.fromPrevious && candidate.fromPrevious) return false;
  if (candidate.pinned && !prior.pinned) return true;
  return (candidate.timestamp ?? 0) >= (prior.timestamp ?? 0);
}

export function mergeContinuityRecords(previous, current) {
  const currentList = Array.isArray(current) ? current : [];
  const currentKinds = new Set(currentList.map((record) => record.kind));
  const candidates = [
    ...(Array.isArray(previous) ? previous : [])
      .filter((record) => !VOLATILE_KINDS.has(record.kind) || !currentKinds.has(record.kind))
      .map(carryPreviousRecord),
    ...currentList,
  ];

  const byKey = new Map();
  for (const record of candidates) {
    const key = dedupeKey(record);
    const prior = byKey.get(key);
    if (!prior || shouldReplace(prior, record)) byKey.set(key, record);
  }

  const grouped = new Map();
  for (const record of byKey.values()) {
    const list = grouped.get(record.kind) ?? [];
    list.push(record);
    grouped.set(record.kind, list);
  }

  const out = [];
  for (const [kind, list] of grouped) {
    const cap = KIND_CAPS[kind] ?? 6;
    out.push(
      ...list
        .sort(
          (left, right) =>
            Number(right.pinned) - Number(left.pinned) ||
            (right.priority ?? 0) - (left.priority ?? 0) ||
            (right.timestamp ?? 0) - (left.timestamp ?? 0),
        )
        .slice(0, cap),
    );
  }
  return out;
}

export function buildContinuityRecords(input = {}) {
  const messages = Array.isArray(input.messages) ? input.messages : [];
  const latestUser = [...messages]
    .reverse()
    .find((message) => message?.role === "user" && visibleText(message));
  const latestAssistant = [...messages]
    .reverse()
    .find((message) => message?.role === "assistant" && visibleText(message));
  const current = [
    latestUser ? messageRecord(latestUser, "intent", 120, true) : undefined,
    latestAssistant ? messageRecord(latestAssistant, "assistant_state", 90) : undefined,
    ...sentenceFacts(messages, "constraint", CONSTRAINT_RE, 105),
    ...sentenceFacts(messages, "decision", DECISION_RE, 85),
    ...receiptRecords(input.receipts),
    worktreeRecord(input.worktree),
  ].filter(Boolean);
  const previous = managedRecordsFromSummary(input.previousSummary, CONTINUITY_STATE_TYPE);
  return mergeContinuityRecords(previous, current);
}

export function renderContinuityStateBlock(records, options = {}) {
  return buildManagedBlock({
    type: CONTINUITY_STATE_TYPE,
    heading: CONTINUITY_STATE_HEADING,
    records,
    maxItems: options.maxItems ?? 32,
    maxChars: options.maxChars ?? 6_000,
    maxRecordChars: options.maxRecordChars ?? 900,
  });
}

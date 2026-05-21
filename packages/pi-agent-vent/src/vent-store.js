import { randomUUID } from "node:crypto";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";

export const SCHEMA_VERSION = 1;
export const DEFAULT_LIMIT = 10;
export const STORE_FILE_NAME = "vents.jsonl";
export const CATEGORIES = [
  "bug",
  "friction",
  "missing_capability",
  "tool_failure",
  "context_loss",
  "permission",
  "performance",
  "documentation",
  "workflow",
  "other",
];
export const SEVERITIES = ["low", "medium", "high", "critical"];

const SEVERITY_RANK = new Map(SEVERITIES.map((severity, index) => [severity, index]));
const SENSITIVE_PATTERNS = [
  {
    name: "bearer_token",
    pattern: /Bearer\s+[A-Za-z0-9._~+/=-]+/gi,
    replacement: "Bearer [REDACTED]",
  },
  { name: "openai_like_key", pattern: /sk-[A-Za-z0-9_-]{16,}/g, replacement: "sk-[REDACTED]" },
  { name: "github_token", pattern: /gh[pousr]_[A-Za-z0-9_]{16,}/g, replacement: "gh*_REDACTED" },
  {
    name: "assigned_secret",
    pattern: /\b(api[_-]?key|token|password|secret)\s*=\s*[^\s,;]+/gi,
    replacement: "$1=[REDACTED]",
  },
];

export function defaultStoreDir(env = process.env) {
  return env.PI_AGENT_VENT_DIR || path.join(os.homedir(), ".pi", "agent", "agent-vent");
}

export function defaultStorePath(env = process.env) {
  return path.join(defaultStoreDir(env), STORE_FILE_NAME);
}

export function normalizeCategory(value) {
  const normalized = String(value || "other")
    .trim()
    .toLowerCase()
    .replaceAll("-", "_");
  return CATEGORIES.includes(normalized) ? normalized : "other";
}

export function normalizeSeverity(value) {
  const normalized = String(value || "medium")
    .trim()
    .toLowerCase();
  return SEVERITIES.includes(normalized) ? normalized : "medium";
}

export function clampLimit(value, fallback = DEFAULT_LIMIT) {
  const numeric = Number(value);
  if (!Number.isFinite(numeric)) return fallback;
  return Math.min(100, Math.max(1, Math.trunc(numeric)));
}

export function redactSensitiveText(value) {
  if (value === undefined || value === null)
    return { text: undefined, redacted: false, patterns: [] };
  let text = String(value).slice(0, 4000);
  const patterns = [];
  for (const entry of SENSITIVE_PATTERNS) {
    const next = text.replace(entry.pattern, entry.replacement);
    if (next !== text) {
      patterns.push(entry.name);
      text = next;
    }
  }
  return { text, redacted: patterns.length > 0, patterns };
}

export function compactText(value, maxLength = 1200) {
  if (value === undefined || value === null) return undefined;
  const text = String(value).replace(/\s+/g, " ").trim();
  if (!text) return undefined;
  if (text.length <= maxLength) return text;
  return `${text.slice(0, maxLength - 1)}…`;
}

export function recurrenceSlug(value) {
  const slug = String(value || "")
    .toLowerCase()
    .replace(/[`'"“”‘’]/g, "")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 80);
  return slug || "unspecified";
}

export function buildRecurrenceKey(input) {
  const category = normalizeCategory(input?.category);
  const basis = input?.recurrenceKey || input?.summary || "unspecified";
  return `${category}:${recurrenceSlug(basis)}`;
}

function sanitizeOptionalText(value, maxLength) {
  const compact = compactText(value, maxLength);
  if (compact === undefined) return { value: undefined, redacted: false, patterns: [] };
  const redacted = redactSensitiveText(compact);
  return { value: redacted.text, redacted: redacted.redacted, patterns: redacted.patterns };
}

export function createVentRecord(input, context = {}) {
  const summary = sanitizeOptionalText(input?.summary, 600);
  if (!summary.value) {
    throw new Error("agent_vent record requires a non-empty summary");
  }

  const optionalFields = {
    frustration: sanitizeOptionalText(input?.frustration, 1200),
    evidence: sanitizeOptionalText(input?.evidence, 1600),
    expected: sanitizeOptionalText(input?.expected, 800),
    actual: sanitizeOptionalText(input?.actual, 800),
    reproduction: sanitizeOptionalText(input?.reproduction, 1200),
  };
  const redactionPatterns = new Set(summary.patterns);
  let redacted = summary.redacted;
  for (const field of Object.values(optionalFields)) {
    redacted = redacted || field.redacted;
    for (const pattern of field.patterns) redactionPatterns.add(pattern);
  }

  const category = normalizeCategory(input?.category);
  const severity = normalizeSeverity(input?.severity);
  const tags = Array.isArray(input?.tags)
    ? input.tags
        .map((tag) => recurrenceSlug(tag))
        .filter((tag) => tag !== "unspecified")
        .slice(0, 12)
    : [];

  return removeUndefined({
    schemaVersion: SCHEMA_VERSION,
    id: context.id || randomUUID(),
    createdAt: context.now || new Date().toISOString(),
    category,
    severity,
    recurrenceKey: buildRecurrenceKey({
      category,
      recurrenceKey: input?.recurrenceKey,
      summary: summary.value,
    }),
    summary: summary.value,
    frustration: optionalFields.frustration.value,
    evidence: optionalFields.evidence.value,
    expected: optionalFields.expected.value,
    actual: optionalFields.actual.value,
    reproduction: optionalFields.reproduction.value,
    tags,
    context: removeUndefined({
      cwd: context.cwd,
      sessionFile: context.sessionFile,
      source: context.source || "agent_vent",
    }),
    privacy: {
      classification: "local-diagnostic-user-data",
      redacted,
      redactionPatterns: [...redactionPatterns].sort(),
    },
  });
}

export function ensureStore(filePath) {
  fs.mkdirSync(path.dirname(filePath), { recursive: true, mode: 0o700 });
  if (!fs.existsSync(filePath)) {
    fs.writeFileSync(filePath, "", { encoding: "utf8", mode: 0o600 });
  }
}

export function appendVentRecord(filePath, record) {
  ensureStore(filePath);
  fs.appendFileSync(filePath, `${JSON.stringify(record)}\n`, { encoding: "utf8" });
}

export function readVentRecords(filePath) {
  if (!fs.existsSync(filePath)) return { records: [], malformedLines: 0 };
  const text = fs.readFileSync(filePath, "utf8");
  const records = [];
  let malformedLines = 0;
  for (const line of text.split(/\r?\n/)) {
    if (!line.trim()) continue;
    try {
      const value = JSON.parse(line);
      if (value && typeof value === "object") {
        records.push(value);
      }
    } catch {
      malformedLines += 1;
    }
  }
  return { records, malformedLines };
}

export function summarizeRecords(records, options = {}) {
  const groups = new Map();
  for (const record of records) {
    const key = String(record.recurrenceKey || buildRecurrenceKey(record));
    const existing = groups.get(key) || {
      recurrenceKey: key,
      count: 0,
      maxSeverity: "low",
      categories: new Set(),
      firstSeen: undefined,
      lastSeen: undefined,
      latestSummary: undefined,
      sampleIds: [],
    };
    existing.count += 1;
    const severity = normalizeSeverity(record.severity);
    if (rankSeverity(severity) > rankSeverity(existing.maxSeverity)) {
      existing.maxSeverity = severity;
    }
    existing.categories.add(normalizeCategory(record.category));
    if (!existing.firstSeen || String(record.createdAt) < existing.firstSeen)
      existing.firstSeen = record.createdAt;
    if (!existing.lastSeen || String(record.createdAt) > existing.lastSeen) {
      existing.lastSeen = record.createdAt;
      existing.latestSummary = record.summary;
    }
    if (existing.sampleIds.length < 5 && record.id) existing.sampleIds.push(record.id);
    groups.set(key, existing);
  }

  const groupSummaries = [...groups.values()]
    .map((group) => {
      const candidateIncident = isCandidateIncident(group);
      return {
        recurrenceKey: group.recurrenceKey,
        count: group.count,
        maxSeverity: group.maxSeverity,
        candidateIncident,
        categories: [...group.categories].sort(),
        firstSeen: group.firstSeen,
        lastSeen: group.lastSeen,
        latestSummary: group.latestSummary,
        sampleIds: group.sampleIds,
      };
    })
    .sort(compareGroups);

  return {
    totalRecords: records.length,
    groupCount: groupSummaries.length,
    candidateIncidentCount: groupSummaries.filter((group) => group.candidateIncident).length,
    groups: groupSummaries.slice(0, clampLimit(options.limit, 20)),
  };
}

export function formatRecord(record) {
  return [
    `- ${record.createdAt || "unknown-time"} [${record.severity || "medium"}/${record.category || "other"}] ${record.summary || "(no summary)"}`,
    `  recurrence: ${record.recurrenceKey || "unknown"}`,
  ].join("\n");
}

export function formatSummary(summary) {
  if (summary.totalRecords === 0) {
    return "No agent vent records found yet.";
  }
  const lines = [
    `Agent vent summary: ${summary.totalRecords} record(s), ${summary.groupCount} recurrence group(s), ${summary.candidateIncidentCount} candidate incident(s).`,
  ];
  for (const group of summary.groups) {
    const marker = group.candidateIncident ? "candidate incident" : "watch";
    lines.push(
      `- ${group.recurrenceKey} — ${group.count}x, max=${group.maxSeverity}, ${marker}; latest: ${group.latestSummary}`,
    );
  }
  return lines.join("\n");
}

export function formatRecent(records, limit = DEFAULT_LIMIT) {
  const recent = records.slice(-clampLimit(limit)).reverse();
  if (recent.length === 0) return "No agent vent records found yet.";
  return recent.map(formatRecord).join("\n");
}

function isCandidateIncident(group) {
  const severityRank = rankSeverity(group.maxSeverity);
  return (
    group.maxSeverity === "critical" ||
    (group.count >= 3 && severityRank >= rankSeverity("medium")) ||
    (group.count >= 2 && severityRank >= rankSeverity("high"))
  );
}

function compareGroups(a, b) {
  if (a.candidateIncident !== b.candidateIncident) return a.candidateIncident ? -1 : 1;
  const severityDelta = rankSeverity(b.maxSeverity) - rankSeverity(a.maxSeverity);
  if (severityDelta !== 0) return severityDelta;
  if (b.count !== a.count) return b.count - a.count;
  return String(b.lastSeen || "").localeCompare(String(a.lastSeen || ""));
}

function rankSeverity(severity) {
  return SEVERITY_RANK.get(normalizeSeverity(severity)) ?? 1;
}

function removeUndefined(value) {
  return Object.fromEntries(Object.entries(value).filter(([, entry]) => entry !== undefined));
}

import { createHash, randomUUID } from "node:crypto";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";

export const SCHEMA_VERSION = 1;
export const DEFAULT_LIMIT = 10;
export const STORE_FILE_NAME = "vents.jsonl";
export const REVIEW_EVENT_FILE_NAME = "review-events.jsonl";
export const CURATION_EVENT_FILE_NAME = "curation-events.jsonl";
export const RETENTION_EVENT_FILE_NAME = "retention-events.jsonl";
export const BACKUP_DIR_NAME = "backups";
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
export const REVIEW_STATES = ["new", "acknowledged", "dismissed", "escalation_drafted"];
export const CURATION_ACTIONS = ["merge", "rename", "remove"];
export const DRAFT_TARGETS = ["github_issue", "ak_task", "incident_review", "maintainer_note"];
export const RETENTION_ACTIONS = ["preview", "archive", "restore"];
export const RETENTION_EVENT_ACTIONS = ["archive", "restore"];
export const MAX_JSONL_FILE_BYTES = 5 * 1024 * 1024;
export const MAX_JSONL_LINE_BYTES = 64 * 1024;

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

export function defaultReviewPath(env = process.env) {
  return path.join(defaultStoreDir(env), REVIEW_EVENT_FILE_NAME);
}

export function defaultCurationPath(env = process.env) {
  return path.join(defaultStoreDir(env), CURATION_EVENT_FILE_NAME);
}

export function defaultRetentionPath(env = process.env) {
  return path.join(defaultStoreDir(env), RETENTION_EVENT_FILE_NAME);
}

export function defaultBackupDir(env = process.env) {
  return path.join(defaultStoreDir(env), BACKUP_DIR_NAME);
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

export function normalizeReviewState(value) {
  const normalized = String(value || "new")
    .trim()
    .toLowerCase()
    .replaceAll("-", "_");
  if (!REVIEW_STATES.includes(normalized)) {
    throw new Error(
      `invalid agent_vent review state: ${value}; expected one of ${REVIEW_STATES.join(", ")}`,
    );
  }
  return normalized;
}

export function normalizeCurationAction(value) {
  const normalized = String(value || "")
    .trim()
    .toLowerCase()
    .replaceAll("-", "_");
  if (!CURATION_ACTIONS.includes(normalized)) {
    throw new Error(
      `invalid agent_vent curation action: ${value}; expected one of ${CURATION_ACTIONS.join(", ")}`,
    );
  }
  return normalized;
}

export function normalizeDraftTarget(value) {
  const normalized = String(value || "")
    .trim()
    .toLowerCase()
    .replaceAll("-", "_");
  if (!DRAFT_TARGETS.includes(normalized)) {
    throw new Error(
      `invalid agent_vent draft target: ${value}; expected one of ${DRAFT_TARGETS.join(", ")}`,
    );
  }
  return normalized;
}

export function normalizeRetentionAction(value) {
  const normalized = String(value || "")
    .trim()
    .toLowerCase()
    .replaceAll("-", "_");
  if (!RETENTION_ACTIONS.includes(normalized)) {
    throw new Error(
      `invalid agent_vent retention action: ${value}; expected one of ${RETENTION_ACTIONS.join(", ")}`,
    );
  }
  return normalized;
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
  const redacted = redactSensitiveText(value).text;
  const slug = String(redacted || "")
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

export function createReviewEvent(input, context = {}) {
  const recurrenceKey = sanitizeDisplayText(input?.recurrenceKey, 200);
  if (!recurrenceKey) {
    throw new Error("agent_vent review state requires a recurrenceKey");
  }

  const state = normalizeReviewState(input?.state || input?.reviewState);
  const note = sanitizeOptionalText(input?.note || input?.reviewNote, 1200);

  return removeUndefined({
    schemaVersion: SCHEMA_VERSION,
    eventType: "review_state",
    id: context.id || randomUUID(),
    createdAt: context.now || new Date().toISOString(),
    recurrenceKey,
    state,
    note: note.value,
    context: removeUndefined({
      source: context.source || "agent_vent_review",
    }),
    privacy: {
      classification: "local-diagnostic-user-data",
      redacted: note.redacted,
      redactionPatterns: [...note.patterns].sort(),
    },
  });
}

export function createCurationEvent(input, context = {}) {
  const action = normalizeCurationAction(input?.action || input?.curationAction);
  const sourceRecurrenceKey = sanitizeDisplayText(input?.sourceRecurrenceKey, 200);
  const targetRecurrenceKey = sanitizeDisplayText(input?.targetRecurrenceKey, 200);
  if (!sourceRecurrenceKey || (action !== "remove" && !targetRecurrenceKey)) {
    throw new Error("agent_vent curation requires sourceRecurrenceKey and targetRecurrenceKey");
  }
  if (targetRecurrenceKey && sourceRecurrenceKey === targetRecurrenceKey) {
    throw new Error("agent_vent curation source and target must differ");
  }

  const note = sanitizeOptionalText(input?.note || input?.curationNote, 1200);
  return removeUndefined({
    schemaVersion: SCHEMA_VERSION,
    eventType: "recurrence_curation",
    id: context.id || randomUUID(),
    createdAt: context.now || new Date().toISOString(),
    action,
    sourceRecurrenceKey,
    targetRecurrenceKey,
    note: note.value,
    context: removeUndefined({
      source: context.source || "agent_vent_curation",
    }),
    privacy: {
      classification: "local-diagnostic-user-data",
      redacted: note.redacted,
      redactionPatterns: [...note.patterns].sort(),
    },
  });
}

export function createRetentionEvent(input, context = {}) {
  const action = String(input?.action || "")
    .trim()
    .toLowerCase();
  if (!RETENTION_EVENT_ACTIONS.includes(action)) {
    throw new Error(
      `invalid agent_vent retention event action: ${input?.action}; expected one of ${RETENTION_EVENT_ACTIONS.join(", ")}`,
    );
  }
  const note = sanitizeOptionalText(input?.note || input?.retentionNote, 1200);
  return removeUndefined({
    schemaVersion: SCHEMA_VERSION,
    eventType: "retention_lifecycle",
    id: context.id || randomUUID(),
    createdAt: context.now || new Date().toISOString(),
    action,
    recurrenceKey: sanitizeDisplayText(input?.recurrenceKey, 200),
    requestedRecurrenceKey: sanitizeDisplayText(input?.requestedRecurrenceKey, 200),
    backupPath: sanitizeDisplayText(input?.backupPath, 1200),
    archivedRecordCount: Number.isFinite(Number(input?.archivedRecordCount))
      ? Number(input.archivedRecordCount)
      : undefined,
    archivedRecordIds: Array.isArray(input?.archivedRecordIds)
      ? input.archivedRecordIds.map((id) => sanitizeDisplayText(id, 120)).filter(Boolean)
      : undefined,
    beforeHash: sanitizeDisplayText(input?.beforeHash, 128),
    afterHash: sanitizeDisplayText(input?.afterHash, 128),
    note: note.value,
    context: removeUndefined({
      source: context.source || "agent_vent_retention",
    }),
    privacy: {
      classification: "local-diagnostic-user-data",
      redacted: note.redacted,
      redactionPatterns: [...note.patterns].sort(),
    },
  });
}

export function ensureStore(filePath) {
  fs.mkdirSync(path.dirname(filePath), { recursive: true, mode: 0o700 });
  const existing = safeLstat(filePath);
  if (existing) {
    assertSafeJsonlFile(filePath, existing);
    return;
  }

  const fd = fs.openSync(filePath, createFileFlags(), 0o600);
  fs.closeSync(fd);
}

export function appendVentRecord(filePath, record) {
  appendJsonlRecord(filePath, record);
}

export function appendReviewEvent(filePath, event) {
  appendJsonlRecord(filePath, event);
}

export function appendCurationEvent(filePath, event) {
  appendJsonlRecord(filePath, event);
}

export function appendRetentionEvent(filePath, event) {
  appendJsonlRecord(filePath, event);
}

export function readVentRecords(filePath) {
  const { values, malformedLines, oversizedLines } = readJsonlRecords(filePath);
  const { records, invalidRecords } = sanitizeVentRecords(values);
  return { records, malformedLines, oversizedLines, invalidRecords };
}

export function readReviewEvents(filePath) {
  const { values, malformedLines, oversizedLines } = readJsonlRecords(filePath);
  const { events, invalidEvents } = sanitizeReviewEvents(values);
  return {
    events,
    malformedLines,
    oversizedLines,
    invalidEvents,
  };
}

export function readCurationEvents(filePath) {
  const { values, malformedLines, oversizedLines } = readJsonlRecords(filePath);
  const { events, invalidEvents, quarantinedEvents } = sanitizeCurationEvents(values);
  return {
    events,
    malformedLines,
    oversizedLines,
    invalidEvents,
    quarantinedEvents,
  };
}

export function readRetentionEvents(filePath) {
  const { values, malformedLines, oversizedLines } = readJsonlRecords(filePath);
  const { events, invalidEvents } = sanitizeRetentionEvents(values);
  return {
    events,
    malformedLines,
    oversizedLines,
    invalidEvents,
  };
}

export function loadDiagnosticState(options = {}) {
  const storePath = options.storePath || defaultStorePath();
  const reviewPath = options.reviewPath || defaultReviewPath();
  const curationPath = options.curationPath || defaultCurationPath();
  const retentionPath = options.retentionPath || defaultRetentionPath();
  const backupDir = options.backupDir || defaultBackupDir();
  const vents = readVentRecords(storePath);
  const reviews = readReviewEvents(reviewPath);
  const curations = readCurationEvents(curationPath);
  const retentions = readRetentionEvents(retentionPath);
  return {
    storePath,
    reviewPath,
    curationPath,
    retentionPath,
    backupDir,
    records: vents.records,
    reviewEvents: reviews.events,
    curationEvents: curations.events,
    retentionEvents: retentions.events,
    malformedLines: vents.malformedLines,
    malformedReviewLines: reviews.malformedLines,
    malformedCurationLines: curations.malformedLines,
    malformedRetentionLines: retentions.malformedLines,
    oversizedLines: vents.oversizedLines,
    oversizedReviewLines: reviews.oversizedLines,
    oversizedCurationLines: curations.oversizedLines,
    oversizedRetentionLines: retentions.oversizedLines,
    invalidRecords: vents.invalidRecords,
    invalidReviewEvents: reviews.invalidEvents,
    invalidCurationEvents: curations.invalidEvents,
    invalidRetentionEvents: retentions.invalidEvents,
    quarantinedCurationEvents: curations.quarantinedEvents,
  };
}

export function summarizeRecords(records, options = {}) {
  const groupSummaries = buildGroupSummaries(records, options.curationEvents);
  return {
    totalRecords: records.length,
    groupCount: groupSummaries.length,
    candidateIncidentCount: groupSummaries.filter((group) => group.candidateIncident).length,
    groups: groupSummaries.slice(0, clampLimit(options.limit, 20)),
  };
}

export function hasRecurrenceGroup(records, recurrenceKey, curationEvents = []) {
  return buildGroupSummaries(records, curationEvents).some(
    (group) => group.recurrenceKey === recurrenceKey,
  );
}

export function latestReviewStates(reviewEvents, curationEvents = []) {
  const states = new Map();
  const curationMap = buildCurationMap(curationEvents);
  for (const event of reviewEvents) {
    if (!event?.recurrenceKey || !REVIEW_STATES.includes(event.state)) continue;
    states.set(resolveRecurrenceKey(String(event.recurrenceKey), curationMap), event);
  }
  return states;
}

export function summarizeReviewQueue(records, reviewEvents, options = {}) {
  const stateFilter =
    options.state === "all" ? "all" : options.state && normalizeReviewState(options.state);
  const allItems = buildReviewQueueItems(records, reviewEvents, options.curationEvents);
  const items = allItems.filter((item) => {
    if (stateFilter === "all") return true;
    if (stateFilter) return item.reviewState === stateFilter;
    return item.reviewState !== "dismissed";
  });

  return {
    totalRecords: records.length,
    groupCount: allItems.length,
    reviewEventCount: reviewEvents.length,
    queueCount: items.length,
    stateFilter: stateFilter || "active",
    items: items.slice(0, clampLimit(options.limit, 20)),
  };
}

export function buildLifecycleSnapshot(input = {}) {
  const records = input.records || [];
  const reviewEvents = input.reviewEvents || [];
  const curationEvents = input.curationEvents || [];
  const retentionEvents = input.retentionEvents || [];
  const storePath = input.storePath || defaultStorePath();
  const reviewPath = input.reviewPath || defaultReviewPath();
  const curationPath = input.curationPath || defaultCurationPath();
  const retentionPath = input.retentionPath || defaultRetentionPath();
  const backupDir = input.backupDir || defaultBackupDir();
  const allReviewItems = buildReviewQueueItems(records, reviewEvents, curationEvents);
  const reviewStateCounts = Object.fromEntries(REVIEW_STATES.map((state) => [state, 0]));
  for (const item of allReviewItems) {
    reviewStateCounts[item.reviewState] += 1;
  }

  return {
    generatedAt: input.now || new Date().toISOString(),
    classification: "local-diagnostic-user-data",
    boundary:
      "Local diagnostic projection only; no AK task, GitHub issue, incident, evidence, telemetry, or ASC/self state was created.",
    paths: {
      vents: storePath,
      reviewEvents: reviewPath,
      curationEvents: curationPath,
      retentionEvents: retentionPath,
      backups: backupDir,
    },
    files: {
      vents: jsonlFileInfo(storePath),
      reviewEvents: jsonlFileInfo(reviewPath),
      curationEvents: jsonlFileInfo(curationPath),
      retentionEvents: jsonlFileInfo(retentionPath),
    },
    malformedLines: {
      vents: input.malformedLines || 0,
      reviewEvents: input.malformedReviewLines || 0,
      curationEvents: input.malformedCurationLines || 0,
      retentionEvents: input.malformedRetentionLines || 0,
    },
    oversizedLines: {
      vents: input.oversizedLines || 0,
      reviewEvents: input.oversizedReviewLines || 0,
      curationEvents: input.oversizedCurationLines || 0,
      retentionEvents: input.oversizedRetentionLines || 0,
    },
    invalidEntries: {
      vents: input.invalidRecords || 0,
      reviewEvents: input.invalidReviewEvents || 0,
      curationEvents: input.invalidCurationEvents || 0,
      retentionEvents: input.invalidRetentionEvents || 0,
      quarantinedCurationEvents: input.quarantinedCurationEvents || 0,
    },
    counts: {
      vents: records.length,
      recurrenceGroups: allReviewItems.length,
      reviewEvents: reviewEvents.length,
      curationEvents: curationEvents.length,
      retentionEvents: retentionEvents.length,
      candidateIncidents: allReviewItems.filter((item) => item.candidateIncident).length,
      reviewStates: reviewStateCounts,
    },
    summary: summarizeRecords(records, {
      limit: clampLimit(input.limit, 20),
      curationEvents,
    }),
    reviewQueue: summarizeReviewQueue(records, reviewEvents, {
      state: input.state || "all",
      limit: clampLimit(input.limit, 20),
      curationEvents,
    }),
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
    const marker = group.candidateIncident ? "candidate incident for human review" : "watch";
    lines.push(
      `- ${group.recurrenceKey} — ${group.count}x, max=${group.maxSeverity}, ${marker}; latest: ${group.latestSummary}`,
    );
  }
  return lines.join("\n");
}

export function formatReviewQueue(queue) {
  if (queue.totalRecords === 0) {
    return "No agent vent records found yet. Record minimized vents before reviewing recurrence groups.";
  }
  if (queue.queueCount === 0) {
    return [
      `Agent vent review queue: no ${queue.stateFilter} recurrence group(s) to show.`,
      "Boundary: local review state only; no AK task, GitHub issue, incident, evidence, telemetry, or ASC/self state was created.",
    ].join("\n");
  }

  const lines = [
    `Agent vent review queue: ${queue.items.length} of ${queue.queueCount} ${queue.stateFilter} recurrence group(s) shown (${queue.groupCount} total group(s)).`,
    "States: new -> acknowledged | dismissed | escalation_drafted. Review state is local diagnostic state only.",
    "Boundary: no AK task, GitHub issue, incident, evidence, telemetry, or ASC/self state was created.",
  ];
  for (const item of queue.items) {
    const marker = item.candidateIncident ? "candidate incident for human review" : "watch";
    lines.push(
      `- [${item.reviewState}] ${item.recurrenceKey} — ${item.count}x, max=${item.maxSeverity}, ${marker}; latest: ${item.latestSummary}`,
    );
    if (item.reviewNote) lines.push(`  review note: ${item.reviewNote}`);
    lines.push(
      `  next: /agent_vent review set acknowledged ${item.recurrenceKey} [note] | dismissed | escalation_drafted`,
    );
  }
  return lines.join("\n");
}

export function formatRecent(records, limit = DEFAULT_LIMIT) {
  const recent = records.slice(-clampLimit(limit)).reverse();
  if (recent.length === 0) return "No agent vent records found yet.";
  return recent.map(formatRecord).join("\n");
}

export function formatPath(
  storePath = defaultStorePath(),
  reviewPath = defaultReviewPath(),
  curationPath = defaultCurationPath(),
  retentionPath = defaultRetentionPath(),
  backupDir = defaultBackupDir(),
) {
  return [
    `Agent vent store: ${storePath}`,
    `Agent vent review events: ${reviewPath}`,
    `Agent vent curation events: ${curationPath}`,
    `Agent vent retention events: ${retentionPath}`,
    `Agent vent retention backups: ${backupDir}`,
    "Schema: append-only JSONL events plus confirmation-gated local retention backup artifacts.",
    "Override: set PI_AGENT_VENT_DIR to use a different private directory.",
    "Authority boundary: records, review states, and curation projections are local diagnostics, not tasks, issues, incidents, evidence, telemetry, or ASC/self state; retention receipts and backups are local diagnostics too.",
  ].join("\n");
}

export function formatLifecycleStats(snapshot) {
  return [
    "Agent vent lifecycle stats:",
    `- vents: ${snapshot.counts.vents} record(s), ${snapshot.files.vents.sizeBytes} byte(s), exists=${snapshot.files.vents.exists}`,
    `- recurrence groups: ${snapshot.counts.recurrenceGroups}; candidate incidents for human review: ${snapshot.counts.candidateIncidents}`,
    `- review events: ${snapshot.counts.reviewEvents} event(s), ${snapshot.files.reviewEvents.sizeBytes} byte(s), exists=${snapshot.files.reviewEvents.exists}`,
    `- curation events: ${snapshot.counts.curationEvents} event(s), ${snapshot.files.curationEvents.sizeBytes} byte(s), exists=${snapshot.files.curationEvents.exists}`,
    `- retention events: ${snapshot.counts.retentionEvents} event(s), ${snapshot.files.retentionEvents.sizeBytes} byte(s), exists=${snapshot.files.retentionEvents.exists}`,
    `- review states: new=${snapshot.counts.reviewStates.new}, acknowledged=${snapshot.counts.reviewStates.acknowledged}, dismissed=${snapshot.counts.reviewStates.dismissed}, escalation_drafted=${snapshot.counts.reviewStates.escalation_drafted}`,
    `- malformed lines: vents=${snapshot.malformedLines.vents}, reviewEvents=${snapshot.malformedLines.reviewEvents}, curationEvents=${snapshot.malformedLines.curationEvents}, retentionEvents=${snapshot.malformedLines.retentionEvents}`,
    `- oversized lines: vents=${snapshot.oversizedLines.vents}, reviewEvents=${snapshot.oversizedLines.reviewEvents}, curationEvents=${snapshot.oversizedLines.curationEvents}, retentionEvents=${snapshot.oversizedLines.retentionEvents}`,
    `- invalid/quarantined entries: vents=${snapshot.invalidEntries.vents}, reviewEvents=${snapshot.invalidEntries.reviewEvents}, curationEvents=${snapshot.invalidEntries.curationEvents}, retentionEvents=${snapshot.invalidEntries.retentionEvents}, quarantinedCurationEvents=${snapshot.invalidEntries.quarantinedCurationEvents}`,
    `- paths: ${snapshot.paths.vents}; ${snapshot.paths.reviewEvents}; ${snapshot.paths.curationEvents}`,
    `Boundary: ${snapshot.boundary}`,
  ].join("\n");
}

export function formatExportMarkdown(snapshot) {
  const lines = [
    "# Agent vent local diagnostic export",
    "",
    `Generated: ${snapshot.generatedAt}`,
    `Classification: ${snapshot.classification}`,
    `Boundary: ${snapshot.boundary}`,
    "",
    "## Stats",
    "",
    `- Vent records: ${snapshot.counts.vents}`,
    `- Recurrence groups: ${snapshot.counts.recurrenceGroups}`,
    `- Candidate incidents for human review: ${snapshot.counts.candidateIncidents}`,
    `- Review events: ${snapshot.counts.reviewEvents}`,
    `- Curation events: ${snapshot.counts.curationEvents}`,
    `- Retention events: ${snapshot.counts.retentionEvents}`,
    `- Review states: ${JSON.stringify(snapshot.counts.reviewStates)}`,
    `- Malformed lines: vents=${snapshot.malformedLines.vents}, reviewEvents=${snapshot.malformedLines.reviewEvents}, curationEvents=${snapshot.malformedLines.curationEvents}, retentionEvents=${snapshot.malformedLines.retentionEvents}`,
    `- Oversized lines: vents=${snapshot.oversizedLines.vents}, reviewEvents=${snapshot.oversizedLines.reviewEvents}, curationEvents=${snapshot.oversizedLines.curationEvents}, retentionEvents=${snapshot.oversizedLines.retentionEvents}`,
    `- Invalid/quarantined entries: vents=${snapshot.invalidEntries.vents}, reviewEvents=${snapshot.invalidEntries.reviewEvents}, curationEvents=${snapshot.invalidEntries.curationEvents}, retentionEvents=${snapshot.invalidEntries.retentionEvents}, quarantinedCurationEvents=${snapshot.invalidEntries.quarantinedCurationEvents}`,
    "",
    "## Review queue",
    "",
  ];

  for (const item of snapshot.reviewQueue.items) {
    lines.push(
      `- [${item.reviewState}] ${item.recurrenceKey} — ${item.count}x, max=${item.maxSeverity}; latest: ${item.latestSummary}`,
    );
    if (item.reviewNote) lines.push(`  - Review note: ${item.reviewNote}`);
  }
  if (snapshot.reviewQueue.items.length === 0)
    lines.push("No recurrence groups in this export filter.");
  return lines.join("\n");
}

export function formatExportJson(snapshot) {
  return JSON.stringify(snapshot, null, 2);
}

export function buildRetentionPreview(input = {}) {
  const recurrenceKey = sanitizeDisplayText(input.recurrenceKey, 200);
  if (!recurrenceKey) throw new Error("agent_vent retention preview requires a recurrenceKey");
  const records = input.records || [];
  const reviewEvents = input.reviewEvents || [];
  const curationEvents = input.curationEvents || [];
  const plan = planRetentionArchive({ records, reviewEvents, curationEvents, recurrenceKey });
  return {
    generatedAt: input.now || new Date().toISOString(),
    classification: "local-diagnostic-user-data",
    boundary:
      "Local diagnostic retention preview only. No archive, restore, AK task, GitHub issue, incident, evidence, telemetry, or ASC/self state mutation occurred.",
    ...plan,
    samples: plan.records.slice(0, clampLimit(input.limit, 5)).map((record) => ({
      id: record.id,
      createdAt: record.createdAt,
      severity: normalizeSeverity(record.severity),
      category: normalizeCategory(record.category),
      summary: sanitizeDisplayText(record.summary, 300),
    })),
  };
}

export function archiveRecurrenceGroup(input = {}) {
  const storePath = input.storePath || defaultStorePath();
  const reviewPath = input.reviewPath || defaultReviewPath();
  const curationPath = input.curationPath || defaultCurationPath();
  const retentionPath = input.retentionPath || defaultRetentionPath();
  const backupDir = input.backupDir || defaultBackupDir();
  const confirmationToken = sanitizeDisplayText(input.confirmationToken, 300);
  const state = loadDiagnosticState({
    storePath,
    reviewPath,
    curationPath,
    retentionPath,
    backupDir,
  });
  const plan = planRetentionArchive({
    records: state.records,
    reviewEvents: state.reviewEvents,
    curationEvents: state.curationEvents,
    recurrenceKey: input.recurrenceKey,
  });
  if (!plan.archivable) {
    throw new Error(
      `cannot archive recurrence group ${plan.recurrenceKey} before local review; set review state to acknowledged, dismissed, or escalation_drafted first`,
    );
  }
  if (confirmationToken !== plan.confirmationToken) {
    throw new Error(
      `agent_vent retention archive requires exact confirmation token: ${plan.confirmationToken}`,
    );
  }

  const existing = safeLstat(storePath);
  if (!existing) throw new Error(`cannot archive from missing agent_vent store: ${storePath}`);
  assertSafeJsonlFile(storePath, existing);
  if (existing.size > MAX_JSONL_FILE_BYTES) {
    throw new Error(
      `agent_vent store file is too large: ${storePath} (${existing.size} bytes > ${MAX_JSONL_FILE_BYTES})`,
    );
  }
  const beforeText = fs.readFileSync(storePath, "utf8");
  const beforeHash = sha256Hex(beforeText);
  const archiveIds = new Set(plan.records.map((record) => record.id));
  const remainingRecords = state.records.filter((record) => !archiveIds.has(record.id));
  const afterText = recordsToJsonl(remainingRecords);
  const afterHash = sha256Hex(afterText);
  const now = input.now || new Date().toISOString();
  const backupPath = writeRetentionBackup({
    backupDir,
    now,
    recurrenceKey: plan.recurrenceKey,
    requestedRecurrenceKey: plan.requestedRecurrenceKey,
    confirmationToken: plan.confirmationToken,
    restoreConfirmationToken: buildRestoreToken(plan.recurrenceKey, beforeHash, afterHash),
    beforeHash,
    afterHash,
    archivedRecordIds: plan.archivedRecordIds,
    archivedRecordCount: plan.archivedRecordCount,
    ventsJsonl: beforeText,
  });

  writeTextFileAtomically(storePath, afterText, 0o600);
  const event = createRetentionEvent(
    {
      action: "archive",
      recurrenceKey: plan.recurrenceKey,
      requestedRecurrenceKey: plan.requestedRecurrenceKey,
      backupPath,
      archivedRecordCount: plan.archivedRecordCount,
      archivedRecordIds: plan.archivedRecordIds,
      beforeHash,
      afterHash,
      note: input.note || input.retentionNote,
    },
    { source: input.source || "agent_vent_retention", now },
  );
  appendRetentionEvent(retentionPath, event);
  return {
    generatedAt: now,
    classification: "local-diagnostic-user-data",
    boundary:
      "Local diagnostic records were archived from the active vents store only. No AK task, GitHub issue, incident, evidence, telemetry, publication, or ASC/self state mutation occurred.",
    ...plan,
    backupPath,
    retentionPath,
    beforeHash,
    afterHash,
    restoreConfirmationToken: buildRestoreToken(plan.recurrenceKey, beforeHash, afterHash),
    retentionEvent: event,
  };
}

export function restoreRetentionBackup(input = {}) {
  const storePath = input.storePath || defaultStorePath();
  const retentionPath = input.retentionPath || defaultRetentionPath();
  const backupDir = input.backupDir || defaultBackupDir();
  const confirmationToken = sanitizeDisplayText(input.confirmationToken, 300);
  const backupPath = assertBackupPathInsideDir(input.backupPath, backupDir);
  const backup = readRetentionBackup(backupPath);
  if (confirmationToken !== backup.restoreConfirmationToken) {
    throw new Error(
      `agent_vent retention restore requires exact confirmation token: ${backup.restoreConfirmationToken}`,
    );
  }

  const existing = safeLstat(storePath);
  if (!existing)
    throw new Error(`agent_vent retention restore requires current vents store: ${storePath}`);
  assertSafeJsonlFile(storePath, existing);
  const currentText = fs.readFileSync(storePath, "utf8");
  const currentHash = sha256Hex(currentText);
  if (currentHash !== backup.afterHash) {
    throw new Error(
      "agent_vent retention restore refused stale backup: current vents store no longer matches the archived-after hash",
    );
  }

  writeTextFileAtomically(storePath, backup.ventsJsonl, 0o600);
  const now = input.now || new Date().toISOString();
  const event = createRetentionEvent(
    {
      action: "restore",
      recurrenceKey: backup.recurrenceKey,
      requestedRecurrenceKey: backup.requestedRecurrenceKey,
      backupPath,
      archivedRecordCount: backup.archivedRecordCount,
      archivedRecordIds: backup.archivedRecordIds,
      beforeHash: backup.afterHash,
      afterHash: backup.beforeHash,
      note: input.note || input.retentionNote,
    },
    { source: input.source || "agent_vent_retention", now },
  );
  appendRetentionEvent(retentionPath, event);
  return {
    generatedAt: now,
    classification: "local-diagnostic-user-data",
    boundary:
      "Local diagnostic backup was restored to the active vents store only. No AK task, GitHub issue, incident, evidence, telemetry, publication, or ASC/self state mutation occurred.",
    recurrenceKey: backup.recurrenceKey,
    requestedRecurrenceKey: backup.requestedRecurrenceKey,
    restoredRecordCount: backup.archivedRecordCount,
    backupPath,
    retentionPath,
    beforeHash: backup.afterHash,
    afterHash: backup.beforeHash,
    retentionEvent: event,
  };
}

export function formatRetentionPreview(preview) {
  const lines = [
    `Agent vent retention preview for ${preview.recurrenceKey}: ${preview.archivedRecordCount} active local diagnostic record(s).`,
    `Review state: ${preview.reviewState}; archivable=${preview.archivable}`,
    `Boundary: ${preview.boundary}`,
  ];
  if (preview.archivable) {
    lines.push(
      `Confirmation token: ${preview.confirmationToken}`,
      `Next: /agent_vent retention archive ${preview.recurrenceKey} ${preview.confirmationToken} [note]`,
    );
  } else {
    lines.push(
      `Next: /agent_vent review set acknowledged ${preview.recurrenceKey} [note] before archiving.`,
    );
  }
  for (const sample of preview.samples || []) {
    lines.push(`- ${sample.id || "unknown-id"}: ${sample.summary || "(no summary)"}`);
  }
  return lines.join("\n");
}

export function formatRetentionArchiveResult(result) {
  return [
    `Archived ${result.archivedRecordCount} local diagnostic record(s) from ${result.recurrenceKey}.`,
    `Backup: ${result.backupPath}`,
    `Restore token: ${result.restoreConfirmationToken}`,
    `Next rollback: /agent_vent retention restore ${result.backupPath} ${result.restoreConfirmationToken}`,
    `Boundary: ${result.boundary}`,
  ].join("\n");
}

export function formatRetentionRestoreResult(result) {
  return [
    `Restored local diagnostic backup for ${result.recurrenceKey}; restored ${result.restoredRecordCount} archived record(s).`,
    `Backup: ${result.backupPath}`,
    `Boundary: ${result.boundary}`,
  ].join("\n");
}

export function buildEscalationDraft(input = {}) {
  const target = normalizeDraftTarget(input.target || input.draftTarget);
  const recurrenceKey = sanitizeDisplayText(input.recurrenceKey, 200);
  if (!recurrenceKey) throw new Error("agent_vent draft requires a recurrenceKey");

  const records = input.records || [];
  const reviewEvents = input.reviewEvents || [];
  const curationEvents = input.curationEvents || [];
  const curationMap = buildCurationMap(curationEvents);
  const resolvedKey = resolveRecurrenceKey(recurrenceKey, curationMap);
  const allGroups = buildReviewQueueItems(records, reviewEvents, curationEvents);
  const group = allGroups.find((item) => item.recurrenceKey === resolvedKey);
  if (!group)
    throw new Error(`cannot draft escalation for unknown recurrence group: ${recurrenceKey}`);

  const samples = records
    .filter(
      (record) =>
        resolveRecurrenceKey(
          String(record.recurrenceKey || buildRecurrenceKey(record)),
          curationMap,
        ) === resolvedKey,
    )
    .slice(-clampLimit(input.limit, 5))
    .reverse()
    .map((record) => ({
      id: record.id,
      createdAt: record.createdAt,
      severity: normalizeSeverity(record.severity),
      category: normalizeCategory(record.category),
      summary: sanitizeDisplayText(record.summary, 300),
      evidence: sanitizeDisplayText(record.evidence, 500),
      reproduction: sanitizeDisplayText(record.reproduction, 500),
    }));

  const draft = {
    generatedAt: input.now || new Date().toISOString(),
    target,
    recurrenceKey: resolvedKey,
    requestedRecurrenceKey: recurrenceKey,
    classification: "local-diagnostic-user-data",
    boundary:
      "Draft-only local diagnostic projection. No AK task, GitHub issue, incident, evidence, telemetry, publication, or ASC/self state mutation occurred.",
    group,
    samples,
  };
  return { ...draft, text: formatEscalationDraftText(draft) };
}

export function formatEscalationDraftText(draft) {
  const targetLabel = {
    github_issue: "GitHub issue",
    ak_task: "AK task",
    incident_review: "incident review",
    maintainer_note: "maintainer note",
  }[draft.target];
  const lines = [
    `# Draft-only ${targetLabel} text`,
    "",
    `Boundary: ${draft.boundary}`,
    "Next action: a human may copy/edit this text into the owner system after review.",
    `Optional local follow-up: /agent_vent review set escalation_drafted ${draft.recurrenceKey}`,
    "",
    `Title: Investigate recurring agent friction: ${draft.recurrenceKey}`,
    "",
    "## Local recurrence summary",
    "",
    `- Recurrence key: ${draft.recurrenceKey}`,
    `- Count: ${draft.group.count}`,
    `- Max severity: ${draft.group.maxSeverity}`,
    `- Candidate incident for human review: ${draft.group.candidateIncident ? "yes" : "no"}`,
    `- Review state: ${draft.group.reviewState}`,
  ];
  if (draft.group.reviewNote) lines.push(`- Local review note: ${draft.group.reviewNote}`);
  lines.push("", "## Representative local samples", "");
  for (const sample of draft.samples) {
    lines.push(
      `- ${sample.createdAt || "unknown-time"} [${sample.severity}/${sample.category}] ${sample.summary}`,
    );
    if (sample.evidence) lines.push(`  - Evidence: ${sample.evidence}`);
    if (sample.reproduction) lines.push(`  - Reproduction: ${sample.reproduction}`);
  }
  if (draft.samples.length === 0) lines.push("No sample vents available.");
  lines.push(
    "",
    "## Owner-system handoff reminder",
    "",
    "This text is only a local draft. The target owner system remains authoritative for acceptance, schema, lifecycle, evidence, and publication.",
  );
  return lines.join("\n");
}

function sanitizeDisplayText(value, maxLength) {
  const compact = compactText(value, maxLength);
  if (compact === undefined) return undefined;
  return redactSensitiveText(compact).text;
}

function sanitizeVentRecords(values) {
  const records = [];
  let invalidRecords = 0;
  for (const value of values) {
    try {
      const summary = sanitizeDisplayText(value?.summary, 600);
      if (!summary) throw new Error("missing summary");
      const category = normalizeCategory(value?.category);
      const record = removeUndefined({
        ...value,
        schemaVersion: Number(value?.schemaVersion) || SCHEMA_VERSION,
        id: compactText(value?.id, 120) || randomUUID(),
        createdAt: compactText(value?.createdAt, 80),
        category,
        severity: normalizeSeverity(value?.severity),
        recurrenceKey:
          sanitizeDisplayText(value?.recurrenceKey, 200) ||
          buildRecurrenceKey({ ...value, category, summary }),
        summary,
        frustration: sanitizeDisplayText(value?.frustration, 1200),
        evidence: sanitizeDisplayText(value?.evidence, 1600),
        expected: sanitizeDisplayText(value?.expected, 800),
        actual: sanitizeDisplayText(value?.actual, 800),
        reproduction: sanitizeDisplayText(value?.reproduction, 1200),
        tags: Array.isArray(value?.tags)
          ? value.tags
              .map((tag) => recurrenceSlug(tag))
              .filter((tag) => tag !== "unspecified")
              .slice(0, 12)
          : [],
      });
      records.push(record);
    } catch {
      invalidRecords += 1;
    }
  }
  return { records, invalidRecords };
}

function sanitizeReviewEvents(values) {
  const events = [];
  let invalidEvents = 0;
  for (const value of values) {
    try {
      if (value?.eventType !== "review_state") continue;
      const recurrenceKey = sanitizeDisplayText(value?.recurrenceKey, 200);
      if (!recurrenceKey) throw new Error("missing recurrence key");
      events.push(
        removeUndefined({
          ...value,
          schemaVersion: Number(value?.schemaVersion) || SCHEMA_VERSION,
          eventType: "review_state",
          id: compactText(value?.id, 120) || randomUUID(),
          createdAt: compactText(value?.createdAt, 80),
          recurrenceKey,
          state: normalizeReviewState(value?.state),
          note: sanitizeDisplayText(value?.note, 1200),
        }),
      );
    } catch {
      invalidEvents += 1;
    }
  }
  return { events, invalidEvents };
}

function sanitizeCurationEvents(values) {
  const events = [];
  let invalidEvents = 0;
  let quarantinedEvents = 0;
  for (const value of values) {
    try {
      if (value?.eventType !== "recurrence_curation") continue;
      const action = normalizeCurationAction(value?.action);
      const sourceRecurrenceKey = sanitizeDisplayText(value?.sourceRecurrenceKey, 200);
      const targetRecurrenceKey = sanitizeDisplayText(value?.targetRecurrenceKey, 200);
      if (!sourceRecurrenceKey || (action !== "remove" && !targetRecurrenceKey)) {
        throw new Error("missing recurrence key");
      }
      if (targetRecurrenceKey && sourceRecurrenceKey === targetRecurrenceKey) {
        throw new Error("self alias");
      }
      const candidate = removeUndefined({
        ...value,
        schemaVersion: Number(value?.schemaVersion) || SCHEMA_VERSION,
        eventType: "recurrence_curation",
        id: compactText(value?.id, 120) || randomUUID(),
        createdAt: compactText(value?.createdAt, 80),
        action,
        sourceRecurrenceKey,
        targetRecurrenceKey,
        note: sanitizeDisplayText(value?.note, 1200),
      });
      buildCurationMap([...events, candidate]);
      events.push(candidate);
    } catch (error) {
      if (String(error?.message || "").includes("curation cycle")) quarantinedEvents += 1;
      else invalidEvents += 1;
    }
  }
  return { events, invalidEvents, quarantinedEvents };
}

function sanitizeRetentionEvents(values) {
  const events = [];
  let invalidEvents = 0;
  for (const value of values) {
    try {
      if (value?.eventType !== "retention_lifecycle") continue;
      const action = String(value?.action || "")
        .trim()
        .toLowerCase();
      if (!RETENTION_EVENT_ACTIONS.includes(action)) throw new Error("invalid action");
      events.push(
        removeUndefined({
          ...value,
          schemaVersion: Number(value?.schemaVersion) || SCHEMA_VERSION,
          eventType: "retention_lifecycle",
          id: compactText(value?.id, 120) || randomUUID(),
          createdAt: compactText(value?.createdAt, 80),
          action,
          recurrenceKey: sanitizeDisplayText(value?.recurrenceKey, 200),
          requestedRecurrenceKey: sanitizeDisplayText(value?.requestedRecurrenceKey, 200),
          backupPath: sanitizeDisplayText(value?.backupPath, 1200),
          archivedRecordCount: Number.isFinite(Number(value?.archivedRecordCount))
            ? Number(value.archivedRecordCount)
            : undefined,
          archivedRecordIds: Array.isArray(value?.archivedRecordIds)
            ? value.archivedRecordIds.map((id) => sanitizeDisplayText(id, 120)).filter(Boolean)
            : undefined,
          beforeHash: sanitizeDisplayText(value?.beforeHash, 128),
          afterHash: sanitizeDisplayText(value?.afterHash, 128),
          note: sanitizeDisplayText(value?.note, 1200),
        }),
      );
    } catch {
      invalidEvents += 1;
    }
  }
  return { events, invalidEvents };
}

function planRetentionArchive({
  records = [],
  reviewEvents = [],
  curationEvents = [],
  recurrenceKey,
}) {
  const requestedRecurrenceKey = sanitizeDisplayText(recurrenceKey, 200);
  if (!requestedRecurrenceKey) throw new Error("agent_vent retention requires a recurrenceKey");
  const curationMap = buildCurationMap(curationEvents);
  const resolvedKey = resolveRecurrenceKey(requestedRecurrenceKey, curationMap);
  const groupRecords = records.filter(
    (record) =>
      resolveRecurrenceKey(
        String(record.recurrenceKey || buildRecurrenceKey(record)),
        curationMap,
      ) === resolvedKey,
  );
  if (groupRecords.length === 0) {
    throw new Error(`cannot archive unknown recurrence group: ${requestedRecurrenceKey}`);
  }
  const reviewStates = latestReviewStates(reviewEvents, curationEvents);
  const reviewState = reviewStates.get(resolvedKey)?.state || "new";
  const archivedRecordIds = groupRecords
    .map((record) => sanitizeDisplayText(record.id, 120))
    .filter(Boolean);
  const fingerprint = sha256Hex(`${resolvedKey}\n${archivedRecordIds.join("\n")}`);
  return {
    requestedRecurrenceKey,
    recurrenceKey: resolvedKey,
    reviewState,
    archivable: reviewState !== "new",
    archivedRecordCount: groupRecords.length,
    archivedRecordIds,
    confirmationToken: `archive:${fingerprint.slice(0, 16)}`,
    records: groupRecords,
  };
}

function recordsToJsonl(records) {
  return records.map((record) => JSON.stringify(record)).join("\n") + (records.length ? "\n" : "");
}

function writeRetentionBackup(input) {
  ensurePrivateDirectory(input.backupDir);
  const stamp = input.now.replace(/[:.]/g, "-");
  const slug = recurrenceSlug(input.recurrenceKey).slice(0, 60);
  const backupPath = path.join(
    input.backupDir,
    `${stamp}-${slug}-${randomUUID()}.agent-vent-backup.json`,
  );
  const backup = {
    schemaVersion: SCHEMA_VERSION,
    artifactType: "agent_vent_retention_backup",
    createdAt: input.now,
    recurrenceKey: input.recurrenceKey,
    requestedRecurrenceKey: input.requestedRecurrenceKey,
    confirmationToken: input.confirmationToken,
    restoreConfirmationToken: input.restoreConfirmationToken,
    beforeHash: input.beforeHash,
    afterHash: input.afterHash,
    archivedRecordCount: input.archivedRecordCount,
    archivedRecordIds: input.archivedRecordIds,
    classification: "local-diagnostic-user-data",
    boundary:
      "Local diagnostic rollback artifact only; not evidence, task truth, issue truth, incident truth, publication, telemetry, or ASC/self state.",
    ventsJsonl: input.ventsJsonl,
  };
  writeNewFileNoFollow(backupPath, `${JSON.stringify(backup, null, 2)}\n`, 0o600);
  return backupPath;
}

function readRetentionBackup(backupPath) {
  const stat = safeLstat(backupPath);
  if (!stat) throw new Error(`agent_vent retention backup not found: ${backupPath}`);
  assertSafeJsonlFile(backupPath, stat);
  if (stat.size > MAX_JSONL_FILE_BYTES * 2) {
    throw new Error(`agent_vent retention backup is too large: ${backupPath}`);
  }
  const backup = JSON.parse(fs.readFileSync(backupPath, "utf8"));
  if (backup?.artifactType !== "agent_vent_retention_backup") {
    throw new Error("agent_vent retention restore requires a package-created backup artifact");
  }
  for (const field of [
    "recurrenceKey",
    "beforeHash",
    "afterHash",
    "restoreConfirmationToken",
    "ventsJsonl",
  ]) {
    if (!backup[field]) throw new Error(`agent_vent retention backup is missing ${field}`);
  }
  if (sha256Hex(String(backup.ventsJsonl)) !== backup.beforeHash) {
    throw new Error("agent_vent retention backup failed integrity check");
  }
  return backup;
}

function buildRestoreToken(recurrenceKey, beforeHash, afterHash) {
  return `restore:${sha256Hex(`${recurrenceKey}\n${beforeHash}\n${afterHash}`).slice(0, 16)}`;
}

function sha256Hex(value) {
  return createHash("sha256").update(String(value), "utf8").digest("hex");
}

function assertBackupPathInsideDir(backupPath, backupDir) {
  const safeBackupDir = path.resolve(backupDir);
  const resolved = path.resolve(String(backupPath || ""));
  if (!resolved.startsWith(`${safeBackupDir}${path.sep}`)) {
    throw new Error(`agent_vent retention backup path must stay inside ${safeBackupDir}`);
  }
  return resolved;
}

function ensurePrivateDirectory(dirPath) {
  fs.mkdirSync(dirPath, { recursive: true, mode: 0o700 });
  const stat = fs.lstatSync(dirPath);
  if (stat.isSymbolicLink() || !stat.isDirectory()) {
    throw new Error(`agent_vent path must be a real private directory: ${dirPath}`);
  }
}

function writeNewFileNoFollow(filePath, text, mode) {
  const fd = fs.openSync(filePath, createFileFlags(), mode);
  try {
    fs.writeFileSync(fd, text, "utf8");
  } finally {
    fs.closeSync(fd);
  }
}

function writeTextFileAtomically(filePath, text, mode) {
  fs.mkdirSync(path.dirname(filePath), { recursive: true, mode: 0o700 });
  const existing = safeLstat(filePath);
  if (existing) assertSafeJsonlFile(filePath, existing);
  const tempPath = path.join(
    path.dirname(filePath),
    `.${path.basename(filePath)}.${randomUUID()}.tmp`,
  );
  writeNewFileNoFollow(tempPath, text, mode);
  try {
    fs.renameSync(tempPath, filePath);
  } catch (error) {
    fs.rmSync(tempPath, { force: true });
    throw error;
  }
}

export function assertCanCurateRecurrence(records, curationEvents, input) {
  const action = normalizeCurationAction(input?.action || input?.curationAction);
  const sourceRecurrenceKey = sanitizeDisplayText(input?.sourceRecurrenceKey, 200);
  const targetRecurrenceKey = sanitizeDisplayText(input?.targetRecurrenceKey, 200);
  if (!sourceRecurrenceKey || (action !== "remove" && !targetRecurrenceKey)) {
    throw new Error("agent_vent curation requires sourceRecurrenceKey and targetRecurrenceKey");
  }
  if (targetRecurrenceKey && sourceRecurrenceKey === targetRecurrenceKey) {
    throw new Error("agent_vent curation source and target must differ");
  }

  const knownKeys = new Set(
    buildGroupSummaries(records, curationEvents).map((group) => group.recurrenceKey),
  );
  for (const group of buildGroupSummaries(records, [])) knownKeys.add(group.recurrenceKey);
  if (!knownKeys.has(sourceRecurrenceKey)) {
    throw new Error(`cannot curate unknown recurrence group: ${sourceRecurrenceKey}`);
  }
  if (action === "merge" && !knownKeys.has(targetRecurrenceKey)) {
    throw new Error(`cannot merge into unknown recurrence group: ${targetRecurrenceKey}`);
  }

  const nextMap = buildCurationMap(curationEvents);
  if (action === "remove") nextMap.delete(sourceRecurrenceKey);
  else nextMap.set(sourceRecurrenceKey, targetRecurrenceKey);
  assertNoCurationCycles(nextMap);
}

function buildGroupSummaries(records, curationEvents = []) {
  const groups = new Map();
  const curationMap = buildCurationMap(curationEvents);
  for (const record of records) {
    const rawKey = String(record.recurrenceKey || buildRecurrenceKey(record));
    const key = resolveRecurrenceKey(rawKey, curationMap);
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

  return [...groups.values()]
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
}

function buildReviewQueueItems(records, reviewEvents, curationEvents = []) {
  const reviewStates = latestReviewStates(reviewEvents, curationEvents);
  const allGroups = buildGroupSummaries(records, curationEvents);
  return allGroups.map((group) => {
    const latestReview = reviewStates.get(group.recurrenceKey);
    return {
      ...group,
      reviewState: latestReview?.state || "new",
      reviewedAt: latestReview?.createdAt,
      reviewNote: latestReview?.note,
      reviewEventId: latestReview?.id,
    };
  });
}

function buildCurationMap(curationEvents = []) {
  const aliases = new Map();
  for (const event of curationEvents) {
    if (
      event?.eventType !== "recurrence_curation" ||
      !CURATION_ACTIONS.includes(event.action) ||
      !event.sourceRecurrenceKey ||
      (event.action !== "remove" && !event.targetRecurrenceKey) ||
      (event.targetRecurrenceKey && event.sourceRecurrenceKey === event.targetRecurrenceKey)
    ) {
      continue;
    }
    if (event.action === "remove") aliases.delete(String(event.sourceRecurrenceKey));
    else aliases.set(String(event.sourceRecurrenceKey), String(event.targetRecurrenceKey));
  }
  assertNoCurationCycles(aliases);
  return aliases;
}

function resolveRecurrenceKey(recurrenceKey, aliases) {
  let current = recurrenceKey;
  const seen = new Set();
  while (aliases.has(current)) {
    if (seen.has(current)) throw new Error(`agent_vent curation cycle detected at ${current}`);
    seen.add(current);
    current = aliases.get(current);
  }
  return current;
}

function assertNoCurationCycles(aliases) {
  for (const key of aliases.keys()) resolveRecurrenceKey(key, aliases);
}

function jsonlFileInfo(filePath) {
  const stat = safeLstat(filePath);
  if (!stat) return { path: filePath, exists: false, sizeBytes: 0 };
  assertSafeJsonlFile(filePath, stat);
  return {
    path: filePath,
    exists: true,
    sizeBytes: stat.size,
    modifiedAt: stat.mtime.toISOString(),
  };
}

function appendJsonlRecord(filePath, record) {
  ensureStore(filePath);
  const fd = fs.openSync(filePath, appendFileFlags(), 0o600);
  try {
    fs.writeSync(fd, `${JSON.stringify(record)}\n`, undefined, "utf8");
  } finally {
    fs.closeSync(fd);
  }
}

function readJsonlRecords(filePath) {
  const existing = safeLstat(filePath);
  if (!existing) return { values: [], malformedLines: 0, oversizedLines: 0 };
  assertSafeJsonlFile(filePath, existing);
  if (existing.size > MAX_JSONL_FILE_BYTES) {
    throw new Error(
      `agent_vent store file is too large: ${filePath} (${existing.size} bytes > ${MAX_JSONL_FILE_BYTES})`,
    );
  }

  const fd = fs.openSync(filePath, readFileFlags());
  let text;
  try {
    text = fs.readFileSync(fd, "utf8");
  } finally {
    fs.closeSync(fd);
  }

  const values = [];
  let malformedLines = 0;
  let oversizedLines = 0;
  for (const line of text.split(/\r?\n/)) {
    if (!line.trim()) continue;
    if (Buffer.byteLength(line, "utf8") > MAX_JSONL_LINE_BYTES) {
      oversizedLines += 1;
      continue;
    }
    try {
      const value = JSON.parse(line);
      if (value && typeof value === "object") {
        values.push(value);
      }
    } catch {
      malformedLines += 1;
    }
  }
  return { values, malformedLines, oversizedLines };
}

function safeLstat(filePath) {
  try {
    return fs.lstatSync(filePath);
  } catch (error) {
    if (error?.code === "ENOENT") return undefined;
    throw error;
  }
}

function assertSafeJsonlFile(filePath, stat) {
  if (stat.isSymbolicLink()) {
    throw new Error(`agent_vent store file must not be a symlink: ${filePath}`);
  }
  if (!stat.isFile()) {
    throw new Error(`agent_vent store path must be a regular file: ${filePath}`);
  }
}

function createFileFlags() {
  return fs.constants.O_CREAT | fs.constants.O_EXCL | fs.constants.O_WRONLY | noFollowFlag();
}

function appendFileFlags() {
  return fs.constants.O_APPEND | fs.constants.O_CREAT | fs.constants.O_WRONLY | noFollowFlag();
}

function readFileFlags() {
  return fs.constants.O_RDONLY | noFollowFlag();
}

function noFollowFlag() {
  return fs.constants.O_NOFOLLOW || 0;
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

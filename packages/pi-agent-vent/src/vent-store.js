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
export const RETENTION_ACTIONS = ["preview", "archive", "restore", "candidates", "history"];
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

function sanitizeFacetText(value, maxLength = 160) {
  const sanitized = sanitizeOptionalText(value, maxLength);
  if (sanitized.value === undefined) return sanitized;
  const normalized = recurrenceSlug(sanitized.value);
  return {
    value: normalized === "unspecified" ? undefined : normalized,
    redacted: sanitized.redacted,
    patterns: sanitized.patterns,
  };
}

function sanitizeTagList(value) {
  if (!Array.isArray(value)) return { values: [], redacted: false, patterns: [] };
  const patterns = new Set();
  let redacted = false;
  const values = [];
  for (const tag of value) {
    const sanitized = sanitizeFacetText(tag, 120);
    redacted = redacted || sanitized.redacted;
    for (const pattern of sanitized.patterns) patterns.add(pattern);
    if (sanitized.value) values.push(sanitized.value);
    if (values.length >= 12) break;
  }
  return { values, redacted, patterns: [...patterns].sort() };
}

function collectRedactionMetadata(fields) {
  const redactionPatterns = new Set();
  let redacted = false;
  for (const field of fields) {
    redacted = redacted || Boolean(field?.redacted);
    for (const pattern of field?.patterns || []) redactionPatterns.add(pattern);
  }
  return { redacted, redactionPatterns: [...redactionPatterns].sort() };
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
  const localFacets = {
    tool: sanitizeFacetText(input?.tool || input?.toolName, 160),
    packageName: sanitizeFacetText(input?.packageName, 200),
  };
  const tags = sanitizeTagList(input?.tags);
  const privacy = collectRedactionMetadata([
    summary,
    ...Object.values(optionalFields),
    ...Object.values(localFacets),
    tags,
  ]);

  const category = normalizeCategory(input?.category);
  const severity = normalizeSeverity(input?.severity);

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
    tool: localFacets.tool.value,
    packageName: localFacets.packageName.value,
    frustration: optionalFields.frustration.value,
    evidence: optionalFields.evidence.value,
    expected: optionalFields.expected.value,
    actual: optionalFields.actual.value,
    reproduction: optionalFields.reproduction.value,
    tags: tags.values,
    context: removeUndefined({
      cwd: context.cwd,
      sessionFile: context.sessionFile,
      source: context.source || "agent_vent",
    }),
    privacy: {
      classification: "local-diagnostic-user-data",
      redacted: privacy.redacted,
      redactionPatterns: privacy.redactionPatterns,
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
  appendJsonlRecord(filePath, record, { lockPath: `${filePath}.lock` });
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
  const { values, malformedLines, oversizedLines, fileHash } = readJsonlRecords(filePath);
  const { records, invalidRecords } = sanitizeVentRecords(values);
  return { records, malformedLines, oversizedLines, invalidRecords, fileHash };
}

export function readReviewEvents(filePath) {
  const { values, malformedLines, oversizedLines, fileHash } = readJsonlRecords(filePath);
  const { events, invalidEvents } = sanitizeReviewEvents(values);
  return {
    events,
    malformedLines,
    oversizedLines,
    invalidEvents,
    fileHash,
  };
}

export function readCurationEvents(filePath) {
  const { values, malformedLines, oversizedLines, fileHash } = readJsonlRecords(filePath);
  const { events, invalidEvents, quarantinedEvents } = sanitizeCurationEvents(values);
  return {
    events,
    malformedLines,
    oversizedLines,
    invalidEvents,
    quarantinedEvents,
    fileHash,
  };
}

export function readRetentionEvents(filePath) {
  const { values, malformedLines, oversizedLines, fileHash } = readJsonlRecords(filePath);
  const { events, invalidEvents } = sanitizeRetentionEvents(values);
  return {
    events,
    malformedLines,
    oversizedLines,
    invalidEvents,
    fileHash,
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
    ventsHash: vents.fileHash,
    reviewEvents: reviews.events,
    reviewEventsHash: reviews.fileHash,
    curationEvents: curations.events,
    curationEventsHash: curations.fileHash,
    retentionEvents: retentions.events,
    retentionEventsHash: retentions.fileHash,
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
  const filters = normalizeReviewFilters(options.filters);
  const allItems = buildReviewQueueItems(records, reviewEvents, options.curationEvents);
  const facetFilteredItems = allItems.filter((item) => reviewItemMatchesFilters(item, filters));
  const items = facetFilteredItems.filter((item) => {
    if (stateFilter === "all") return true;
    if (stateFilter) return item.reviewState === stateFilter;
    return item.reviewState !== "dismissed";
  });

  return {
    totalRecords: records.length,
    groupCount: allItems.length,
    matchingGroupCount: facetFilteredItems.length,
    reviewEventCount: reviewEvents.length,
    queueCount: items.length,
    stateFilter: stateFilter || "active",
    filters,
    hasFilters: hasReviewFilters(filters),
    items: items.slice(0, clampLimit(options.limit, 20)),
  };
}

export function buildFacetSummary(input = {}) {
  const records = input.records || [];
  const reviewEvents = input.reviewEvents || [];
  const curationEvents = input.curationEvents || [];
  const groups = buildReviewQueueItems(records, reviewEvents, curationEvents);
  const limit = clampLimit(input.limit, 10);

  const recordCounts = {
    categories: new Map(),
    severities: new Map(),
    tags: new Map(),
    tools: new Map(),
    packages: new Map(),
  };
  for (const record of records) {
    incrementCount(recordCounts.categories, normalizeCategory(record.category));
    incrementCount(recordCounts.severities, normalizeSeverity(record.severity));
    if (record.tool) incrementCount(recordCounts.tools, sanitizeFacetText(record.tool, 160).value);
    if (record.packageName)
      incrementCount(recordCounts.packages, sanitizeFacetText(record.packageName, 200).value);
    if (Array.isArray(record.tags)) {
      for (const tag of record.tags) incrementCount(recordCounts.tags, recurrenceSlug(tag));
    }
  }

  const groupCounts = {
    reviewStates: new Map(),
    categories: new Map(),
    tags: new Map(),
    tools: new Map(),
    packages: new Map(),
  };
  for (const group of groups) {
    incrementCount(groupCounts.reviewStates, group.reviewState);
    for (const category of group.categories || []) incrementCount(groupCounts.categories, category);
    for (const tag of group.tags || []) incrementCount(groupCounts.tags, tag);
    for (const tool of group.tools || []) incrementCount(groupCounts.tools, tool);
    for (const packageName of group.packages || [])
      incrementCount(groupCounts.packages, packageName);
  }

  return {
    generatedAt: input.now || new Date().toISOString(),
    classification: "local-diagnostic-user-data",
    boundary:
      "Read-only local diagnostic facet projection. Facets are caller-supplied local labels, not owner routing, evidence, tasks, issues, incidents, telemetry, publication, or ASC/self state.",
    totalRecords: records.length,
    groupCount: groups.length,
    records: mapFacetCounts(recordCounts, limit),
    groups: mapFacetCounts(groupCounts, limit),
  };
}

export function buildReviewOutcomes(input = {}) {
  const records = input.records || [];
  const reviewEvents = input.reviewEvents || [];
  const curationEvents = input.curationEvents || [];
  const stateFilter =
    input.state === "all" || input.state === undefined ? "all" : normalizeReviewState(input.state);
  const filters = normalizeReviewFilters(input.filters);
  const allItems = buildReviewQueueItems(records, reviewEvents, curationEvents);
  const matchingItems = allItems.filter((item) => reviewItemMatchesFilters(item, filters));
  const visibleStates = stateFilter === "all" ? REVIEW_STATES : [stateFilter];
  const counts = Object.fromEntries(REVIEW_STATES.map((state) => [state, 0]));
  for (const item of matchingItems) counts[item.reviewState] += 1;
  const limit = clampLimit(input.limit, 5);

  return {
    generatedAt: input.now || new Date().toISOString(),
    classification: "local-diagnostic-user-data",
    boundary:
      "Read-only local diagnostic review-outcome projection. No AK task, GitHub issue, incident, evidence, telemetry, publication, owner assignment, or ASC/self state mutation occurred.",
    totalRecords: records.length,
    groupCount: allItems.length,
    matchingGroupCount: matchingItems.length,
    stateFilter,
    filters,
    hasFilters: hasReviewFilters(filters),
    counts,
    limitPerBucket: limit,
    buckets: visibleStates.map((state) => {
      const items = matchingItems.filter((item) => item.reviewState === state);
      return {
        state,
        count: items.length,
        description: reviewOutcomeDescription(state),
        items: items.slice(0, limit),
      };
    }),
  };
}

export function buildReviewComparison(input = {}) {
  const records = input.records || [];
  const reviewEvents = input.reviewEvents || [];
  const curationEvents = input.curationEvents || [];
  const filters = normalizeReviewFilters(input.filters);
  const allItems = buildReviewQueueItems(records, reviewEvents, curationEvents);
  const matchingItems = allItems.filter((item) => reviewItemMatchesFilters(item, filters));
  const limit = clampLimit(input.limit, 5);
  const totals = Object.fromEntries(
    REVIEW_STATES.map((state) => [
      state,
      { groups: 0, records: 0, candidateIncidents: 0, criticalGroups: 0 },
    ]),
  );

  for (const item of matchingItems) {
    const total = totals[item.reviewState];
    total.groups += 1;
    total.records += item.count;
    if (item.candidateIncident) total.candidateIncidents += 1;
    if (item.maxSeverity === "critical") total.criticalGroups += 1;
  }

  return {
    generatedAt: input.now || new Date().toISOString(),
    classification: "local-diagnostic-user-data",
    boundary:
      "Read-only local diagnostic review-state comparison projection. No AK task, GitHub issue, incident, evidence, telemetry, publication, owner assignment, archive, restore, or ASC/self state mutation occurred; no retention confirmation tokens are emitted here.",
    totalRecords: records.length,
    groupCount: allItems.length,
    matchingGroupCount: matchingItems.length,
    filters,
    hasFilters: hasReviewFilters(filters),
    limitPerState: limit,
    totals,
    buckets: REVIEW_STATES.map((state) => {
      const items = matchingItems.filter((item) => item.reviewState === state);
      return {
        state,
        description: reviewOutcomeDescription(state),
        ...totals[state],
        items: items.slice(0, limit),
      };
    }),
  };
}

export function buildReviewDetail(input = {}) {
  const recurrenceKey = sanitizeDisplayText(input.recurrenceKey, 200);
  if (!recurrenceKey) throw new Error("agent_vent review detail requires a recurrenceKey");

  const records = input.records || [];
  const reviewEvents = input.reviewEvents || [];
  const curationEvents = input.curationEvents || [];
  const curationMap = buildCurationMap(curationEvents);
  const resolvedKey = resolveRecurrenceKey(recurrenceKey, curationMap);
  const group = buildReviewQueueItems(records, reviewEvents, curationEvents).find(
    (item) => item.recurrenceKey === resolvedKey,
  );
  if (!group) {
    throw new Error(`cannot inspect unknown recurrence group: ${recurrenceKey}`);
  }

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
      id: sanitizeDisplayText(record.id, 120),
      createdAt: sanitizeDisplayText(record.createdAt, 80),
      severity: normalizeSeverity(record.severity),
      category: normalizeCategory(record.category),
      tool: sanitizeFacetText(record.tool, 160).value,
      packageName: sanitizeFacetText(record.packageName, 200).value,
      summary: sanitizeDisplayText(record.summary, 300),
      frustration: sanitizeDisplayText(record.frustration, 500),
      evidence: sanitizeDisplayText(record.evidence, 500),
      expected: sanitizeDisplayText(record.expected, 400),
      actual: sanitizeDisplayText(record.actual, 400),
      reproduction: sanitizeDisplayText(record.reproduction, 500),
      tags: Array.isArray(record.tags)
        ? record.tags.map((tag) => recurrenceSlug(tag)).filter((tag) => tag !== "unspecified")
        : [],
    }));

  return {
    generatedAt: input.now || new Date().toISOString(),
    classification: "local-diagnostic-user-data",
    boundary:
      "Read-only local diagnostic review projection. No AK task, GitHub issue, incident, evidence, telemetry, publication, or ASC/self state mutation occurred.",
    recurrenceKey: resolvedKey,
    requestedRecurrenceKey: recurrenceKey,
    group,
    samples,
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
  const filters = normalizeReviewFilters(input.filters);
  const hasFilters = hasReviewFilters(filters);
  const stateFilter =
    input.state === "all" || input.state === undefined ? "all" : normalizeReviewState(input.state);
  const curationMap = buildCurationMap(curationEvents);
  const allReviewItems = buildReviewQueueItems(records, reviewEvents, curationEvents);
  const facetScopedRecords = hasFilters
    ? records.filter((record) => recordMatchesReviewFilters(record, filters))
    : records;
  const facetScopedReviewItems = buildReviewQueueItems(
    facetScopedRecords,
    reviewEvents,
    curationEvents,
  );
  const scopedReviewItems = facetScopedReviewItems.filter((item) =>
    stateFilter === "all" ? true : item.reviewState === stateFilter,
  );
  const scopedKeys = new Set(scopedReviewItems.map((item) => item.recurrenceKey));
  const scopedRecords = facetScopedRecords.filter((record) =>
    scopedKeys.has(
      resolveRecurrenceKey(String(record.recurrenceKey || buildRecurrenceKey(record)), curationMap),
    ),
  );
  const reviewStateCounts = Object.fromEntries(REVIEW_STATES.map((state) => [state, 0]));
  for (const item of scopedReviewItems) {
    reviewStateCounts[item.reviewState] += 1;
  }

  return {
    generatedAt: input.now || new Date().toISOString(),
    classification: "local-diagnostic-user-data",
    boundary:
      "Local diagnostic projection only; no AK task, GitHub issue, incident, evidence, telemetry, publication, owner assignment, or ASC/self state was created. Facet filters are local diagnostic labels only, not owner routing.",
    scope: {
      hasFilters,
      filters,
      stateFilter,
      totalRecords: records.length,
      totalGroups: allReviewItems.length,
      facetMatchingRecords: facetScopedRecords.length,
      facetMatchingGroups: facetScopedReviewItems.length,
      matchingRecords: scopedRecords.length,
      matchingGroups: scopedReviewItems.length,
    },
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
      vents: scopedRecords.length,
      recurrenceGroups: scopedReviewItems.length,
      reviewEvents: reviewEvents.length,
      curationEvents: curationEvents.length,
      retentionEvents: retentionEvents.length,
      candidateIncidents: scopedReviewItems.filter((item) => item.candidateIncident).length,
      reviewStates: reviewStateCounts,
    },
    summary: summarizeRecords(scopedRecords, {
      limit: clampLimit(input.limit, 20),
      curationEvents,
    }),
    reviewQueue: summarizeReviewQueue(scopedRecords, reviewEvents, {
      state: "all",
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

export function formatFacetSummary(summary) {
  if (summary.totalRecords === 0) {
    return [
      "No agent vent records found yet. Record minimized vents before reviewing local facets.",
      `Boundary: ${summary.boundary}`,
    ].join("\n");
  }

  const lines = [
    `Agent vent facets: ${summary.totalRecords} record(s), ${summary.groupCount} recurrence group(s).`,
    `Boundary: ${summary.boundary}`,
    "Record facets:",
    `- categories: ${formatFacetEntries(summary.records.categories)}`,
    `- severities: ${formatFacetEntries(summary.records.severities)}`,
    `- tags: ${formatFacetEntries(summary.records.tags)}`,
    `- tools: ${formatFacetEntries(summary.records.tools)}`,
    `- packages: ${formatFacetEntries(summary.records.packages)}`,
    "Group facets:",
    `- review states: ${formatFacetEntries(summary.groups.reviewStates)}`,
    `- categories: ${formatFacetEntries(summary.groups.categories)}`,
    `- tags: ${formatFacetEntries(summary.groups.tags)}`,
    `- tools: ${formatFacetEntries(summary.groups.tools)}`,
    `- packages: ${formatFacetEntries(summary.groups.packages)}`,
    "Next: /agent_vent review [state] [limit] [category=bug] [tag=reload] [tool=pi-reload] [package=tryinget-pi-agent-vent] | /agent_vent review show <recurrenceKey> [limit]",
  ];
  return lines.join("\n");
}

export function formatReviewOutcomes(outcomes) {
  const filterText = formatReviewFilters(outcomes.filters);
  if (outcomes.totalRecords === 0) {
    return [
      "No agent vent records found yet. Record minimized vents before reviewing outcome follow-up.",
      outcomes.hasFilters
        ? `Filters requested: ${filterText}. Local diagnostic labels only; not owner routing.`
        : undefined,
      `Boundary: ${outcomes.boundary}`,
    ]
      .filter(Boolean)
      .join("\n");
  }

  const scopeText = outcomes.hasFilters
    ? `${outcomes.matchingGroupCount} matching of ${outcomes.groupCount} total recurrence group(s)`
    : `${outcomes.groupCount} total recurrence group(s)`;
  const lines = [
    `Agent vent review outcomes: ${scopeText}; state filter=${outcomes.stateFilter}; showing up to ${outcomes.limitPerBucket} group(s) per state bucket.`,
    `State counts: new=${outcomes.counts.new}, acknowledged=${outcomes.counts.acknowledged}, dismissed=${outcomes.counts.dismissed}, escalation_drafted=${outcomes.counts.escalation_drafted}`,
    outcomes.hasFilters
      ? `Filters: ${filterText}. Local diagnostic labels only; not owner routing or owner assignment.`
      : undefined,
    "States are local review markers only, not resolution, assignment, issue status, task truth, incident state, evidence, publication, or telemetry.",
    `Boundary: ${outcomes.boundary}`,
  ].filter(Boolean);

  for (const bucket of outcomes.buckets) {
    lines.push("", `${bucket.state}: ${bucket.count} group(s) — ${bucket.description}`);
    if (!bucket.items.length) {
      lines.push("- none");
      continue;
    }
    for (const item of bucket.items) {
      const marker = item.candidateIncident ? "candidate incident for human review" : "watch";
      lines.push(
        `- ${item.recurrenceKey} — ${item.count}x, max=${item.maxSeverity}, ${marker}; latest: ${item.latestSummary}`,
      );
      if (item.reviewNote) lines.push(`  review note: ${item.reviewNote}`);
      for (const followup of buildReviewOutcomeFollowupLines(item, outcomes.filters)) {
        lines.push(`  ${followup}`);
      }
    }
  }
  if (outcomes.hasFilters) {
    lines.push(
      "Filter note: category/tag/tool/package values are local diagnostic labels only, not owner routing or owner assignment.",
    );
  }
  return lines.join("\n");
}

export function formatReviewComparison(comparison) {
  const filterText = formatReviewFilters(comparison.filters);
  if (comparison.totalRecords === 0) {
    return [
      "No agent vent records found yet. Record minimized vents before comparing local review states.",
      comparison.hasFilters
        ? `Filters requested: ${filterText}. Local diagnostic labels only; not owner routing.`
        : undefined,
      `Boundary: ${comparison.boundary}`,
    ]
      .filter(Boolean)
      .join("\n");
  }

  const scopeText = comparison.hasFilters
    ? `${comparison.matchingGroupCount} matching of ${comparison.groupCount} total recurrence group(s)`
    : `${comparison.groupCount} total recurrence group(s)`;
  const lines = [
    `Agent vent review comparison: ${scopeText}; showing up to ${comparison.limitPerState} group(s) per state bucket.`,
    comparison.hasFilters
      ? `Filters: ${filterText}. Local diagnostic labels only; not owner routing or owner assignment.`
      : undefined,
    "States are local review markers only, not resolution, assignment, issue status, task truth, incident state, evidence, publication, or telemetry.",
    "This comparison is read-only and intentionally emits no archive or restore confirmation tokens.",
    `Boundary: ${comparison.boundary}`,
    "",
    "State totals:",
  ].filter(Boolean);

  for (const state of REVIEW_STATES) {
    const total = comparison.totals[state];
    lines.push(
      `- ${state}: groups=${total.groups}, records=${total.records}, candidateIncidents=${total.candidateIncidents}, criticalGroups=${total.criticalGroups}`,
    );
  }

  for (const bucket of comparison.buckets) {
    lines.push(
      "",
      `${bucket.state}: ${bucket.groups} group(s), ${bucket.records} record(s), ${bucket.candidateIncidents} candidate incident(s) — ${bucket.description}`,
    );
    if (!bucket.items.length) {
      lines.push("- none");
      continue;
    }
    for (const item of bucket.items) {
      const marker = item.candidateIncident ? "candidate incident for human review" : "watch";
      lines.push(
        `- ${item.recurrenceKey} — ${item.count}x, max=${item.maxSeverity}, ${marker}; latest: ${item.latestSummary}`,
      );
      lines.push(
        `  inspect: ${formatAgentVentCommand("review", "show", item.recurrenceKey)} [limit]`,
      );
      lines.push(
        `  outcomes: ${formatAgentVentCommandWithFilters(comparison.filters, "outcomes", item.reviewState)} [per-state-limit]`,
      );
      lines.push(
        `  ${formatExportBucketLine("export bucket", item.reviewState, comparison.filters)}`,
      );
      if (item.reviewState === "new") {
        lines.push(
          `  choose local outcome: ${formatAgentVentCommand("review", "set", "acknowledged", item.recurrenceKey)} [note] | ${formatAgentVentCommand("review", "set", "dismissed", item.recurrenceKey)} [note] | ${formatAgentVentCommand("review", "set", "escalation_drafted", item.recurrenceKey)} [note]`,
        );
      } else {
        lines.push(
          `  retention planning: ${formatAgentVentCommandWithFilters(comparison.filters, "retention", "candidates", item.reviewState)} [limit]`,
        );
      }
      lines.push(
        "  boundary: local diagnostics only; no owner routing, assignment, filing, task creation, incident declaration, evidence, publication, archive, restore, telemetry, or ASC/self mutation occurred",
      );
    }
  }
  if (comparison.hasFilters) {
    lines.push(
      "Filter note: category/tag/tool/package values are local diagnostic labels only, not owner routing or owner assignment.",
    );
  }
  return lines.join("\n");
}

export function formatReviewQueue(queue) {
  const filterText = formatReviewFilters(queue.filters);
  const filterSuffix = queue.hasFilters ? ` for filters: ${filterText}` : "";
  if (queue.totalRecords === 0) {
    return [
      "No agent vent records found yet. Record minimized vents before reviewing recurrence groups.",
      queue.hasFilters
        ? `Filters requested: ${filterText}. Local diagnostic labels only; not owner routing.`
        : undefined,
    ]
      .filter(Boolean)
      .join("\n");
  }
  if (queue.queueCount === 0) {
    return [
      `Agent vent review queue: no ${queue.stateFilter} recurrence group(s) to show${filterSuffix}.`,
      queue.hasFilters
        ? "Filters are local diagnostic labels only; not owner routing or owner assignment."
        : undefined,
      "Boundary: local review state only; no AK task, GitHub issue, incident, evidence, telemetry, or ASC/self state was created.",
    ]
      .filter(Boolean)
      .join("\n");
  }

  const scopeText = queue.hasFilters
    ? `${queue.matchingGroupCount} matching of ${queue.groupCount} total group(s)`
    : `${queue.groupCount} total group(s)`;
  const lines = [
    `Agent vent review queue: ${queue.items.length} of ${queue.queueCount} ${queue.stateFilter} recurrence group(s) shown (${scopeText}).`,
    queue.hasFilters
      ? `Filters: ${filterText}. Local diagnostic labels only; not owner routing or owner assignment.`
      : undefined,
    "States: new -> acknowledged | dismissed | escalation_drafted. Review state is local diagnostic state only.",
    "Boundary: no AK task, GitHub issue, incident, evidence, telemetry, or ASC/self state was created.",
  ].filter(Boolean);
  for (const item of queue.items) {
    const marker = item.candidateIncident ? "candidate incident for human review" : "watch";
    const facets = [
      item.categories?.length ? `categories=${item.categories.join(",")}` : undefined,
      item.tags?.length ? `tags=${item.tags.join(",")}` : undefined,
      item.tools?.length ? `tools=${item.tools.join(",")}` : undefined,
      item.packages?.length ? `packages=${item.packages.join(",")}` : undefined,
    ]
      .filter(Boolean)
      .join("; ");
    const facetText = facets ? `; ${facets}` : "";
    lines.push(
      `- [${item.reviewState}] ${item.recurrenceKey} — ${item.count}x, max=${item.maxSeverity}, ${marker}${facetText}; latest: ${item.latestSummary}`,
    );
    if (item.reviewNote) lines.push(`  review note: ${item.reviewNote}`);
    lines.push(`  human review hints: ${formatReviewGuidance(item)}`);
    lines.push(
      `  inspect: ${formatAgentVentCommand("review", "show", item.recurrenceKey)} [limit]`,
    );
    for (const nextAction of buildReviewNextActionLines(item, { compact: true })) {
      lines.push(`  ${nextAction}`);
    }
  }
  if (queue.hasFilters) {
    lines.push(
      "Filter note: category/tag/tool/package values are local diagnostic labels only, not owner routing or owner assignment.",
    );
  }
  return lines.join("\n");
}

export function formatReviewDetail(detail) {
  const group = detail.group;
  const lines = [
    `Agent vent review detail for ${detail.recurrenceKey}: ${group.count} local diagnostic record(s).`,
    `Review state: ${group.reviewState}; max severity: ${group.maxSeverity}; candidate incident for human review: ${group.candidateIncident ? "yes" : "no"}`,
    `Boundary: ${detail.boundary}`,
  ];
  if (detail.requestedRecurrenceKey !== detail.recurrenceKey) {
    lines.push(`Requested key resolved through local curation: ${detail.requestedRecurrenceKey}`);
  }
  if (group.categories?.length) lines.push(`Categories: ${group.categories.join(", ")}`);
  if (group.tags?.length) lines.push(`Tags: ${group.tags.join(", ")}`);
  if (group.tools?.length) lines.push(`Tools: ${group.tools.join(", ")}`);
  if (group.packages?.length) lines.push(`Packages: ${group.packages.join(", ")}`);
  if (group.reviewNote) lines.push(`Review note: ${group.reviewNote}`);
  lines.push(`Human review hints: ${formatReviewGuidance(group)}`);
  lines.push("", "Representative local samples:");
  for (const sample of detail.samples || []) {
    lines.push(
      `- ${sample.id || "unknown-id"} ${sample.createdAt || "unknown-time"} [${sample.severity}/${sample.category}] ${sample.summary || "(no summary)"}`,
    );
    if (sample.tags?.length) lines.push(`  tags: ${sample.tags.join(", ")}`);
    if (sample.tool) lines.push(`  tool: ${sample.tool}`);
    if (sample.packageName) lines.push(`  package: ${sample.packageName}`);
    if (sample.frustration) lines.push(`  frustration: ${sample.frustration}`);
    if (sample.evidence) lines.push(`  evidence: ${sample.evidence}`);
    if (sample.expected) lines.push(`  expected: ${sample.expected}`);
    if (sample.actual) lines.push(`  actual: ${sample.actual}`);
    if (sample.reproduction) lines.push(`  reproduction: ${sample.reproduction}`);
  }
  if (!detail.samples?.length) lines.push("No sample vents available.");
  lines.push("", "Local next actions:");
  for (const nextAction of buildReviewNextActionLines(group)) {
    lines.push(`- ${nextAction}`);
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
    snapshot.scope?.hasFilters
      ? `- scope filters: ${formatReviewFilters(snapshot.scope.filters)} (${snapshot.scope.matchingGroups} matching of ${snapshot.scope.totalGroups} total group(s))`
      : undefined,
    `- paths: ${snapshot.paths.vents}; ${snapshot.paths.reviewEvents}; ${snapshot.paths.curationEvents}`,
    `Boundary: ${snapshot.boundary}`,
  ]
    .filter(Boolean)
    .join("\n");
}

export function formatExportMarkdown(snapshot) {
  const lines = [
    "# Agent vent local diagnostic export",
    "",
    `Generated: ${snapshot.generatedAt}`,
    `Classification: ${snapshot.classification}`,
    `Boundary: ${snapshot.boundary}`,
    "",
    "## Scope",
    "",
    snapshot.scope?.hasFilters
      ? `- Filters: ${formatReviewFilters(snapshot.scope.filters)} (local diagnostic labels only; not owner routing or owner assignment)`
      : "- Filters: none",
    snapshot.scope?.hasFilters
      ? `- Matching groups: ${snapshot.scope.matchingGroups} of ${snapshot.scope.totalGroups}`
      : `- Groups: ${snapshot.counts.recurrenceGroups}`,
    snapshot.scope?.hasFilters
      ? `- Matching vent records: ${snapshot.scope.matchingRecords} of ${snapshot.scope.totalRecords}`
      : `- Vent records: ${snapshot.counts.vents}`,
    "- Export is a local diagnostic projection only, not evidence, publication, owner routing, task truth, issue truth, or incident truth.",
    "",
    "## Stats",
    "",
    `- Vent records in scope: ${snapshot.counts.vents}`,
    `- Recurrence groups in scope: ${snapshot.counts.recurrenceGroups}`,
    `- Candidate incidents for human review in scope: ${snapshot.counts.candidateIncidents}`,
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
  const plan = planRetentionArchive({
    records,
    reviewEvents,
    curationEvents,
    recurrenceKey,
    storeHash: input.storeHash,
    reviewHash: input.reviewHash,
    curationHash: input.curationHash,
  });
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

export function buildRetentionCandidates(input = {}) {
  const records = input.records || [];
  const reviewEvents = input.reviewEvents || [];
  const curationEvents = input.curationEvents || [];
  const stateFilter = normalizeRetentionCandidateState(input.state);
  const filters = normalizeReviewFilters(input.filters);
  const allItems = buildReviewQueueItems(records, reviewEvents, curationEvents);
  const facetFilteredItems = allItems.filter((item) => reviewItemMatchesFilters(item, filters));
  const visibleItems = facetFilteredItems.filter((item) => {
    if (stateFilter === "all") return true;
    if (stateFilter === "reviewed") return item.reviewState !== "new";
    return item.reviewState === stateFilter;
  });
  const limit = clampLimit(input.limit, 20);

  return {
    generatedAt: input.now || new Date().toISOString(),
    classification: "local-diagnostic-user-data",
    boundary:
      "Read-only local diagnostic retention planning projection. No archive, restore, AK task, GitHub issue, incident, evidence, telemetry, publication, owner assignment, or ASC/self state mutation occurred; no archive confirmation tokens are emitted here.",
    totalRecords: records.length,
    groupCount: allItems.length,
    matchingGroupCount: facetFilteredItems.length,
    candidateCount: visibleItems.length,
    stateFilter,
    filters,
    hasFilters: hasReviewFilters(filters),
    limit,
    items: visibleItems.slice(0, limit),
  };
}

export function buildRetentionHistory(input = {}) {
  const retentionEvents = input.retentionEvents || [];
  const backupDir = input.backupDir || defaultBackupDir();
  const limit = clampLimit(input.limit, 20);
  const items = retentionEvents
    .slice()
    .reverse()
    .slice(0, limit)
    .map((event) => buildRetentionHistoryItem(event, backupDir));

  return {
    generatedAt: input.now || new Date().toISOString(),
    classification: "local-diagnostic-user-data",
    boundary:
      "Read-only local diagnostic retention receipt history. No archive, restore, AK task, GitHub issue, incident, evidence, telemetry, publication, owner assignment, or ASC/self state mutation occurred; restore commands are candidates guarded by the restore command's backup containment and stale-store checks.",
    backupDir,
    totalEvents: retentionEvents.length,
    eventCount: items.length,
    limit,
    items,
  };
}

export function formatRetentionHistory(history) {
  if (!history.totalEvents) {
    return [
      "No agent vent retention events found yet. Archive reviewed local diagnostic groups before retention history exists.",
      `Boundary: ${history.boundary}`,
    ].join("\n");
  }

  const lines = [
    `Agent vent retention history: ${history.eventCount} of ${history.totalEvents} local retention event(s) shown; limit=${history.limit}.`,
    "This is a read-only receipt projection. It does not archive, restore, delete, file, create tasks, declare incidents, record evidence, publish, assign owners, or mutate ASC/self state.",
    "Restore commands shown here are rollback candidates only; actual restore still requires package-created backup containment and current active-store hash checks, so stale/moved/path-invalid backups fail closed.",
    `Boundary: ${history.boundary}`,
  ];

  for (const item of history.items) {
    lines.push(
      `- [${item.action}] ${item.createdAt || "unknown-time"} ${item.recurrenceKey || "unknown-recurrence"} — ${item.archivedRecordCount || 0} record(s); backup=${item.backupPath || "none"}`,
    );
    if (item.note) lines.push(`  note: ${item.note}`);
    if (item.restoreCommand) {
      lines.push(
        `  rollback candidate: ${item.restoreCommand}`,
        `  restore guard: requires backup inside ${history.backupDir} and current active vents store hash ${item.afterHashPrefix}`,
      );
    } else {
      lines.push(`  rollback candidate: unavailable (${item.restoreUnavailableReason})`);
    }
  }
  return lines.join("\n");
}

export function archiveRecurrenceGroup(input = {}) {
  const storePath = input.storePath || defaultStorePath();
  const reviewPath = input.reviewPath || defaultReviewPath();
  const curationPath = input.curationPath || defaultCurationPath();
  const retentionPath = input.retentionPath || defaultRetentionPath();
  const backupDir = input.backupDir || defaultBackupDir();
  const confirmationToken = sanitizeDisplayText(input.confirmationToken, 300);
  const lock = acquireFileLock(`${storePath}.lock`);
  try {
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
      storeHash: state.ventsHash,
      reviewHash: state.reviewEventsHash,
      curationHash: state.curationEventsHash,
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
    if (beforeHash !== state.ventsHash) {
      throw new Error("agent_vent retention archive refused changing vents store");
    }
    const archivedRecords = new Set(plan.records);
    const remainingRecords = state.records.filter((record) => !archivedRecords.has(record));
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
    try {
      writeTextFileAtomically(storePath, afterText, 0o600);
      appendRetentionEvent(retentionPath, event);
    } catch (error) {
      restoreTextIfHashMatches(storePath, afterHash, beforeText);
      fs.rmSync(backupPath, { force: true });
      throw error;
    }
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
  } finally {
    releaseFileLock(lock);
  }
}

export function restoreRetentionBackup(input = {}) {
  const storePath = input.storePath || defaultStorePath();
  const retentionPath = input.retentionPath || defaultRetentionPath();
  const backupDir = input.backupDir || defaultBackupDir();
  const confirmationToken = sanitizeDisplayText(input.confirmationToken, 300);
  const backupPath = assertBackupPathInsideDir(input.backupPath, backupDir);
  const lock = acquireFileLock(`${storePath}.lock`);
  try {
    const backup = readRetentionBackup(backupPath);
    const expectedRestoreToken = buildRestoreToken(
      backup.recurrenceKey,
      backup.beforeHash,
      backup.afterHash,
    );
    if (backup.restoreConfirmationToken !== expectedRestoreToken) {
      throw new Error("agent_vent retention backup restore token failed integrity check");
    }
    if (confirmationToken !== expectedRestoreToken) {
      throw new Error(
        `agent_vent retention restore requires exact confirmation token: ${expectedRestoreToken}`,
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

    const restoredHash = backup.beforeHash;
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
    try {
      appendRetentionEvent(retentionPath, event);
    } catch (error) {
      restoreTextIfHashMatches(storePath, restoredHash, currentText);
      throw error;
    }
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
  } finally {
    releaseFileLock(lock);
  }
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
      `Next: ${formatAgentVentCommand("retention", "archive", preview.recurrenceKey, preview.confirmationToken)} [note]`,
    );
  } else {
    lines.push(
      `Next: ${formatAgentVentCommand("review", "set", "acknowledged", preview.recurrenceKey)} [note] before archiving.`,
    );
  }
  for (const sample of preview.samples || []) {
    lines.push(`- ${sample.id || "unknown-id"}: ${sample.summary || "(no summary)"}`);
  }
  return lines.join("\n");
}

export function formatRetentionCandidates(candidates) {
  const filterText = formatReviewFilters(candidates.filters);
  if (candidates.totalRecords === 0) {
    return [
      "No agent vent records found yet. Record minimized vents before retention planning.",
      candidates.hasFilters
        ? `Filters requested: ${filterText}. Local diagnostic labels only; not owner routing.`
        : undefined,
      `Boundary: ${candidates.boundary}`,
    ]
      .filter(Boolean)
      .join("\n");
  }

  const scopeText = candidates.hasFilters
    ? `${candidates.matchingGroupCount} matching of ${candidates.groupCount} total recurrence group(s)`
    : `${candidates.groupCount} total recurrence group(s)`;
  const lines = [
    `Agent vent retention candidates: ${candidates.items.length} of ${candidates.candidateCount} group(s) shown (${scopeText}); state filter=${candidates.stateFilter}; limit=${candidates.limit}.`,
    candidates.hasFilters
      ? `Filters: ${filterText}. Local diagnostic labels only; not owner routing or owner assignment.`
      : undefined,
    "This is a read-only planning view. It does not archive records and intentionally does not emit archive confirmation tokens.",
    `Boundary: ${candidates.boundary}`,
  ].filter(Boolean);

  if (!candidates.items.length) {
    lines.push("- none");
    if (candidates.stateFilter === "reviewed") {
      lines.push("Next: review local groups first, then run retention candidates again.");
    }
    return lines.join("\n");
  }

  for (const item of candidates.items) {
    const facets = [
      item.categories?.length ? `categories=${item.categories.join(",")}` : undefined,
      item.tags?.length ? `tags=${item.tags.join(",")}` : undefined,
      item.tools?.length ? `tools=${item.tools.join(",")}` : undefined,
      item.packages?.length ? `packages=${item.packages.join(",")}` : undefined,
    ]
      .filter(Boolean)
      .join("; ");
    const facetText = facets ? `; ${facets}` : "";
    lines.push(
      `- [${item.reviewState}] ${item.recurrenceKey} — ${item.count}x, max=${item.maxSeverity}, first=${item.firstSeen || "unknown"}, last=${item.lastSeen || "unknown"}${facetText}; latest: ${item.latestSummary}`,
    );
    if (item.reviewNote) lines.push(`  review note: ${item.reviewNote}`);
    lines.push(
      `  inspect: ${formatAgentVentCommand("review", "show", item.recurrenceKey)} [limit]`,
    );
    if (item.reviewState === "new") {
      lines.push(
        `  review before archive: ${formatAgentVentCommand("review", "set", "acknowledged", item.recurrenceKey)} [note] | ${formatAgentVentCommand("review", "set", "dismissed", item.recurrenceKey)} [note]`,
      );
    } else {
      lines.push(
        `  preview archive token: ${formatAgentVentCommand("retention", "preview", item.recurrenceKey)}`,
        `  ${formatExportBucketLine("export this outcome bucket", item.reviewState, candidates.filters)}`,
      );
    }
  }
  if (candidates.hasFilters) {
    lines.push(
      "Filter note: category/tag/tool/package values are local diagnostic labels only, not owner routing or owner assignment.",
    );
  }
  return lines.join("\n");
}

export function formatRetentionArchiveResult(result) {
  return [
    `Archived ${result.archivedRecordCount} local diagnostic record(s) from ${result.recurrenceKey}.`,
    `Backup: ${result.backupPath}`,
    `Restore token: ${result.restoreConfirmationToken}`,
    `Next rollback: ${formatAgentVentCommand("retention", "restore", result.backupPath, result.restoreConfirmationToken)}`,
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
      tool: sanitizeFacetText(record.tool, 160).value,
      packageName: sanitizeFacetText(record.packageName, 200).value,
      tags: Array.isArray(record.tags)
        ? record.tags.map((tag) => recurrenceSlug(tag)).filter((tag) => tag !== "unspecified")
        : [],
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
    `Optional local follow-up: ${formatAgentVentCommand("review", "set", "escalation_drafted", draft.recurrenceKey)}`,
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
  const localFacetLines = [
    draft.group.categories?.length
      ? `- Categories: ${draft.group.categories.join(", ")}`
      : undefined,
    draft.group.tags?.length ? `- Tags: ${draft.group.tags.join(", ")}` : undefined,
    draft.group.tools?.length ? `- Tools: ${draft.group.tools.join(", ")}` : undefined,
    draft.group.packages?.length ? `- Packages: ${draft.group.packages.join(", ")}` : undefined,
  ].filter(Boolean);
  if (localFacetLines.length) {
    lines.push("", "## Local diagnostic facets (not owner routing)", "", ...localFacetLines);
  }
  lines.push("", "## Representative local samples", "");
  for (const sample of draft.samples) {
    lines.push(
      `- ${sample.createdAt || "unknown-time"} [${sample.severity}/${sample.category}] ${sample.summary}`,
    );
    if (sample.tags?.length) lines.push(`  - Tags: ${sample.tags.join(", ")}`);
    if (sample.tool) lines.push(`  - Tool: ${sample.tool}`);
    if (sample.packageName) lines.push(`  - Package: ${sample.packageName}`);
    if (sample.evidence) lines.push(`  - Evidence: ${sample.evidence}`);
    if (sample.reproduction) lines.push(`  - Reproduction: ${sample.reproduction}`);
  }
  if (draft.samples.length === 0) lines.push("No sample vents available.");
  lines.push(
    "",
    "## Owner-system handoff reminder",
    "",
    "This text is only a local draft. Local facets are hints, not owner routing. The target owner system remains authoritative for acceptance, schema, lifecycle, evidence, and publication.",
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
      const summary = sanitizeOptionalText(value?.summary, 600);
      if (!summary.value) throw new Error("missing summary");
      const optionalFields = {
        frustration: sanitizeOptionalText(value?.frustration, 1200),
        evidence: sanitizeOptionalText(value?.evidence, 1600),
        expected: sanitizeOptionalText(value?.expected, 800),
        actual: sanitizeOptionalText(value?.actual, 800),
        reproduction: sanitizeOptionalText(value?.reproduction, 1200),
      };
      const localFacets = {
        tool: sanitizeFacetText(value?.tool || value?.toolName, 160),
        packageName: sanitizeFacetText(value?.packageName, 200),
      };
      const tags = sanitizeTagList(value?.tags);
      const privacy = collectRedactionMetadata([
        summary,
        ...Object.values(optionalFields),
        ...Object.values(localFacets),
        tags,
      ]);
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
          buildRecurrenceKey({ ...value, category, summary: summary.value }),
        summary: summary.value,
        tool: localFacets.tool.value,
        packageName: localFacets.packageName.value,
        frustration: optionalFields.frustration.value,
        evidence: optionalFields.evidence.value,
        expected: optionalFields.expected.value,
        actual: optionalFields.actual.value,
        reproduction: optionalFields.reproduction.value,
        tags: tags.values,
        privacy: {
          classification: "local-diagnostic-user-data",
          redacted: privacy.redacted,
          redactionPatterns: privacy.redactionPatterns,
        },
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

function normalizeRetentionCandidateState(value) {
  if (value === undefined || value === null || value === "") return "reviewed";
  const normalized = String(value).trim().toLowerCase().replaceAll("-", "_");
  if (normalized === "reviewed" || normalized === "all") return normalized;
  return normalizeReviewState(normalized);
}

function buildRetentionHistoryItem(event, backupDir) {
  const item = {
    id: event.id,
    createdAt: event.createdAt,
    action: event.action,
    recurrenceKey: event.recurrenceKey,
    requestedRecurrenceKey: event.requestedRecurrenceKey,
    backupPath: event.backupPath,
    archivedRecordCount: event.archivedRecordCount,
    archivedRecordIds: Array.isArray(event.archivedRecordIds) ? event.archivedRecordIds : [],
    beforeHash: event.beforeHash,
    afterHash: event.afterHash,
    afterHashPrefix: event.afterHash ? `${String(event.afterHash).slice(0, 12)}…` : "unknown",
    note: event.note,
    restoreConfirmationToken: undefined,
    restoreCommand: undefined,
    restoreUnavailableReason: undefined,
  };

  const restoreIssue = retentionRestoreCommandIssue(event, backupDir);
  if (restoreIssue) {
    item.restoreUnavailableReason = restoreIssue;
    return item;
  }

  const token = buildRestoreToken(event.recurrenceKey, event.beforeHash, event.afterHash);
  item.restoreConfirmationToken = token;
  item.restoreCommand = formatAgentVentCommand("retention", "restore", event.backupPath, token);
  return item;
}

function retentionRestoreCommandIssue(event, backupDir) {
  if (event?.action !== "archive") return "event is not an archive receipt";
  if (!event.recurrenceKey) return "archive receipt is missing recurrence key";
  if (!event.backupPath) return "archive receipt is missing backup path";
  if (!isSha256Hex(event.beforeHash) || !isSha256Hex(event.afterHash)) {
    return "archive receipt is missing valid before/after hashes";
  }
  const safeBackupDir = path.resolve(backupDir);
  const resolvedBackupPath = path.resolve(String(event.backupPath));
  if (!resolvedBackupPath.startsWith(`${safeBackupDir}${path.sep}`)) {
    return "backup path is outside the configured backup directory";
  }
  return undefined;
}

function isSha256Hex(value) {
  return /^[a-f0-9]{64}$/i.test(String(value || ""));
}

function planRetentionArchive({
  records = [],
  reviewEvents = [],
  curationEvents = [],
  recurrenceKey,
  storeHash,
  reviewHash,
  curationHash,
}) {
  const requestedRecurrenceKey = sanitizeDisplayText(recurrenceKey, 200);
  if (!requestedRecurrenceKey) throw new Error("agent_vent retention requires a recurrenceKey");
  if (!storeHash || !reviewHash || !curationHash) {
    throw new Error(
      "agent_vent retention preview requires current store, review, and curation hashes",
    );
  }
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
  const fingerprint = sha256Hex(
    `${resolvedKey}\n${storeHash}\n${reviewHash}\n${curationHash}\n${reviewState}\n${archivedRecordIds.join("\n")}`,
  );
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
  const backupDirStat = safeLstat(safeBackupDir);
  if (!backupDirStat || backupDirStat.isSymbolicLink() || !backupDirStat.isDirectory()) {
    throw new Error(
      `agent_vent retention backup directory must be a real directory: ${safeBackupDir}`,
    );
  }
  const resolved = path.resolve(String(backupPath || ""));
  if (!resolved.startsWith(`${safeBackupDir}${path.sep}`)) {
    throw new Error(`agent_vent retention backup path must stay inside ${safeBackupDir}`);
  }
  const realBackupDir = fs.realpathSync.native(safeBackupDir);
  const realBackupPath = fs.realpathSync.native(resolved);
  if (!realBackupPath.startsWith(`${realBackupDir}${path.sep}`)) {
    throw new Error(`agent_vent retention backup path must stay inside ${realBackupDir}`);
  }
  return realBackupPath;
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

function restoreTextIfHashMatches(filePath, expectedHash, text) {
  const existing = safeLstat(filePath);
  if (!existing) return;
  assertSafeJsonlFile(filePath, existing);
  const currentText = fs.readFileSync(filePath, "utf8");
  if (sha256Hex(currentText) === expectedHash) {
    writeTextFileAtomically(filePath, text, 0o600);
  }
}

function acquireFileLock(lockPath, timeoutMs = 2000) {
  fs.mkdirSync(path.dirname(lockPath), { recursive: true, mode: 0o700 });
  const started = Date.now();
  while (true) {
    try {
      const fd = fs.openSync(lockPath, createFileFlags(), 0o600);
      fs.writeFileSync(fd, `${process.pid}\n${new Date().toISOString()}\n`, "utf8");
      fs.closeSync(fd);
      return lockPath;
    } catch (error) {
      if (error?.code === "EACCES" || error?.code === "EPERM") throw error;
      if (error?.code === "EEXIST" && removeStaleLock(lockPath)) continue;
      if (error?.code !== "EEXIST" || Date.now() - started >= timeoutMs) {
        throw new Error(`agent_vent lock unavailable: ${lockPath}`);
      }
      sleepSync(25);
    }
  }
}

function releaseFileLock(lockPath) {
  if (lockPath) fs.rmSync(lockPath, { force: true });
}

function sleepSync(ms) {
  Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, ms);
}

function removeStaleLock(lockPath) {
  const stat = safeLstat(lockPath);
  if (!stat || stat.isSymbolicLink() || !stat.isFile()) return false;
  if (Date.now() - stat.mtimeMs < 30_000) return false;
  fs.rmSync(lockPath, { force: true });
  return true;
}

function quoteCommandArg(value) {
  const text = String(value || "");
  if (!/[\s"'\\]/.test(text)) return text;
  return `"${text.replace(/\\/g, "\\\\").replace(/"/g, '\\"')}"`;
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
      tags: new Set(),
      tools: new Set(),
      packages: new Set(),
    };
    existing.count += 1;
    const severity = normalizeSeverity(record.severity);
    if (rankSeverity(severity) > rankSeverity(existing.maxSeverity)) {
      existing.maxSeverity = severity;
    }
    existing.categories.add(normalizeCategory(record.category));
    if (Array.isArray(record.tags)) {
      for (const tag of record.tags) {
        const normalizedTag = recurrenceSlug(tag);
        if (normalizedTag !== "unspecified") existing.tags.add(normalizedTag);
      }
    }
    const tool = sanitizeFacetText(record.tool, 160).value;
    if (tool) existing.tools.add(tool);
    const packageName = sanitizeFacetText(record.packageName, 200).value;
    if (packageName) existing.packages.add(packageName);
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
        tags: [...group.tags].sort(),
        tools: [...group.tools].sort(),
        packages: [...group.packages].sort(),
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

function formatReviewGuidance(group) {
  const hints = [];
  if (group.candidateIncident) {
    hints.push(
      "incident_review draft may help a human decide whether this is operationally significant",
    );
  }
  if ((group.packages || []).length || (group.tools || []).length) {
    hints.push(
      "maintainer_note draft may help package/tool maintainers inspect local diagnostic facets",
    );
  }
  const categories = new Set(group.categories || []);
  if (categories.has("bug") || categories.has("tool_failure") || categories.has("performance")) {
    hints.push(
      "github_issue draft may help if the target repo accepts issue-based maintenance intake",
    );
  }
  if (
    categories.has("workflow") ||
    categories.has("documentation") ||
    categories.has("missing_capability") ||
    categories.has("context_loss") ||
    categories.has("permission")
  ) {
    hints.push("ak_task draft may help if a human chooses to create durable task truth");
  }
  if (!hints.length) {
    hints.push("inspect samples, then choose a local review state or draft target if useful");
  }
  return `${hints.join("; ")}. Hints are local diagnostics only, not owner routing, assignment, filing, task creation, incident declaration, evidence, publication, or telemetry.`;
}

function reviewOutcomeDescription(state) {
  if (state === "new") return "needs local human review before local retention archive";
  if (state === "acknowledged")
    return "reviewed locally; a human may inspect, export, draft, or archive if useful";
  if (state === "dismissed")
    return "locally dismissed; a human may revisit, export, or archive reviewed diagnostics";
  return "draft noted locally; owner system remains authoritative for any submitted work";
}

function buildReviewOutcomeFollowupLines(group, filters = {}) {
  const key = group.recurrenceKey;
  const lines = [`inspect: ${formatAgentVentCommand("review", "show", key)} [limit]`];
  if (group.reviewState === "new") {
    lines.push(
      `choose local outcome: ${formatAgentVentCommand("review", "set", "acknowledged", key)} [note] | ${formatAgentVentCommand("review", "set", "dismissed", key)} [note] | ${formatAgentVentCommand("review", "set", "escalation_drafted", key)} [note]`,
      "retention waits for local review; draft commands still generate text only",
    );
  } else {
    lines.push(
      `optional local lifecycle: ${formatAgentVentCommand("retention", "preview", key)}`,
      formatExportBucketLine("export this outcome bucket", group.reviewState, filters),
      `revisit local state: ${formatAgentVentCommand("review", "set", "new", key)} [note]`,
    );
  }
  lines.push(
    `draft-only handoff if a human wants text: ${formatAgentVentCommand("draft", "github_issue", key)} | ${formatAgentVentCommand("draft", "ak_task", key)} | ${formatAgentVentCommand("draft", "incident_review", key)} | ${formatAgentVentCommand("draft", "maintainer_note", key)}`,
    "boundary: follow-up commands are local diagnostics/drafts only; they do not file, create, declare, assign, record evidence, publish, or mutate owner systems",
  );
  return lines;
}

function buildReviewNextActionLines(group, options = {}) {
  const key = group.recurrenceKey;
  const state = group.reviewState || "new";
  const prefix = options.compact ? "next:" : "Set local review state:";
  const lines = [
    `${prefix} ${formatAgentVentCommand("review", "set", "acknowledged", key)} [note] | ${formatAgentVentCommand("review", "set", "dismissed", key)} [note] | ${formatAgentVentCommand("review", "set", "escalation_drafted", key)} [note]`,
  ];
  if (state === "new") {
    lines.push(
      "review first before local retention archive; drafts are still draft-only and require human owner-system action",
    );
  } else {
    lines.push(`optional local lifecycle: ${formatAgentVentCommand("retention", "preview", key)}`);
  }
  lines.push(
    `draft-only handoff options: ${formatAgentVentCommand("draft", "github_issue", key)} | ${formatAgentVentCommand("draft", "ak_task", key)} | ${formatAgentVentCommand("draft", "incident_review", key)} | ${formatAgentVentCommand("draft", "maintainer_note", key)}`,
    "boundary: draft commands only generate local text; they do not file, create, declare, assign, record evidence, publish, or mutate owner systems",
  );
  return lines;
}

function formatAgentVentCommand(...args) {
  return `/agent_vent ${args.map((arg) => quoteCommandArg(arg)).join(" ")}`;
}

function formatAgentVentCommandWithFilters(filters, ...args) {
  return formatAgentVentCommand(...args, ...reviewFilterCommandArgs(filters));
}

function reviewFilterCommandArgs(filters = {}) {
  const args = [];
  if (filters.category) args.push(`category=${filters.category}`);
  if (filters.tool) args.push(`tool=${filters.tool}`);
  if (filters.packageName) args.push(`package=${filters.packageName}`);
  if (filters.tags?.length) args.push(`tag=${filters.tags.join(",")}`);
  return args;
}

function formatExportBucketLine(label, state, filters = {}) {
  const command = `${formatAgentVentCommandWithFilters(filters, "export", "markdown", state)} [limit]`;
  return `${label}: ${command}`;
}

function normalizeReviewFilters(input = {}) {
  assertNoEmptyReviewFilterValues(input);
  const category = normalizeReviewFilterCategory(input?.category);
  const tool = sanitizeFacetText(input?.tool || input?.toolName, 160).value;
  const packageName = sanitizeFacetText(input?.packageName || input?.package, 200).value;
  const tags = sanitizeReviewFilterTags(input?.tags || input?.tag);
  return removeUndefined({ category, tool, packageName, tags });
}

function assertNoEmptyReviewFilterValues(input = {}) {
  const entries = [
    ["category", input?.category],
    ["tool", input?.tool ?? input?.toolName],
    ["package", input?.packageName ?? input?.package],
    ["tag", input?.tags ?? input?.tag],
  ];
  for (const [name, value] of entries) {
    if (value === undefined || value === null) continue;
    if (Array.isArray(value)) {
      if (value.some((entry) => String(entry || "").trim() === "")) {
        throw new Error(`invalid agent_vent review filter ${name}: empty value`);
      }
      continue;
    }
    if (String(value).trim() === "") {
      throw new Error(`invalid agent_vent review filter ${name}: empty value`);
    }
  }
}

function normalizeReviewFilterCategory(value) {
  if (value === undefined) return undefined;
  const normalized = String(value).trim().toLowerCase().replaceAll("-", "_");
  if (!CATEGORIES.includes(normalized)) {
    throw new Error(
      `invalid agent_vent review filter category: ${value}; expected one of ${CATEGORIES.join(", ")}`,
    );
  }
  return normalized;
}

function sanitizeReviewFilterTags(value) {
  const rawTags = Array.isArray(value) ? value : value ? String(value).split(",") : [];
  const tags = [];
  for (const rawTag of rawTags) {
    const tag = sanitizeFacetText(rawTag, 120).value;
    if (tag && !tags.includes(tag)) tags.push(tag);
    if (tags.length >= 12) break;
  }
  return tags;
}

function hasReviewFilters(filters = {}) {
  return Boolean(
    filters.category || filters.tool || filters.packageName || (filters.tags || []).length,
  );
}

function reviewItemMatchesFilters(item, filters = {}) {
  if (!hasReviewFilters(filters)) return true;
  if (filters.category && !(item.categories || []).includes(filters.category)) return false;
  if (filters.tool && !(item.tools || []).includes(filters.tool)) return false;
  if (filters.packageName && !(item.packages || []).includes(filters.packageName)) return false;
  for (const tag of filters.tags || []) {
    if (!(item.tags || []).includes(tag)) return false;
  }
  return true;
}

function recordMatchesReviewFilters(record, filters = {}) {
  if (!hasReviewFilters(filters)) return true;
  if (filters.category && normalizeCategory(record.category) !== filters.category) return false;
  if (filters.tool && sanitizeFacetText(record.tool, 160).value !== filters.tool) return false;
  if (
    filters.packageName &&
    sanitizeFacetText(record.packageName, 200).value !== filters.packageName
  ) {
    return false;
  }
  const recordTags = new Set(
    Array.isArray(record.tags)
      ? record.tags.map((tag) => recurrenceSlug(tag)).filter((tag) => tag !== "unspecified")
      : [],
  );
  for (const tag of filters.tags || []) {
    if (!recordTags.has(tag)) return false;
  }
  return true;
}

function formatReviewFilters(filters = {}) {
  const parts = [];
  if (filters.category) parts.push(`category=${filters.category}`);
  if (filters.tool) parts.push(`tool=${filters.tool}`);
  if (filters.packageName) parts.push(`package=${filters.packageName}`);
  if (filters.tags?.length) parts.push(`tags=${filters.tags.join(",")}`);
  return parts.join("; ") || "none";
}

function incrementCount(counts, value) {
  if (!value || value === "unspecified") return;
  counts.set(value, (counts.get(value) || 0) + 1);
}

function mapFacetCounts(facetMaps, limit) {
  return Object.fromEntries(
    Object.entries(facetMaps).map(([name, counts]) => [name, sortedFacetEntries(counts, limit)]),
  );
}

function sortedFacetEntries(counts, limit) {
  return [...counts.entries()]
    .map(([name, count]) => ({ name, count }))
    .sort((left, right) => right.count - left.count || left.name.localeCompare(right.name))
    .slice(0, limit);
}

function formatFacetEntries(entries = []) {
  if (!entries.length) return "none";
  return entries.map((entry) => `${entry.name}=${entry.count}`).join(", ");
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

function appendJsonlRecord(filePath, record, options = {}) {
  const lock = options.lockPath ? acquireFileLock(options.lockPath) : undefined;
  try {
    ensureStore(filePath);
    const fd = fs.openSync(filePath, appendFileFlags(), 0o600);
    try {
      fs.writeSync(fd, `${JSON.stringify(record)}\n`, undefined, "utf8");
    } finally {
      fs.closeSync(fd);
    }
  } finally {
    releaseFileLock(lock);
  }
}

function readJsonlRecords(filePath) {
  const existing = safeLstat(filePath);
  if (!existing)
    return { values: [], malformedLines: 0, oversizedLines: 0, fileHash: sha256Hex("") };
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
  return { values, malformedLines, oversizedLines, fileHash: sha256Hex(text) };
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

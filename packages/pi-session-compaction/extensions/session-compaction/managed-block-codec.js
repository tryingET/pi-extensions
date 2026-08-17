/**
summary: "Encodes bounded exact compaction records with versioned collision-safe sentinels."
read_when:
  - "Changing exact prompt preservation, managed record boundaries, checksums, or migration."
*/
import { Buffer } from "node:buffer";
import { createHash } from "node:crypto";

import { sanitizeDisplayText } from "./redaction.js";

export const MANAGED_BLOCK_VERSION = 2;
export const MANAGED_BLOCK_SCHEMA = "pi.session_compaction.managed.v2";

const START_RE =
  /^<!-- pi-session-compaction:managed:v2:([a-z0-9_-]+):start(?: ([A-Za-z0-9_-]+))? -->$/u;
const END_RE = /^<!-- pi-session-compaction:managed:v2:([a-z0-9_-]+):end -->$/u;
const RECORD_RE = /^<!-- pi-session-compaction:record:v2:([A-Za-z0-9_-]+) -->$/u;

function normalizeText(value) {
  return typeof value === "string" ? value : String(value ?? "");
}

function encodePayload(value) {
  return Buffer.from(JSON.stringify(value), "utf8").toString("base64url");
}

function decodePayload(value) {
  try {
    return JSON.parse(Buffer.from(value, "base64url").toString("utf8"));
  } catch {
    return undefined;
  }
}

export function managedRecordChecksum(text) {
  return createHash("sha256").update(normalizeText(text)).digest("hex").slice(0, 20);
}

function longestBacktickRun(text) {
  let longest = 0;
  for (const match of normalizeText(text).matchAll(/`+/gu)) {
    longest = Math.max(longest, match[0].length);
  }
  return longest;
}

function fenceFor(text) {
  return "`".repeat(Math.max(4, longestBacktickRun(text) + 1));
}

function normalizeRecord(record, options = {}) {
  const sanitized = sanitizeDisplayText(record?.text, {
    maxChars: Number.isFinite(options.maxRecordChars) ? options.maxRecordChars : undefined,
  });
  const text = sanitized.text.trim();
  if (!text) return undefined;
  const checksum = managedRecordChecksum(text);
  const timestamp = Number.isFinite(record?.timestamp) ? record.timestamp : 0;
  const id =
    typeof record?.id === "string" && record.id.trim()
      ? record.id.trim()
      : `psc-${checksum.slice(0, 12)}-${timestamp || 0}`;

  return {
    id,
    kind: typeof record?.kind === "string" ? record.kind : "record",
    text,
    timestamp,
    source: typeof record?.source === "string" ? record.source : undefined,
    sourceEntryId: typeof record?.sourceEntryId === "string" ? record.sourceEntryId : undefined,
    priority: Number.isFinite(record?.priority) ? record.priority : 0,
    pinned: record?.pinned === true,
    checksum,
    redactions: sanitized.redactions,
    truncated: sanitized.truncated || record?.truncated === true,
    fromPrevious: record?.fromPrevious === true,
  };
}

function recordCost(record) {
  return record.text.length + encodePayload(recordMetadata(record)).length + 96;
}

export function selectManagedRecords(records, options = {}) {
  const maxItems = Number.isFinite(options.maxItems)
    ? Math.max(0, Math.floor(options.maxItems))
    : 20;
  const maxChars = Number.isFinite(options.maxChars)
    ? Math.max(0, Math.floor(options.maxChars))
    : 12_000;
  const maxRecordChars = Number.isFinite(options.maxRecordChars)
    ? Math.max(0, Math.floor(options.maxRecordChars))
    : maxChars;
  const normalized = (Array.isArray(records) ? records : [])
    .map((record) => normalizeRecord(record, { maxRecordChars }))
    .filter(Boolean);

  const byText = new Map();
  for (const record of normalized) {
    const previous = byText.get(record.text);
    if (
      !previous ||
      record.pinned ||
      record.priority > previous.priority ||
      record.timestamp > previous.timestamp
    ) {
      byText.set(record.text, record);
    }
  }

  const ranked = [...byText.values()].sort(
    (left, right) =>
      Number(right.pinned) - Number(left.pinned) ||
      right.priority - left.priority ||
      right.timestamp - left.timestamp ||
      left.id.localeCompare(right.id),
  );
  const selected = [];
  let usedChars = 0;

  for (const record of ranked) {
    if (selected.length >= maxItems) break;
    const cost = recordCost(record);
    if (usedChars + cost > maxChars) continue;
    selected.push(record);
    usedChars += cost;
  }

  selected.sort(
    (left, right) => left.timestamp - right.timestamp || left.id.localeCompare(right.id),
  );
  return {
    records: selected,
    omittedCount: Math.max(0, normalized.length - selected.length),
    usedChars,
    inputCount: normalized.length,
    redactionCount: selected.reduce((sum, record) => sum + record.redactions.length, 0),
    truncatedCount: selected.filter((record) => record.truncated).length,
  };
}

function recordMetadata(record) {
  return {
    v: MANAGED_BLOCK_VERSION,
    id: record.id,
    ...(record.kind !== "record" ? { k: record.kind } : {}),
    ...(record.timestamp ? { ts: record.timestamp } : {}),
    ...(record.sourceEntryId ? { e: record.sourceEntryId } : {}),
    ...(record.priority ? { p: record.priority } : {}),
    ...(record.pinned ? { pin: true } : {}),
    c: record.checksum,
    ...(record.redactions.length > 0 ? { r: record.redactions.length } : {}),
    ...(record.truncated ? { tr: true } : {}),
    ...(record.fromPrevious ? { prev: true } : {}),
  };
}

function decodeRecordMetadata(metadata = {}) {
  return {
    schema: MANAGED_BLOCK_SCHEMA,
    version: metadata.v ?? MANAGED_BLOCK_VERSION,
    id: metadata.id,
    kind: metadata.k ?? "record",
    timestamp: metadata.ts ?? 0,
    source: undefined,
    sourceEntryId: metadata.e,
    priority: metadata.p ?? 0,
    pinned: metadata.pin === true,
    checksum: metadata.c,
    redactions: Number.isInteger(metadata.r)
      ? Array.from({ length: metadata.r }, () => ({ kind: "redacted", fingerprint: "stored" }))
      : [],
    truncated: metadata.tr === true,
    fromPrevious: metadata.prev === true,
  };
}

export function buildManagedBlock({ type, heading, records, ...options }) {
  if (!/^[a-z0-9_-]+$/u.test(String(type ?? ""))) {
    throw new Error("Managed block type must contain only lowercase letters, digits, '_' or '-'");
  }
  const selected = selectManagedRecords(records, options);
  const blockMeta = encodePayload({
    v: MANAGED_BLOCK_VERSION,
    t: type,
    n: selected.inputCount,
    o: selected.omittedCount,
    r: selected.redactionCount,
    tr: selected.truncatedCount,
  });
  const lines = [`<!-- pi-session-compaction:managed:v2:${type}:start ${blockMeta} -->`, heading];

  if (selected.records.length === 0) {
    lines.push("(none)");
  } else {
    for (const record of selected.records) {
      const fence = fenceFor(record.text);
      lines.push(
        `<!-- pi-session-compaction:record:v2:${encodePayload(recordMetadata(record))} -->`,
        `${fence}text`,
        record.text,
        fence,
      );
    }
  }

  if (selected.omittedCount > 0) {
    lines.push(
      `_Omitted ${selected.omittedCount} lower-priority managed record(s) to stay within budget._`,
    );
  }
  lines.push(`<!-- pi-session-compaction:managed:v2:${type}:end -->`);

  return {
    ...selected,
    type,
    text: lines.join("\n"),
  };
}

export function renderManagedBlock(params) {
  return buildManagedBlock(params).text;
}

export function decodeManagedBlocks(summary, requestedType) {
  const lines = normalizeText(summary).split(/\r?\n/u);
  const blocks = [];

  for (let index = 0; index < lines.length; index += 1) {
    const start = lines[index].match(START_RE);
    if (!start) continue;
    const type = start[1];
    const blockMeta = decodePayload(start[2]);
    const startIndex = index;
    const records = [];
    index += 1;

    while (index < lines.length) {
      const end = lines[index].match(END_RE);
      if (end?.[1] === type) break;
      const recordMatch = lines[index].match(RECORD_RE);
      if (!recordMatch) {
        index += 1;
        continue;
      }
      const metadata = decodeRecordMetadata(decodePayload(recordMatch[1]) ?? {});
      const fenceMatch = lines[index + 1]?.match(/^(`{4,})(?:text)?$/u);
      if (!fenceMatch) {
        index += 1;
        continue;
      }
      const fence = fenceMatch[1];
      const textLines = [];
      index += 2;
      while (index < lines.length && lines[index] !== fence) {
        textLines.push(lines[index]);
        index += 1;
      }
      const text = textLines.join("\n");
      records.push({
        ...metadata,
        text,
        checksumValid:
          typeof metadata.checksum === "string" &&
          metadata.checksum === managedRecordChecksum(text),
      });
      index += 1;
    }

    blocks.push({
      type,
      metadata: blockMeta,
      records,
      startIndex,
      endIndex: index,
    });
  }

  return requestedType ? blocks.filter((block) => block.type === requestedType) : blocks;
}

export function managedRecordsFromSummary(summary, type) {
  return decodeManagedBlocks(summary, type).flatMap((block) => block.records);
}

export function stripManagedBlocks(summary) {
  const lines = normalizeText(summary).split(/\r?\n/u);
  const skippedIndices = new Set();
  for (const block of decodeManagedBlocks(summary)) {
    for (let index = block.startIndex; index <= block.endIndex; index += 1) {
      skippedIndices.add(index);
    }
  }
  const out = lines.filter((_line, index) => !skippedIndices.has(index));
  return (
    out
      .join("\n")
      .replace(/\n{3,}/gu, "\n\n")
      .trim() || undefined
  );
}

export function countManagedBlocks(summary, type) {
  return decodeManagedBlocks(summary, type).length;
}

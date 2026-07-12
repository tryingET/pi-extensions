// ---
// summary: defines persisted self-memory snapshot contracts and normalizes untrusted snapshot entries.
// read_when:
//   - changing memory schema versions, valid layers and types, or persisted payload validation.
// ---

import type { Memory, MemoryLayer, MemorySource, MemoryType } from "./memory.ts";

export const MEMORY_SNAPSHOT_VERSION = 1;
export const LOAD_LAYER_PRIORITY: MemoryLayer[] = ["longterm", "recent", "session", "ephemeral"];
export const PERSISTED_LAYER: MemoryLayer = "longterm";
export const SCOPED_MEMORY_TYPES = new Set<MemoryType>([
  "pattern",
  "ontology_candidate",
  "trap",
  "checkpoint",
  "followup",
  "continuation_candidate",
]);
export const VALID_LAYERS: MemoryLayer[] = ["ephemeral", "session", "recent", "longterm"];

const VALID_TYPES: MemoryType[] = [
  "learning",
  "pattern",
  "trap",
  "ontology_candidate",
  "checkpoint",
  "followup",
  "continuation_candidate",
  "decision",
  "context",
  "error",
  "success",
];
const VALID_SOURCES: MemorySource[] = ["session", "crystallized", "imported", "inferred"];

export interface PersistedMemoryEntry {
  layer: MemoryLayer;
  memory: Memory;
}

export interface PersistedMemorySnapshot {
  schemaVersion: number;
  savedAt: number;
  entries: PersistedMemoryEntry[];
}

export interface NormalizedSnapshot {
  entries: PersistedMemoryEntry[];
  discarded: number;
}

export function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

export function isNonEmptyString(value: unknown): value is string {
  return typeof value === "string" && value.trim().length > 0;
}

function isValidLayer(value: unknown): value is MemoryLayer {
  return typeof value === "string" && VALID_LAYERS.includes(value as MemoryLayer);
}

function isValidType(value: unknown): value is MemoryType {
  return typeof value === "string" && VALID_TYPES.includes(value as MemoryType);
}

function isValidSource(value: unknown): value is MemorySource {
  return typeof value === "string" && VALID_SOURCES.includes(value as MemorySource);
}

export function toNonNegativeNumber(value: unknown): number | null {
  if (typeof value !== "number" || !Number.isFinite(value) || value < 0) {
    return null;
  }
  return value;
}

export function toNonNegativeInteger(value: unknown): number | null {
  const parsed = toNonNegativeNumber(value);
  if (parsed === null) {
    return null;
  }
  return Math.trunc(parsed);
}

export function toStringArray(value: unknown): string[] {
  if (!Array.isArray(value)) {
    return [];
  }

  return value.filter((item): item is string => isNonEmptyString(item)).map((item) => item.trim());
}

export function clampStrength(value: number): number {
  return Math.max(0, Math.min(1, value));
}

function normalizeMemory(value: unknown): Memory | null {
  if (!isRecord(value)) {
    return null;
  }

  if (!isNonEmptyString(value.id)) {
    return null;
  }

  if (!isValidType(value.type)) {
    return null;
  }

  if (!isNonEmptyString(value.content) || !isNonEmptyString(value.context)) {
    return null;
  }

  if (!isNonEmptyString(value.topic)) {
    return null;
  }

  if (!isValidSource(value.source)) {
    return null;
  }

  const strength = toNonNegativeNumber(value.strength);
  const createdAt = toNonNegativeNumber(value.createdAt);
  const lastAccessedAt = toNonNegativeNumber(value.lastAccessedAt);
  const accessCount = toNonNegativeInteger(value.accessCount);

  if (strength === null || createdAt === null || lastAccessedAt === null || accessCount === null) {
    return null;
  }

  const metadata = isRecord(value.metadata) ? value.metadata : {};
  const topics = toStringArray(value.topics);

  return {
    id: value.id.trim(),
    type: value.type,
    content: value.content,
    context: value.context,
    topic: value.topic,
    topics,
    strength: clampStrength(strength),
    createdAt,
    lastAccessedAt,
    accessCount,
    source: value.source,
    metadata,
  };
}

export function normalizeSnapshot(value: unknown): NormalizedSnapshot | null {
  if (!isRecord(value)) {
    return null;
  }

  if (value.schemaVersion !== MEMORY_SNAPSHOT_VERSION) {
    return null;
  }

  if (!Array.isArray(value.entries)) {
    return null;
  }

  const entries: PersistedMemoryEntry[] = [];
  let discarded = 0;

  for (const rawEntry of value.entries) {
    if (!isRecord(rawEntry) || !isValidLayer(rawEntry.layer)) {
      discarded++;
      continue;
    }

    const memory = normalizeMemory(rawEntry.memory);
    if (!memory) {
      discarded++;
      continue;
    }

    entries.push({
      layer: rawEntry.layer,
      memory,
    });
  }

  return {
    entries,
    discarded,
  };
}

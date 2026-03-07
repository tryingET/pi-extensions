/**
 * Runtime lifecycle wiring for scoped self-memory persistence.
 *
 * Scope (initial):
 * - Crystallization domain (pattern memories)
 * - Protection domain (trap memories)
 */

import { mkdir, readFile, rename, writeFile } from "node:fs/promises";
import { dirname } from "node:path";
import {
  InMemoryStore,
  type Memory,
  type MemoryLayer,
  type MemorySource,
  type MemoryStore,
  type MemoryType,
} from "./memory.ts";
import type { SelfState } from "./types.ts";

const MEMORY_SNAPSHOT_VERSION = 1;
const LOAD_LAYER_PRIORITY: MemoryLayer[] = ["longterm", "recent", "session", "ephemeral"];
const PERSISTED_LAYER: MemoryLayer = "longterm";
const SCOPED_MEMORY_TYPES = new Set<MemoryType>(["pattern", "trap"]);
const VALID_LAYERS: MemoryLayer[] = ["ephemeral", "session", "recent", "longterm"];
const VALID_TYPES: MemoryType[] = [
  "learning",
  "pattern",
  "trap",
  "decision",
  "context",
  "error",
  "success",
];
const VALID_SOURCES: MemorySource[] = ["session", "crystallized", "imported", "inferred"];

interface PersistedMemoryEntry {
  layer: MemoryLayer;
  memory: Memory;
}

interface PersistedMemorySnapshot {
  schemaVersion: number;
  savedAt: number;
  entries: PersistedMemoryEntry[];
}

interface NormalizedSnapshot {
  entries: PersistedMemoryEntry[];
  discarded: number;
}

export interface MemoryLoadResult {
  status: "missing" | "invalid" | "loaded";
  loaded: number;
  discarded: number;
  reason?: string;
}

export interface SelfMemoryLifecycle {
  ready: Promise<void>;
  persistScopedDomains: () => Promise<void>;
  getLoadResult: () => MemoryLoadResult;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function isNonEmptyString(value: unknown): value is string {
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

function toNonNegativeNumber(value: unknown): number | null {
  if (typeof value !== "number" || !Number.isFinite(value) || value < 0) {
    return null;
  }
  return value;
}

function toNonNegativeInteger(value: unknown): number | null {
  const parsed = toNonNegativeNumber(value);
  if (parsed === null) {
    return null;
  }
  return Math.trunc(parsed);
}

function toStringArray(value: unknown): string[] {
  if (!Array.isArray(value)) {
    return [];
  }

  return value.filter((item): item is string => isNonEmptyString(item)).map((item) => item.trim());
}

function clampStrength(value: number): number {
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

function normalizeSnapshot(value: unknown): NormalizedSnapshot | null {
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

async function clearScopedMemories(store: MemoryStore): Promise<void> {
  for (const layer of VALID_LAYERS) {
    const memories = await store.getLayer(layer);
    for (const memory of memories) {
      if (SCOPED_MEMORY_TYPES.has(memory.type)) {
        await store.delete(memory.id);
      }
    }
  }
}

function patternMemoryFromState(state: SelfState): Memory[] {
  return Array.from(state.learnings.patterns.values()).map((pattern) => {
    const topics = new Set<string>([pattern.topic]);

    return {
      id: pattern.id,
      type: "pattern",
      content: pattern.content,
      context: pattern.context,
      topic: pattern.topic,
      topics: Array.from(topics),
      strength: clampStrength(pattern.strength),
      createdAt: pattern.crystallizedAt,
      lastAccessedAt: pattern.lastAccessedAt,
      accessCount: pattern.accessCount,
      source: "crystallized",
      metadata: {},
    };
  });
}

function trapMemoryFromState(state: SelfState): Memory[] {
  return Array.from(state.traps.traps.values()).map((trap) => ({
    id: trap.id,
    type: "trap",
    content: trap.description,
    context: trap.context,
    topic: trap.triggers[0] ?? "trap",
    topics: [...trap.triggers],
    strength: 1,
    createdAt: trap.markedAt,
    lastAccessedAt: trap.markedAt,
    accessCount: trap.encounterCount,
    source: "crystallized",
    metadata: {
      triggers: [...trap.triggers],
      encounterCount: trap.encounterCount,
      markedAt: trap.markedAt,
    },
  }));
}

async function writeScopedStateToStore(state: SelfState, store: MemoryStore): Promise<void> {
  await clearScopedMemories(store);

  for (const memory of patternMemoryFromState(state)) {
    await store.store(memory, PERSISTED_LAYER);
  }

  for (const memory of trapMemoryFromState(state)) {
    await store.store(memory, PERSISTED_LAYER);
  }
}

function addPatternFromMemory(state: SelfState, memory: Memory): void {
  const topic = memory.topic.trim().length > 0 ? memory.topic : "general";
  const lastAccessedAt = Math.max(memory.createdAt, memory.lastAccessedAt);

  state.learnings.patterns.set(memory.id, {
    id: memory.id,
    topic,
    content: memory.content,
    context: memory.context,
    crystallizedAt: memory.createdAt,
    lastAccessedAt,
    accessCount: memory.accessCount,
    strength: clampStrength(memory.strength),
  });

  const indexedTopics = new Set<string>([topic, ...memory.topics]);
  for (const indexedTopic of indexedTopics) {
    if (!indexedTopic) {
      continue;
    }

    if (!state.learnings.topicsIndex.has(indexedTopic)) {
      state.learnings.topicsIndex.set(indexedTopic, new Set());
    }
    state.learnings.topicsIndex.get(indexedTopic)?.add(memory.id);
  }
}

function addTrapFromMemory(state: SelfState, memory: Memory): void {
  const metadata = isRecord(memory.metadata) ? memory.metadata : {};
  const metadataTriggers = toStringArray(metadata.triggers);
  const triggers = metadataTriggers.length > 0 ? metadataTriggers : [...memory.topics];
  const encounterCount = toNonNegativeInteger(metadata.encounterCount) ?? memory.accessCount;
  const markedAt = toNonNegativeNumber(metadata.markedAt) ?? memory.createdAt;

  state.traps.traps.set(memory.id, {
    id: memory.id,
    description: memory.content,
    context: memory.context,
    triggers,
    markedAt,
    encounterCount,
  });
}

async function hydrateScopedStateFromStore(state: SelfState, store: MemoryStore): Promise<void> {
  state.learnings.patterns.clear();
  state.learnings.topicsIndex.clear();
  state.traps.traps.clear();

  const loadedIds = new Set<string>();

  for (const layer of LOAD_LAYER_PRIORITY) {
    const layerMemories = await store.getLayer(layer);
    for (const memory of layerMemories) {
      if (!SCOPED_MEMORY_TYPES.has(memory.type)) {
        continue;
      }

      if (loadedIds.has(memory.id)) {
        continue;
      }
      loadedIds.add(memory.id);

      if (memory.type === "pattern") {
        addPatternFromMemory(state, memory);
      }

      if (memory.type === "trap") {
        addTrapFromMemory(state, memory);
      }
    }
  }
}

async function loadScopedMemorySnapshot(
  memoryFilePath: string,
  store: MemoryStore,
): Promise<MemoryLoadResult> {
  let payload: string;
  try {
    payload = await readFile(memoryFilePath, "utf8");
  } catch (error) {
    const code =
      error && typeof error === "object" && "code" in error ? String(error.code ?? "") : "";
    if (code === "ENOENT") {
      return {
        status: "missing",
        loaded: 0,
        discarded: 0,
      };
    }

    return {
      status: "invalid",
      loaded: 0,
      discarded: 0,
      reason: "Unable to read persisted memory payload.",
    };
  }

  let parsed: unknown;
  try {
    parsed = JSON.parse(payload) as unknown;
  } catch {
    return {
      status: "invalid",
      loaded: 0,
      discarded: 0,
      reason: "Persisted memory payload is not valid JSON.",
    };
  }

  const normalized = normalizeSnapshot(parsed);
  if (!normalized) {
    return {
      status: "invalid",
      loaded: 0,
      discarded: 0,
      reason: "Persisted memory payload failed schema validation.",
    };
  }

  await clearScopedMemories(store);

  let loaded = 0;
  let discarded = normalized.discarded;

  for (const entry of normalized.entries) {
    if (!SCOPED_MEMORY_TYPES.has(entry.memory.type)) {
      discarded++;
      continue;
    }

    await store.store(entry.memory, entry.layer);
    loaded++;
  }

  return {
    status: "loaded",
    loaded,
    discarded,
  };
}

async function saveScopedMemorySnapshot(memoryFilePath: string, store: MemoryStore): Promise<void> {
  const entries: PersistedMemoryEntry[] = [];

  for (const layer of VALID_LAYERS) {
    const memories = await store.getLayer(layer);
    for (const memory of memories) {
      if (!SCOPED_MEMORY_TYPES.has(memory.type)) {
        continue;
      }

      entries.push({
        layer,
        memory: {
          ...memory,
          topics: [...memory.topics],
          metadata: { ...memory.metadata },
        },
      });
    }
  }

  const snapshot: PersistedMemorySnapshot = {
    schemaVersion: MEMORY_SNAPSHOT_VERSION,
    savedAt: Date.now(),
    entries,
  };

  await mkdir(dirname(memoryFilePath), { recursive: true });

  const tempPath = `${memoryFilePath}.tmp`;
  await writeFile(tempPath, JSON.stringify(snapshot, null, 2), "utf8");
  await rename(tempPath, memoryFilePath);
}

export function createSelfMemoryLifecycle(
  state: SelfState,
  memoryFilePath: string,
  store: MemoryStore = new InMemoryStore(),
): SelfMemoryLifecycle {
  let lastLoadResult: MemoryLoadResult = {
    status: "missing",
    loaded: 0,
    discarded: 0,
  };
  let persistQueue = Promise.resolve();

  const ready = (async () => {
    lastLoadResult = await loadScopedMemorySnapshot(memoryFilePath, store);
    await hydrateScopedStateFromStore(state, store);
  })();

  const persistScopedDomains = async (): Promise<void> => {
    await ready;

    const persistStep = async () => {
      await writeScopedStateToStore(state, store);
      await saveScopedMemorySnapshot(memoryFilePath, store);
    };

    persistQueue = persistQueue.then(persistStep, persistStep);
    await persistQueue;
  };

  return {
    ready,
    persistScopedDomains,
    getLoadResult: () => lastLoadResult,
  };
}

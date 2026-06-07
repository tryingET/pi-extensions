/**
 * Runtime lifecycle wiring for scoped self-memory persistence.
 *
 * Scope:
 * - Crystallization domain (pattern memories)
 * - Candidate-only ontology memories
 * - Protection domain (trap memories)
 * - Action domain (checkpoints and follow-ups)
 */

import { mkdir, readFile, rename, writeFile } from "node:fs/promises";
import { dirname } from "node:path";
import { InMemoryStore, type MemoryStore } from "./memory.ts";
import {
  MEMORY_SNAPSHOT_VERSION,
  normalizeSnapshot,
  type PersistedMemoryEntry,
  type PersistedMemorySnapshot,
  SCOPED_MEMORY_TYPES,
  VALID_LAYERS,
} from "./memory-lifecycle-codec.ts";
import {
  clearScopedMemories,
  hydrateScopedStateFromStore,
  writeScopedStateToStore,
} from "./memory-lifecycle-state.ts";
import type { SelfState } from "./types.ts";

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

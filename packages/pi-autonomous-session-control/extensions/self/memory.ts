/**
 * Memory Interface: Layered memory system for cross-session persistence.
 *
 * Design Goals:
 * - Interface-based: can be backed by in-memory, SQLite, or FrankenSQLite
 * - Layered: short-term (session), medium-term (recent), long-term (patterns)
 * - Async-first: storage operations are async for future DB backends
 *
 * FrankenSQLite Integration (future):
 * - MVCC for concurrent reads/writes from multiple agents
 * - RaptorQ durability for critical memories
 * - Native mode for content-addressed pattern storage
 */

// ============================================================================
// MEMORY TYPES
// ============================================================================

/**
 * A single memory entry.
 */
export interface Memory {
  id: string;
  type: MemoryType;
  content: string;
  context: string; // Where/when/how it was created
  topic: string; // Primary topic for indexing
  topics: string[]; // Additional topics for cross-referencing
  strength: number; // 0-1, decays over time
  createdAt: number;
  lastAccessedAt: number;
  accessCount: number;
  source: MemorySource;
  metadata: Record<string, unknown>;
}

export type MemoryType =
  | "learning" // Something discovered/understood
  | "pattern" // A reusable pattern
  | "trap" // Something to avoid
  | "decision" // A decision made with reasoning
  | "context" // Context about the project/session
  | "error" // An error and its resolution
  | "success"; // A successful approach

export type MemorySource =
  | "session" // Discovered in this session
  | "crystallized" // Promoted from short-term
  | "imported" // Imported from external source
  | "inferred"; // Inferred from patterns

export type MemoryLayer = "ephemeral" | "session" | "recent" | "longterm";

// ============================================================================
// MEMORY QUERY
// ============================================================================

export interface MemoryQuery {
  /** Text to search for */
  text?: string;
  /** Filter by type */
  type?: MemoryType;
  /** Filter by topic */
  topic?: string;
  /** Filter by source */
  source?: MemorySource;
  /** Minimum strength */
  minStrength?: number;
  /** Maximum age in milliseconds */
  maxAge?: number;
  /** Maximum results */
  limit?: number;
  /** Include lower layers (e.g., query session includes ephemeral) */
  includeLowerLayers?: boolean;
}

export interface MemorySearchResult {
  memory: Memory;
  layer: MemoryLayer;
  score: number; // Relevance score 0-1
}

// ============================================================================
// MEMORY STORE INTERFACE
// ============================================================================

/**
 * Interface for a memory store.
 * Can be implemented by in-memory store, SQLite, or FrankenSQLite.
 */
export interface MemoryStore {
  // Write operations
  store(memory: Memory, layer: MemoryLayer): Promise<void>;
  update(id: string, updates: Partial<Memory>): Promise<void>;
  delete(id: string): Promise<void>;
  access(id: string): Promise<void>; // Mark as accessed

  // Read operations
  get(id: string): Promise<Memory | null>;
  query(query: MemoryQuery): Promise<MemorySearchResult[]>;
  findSimilar(content: string, limit?: number): Promise<MemorySearchResult[]>;

  // Layer operations
  promote(id: string, toLayer: MemoryLayer): Promise<void>;
  demote(id: string, toLayer: MemoryLayer): Promise<void>;
  getLayer(layer: MemoryLayer): Promise<Memory[]>;

  // Maintenance
  decay(factor: number): Promise<void>; // Decay all strengths
  prune(threshold: number): Promise<number>; // Remove weak memories, return count
  export_(layer?: MemoryLayer): Promise<Memory[]>; // Export memories
  import(memories: Memory[], layer: MemoryLayer): Promise<void>; // Import memories

  // Stats
  stats(): Promise<MemoryStats>;
}

export interface MemoryStats {
  total: number;
  byLayer: Record<MemoryLayer, number>;
  byType: Record<MemoryType, number>;
  avgStrength: number;
  oldestAt: number;
  newestAt: number;
}

// ============================================================================
// IN-MEMORY IMPLEMENTATION (DEFAULT)
// ============================================================================

/**
 * Simple in-memory implementation.
 * Suitable for single-session use, testing, and as a reference implementation.
 */
export class InMemoryStore implements MemoryStore {
  private layers: Map<MemoryLayer, Map<string, Memory>> = new Map();

  constructor() {
    this.layers.set("ephemeral", new Map());
    this.layers.set("session", new Map());
    this.layers.set("recent", new Map());
    this.layers.set("longterm", new Map());
  }

  async store(memory: Memory, layer: MemoryLayer): Promise<void> {
    this.layers.get(layer)?.set(memory.id, { ...memory });
  }

  async update(id: string, updates: Partial<Memory>): Promise<void> {
    for (const [, layer] of this.layers) {
      const existing = layer.get(id);
      if (existing) {
        layer.set(id, { ...existing, ...updates });
        return;
      }
    }
  }

  async delete(id: string): Promise<void> {
    for (const [, layer] of this.layers) {
      layer.delete(id);
    }
  }

  async access(id: string): Promise<void> {
    for (const [, layer] of this.layers) {
      const memory = layer.get(id);
      if (memory) {
        memory.lastAccessedAt = Date.now();
        memory.accessCount++;
        memory.strength = Math.min(1, memory.strength + 0.1);
        return;
      }
    }
  }

  async get(id: string): Promise<Memory | null> {
    for (const [, layer] of this.layers) {
      const memory = layer.get(id);
      if (memory) return { ...memory };
    }
    return null;
  }

  async query(q: MemoryQuery): Promise<MemorySearchResult[]> {
    const results: MemorySearchResult[] = [];
    const searchLayers: MemoryLayer[] = q.includeLowerLayers
      ? ["longterm", "recent", "session", "ephemeral"]
      : ["longterm"];

    for (const layerName of searchLayers) {
      const layer = this.layers.get(layerName);
      if (!layer) continue;

      for (const memory of layer.values()) {
        const score = this.scoreMemory(memory, q);
        if (score > 0) {
          results.push({ memory: { ...memory }, layer: layerName, score });
        }
      }
    }

    // Sort by score descending
    results.sort((a, b) => b.score - a.score);

    // Apply limit
    if (q.limit !== undefined) {
      return results.slice(0, q.limit);
    }

    return results;
  }

  private scoreMemory(memory: Memory, q: MemoryQuery): number {
    let score = 1.0;

    // Type filter
    if (q.type !== undefined && memory.type !== q.type) {
      return 0;
    }

    // Topic filter
    if (q.topic !== undefined) {
      if (memory.topic !== q.topic && !memory.topics.includes(q.topic)) {
        return 0;
      }
      score *= 1.2; // Boost for topic match
    }

    // Source filter
    if (q.source !== undefined && memory.source !== q.source) {
      return 0;
    }

    // Strength filter
    if (q.minStrength !== undefined && memory.strength < q.minStrength) {
      return 0;
    }

    // Age filter
    if (q.maxAge !== undefined) {
      const age = Date.now() - memory.createdAt;
      if (age > q.maxAge) {
        return 0;
      }
    }

    // Text search
    if (q.text !== undefined) {
      const searchLower = q.text.toLowerCase();
      const contentMatch = memory.content.toLowerCase().includes(searchLower);
      const contextMatch = memory.context.toLowerCase().includes(searchLower);
      const topicMatch = memory.topic.toLowerCase().includes(searchLower);

      if (!contentMatch && !contextMatch && !topicMatch) {
        return 0;
      }

      if (contentMatch) score *= 1.5;
      if (topicMatch) score *= 1.3;
    }

    // Apply strength as multiplier
    score *= memory.strength;

    // Apply recency boost
    const ageHours = (Date.now() - memory.createdAt) / (1000 * 60 * 60);
    score *= Math.exp(-ageHours / 24); // Decay over 24 hours

    return Math.min(1, score);
  }

  async findSimilar(content: string, limit = 5): Promise<MemorySearchResult[]> {
    // Simple implementation: search by content words
    // Future: use embeddings from FrankenSQLite
    const words = content
      .toLowerCase()
      .split(/\s+/)
      .filter((w) => w.length > 3);
    const query: MemoryQuery = {
      text: words.join(" "),
      limit,
      includeLowerLayers: true,
    };
    return this.query(query);
  }

  async promote(id: string, toLayer: MemoryLayer): Promise<void> {
    const fromLayers: MemoryLayer[] = ["ephemeral", "session", "recent", "longterm"];
    const fromIndex = fromLayers.indexOf(toLayer);

    for (let i = 0; i < fromIndex; i++) {
      const layer = this.layers.get(fromLayers[i]);
      const memory = layer?.get(id);
      if (memory) {
        layer?.delete(id);
        this.layers.get(toLayer)?.set(id, memory);
        return;
      }
    }
  }

  async demote(id: string, toLayer: MemoryLayer): Promise<void> {
    const toLayers: MemoryLayer[] = ["longterm", "recent", "session", "ephemeral"];
    const toIndex = toLayers.indexOf(toLayer);

    for (let i = 0; i < toIndex; i++) {
      const layer = this.layers.get(toLayers[i]);
      const memory = layer?.get(id);
      if (memory) {
        layer?.delete(id);
        this.layers.get(toLayer)?.set(id, memory);
        return;
      }
    }
  }

  async getLayer(layer: MemoryLayer): Promise<Memory[]> {
    const layerMap = this.layers.get(layer);
    return layerMap ? Array.from(layerMap.values()).map((m) => ({ ...m })) : [];
  }

  async decay(factor: number): Promise<void> {
    for (const [, layer] of this.layers) {
      for (const memory of layer.values()) {
        memory.strength *= factor;
      }
    }
  }

  async prune(threshold: number): Promise<number> {
    let count = 0;
    for (const [layerName, layer] of this.layers) {
      // Don't prune longterm layer automatically
      if (layerName === "longterm") continue;

      for (const [id, memory] of layer) {
        if (memory.strength < threshold) {
          layer.delete(id);
          count++;
        }
      }
    }
    return count;
  }

  async export_(layer?: MemoryLayer): Promise<Memory[]> {
    if (layer !== undefined) {
      return this.getLayer(layer);
    }

    const all: Memory[] = [];
    for (const [, layer] of this.layers) {
      for (const memory of layer.values()) {
        all.push({ ...memory });
      }
    }
    return all;
  }

  async import(memories: Memory[], layer: MemoryLayer): Promise<void> {
    for (const memory of memories) {
      await this.store({ ...memory }, layer);
    }
  }

  async stats(): Promise<MemoryStats> {
    const all: Memory[] = [];
    const byLayer: Record<MemoryLayer, number> = {
      ephemeral: 0,
      session: 0,
      recent: 0,
      longterm: 0,
    };
    const byType: Record<MemoryType, number> = {
      learning: 0,
      pattern: 0,
      trap: 0,
      decision: 0,
      context: 0,
      error: 0,
      success: 0,
    };

    let totalStrength = 0;
    let oldestAt = Date.now();
    let newestAt = 0;

    for (const [layerName, layer] of this.layers) {
      byLayer[layerName] = layer.size;
      for (const memory of layer.values()) {
        all.push(memory);
        byType[memory.type]++;
        totalStrength += memory.strength;
        oldestAt = Math.min(oldestAt, memory.createdAt);
        newestAt = Math.max(newestAt, memory.createdAt);
      }
    }

    return {
      total: all.length,
      byLayer,
      byType,
      avgStrength: all.length > 0 ? totalStrength / all.length : 0,
      oldestAt: all.length > 0 ? oldestAt : 0,
      newestAt: all.length > 0 ? newestAt : 0,
    };
  }
}

// ============================================================================
// FACTORY
// ============================================================================

let globalStore: MemoryStore | null = null;

/**
 * Get or create the global memory store.
 * Default: in-memory implementation.
 * Future: detect and use FrankenSQLite when available.
 */
export function getMemoryStore(): MemoryStore {
  if (!globalStore) {
    globalStore = new InMemoryStore();
  }
  return globalStore;
}

/**
 * Set a custom memory store (e.g., FrankenSQLite-backed).
 */
export function setMemoryStore(store: MemoryStore): void {
  globalStore = store;
}

/**
 * Create a memory ID.
 */
export function createMemoryId(): string {
  return `mem_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
}

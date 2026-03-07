/**
 * State initialization for the self tool.
 * Factory functions to create each layer's state.
 */

import { createOperationLog, createPatternDetector } from "./perception.ts";
import type {
  BranchRegistry,
  PatternStore,
  SelfConfig,
  SelfState,
  SignalLog,
  TrapRegistry,
} from "./types.ts";

// ============================================================================
// DEFAULT CONFIGURATION
// ============================================================================

export const DEFAULT_CONFIG: SelfConfig = {
  maxOperationLogSize: 500,
  patternDetectionThreshold: 3,
  patternDecayRate: 0.1,
  trapProximityThreshold: 0.5,
};

// ============================================================================
// STATE FACTORIES
// ============================================================================

export function createBranchRegistry(): BranchRegistry {
  return {
    branches: new Map(),
    activeBranchCount: 0,
  };
}

export function createSignalLog(): SignalLog {
  return {
    confidenceSignals: [],
    helpRequests: [],
    lastSignalAt: 0,
  };
}

export function createPatternStore(): PatternStore {
  return {
    patterns: new Map(),
    topicsIndex: new Map(),
  };
}

export function createTrapRegistry(): TrapRegistry {
  return {
    traps: new Map(),
    proximityThreshold: DEFAULT_CONFIG.trapProximityThreshold,
  };
}

export function createSelfState(config: Partial<SelfConfig> = {}): SelfState {
  return {
    operations: createOperationLog(),
    patterns: createPatternDetector(),
    branches: createBranchRegistry(),
    signals: createSignalLog(),
    learnings: createPatternStore(),
    traps: createTrapRegistry(),
    checkpoints: [],
    followups: [],
    config: { ...DEFAULT_CONFIG, ...config },
  };
}

// ============================================================================
// STATE RESET HELPERS
// ============================================================================

export function resetPerceptionState(state: SelfState): void {
  state.operations = createOperationLog();
  state.patterns = createPatternDetector();
}

export function resetDirectionState(state: SelfState): void {
  state.branches = createBranchRegistry();
  state.signals = createSignalLog();
}

export function resetAllState(state: SelfState): void {
  resetPerceptionState(state);
  resetDirectionState(state);
  // Keep crystallization and protection state across compaction
  // (learnings and traps should persist within session)
}

// ============================================================================
// STATE PERSISTENCE (for session boundaries)
// ============================================================================

export interface SerializedSelfState {
  learnings: Array<{
    id: string;
    topic: string;
    content: string;
    context: string;
    crystallizedAt: number;
    strength: number;
  }>;
  traps: Array<{
    id: string;
    description: string;
    context: string;
    triggers: string[];
    encounterCount: number;
  }>;
}

export function serializeState(state: SelfState): SerializedSelfState {
  return {
    learnings: Array.from(state.learnings.patterns.values()).map((p) => ({
      id: p.id,
      topic: p.topic,
      content: p.content,
      context: p.context,
      crystallizedAt: p.crystallizedAt,
      strength: p.strength,
    })),
    traps: Array.from(state.traps.traps.values()).map((t) => ({
      id: t.id,
      description: t.description,
      context: t.context,
      triggers: t.triggers,
      encounterCount: t.encounterCount,
    })),
  };
}

export function deserializeState(serialized: SerializedSelfState, state: SelfState): void {
  // Restore learnings
  for (const p of serialized.learnings) {
    state.learnings.patterns.set(p.id, {
      ...p,
      lastAccessedAt: p.crystallizedAt,
      accessCount: 0,
    });

    if (!state.learnings.topicsIndex.has(p.topic)) {
      state.learnings.topicsIndex.set(p.topic, new Set());
    }
    state.learnings.topicsIndex.get(p.topic)?.add(p.id);
  }

  // Restore traps
  for (const t of serialized.traps) {
    state.traps.traps.set(t.id, {
      ...t,
      markedAt: Date.now(),
    });
  }
}

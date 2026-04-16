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
    ontologyCandidates: new Map(),
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
  ontologyCandidates: Array<{
    id: string;
    type: "ontology_candidate";
    candidateKind: "concept" | "relation";
    proposedScopeHint: "repo" | "company" | "core" | "unknown";
    titleHint?: string;
    labelHints: string[];
    description: string;
    evidence: {
      files?: string[];
      commands?: string[];
      diaryRefs?: string[];
      sessionIds?: string[];
      repeatedPhrases?: string[];
    };
    confidence: number;
    createdAt: number;
    lastAccessedAt: number;
    accessCount: number;
    source: "crystallized" | "inferred" | "session";
    metadata: {
      proposedIdHint?: string;
      duplicateRisk?: "low" | "medium" | "high";
      rejectionReason?: string;
      promotedTo?: string;
    };
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
    ontologyCandidates: Array.from(state.learnings.ontologyCandidates.values()).map(
      (candidate) => ({
        ...candidate,
        labelHints: [...candidate.labelHints],
        evidence: {
          files: candidate.evidence.files ? [...candidate.evidence.files] : undefined,
          commands: candidate.evidence.commands ? [...candidate.evidence.commands] : undefined,
          diaryRefs: candidate.evidence.diaryRefs ? [...candidate.evidence.diaryRefs] : undefined,
          sessionIds: candidate.evidence.sessionIds
            ? [...candidate.evidence.sessionIds]
            : undefined,
          repeatedPhrases: candidate.evidence.repeatedPhrases
            ? [...candidate.evidence.repeatedPhrases]
            : undefined,
        },
        metadata: { ...candidate.metadata },
      }),
    ),
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

  for (const candidate of serialized.ontologyCandidates ?? []) {
    state.learnings.ontologyCandidates.set(candidate.id, {
      ...candidate,
      labelHints: [...candidate.labelHints],
      evidence: {
        files: candidate.evidence.files ? [...candidate.evidence.files] : undefined,
        commands: candidate.evidence.commands ? [...candidate.evidence.commands] : undefined,
        diaryRefs: candidate.evidence.diaryRefs ? [...candidate.evidence.diaryRefs] : undefined,
        sessionIds: candidate.evidence.sessionIds ? [...candidate.evidence.sessionIds] : undefined,
        repeatedPhrases: candidate.evidence.repeatedPhrases
          ? [...candidate.evidence.repeatedPhrases]
          : undefined,
      },
      metadata: { ...candidate.metadata },
    });
  }

  // Restore traps
  for (const t of serialized.traps) {
    state.traps.traps.set(t.id, {
      ...t,
      markedAt: Date.now(),
    });
  }
}

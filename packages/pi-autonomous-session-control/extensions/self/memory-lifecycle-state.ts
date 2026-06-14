import type { Memory, MemoryStore } from "./memory.ts";
import {
  clampStrength,
  isNonEmptyString,
  isRecord,
  LOAD_LAYER_PRIORITY,
  PERSISTED_LAYER,
  SCOPED_MEMORY_TYPES,
  toNonNegativeInteger,
  toNonNegativeNumber,
  toStringArray,
  VALID_LAYERS,
} from "./memory-lifecycle-codec.ts";
import type { ContinuationCandidate, OntologyCandidateMemory, SelfState } from "./types.ts";

export async function clearScopedMemories(store: MemoryStore): Promise<void> {
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

function actionCheckpointMemoryFromState(state: SelfState): Memory[] {
  return state.checkpoints.map((checkpoint) => ({
    id: checkpoint.id,
    type: "checkpoint",
    content: checkpoint.reason,
    context: "Self action checkpoint",
    topic: "checkpoint",
    topics: ["checkpoint", checkpoint.label, checkpoint.entryId].filter((value): value is string =>
      Boolean(value),
    ),
    strength: 1,
    createdAt: checkpoint.createdAt,
    lastAccessedAt: checkpoint.createdAt,
    accessCount: 0,
    source: "session",
    metadata: {
      label: checkpoint.label,
      entryId: checkpoint.entryId,
    },
  }));
}

function actionFollowupMemoryFromState(state: SelfState): Memory[] {
  return state.followups.map((followup) => ({
    id: followup.id,
    type: "followup",
    content: followup.text,
    context: followup.context || "Self action follow-up",
    topic: "followup",
    topics: ["followup", followup.context].filter((value): value is string => Boolean(value)),
    strength: followup.delivered ? 0.5 : 1,
    createdAt: followup.queuedAt,
    lastAccessedAt: followup.queuedAt,
    accessCount: followup.delivered ? 1 : 0,
    source: "session",
    metadata: {
      context: followup.context,
      delivered: followup.delivered,
    },
  }));
}

function continuationCandidateMemoryFromState(state: SelfState): Memory[] {
  return state.continuationCandidates.map((candidate) => ({
    id: candidate.id,
    type: "continuation_candidate",
    content: candidate.prefillText,
    context: candidate.reason,
    topic: "continuation_candidate",
    topics: ["continuation_candidate", candidate.cwd, candidate.owner, candidate.slice],
    strength: 1,
    createdAt: candidate.createdAt,
    lastAccessedAt: candidate.createdAt,
    accessCount: 0,
    source: "session",
    metadata: {
      kind: candidate.kind,
      cwd: candidate.cwd,
      slice: candidate.slice,
      owner: candidate.owner,
      reason: candidate.reason,
      evidence: [...candidate.evidence],
      nonAuthorizations: [...candidate.nonAuthorizations],
      score: candidate.score,
      confidence: candidate.confidence,
      source: candidate.source,
      expiresAt: candidate.expiresAt,
    },
  }));
}

function ontologyCandidateMemoryFromState(state: SelfState): Memory[] {
  return Array.from(state.learnings.ontologyCandidates.values()).map((candidate) => ({
    id: candidate.id,
    type: "ontology_candidate",
    content: candidate.description,
    context: `Ontology candidate memory (${candidate.candidateKind})`,
    topic: candidate.titleHint ?? candidate.labelHints[0] ?? candidate.candidateKind,
    topics: Array.from(
      new Set(
        [
          candidate.titleHint,
          ...candidate.labelHints,
          candidate.candidateKind,
          candidate.proposedScopeHint,
        ].filter((value): value is string => Boolean(value)),
      ),
    ),
    strength: clampStrength(candidate.confidence),
    createdAt: candidate.createdAt,
    lastAccessedAt: candidate.lastAccessedAt,
    accessCount: candidate.accessCount,
    source: candidate.source,
    metadata: {
      candidateKind: candidate.candidateKind,
      proposedScopeHint: candidate.proposedScopeHint,
      titleHint: candidate.titleHint,
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
      proposedIdHint: candidate.metadata.proposedIdHint,
      duplicateRisk: candidate.metadata.duplicateRisk,
      rejectionReason: candidate.metadata.rejectionReason,
      promotedTo: candidate.metadata.promotedTo,
    },
  }));
}

export async function writeScopedStateToStore(state: SelfState, store: MemoryStore): Promise<void> {
  await clearScopedMemories(store);

  for (const memory of patternMemoryFromState(state)) {
    await store.store(memory, PERSISTED_LAYER);
  }

  for (const memory of ontologyCandidateMemoryFromState(state)) {
    await store.store(memory, PERSISTED_LAYER);
  }

  for (const memory of trapMemoryFromState(state)) {
    await store.store(memory, PERSISTED_LAYER);
  }

  for (const memory of actionCheckpointMemoryFromState(state)) {
    await store.store(memory, PERSISTED_LAYER);
  }

  for (const memory of actionFollowupMemoryFromState(state)) {
    await store.store(memory, PERSISTED_LAYER);
  }

  for (const memory of continuationCandidateMemoryFromState(state)) {
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

function addCheckpointFromMemory(state: SelfState, memory: Memory): void {
  const metadata = isRecord(memory.metadata) ? memory.metadata : {};
  const label = isNonEmptyString(metadata.label) ? metadata.label.trim() : memory.id;
  const entryId = isNonEmptyString(metadata.entryId) ? metadata.entryId.trim() : undefined;

  state.checkpoints.push({
    id: memory.id,
    label,
    reason: memory.content,
    entryId,
    createdAt: memory.createdAt,
  });
}

function addFollowupFromMemory(state: SelfState, memory: Memory): void {
  const metadata = isRecord(memory.metadata) ? memory.metadata : {};
  const context = isNonEmptyString(metadata.context)
    ? metadata.context.trim()
    : memory.context === "Self action follow-up"
      ? ""
      : memory.context;

  state.followups.push({
    id: memory.id,
    text: memory.content,
    context,
    queuedAt: memory.createdAt,
    delivered: metadata.delivered === true,
  });
}

function addContinuationCandidateFromMemory(state: SelfState, memory: Memory): void {
  const metadata = isRecord(memory.metadata) ? memory.metadata : {};
  const cwd = isNonEmptyString(metadata.cwd) ? metadata.cwd.trim() : "";
  const slice = isNonEmptyString(metadata.slice) ? metadata.slice.trim() : "unknown";
  const owner = isNonEmptyString(metadata.owner) ? metadata.owner.trim() : "unknown";
  const expiresAt = toNonNegativeNumber(metadata.expiresAt) ?? memory.createdAt;
  const score = toNonNegativeNumber(metadata.score) ?? 0;
  const confidence =
    metadata.confidence === "high" ||
    metadata.confidence === "medium" ||
    metadata.confidence === "low"
      ? metadata.confidence
      : "low";
  if (!cwd || expiresAt <= Date.now()) {
    return;
  }

  const candidate: ContinuationCandidate = {
    kind: "self.continuation_candidate.v1",
    id: memory.id,
    cwd,
    slice,
    owner,
    prefillText: memory.content,
    reason: isNonEmptyString(metadata.reason) ? metadata.reason.trim() : memory.context,
    evidence: toStringArray(metadata.evidence),
    nonAuthorizations: toStringArray(metadata.nonAuthorizations),
    score,
    confidence,
    source: "mirror_only",
    createdAt: memory.createdAt,
    expiresAt,
  };

  state.continuationCandidates.push(candidate);
}

function addOntologyCandidateFromMemory(state: SelfState, memory: Memory): void {
  const metadata = isRecord(memory.metadata) ? memory.metadata : {};
  const evidence = isRecord(metadata.evidence) ? metadata.evidence : {};
  const candidateKind =
    metadata.candidateKind === "relation" || metadata.candidateKind === "concept"
      ? metadata.candidateKind
      : "concept";
  const proposedScopeHint =
    metadata.proposedScopeHint === "repo" ||
    metadata.proposedScopeHint === "company" ||
    metadata.proposedScopeHint === "core" ||
    metadata.proposedScopeHint === "unknown"
      ? metadata.proposedScopeHint
      : "unknown";
  const titleHint = isNonEmptyString(metadata.titleHint) ? metadata.titleHint.trim() : undefined;
  const labelHints = toStringArray(metadata.labelHints);
  const duplicateRisk =
    metadata.duplicateRisk === "low" ||
    metadata.duplicateRisk === "medium" ||
    metadata.duplicateRisk === "high"
      ? metadata.duplicateRisk
      : undefined;

  const candidate: OntologyCandidateMemory = {
    id: memory.id,
    type: "ontology_candidate",
    candidateKind,
    proposedScopeHint,
    titleHint,
    labelHints: labelHints.length > 0 ? labelHints : titleHint ? [titleHint] : [],
    description: memory.content,
    evidence: {
      files: toStringArray(evidence.files),
      commands: toStringArray(evidence.commands),
      diaryRefs: toStringArray(evidence.diaryRefs),
      sessionIds: toStringArray(evidence.sessionIds),
      repeatedPhrases: toStringArray(evidence.repeatedPhrases),
    },
    confidence: clampStrength(memory.strength),
    createdAt: memory.createdAt,
    lastAccessedAt: Math.max(memory.createdAt, memory.lastAccessedAt),
    accessCount: memory.accessCount,
    source:
      memory.source === "session" || memory.source === "inferred" ? memory.source : "crystallized",
    metadata: {
      proposedIdHint: isNonEmptyString(metadata.proposedIdHint)
        ? metadata.proposedIdHint.trim()
        : undefined,
      duplicateRisk,
      rejectionReason: isNonEmptyString(metadata.rejectionReason)
        ? metadata.rejectionReason.trim()
        : undefined,
      promotedTo: isNonEmptyString(metadata.promotedTo) ? metadata.promotedTo.trim() : undefined,
    },
  };

  state.learnings.ontologyCandidates.set(memory.id, candidate);
}

export async function hydrateScopedStateFromStore(
  state: SelfState,
  store: MemoryStore,
): Promise<void> {
  state.learnings.patterns.clear();
  state.learnings.topicsIndex.clear();
  state.learnings.ontologyCandidates.clear();
  state.traps.traps.clear();
  state.checkpoints.length = 0;
  state.followups.length = 0;
  state.continuationCandidates.length = 0;

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

      if (memory.type === "ontology_candidate") {
        addOntologyCandidateFromMemory(state, memory);
      }

      if (memory.type === "trap") {
        addTrapFromMemory(state, memory);
      }

      if (memory.type === "checkpoint") {
        addCheckpointFromMemory(state, memory);
      }

      if (memory.type === "followup") {
        addFollowupFromMemory(state, memory);
      }

      if (memory.type === "continuation_candidate") {
        addContinuationCandidateFromMemory(state, memory);
      }
    }
  }
}

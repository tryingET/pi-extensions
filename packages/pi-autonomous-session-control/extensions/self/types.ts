/**
 * Types for the Transcendent Autonomy Architecture.
 * The self tool provides mirrors, not managers.
 */

// ============================================================================
// OPERATION LOG (Perception Layer)
// ============================================================================

export interface FileOperation {
  type: "create" | "modify" | "delete";
  path: string;
  timestamp: number;
  linesDelta: number; // + for added, - for removed
}

export interface CommandExecution {
  command: string; // Normalized form
  rawCommand: string;
  timestamp: number;
  success: boolean;
  productiveWorkflow?: boolean;
  recoveryEvidence?: boolean;
}

export interface ErrorEncounter {
  toolName: string;
  signature: string; // Normalized error pattern
  rawMessage: string;
  timestamp: number;
  lastSeen?: number;
  count: number;
  activeCount?: number;
  recoveredAt?: number;
}

export interface SessionLifecycleEvent {
  type: "session_start";
  reason: "startup" | "reload" | "new" | "resume" | "fork";
  timestamp: number;
  source: "pi.session_start";
  previousSessionFile?: string;
}

export interface OperationLog {
  fileOps: FileOperation[];
  commands: CommandExecution[];
  errors: ErrorEncounter[];
  lifecycleEvents: SessionLifecycleEvent[];
  sessionStartAt: number;
  lastMeaningfulChangeAt: number;
  turnCount: number;
  turnsSinceMeaningfulChange: number;
}

// ============================================================================
// PATTERN DETECTOR (Perception Layer)
// ============================================================================

export interface DetectedPattern {
  type: "edit_loop" | "command_loop" | "error_loop" | "stall" | "progress";
  key: string;
  count: number;
  firstSeen: number;
  lastSeen: number;
  severity: "info" | "warning" | "critical";
}

export interface PatternDetector {
  detected: DetectedPattern[];
  lastAnalysisAt: number;
}

// ============================================================================
// BRANCH REGISTRY (Direction Layer)
// ============================================================================

export interface ExplorationBranch {
  id: string;
  objective: string;
  spawnedAt: number;
  entryId: string;
  status: "active" | "merged" | "abandoned";
  summary?: string;
}

export interface BranchRegistry {
  branches: Map<string, ExplorationBranch>;
  activeBranchCount: number;
}

// ============================================================================
// SIGNAL LOG (Direction Layer)
// ============================================================================

export interface ConfidenceSignal {
  level: "high" | "medium" | "low" | "blocked";
  context: string;
  timestamp: number;
}

export interface HelpRequest {
  topic: string;
  context: string;
  urgency: "low" | "medium" | "high";
  timestamp: number;
  resolved: boolean;
}

export interface SignalLog {
  confidenceSignals: ConfidenceSignal[];
  helpRequests: HelpRequest[];
  lastSignalAt: number;
}

// ============================================================================
// PATTERN STORE (Crystallization Layer)
// ============================================================================

export interface CrystallizedPattern {
  id: string;
  topic: string;
  content: string;
  context: string; // Where/when it was learned
  crystallizedAt: number;
  lastAccessedAt: number;
  accessCount: number;
  strength: number; // 0-1, decays over time
}

export interface SemanticPressureAnnotation {
  id: string;
  type: "ontology_candidate"; // legacy storage discriminator retained for compatibility
  candidateKind: "concept" | "relation"; // legacy field name retained for compatibility
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
  confidence: number; // 0-1
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
}

export type OntologyCandidateMemory = SemanticPressureAnnotation;

export interface PatternStore {
  patterns: Map<string, CrystallizedPattern>;
  topicsIndex: Map<string, Set<string>>; // topic -> pattern IDs
  ontologyCandidates: Map<string, OntologyCandidateMemory>;
}

// ============================================================================
// TRAP REGISTRY (Protection Layer)
// ============================================================================

export interface KnownTrap {
  id: string;
  description: string;
  context: string; // When/why it was marked
  topic?: string; // Retrieval-only category; never a proximity trigger
  triggers: string[]; // Patterns that indicate proximity
  markedAt: number;
  encounterCount: number;
}

export interface TrapRegistry {
  traps: Map<string, KnownTrap>;
  proximityThreshold: number;
}

// ============================================================================
// CHECKPOINT REGISTRY (Action Layer)
// ============================================================================

export interface Checkpoint {
  id: string;
  label: string;
  reason: string;
  entryId?: string;
  createdAt: number;
}

export interface FollowupMessage {
  id: string;
  text: string;
  context: string;
  queuedAt: number;
  delivered: boolean;
}

export interface ContinuationCandidate {
  kind: "self.continuation_candidate.v1";
  id: string;
  cwd: string;
  slice: string;
  owner: string;
  prefillText: string;
  reason: string;
  evidence: string[];
  nonAuthorizations: string[];
  score: number;
  confidence: "low" | "medium" | "high";
  source: "mirror_only";
  createdAt: number;
  expiresAt: number;
}

export interface SelfEvolutionCandidate {
  kind: "self.evolution_candidate.v1";
  candidateId: string;
  sessionId: string;
  issuedAt: number;
  friction: string;
  hypothesis: string;
  falsifier: string;
  metric: string;
  owner: string;
  autonomyLevel: string;
  nextSafeTest: string;
  executionReady: boolean;
  evidenceSufficiency:
    | "insufficient_evidence"
    | "caller_claim_only"
    | "caller_claim_corroborated"
    | "host_observed_friction";
  ownerRoutingStatus: "allowed" | "unknown_owner";
  confidence: "insufficient" | "low" | "medium" | "high";
  nonAuthorizations: string[];
  insightPromotionCue: Record<string, unknown>;
  reflectionGuard: Record<string, unknown>;
  liveRuntimeProofGuard: Record<string, unknown>;
  [key: string]: unknown;
}

export type SuggestionFeedbackOutcome = "helpful" | "ignored" | "stale" | "wrong-owner" | "unsafe";

export interface SuggestionFeedback {
  kind: "self.suggestion_feedback.v1";
  id: string;
  outcome: SuggestionFeedbackOutcome;
  targetKind: string;
  targetId?: string;
  bound: boolean;
  note: string;
  owner: string;
  sourceQuery: string;
  recordedAt: number;
  boundary: string;
  nonAuthorizations: string[];
}

// ============================================================================
// SELF STATE (Aggregate)
// ============================================================================

export interface LiveRuntimeProofStateEvent {
  kind: "self.live_runtime_proof_event.v1";
  schemaVersion: 1;
  runId: string;
  tier: "packageCheck" | "install" | "reload" | "postReloadDogfood";
  sequence: 1 | 2 | 3 | 4;
  status: "observed";
  packageName: "pi-autonomous-session-control";
  packageRoot: string;
  observedAt: number;
  source: "pi.tool_result.bash" | "pi.session_start.reload" | "pi.tool_result.self";
  sourceFingerprint: string;
  toolCallId?: string;
  command?: string;
}

export interface LiveRuntimeProofStateInvalidation {
  kind: "self.live_runtime_proof_invalidation.v1";
  schemaVersion: 1;
  packageName: "pi-autonomous-session-control";
  packageRoot: string;
  observedAt: number;
  source: "pi.tool_call.file_mutation" | "pi.session_start.non_reload";
  reason: string;
}

export type LiveRuntimeProofStateEntry =
  | LiveRuntimeProofStateEvent
  | LiveRuntimeProofStateInvalidation;

export interface SelfState {
  // Perception
  operations: OperationLog;
  patterns: PatternDetector;

  // Branch-local machine receipts; mirror-only and reconstructed from Pi session entries.
  liveRuntimeProofEvents: LiveRuntimeProofStateEntry[];

  // Direction
  branches: BranchRegistry;
  signals: SignalLog;

  // Crystallization
  learnings: PatternStore;

  // Protection
  traps: TrapRegistry;

  // Actions
  checkpoints: Checkpoint[];
  followups: FollowupMessage[];
  continuationCandidates: ContinuationCandidate[];

  // Session-local typed candidate/feedback mirror (not durable owner evidence)
  evolutionCandidates: SelfEvolutionCandidate[];
  suggestionFeedback: SuggestionFeedback[];

  // Configuration
  config: SelfConfig;
}

export interface SelfConfig {
  maxOperationLogSize: number;
  patternDetectionThreshold: number;
  patternDecayRate: number;
  trapProximityThreshold: number;
}

// ============================================================================
// QUERY/RESPONSE TYPES
// ============================================================================

export interface SelfQuery {
  query: string;
  context?: Record<string, unknown>;
}

export interface SelfResponse {
  understood: boolean;
  intent:
    | "perception"
    | "direction"
    | "crystallization"
    | "protection"
    | "action"
    | "meta"
    | "unknown";
  answer: string;
  data?: unknown;
  suggestions?: string[];
}

// ============================================================================
// QUERY INTENT TYPES (Internal)
// ============================================================================

export type PerceptionIntent =
  | "files_touched"
  | "commands_run"
  | "errors_encountered"
  | "am_i_looping"
  | "progress_status"
  | "time_since_change"
  | "success_rate"
  | "session_summary";

export type DirectionIntent =
  | "spawn_branch"
  | "compare_branches"
  | "signal_confidence"
  | "request_help"
  | "list_branches";

export type CrystallizationIntent =
  | "remember_pattern"
  | "recall_patterns"
  | "query_learning"
  | "forget_pattern"
  | "remember_ontology_candidate"
  | "recall_ontology_candidates"
  | "forget_ontology_candidate"
  | "reject_ontology_candidate"
  | "remember_semantic_pressure_annotation"
  | "recall_semantic_pressure_annotations"
  | "forget_semantic_pressure_annotation"
  | "reject_semantic_pressure_annotation";

export type ProtectionIntent = "mark_trap" | "check_traps" | "trap_proximity" | "list_traps";

export type ActionIntent =
  | "create_checkpoint"
  | "queue_followup"
  | "prefill_editor"
  | "prefill_visible_loop_self_evolution"
  | "launch_visible_loop_self_evolution"
  | "prefill_autoresearch_campaign"
  | "launch_autoresearch_campaign"
  | "continue_suggested_next_move"
  | "record_continuation_candidate"
  | "send_user_message"
  | "continue_diagnostic_review"
  | "prefill_diagnostic_record"
  | "self_contained_handoff_prompt"
  | "list_action_state";

export type MetaIntent =
  | "list_capabilities"
  | "diagnostic_review"
  | "record_feedback"
  | "list_feedback"
  | "memory_lifecycle_status"
  | "autonomy_status"
  | "cache_routing";

export type QueryIntent =
  | { domain: "perception"; intent: PerceptionIntent }
  | { domain: "direction"; intent: DirectionIntent }
  | { domain: "crystallization"; intent: CrystallizationIntent }
  | { domain: "protection"; intent: ProtectionIntent }
  | { domain: "action"; intent: ActionIntent }
  | { domain: "meta"; intent: MetaIntent }
  | { domain: "unknown"; intent: string };

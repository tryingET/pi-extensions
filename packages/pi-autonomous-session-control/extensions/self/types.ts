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
}

export interface ErrorEncounter {
  toolName: string;
  signature: string; // Normalized error pattern
  rawMessage: string;
  timestamp: number;
  lastSeen?: number;
  count: number;
}

export interface OperationLog {
  fileOps: FileOperation[];
  commands: CommandExecution[];
  errors: ErrorEncounter[];
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

export interface PatternStore {
  patterns: Map<string, CrystallizedPattern>;
  topicsIndex: Map<string, Set<string>>; // topic -> pattern IDs
}

// ============================================================================
// TRAP REGISTRY (Protection Layer)
// ============================================================================

export interface KnownTrap {
  id: string;
  description: string;
  context: string; // When/why it was marked
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

// ============================================================================
// SELF STATE (Aggregate)
// ============================================================================

export interface SelfState {
  // Perception
  operations: OperationLog;
  patterns: PatternDetector;

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
  | "forget_pattern";

export type ProtectionIntent = "mark_trap" | "check_traps" | "trap_proximity" | "list_traps";

export type ActionIntent = "create_checkpoint" | "queue_followup" | "prefill_editor";

export type MetaIntent = "list_capabilities";

export type QueryIntent =
  | { domain: "perception"; intent: PerceptionIntent }
  | { domain: "direction"; intent: DirectionIntent }
  | { domain: "crystallization"; intent: CrystallizationIntent }
  | { domain: "protection"; intent: ProtectionIntent }
  | { domain: "action"; intent: ActionIntent }
  | { domain: "meta"; intent: MetaIntent }
  | { domain: "unknown"; intent: string };

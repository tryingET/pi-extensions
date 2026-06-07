import type { MetricDirection } from "./runtime.ts";

export const AUTORESEARCH_PROMPT_PLANE_MODULE_SPECIFIER = "@tryinget/pi-vault-client/prompt-plane";

export const AUTORESEARCH_SETUP_TEMPLATE_NAME = "pi-autoresearch-setup";
export const AUTORESEARCH_NEXT_HYPOTHESIS_TEMPLATE_NAME = "pi-autoresearch-next-hypothesis";
export const AUTORESEARCH_FINALIZE_TEMPLATE_NAME = "pi-autoresearch-finalize";

export const AUTORESEARCH_DECISION_TEMPLATE_NAMES = [
  AUTORESEARCH_SETUP_TEMPLATE_NAME,
  AUTORESEARCH_NEXT_HYPOTHESIS_TEMPLATE_NAME,
  AUTORESEARCH_FINALIZE_TEMPLATE_NAME,
] as const;

export type AutoresearchDecisionTemplateName =
  (typeof AUTORESEARCH_DECISION_TEMPLATE_NAMES)[number];

export type AutoresearchDecisionKind = "setup" | "next_hypothesis" | "finalize";
export type SetupDecisionStatus = "ready" | "blocked";
export type NextHypothesisDecisionStatus =
  | "ready"
  | "rebaseline_needed"
  | "finalize_candidate"
  | "blocked";
export type FinalizeDecisionStatus = "ready" | "blocked";
export type SetupDecisionChecksRequired =
  | "none"
  | "reuse_existing_checks"
  | "create_autoresearch_checks_sh";
export type AutoresearchDecisionFailureStage = "prompt_plane" | "executor" | "parse";

export interface SetupDecisionPrimaryMetric {
  name: string;
  unit: string;
  direction: MetricDirection;
}

export interface SetupDecisionPacket {
  optimizationObjective: string;
  repoContext: readonly string[];
  filesInScope: readonly string[];
  offLimits: readonly string[];
  benchmarkSurfaces: readonly string[];
  existingArtifacts: readonly string[];
  hardConstraints: readonly string[];
  blockers?: readonly string[];
  akTask?: {
    id?: number;
    scopeSummary?: readonly string[];
    allowedPaths?: readonly string[];
    requiredPaths?: readonly string[];
  } | null;
}

export interface SetupDecisionResult {
  kind: "setup";
  templateName: typeof AUTORESEARCH_SETUP_TEMPLATE_NAME;
  status: SetupDecisionStatus;
  goal: string;
  primaryMetric: SetupDecisionPrimaryMetric;
  secondaryMetrics: string[];
  benchmarkCommand: string;
  filesInScope: string[];
  offLimits: string[];
  hardConstraints: string[];
  checksRequired: SetupDecisionChecksRequired;
  autoresearchMdPlan: string[];
  autoresearchShContract: string[];
  baselinePlan: string[];
  firstExperimentRules: string[];
  missingInformation: string[];
}

export interface NextHypothesisDecisionPacket {
  goal: string;
  constraints: readonly string[];
  segmentSummary: readonly string[];
  baselineHistory: readonly string[];
  recentRunHistory: readonly string[];
  checksStatus: readonly string[];
  confidenceSignals: readonly string[];
  asiNotes: readonly string[];
  deadEndMemory: readonly string[];
  filesInScope: readonly string[];
  offLimits: readonly string[];
  ideasBacklog: readonly string[];
}

export interface NextHypothesisDecisionResult {
  kind: "next_hypothesis";
  templateName: typeof AUTORESEARCH_NEXT_HYPOTHESIS_TEMPLATE_NAME;
  status: NextHypothesisDecisionStatus;
  stateRead: string;
  nextHypothesis: string;
  whyNow: string;
  targetFiles: string[];
  changeShape: string[];
  expectedPrimaryEffect: string;
  riskToGuard: string[];
  runPlan: string[];
  asiToCaptureIfKept: string[];
  asiToCaptureIfDiscarded: string[];
  stopCondition: string[];
}

export interface FinalizeDecisionPacket {
  keptRuns: readonly string[];
  campaignContext: readonly string[];
  mergeBase: string | null;
  trunkTarget: string | null;
  commitSummaries: readonly string[];
  dependencyNotes: readonly string[];
  ideasToLeaveOut: readonly string[];
}

export interface FinalizeDecisionGroup {
  title: string;
  commits: string[];
  files: string[];
  metricEffect: string;
  dependencyNotes: string[];
}

export interface FinalizeDecisionResult {
  kind: "finalize";
  templateName: typeof AUTORESEARCH_FINALIZE_TEMPLATE_NAME;
  status: FinalizeDecisionStatus;
  baseRef: string;
  trunkRef: string;
  overallResult: string;
  proposedGroups: FinalizeDecisionGroup[];
  groupingRationale: string[];
  approvalRequired: true;
  groupsJsonDraft: unknown;
  riskNotes: string[];
  cleanupHints: string[];
}

export interface AutoresearchDecisionError<
  Kind extends AutoresearchDecisionKind,
  TemplateName extends AutoresearchDecisionTemplateName,
> {
  kind: Kind;
  templateName: TemplateName;
  status: "blocked";
  failureStage: AutoresearchDecisionFailureStage;
  blockingReason: string;
  lawfulOwnerRoute: string;
  missingBindingAction: string;
  recoverySteps: string[];
  rawOutput?: string;
}

export type SetupDecisionOutcome =
  | SetupDecisionResult
  | AutoresearchDecisionError<"setup", typeof AUTORESEARCH_SETUP_TEMPLATE_NAME>;
export type NextHypothesisDecisionOutcome =
  | NextHypothesisDecisionResult
  | AutoresearchDecisionError<"next_hypothesis", typeof AUTORESEARCH_NEXT_HYPOTHESIS_TEMPLATE_NAME>;
export type FinalizeDecisionOutcome =
  | FinalizeDecisionResult
  | AutoresearchDecisionError<"finalize", typeof AUTORESEARCH_FINALIZE_TEMPLATE_NAME>;

export interface AutoresearchDecisionExecutionContext {
  cwd: string;
  currentCompany?: string;
  model?: string;
  signal?: AbortSignal;
}

export interface AutoresearchPreparedDecisionPrompt {
  kind: AutoresearchDecisionKind;
  templateName: AutoresearchDecisionTemplateName;
  cwd: string;
  currentCompany?: string;
  model?: string;
  signal?: AbortSignal;
  packetContext: string;
  preparedText: string;
  selectionMode: "exact";
  template: PreparedPromptPlaneTemplate;
}

export interface AutoresearchDecisionPromptExecutionResult {
  outputText: string;
  model?: string | null;
}

export type AutoresearchDecisionPromptExecutor = (
  input: AutoresearchPreparedDecisionPrompt,
) => Promise<AutoresearchDecisionPromptExecutionResult | string>;

export interface AutoresearchDecisionRuntime {
  runSetup(
    packet: SetupDecisionPacket,
    ctx: AutoresearchDecisionExecutionContext,
  ): Promise<SetupDecisionOutcome>;
  runNextHypothesis(
    packet: NextHypothesisDecisionPacket,
    ctx: AutoresearchDecisionExecutionContext,
  ): Promise<NextHypothesisDecisionOutcome>;
  runFinalize(
    packet: FinalizeDecisionPacket,
    ctx: AutoresearchDecisionExecutionContext,
  ): Promise<FinalizeDecisionOutcome>;
}

export interface AutoresearchDecisionRuntimeOptions {
  executePreparedPrompt?: AutoresearchDecisionPromptExecutor;
  loadPromptPlaneRuntime?: () => Promise<VaultPromptPlaneRuntime>;
}

export interface PromptPlaneExecutionContext {
  cwd?: string;
  currentCompany?: string;
}

export interface PromptSelectionRequest {
  query: string;
  context?: string;
}

export interface PreparedPromptPlaneTemplate {
  name: string;
  artifact_kind: string;
  control_mode: string;
  formalization_level: string;
  owner_company: string;
  visibility_companies: string[];
  version?: number;
  id?: number;
}

export interface PreparedPromptPlaneCandidate {
  ok: boolean;
  status: "ready" | "ambiguous" | "blocked";
  selection_mode?: "exact" | "picker-fzf" | "picker-fallback";
  template?: PreparedPromptPlaneTemplate;
  prepared_text?: string;
  blocking_reason?: string;
}

export interface VaultPromptPlaneRuntime {
  prepareSelection(
    request: PromptSelectionRequest,
    ctx?: PromptPlaneExecutionContext,
  ): Promise<PreparedPromptPlaneCandidate>;
}

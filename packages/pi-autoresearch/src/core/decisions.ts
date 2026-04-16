import type { CampaignDecision } from "../machine/events.ts";
import type { MetricDirection } from "./runtime.ts";

export const AUTORESEARCH_PROMPT_PLANE_MODULE_SPECIFIER = "pi-vault-client/prompt-plane";

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

interface PromptPlaneExecutionContext {
  cwd?: string;
  currentCompany?: string;
}

interface PromptSelectionRequest {
  query: string;
  context?: string;
}

interface PreparedPromptPlaneTemplate {
  name: string;
  artifact_kind: string;
  control_mode: string;
  formalization_level: string;
  owner_company: string;
  visibility_companies: string[];
  version?: number;
  id?: number;
}

interface PreparedPromptPlaneCandidate {
  ok: boolean;
  status: "ready" | "ambiguous" | "blocked";
  selection_mode?: "exact" | "picker-fzf" | "picker-fallback";
  template?: PreparedPromptPlaneTemplate;
  prepared_text?: string;
  blocking_reason?: string;
}

interface VaultPromptPlaneRuntime {
  prepareSelection(
    request: PromptSelectionRequest,
    ctx?: PromptPlaneExecutionContext,
  ): Promise<PreparedPromptPlaneCandidate>;
}

const SETUP_REQUIRED_SECTIONS = [
  "STATUS",
  "GOAL",
  "PRIMARY_METRIC",
  "SECONDARY_METRICS",
  "BENCHMARK_COMMAND",
  "FILES_IN_SCOPE",
  "OFF_LIMITS",
  "HARD_CONSTRAINTS",
  "CHECKS_REQUIRED",
  "AUTORESEARCH_MD_PLAN",
  "AUTORESEARCH_SH_CONTRACT",
  "BASELINE_PLAN",
  "FIRST_EXPERIMENT_RULES",
  "MISSING_INFORMATION",
] as const;

const NEXT_HYPOTHESIS_REQUIRED_SECTIONS = [
  "STATUS",
  "STATE_READ",
  "NEXT_HYPOTHESIS",
  "WHY_NOW",
  "TARGET_FILES",
  "CHANGE_SHAPE",
  "EXPECTED_PRIMARY_EFFECT",
  "RISK_TO_GUARD",
  "RUN_PLAN",
  "ASI_TO_CAPTURE_IF_KEPT",
  "ASI_TO_CAPTURE_IF_DISCARDED",
  "STOP_CONDITION",
] as const;

const FINALIZE_REQUIRED_SECTIONS = [
  "STATUS",
  "BASE_REF",
  "TRUNK_REF",
  "OVERALL_RESULT",
  "PROPOSED_GROUPS",
  "GROUPING_RATIONALE",
  "APPROVAL_REQUIRED",
  "GROUPS_JSON_DRAFT",
  "RISK_NOTES",
  "CLEANUP_HINTS",
] as const;

let defaultPromptPlaneRuntimePromise: Promise<VaultPromptPlaneRuntime> | null = null;

export function buildSetupDecisionContext(packet: SetupDecisionPacket): string {
  const objective = requirePacketText(packet.optimizationObjective, "optimizationObjective");

  return buildPacketDocument("PI-AUTORESEARCH SETUP PACKET", [
    ["Optimization objective", objective],
    ["Current repo/runtime context", formatMarkdownList(packet.repoContext)],
    ["File scope", formatMarkdownList(packet.filesInScope)],
    ["Off-limits", formatMarkdownList(packet.offLimits)],
    ["Benchmark and profiling surfaces", formatMarkdownList(packet.benchmarkSurfaces)],
    ["Existing autoresearch artifacts", formatMarkdownList(packet.existingArtifacts)],
    ["Hard constraints", formatMarkdownList(packet.hardConstraints)],
    ["Known blockers", formatMarkdownList(packet.blockers ?? [])],
    ["AK task scope reference", formatAkTaskReference(packet.akTask ?? null)],
  ]);
}

export function buildNextHypothesisDecisionContext(packet: NextHypothesisDecisionPacket): string {
  const goal = requirePacketText(packet.goal, "goal");

  return buildPacketDocument("PI-AUTORESEARCH NEXT HYPOTHESIS PACKET", [
    ["Campaign goal", goal],
    ["Constraints", formatMarkdownList(packet.constraints)],
    ["Current segment summary", formatMarkdownList(packet.segmentSummary)],
    ["Baseline and best-run history", formatMarkdownList(packet.baselineHistory)],
    ["Recent run history", formatMarkdownList(packet.recentRunHistory)],
    ["Checks status", formatMarkdownList(packet.checksStatus)],
    ["Confidence and noise signals", formatMarkdownList(packet.confidenceSignals)],
    ["ASI notes", formatMarkdownList(packet.asiNotes)],
    ["Dead-end memory", formatMarkdownList(packet.deadEndMemory)],
    ["Files in scope", formatMarkdownList(packet.filesInScope)],
    ["Off-limits", formatMarkdownList(packet.offLimits)],
    ["Ideas backlog", formatMarkdownList(packet.ideasBacklog)],
  ]);
}

export function buildFinalizeDecisionContext(packet: FinalizeDecisionPacket): string {
  return buildPacketDocument("PI-AUTORESEARCH FINALIZE PACKET", [
    ["Kept runs", formatMarkdownList(packet.keptRuns)],
    ["Campaign context", formatMarkdownList(packet.campaignContext)],
    ["Merge base", normalizeOptionalPacketText(packet.mergeBase)],
    ["Target trunk", normalizeOptionalPacketText(packet.trunkTarget)],
    ["Commit summaries", formatMarkdownList(packet.commitSummaries)],
    ["Dependency notes", formatMarkdownList(packet.dependencyNotes)],
    ["Ideas to leave out of final branches", formatMarkdownList(packet.ideasToLeaveOut)],
  ]);
}

export function parseSetupDecisionOutput(output: string): SetupDecisionResult {
  const sections = extractRequiredSections(output, SETUP_REQUIRED_SECTIONS);
  const status = parseEnumValue<SetupDecisionStatus>(sections.get("STATUS"), "STATUS", [
    "ready",
    "blocked",
  ]);
  const result: SetupDecisionResult = {
    kind: "setup",
    templateName: AUTORESEARCH_SETUP_TEMPLATE_NAME,
    status,
    goal: parseRequiredText(sections.get("GOAL"), "GOAL"),
    primaryMetric: parsePrimaryMetric(sections.get("PRIMARY_METRIC")),
    secondaryMetrics: parseStringList(sections.get("SECONDARY_METRICS"), "SECONDARY_METRICS", {
      splitOnComma: true,
    }),
    benchmarkCommand: parseRequiredText(sections.get("BENCHMARK_COMMAND"), "BENCHMARK_COMMAND"),
    filesInScope: parseStringList(sections.get("FILES_IN_SCOPE"), "FILES_IN_SCOPE", {
      splitOnComma: true,
    }),
    offLimits: parseStringList(sections.get("OFF_LIMITS"), "OFF_LIMITS", {
      splitOnComma: true,
    }),
    hardConstraints: parseStringList(sections.get("HARD_CONSTRAINTS"), "HARD_CONSTRAINTS"),
    checksRequired: parseEnumValue<SetupDecisionChecksRequired>(
      sections.get("CHECKS_REQUIRED"),
      "CHECKS_REQUIRED",
      ["none", "reuse_existing_checks", "create_autoresearch_checks_sh"],
    ),
    autoresearchMdPlan: parseStringList(
      sections.get("AUTORESEARCH_MD_PLAN"),
      "AUTORESEARCH_MD_PLAN",
    ),
    autoresearchShContract: parseStringList(
      sections.get("AUTORESEARCH_SH_CONTRACT"),
      "AUTORESEARCH_SH_CONTRACT",
    ),
    baselinePlan: parseStringList(sections.get("BASELINE_PLAN"), "BASELINE_PLAN"),
    firstExperimentRules: parseStringList(
      sections.get("FIRST_EXPERIMENT_RULES"),
      "FIRST_EXPERIMENT_RULES",
    ),
    missingInformation: parseStringList(sections.get("MISSING_INFORMATION"), "MISSING_INFORMATION"),
  };

  if (result.status === "blocked" && result.missingInformation.length === 0) {
    throw new Error("Blocked setup decisions must name the missing information.");
  }

  return result;
}

export function parseNextHypothesisDecisionOutput(output: string): NextHypothesisDecisionResult {
  const sections = extractRequiredSections(output, NEXT_HYPOTHESIS_REQUIRED_SECTIONS);

  return {
    kind: "next_hypothesis",
    templateName: AUTORESEARCH_NEXT_HYPOTHESIS_TEMPLATE_NAME,
    status: parseEnumValue<NextHypothesisDecisionStatus>(sections.get("STATUS"), "STATUS", [
      "ready",
      "rebaseline_needed",
      "finalize_candidate",
      "blocked",
    ]),
    stateRead: parseRequiredText(sections.get("STATE_READ"), "STATE_READ"),
    nextHypothesis: parseRequiredText(sections.get("NEXT_HYPOTHESIS"), "NEXT_HYPOTHESIS"),
    whyNow: parseRequiredText(sections.get("WHY_NOW"), "WHY_NOW"),
    targetFiles: parseStringList(sections.get("TARGET_FILES"), "TARGET_FILES", {
      splitOnComma: true,
    }),
    changeShape: parseStringList(sections.get("CHANGE_SHAPE"), "CHANGE_SHAPE"),
    expectedPrimaryEffect: parseRequiredText(
      sections.get("EXPECTED_PRIMARY_EFFECT"),
      "EXPECTED_PRIMARY_EFFECT",
    ),
    riskToGuard: parseStringList(sections.get("RISK_TO_GUARD"), "RISK_TO_GUARD"),
    runPlan: parseStringList(sections.get("RUN_PLAN"), "RUN_PLAN"),
    asiToCaptureIfKept: parseStringList(
      sections.get("ASI_TO_CAPTURE_IF_KEPT"),
      "ASI_TO_CAPTURE_IF_KEPT",
    ),
    asiToCaptureIfDiscarded: parseStringList(
      sections.get("ASI_TO_CAPTURE_IF_DISCARDED"),
      "ASI_TO_CAPTURE_IF_DISCARDED",
    ),
    stopCondition: parseStringList(sections.get("STOP_CONDITION"), "STOP_CONDITION"),
  };
}

export function parseFinalizeDecisionOutput(output: string): FinalizeDecisionResult {
  const sections = extractRequiredSections(output, FINALIZE_REQUIRED_SECTIONS);
  const status = parseEnumValue<FinalizeDecisionStatus>(sections.get("STATUS"), "STATUS", [
    "ready",
    "blocked",
  ]);
  const proposedGroups = parseProposedGroups(sections.get("PROPOSED_GROUPS"));

  if (status === "ready" && proposedGroups.length === 0) {
    throw new Error("Ready finalize decisions must include at least one proposed group.");
  }

  return {
    kind: "finalize",
    templateName: AUTORESEARCH_FINALIZE_TEMPLATE_NAME,
    status,
    baseRef: parseRequiredText(sections.get("BASE_REF"), "BASE_REF"),
    trunkRef: parseRequiredText(sections.get("TRUNK_REF"), "TRUNK_REF"),
    overallResult: parseRequiredText(sections.get("OVERALL_RESULT"), "OVERALL_RESULT"),
    proposedGroups,
    groupingRationale: parseStringList(sections.get("GROUPING_RATIONALE"), "GROUPING_RATIONALE"),
    approvalRequired: parseApprovalRequired(sections.get("APPROVAL_REQUIRED")),
    groupsJsonDraft: parseJsonDraft(sections.get("GROUPS_JSON_DRAFT")),
    riskNotes: parseStringList(sections.get("RISK_NOTES"), "RISK_NOTES"),
    cleanupHints: parseStringList(sections.get("CLEANUP_HINTS"), "CLEANUP_HINTS"),
  };
}

export function mapNextHypothesisStatusToCampaignDecision(
  status: NextHypothesisDecisionStatus,
): CampaignDecision {
  switch (status) {
    case "ready":
      return "iterate";
    case "rebaseline_needed":
      return "rebaseline";
    case "finalize_candidate":
      return "finalize";
    case "blocked":
      return "block";
  }
}

export function mapNextHypothesisOutcomeToCampaignDecision(
  outcome: NextHypothesisDecisionOutcome,
): CampaignDecision {
  return mapNextHypothesisStatusToCampaignDecision(outcome.status);
}

export function createAutoresearchDecisionRuntime(
  options: AutoresearchDecisionRuntimeOptions = {},
): AutoresearchDecisionRuntime {
  return {
    async runSetup(packet, ctx) {
      return await runDecisionStep({
        kind: "setup",
        templateName: AUTORESEARCH_SETUP_TEMPLATE_NAME,
        packetContext: buildSetupDecisionContext(packet),
        parseOutput: parseSetupDecisionOutput,
        ctx,
        options,
      });
    },

    async runNextHypothesis(packet, ctx) {
      return await runDecisionStep({
        kind: "next_hypothesis",
        templateName: AUTORESEARCH_NEXT_HYPOTHESIS_TEMPLATE_NAME,
        packetContext: buildNextHypothesisDecisionContext(packet),
        parseOutput: parseNextHypothesisDecisionOutput,
        ctx,
        options,
      });
    },

    async runFinalize(packet, ctx) {
      return await runDecisionStep({
        kind: "finalize",
        templateName: AUTORESEARCH_FINALIZE_TEMPLATE_NAME,
        packetContext: buildFinalizeDecisionContext(packet),
        parseOutput: parseFinalizeDecisionOutput,
        ctx,
        options,
      });
    },
  };
}

async function runDecisionStep<
  Kind extends AutoresearchDecisionKind,
  TemplateName extends AutoresearchDecisionTemplateName,
  Result,
>(input: {
  kind: Kind;
  templateName: TemplateName;
  packetContext: string;
  parseOutput: (output: string) => Result;
  ctx: AutoresearchDecisionExecutionContext;
  options: AutoresearchDecisionRuntimeOptions;
}): Promise<Result | AutoresearchDecisionError<Kind, TemplateName>> {
  const cwd = asNonEmptyString(input.ctx.cwd);
  if (!cwd) {
    return createDecisionError(
      input.kind,
      input.templateName,
      "prompt_plane",
      "Decision execution requires a cwd so Prompt Vault company resolution stays truthful.",
    );
  }

  const runtimeResult = await getPromptPlaneRuntime(input.options);
  if (!runtimeResult.ok) {
    return createDecisionError(input.kind, input.templateName, "prompt_plane", runtimeResult.error);
  }

  let preparedCandidate: PreparedPromptPlaneCandidate;
  try {
    preparedCandidate = await runtimeResult.value.prepareSelection(
      {
        query: input.templateName,
        context: input.packetContext,
      },
      {
        cwd,
        currentCompany: asNonEmptyString(input.ctx.currentCompany) ?? undefined,
      },
    );
  } catch (error) {
    return createDecisionError(
      input.kind,
      input.templateName,
      "prompt_plane",
      describeError(error),
    );
  }

  const preparedPrompt = normalizePreparedPrompt(
    input.kind,
    input.templateName,
    preparedCandidate,
    input.packetContext,
    input.ctx,
  );
  if (!preparedPrompt.ok) {
    return preparedPrompt.error;
  }

  const executor = input.options.executePreparedPrompt;
  if (!executor) {
    return createDecisionError(
      input.kind,
      input.templateName,
      "executor",
      "No decision executor configured for pi-autoresearch Prompt Vault decisions.",
    );
  }

  let rawOutput: string;
  try {
    rawOutput = normalizeExecutorOutput(await executor(preparedPrompt.value));
  } catch (error) {
    return createDecisionError(input.kind, input.templateName, "executor", describeError(error));
  }

  try {
    return input.parseOutput(rawOutput);
  } catch (error) {
    return createDecisionError(
      input.kind,
      input.templateName,
      "parse",
      describeError(error),
      rawOutput,
    );
  }
}

async function getPromptPlaneRuntime(
  options: AutoresearchDecisionRuntimeOptions,
): Promise<{ ok: true; value: VaultPromptPlaneRuntime } | { ok: false; error: string }> {
  try {
    return {
      ok: true,
      value: await (options.loadPromptPlaneRuntime ?? loadDefaultPromptPlaneRuntime)(),
    };
  } catch (error) {
    return {
      ok: false,
      error: describeError(error),
    };
  }
}

async function loadDefaultPromptPlaneRuntime(): Promise<VaultPromptPlaneRuntime> {
  try {
    defaultPromptPlaneRuntimePromise ??= (async () => {
      const promptPlaneModule = await loadModuleBySpecifier(
        AUTORESEARCH_PROMPT_PLANE_MODULE_SPECIFIER,
      );
      const createRuntime = getCreatePromptPlaneRuntime(promptPlaneModule);
      return createRuntime();
    })();

    return await defaultPromptPlaneRuntimePromise;
  } catch (error) {
    defaultPromptPlaneRuntimePromise = null;
    throw error;
  }
}

async function loadModuleBySpecifier(specifier: string): Promise<unknown> {
  return await import(specifier);
}

function getCreatePromptPlaneRuntime(moduleValue: unknown): () => VaultPromptPlaneRuntime {
  const candidate = asRecord(moduleValue);
  if (!candidate || typeof candidate.createVaultPromptPlaneRuntime !== "function") {
    throw new Error(
      `Prompt-plane module ${AUTORESEARCH_PROMPT_PLANE_MODULE_SPECIFIER} does not expose createVaultPromptPlaneRuntime().`,
    );
  }

  return candidate.createVaultPromptPlaneRuntime as () => VaultPromptPlaneRuntime;
}

function normalizePreparedPrompt<
  Kind extends AutoresearchDecisionKind,
  TemplateName extends AutoresearchDecisionTemplateName,
>(
  kind: Kind,
  templateName: TemplateName,
  candidate: PreparedPromptPlaneCandidate,
  packetContext: string,
  ctx: AutoresearchDecisionExecutionContext,
):
  | { ok: true; value: AutoresearchPreparedDecisionPrompt }
  | { ok: false; error: AutoresearchDecisionError<Kind, TemplateName> } {
  if (!candidate.ok || candidate.status !== "ready") {
    return {
      ok: false,
      error: createDecisionError(
        kind,
        templateName,
        "prompt_plane",
        candidate.blocking_reason ?? `Prompt preparation for ${templateName} was not ready.`,
      ),
    };
  }

  if (candidate.selection_mode !== "exact") {
    return {
      ok: false,
      error: createDecisionError(
        kind,
        templateName,
        "prompt_plane",
        `Prompt preparation for ${templateName} must resolve via exact-template selection, not ${candidate.selection_mode ?? "unknown"}.`,
      ),
    };
  }

  if (!candidate.template || candidate.template.name !== templateName) {
    return {
      ok: false,
      error: createDecisionError(
        kind,
        templateName,
        "prompt_plane",
        `Prompt preparation resolved ${candidate.template?.name ?? "(unknown template)"} instead of exact template ${templateName}.`,
      ),
    };
  }

  const preparedText = asNonEmptyString(candidate.prepared_text);
  if (!preparedText) {
    return {
      ok: false,
      error: createDecisionError(
        kind,
        templateName,
        "prompt_plane",
        `Prompt preparation for ${templateName} returned no prepared text.`,
      ),
    };
  }

  return {
    ok: true,
    value: {
      kind,
      templateName,
      cwd: ctx.cwd,
      currentCompany: asNonEmptyString(ctx.currentCompany) ?? undefined,
      model: asNonEmptyString(ctx.model) ?? undefined,
      signal: ctx.signal,
      packetContext,
      preparedText,
      selectionMode: "exact",
      template: candidate.template,
    },
  };
}

function normalizeExecutorOutput(
  result: AutoresearchDecisionPromptExecutionResult | string,
): string {
  if (typeof result === "string") {
    const text = result.trim();
    if (!text) {
      throw new Error("Decision executor returned an empty string.");
    }
    return text;
  }

  const text = asNonEmptyString(result.outputText);
  if (!text) {
    throw new Error("Decision executor must return a non-empty outputText string.");
  }
  return text;
}

function createDecisionError<
  Kind extends AutoresearchDecisionKind,
  TemplateName extends AutoresearchDecisionTemplateName,
>(
  kind: Kind,
  templateName: TemplateName,
  failureStage: AutoresearchDecisionFailureStage,
  blockingReason: string,
  rawOutput?: string,
): AutoresearchDecisionError<Kind, TemplateName> {
  return {
    kind,
    templateName,
    status: "blocked",
    failureStage,
    blockingReason,
    rawOutput,
  };
}

function buildPacketDocument(
  title: string,
  sections: ReadonlyArray<readonly [heading: string, body: string]>,
): string {
  const lines = [`# ${title}`, ""];

  for (const [heading, body] of sections) {
    lines.push(`## ${heading}`);
    lines.push(body.trim() || "- none");
    lines.push("");
  }

  return lines.join("\n").trim();
}

function formatMarkdownList(values: readonly string[]): string {
  if (values.length === 0) {
    return "- none";
  }

  return values
    .map((value) => normalizeListItem(value))
    .filter(Boolean)
    .map((value) => `- ${value}`)
    .join("\n");
}

function formatAkTaskReference(
  task: {
    id?: number;
    scopeSummary?: readonly string[];
    allowedPaths?: readonly string[];
    requiredPaths?: readonly string[];
  } | null,
): string {
  if (!task) {
    return "- none";
  }

  const lines = [
    typeof task.id === "number" && Number.isFinite(task.id) ? `- task id: ${task.id}` : null,
    ...formatNestedList("scope summary", task.scopeSummary ?? []),
    ...formatNestedList("allowed paths", task.allowedPaths ?? []),
    ...formatNestedList("required paths", task.requiredPaths ?? []),
  ].filter((line): line is string => Boolean(line));

  return lines.length > 0 ? lines.join("\n") : "- none";
}

function formatNestedList(label: string, values: readonly string[]): string[] {
  const items = values.map((value) => normalizeListItem(value)).filter(Boolean);
  return [`- ${label}:`, ...(items.length > 0 ? items.map((item) => `  - ${item}`) : ["  - none"])];
}

function normalizeOptionalPacketText(value: string | null): string {
  return asNonEmptyString(value) ?? "- none";
}

function requirePacketText(value: string, field: string): string {
  const normalized = asNonEmptyString(value);
  if (!normalized) {
    throw new Error(`${field} is required for decision packet construction.`);
  }
  return normalized;
}

function extractRequiredSections(
  output: string,
  requiredLabels: readonly string[],
): Map<string, string> {
  const normalizedOutput = output.replace(/\r\n?/g, "\n");
  const required = new Set(requiredLabels);
  const sections = new Map<string, string>();
  let activeLabel: string | null = null;
  let activeLines: string[] = [];

  const flush = () => {
    if (!activeLabel) return;
    sections.set(activeLabel, normalizeSectionValue(activeLines));
  };

  for (const line of normalizedOutput.split("\n")) {
    const labelMatch = /^\s*([A-Z][A-Z0-9_]*):(.*)$/.exec(line);
    if (labelMatch && required.has(labelMatch[1])) {
      if (sections.has(labelMatch[1]) || activeLabel === labelMatch[1]) {
        throw new Error(`Duplicate required section: ${labelMatch[1]}.`);
      }
      flush();
      activeLabel = labelMatch[1];
      activeLines = [labelMatch[2].trim()];
      continue;
    }

    if (activeLabel) {
      activeLines.push(line);
    }
  }

  flush();

  for (const label of requiredLabels) {
    if (!sections.has(label)) {
      throw new Error(`Missing required section: ${label}.`);
    }
  }

  return sections;
}

function normalizeSectionValue(lines: readonly string[]): string {
  const joined = lines.join("\n").trim();
  return joined;
}

function parsePrimaryMetric(value: string | undefined): SetupDecisionPrimaryMetric {
  const text = parseRequiredText(value, "PRIMARY_METRIC");
  const match = /^(.*?)\s*\((.*?),\s*(lower|higher)\s+is\s+better\)$/iu.exec(text);
  if (!match) {
    throw new Error("PRIMARY_METRIC must look like <name> (<unit>, lower|higher is better).");
  }

  const name = normalizeInlineText(match[1]);
  const unit = match[2].trim();
  const direction = match[3] as MetricDirection;
  if (!name) {
    throw new Error("PRIMARY_METRIC name cannot be empty.");
  }

  return { name, unit, direction };
}

function parseRequiredText(value: string | undefined, field: string): string {
  const normalized = normalizeInlineText(value ?? "");
  if (!normalized) {
    throw new Error(`${field} must be a non-empty string.`);
  }
  return normalized;
}

function parseStringList(
  value: string | undefined,
  field: string,
  options: { splitOnComma?: boolean } = {},
): string[] {
  const normalized = (value ?? "").trim();
  if (!normalized || /^none$/iu.test(normalized)) {
    return [];
  }

  const lineItems = normalized
    .split("\n")
    .map((line) => stripMarkdownListPrefix(line))
    .map((line) => line.trim())
    .filter(Boolean);

  const items =
    options.splitOnComma && lineItems.length <= 1 && lineItems[0]?.includes(",")
      ? lineItems[0]
          .split(",")
          .map((item) => item.trim())
          .filter(Boolean)
      : lineItems;

  const normalizedItems = items.map((item) => normalizeInlineText(item)).filter(Boolean);
  if (normalizedItems.length === 0) {
    throw new Error(`${field} must contain at least one item or 'none'.`);
  }
  return normalizedItems;
}

function parseEnumValue<T extends string>(
  value: string | undefined,
  field: string,
  allowedValues: readonly T[],
): T {
  const normalized = normalizeInlineText(value ?? "") as T;
  if (allowedValues.includes(normalized)) {
    return normalized;
  }

  throw new Error(`${field} must be one of: ${allowedValues.join(", ")}.`);
}

function parseApprovalRequired(value: string | undefined): true {
  const normalized = normalizeInlineText(value ?? "").toLowerCase();
  if (normalized !== "yes") {
    throw new Error("APPROVAL_REQUIRED must be 'yes'.");
  }
  return true;
}

function parseJsonDraft(value: string | undefined): unknown {
  const text = parseRequiredText(value, "GROUPS_JSON_DRAFT");
  const unwrapped = unwrapFencedCodeBlock(text);
  try {
    return JSON.parse(unwrapped);
  } catch (error) {
    throw new Error(`GROUPS_JSON_DRAFT must be valid JSON. ${describeError(error)}`);
  }
}

function parseProposedGroups(value: string | undefined): FinalizeDecisionGroup[] {
  const text = (value ?? "").trim();
  if (!text || /^none$/iu.test(text)) {
    return [];
  }

  const lines = text.replace(/\r\n?/g, "\n").split("\n");
  const groups: Array<{ header: string; lines: string[] }> = [];
  let currentHeader: string | null = null;
  let currentLines: string[] = [];

  const flush = () => {
    if (!currentHeader) return;
    groups.push({ header: currentHeader, lines: [...currentLines] });
  };

  for (const line of lines) {
    const match = /^\s*(\d+)\.\s*(.*)$/.exec(line);
    if (match) {
      flush();
      currentHeader = match[2].trim();
      currentLines = [];
      continue;
    }
    if (currentHeader !== null) {
      currentLines.push(line);
    }
  }

  flush();

  if (groups.length === 0) {
    throw new Error("PROPOSED_GROUPS must use numbered groups.");
  }

  return groups.map((group) => parseProposedGroup(group.header, group.lines));
}

function parseProposedGroup(header: string, lines: readonly string[]): FinalizeDecisionGroup {
  const fields = extractFlexibleFields([header, ...lines]);
  const title =
    fields.title !== null
      ? parseRequiredText(fields.title, "PROPOSED_GROUPS.title")
      : parseRequiredText(header, "PROPOSED_GROUPS.title");

  return {
    title,
    commits: parseStringList(fields.commits ?? undefined, "PROPOSED_GROUPS.commits", {
      splitOnComma: true,
    }),
    files: parseStringList(fields.files ?? undefined, "PROPOSED_GROUPS.files", {
      splitOnComma: true,
    }),
    metricEffect: parseRequiredText(
      fields.metricEffect ?? undefined,
      "PROPOSED_GROUPS.metricEffect",
    ),
    dependencyNotes: parseStringList(
      fields.dependencyNotes ?? undefined,
      "PROPOSED_GROUPS.dependencyNotes",
    ),
  };
}

function extractFlexibleFields(lines: readonly string[]): {
  title: string | null;
  commits: string | null;
  files: string | null;
  metricEffect: string | null;
  dependencyNotes: string | null;
} {
  const fields = new Map<string, string>();
  let currentField: string | null = null;
  let buffer: string[] = [];
  let headerTitle: string | null = null;

  const flush = () => {
    if (!currentField) return;
    fields.set(currentField, normalizeSectionValue(buffer));
  };

  for (const [index, line] of lines.entries()) {
    const trimmed = line.trim();
    if (index === 0 && trimmed.length > 0 && !looksLikeFlexibleField(trimmed)) {
      headerTitle = trimmed;
      continue;
    }

    const fieldMatch = /^\s*(?:[-*]\s*)?([A-Za-z][A-Za-z_ ]+):(.*)$/.exec(line);
    const fieldName = normalizeFlexibleFieldName(fieldMatch?.[1] ?? "");
    if (fieldMatch && fieldName) {
      if (fields.has(fieldName) || currentField === fieldName) {
        throw new Error(`Duplicate finalize group field: ${fieldName}.`);
      }
      flush();
      currentField = fieldName;
      buffer = [fieldMatch[2].trim()];
      continue;
    }

    if (currentField) {
      buffer.push(line);
      continue;
    }

    if (trimmed.length > 0 && index !== 0) {
      throw new Error(`Unexpected finalize group content: ${trimmed}`);
    }
  }

  flush();

  return {
    title: fields.get("title") ?? headerTitle,
    commits: fields.get("commits") ?? null,
    files: fields.get("files") ?? null,
    metricEffect: fields.get("metricEffect") ?? null,
    dependencyNotes: fields.get("dependencyNotes") ?? null,
  };
}

function looksLikeFlexibleField(line: string): boolean {
  return (
    normalizeFlexibleFieldName(/^\s*(?:[-*]\s*)?([A-Za-z][A-Za-z_ ]+):/.exec(line)?.[1] ?? "") !==
    null
  );
}

function normalizeFlexibleFieldName(value: string): string | null {
  const normalized = value
    .trim()
    .toLowerCase()
    .replace(/[\s_]+/g, " ");
  switch (normalized) {
    case "title":
      return "title";
    case "commits":
      return "commits";
    case "files":
      return "files";
    case "metric effect":
      return "metricEffect";
    case "dependency notes":
      return "dependencyNotes";
    default:
      return null;
  }
}

function unwrapFencedCodeBlock(value: string): string {
  const fencedMatch = /^```(?:json)?\s*([\s\S]*?)\s*```$/iu.exec(value.trim());
  return fencedMatch ? fencedMatch[1].trim() : value.trim();
}

function stripMarkdownListPrefix(line: string): string {
  return line.replace(/^\s*(?:[-*]|\d+\.)\s+/, "");
}

function normalizeListItem(value: string): string {
  return value
    .split(/\r?\n/u)
    .map((line) => normalizeInlineText(line))
    .filter(Boolean)
    .join(" | ");
}

function normalizeInlineText(value: string): string {
  return value.trim().replace(/\s+/g, " ");
}

function asNonEmptyString(value: unknown): string | null {
  return typeof value === "string" && value.trim().length > 0 ? value.trim() : null;
}

function asRecord(value: unknown): Record<string, unknown> | null {
  return typeof value === "object" && value !== null ? (value as Record<string, unknown>) : null;
}

function describeError(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

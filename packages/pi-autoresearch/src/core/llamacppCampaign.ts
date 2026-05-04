import { spawnSync } from "node:child_process";
import { createHash } from "node:crypto";
import { existsSync, mkdirSync, readFileSync, realpathSync, writeFileSync } from "node:fs";
import path from "node:path";

export const AUTORESEARCH_LLAMACPP_CAMPAIGN_TOOL_NAME = "autoresearch_llamacpp_campaign";
export const AUTORESEARCH_LLAMACPP_CAMPAIGN_CONTROL_TOOL_NAME =
  "autoresearch_llamacpp_campaign_control";
export const AUTORESEARCH_LLAMACPP_CAMPAIGN_KIND = "pi-autoresearch-llamacpp-campaign" as const;
export const AUTORESEARCH_LLAMACPP_CAMPAIGN_VERSION = 1 as const;
export const AUTORESEARCH_LLAMACPP_CAMPAIGN_WORKFLOW_KIND = "phasee-41-43" as const;
export const AUTORESEARCH_LLAMACPP_CAMPAIGN_PROJECTION_FILE = "autoresearch.llamacpp-campaign.json";
export const AUTORESEARCH_LLAMACPP_CAMPAIGN_PROJECTION_KIND =
  "llamacpp_campaign_projection" as const;
export const AUTORESEARCH_LLAMACPP_CAMPAIGN_PROJECTION_VERSION = 1 as const;
export const AUTORESEARCH_LLAMACPP_CAMPAIGN_PROJECTION_SOURCE =
  "derived_from_manifest_and_receipts" as const;
export const AUTORESEARCH_LLAMACPP_CAMPAIGN_AK_BINDING_KIND =
  "llamacpp_campaign_ak_binding" as const;
export const AUTORESEARCH_LLAMACPP_CAMPAIGN_AK_BINDING_VERSION = 1 as const;
export const AUTORESEARCH_LLAMACPP_CAMPAIGN_AK_BINDING_DETAILS_VERSION = 1 as const;
export const AUTORESEARCH_LLAMACPP_CAMPAIGN_AK_BINDING_OWNER = "pi-autoresearch" as const;
export const AUTORESEARCH_LLAMACPP_CAMPAIGN_AUTONOMY_KIND = "llamacpp_campaign_autonomy" as const;
export const AUTORESEARCH_LLAMACPP_CAMPAIGN_AUTONOMY_VERSION = 1 as const;
export const AUTORESEARCH_LLAMACPP_CAMPAIGN_CONTROL_SURFACE_KIND =
  "llamacpp_campaign_control_surface" as const;
export const AUTORESEARCH_LLAMACPP_CAMPAIGN_CONTROL_SURFACE_VERSION = 1 as const;

const GIT_COMMIT_RE = /^[0-9a-f]{7,40}$/i;
const PYTHON_EXECUTABLE = "python3";
const LLAMACPP_STAGE_COMMAND_TIMEOUT_MS = 30 * 60 * 1000;
const LLAMACPP_STAGE_COMMAND_MAX_BUFFER_BYTES = 16 * 1024 * 1024;

export type LlamacppCampaignStage = "41" | "42" | "43";
export type LlamacppCampaignAction =
  | "plan_matrix"
  | "prepare_fork"
  | "execute_stage"
  | "build_ak_binding"
  | "advance_campaign";

export interface LlamacppCampaignBuildSpec {
  id: string;
  title: string;
  branch: string;
  buildBinDir: string;
  cherryPickCommits: string[];
  lineageSummary: string;
  notes: string[];
}

export interface LlamacppCampaignLaneSpec {
  id: string;
  title: string;
  runtimeFamily: string;
  kvCacheMode: string;
  notes: string[];
}

export interface LlamacppCampaignStageMatrixEntry {
  buildId: string;
  laneIds: string[];
}

export interface LlamacppCampaignManifest {
  kind: typeof AUTORESEARCH_LLAMACPP_CAMPAIGN_KIND;
  version: typeof AUTORESEARCH_LLAMACPP_CAMPAIGN_VERSION;
  campaignId: string;
  objective: string;
  sourceRepoPath: string;
  workstationRepoPath: string;
  fork: {
    targetRepoPath: string;
    baseRef: string;
    workingBranch: string;
  };
  workflow: {
    kind: typeof AUTORESEARCH_LLAMACPP_CAMPAIGN_WORKFLOW_KIND;
    stage41Script: string;
    stage42Script: string;
    stage43Script: string;
    executionBinding: {
      receiptRootPath: string;
    };
    stage41BuildIds: string[];
    stage42Matrix: LlamacppCampaignStageMatrixEntry[];
    stage43BuildIds: string[];
  };
  builds: LlamacppCampaignBuildSpec[];
  lanes: LlamacppCampaignLaneSpec[];
  evidence: {
    expectedReceiptPaths: string[];
    requiredMetrics: string[];
  };
}

export interface ResolvedLlamacppCampaignManifest {
  manifestPath: string;
  manifestDir: string;
  manifest: LlamacppCampaignManifest;
  sourceRepoPath: string;
  workstationRepoPath: string;
  forkTargetRepoPath: string;
  receiptRootPath: string;
  workflowAnchors: {
    stage41Script: string;
    stage42Script: string;
    stage43Script: string;
  };
  buildBinDirs: Record<string, string>;
}

export interface LlamacppCampaignStage41PlanEntry {
  buildId: string;
  title: string;
  branch: string;
  cherryPickCommits: string[];
  lineageSummary: string;
}

export interface LlamacppCampaignStage42PlanEntry {
  buildId: string;
  title: string;
  branch: string;
  laneId: string;
  laneTitle: string;
  runtimeFamily: string;
  kvCacheMode: string;
}

export interface LlamacppCampaignStage43PlanEntry {
  buildId: string;
  title: string;
  branch: string;
  compareAgainst: string;
}

export interface PlanLlamacppCampaignMatrixResult {
  action: "plan_matrix";
  manifestPath: string;
  campaignId: string;
  objective: string;
  workflowKind: typeof AUTORESEARCH_LLAMACPP_CAMPAIGN_WORKFLOW_KIND;
  sourceRepoPath: string;
  workstationRepoPath: string;
  forkTargetRepoPath: string;
  forkWorkingBranch: string;
  receiptRootPath: string;
  workflowAnchors: {
    stage41Script: string;
    stage42Script: string;
    stage43Script: string;
  };
  stage41: LlamacppCampaignStage41PlanEntry[];
  stage42: LlamacppCampaignStage42PlanEntry[];
  stage43: LlamacppCampaignStage43PlanEntry[];
  evidence: {
    expectedReceiptPaths: string[];
    requiredMetrics: string[];
  };
  executionNotes: string[];
  warnings: string[];
  nextAction: string;
}

export interface ProcessCommandSummary {
  command: string[];
  cwd: string | null;
  exitCode: number;
  stdout: string;
  stderr: string;
}

export type GitCommandSummary = ProcessCommandSummary;

export interface PrepareLlamacppCampaignForkResult {
  action: "prepare_fork";
  mode: "plan" | "apply";
  manifestPath: string;
  campaignId: string;
  sourceRepoPath: string;
  targetRepoPath: string;
  baseRef: string;
  workingBranch: string;
  sourceRepoExists: boolean;
  targetRepoExists: boolean;
  targetRepoClean: boolean | null;
  workingBranchExists: boolean | null;
  commands: ProcessCommandSummary[];
  nextAction: string;
}

export interface LlamacppCampaignPathCheck {
  label: string;
  path: string;
  exists: boolean;
  required: boolean;
}

export interface ExecuteLlamacppCampaignStageTranslation {
  stage41KvTypes: string[] | null;
  configIKvType: string | null;
  q8KvTypes: string[];
}

export interface ExecuteLlamacppCampaignStageResult {
  action: "execute_stage";
  stage: LlamacppCampaignStage;
  mode: "plan" | "apply";
  manifestPath: string;
  campaignId: string;
  buildId: string;
  buildTitle: string;
  branch: string;
  scriptPath: string;
  receiptRootPath: string;
  buildBinDir: string | null;
  outputs: {
    receiptPath: string;
    corpusPath: string | null;
  };
  prerequisites: LlamacppCampaignPathCheck[];
  translation: ExecuteLlamacppCampaignStageTranslation;
  command: ProcessCommandSummary;
  warnings: string[];
  nextAction: string;
}

export type LlamacppCampaignProjectionOverallState =
  | "planned_only"
  | "partially_materialized"
  | "stage41_complete"
  | "stage42_complete"
  | "stage43_complete";

export interface LlamacppCampaignStagePaths {
  stage41ReceiptPath: string;
  stage41CorpusPath: string;
  stage42ReceiptPath: string;
  stage43ReceiptPath: string;
}

export interface LlamacppCampaignProjectionStage41Status {
  expected: boolean;
  receiptPath: string;
  corpusPath: string;
  receiptExists: boolean;
  corpusExists: boolean;
}

export interface LlamacppCampaignProjectionStageStatus {
  expected: boolean;
  receiptPath: string;
  receiptExists: boolean;
}

export interface LlamacppCampaignBuildProjection {
  buildId: string;
  title: string;
  branch: string;
  buildBinDir: string;
  buildBinDirExists: boolean;
  highestCompletedStage: 0 | 41 | 42 | 43;
  notes: string[];
  stages: {
    "41": LlamacppCampaignProjectionStage41Status;
    "42": LlamacppCampaignProjectionStageStatus;
    "43": LlamacppCampaignProjectionStageStatus;
  };
}

export interface LlamacppCampaignProjectionV1 {
  type: typeof AUTORESEARCH_LLAMACPP_CAMPAIGN_PROJECTION_KIND;
  version: typeof AUTORESEARCH_LLAMACPP_CAMPAIGN_PROJECTION_VERSION;
  cwd: string;
  updatedAt: number;
  manifest: {
    path: string;
    campaignId: string;
    manifestKey: string;
    receiptRootPath: string;
    sourceRepoPath: string;
    workstationRepoPath: string;
    workflowKind: typeof AUTORESEARCH_LLAMACPP_CAMPAIGN_WORKFLOW_KIND;
  };
  status: {
    projectionKind: typeof AUTORESEARCH_LLAMACPP_CAMPAIGN_PROJECTION_SOURCE;
    overallState: LlamacppCampaignProjectionOverallState;
    stale: boolean;
    staleReason: string | null;
  };
  builds: LlamacppCampaignBuildProjection[];
}

export interface PersistLlamacppCampaignProjectionResult {
  path: string;
  projection: LlamacppCampaignProjectionV1;
}

export interface LoadLlamacppCampaignProjectionStateResult {
  path: string;
  projection: LlamacppCampaignProjectionV1 | null;
  availability: "not_projected" | "current" | "stale";
  staleReason: string | null;
}

export type LlamacppCampaignAkMilestone =
  | "planned"
  | "materializing"
  | "stage41_complete"
  | "stage42_complete"
  | "terminal_stage_complete";

export type LlamacppCampaignAkLifecycleAction = "evidence_only" | "complete_task_candidate";

export interface LlamacppCampaignAkBindingStageSummary {
  buildCount: number;
  stage41ExpectedBuilds: number;
  stage41PresentReceipts: number;
  stage41PresentCorpora: number;
  stage42ExpectedBuilds: number;
  stage42PresentReceipts: number;
  stage43ExpectedBuilds: number;
  stage43PresentReceipts: number;
}

export interface LlamacppCampaignAkBindingV1 {
  type: typeof AUTORESEARCH_LLAMACPP_CAMPAIGN_AK_BINDING_KIND;
  version: typeof AUTORESEARCH_LLAMACPP_CAMPAIGN_AK_BINDING_VERSION;
  taskId: number;
  manifest: {
    path: string;
    campaignId: string;
    manifestKey: string;
    receiptRootPath: string;
    terminalStage: 41 | 42 | 43;
  };
  projection: {
    overallState: LlamacppCampaignProjectionOverallState;
    updatedAt: number;
    projectionKey: string;
  };
  stages: LlamacppCampaignAkBindingStageSummary;
  ak: {
    milestone: LlamacppCampaignAkMilestone;
    checkType: string;
    result: "pass";
    summary: string;
  };
  lifecycle: {
    completionEligible: boolean;
    action: LlamacppCampaignAkLifecycleAction;
    reason: string;
  };
}

export interface LlamacppCampaignAkBindingDetailsV1 {
  contract_version: typeof AUTORESEARCH_LLAMACPP_CAMPAIGN_AK_BINDING_DETAILS_VERSION;
  binding_owner: typeof AUTORESEARCH_LLAMACPP_CAMPAIGN_AK_BINDING_OWNER;
  campaign_kind: typeof AUTORESEARCH_LLAMACPP_CAMPAIGN_KIND;
  task_id: number;
  milestone: LlamacppCampaignAkMilestone;
  projection_key: string;
  manifest: {
    path: string;
    campaign_id: string;
    manifest_key: string;
    receipt_root_path: string;
    terminal_stage: 41 | 42 | 43;
  };
  projection: {
    overall_state: LlamacppCampaignProjectionOverallState;
    updated_at: number;
  };
  stages: {
    build_count: number;
    stage41_expected_builds: number;
    stage41_present_receipts: number;
    stage41_present_corpora: number;
    stage42_expected_builds: number;
    stage42_present_receipts: number;
    stage43_expected_builds: number;
    stage43_present_receipts: number;
  };
  summary: string;
}

export interface BuildLlamacppCampaignAkBindingResult {
  action: "build_ak_binding";
  binding: LlamacppCampaignAkBindingV1;
  details: LlamacppCampaignAkBindingDetailsV1;
  nextAction: string;
}

export type LlamacppCampaignAutonomyPhase =
  | "stage41_wave"
  | "stage42_wave"
  | "stage43_wave"
  | "terminal_stage_complete"
  | "blocked";

export interface LlamacppCampaignAutonomyStageCounts {
  stage41ExpectedBuilds: number;
  stage41CompletedBuilds: number;
  stage42ExpectedBuilds: number;
  stage42CompletedBuilds: number;
  stage43ExpectedBuilds: number;
  stage43CompletedBuilds: number;
}

export interface LlamacppCampaignAutonomyNextStep {
  action: "execute_stage" | "none";
  stage: 41 | 42 | 43 | null;
  buildId: string | null;
  reason: string;
}

export interface LlamacppCampaignAutonomyV1 {
  type: typeof AUTORESEARCH_LLAMACPP_CAMPAIGN_AUTONOMY_KIND;
  version: typeof AUTORESEARCH_LLAMACPP_CAMPAIGN_AUTONOMY_VERSION;
  manifest: {
    path: string;
    campaignId: string;
    manifestKey: string;
    receiptRootPath: string;
    terminalStage: 41 | 42 | 43;
  };
  projection: {
    overallState: LlamacppCampaignProjectionOverallState;
    updatedAt: number;
  };
  stages: LlamacppCampaignAutonomyStageCounts;
  lifecycle: {
    phase: LlamacppCampaignAutonomyPhase;
    terminalStageMaterialized: boolean;
    reason: string;
  };
  nextStep: LlamacppCampaignAutonomyNextStep;
}

export interface AdvanceLlamacppCampaignResult {
  action: "advance_campaign";
  mode: "plan" | "apply";
  autonomy: LlamacppCampaignAutonomyV1;
  executedStep: ExecuteLlamacppCampaignStageResult | null;
  nextAction: string;
}

export type LlamacppCampaignTaskVerificationState =
  | "not_requested"
  | "verified_live"
  | "not_found"
  | "verification_unavailable";

export interface LlamacppCampaignTaskContextV1 {
  suppliedTaskId: number | null;
  verificationState: LlamacppCampaignTaskVerificationState;
  verifiedTaskId: number | null;
  reason: string;
}

export interface LlamacppCampaignControlSurfaceV1 {
  type: typeof AUTORESEARCH_LLAMACPP_CAMPAIGN_CONTROL_SURFACE_KIND;
  version: typeof AUTORESEARCH_LLAMACPP_CAMPAIGN_CONTROL_SURFACE_VERSION;
  autonomy: LlamacppCampaignAutonomyV1;
  taskContext: LlamacppCampaignTaskContextV1;
  akBinding: LlamacppCampaignAkBindingV1 | null;
  public: {
    taskBound: boolean;
    nextStepAction: "advance" | "none";
    completionCandidate: boolean;
    reason: string;
  };
}

export interface InspectLlamacppCampaignControlResult {
  action: "status";
  control: LlamacppCampaignControlSurfaceV1;
  projectionPath: string;
  projection: LlamacppCampaignProjectionV1;
  nextAction: string;
}

export interface ExecuteLlamacppCampaignControlResult {
  action: "advance";
  mode: "plan" | "apply";
  control: LlamacppCampaignControlSurfaceV1;
  projectionPath: string;
  projection: LlamacppCampaignProjectionV1;
  executedStep: ExecuteLlamacppCampaignStageResult | null;
  nextAction: string;
}

class LlamacppCampaignManifestError extends Error {}

export function loadLlamacppCampaignManifest(
  manifestPath: string,
  cwd: string,
): ResolvedLlamacppCampaignManifest {
  const resolvedManifestPath = resolvePathLike(cwd, manifestPath);
  const manifestDir = path.dirname(resolvedManifestPath);
  const payload = parseJsonObject(readFileSync(resolvedManifestPath, "utf8"), resolvedManifestPath);
  const manifest = validateManifest(payload, resolvedManifestPath);

  const sourceRepoPath = resolvePathLike(manifestDir, manifest.sourceRepoPath);
  const workstationRepoPath = resolvePathLike(manifestDir, manifest.workstationRepoPath);
  const forkTargetRepoPath = resolvePathLike(manifestDir, manifest.fork.targetRepoPath);
  const receiptRootPath = resolveRepoRelativePath(
    workstationRepoPath,
    manifest.workflow.executionBinding.receiptRootPath,
    `${resolvedManifestPath}:workflow.executionBinding.receiptRootPath`,
  );

  const buildBinDirs = Object.fromEntries(
    manifest.builds.map((build) => [build.id, resolvePathLike(manifestDir, build.buildBinDir)]),
  );

  return {
    manifestPath: resolvedManifestPath,
    manifestDir,
    manifest,
    sourceRepoPath,
    workstationRepoPath,
    forkTargetRepoPath,
    receiptRootPath,
    workflowAnchors: {
      stage41Script: resolvePathWithinRoot(
        workstationRepoPath,
        manifest.workflow.stage41Script,
        `${resolvedManifestPath}:workflow.stage41Script`,
      ),
      stage42Script: resolvePathWithinRoot(
        workstationRepoPath,
        manifest.workflow.stage42Script,
        `${resolvedManifestPath}:workflow.stage42Script`,
      ),
      stage43Script: resolvePathWithinRoot(
        workstationRepoPath,
        manifest.workflow.stage43Script,
        `${resolvedManifestPath}:workflow.stage43Script`,
      ),
    },
    buildBinDirs,
  };
}

export function resolveLlamacppCampaignProjectionPath(cwd: string): string {
  return path.join(path.resolve(cwd), AUTORESEARCH_LLAMACPP_CAMPAIGN_PROJECTION_FILE);
}

export function createLlamacppCampaignManifestKey(
  resolved: ResolvedLlamacppCampaignManifest,
): string {
  return createHash("sha256")
    .update(
      JSON.stringify({
        manifest: resolved.manifest,
        sourceRepoPath: resolved.sourceRepoPath,
        workstationRepoPath: resolved.workstationRepoPath,
        forkTargetRepoPath: resolved.forkTargetRepoPath,
        receiptRootPath: resolved.receiptRootPath,
        workflowAnchors: resolved.workflowAnchors,
        buildBinDirs: resolved.buildBinDirs,
      }),
    )
    .digest("hex");
}

export function buildLlamacppCampaignProjection(input: {
  cwd: string;
  manifestPath: string;
  updatedAt?: number;
}): LlamacppCampaignProjectionV1 {
  const resolved = loadLlamacppCampaignManifest(input.manifestPath, input.cwd);
  const stage41BuildIds = new Set(resolved.manifest.workflow.stage41BuildIds);
  const stage42BuildIds = new Set(
    resolved.manifest.workflow.stage42Matrix.map((entry) => entry.buildId),
  );
  const stage43BuildIds = new Set(resolved.manifest.workflow.stage43BuildIds);

  const builds = resolved.manifest.builds.map((build) => {
    const stagePaths = deriveStagePaths(resolved.receiptRootPath, build.id);
    const stage41Expected = stage41BuildIds.has(build.id);
    const stage42Expected = stage42BuildIds.has(build.id);
    const stage43Expected = stage43BuildIds.has(build.id);
    const buildBinDir = resolved.buildBinDirs[build.id] ?? build.buildBinDir;
    const buildBinDirExists = existsSync(buildBinDir);
    const stage41ReceiptExists = existsSync(stagePaths.stage41ReceiptPath);
    const stage41CorpusExists = existsSync(stagePaths.stage41CorpusPath);
    const stage42ReceiptExists = existsSync(stagePaths.stage42ReceiptPath);
    const stage43ReceiptExists = existsSync(stagePaths.stage43ReceiptPath);
    const notes: string[] = [];

    if (!buildBinDirExists) {
      notes.push(`resolved buildBinDir is missing: ${buildBinDir}`);
    }
    if (stage41ReceiptExists && !stage41Expected) {
      notes.push(
        "stage-41 receipt exists for a build that is not listed in workflow.stage41BuildIds",
      );
    }
    if (stage42ReceiptExists && !stage42Expected) {
      notes.push(
        "stage-42 receipt exists for a build that is not listed in workflow.stage42Matrix",
      );
    }
    if (stage43ReceiptExists && !stage43Expected) {
      notes.push(
        "stage-43 receipt exists for a build that is not listed in workflow.stage43BuildIds",
      );
    }
    if (stage41CorpusExists && !stage41ReceiptExists) {
      notes.push("stage-41 corpus exists without the derived stage-41 receipt");
    }
    if (stage42ReceiptExists && !stage41ReceiptExists) {
      notes.push("stage-42 receipt exists without the derived stage-41 receipt");
    }
    if (stage43ReceiptExists && !stage42ReceiptExists) {
      notes.push("stage-43 receipt exists without the derived stage-42 receipt");
    }

    return {
      buildId: build.id,
      title: build.title,
      branch: build.branch,
      buildBinDir,
      buildBinDirExists,
      highestCompletedStage: deriveHighestCompletedStage({
        stage41ReceiptExists,
        stage42ReceiptExists,
        stage43ReceiptExists,
      }),
      notes,
      stages: {
        "41": {
          expected: stage41Expected,
          receiptPath: stagePaths.stage41ReceiptPath,
          corpusPath: stagePaths.stage41CorpusPath,
          receiptExists: stage41ReceiptExists,
          corpusExists: stage41CorpusExists,
        },
        "42": {
          expected: stage42Expected,
          receiptPath: stagePaths.stage42ReceiptPath,
          receiptExists: stage42ReceiptExists,
        },
        "43": {
          expected: stage43Expected,
          receiptPath: stagePaths.stage43ReceiptPath,
          receiptExists: stage43ReceiptExists,
        },
      },
    } satisfies LlamacppCampaignBuildProjection;
  });

  return {
    type: AUTORESEARCH_LLAMACPP_CAMPAIGN_PROJECTION_KIND,
    version: AUTORESEARCH_LLAMACPP_CAMPAIGN_PROJECTION_VERSION,
    cwd: path.resolve(input.cwd),
    updatedAt: input.updatedAt ?? Date.now(),
    manifest: {
      path: resolved.manifestPath,
      campaignId: resolved.manifest.campaignId,
      manifestKey: createLlamacppCampaignManifestKey(resolved),
      receiptRootPath: resolved.receiptRootPath,
      sourceRepoPath: resolved.sourceRepoPath,
      workstationRepoPath: resolved.workstationRepoPath,
      workflowKind: resolved.manifest.workflow.kind,
    },
    status: {
      projectionKind: AUTORESEARCH_LLAMACPP_CAMPAIGN_PROJECTION_SOURCE,
      overallState: deriveLlamacppCampaignProjectionOverallState(builds),
      stale: false,
      staleReason: null,
    },
    builds,
  };
}

export function persistDerivedLlamacppCampaignProjection(input: {
  cwd: string;
  projection: LlamacppCampaignProjectionV1;
}): PersistLlamacppCampaignProjectionResult {
  const targetPath = resolveLlamacppCampaignProjectionPath(input.cwd);
  mkdirSync(path.dirname(targetPath), { recursive: true });
  writeFileSync(targetPath, `${JSON.stringify(input.projection, null, 2)}\n`, "utf8");
  return {
    path: targetPath,
    projection: input.projection,
  };
}

export function persistLlamacppCampaignProjection(input: {
  cwd: string;
  manifestPath: string;
  updatedAt?: number;
}): PersistLlamacppCampaignProjectionResult {
  return persistDerivedLlamacppCampaignProjection({
    cwd: input.cwd,
    projection: buildLlamacppCampaignProjection(input),
  });
}

export function loadLlamacppCampaignProjectionState(input: {
  cwd: string;
}): LoadLlamacppCampaignProjectionStateResult {
  const cwd = path.resolve(input.cwd);
  const targetPath = resolveLlamacppCampaignProjectionPath(cwd);
  if (!existsSync(targetPath)) {
    return {
      path: targetPath,
      projection: null,
      availability: "not_projected",
      staleReason: null,
    };
  }

  const text = readFileSync(targetPath, "utf8");
  let savedProjection: LlamacppCampaignProjectionV1;
  try {
    savedProjection = parseLlamacppCampaignProjection(text, targetPath);
  } catch (error) {
    return {
      path: targetPath,
      projection: null,
      availability: "stale",
      staleReason: `projection parse failed: ${error instanceof Error ? error.message : String(error)}`,
    };
  }

  if (savedProjection.cwd !== cwd) {
    return {
      path: targetPath,
      projection: savedProjection,
      availability: "stale",
      staleReason: `projection cwd mismatch: ${savedProjection.cwd}`,
    };
  }

  let currentProjection: LlamacppCampaignProjectionV1;
  try {
    currentProjection = buildLlamacppCampaignProjection({
      cwd,
      manifestPath: savedProjection.manifest.path,
    });
  } catch (error) {
    return {
      path: targetPath,
      projection: savedProjection,
      availability: "stale",
      staleReason: `projection refresh failed: ${error instanceof Error ? error.message : String(error)}`,
    };
  }

  if (llamacppCampaignProjectionDiffers(savedProjection, currentProjection)) {
    writeFileSync(targetPath, `${JSON.stringify(currentProjection, null, 2)}\n`, "utf8");
  }

  return {
    path: targetPath,
    projection: currentProjection,
    availability: "current",
    staleReason: null,
  };
}

function buildLlamacppCampaignAkBindingFromProjection(input: {
  taskId: number;
  resolved: ResolvedLlamacppCampaignManifest;
  projection: LlamacppCampaignProjectionV1;
}): LlamacppCampaignAkBindingV1 {
  const terminalStage = deriveLlamacppCampaignTerminalStage(input.resolved.manifest);
  const stages = summarizeLlamacppCampaignAkStages(input.projection);
  const projectionKey = createLlamacppCampaignAkProjectionKey({
    taskId: input.taskId,
    manifestKey: input.projection.manifest.manifestKey,
    terminalStage,
    overallState: input.projection.status.overallState,
    stages,
  });
  const akProjection = deriveLlamacppCampaignAkProjection({
    campaignId: input.projection.manifest.campaignId,
    overallState: input.projection.status.overallState,
    terminalStage,
    stages,
  });

  return {
    type: AUTORESEARCH_LLAMACPP_CAMPAIGN_AK_BINDING_KIND,
    version: AUTORESEARCH_LLAMACPP_CAMPAIGN_AK_BINDING_VERSION,
    taskId: input.taskId,
    manifest: {
      path: input.projection.manifest.path,
      campaignId: input.projection.manifest.campaignId,
      manifestKey: input.projection.manifest.manifestKey,
      receiptRootPath: input.projection.manifest.receiptRootPath,
      terminalStage,
    },
    projection: {
      overallState: input.projection.status.overallState,
      updatedAt: input.projection.updatedAt,
      projectionKey,
    },
    stages,
    ak: {
      milestone: akProjection.milestone,
      checkType: akProjection.checkType,
      result: "pass",
      summary: akProjection.summary,
    },
    lifecycle: {
      completionEligible: akProjection.completionEligible,
      action: akProjection.lifecycleAction,
      reason: akProjection.reason,
    },
  };
}

export function buildLlamacppCampaignAkBinding(input: {
  cwd: string;
  manifestPath: string;
  taskId: number;
  updatedAt?: number;
}): LlamacppCampaignAkBindingV1 {
  const taskId = requireAkTaskId(input.taskId);
  const resolved = loadLlamacppCampaignManifest(input.manifestPath, input.cwd);
  const projection = buildLlamacppCampaignProjection({
    cwd: input.cwd,
    manifestPath: input.manifestPath,
    updatedAt: input.updatedAt,
  });
  return buildLlamacppCampaignAkBindingFromProjection({
    taskId,
    resolved,
    projection,
  });
}

export function buildLlamacppCampaignAkBindingDetails(
  binding: LlamacppCampaignAkBindingV1,
): LlamacppCampaignAkBindingDetailsV1 {
  return {
    contract_version: AUTORESEARCH_LLAMACPP_CAMPAIGN_AK_BINDING_DETAILS_VERSION,
    binding_owner: AUTORESEARCH_LLAMACPP_CAMPAIGN_AK_BINDING_OWNER,
    campaign_kind: AUTORESEARCH_LLAMACPP_CAMPAIGN_KIND,
    task_id: binding.taskId,
    milestone: binding.ak.milestone,
    projection_key: binding.projection.projectionKey,
    manifest: {
      path: binding.manifest.path,
      campaign_id: binding.manifest.campaignId,
      manifest_key: binding.manifest.manifestKey,
      receipt_root_path: binding.manifest.receiptRootPath,
      terminal_stage: binding.manifest.terminalStage,
    },
    projection: {
      overall_state: binding.projection.overallState,
      updated_at: binding.projection.updatedAt,
    },
    stages: {
      build_count: binding.stages.buildCount,
      stage41_expected_builds: binding.stages.stage41ExpectedBuilds,
      stage41_present_receipts: binding.stages.stage41PresentReceipts,
      stage41_present_corpora: binding.stages.stage41PresentCorpora,
      stage42_expected_builds: binding.stages.stage42ExpectedBuilds,
      stage42_present_receipts: binding.stages.stage42PresentReceipts,
      stage43_expected_builds: binding.stages.stage43ExpectedBuilds,
      stage43_present_receipts: binding.stages.stage43PresentReceipts,
    },
    summary: binding.ak.summary,
  };
}

export function buildLlamacppCampaignAutonomy(input: {
  cwd: string;
  manifestPath: string;
  updatedAt?: number;
}): LlamacppCampaignAutonomyV1 {
  return deriveLlamacppCampaignAutonomyState(input).autonomy;
}

export function advanceLlamacppCampaign(input: {
  cwd: string;
  manifestPath: string;
  apply?: boolean;
  updatedAt?: number;
}): AdvanceLlamacppCampaignResult {
  const state = deriveLlamacppCampaignAutonomyState(input);
  const action = state.autonomy.nextStep.action;

  if (action === "none") {
    if (input.apply) {
      throw new LlamacppCampaignManifestError(
        `manifest ${state.autonomy.manifest.campaignId} has no further executable next step because terminal stage ${state.autonomy.manifest.terminalStage} is already materially complete`,
      );
    }
    return {
      action: "advance_campaign",
      mode: "plan",
      autonomy: state.autonomy,
      executedStep: null,
      nextAction: `Local campaign execution is already complete for manifest ${state.autonomy.manifest.campaignId}; if an exact AK task id exists, a caller above the package may now choose whether to derive or record AK-ready evidence explicitly.`,
    };
  }

  if (!input.apply) {
    return {
      action: "advance_campaign",
      mode: "plan",
      autonomy: state.autonomy,
      executedStep: state.plannedStep,
      nextAction:
        state.autonomy.lifecycle.phase === "blocked"
          ? `Resolve the blocker for stage ${state.autonomy.nextStep.stage} build ${state.autonomy.nextStep.buildId}: ${state.autonomy.nextStep.reason}`
          : `Re-run ${AUTORESEARCH_LLAMACPP_CAMPAIGN_TOOL_NAME} with action=advance_campaign and apply=true to execute stage ${state.autonomy.nextStep.stage} for build ${state.autonomy.nextStep.buildId}.`,
    };
  }

  if (state.autonomy.lifecycle.phase === "blocked") {
    throw new LlamacppCampaignManifestError(
      `next campaign step is currently blocked for stage ${state.autonomy.nextStep.stage} build ${state.autonomy.nextStep.buildId}: ${state.autonomy.nextStep.reason}`,
    );
  }

  const stage = String(state.autonomy.nextStep.stage) as LlamacppCampaignStage;
  const buildId = state.autonomy.nextStep.buildId;
  if (!buildId) {
    throw new LlamacppCampaignManifestError(
      "advance_campaign apply requires a selected build id when nextStep.action=execute_stage",
    );
  }

  return {
    action: "advance_campaign",
    mode: "apply",
    autonomy: state.autonomy,
    executedStep: executeLlamacppCampaignStage({
      cwd: input.cwd,
      manifestPath: input.manifestPath,
      stage,
      buildId,
      apply: true,
    }),
    nextAction: `Re-run ${AUTORESEARCH_LLAMACPP_CAMPAIGN_TOOL_NAME} with action=advance_campaign to derive the next truthful campaign-local step after refreshing projection truth.`,
  };
}

function resolveLlamacppCampaignControlState(input: {
  cwd: string;
  manifestPath: string;
  taskId?: number;
  updatedAt?: number;
}): {
  projectionPath: string;
  projection: LlamacppCampaignProjectionV1;
  control: LlamacppCampaignControlSurfaceV1;
  autonomyState: {
    autonomy: LlamacppCampaignAutonomyV1;
    plannedStep: ExecuteLlamacppCampaignStageResult | null;
  };
} {
  const resolved = loadLlamacppCampaignManifest(input.manifestPath, input.cwd);
  const projection = buildLlamacppCampaignProjection({
    cwd: input.cwd,
    manifestPath: input.manifestPath,
    updatedAt: input.updatedAt,
  });
  const autonomyState = deriveLlamacppCampaignAutonomyStateFromResolvedProjection({
    cwd: input.cwd,
    manifestPath: input.manifestPath,
    resolved,
    projection,
  });
  const taskContext = buildLlamacppCampaignTaskContext(input.taskId);
  const akBinding =
    taskContext.verificationState === "verified_live" && taskContext.verifiedTaskId !== null
      ? buildLlamacppCampaignAkBindingFromProjection({
          taskId: taskContext.verifiedTaskId,
          resolved,
          projection,
        })
      : null;

  const control = {
    type: AUTORESEARCH_LLAMACPP_CAMPAIGN_CONTROL_SURFACE_KIND,
    version: AUTORESEARCH_LLAMACPP_CAMPAIGN_CONTROL_SURFACE_VERSION,
    autonomy: autonomyState.autonomy,
    taskContext,
    akBinding,
    public: {
      taskBound: taskContext.verificationState === "verified_live" && akBinding !== null,
      nextStepAction:
        autonomyState.autonomy.lifecycle.phase === "blocked"
          ? "none"
          : autonomyState.autonomy.nextStep.action === "execute_stage"
            ? "advance"
            : "none",
      completionCandidate:
        taskContext.verificationState === "verified_live" &&
        akBinding !== null &&
        akBinding.lifecycle.action === "complete_task_candidate",
      reason: buildLlamacppCampaignControlReason(autonomyState.autonomy, taskContext, akBinding),
    },
  } satisfies LlamacppCampaignControlSurfaceV1;

  return {
    projectionPath: resolveLlamacppCampaignProjectionPath(input.cwd),
    projection,
    control,
    autonomyState,
  };
}

export function buildLlamacppCampaignControlSurface(input: {
  cwd: string;
  manifestPath: string;
  taskId?: number;
  updatedAt?: number;
}): LlamacppCampaignControlSurfaceV1 {
  return resolveLlamacppCampaignControlState(input).control;
}

export function inspectLlamacppCampaignControl(input: {
  cwd: string;
  manifestPath: string;
  taskId?: number;
  updatedAt?: number;
}): InspectLlamacppCampaignControlResult {
  const state = resolveLlamacppCampaignControlState(input);
  return {
    action: "status",
    control: state.control,
    projectionPath: state.projectionPath,
    projection: state.projection,
    nextAction: buildLlamacppCampaignControlNextAction(state.control, "status"),
  };
}

export function executeLlamacppCampaignControl(input: {
  cwd: string;
  manifestPath: string;
  taskId?: number;
  apply?: boolean;
  updatedAt?: number;
}): ExecuteLlamacppCampaignControlResult {
  const state = resolveLlamacppCampaignControlState(input);

  if (!input.apply) {
    return {
      action: "advance",
      mode: "plan",
      control: state.control,
      projectionPath: state.projectionPath,
      projection: state.projection,
      executedStep: state.autonomyState.plannedStep,
      nextAction: buildLlamacppCampaignControlNextAction(state.control, "plan"),
    };
  }

  if (state.control.autonomy.lifecycle.phase === "blocked") {
    throw new LlamacppCampaignManifestError(
      `next campaign step is currently blocked for stage ${state.control.autonomy.nextStep.stage} build ${state.control.autonomy.nextStep.buildId}: ${state.control.autonomy.nextStep.reason}`,
    );
  }

  if (state.control.autonomy.nextStep.action === "none") {
    throw new LlamacppCampaignManifestError(
      `manifest ${state.control.autonomy.manifest.campaignId} has no further executable next step because terminal stage ${state.control.autonomy.manifest.terminalStage} is already materially complete`,
    );
  }

  const stage = String(state.control.autonomy.nextStep.stage) as LlamacppCampaignStage;
  const buildId = state.control.autonomy.nextStep.buildId;
  if (!buildId) {
    throw new LlamacppCampaignManifestError(
      "advance apply requires a selected build id when nextStep.action=execute_stage",
    );
  }

  const executedStep = executeLlamacppCampaignStage({
    cwd: input.cwd,
    manifestPath: input.manifestPath,
    stage,
    buildId,
    apply: true,
  });
  const refreshed = resolveLlamacppCampaignControlState({
    cwd: input.cwd,
    manifestPath: input.manifestPath,
    taskId: input.taskId,
    updatedAt: input.updatedAt,
  });

  return {
    action: "advance",
    mode: "apply",
    control: refreshed.control,
    projectionPath: refreshed.projectionPath,
    projection: refreshed.projection,
    executedStep,
    nextAction: buildLlamacppCampaignControlNextAction(refreshed.control, "apply"),
  };
}

export function planLlamacppCampaignMatrix(input: {
  cwd: string;
  manifestPath: string;
}): PlanLlamacppCampaignMatrixResult {
  const resolved = loadLlamacppCampaignManifest(input.manifestPath, input.cwd);
  const buildIndex = new Map(resolved.manifest.builds.map((build) => [build.id, build]));
  const laneIndex = new Map(resolved.manifest.lanes.map((lane) => [lane.id, lane]));

  const stage41 = resolved.manifest.workflow.stage41BuildIds.map((buildId) => {
    const build = requireBuild(buildIndex, buildId, "stage41BuildIds");
    return {
      buildId: build.id,
      title: build.title,
      branch: build.branch,
      cherryPickCommits: [...build.cherryPickCommits],
      lineageSummary: build.lineageSummary,
    } satisfies LlamacppCampaignStage41PlanEntry;
  });

  const stage42 = resolved.manifest.workflow.stage42Matrix.flatMap((entry) => {
    const build = requireBuild(buildIndex, entry.buildId, "stage42Matrix");
    return entry.laneIds.map((laneId) => {
      const lane = requireLane(laneIndex, laneId, "stage42Matrix");
      return {
        buildId: build.id,
        title: build.title,
        branch: build.branch,
        laneId: lane.id,
        laneTitle: lane.title,
        runtimeFamily: lane.runtimeFamily,
        kvCacheMode: lane.kvCacheMode,
      } satisfies LlamacppCampaignStage42PlanEntry;
    });
  });

  const primaryStage42Build = stage42[0]?.buildId ?? null;
  const stage43 = resolved.manifest.workflow.stage43BuildIds.map((buildId) => {
    const build = requireBuild(buildIndex, buildId, "stage43BuildIds");
    return {
      buildId: build.id,
      title: build.title,
      branch: build.branch,
      compareAgainst: primaryStage42Build ?? "stage42-winner",
    } satisfies LlamacppCampaignStage43PlanEntry;
  });

  const warnings: string[] = [];
  if (!existsSync(resolved.sourceRepoPath)) {
    warnings.push(`source repo path does not exist yet: ${resolved.sourceRepoPath}`);
  }
  if (!existsSync(resolved.workstationRepoPath)) {
    warnings.push(`workstation repo path does not exist yet: ${resolved.workstationRepoPath}`);
  }
  if (!existsSync(resolved.receiptRootPath)) {
    warnings.push(`receipt root does not exist yet: ${resolved.receiptRootPath}`);
  }
  for (const [buildId, buildBinDir] of Object.entries(resolved.buildBinDirs)) {
    if (!existsSync(buildBinDir)) {
      warnings.push(`build bin dir does not exist yet for ${buildId}: ${buildBinDir}`);
    }
  }
  for (const scriptPath of Object.values(resolved.workflowAnchors)) {
    if (!existsSync(scriptPath)) {
      warnings.push(`workflow anchor does not exist yet: ${scriptPath}`);
    }
  }

  return {
    action: "plan_matrix",
    manifestPath: resolved.manifestPath,
    campaignId: resolved.manifest.campaignId,
    objective: resolved.manifest.objective,
    workflowKind: resolved.manifest.workflow.kind,
    sourceRepoPath: resolved.sourceRepoPath,
    workstationRepoPath: resolved.workstationRepoPath,
    forkTargetRepoPath: resolved.forkTargetRepoPath,
    forkWorkingBranch: resolved.manifest.fork.workingBranch,
    receiptRootPath: resolved.receiptRootPath,
    workflowAnchors: { ...resolved.workflowAnchors },
    stage41,
    stage42,
    stage43,
    evidence: {
      expectedReceiptPaths: [...resolved.manifest.evidence.expectedReceiptPaths],
      requiredMetrics: [...resolved.manifest.evidence.requiredMetrics],
    },
    executionNotes: [
      "Stage 41 is the per-build validation anchor and should run before lane-level comparison.",
      "Stage 42 is the intra-llama.cpp branch/lane comparison matrix and should only use manifest-listed lane ids.",
      "Stage 43 is the vLLM comparison anchor and should run only after a Stage 42 winner exists.",
      "Use action=execute_stage to bind one selected build/stage to the current workstation script contract without turning this tool into a campaign runner.",
    ],
    warnings,
    nextAction: `Use ${AUTORESEARCH_LLAMACPP_CAMPAIGN_TOOL_NAME} with action=execute_stage to plan one exact stage for a selected build, or action=prepare_fork if the fork workspace still needs preparation.`,
  };
}

export function prepareLlamacppCampaignFork(input: {
  cwd: string;
  manifestPath: string;
  apply?: boolean;
}): PrepareLlamacppCampaignForkResult {
  const resolved = loadLlamacppCampaignManifest(input.manifestPath, input.cwd);
  const sourceRepoExists = existsSync(resolved.sourceRepoPath);
  const targetRepoExists = existsSync(resolved.forkTargetRepoPath);
  const commands: ProcessCommandSummary[] = [];
  let targetRepoClean: boolean | null = null;
  let workingBranchExists: boolean | null = null;

  if (!input.apply) {
    return {
      action: "prepare_fork",
      mode: "plan",
      manifestPath: resolved.manifestPath,
      campaignId: resolved.manifest.campaignId,
      sourceRepoPath: resolved.sourceRepoPath,
      targetRepoPath: resolved.forkTargetRepoPath,
      baseRef: resolved.manifest.fork.baseRef,
      workingBranch: resolved.manifest.fork.workingBranch,
      sourceRepoExists,
      targetRepoExists,
      targetRepoClean,
      workingBranchExists,
      commands: plannedForkCommands(resolved),
      nextAction: `Re-run ${AUTORESEARCH_LLAMACPP_CAMPAIGN_TOOL_NAME} with action=prepare_fork and apply=true once the fork plan is accepted.`,
    };
  }

  if (!sourceRepoExists) {
    throw new LlamacppCampaignManifestError(
      `source repo path does not exist: ${resolved.sourceRepoPath}`,
    );
  }

  if (!targetRepoExists) {
    mkdirSync(path.dirname(resolved.forkTargetRepoPath), { recursive: true });
    commands.push(
      runCommand(["git", "clone", resolved.sourceRepoPath, resolved.forkTargetRepoPath], null),
    );
  }

  ensureGitRepo(resolved.forkTargetRepoPath);
  targetRepoClean = gitStatusClean(resolved.forkTargetRepoPath, commands);
  if (!targetRepoClean) {
    throw new LlamacppCampaignManifestError(
      `target repo has uncommitted changes and cannot be used for fork preparation: ${resolved.forkTargetRepoPath}`,
    );
  }

  commands.push(
    runCommand(
      ["git", "rev-parse", "--verify", resolved.manifest.fork.baseRef],
      resolved.forkTargetRepoPath,
    ),
  );
  workingBranchExists = gitBranchExists(
    resolved.forkTargetRepoPath,
    resolved.manifest.fork.workingBranch,
    commands,
  );

  commands.push(
    runCommand(
      [
        "git",
        "checkout",
        "-B",
        resolved.manifest.fork.workingBranch,
        resolved.manifest.fork.baseRef,
      ],
      resolved.forkTargetRepoPath,
    ),
  );

  return {
    action: "prepare_fork",
    mode: "apply",
    manifestPath: resolved.manifestPath,
    campaignId: resolved.manifest.campaignId,
    sourceRepoPath: resolved.sourceRepoPath,
    targetRepoPath: resolved.forkTargetRepoPath,
    baseRef: resolved.manifest.fork.baseRef,
    workingBranch: resolved.manifest.fork.workingBranch,
    sourceRepoExists,
    targetRepoExists: true,
    targetRepoClean,
    workingBranchExists,
    commands,
    nextAction: `Use ${AUTORESEARCH_LLAMACPP_CAMPAIGN_TOOL_NAME} with action=execute_stage to plan or apply one exact stage for a selected build from ${resolved.manifest.campaignId}.`,
  };
}

export function executeLlamacppCampaignStage(input: {
  cwd: string;
  manifestPath: string;
  stage: LlamacppCampaignStage;
  buildId: string;
  apply?: boolean;
}): ExecuteLlamacppCampaignStageResult {
  const resolved = loadLlamacppCampaignManifest(input.manifestPath, input.cwd);
  const buildIndex = new Map(resolved.manifest.builds.map((build) => [build.id, build]));
  const laneIndex = new Map(resolved.manifest.lanes.map((lane) => [lane.id, lane]));
  const build = requireBuild(buildIndex, input.buildId, "execute_stage.buildId");

  if (input.stage === "41") {
    return executeStage41({
      resolved,
      laneIndex,
      build,
      apply: input.apply,
    });
  }
  if (input.stage === "42") {
    return executeStage42({
      resolved,
      laneIndex,
      build,
      apply: input.apply,
    });
  }
  return executeStage43({
    resolved,
    laneIndex,
    build,
    apply: input.apply,
  });
}

export function formatLlamacppCampaignControlResult(
  result: InspectLlamacppCampaignControlResult | ExecuteLlamacppCampaignControlResult,
): string {
  const taskContextLines = [
    `- supplied task id: ${result.control.taskContext.suppliedTaskId ?? "(none)"}`,
    `- verification state: ${result.control.taskContext.verificationState}`,
    `- verified task id: ${result.control.taskContext.verifiedTaskId ?? "(none)"}`,
    `- reason: ${result.control.taskContext.reason}`,
  ];
  const akBindingLines = result.control.akBinding
    ? [
        `- task id: ${result.control.akBinding.taskId}`,
        `- milestone: ${result.control.akBinding.ak.milestone}`,
        `- completion eligible: ${result.control.akBinding.lifecycle.completionEligible ? "yes" : "no"}`,
        `- lifecycle action: ${result.control.akBinding.lifecycle.action}`,
        `- projection key: ${result.control.akBinding.projection.projectionKey}`,
      ]
    : ["- (not bound to a verified live AK task)"];
  const selectedStepLines =
    result.action === "advance"
      ? result.executedStep
        ? [
            `- stage: ${result.executedStep.stage}`,
            `- build: ${result.executedStep.buildId}`,
            `- mode: ${result.executedStep.mode}`,
            `- command: ${formatCommand(result.executedStep.command.command, result.executedStep.command.cwd)}`,
            `- warnings: ${result.executedStep.warnings.length > 0 ? result.executedStep.warnings.join(" | ") : "none"}`,
          ]
        : ["- none"]
      : [];

  return [
    "# PI-AUTORESEARCH LLAMACPP CAMPAIGN CONTROL",
    "",
    `- action: ${result.action}`,
    ...("mode" in result ? [`- mode: ${result.mode}`] : []),
    `- manifest: ${result.control.autonomy.manifest.path}`,
    `- campaign: ${result.control.autonomy.manifest.campaignId}`,
    `- terminal stage: ${result.control.autonomy.manifest.terminalStage}`,
    `- receipt root: ${result.control.autonomy.manifest.receiptRootPath}`,
    `- overall state: ${result.control.autonomy.projection.overallState}`,
    "",
    "## Task context",
    ...taskContextLines,
    "",
    "## Public control",
    `- task bound: ${result.control.public.taskBound ? "yes" : "no"}`,
    `- next step action: ${result.control.public.nextStepAction}`,
    `- completion candidate: ${result.control.public.completionCandidate ? "yes" : "no"}`,
    `- reason: ${result.control.public.reason}`,
    "",
    "## Autonomy",
    `- phase: ${result.control.autonomy.lifecycle.phase}`,
    `- terminal stage materialized: ${result.control.autonomy.lifecycle.terminalStageMaterialized ? "yes" : "no"}`,
    `- lifecycle reason: ${result.control.autonomy.lifecycle.reason}`,
    "",
    "## Next step",
    `- action: ${result.control.autonomy.nextStep.action}`,
    `- stage: ${result.control.autonomy.nextStep.stage ?? "(none)"}`,
    `- build: ${result.control.autonomy.nextStep.buildId ?? "(none)"}`,
    `- reason: ${result.control.autonomy.nextStep.reason}`,
    "",
    "## AK context",
    ...akBindingLines,
    ...(result.action === "advance" ? ["", "## Selected step", ...selectedStepLines] : []),
    "",
    `- next step: ${result.nextAction}`,
  ].join("\n");
}

export function formatLlamacppCampaignResult(
  result:
    | PlanLlamacppCampaignMatrixResult
    | PrepareLlamacppCampaignForkResult
    | ExecuteLlamacppCampaignStageResult
    | BuildLlamacppCampaignAkBindingResult
    | AdvanceLlamacppCampaignResult,
): string {
  if (result.action === "plan_matrix") {
    const stage41Lines = result.stage41.map(
      (entry) =>
        `- ${entry.buildId}: ${entry.branch}${entry.cherryPickCommits.length > 0 ? ` + cherry-picks ${entry.cherryPickCommits.join(", ")}` : ""}`,
    );
    const stage42Lines = result.stage42.map(
      (entry) =>
        `- ${entry.buildId} x ${entry.laneId}: ${entry.branch} -> ${entry.runtimeFamily} / ${entry.kvCacheMode}`,
    );
    const stage43Lines = result.stage43.map(
      (entry) => `- ${entry.buildId}: ${entry.branch} -> compare against ${entry.compareAgainst}`,
    );
    const warningLines =
      result.warnings.length > 0 ? result.warnings.map((warning) => `- ${warning}`) : ["- none"];

    return [
      "# PI-AUTORESEARCH LLAMACPP CAMPAIGN",
      "",
      `- action: ${result.action}`,
      `- manifest: ${result.manifestPath}`,
      `- campaign: ${result.campaignId}`,
      `- objective: ${result.objective}`,
      `- workflow: ${result.workflowKind}`,
      `- source repo: ${result.sourceRepoPath}`,
      `- workstation repo: ${result.workstationRepoPath}`,
      `- fork target: ${result.forkTargetRepoPath}`,
      `- fork working branch: ${result.forkWorkingBranch}`,
      `- receipt root: ${result.receiptRootPath}`,
      `- stage41 anchor: ${result.workflowAnchors.stage41Script}`,
      `- stage42 anchor: ${result.workflowAnchors.stage42Script}`,
      `- stage43 anchor: ${result.workflowAnchors.stage43Script}`,
      "",
      "## Stage 41 — validation",
      ...stage41Lines,
      "",
      "## Stage 42 — branch/lane matrix",
      ...stage42Lines,
      "",
      "## Stage 43 — vLLM comparison candidates",
      ...(stage43Lines.length > 0 ? stage43Lines : ["- none"]),
      "",
      "## Evidence expectations",
      ...result.evidence.expectedReceiptPaths.map((entry) => `- receipt: ${entry}`),
      ...result.evidence.requiredMetrics.map((entry) => `- metric: ${entry}`),
      "",
      "## Warnings",
      ...warningLines,
      "",
      `- next step: ${result.nextAction}`,
    ].join("\n");
  }

  if (result.action === "build_ak_binding") {
    return [
      "# PI-AUTORESEARCH LLAMACPP CAMPAIGN",
      "",
      `- action: ${result.action}`,
      `- task id: ${result.binding.taskId}`,
      `- manifest: ${result.binding.manifest.path}`,
      `- campaign: ${result.binding.manifest.campaignId}`,
      `- terminal stage: ${result.binding.manifest.terminalStage}`,
      `- receipt root: ${result.binding.manifest.receiptRootPath}`,
      `- overall state: ${result.binding.projection.overallState}`,
      `- projection key: ${result.binding.projection.projectionKey}`,
      "",
      "## AK binding",
      `- milestone: ${result.binding.ak.milestone}`,
      `- check type: ${result.binding.ak.checkType}`,
      `- result: ${result.binding.ak.result}`,
      `- summary: ${result.binding.ak.summary}`,
      "",
      "## Lifecycle",
      `- completion eligible: ${result.binding.lifecycle.completionEligible ? "yes" : "no"}`,
      `- action: ${result.binding.lifecycle.action}`,
      `- reason: ${result.binding.lifecycle.reason}`,
      "",
      "## Stage counts",
      `- stage41 receipts: ${result.binding.stages.stage41PresentReceipts}/${result.binding.stages.stage41ExpectedBuilds}`,
      `- stage41 corpora: ${result.binding.stages.stage41PresentCorpora}/${result.binding.stages.stage41ExpectedBuilds}`,
      `- stage42 receipts: ${result.binding.stages.stage42PresentReceipts}/${result.binding.stages.stage42ExpectedBuilds}`,
      `- stage43 receipts: ${result.binding.stages.stage43PresentReceipts}/${result.binding.stages.stage43ExpectedBuilds}`,
      "",
      `- next step: ${result.nextAction}`,
    ].join("\n");
  }

  if (result.action === "advance_campaign") {
    const executedStepLines = result.executedStep
      ? [
          `- stage: ${result.executedStep.stage}`,
          `- build: ${result.executedStep.buildId}`,
          `- mode: ${result.executedStep.mode}`,
          `- command: ${formatCommand(result.executedStep.command.command, result.executedStep.command.cwd)}`,
          `- warnings: ${result.executedStep.warnings.length > 0 ? result.executedStep.warnings.join(" | ") : "none"}`,
          `- step next action: ${result.executedStep.nextAction}`,
        ]
      : ["- none"];

    return [
      "# PI-AUTORESEARCH LLAMACPP CAMPAIGN",
      "",
      `- action: ${result.action}`,
      `- mode: ${result.mode}`,
      `- manifest: ${result.autonomy.manifest.path}`,
      `- campaign: ${result.autonomy.manifest.campaignId}`,
      `- terminal stage: ${result.autonomy.manifest.terminalStage}`,
      `- receipt root: ${result.autonomy.manifest.receiptRootPath}`,
      `- overall state: ${result.autonomy.projection.overallState}`,
      "",
      "## Autonomy",
      `- phase: ${result.autonomy.lifecycle.phase}`,
      `- terminal stage materialized: ${result.autonomy.lifecycle.terminalStageMaterialized ? "yes" : "no"}`,
      `- lifecycle reason: ${result.autonomy.lifecycle.reason}`,
      "",
      "## Stage counts",
      `- stage41 complete: ${result.autonomy.stages.stage41CompletedBuilds}/${result.autonomy.stages.stage41ExpectedBuilds}`,
      `- stage42 complete: ${result.autonomy.stages.stage42CompletedBuilds}/${result.autonomy.stages.stage42ExpectedBuilds}`,
      `- stage43 complete: ${result.autonomy.stages.stage43CompletedBuilds}/${result.autonomy.stages.stage43ExpectedBuilds}`,
      "",
      "## Next step",
      `- action: ${result.autonomy.nextStep.action}`,
      `- stage: ${result.autonomy.nextStep.stage ?? "(none)"}`,
      `- build: ${result.autonomy.nextStep.buildId ?? "(none)"}`,
      `- reason: ${result.autonomy.nextStep.reason}`,
      "",
      "## Selected step",
      ...executedStepLines,
      "",
      `- next step: ${result.nextAction}`,
    ].join("\n");
  }

  if (result.action === "prepare_fork") {
    const commandLines =
      result.commands.length > 0
        ? result.commands.map((entry) => `- ${formatCommand(entry.command, entry.cwd)}`)
        : ["- none"];

    return [
      "# PI-AUTORESEARCH LLAMACPP CAMPAIGN",
      "",
      `- action: ${result.action}`,
      `- mode: ${result.mode}`,
      `- manifest: ${result.manifestPath}`,
      `- campaign: ${result.campaignId}`,
      `- source repo exists: ${result.sourceRepoExists ? "yes" : "no"}`,
      `- target repo: ${result.targetRepoPath}`,
      `- target repo exists: ${result.targetRepoExists ? "yes" : "no"}`,
      `- target repo clean: ${result.targetRepoClean === null ? "(not checked)" : result.targetRepoClean ? "yes" : "no"}`,
      `- working branch: ${result.workingBranch}`,
      `- working branch exists: ${result.workingBranchExists === null ? "(not checked)" : result.workingBranchExists ? "yes" : "no"}`,
      `- base ref: ${result.baseRef}`,
      "",
      "## Commands",
      ...commandLines,
      "",
      `- next step: ${result.nextAction}`,
    ].join("\n");
  }

  const prerequisiteLines = result.prerequisites.map(
    (entry) =>
      `- ${entry.label}: ${entry.path} [${entry.required ? "required" : "optional"}, ${entry.exists ? "exists" : "missing"}]`,
  );
  const translationLines: string[] = [];
  if (result.translation.stage41KvTypes) {
    translationLines.push(`- stage41 kv types: ${result.translation.stage41KvTypes.join(", ")}`);
  }
  if (result.translation.configIKvType) {
    translationLines.push(`- config_i kv type: ${result.translation.configIKvType}`);
  }
  if (result.translation.q8KvTypes.length > 0) {
    translationLines.push(`- q8 kv types: ${result.translation.q8KvTypes.join(", ")}`);
  }
  const warningLines =
    result.warnings.length > 0 ? result.warnings.map((warning) => `- ${warning}`) : ["- none"];

  return [
    "# PI-AUTORESEARCH LLAMACPP CAMPAIGN",
    "",
    `- action: ${result.action}`,
    `- stage: ${result.stage}`,
    `- mode: ${result.mode}`,
    `- manifest: ${result.manifestPath}`,
    `- campaign: ${result.campaignId}`,
    `- build: ${result.buildId} (${result.buildTitle})`,
    `- branch: ${result.branch}`,
    `- script: ${result.scriptPath}`,
    `- receipt root: ${result.receiptRootPath}`,
    `- build bin dir: ${result.buildBinDir ?? "(not used)"}`,
    `- output receipt: ${result.outputs.receiptPath}`,
    `- output corpus: ${result.outputs.corpusPath ?? "(not used)"}`,
    "",
    "## Prerequisites",
    ...prerequisiteLines,
    "",
    "## Translation",
    ...(translationLines.length > 0 ? translationLines : ["- none"]),
    "",
    "## Command",
    `- ${formatCommand(result.command.command, result.command.cwd)}`,
    "",
    "## Warnings",
    ...warningLines,
    "",
    `- next step: ${result.nextAction}`,
  ].join("\n");
}

function executeStage41(input: {
  resolved: ResolvedLlamacppCampaignManifest;
  laneIndex: Map<string, LlamacppCampaignLaneSpec>;
  build: LlamacppCampaignBuildSpec;
  apply?: boolean;
}): ExecuteLlamacppCampaignStageResult {
  const { resolved, build, laneIndex } = input;
  ensureStageMembership(
    resolved.manifest.workflow.stage41BuildIds,
    build.id,
    `build ${build.id} is not listed in workflow.stage41BuildIds`,
  );

  const buildBinDir = requireBuildBinDir(resolved, build.id);
  const paths = deriveStagePaths(resolved.receiptRootPath, build.id);
  const stage42Entry = getStage42Entry(resolved.manifest.workflow.stage42Matrix, build.id);
  const stage41KvTypes = uniqueStrings([
    "f16",
    ...(stage42Entry?.laneIds ?? []).map(
      (laneId) => requireLane(laneIndex, laneId, `stage41.${build.id}`).kvCacheMode,
    ),
  ]);
  const prerequisites = [
    buildPathCheck("stage41_script", resolved.workflowAnchors.stage41Script, true),
    buildPathCheck("build_bin_dir", buildBinDir, true),
  ];
  const command = [
    PYTHON_EXECUTABLE,
    resolved.workflowAnchors.stage41Script,
    input.apply ? "--apply" : "--plan",
    "--build-bin-dir",
    buildBinDir,
    "--output",
    paths.stage41ReceiptPath,
    "--corpus-output",
    paths.stage41CorpusPath,
    "--kv-types",
    ...stage41KvTypes,
  ];
  const warnings = collectMissingPathWarnings(prerequisites);

  if (!input.apply) {
    return {
      action: "execute_stage",
      stage: "41",
      mode: "plan",
      manifestPath: resolved.manifestPath,
      campaignId: resolved.manifest.campaignId,
      buildId: build.id,
      buildTitle: build.title,
      branch: build.branch,
      scriptPath: resolved.workflowAnchors.stage41Script,
      receiptRootPath: resolved.receiptRootPath,
      buildBinDir,
      outputs: {
        receiptPath: paths.stage41ReceiptPath,
        corpusPath: paths.stage41CorpusPath,
      },
      prerequisites,
      translation: {
        stage41KvTypes,
        configIKvType: null,
        q8KvTypes: [],
      },
      command: plannedCommandSummary(command, resolved.workstationRepoPath),
      warnings,
      nextAction: `Re-run ${AUTORESEARCH_LLAMACPP_CAMPAIGN_TOOL_NAME} with action=execute_stage, stage=41, buildId=${build.id}, and apply=true once the build bin dir and stage-41 script anchor are ready.`,
    };
  }

  requireExistingPath(resolved.workflowAnchors.stage41Script, "stage41_script");
  requireExistingPath(buildBinDir, "build_bin_dir");
  mkdirSync(resolved.receiptRootPath, { recursive: true });

  return {
    action: "execute_stage",
    stage: "41",
    mode: "apply",
    manifestPath: resolved.manifestPath,
    campaignId: resolved.manifest.campaignId,
    buildId: build.id,
    buildTitle: build.title,
    branch: build.branch,
    scriptPath: resolved.workflowAnchors.stage41Script,
    receiptRootPath: resolved.receiptRootPath,
    buildBinDir,
    outputs: {
      receiptPath: paths.stage41ReceiptPath,
      corpusPath: paths.stage41CorpusPath,
    },
    prerequisites,
    translation: {
      stage41KvTypes,
      configIKvType: null,
      q8KvTypes: [],
    },
    command: runCommand(command, resolved.workstationRepoPath),
    warnings,
    nextAction: getStage41NextAction(resolved, build.id),
  };
}

function executeStage42(input: {
  resolved: ResolvedLlamacppCampaignManifest;
  laneIndex: Map<string, LlamacppCampaignLaneSpec>;
  build: LlamacppCampaignBuildSpec;
  apply?: boolean;
}): ExecuteLlamacppCampaignStageResult {
  const { resolved, build, laneIndex } = input;
  const stage42Entry = requireStage42Entry(resolved.manifest.workflow.stage42Matrix, build.id);
  const translation = translateStage42Entry(stage42Entry, laneIndex, build.id);
  const buildBinDir = requireBuildBinDir(resolved, build.id);
  const paths = deriveStagePaths(resolved.receiptRootPath, build.id);
  const prerequisites = [
    buildPathCheck("stage42_script", resolved.workflowAnchors.stage42Script, true),
    buildPathCheck("build_bin_dir", buildBinDir, true),
    buildPathCheck("stage41_reference_receipt", paths.stage41ReceiptPath, true),
  ];
  const command = [
    PYTHON_EXECUTABLE,
    resolved.workflowAnchors.stage42Script,
    input.apply ? "--apply" : "--plan",
    "--reference-receipt",
    paths.stage41ReceiptPath,
    "--build-bin-dir",
    buildBinDir,
    "--output",
    paths.stage42ReceiptPath,
    "--config-i-kv-type",
    translation.configILane.kvCacheMode,
    "--q8-kv-types",
    ...translation.q8Lanes.map((lane) => lane.kvCacheMode),
  ];
  const warnings = collectMissingPathWarnings(prerequisites);

  if (!input.apply) {
    return {
      action: "execute_stage",
      stage: "42",
      mode: "plan",
      manifestPath: resolved.manifestPath,
      campaignId: resolved.manifest.campaignId,
      buildId: build.id,
      buildTitle: build.title,
      branch: build.branch,
      scriptPath: resolved.workflowAnchors.stage42Script,
      receiptRootPath: resolved.receiptRootPath,
      buildBinDir,
      outputs: {
        receiptPath: paths.stage42ReceiptPath,
        corpusPath: null,
      },
      prerequisites,
      translation: {
        stage41KvTypes: null,
        configIKvType: translation.configILane.kvCacheMode,
        q8KvTypes: translation.q8Lanes.map((lane) => lane.kvCacheMode),
      },
      command: plannedCommandSummary(command, resolved.workstationRepoPath),
      warnings,
      nextAction: `Re-run ${AUTORESEARCH_LLAMACPP_CAMPAIGN_TOOL_NAME} with action=execute_stage, stage=42, buildId=${build.id}, and apply=true once the stage-41 receipt and build bin dir are ready.`,
    };
  }

  requireExistingPath(resolved.workflowAnchors.stage42Script, "stage42_script");
  requireExistingPath(buildBinDir, "build_bin_dir");
  requireExistingPath(paths.stage41ReceiptPath, "stage41_reference_receipt");
  mkdirSync(resolved.receiptRootPath, { recursive: true });

  return {
    action: "execute_stage",
    stage: "42",
    mode: "apply",
    manifestPath: resolved.manifestPath,
    campaignId: resolved.manifest.campaignId,
    buildId: build.id,
    buildTitle: build.title,
    branch: build.branch,
    scriptPath: resolved.workflowAnchors.stage42Script,
    receiptRootPath: resolved.receiptRootPath,
    buildBinDir,
    outputs: {
      receiptPath: paths.stage42ReceiptPath,
      corpusPath: null,
    },
    prerequisites,
    translation: {
      stage41KvTypes: null,
      configIKvType: translation.configILane.kvCacheMode,
      q8KvTypes: translation.q8Lanes.map((lane) => lane.kvCacheMode),
    },
    command: runCommand(command, resolved.workstationRepoPath),
    warnings,
    nextAction: getStage42NextAction(resolved, build.id),
  };
}

function executeStage43(input: {
  resolved: ResolvedLlamacppCampaignManifest;
  laneIndex: Map<string, LlamacppCampaignLaneSpec>;
  build: LlamacppCampaignBuildSpec;
  apply?: boolean;
}): ExecuteLlamacppCampaignStageResult {
  const { resolved, build, laneIndex } = input;
  ensureStageMembership(
    resolved.manifest.workflow.stage43BuildIds,
    build.id,
    `build ${build.id} is not listed in workflow.stage43BuildIds`,
  );
  const stage42Entry = requireStage42Entry(resolved.manifest.workflow.stage42Matrix, build.id);
  const translatedStage42 = translateStage42Entry(stage42Entry, laneIndex, build.id);
  const paths = deriveStagePaths(resolved.receiptRootPath, build.id);
  const stage41CorpusExists = existsSync(paths.stage41CorpusPath);
  const prerequisites = [
    buildPathCheck("stage43_script", resolved.workflowAnchors.stage43Script, true),
    buildPathCheck("stage42_reference_receipt", paths.stage42ReceiptPath, true),
    buildPathCheck("stage41_corpus_input", paths.stage41CorpusPath, false),
  ];
  const command = [
    PYTHON_EXECUTABLE,
    resolved.workflowAnchors.stage43Script,
    input.apply ? "--apply" : "--plan",
    "--reference-receipt",
    paths.stage42ReceiptPath,
    "--output",
    paths.stage43ReceiptPath,
    ...(stage41CorpusExists ? ["--corpus-input", paths.stage41CorpusPath] : []),
  ];
  const warnings = collectMissingPathWarnings(prerequisites);

  if (!input.apply) {
    return {
      action: "execute_stage",
      stage: "43",
      mode: "plan",
      manifestPath: resolved.manifestPath,
      campaignId: resolved.manifest.campaignId,
      buildId: build.id,
      buildTitle: build.title,
      branch: build.branch,
      scriptPath: resolved.workflowAnchors.stage43Script,
      receiptRootPath: resolved.receiptRootPath,
      buildBinDir: null,
      outputs: {
        receiptPath: paths.stage43ReceiptPath,
        corpusPath: null,
      },
      prerequisites,
      translation: {
        stage41KvTypes: null,
        configIKvType: translatedStage42.configILane.kvCacheMode,
        q8KvTypes: translatedStage42.q8Lanes.map((lane) => lane.kvCacheMode),
      },
      command: plannedCommandSummary(command, resolved.workstationRepoPath),
      warnings,
      nextAction: `Re-run ${AUTORESEARCH_LLAMACPP_CAMPAIGN_TOOL_NAME} with action=execute_stage, stage=43, buildId=${build.id}, and apply=true once the stage-42 receipt exists.`,
    };
  }

  requireExistingPath(resolved.workflowAnchors.stage43Script, "stage43_script");
  requireExistingPath(paths.stage42ReceiptPath, "stage42_reference_receipt");
  mkdirSync(resolved.receiptRootPath, { recursive: true });

  return {
    action: "execute_stage",
    stage: "43",
    mode: "apply",
    manifestPath: resolved.manifestPath,
    campaignId: resolved.manifest.campaignId,
    buildId: build.id,
    buildTitle: build.title,
    branch: build.branch,
    scriptPath: resolved.workflowAnchors.stage43Script,
    receiptRootPath: resolved.receiptRootPath,
    buildBinDir: null,
    outputs: {
      receiptPath: paths.stage43ReceiptPath,
      corpusPath: null,
    },
    prerequisites,
    translation: {
      stage41KvTypes: null,
      configIKvType: translatedStage42.configILane.kvCacheMode,
      q8KvTypes: translatedStage42.q8Lanes.map((lane) => lane.kvCacheMode),
    },
    command: runCommand(command, resolved.workstationRepoPath),
    warnings,
    nextAction: `Inspect ${paths.stage43ReceiptPath} for the build-scoped vLLM comparison output for ${build.id}.`,
  };
}

function getStage41NextAction(resolved: ResolvedLlamacppCampaignManifest, buildId: string): string {
  const hasStage42 = resolved.manifest.workflow.stage42Matrix.some(
    (entry) => entry.buildId === buildId,
  );
  if (hasStage42) {
    return `Use ${AUTORESEARCH_LLAMACPP_CAMPAIGN_TOOL_NAME} with action=execute_stage, stage=42, buildId=${buildId} to bind the stage-41 receipt into the current q8-vs-config-i workstation script.`;
  }
  return `Inspect the stage-41 outputs under ${resolved.receiptRootPath}; this build has no stage-42 binding in the current manifest.`;
}

function getStage42NextAction(resolved: ResolvedLlamacppCampaignManifest, buildId: string): string {
  if (resolved.manifest.workflow.stage43BuildIds.includes(buildId)) {
    return `Use ${AUTORESEARCH_LLAMACPP_CAMPAIGN_TOOL_NAME} with action=execute_stage, stage=43, buildId=${buildId} to compare the selected stage-42 result against the workstation vLLM canary.`;
  }
  return `Inspect ${deriveStagePaths(resolved.receiptRootPath, buildId).stage42ReceiptPath} for the build-scoped stage-42 receipt.`;
}

function plannedForkCommands(resolved: ResolvedLlamacppCampaignManifest): ProcessCommandSummary[] {
  const commands: Array<{ command: string[]; cwd: string | null }> = [];
  if (!existsSync(resolved.forkTargetRepoPath)) {
    commands.push({
      command: ["git", "clone", resolved.sourceRepoPath, resolved.forkTargetRepoPath],
      cwd: null,
    });
  }
  commands.push({
    command: ["git", "rev-parse", "--verify", resolved.manifest.fork.baseRef],
    cwd: resolved.forkTargetRepoPath,
  });
  commands.push({
    command: [
      "git",
      "checkout",
      "-B",
      resolved.manifest.fork.workingBranch,
      resolved.manifest.fork.baseRef,
    ],
    cwd: resolved.forkTargetRepoPath,
  });
  return commands.map((entry) => plannedCommandSummary(entry.command, entry.cwd));
}

function deriveLlamacppCampaignProjectionOverallState(
  builds: LlamacppCampaignBuildProjection[],
): LlamacppCampaignProjectionOverallState {
  const stage41ExpectedBuilds = builds.filter((build) => build.stages["41"].expected);
  const stage42ExpectedBuilds = builds.filter((build) => build.stages["42"].expected);
  const stage43ExpectedBuilds = builds.filter((build) => build.stages["43"].expected);
  const hasAnyMaterializedOutputs = builds.some(
    (build) =>
      build.stages["41"].receiptExists ||
      build.stages["41"].corpusExists ||
      build.stages["42"].receiptExists ||
      build.stages["43"].receiptExists,
  );
  const stage41Complete =
    stage41ExpectedBuilds.length > 0 &&
    stage41ExpectedBuilds.every((build) => build.stages["41"].receiptExists);
  const stage42Complete =
    stage42ExpectedBuilds.length > 0 &&
    stage42ExpectedBuilds.every((build) => build.stages["42"].receiptExists);
  const stage43Complete =
    stage43ExpectedBuilds.length > 0 &&
    stage43ExpectedBuilds.every((build) => build.stages["43"].receiptExists);

  if (!hasAnyMaterializedOutputs) {
    return "planned_only";
  }
  if (stage43Complete && stage42Complete && stage41Complete) {
    return "stage43_complete";
  }
  if (stage42Complete && stage41Complete) {
    return "stage42_complete";
  }
  if (stage41Complete) {
    return "stage41_complete";
  }
  return "partially_materialized";
}

function deriveHighestCompletedStage(input: {
  stage41ReceiptExists: boolean;
  stage42ReceiptExists: boolean;
  stage43ReceiptExists: boolean;
}): 0 | 41 | 42 | 43 {
  if (input.stage43ReceiptExists) {
    return 43;
  }
  if (input.stage42ReceiptExists) {
    return 42;
  }
  if (input.stage41ReceiptExists) {
    return 41;
  }
  return 0;
}

export function deriveStagePaths(
  receiptRootPath: string,
  buildId: string,
): LlamacppCampaignStagePaths {
  return {
    stage41ReceiptPath: path.join(receiptRootPath, `${buildId}-stage41-validation.json`),
    stage41CorpusPath: path.join(receiptRootPath, `${buildId}-stage41-corpus.txt`),
    stage42ReceiptPath: path.join(receiptRootPath, `${buildId}-stage42-q8-vs-config-i.json`),
    stage43ReceiptPath: path.join(receiptRootPath, `${buildId}-stage43-vllm-comparison.json`),
  };
}

function requireAkTaskId(taskId: number): number {
  if (!Number.isInteger(taskId) || taskId <= 0) {
    throw new LlamacppCampaignManifestError(
      `taskId must be a positive integer, got ${String(taskId)}`,
    );
  }
  return taskId;
}

function buildLlamacppCampaignTaskContext(taskId?: number): LlamacppCampaignTaskContextV1 {
  if (taskId === undefined) {
    return {
      suppliedTaskId: null,
      verificationState: "not_requested",
      verifiedTaskId: null,
      reason: "no AK task context was requested",
    };
  }

  const exactTaskId = requireAkTaskId(taskId);
  const completed = spawnSync("ak", ["task", "show", String(exactTaskId), "-F", "json"], {
    encoding: "utf8",
  });
  const stdout = (completed.stdout ?? "").trim();
  const stderr = (completed.stderr ?? (completed.error ? String(completed.error) : "")).trim();
  const exitCode = completed.status ?? (completed.error ? 1 : 0);

  if (exitCode === 0) {
    try {
      const payload = JSON.parse(stdout) as { id?: unknown };
      if (payload.id !== exactTaskId) {
        return {
          suppliedTaskId: exactTaskId,
          verificationState: "verification_unavailable",
          verifiedTaskId: null,
          reason: `live AK verification for taskId ${exactTaskId} returned an unexpected task identity`,
        };
      }
      return {
        suppliedTaskId: exactTaskId,
        verificationState: "verified_live",
        verifiedTaskId: exactTaskId,
        reason: `verified AK task ${exactTaskId}`,
      };
    } catch (error) {
      return {
        suppliedTaskId: exactTaskId,
        verificationState: "verification_unavailable",
        verifiedTaskId: null,
        reason: `live AK verification for taskId ${exactTaskId} returned unreadable output: ${error instanceof Error ? error.message : String(error)}`,
      };
    }
  }

  const combined = [stdout, stderr].filter(Boolean).join("\n");
  if (/not found|no such task|unknown task/i.test(combined)) {
    return {
      suppliedTaskId: exactTaskId,
      verificationState: "not_found",
      verifiedTaskId: null,
      reason: `supplied taskId ${exactTaskId} did not resolve to a live AK task`,
    };
  }

  return {
    suppliedTaskId: exactTaskId,
    verificationState: "verification_unavailable",
    verifiedTaskId: null,
    reason: `live AK verification for taskId ${exactTaskId} is currently unavailable${stderr ? `: ${stderr}` : ""}`,
  };
}

function deriveLlamacppCampaignTerminalStage(manifest: LlamacppCampaignManifest): 41 | 42 | 43 {
  if (manifest.workflow.stage43BuildIds.length > 0) {
    return 43;
  }
  if (manifest.workflow.stage42Matrix.length > 0) {
    return 42;
  }
  if (manifest.workflow.stage41BuildIds.length > 0) {
    return 41;
  }
  throw new LlamacppCampaignManifestError(
    `manifest ${manifest.campaignId} does not define any executable stage expectation for AK binding`,
  );
}

function summarizeLlamacppCampaignAkStages(
  projection: LlamacppCampaignProjectionV1,
): LlamacppCampaignAkBindingStageSummary {
  return {
    buildCount: projection.builds.length,
    stage41ExpectedBuilds: projection.builds.filter((build) => build.stages["41"].expected).length,
    stage41PresentReceipts: projection.builds.filter((build) => build.stages["41"].receiptExists)
      .length,
    stage41PresentCorpora: projection.builds.filter((build) => build.stages["41"].corpusExists)
      .length,
    stage42ExpectedBuilds: projection.builds.filter((build) => build.stages["42"].expected).length,
    stage42PresentReceipts: projection.builds.filter((build) => build.stages["42"].receiptExists)
      .length,
    stage43ExpectedBuilds: projection.builds.filter((build) => build.stages["43"].expected).length,
    stage43PresentReceipts: projection.builds.filter((build) => build.stages["43"].receiptExists)
      .length,
  };
}

function deriveLlamacppCampaignAutonomyState(input: {
  cwd: string;
  manifestPath: string;
  updatedAt?: number;
}): {
  autonomy: LlamacppCampaignAutonomyV1;
  plannedStep: ExecuteLlamacppCampaignStageResult | null;
} {
  const resolved = loadLlamacppCampaignManifest(input.manifestPath, input.cwd);
  const projection = buildLlamacppCampaignProjection({
    cwd: input.cwd,
    manifestPath: input.manifestPath,
    updatedAt: input.updatedAt,
  });
  return deriveLlamacppCampaignAutonomyStateFromResolvedProjection({
    cwd: input.cwd,
    manifestPath: input.manifestPath,
    resolved,
    projection,
  });
}

function deriveLlamacppCampaignAutonomyStateFromResolvedProjection(input: {
  cwd: string;
  manifestPath: string;
  resolved: ResolvedLlamacppCampaignManifest;
  projection: LlamacppCampaignProjectionV1;
}): {
  autonomy: LlamacppCampaignAutonomyV1;
  plannedStep: ExecuteLlamacppCampaignStageResult | null;
} {
  const terminalStage = deriveLlamacppCampaignTerminalStage(input.resolved.manifest);
  const stages = summarizeLlamacppCampaignAutonomyStages(input.projection);
  const nextStep = selectLlamacppCampaignAutonomyNextStep(
    input.resolved.manifest,
    input.projection,
    stages,
  );

  if (!nextStep) {
    return {
      autonomy: {
        type: AUTORESEARCH_LLAMACPP_CAMPAIGN_AUTONOMY_KIND,
        version: AUTORESEARCH_LLAMACPP_CAMPAIGN_AUTONOMY_VERSION,
        manifest: {
          path: input.projection.manifest.path,
          campaignId: input.projection.manifest.campaignId,
          manifestKey: input.projection.manifest.manifestKey,
          receiptRootPath: input.projection.manifest.receiptRootPath,
          terminalStage,
        },
        projection: {
          overallState: input.projection.status.overallState,
          updatedAt: input.projection.updatedAt,
        },
        stages,
        lifecycle: {
          phase: "terminal_stage_complete",
          terminalStageMaterialized: true,
          reason: `manifest terminal stage ${terminalStage} is materially complete at ${getLlamacppCampaignAutonomyStageCounts(stages, terminalStage).completed}/${getLlamacppCampaignAutonomyStageCounts(stages, terminalStage).expected} expected ${pluralize("build", getLlamacppCampaignAutonomyStageCounts(stages, terminalStage).expected)}`,
        },
        nextStep: {
          action: "none",
          stage: null,
          buildId: null,
          reason: `no further stage execution is required because terminal stage ${terminalStage} is already materially complete for this manifest`,
        },
      },
      plannedStep: null,
    };
  }

  let plannedStep: ExecuteLlamacppCampaignStageResult | null = null;
  let blockedReason: string | null = null;
  try {
    plannedStep = executeLlamacppCampaignStage({
      cwd: input.cwd,
      manifestPath: input.manifestPath,
      stage: toLlamacppCampaignStage(nextStep.stage),
      buildId: nextStep.buildId,
    });
    if (plannedStep.warnings.length > 0) {
      blockedReason = plannedStep.warnings.join(" | ");
    }
  } catch (error) {
    blockedReason = error instanceof Error ? error.message : String(error);
  }

  const phase = blockedReason
    ? "blocked"
    : getLlamacppCampaignAutonomyPhaseForStage(nextStep.stage);
  const lifecycleReason = blockedReason
    ? `next truthful local step is stage ${nextStep.stage} for build ${nextStep.buildId}, but it is currently blocked: ${blockedReason}`
    : buildLlamacppCampaignAutonomyPhaseReason(nextStep.stage, nextStep.buildId, stages);

  return {
    autonomy: {
      type: AUTORESEARCH_LLAMACPP_CAMPAIGN_AUTONOMY_KIND,
      version: AUTORESEARCH_LLAMACPP_CAMPAIGN_AUTONOMY_VERSION,
      manifest: {
        path: input.projection.manifest.path,
        campaignId: input.projection.manifest.campaignId,
        manifestKey: input.projection.manifest.manifestKey,
        receiptRootPath: input.projection.manifest.receiptRootPath,
        terminalStage,
      },
      projection: {
        overallState: input.projection.status.overallState,
        updatedAt: input.projection.updatedAt,
      },
      stages,
      lifecycle: {
        phase,
        terminalStageMaterialized: false,
        reason: lifecycleReason,
      },
      nextStep: {
        action: "execute_stage",
        stage: nextStep.stage,
        buildId: nextStep.buildId,
        reason:
          blockedReason ??
          buildLlamacppCampaignAutonomyNextStepReason(nextStep.stage, nextStep.buildId, stages),
      },
    },
    plannedStep,
  };
}

function summarizeLlamacppCampaignAutonomyStages(
  projection: LlamacppCampaignProjectionV1,
): LlamacppCampaignAutonomyStageCounts {
  return {
    stage41ExpectedBuilds: projection.builds.filter((build) => build.stages["41"].expected).length,
    stage41CompletedBuilds: projection.builds.filter(
      (build) =>
        build.stages["41"].expected &&
        build.stages["41"].receiptExists &&
        build.stages["41"].corpusExists,
    ).length,
    stage42ExpectedBuilds: projection.builds.filter((build) => build.stages["42"].expected).length,
    stage42CompletedBuilds: projection.builds.filter(
      (build) => build.stages["42"].expected && build.stages["42"].receiptExists,
    ).length,
    stage43ExpectedBuilds: projection.builds.filter((build) => build.stages["43"].expected).length,
    stage43CompletedBuilds: projection.builds.filter(
      (build) => build.stages["43"].expected && build.stages["43"].receiptExists,
    ).length,
  };
}

function selectLlamacppCampaignAutonomyNextStep(
  manifest: LlamacppCampaignManifest,
  projection: LlamacppCampaignProjectionV1,
  stages: LlamacppCampaignAutonomyStageCounts,
): { stage: 41 | 42 | 43; buildId: string } | null {
  if (stages.stage41CompletedBuilds < stages.stage41ExpectedBuilds) {
    for (const buildId of manifest.workflow.stage41BuildIds) {
      const build = requireProjectedBuild(projection, buildId, "autonomy.stage41");
      if (!build.stages["41"].receiptExists || !build.stages["41"].corpusExists) {
        return { stage: 41, buildId };
      }
    }
  }

  if (stages.stage42CompletedBuilds < stages.stage42ExpectedBuilds) {
    for (const entry of manifest.workflow.stage42Matrix) {
      const build = requireProjectedBuild(projection, entry.buildId, "autonomy.stage42");
      if (!build.stages["42"].receiptExists) {
        return { stage: 42, buildId: entry.buildId };
      }
    }
  }

  if (stages.stage43CompletedBuilds < stages.stage43ExpectedBuilds) {
    for (const buildId of manifest.workflow.stage43BuildIds) {
      const build = requireProjectedBuild(projection, buildId, "autonomy.stage43");
      if (!build.stages["43"].receiptExists) {
        return { stage: 43, buildId };
      }
    }
  }

  return null;
}

function requireProjectedBuild(
  projection: LlamacppCampaignProjectionV1,
  buildId: string,
  label: string,
): LlamacppCampaignBuildProjection {
  const build = projection.builds.find((entry) => entry.buildId === buildId);
  if (!build) {
    throw new LlamacppCampaignManifestError(
      `${label} references unknown projected build id: ${buildId}`,
    );
  }
  return build;
}

function toLlamacppCampaignStage(stage: 41 | 42 | 43): LlamacppCampaignStage {
  return String(stage) as LlamacppCampaignStage;
}

function getLlamacppCampaignAutonomyPhaseForStage(
  stage: 41 | 42 | 43,
): Exclude<LlamacppCampaignAutonomyPhase, "blocked" | "terminal_stage_complete"> {
  if (stage === 41) {
    return "stage41_wave";
  }
  if (stage === 42) {
    return "stage42_wave";
  }
  return "stage43_wave";
}

function buildLlamacppCampaignAutonomyNextStepReason(
  stage: 41 | 42 | 43,
  buildId: string,
  stages: LlamacppCampaignAutonomyStageCounts,
): string {
  const counts = getLlamacppCampaignAutonomyStageCounts(stages, stage);
  if (stage === 41) {
    return `stage 41 remains incomplete at ${counts.completed}/${counts.expected} expected builds because build ${buildId} still needs both derived stage-41 outputs`;
  }
  return `stage ${stage} remains incomplete at ${counts.completed}/${counts.expected} expected builds because build ${buildId} still needs its derived stage-${stage} receipt`;
}

function buildLlamacppCampaignAutonomyPhaseReason(
  stage: 41 | 42 | 43,
  buildId: string,
  stages: LlamacppCampaignAutonomyStageCounts,
): string {
  const phase = getLlamacppCampaignAutonomyPhaseForStage(stage);
  const counts = getLlamacppCampaignAutonomyStageCounts(stages, stage);
  return `${phase} is active at ${counts.completed}/${counts.expected} expected builds complete; the next truthful local step is stage ${stage} for build ${buildId}`;
}

function getLlamacppCampaignAutonomyStageCounts(
  stages: LlamacppCampaignAutonomyStageCounts,
  stage: 41 | 42 | 43,
): { expected: number; completed: number } {
  if (stage === 41) {
    return {
      expected: stages.stage41ExpectedBuilds,
      completed: stages.stage41CompletedBuilds,
    };
  }
  if (stage === 42) {
    return {
      expected: stages.stage42ExpectedBuilds,
      completed: stages.stage42CompletedBuilds,
    };
  }
  return {
    expected: stages.stage43ExpectedBuilds,
    completed: stages.stage43CompletedBuilds,
  };
}

function buildLlamacppCampaignControlReason(
  autonomy: LlamacppCampaignAutonomyV1,
  taskContext: LlamacppCampaignTaskContextV1,
  akBinding: LlamacppCampaignAkBindingV1 | null,
): string {
  if (autonomy.lifecycle.phase === "blocked") {
    return `next truthful public step is blocked for stage ${autonomy.nextStep.stage} build ${autonomy.nextStep.buildId}: ${autonomy.nextStep.reason}; ${taskContext.reason}`;
  }

  if (autonomy.nextStep.action === "none") {
    if (akBinding?.lifecycle.action === "complete_task_candidate") {
      return `terminal stage ${autonomy.manifest.terminalStage} is materially complete locally and verified AK task ${akBinding.taskId} is now a completion candidate; this surface does not mutate AK directly`;
    }
    if (taskContext.verificationState === "not_found") {
      return `terminal stage ${autonomy.manifest.terminalStage} is materially complete locally, but supplied taskId ${taskContext.suppliedTaskId} did not resolve to a live AK task`;
    }
    if (taskContext.verificationState === "verification_unavailable") {
      return `terminal stage ${autonomy.manifest.terminalStage} is materially complete locally, but live AK verification is currently unavailable; the public view remains package-local`;
    }
    if (taskContext.verificationState === "not_requested") {
      return `terminal stage ${autonomy.manifest.terminalStage} is materially complete locally and no AK task context was requested`;
    }
    return `terminal stage ${autonomy.manifest.terminalStage} is materially complete locally and no further public advance step remains`;
  }

  if (taskContext.verificationState === "verified_live" && taskContext.verifiedTaskId !== null) {
    return `stage ${autonomy.nextStep.stage} build ${autonomy.nextStep.buildId} is the next truthful public campaign-control step for verified AK task ${taskContext.verifiedTaskId}`;
  }
  if (taskContext.verificationState === "not_found") {
    return `stage ${autonomy.nextStep.stage} build ${autonomy.nextStep.buildId} is the next truthful public campaign-control step, but supplied taskId ${taskContext.suppliedTaskId} did not resolve to a live AK task`;
  }
  if (taskContext.verificationState === "verification_unavailable") {
    return `stage ${autonomy.nextStep.stage} build ${autonomy.nextStep.buildId} is the next truthful public campaign-control step, but live AK verification is currently unavailable; the public view remains package-local`;
  }
  return `stage ${autonomy.nextStep.stage} build ${autonomy.nextStep.buildId} is the next truthful public campaign-control step; no AK task context was requested`;
}

function buildLlamacppCampaignControlNextAction(
  control: LlamacppCampaignControlSurfaceV1,
  mode: "status" | "plan" | "apply",
): string {
  if (control.autonomy.lifecycle.phase === "blocked") {
    return `The next truthful public advance is blocked for stage ${control.autonomy.nextStep.stage} build ${control.autonomy.nextStep.buildId}: ${control.autonomy.nextStep.reason}; ${control.taskContext.reason}`;
  }

  if (control.public.nextStepAction === "none") {
    if (control.public.completionCandidate && control.akBinding) {
      return `Local campaign execution is materially complete for manifest ${control.autonomy.manifest.campaignId}; a caller above the package may now evaluate whether verified AK task ${control.akBinding.taskId} should be completed explicitly.`;
    }
    if (control.taskContext.verificationState === "not_requested") {
      return `Local campaign execution is materially complete for manifest ${control.autonomy.manifest.campaignId}; no verified AK task context is currently attached.`;
    }
    if (control.taskContext.verificationState === "not_found") {
      return `Local campaign execution is materially complete for manifest ${control.autonomy.manifest.campaignId}; supplied taskId ${control.taskContext.suppliedTaskId} did not resolve to a live AK task, so no verified AK task context is currently attached.`;
    }
    if (control.taskContext.verificationState === "verification_unavailable") {
      return `Local campaign execution is materially complete for manifest ${control.autonomy.manifest.campaignId}; live AK verification is currently unavailable, so no verified AK task context is currently attached.`;
    }
    return `Local campaign execution is materially complete for manifest ${control.autonomy.manifest.campaignId}; no further public advance step remains.`;
  }

  if (mode === "status") {
    return `Use ${AUTORESEARCH_LLAMACPP_CAMPAIGN_CONTROL_TOOL_NAME} with action=advance to plan or apply the next truthful step without passing raw stage/build inputs.`;
  }

  if (mode === "plan") {
    return `Re-run ${AUTORESEARCH_LLAMACPP_CAMPAIGN_CONTROL_TOOL_NAME} with action=advance and apply=true to execute stage ${control.autonomy.nextStep.stage} for build ${control.autonomy.nextStep.buildId}.`;
  }

  return `Re-run ${AUTORESEARCH_LLAMACPP_CAMPAIGN_CONTROL_TOOL_NAME} with action=advance to inspect or apply the next truthful step after refreshing projection truth.`;
}

function createLlamacppCampaignAkProjectionKey(input: {
  taskId: number;
  manifestKey: string;
  terminalStage: 41 | 42 | 43;
  overallState: LlamacppCampaignProjectionOverallState;
  stages: LlamacppCampaignAkBindingStageSummary;
}): string {
  return [
    `task:${input.taskId}`,
    `manifest:${input.manifestKey}`,
    `terminal:${input.terminalStage}`,
    `overall:${input.overallState}`,
    `41:${input.stages.stage41PresentReceipts}/${input.stages.stage41ExpectedBuilds}`,
    `42:${input.stages.stage42PresentReceipts}/${input.stages.stage42ExpectedBuilds}`,
    `43:${input.stages.stage43PresentReceipts}/${input.stages.stage43ExpectedBuilds}`,
  ].join("|");
}

function deriveLlamacppCampaignAkProjection(input: {
  campaignId: string;
  overallState: LlamacppCampaignProjectionOverallState;
  terminalStage: 41 | 42 | 43;
  stages: LlamacppCampaignAkBindingStageSummary;
}): {
  milestone: LlamacppCampaignAkMilestone;
  checkType: string;
  completionEligible: boolean;
  lifecycleAction: LlamacppCampaignAkLifecycleAction;
  summary: string;
  reason: string;
} {
  const terminalCounts = getLlamacppCampaignStageCounts(input.stages, input.terminalStage);
  const terminalComplete = terminalCounts.present >= terminalCounts.expected;

  if (terminalComplete) {
    return {
      milestone: "terminal_stage_complete",
      checkType: "autoresearch:llamacpp-campaign:terminal-stage-complete",
      completionEligible: true,
      lifecycleAction: "complete_task_candidate",
      summary: `campaign ${input.campaignId} reached its manifest terminal stage ${input.terminalStage} with ${terminalCounts.present}/${terminalCounts.expected} expected ${pluralize("receipt", terminalCounts.expected)} present`,
      reason: `manifest-expected terminal stage ${input.terminalStage} receipts are materially present for all ${terminalCounts.expected} expected ${pluralize("build", terminalCounts.expected)}`,
    };
  }

  if (input.overallState === "stage42_complete") {
    const stage43Counts = getLlamacppCampaignStageCounts(input.stages, 43);
    return {
      milestone: "stage42_complete",
      checkType: "autoresearch:llamacpp-campaign:stage42-complete",
      completionEligible: false,
      lifecycleAction: "evidence_only",
      summary: `campaign ${input.campaignId} reached stage 42 for ${input.stages.stage42PresentReceipts}/${input.stages.stage42ExpectedBuilds} expected ${pluralize("build", input.stages.stage42ExpectedBuilds)}; stage 43 remains pending for ${Math.max(stage43Counts.expected - stage43Counts.present, 0)} ${pluralize("build", Math.max(stage43Counts.expected - stage43Counts.present, 0))}`,
      reason: `manifest-expected terminal stage ${input.terminalStage} is not fully materialized yet: ${terminalCounts.present}/${terminalCounts.expected} expected ${pluralize("receipt", terminalCounts.expected)} present`,
    };
  }

  if (input.overallState === "stage41_complete") {
    const nextStageCounts = getLlamacppCampaignStageCounts(input.stages, 42);
    return {
      milestone: "stage41_complete",
      checkType: "autoresearch:llamacpp-campaign:stage41-complete",
      completionEligible: false,
      lifecycleAction: "evidence_only",
      summary: `campaign ${input.campaignId} reached stage 41 for ${input.stages.stage41PresentReceipts}/${input.stages.stage41ExpectedBuilds} expected ${pluralize("build", input.stages.stage41ExpectedBuilds)}; stage 42 remains pending for ${Math.max(nextStageCounts.expected - nextStageCounts.present, 0)} ${pluralize("build", Math.max(nextStageCounts.expected - nextStageCounts.present, 0))}`,
      reason: `manifest-expected terminal stage ${input.terminalStage} is not fully materialized yet: ${terminalCounts.present}/${terminalCounts.expected} expected ${pluralize("receipt", terminalCounts.expected)} present`,
    };
  }

  if (input.overallState === "partially_materialized") {
    return {
      milestone: "materializing",
      checkType: "autoresearch:llamacpp-campaign:materializing",
      completionEligible: false,
      lifecycleAction: "evidence_only",
      summary: `campaign ${input.campaignId} is materializing; stage 41 ${input.stages.stage41PresentReceipts}/${input.stages.stage41ExpectedBuilds}, stage 42 ${input.stages.stage42PresentReceipts}/${input.stages.stage42ExpectedBuilds}, stage 43 ${input.stages.stage43PresentReceipts}/${input.stages.stage43ExpectedBuilds} expected receipts present`,
      reason: `manifest-expected terminal stage ${input.terminalStage} is only partially materialized: ${terminalCounts.present}/${terminalCounts.expected} expected ${pluralize("receipt", terminalCounts.expected)} present`,
    };
  }

  return {
    milestone: "planned",
    checkType: "autoresearch:llamacpp-campaign:planned",
    completionEligible: false,
    lifecycleAction: "evidence_only",
    summary: `campaign ${input.campaignId} is planned; stage 41 ${input.stages.stage41PresentReceipts}/${input.stages.stage41ExpectedBuilds}, stage 42 ${input.stages.stage42PresentReceipts}/${input.stages.stage42ExpectedBuilds}, stage 43 ${input.stages.stage43PresentReceipts}/${input.stages.stage43ExpectedBuilds} expected receipts present`,
    reason: `manifest-expected terminal stage ${input.terminalStage} has not materialized yet: ${terminalCounts.present}/${terminalCounts.expected} expected ${pluralize("receipt", terminalCounts.expected)} present`,
  };
}

function getLlamacppCampaignStageCounts(
  stages: LlamacppCampaignAkBindingStageSummary,
  stage: 41 | 42 | 43,
): { expected: number; present: number } {
  if (stage === 41) {
    return {
      expected: stages.stage41ExpectedBuilds,
      present: stages.stage41PresentReceipts,
    };
  }
  if (stage === 42) {
    return {
      expected: stages.stage42ExpectedBuilds,
      present: stages.stage42PresentReceipts,
    };
  }
  return {
    expected: stages.stage43ExpectedBuilds,
    present: stages.stage43PresentReceipts,
  };
}

function pluralize(word: string, count: number): string {
  return count === 1 ? word : `${word}s`;
}

function getStage42Entry(
  stage42Matrix: LlamacppCampaignStageMatrixEntry[],
  buildId: string,
): LlamacppCampaignStageMatrixEntry | undefined {
  return stage42Matrix.find((entry) => entry.buildId === buildId);
}

function requireStage42Entry(
  stage42Matrix: LlamacppCampaignStageMatrixEntry[],
  buildId: string,
): LlamacppCampaignStageMatrixEntry {
  const entry = getStage42Entry(stage42Matrix, buildId);
  if (!entry) {
    throw new LlamacppCampaignManifestError(
      `build ${buildId} is not listed in workflow.stage42Matrix and cannot be bound to stage 42`,
    );
  }
  return entry;
}

function translateStage42Entry(
  entry: LlamacppCampaignStageMatrixEntry,
  laneIndex: Map<string, LlamacppCampaignLaneSpec>,
  buildId: string,
): {
  configILane: LlamacppCampaignLaneSpec;
  q8Lanes: LlamacppCampaignLaneSpec[];
} {
  const lanes = entry.laneIds.map((laneId) => requireLane(laneIndex, laneId, `stage42.${buildId}`));
  const configILanes = lanes.filter((lane) => lane.runtimeFamily === "config_i");
  const q8Lanes = lanes.filter((lane) => lane.runtimeFamily === "q8_0");
  const unsupported = lanes.filter(
    (lane) => lane.runtimeFamily !== "config_i" && lane.runtimeFamily !== "q8_0",
  );

  if (configILanes.length !== 1) {
    throw new LlamacppCampaignManifestError(
      `stage 42 build ${buildId} must resolve to exactly one config_i lane for the current workstation script contract`,
    );
  }
  if (q8Lanes.length < 1) {
    throw new LlamacppCampaignManifestError(
      `stage 42 build ${buildId} must resolve to at least one q8_0 lane for the current workstation script contract`,
    );
  }
  if (unsupported.length > 0) {
    throw new LlamacppCampaignManifestError(
      `stage 42 build ${buildId} cannot be translated into the current workstation script contract because these lanes are unsupported: ${unsupported
        .map((lane) => lane.id)
        .join(", ")}`,
    );
  }

  return {
    configILane: configILanes[0],
    q8Lanes: uniqueBy(q8Lanes, (lane) => lane.kvCacheMode),
  };
}

function requireBuildBinDir(resolved: ResolvedLlamacppCampaignManifest, buildId: string): string {
  const buildBinDir = resolved.buildBinDirs[buildId];
  if (!buildBinDir) {
    throw new LlamacppCampaignManifestError(
      `build ${buildId} is missing a resolved buildBinDir in the manifest`,
    );
  }
  return buildBinDir;
}

function buildPathCheck(
  label: string,
  targetPath: string,
  required: boolean,
): LlamacppCampaignPathCheck {
  return {
    label,
    path: targetPath,
    exists: existsSync(targetPath),
    required,
  };
}

function collectMissingPathWarnings(prerequisites: LlamacppCampaignPathCheck[]): string[] {
  return prerequisites
    .filter((entry) => entry.required && !entry.exists)
    .map((entry) => `required prerequisite path is missing: ${entry.label}: ${entry.path}`);
}

function requireExistingPath(targetPath: string, label: string): void {
  if (!existsSync(targetPath)) {
    throw new LlamacppCampaignManifestError(
      `required prerequisite path is missing: ${label}: ${targetPath}`,
    );
  }
}

function ensureStageMembership(values: string[], buildId: string, message: string): void {
  if (!values.includes(buildId)) {
    throw new LlamacppCampaignManifestError(message);
  }
}

function resolvePathLike(baseDir: string, inputPath: string): string {
  return path.isAbsolute(inputPath) ? inputPath : path.resolve(baseDir, inputPath);
}

function resolveRepoRelativePath(rootDir: string, relativePath: string, label: string): string {
  if (path.isAbsolute(relativePath)) {
    throw new LlamacppCampaignManifestError(
      `${label} must be repo-relative, got absolute path: ${relativePath}`,
    );
  }
  const resolved = path.resolve(rootDir, relativePath);
  ensurePathWithinRoot(rootDir, resolved, label);
  return resolved;
}

function resolvePathWithinRoot(rootDir: string, inputPath: string, label: string): string {
  const resolved = resolvePathLike(rootDir, inputPath);
  ensurePathWithinRoot(rootDir, resolved, label);
  return resolved;
}

function ensurePathWithinRoot(rootDir: string, targetPath: string, label: string): void {
  const resolvedRoot = realpathForContainment(rootDir, label);
  const resolvedTarget = realpathForContainment(targetPath, label);
  const relative = path.relative(resolvedRoot, resolvedTarget);
  if (relative === "" || (!relative.startsWith("..") && !path.isAbsolute(relative))) {
    return;
  }
  throw new LlamacppCampaignManifestError(
    `${label} must stay within ${rootDir}, got ${targetPath}`,
  );
}

function realpathForContainment(targetPath: string, label: string): string {
  let current = path.resolve(targetPath);
  const missingSegments: string[] = [];
  while (!existsSync(current)) {
    const parent = path.dirname(current);
    if (parent === current) {
      throw new LlamacppCampaignManifestError(
        `${label} cannot resolve containment because no existing parent was found for ${targetPath}`,
      );
    }
    missingSegments.unshift(path.basename(current));
    current = parent;
  }
  const resolvedExisting = path.resolve(readRealpath(current));
  return missingSegments.length === 0
    ? resolvedExisting
    : path.join(resolvedExisting, ...missingSegments);
}

function readRealpath(targetPath: string): string {
  try {
    return path.resolve(realpathSync(targetPath));
  } catch (error) {
    throw new LlamacppCampaignManifestError(
      `unable to resolve real path for ${targetPath}: ${error instanceof Error ? error.message : String(error)}`,
    );
  }
}

function parseJsonObject(raw: string, filePath: string): Record<string, unknown> {
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch (error) {
    throw new LlamacppCampaignManifestError(
      `manifest is not valid JSON: ${filePath}: ${String(error)}`,
    );
  }
  if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
    throw new LlamacppCampaignManifestError(`manifest must be a JSON object: ${filePath}`);
  }
  return parsed as Record<string, unknown>;
}

function parseLlamacppCampaignProjection(
  raw: string,
  filePath: string,
): LlamacppCampaignProjectionV1 {
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch (error) {
    throw new LlamacppCampaignManifestError(
      `projection is not valid JSON: ${filePath}: ${String(error)}`,
    );
  }

  const payload = readObject(parsed, `${filePath}`);
  const manifest = readObject(payload.manifest, `${filePath}:manifest`);
  const status = readObject(payload.status, `${filePath}:status`);
  const builds = readObjectArray(payload.builds, `${filePath}:builds`).map((build, index) => {
    const stages = readObject(build.stages, `${filePath}:builds[${index}].stages`);
    const stage41 = readObject(stages["41"], `${filePath}:builds[${index}].stages[41]`);
    const stage42 = readObject(stages["42"], `${filePath}:builds[${index}].stages[42]`);
    const stage43 = readObject(stages["43"], `${filePath}:builds[${index}].stages[43]`);
    const highestCompletedStage = readInteger(
      build.highestCompletedStage,
      `${filePath}:builds[${index}].highestCompletedStage`,
    );
    if (![0, 41, 42, 43].includes(highestCompletedStage)) {
      throw new LlamacppCampaignManifestError(
        `${filePath}:builds[${index}].highestCompletedStage must be 0, 41, 42, or 43`,
      );
    }

    return {
      buildId: readString(build.buildId, `${filePath}:builds[${index}].buildId`),
      title: readString(build.title, `${filePath}:builds[${index}].title`),
      branch: readString(build.branch, `${filePath}:builds[${index}].branch`),
      buildBinDir: readString(build.buildBinDir, `${filePath}:builds[${index}].buildBinDir`),
      buildBinDirExists: readBoolean(
        build.buildBinDirExists,
        `${filePath}:builds[${index}].buildBinDirExists`,
      ),
      highestCompletedStage: highestCompletedStage as 0 | 41 | 42 | 43,
      notes: readStringArray(build.notes, `${filePath}:builds[${index}].notes`),
      stages: {
        "41": {
          expected: readBoolean(
            stage41.expected,
            `${filePath}:builds[${index}].stages[41].expected`,
          ),
          receiptPath: readString(
            stage41.receiptPath,
            `${filePath}:builds[${index}].stages[41].receiptPath`,
          ),
          corpusPath: readString(
            stage41.corpusPath,
            `${filePath}:builds[${index}].stages[41].corpusPath`,
          ),
          receiptExists: readBoolean(
            stage41.receiptExists,
            `${filePath}:builds[${index}].stages[41].receiptExists`,
          ),
          corpusExists: readBoolean(
            stage41.corpusExists,
            `${filePath}:builds[${index}].stages[41].corpusExists`,
          ),
        },
        "42": {
          expected: readBoolean(
            stage42.expected,
            `${filePath}:builds[${index}].stages[42].expected`,
          ),
          receiptPath: readString(
            stage42.receiptPath,
            `${filePath}:builds[${index}].stages[42].receiptPath`,
          ),
          receiptExists: readBoolean(
            stage42.receiptExists,
            `${filePath}:builds[${index}].stages[42].receiptExists`,
          ),
        },
        "43": {
          expected: readBoolean(
            stage43.expected,
            `${filePath}:builds[${index}].stages[43].expected`,
          ),
          receiptPath: readString(
            stage43.receiptPath,
            `${filePath}:builds[${index}].stages[43].receiptPath`,
          ),
          receiptExists: readBoolean(
            stage43.receiptExists,
            `${filePath}:builds[${index}].stages[43].receiptExists`,
          ),
        },
      },
    } satisfies LlamacppCampaignBuildProjection;
  });

  return {
    type: (() => {
      const type = readString(payload.type, `${filePath}:type`);
      if (type !== AUTORESEARCH_LLAMACPP_CAMPAIGN_PROJECTION_KIND) {
        throw new LlamacppCampaignManifestError(
          `${filePath}:type must be ${AUTORESEARCH_LLAMACPP_CAMPAIGN_PROJECTION_KIND}, got ${type}`,
        );
      }
      return AUTORESEARCH_LLAMACPP_CAMPAIGN_PROJECTION_KIND;
    })(),
    version: (() => {
      const version = readInteger(payload.version, `${filePath}:version`);
      if (version !== AUTORESEARCH_LLAMACPP_CAMPAIGN_PROJECTION_VERSION) {
        throw new LlamacppCampaignManifestError(
          `${filePath}:version must be ${AUTORESEARCH_LLAMACPP_CAMPAIGN_PROJECTION_VERSION}, got ${version}`,
        );
      }
      return AUTORESEARCH_LLAMACPP_CAMPAIGN_PROJECTION_VERSION;
    })(),
    cwd: readString(payload.cwd, `${filePath}:cwd`),
    updatedAt: readInteger(payload.updatedAt, `${filePath}:updatedAt`),
    manifest: {
      path: readString(manifest.path, `${filePath}:manifest.path`),
      campaignId: readString(manifest.campaignId, `${filePath}:manifest.campaignId`),
      manifestKey: readString(manifest.manifestKey, `${filePath}:manifest.manifestKey`),
      receiptRootPath: readString(manifest.receiptRootPath, `${filePath}:manifest.receiptRootPath`),
      sourceRepoPath: readString(manifest.sourceRepoPath, `${filePath}:manifest.sourceRepoPath`),
      workstationRepoPath: readString(
        manifest.workstationRepoPath,
        `${filePath}:manifest.workstationRepoPath`,
      ),
      workflowKind: (() => {
        const workflowKind = readString(manifest.workflowKind, `${filePath}:manifest.workflowKind`);
        if (workflowKind !== AUTORESEARCH_LLAMACPP_CAMPAIGN_WORKFLOW_KIND) {
          throw new LlamacppCampaignManifestError(
            `${filePath}:manifest.workflowKind must be ${AUTORESEARCH_LLAMACPP_CAMPAIGN_WORKFLOW_KIND}, got ${workflowKind}`,
          );
        }
        return AUTORESEARCH_LLAMACPP_CAMPAIGN_WORKFLOW_KIND;
      })(),
    },
    status: {
      projectionKind: (() => {
        const projectionKind = readString(
          status.projectionKind,
          `${filePath}:status.projectionKind`,
        );
        if (projectionKind !== AUTORESEARCH_LLAMACPP_CAMPAIGN_PROJECTION_SOURCE) {
          throw new LlamacppCampaignManifestError(
            `${filePath}:status.projectionKind must be ${AUTORESEARCH_LLAMACPP_CAMPAIGN_PROJECTION_SOURCE}, got ${projectionKind}`,
          );
        }
        return AUTORESEARCH_LLAMACPP_CAMPAIGN_PROJECTION_SOURCE;
      })(),
      overallState: readProjectionOverallState(
        status.overallState,
        `${filePath}:status.overallState`,
      ),
      stale: readBoolean(status.stale, `${filePath}:status.stale`),
      staleReason: readNullableString(status.staleReason, `${filePath}:status.staleReason`),
    },
    builds,
  };
}

function validateManifest(
  payload: Record<string, unknown>,
  filePath: string,
): LlamacppCampaignManifest {
  const kind = readString(payload.kind, `${filePath}:kind`);
  if (kind !== AUTORESEARCH_LLAMACPP_CAMPAIGN_KIND) {
    throw new LlamacppCampaignManifestError(
      `manifest kind must be ${AUTORESEARCH_LLAMACPP_CAMPAIGN_KIND}, got ${kind}`,
    );
  }
  const version = readInteger(payload.version, `${filePath}:version`);
  if (version !== AUTORESEARCH_LLAMACPP_CAMPAIGN_VERSION) {
    throw new LlamacppCampaignManifestError(
      `manifest version must be ${AUTORESEARCH_LLAMACPP_CAMPAIGN_VERSION}, got ${version}`,
    );
  }

  const builds = readObjectArray(payload.builds, `${filePath}:builds`).map((rawBuild, index) => {
    const cherryPickCommits = readStringArray(
      rawBuild.cherryPickCommits,
      `${filePath}:builds[${index}].cherryPickCommits`,
    );
    for (const commit of cherryPickCommits) {
      if (!GIT_COMMIT_RE.test(commit)) {
        throw new LlamacppCampaignManifestError(
          `${filePath}:builds[${index}].cherryPickCommits contains an invalid git commit-ish: ${commit}`,
        );
      }
    }
    const lineageSummary = readString(
      rawBuild.lineageSummary,
      `${filePath}:builds[${index}].lineageSummary`,
    );
    if (cherryPickCommits.length > 0 && lineageSummary.length === 0) {
      throw new LlamacppCampaignManifestError(
        `${filePath}:builds[${index}] must explain cherry-pick lineage when cherryPickCommits are present`,
      );
    }
    return {
      id: readString(rawBuild.id, `${filePath}:builds[${index}].id`),
      title: readString(rawBuild.title, `${filePath}:builds[${index}].title`),
      branch: readString(rawBuild.branch, `${filePath}:builds[${index}].branch`),
      buildBinDir: readString(rawBuild.buildBinDir, `${filePath}:builds[${index}].buildBinDir`),
      cherryPickCommits,
      lineageSummary,
      notes: readStringArray(rawBuild.notes, `${filePath}:builds[${index}].notes`),
    } satisfies LlamacppCampaignBuildSpec;
  });
  ensureUnique(
    builds.map((build) => build.id),
    `${filePath}:builds ids`,
  );

  const lanes = readObjectArray(payload.lanes, `${filePath}:lanes`).map(
    (rawLane, index) =>
      ({
        id: readString(rawLane.id, `${filePath}:lanes[${index}].id`),
        title: readString(rawLane.title, `${filePath}:lanes[${index}].title`),
        runtimeFamily: readString(
          rawLane.runtimeFamily,
          `${filePath}:lanes[${index}].runtimeFamily`,
        ),
        kvCacheMode: readString(rawLane.kvCacheMode, `${filePath}:lanes[${index}].kvCacheMode`),
        notes: readStringArray(rawLane.notes, `${filePath}:lanes[${index}].notes`),
      }) satisfies LlamacppCampaignLaneSpec,
  );
  ensureUnique(
    lanes.map((lane) => lane.id),
    `${filePath}:lanes ids`,
  );

  const buildIds = new Set(builds.map((build) => build.id));
  const laneIds = new Set(lanes.map((lane) => lane.id));

  const fork = readObject(payload.fork, `${filePath}:fork`);
  const workflow = readObject(payload.workflow, `${filePath}:workflow`);
  const executionBinding = readObject(
    workflow.executionBinding,
    `${filePath}:workflow.executionBinding`,
  );
  const stage42Matrix = readObjectArray(
    workflow.stage42Matrix,
    `${filePath}:workflow.stage42Matrix`,
  ).map(
    (entry, index) =>
      ({
        buildId: readString(entry.buildId, `${filePath}:workflow.stage42Matrix[${index}].buildId`),
        laneIds: readStringArray(
          entry.laneIds,
          `${filePath}:workflow.stage42Matrix[${index}].laneIds`,
        ),
      }) satisfies LlamacppCampaignStageMatrixEntry,
  );

  const stage41BuildIds = readStringArray(
    workflow.stage41BuildIds,
    `${filePath}:workflow.stage41BuildIds`,
  );
  const stage43BuildIds = readStringArray(
    workflow.stage43BuildIds,
    `${filePath}:workflow.stage43BuildIds`,
  );

  ensureUnique(stage41BuildIds, `${filePath}:workflow.stage41BuildIds`);
  ensureUnique(stage43BuildIds, `${filePath}:workflow.stage43BuildIds`);
  ensureUnique(
    stage42Matrix.map((entry) => entry.buildId),
    `${filePath}:workflow.stage42Matrix build ids`,
  );
  ensureReferences(stage41BuildIds, buildIds, `${filePath}:workflow.stage41BuildIds`);
  ensureReferences(stage43BuildIds, buildIds, `${filePath}:workflow.stage43BuildIds`);
  for (const [index, entry] of stage42Matrix.entries()) {
    ensureUnique(entry.laneIds, `${filePath}:workflow.stage42Matrix[${index}].laneIds`);
    ensureReferences(
      [entry.buildId],
      buildIds,
      `${filePath}:workflow.stage42Matrix[${index}].buildId`,
    );
    ensureReferences(
      entry.laneIds,
      laneIds,
      `${filePath}:workflow.stage42Matrix[${index}].laneIds`,
    );
  }

  const evidence = readObject(payload.evidence, `${filePath}:evidence`);

  return {
    kind: AUTORESEARCH_LLAMACPP_CAMPAIGN_KIND,
    version: AUTORESEARCH_LLAMACPP_CAMPAIGN_VERSION,
    campaignId: readString(payload.campaignId, `${filePath}:campaignId`),
    objective: readString(payload.objective, `${filePath}:objective`),
    sourceRepoPath: readString(payload.sourceRepoPath, `${filePath}:sourceRepoPath`),
    workstationRepoPath: readString(payload.workstationRepoPath, `${filePath}:workstationRepoPath`),
    fork: {
      targetRepoPath: readString(fork.targetRepoPath, `${filePath}:fork.targetRepoPath`),
      baseRef: readString(fork.baseRef, `${filePath}:fork.baseRef`),
      workingBranch: readString(fork.workingBranch, `${filePath}:fork.workingBranch`),
    },
    workflow: {
      kind: (() => {
        const workflowKind = readString(workflow.kind, `${filePath}:workflow.kind`);
        if (workflowKind !== AUTORESEARCH_LLAMACPP_CAMPAIGN_WORKFLOW_KIND) {
          throw new LlamacppCampaignManifestError(
            `${filePath}:workflow.kind must be ${AUTORESEARCH_LLAMACPP_CAMPAIGN_WORKFLOW_KIND}, got ${workflowKind}`,
          );
        }
        return AUTORESEARCH_LLAMACPP_CAMPAIGN_WORKFLOW_KIND;
      })(),
      stage41Script: readString(workflow.stage41Script, `${filePath}:workflow.stage41Script`),
      stage42Script: readString(workflow.stage42Script, `${filePath}:workflow.stage42Script`),
      stage43Script: readString(workflow.stage43Script, `${filePath}:workflow.stage43Script`),
      executionBinding: {
        receiptRootPath: readString(
          executionBinding.receiptRootPath,
          `${filePath}:workflow.executionBinding.receiptRootPath`,
        ),
      },
      stage41BuildIds,
      stage42Matrix,
      stage43BuildIds,
    },
    builds,
    lanes,
    evidence: {
      expectedReceiptPaths: readStringArray(
        evidence.expectedReceiptPaths,
        `${filePath}:evidence.expectedReceiptPaths`,
      ),
      requiredMetrics: readStringArray(
        evidence.requiredMetrics,
        `${filePath}:evidence.requiredMetrics`,
      ),
    },
  };
}

function requireBuild(
  buildIndex: Map<string, LlamacppCampaignBuildSpec>,
  buildId: string,
  label: string,
): LlamacppCampaignBuildSpec {
  const build = buildIndex.get(buildId);
  if (!build) {
    throw new LlamacppCampaignManifestError(`${label} references unknown build id: ${buildId}`);
  }
  return build;
}

function requireLane(
  laneIndex: Map<string, LlamacppCampaignLaneSpec>,
  laneId: string,
  label: string,
): LlamacppCampaignLaneSpec {
  const lane = laneIndex.get(laneId);
  if (!lane) {
    throw new LlamacppCampaignManifestError(`${label} references unknown lane id: ${laneId}`);
  }
  return lane;
}

function readObject(value: unknown, label: string): Record<string, unknown> {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    throw new LlamacppCampaignManifestError(`${label} must be an object`);
  }
  return value as Record<string, unknown>;
}

function readObjectArray(value: unknown, label: string): Array<Record<string, unknown>> {
  if (!Array.isArray(value)) {
    throw new LlamacppCampaignManifestError(`${label} must be an array of objects`);
  }
  return value.map((entry, index) => readObject(entry, `${label}[${index}]`));
}

function readString(value: unknown, label: string): string {
  if (typeof value !== "string" || value.trim().length === 0) {
    throw new LlamacppCampaignManifestError(`${label} must be a non-empty string`);
  }
  return value.trim();
}

function readStringArray(value: unknown, label: string): string[] {
  if (!Array.isArray(value)) {
    throw new LlamacppCampaignManifestError(`${label} must be an array of strings`);
  }
  return value.map((entry, index) => readString(entry, `${label}[${index}]`));
}

function readInteger(value: unknown, label: string): number {
  if (typeof value !== "number" || !Number.isInteger(value)) {
    throw new LlamacppCampaignManifestError(`${label} must be an integer`);
  }
  return value;
}

function readBoolean(value: unknown, label: string): boolean {
  if (typeof value !== "boolean") {
    throw new LlamacppCampaignManifestError(`${label} must be a boolean`);
  }
  return value;
}

function readNullableString(value: unknown, label: string): string | null {
  if (value === null) {
    return null;
  }
  return readString(value, label);
}

function readProjectionOverallState(
  value: unknown,
  label: string,
): LlamacppCampaignProjectionOverallState {
  const normalized = readString(value, label);
  if (
    normalized !== "planned_only" &&
    normalized !== "partially_materialized" &&
    normalized !== "stage41_complete" &&
    normalized !== "stage42_complete" &&
    normalized !== "stage43_complete"
  ) {
    throw new LlamacppCampaignManifestError(
      `${label} must be one of planned_only, partially_materialized, stage41_complete, stage42_complete, or stage43_complete`,
    );
  }
  return normalized;
}

function ensureUnique(values: string[], label: string): void {
  const seen = new Set<string>();
  for (const value of values) {
    if (seen.has(value)) {
      throw new LlamacppCampaignManifestError(`${label} contain duplicates: ${value}`);
    }
    seen.add(value);
  }
}

function ensureReferences(values: string[], allowed: Set<string>, label: string): void {
  for (const value of values) {
    if (!allowed.has(value)) {
      throw new LlamacppCampaignManifestError(`${label} references an unknown id: ${value}`);
    }
  }
}

function llamacppCampaignProjectionDiffers(
  left: LlamacppCampaignProjectionV1,
  right: LlamacppCampaignProjectionV1,
): boolean {
  return (
    JSON.stringify(normalizeLlamacppCampaignProjection(left)) !==
    JSON.stringify(normalizeLlamacppCampaignProjection(right))
  );
}

function normalizeLlamacppCampaignProjection(
  projection: LlamacppCampaignProjectionV1,
): Omit<LlamacppCampaignProjectionV1, "updatedAt"> & { updatedAt: 0 } {
  return {
    ...projection,
    updatedAt: 0,
  };
}

function plannedCommandSummary(command: string[], cwd: string | null): ProcessCommandSummary {
  return {
    command,
    cwd,
    exitCode: 0,
    stdout: "",
    stderr: "",
  };
}

function runCommand(command: string[], cwd: string | null): ProcessCommandSummary {
  const executable = command[0];
  if (!executable) {
    throw new LlamacppCampaignManifestError("command array must not be empty");
  }
  const completed = spawnSync(executable, command.slice(1), {
    cwd: cwd ?? undefined,
    encoding: "utf8",
    timeout: LLAMACPP_STAGE_COMMAND_TIMEOUT_MS,
    maxBuffer: LLAMACPP_STAGE_COMMAND_MAX_BUFFER_BYTES,
  });
  const summary = {
    command,
    cwd,
    exitCode: completed.status ?? (completed.error ? 1 : 0),
    stdout: (completed.stdout ?? "").trim(),
    stderr: (completed.stderr ?? (completed.error ? String(completed.error) : "")).trim(),
  } satisfies ProcessCommandSummary;
  if (summary.exitCode !== 0) {
    throw new LlamacppCampaignManifestError(
      `command failed: ${formatCommand(command, cwd)}${summary.stderr ? `\n${summary.stderr}` : ""}`,
    );
  }
  return summary;
}

function gitStatusClean(repoPath: string, commands: ProcessCommandSummary[]): boolean {
  const summary = runCommand(["git", "status", "--porcelain"], repoPath);
  commands.push(summary);
  return summary.stdout.length === 0;
}

function gitBranchExists(
  repoPath: string,
  branch: string,
  commands: ProcessCommandSummary[],
): boolean {
  const completed = spawnSync("git", ["show-ref", "--verify", `refs/heads/${branch}`], {
    cwd: repoPath,
    encoding: "utf8",
  });
  const summary = {
    command: ["git", "show-ref", "--verify", `refs/heads/${branch}`],
    cwd: repoPath,
    exitCode: completed.status ?? (completed.error ? 1 : 0),
    stdout: (completed.stdout ?? "").trim(),
    stderr: (completed.stderr ?? (completed.error ? String(completed.error) : "")).trim(),
  } satisfies ProcessCommandSummary;
  commands.push(summary);
  return summary.exitCode === 0;
}

function ensureGitRepo(repoPath: string): void {
  if (!existsSync(path.join(repoPath, ".git"))) {
    throw new LlamacppCampaignManifestError(`target path is not a git repo: ${repoPath}`);
  }
}

function uniqueStrings(values: string[]): string[] {
  return [...new Set(values)];
}

function uniqueBy<T>(values: T[], getKey: (value: T) => string): T[] {
  const seen = new Set<string>();
  const result: T[] = [];
  for (const value of values) {
    const key = getKey(value);
    if (seen.has(key)) {
      continue;
    }
    seen.add(key);
    result.push(value);
  }
  return result;
}

function formatCommand(command: string[], cwd: string | null): string {
  const joined = command.map(shellEscape).join(" ");
  return cwd ? `cd ${shellEscape(cwd)} && ${joined}` : joined;
}

function shellEscape(value: string): string {
  if (/^[a-zA-Z0-9_./:@=-]+$/.test(value)) {
    return value;
  }
  return `'${value.replaceAll("'", `'\\''`)}'`;
}

import { spawnSync } from "node:child_process";
import { createHash } from "node:crypto";
import { existsSync, mkdirSync, readFileSync } from "node:fs";
import path from "node:path";

export const AUTORESEARCH_LLAMACPP_CAMPAIGN_TOOL_NAME = "autoresearch_llamacpp_campaign";
export const AUTORESEARCH_LLAMACPP_CAMPAIGN_KIND = "pi-autoresearch-llamacpp-campaign" as const;
export const AUTORESEARCH_LLAMACPP_CAMPAIGN_VERSION = 1 as const;
export const AUTORESEARCH_LLAMACPP_CAMPAIGN_WORKFLOW_KIND = "phasee-41-43" as const;
export const AUTORESEARCH_LLAMACPP_CAMPAIGN_PROJECTION_FILE = "autoresearch.llamacpp-campaign.json";
export const AUTORESEARCH_LLAMACPP_CAMPAIGN_PROJECTION_KIND =
  "llamacpp_campaign_projection" as const;
export const AUTORESEARCH_LLAMACPP_CAMPAIGN_PROJECTION_VERSION = 1 as const;
export const AUTORESEARCH_LLAMACPP_CAMPAIGN_PROJECTION_SOURCE =
  "derived_from_manifest_and_receipts" as const;

const GIT_COMMIT_RE = /^[0-9a-f]{7,40}$/i;
const PYTHON_EXECUTABLE = "python3";

export type LlamacppCampaignStage = "41" | "42" | "43";
export type LlamacppCampaignAction = "plan_matrix" | "prepare_fork" | "execute_stage";

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

export function formatLlamacppCampaignResult(
  result:
    | PlanLlamacppCampaignMatrixResult
    | PrepareLlamacppCampaignForkResult
    | ExecuteLlamacppCampaignStageResult,
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
  const relative = path.relative(rootDir, targetPath);
  if (relative === "" || (!relative.startsWith("..") && !path.isAbsolute(relative))) {
    return;
  }
  throw new LlamacppCampaignManifestError(
    `${label} must stay within ${rootDir}, got ${targetPath}`,
  );
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

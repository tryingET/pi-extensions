import { spawnSync } from "node:child_process";
import { createHash } from "node:crypto";
import { existsSync, mkdirSync, readFileSync, realpathSync, writeFileSync } from "node:fs";
import path from "node:path";

export const AUTORESEARCH_SELF_HOSTING_TOOL_NAME = "autoresearch_self_hosting_run";
export const AUTORESEARCH_SELF_HOSTING_CONTRACT_FILE = "autoresearch.self-hosting.json";
export const AUTORESEARCH_SELF_HOSTING_EVALUATOR_LOCK_FILE =
  "autoresearch.self-hosting.evaluator.lock.json";
export const AUTORESEARCH_SELF_HOSTING_PROMOTION_RECORD_FILE =
  "autoresearch.self-hosting.promotion.json";
export const AUTORESEARCH_SELF_HOSTING_CONTRACT_KIND = "self_hosting_contract" as const;
export const AUTORESEARCH_SELF_HOSTING_EVALUATOR_LOCK_KIND = "self_hosting_evaluator_lock" as const;
export const AUTORESEARCH_SELF_HOSTING_PROMOTION_RECORD_KIND =
  "self_hosting_promotion_record" as const;
export const AUTORESEARCH_SELF_HOSTING_VERSION = 1 as const;
export const AUTORESEARCH_SELF_HOSTING_EXECUTION_MODEL =
  "controller_subprocess_against_candidate" as const;

const SHA256_RE = /^[0-9a-f]{64}$/iu;
const WINDOWS_ABSOLUTE_PATH_RE = /^[A-Za-z]:[\\/]/u;

const CONTROLLER_MODES = ["stable_installed", "pinned_commit"] as const;
const CANDIDATE_FAILURE_DISPOSITIONS = ["preserve_for_review", "cleanup_after_receipt"] as const;
const EVALUATOR_SUITE_CLASSES = ["dev", "holdout", "transfer"] as const;
const EVALUATOR_COVERAGE_KINDS = [
  "self_hosting_internal",
  "package_non_self_hosting",
  "operator_consumer",
] as const;
const MINIMUM_DEFAULT_PROMOTION_COVERAGE_KINDS = [
  "package_non_self_hosting",
  "operator_consumer",
] as const;
const EVALUATOR_ENTRYPOINT_KINDS = ["snapshot_script", "snapshot_node_module"] as const;
const SUBJECT_CWD_MODES = ["snapshot", "candidate"] as const;
const METRIC_DIRECTIONS = ["lower", "higher"] as const;
const PROMOTION_APPROVALS = ["operator_review", "orchestrator_supervision"] as const;
const PROMOTION_RECORD_STATUSES = [
  "planned",
  "approved",
  "rotated",
  "rolled_back",
  "superseded",
] as const;

export const AUTORESEARCH_SELF_HOSTING_APPLICABILITY_OUTCOMES = [
  "reject",
  "variant_candidate",
  "default_promotion_candidate",
] as const;

export type AutoresearchSelfHostingApplicabilityOutcome =
  (typeof AUTORESEARCH_SELF_HOSTING_APPLICABILITY_OUTCOMES)[number];
export type AutoresearchSelfHostingControllerMode = (typeof CONTROLLER_MODES)[number];
export type AutoresearchSelfHostingExecutionModel =
  typeof AUTORESEARCH_SELF_HOSTING_EXECUTION_MODEL;
export type AutoresearchSelfHostingCandidateFailureDisposition =
  (typeof CANDIDATE_FAILURE_DISPOSITIONS)[number];
export type AutoresearchSelfHostingEvaluatorSuiteClass = (typeof EVALUATOR_SUITE_CLASSES)[number];
export type AutoresearchSelfHostingEvaluatorCoverageKind =
  (typeof EVALUATOR_COVERAGE_KINDS)[number];
export type AutoresearchSelfHostingMinimumDefaultPromotionCoverageKind =
  (typeof MINIMUM_DEFAULT_PROMOTION_COVERAGE_KINDS)[number];
export type AutoresearchSelfHostingEvaluatorEntrypointKind =
  (typeof EVALUATOR_ENTRYPOINT_KINDS)[number];
export type AutoresearchSelfHostingSubjectCwdMode = (typeof SUBJECT_CWD_MODES)[number];
export type AutoresearchSelfHostingMetricDirection = (typeof METRIC_DIRECTIONS)[number];
export type AutoresearchSelfHostingPromotionApproval = (typeof PROMOTION_APPROVALS)[number];
export type AutoresearchSelfHostingPromotionRecordStatus =
  (typeof PROMOTION_RECORD_STATUSES)[number];

export interface AutoresearchSelfHostingContractV1 {
  type: typeof AUTORESEARCH_SELF_HOSTING_CONTRACT_KIND;
  version: typeof AUTORESEARCH_SELF_HOSTING_VERSION;
  campaignId: string;
  controller: {
    mode: AutoresearchSelfHostingControllerMode;
    ref: string;
    controllerCwd: string;
    executionModel: AutoresearchSelfHostingExecutionModel;
  };
  candidate: {
    worktreePath: string;
    baseRef: string;
    branchName: string;
    allowedPaths: string[];
    offLimits: string[];
    onFailureDisposition: AutoresearchSelfHostingCandidateFailureDisposition;
  };
  evaluator: {
    lockPath: string;
    manifestPath: string;
    manifestHash: string;
    snapshotRootPath: string;
    criticalSuites: string[];
    devSuites: string[];
    holdoutSuites: string[];
    transferSuites: string[];
    candidateMayEditEvaluator: false;
  };
  applicability: {
    primaryMetric: {
      name: string;
      direction: AutoresearchSelfHostingMetricDirection;
      minImprovementForDefaultPromotionPercent: number;
    };
    variantTargetProfile: {
      id: string;
      description: string;
    } | null;
    maxCriticalSuiteFailures: 0;
    maxHoldoutCriticalFailures: 0;
    maxTransferCriticalFailures: 0;
    maxNonCriticalTransferRegressionPercent: number;
    minimumDefaultPromotionTransferScope: {
      minimumSuites: number;
      requiredCoverageKinds: AutoresearchSelfHostingMinimumDefaultPromotionCoverageKind[];
    };
  };
  promotion: {
    packageMaySelfPromote: false;
    requiredApprovals: AutoresearchSelfHostingPromotionApproval[];
    promotionRecordPath: string;
    rollbackControllerRef: string;
  };
}

export interface AutoresearchSelfHostingEvaluatorLockFileHash {
  path: string;
  sha256: string;
}

export interface AutoresearchSelfHostingEvaluatorSuiteV1 {
  id: string;
  class: AutoresearchSelfHostingEvaluatorSuiteClass;
  critical: boolean;
  coverageKind: AutoresearchSelfHostingEvaluatorCoverageKind;
  entrypoint: {
    kind: AutoresearchSelfHostingEvaluatorEntrypointKind;
    path: string;
    sha256: string;
  };
  subjectCwdMode: AutoresearchSelfHostingSubjectCwdMode;
  argv: string[];
}

export interface AutoresearchSelfHostingEvaluatorLockV1 {
  type: typeof AUTORESEARCH_SELF_HOSTING_EVALUATOR_LOCK_KIND;
  version: typeof AUTORESEARCH_SELF_HOSTING_VERSION;
  campaignId: string;
  snapshotRootPath: string;
  manifestPath: string;
  manifestHash: string;
  executionModel: AutoresearchSelfHostingExecutionModel;
  evaluatorFiles: AutoresearchSelfHostingEvaluatorLockFileHash[];
  suites: AutoresearchSelfHostingEvaluatorSuiteV1[];
}

export interface AutoresearchSelfHostingPromotionRecordV1 {
  type: typeof AUTORESEARCH_SELF_HOSTING_PROMOTION_RECORD_KIND;
  version: typeof AUTORESEARCH_SELF_HOSTING_VERSION;
  campaignId: string;
  approvedBy: AutoresearchSelfHostingPromotionApproval[];
  approvedAt: number | null;
  previousControllerRef: string;
  promotedCandidateRef: string | null;
  evaluatorManifestHash: string;
  evidenceRefs: string[];
  status: AutoresearchSelfHostingPromotionRecordStatus;
  rollbackControllerRef: string;
  rollbackReason: string | null;
  rolledBackAt: number | null;
}

export interface LoadedAutoresearchSelfHostingArtifacts {
  cwd: string;
  contractPath: string;
  lockPath: string;
  contract: AutoresearchSelfHostingContractV1;
  evaluatorLock: AutoresearchSelfHostingEvaluatorLockV1;
}

export class AutoresearchSelfHostingValidationError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "AutoresearchSelfHostingValidationError";
  }
}

export function resolveAutoresearchSelfHostingContractPath(cwd: string): string {
  return path.resolve(cwd, AUTORESEARCH_SELF_HOSTING_CONTRACT_FILE);
}

export function resolveAutoresearchSelfHostingEvaluatorLockPath(
  cwd: string,
  lockPath = AUTORESEARCH_SELF_HOSTING_EVALUATOR_LOCK_FILE,
): string {
  return resolveArtifactPath(cwd, lockPath);
}

export function resolveAutoresearchSelfHostingPromotionRecordPath(
  cwd: string,
  promotionRecordPath = AUTORESEARCH_SELF_HOSTING_PROMOTION_RECORD_FILE,
): string {
  return resolveArtifactPath(cwd, promotionRecordPath);
}

export function loadAutoresearchSelfHostingContract(
  cwd: string,
  contractPath = AUTORESEARCH_SELF_HOSTING_CONTRACT_FILE,
): AutoresearchSelfHostingContractV1 {
  const resolvedPath = resolveArtifactPath(cwd, contractPath);
  const payload = loadJsonObject(resolvedPath);
  return validateAutoresearchSelfHostingContract(payload, resolvedPath);
}

export function loadAutoresearchSelfHostingEvaluatorLock(
  cwd: string,
  lockPath = AUTORESEARCH_SELF_HOSTING_EVALUATOR_LOCK_FILE,
): AutoresearchSelfHostingEvaluatorLockV1 {
  const resolvedPath = resolveArtifactPath(cwd, lockPath);
  const payload = loadJsonObject(resolvedPath);
  return validateAutoresearchSelfHostingEvaluatorLock(payload, resolvedPath);
}

export function loadAutoresearchSelfHostingPromotionRecord(
  cwd: string,
  promotionRecordPath?: string,
): AutoresearchSelfHostingPromotionRecordV1 {
  const contract = loadAutoresearchSelfHostingContract(cwd);
  const resolvedPath = resolveAutoresearchSelfHostingPromotionRecordPath(
    path.resolve(cwd),
    promotionRecordPath ?? contract.promotion.promotionRecordPath,
  );
  const payload = loadJsonObject(resolvedPath);
  return validateAutoresearchSelfHostingPromotionRecord(payload, resolvedPath);
}

export function loadAutoresearchSelfHostingArtifacts(
  cwd: string,
): LoadedAutoresearchSelfHostingArtifacts {
  const contractPath = resolveAutoresearchSelfHostingContractPath(cwd);
  const contract = loadAutoresearchSelfHostingContract(cwd);
  const resolvedControllerCwd = path.resolve(contract.controller.controllerCwd);
  const resolvedLoaderCwd = path.resolve(cwd);
  if (resolvedControllerCwd !== resolvedLoaderCwd) {
    throw new AutoresearchSelfHostingValidationError(
      `${contractPath}:controller.controllerCwd must match loader cwd ${resolvedLoaderCwd}, got ${resolvedControllerCwd}`,
    );
  }

  const lockPath = resolveAutoresearchSelfHostingEvaluatorLockPath(
    cwd,
    contract.evaluator.lockPath,
  );
  const evaluatorLock = loadAutoresearchSelfHostingEvaluatorLock(cwd, contract.evaluator.lockPath);
  validateAutoresearchSelfHostingArtifactsPair(contract, evaluatorLock);

  return {
    cwd: resolvedLoaderCwd,
    contractPath,
    lockPath,
    contract,
    evaluatorLock,
  };
}

export function validateAutoresearchSelfHostingContract(
  payload: Record<string, unknown>,
  filePath: string,
): AutoresearchSelfHostingContractV1 {
  const kind = readLiteral(
    payload.type,
    `${filePath}:type`,
    AUTORESEARCH_SELF_HOSTING_CONTRACT_KIND,
  );
  const version = readLiteral(
    readInteger(payload.version, `${filePath}:version`),
    `${filePath}:version`,
    AUTORESEARCH_SELF_HOSTING_VERSION,
  );

  const controller = readObject(payload.controller, `${filePath}:controller`);
  const candidate = readObject(payload.candidate, `${filePath}:candidate`);
  const evaluator = readObject(payload.evaluator, `${filePath}:evaluator`);
  const applicability = readObject(payload.applicability, `${filePath}:applicability`);
  const promotion = readObject(payload.promotion, `${filePath}:promotion`);
  const minimumDefaultPromotionTransferScope = readObject(
    applicability.minimumDefaultPromotionTransferScope,
    `${filePath}:applicability.minimumDefaultPromotionTransferScope`,
  );
  const variantTargetProfile = readNullableObject(
    applicability.variantTargetProfile,
    `${filePath}:applicability.variantTargetProfile`,
  );
  const primaryMetric = readObject(
    applicability.primaryMetric,
    `${filePath}:applicability.primaryMetric`,
  );

  const devSuites = readRelativePathSafeIdArray(
    evaluator.devSuites,
    `${filePath}:evaluator.devSuites`,
  );
  const holdoutSuites = readRelativePathSafeIdArray(
    evaluator.holdoutSuites,
    `${filePath}:evaluator.holdoutSuites`,
  );
  const transferSuites = readRelativePathSafeIdArray(
    evaluator.transferSuites,
    `${filePath}:evaluator.transferSuites`,
  );
  const criticalSuites = readRelativePathSafeIdArray(
    evaluator.criticalSuites,
    `${filePath}:evaluator.criticalSuites`,
  );

  ensureNonEmpty(devSuites, `${filePath}:evaluator.devSuites`);
  ensureNonEmpty(holdoutSuites, `${filePath}:evaluator.holdoutSuites`);
  ensureNonEmpty(transferSuites, `${filePath}:evaluator.transferSuites`);
  ensureNonEmpty(criticalSuites, `${filePath}:evaluator.criticalSuites`);
  ensureDisjointSuiteGroups(
    [
      ["devSuites", devSuites],
      ["holdoutSuites", holdoutSuites],
      ["transferSuites", transferSuites],
    ],
    `${filePath}:evaluator`,
  );

  const declaredSuiteIds = new Set([...devSuites, ...holdoutSuites, ...transferSuites]);
  for (const suiteId of criticalSuites) {
    if (!declaredSuiteIds.has(suiteId)) {
      throw new AutoresearchSelfHostingValidationError(
        `${filePath}:evaluator.criticalSuites includes undeclared suite id ${JSON.stringify(suiteId)}`,
      );
    }
  }

  const allowedPaths = readRelativePathSpecArray(
    candidate.allowedPaths,
    `${filePath}:candidate.allowedPaths`,
  );
  const offLimits = readRelativePathSpecArray(
    candidate.offLimits,
    `${filePath}:candidate.offLimits`,
  );
  ensureNonEmpty(allowedPaths, `${filePath}:candidate.allowedPaths`);
  ensureNonEmpty(offLimits, `${filePath}:candidate.offLimits`);
  ensureNoExactOverlap(allowedPaths, offLimits, `${filePath}:candidate`);

  const requiredCoverageKinds = readLiteralUnionArray(
    minimumDefaultPromotionTransferScope.requiredCoverageKinds,
    `${filePath}:applicability.minimumDefaultPromotionTransferScope.requiredCoverageKinds`,
    MINIMUM_DEFAULT_PROMOTION_COVERAGE_KINDS,
  );
  ensureContainsAll(
    requiredCoverageKinds,
    MINIMUM_DEFAULT_PROMOTION_COVERAGE_KINDS,
    `${filePath}:applicability.minimumDefaultPromotionTransferScope.requiredCoverageKinds`,
  );

  const requiredApprovals = readLiteralUnionArray(
    promotion.requiredApprovals,
    `${filePath}:promotion.requiredApprovals`,
    PROMOTION_APPROVALS,
  );
  ensureNonEmpty(requiredApprovals, `${filePath}:promotion.requiredApprovals`);

  const contract: AutoresearchSelfHostingContractV1 = {
    type: kind,
    version,
    campaignId: readId(payload.campaignId, `${filePath}:campaignId`),
    controller: {
      mode: readLiteralUnion(controller.mode, `${filePath}:controller.mode`, CONTROLLER_MODES),
      ref: readString(controller.ref, `${filePath}:controller.ref`),
      controllerCwd: readAbsolutePath(
        controller.controllerCwd,
        `${filePath}:controller.controllerCwd`,
      ),
      executionModel: readLiteral(
        controller.executionModel,
        `${filePath}:controller.executionModel`,
        AUTORESEARCH_SELF_HOSTING_EXECUTION_MODEL,
      ),
    },
    candidate: {
      worktreePath: readAbsolutePath(candidate.worktreePath, `${filePath}:candidate.worktreePath`),
      baseRef: readString(candidate.baseRef, `${filePath}:candidate.baseRef`),
      branchName: readString(candidate.branchName, `${filePath}:candidate.branchName`),
      allowedPaths,
      offLimits,
      onFailureDisposition: readLiteralUnion(
        candidate.onFailureDisposition,
        `${filePath}:candidate.onFailureDisposition`,
        CANDIDATE_FAILURE_DISPOSITIONS,
      ),
    },
    evaluator: {
      lockPath: readPathReference(evaluator.lockPath, `${filePath}:evaluator.lockPath`),
      manifestPath: readPathReference(evaluator.manifestPath, `${filePath}:evaluator.manifestPath`),
      manifestHash: readSha256(evaluator.manifestHash, `${filePath}:evaluator.manifestHash`),
      snapshotRootPath: readPathReference(
        evaluator.snapshotRootPath,
        `${filePath}:evaluator.snapshotRootPath`,
      ),
      criticalSuites,
      devSuites,
      holdoutSuites,
      transferSuites,
      candidateMayEditEvaluator: readFalse(
        evaluator.candidateMayEditEvaluator,
        `${filePath}:evaluator.candidateMayEditEvaluator`,
      ),
    },
    applicability: {
      primaryMetric: {
        name: readId(primaryMetric.name, `${filePath}:applicability.primaryMetric.name`),
        direction: readLiteralUnion(
          primaryMetric.direction,
          `${filePath}:applicability.primaryMetric.direction`,
          METRIC_DIRECTIONS,
        ),
        minImprovementForDefaultPromotionPercent: readNonNegativeNumber(
          primaryMetric.minImprovementForDefaultPromotionPercent,
          `${filePath}:applicability.primaryMetric.minImprovementForDefaultPromotionPercent`,
        ),
      },
      variantTargetProfile:
        variantTargetProfile === null
          ? null
          : {
              id: readId(
                variantTargetProfile.id,
                `${filePath}:applicability.variantTargetProfile.id`,
              ),
              description: readString(
                variantTargetProfile.description,
                `${filePath}:applicability.variantTargetProfile.description`,
              ),
            },
      maxCriticalSuiteFailures: readZero(
        applicability.maxCriticalSuiteFailures,
        `${filePath}:applicability.maxCriticalSuiteFailures`,
      ),
      maxHoldoutCriticalFailures: readZero(
        applicability.maxHoldoutCriticalFailures,
        `${filePath}:applicability.maxHoldoutCriticalFailures`,
      ),
      maxTransferCriticalFailures: readZero(
        applicability.maxTransferCriticalFailures,
        `${filePath}:applicability.maxTransferCriticalFailures`,
      ),
      maxNonCriticalTransferRegressionPercent: readNonNegativeNumber(
        applicability.maxNonCriticalTransferRegressionPercent,
        `${filePath}:applicability.maxNonCriticalTransferRegressionPercent`,
      ),
      minimumDefaultPromotionTransferScope: {
        minimumSuites: readMinimumInteger(
          minimumDefaultPromotionTransferScope.minimumSuites,
          `${filePath}:applicability.minimumDefaultPromotionTransferScope.minimumSuites`,
          2,
        ),
        requiredCoverageKinds,
      },
    },
    promotion: {
      packageMaySelfPromote: readFalse(
        promotion.packageMaySelfPromote,
        `${filePath}:promotion.packageMaySelfPromote`,
      ),
      requiredApprovals,
      promotionRecordPath: readPathReference(
        promotion.promotionRecordPath,
        `${filePath}:promotion.promotionRecordPath`,
      ),
      rollbackControllerRef: readString(
        promotion.rollbackControllerRef,
        `${filePath}:promotion.rollbackControllerRef`,
      ),
    },
  };

  if (
    path.resolve(contract.controller.controllerCwd) ===
    path.resolve(contract.candidate.worktreePath)
  ) {
    throw new AutoresearchSelfHostingValidationError(
      `${filePath}:candidate.worktreePath must differ from controller.controllerCwd`,
    );
  }

  return contract;
}

export function validateAutoresearchSelfHostingEvaluatorLock(
  payload: Record<string, unknown>,
  filePath: string,
): AutoresearchSelfHostingEvaluatorLockV1 {
  const kind = readLiteral(
    payload.type,
    `${filePath}:type`,
    AUTORESEARCH_SELF_HOSTING_EVALUATOR_LOCK_KIND,
  );
  const version = readLiteral(
    readInteger(payload.version, `${filePath}:version`),
    `${filePath}:version`,
    AUTORESEARCH_SELF_HOSTING_VERSION,
  );

  const rawEvaluatorFiles = readObjectArray(payload.evaluatorFiles, `${filePath}:evaluatorFiles`);
  const evaluatorFiles = rawEvaluatorFiles.map((entry, index) => ({
    path: readRelativePathSpec(entry.path, `${filePath}:evaluatorFiles[${index}].path`),
    sha256: readSha256(entry.sha256, `${filePath}:evaluatorFiles[${index}].sha256`),
  }));
  ensureNonEmpty(evaluatorFiles, `${filePath}:evaluatorFiles`);
  ensureUnique(
    evaluatorFiles.map((entry) => entry.path),
    `${filePath}:evaluatorFiles paths`,
  );
  const evaluatorFileHashes = new Map(evaluatorFiles.map((entry) => [entry.path, entry.sha256]));

  const rawSuites = readObjectArray(payload.suites, `${filePath}:suites`);
  const suites = rawSuites.map((entry, index) => {
    const entrypoint = readObject(entry.entrypoint, `${filePath}:suites[${index}].entrypoint`);
    return {
      id: readId(entry.id, `${filePath}:suites[${index}].id`),
      class: readLiteralUnion(
        entry.class,
        `${filePath}:suites[${index}].class`,
        EVALUATOR_SUITE_CLASSES,
      ),
      critical: readBoolean(entry.critical, `${filePath}:suites[${index}].critical`),
      coverageKind: readLiteralUnion(
        entry.coverageKind,
        `${filePath}:suites[${index}].coverageKind`,
        EVALUATOR_COVERAGE_KINDS,
      ),
      entrypoint: {
        kind: readLiteralUnion(
          entrypoint.kind,
          `${filePath}:suites[${index}].entrypoint.kind`,
          EVALUATOR_ENTRYPOINT_KINDS,
        ),
        path: readRelativePathSpec(entrypoint.path, `${filePath}:suites[${index}].entrypoint.path`),
        sha256: readSha256(entrypoint.sha256, `${filePath}:suites[${index}].entrypoint.sha256`),
      },
      subjectCwdMode: readLiteralUnion(
        entry.subjectCwdMode,
        `${filePath}:suites[${index}].subjectCwdMode`,
        SUBJECT_CWD_MODES,
      ),
      argv: readStringArray(entry.argv, `${filePath}:suites[${index}].argv`),
    } satisfies AutoresearchSelfHostingEvaluatorSuiteV1;
  });
  ensureNonEmpty(suites, `${filePath}:suites`);
  ensureUnique(
    suites.map((suite) => suite.id),
    `${filePath}:suites ids`,
  );

  const suiteCounts = new Map<AutoresearchSelfHostingEvaluatorSuiteClass, number>([
    ["dev", 0],
    ["holdout", 0],
    ["transfer", 0],
  ]);
  for (const suite of suites) {
    suiteCounts.set(suite.class, (suiteCounts.get(suite.class) ?? 0) + 1);
    const lockedHash = evaluatorFileHashes.get(suite.entrypoint.path);
    if (!lockedHash) {
      throw new AutoresearchSelfHostingValidationError(
        `${filePath}:suites entrypoint ${JSON.stringify(suite.entrypoint.path)} is not present in evaluatorFiles`,
      );
    }
    if (lockedHash !== suite.entrypoint.sha256) {
      throw new AutoresearchSelfHostingValidationError(
        `${filePath}:suites entrypoint hash for ${JSON.stringify(suite.entrypoint.path)} must match evaluatorFiles`,
      );
    }
  }

  for (const suiteClass of EVALUATOR_SUITE_CLASSES) {
    if ((suiteCounts.get(suiteClass) ?? 0) === 0) {
      throw new AutoresearchSelfHostingValidationError(
        `${filePath}:suites must include at least one ${suiteClass} suite`,
      );
    }
  }

  return {
    type: kind,
    version,
    campaignId: readId(payload.campaignId, `${filePath}:campaignId`),
    snapshotRootPath: readPathReference(payload.snapshotRootPath, `${filePath}:snapshotRootPath`),
    manifestPath: readPathReference(payload.manifestPath, `${filePath}:manifestPath`),
    manifestHash: readSha256(payload.manifestHash, `${filePath}:manifestHash`),
    executionModel: readLiteral(
      payload.executionModel,
      `${filePath}:executionModel`,
      AUTORESEARCH_SELF_HOSTING_EXECUTION_MODEL,
    ),
    evaluatorFiles,
    suites,
  };
}

export function validateAutoresearchSelfHostingPromotionRecord(
  payload: Record<string, unknown>,
  filePath: string,
): AutoresearchSelfHostingPromotionRecordV1 {
  const kind = readLiteral(
    payload.type,
    `${filePath}:type`,
    AUTORESEARCH_SELF_HOSTING_PROMOTION_RECORD_KIND,
  );
  const version = readLiteral(
    readInteger(payload.version, `${filePath}:version`),
    `${filePath}:version`,
    AUTORESEARCH_SELF_HOSTING_VERSION,
  );
  const approvedBy = readLiteralUnionArray(
    payload.approvedBy,
    `${filePath}:approvedBy`,
    PROMOTION_APPROVALS,
  );
  const evidenceRefs = readStringArray(payload.evidenceRefs, `${filePath}:evidenceRefs`);
  ensureUnique(evidenceRefs, `${filePath}:evidenceRefs`);

  const record: AutoresearchSelfHostingPromotionRecordV1 = {
    type: kind,
    version,
    campaignId: readId(payload.campaignId, `${filePath}:campaignId`),
    approvedBy,
    approvedAt: readNullableNonNegativeNumber(payload.approvedAt, `${filePath}:approvedAt`),
    previousControllerRef: readString(
      payload.previousControllerRef,
      `${filePath}:previousControllerRef`,
    ),
    promotedCandidateRef: readNullableString(
      payload.promotedCandidateRef,
      `${filePath}:promotedCandidateRef`,
    ),
    evaluatorManifestHash: readSha256(
      payload.evaluatorManifestHash,
      `${filePath}:evaluatorManifestHash`,
    ),
    evidenceRefs,
    status: readLiteralUnion(payload.status, `${filePath}:status`, PROMOTION_RECORD_STATUSES),
    rollbackControllerRef: readString(
      payload.rollbackControllerRef,
      `${filePath}:rollbackControllerRef`,
    ),
    rollbackReason: readNullableString(payload.rollbackReason, `${filePath}:rollbackReason`),
    rolledBackAt: readNullableNonNegativeNumber(payload.rolledBackAt, `${filePath}:rolledBackAt`),
  };

  validateAutoresearchSelfHostingPromotionRecordState(record, filePath);
  return record;
}

export function validateAutoresearchSelfHostingArtifactsPair(
  contract: AutoresearchSelfHostingContractV1,
  evaluatorLock: AutoresearchSelfHostingEvaluatorLockV1,
): void {
  if (contract.campaignId !== evaluatorLock.campaignId) {
    throw new AutoresearchSelfHostingValidationError(
      `Self-hosting contract campaignId ${JSON.stringify(contract.campaignId)} does not match evaluator lock campaignId ${JSON.stringify(evaluatorLock.campaignId)}`,
    );
  }
  if (contract.controller.executionModel !== evaluatorLock.executionModel) {
    throw new AutoresearchSelfHostingValidationError(
      `Self-hosting execution model ${contract.controller.executionModel} does not match evaluator lock execution model ${evaluatorLock.executionModel}`,
    );
  }
  if (contract.evaluator.manifestHash !== evaluatorLock.manifestHash) {
    throw new AutoresearchSelfHostingValidationError(
      "Self-hosting contract evaluator.manifestHash does not match evaluator lock manifestHash.",
    );
  }
  if (
    resolveArtifactPath(contract.controller.controllerCwd, contract.evaluator.manifestPath) !==
    resolveArtifactPath(contract.controller.controllerCwd, evaluatorLock.manifestPath)
  ) {
    throw new AutoresearchSelfHostingValidationError(
      "Self-hosting contract evaluator.manifestPath does not match evaluator lock manifestPath.",
    );
  }
  if (
    resolveArtifactPath(contract.controller.controllerCwd, contract.evaluator.snapshotRootPath) !==
    resolveArtifactPath(contract.controller.controllerCwd, evaluatorLock.snapshotRootPath)
  ) {
    throw new AutoresearchSelfHostingValidationError(
      "Self-hosting contract evaluator.snapshotRootPath does not match evaluator lock snapshotRootPath.",
    );
  }

  const suitesByClass = groupSuiteIdsByClass(evaluatorLock.suites);
  assertSameSet(
    contract.evaluator.devSuites,
    suitesByClass.dev,
    "Self-hosting contract evaluator.devSuites",
    "evaluator lock dev suites",
  );
  assertSameSet(
    contract.evaluator.holdoutSuites,
    suitesByClass.holdout,
    "Self-hosting contract evaluator.holdoutSuites",
    "evaluator lock holdout suites",
  );
  assertSameSet(
    contract.evaluator.transferSuites,
    suitesByClass.transfer,
    "Self-hosting contract evaluator.transferSuites",
    "evaluator lock transfer suites",
  );

  const criticalSuites = evaluatorLock.suites
    .filter((suite) => suite.critical)
    .map((suite) => suite.id);
  assertSameSet(
    contract.evaluator.criticalSuites,
    criticalSuites,
    "Self-hosting contract evaluator.criticalSuites",
    "evaluator lock critical suites",
  );

  const transferSuites = evaluatorLock.suites.filter((suite) => suite.class === "transfer");
  if (
    transferSuites.length <
    contract.applicability.minimumDefaultPromotionTransferScope.minimumSuites
  ) {
    throw new AutoresearchSelfHostingValidationError(
      `Evaluator lock provides ${transferSuites.length} transfer suites, but the self-hosting contract requires at least ${contract.applicability.minimumDefaultPromotionTransferScope.minimumSuites}`,
    );
  }

  const transferCoverageKinds = new Set(transferSuites.map((suite) => suite.coverageKind));
  for (const requiredCoverageKind of contract.applicability.minimumDefaultPromotionTransferScope
    .requiredCoverageKinds) {
    if (!transferCoverageKinds.has(requiredCoverageKind)) {
      throw new AutoresearchSelfHostingValidationError(
        `Evaluator lock transfer suites do not satisfy required coverage kind ${JSON.stringify(requiredCoverageKind)}`,
      );
    }
  }
}

export function validateAutoresearchSelfHostingPromotionRecordPair(
  contract: AutoresearchSelfHostingContractV1,
  evaluatorLock: AutoresearchSelfHostingEvaluatorLockV1,
  record: AutoresearchSelfHostingPromotionRecordV1,
): void {
  if (record.campaignId !== contract.campaignId) {
    throw new AutoresearchSelfHostingValidationError(
      `Self-hosting promotion record campaignId ${JSON.stringify(record.campaignId)} does not match self-hosting contract campaignId ${JSON.stringify(contract.campaignId)}`,
    );
  }
  if (record.evaluatorManifestHash !== evaluatorLock.manifestHash) {
    throw new AutoresearchSelfHostingValidationError(
      "Self-hosting promotion record evaluatorManifestHash does not match evaluator lock manifestHash.",
    );
  }
  if (record.previousControllerRef !== contract.controller.ref) {
    throw new AutoresearchSelfHostingValidationError(
      "Self-hosting promotion record previousControllerRef does not match controller.ref.",
    );
  }
  if (record.rollbackControllerRef !== contract.promotion.rollbackControllerRef) {
    throw new AutoresearchSelfHostingValidationError(
      "Self-hosting promotion record rollbackControllerRef does not match promotion.rollbackControllerRef.",
    );
  }

  const unexpectedApprovals = record.approvedBy.filter(
    (approval) => !contract.promotion.requiredApprovals.includes(approval),
  );
  if (unexpectedApprovals.length > 0) {
    throw new AutoresearchSelfHostingValidationError(
      `Self-hosting promotion record includes approvals outside the contract-required set: ${formatAutoresearchSelfHostingEntries(unexpectedApprovals)}`,
    );
  }

  const missingRequiredApprovals = contract.promotion.requiredApprovals.filter(
    (approval) => !record.approvedBy.includes(approval),
  );
  if (record.status !== "planned" && missingRequiredApprovals.length > 0) {
    throw new AutoresearchSelfHostingValidationError(
      `Self-hosting promotion record status ${JSON.stringify(record.status)} requires approvals ${formatAutoresearchSelfHostingEntries(contract.promotion.requiredApprovals)}, but is missing ${formatAutoresearchSelfHostingEntries(missingRequiredApprovals)}.`,
    );
  }
}

export class AutoresearchSelfHostingIsolationError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "AutoresearchSelfHostingIsolationError";
  }
}

export interface AutoresearchSelfHostingCommandSummary {
  command: string[];
  cwd: string;
  exitCode: number | null;
  stdout: string;
  stderr: string;
  timedOut: boolean;
  signal: string | null;
}

export interface AutoresearchSelfHostingCandidateWorktreeState {
  worktreePath: string;
  branchName: string;
  baseRef: string;
  baseCommit: string;
  exists: boolean;
  registered: boolean;
  branch: string | null;
  head: string | null;
  commonDir: string | null;
  commonDirMatchesController: boolean;
}

export interface PrepareAutoresearchSelfHostingCandidateWorktreeInput {
  cwd: string;
  apply?: boolean;
}

export interface PrepareAutoresearchSelfHostingCandidateWorktreeResult {
  action: "prepare_candidate_worktree";
  mode: "plan" | "apply";
  campaignId: string;
  executionModel: AutoresearchSelfHostingExecutionModel;
  controllerCwd: string;
  controllerRepoRoot: string;
  controllerBranchBefore: string | null;
  controllerBranchAfter: string | null;
  candidate: AutoresearchSelfHostingCandidateWorktreeState;
  commands: AutoresearchSelfHostingCommandSummary[];
  nextStep: string;
}

export interface AutoresearchSelfHostingCandidateScopeStatus {
  action: "check_candidate_scope";
  campaignId: string;
  executionModel: AutoresearchSelfHostingExecutionModel;
  controllerRepoRoot: string;
  candidateWorktreePath: string;
  changedPaths: string[];
  offLimitsPaths: string[];
  outOfScopePaths: string[];
  ok: boolean;
}

export interface ExecuteAutoresearchSelfHostingCandidateSubprocessInput {
  cwd: string;
  command: [string, ...string[]];
  env?: Record<string, string | undefined>;
  timeoutMs?: number;
}

export interface ExecuteAutoresearchSelfHostingCandidateSubprocessResult {
  action: "run_candidate_subprocess";
  campaignId: string;
  executionModel: AutoresearchSelfHostingExecutionModel;
  controllerCwd: string;
  candidateCwd: string;
  controllerPid: number;
  scope: AutoresearchSelfHostingCandidateScopeStatus;
  postCommandScope: AutoresearchSelfHostingCandidateScopeStatus;
  command: AutoresearchSelfHostingCommandSummary;
  nextStep: string;
}

export interface ResolveAutoresearchSelfHostingEvaluatorSuiteInput {
  cwd: string;
  suiteId: string;
}

export interface ResolvedAutoresearchSelfHostingEvaluatorSuite {
  action: "resolve_evaluator_suite";
  campaignId: string;
  executionModel: AutoresearchSelfHostingExecutionModel;
  controllerCwd: string;
  controllerRepoRoot: string;
  candidateCwd: string;
  snapshotRootPath: string;
  manifestPath: string;
  suiteId: string;
  suiteClass: AutoresearchSelfHostingEvaluatorSuiteClass;
  critical: boolean;
  coverageKind: AutoresearchSelfHostingEvaluatorCoverageKind;
  subjectCwdMode: AutoresearchSelfHostingSubjectCwdMode;
  entrypointKind: AutoresearchSelfHostingEvaluatorEntrypointKind;
  entrypointPath: string;
  argv: string[];
  processCwd: string;
  command: string[];
}

export interface ExecuteAutoresearchSelfHostingEvaluatorSuiteInput {
  cwd: string;
  suiteId: string;
  env?: Record<string, string | undefined>;
  timeoutMs?: number;
}

export interface ExecuteAutoresearchSelfHostingEvaluatorSuiteResult {
  action: "run_locked_evaluator_suite";
  campaignId: string;
  executionModel: AutoresearchSelfHostingExecutionModel;
  controllerCwd: string;
  candidateCwd: string;
  resolvedSuite: ResolvedAutoresearchSelfHostingEvaluatorSuite;
  scope: AutoresearchSelfHostingCandidateScopeStatus;
  postCommandScope: AutoresearchSelfHostingCandidateScopeStatus;
  command: AutoresearchSelfHostingCommandSummary;
  nextStep: string;
}

export interface AutoresearchSelfHostingApplicabilitySuiteOutcome {
  suiteId: string;
  passed: boolean;
  regressionPercent?: number;
}

export interface ClassifyAutoresearchSelfHostingApplicabilityInput {
  cwd: string;
  suiteOutcomes: AutoresearchSelfHostingApplicabilitySuiteOutcome[];
  primaryMetric: {
    baseline: number;
    candidate: number;
  };
  variantTargetProfileImproved?: boolean;
}

export interface AutoresearchSelfHostingApplicabilityNonCriticalTransferRegression {
  suiteId: string;
  regressionPercent: number;
  withinBudget: boolean;
}

export interface AutoresearchSelfHostingApplicabilityClassification {
  action: "classify_applicability";
  campaignId: string;
  executionModel: AutoresearchSelfHostingExecutionModel;
  controllerCwd: string;
  controllerRepoRoot: string;
  candidateCwd: string;
  outcome: AutoresearchSelfHostingApplicabilityOutcome;
  variantTargetProfile: AutoresearchSelfHostingContractV1["applicability"]["variantTargetProfile"];
  scope: AutoresearchSelfHostingCandidateScopeStatus;
  primaryMetric: {
    name: string;
    direction: AutoresearchSelfHostingMetricDirection;
    baseline: number;
    candidate: number;
    improvementPercent: number;
    improved: boolean;
    meetsDefaultPromotionThreshold: boolean;
  };
  suiteSummary: {
    declaredSuiteIds: string[];
    reportedSuiteIds: string[];
    passedSuiteIds: string[];
    failedSuiteIds: string[];
    failedNonCriticalSuiteIds: string[];
    missingSuiteIds: string[];
    unexpectedSuiteIds: string[];
    criticalFailureSuiteIds: string[];
    holdoutCriticalFailureSuiteIds: string[];
    transferCriticalFailureSuiteIds: string[];
    passedTransferSuiteIds: string[];
    passedTransferCoverageKinds: AutoresearchSelfHostingEvaluatorCoverageKind[];
    minimumDefaultPromotionTransferSuites: number;
    missingDefaultPromotionCoverageKinds: AutoresearchSelfHostingMinimumDefaultPromotionCoverageKind[];
    nonCriticalTransferRegressions: AutoresearchSelfHostingApplicabilityNonCriticalTransferRegression[];
  };
  gateStatus: {
    variantTargetProfileDeclared: boolean;
    variantImprovementObserved: boolean;
    primaryMetricImproved: boolean;
    primaryMetricMeetsDefaultPromotionThreshold: boolean;
    minimumTransferCoverageSatisfied: boolean;
    nonCriticalTransferRegressionWithinBudget: boolean;
    criticalFailuresWithinBudget: boolean;
    holdoutCriticalFailuresWithinBudget: boolean;
    transferCriticalFailuresWithinBudget: boolean;
  };
  rejectReasons: string[];
  variantBlockers: string[];
  defaultPromotionBlockers: string[];
  blockingReasons: string[];
  nextStep: string;
}

export interface PrepareAutoresearchSelfHostingPromotionRecordInput {
  cwd: string;
  classification: AutoresearchSelfHostingApplicabilityClassification;
  approvedBy?: AutoresearchSelfHostingPromotionApproval[];
  approvedAt?: number;
  evidenceRefs?: string[];
  promotedCandidateRef?: string;
  status?: Exclude<AutoresearchSelfHostingPromotionRecordStatus, "rolled_back">;
  apply?: boolean;
}

export interface PrepareAutoresearchSelfHostingPromotionRecordResult {
  action: "prepare_promotion_record";
  mode: "plan" | "apply";
  campaignId: string;
  executionModel: AutoresearchSelfHostingExecutionModel;
  controllerCwd: string;
  candidateCwd: string;
  promotionRecordPath: string;
  scope: AutoresearchSelfHostingCandidateScopeStatus;
  classificationOutcome: AutoresearchSelfHostingApplicabilityOutcome;
  requiredApprovals: AutoresearchSelfHostingPromotionApproval[];
  missingApprovals: AutoresearchSelfHostingPromotionApproval[];
  promotionReady: boolean;
  record: AutoresearchSelfHostingPromotionRecordV1;
  nextStep: string;
}

export interface RecordAutoresearchSelfHostingRollbackInput {
  cwd: string;
  rollbackReason: string;
  rolledBackAt?: number;
  evidenceRefs?: string[];
  apply?: boolean;
}

export interface RecordAutoresearchSelfHostingRollbackResult {
  action: "record_promotion_rollback";
  mode: "plan" | "apply";
  campaignId: string;
  executionModel: AutoresearchSelfHostingExecutionModel;
  controllerCwd: string;
  candidateCwd: string;
  promotionRecordPath: string;
  previousRecord: AutoresearchSelfHostingPromotionRecordV1;
  record: AutoresearchSelfHostingPromotionRecordV1;
  nextStep: string;
}

export function prepareAutoresearchSelfHostingCandidateWorktree(
  input: PrepareAutoresearchSelfHostingCandidateWorktreeInput,
): PrepareAutoresearchSelfHostingCandidateWorktreeResult {
  const artifacts = loadAutoresearchSelfHostingArtifacts(input.cwd);
  const controllerRepoRoot = resolveGitTopLevel(artifacts.cwd);
  const controllerBranchBefore = readCurrentGitBranch(controllerRepoRoot);
  const baseCommit = resolveGitCommit(
    controllerRepoRoot,
    artifacts.contract.candidate.baseRef,
    `${artifacts.contract.candidate.baseRef}^{commit}`,
  );
  let candidate = inspectAutoresearchSelfHostingCandidateWorktreeState(
    controllerRepoRoot,
    artifacts.contract.candidate.worktreePath,
    artifacts.contract.candidate.branchName,
    artifacts.contract.candidate.baseRef,
    baseCommit,
  );

  if (candidate.exists && !candidate.registered) {
    throw new AutoresearchSelfHostingIsolationError(
      `Candidate worktree path ${JSON.stringify(candidate.worktreePath)} already exists but is not a registered worktree for the controller repo.`,
    );
  }

  const command = [
    "git",
    "worktree",
    "add",
    "-B",
    artifacts.contract.candidate.branchName,
    artifacts.contract.candidate.worktreePath,
    artifacts.contract.candidate.baseRef,
  ];
  const commands: AutoresearchSelfHostingCommandSummary[] = [];

  if (!candidate.registered) {
    if (input.apply) {
      commands.push(
        runCommandSummary(
          command[0],
          command.slice(1),
          controllerRepoRoot,
          `${artifacts.contract.campaignId}:create_candidate_worktree`,
        ),
      );
      candidate = inspectAutoresearchSelfHostingCandidateWorktreeState(
        controllerRepoRoot,
        artifacts.contract.candidate.worktreePath,
        artifacts.contract.candidate.branchName,
        artifacts.contract.candidate.baseRef,
        baseCommit,
      );
      if (!candidate.registered) {
        throw new AutoresearchSelfHostingIsolationError(
          `Candidate worktree ${JSON.stringify(candidate.worktreePath)} was not registered after creation.`,
        );
      }
    } else {
      commands.push(planCommandSummary(command, controllerRepoRoot));
    }
  }

  if (candidate.registered && candidate.branch !== artifacts.contract.candidate.branchName) {
    throw new AutoresearchSelfHostingIsolationError(
      `Candidate worktree ${JSON.stringify(candidate.worktreePath)} is on branch ${JSON.stringify(candidate.branch)}, expected ${JSON.stringify(artifacts.contract.candidate.branchName)}.`,
    );
  }

  const controllerBranchAfter = readCurrentGitBranch(controllerRepoRoot);
  if (controllerBranchBefore !== controllerBranchAfter) {
    throw new AutoresearchSelfHostingIsolationError(
      `Controller branch changed during candidate worktree preparation: before=${JSON.stringify(controllerBranchBefore)} after=${JSON.stringify(controllerBranchAfter)}.`,
    );
  }

  return {
    action: "prepare_candidate_worktree",
    mode: input.apply ? "apply" : "plan",
    campaignId: artifacts.contract.campaignId,
    executionModel: artifacts.contract.controller.executionModel,
    controllerCwd: artifacts.contract.controller.controllerCwd,
    controllerRepoRoot,
    controllerBranchBefore,
    controllerBranchAfter,
    candidate,
    commands,
    nextStep: input.apply
      ? `Validate candidate mutation scope before running any candidate code, then execute candidate logic only through subprocess commands rooted at ${candidate.worktreePath}.`
      : `Run prepareAutoresearchSelfHostingCandidateWorktree with apply=true to materialize the candidate worktree at ${candidate.worktreePath}.`,
  };
}

export function inspectAutoresearchSelfHostingCandidateScope(
  cwd: string,
): AutoresearchSelfHostingCandidateScopeStatus {
  const artifacts = loadAutoresearchSelfHostingArtifacts(cwd);
  const controllerRepoRoot = resolveGitTopLevel(artifacts.cwd);
  assertAutoresearchSelfHostingCandidateWorktreeRegistered(controllerRepoRoot, artifacts.contract);

  const changedPaths = listGitStatusPaths(artifacts.contract.candidate.worktreePath);
  const offLimitsPaths = changedPaths.filter((candidatePath) =>
    matchesAnyPathSpec(candidatePath, artifacts.contract.candidate.offLimits),
  );
  const outOfScopePaths = changedPaths.filter(
    (candidatePath) =>
      !matchesAnyPathSpec(candidatePath, artifacts.contract.candidate.allowedPaths),
  );

  return {
    action: "check_candidate_scope",
    campaignId: artifacts.contract.campaignId,
    executionModel: artifacts.contract.controller.executionModel,
    controllerRepoRoot,
    candidateWorktreePath: artifacts.contract.candidate.worktreePath,
    changedPaths,
    offLimitsPaths,
    outOfScopePaths,
    ok: offLimitsPaths.length === 0 && outOfScopePaths.length === 0,
  };
}

export function assertAutoresearchSelfHostingCandidateScope(
  cwd: string,
): AutoresearchSelfHostingCandidateScopeStatus {
  const status = inspectAutoresearchSelfHostingCandidateScope(cwd);
  if (status.ok) {
    return status;
  }
  const problems: string[] = [];
  if (status.offLimitsPaths.length > 0) {
    problems.push(
      `off-limits mutations: ${status.offLimitsPaths.map((entry) => JSON.stringify(entry)).join(", ")}`,
    );
  }
  if (status.outOfScopePaths.length > 0) {
    problems.push(
      `out-of-scope mutations: ${status.outOfScopePaths.map((entry) => JSON.stringify(entry)).join(", ")}`,
    );
  }
  throw new AutoresearchSelfHostingIsolationError(
    `Candidate worktree scope check failed for ${JSON.stringify(status.candidateWorktreePath)}: ${problems.join("; ")}`,
  );
}

export function executeAutoresearchSelfHostingCandidateSubprocess(
  input: ExecuteAutoresearchSelfHostingCandidateSubprocessInput,
): ExecuteAutoresearchSelfHostingCandidateSubprocessResult {
  const artifacts = loadAutoresearchSelfHostingArtifacts(input.cwd);
  const controllerRepoRoot = resolveGitTopLevel(artifacts.cwd);
  assertAutoresearchSelfHostingCandidateWorktreeRegistered(controllerRepoRoot, artifacts.contract);
  const scope = assertAutoresearchSelfHostingCandidateScope(input.cwd);

  const command = runCommandSummary(
    input.command[0],
    input.command.slice(1),
    artifacts.contract.candidate.worktreePath,
    `${artifacts.contract.campaignId}:candidate_subprocess`,
    {
      timeoutMs: input.timeoutMs,
      env: {
        ...input.env,
        PI_AUTORESEARCH_SELF_HOSTING_CAMPAIGN_ID: artifacts.contract.campaignId,
        PI_AUTORESEARCH_SELF_HOSTING_EXECUTION_MODEL: artifacts.contract.controller.executionModel,
        PI_AUTORESEARCH_SELF_HOSTING_CONTROLLER_CWD: artifacts.contract.controller.controllerCwd,
        PI_AUTORESEARCH_SELF_HOSTING_CANDIDATE_CWD: artifacts.contract.candidate.worktreePath,
      },
    },
  );
  const postCommandScope = inspectAutoresearchSelfHostingCandidateScope(input.cwd);
  if (!postCommandScope.ok) {
    const problems: string[] = [];
    if (postCommandScope.offLimitsPaths.length > 0) {
      problems.push(
        `off-limits mutations after subprocess: ${postCommandScope.offLimitsPaths
          .map((entry) => JSON.stringify(entry))
          .join(", ")}`,
      );
    }
    if (postCommandScope.outOfScopePaths.length > 0) {
      problems.push(
        `out-of-scope mutations after subprocess: ${postCommandScope.outOfScopePaths
          .map((entry) => JSON.stringify(entry))
          .join(", ")}`,
      );
    }
    throw new AutoresearchSelfHostingIsolationError(
      `Candidate subprocess violated scope after execution: ${problems.join("; ")}`,
    );
  }

  return {
    action: "run_candidate_subprocess",
    campaignId: artifacts.contract.campaignId,
    executionModel: artifacts.contract.controller.executionModel,
    controllerCwd: artifacts.contract.controller.controllerCwd,
    candidateCwd: artifacts.contract.candidate.worktreePath,
    controllerPid: process.pid,
    scope,
    postCommandScope,
    command,
    nextStep:
      command.exitCode === 0
        ? `Candidate subprocess completed under controller_subprocess_against_candidate; continue with snapshot-owned evaluator entrypoint work in SH-3.`
        : `Candidate subprocess failed with exit code ${JSON.stringify(command.exitCode)}; inspect stderr/stdout before retrying so the controller does not silently become the candidate.`,
  };
}

interface VerifiedAutoresearchSelfHostingEvaluatorFile {
  relativePath: string;
  absolutePath: string;
  sha256: string;
}

interface VerifiedAutoresearchSelfHostingEvaluatorSnapshot {
  snapshotRootPath: string;
  manifestPath: string;
  evaluatorFiles: Map<string, VerifiedAutoresearchSelfHostingEvaluatorFile>;
}

export function resolveAutoresearchSelfHostingEvaluatorSuite(
  input: ResolveAutoresearchSelfHostingEvaluatorSuiteInput,
): ResolvedAutoresearchSelfHostingEvaluatorSuite {
  const artifacts = loadAutoresearchSelfHostingArtifacts(input.cwd);
  const controllerRepoRoot = resolveGitTopLevel(artifacts.cwd);
  const candidate = assertAutoresearchSelfHostingCandidateWorktreeRegistered(
    controllerRepoRoot,
    artifacts.contract,
  );
  const snapshot = verifyAutoresearchSelfHostingEvaluatorSnapshot(artifacts);
  const suite = artifacts.evaluatorLock.suites.find((entry) => entry.id === input.suiteId);
  if (!suite) {
    throw new AutoresearchSelfHostingIsolationError(
      `Self-hosting evaluator suite ${JSON.stringify(input.suiteId)} is not declared in ${JSON.stringify(artifacts.lockPath)}.`,
    );
  }

  const entrypoint = snapshot.evaluatorFiles.get(suite.entrypoint.path);
  if (!entrypoint) {
    throw new AutoresearchSelfHostingIsolationError(
      `Self-hosting evaluator suite ${JSON.stringify(suite.id)} entrypoint ${JSON.stringify(suite.entrypoint.path)} is not available in the verified snapshot.`,
    );
  }

  const argv = expandAutoresearchSelfHostingEvaluatorArgv(suite.argv, {
    controllerCwd: artifacts.contract.controller.controllerCwd,
    candidateCwd: candidate.worktreePath,
    snapshotRootPath: snapshot.snapshotRootPath,
    manifestPath: snapshot.manifestPath,
    suiteId: suite.id,
  });
  const processCwd =
    suite.subjectCwdMode === "candidate" ? candidate.worktreePath : snapshot.snapshotRootPath;
  const command = buildAutoresearchSelfHostingEvaluatorCommand(
    suite.entrypoint.kind,
    entrypoint.absolutePath,
    argv,
  );

  return {
    action: "resolve_evaluator_suite",
    campaignId: artifacts.contract.campaignId,
    executionModel: artifacts.contract.controller.executionModel,
    controllerCwd: artifacts.contract.controller.controllerCwd,
    controllerRepoRoot,
    candidateCwd: candidate.worktreePath,
    snapshotRootPath: snapshot.snapshotRootPath,
    manifestPath: snapshot.manifestPath,
    suiteId: suite.id,
    suiteClass: suite.class,
    critical: suite.critical,
    coverageKind: suite.coverageKind,
    subjectCwdMode: suite.subjectCwdMode,
    entrypointKind: suite.entrypoint.kind,
    entrypointPath: entrypoint.absolutePath,
    argv,
    processCwd,
    command,
  };
}

export function executeAutoresearchSelfHostingEvaluatorSuite(
  input: ExecuteAutoresearchSelfHostingEvaluatorSuiteInput,
): ExecuteAutoresearchSelfHostingEvaluatorSuiteResult {
  const scope = assertAutoresearchSelfHostingCandidateScope(input.cwd);
  const resolvedSuite = resolveAutoresearchSelfHostingEvaluatorSuite({
    cwd: input.cwd,
    suiteId: input.suiteId,
  });

  const command = runCommandSummary(
    resolvedSuite.command[0],
    resolvedSuite.command.slice(1),
    resolvedSuite.processCwd,
    `${resolvedSuite.campaignId}:locked_evaluator_suite:${resolvedSuite.suiteId}`,
    {
      timeoutMs: input.timeoutMs,
      env: {
        ...input.env,
        PI_AUTORESEARCH_SELF_HOSTING_CAMPAIGN_ID: resolvedSuite.campaignId,
        PI_AUTORESEARCH_SELF_HOSTING_EXECUTION_MODEL: resolvedSuite.executionModel,
        PI_AUTORESEARCH_SELF_HOSTING_CONTROLLER_CWD: resolvedSuite.controllerCwd,
        PI_AUTORESEARCH_SELF_HOSTING_CANDIDATE_CWD: resolvedSuite.candidateCwd,
        PI_AUTORESEARCH_SELF_HOSTING_EVALUATOR_SUITE_ID: resolvedSuite.suiteId,
        PI_AUTORESEARCH_SELF_HOSTING_EVALUATOR_ENTRYPOINT: resolvedSuite.entrypointPath,
        PI_AUTORESEARCH_SELF_HOSTING_EVALUATOR_SNAPSHOT_ROOT: resolvedSuite.snapshotRootPath,
        PI_AUTORESEARCH_SELF_HOSTING_EVALUATOR_MANIFEST: resolvedSuite.manifestPath,
        PI_AUTORESEARCH_SELF_HOSTING_EVALUATOR_SUBJECT_CWD_MODE: resolvedSuite.subjectCwdMode,
      },
    },
  );
  resolveAutoresearchSelfHostingEvaluatorSuite({
    cwd: input.cwd,
    suiteId: input.suiteId,
  });
  const postCommandScope = inspectAutoresearchSelfHostingCandidateScope(input.cwd);
  if (!postCommandScope.ok) {
    const problems: string[] = [];
    if (postCommandScope.offLimitsPaths.length > 0) {
      problems.push(
        `off-limits mutations after evaluator suite: ${postCommandScope.offLimitsPaths
          .map((entry) => JSON.stringify(entry))
          .join(", ")}`,
      );
    }
    if (postCommandScope.outOfScopePaths.length > 0) {
      problems.push(
        `out-of-scope mutations after evaluator suite: ${postCommandScope.outOfScopePaths
          .map((entry) => JSON.stringify(entry))
          .join(", ")}`,
      );
    }
    throw new AutoresearchSelfHostingIsolationError(
      `Locked evaluator suite violated candidate scope after execution: ${problems.join("; ")}`,
    );
  }

  return {
    action: "run_locked_evaluator_suite",
    campaignId: resolvedSuite.campaignId,
    executionModel: resolvedSuite.executionModel,
    controllerCwd: resolvedSuite.controllerCwd,
    candidateCwd: resolvedSuite.candidateCwd,
    resolvedSuite,
    scope,
    postCommandScope,
    command,
    nextStep:
      command.exitCode === 0
        ? `Locked evaluator suite ${JSON.stringify(resolvedSuite.suiteId)} completed under snapshot-owned entrypoints; SH-4 may now classify the bounded result.`
        : `Locked evaluator suite ${JSON.stringify(resolvedSuite.suiteId)} failed with exit code ${JSON.stringify(command.exitCode)}; inspect stderr/stdout without widening into candidate-owned dispatch.`,
  };
}

export function classifyAutoresearchSelfHostingApplicability(
  input: ClassifyAutoresearchSelfHostingApplicabilityInput,
): AutoresearchSelfHostingApplicabilityClassification {
  const artifacts = loadAutoresearchSelfHostingArtifacts(input.cwd);
  const controllerRepoRoot = resolveGitTopLevel(artifacts.cwd);
  const candidate = assertAutoresearchSelfHostingCandidateWorktreeRegistered(
    controllerRepoRoot,
    artifacts.contract,
  );
  const scope = inspectAutoresearchSelfHostingCandidateScope(input.cwd);
  const suiteOutcomes = normalizeAutoresearchSelfHostingApplicabilitySuiteOutcomes(
    input.suiteOutcomes,
  );
  const suiteOutcomesById = new Map(suiteOutcomes.map((entry) => [entry.suiteId, entry]));
  const declaredSuites = artifacts.evaluatorLock.suites;
  const declaredSuiteIds = declaredSuites.map((suite) => suite.id);
  const reportedSuiteIds = suiteOutcomes.map((entry) => entry.suiteId).sort();
  const missingSuiteIds = declaredSuiteIds
    .filter((suiteId) => !suiteOutcomesById.has(suiteId))
    .sort();
  const unexpectedSuiteIds = reportedSuiteIds.filter(
    (suiteId) => !declaredSuites.some((suite) => suite.id === suiteId),
  );

  const passedSuiteIds: string[] = [];
  const failedSuiteIds: string[] = [];
  const failedNonCriticalSuiteIds: string[] = [];
  const criticalFailureSuiteIds: string[] = [];
  const holdoutCriticalFailureSuiteIds: string[] = [];
  const transferCriticalFailureSuiteIds: string[] = [];
  const passedTransferSuiteIds: string[] = [];
  const passedTransferCoverageKinds = new Set<AutoresearchSelfHostingEvaluatorCoverageKind>();
  const nonCriticalTransferRegressions: AutoresearchSelfHostingApplicabilityNonCriticalTransferRegression[] =
    [];

  for (const suite of declaredSuites) {
    const outcome = suiteOutcomesById.get(suite.id);
    if (!outcome) {
      continue;
    }

    if (outcome.passed) {
      passedSuiteIds.push(suite.id);
    } else {
      failedSuiteIds.push(suite.id);
      if (suite.critical) {
        criticalFailureSuiteIds.push(suite.id);
        if (suite.class === "holdout") {
          holdoutCriticalFailureSuiteIds.push(suite.id);
        }
        if (suite.class === "transfer") {
          transferCriticalFailureSuiteIds.push(suite.id);
        }
      } else {
        failedNonCriticalSuiteIds.push(suite.id);
      }
    }

    if (suite.class === "transfer" && outcome.passed) {
      passedTransferSuiteIds.push(suite.id);
      passedTransferCoverageKinds.add(suite.coverageKind);
    }

    if (suite.class === "transfer" && !suite.critical) {
      const regressionPercent = outcome.regressionPercent ?? 0;
      nonCriticalTransferRegressions.push({
        suiteId: suite.id,
        regressionPercent,
        withinBudget:
          regressionPercent <=
          artifacts.contract.applicability.maxNonCriticalTransferRegressionPercent,
      });
    }
  }

  const requiredCoverageKinds =
    artifacts.contract.applicability.minimumDefaultPromotionTransferScope.requiredCoverageKinds;
  const missingDefaultPromotionCoverageKinds = requiredCoverageKinds.filter(
    (coverageKind) => !passedTransferCoverageKinds.has(coverageKind),
  );
  const minimumTransferCoverageSatisfied =
    passedTransferSuiteIds.length >=
      artifacts.contract.applicability.minimumDefaultPromotionTransferScope.minimumSuites &&
    missingDefaultPromotionCoverageKinds.length === 0;
  const nonCriticalTransferRegressionWithinBudget = nonCriticalTransferRegressions.every(
    (entry) => entry.withinBudget,
  );
  const criticalFailuresWithinBudget =
    criticalFailureSuiteIds.length <= artifacts.contract.applicability.maxCriticalSuiteFailures;
  const holdoutCriticalFailuresWithinBudget =
    holdoutCriticalFailureSuiteIds.length <=
    artifacts.contract.applicability.maxHoldoutCriticalFailures;
  const transferCriticalFailuresWithinBudget =
    transferCriticalFailureSuiteIds.length <=
    artifacts.contract.applicability.maxTransferCriticalFailures;

  const primaryMetric = readObject(input.primaryMetric as unknown, "primaryMetric");
  const primaryMetricBaseline = readFiniteAutoresearchSelfHostingNumber(
    primaryMetric.baseline,
    "primaryMetric.baseline",
  );
  const primaryMetricCandidate = readFiniteAutoresearchSelfHostingNumber(
    primaryMetric.candidate,
    "primaryMetric.candidate",
  );
  const primaryMetricImprovementPercent = computeAutoresearchSelfHostingMetricImprovementPercent(
    artifacts.contract.applicability.primaryMetric.direction,
    primaryMetricBaseline,
    primaryMetricCandidate,
  );
  const primaryMetricImproved = primaryMetricImprovementPercent > 0;
  const primaryMetricMeetsDefaultPromotionThreshold =
    primaryMetricImprovementPercent >=
    artifacts.contract.applicability.primaryMetric.minImprovementForDefaultPromotionPercent;
  const variantTargetProfileDeclared =
    artifacts.contract.applicability.variantTargetProfile !== null;
  const variantImprovementObserved = input.variantTargetProfileImproved === true;
  const meaningfulImprovementObserved = variantImprovementObserved || primaryMetricImproved;

  const rejectReasons = uniqueSortedEntries([
    ...describeAutoresearchSelfHostingScopeProblems(scope),
    ...(missingSuiteIds.length > 0
      ? [
          `Missing locked evaluator suite outcomes: ${formatAutoresearchSelfHostingEntries(missingSuiteIds)}`,
        ]
      : []),
    ...(unexpectedSuiteIds.length > 0
      ? [
          `Unexpected evaluator suite outcomes were provided outside the locked evaluator manifest: ${formatAutoresearchSelfHostingEntries(unexpectedSuiteIds)}`,
        ]
      : []),
    ...(!criticalFailuresWithinBudget
      ? [
          `Critical evaluator suites failed beyond the accepted budget: ${formatAutoresearchSelfHostingEntries(criticalFailureSuiteIds)}`,
        ]
      : []),
    ...(!holdoutCriticalFailuresWithinBudget
      ? [
          `Critical holdout suites failed beyond the accepted budget: ${formatAutoresearchSelfHostingEntries(holdoutCriticalFailureSuiteIds)}`,
        ]
      : []),
    ...(!transferCriticalFailuresWithinBudget
      ? [
          `Critical transfer suites failed beyond the accepted budget: ${formatAutoresearchSelfHostingEntries(transferCriticalFailureSuiteIds)}`,
        ]
      : []),
    ...(failedNonCriticalSuiteIds.length > 0
      ? [
          `Non-critical evaluator suites failed, so applicability cannot be classified truthfully: ${formatAutoresearchSelfHostingEntries(failedNonCriticalSuiteIds)}`,
        ]
      : []),
    ...(!meaningfulImprovementObserved
      ? [
          variantTargetProfileDeclared
            ? "Candidate did not improve the declared variant target profile or the primary metric."
            : "Candidate did not improve the primary metric, and no declared variant target profile exists to justify retaining a specialized win.",
        ]
      : []),
  ]);

  const defaultPromotionBlockers = uniqueSortedEntries([
    ...(!primaryMetricMeetsDefaultPromotionThreshold
      ? [
          `Primary metric improvement ${formatAutoresearchSelfHostingPercent(primaryMetricImprovementPercent)} is below the default-promotion threshold ${formatAutoresearchSelfHostingPercent(artifacts.contract.applicability.primaryMetric.minImprovementForDefaultPromotionPercent)}.`,
        ]
      : []),
    ...(!minimumTransferCoverageSatisfied
      ? [
          `Default-promotion transfer coverage is insufficient: requires at least ${artifacts.contract.applicability.minimumDefaultPromotionTransferScope.minimumSuites} passed transfer suites and coverage kinds ${formatAutoresearchSelfHostingEntries(requiredCoverageKinds)}, got ${passedTransferSuiteIds.length} passed transfer suites and coverage kinds ${formatAutoresearchSelfHostingEntries(Array.from(passedTransferCoverageKinds).sort())}${missingDefaultPromotionCoverageKinds.length > 0 ? `; missing ${formatAutoresearchSelfHostingEntries(missingDefaultPromotionCoverageKinds)}` : ""}.`,
        ]
      : []),
    ...(!nonCriticalTransferRegressionWithinBudget
      ? [
          `Non-critical transfer regressions exceed ${formatAutoresearchSelfHostingPercent(artifacts.contract.applicability.maxNonCriticalTransferRegressionPercent)}: ${nonCriticalTransferRegressions
            .filter((entry) => !entry.withinBudget)
            .map(
              (entry) =>
                `${JSON.stringify(entry.suiteId)}=${formatAutoresearchSelfHostingPercent(entry.regressionPercent)}`,
            )
            .join(", ")}.`,
        ]
      : []),
  ]);

  const variantBlockers = uniqueSortedEntries([
    ...(!variantTargetProfileDeclared
      ? [
          "Variant classification requires applicability.variantTargetProfile to be declared before the campaign begins.",
        ]
      : []),
    ...(!variantImprovementObserved
      ? [
          "Variant classification requires explicit improvement evidence for the declared target profile; sub-threshold primary-metric improvement alone is not enough.",
        ]
      : []),
  ]);

  const defaultPromotionEligible =
    rejectReasons.length === 0 && defaultPromotionBlockers.length === 0;
  const variantEligible =
    rejectReasons.length === 0 && variantBlockers.length === 0 && !defaultPromotionEligible;
  const outcome: AutoresearchSelfHostingApplicabilityOutcome = defaultPromotionEligible
    ? "default_promotion_candidate"
    : variantEligible
      ? "variant_candidate"
      : "reject";
  const blockingReasons =
    outcome === "default_promotion_candidate"
      ? []
      : outcome === "variant_candidate"
        ? defaultPromotionBlockers
        : uniqueSortedEntries([...rejectReasons, ...defaultPromotionBlockers, ...variantBlockers]);

  return {
    action: "classify_applicability",
    campaignId: artifacts.contract.campaignId,
    executionModel: artifacts.contract.controller.executionModel,
    controllerCwd: artifacts.contract.controller.controllerCwd,
    controllerRepoRoot,
    candidateCwd: candidate.worktreePath,
    outcome,
    variantTargetProfile: artifacts.contract.applicability.variantTargetProfile,
    scope,
    primaryMetric: {
      name: artifacts.contract.applicability.primaryMetric.name,
      direction: artifacts.contract.applicability.primaryMetric.direction,
      baseline: primaryMetricBaseline,
      candidate: primaryMetricCandidate,
      improvementPercent: primaryMetricImprovementPercent,
      improved: primaryMetricImproved,
      meetsDefaultPromotionThreshold: primaryMetricMeetsDefaultPromotionThreshold,
    },
    suiteSummary: {
      declaredSuiteIds: [...declaredSuiteIds],
      reportedSuiteIds,
      passedSuiteIds: passedSuiteIds.sort(),
      failedSuiteIds: failedSuiteIds.sort(),
      failedNonCriticalSuiteIds: failedNonCriticalSuiteIds.sort(),
      missingSuiteIds,
      unexpectedSuiteIds,
      criticalFailureSuiteIds: criticalFailureSuiteIds.sort(),
      holdoutCriticalFailureSuiteIds: holdoutCriticalFailureSuiteIds.sort(),
      transferCriticalFailureSuiteIds: transferCriticalFailureSuiteIds.sort(),
      passedTransferSuiteIds: passedTransferSuiteIds.sort(),
      passedTransferCoverageKinds: Array.from(passedTransferCoverageKinds).sort(),
      minimumDefaultPromotionTransferSuites:
        artifacts.contract.applicability.minimumDefaultPromotionTransferScope.minimumSuites,
      missingDefaultPromotionCoverageKinds,
      nonCriticalTransferRegressions: nonCriticalTransferRegressions.sort((left, right) =>
        left.suiteId.localeCompare(right.suiteId),
      ),
    },
    gateStatus: {
      variantTargetProfileDeclared,
      variantImprovementObserved,
      primaryMetricImproved,
      primaryMetricMeetsDefaultPromotionThreshold,
      minimumTransferCoverageSatisfied,
      nonCriticalTransferRegressionWithinBudget,
      criticalFailuresWithinBudget,
      holdoutCriticalFailuresWithinBudget,
      transferCriticalFailuresWithinBudget,
    },
    rejectReasons,
    variantBlockers,
    defaultPromotionBlockers,
    blockingReasons,
    nextStep:
      outcome === "default_promotion_candidate"
        ? "Applicability gates produced default_promotion_candidate; keep promotion external and let SH-5 materialize the explicit promotion/rollback record before any controller rotation."
        : outcome === "variant_candidate"
          ? `Applicability gates produced variant_candidate for ${JSON.stringify(artifacts.contract.applicability.variantTargetProfile?.id)}; keep the win explicit and non-default until a later slice names the variant surface truthfully.`
          : "Applicability gates rejected the candidate; keep the controller unchanged and inspect blockingReasons before retrying.",
  };
}

export function prepareAutoresearchSelfHostingPromotionRecord(
  input: PrepareAutoresearchSelfHostingPromotionRecordInput,
): PrepareAutoresearchSelfHostingPromotionRecordResult {
  const artifacts = loadAutoresearchSelfHostingArtifacts(input.cwd);
  const controllerRepoRoot = resolveGitTopLevel(artifacts.cwd);
  const candidate = assertAutoresearchSelfHostingCandidateWorktreeRegistered(
    controllerRepoRoot,
    artifacts.contract,
  );
  const scope = assertAutoresearchSelfHostingCandidateScope(input.cwd);
  assertAutoresearchSelfHostingPromotionClassification(
    input.classification,
    artifacts.contract,
    candidate.worktreePath,
  );

  const requiredApprovals = [...artifacts.contract.promotion.requiredApprovals];
  const approvedBy = normalizeAutoresearchSelfHostingPromotionApprovals(
    input.approvedBy,
    "approvedBy",
  );
  const missingApprovals = requiredApprovals.filter((approval) => !approvedBy.includes(approval));
  const status = input.status ?? (missingApprovals.length === 0 ? "approved" : "planned");
  if (status !== "planned" && missingApprovals.length > 0) {
    throw new AutoresearchSelfHostingIsolationError(
      `Cannot report self-hosting promotion status ${JSON.stringify(status)} while required approvals are missing: ${formatAutoresearchSelfHostingEntries(missingApprovals)}.`,
    );
  }

  const promotionRecordPath = resolveAutoresearchSelfHostingPromotionRecordPath(
    artifacts.cwd,
    artifacts.contract.promotion.promotionRecordPath,
  );
  const record: AutoresearchSelfHostingPromotionRecordV1 = {
    type: AUTORESEARCH_SELF_HOSTING_PROMOTION_RECORD_KIND,
    version: AUTORESEARCH_SELF_HOSTING_VERSION,
    campaignId: artifacts.contract.campaignId,
    approvedBy,
    approvedAt:
      status === "planned"
        ? null
        : (normalizeAutoresearchSelfHostingTimestamp(input.approvedAt, "approvedAt") ?? Date.now()),
    previousControllerRef: artifacts.contract.controller.ref,
    promotedCandidateRef:
      normalizeOptionalAutoresearchSelfHostingString(
        input.promotedCandidateRef,
        "promotedCandidateRef",
      ) ?? resolveGitCommit(candidate.worktreePath, "HEAD", "HEAD"),
    evaluatorManifestHash: artifacts.evaluatorLock.manifestHash,
    evidenceRefs: normalizeAutoresearchSelfHostingEvidenceRefs(input.evidenceRefs, "evidenceRefs"),
    status,
    rollbackControllerRef: artifacts.contract.promotion.rollbackControllerRef,
    rollbackReason: null,
    rolledBackAt: null,
  };
  validateAutoresearchSelfHostingPromotionRecordState(record, promotionRecordPath);
  validateAutoresearchSelfHostingPromotionRecordPair(
    artifacts.contract,
    artifacts.evaluatorLock,
    record,
  );

  if (input.apply) {
    writeAutoresearchSelfHostingPromotionRecordFile(promotionRecordPath, record);
  }

  const promotionReady = status === "approved" || status === "rotated";
  return {
    action: "prepare_promotion_record",
    mode: input.apply ? "apply" : "plan",
    campaignId: artifacts.contract.campaignId,
    executionModel: artifacts.contract.controller.executionModel,
    controllerCwd: artifacts.contract.controller.controllerCwd,
    candidateCwd: candidate.worktreePath,
    promotionRecordPath,
    scope,
    classificationOutcome: input.classification.outcome,
    requiredApprovals,
    missingApprovals,
    promotionReady,
    record,
    nextStep:
      status === "planned"
        ? `Promotion stays planned until external approvals are present: missing ${formatAutoresearchSelfHostingEntries(missingApprovals)}.`
        : status === "approved"
          ? "Promotion readiness is now explicit; controller rotation still remains an external act above the package runtime."
          : status === "rotated"
            ? "Controller rotation has been recorded; run post-promotion verification and record rollback explicitly if regressions appear."
            : "Promotion record has been superseded; keep promotion authority external and avoid package-local self-promotion.",
  };
}

export function recordAutoresearchSelfHostingRollback(
  input: RecordAutoresearchSelfHostingRollbackInput,
): RecordAutoresearchSelfHostingRollbackResult {
  const artifacts = loadAutoresearchSelfHostingArtifacts(input.cwd);
  const current = loadAutoresearchSelfHostingPromotionRecord(input.cwd);
  if (current.status !== "rotated") {
    throw new AutoresearchSelfHostingIsolationError(
      `Cannot record self-hosting rollback while promotion record status is ${JSON.stringify(current.status)}; only a rotated controller can be rolled back.`,
    );
  }

  const promotionRecordPath = resolveAutoresearchSelfHostingPromotionRecordPath(
    artifacts.cwd,
    artifacts.contract.promotion.promotionRecordPath,
  );
  const record: AutoresearchSelfHostingPromotionRecordV1 = {
    ...current,
    evidenceRefs: uniqueSortedEntries([
      ...current.evidenceRefs,
      ...normalizeAutoresearchSelfHostingEvidenceRefs(input.evidenceRefs, "evidenceRefs"),
    ]),
    status: "rolled_back",
    rollbackReason: readString(input.rollbackReason, "rollbackReason"),
    rolledBackAt:
      normalizeAutoresearchSelfHostingTimestamp(input.rolledBackAt, "rolledBackAt") ?? Date.now(),
  };
  validateAutoresearchSelfHostingPromotionRecordState(record, promotionRecordPath);

  if (input.apply) {
    writeAutoresearchSelfHostingPromotionRecordFile(promotionRecordPath, record);
  }

  return {
    action: "record_promotion_rollback",
    mode: input.apply ? "apply" : "plan",
    campaignId: current.campaignId,
    executionModel: artifacts.contract.controller.executionModel,
    controllerCwd: artifacts.contract.controller.controllerCwd,
    candidateCwd: artifacts.contract.candidate.worktreePath,
    promotionRecordPath,
    previousRecord: current,
    record,
    nextStep: `Rollback is now explicit; restore controller ${JSON.stringify(record.rollbackControllerRef)} above the package and rerun post-promotion verification against the restored controller.`,
  };
}

function normalizeAutoresearchSelfHostingApplicabilitySuiteOutcomes(
  value: unknown,
): AutoresearchSelfHostingApplicabilitySuiteOutcome[] {
  if (!Array.isArray(value)) {
    throw new AutoresearchSelfHostingValidationError(
      "suiteOutcomes must be an array of applicability suite outcomes",
    );
  }
  const normalized = value.map((entry, index) => {
    const raw = readObject(entry, `suiteOutcomes[${index}]`);
    return {
      suiteId: readId(raw.suiteId, `suiteOutcomes[${index}].suiteId`),
      passed: readBoolean(raw.passed, `suiteOutcomes[${index}].passed`),
      regressionPercent:
        raw.regressionPercent === undefined
          ? undefined
          : readNonNegativeNumber(
              raw.regressionPercent,
              `suiteOutcomes[${index}].regressionPercent`,
            ),
    } satisfies AutoresearchSelfHostingApplicabilitySuiteOutcome;
  });
  ensureUnique(
    normalized.map((entry) => entry.suiteId),
    "suiteOutcomes suite ids",
  );
  return normalized;
}

function readFiniteAutoresearchSelfHostingNumber(value: unknown, label: string): number {
  if (typeof value !== "number" || !Number.isFinite(value)) {
    throw new AutoresearchSelfHostingValidationError(`${label} must be a finite number`);
  }
  return value;
}

function computeAutoresearchSelfHostingMetricImprovementPercent(
  direction: AutoresearchSelfHostingMetricDirection,
  baseline: number,
  candidate: number,
): number {
  const favorableDelta = direction === "lower" ? baseline - candidate : candidate - baseline;
  if (baseline === 0) {
    if (favorableDelta === 0) {
      return 0;
    }
    return favorableDelta > 0 ? Number.POSITIVE_INFINITY : Number.NEGATIVE_INFINITY;
  }
  return (favorableDelta / Math.abs(baseline)) * 100;
}

function assertAutoresearchSelfHostingPromotionClassification(
  classification: AutoresearchSelfHostingApplicabilityClassification,
  contract: AutoresearchSelfHostingContractV1,
  candidateCwd: string,
): void {
  if (classification.campaignId !== contract.campaignId) {
    throw new AutoresearchSelfHostingIsolationError(
      `Self-hosting applicability classification campaignId ${JSON.stringify(classification.campaignId)} does not match contract campaignId ${JSON.stringify(contract.campaignId)}.`,
    );
  }
  if (
    path.resolve(classification.controllerCwd) !== path.resolve(contract.controller.controllerCwd)
  ) {
    throw new AutoresearchSelfHostingIsolationError(
      `Self-hosting applicability classification controllerCwd ${JSON.stringify(classification.controllerCwd)} does not match contract controllerCwd ${JSON.stringify(contract.controller.controllerCwd)}.`,
    );
  }
  if (path.resolve(classification.candidateCwd) !== path.resolve(candidateCwd)) {
    throw new AutoresearchSelfHostingIsolationError(
      `Self-hosting applicability classification candidateCwd ${JSON.stringify(classification.candidateCwd)} does not match candidate worktree ${JSON.stringify(candidateCwd)}.`,
    );
  }
  if (classification.outcome !== "default_promotion_candidate") {
    throw new AutoresearchSelfHostingIsolationError(
      `Self-hosting promotion record requires a default_promotion_candidate classification, got ${JSON.stringify(classification.outcome)}.`,
    );
  }
  if (
    classification.blockingReasons.length > 0 ||
    classification.rejectReasons.length > 0 ||
    classification.defaultPromotionBlockers.length > 0
  ) {
    throw new AutoresearchSelfHostingIsolationError(
      `Self-hosting promotion record cannot be prepared while applicability classification still reports blockers: ${formatAutoresearchSelfHostingEntries(classification.blockingReasons)}.`,
    );
  }
}

function validateAutoresearchSelfHostingPromotionRecordState(
  record: AutoresearchSelfHostingPromotionRecordV1,
  label: string,
): void {
  if ((record.rollbackReason === null) !== (record.rolledBackAt === null)) {
    throw new AutoresearchSelfHostingValidationError(
      `${label}:rollbackReason and rolledBackAt must either both be null or both be populated`,
    );
  }
  if (record.status === "planned") {
    if (record.approvedAt !== null) {
      throw new AutoresearchSelfHostingValidationError(
        `${label}:approvedAt must stay null while status is "planned"`,
      );
    }
    if (record.rollbackReason !== null || record.rolledBackAt !== null) {
      throw new AutoresearchSelfHostingValidationError(
        `${label}:planned promotion record must not include rollback fields`,
      );
    }
    return;
  }
  if (record.approvedBy.length === 0) {
    throw new AutoresearchSelfHostingValidationError(
      `${label}:approvedBy must contain at least one approval when status is ${JSON.stringify(record.status)}`,
    );
  }
  if (record.approvedAt === null) {
    throw new AutoresearchSelfHostingValidationError(
      `${label}:approvedAt must be populated when status is ${JSON.stringify(record.status)}`,
    );
  }
  if (record.promotedCandidateRef === null) {
    throw new AutoresearchSelfHostingValidationError(
      `${label}:promotedCandidateRef must be populated when status is ${JSON.stringify(record.status)}`,
    );
  }
  if (record.status === "rolled_back") {
    if (record.rollbackReason === null || record.rolledBackAt === null) {
      throw new AutoresearchSelfHostingValidationError(
        `${label}:rolled_back promotion record must include rollbackReason and rolledBackAt`,
      );
    }
    return;
  }
  if (record.rollbackReason !== null || record.rolledBackAt !== null) {
    throw new AutoresearchSelfHostingValidationError(
      `${label}:${record.status} promotion record must not include rollback fields`,
    );
  }
}

function normalizeAutoresearchSelfHostingPromotionApprovals(
  approvals: readonly AutoresearchSelfHostingPromotionApproval[] | undefined,
  label: string,
): AutoresearchSelfHostingPromotionApproval[] {
  if (!approvals) {
    return [];
  }
  const normalized = approvals.map((entry, index) =>
    readLiteralUnion(entry, `${label}[${index}]`, PROMOTION_APPROVALS),
  );
  ensureUnique(normalized, label);
  return normalized;
}

function normalizeAutoresearchSelfHostingEvidenceRefs(
  evidenceRefs: readonly string[] | undefined,
  label: string,
): string[] {
  if (!evidenceRefs) {
    return [];
  }
  const normalized = evidenceRefs.map((entry, index) => readString(entry, `${label}[${index}]`));
  ensureUnique(normalized, label);
  return normalized;
}

function normalizeAutoresearchSelfHostingTimestamp(
  value: number | undefined,
  label: string,
): number | null {
  if (value === undefined) {
    return null;
  }
  return readNonNegativeNumber(value, label);
}

function normalizeOptionalAutoresearchSelfHostingString(
  value: string | undefined,
  label: string,
): string | null {
  if (value === undefined) {
    return null;
  }
  return readString(value, label);
}

function describeAutoresearchSelfHostingScopeProblems(
  scope: AutoresearchSelfHostingCandidateScopeStatus,
): string[] {
  const problems: string[] = [];
  if (scope.offLimitsPaths.length > 0) {
    problems.push(
      `Candidate worktree mutated off-limits paths: ${formatAutoresearchSelfHostingEntries(scope.offLimitsPaths)}`,
    );
  }
  if (scope.outOfScopePaths.length > 0) {
    problems.push(
      `Candidate worktree mutated out-of-scope paths: ${formatAutoresearchSelfHostingEntries(scope.outOfScopePaths)}`,
    );
  }
  return problems;
}

function formatAutoresearchSelfHostingPercent(value: number): string {
  if (!Number.isFinite(value)) {
    return value > 0 ? "Infinity%" : "-Infinity%";
  }
  return `${value.toFixed(2)}%`;
}

function formatAutoresearchSelfHostingEntries(entries: readonly string[]): string {
  if (entries.length === 0) {
    return "(none)";
  }
  return entries.map((entry) => JSON.stringify(entry)).join(", ");
}

function uniqueSortedEntries(entries: readonly string[]): string[] {
  return [...new Set(entries)].sort((left, right) => left.localeCompare(right));
}

function verifyAutoresearchSelfHostingEvaluatorSnapshot(
  artifacts: LoadedAutoresearchSelfHostingArtifacts,
): VerifiedAutoresearchSelfHostingEvaluatorSnapshot {
  const snapshotRootPath = resolveAutoresearchSelfHostingSnapshotRootPath(
    artifacts.contract.controller.controllerCwd,
    artifacts.evaluatorLock.snapshotRootPath,
  );
  const manifestPath = resolveAutoresearchSelfHostingManifestPath(
    artifacts.contract.controller.controllerCwd,
    snapshotRootPath,
    artifacts.evaluatorLock.manifestPath,
  );
  const manifestHash = hashFileSha256(manifestPath);
  if (manifestHash !== artifacts.evaluatorLock.manifestHash) {
    throw new AutoresearchSelfHostingIsolationError(
      `Locked evaluator manifest drift detected at ${JSON.stringify(manifestPath)}: expected sha256 ${artifacts.evaluatorLock.manifestHash}, got ${manifestHash}.`,
    );
  }

  const evaluatorFiles = new Map<string, VerifiedAutoresearchSelfHostingEvaluatorFile>();
  for (const entry of artifacts.evaluatorLock.evaluatorFiles) {
    const absolutePath = resolveAutoresearchSelfHostingSnapshotFilePath(
      snapshotRootPath,
      entry.path,
      `Locked evaluator file ${JSON.stringify(entry.path)}`,
    );
    const actualHash = hashFileSha256(absolutePath);
    if (actualHash !== entry.sha256) {
      throw new AutoresearchSelfHostingIsolationError(
        `Locked evaluator file drift detected for ${JSON.stringify(entry.path)} at ${JSON.stringify(absolutePath)}: expected sha256 ${entry.sha256}, got ${actualHash}.`,
      );
    }
    evaluatorFiles.set(entry.path, {
      relativePath: entry.path,
      absolutePath,
      sha256: entry.sha256,
    });
  }

  return {
    snapshotRootPath,
    manifestPath,
    evaluatorFiles,
  };
}

function resolveAutoresearchSelfHostingSnapshotRootPath(
  controllerCwd: string,
  snapshotRootPath: string,
): string {
  const resolvedPath = resolveArtifactPath(controllerCwd, snapshotRootPath);
  if (!existsSync(resolvedPath)) {
    throw new AutoresearchSelfHostingIsolationError(
      `Locked evaluator snapshot root ${JSON.stringify(resolvedPath)} does not exist.`,
    );
  }
  return realpathSync(resolvedPath);
}

function resolveAutoresearchSelfHostingManifestPath(
  controllerCwd: string,
  snapshotRootPath: string,
  manifestPath: string,
): string {
  const resolvedPath = resolveArtifactPath(controllerCwd, manifestPath);
  return assertPathWithinRoot(
    resolvedPath,
    snapshotRootPath,
    `Locked evaluator manifest ${JSON.stringify(manifestPath)}`,
  );
}

function resolveAutoresearchSelfHostingSnapshotFilePath(
  snapshotRootPath: string,
  relativePath: string,
  label: string,
): string {
  return assertPathWithinRoot(
    path.resolve(snapshotRootPath, relativePath),
    snapshotRootPath,
    label,
  );
}

function expandAutoresearchSelfHostingEvaluatorArgv(
  argv: readonly string[],
  context: {
    controllerCwd: string;
    candidateCwd: string;
    snapshotRootPath: string;
    manifestPath: string;
    suiteId: string;
  },
): string[] {
  return argv.map((entry, index) =>
    expandAutoresearchSelfHostingEvaluatorArg(
      entry,
      `${JSON.stringify(context.suiteId)} argv[${index}]`,
      context,
    ),
  );
}

function expandAutoresearchSelfHostingEvaluatorArg(
  value: string,
  label: string,
  context: {
    controllerCwd: string;
    candidateCwd: string;
    snapshotRootPath: string;
    manifestPath: string;
  },
): string {
  const replacements = new Map<string, string>([
    ["$CANDIDATE", context.candidateCwd],
    ["$SNAPSHOT_ROOT", context.snapshotRootPath],
    ["$MANIFEST", context.manifestPath],
    ["$CONTROLLER_CWD", context.controllerCwd],
  ]);
  const replacement = replacements.get(value);
  if (replacement) {
    return replacement;
  }
  if (value.includes("$")) {
    throw new AutoresearchSelfHostingIsolationError(
      `Self-hosting evaluator ${label} uses unsupported shell-style placeholder ${JSON.stringify(value)}; evaluator argv must stay explicit and snapshot-owned.`,
    );
  }
  return value;
}

function buildAutoresearchSelfHostingEvaluatorCommand(
  entrypointKind: AutoresearchSelfHostingEvaluatorEntrypointKind,
  entrypointPath: string,
  argv: readonly string[],
): string[] {
  if (entrypointKind === "snapshot_node_module" || isNodeLikeEntrypoint(entrypointPath)) {
    return [process.execPath, entrypointPath, ...argv];
  }
  return [entrypointPath, ...argv];
}

function assertPathWithinRoot(candidatePath: string, rootPath: string, label: string): string {
  if (!existsSync(candidatePath)) {
    throw new AutoresearchSelfHostingIsolationError(
      `${label} ${JSON.stringify(candidatePath)} does not exist.`,
    );
  }
  const resolvedRoot = realpathSync(rootPath);
  const resolvedCandidate = realpathSync(candidatePath);
  if (!isPathWithinRoot(resolvedRoot, resolvedCandidate)) {
    throw new AutoresearchSelfHostingIsolationError(
      `${label} ${JSON.stringify(resolvedCandidate)} resolves outside snapshot root ${JSON.stringify(resolvedRoot)}.`,
    );
  }
  return resolvedCandidate;
}

function isPathWithinRoot(rootPath: string, candidatePath: string): boolean {
  const relativePath = path.relative(rootPath, candidatePath);
  return (
    relativePath.length === 0 || (!relativePath.startsWith("..") && !path.isAbsolute(relativePath))
  );
}

function hashFileSha256(filePath: string): string {
  return createHash("sha256").update(readFileSync(filePath)).digest("hex");
}

function writeAutoresearchSelfHostingPromotionRecordFile(
  filePath: string,
  record: AutoresearchSelfHostingPromotionRecordV1,
): void {
  mkdirSync(path.dirname(filePath), { recursive: true });
  writeFileSync(filePath, `${JSON.stringify(record, null, 2)}\n`, "utf8");
}

function isNodeLikeEntrypoint(entrypointPath: string): boolean {
  return [".js", ".mjs", ".cjs", ".ts", ".mts", ".cts"].includes(
    path.extname(entrypointPath).toLowerCase(),
  );
}

function loadJsonObject(filePath: string): Record<string, unknown> {
  let raw: string;
  try {
    raw = readFileSync(filePath, "utf8");
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    throw new AutoresearchSelfHostingValidationError(
      `Unable to read self-hosting artifact ${filePath}: ${message}`,
    );
  }

  let parsed: unknown;
  try {
    parsed = JSON.parse(raw) as unknown;
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    throw new AutoresearchSelfHostingValidationError(
      `Self-hosting artifact ${filePath} must contain valid JSON: ${message}`,
    );
  }

  return readObject(parsed, filePath);
}

function resolveArtifactPath(cwd: string, artifactPath: string): string {
  return isAbsolutePath(artifactPath)
    ? path.normalize(artifactPath)
    : path.resolve(cwd, artifactPath);
}

function resolveGitTopLevel(cwd: string): string {
  return runGitCommand(cwd, ["rev-parse", "--show-toplevel"]);
}

function resolveGitCommit(cwd: string, ref: string, label: string): string {
  try {
    return runGitCommand(cwd, ["rev-parse", "--verify", label]);
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    throw new AutoresearchSelfHostingIsolationError(
      `Unable to resolve git ref ${JSON.stringify(ref)} in ${cwd}: ${message}`,
    );
  }
}

function readCurrentGitBranch(cwd: string): string | null {
  const branch = runGitCommand(cwd, ["branch", "--show-current"]);
  return branch.length === 0 ? null : branch;
}

function inspectAutoresearchSelfHostingCandidateWorktreeState(
  controllerRepoRoot: string,
  worktreePath: string,
  branchName: string,
  baseRef: string,
  baseCommit: string,
): AutoresearchSelfHostingCandidateWorktreeState {
  if (!existsSync(worktreePath)) {
    return {
      worktreePath,
      branchName,
      baseRef,
      baseCommit,
      exists: false,
      registered: false,
      branch: null,
      head: null,
      commonDir: null,
      commonDirMatchesController: false,
    };
  }

  const controllerCommonDir = resolveGitPathOutput(
    controllerRepoRoot,
    runGitCommand(controllerRepoRoot, ["rev-parse", "--git-common-dir"]),
  );

  try {
    const candidateTopLevel = runGitCommand(worktreePath, ["rev-parse", "--show-toplevel"]);
    const candidateCommonDir = resolveGitPathOutput(
      worktreePath,
      runGitCommand(worktreePath, ["rev-parse", "--git-common-dir"]),
    );
    const candidateBranch = readCurrentGitBranch(worktreePath);
    const candidateHead = runGitCommand(worktreePath, ["rev-parse", "HEAD"]);
    return {
      worktreePath,
      branchName,
      baseRef,
      baseCommit,
      exists: true,
      registered:
        path.resolve(candidateTopLevel) === path.resolve(worktreePath) &&
        candidateCommonDir === controllerCommonDir,
      branch: candidateBranch,
      head: candidateHead,
      commonDir: candidateCommonDir,
      commonDirMatchesController: candidateCommonDir === controllerCommonDir,
    };
  } catch {
    return {
      worktreePath,
      branchName,
      baseRef,
      baseCommit,
      exists: true,
      registered: false,
      branch: null,
      head: null,
      commonDir: null,
      commonDirMatchesController: false,
    };
  }
}

function assertAutoresearchSelfHostingCandidateWorktreeRegistered(
  controllerRepoRoot: string,
  contract: AutoresearchSelfHostingContractV1,
): AutoresearchSelfHostingCandidateWorktreeState {
  const candidate = inspectAutoresearchSelfHostingCandidateWorktreeState(
    controllerRepoRoot,
    contract.candidate.worktreePath,
    contract.candidate.branchName,
    contract.candidate.baseRef,
    resolveGitCommit(
      controllerRepoRoot,
      contract.candidate.baseRef,
      `${contract.candidate.baseRef}^{commit}`,
    ),
  );
  if (!candidate.registered) {
    throw new AutoresearchSelfHostingIsolationError(
      `Candidate worktree ${JSON.stringify(contract.candidate.worktreePath)} is not registered for controller repo ${JSON.stringify(controllerRepoRoot)}.`,
    );
  }
  if (candidate.branch !== contract.candidate.branchName) {
    throw new AutoresearchSelfHostingIsolationError(
      `Candidate worktree ${JSON.stringify(contract.candidate.worktreePath)} is on branch ${JSON.stringify(candidate.branch)}, expected ${JSON.stringify(contract.candidate.branchName)}.`,
    );
  }
  return candidate;
}

function resolveGitPathOutput(cwd: string, raw: string): string {
  return path.isAbsolute(raw) ? path.normalize(raw) : path.resolve(cwd, raw);
}

function planCommandSummary(command: string[], cwd: string): AutoresearchSelfHostingCommandSummary {
  return {
    command: [...command],
    cwd,
    exitCode: 0,
    stdout: "",
    stderr: "",
    timedOut: false,
    signal: null,
  };
}

function runCommandSummary(
  executable: string,
  args: string[],
  cwd: string,
  label: string,
  options: { env?: Record<string, string | undefined>; timeoutMs?: number } = {},
): AutoresearchSelfHostingCommandSummary {
  const env = {
    ...process.env,
    ...options.env,
  };
  const result = spawnSync(executable, args, {
    cwd,
    env,
    encoding: "utf8",
    timeout: options.timeoutMs,
  });

  if (result.error && result.error.name !== "TimeoutError") {
    throw new AutoresearchSelfHostingIsolationError(
      `${label} failed to start ${JSON.stringify([executable, ...args])}: ${result.error.message}`,
    );
  }

  return {
    command: [executable, ...args],
    cwd,
    exitCode: result.status,
    stdout: result.stdout ?? "",
    stderr: result.stderr ?? "",
    timedOut: result.error?.name === "TimeoutError",
    signal: result.signal ?? null,
  };
}

function runGitCommand(cwd: string, args: string[], options: { trim?: boolean } = {}): string {
  const summary = runCommandSummary("git", args, cwd, `git:${args[0] ?? "command"}`);
  if (summary.exitCode !== 0) {
    throw new AutoresearchSelfHostingIsolationError(
      `Git command failed in ${cwd}: ${JSON.stringify(summary.command)} => ${summary.stderr || summary.stdout}`,
    );
  }
  return options.trim === false ? summary.stdout : summary.stdout.trim();
}

function listGitStatusPaths(cwd: string): string[] {
  const raw = runGitCommand(cwd, ["status", "--porcelain=v1", "--untracked-files=all"], {
    trim: false,
  });
  const paths = raw
    .split(/\r?\n/u)
    .flatMap((line) => extractPorcelainPaths(line))
    .map((entry) => normalizeSelfHostingRelativePath(entry))
    .filter((entry) => entry.length > 0);
  return [...new Set(paths)].sort();
}

function extractPorcelainPaths(line: string): string[] {
  if (line.trim().length === 0) {
    return [];
  }
  const pathPortion = line.slice(3).trim();
  if (pathPortion.length === 0) {
    return [];
  }
  if (pathPortion.includes(" -> ")) {
    return pathPortion.split(" -> ").map((entry) => entry.trim());
  }
  return [pathPortion];
}

function normalizeSelfHostingRelativePath(entry: string): string {
  return entry.replace(/\\/gu, "/").replace(/^\.\//u, "");
}

function matchesAnyPathSpec(candidatePath: string, specs: readonly string[]): boolean {
  return specs.some((spec) => matchesPathSpec(candidatePath, spec));
}

function matchesPathSpec(candidatePath: string, spec: string): boolean {
  const normalizedPath = normalizeSelfHostingRelativePath(candidatePath);
  const normalizedSpec = normalizeSelfHostingRelativePath(spec);
  const pattern = normalizedSpec
    .replace(/[|\\{}()[\]^$+?.]/gu, "\\$&")
    .replace(/\*\*/gu, "::DOUBLE_STAR::")
    .replace(/\*/gu, "[^/]*")
    .replace(/::DOUBLE_STAR::/gu, ".*");
  return new RegExp(`^${pattern}$`, "u").test(normalizedPath);
}

function groupSuiteIdsByClass(
  suites: readonly AutoresearchSelfHostingEvaluatorSuiteV1[],
): Record<AutoresearchSelfHostingEvaluatorSuiteClass, string[]> {
  return {
    dev: suites.filter((suite) => suite.class === "dev").map((suite) => suite.id),
    holdout: suites.filter((suite) => suite.class === "holdout").map((suite) => suite.id),
    transfer: suites.filter((suite) => suite.class === "transfer").map((suite) => suite.id),
  };
}

function assertSameSet(
  expected: readonly string[],
  actual: readonly string[],
  expectedLabel: string,
  actualLabel: string,
): void {
  const missing = expected.filter((entry) => !actual.includes(entry));
  const extra = actual.filter((entry) => !expected.includes(entry));
  if (missing.length === 0 && extra.length === 0) {
    return;
  }
  const parts: string[] = [];
  if (missing.length > 0) {
    parts.push(`missing ${missing.map((entry) => JSON.stringify(entry)).join(", ")}`);
  }
  if (extra.length > 0) {
    parts.push(`unexpected ${extra.map((entry) => JSON.stringify(entry)).join(", ")}`);
  }
  throw new AutoresearchSelfHostingValidationError(
    `${expectedLabel} do not match ${actualLabel}: ${parts.join("; ")}`,
  );
}

function ensureContainsAll(
  entries: readonly string[],
  requiredEntries: readonly string[],
  label: string,
): void {
  const missing = requiredEntries.filter((entry) => !entries.includes(entry));
  if (missing.length === 0) {
    return;
  }
  throw new AutoresearchSelfHostingValidationError(
    `${label} must include ${missing.map((entry) => JSON.stringify(entry)).join(", ")}`,
  );
}

function ensureNoExactOverlap(
  allowedPaths: readonly string[],
  offLimits: readonly string[],
  label: string,
): void {
  const overlap = allowedPaths.filter((entry) => offLimits.includes(entry));
  if (overlap.length === 0) {
    return;
  }
  throw new AutoresearchSelfHostingValidationError(
    `${label}.allowedPaths and ${label}.offLimits must not repeat the same exact path specs: ${overlap
      .map((entry) => JSON.stringify(entry))
      .join(", ")}`,
  );
}

function ensureDisjointSuiteGroups(
  groups: ReadonlyArray<readonly [string, readonly string[]]>,
  label: string,
): void {
  const seen = new Map<string, string>();
  for (const [groupName, entries] of groups) {
    for (const entry of entries) {
      const previousGroup = seen.get(entry);
      if (previousGroup) {
        throw new AutoresearchSelfHostingValidationError(
          `${label}.${groupName} repeats suite id ${JSON.stringify(entry)} already declared in ${label}.${previousGroup}`,
        );
      }
      seen.set(entry, groupName);
    }
  }
}

function ensureUnique(entries: readonly string[], label: string): void {
  const seen = new Set<string>();
  for (const entry of entries) {
    if (seen.has(entry)) {
      throw new AutoresearchSelfHostingValidationError(
        `${label} must not contain duplicate entry ${JSON.stringify(entry)}`,
      );
    }
    seen.add(entry);
  }
}

function ensureNonEmpty<T>(entries: readonly T[], label: string): void {
  if (entries.length > 0) {
    return;
  }
  throw new AutoresearchSelfHostingValidationError(`${label} must contain at least one entry`);
}

function readObject(value: unknown, label: string): Record<string, unknown> {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    throw new AutoresearchSelfHostingValidationError(`${label} must be an object`);
  }
  return value as Record<string, unknown>;
}

function readNullableObject(value: unknown, label: string): Record<string, unknown> | null {
  if (value === null) {
    return null;
  }
  return readObject(value, label);
}

function readObjectArray(value: unknown, label: string): Array<Record<string, unknown>> {
  if (!Array.isArray(value)) {
    throw new AutoresearchSelfHostingValidationError(`${label} must be an array of objects`);
  }
  return value.map((entry, index) => readObject(entry, `${label}[${index}]`));
}

function readString(value: unknown, label: string): string {
  if (typeof value !== "string" || value.trim().length === 0) {
    throw new AutoresearchSelfHostingValidationError(`${label} must be a non-empty string`);
  }
  return value.trim();
}

function readNullableString(value: unknown, label: string): string | null {
  if (value === null) {
    return null;
  }
  return readString(value, label);
}

function readStringArray(value: unknown, label: string): string[] {
  if (!Array.isArray(value)) {
    throw new AutoresearchSelfHostingValidationError(`${label} must be an array of strings`);
  }
  return value.map((entry, index) => readString(entry, `${label}[${index}]`));
}

function readInteger(value: unknown, label: string): number {
  if (typeof value !== "number" || !Number.isInteger(value)) {
    throw new AutoresearchSelfHostingValidationError(`${label} must be an integer`);
  }
  return value;
}

function readMinimumInteger(value: unknown, label: string, minimum: number): number {
  const parsed = readInteger(value, label);
  if (parsed < minimum) {
    throw new AutoresearchSelfHostingValidationError(`${label} must be >= ${minimum}`);
  }
  return parsed;
}

function readBoolean(value: unknown, label: string): boolean {
  if (typeof value !== "boolean") {
    throw new AutoresearchSelfHostingValidationError(`${label} must be a boolean`);
  }
  return value;
}

function readFalse(value: unknown, label: string): false {
  if (value !== false) {
    throw new AutoresearchSelfHostingValidationError(`${label} must be false`);
  }
  return false;
}

function readZero(value: unknown, label: string): 0 {
  if (readInteger(value, label) !== 0) {
    throw new AutoresearchSelfHostingValidationError(`${label} must be 0`);
  }
  return 0;
}

function readNonNegativeNumber(value: unknown, label: string): number {
  if (typeof value !== "number" || !Number.isFinite(value) || value < 0) {
    throw new AutoresearchSelfHostingValidationError(`${label} must be a non-negative number`);
  }
  return value;
}

function readNullableNonNegativeNumber(value: unknown, label: string): number | null {
  if (value === null) {
    return null;
  }
  return readNonNegativeNumber(value, label);
}

function readLiteral<T extends string | number>(value: unknown, label: string, literal: T): T {
  if (value !== literal) {
    throw new AutoresearchSelfHostingValidationError(
      `${label} must be ${JSON.stringify(literal)}, got ${JSON.stringify(value)}`,
    );
  }
  return literal;
}

function readLiteralUnion<const T extends readonly string[]>(
  value: unknown,
  label: string,
  allowed: T,
): T[number] {
  const parsed = readString(value, label);
  if (!allowed.includes(parsed)) {
    throw new AutoresearchSelfHostingValidationError(
      `${label} must be one of ${allowed.map((entry) => JSON.stringify(entry)).join(", ")}`,
    );
  }
  return parsed as T[number];
}

function readLiteralUnionArray<const T extends readonly string[]>(
  value: unknown,
  label: string,
  allowed: T,
): Array<T[number]> {
  const parsed = readStringArray(value, label).map((entry, index) =>
    readLiteralUnion(entry, `${label}[${index}]`, allowed),
  );
  ensureUnique(parsed, label);
  return parsed;
}

function readId(value: unknown, label: string): string {
  const parsed = readString(value, label);
  if (/\s/u.test(parsed)) {
    throw new AutoresearchSelfHostingValidationError(`${label} must not contain whitespace`);
  }
  return parsed;
}

function readSha256(value: unknown, label: string): string {
  const parsed = readString(value, label);
  if (!SHA256_RE.test(parsed)) {
    throw new AutoresearchSelfHostingValidationError(
      `${label} must be a 64-character sha256 hex string`,
    );
  }
  return parsed.toLowerCase();
}

function readAbsolutePath(value: unknown, label: string): string {
  const parsed = readString(value, label);
  if (!isAbsolutePath(parsed)) {
    throw new AutoresearchSelfHostingValidationError(`${label} must be an absolute path`);
  }
  return path.normalize(parsed);
}

function readPathReference(value: unknown, label: string): string {
  const parsed = readString(value, label);
  ensureNoParentTraversal(parsed, label);
  return parsed;
}

function readRelativePathSpec(value: unknown, label: string): string {
  const parsed = readString(value, label);
  if (isAbsolutePath(parsed)) {
    throw new AutoresearchSelfHostingValidationError(`${label} must be a relative path`);
  }
  ensureNoParentTraversal(parsed, label);
  return parsed;
}

function readRelativePathSpecArray(value: unknown, label: string): string[] {
  const parsed = readStringArray(value, label).map((entry, index) =>
    readRelativePathSpec(entry, `${label}[${index}]`),
  );
  ensureUnique(parsed, label);
  return parsed;
}

function readRelativePathSafeIdArray(value: unknown, label: string): string[] {
  const parsed = readStringArray(value, label).map((entry, index) =>
    readId(entry, `${label}[${index}]`),
  );
  ensureUnique(parsed, label);
  return parsed;
}

function ensureNoParentTraversal(value: string, label: string): void {
  const segments = value.split(/[\\/]+/u).filter(Boolean);
  if (segments.includes("..")) {
    throw new AutoresearchSelfHostingValidationError(
      `${label} must not contain parent traversal segments`,
    );
  }
}

function isAbsolutePath(value: string): boolean {
  return path.isAbsolute(value) || WINDOWS_ABSOLUTE_PATH_RE.test(value);
}

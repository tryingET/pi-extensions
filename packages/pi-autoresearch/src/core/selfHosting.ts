import { readFileSync } from "node:fs";
import path from "node:path";

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

import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import os from "node:os";
import path from "node:path";
import test from "node:test";

import {
  AUTORESEARCH_SELF_HOSTING_CONTRACT_FILE,
  AUTORESEARCH_SELF_HOSTING_EVALUATOR_LOCK_FILE,
  type AutoresearchSelfHostingContractV1,
  type AutoresearchSelfHostingEvaluatorLockV1,
  AutoresearchSelfHostingValidationError,
  loadAutoresearchSelfHostingArtifacts,
  resolveAutoresearchSelfHostingEvaluatorLockPath,
  validateAutoresearchSelfHostingArtifactsPair,
  validateAutoresearchSelfHostingContract,
  validateAutoresearchSelfHostingEvaluatorLock,
} from "../src/core/selfHosting.ts";

async function withTempDir(fn: (cwd: string) => Promise<void> | void): Promise<void> {
  const cwd = mkdtempSync(path.join(os.tmpdir(), "pi-autoresearch-self-hosting-"));
  try {
    await fn(cwd);
  } finally {
    rmSync(cwd, { recursive: true, force: true });
  }
}

function sha256(value: string): string {
  return createHash("sha256").update(value).digest("hex");
}

function writeJson(target: string, payload: unknown): void {
  mkdirSync(path.dirname(target), { recursive: true });
  writeFileSync(target, `${JSON.stringify(payload, null, 2)}\n`, "utf8");
}

function createValidEvaluatorLock(): AutoresearchSelfHostingEvaluatorLockV1 {
  const devHash = sha256("dev-smoke");
  const holdoutHash = sha256("holdout-operator");
  const transferPackageHash = sha256("transfer-package");
  const transferOperatorHash = sha256("transfer-operator");

  return {
    type: "self_hosting_evaluator_lock",
    version: 1,
    campaignId: "self-hosting-wave-001",
    snapshotRootPath: "evaluator-snapshot",
    manifestPath: "evaluator-snapshot/manifest.json",
    manifestHash: sha256("manifest"),
    executionModel: "controller_subprocess_against_candidate",
    evaluatorFiles: [
      { path: "suites/dev-smoke.mjs", sha256: devHash },
      { path: "suites/holdout-operator.mjs", sha256: holdoutHash },
      { path: "suites/transfer-package.mjs", sha256: transferPackageHash },
      { path: "suites/transfer-operator.mjs", sha256: transferOperatorHash },
    ],
    suites: [
      {
        id: "dev-smoke",
        class: "dev",
        critical: true,
        coverageKind: "self_hosting_internal",
        entrypoint: {
          kind: "snapshot_node_module",
          path: "suites/dev-smoke.mjs",
          sha256: devHash,
        },
        subjectCwdMode: "candidate",
        argv: ["--candidate", "$CANDIDATE"],
      },
      {
        id: "holdout-operator",
        class: "holdout",
        critical: true,
        coverageKind: "operator_consumer",
        entrypoint: {
          kind: "snapshot_node_module",
          path: "suites/holdout-operator.mjs",
          sha256: holdoutHash,
        },
        subjectCwdMode: "candidate",
        argv: ["--candidate", "$CANDIDATE"],
      },
      {
        id: "transfer-package",
        class: "transfer",
        critical: true,
        coverageKind: "package_non_self_hosting",
        entrypoint: {
          kind: "snapshot_script",
          path: "suites/transfer-package.mjs",
          sha256: transferPackageHash,
        },
        subjectCwdMode: "candidate",
        argv: ["--candidate", "$CANDIDATE", "--mode", "package"],
      },
      {
        id: "transfer-operator",
        class: "transfer",
        critical: true,
        coverageKind: "operator_consumer",
        entrypoint: {
          kind: "snapshot_script",
          path: "suites/transfer-operator.mjs",
          sha256: transferOperatorHash,
        },
        subjectCwdMode: "candidate",
        argv: ["--candidate", "$CANDIDATE", "--mode", "operator"],
      },
    ],
  };
}

function createValidContract(cwd: string): AutoresearchSelfHostingContractV1 {
  return {
    type: "self_hosting_contract",
    version: 1,
    campaignId: "self-hosting-wave-001",
    controller: {
      mode: "stable_installed",
      ref: "pi-autoresearch@stable",
      controllerCwd: cwd,
      executionModel: "controller_subprocess_against_candidate",
    },
    candidate: {
      worktreePath: path.join(cwd, ".worktrees", "candidate-self-hosting-wave-001"),
      baseRef: "main",
      branchName: "autoresearch/self-hosting-wave-001",
      allowedPaths: [
        "packages/pi-autoresearch/src/**",
        "packages/pi-autoresearch/tests/**",
        "packages/pi-autoresearch/docs/project/**",
      ],
      offLimits: [
        "autoresearch.self-hosting.json",
        "autoresearch.self-hosting.evaluator.lock.json",
        "autoresearch.self-hosting.promotion.json",
        "evaluator-snapshot/**",
      ],
      onFailureDisposition: "preserve_for_review",
    },
    evaluator: {
      lockPath: path.join("artifacts", AUTORESEARCH_SELF_HOSTING_EVALUATOR_LOCK_FILE),
      manifestPath: "evaluator-snapshot/manifest.json",
      manifestHash: sha256("manifest"),
      snapshotRootPath: "evaluator-snapshot",
      criticalSuites: ["dev-smoke", "holdout-operator", "transfer-package", "transfer-operator"],
      devSuites: ["dev-smoke"],
      holdoutSuites: ["holdout-operator"],
      transferSuites: ["transfer-package", "transfer-operator"],
      candidateMayEditEvaluator: false,
    },
    applicability: {
      primaryMetric: {
        name: "median_latency_ms",
        direction: "lower",
        minImprovementForDefaultPromotionPercent: 5,
      },
      variantTargetProfile: null,
      maxCriticalSuiteFailures: 0,
      maxHoldoutCriticalFailures: 0,
      maxTransferCriticalFailures: 0,
      maxNonCriticalTransferRegressionPercent: 2,
      minimumDefaultPromotionTransferScope: {
        minimumSuites: 2,
        requiredCoverageKinds: ["package_non_self_hosting", "operator_consumer"],
      },
    },
    promotion: {
      packageMaySelfPromote: false,
      requiredApprovals: ["operator_review"],
      promotionRecordPath: "autoresearch.self-hosting.promotion.json",
      rollbackControllerRef: "pi-autoresearch@stable",
    },
  };
}

test("loadAutoresearchSelfHostingArtifacts loads a compatible contract and evaluator lock", async () => {
  await withTempDir((cwd) => {
    const contract = createValidContract(cwd);
    const evaluatorLock = createValidEvaluatorLock();

    writeJson(path.join(cwd, AUTORESEARCH_SELF_HOSTING_CONTRACT_FILE), contract);
    writeJson(
      resolveAutoresearchSelfHostingEvaluatorLockPath(cwd, contract.evaluator.lockPath),
      evaluatorLock,
    );

    const loaded = loadAutoresearchSelfHostingArtifacts(cwd);
    assert.equal(loaded.contract.campaignId, contract.campaignId);
    assert.equal(loaded.evaluatorLock.campaignId, evaluatorLock.campaignId);
    assert.equal(
      loaded.lockPath,
      path.join(cwd, "artifacts", AUTORESEARCH_SELF_HOSTING_EVALUATOR_LOCK_FILE),
    );
  });
});

test("validateAutoresearchSelfHostingContract rejects invalid scope, evaluator, applicability, and promotion shapes", () => {
  const cwd = path.join(os.tmpdir(), "self-hosting-contract-fixture");

  const invalidScope = createValidContract(cwd);
  invalidScope.candidate.allowedPaths = ["../packages/pi-autoresearch/src/**"];
  assert.throws(
    () =>
      validateAutoresearchSelfHostingContract(
        invalidScope as unknown as Record<string, unknown>,
        "scope.json",
      ),
    /candidate\.allowedPaths\[0\] must not contain parent traversal segments/u,
  );

  const invalidEvaluator = createValidContract(cwd);
  invalidEvaluator.evaluator.candidateMayEditEvaluator = true as false;
  assert.throws(
    () =>
      validateAutoresearchSelfHostingContract(
        invalidEvaluator as unknown as Record<string, unknown>,
        "evaluator.json",
      ),
    /evaluator\.candidateMayEditEvaluator must be false/u,
  );

  const invalidApplicability = createValidContract(cwd);
  invalidApplicability.applicability.minimumDefaultPromotionTransferScope.requiredCoverageKinds = [
    "package_non_self_hosting",
  ];
  assert.throws(
    () =>
      validateAutoresearchSelfHostingContract(
        invalidApplicability as unknown as Record<string, unknown>,
        "applicability.json",
      ),
    /requiredCoverageKinds must include "operator_consumer"/u,
  );

  const invalidPromotion = createValidContract(cwd);
  invalidPromotion.promotion.packageMaySelfPromote = true as false;
  assert.throws(
    () =>
      validateAutoresearchSelfHostingContract(
        invalidPromotion as unknown as Record<string, unknown>,
        "promotion.json",
      ),
    /promotion\.packageMaySelfPromote must be false/u,
  );
});

test("validateAutoresearchSelfHostingContract rejects controller/candidate path collapse", () => {
  const cwd = path.join(os.tmpdir(), "self-hosting-contract-paths");
  const invalidContract = createValidContract(cwd);
  invalidContract.candidate.worktreePath = cwd;

  assert.throws(
    () =>
      validateAutoresearchSelfHostingContract(
        invalidContract as unknown as Record<string, unknown>,
        "candidate-paths.json",
      ),
    /candidate\.worktreePath must differ from controller\.controllerCwd/u,
  );
});

test("loadAutoresearchSelfHostingArtifacts rejects controller cwd mismatch", async () => {
  await withTempDir((cwd) => {
    const contract = createValidContract(cwd);
    const evaluatorLock = createValidEvaluatorLock();
    contract.controller.controllerCwd = path.join(cwd, "different-controller-cwd");

    writeJson(path.join(cwd, AUTORESEARCH_SELF_HOSTING_CONTRACT_FILE), contract);
    writeJson(
      resolveAutoresearchSelfHostingEvaluatorLockPath(cwd, contract.evaluator.lockPath),
      evaluatorLock,
    );

    assert.throws(
      () => loadAutoresearchSelfHostingArtifacts(cwd),
      /controller\.controllerCwd must match loader cwd/u,
    );
  });
});

test("validateAutoresearchSelfHostingEvaluatorLock rejects suites whose entrypoints are not locked", () => {
  const invalidLock = createValidEvaluatorLock();
  invalidLock.suites[0] = {
    ...invalidLock.suites[0],
    entrypoint: {
      ...invalidLock.suites[0].entrypoint,
      path: "suites/not-locked.mjs",
      sha256: sha256("not-locked"),
    },
  };

  assert.throws(
    () =>
      validateAutoresearchSelfHostingEvaluatorLock(
        invalidLock as unknown as Record<string, unknown>,
        "lock.json",
      ),
    /is not present in evaluatorFiles/u,
  );
});

test("validators reject duplicate evaluator file paths and overlapping suite groups", () => {
  const duplicateFileLock = createValidEvaluatorLock();
  duplicateFileLock.evaluatorFiles.push({
    ...duplicateFileLock.evaluatorFiles[0],
  });

  assert.throws(
    () =>
      validateAutoresearchSelfHostingEvaluatorLock(
        duplicateFileLock as unknown as Record<string, unknown>,
        "duplicate-lock.json",
      ),
    /evaluatorFiles paths must not contain duplicate entry/u,
  );

  const cwd = path.join(os.tmpdir(), "self-hosting-suite-groups");
  const overlappingGroups = createValidContract(cwd);
  overlappingGroups.evaluator.transferSuites = ["dev-smoke", "transfer-operator"];

  assert.throws(
    () =>
      validateAutoresearchSelfHostingContract(
        overlappingGroups as unknown as Record<string, unknown>,
        "overlap.json",
      ),
    /repeats suite id "dev-smoke" already declared/u,
  );
});

test("validateAutoresearchSelfHostingArtifactsPair rejects campaign, manifest, and transfer-scope mismatches", () => {
  const cwd = path.join(os.tmpdir(), "self-hosting-pair-fixture");

  const campaignMismatchContract = createValidContract(cwd);
  const campaignMismatchLock = createValidEvaluatorLock();
  campaignMismatchLock.campaignId = "self-hosting-wave-002";
  assert.throws(
    () =>
      validateAutoresearchSelfHostingArtifactsPair(campaignMismatchContract, campaignMismatchLock),
    /campaignId/u,
  );

  const manifestMismatchContract = createValidContract(cwd);
  const manifestMismatchLock = createValidEvaluatorLock();
  manifestMismatchLock.manifestPath = "evaluator-snapshot/other-manifest.json";
  assert.throws(
    () =>
      validateAutoresearchSelfHostingArtifactsPair(manifestMismatchContract, manifestMismatchLock),
    /manifestPath/u,
  );

  const transferScopeContract = createValidContract(cwd);
  const transferScopeLock = createValidEvaluatorLock();
  transferScopeLock.suites = transferScopeLock.suites.filter(
    (suite) => suite.id !== "transfer-operator",
  );
  assert.throws(
    () => validateAutoresearchSelfHostingArtifactsPair(transferScopeContract, transferScopeLock),
    AutoresearchSelfHostingValidationError,
  );
});

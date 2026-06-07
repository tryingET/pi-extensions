import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { createHash } from "node:crypto";
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import os from "node:os";
import path from "node:path";
import test from "node:test";

import {
  AUTORESEARCH_SELF_HOSTING_CONTRACT_FILE,
  AUTORESEARCH_SELF_HOSTING_EVALUATOR_LOCK_FILE,
  AUTORESEARCH_SELF_HOSTING_PROMOTION_RECORD_FILE,
  type AutoresearchSelfHostingApplicabilitySuiteOutcome,
  type AutoresearchSelfHostingContractV1,
  type AutoresearchSelfHostingEvaluatorLockV1,
  type AutoresearchSelfHostingPromotionRecordV1,
  classifyAutoresearchSelfHostingApplicability,
  loadAutoresearchSelfHostingPromotionRecord,
  prepareAutoresearchSelfHostingCandidateWorktree,
  prepareAutoresearchSelfHostingPromotionRecord,
  recordAutoresearchSelfHostingRollback,
  resolveAutoresearchSelfHostingEvaluatorLockPath,
  validateAutoresearchSelfHostingPromotionRecord,
} from "../src/core/selfHosting.ts";

async function withTempDir(fn: (cwd: string) => Promise<void> | void): Promise<void> {
  const cwd = mkdtempSync(path.join(os.tmpdir(), "pi-autoresearch-self-hosting-"));
  try {
    await fn(cwd);
  } finally {
    rmSync(cwd, { recursive: true, force: true });
  }
}

function sha256(value: string | Buffer): string {
  return createHash("sha256").update(value).digest("hex");
}

function fileSha256(target: string): string {
  return sha256(readFileSync(target));
}

function writeJson(target: string, payload: unknown): void {
  mkdirSync(path.dirname(target), { recursive: true });
  writeFileSync(target, `${JSON.stringify(payload, null, 2)}\n`, "utf8");
}

function writeFile(target: string, content: string): void {
  mkdirSync(path.dirname(target), { recursive: true });
  writeFileSync(target, content, "utf8");
}

function createSnapshotSuiteScript(source: string): string {
  return [
    "const args = process.argv.slice(2);",
    "const candidateIndex = args.indexOf('--candidate');",
    "const candidate = candidateIndex >= 0 ? args[candidateIndex + 1] : null;",
    "process.stdout.write(JSON.stringify({",
    `  source: ${JSON.stringify(source)},`,
    "  cwd: process.cwd(),",
    "  candidate,",
    "}));",
    "",
  ].join("\n");
}

function git(cwd: string, ...args: string[]): string {
  return execFileSync("git", args, { cwd, encoding: "utf8" }).trim();
}

function initSelfHostingRepo(root: string): void {
  git(root, "init", "-b", "main");
  git(root, "config", "user.name", "Pi Test");
  git(root, "config", "user.email", "pi-test@example.com");
  writeFile(path.join(root, "README.md"), "# self-hosting test\n");
  writeFile(
    path.join(root, "packages/pi-autoresearch/package.json"),
    `${JSON.stringify(
      {
        name: "self-hosting-fixture",
        private: true,
        type: "module",
        scripts: {
          check: "node packages/pi-autoresearch/tests/package-script-marker.mjs",
        },
      },
      null,
      2,
    )}\n`,
  );
  writeFile(
    path.join(root, "packages/pi-autoresearch/src/runtime.ts"),
    "export const runtime = 'base';\n",
  );
  writeFile(
    path.join(root, "packages/pi-autoresearch/src/core/runtime.ts"),
    "export const nestedRuntime = 'base';\n",
  );
  writeFile(
    path.join(root, "evaluator-snapshot/manifest.json"),
    `${JSON.stringify(
      {
        kind: "fixture_manifest",
        suites: ["dev-smoke", "holdout-operator", "transfer-package", "transfer-operator"],
      },
      null,
      2,
    )}\n`,
  );
  writeFile(
    path.join(root, "evaluator-snapshot/suites/dev-smoke.mjs"),
    createSnapshotSuiteScript("snapshot-dev-smoke"),
  );
  writeFile(
    path.join(root, "evaluator-snapshot/suites/holdout-operator.mjs"),
    createSnapshotSuiteScript("snapshot-holdout-operator"),
  );
  writeFile(
    path.join(root, "evaluator-snapshot/suites/transfer-package.mjs"),
    createSnapshotSuiteScript("snapshot-transfer-package"),
  );
  writeFile(
    path.join(root, "evaluator-snapshot/suites/transfer-operator.mjs"),
    createSnapshotSuiteScript("snapshot-transfer-operator"),
  );
  writeFile(
    path.join(root, "evaluator-snapshot/suites/locked.mjs"),
    "export const locked = true;\n",
  );
  writeFile(
    path.join(root, "packages/pi-autoresearch/tests/emit-pid.mjs"),
    [
      "const payload = {",
      "  pid: process.pid,",
      "  cwd: process.cwd(),",
      "  controllerCwd: process.env.PI_AUTORESEARCH_SELF_HOSTING_CONTROLLER_CWD ?? null,",
      "  candidateCwd: process.env.PI_AUTORESEARCH_SELF_HOSTING_CANDIDATE_CWD ?? null,",
      "  campaignId: process.env.PI_AUTORESEARCH_SELF_HOSTING_CAMPAIGN_ID ?? null,",
      "};",
      "process.stdout.write(JSON.stringify(payload));",
      "",
    ].join("\n"),
  );
  writeFile(
    path.join(root, "packages/pi-autoresearch/tests/package-script-marker.mjs"),
    [
      "import { writeFileSync } from 'node:fs';",
      "writeFileSync('package-script-ran.flag', 'candidate package-manager script executed\\n', 'utf8');",
      "process.stderr.write('candidate package-manager script executed');",
      "process.exitCode = 99;",
      "",
    ].join("\n"),
  );
  writeFile(
    path.join(root, "packages/pi-autoresearch/tests/mutate-offlimits.mjs"),
    [
      "import { writeFileSync } from 'node:fs';",
      "writeFileSync('evaluator-snapshot/suites/locked.mjs', \"export const locked = 'mutated';\\n\", 'utf8');",
      "process.stdout.write('mutated');",
      "",
    ].join("\n"),
  );
  git(root, "add", ".");
  git(root, "commit", "-m", "initial self-hosting fixture");
}

function createRepoBackedEvaluatorLock(root: string): AutoresearchSelfHostingEvaluatorLockV1 {
  const manifestPath = path.join(root, "evaluator-snapshot/manifest.json");
  const devEntrypoint = path.join(root, "evaluator-snapshot/suites/dev-smoke.mjs");
  const holdoutEntrypoint = path.join(root, "evaluator-snapshot/suites/holdout-operator.mjs");
  const transferPackageEntrypoint = path.join(
    root,
    "evaluator-snapshot/suites/transfer-package.mjs",
  );
  const transferOperatorEntrypoint = path.join(
    root,
    "evaluator-snapshot/suites/transfer-operator.mjs",
  );

  return {
    type: "self_hosting_evaluator_lock",
    version: 1,
    campaignId: "self-hosting-wave-001",
    snapshotRootPath: "evaluator-snapshot",
    manifestPath: "evaluator-snapshot/manifest.json",
    manifestHash: fileSha256(manifestPath),
    executionModel: "controller_subprocess_against_candidate",
    evaluatorFiles: [
      { path: "suites/dev-smoke.mjs", sha256: fileSha256(devEntrypoint) },
      { path: "suites/holdout-operator.mjs", sha256: fileSha256(holdoutEntrypoint) },
      { path: "suites/transfer-package.mjs", sha256: fileSha256(transferPackageEntrypoint) },
      { path: "suites/transfer-operator.mjs", sha256: fileSha256(transferOperatorEntrypoint) },
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
          sha256: fileSha256(devEntrypoint),
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
          sha256: fileSha256(holdoutEntrypoint),
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
          sha256: fileSha256(transferPackageEntrypoint),
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
          sha256: fileSha256(transferOperatorEntrypoint),
        },
        subjectCwdMode: "candidate",
        argv: ["--candidate", "$CANDIDATE", "--mode", "operator"],
      },
    ],
  };
}

function writeSelfHostingArtifacts(
  root: string,
  contract: AutoresearchSelfHostingContractV1,
): void {
  const evaluatorLock = createRepoBackedEvaluatorLock(root);
  contract.evaluator.manifestHash = evaluatorLock.manifestHash;
  writeJson(path.join(root, AUTORESEARCH_SELF_HOSTING_CONTRACT_FILE), contract);
  writeJson(
    resolveAutoresearchSelfHostingEvaluatorLockPath(root, contract.evaluator.lockPath),
    evaluatorLock,
  );
  git(root, "add", AUTORESEARCH_SELF_HOSTING_CONTRACT_FILE, contract.evaluator.lockPath);
  git(root, "commit", "-m", "add self-hosting artifacts");
}

function createRepoBackedContract(root: string): AutoresearchSelfHostingContractV1 {
  const contract = createValidContract(root);
  contract.candidate.worktreePath = path.join(
    path.dirname(root),
    `${path.basename(root)}-candidate`,
  );
  contract.evaluator.manifestHash = fileSha256(path.join(root, "evaluator-snapshot/manifest.json"));
  return contract;
}

function createPreparedCandidateRepo(
  root: string,
  configureContract?: (contract: AutoresearchSelfHostingContractV1) => void,
): {
  contract: AutoresearchSelfHostingContractV1;
  candidateWorktreePath: string;
} {
  initSelfHostingRepo(root);
  const contract = createRepoBackedContract(root);
  configureContract?.(contract);
  writeSelfHostingArtifacts(root, contract);
  const prepareResult = prepareAutoresearchSelfHostingCandidateWorktree({ cwd: root, apply: true });
  return {
    contract,
    candidateWorktreePath: prepareResult.candidate.worktreePath,
  };
}

function createPassingApplicabilitySuiteOutcomes(): AutoresearchSelfHostingApplicabilitySuiteOutcome[] {
  return [
    { suiteId: "dev-smoke", passed: true },
    { suiteId: "holdout-operator", passed: true },
    { suiteId: "transfer-package", passed: true },
    { suiteId: "transfer-operator", passed: true },
  ];
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

function createValidPromotionRecord(): AutoresearchSelfHostingPromotionRecordV1 {
  return {
    type: "self_hosting_promotion_record",
    version: 1,
    campaignId: "self-hosting-wave-001",
    approvedBy: [],
    approvedAt: null,
    previousControllerRef: "pi-autoresearch@stable",
    promotedCandidateRef: null,
    evaluatorManifestHash: sha256("manifest"),
    evidenceRefs: ["evidence:classification"],
    status: "planned",
    rollbackControllerRef: "pi-autoresearch@stable",
    rollbackReason: null,
    rolledBackAt: null,
  };
}

test("classifyAutoresearchSelfHostingApplicability emits default_promotion_candidate when thresholds and transfer coverage are satisfied", async () => {
  await withTempDir((root) => {
    createPreparedCandidateRepo(root);

    const result = classifyAutoresearchSelfHostingApplicability({
      cwd: root,
      suiteOutcomes: createPassingApplicabilitySuiteOutcomes(),
      primaryMetric: {
        baseline: 100,
        candidate: 90,
      },
    });

    assert.equal(result.outcome, "default_promotion_candidate");
    assert.equal(result.primaryMetric.improvementPercent, 10);
    assert.equal(result.primaryMetric.meetsDefaultPromotionThreshold, true);
    assert.equal(result.gateStatus.minimumTransferCoverageSatisfied, true);
    assert.deepEqual(result.defaultPromotionBlockers, []);
    assert.deepEqual(result.blockingReasons, []);
  });
});

test("classifyAutoresearchSelfHostingApplicability emits variant_candidate only when a target profile was declared before the campaign", async () => {
  await withTempDir((root) => {
    createPreparedCandidateRepo(root, (contract) => {
      contract.applicability.variantTargetProfile = {
        id: "fast_local_self_hosting_analysis",
        description: "Prefer a faster opt-in local self-hosting analysis profile.",
      };
    });

    const result = classifyAutoresearchSelfHostingApplicability({
      cwd: root,
      suiteOutcomes: createPassingApplicabilitySuiteOutcomes(),
      primaryMetric: {
        baseline: 100,
        candidate: 97,
      },
      variantTargetProfileImproved: true,
    });

    assert.equal(result.outcome, "variant_candidate");
    assert.equal(result.variantTargetProfile?.id, "fast_local_self_hosting_analysis");
    assert.equal(result.primaryMetric.meetsDefaultPromotionThreshold, false);
    assert.equal(result.gateStatus.variantTargetProfileDeclared, true);
    assert.equal(result.gateStatus.variantImprovementObserved, true);
    assert.match(
      result.defaultPromotionBlockers[0] ?? "",
      /below the default-promotion threshold/u,
    );
  });
});

test("classifyAutoresearchSelfHostingApplicability rejects a specialized win when no variant target profile was declared", async () => {
  await withTempDir((root) => {
    createPreparedCandidateRepo(root);

    const result = classifyAutoresearchSelfHostingApplicability({
      cwd: root,
      suiteOutcomes: createPassingApplicabilitySuiteOutcomes(),
      primaryMetric: {
        baseline: 100,
        candidate: 97,
      },
    });

    assert.equal(result.outcome, "reject");
    assert.equal(result.gateStatus.variantTargetProfileDeclared, false);
    assert.match(result.variantBlockers[0] ?? "", /variantTargetProfile to be declared/u);
    assert.match(
      result.defaultPromotionBlockers[0] ?? "",
      /below the default-promotion threshold/u,
    );
    assert.ok(
      result.blockingReasons.some((entry) => /variantTargetProfile to be declared/u.test(entry)),
    );
  });
});

test("classifyAutoresearchSelfHostingApplicability rejects declared variant profiles without explicit profile-improvement evidence", async () => {
  await withTempDir((root) => {
    createPreparedCandidateRepo(root, (contract) => {
      contract.applicability.variantTargetProfile = {
        id: "fast_local_self_hosting_analysis",
        description: "Prefer a faster opt-in local self-hosting analysis profile.",
      };
    });

    const result = classifyAutoresearchSelfHostingApplicability({
      cwd: root,
      suiteOutcomes: createPassingApplicabilitySuiteOutcomes(),
      primaryMetric: {
        baseline: 100,
        candidate: 97,
      },
    });

    assert.equal(result.outcome, "reject");
    assert.equal(result.gateStatus.variantTargetProfileDeclared, true);
    assert.equal(result.gateStatus.primaryMetricImproved, true);
    assert.equal(result.gateStatus.variantImprovementObserved, false);
    assert.ok(result.variantBlockers.some((entry) => /explicit improvement evidence/u.test(entry)));
  });
});

test("classifyAutoresearchSelfHostingApplicability rejects missing locked suite outcomes", async () => {
  await withTempDir((root) => {
    createPreparedCandidateRepo(root);

    const result = classifyAutoresearchSelfHostingApplicability({
      cwd: root,
      suiteOutcomes: createPassingApplicabilitySuiteOutcomes().slice(0, 3),
      primaryMetric: {
        baseline: 100,
        candidate: 90,
      },
    });

    assert.equal(result.outcome, "reject");
    assert.deepEqual(result.suiteSummary.missingSuiteIds, ["transfer-operator"]);
    assert.ok(
      result.rejectReasons.some((entry) => /Missing locked evaluator suite outcomes/u.test(entry)),
    );
  });
});

test("classifyAutoresearchSelfHostingApplicability rejects dirty candidate scope even when evaluator outcomes look good", async () => {
  await withTempDir((root) => {
    const { candidateWorktreePath } = createPreparedCandidateRepo(root);
    writeFile(
      path.join(candidateWorktreePath, "evaluator-snapshot/suites/locked.mjs"),
      "export const locked = 'mutated';\n",
    );

    const result = classifyAutoresearchSelfHostingApplicability({
      cwd: root,
      suiteOutcomes: createPassingApplicabilitySuiteOutcomes(),
      primaryMetric: {
        baseline: 100,
        candidate: 90,
      },
    });

    assert.equal(result.outcome, "reject");
    assert.ok(result.rejectReasons.some((entry) => /off-limits paths/u.test(entry)));
  });
});

test("classifyAutoresearchSelfHostingApplicability blocks default promotion when transfer coverage falls short", async () => {
  await withTempDir((root) => {
    createPreparedCandidateRepo(root);
    const suiteOutcomes = createPassingApplicabilitySuiteOutcomes().map((entry) =>
      entry.suiteId === "transfer-operator" ? { ...entry, passed: false } : entry,
    );

    const result = classifyAutoresearchSelfHostingApplicability({
      cwd: root,
      suiteOutcomes,
      primaryMetric: {
        baseline: 100,
        candidate: 90,
      },
    });

    assert.equal(result.outcome, "reject");
    assert.equal(result.gateStatus.minimumTransferCoverageSatisfied, false);
    assert.deepEqual(result.suiteSummary.passedTransferCoverageKinds, ["package_non_self_hosting"]);
    assert.ok(
      result.defaultPromotionBlockers.some((entry) =>
        /transfer coverage is insufficient/u.test(entry),
      ),
    );
    assert.deepEqual(result.suiteSummary.transferCriticalFailureSuiteIds, ["transfer-operator"]);
  });
});

test("validateAutoresearchSelfHostingPromotionRecord rejects rotation without approvals and rollback truth without timestamps", () => {
  const invalidRotated = createValidPromotionRecord();
  invalidRotated.status = "rotated";
  invalidRotated.promotedCandidateRef = "candidate-ref";
  assert.throws(
    () =>
      validateAutoresearchSelfHostingPromotionRecord(
        invalidRotated as unknown as Record<string, unknown>,
        "promotion.json",
      ),
    /approvedBy must contain at least one approval/u,
  );

  const invalidRollback = createValidPromotionRecord();
  invalidRollback.status = "rolled_back";
  invalidRollback.approvedBy = ["operator_review"];
  invalidRollback.approvedAt = 1;
  invalidRollback.promotedCandidateRef = "candidate-ref";
  invalidRollback.rollbackReason = "post-promotion regression";
  assert.throws(
    () =>
      validateAutoresearchSelfHostingPromotionRecord(
        invalidRollback as unknown as Record<string, unknown>,
        "promotion.json",
      ),
    /rollbackReason and rolledBackAt must either both be null or both be populated/u,
  );
});

test("prepareAutoresearchSelfHostingPromotionRecord keeps promotion planned until required approvals are present", async () => {
  await withTempDir((root) => {
    createPreparedCandidateRepo(root);
    const classification = classifyAutoresearchSelfHostingApplicability({
      cwd: root,
      suiteOutcomes: createPassingApplicabilitySuiteOutcomes(),
      primaryMetric: {
        baseline: 100,
        candidate: 90,
      },
    });

    const result = prepareAutoresearchSelfHostingPromotionRecord({
      cwd: root,
      classification,
      evidenceRefs: ["evidence:classification"],
    });

    assert.equal(result.record.status, "planned");
    assert.equal(result.record.approvedAt, null);
    assert.equal(result.promotionReady, false);
    assert.deepEqual(result.missingApprovals, ["operator_review"]);
    assert.equal(result.record.rollbackControllerRef, "pi-autoresearch@stable");
    assert.match(result.nextStep, /missing "operator_review"/u);
  });
});

test("prepareAutoresearchSelfHostingPromotionRecord requires approvals before reporting controller rotation", async () => {
  await withTempDir((root) => {
    createPreparedCandidateRepo(root);
    const classification = classifyAutoresearchSelfHostingApplicability({
      cwd: root,
      suiteOutcomes: createPassingApplicabilitySuiteOutcomes(),
      primaryMetric: {
        baseline: 100,
        candidate: 90,
      },
    });

    assert.throws(
      () =>
        prepareAutoresearchSelfHostingPromotionRecord({
          cwd: root,
          classification,
          evidenceRefs: ["evidence:classification"],
          status: "rotated",
        }),
      /required approvals are missing/u,
    );
  });
});

test("prepareAutoresearchSelfHostingPromotionRecord applies a rotated record and recordAutoresearchSelfHostingRollback updates it truthfully", async () => {
  await withTempDir((root) => {
    const { candidateWorktreePath } = createPreparedCandidateRepo(root);
    const classification = classifyAutoresearchSelfHostingApplicability({
      cwd: root,
      suiteOutcomes: createPassingApplicabilitySuiteOutcomes(),
      primaryMetric: {
        baseline: 100,
        candidate: 90,
      },
    });
    const candidateHead = git(candidateWorktreePath, "rev-parse", "HEAD");

    const promotion = prepareAutoresearchSelfHostingPromotionRecord({
      cwd: root,
      classification,
      approvedBy: ["operator_review"],
      approvedAt: 1,
      evidenceRefs: ["evidence:classification"],
      promotedCandidateRef: candidateHead,
      status: "rotated",
      apply: true,
    });

    assert.equal(promotion.record.status, "rotated");
    assert.equal(promotion.promotionReady, true);
    assert.equal(promotion.record.promotedCandidateRef, candidateHead);
    assert.equal(
      existsSync(path.join(root, AUTORESEARCH_SELF_HOSTING_PROMOTION_RECORD_FILE)),
      true,
    );

    const loadedPromotion = loadAutoresearchSelfHostingPromotionRecord(root);
    assert.equal(loadedPromotion.status, "rotated");
    assert.deepEqual(loadedPromotion.approvedBy, ["operator_review"]);

    const rotatedContract = JSON.parse(
      readFileSync(path.join(root, AUTORESEARCH_SELF_HOSTING_CONTRACT_FILE), "utf8"),
    ) as AutoresearchSelfHostingContractV1;
    rotatedContract.controller.ref = candidateHead;
    writeJson(path.join(root, AUTORESEARCH_SELF_HOSTING_CONTRACT_FILE), rotatedContract);

    const loadedAfterControllerRotation = loadAutoresearchSelfHostingPromotionRecord(root);
    assert.equal(loadedAfterControllerRotation.status, "rotated");
    assert.equal(loadedAfterControllerRotation.previousControllerRef, "pi-autoresearch@stable");

    const rollback = recordAutoresearchSelfHostingRollback({
      cwd: root,
      rollbackReason: "post-promotion verification failed",
      rolledBackAt: 2,
      evidenceRefs: ["evidence:rollback"],
      apply: true,
    });

    assert.equal(rollback.previousRecord.status, "rotated");
    assert.equal(rollback.record.status, "rolled_back");
    assert.equal(rollback.record.rollbackReason, "post-promotion verification failed");
    assert.equal(rollback.record.rolledBackAt, 2);
    assert.deepEqual(rollback.record.evidenceRefs, [
      "evidence:classification",
      "evidence:rollback",
    ]);
    assert.match(rollback.nextStep, /restore controller/u);

    const loadedRollback = loadAutoresearchSelfHostingPromotionRecord(root);
    assert.equal(loadedRollback.status, "rolled_back");
    assert.equal(loadedRollback.rollbackReason, "post-promotion verification failed");
  });
});

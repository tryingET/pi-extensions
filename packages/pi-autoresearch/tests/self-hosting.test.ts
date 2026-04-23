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
  type AutoresearchSelfHostingApplicabilitySuiteOutcome,
  type AutoresearchSelfHostingContractV1,
  type AutoresearchSelfHostingEvaluatorLockV1,
  AutoresearchSelfHostingValidationError,
  assertAutoresearchSelfHostingCandidateScope,
  classifyAutoresearchSelfHostingApplicability,
  executeAutoresearchSelfHostingCandidateSubprocess,
  executeAutoresearchSelfHostingEvaluatorSuite,
  inspectAutoresearchSelfHostingCandidateScope,
  loadAutoresearchSelfHostingArtifacts,
  prepareAutoresearchSelfHostingCandidateWorktree,
  resolveAutoresearchSelfHostingEvaluatorLockPath,
  resolveAutoresearchSelfHostingEvaluatorSuite,
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

test("prepareAutoresearchSelfHostingCandidateWorktree plans and applies a separate candidate worktree without changing the controller branch", async () => {
  await withTempDir((root) => {
    initSelfHostingRepo(root);
    const contract = createRepoBackedContract(root);
    writeSelfHostingArtifacts(root, contract);

    const plan = prepareAutoresearchSelfHostingCandidateWorktree({ cwd: root });
    assert.equal(plan.mode, "plan");
    assert.equal(plan.candidate.registered, false);
    assert.equal(plan.controllerBranchBefore, "main");
    assert.equal(plan.controllerBranchAfter, "main");
    assert.equal(plan.commands.length, 1);
    assert.deepEqual(plan.commands[0].command, [
      "git",
      "worktree",
      "add",
      "-B",
      contract.candidate.branchName,
      contract.candidate.worktreePath,
      contract.candidate.baseRef,
    ]);

    const applied = prepareAutoresearchSelfHostingCandidateWorktree({ cwd: root, apply: true });
    assert.equal(applied.mode, "apply");
    assert.equal(applied.candidate.registered, true);
    assert.equal(applied.candidate.branch, contract.candidate.branchName);
    assert.equal(applied.controllerBranchBefore, "main");
    assert.equal(applied.controllerBranchAfter, "main");
    assert.equal(git(root, "branch", "--show-current"), "main");
    assert.equal(
      git(applied.candidate.worktreePath, "branch", "--show-current"),
      contract.candidate.branchName,
    );
    assert.equal(
      git(applied.candidate.worktreePath, "rev-parse", "--show-toplevel"),
      applied.candidate.worktreePath,
    );
  });
});

test("candidate scope check allows nested in-scope edits and rejects nested off-limits mutation", async () => {
  await withTempDir((root) => {
    const { candidateWorktreePath } = createPreparedCandidateRepo(root);
    writeFile(
      path.join(candidateWorktreePath, "packages/pi-autoresearch/src/core/runtime.ts"),
      "export const nestedRuntime = 'candidate';\n",
    );

    const scoped = inspectAutoresearchSelfHostingCandidateScope(root);
    assert.equal(scoped.ok, true);
    assert.deepEqual(scoped.offLimitsPaths, []);
    assert.deepEqual(scoped.outOfScopePaths, []);
    assert.ok(scoped.changedPaths.includes("packages/pi-autoresearch/src/core/runtime.ts"));

    writeFile(
      path.join(candidateWorktreePath, "evaluator-snapshot/suites/locked.mjs"),
      "export const locked = 'mutated';\n",
    );
    assert.throws(() => assertAutoresearchSelfHostingCandidateScope(root), /off-limits mutations/u);
  });
});

test("candidate scope check rejects out-of-scope mutation", async () => {
  await withTempDir((root) => {
    const { candidateWorktreePath } = createPreparedCandidateRepo(root);
    writeFile(path.join(candidateWorktreePath, "README.md"), "# changed outside scope\n");

    assert.throws(
      () => assertAutoresearchSelfHostingCandidateScope(root),
      /out-of-scope mutations/u,
    );
  });
});

test("executeAutoresearchSelfHostingCandidateSubprocess runs candidate code in a child process rooted at the candidate worktree", async () => {
  await withTempDir((root) => {
    const { contract, candidateWorktreePath } = createPreparedCandidateRepo(root);

    const result = executeAutoresearchSelfHostingCandidateSubprocess({
      cwd: root,
      command: ["node", "packages/pi-autoresearch/tests/emit-pid.mjs"],
    });
    assert.equal(result.command.exitCode, 0);
    assert.equal(result.candidateCwd, candidateWorktreePath);
    assert.equal(result.controllerCwd, root);
    assert.equal(result.scope.ok, true);
    assert.equal(result.postCommandScope.ok, true);
    const payload = JSON.parse(result.command.stdout) as {
      pid: number;
      cwd: string;
      controllerCwd: string;
      candidateCwd: string;
      campaignId: string;
    };
    assert.notEqual(payload.pid, process.pid);
    assert.equal(payload.cwd, candidateWorktreePath);
    assert.equal(payload.controllerCwd, root);
    assert.equal(payload.candidateCwd, candidateWorktreePath);
    assert.equal(payload.campaignId, contract.campaignId);
    assert.equal(git(root, "branch", "--show-current"), "main");
  });
});

test("executeAutoresearchSelfHostingCandidateSubprocess fails closed when the child mutates an off-limits path", async () => {
  await withTempDir((root) => {
    createPreparedCandidateRepo(root);

    assert.throws(
      () =>
        executeAutoresearchSelfHostingCandidateSubprocess({
          cwd: root,
          command: ["node", "packages/pi-autoresearch/tests/mutate-offlimits.mjs"],
        }),
      /violated scope after execution/u,
    );
  });
});

test("resolveAutoresearchSelfHostingEvaluatorSuite keeps candidate cwd distinct from snapshot-owned entrypoint resolution", async () => {
  await withTempDir((root) => {
    const { candidateWorktreePath } = createPreparedCandidateRepo(root);

    const resolved = resolveAutoresearchSelfHostingEvaluatorSuite({
      cwd: root,
      suiteId: "dev-smoke",
    });
    const controllerEntrypoint = path.join(root, "evaluator-snapshot/suites/dev-smoke.mjs");
    const candidateEntrypoint = path.join(
      candidateWorktreePath,
      "evaluator-snapshot/suites/dev-smoke.mjs",
    );

    assert.equal(resolved.processCwd, candidateWorktreePath);
    assert.equal(resolved.entrypointPath, controllerEntrypoint);
    assert.equal(existsSync(candidateEntrypoint), true);
    assert.notEqual(candidateEntrypoint, controllerEntrypoint);
    assert.deepEqual(resolved.command, [
      process.execPath,
      controllerEntrypoint,
      "--candidate",
      candidateWorktreePath,
    ]);
  });
});

test("resolveAutoresearchSelfHostingEvaluatorSuite ignores a mutated same-named evaluator file inside the candidate worktree", async () => {
  await withTempDir((root) => {
    const { candidateWorktreePath } = createPreparedCandidateRepo(root);
    const controllerEntrypoint = path.join(root, "evaluator-snapshot/suites/dev-smoke.mjs");
    const candidateEntrypoint = path.join(
      candidateWorktreePath,
      "evaluator-snapshot/suites/dev-smoke.mjs",
    );

    writeFile(candidateEntrypoint, createSnapshotSuiteScript("candidate-dev-smoke"));

    const resolved = resolveAutoresearchSelfHostingEvaluatorSuite({
      cwd: root,
      suiteId: "dev-smoke",
    });

    assert.equal(resolved.entrypointPath, controllerEntrypoint);
    assert.notEqual(fileSha256(candidateEntrypoint), fileSha256(controllerEntrypoint));
  });
});

test("executeAutoresearchSelfHostingEvaluatorSuite runs snapshot-owned evaluator entrypoints without candidate package-manager dispatch", async () => {
  await withTempDir((root) => {
    const { candidateWorktreePath } = createPreparedCandidateRepo(root);

    const result = executeAutoresearchSelfHostingEvaluatorSuite({
      cwd: root,
      suiteId: "dev-smoke",
    });

    assert.equal(result.command.exitCode, 0);
    assert.equal(result.command.command[0], process.execPath);
    assert.equal(
      result.command.command[1],
      path.join(root, "evaluator-snapshot/suites/dev-smoke.mjs"),
    );
    assert.equal(result.command.cwd, candidateWorktreePath);
    assert.equal(result.scope.ok, true);
    assert.equal(result.postCommandScope.ok, true);
    assert.equal(result.command.command.includes("npm"), false);
    assert.equal(result.command.command.includes("pnpm"), false);
    assert.equal(result.command.command.includes("yarn"), false);
    assert.equal(existsSync(path.join(candidateWorktreePath, "package-script-ran.flag")), false);

    const payload = JSON.parse(result.command.stdout) as {
      source: string;
      cwd: string;
      candidate: string | null;
    };
    assert.equal(payload.source, "snapshot-dev-smoke");
    assert.equal(payload.cwd, candidateWorktreePath);
    assert.equal(payload.candidate, candidateWorktreePath);
  });
});

test("executeAutoresearchSelfHostingEvaluatorSuite fails closed on unsupported shell-style evaluator placeholders", async () => {
  await withTempDir((root) => {
    initSelfHostingRepo(root);
    const contract = createRepoBackedContract(root);
    writeSelfHostingArtifacts(root, contract);

    const lockPath = resolveAutoresearchSelfHostingEvaluatorLockPath(
      root,
      contract.evaluator.lockPath,
    );
    const evaluatorLock = createRepoBackedEvaluatorLock(root);
    evaluatorLock.suites[0] = {
      ...evaluatorLock.suites[0],
      argv: ["$UNKNOWN_PLACEHOLDER"],
    };
    writeJson(lockPath, evaluatorLock);

    prepareAutoresearchSelfHostingCandidateWorktree({ cwd: root, apply: true });

    assert.throws(
      () =>
        resolveAutoresearchSelfHostingEvaluatorSuite({
          cwd: root,
          suiteId: "dev-smoke",
        }),
      /unsupported shell-style placeholder/u,
    );
  });
});

test("executeAutoresearchSelfHostingEvaluatorSuite fails closed on locked evaluator hash drift", async () => {
  await withTempDir((root) => {
    createPreparedCandidateRepo(root);
    writeFile(
      path.join(root, "evaluator-snapshot/suites/dev-smoke.mjs"),
      createSnapshotSuiteScript("snapshot-dev-smoke-drifted"),
    );

    assert.throws(
      () =>
        executeAutoresearchSelfHostingEvaluatorSuite({
          cwd: root,
          suiteId: "dev-smoke",
        }),
      /Locked evaluator file drift detected/u,
    );
  });
});

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

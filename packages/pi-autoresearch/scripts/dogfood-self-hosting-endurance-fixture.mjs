// summary: Builds deterministic repositories, evaluator snapshots, and contracts for self-hosting endurance dogfood.
// read_when:
//   - Updating the isolated self-hosting fixture, evaluator lock, or candidate scope model.
import { createHash } from "node:crypto";
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import path from "node:path";

function sha256(value) {
  return createHash("sha256").update(value).digest("hex");
}

export function fileSha256(target) {
  return sha256(readFileSync(target));
}

function writeFile(target, content) {
  mkdirSync(path.dirname(target), { recursive: true });
  writeFileSync(target, content, "utf8");
}

function writeJson(target, payload) {
  writeFile(target, `${JSON.stringify(payload, null, 2)}\n`);
}

function createSnapshotSuiteScript(source) {
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

export function initSelfHostingEnduranceRepo({ controller, git }) {
  mkdirSync(controller, { recursive: true });
  git(controller, ["init", "-b", "main"]);
  git(controller, ["config", "user.name", "Pi Autoresearch Dogfood"]);
  git(controller, ["config", "user.email", "pi-autoresearch@example.invalid"]);
  writeFile(path.join(controller, "README.md"), "# self-hosting endurance dogfood\n");
  writeFile(
    path.join(controller, "packages/pi-autoresearch/package.json"),
    `${JSON.stringify(
      {
        name: "self-hosting-endurance-fixture",
        private: true,
        type: "module",
        scripts: { check: "node packages/pi-autoresearch/tests/package-script-marker.mjs" },
      },
      null,
      2,
    )}\n`,
  );
  writeFile(
    path.join(controller, "packages/pi-autoresearch/src/runtime.ts"),
    "export const runtime = 'base';\n",
  );
  writeFile(
    path.join(controller, "packages/pi-autoresearch/tests/emit-pid.mjs"),
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
    path.join(controller, "packages/pi-autoresearch/tests/package-script-marker.mjs"),
    [
      "import { writeFileSync } from 'node:fs';",
      "writeFileSync('package-script-ran.flag', 'candidate package-manager script executed\\n', 'utf8');",
      "process.exitCode = 99;",
      "",
    ].join("\n"),
  );
  writeFile(
    path.join(controller, "evaluator-snapshot/manifest.json"),
    `${JSON.stringify(
      {
        kind: "fixture_manifest",
        suites: ["dev-smoke", "holdout-operator", "transfer-package", "transfer-operator"],
      },
      null,
      2,
    )}\n`,
  );
  for (const [suiteId, source] of [
    ["dev-smoke", "snapshot-dev-smoke"],
    ["holdout-operator", "snapshot-holdout-operator"],
    ["transfer-package", "snapshot-transfer-package"],
    ["transfer-operator", "snapshot-transfer-operator"],
  ]) {
    writeFile(
      path.join(controller, "evaluator-snapshot/suites", `${suiteId}.mjs`),
      createSnapshotSuiteScript(source),
    );
  }
  git(controller, ["add", "."]);
  git(controller, ["commit", "-m", "baseline self-hosting endurance fixture"]);
}

function createContract({ controller, tempRoot, promotionRecordFile }) {
  return {
    type: "self_hosting_contract",
    version: 1,
    campaignId: "self-hosting-endurance-wave-001",
    controller: {
      mode: "stable_installed",
      ref: "pi-autoresearch@stable",
      controllerCwd: controller,
      executionModel: "controller_subprocess_against_candidate",
    },
    candidate: {
      worktreePath: path.join(tempRoot, "candidate-worktree"),
      baseRef: "main",
      branchName: "autoresearch/self-hosting-endurance-wave-001",
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
      lockPath: path.join("artifacts", "autoresearch.self-hosting.evaluator.lock.json"),
      manifestPath: "evaluator-snapshot/manifest.json",
      manifestHash: fileSha256(path.join(controller, "evaluator-snapshot/manifest.json")),
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
      promotionRecordPath: promotionRecordFile,
      rollbackControllerRef: "pi-autoresearch@stable",
    },
  };
}

function createEvaluatorLock({ controller, contract }) {
  const suite = (suiteId, suiteClass, coverageKind, kind, argv = ["--candidate", "$CANDIDATE"]) => {
    const entrypoint = `suites/${suiteId}.mjs`;
    return {
      id: suiteId,
      class: suiteClass,
      critical: true,
      coverageKind,
      entrypoint: {
        kind,
        path: entrypoint,
        sha256: fileSha256(path.join(controller, "evaluator-snapshot", entrypoint)),
      },
      subjectCwdMode: "candidate",
      argv,
    };
  };
  const suites = [
    suite("dev-smoke", "dev", "self_hosting_internal", "snapshot_node_module"),
    suite("holdout-operator", "holdout", "operator_consumer", "snapshot_node_module"),
    suite("transfer-package", "transfer", "package_non_self_hosting", "snapshot_script", [
      "--candidate",
      "$CANDIDATE",
      "--mode",
      "package",
    ]),
    suite("transfer-operator", "transfer", "operator_consumer", "snapshot_script", [
      "--candidate",
      "$CANDIDATE",
      "--mode",
      "operator",
    ]),
  ];
  return {
    type: "self_hosting_evaluator_lock",
    version: 1,
    campaignId: contract.campaignId,
    snapshotRootPath: contract.evaluator.snapshotRootPath,
    manifestPath: contract.evaluator.manifestPath,
    manifestHash: contract.evaluator.manifestHash,
    executionModel: contract.controller.executionModel,
    evaluatorFiles: suites.map((entry) => ({
      path: entry.entrypoint.path,
      sha256: entry.entrypoint.sha256,
    })),
    suites,
  };
}

export function createSelfHostingEnduranceArtifacts({
  controller,
  tempRoot,
  git,
  promotionRecordFile,
  resolveEvaluatorLockPath,
}) {
  const contract = createContract({ controller, tempRoot, promotionRecordFile });
  const evaluatorLock = createEvaluatorLock({ controller, contract });
  writeJson(path.join(controller, "autoresearch.self-hosting.json"), contract);
  writeJson(resolveEvaluatorLockPath(controller, contract.evaluator.lockPath), evaluatorLock);
  git(controller, ["add", "autoresearch.self-hosting.json", contract.evaluator.lockPath]);
  git(controller, ["commit", "-m", "add self-hosting endurance artifacts"]);
  return { contract, evaluatorLock };
}

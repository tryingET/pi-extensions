import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { createHash } from "node:crypto";
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import os from "node:os";
import path from "node:path";
import test from "node:test";

import {
  type PiAutoresearchExtensionOptions,
  registerPiAutoresearchExtension,
} from "../extensions/pi-autoresearch.ts";
import {
  AUTORESEARCH_SELF_HOSTING_PROMOTION_RECORD_FILE,
  AUTORESEARCH_SELF_HOSTING_TOOL_NAME,
  type AutoresearchSelfHostingContractV1,
  type AutoresearchSelfHostingEvaluatorLockV1,
  loadAutoresearchSelfHostingPromotionRecord,
  resolveAutoresearchSelfHostingEvaluatorLockPath,
} from "../src/core/selfHosting.ts";

type RegisteredTool = {
  name: string;
  execute: (
    toolCallId: string,
    params: unknown,
    signal: AbortSignal | undefined,
    onUpdate: unknown,
    ctx: { cwd?: string },
  ) => Promise<{ content: Array<{ type: string; text: string }>; details: unknown }>;
};

function registerHarness(options: PiAutoresearchExtensionOptions = {}) {
  const tools = new Map<string, RegisteredTool>();

  registerPiAutoresearchExtension(
    {
      registerCommand() {},
      registerTool(tool: RegisteredTool) {
        tools.set(tool.name, tool);
      },
    } as never,
    options,
  );

  return { tools };
}

async function withTempDir(fn: (cwd: string) => Promise<void> | void): Promise<void> {
  const cwd = mkdtempSync(path.join(os.tmpdir(), "pi-autoresearch-self-hosting-extension-"));
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

function writeFile(target: string, content: string): void {
  mkdirSync(path.dirname(target), { recursive: true });
  writeFileSync(target, content, "utf8");
}

function writeJson(target: string, payload: unknown): void {
  writeFile(target, `${JSON.stringify(payload, null, 2)}\n`);
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
  writeFile(path.join(root, "README.md"), "# self-hosting extension test\n");
  writeFile(
    path.join(root, "packages/pi-autoresearch/src/runtime.ts"),
    "export const runtime = 'base';\n",
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
  git(root, "add", ".");
  git(root, "commit", "-m", "initial self-hosting extension fixture");
}

function createContract(root: string): AutoresearchSelfHostingContractV1 {
  return {
    type: "self_hosting_contract",
    version: 1,
    campaignId: "self-hosting-extension-wave-001",
    controller: {
      mode: "stable_installed",
      ref: "pi-autoresearch@stable",
      controllerCwd: root,
      executionModel: "controller_subprocess_against_candidate",
    },
    candidate: {
      worktreePath: path.join(path.dirname(root), `${path.basename(root)}-candidate`),
      baseRef: "main",
      branchName: "autoresearch/self-hosting-extension-wave-001",
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
      manifestHash: fileSha256(path.join(root, "evaluator-snapshot/manifest.json")),
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
      promotionRecordPath: AUTORESEARCH_SELF_HOSTING_PROMOTION_RECORD_FILE,
      rollbackControllerRef: "pi-autoresearch@stable",
    },
  };
}

function createEvaluatorLock(root: string): AutoresearchSelfHostingEvaluatorLockV1 {
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
    campaignId: "self-hosting-extension-wave-001",
    snapshotRootPath: "evaluator-snapshot",
    manifestPath: "evaluator-snapshot/manifest.json",
    manifestHash: fileSha256(path.join(root, "evaluator-snapshot/manifest.json")),
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

function writeArtifacts(root: string): void {
  const contract = createContract(root);
  const evaluatorLock = createEvaluatorLock(root);
  writeJson(path.join(root, "autoresearch.self-hosting.json"), contract);
  writeJson(
    resolveAutoresearchSelfHostingEvaluatorLockPath(root, contract.evaluator.lockPath),
    evaluatorLock,
  );
  git(root, "add", "autoresearch.self-hosting.json", contract.evaluator.lockPath);
  git(root, "commit", "-m", "add self-hosting extension artifacts");
}

test("autoresearch_self_hosting_run reports status before the candidate worktree is prepared", async () => {
  await withTempDir(async (cwd) => {
    initSelfHostingRepo(cwd);
    writeArtifacts(cwd);

    const { tools } = registerHarness();
    const tool = tools.get(AUTORESEARCH_SELF_HOSTING_TOOL_NAME);
    assert.ok(tool);

    const result = await tool?.execute(
      "call-status",
      { action: "status", cwd },
      undefined,
      undefined,
      { cwd },
    );

    assert.ok(result);
    assert.match(result?.content[0]?.text ?? "", /Autoresearch self-hosting — status/u);
    assert.match(result?.content[0]?.text ?? "", /Candidate registered: no/u);
    assert.match(
      result?.content[0]?.text ?? "",
      /Next step: Run prepareAutoresearchSelfHostingCandidateWorktree/u,
    );
    const details = result?.details as {
      prepareCandidate: { candidate: { registered: boolean } };
      promotionRecord: null;
    };
    assert.equal(details.prepareCandidate.candidate.registered, false);
    assert.equal(details.promotionRecord, null);
  });
});

test("autoresearch_self_hosting_run executes one bounded wave and can write an approved promotion record", async () => {
  await withTempDir(async (cwd) => {
    initSelfHostingRepo(cwd);
    writeArtifacts(cwd);

    const { tools } = registerHarness();
    const tool = tools.get(AUTORESEARCH_SELF_HOSTING_TOOL_NAME);
    assert.ok(tool);

    const result = await tool?.execute(
      "call-run",
      {
        action: "run",
        cwd,
        candidateCommand: ["node", "packages/pi-autoresearch/tests/emit-pid.mjs"],
        primaryMetricBaseline: 100,
        primaryMetricCandidate: 90,
        approvedBy: ["operator_review"],
        approvedAt: 1,
        evidenceRefs: ["evidence:self-hosting-wave"],
        promotionStatus: "approved",
        promotionApply: true,
      },
      undefined,
      undefined,
      { cwd },
    );

    assert.ok(result);
    assert.match(result?.content[0]?.text ?? "", /Autoresearch self-hosting — run/u);
    assert.match(result?.content[0]?.text ?? "", /Classification: default_promotion_candidate/u);
    assert.match(result?.content[0]?.text ?? "", /Promotion record: approved/u);

    const details = result?.details as {
      suiteResults: Array<{ resolvedSuite: { suiteId: string } }>;
      classification: { outcome: string };
      promotion: { record: { status: string } };
    };
    assert.equal(details.suiteResults.length, 4);
    assert.deepEqual(details.suiteResults.map((entry) => entry.resolvedSuite.suiteId).sort(), [
      "dev-smoke",
      "holdout-operator",
      "transfer-operator",
      "transfer-package",
    ]);
    assert.equal(details.classification.outcome, "default_promotion_candidate");
    assert.equal(details.promotion.record.status, "approved");
    assert.equal(existsSync(path.join(cwd, AUTORESEARCH_SELF_HOSTING_PROMOTION_RECORD_FILE)), true);

    const promotionRecord = loadAutoresearchSelfHostingPromotionRecord(cwd);
    assert.equal(promotionRecord.status, "approved");
    assert.deepEqual(promotionRecord.approvedBy, ["operator_review"]);
    assert.deepEqual(promotionRecord.evidenceRefs, ["evidence:self-hosting-wave"]);
  });
});

test("autoresearch_self_hosting_run start_and_watch streams bounded wave progress updates", async () => {
  await withTempDir(async (cwd) => {
    initSelfHostingRepo(cwd);
    writeArtifacts(cwd);

    const { tools } = registerHarness();
    const tool = tools.get(AUTORESEARCH_SELF_HOSTING_TOOL_NAME);
    assert.ok(tool);

    const updates: Array<{
      content: Array<{ type: string; text: string }>;
      details: { phase?: string };
    }> = [];
    const result = await tool?.execute(
      "call-watch",
      {
        action: "start_and_watch",
        cwd,
        candidateCommand: ["node", "packages/pi-autoresearch/tests/emit-pid.mjs"],
        primaryMetricBaseline: 100,
        primaryMetricCandidate: 90,
      },
      undefined,
      (update: { content: Array<{ type: string; text: string }>; details: { phase?: string } }) => {
        updates.push(update);
      },
      { cwd },
    );

    assert.ok(result);
    assert.match(result?.content[0]?.text ?? "", /Autoresearch self-hosting — start_and_watch/u);
    assert.ok(updates.length > 0);
    assert.ok(updates.some((update) => update.details.phase === "loading_artifacts"));
    assert.ok(updates.some((update) => update.details.phase === "prepare_candidate_complete"));
    assert.ok(updates.some((update) => update.details.phase === "candidate_subprocess_complete"));
    assert.ok(updates.some((update) => update.details.phase === "classification_complete"));
    assert.equal(updates.at(-1)?.details.phase, "wave_complete");
  });
});

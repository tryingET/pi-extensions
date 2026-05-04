import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { mkdirSync, mkdtempSync, writeFileSync } from "node:fs";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import extension from "../extensions/society-orchestrator.ts";
import { AutoresearchSelfHostingSupervisor } from "../src/runtime/autoresearch-self-hosting-supervision.ts";

function createObservation({
  cwd = "/tmp/self-hosting-supervision",
  taskId = null,
  promotionPosture = "rotated",
} = {}) {
  const campaignId = "self-hosting-wave-001";
  return {
    cwd,
    observedAt: 1_234,
    contractPath: path.join(cwd, "autoresearch.self-hosting.json"),
    lockPath: path.join(
      cwd,
      ".autoresearch/self-hosting/autoresearch.self-hosting.evaluator.lock.json",
    ),
    promotionRecordPath: path.join(cwd, "autoresearch.self-hosting.promotion.json"),
    campaignId,
    executionModel: "controller_subprocess_against_candidate",
    controller: {
      mode: "stable_installed",
      ref: "controller-ref",
      controllerCwd: cwd,
      executionModel: "controller_subprocess_against_candidate",
    },
    candidate: {
      worktreePath: path.join(cwd, "../candidate"),
      baseRef: "main",
      branchName: "autoresearch/self-hosting-wave-001",
      allowedPaths: ["packages/pi-autoresearch/src/**"],
      offLimits: ["packages/pi-autoresearch/autoresearch.self-hosting.json"],
      onFailureDisposition: "preserve_for_review",
    },
    evaluator: {
      snapshotRootPath: path.join(cwd, ".autoresearch/self-hosting/evaluator-snapshot"),
      manifestPath: path.join(cwd, ".autoresearch/self-hosting/evaluator-snapshot/manifest.json"),
      manifestHash: "0".repeat(64),
      evaluatorFileCount: 1,
      suiteCount: 4,
      suiteIds: [
        "dev-workflow-contract",
        "holdout-effect-boundary",
        "transfer-runtime-posture",
        "transfer-operator-posture",
      ],
    },
    contract: {},
    evaluatorLock: {},
    promotionRecord:
      promotionPosture === "missing"
        ? null
        : {
            status: promotionPosture,
            approvedBy: ["operator_review"],
            approvedAt: 1_200,
            promotedCandidateRef: "candidate-ref",
            rollbackControllerRef: "controller-ref",
            rollbackReason: null,
            rolledBackAt: null,
          },
    promotionPosture,
    projectionKey: `autoresearch:self-hosting:${campaignId}:projection-001`,
    evidenceReady: true,
    nextStep:
      taskId === null
        ? "Observation is complete. Provide an exact taskId and re-run with action=record_evidence if bounded AK evidence should be attached."
        : `Exact task ${taskId} is supplied. Re-run with action=record_evidence to attach bounded self-hosting evidence.`,
  };
}

function registerSelfHostingTool(selfHostingSupervisor) {
  const tools = new Map();
  extension(
    {
      registerTool(tool) {
        tools.set(tool.name, tool);
      },
      registerCommand() {},
      on() {},
    },
    { selfHostingSupervisor },
  );

  const tool = tools.get("autoresearch_self_hosting_supervision");
  assert.ok(tool, "expected autoresearch_self_hosting_supervision to register");
  return tool;
}

function createToolContext(cwd = process.cwd()) {
  return { cwd, model: undefined };
}

function sha256(value) {
  return createHash("sha256").update(value).digest("hex");
}

function writeValidSelfHostingFixture({ drift = false } = {}) {
  const cwd = mkdtempSync(path.join(os.tmpdir(), "orch-self-hosting-"));
  const snapshotRoot = path.join(cwd, ".autoresearch", "self-hosting", "evaluator-snapshot");
  mkdirSync(snapshotRoot, { recursive: true });
  const lockDir = path.join(cwd, ".autoresearch", "self-hosting");
  mkdirSync(lockDir, { recursive: true });

  const manifest = JSON.stringify({ suites: ["dev", "holdout", "transfer"] }, null, 2);
  const runner = "console.log('locked evaluator');\n";
  writeFileSync(path.join(snapshotRoot, "manifest.json"), manifest);
  writeFileSync(path.join(snapshotRoot, "runner.mjs"), drift ? `${runner}// drift\n` : runner);

  const campaignId = "self-hosting-fixture-001";
  const suites = [
    ["dev-workflow-contract", "dev", "self_hosting_internal"],
    ["holdout-effect-boundary", "holdout", "package_non_self_hosting"],
    ["transfer-runtime-posture", "transfer", "package_non_self_hosting"],
    ["transfer-operator-posture", "transfer", "operator_consumer"],
  ].map(([id, suiteClass, coverageKind]) => ({
    id,
    class: suiteClass,
    critical: true,
    coverageKind,
    entrypoint: {
      kind: "snapshot_script",
      path: "runner.mjs",
      sha256: sha256(runner),
    },
    subjectCwdMode: "candidate",
    argv: ["node", "{{entrypoint}}", "{{candidateCwd}}"],
  }));

  const contract = {
    type: "self_hosting_contract",
    version: 1,
    campaignId,
    controller: {
      mode: "stable_installed",
      ref: "controller-ref",
      controllerCwd: cwd,
      executionModel: "controller_subprocess_against_candidate",
    },
    candidate: {
      worktreePath: path.join(cwd, "..", "candidate-worktree"),
      baseRef: "main",
      branchName: "autoresearch/self-hosting-fixture-001",
      allowedPaths: ["packages/pi-autoresearch/src/**"],
      offLimits: ["packages/pi-autoresearch/autoresearch.self-hosting.json"],
      onFailureDisposition: "preserve_for_review",
    },
    evaluator: {
      lockPath: ".autoresearch/self-hosting/autoresearch.self-hosting.evaluator.lock.json",
      manifestPath: ".autoresearch/self-hosting/evaluator-snapshot/manifest.json",
      manifestHash: sha256(manifest),
      snapshotRootPath: ".autoresearch/self-hosting/evaluator-snapshot",
      criticalSuites: suites.map((suite) => suite.id),
      devSuites: ["dev-workflow-contract"],
      holdoutSuites: ["holdout-effect-boundary"],
      transferSuites: ["transfer-runtime-posture", "transfer-operator-posture"],
      candidateMayEditEvaluator: false,
    },
    applicability: {
      primaryMetric: {
        name: "self_hosting_wave_blockers",
        direction: "lower",
        minImprovementForDefaultPromotionPercent: 0,
      },
      variantTargetProfile: null,
      maxCriticalSuiteFailures: 0,
      maxHoldoutCriticalFailures: 0,
      maxTransferCriticalFailures: 0,
      maxNonCriticalTransferRegressionPercent: 0,
      minimumDefaultPromotionTransferScope: {
        minimumSuites: 2,
        requiredCoverageKinds: ["package_non_self_hosting", "operator_consumer"],
      },
    },
    promotion: {
      packageMaySelfPromote: false,
      requiredApprovals: ["operator_review"],
      promotionRecordPath: "autoresearch.self-hosting.promotion.json",
      rollbackControllerRef: "controller-ref",
    },
  };

  const lock = {
    type: "self_hosting_evaluator_lock",
    version: 1,
    campaignId,
    snapshotRootPath: contract.evaluator.snapshotRootPath,
    manifestPath: contract.evaluator.manifestPath,
    manifestHash: contract.evaluator.manifestHash,
    executionModel: "controller_subprocess_against_candidate",
    evaluatorFiles: [
      {
        path: "runner.mjs",
        sha256: sha256(runner),
      },
    ],
    suites,
  };

  writeFileSync(
    path.join(cwd, "autoresearch.self-hosting.json"),
    JSON.stringify(contract, null, 2),
  );
  writeFileSync(
    path.join(lockDir, "autoresearch.self-hosting.evaluator.lock.json"),
    JSON.stringify(lock, null, 2),
  );

  return cwd;
}

test("autoresearch_self_hosting_supervision observe reports self-hosting posture", async () => {
  const observation = createObservation();
  const tool = registerSelfHostingTool({
    observe: () => observation,
    recordEvidence: async () => {
      throw new Error("recordEvidence should not be called for action=observe");
    },
  });

  const result = await tool.execute(
    "tc-1",
    {
      action: "observe",
      cwd: observation.cwd,
    },
    undefined,
    undefined,
    createToolContext(),
  );

  assert.equal(result.details.ok, true);
  assert.equal(result.details.action, "observe");
  assert.equal(result.details.observation.campaignId, observation.campaignId);
  assert.match(result.content[0].text, /Autoresearch self-hosting supervision — observe/);
  assert.match(result.content[0].text, /Campaign: self-hosting-wave-001/);
  assert.match(result.content[0].text, /Promotion posture: rotated/);
});

test("autoresearch_self_hosting_supervision requires an exact cwd", async () => {
  const tool = registerSelfHostingTool({
    observe: () => {
      throw new Error("observe should not run without cwd");
    },
    recordEvidence: async () => {
      throw new Error("recordEvidence should not run without cwd");
    },
  });

  const result = await tool.execute(
    "tc-missing-cwd",
    {
      action: "observe",
    },
    undefined,
    undefined,
    createToolContext("/tmp/not-used"),
  );

  assert.equal(result.details.ok, false);
  assert.equal(result.details.action, "observe");
  assert.match(result.content[0].text, /requires an exact cwd/i);
});

test("autoresearch_self_hosting_supervision requires an exact taskId for record_evidence", async () => {
  const tool = registerSelfHostingTool({
    observe: () => createObservation(),
    recordEvidence: async () => {
      throw new Error("recordEvidence should not run without taskId");
    },
  });

  const result = await tool.execute(
    "tc-2",
    {
      action: "record_evidence",
      cwd: "/tmp/missing-task",
    },
    undefined,
    undefined,
    createToolContext(),
  );

  assert.equal(result.details.ok, false);
  assert.equal(result.details.action, "record_evidence");
  assert.match(result.content[0].text, /record_evidence requires an exact taskId/i);
});

test("autoresearch_self_hosting_supervision surfaces bounded evidence-only projection results", async () => {
  const observation = createObservation({
    cwd: "/tmp/self-hosting-recorded",
    taskId: 4202,
  });
  const tool = registerSelfHostingTool({
    observe: () => observation,
    recordEvidence: async () => ({
      ok: true,
      action: "recorded",
      observation,
      candidate: {
        kind: "projectable",
        observation,
        payload: {
          taskId: 4202,
          checkType: "autoresearch:self-hosting:rotated",
          result: "pass",
          details: { projection_key: observation.projectionKey },
        },
        reason: "self-hosting posture is ready for bounded evidence projection.",
      },
      task: {
        id: 4202,
        repo: "/tmp/repo-root",
      },
      evidence: {
        ok: true,
        via: "ak",
      },
      nextStep:
        "Self-hosting evidence was recorded via ak. Re-run observe or record_evidence after the package-derived projection changes again.",
    }),
  });

  const result = await tool.execute(
    "tc-3",
    {
      action: "record_evidence",
      cwd: observation.cwd,
      taskId: 4202,
    },
    undefined,
    undefined,
    createToolContext(),
  );

  assert.equal(result.details.ok, true);
  assert.equal(result.details.action, "record_evidence");
  assert.equal(result.details.evidenceAction, "recorded");
  assert.equal(result.details.evidenceVia, "ak");
  assert.match(result.content[0].text, /Evidence action: recorded/);
  assert.match(result.content[0].text, /Evidence via: ak/);
  assert.match(result.content[0].text, /Task repo: \/tmp\/repo-root/);
});

test("AutoresearchSelfHostingSupervisor observes valid artifacts and fails on evaluator lock drift", () => {
  const validCwd = writeValidSelfHostingFixture();
  const supervisor = new AutoresearchSelfHostingSupervisor({ now: () => 1_234 });
  const observation = supervisor.observe({ cwd: validCwd });

  assert.equal(observation.campaignId, "self-hosting-fixture-001");
  assert.equal(observation.promotionPosture, "missing");
  assert.equal(observation.evaluator.suiteCount, 4);
  assert.match(observation.projectionKey, /^autoresearch:self-hosting:self-hosting-fixture-001:/);

  const driftCwd = writeValidSelfHostingFixture({ drift: true });
  assert.throws(
    () => supervisor.observe({ cwd: driftCwd }),
    /Locked evaluator file drift detected/,
  );
});

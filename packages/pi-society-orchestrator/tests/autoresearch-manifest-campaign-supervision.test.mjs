import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { mkdirSync, mkdtempSync } from "node:fs";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import {
  AutoresearchManifestCampaignSupervisor,
  deriveAutoresearchManifestCampaignEvidenceCandidate,
} from "../src/runtime/autoresearch-manifest-campaign-supervision.ts";

function createSqliteDb(repoRoot) {
  const dbPath = path.join(repoRoot, "society.db");
  execFileSync(
    "sqlite3",
    [
      dbPath,
      [
        "CREATE TABLE repos (path TEXT NOT NULL);",
        `INSERT INTO repos(path) VALUES('${escapeSql(repoRoot)}');`,
        [
          "CREATE TABLE evidence (",
          "  id INTEGER PRIMARY KEY AUTOINCREMENT,",
          "  task_id INTEGER,",
          "  repo TEXT,",
          "  check_type TEXT NOT NULL,",
          "  result TEXT NOT NULL,",
          "  details JSON,",
          "  checked_at TEXT DEFAULT CURRENT_TIMESTAMP,",
          "  checked_by TEXT",
          ");",
        ].join("\n"),
      ].join("\n"),
    ],
    { encoding: "utf8" },
  );
  return dbPath;
}

function queryRows(dbPath, sql) {
  const output = execFileSync("sqlite3", [dbPath, "-json", sql], { encoding: "utf8" });
  return output.trim().length > 0 ? JSON.parse(output) : [];
}

function escapeSql(value) {
  return value.replaceAll("'", "''");
}

function createBinding({
  taskId = 4201,
  manifestPath,
  receiptRootPath,
  overallState = "stage41_complete",
  projectionKey = "projection:stage41",
  milestone = "stage41_complete",
  checkType = "autoresearch:llamacpp-campaign:stage41-complete",
  completionEligible = false,
  lifecycleAction = "evidence_only",
  terminalStage = 43,
} = {}) {
  return {
    type: "llamacpp_campaign_ak_binding",
    version: 1,
    taskId,
    manifest: {
      path: manifestPath,
      campaignId: "llamacpp-wave-001",
      manifestKey: "manifest-key-001",
      receiptRootPath,
      terminalStage,
    },
    projection: {
      overallState,
      updatedAt: 1_111,
      projectionKey,
    },
    stages: {
      buildCount: 3,
      stage41ExpectedBuilds: 3,
      stage41PresentReceipts: overallState === "planned_only" ? 0 : 3,
      stage41PresentCorpora: overallState === "planned_only" ? 0 : 3,
      stage42ExpectedBuilds: 1,
      stage42PresentReceipts:
        overallState === "stage42_complete" || overallState === "stage43_complete" ? 1 : 0,
      stage43ExpectedBuilds: 1,
      stage43PresentReceipts: overallState === "stage43_complete" ? 1 : 0,
    },
    ak: {
      milestone,
      checkType,
      result: "pass",
      summary: `${milestone} milestone is ready for bounded evidence projection.`,
    },
    lifecycle: {
      completionEligible,
      action: lifecycleAction,
      reason: completionEligible
        ? "terminal stage is materially complete, but orchestrator v1 remains evidence-only"
        : "evidence-only milestone",
    },
  };
}

function createControlResult({
  cwd,
  manifestPath = path.join(cwd, "llamacpp-wave-001.json"),
  taskId,
  verificationState = taskId === undefined ? "not_requested" : "verified_live",
  overallState = "stage41_complete",
  projectionKey = "projection:stage41",
  milestone = "stage41_complete",
  checkType = "autoresearch:llamacpp-campaign:stage41-complete",
  completionCandidate = false,
  terminalStage = 43,
} = {}) {
  const receiptRootPath = path.join(cwd, "receipts");
  const binding =
    verificationState === "verified_live" && taskId !== undefined
      ? createBinding({
          taskId,
          manifestPath,
          receiptRootPath,
          overallState,
          projectionKey,
          milestone,
          checkType,
          completionEligible: completionCandidate,
          lifecycleAction: completionCandidate ? "complete_task_candidate" : "evidence_only",
          terminalStage,
        })
      : null;

  return {
    action: "status",
    control: {
      type: "llamacpp_campaign_control_surface",
      version: 1,
      autonomy: {
        type: "llamacpp_campaign_autonomy",
        version: 1,
        manifest: {
          path: manifestPath,
          campaignId: "llamacpp-wave-001",
          manifestKey: "manifest-key-001",
          receiptRootPath,
          terminalStage,
        },
        projection: {
          overallState,
          updatedAt: 1_111,
        },
        stages: {
          stage41ExpectedBuilds: 3,
          stage41CompletedBuilds: overallState === "planned_only" ? 0 : 3,
          stage42ExpectedBuilds: 1,
          stage42CompletedBuilds:
            overallState === "stage42_complete" || overallState === "stage43_complete" ? 1 : 0,
          stage43ExpectedBuilds: 1,
          stage43CompletedBuilds: overallState === "stage43_complete" ? 1 : 0,
        },
        lifecycle: {
          phase: completionCandidate ? "terminal_stage_complete" : "stage41_wave",
          terminalStageMaterialized: completionCandidate,
          reason: completionCandidate
            ? "terminal stage is materially complete"
            : "stage 41 remains the next truthful local step",
        },
        nextStep: {
          action: completionCandidate ? "none" : "execute_stage",
          stage: completionCandidate ? null : 41,
          buildId: completionCandidate ? null : "A",
          reason: completionCandidate
            ? "terminal stage is already materially complete"
            : "stage 41 build A is the next truthful local step",
        },
      },
      taskContext: {
        suppliedTaskId: taskId ?? null,
        verificationState,
        verifiedTaskId: verificationState === "verified_live" ? taskId : null,
        reason:
          verificationState === "verified_live"
            ? `verified AK task ${taskId}`
            : verificationState === "not_found"
              ? `supplied taskId ${taskId} did not resolve to a live AK task`
              : verificationState === "verification_unavailable"
                ? `live AK verification for taskId ${taskId} is currently unavailable`
                : "no AK task context was requested",
      },
      akBinding: binding,
      public: {
        taskBound: verificationState === "verified_live" && binding !== null,
        nextStepAction: completionCandidate ? "none" : "advance",
        completionCandidate,
        reason: completionCandidate
          ? `terminal stage ${terminalStage} is materially complete for verified AK task ${taskId}`
          : `stage 41 build A is the next truthful public campaign-control step for verified AK task ${taskId}`,
      },
    },
    projectionPath: path.join(cwd, "autoresearch.llamacpp-campaign.json"),
    projection: {
      type: "llamacpp_campaign_projection",
      version: 1,
      cwd,
      updatedAt: 1_111,
      manifest: {
        path: manifestPath,
        campaignId: "llamacpp-wave-001",
        manifestKey: "manifest-key-001",
        receiptRootPath,
        sourceRepoPath: path.join(cwd, "source"),
        workstationRepoPath: cwd,
        workflowKind: "phasee-41-43",
      },
      status: {
        projectionKind: "derived_from_manifest_and_receipts",
        overallState,
        stale: false,
        staleReason: null,
      },
      builds: [],
    },
    nextAction: completionCandidate
      ? "No further local campaign step exists."
      : "Use autoresearch_llamacpp_campaign_control with action=advance to execute the next truthful local step.",
  };
}

test("observe reuses the package control snapshot and persists the same projection artifact", () => {
  const cwd = "/tmp/manifest-campaign-observe";
  const controlResult = createControlResult({ cwd });
  const supervisor = new AutoresearchManifestCampaignSupervisor({
    now: () => 5_000,
    inspectControl: () => controlResult,
    persistProjection: ({ cwd: observedCwd, projection }) => ({
      path: path.join(observedCwd, "autoresearch.llamacpp-campaign.json"),
      projection,
    }),
  });

  const observation = supervisor.observe({
    cwd,
    manifestPath: controlResult.control.autonomy.manifest.path,
  });

  assert.equal(observation.cwd, cwd);
  assert.equal(observation.observedAt, 5_000);
  assert.equal(observation.projectionPath, path.join(cwd, "autoresearch.llamacpp-campaign.json"));
  assert.equal(observation.controlResult.projectionPath, observation.projectionPath);
  assert.match(observation.nextStep, /Provide an exact taskId/i);
});

test("recordEvidence fails closed when package task verification is not verified_live", async () => {
  const cwd = "/tmp/manifest-campaign-unverified";
  const controlResult = createControlResult({
    cwd,
    taskId: 4201,
    verificationState: "verification_unavailable",
  });
  const supervisor = new AutoresearchManifestCampaignSupervisor({
    inspectControl: () => controlResult,
    persistProjection: ({ cwd: observedCwd, projection }) => ({
      path: path.join(observedCwd, "autoresearch.llamacpp-campaign.json"),
      projection,
    }),
    runAk: async () => {
      throw new Error("runAk must not be called when task verification is unavailable");
    },
  });

  const result = await supervisor.recordEvidence({
    cwd,
    manifestPath: controlResult.control.autonomy.manifest.path,
    taskId: 4201,
  });

  assert.equal(result.ok, false);
  assert.equal(result.action, "blocked");
  assert.match(result.error ?? "", /verified_live task context/i);
});

test("recordEvidence records package-derived evidence exactly once per projection key", async () => {
  const repoRoot = mkdtempSync(path.join(os.tmpdir(), "pi-orch-manifest-campaign-"));
  const cwd = path.join(repoRoot, "campaigns", "wave-001");
  mkdirSync(cwd, { recursive: true });
  const dbPath = createSqliteDb(repoRoot);
  const controlResult = createControlResult({
    cwd,
    taskId: 4201,
    projectionKey: "projection:stage41:A",
  });
  const akCalls = [];
  const supervisor = new AutoresearchManifestCampaignSupervisor({
    akPath: "/tmp/fake-ak",
    societyDb: dbPath,
    inspectControl: () => controlResult,
    persistProjection: ({ cwd: observedCwd, projection }) => ({
      path: path.join(observedCwd, "autoresearch.llamacpp-campaign.json"),
      projection,
    }),
    runAk: async (params) => {
      akCalls.push(params.args.join(" "));
      if (params.args[0] === "task" && params.args[1] === "show") {
        return {
          ok: true,
          stdout: JSON.stringify({
            id: 4201,
            repo: repoRoot,
            status: "claimed",
            entity_version: 7,
          }),
          stderr: "",
        };
      }

      if (params.args[0] === "evidence" && params.args[1] === "record") {
        return {
          ok: false,
          stdout: "",
          stderr: "force sql fallback",
        };
      }

      throw new Error(`Unexpected ak args: ${params.args.join(" ")}`);
    },
  });

  const first = await supervisor.recordEvidence({
    cwd,
    manifestPath: controlResult.control.autonomy.manifest.path,
    taskId: 4201,
  });

  assert.equal(first.ok, true);
  assert.equal(first.action, "recorded");
  assert.equal(first.evidence?.via, "sql-fallback");
  assert.equal(first.task?.repo, repoRoot);

  const rowsAfterFirst = queryRows(
    dbPath,
    [
      "SELECT id, task_id, check_type, result,",
      "json_extract(details, '$.projection_key') AS projection_key,",
      "json_extract(details, '$.milestone') AS milestone",
      "FROM evidence ORDER BY id",
    ].join(" "),
  );
  assert.equal(rowsAfterFirst.length, 1);
  assert.equal(rowsAfterFirst[0].task_id, 4201);
  assert.equal(rowsAfterFirst[0].check_type, "autoresearch:llamacpp-campaign:stage41-complete");
  assert.equal(rowsAfterFirst[0].result, "pass");
  assert.equal(rowsAfterFirst[0].projection_key, "projection:stage41:A");
  assert.equal(rowsAfterFirst[0].milestone, "stage41_complete");

  const second = await supervisor.recordEvidence({
    cwd,
    manifestPath: controlResult.control.autonomy.manifest.path,
    taskId: 4201,
  });

  assert.equal(second.ok, true);
  assert.equal(second.action, "already-projected");
  assert.equal(second.existingEvidenceId, 1);

  const rowsAfterSecond = queryRows(dbPath, "SELECT id FROM evidence ORDER BY id");
  assert.deepEqual(rowsAfterSecond, [{ id: 1 }]);
  assert.deepEqual(akCalls, [
    "task show 4201 -F json",
    `evidence record --check-type autoresearch:llamacpp-campaign:stage41-complete --result pass --task 4201 --details ${JSON.stringify(first.candidate.payload.details)}`,
    "task show 4201 -F json",
  ]);
});

test("recordEvidence stays evidence-only for terminal_stage_complete milestones", async () => {
  const repoRoot = mkdtempSync(path.join(os.tmpdir(), "pi-orch-manifest-terminal-"));
  const cwd = path.join(repoRoot, "campaigns", "wave-terminal");
  mkdirSync(cwd, { recursive: true });
  const dbPath = createSqliteDb(repoRoot);
  const controlResult = createControlResult({
    cwd,
    taskId: 4301,
    overallState: "stage43_complete",
    projectionKey: "projection:terminal:43",
    milestone: "terminal_stage_complete",
    checkType: "autoresearch:llamacpp-campaign:terminal-stage-complete",
    completionCandidate: true,
    terminalStage: 43,
  });
  const akCalls = [];
  const supervisor = new AutoresearchManifestCampaignSupervisor({
    akPath: "/tmp/fake-ak",
    societyDb: dbPath,
    inspectControl: () => controlResult,
    persistProjection: ({ cwd: observedCwd, projection }) => ({
      path: path.join(observedCwd, "autoresearch.llamacpp-campaign.json"),
      projection,
    }),
    runAk: async (params) => {
      akCalls.push(params.args.join(" "));
      if (params.args[0] === "task" && params.args[1] === "show") {
        return {
          ok: true,
          stdout: JSON.stringify({
            id: 4301,
            repo: repoRoot,
            status: "claimed",
          }),
          stderr: "",
        };
      }

      if (params.args[0] === "evidence" && params.args[1] === "record") {
        return {
          ok: false,
          stdout: "",
          stderr: "force sql fallback",
        };
      }

      throw new Error(`Unexpected ak args: ${params.args.join(" ")}`);
    },
  });

  const result = await supervisor.recordEvidence({
    cwd,
    manifestPath: controlResult.control.autonomy.manifest.path,
    taskId: 4301,
  });

  assert.equal(result.ok, true);
  assert.equal(result.action, "recorded");
  assert.equal(result.candidate.payload.binding.ak.milestone, "terminal_stage_complete");
  assert.equal(result.candidate.payload.binding.lifecycle.action, "complete_task_candidate");
  assert.equal(
    akCalls.some((entry) => entry.startsWith("task complete ")),
    false,
    "manifest campaign supervision v1 must stay evidence-only",
  );
  assert.equal(
    akCalls.some((entry) => entry.startsWith("task fail ")),
    false,
    "manifest campaign supervision v1 must not auto-fail tasks",
  );
});

test("candidate derivation blocks repo-agnostic evidence when verified binding is missing", () => {
  const cwd = "/tmp/manifest-campaign-missing-binding";
  const observation = {
    cwd,
    manifestPath: path.join(cwd, "wave.json"),
    taskId: 4401,
    observedAt: 9_999,
    projectionPath: path.join(cwd, "autoresearch.llamacpp-campaign.json"),
    nextStep: "next",
    controlResult: {
      ...createControlResult({ cwd, taskId: 4401 }),
      control: {
        ...createControlResult({ cwd, taskId: 4401 }).control,
        akBinding: null,
      },
    },
  };

  const candidate = deriveAutoresearchManifestCampaignEvidenceCandidate({ observation });
  assert.equal(candidate.kind, "blocked");
  assert.match(candidate.reason, /did not yield a package-derived AK binding/i);
});

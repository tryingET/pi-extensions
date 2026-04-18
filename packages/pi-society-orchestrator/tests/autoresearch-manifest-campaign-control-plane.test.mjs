import assert from "node:assert/strict";
import path from "node:path";
import test from "node:test";
import extension from "../extensions/society-orchestrator.ts";

function createObservation({
  cwd = "/tmp/manifest-supervision",
  manifestPath = path.join(cwd, "llamacpp-wave-001.json"),
  taskId = null,
  overallState = "stage41_complete",
  verificationState = taskId === null ? "not_requested" : "verified_live",
  milestone = taskId === null ? null : "stage41_complete",
} = {}) {
  return {
    cwd,
    manifestPath,
    taskId,
    observedAt: 1_234,
    projectionPath: path.join(cwd, "autoresearch.llamacpp-campaign.json"),
    nextStep:
      taskId === null
        ? "Observation is complete. Provide an exact taskId and re-run with action=record_evidence if bounded AK evidence should be attached."
        : `Exact task ${taskId} is verified. Re-run with action=record_evidence to attach bounded AK evidence for ${milestone}.`,
    controlResult: {
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
            receiptRootPath: path.join(cwd, "receipts"),
            terminalStage: 43,
          },
          projection: {
            overallState,
            updatedAt: 1_234,
          },
          stages: {
            stage41ExpectedBuilds: 3,
            stage41CompletedBuilds: 3,
            stage42ExpectedBuilds: 1,
            stage42CompletedBuilds: 0,
            stage43ExpectedBuilds: 1,
            stage43CompletedBuilds: 0,
          },
          lifecycle: {
            phase: "stage41_wave",
            terminalStageMaterialized: false,
            reason: "stage 41 remains the next truthful local step",
          },
          nextStep: {
            action: "execute_stage",
            stage: 41,
            buildId: "A",
            reason: "stage 41 build A is the next truthful local step",
          },
        },
        taskContext: {
          suppliedTaskId: taskId,
          verificationState,
          verifiedTaskId: verificationState === "verified_live" ? taskId : null,
          reason:
            verificationState === "verified_live"
              ? `verified AK task ${taskId}`
              : "no AK task context was requested",
        },
        akBinding:
          taskId === null
            ? null
            : {
                ak: {
                  milestone,
                  checkType: "autoresearch:llamacpp-campaign:stage41-complete",
                },
                projection: {
                  projectionKey: "projection:stage41:A",
                },
              },
        public: {
          taskBound: taskId !== null,
          nextStepAction: "advance",
          completionCandidate: false,
          reason: "stage 41 build A is the next truthful public campaign-control step",
        },
      },
      projectionPath: path.join(cwd, "autoresearch.llamacpp-campaign.json"),
      projection: {
        type: "llamacpp_campaign_projection",
        version: 1,
        cwd,
        updatedAt: 1_234,
        manifest: {
          path: manifestPath,
          campaignId: "llamacpp-wave-001",
          manifestKey: "manifest-key-001",
          receiptRootPath: path.join(cwd, "receipts"),
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
      nextAction:
        "Use autoresearch_llamacpp_campaign_control with action=advance to execute the next truthful local step.",
    },
  };
}

function registerManifestTool(manifestCampaignSupervisor) {
  const tools = new Map();
  extension(
    {
      registerTool(tool) {
        tools.set(tool.name, tool);
      },
      registerCommand() {},
      on() {},
    },
    { manifestCampaignSupervisor },
  );

  const tool = tools.get("autoresearch_manifest_campaign_supervision");
  assert.ok(tool, "expected autoresearch_manifest_campaign_supervision to register");
  return tool;
}

function createToolContext(cwd = process.cwd()) {
  return { cwd, model: undefined };
}

test("autoresearch_manifest_campaign_supervision observe reports one exact manifest campaign snapshot", async () => {
  const observation = createObservation();
  const tool = registerManifestTool({
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
      manifestPath: observation.manifestPath,
    },
    undefined,
    undefined,
    createToolContext(),
  );

  assert.equal(result.details.ok, true);
  assert.equal(result.details.action, "observe");
  assert.equal(result.details.observation.manifestPath, observation.manifestPath);
  assert.match(result.content[0].text, /Autoresearch manifest campaign supervision — observe/);
  assert.match(result.content[0].text, /Campaign: llamacpp-wave-001/);
  assert.match(result.content[0].text, /Task verification: not_requested/);
});

test("autoresearch_manifest_campaign_supervision requires an exact taskId for record_evidence", async () => {
  const tool = registerManifestTool({
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
      manifestPath: "campaign.json",
    },
    undefined,
    undefined,
    createToolContext(),
  );

  assert.equal(result.details.ok, false);
  assert.equal(result.details.action, "record_evidence");
  assert.match(result.content[0].text, /record_evidence requires an exact taskId/i);
});

test("autoresearch_manifest_campaign_supervision surfaces bounded evidence-only projection results", async () => {
  const observation = createObservation({
    cwd: "/tmp/manifest-recorded",
    taskId: 4201,
  });
  const tool = registerManifestTool({
    observe: () => observation,
    recordEvidence: async () => ({
      ok: true,
      action: "recorded",
      observation,
      candidate: {
        kind: "projectable",
        observation,
        payload: {
          taskId: 4201,
          checkType: "autoresearch:llamacpp-campaign:stage41-complete",
          result: "pass",
          details: { projection_key: "projection:stage41:A" },
          binding: {
            ak: {
              milestone: "stage41_complete",
            },
            lifecycle: {
              action: "evidence_only",
            },
          },
        },
        reason: "stage41 milestone is ready for bounded evidence projection.",
      },
      task: {
        id: 4201,
        repo: "/tmp/repo-root",
      },
      evidence: {
        ok: true,
        via: "ak",
      },
      nextStep:
        "Manifest campaign evidence was recorded via ak. Re-run observe or record_evidence after the package-derived projection changes again.",
    }),
  });

  const result = await tool.execute(
    "tc-3",
    {
      action: "record_evidence",
      cwd: observation.cwd,
      manifestPath: observation.manifestPath,
      taskId: 4201,
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

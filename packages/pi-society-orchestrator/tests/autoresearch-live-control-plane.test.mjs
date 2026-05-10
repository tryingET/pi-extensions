import assert from "node:assert/strict";
import { chmodSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import extension from "../extensions/society-orchestrator.ts";
import { AutoresearchLiveSupervisionRunner } from "../src/runtime/autoresearch-supervisor-runner.ts";

class FakeScheduler {
  #nextId = 1;
  #timers = new Map();

  setTimeout = (callback, delayMs) => {
    const id = this.#nextId++;
    this.#timers.set(id, { callback, delayMs });
    return id;
  };

  clearTimeout = (id) => {
    this.#timers.delete(id);
  };

  pendingCount() {
    return this.#timers.size;
  }

  nextDelayMs() {
    const [first] = this.#timers.values();
    return first?.delayMs ?? null;
  }

  async runNext() {
    const iterator = this.#timers.entries().next();
    assert.equal(iterator.done, false, "expected a scheduled timer");
    const [id, timer] = iterator.value;
    this.#timers.delete(id);
    await timer.callback();
    await new Promise((resolve) => setImmediate(resolve));
  }
}

function createRuntimeStatus(overrides = {}) {
  const {
    currentSegment: currentSegmentOverrides = {},
    runtimeProjection: runtimeProjectionOverrides = {},
    ...rest
  } = overrides;
  const cwd = Object.hasOwn(rest, "cwd") ? rest.cwd : "/tmp/autoresearch-campaign";

  return {
    cwd,
    receiptPath: path.join(cwd, "autoresearch.jsonl"),
    currentSegment: {
      configured: true,
      name: "widget-speed",
      metricName: "total_ms",
      metricUnit: "ms",
      direction: "lower",
      benchmarkCommand: "bash autoresearch.sh",
      checksCommand: "bash autoresearch.checks.sh",
      runCount: 1,
      successfulRunCount: 1,
      baselineMetric: 20,
      bestMetric: 19,
      lastRunStatus: "keep",
      lastRunMetric: 19,
      ...currentSegmentOverrides,
    },
    runtimeProjection: {
      state: "running_checks",
      source: "ledger",
      ledgerPath: path.join(cwd, "autoresearch.events.jsonl"),
      hasLedger: true,
      invalidLedgerLines: 0,
      eventCount: 4,
      replayedEventCount: 4,
      rejectedEvents: [],
      syncIssues: [],
      blockedReason: null,
      completionReason: null,
      ...runtimeProjectionOverrides,
    },
    ...rest,
  };
}

function createFinalizationInspection(cwd, status, overrides = {}) {
  const branches = overrides.createdBranches ?? ["autoresearch/widget-speed-01-core"];
  const plan = Object.hasOwn(overrides, "plan")
    ? overrides.plan
    : {
        type: "finalization_plan",
        version: 1,
        phase: "pi_autoresearch",
        cwd,
        sourceBranch: "feature/widget-speed",
        trunkRef: "main",
        baseRef: "main",
        finalTree: "HEAD",
        goalSlug: "widget-speed",
        segmentKey: "widget-speed",
        runtimeKey: "runtime:widget-speed",
        projectionSource: "ledger",
        createdAt: 1_000,
        decision: {
          templateName: "pi-autoresearch-finalize",
          overallResult: "finalize",
          groupingRationale: ["bounded closure"],
          riskNotes: [],
          cleanupHints: [],
        },
        groups: [],
        groupsJsonDraft: {
          schemaVersion: 1,
          groups: [],
        },
        approval: {
          required: true,
          state: "materialized",
          reason: "operator approved",
          approvedAt: 1_100,
        },
        materialization: {
          status: overrides.materializationStatus ?? "succeeded",
          createdBranches: branches,
          verifiedAt: 1_200,
          failureReason: null,
        },
      };

  return {
    cwd,
    status,
    plan,
    planStatus: {
      path: path.join(cwd, "autoresearch.finalization.json"),
      exists: Boolean(plan),
      reuse: plan ? "current" : "missing",
      discardedReason: null,
      sourceBranch: plan?.sourceBranch ?? null,
      trunkRef: plan?.trunkRef ?? "main",
      baseRef: plan?.baseRef ?? null,
      finalTree: plan?.finalTree ?? null,
      runtimeKey: plan?.runtimeKey ?? null,
    },
    git: {
      sourceBranch: plan?.sourceBranch ?? "feature/widget-speed",
      trunkRef: plan?.trunkRef ?? "main",
      baseRef: plan?.baseRef ?? "main",
      finalTree: plan?.finalTree ?? "HEAD",
    },
    planPath: path.join(cwd, "autoresearch.finalization.json"),
    nextStep: plan
      ? "Finalization plan is materialized."
      : "No finalization plan is available yet.",
  };
}

function createProjectorResult({ action = "recorded", milestone = "decision-required", reason }) {
  return {
    ok: true,
    action,
    candidate: {
      kind: "projectable",
      reason:
        reason ||
        (milestone === "completed"
          ? "Completed milestone evidence was recorded."
          : "Milestone evidence was recorded."),
      payload: {
        details: {
          milestone,
          segment: { name: "widget-speed" },
          runtime: {
            completion_reason: milestone === "completed" ? "campaign finalized" : null,
            run_count: milestone === "completed" ? 4 : 1,
            best_metric: milestone === "completed" ? 18.4 : 19,
          },
        },
      },
    },
  };
}

function registerAutoresearchLiveTool(runner, options = {}) {
  const tools = new Map();
  extension(
    {
      registerTool(tool) {
        tools.set(tool.name, tool);
      },
      registerCommand() {},
      on() {},
    },
    { autoresearchLiveRunner: runner, ...options },
  );

  const tool = tools.get("autoresearch_live_supervision");
  assert.ok(tool, "expected autoresearch_live_supervision to register");
  return tool;
}

function createToolContext(cwd = process.cwd()) {
  return { cwd, model: undefined };
}

async function withTempDir(fn) {
  const cwd = mkdtempSync(path.join(os.tmpdir(), "pi-orch-autoresearch-live-"));
  try {
    await fn(cwd);
  } finally {
    rmSync(cwd, { recursive: true, force: true });
  }
}

function writeExecutable(cwd, name, content) {
  const target = path.join(cwd, name);
  mkdirSync(path.dirname(target), { recursive: true });
  writeFileSync(target, content, "utf8");
  chmodSync(target, 0o755);
}

test("autoresearch_live_supervision lists active sessions and enforces exact identity pairing", async () => {
  const tool = registerAutoresearchLiveTool(new AutoresearchLiveSupervisionRunner());

  const listed = await tool.execute("tc-1", {}, undefined, undefined, createToolContext());
  assert.equal(listed.details.ok, true);
  assert.equal(listed.details.action, "status");
  assert.equal(listed.details.activeSessionCount, 0);
  assert.match(listed.content[0].text, /No active live autoresearch supervision sessions\./);

  const invalid = await tool.execute(
    "tc-2",
    { action: "status", taskId: 1546 },
    undefined,
    undefined,
    createToolContext(),
  );
  assert.equal(invalid.details.ok, false);
  assert.match(invalid.content[0].text, /requires taskId and cwd together/i);
});

test("autoresearch_live_supervision observe reports read-only completion without keeping a session", async () => {
  const cwd = "/tmp/live-observe-complete";
  let observeCalls = 0;
  const runner = new AutoresearchLiveSupervisionRunner({
    observeRuntime: async (observedCwd, options) => {
      observeCalls += 1;
      assert.equal(options.persistSnapshot, false);
      return createRuntimeStatus({
        cwd: observedCwd,
        currentSegment: {
          runCount: 4,
          successfulRunCount: 4,
          baselineMetric: 20,
          bestMetric: 18.4,
          lastRunStatus: "keep",
          lastRunMetric: 18.4,
        },
        runtimeProjection: {
          state: "completed",
          completionReason: "campaign finalized",
        },
      });
    },
    loadLedger: async () => ({ entries: [], invalidLineCount: 0 }),
    projectLedgerEntries: async () => ({
      context: { blockedReason: null, completionReason: "campaign finalized" },
    }),
    inspectFinalization: async ({ cwd: observedCwd, status }) =>
      createFinalizationInspection(observedCwd, status),
    projectMilestone: async () => {
      throw new Error("observe must not project milestones");
    },
    evaluateLifecycle: async () => {
      throw new Error("observe must not evaluate lifecycle");
    },
  });
  const tool = registerAutoresearchLiveTool(runner);

  const observed = await tool.execute(
    "tc-3",
    { action: "observe", taskId: 1546, cwd },
    undefined,
    undefined,
    createToolContext(),
  );

  assert.equal(observed.details.ok, true);
  assert.equal(observed.details.action, "observe");
  assert.equal(observed.details.session.state, "completed");
  assert.equal(observed.details.lifecycle, null);
  assert.equal(observed.details.projector, null);
  assert.match(observed.content[0].text, /Observed runtime state: completed/);
  assert.doesNotMatch(observed.content[0].text, /Lifecycle outcome:/);
  assert.equal(runner.getSession({ taskId: 1546, cwd }), null);
  assert.equal(observeCalls, 1);

  const listed = await tool.execute("tc-4", {}, undefined, undefined, createToolContext());
  assert.equal(listed.details.activeSessionCount, 0);
});

test("autoresearch_live_supervision start/status/stop manages a live running session", async () => {
  const scheduler = new FakeScheduler();
  const cwd = "/tmp/live-running-session";
  const runner = new AutoresearchLiveSupervisionRunner({
    now: (() => {
      let current = 2_000;
      return () => current++;
    })(),
    setTimeout: scheduler.setTimeout,
    clearTimeout: scheduler.clearTimeout,
    observeRuntime: async (observedCwd, options) => {
      assert.equal(options.persistSnapshot, false);
      return createRuntimeStatus({ cwd: observedCwd });
    },
    loadLedger: async () => ({ entries: [], invalidLineCount: 0 }),
    projectLedgerEntries: async () => ({
      context: { blockedReason: null, completionReason: null },
    }),
    inspectFinalization: async ({ cwd: observedCwd, status }) =>
      createFinalizationInspection(observedCwd, status, { plan: null }),
    projectMilestone: async () => createProjectorResult({ milestone: "decision-required" }),
    evaluateLifecycle: async () => ({
      ok: true,
      action: "none",
      summary: "Milestone evidence was recorded.",
    }),
  });
  const tool = registerAutoresearchLiveTool(runner);

  const started = await tool.execute(
    "tc-5",
    { action: "start", taskId: 1546, cwd, intervalSeconds: 45 },
    undefined,
    undefined,
    createToolContext(),
  );

  assert.equal(started.details.ok, true);
  assert.equal(started.details.action, "start");
  assert.equal(started.details.reused, false);
  assert.equal(started.details.session.state, "running");
  assert.match(started.content[0].text, /Reused existing session: no/);
  assert.equal(scheduler.pendingCount(), 1);
  assert.equal(scheduler.nextDelayMs(), 45_000);

  const status = await tool.execute(
    "tc-6",
    { action: "status", taskId: 1546, cwd },
    undefined,
    undefined,
    createToolContext(),
  );
  assert.equal(status.details.ok, true);
  assert.equal(status.details.session.state, "running");
  assert.match(status.content[0].text, /Last runtime state: running_checks/);

  const stopped = await tool.execute(
    "tc-7",
    { action: "stop", taskId: 1546, cwd },
    undefined,
    undefined,
    createToolContext(),
  );
  assert.equal(stopped.details.ok, true);
  assert.equal(stopped.details.session.state, "stopped");
  assert.equal(stopped.details.stopped, true);
  assert.match(stopped.content[0].text, /Stopped: yes/);
  assert.equal(scheduler.pendingCount(), 0);
});

test("autoresearch_live_supervision start_campaign delegates execution then supervises", async () => {
  await withTempDir(async (cwd) => {
    writeExecutable(cwd, "autoresearch.sh", '#!/usr/bin/env bash\necho "METRIC total_ms=7"\n');
    writeExecutable(cwd, "autoresearch.checks.sh", "#!/usr/bin/env bash\nexit 0\n");
    const scheduler = new FakeScheduler();
    const runner = new AutoresearchLiveSupervisionRunner({
      setTimeout: scheduler.setTimeout,
      clearTimeout: scheduler.clearTimeout,
      observeRuntime: async (observedCwd, options) => {
        assert.equal(observedCwd, cwd);
        assert.equal(options.persistSnapshot, false);
        return createRuntimeStatus({ cwd: observedCwd });
      },
      loadLedger: async () => ({ entries: [], invalidLineCount: 0 }),
      projectLedgerEntries: async () => ({
        context: { blockedReason: null, completionReason: null },
      }),
      inspectFinalization: async ({ cwd: observedCwd, status }) =>
        createFinalizationInspection(observedCwd, status, { plan: null }),
      projectMilestone: async () => createProjectorResult({ milestone: "decision-required" }),
      evaluateLifecycle: async () => ({
        ok: true,
        action: "none",
        summary: "Milestone evidence was recorded.",
      }),
    });
    const tool = registerAutoresearchLiveTool(runner);

    const started = await tool.execute(
      "tc-start-campaign",
      {
        action: "start_campaign",
        taskId: 1546,
        cwd,
        objective: "optimize startup",
        maxIterations: 2,
        maxWallClockMinutes: 5,
        benchmarkCommand: "bash autoresearch.sh",
        checksCommand: "bash autoresearch.checks.sh",
        metricThreshold: 0,
        reconfigure: true,
      },
      undefined,
      undefined,
      createToolContext(cwd),
    );

    assert.equal(started.details.ok, true);
    assert.equal(started.details.action, "start_campaign");
    assert.equal(started.details.campaign.runMode, "bounded_loop");
    assert.equal(started.details.campaign.maxIterations, 2);
    assert.equal(started.details.session.state, "running");
    assert.ok(started.details.poll.observation.oracleEvidence.records.length > 0);
    assert.equal(
      started.details.poll.observation.oracleEvidence.publicationPreflight.sharedOracleMutated,
      false,
    );
    assert.match(started.content[0].text, /Campaign execution is delegated to pi-autoresearch/);
    assert.match(started.content[0].text, /Oracle-ready evidence: \d+ record\(s\)/);
    assert.match(
      started.content[0].text,
      /'dspx' 'oracle' 'autoresearch-evidence' 'publish-preflight'/,
    );
    assert.match(started.content[0].text, /orchestrator does not write Oracle Postgres/);
    assert.match(started.content[0].text, /Direction changes remain proposals/);
    assert.match(
      readFileSync(path.join(cwd, "autoresearch.jsonl"), "utf8"),
      /"status":"candidate"/,
    );
    assert.equal(scheduler.pendingCount(), 1);
  });
});

test("autoresearch_live_supervision plan_candidate_wave prepares visible parallel candidate lanes", async () => {
  const cwd = "/tmp/candidate-wave";
  const runner = new AutoresearchLiveSupervisionRunner();
  const tool = registerAutoresearchLiveTool(runner);
  assert.ok(tool.parameters.properties.candidateCount, "schema exposes candidateCount");
  assert.ok(tool.parameters.properties.candidateObjectives, "schema exposes candidateObjectives");
  assert.ok(
    tool.parameters.properties.candidatePacketDirectory,
    "schema exposes candidatePacketDirectory",
  );
  assert.ok(tool.parameters.properties.parentPeerTarget, "schema exposes parentPeerTarget");

  const result = await tool.execute(
    "tc-plan-candidate-wave",
    {
      action: "plan_candidate_wave",
      taskId: 2674,
      cwd,
      objective: "make autoresearch campaign behavior feel like candidate racing",
      candidateCount: 2,
      candidateObjectives: [
        "Implement a minimal candidate wave planning surface.",
        "Implement a candidate result comparison surface.",
      ],
      parentPeerTarget: "controller-peer-1",
      filesInScope: [
        "packages/pi-society-orchestrator/src/runtime/autoresearch-supervisor-runner.ts",
      ],
      offLimits: ["packages/pi-autoresearch/.autoresearch/**"],
      constraints: ["no hidden peer launch", "owner chooses winners"],
      maxIterations: 1,
      maxWallClockMinutes: 10,
    },
    undefined,
    undefined,
    createToolContext(cwd),
  );

  assert.equal(result.details.ok, true);
  assert.equal(result.details.action, "plan_candidate_wave");
  assert.equal(result.details.candidateWave.kind, "autoresearch.candidate_wave_plan.v1");
  assert.equal(result.details.candidateWave.candidateCount, 2);
  assert.equal(result.details.candidateWave.parentPeerTargetRequired, false);
  assert.equal(result.details.candidateWave.lanes.length, 2);
  assert.match(result.details.candidateWave.lanes[0].candidatePeerCall, /candidate_peer_spawn/);
  assert.match(result.details.candidateWave.lanes[0].candidatePeerCall, /controller-peer-1/);
  assert.match(
    result.details.candidateWave.lanes[0].measurementPlan.join("\n"),
    /autoresearch_candidate_bind/,
  );
  assert.match(
    result.details.candidateWave.lanes[0].measurementPlan.join("\n"),
    /autoresearch_runtime_run/,
  );
  assert.match(
    result.details.candidateWave.lanes[0].measurementPlan.join("\n"),
    /candidate_result_export/,
  );
  assert.doesNotMatch(
    result.details.candidateWave.lanes[0].measurementPlan.join("\n"),
    /candidate-aware benchmark command/,
  );
  assert.match(
    result.details.candidateWave.lanes[0].measurementPlan.join("\n"),
    /\.autoresearch\/candidate-wave\/candidate-01\.candidate-result\.json/,
  );
  assert.equal(
    result.details.candidateWave.lanes[0].candidateResultPacketPath,
    ".autoresearch/candidate-wave/candidate-01.candidate-result.json",
  );
  assert.match(
    result.details.candidateWave.ownerSelection.aggregateReviewCall,
    /review_candidate_wave/,
  );
  assert.deepEqual(result.details.candidateWave.ownerSelection.candidateResultPacketPaths, [
    ".autoresearch/candidate-wave/candidate-01.candidate-result.json",
    ".autoresearch/candidate-wave/candidate-02.candidate-result.json",
  ]);
  assert.equal(
    result.details.candidateWave.management.kind,
    "autoresearch.candidate_wave_management.v1",
  );
  assert.equal(result.details.candidateWave.management.posture, "planned_not_launched");
  assert.equal(result.details.candidateWave.management.expectedLaneCount, 2);
  assert.equal(result.details.candidateWave.management.completedLaneCount, 0);
  assert.equal(result.details.candidateWave.management.finalOnlyScoring, true);
  assert.equal(result.details.candidateWave.management.controllerMeasurementRequired, true);
  assert.deepEqual(
    result.details.candidateWave.management.laneStates.map((lane) => lane.state),
    ["planned", "planned"],
  );
  assert.match(result.content[0].text, /Candidate lanes: 2/);
  assert.match(result.content[0].text, /aggregate review/);
  assert.match(result.content[0].text, /Wave fan-in management/);
  assert.match(result.content[0].text, /final-only scoring: yes/);
  assert.match(result.content[0].text, /controller measurement required: yes/);
  assert.match(result.content[0].text, /This plan does not spawn peers by itself/);
  assert.match(result.content[0].text, /explicit_owner_decision_required|Owner selection/);
});

test("autoresearch_live_supervision plan_candidate_wave rejects packet directories outside autoresearch", async () => {
  const cwd = "/tmp/candidate-wave-bad-packet-dir";
  const runner = new AutoresearchLiveSupervisionRunner();
  const tool = registerAutoresearchLiveTool(runner);

  const result = await tool.execute(
    "tc-plan-candidate-wave-bad-packet-dir",
    {
      action: "plan_candidate_wave",
      taskId: 2722,
      cwd,
      objective: "reject packet path escape",
      candidatePacketDirectory: "../outside",
    },
    undefined,
    undefined,
    createToolContext(cwd),
  );

  assert.equal(result.details.ok, false);
  assert.match(result.details.error, /candidatePacketDirectory must stay under \.autoresearch/);
});

test("autoresearch_live_supervision plan_matrix_campaign makes matrix cells the implementation-wave substrate", async () => {
  const cwd = "/tmp/matrix-campaign";
  const runner = new AutoresearchLiveSupervisionRunner();
  const tool = registerAutoresearchLiveTool(runner);
  assert.ok(tool.parameters.properties.scenarios, "schema exposes scenarios");
  assert.ok(tool.parameters.properties.hypotheses, "schema exposes hypotheses");
  assert.ok(
    tool.parameters.properties.candidateCountPerCell,
    "schema exposes candidateCountPerCell",
  );

  const result = await tool.execute(
    "tc-plan-matrix-campaign",
    {
      action: "plan_matrix_campaign",
      taskId: 2722,
      cwd,
      objective: "dogfood matrix campaigns instead of hand-authored implementation waves",
      direction: "lower",
      scenarios: ["operator happy path", "missing packet recovery"],
      hypotheses: ["cell-scoped candidate waves"],
      candidateCountPerCell: 2,
      parentPeerTarget: "controller-peer-1",
      filesInScope: [
        "packages/pi-society-orchestrator/src/runtime/autoresearch-supervisor-runner.ts",
      ],
      constraints: ["no hidden peer launch"],
      maxIterations: 1,
      maxWallClockMinutes: 10,
    },
    undefined,
    undefined,
    createToolContext(cwd),
  );

  assert.equal(result.details.ok, true);
  assert.equal(result.details.action, "plan_matrix_campaign");
  assert.equal(result.details.matrixCampaign.kind, "autoresearch.matrix_campaign_plan.v1");
  assert.equal(result.details.matrixCampaign.taskId, 2722);
  assert.equal(result.details.matrixCampaign.cells.length, 2);
  assert.equal(result.details.matrixCampaign.candidateCountPerCell, 2);
  assert.equal(
    result.details.matrixCampaign.managedWaveSubstrate.kind,
    "autoresearch.matrix_managed_candidate_wave_substrate.v1",
  );
  assert.equal(result.details.matrixCampaign.managedWaveSubstrate.cellCount, 2);
  assert.equal(result.details.matrixCampaign.managedWaveSubstrate.candidateCountPerCell, 2);
  assert.equal(result.details.matrixCampaign.managedWaveSubstrate.expectedCandidateLaneCount, 4);
  assert.equal(result.details.matrixCampaign.managedWaveSubstrate.finalOnlyScoring, true);
  assert.equal(
    result.details.matrixCampaign.managedWaveSubstrate.controllerMeasurementRequired,
    true,
  );
  assert.equal(
    result.details.matrixCampaign.managedWaveSubstrate.explicitPacketPathsGateSelection,
    true,
  );
  assert.equal(result.details.matrixCampaign.managedWaveSubstrate.cellFanInCalls.length, 2);
  assert.equal(
    result.details.matrixCampaign.implementationWaveSubstrate.posture,
    "dogfood_matrix_replaces_hand_authored_wave_steps",
  );
  assert.equal(
    result.details.matrixCampaign.implementationWaveSubstrate.ownerUiCommand,
    "/autoresearch review",
  );
  assert.equal(
    result.details.matrixCampaign.ownerReview.primaryUi.surface,
    "pi-autoresearch_html_dashboard",
  );
  assert.equal(
    result.details.matrixCampaign.ownerReview.primaryUi.slashCommand,
    "/autoresearch export",
  );
  assert.equal(
    result.details.matrixCampaign.ownerReview.primaryUi.fallbackSlashCommand,
    "/autoresearch overlay",
  );
  assert.match(result.details.matrixCampaign.ownerReview.primaryUi.summary, /HTML dashboard/);
  assert.equal(
    result.details.matrixCampaign.ownerReview.decisionUi.surface,
    "pi-autoresearch_candidate_decision_workbench",
  );
  assert.equal(
    result.details.matrixCampaign.ownerReview.decisionUi.slashCommand,
    "/autoresearch review",
  );
  assert.equal(result.details.matrixCampaign.ownerReview.cellReviewCalls.length, 2);
  assert.match(
    result.details.matrixCampaign.ownerReview.cellReviewCalls[0].reviewCandidateWaveCall,
    /review_candidate_wave/,
  );
  assert.match(
    result.details.matrixCampaign.ownerReview.boundary,
    /existing pi-autoresearch candidate decision workbench/,
  );
  assert.match(
    result.details.matrixCampaign.cells[0].candidatePacketDirectory,
    /^\.autoresearch\/matrix-campaign\/cell-01-01$/,
  );
  assert.deepEqual(result.details.matrixCampaign.cells[0].candidateResultPacketPaths, [
    ".autoresearch/matrix-campaign/cell-01-01/candidate-01.candidate-result.json",
    ".autoresearch/matrix-campaign/cell-01-01/candidate-02.candidate-result.json",
  ]);
  assert.equal(
    result.details.matrixCampaign.cells[0].managedWavePosture,
    "managed_candidate_wave_required",
  );
  assert.match(
    result.details.matrixCampaign.cells[0].fanInGate,
    /missing planned lane packets gate/,
  );
  assert.match(result.details.matrixCampaign.cells[0].planCandidateWaveCall, /plan_candidate_wave/);
  assert.match(
    result.details.matrixCampaign.cells[0].planCandidateWaveCall,
    /candidatePacketDirectory/,
  );
  assert.match(
    result.details.matrixCampaign.cells[0].reviewCandidateWaveCall,
    /review_candidate_wave/,
  );
  assert.match(result.content[0].text, /plan_matrix_campaign/);
  assert.match(result.content[0].text, /2 scenario\(s\) × 1 hypothesis/);
  assert.match(result.content[0].text, /Implementation-wave substrate/);
  assert.match(result.content[0].text, /Managed candidate-wave substrate/);
  assert.match(result.content[0].text, /expected candidate lanes: 4/);
  assert.match(result.content[0].text, /explicit packet paths gate selection: yes/);
  assert.match(result.content[0].text, /owner decision UI: \/autoresearch review/);
  assert.match(result.content[0].text, /Owner review route/);
  assert.match(result.content[0].text, /primary UI: pi-autoresearch_html_dashboard/);
  assert.match(result.content[0].text, /primary UI command: \/autoresearch export/);
  assert.match(result.content[0].text, /primary UI fallback: \/autoresearch overlay/);
  assert.match(
    result.content[0].text,
    /final decision UI: pi-autoresearch_candidate_decision_workbench/,
  );
  assert.match(result.content[0].text, /final decision UI command: \/autoresearch review/);
  assert.match(result.content[0].text, /HTML dashboard/);
  assert.match(result.content[0].text, /cell-01-01 review call:/);
  assert.match(result.content[0].text, /cell-01-01/);
  assert.match(result.content[0].text, /managed wave posture: managed_candidate_wave_required/);
  assert.match(result.content[0].text, /fan-in gate:/);
  assert.match(result.content[0].text, /This matrix plan is a non-mutating/);
});

test("autoresearch_live_supervision review_matrix_campaign aggregates managed cell waves", async () => {
  await withTempDir(async (cwd) => {
    const packetDir = path.join(cwd, ".autoresearch", "matrix-campaign");
    for (const cellId of ["cell-01-01", "cell-02-01"]) {
      for (const [laneId, metric] of [
        ["candidate-01", 1],
        ["candidate-02", 3],
      ]) {
        const packetPath = path.join(packetDir, cellId, `${laneId}.candidate-result.json`);
        mkdirSync(path.dirname(packetPath), { recursive: true });
        writeFileSync(
          packetPath,
          JSON.stringify({
            packetKind: "autoresearch.candidate_result.v1",
            adapterContractVersion: 1,
            cwd,
            campaign: "matrix-review",
            candidate: {
              source: "candidate_peer_spawn",
              worktreePath: path.join(cwd, ".worktrees", `${cellId}-${laneId}`),
              branch: `candidate/${cellId}-${laneId}`,
              baseRef: "HEAD",
              diffSummary: `${cellId} ${laneId}`,
              filesChanged: ["src/runtime/autoresearch-supervisor-runner.ts"],
            },
            candidateRun: {
              iteration: 1,
              status: "candidate",
              runKind: "ordinary",
              empiricalDecisionClass: "candidate_improvement",
              metric,
              description: `Measure ${cellId} ${laneId}`,
              timestamp: 1,
              checks: "pass",
              experiment: {
                hypothesisId: laneId,
                hypothesis: `${cellId} ${laneId}`,
              },
            },
            empiricalDecisionClass: "candidate_improvement",
            resultSummary: `${cellId} ${laneId} improved`,
            closeout: { status: { confidence: 2.1 } },
            adapterBoundary: "packet boundary",
          }),
        );
      }
    }

    const runner = new AutoresearchLiveSupervisionRunner();
    const tool = registerAutoresearchLiveTool(runner);
    const result = await tool.execute(
      "tc-review-matrix-campaign",
      {
        action: "review_matrix_campaign",
        taskId: 2774,
        cwd,
        objective: "aggregate matrix managed cell-wave reviews",
        direction: "lower",
        scenarios: ["operator happy path", "missing planned lane recovery"],
        hypotheses: ["managed fan-in beats loose sidequests"],
        candidateCountPerCell: 2,
      },
      undefined,
      undefined,
      createToolContext(cwd),
    );

    assert.equal(result.details.ok, true);
    assert.equal(result.details.action, "review_matrix_campaign");
    assert.equal(
      result.details.matrixCampaignReview.kind,
      "autoresearch.matrix_campaign_review.v1",
    );
    assert.equal(result.details.matrixCampaignReview.posture, "ready_for_matrix_owner_review");
    assert.equal(result.details.matrixCampaignReview.completedCellCount, 2);
    assert.equal(result.details.matrixCampaignReview.expectedCellCount, 2);
    assert.equal(result.details.matrixCampaignReview.selectedCellCount, 2);
    assert.equal(
      result.details.matrixCampaignReview.ownerReview.primaryUi.surface,
      "pi-autoresearch_html_dashboard",
    );
    assert.equal(
      result.details.matrixCampaignReview.ownerReview.primaryUi.slashCommand,
      "/autoresearch export",
    );
    assert.equal(
      result.details.matrixCampaignReview.ownerReview.decisionUi.slashCommand,
      "/autoresearch review",
    );
    assert.equal(
      result.details.matrixCampaignReview.closeout.kind,
      "autoresearch.matrix_campaign_closeout.v1",
    );
    assert.equal(
      result.details.matrixCampaignReview.closeout.posture,
      "ak_ready_after_owner_review",
    );
    assert.equal(
      result.details.matrixCampaignReview.closeout.evidenceProjection.posture,
      "ready_for_external_projection",
    );
    assert.equal(
      result.details.matrixCampaignReview.closeout.evidenceProjection.requiredAnchor,
      "taskId:2774",
    );
    assert.equal(result.details.matrixCampaignReview.closeout.selectedLanes.length, 2);
    assert.deepEqual(result.details.matrixCampaignReview.closeout.ownerDecisionRoute, {
      dashboardFirst: "/autoresearch export",
      overlayFallback: "/autoresearch overlay",
      finalDecision: "/autoresearch review",
    });
    assert.deepEqual(
      result.details.matrixCampaignReview.cells.map((cell) => cell.selectedLaneId),
      ["candidate-01", "candidate-01"],
    );
    assert.match(result.content[0].text, /review_matrix_campaign/);
    assert.match(result.content[0].text, /ready_for_matrix_owner_review/);
    assert.match(result.content[0].text, /Managed cell reviews/);
    assert.match(result.content[0].text, /Cell progress: 2\/2/);
    assert.match(result.content[0].text, /primary UI command: \/autoresearch export/);
    assert.match(result.content[0].text, /final decision UI command: \/autoresearch review/);
    assert.match(result.content[0].text, /Campaign closeout/);
    assert.match(result.content[0].text, /autoresearch\.matrix_campaign_closeout\.v1/);
    assert.match(
      result.content[0].text,
      /evidence projection: ready_for_external_projection via AK/,
    );
    assert.match(result.content[0].text, /No peer was launched/);
    assert.match(result.content[0].text, /Raw peer messages are communication only/);
  });
});

test("autoresearch_live_supervision review_candidate_wave compares measured lanes for owner selection", async () => {
  const cwd = "/tmp/candidate-wave-review";
  const runner = new AutoresearchLiveSupervisionRunner();
  const tool = registerAutoresearchLiveTool(runner);
  assert.ok(tool.parameters.properties.candidateResults, "schema exposes candidateResults");

  const result = await tool.execute(
    "tc-review-candidate-wave",
    {
      action: "review_candidate_wave",
      taskId: 2674,
      cwd,
      objective: "choose the best campaign-behavior candidate",
      direction: "lower",
      candidateResults: [
        {
          laneId: "candidate-01",
          objective: "minimal plan surface",
          metric: 12,
          status: "candidate_review_ready",
          checksStatus: "pass",
          confidence: 2.3,
        },
        {
          laneId: "candidate-02",
          objective: "review surface",
          metric: 9,
          status: "candidate_review_ready",
          checksStatus: "pass",
          confidence: 1.8,
        },
        {
          laneId: "candidate-03",
          objective: "risky auto-launch",
          metric: 7,
          status: "blocked",
          checksStatus: "pass",
        },
      ],
    },
    undefined,
    undefined,
    createToolContext(cwd),
  );

  assert.equal(result.details.ok, true);
  assert.equal(result.details.action, "review_candidate_wave");
  assert.equal(result.details.candidateWaveReview.kind, "autoresearch.candidate_wave_review.v1");
  assert.equal(result.details.candidateWaveReview.recommendation.laneId, "candidate-02");
  assert.equal(
    result.details.candidateWaveReview.management.kind,
    "autoresearch.candidate_wave_management.v1",
  );
  assert.equal(
    result.details.candidateWaveReview.ownerReviewRoute.primaryUi.surface,
    "pi-autoresearch_html_dashboard",
  );
  assert.equal(
    result.details.candidateWaveReview.ownerReviewRoute.primaryUi.slashCommand,
    "/autoresearch export",
  );
  assert.equal(
    result.details.candidateWaveReview.ownerReviewRoute.decisionUi.slashCommand,
    "/autoresearch review",
  );
  assert.equal(result.details.candidateWaveReview.management.posture, "ready_for_owner_selection");
  assert.equal(result.details.candidateWaveReview.management.completedLaneCount, 3);
  assert.equal(result.details.candidateWaveReview.management.expectedLaneCount, 3);
  assert.deepEqual(
    result.details.candidateWaveReview.management.laneStates.map((lane) => lane.state),
    [
      "measured_exported_selectable",
      "measured_exported_selectable",
      "measured_exported_not_selectable",
    ],
  );
  assert.equal(
    result.details.candidateWaveReview.lanes.find((lane) => lane.laneId === "candidate-03")
      .selectable,
    false,
  );
  assert.match(
    result.details.candidateWaveReview.recommendation.exactNextCalls.join("\n"),
    /autoresearch_candidate_decision/,
  );
  assert.match(
    result.details.candidateWaveReview.recommendation.exactNextCalls.join("\n"),
    /autoresearch_runtime_run/,
  );
  assert.match(result.content[0].text, /Candidate comparison/);
  assert.match(result.content[0].text, /Recommendation: owner_selection_required — candidate-02/);
  assert.match(result.content[0].text, /Wave fan-in management/);
  assert.match(result.content[0].text, /ready_for_owner_selection/);
  assert.match(result.content[0].text, /Owner review route/);
  assert.match(result.content[0].text, /primary UI command: \/autoresearch export/);
  assert.match(result.content[0].text, /final decision UI command: \/autoresearch review/);
  assert.match(result.content[0].text, /Exact next calls/);
  assert.match(result.content[0].text, /not promotion authority|owner approval/);
});

test("autoresearch_live_supervision review_candidate_wave reads candidate result packet paths", async () => {
  await withTempDir(async (cwd) => {
    const packetA = path.join(cwd, "candidate-01.json");
    const packetB = path.join(cwd, "candidate-02.json");
    writeFileSync(
      packetA,
      JSON.stringify({
        packetKind: "autoresearch.candidate_result.v1",
        adapterContractVersion: 1,
        cwd,
        campaign: "candidate-wave",
        candidate: {
          source: "candidate_peer_spawn",
          worktreePath: path.join(cwd, ".worktrees", "candidate-01"),
          branch: "candidate/candidate-01",
          baseRef: "HEAD",
          diffSummary: "first candidate",
          filesChanged: ["src/a.ts"],
        },
        candidateRun: {
          iteration: 1,
          status: "candidate",
          runKind: "ordinary",
          empiricalDecisionClass: "candidate_improvement",
          metric: 15,
          description: "Measure candidate 01",
          timestamp: 1,
          checks: "pass",
          experiment: {
            hypothesisId: "candidate-01",
            hypothesis: "First candidate from packet",
          },
        },
        empiricalDecisionClass: "candidate_improvement",
        resultSummary: "candidate 01 improved",
        closeout: { status: { confidence: 2.1 } },
        adapterBoundary: "packet boundary",
      }),
    );
    writeFileSync(
      packetB,
      JSON.stringify({
        packetKind: "autoresearch.candidate_result.v1",
        adapterContractVersion: 1,
        cwd,
        campaign: "candidate-wave",
        candidate: {
          source: "candidate_peer_spawn",
          worktreePath: path.join(cwd, ".worktrees", "candidate-02"),
          branch: "candidate/candidate-02",
          baseRef: "HEAD",
          diffSummary: "second candidate",
          filesChanged: ["src/b.ts"],
        },
        candidateRun: {
          iteration: 1,
          status: "candidate",
          runKind: "ordinary",
          empiricalDecisionClass: "candidate_improvement",
          metric: 10,
          description: "Measure candidate 02",
          timestamp: 2,
          checks: "pass",
          experiment: {
            hypothesisId: "candidate-02",
            hypothesis: "Second candidate from packet",
          },
        },
        empiricalDecisionClass: "candidate_improvement",
        resultSummary: "candidate 02 improved more",
        closeout: { status: { confidence: 2.4 } },
        adapterBoundary: "packet boundary",
      }),
    );

    const runner = new AutoresearchLiveSupervisionRunner();
    const tool = registerAutoresearchLiveTool(runner);
    assert.ok(
      tool.parameters.properties.candidateResultPacketPaths,
      "schema exposes candidateResultPacketPaths",
    );

    const result = await tool.execute(
      "tc-review-candidate-wave-packets",
      {
        action: "review_candidate_wave",
        taskId: 2674,
        cwd,
        objective: "choose from packetized candidate results",
        direction: "lower",
        candidateResultPacketPaths: [packetA, packetB],
      },
      undefined,
      undefined,
      createToolContext(cwd),
    );

    assert.equal(result.details.ok, true);
    assert.equal(result.details.candidateWaveReview.packetDiscovery.mode, "explicit");
    assert.equal(
      result.details.candidateWaveReview.packetDiscovery.candidateResultPacketPaths.length,
      2,
    );
    assert.equal(result.details.candidateWaveReview.recommendation.laneId, "candidate-02");
    assert.deepEqual(
      result.details.candidateWaveReview.recommendation.ownerDecisionOptions.map(
        (option) => option.optionId,
      ),
      ["plan_keep_recommended", "collect_more_samples", "plan_discard", "plan_rewind"],
    );
    assert.equal(
      result.details.candidateWaveReview.recommendation.ownerDecisionForm.kind,
      "autoresearch.candidate_wave_owner_decision_form.v1",
    );
    assert.equal(
      result.details.candidateWaveReview.recommendation.ownerDecisionForm.recommendedOptionId,
      "plan_keep_recommended",
    );
    assert.equal(
      result.details.candidateWaveReview.recommendation.ownerDecisionForm.options[0].recommended,
      true,
    );
    assert.equal(
      result.details.candidateWaveReview.recommendation.ownerDecisionForm.primaryUi.surface,
      "pi-autoresearch_candidate_decision_workbench",
    );
    assert.equal(
      result.details.candidateWaveReview.recommendation.ownerDecisionForm.primaryUi.slashCommand,
      "/autoresearch review",
    );
    assert.match(
      result.details.candidateWaveReview.recommendation.ownerDecisionForm.primaryUi.exactPreparationCalls.join(
        "\n",
      ),
      /candidateWorktree/,
    );
    assert.equal(
      result.details.candidateWaveReview.recommendation.ownerDecisionForm.interviewQuestions
        .questions[0].id,
      "candidate_wave_owner_decision",
    );
    assert.match(
      result.details.candidateWaveReview.recommendation.ownerDecisionForm.interviewCall,
      /interview/,
    );
    assert.match(
      result.details.candidateWaveReview.recommendation.ownerDecisionForm.interviewCall,
      /candidate_wave_owner_decision/,
    );
    assert.match(
      result.details.candidateWaveReview.recommendation.ownerDecisionOptions[0].exactNextCalls.join(
        "\n",
      ),
      /plan_keep/,
    );
    assert.match(
      result.details.candidateWaveReview.recommendation.ownerDecisionOptions[1].exactNextCalls.join(
        "\n",
      ),
      /candidateWorktree/,
    );
    const candidate02 = result.details.candidateWaveReview.lanes.find(
      (lane) => lane.laneId === "candidate-02",
    );
    assert.equal(candidate02.candidateBranch, "candidate/candidate-02");
    assert.equal(candidate02.candidateBaseRef, "HEAD");
    assert.deepEqual(candidate02.candidateFilesChanged, ["src/b.ts"]);
    assert.equal(candidate02.sourcePacketPath, packetB);
    assert.match(
      result.details.candidateWaveReview.recommendation.exactNextCalls.join("\n"),
      /autoresearch_candidate_bind/,
    );
    assert.match(
      result.details.candidateWaveReview.recommendation.exactNextCalls.join("\n"),
      /candidate\/candidate-02/,
    );
    assert.ok(result.content[0].text.includes(packetB));
    assert.match(result.content[0].text, /candidate: branch=candidate\/candidate-02/);
    assert.match(result.content[0].text, /worktree=.*candidate-02/);
    assert.match(result.content[0].text, /caveat: candidate 02 improved more/);
    assert.match(result.content[0].text, /Packet discovery: explicit/);
    assert.match(result.content[0].text, /Owner decision form/);
    assert.match(
      result.content[0].text,
      /primary UI: pi-autoresearch_candidate_decision_workbench/,
    );
    assert.match(result.content[0].text, /primary UI command: \/autoresearch review/);
    assert.match(result.content[0].text, /fallback interview call: interview/);
    assert.match(result.content[0].text, /candidate_wave_owner_decision/);
    assert.match(result.content[0].text, /Owner decision options/);
    assert.match(result.content[0].text, /plan_keep_recommended/);
    assert.match(result.content[0].text, /collect_more_samples/);
    assert.match(result.content[0].text, /candidate-result packets/);
    assert.match(result.content[0].text, /Exact next calls/);
  });
});

test("autoresearch_live_supervision review_candidate_wave gates explicit incomplete planned lanes", async () => {
  await withTempDir(async (cwd) => {
    const packetA = path.join(cwd, "candidate-01.json");
    const missingPacket = path.join(
      cwd,
      ".autoresearch",
      "candidate-wave",
      "candidate-02.candidate-result.json",
    );
    writeFileSync(
      packetA,
      JSON.stringify({
        packetKind: "autoresearch.candidate_result.v1",
        adapterContractVersion: 1,
        cwd,
        campaign: "candidate-wave",
        candidate: {
          source: "candidate_peer_spawn",
          worktreePath: path.join(cwd, ".worktrees", "candidate-01"),
          branch: "candidate/candidate-01",
          baseRef: "HEAD",
          diffSummary: "first candidate",
          filesChanged: ["src/a.ts"],
        },
        candidateRun: {
          iteration: 1,
          status: "candidate",
          runKind: "ordinary",
          empiricalDecisionClass: "candidate_improvement",
          metric: 1,
          description: "Measure candidate 01",
          timestamp: 1,
          checks: "pass",
          experiment: {
            hypothesisId: "candidate-01",
            hypothesis: "First candidate from packet",
          },
        },
        empiricalDecisionClass: "candidate_improvement",
        resultSummary: "candidate 01 improved",
        closeout: { status: { confidence: 2.1 } },
        adapterBoundary: "packet boundary",
      }),
    );

    const runner = new AutoresearchLiveSupervisionRunner();
    const tool = registerAutoresearchLiveTool(runner);
    const result = await tool.execute(
      "tc-review-candidate-wave-incomplete-explicit",
      {
        action: "review_candidate_wave",
        taskId: 2674,
        cwd,
        objective: "avoid premature owner selection while a planned lane is still missing",
        direction: "lower",
        candidateResultPacketPaths: [packetA, missingPacket],
      },
      undefined,
      undefined,
      createToolContext(cwd),
    );

    assert.equal(result.details.ok, true);
    assert.equal(
      result.details.candidateWaveReview.recommendation.posture,
      "planned_lanes_incomplete",
    );
    assert.equal(result.details.candidateWaveReview.recommendation.laneId, null);
    assert.deepEqual(result.details.candidateWaveReview.recommendation.exactNextCalls, []);
    assert.equal(result.details.candidateWaveReview.recommendation.ownerDecisionForm, null);
    assert.equal(
      result.details.candidateWaveReview.management.posture,
      "waiting_for_planned_lanes",
    );
    assert.equal(result.details.candidateWaveReview.management.completedLaneCount, 1);
    assert.equal(result.details.candidateWaveReview.management.expectedLaneCount, 2);
    assert.deepEqual(
      result.details.candidateWaveReview.management.laneStates.map((lane) => lane.state),
      ["measured_exported_selectable", "packet_missing"],
    );
    const candidate02 = result.details.candidateWaveReview.lanes.find(
      (lane) => lane.laneId === "candidate-02",
    );
    assert.equal(candidate02.status, "missing_packet");
    assert.equal(candidate02.selectable, false);
    assert.equal(candidate02.sourcePacketPath, missingPacket);
    assert.match(result.details.candidateWaveReview.recommendation.reason, /candidate-02/);
    assert.match(result.content[0].text, /Recommendation: planned_lanes_incomplete/);
    assert.match(result.content[0].text, /waiting_for_planned_lanes/);
    assert.match(result.content[0].text, /missing_packet guidance: verify\/export/);
    assert.match(result.content[0].text, /still running\/failed/);
    assert.match(result.content[0].text, /Wait for every explicit planned lane/);
  });
});

test("autoresearch_live_supervision review_candidate_wave rejects invalid empirical/check postures", async () => {
  const cwd = "/tmp/candidate-wave-invalid-postures";
  const runner = new AutoresearchLiveSupervisionRunner();
  const tool = registerAutoresearchLiveTool(runner);

  const result = await tool.execute(
    "tc-review-candidate-wave-invalid-postures",
    {
      action: "review_candidate_wave",
      taskId: 2674,
      cwd,
      objective: "reject invalid candidate-wave postures",
      direction: "lower",
      candidateResults: [
        {
          laneId: "measurement-invalid",
          metric: 1,
          status: "measurement_invalid",
          checksStatus: "pass",
        },
        { laneId: "not-ok", metric: 2, status: "candidate_improvement", checksStatus: "not ok" },
        { laneId: "neutral", metric: 3, status: "candidate_neutral", checksStatus: "pass" },
        { laneId: "unknown", metric: 4, status: "mystery_status", checksStatus: "pass" },
      ],
    },
    undefined,
    undefined,
    createToolContext(cwd),
  );

  assert.equal(result.details.ok, true);
  assert.equal(
    result.details.candidateWaveReview.recommendation.posture,
    "no_selectable_candidate",
  );
  assert.equal(result.details.candidateWaveReview.recommendation.ownerDecisionForm, null);
  assert.deepEqual(
    result.details.candidateWaveReview.lanes.map((lane) => [lane.laneId, lane.selectable]),
    [
      ["measurement-invalid", false],
      ["not-ok", false],
      ["neutral", false],
      ["unknown", false],
    ],
  );
});

test("autoresearch_live_supervision review_candidate_wave discovers default candidate-wave packets", async () => {
  await withTempDir(async (cwd) => {
    const packetDir = path.join(cwd, ".autoresearch", "candidate-wave");
    mkdirSync(packetDir, { recursive: true });
    const packetPath = path.join(packetDir, "candidate-01.candidate-result.json");
    writeFileSync(
      packetPath,
      JSON.stringify({
        packetKind: "autoresearch.candidate_result.v1",
        adapterContractVersion: 1,
        cwd,
        campaign: "candidate-wave",
        candidate: {
          source: "candidate_peer_spawn",
          worktreePath: path.join(cwd, ".worktrees", "candidate-01"),
          branch: "candidate/discovered",
          baseRef: "HEAD",
          diffSummary: "discovered candidate",
          filesChanged: ["src/discovered.ts"],
        },
        candidateRun: {
          iteration: 1,
          status: "candidate",
          runKind: "ordinary",
          empiricalDecisionClass: "candidate_improvement",
          metric: 8,
          description: "Measure discovered candidate",
          timestamp: 1,
          checks: "pass",
          experiment: {
            hypothesisId: "candidate-01",
            hypothesis: "Default discovery candidate from packet",
          },
        },
        empiricalDecisionClass: "candidate_improvement",
        resultSummary: "discovered candidate improved",
        closeout: { status: { confidence: 2.2 } },
        adapterBoundary: "packet boundary",
      }),
    );

    const runner = new AutoresearchLiveSupervisionRunner();
    const tool = registerAutoresearchLiveTool(runner);
    const result = await tool.execute(
      "tc-review-candidate-wave-default-discovery",
      {
        action: "review_candidate_wave",
        taskId: 2674,
        cwd,
        objective: "choose from default candidate-result exports",
        direction: "lower",
      },
      undefined,
      undefined,
      createToolContext(cwd),
    );

    assert.equal(result.details.ok, true);
    assert.equal(result.details.candidateWaveReview.packetDiscovery.mode, "default");
    assert.deepEqual(
      result.details.candidateWaveReview.packetDiscovery.candidateResultPacketPaths,
      [".autoresearch/candidate-wave/candidate-01.candidate-result.json"],
    );
    assert.equal(result.details.candidateWaveReview.recommendation.laneId, "candidate-01");
    assert.match(result.content[0].text, /Packet discovery: default/);
    assert.match(result.content[0].text, /candidate-01\.candidate-result\.json/);
  });
});

test("autoresearch_live_supervision start_campaign forwards DSPx planner handoff options", async () => {
  const cwd = "/tmp/delegated-dspx-campaign";
  const scheduler = new FakeScheduler();
  const campaignCalls = [];
  const runner = new AutoresearchLiveSupervisionRunner({
    setTimeout: scheduler.setTimeout,
    clearTimeout: scheduler.clearTimeout,
    startCampaign: async (input) => {
      campaignCalls.push(input);
      return {
        cwd: path.resolve(cwd),
        objective: input.objective,
        setupMode: input.setupMode,
        runMode: input.runMode,
        maxIterations: input.maxIterations,
        status: createRuntimeStatus({ cwd: path.resolve(cwd) }),
        autoplan: {
          planner: input.planner,
          dspxProgramGen: {
            intentPath: path.join(path.resolve(cwd), ".autoresearch/dspx/intent.yaml"),
            outdir: path.join(path.resolve(cwd), ".autoresearch/dspx/generated"),
            materialized: true,
            command: "just dspx program-gen --intent .autoresearch/dspx/intent.yaml",
            note: "DSPx handoff remains evidence-only.",
          },
          dspxAdvisory: {
            behaviorPath: path.join(path.resolve(cwd), ".autoresearch/dspx/behavior_results.json"),
            available: false,
            status: null,
            matchedObjective: false,
          },
        },
      };
    },
    observeRuntime: async (observedCwd) => createRuntimeStatus({ cwd: observedCwd }),
    loadLedger: async () => ({ entries: [], invalidLineCount: 0 }),
    projectLedgerEntries: async () => ({
      context: { blockedReason: null, completionReason: null },
    }),
    inspectFinalization: async ({ cwd: observedCwd, status }) =>
      createFinalizationInspection(observedCwd, status, { plan: null }),
    projectMilestone: async () => createProjectorResult({ milestone: "decision-required" }),
    evaluateLifecycle: async () => ({ ok: true, action: "none", summary: "no mutation" }),
  });
  const tool = registerAutoresearchLiveTool(runner);
  assert.ok(tool.parameters.properties.filesInScope, "start_campaign schema exposes filesInScope");
  assert.ok(tool.parameters.properties.offLimits, "start_campaign schema exposes offLimits");
  assert.ok(tool.parameters.properties.constraints, "start_campaign schema exposes constraints");

  const result = await tool.execute(
    "tc-start-campaign-dspx",
    {
      action: "start_campaign",
      taskId: 1546,
      cwd,
      objective: "materialize a DSPx planner handoff",
      planner: "dspx_program",
      materializeDspxIntent: true,
      runDspxProgramGen: true,
      dspxProgramGenTimeoutSeconds: 10,
      dspxIntentPath: ".autoresearch/dspx/intent.yaml",
      dspxOutdir: ".autoresearch/dspx/generated",
      dspxBehaviorPath: ".autoresearch/dspx/behavior_results.json",
      metricThreshold: 0,
      reconfigure: true,
      filesInScope: ["packages/pi-autoresearch/src/core/runtime.ts"],
      offLimits: ["packages/pi-autoresearch/autoresearch.runtime.json"],
      constraints: ["bounded orchestrator seam only"],
    },
    undefined,
    undefined,
    createToolContext(cwd),
  );

  assert.equal(campaignCalls.length, 1);
  assert.equal(campaignCalls[0].planner, "dspx_program");
  assert.equal(campaignCalls[0].materializeDspxIntent, true);
  assert.equal(campaignCalls[0].runDspxProgramGen, true);
  assert.equal(campaignCalls[0].dspxProgramGenTimeoutSeconds, 10);
  assert.equal(campaignCalls[0].dspxIntentPath, ".autoresearch/dspx/intent.yaml");
  assert.equal(campaignCalls[0].dspxOutdir, ".autoresearch/dspx/generated");
  assert.equal(campaignCalls[0].dspxBehaviorPath, ".autoresearch/dspx/behavior_results.json");
  assert.equal(campaignCalls[0].metricThreshold, 0);
  assert.equal(campaignCalls[0].reconfigure, true);
  assert.deepEqual(campaignCalls[0].filesInScope, ["packages/pi-autoresearch/src/core/runtime.ts"]);
  assert.deepEqual(campaignCalls[0].offLimits, [
    "packages/pi-autoresearch/autoresearch.runtime.json",
  ]);
  assert.deepEqual(campaignCalls[0].constraints, ["bounded orchestrator seam only"]);
  assert.equal(campaignCalls[0].peerMode, "plan");
  assert.match(result.content[0].text, /Planner: dspx_program/);
  assert.match(result.content[0].text, /DSPx generated DSPy planner assembly/);
  assert.match(result.content[0].text, /orchestrator only requests that bounded seam/);
  assert.equal(scheduler.pendingCount(), 1);
});

test("AutoresearchLiveSupervisionRunner startCampaign pins bounded delegation defaults", async () => {
  const cwd = "/tmp/delegated-campaign";
  const scheduler = new FakeScheduler();
  const campaignCalls = [];
  const runner = new AutoresearchLiveSupervisionRunner({
    setTimeout: scheduler.setTimeout,
    clearTimeout: scheduler.clearTimeout,
    startCampaign: async (input) => {
      campaignCalls.push(input);
      return {
        cwd: path.resolve(cwd),
        objective: input.objective,
        setupMode: input.setupMode,
        runMode: input.runMode,
        maxIterations: input.maxIterations,
        status: createRuntimeStatus({ cwd: path.resolve(cwd) }),
      };
    },
    observeRuntime: async (observedCwd) => createRuntimeStatus({ cwd: observedCwd }),
    loadLedger: async () => ({ entries: [], invalidLineCount: 0 }),
    projectLedgerEntries: async () => ({
      context: { blockedReason: null, completionReason: null },
    }),
    inspectFinalization: async ({ cwd: observedCwd, status }) =>
      createFinalizationInspection(observedCwd, status, { plan: null }),
    projectMilestone: async () => createProjectorResult({ milestone: "decision-required" }),
    evaluateLifecycle: async () => ({ ok: true, action: "none", summary: "no mutation" }),
  });

  const result = await runner.startCampaign({
    taskId: 1546,
    cwd,
    objective: "  trim delegated objective  ",
  });

  assert.equal(campaignCalls.length, 1);
  assert.deepEqual(
    {
      cwd: campaignCalls[0].cwd,
      objective: campaignCalls[0].objective,
      setupMode: campaignCalls[0].setupMode,
      runMode: campaignCalls[0].runMode,
      maxIterations: campaignCalls[0].maxIterations,
      maxWallClockMinutes: campaignCalls[0].maxWallClockMinutes,
      metricThreshold: campaignCalls[0].metricThreshold,
      reconfigure: campaignCalls[0].reconfigure,
      filesInScope: campaignCalls[0].filesInScope,
      offLimits: campaignCalls[0].offLimits,
      constraints: campaignCalls[0].constraints,
      peerMode: campaignCalls[0].peerMode,
    },
    {
      cwd: path.resolve(cwd),
      objective: "trim delegated objective",
      setupMode: "autoplan",
      runMode: "bounded_loop",
      maxIterations: 3,
      maxWallClockMinutes: 30,
      metricThreshold: undefined,
      reconfigure: undefined,
      filesInScope: undefined,
      offLimits: undefined,
      constraints: undefined,
      peerMode: "plan",
    },
  );
  assert.equal(result.supervision.session.state, "running");
  assert.equal(scheduler.pendingCount(), 1);
});

test("AutoresearchLiveSupervisionRunner startCampaign rejects invalid budgets", async () => {
  const runner = new AutoresearchLiveSupervisionRunner({
    startCampaign: async () => {
      throw new Error("startCampaign should not be called for invalid budgets");
    },
  });

  await assert.rejects(
    () =>
      runner.startCampaign({
        taskId: 1546,
        cwd: "/tmp/invalid-autoresearch-budget",
        objective: "budget guard",
        maxIterations: 0,
      }),
    /maxIterations must be a positive integer/,
  );
  await assert.rejects(
    () =>
      runner.startCampaign({
        taskId: 1546,
        cwd: "/tmp/invalid-autoresearch-budget",
        objective: "budget guard",
        maxWallClockMinutes: -1,
      }),
    /maxWallClockMinutes must be a positive number/,
  );
});

test("autoresearch_live_supervision start_campaign requires exact objective", async () => {
  const tool = registerAutoresearchLiveTool(new AutoresearchLiveSupervisionRunner());

  const result = await tool.execute(
    "tc-start-campaign-missing-objective",
    { action: "start_campaign", taskId: 1546, cwd: "/tmp/missing-objective" },
    undefined,
    undefined,
    createToolContext(),
  );

  assert.equal(result.details.ok, false);
  assert.match(result.content[0].text, /requires a non-empty objective/);
});

test("autoresearch_live_supervision surfaces completed live polling truth after a scheduled follow-up tick", async () => {
  const scheduler = new FakeScheduler();
  const cwd = "/tmp/live-follow-up-complete";
  let observeCalls = 0;
  const runner = new AutoresearchLiveSupervisionRunner({
    now: (() => {
      let current = 3_000;
      return () => current++;
    })(),
    setTimeout: scheduler.setTimeout,
    clearTimeout: scheduler.clearTimeout,
    observeRuntime: async (observedCwd, options) => {
      observeCalls += 1;
      assert.equal(options.persistSnapshot, false);
      if (observeCalls === 1) {
        return createRuntimeStatus({ cwd: observedCwd });
      }

      return createRuntimeStatus({
        cwd: observedCwd,
        currentSegment: {
          runCount: 4,
          successfulRunCount: 4,
          baselineMetric: 20,
          bestMetric: 18.4,
          lastRunStatus: "keep",
          lastRunMetric: 18.4,
        },
        runtimeProjection: {
          state: "completed",
          completionReason: "campaign finalized",
        },
      });
    },
    loadLedger: async () => ({ entries: [], invalidLineCount: 0 }),
    projectLedgerEntries: async () => ({
      context: {
        blockedReason: null,
        completionReason: observeCalls >= 2 ? "campaign finalized" : null,
      },
    }),
    inspectFinalization: async ({ cwd: observedCwd, status }) =>
      createFinalizationInspection(observedCwd, status),
    projectMilestone: async ({ observation }) =>
      createProjectorResult({
        milestone:
          observation.runtime.runtimeProjection.state === "completed"
            ? "completed"
            : "decision-required",
      }),
    evaluateLifecycle: async ({ taskId, observation }) => {
      if (observation.runtime.runtimeProjection.state === "completed") {
        return {
          ok: true,
          action: "completed_task",
          summary: `AK task ${taskId} completed after verified local finalization materialization.`,
        };
      }

      return {
        ok: true,
        action: "none",
        summary: "Milestone evidence was recorded.",
      };
    },
  });
  const tool = registerAutoresearchLiveTool(runner);

  const started = await tool.execute(
    "tc-8",
    { action: "start", taskId: 1546, cwd },
    undefined,
    undefined,
    createToolContext(),
  );
  assert.equal(started.details.session.state, "running");
  assert.equal(scheduler.pendingCount(), 1);

  await scheduler.runNext();
  assert.equal(scheduler.pendingCount(), 0, "completed sessions must not reschedule polling");

  const status = await tool.execute(
    "tc-9",
    { action: "status", taskId: 1546, cwd },
    undefined,
    undefined,
    createToolContext(),
  );
  assert.equal(status.details.ok, true);
  assert.equal(status.details.session.state, "completed");
  assert.match(status.content[0].text, /Last lifecycle action: completed_task/);
  assert.match(status.content[0].text, /Next step: Live supervision reached a terminal state/);

  const listed = await tool.execute("tc-10", {}, undefined, undefined, createToolContext());
  assert.equal(listed.details.activeSessionCount, 0);
});

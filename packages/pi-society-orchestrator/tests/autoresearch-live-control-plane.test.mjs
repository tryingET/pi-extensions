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
  assert.match(result.content[0].text, /Candidate lanes: 2/);
  assert.match(result.content[0].text, /This plan does not spawn peers by itself/);
  assert.match(result.content[0].text, /explicit_owner_decision_required|Owner selection/);
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
    result.details.candidateWaveReview.lanes.find((lane) => lane.laneId === "candidate-03")
      .selectable,
    false,
  );
  assert.match(result.content[0].text, /Candidate comparison/);
  assert.match(result.content[0].text, /Recommendation: owner_selection_required — candidate-02/);
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
    assert.equal(result.details.candidateWaveReview.recommendation.laneId, "candidate-02");
    assert.equal(
      result.details.candidateWaveReview.lanes.find((lane) => lane.laneId === "candidate-02")
        .candidateBranch,
      "candidate/candidate-02",
    );
    assert.match(result.content[0].text, /candidate-result packets/);
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

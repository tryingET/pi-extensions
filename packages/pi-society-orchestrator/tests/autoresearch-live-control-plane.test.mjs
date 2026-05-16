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

function createLevel3Manifest(cwd, overrides = {}) {
  return {
    kind: "autoresearch.level3_campaign_manifest.v1",
    campaignId: "level3-slice1-test",
    autonomyLevel: 3,
    taskId: 2996,
    cwd,
    objective: "validate level-3 manifest preflight",
    primaryMetric: {
      name: "level3_manifest_preflight_blockers",
      direction: "lower",
      target: 0,
    },
    filesInScope: [
      "packages/pi-society-orchestrator/src/runtime/autoresearch-supervisor-runner.ts",
    ],
    offLimits: ["packages/pi-toolbox-discovery/**"],
    rollback: ["disable level-3 runner and fall back to level-2 packet surfaces"],
    slices: [{ id: "slice-1", metric: "level3_manifest_preflight_blockers" }],
    policy: {
      launchVisibleCandidatePeers: "token_required",
      runMeasurements: "manifest_allowed",
      exportCandidateResults: "manifest_allowed",
      generateReviewPackets: true,
      prepareFinalizerTokenRequest: true,
      applyFinalizer: "token_required",
      cleanupCandidates: "token_required_or_manifest_allowed",
      recordAkEvidence: "ak_owner_write_required",
      completeAkTask: "ak_owner_write_required",
      mergeReleasePromotion: "promotion_token_required",
    },
    ...overrides,
  };
}

function writeCandidateResultPacket(cwd, packetPath, overrides = {}) {
  const laneId = overrides.laneId ?? "candidate-01";
  mkdirSync(path.dirname(packetPath), { recursive: true });
  writeFileSync(
    packetPath,
    JSON.stringify({
      packetKind: "autoresearch.candidate_result.v1",
      adapterContractVersion: 1,
      cwd,
      campaign: "post-fanin-finalizer-test",
      candidate: {
        source: "candidate_peer_spawn",
        worktreePath: path.join(cwd, ".worktrees", laneId),
        branch: `candidate/${laneId}`,
        baseRef: "HEAD",
        diffSummary: `${laneId} finalizer candidate`,
        filesChanged: overrides.filesChanged ?? [
          "packages/pi-society-orchestrator/src/runtime/autoresearch-supervisor-runner.ts",
        ],
        peerRunId: `candidatepeer-${laneId}`,
        ...overrides.candidate,
      },
      candidateRun: {
        iteration: 1,
        status: "candidate",
        runKind: "ordinary",
        empiricalDecisionClass: "candidate_improvement",
        metric: overrides.metric ?? 1,
        description: `Measure ${laneId}`,
        timestamp: 1,
        checks: overrides.checks ?? "pass",
        experiment: {
          hypothesisId: laneId,
          hypothesis: `${laneId} hypothesis`,
        },
      },
      empiricalDecisionClass: overrides.empiricalDecisionClass ?? "candidate_improvement",
      resultSummary: `${laneId} improved`,
      closeout: { status: { confidence: 2.1 } },
      adapterBoundary: "packet boundary",
    }),
  );
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
    result.details.candidateWave.lanes[0].candidatePeerCall,
    /"workspaceName": "ar-2674-candidate-01-[a-f0-9]{8}"/,
  );
  assert.match(
    result.details.candidateWave.lanes[0].candidatePeerCall,
    /"branchName": "candidatepeer\/ar-2674-candidate-01-[a-f0-9]{8}"/,
  );
  assert.doesNotMatch(
    result.details.candidateWave.lanes[0].candidatePeerCall,
    /make autoresearch campaign behavior feel like candidate racing/,
    "safe workspace/branch names must not reuse the long campaign objective",
  );
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
  assert.equal(
    result.details.candidateWave.management.handoffContract.requiredRunner,
    "candidate_peer_spawn",
  );
  assert.equal(
    result.details.candidateWave.management.handoffContract.handoff,
    "candidate_peer_spawn_to_candidate_worktree",
  );
  assert.equal(
    result.details.candidateWave.management.handoffContract.controllerInlineImplementation,
    "process_violation",
  );
  assert.equal(
    result.details.candidateWave.management.handoffContract.piAutoresearchPeerSpawning,
    "forbidden_below_seam",
  );
  assert.deepEqual(
    result.details.candidateWave.management.handoffContract.requiredMeasurementSequence,
    [
      "candidate_peer_spawn",
      "autoresearch_candidate_bind",
      "autoresearch_runtime_run",
      "candidate_result_export",
      "review_candidate_wave",
    ],
  );
  assert.match(
    result.details.candidateWave.lanes[0].candidatePeerCall,
    /Controller-inline implementation is a process violation/,
  );
  assert.deepEqual(
    result.details.candidateWave.management.laneStates.map((lane) => lane.state),
    ["planned", "planned"],
  );
  assert.match(result.content[0].text, /Candidate lanes: 2/);
  assert.match(result.content[0].text, /aggregate review/);
  assert.match(result.content[0].text, /Wave fan-in management/);
  assert.match(result.content[0].text, /final-only scoring: yes/);
  assert.match(result.content[0].text, /controller measurement required: yes/);
  assert.match(result.content[0].text, /required runner: candidate_peer_spawn/);
  assert.match(result.content[0].text, /controller-inline implementation: process_violation/);
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

test("autoresearch_live_supervision level3_manifest_preflight validates manifest without execution", async () => {
  await withTempDir(async (cwd) => {
    const runner = new AutoresearchLiveSupervisionRunner();
    const tool = registerAutoresearchLiveTool(runner);
    assert.ok(tool.parameters.properties.level3Manifest, "schema exposes level3Manifest");
    assert.ok(tool.parameters.properties.level3ManifestPath, "schema exposes level3ManifestPath");

    const manifest = createLevel3Manifest(cwd);
    const result = await tool.execute(
      "tc-level3-manifest-preflight",
      {
        action: "level3_manifest_preflight",
        taskId: 2996,
        cwd,
        level3Manifest: manifest,
      },
      undefined,
      undefined,
      createToolContext(cwd),
    );

    assert.equal(result.details.ok, true);
    assert.equal(result.details.action, "level3_manifest_preflight");
    const preflight = result.details.level3ManifestPreflight;
    assert.equal(preflight.kind, "autoresearch.level3_campaign_manifest_preflight.v1");
    assert.equal(preflight.manifestKind, "autoresearch.level3_campaign_manifest.v1");
    assert.match(preflight.manifestHash, /^sha256:[0-9a-f]{64}$/);
    assert.equal(preflight.readOnly, true);
    assert.equal(preflight.execution, "not_executed_by_orchestrator");
    assert.equal(preflight.metric.name, "level3_manifest_preflight_blockers");
    assert.equal(preflight.metric.value, 0);
    assert.equal(preflight.cellMetrics.manifestSchemaBlockers.value, 0);
    assert.equal(preflight.cellMetrics.manifestPolicyGateBlockers.value, 0);
    assert.equal(preflight.cellMetrics.manifestPreflightUxBlockers.value, 0);
    assert.equal(preflight.schema.campaignId, "level3-slice1-test");
    assert.equal(preflight.policyGates.length, 10);
    assert.ok(preflight.nonActions.some((item) => /No candidate_peer_spawn/.test(item)));
    assert.ok(preflight.nonActions.some((item) => /No cleanup/.test(item)));
    assert.match(result.content[0].text, /level3_manifest_preflight_blockers: 0/);
    assert.match(result.content[0].text, /Policy gates/);
    assert.match(result.content[0].text, /Level-2 fallback/);
  });
});

test("autoresearch_live_supervision level3_manifest_preflight blocks invalid policy and scope drift", async () => {
  await withTempDir(async (cwd) => {
    const runner = new AutoresearchLiveSupervisionRunner();
    const tool = registerAutoresearchLiveTool(runner);

    const blocked = await tool.execute(
      "tc-level3-manifest-preflight-blocked",
      {
        action: "level3_manifest_preflight",
        taskId: 2996,
        cwd,
        level3Manifest: createLevel3Manifest(cwd, {
          taskId: 1,
          filesInScope: ["packages/pi-toolbox-discovery/src/index.ts"],
          policy: {
            launchVisibleCandidatePeers: true,
            runMeasurements: true,
            exportCandidateResults: true,
            generateReviewPackets: true,
            prepareFinalizerTokenRequest: true,
            applyFinalizer: true,
            cleanupCandidates: true,
            recordAkEvidence: true,
            completeAkTask: true,
            mergeReleasePromotion: true,
          },
        }),
      },
      undefined,
      undefined,
      createToolContext(cwd),
    );

    assert.equal(blocked.details.ok, false);
    const preflight = blocked.details.level3ManifestPreflight;
    assert.equal(preflight.metric.status, "blocked");
    assert.ok(preflight.cellMetrics.manifestSchemaBlockers.value >= 2);
    assert.ok(preflight.cellMetrics.manifestPolicyGateBlockers.value >= 8);
    assert.ok(preflight.blockers.some((item) => /manifest.taskId/.test(item)));
    assert.ok(preflight.blockers.some((item) => /overlaps offLimits/.test(item)));
    assert.ok(
      preflight.blockers.some((item) => /launchVisibleCandidatePeers policy.*invalid/.test(item)),
    );
    assert.ok(preflight.nonActions.some((item) => /No autoresearch measurement/.test(item)));
    assert.match(blocked.content[0].text, /Do not launch peers/);
  });
});

test("autoresearch_live_supervision level3_slice_sequence_dry_run orders slices and emits non-authoritative receipts", async () => {
  await withTempDir(async (cwd) => {
    const runner = new AutoresearchLiveSupervisionRunner();
    const tool = registerAutoresearchLiveTool(runner);
    assert.ok(tool.parameters.properties.level3Manifest, "schema exposes level3Manifest");

    const manifest = createLevel3Manifest(cwd, {
      campaignId: "level3-slice2-test",
      primaryMetric: {
        name: "autonomous_slice_sequence_blockers",
        direction: "lower",
        target: 0,
      },
      slices: [
        {
          id: "slice-1",
          metric: "slice_ordering_blockers",
          requiredPolicyGates: ["generateReviewPackets"],
          cells: [
            { id: "cell-01", metric: "slice_ordering_blockers" },
            { id: "cell-02", dependsOn: ["cell-01"], metric: "dry_run_receipt_blockers" },
          ],
        },
        {
          id: "slice-2",
          dependsOn: ["cell-02"],
          metric: "slice_sequence_recovery_blockers",
        },
      ],
    });

    const result = await tool.execute(
      "tc-level3-slice-sequence-dry-run",
      {
        action: "level3_slice_sequence_dry_run",
        taskId: 2996,
        cwd,
        level3Manifest: manifest,
      },
      undefined,
      undefined,
      createToolContext(cwd),
    );

    assert.equal(result.details.ok, true);
    assert.equal(result.details.action, "level3_slice_sequence_dry_run");
    const dryRun = result.details.level3SliceSequenceDryRun;
    assert.equal(dryRun.kind, "autoresearch.level3_slice_sequence_dry_run.v1");
    assert.equal(dryRun.execution, "not_executed_by_orchestrator");
    assert.equal(dryRun.metric.name, "autonomous_slice_sequence_blockers");
    assert.equal(dryRun.metric.value, 0);
    assert.equal(dryRun.cellMetrics.sliceOrderingBlockers.value, 0);
    assert.equal(dryRun.cellMetrics.dryRunReceiptBlockers.value, 0);
    assert.equal(dryRun.cellMetrics.sliceSequenceRecoveryBlockers.value, 0);
    assert.deepEqual(
      dryRun.orderedStates.map((state) => `${state.order}:${state.cellId}:${state.state}`),
      ["1:cell-01:ready", "2:cell-02:ready", "3:slice-2:ready"],
    );
    assert.equal(dryRun.receipts.length, 3);
    assert.ok(dryRun.receipts.every((receipt) => receipt.nonAuthoritative === true));
    assert.ok(dryRun.receipts.every((receipt) => receipt.durableEvidence === false));
    assert.ok(
      dryRun.receipts.every(
        (receipt) => receipt.kind === "autoresearch.level3_campaign_transition_receipt.v1",
      ),
    );
    assert.match(dryRun.receipts[0].manifestHash, /^sha256:[0-9a-f]{64}$/);
    assert.match(result.content[0].text, /autonomous_slice_sequence_blockers: 0/);
    assert.match(result.content[0].text, /Dry-run transition receipts/);
    assert.match(result.content[0].text, /non-authoritative=yes/);
    assert.match(result.content[0].text, /Level-2 fallback/);
  });
});

test("autoresearch_live_supervision level3_slice_sequence_dry_run fails closed for blocked preflight and missing dependencies", async () => {
  await withTempDir(async (cwd) => {
    const runner = new AutoresearchLiveSupervisionRunner();
    const tool = registerAutoresearchLiveTool(runner);

    const blocked = await tool.execute(
      "tc-level3-slice-sequence-dry-run-blocked",
      {
        action: "level3_slice_sequence_dry_run",
        taskId: 2996,
        cwd,
        level3Manifest: createLevel3Manifest(cwd, {
          taskId: 1,
          slices: [
            { id: "cell-01", metric: "slice_ordering_blockers" },
            { id: "cell-02", dependsOn: ["missing-cell"], metric: "dry_run_receipt_blockers" },
          ],
        }),
      },
      undefined,
      undefined,
      createToolContext(cwd),
    );

    assert.equal(blocked.details.ok, false);
    const dryRun = blocked.details.level3SliceSequenceDryRun;
    assert.equal(dryRun.metric.status, "blocked");
    assert.ok(dryRun.preflight.metric.value > 0);
    assert.ok(dryRun.cellMetrics.sliceOrderingBlockers.value >= 1);
    assert.ok(
      dryRun.orderedStates.some((state) => state.missingDependencies.includes("missing-cell")),
    );
    assert.ok(dryRun.blockers.some((blocker) => /manifest preflight is blocked/.test(blocker)));
    assert.ok(dryRun.blockers.some((blocker) => /missing dependency missing-cell/.test(blocker)));
    assert.match(blocked.content[0].text, /Resolve blocked slice\/cell dependencies/);
    assert.match(blocked.content[0].text, /Safe rerun/);
    assert.match(blocked.content[0].text, /Level-2 fallback/);
    assert.ok(dryRun.nonActions.some((item) => /Dry-run only/.test(item)));
  });
});

test("autoresearch_live_supervision level3_slice_sequence_dry_run withholds lower-plane action calls", async () => {
  await withTempDir(async (cwd) => {
    const runner = new AutoresearchLiveSupervisionRunner();
    const tool = registerAutoresearchLiveTool(runner);

    const result = await tool.execute(
      "tc-level3-slice-sequence-dry-run-no-actions",
      {
        action: "level3_slice_sequence_dry_run",
        taskId: 2996,
        cwd,
        level3Manifest: createLevel3Manifest(cwd, {
          slices: [{ id: "slice-1", metric: "autonomous_slice_sequence_blockers" }],
        }),
      },
      undefined,
      undefined,
      createToolContext(cwd),
    );

    const dryRun = result.details.level3SliceSequenceDryRun;
    const exposedActionText = [
      ...dryRun.nextLegalActions.filter((action) => action !== dryRun.level2FallbackRoute),
      dryRun.safeRerunCommand,
      ...dryRun.orderedStates.map((state) => state.nextLegalAction),
    ].join("\n");
    assert.doesNotMatch(exposedActionText, /candidate_peer_spawn/);
    assert.doesNotMatch(exposedActionText, /autoresearch_runtime_run/);
    assert.doesNotMatch(exposedActionText, /candidate_result_export/);
    assert.doesNotMatch(exposedActionText, /review_candidate_wave|review_matrix_campaign/);
    assert.doesNotMatch(exposedActionText, /finalize_post_fanin/);
    assert.doesNotMatch(exposedActionText, /cleanup/);
    assert.doesNotMatch(exposedActionText, /ak_owner_write|evidence_record/);
    assert.doesNotMatch(exposedActionText, /merge|release|promotion/);
    assert.equal(dryRun.receipts[0].durableEvidence, false);
  });
});

test("autoresearch_live_supervision level3_visible_candidate_lifecycle_plan exposes authorized visible launch and bindings", async () => {
  await withTempDir(async (cwd) => {
    const runner = new AutoresearchLiveSupervisionRunner();
    const tool = registerAutoresearchLiveTool(runner);
    assert.ok(tool.parameters.properties.launchAuthorizationToken, "schema exposes launch token");
    assert.ok(tool.parameters.properties.level3CandidateBindings, "schema exposes bindings");

    const manifest = createLevel3Manifest(cwd, {
      campaignId: "level3-slice3-test",
      primaryMetric: {
        name: "candidate_lifecycle_automation_blockers",
        direction: "lower",
        target: 0,
      },
      candidateLanes: [
        {
          id: "lane-a",
          objective: "Implement visible lifecycle candidate A",
          filesInScope: [
            "packages/pi-society-orchestrator/src/runtime/autoresearch-supervisor-runner.ts",
          ],
          offLimits: ["packages/pi-toolbox-discovery/**"],
        },
        { id: "lane-b", objective: "Implement visible lifecycle candidate B" },
      ],
      policy: {
        launchVisibleCandidatePeers: "manifest_allowed",
        runMeasurements: "manifest_allowed",
        exportCandidateResults: "manifest_allowed",
        generateReviewPackets: true,
        prepareFinalizerTokenRequest: true,
        applyFinalizer: "token_required",
        cleanupCandidates: "token_required_or_manifest_allowed",
        recordAkEvidence: "ak_owner_write_required",
        completeAkTask: "ak_owner_write_required",
        mergeReleasePromotion: "promotion_token_required",
      },
    });

    const result = await tool.execute(
      "tc-level3-visible-candidate-lifecycle-plan",
      {
        action: "level3_visible_candidate_lifecycle_plan",
        taskId: 2996,
        cwd,
        parentPeerTarget: "controller-peer-1",
        level3Manifest: manifest,
        level3CandidateBindings: [
          {
            laneId: "lane-a",
            candidatePeerRunId: "peer-a",
            candidateWorktree: path.join(cwd, ".worktrees", "lane-a"),
            candidateBranch: "candidate/lane-a",
            candidateBaseRef: "HEAD",
          },
          {
            laneId: "lane-b",
            candidatePeerRunId: "peer-b",
            candidateWorktree: path.join(cwd, ".worktrees", "lane-b"),
            candidateBranch: "candidate/lane-b",
            candidateBaseRef: "HEAD",
          },
        ],
      },
      undefined,
      undefined,
      createToolContext(cwd),
    );

    assert.equal(result.details.ok, true);
    assert.equal(result.details.action, "level3_visible_candidate_lifecycle_plan");
    const plan = result.details.level3VisibleCandidateLifecyclePlan;
    assert.equal(plan.kind, "autoresearch.level3_visible_candidate_lifecycle_plan.v1");
    assert.equal(plan.execution, "not_executed_by_orchestrator");
    assert.equal(plan.metric.name, "candidate_lifecycle_automation_blockers");
    assert.equal(plan.metric.value, 0);
    assert.equal(plan.cellMetrics.visibleLaunchPolicyBlockers.value, 0);
    assert.equal(plan.cellMetrics.candidateBindingLifecycleBlockers.value, 0);
    assert.equal(plan.cellMetrics.candidateCleanupPolicyBlockers.value, 0);
    assert.equal(plan.launchAuthorization.posture, "allowed_by_manifest_policy");
    assert.equal(plan.lanes.length, 2);
    assert.ok(
      plan.lanes.every((lane) => lane.launchPosture === "ready_visible_candidate_peer_spawn_call"),
    );
    assert.ok(plan.lanes.every((lane) => /candidate_peer_spawn/.test(lane.candidatePeerCall)));
    assert.ok(
      plan.lanes.every((lane) => lane.bindingPosture === "bound_visible_candidate_worktree"),
    );
    assert.ok(
      plan.lanes.every((lane) => lane.cleanupPosture === "plan_only_cleanup_token_required"),
    );
    assert.match(result.content[0].text, /candidate_lifecycle_automation_blockers: 0/);
    assert.match(result.content[0].text, /candidate_peer_spawn/);
    assert.match(result.content[0].text, /cleanup plan/);
  });
});

test("autoresearch_live_supervision level3_visible_candidate_lifecycle_plan blocks missing launch policy and missing bindings", async () => {
  await withTempDir(async (cwd) => {
    const runner = new AutoresearchLiveSupervisionRunner();
    const tool = registerAutoresearchLiveTool(runner);

    const blocked = await tool.execute(
      "tc-level3-visible-candidate-lifecycle-plan-blocked",
      {
        action: "level3_visible_candidate_lifecycle_plan",
        taskId: 2996,
        cwd,
        parentPeerTarget: "controller-peer-1",
        level3Manifest: createLevel3Manifest(cwd, {
          candidateLanes: [{ id: "lane-a", objective: "blocked lane" }],
        }),
      },
      undefined,
      undefined,
      createToolContext(cwd),
    );

    assert.equal(blocked.details.ok, false);
    const plan = blocked.details.level3VisibleCandidateLifecyclePlan;
    assert.equal(plan.launchAuthorization.posture, "blocked_missing_policy_or_token");
    assert.equal(plan.cellMetrics.visibleLaunchPolicyBlockers.status, "blocked");
    assert.equal(plan.cellMetrics.candidateBindingLifecycleBlockers.status, "blocked");
    assert.equal(plan.lanes[0].candidatePeerCall, null);
    assert.equal(plan.lanes[0].launchPosture, "blocked_missing_launch_policy_or_token");
    assert.equal(plan.lanes[0].bindingPosture, "blocked_missing_binding");
    assert.ok(
      plan.blockers.some((blocker) => /missing accepted launchVisibleCandidatePeers/.test(blocker)),
    );
    assert.ok(plan.blockers.some((blocker) => /missing candidate worktree binding/.test(blocker)));
    assert.match(blocked.content[0].text, /withheld/);
  });
});

test("autoresearch_live_supervision level3_visible_candidate_lifecycle_plan fails closed on duplicate bindings and keeps cleanup plan-only", async () => {
  await withTempDir(async (cwd) => {
    const runner = new AutoresearchLiveSupervisionRunner();
    const tool = registerAutoresearchLiveTool(runner);
    const manifest = createLevel3Manifest(cwd, {
      candidateLanes: [{ id: "lane-a", objective: "duplicate binding lane" }],
      policy: {
        launchVisibleCandidatePeers: "manifest_allowed",
        runMeasurements: "manifest_allowed",
        exportCandidateResults: "manifest_allowed",
        generateReviewPackets: true,
        prepareFinalizerTokenRequest: true,
        applyFinalizer: "token_required",
        cleanupCandidates: "token_required_or_manifest_allowed",
        recordAkEvidence: "ak_owner_write_required",
        completeAkTask: "ak_owner_write_required",
        mergeReleasePromotion: "promotion_token_required",
      },
    });

    const result = await tool.execute(
      "tc-level3-visible-candidate-lifecycle-plan-duplicate-binding",
      {
        action: "level3_visible_candidate_lifecycle_plan",
        taskId: 2996,
        cwd,
        parentPeerTarget: "controller-peer-1",
        level3Manifest: manifest,
        level3CandidateBindings: [
          {
            laneId: "lane-a",
            candidateWorktree: path.join(cwd, ".worktrees", "lane-a-1"),
            candidateBranch: "candidate/lane-a-1",
            candidateBaseRef: "HEAD",
          },
          {
            laneId: "lane-a",
            candidateWorktree: path.join(cwd, ".worktrees", "lane-a-2"),
            candidateBranch: "candidate/lane-a-2",
            candidateBaseRef: "HEAD",
          },
        ],
      },
      undefined,
      undefined,
      createToolContext(cwd),
    );

    const plan = result.details.level3VisibleCandidateLifecyclePlan;
    assert.equal(result.details.ok, false);
    assert.equal(plan.cellMetrics.candidateBindingLifecycleBlockers.status, "blocked");
    assert.equal(plan.lanes[0].bindingPosture, "blocked_duplicate_binding");
    assert.ok(plan.blockers.some((blocker) => /duplicate candidate binding/.test(blocker)));
    assert.ok(plan.nonActions.some((item) => /No candidate_peer_spawn/.test(item)));
    assert.ok(plan.nonActions.some((item) => /No autoresearch_runtime_run/.test(item)));
    assert.ok(plan.boundaries.some((item) => /Cleanup is a plan-only posture/.test(item)));
    assert.ok(
      plan.lanes[0].cleanupPlan.every((item) => !/worktree remove|branch -D|rm -rf/.test(item)),
    );
  });
});

test("autoresearch_live_supervision level3 candidate lifecycle keeps matrix cells first-class", async () => {
  await withTempDir(async (cwd) => {
    const runner = new AutoresearchLiveSupervisionRunner();
    const tool = registerAutoresearchLiveTool(runner);
    const manifest = createLevel3Manifest(cwd, {
      campaignId: "level3-matrix-cell-lanes-test",
      primaryMetric: {
        name: "matrix_cell_autonomy_blockers",
        direction: "lower",
        target: 0,
      },
      matrix: { candidateCountPerCell: 2 },
      slices: [
        {
          id: "slice-matrix",
          cells: [
            {
              id: "cell-a",
              objective: "cell A objective",
              metric: { name: "cell_a_latency_blockers", direction: "lower", target: 0 },
            },
            {
              id: "cell-b",
              objective: "cell B objective",
              metric: { name: "cell_b_quality_score", direction: "higher", target: 10 },
            },
          ],
        },
      ],
      policy: {
        launchVisibleCandidatePeers: "manifest_allowed",
        runMeasurements: "manifest_allowed",
        exportCandidateResults: "manifest_allowed",
        generateReviewPackets: true,
        prepareFinalizerTokenRequest: true,
        applyFinalizer: "token_required",
        cleanupCandidates: "token_required_or_manifest_allowed",
        recordAkEvidence: "ak_owner_write_required",
        completeAkTask: "ak_owner_write_required",
        mergeReleasePromotion: "promotion_token_required",
      },
    });
    const level3CandidateBindings = [
      {
        laneId: "cell-a-candidate-01",
        candidateWorktree: path.join(cwd, ".worktrees", "cell-a-candidate-01"),
        candidateBranch: "candidate/cell-a-candidate-01",
        candidateBaseRef: "HEAD",
      },
      {
        laneId: "cell-a-candidate-02",
        candidateWorktree: path.join(cwd, ".worktrees", "cell-a-candidate-02"),
        candidateBranch: "candidate/cell-a-candidate-02",
        candidateBaseRef: "HEAD",
      },
      {
        laneId: "cell-b-candidate-01",
        candidateWorktree: path.join(cwd, ".worktrees", "cell-b-candidate-01"),
        candidateBranch: "candidate/cell-b-candidate-01",
        candidateBaseRef: "HEAD",
      },
      {
        laneId: "cell-b-candidate-02",
        candidateWorktree: path.join(cwd, ".worktrees", "cell-b-candidate-02"),
        candidateBranch: "candidate/cell-b-candidate-02",
        candidateBaseRef: "HEAD",
      },
    ];
    const result = await tool.execute(
      "tc-level3-matrix-cell-lanes",
      {
        action: "level3_visible_candidate_lifecycle_plan",
        taskId: 2996,
        cwd,
        parentPeerTarget: "controller-peer-1",
        level3Manifest: manifest,
        level3CandidateBindings,
      },
      undefined,
      undefined,
      createToolContext(cwd),
    );
    assert.equal(result.details.ok, true);
    const plan = result.details.level3VisibleCandidateLifecyclePlan;
    assert.deepEqual(
      plan.lanes.map((lane) => `${lane.cellId}:${lane.laneId}:${lane.metricName}`),
      [
        "cell-a:cell-a-candidate-01:cell_a_latency_blockers",
        "cell-a:cell-a-candidate-02:cell_a_latency_blockers",
        "cell-b:cell-b-candidate-01:cell_b_quality_score",
        "cell-b:cell-b-candidate-02:cell_b_quality_score",
      ],
    );
    assert.deepEqual(
      plan.lanes.map((lane) => `${lane.metricDirection}:${lane.metricTarget}`),
      ["lower:0", "lower:0", "higher:10", "higher:10"],
    );
    assert.equal(new Set(plan.lanes.map((lane) => lane.laneId)).size, 4);
    assert.ok(
      plan.lanes.every((lane) => lane.bindingPosture === "bound_visible_candidate_worktree"),
    );
    assert.match(result.content[0].text, /metric: cell_a_latency_blockers/);

    const measure = await tool.execute(
      "tc-level3-matrix-cell-measure-packets",
      {
        action: "level3_measure_export_review_plan",
        taskId: 2996,
        cwd,
        parentPeerTarget: "controller-peer-1",
        level3Manifest: manifest,
        level3CandidateBindings,
      },
      undefined,
      undefined,
      createToolContext(cwd),
    );
    assert.equal(measure.details.ok, true);
    const measurePlan = measure.details.level3MeasureExportReviewPlan;
    assert.deepEqual(
      measurePlan.lanes.map(
        (lane) => `${lane.cellId}:${lane.metricName}:${lane.reviewInputPacketPath}`,
      ),
      [
        "cell-a:cell_a_latency_blockers:.autoresearch/level3-measure-export-review/cell-a/cell-a-candidate-01.candidate-result.json",
        "cell-a:cell_a_latency_blockers:.autoresearch/level3-measure-export-review/cell-a/cell-a-candidate-02.candidate-result.json",
        "cell-b:cell_b_quality_score:.autoresearch/level3-measure-export-review/cell-b/cell-b-candidate-01.candidate-result.json",
        "cell-b:cell_b_quality_score:.autoresearch/level3-measure-export-review/cell-b/cell-b-candidate-02.candidate-result.json",
      ],
    );
    assert.match(measurePlan.lanes[2].runtimeRunCall, /cell_b_quality_score/);
    assert.match(measurePlan.lanes[2].runtimeRunCall, /"direction": "higher"/);
    assert.match(measure.content[0].text, /metric: cell_b_quality_score/);
  });
});

test("autoresearch_live_supervision level3_matrix_cell_runner advances cells through launch measure review and finalizer-plan readiness", async () => {
  await withTempDir(async (cwd) => {
    const runner = new AutoresearchLiveSupervisionRunner();
    const tool = registerAutoresearchLiveTool(runner);
    const manifest = createLevel3Manifest(cwd, {
      campaignId: "level3-unified-runner-test",
      objective: "Final Level-3 autonomy slice: implement unified matrix/cell campaign runner",
      primaryMetric: {
        name: "level3_matrix_cell_runner_blockers",
        direction: "lower",
        target: 0,
      },
      matrix: { candidateCountPerCell: 2 },
      slices: [
        {
          id: "slice-final-level3",
          cells: [
            {
              id: "cell-runner-loop",
              objective: "Implement deterministic runner state transitions",
              metric: { name: "runner_glue_blockers", direction: "lower", target: 0 },
            },
            {
              id: "cell-review-selection",
              objective: "Implement per-cell review selection state",
              metric: { name: "selection_state_blockers", direction: "lower", target: 0 },
            },
          ],
        },
      ],
      policy: {
        launchVisibleCandidatePeers: "manifest_allowed",
        runMeasurements: "manifest_allowed",
        exportCandidateResults: "manifest_allowed",
        generateReviewPackets: true,
        prepareFinalizerTokenRequest: true,
        applyFinalizer: "token_required",
        cleanupCandidates: "token_required_or_manifest_allowed",
        recordAkEvidence: "ak_owner_write_required",
        completeAkTask: "ak_owner_write_required",
        mergeReleasePromotion: "promotion_token_required",
      },
    });

    const launchReady = await tool.execute(
      "tc-level3-matrix-cell-runner-launch-ready",
      {
        action: "level3_matrix_cell_runner",
        taskId: 2996,
        cwd,
        parentPeerTarget: "controller-peer-1",
        level3Manifest: manifest,
      },
      undefined,
      undefined,
      createToolContext(cwd),
    );

    assert.equal(launchReady.details.action, "level3_matrix_cell_runner");
    assert.equal(launchReady.details.ok, false);
    const launchRunner = launchReady.details.level3MatrixCellRunner;
    assert.equal(launchRunner.kind, "autoresearch.level3_matrix_cell_runner.v1");
    assert.equal(launchRunner.cellMetrics.readyToLaunchCells, 2);
    assert.equal(launchRunner.cells.length, 2);
    assert.ok(
      launchRunner.cells.every((cell) => cell.state === "ready_to_launch_visible_candidates"),
    );
    assert.equal(launchRunner.nextLegalActions.length, 4);
    assert.ok(launchRunner.nextLegalActions.every((call) => /candidate_peer_spawn/.test(call)));
    assert.ok(launchRunner.nonActions.some((item) => /did not spawn peers/.test(item)));
    assert.match(launchReady.content[0].text, /level3_matrix_cell_runner_blockers/);

    const bindings = [
      "cell-runner-loop-candidate-01",
      "cell-runner-loop-candidate-02",
      "cell-review-selection-candidate-01",
      "cell-review-selection-candidate-02",
    ].map((laneId) => ({
      laneId,
      candidatePeerRunId: `candidatepeer-${laneId}`,
      candidateWorktree: path.join(cwd, ".worktrees", laneId),
      candidateBranch: `candidate/${laneId}`,
      candidateBaseRef: "HEAD",
    }));

    const measureReady = await tool.execute(
      "tc-level3-matrix-cell-runner-measure-ready",
      {
        action: "level3_matrix_cell_runner",
        taskId: 2996,
        cwd,
        parentPeerTarget: "controller-peer-1",
        level3Manifest: manifest,
        level3CandidateBindings: bindings,
      },
      undefined,
      undefined,
      createToolContext(cwd),
    );
    const measureRunner = measureReady.details.level3MatrixCellRunner;
    assert.equal(measureRunner.cellMetrics.measureExportReadyCells, 2);
    assert.ok(measureRunner.cells.every((cell) => cell.state === "ready_for_measure_export"));
    assert.ok(measureRunner.nextLegalActions.some((call) => /autoresearch_runtime_run/.test(call)));
    assert.ok(measureRunner.nextLegalActions.some((call) => /candidate_result_export/.test(call)));

    for (const binding of bindings) {
      const cellId = binding.laneId.startsWith("cell-runner-loop")
        ? "cell-runner-loop"
        : "cell-review-selection";
      const packetPath = path.join(
        cwd,
        ".autoresearch",
        "level3-measure-export-review",
        cellId,
        `${binding.laneId}.candidate-result.json`,
      );
      writeCandidateResultPacket(cwd, packetPath, {
        laneId: binding.laneId,
        metric: binding.laneId.endsWith("01") ? 1 : 2,
        candidate: {
          worktreePath: binding.candidateWorktree,
          branch: binding.candidateBranch,
          baseRef: binding.candidateBaseRef,
          peerRunId: binding.candidatePeerRunId,
        },
      });
    }

    const selected = await tool.execute(
      "tc-level3-matrix-cell-runner-selected",
      {
        action: "level3_matrix_cell_runner",
        taskId: 2996,
        cwd,
        parentPeerTarget: "controller-peer-1",
        level3Manifest: manifest,
        level3CandidateBindings: bindings,
      },
      undefined,
      undefined,
      createToolContext(cwd),
    );
    const selectedRunner = selected.details.level3MatrixCellRunner;
    assert.equal(selectedRunner.cellMetrics.packetReadyCells, 2);
    assert.equal(selectedRunner.cellMetrics.selectedCells, 2);
    assert.ok(selectedRunner.cells.every((cell) => cell.state === "selected_for_matrix_review"));
    assert.deepEqual(
      selectedRunner.cells.map((cell) => cell.selectedLaneId),
      ["cell-runner-loop-candidate-01", "cell-review-selection-candidate-01"],
    );
    assert.match(selectedRunner.finalizerPlanCall, /level3_authorized_finalizer_cleanup_plan/);
    assert.match(selectedRunner.finalizerPlanCall, /review_matrix_campaign/);
    assert.ok(
      selectedRunner.boundaries.some((boundary) =>
        /launch -> bind -> measure\/export -> review/.test(boundary),
      ),
    );
  });
});

test("autoresearch_live_supervision level3_measure_export_review_plan emits manifest-approved call packets", async () => {
  await withTempDir(async (cwd) => {
    const runner = new AutoresearchLiveSupervisionRunner();
    const tool = registerAutoresearchLiveTool(runner);
    assert.ok(tool.parameters.properties.level3CandidateResultPacketDirectory);
    const manifest = createLevel3Manifest(cwd, {
      primaryMetric: {
        name: "candidate_measure_export_review_blockers",
        direction: "lower",
        target: 0,
      },
      candidateLanes: [{ id: "lane-a", objective: "measure/export/review lane" }],
      policy: {
        launchVisibleCandidatePeers: "manifest_allowed",
        runMeasurements: "manifest_allowed",
        exportCandidateResults: "manifest_allowed",
        generateReviewPackets: true,
        prepareFinalizerTokenRequest: true,
        applyFinalizer: "token_required",
        cleanupCandidates: "token_required_or_manifest_allowed",
        recordAkEvidence: "ak_owner_write_required",
        completeAkTask: "ak_owner_write_required",
        mergeReleasePromotion: "promotion_token_required",
      },
    });
    const result = await tool.execute(
      "tc-level3-measure-export-review-plan",
      {
        action: "level3_measure_export_review_plan",
        taskId: 2996,
        cwd,
        parentPeerTarget: "controller-peer-1",
        level3Manifest: manifest,
        level3CandidateBindings: [
          {
            laneId: "lane-a",
            candidateWorktree: path.join(cwd, ".worktrees", "lane-a"),
            candidateBranch: "candidate/lane-a",
            candidateBaseRef: "HEAD",
          },
        ],
      },
      undefined,
      undefined,
      createToolContext(cwd),
    );
    assert.equal(result.details.ok, true);
    const plan = result.details.level3MeasureExportReviewPlan;
    assert.equal(plan.kind, "autoresearch.level3_measure_export_review_plan.v1");
    assert.equal(plan.execution, "not_executed_by_orchestrator");
    assert.equal(plan.metric.value, 0);
    assert.equal(plan.cellMetrics.measurementPolicyBlockers.value, 0);
    assert.equal(plan.cellMetrics.candidateExportBindingBlockers.value, 0);
    assert.equal(plan.cellMetrics.reviewPacketAuthorityBlockers.value, 0);
    assert.match(plan.lanes[0].runtimeRunCall, /autoresearch_runtime_run/);
    assert.match(plan.lanes[0].candidateResultExportCall, /candidate_result_export/);
    assert.match(plan.aggregateReviewCall, /review_candidate_wave/);
    assert.ok(plan.nonActions.some((item) => /No measurement/.test(item)));
    assert.ok(plan.boundaries.some((item) => /non-authoritative review inputs/.test(item)));
  });
});

test("autoresearch_live_supervision level3_measure_export_review_plan fails closed without manifest policy or bindings", async () => {
  await withTempDir(async (cwd) => {
    const runner = new AutoresearchLiveSupervisionRunner();
    const tool = registerAutoresearchLiveTool(runner);
    const result = await tool.execute(
      "tc-level3-measure-export-review-plan-blocked",
      {
        action: "level3_measure_export_review_plan",
        taskId: 2996,
        cwd,
        parentPeerTarget: "controller-peer-1",
        level3Manifest: createLevel3Manifest(cwd, {
          candidateLanes: [{ id: "lane-a", objective: "blocked measurement lane" }],
          policy: {
            launchVisibleCandidatePeers: "manifest_allowed",
            runMeasurements: "token_required",
            exportCandidateResults: "token_required",
            generateReviewPackets: false,
            prepareFinalizerTokenRequest: true,
            applyFinalizer: "token_required",
            cleanupCandidates: "token_required_or_manifest_allowed",
            recordAkEvidence: "ak_owner_write_required",
            completeAkTask: "ak_owner_write_required",
            mergeReleasePromotion: "promotion_token_required",
          },
        }),
      },
      undefined,
      undefined,
      createToolContext(cwd),
    );
    assert.equal(result.details.ok, false);
    const plan = result.details.level3MeasureExportReviewPlan;
    assert.equal(plan.metric.status, "blocked");
    assert.equal(plan.lanes[0].runtimeRunCall, null);
    assert.equal(plan.lanes[0].candidateResultExportCall, null);
    assert.equal(plan.aggregateReviewCall, null);
    assert.ok(plan.blockers.some((blocker) => /runMeasurements/.test(blocker)));
    assert.ok(plan.blockers.some((blocker) => /missing candidate worktree/.test(blocker)));
    assert.match(result.content[0].text, /withheld/);
  });
});

test("autoresearch_live_supervision level3_authorized_finalizer_cleanup_plan accepts exact finalizer and cleanup tokens", async () => {
  await withTempDir(async (cwd) => {
    const runner = new AutoresearchLiveSupervisionRunner();
    const tool = registerAutoresearchLiveTool(runner);
    assert.ok(tool.parameters.properties.finalizerAuthorizationToken);
    assert.ok(tool.parameters.properties.cleanupAuthorizationToken);
    assert.ok(tool.parameters.properties.cleanupPeerTabsOrSessions);
    assert.ok(tool.parameters.properties.integrationCloseout);
    const packetPath = path.join(
      cwd,
      ".autoresearch",
      "candidate-wave",
      "lane-a.candidate-result.json",
    );
    writeCandidateResultPacket(cwd, packetPath, {
      laneId: "lane-a",
      metric: 1,
      candidate: {
        worktreePath: path.join(cwd, ".worktrees", "lane-a"),
        branch: "candidate/lane-a",
        baseRef: "HEAD",
        peerRunId: "peer-tab-lane-a",
      },
    });
    const reviewedAtEpochMs = Date.now() + 60_000;
    const manifest = createLevel3Manifest(cwd, {
      campaignId: "level3-slice5-token-test",
      taskId: 2996,
      primaryMetric: {
        name: "authorized_finalizer_cleanup_blockers",
        direction: "lower",
        target: 0,
      },
      slices: [
        {
          id: "slice-5",
          metric: "authorized_finalizer_cleanup_blockers",
          cells: [
            { id: "cell-01", metric: "finalizer_token_application_blockers" },
            { id: "cell-02", dependsOn: ["cell-01"], metric: "cleanup_execution_gate_blockers" },
            { id: "cell-03", dependsOn: ["cell-02"], metric: "post_fanin_rollback_blockers" },
          ],
        },
      ],
    });

    const probe = await tool.execute(
      "tc-level3-finalizer-cleanup-probe",
      {
        action: "level3_authorized_finalizer_cleanup_plan",
        taskId: 2996,
        cwd,
        objective: "finalize slice 5 test lane",
        level3Manifest: manifest,
        candidateResultPacketPaths: [packetPath],
        selectedLaneId: "lane-a",
        validation: { command: "npm test", status: "passed", summary: "ok" },
        reviewedAtEpochMs,
        cleanupPeerTabsOrSessions: ["peer-tab-lane-a"],
        cleanupWorktrees: [path.join(cwd, ".worktrees", "lane-a")],
        cleanupBranches: ["candidate/lane-a"],
      },
      undefined,
      undefined,
      createToolContext(cwd),
    );
    assert.equal(probe.details.ok, false);
    const requiredFinalizer =
      probe.details.level3AuthorizedFinalizerCleanupPlan.finalizerAuthorization.requiredToken;
    const requiredCleanup =
      probe.details.level3AuthorizedFinalizerCleanupPlan.cleanupAuthorization.requiredToken;
    assert.match(requiredFinalizer, /level3:finalize_post_fanin:task:2996/);
    assert.match(requiredCleanup, /level3:candidate_cleanup:task:2996/);
    assert.equal(
      probe.details.level3AuthorizedFinalizerCleanupPlan.finalizerApplyCommandPacket,
      null,
    );
    assert.equal(probe.details.level3AuthorizedFinalizerCleanupPlan.cleanupCommandPacket, null);

    const result = await tool.execute(
      "tc-level3-finalizer-cleanup-authorized",
      {
        action: "level3_authorized_finalizer_cleanup_plan",
        taskId: 2996,
        cwd,
        objective: "finalize slice 5 test lane",
        level3Manifest: manifest,
        candidateResultPacketPaths: [packetPath],
        selectedLaneId: "lane-a",
        validation: { command: "npm test", status: "passed", summary: "ok" },
        reviewedAtEpochMs,
        finalizerAuthorizationToken: requiredFinalizer,
        cleanupAuthorizationToken: requiredCleanup,
        cleanupPeerTabsOrSessions: ["peer-tab-lane-a"],
        cleanupWorktrees: [path.join(cwd, ".worktrees", "lane-a")],
        cleanupBranches: ["candidate/lane-a"],
      },
      undefined,
      undefined,
      createToolContext(cwd),
    );

    assert.equal(result.details.ok, true);
    const plan = result.details.level3AuthorizedFinalizerCleanupPlan;
    assert.equal(plan.kind, "autoresearch.level3_authorized_finalizer_cleanup_plan.v1");
    assert.equal(plan.execution, "not_executed_by_orchestrator");
    assert.equal(plan.metric.value, 0);
    assert.equal(plan.cellMetrics.finalizerTokenApplicationBlockers.value, 0);
    assert.equal(plan.cellMetrics.cleanupExecutionGateBlockers.value, 0);
    assert.equal(plan.cellMetrics.postFaninRollbackBlockers.value, 0);
    assert.equal(plan.finalizerAuthorization.suppliedTokenAccepted, true);
    assert.equal(plan.cleanupAuthorization.suppliedTokenAccepted, true);
    assert.ok(plan.finalizerApplyCommandPacket);
    assert.ok(plan.cleanupCommandPacket);
    assert.equal(plan.cleanupCommandPacket.cleanupExecution, "not_executed_by_orchestrator");
    assert.equal(plan.cleanupCommandPacket.cleanupTrigger, "candidate_cleanup_token");
    assert.deepEqual(plan.cleanupCommandPacket.forbiddenPromotionCommandMatches, []);
    const cleanupText = plan.cleanupCommandPacket.exactCommands.join("\n");
    assert.match(cleanupText, /niri msg -j windows/);
    assert.match(cleanupText, /sidequest-pi pi/);
    assert.match(cleanupText, /kill -TERM/);
    assert.match(cleanupText, /worktree remove/);
    assert.match(cleanupText, /branch -D/);
    assert.doesNotMatch(cleanupText, /merge|push|release|pull.request|promotion/i);
    assert.equal(plan.rollbackReceipt.nonAuthoritative, true);
    assert.equal(plan.rollbackReceipt.durableEvidence, false);
    assert.match(result.content[0].text, /level3_authorized_finalizer_cleanup_plan/);
    assert.match(result.content[0].text, /Rollback receipt/);
  });
});

test("autoresearch_live_supervision level3_authorized_finalizer_cleanup_plan blocks wrong or missing finalizer token", async () => {
  await withTempDir(async (cwd) => {
    const runner = new AutoresearchLiveSupervisionRunner();
    const tool = registerAutoresearchLiveTool(runner);
    const packetPath = path.join(
      cwd,
      ".autoresearch",
      "candidate-wave",
      "lane-a.candidate-result.json",
    );
    writeCandidateResultPacket(cwd, packetPath, { laneId: "lane-a" });
    const manifest = createLevel3Manifest(cwd, {
      primaryMetric: {
        name: "authorized_finalizer_cleanup_blockers",
        direction: "lower",
        target: 0,
      },
    });
    const baseParams = {
      action: "level3_authorized_finalizer_cleanup_plan",
      taskId: 2996,
      cwd,
      objective: "finalizer token mismatch test",
      level3Manifest: manifest,
      candidateResultPacketPaths: [packetPath],
      selectedLaneId: "lane-a",
      validation: { command: "npm test", status: "passed" },
      reviewedAtEpochMs: Date.now() + 60_000,
      cleanupPeerTabsOrSessions: ["peer-tab-lane-a"],
      cleanupWorktrees: [path.join(cwd, ".worktrees", "lane-a")],
      cleanupBranches: ["candidate/lane-a"],
    };

    const missing = await tool.execute(
      "tc-level3-finalizer-missing-token",
      baseParams,
      undefined,
      undefined,
      createToolContext(cwd),
    );
    assert.equal(missing.details.ok, false);
    let plan = missing.details.level3AuthorizedFinalizerCleanupPlan;
    assert.equal(plan.finalizerAuthorization.posture, "blocked_missing_token");
    assert.equal(plan.finalizerApplyCommandPacket, null);
    assert.equal(plan.cleanupCommandPacket, null);
    assert.ok(plan.blockers.some((blocker) => /missing exact finalize_post_fanin/.test(blocker)));

    const wrong = await tool.execute(
      "tc-level3-finalizer-wrong-token",
      { ...baseParams, finalizerAuthorizationToken: "wrong-token" },
      undefined,
      undefined,
      createToolContext(cwd),
    );
    assert.equal(wrong.details.ok, false);
    plan = wrong.details.level3AuthorizedFinalizerCleanupPlan;
    assert.equal(plan.finalizerAuthorization.posture, "blocked_wrong_token");
    assert.equal(plan.finalizerApplyCommandPacket, null);
    assert.equal(plan.cleanupCommandPacket, null);
    assert.equal(plan.cleanupAuthorization.posture, "blocked_missing_token_or_exact_policy");
    assert.equal(plan.finalizer.authorizedFinalizerCleanupGate.cleanupAuthorized, false);
    assert.equal(plan.finalizer.authorizedFinalizerCleanupGate.promotionAuthorized, false);
  });
});

test("autoresearch_live_supervision level3_authorized_finalizer_cleanup_plan accepts exact manifest cleanup policy", async () => {
  await withTempDir(async (cwd) => {
    const runner = new AutoresearchLiveSupervisionRunner();
    const tool = registerAutoresearchLiveTool(runner);
    const worktree = path.join(cwd, ".worktrees", "lane-a");
    const packetPath = path.join(
      cwd,
      ".autoresearch",
      "candidate-wave",
      "lane-a.candidate-result.json",
    );
    writeCandidateResultPacket(cwd, packetPath, {
      laneId: "lane-a",
      candidate: { worktreePath: worktree, branch: "candidate/lane-a", baseRef: "HEAD" },
    });
    const manifest = createLevel3Manifest(cwd, {
      primaryMetric: {
        name: "authorized_finalizer_cleanup_blockers",
        direction: "lower",
        target: 0,
      },
      cleanupPolicy: {
        exactPeerTabsOrSessions: ["peer-tab-lane-a"],
        exactWorktrees: [worktree],
        exactBranches: ["candidate/lane-a"],
      },
    });
    const probe = await tool.execute(
      "tc-level3-manifest-cleanup-probe",
      {
        action: "level3_authorized_finalizer_cleanup_plan",
        taskId: 2996,
        cwd,
        objective: "manifest cleanup policy test",
        level3Manifest: manifest,
        candidateResultPacketPaths: [packetPath],
        selectedLaneId: "lane-a",
        validation: { command: "npm test", status: "passed" },
        reviewedAtEpochMs: Date.now() + 60_000,
      },
      undefined,
      undefined,
      createToolContext(cwd),
    );
    const token =
      probe.details.level3AuthorizedFinalizerCleanupPlan.finalizerAuthorization.requiredToken;
    const result = await tool.execute(
      "tc-level3-manifest-cleanup-authorized",
      {
        action: "level3_authorized_finalizer_cleanup_plan",
        taskId: 2996,
        cwd,
        objective: "manifest cleanup policy test",
        level3Manifest: manifest,
        candidateResultPacketPaths: [packetPath],
        selectedLaneId: "lane-a",
        validation: { command: "npm test", status: "passed" },
        reviewedAtEpochMs: Date.now() + 60_000,
        finalizerAuthorizationToken: token,
      },
      undefined,
      undefined,
      createToolContext(cwd),
    );
    const plan = result.details.level3AuthorizedFinalizerCleanupPlan;
    assert.equal(result.details.ok, true);
    assert.equal(plan.cleanupAuthorization.manifestPolicyAccepted, true);
    assert.equal(plan.cleanupAuthorization.posture, "accepted_exact_manifest_policy");
    assert.ok(plan.cleanupCommandPacket);
    assert.equal(plan.cleanupCommandPacket.cleanupTrigger, "exact_manifest_policy");
  });
});

test("autoresearch_live_supervision level3_authorized_finalizer_cleanup_plan auto-enables cleanup after successful integration closeout", async () => {
  await withTempDir(async (cwd) => {
    const runner = new AutoresearchLiveSupervisionRunner();
    const tool = registerAutoresearchLiveTool(runner);
    const worktree = path.join(cwd, ".worktrees", "lane-a");
    const packetPath = path.join(
      cwd,
      ".autoresearch",
      "candidate-wave",
      "lane-a.candidate-result.json",
    );
    writeCandidateResultPacket(cwd, packetPath, {
      laneId: "lane-a",
      candidate: { worktreePath: worktree, branch: "candidate/lane-a", baseRef: "HEAD" },
    });
    const manifest = createLevel3Manifest(cwd, {
      primaryMetric: {
        name: "authorized_finalizer_cleanup_blockers",
        direction: "lower",
        target: 0,
      },
    });
    const baseParams = {
      action: "level3_authorized_finalizer_cleanup_plan",
      taskId: 2996,
      cwd,
      objective: "successful integration closeout cleanup test",
      level3Manifest: manifest,
      candidateResultPacketPaths: [packetPath],
      selectedLaneId: "lane-a",
      validation: { command: "npm test", status: "passed" },
      reviewedAtEpochMs: Date.now() + 60_000,
      cleanupPeerTabsOrSessions: ["peer-tab-lane-a"],
      cleanupWorktrees: [worktree],
      cleanupBranches: ["candidate/lane-a"],
    };
    const probe = await tool.execute(
      "tc-level3-integration-cleanup-probe",
      baseParams,
      undefined,
      undefined,
      createToolContext(cwd),
    );
    const token =
      probe.details.level3AuthorizedFinalizerCleanupPlan.finalizerAuthorization.requiredToken;
    const result = await tool.execute(
      "tc-level3-integration-cleanup-authorized",
      {
        ...baseParams,
        finalizerAuthorizationToken: token,
        integrationCloseout: {
          status: "successful",
          commit: "abc1234",
          summary: "Selected lane integrated and validation passed.",
        },
      },
      undefined,
      undefined,
      createToolContext(cwd),
    );
    const plan = result.details.level3AuthorizedFinalizerCleanupPlan;
    assert.equal(result.details.ok, true);
    assert.equal(plan.cleanupAuthorization.posture, "accepted_successful_integration_closeout");
    assert.equal(plan.integrationCloseout.status, "successful");
    assert.equal(plan.integrationCloseout.commit, "abc1234");
    assert.ok(plan.cleanupCommandPacket);
    assert.equal(plan.cleanupCommandPacket.cleanupTrigger, "successful_integration_closeout");
    assert.equal(
      plan.cleanupCommandPacket.cleanupExecution,
      "ready_for_automatic_controller_cleanup_after_successful_integration_closeout",
    );
    assert.ok(
      plan.cleanupCommandPacket.exactCommands.some((command) =>
        /niri msg -j windows/.test(command),
      ),
    );
    assert.ok(
      plan.cleanupCommandPacket.exactCommands.some((command) => /sidequest-pi pi/.test(command)),
    );
    assert.match(result.content[0].text, /trigger=successful_integration_closeout/);
  });
});

test("autoresearch_live_supervision level3_authorized_finalizer_cleanup_plan blocks dirty off-limits and stale review", async () => {
  await withTempDir(async (cwd) => {
    const runner = new AutoresearchLiveSupervisionRunner();
    const tool = registerAutoresearchLiveTool(runner);
    const packetPath = path.join(
      cwd,
      ".autoresearch",
      "candidate-wave",
      "lane-a.candidate-result.json",
    );
    writeCandidateResultPacket(cwd, packetPath, { laneId: "lane-a" });
    const manifest = createLevel3Manifest(cwd, {
      primaryMetric: {
        name: "authorized_finalizer_cleanup_blockers",
        direction: "lower",
        target: 0,
      },
    });
    const probe = await tool.execute(
      "tc-level3-dirty-stale-probe",
      {
        action: "level3_authorized_finalizer_cleanup_plan",
        taskId: 2996,
        cwd,
        objective: "dirty stale off-limits test",
        level3Manifest: manifest,
        candidateResultPacketPaths: [packetPath],
        selectedLaneId: "lane-a",
        validation: { command: "npm test", status: "passed" },
        dirtyFiles: [
          "packages/pi-society-orchestrator/src/runtime/autoresearch-supervisor-runner.ts",
        ],
        offLimits: ["packages/pi-society-orchestrator/src/runtime/**"],
        reviewedAtEpochMs: 1,
        cleanupPeerTabsOrSessions: ["peer-tab-lane-a"],
        cleanupWorktrees: [path.join(cwd, ".worktrees", "lane-a")],
        cleanupBranches: ["candidate/lane-a"],
      },
      undefined,
      undefined,
      createToolContext(cwd),
    );
    const token =
      probe.details.level3AuthorizedFinalizerCleanupPlan.finalizerAuthorization.requiredToken;
    const cleanup =
      probe.details.level3AuthorizedFinalizerCleanupPlan.cleanupAuthorization.requiredToken;
    const result = await tool.execute(
      "tc-level3-dirty-stale-blocked",
      {
        action: "level3_authorized_finalizer_cleanup_plan",
        taskId: 2996,
        cwd,
        objective: "dirty stale off-limits test",
        level3Manifest: manifest,
        candidateResultPacketPaths: [packetPath],
        selectedLaneId: "lane-a",
        validation: { command: "npm test", status: "passed" },
        dirtyFiles: [
          "packages/pi-society-orchestrator/src/runtime/autoresearch-supervisor-runner.ts",
        ],
        offLimits: ["packages/pi-society-orchestrator/src/runtime/**"],
        reviewedAtEpochMs: 1,
        finalizerAuthorizationToken: token,
        cleanupAuthorizationToken: cleanup,
        cleanupPeerTabsOrSessions: ["peer-tab-lane-a"],
        cleanupWorktrees: [path.join(cwd, ".worktrees", "lane-a")],
        cleanupBranches: ["candidate/lane-a"],
      },
      undefined,
      undefined,
      createToolContext(cwd),
    );
    const plan = result.details.level3AuthorizedFinalizerCleanupPlan;
    assert.equal(result.details.ok, false);
    assert.equal(plan.finalizerApplyCommandPacket, null);
    assert.equal(plan.cleanupCommandPacket, null);
    assert.equal(plan.metric.status, "blocked");
    assert.ok(
      plan.finalizer.preflight.checks.some(
        (check) => check.name === "dirty_overlap_clean" && check.status === "blocked",
      ),
    );
    assert.ok(
      plan.finalizer.preflight.checks.some(
        (check) => check.name === "off_limits_clean" && check.status === "blocked",
      ),
    );
    assert.ok(
      plan.finalizer.preflight.checks.some(
        (check) => check.name === "review_artifacts_current" && check.status === "blocked",
      ),
    );
    assert.equal(plan.rollbackReceipt.nonAuthoritative, true);
    assert.match(result.content[0].text, /rollback hint/i);
  });
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
      metricName: "operator_ux_blockers",
      metricThreshold: 0,
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
  const planFollowup = result.details.matrixCampaign.operatorFollowup;
  assert.equal(planFollowup.kind, "autoresearch.matrix_campaign_operator_followup.v1");
  assert.equal(
    planFollowup.currentState,
    "planned_matrix_campaign_waiting_for_visible_candidate_lane_launch",
  );
  assert.equal(planFollowup.primaryMetric.name, "operator_ux_blockers");
  assert.equal(planFollowup.primaryMetric.target, 0);
  assert.equal(planFollowup.level2PacketPlanningBlockers.name, "level2_packet_planning_blockers");
  assert.equal(planFollowup.level2PacketPlanningBlockers.value, 0);
  assert.deepEqual(planFollowup.level2PacketPlanningBlockers.missingTokens, []);
  assert.match(planFollowup.level2PacketPlanningBlockers.level1Fallback, /plan_candidate_wave/);
  assert.equal(planFollowup.lanePacketPaths.length, 4);
  assert.deepEqual(
    planFollowup.blockersChecklist.map((item) => item.proof),
    [
      "operator follow-up/current-state summary",
      "next legal actions",
      "cell primary metric operator_ux_blockers",
      "runner checkpoint and lineage verification coverage",
      "exact per-cell controller sequence / next-call bundle coverage",
      "no hidden execution or promotion boundary coverage",
      "docs/tests alignment for manual_controller_glue_blockers",
    ],
  );
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
  assert.equal(
    result.details.matrixCampaign.managedWaveSubstrate.handoffContract.requiredRunner,
    "candidate_peer_spawn",
  );
  assert.equal(
    result.details.matrixCampaign.managedWaveSubstrate.handoffContract
      .controllerInlineImplementation,
    "process_violation",
  );
  assert.equal(
    result.details.matrixCampaign.managedWaveSubstrate.handoffContract.piAutoresearchPeerSpawning,
    "forbidden_below_seam",
  );
  assert.equal(result.details.matrixCampaign.managedWaveSubstrate.cellFanInCalls.length, 2);
  const level2PacketPlanning = result.details.matrixCampaign.level2PacketPlanning;
  assert.equal(level2PacketPlanning.kind, "autoresearch.level2_packet_planning.v1");
  assert.equal(level2PacketPlanning.packetOnly, true);
  assert.equal(level2PacketPlanning.execution, "not_executed_by_orchestrator");
  assert.equal(level2PacketPlanning.metric.name, "level2_packet_planning_blockers");
  assert.equal(level2PacketPlanning.metric.value, 0);
  assert.equal(level2PacketPlanning.metric.status, "target_met");
  assert.deepEqual(
    Object.values(level2PacketPlanning.tokenVocabulary).map((entry) => entry.tokenName),
    [
      "launch_visible_candidate_lanes",
      "finalize_post_fanin",
      "ak_owner_write",
      "candidate_cleanup",
      "promotion",
    ],
  );
  assert.equal(
    level2PacketPlanning.packets.launchVisibleCandidateLanes.posture,
    "blocked_missing_launch_token",
  );
  assert.equal(
    level2PacketPlanning.packets.launchVisibleCandidateLanes.execution,
    "not_executed_by_orchestrator",
  );
  assert.deepEqual(level2PacketPlanning.packets.launchVisibleCandidateLanes.launchCalls, []);
  assert.equal(level2PacketPlanning.packets.launchVisibleCandidateLanes.withheldLaunchCallCount, 4);
  assert.equal(
    result.details.matrixCampaign.implementationWaveSubstrate.posture,
    "dogfood_matrix_replaces_hand_authored_wave_steps",
  );
  assert.equal(
    result.details.matrixCampaign.implementationWaveSubstrate.ownerUiCommand,
    "/autoresearch review",
  );
  assert.equal(
    result.details.matrixCampaign.implementationWaveSubstrate.handoffContract.handoff,
    "candidate_peer_spawn_to_candidate_worktree",
  );
  assert.equal(
    result.details.matrixCampaign.implementationWaveSubstrate.handoffContract.controllerRole,
    "plan_launch_bind_measure_review_only",
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
  assert.match(result.content[0].text, /Operator follow-up\/current-state summary/);
  assert.match(result.content[0].text, /cell primary metric: operator_ux_blockers/);
  assert.match(result.content[0].text, /level2_packet_planning_blockers: 0/);
  assert.match(result.content[0].text, /Missing token list: none/);
  assert.match(result.content[0].text, /Level-1 fallback:.*plan_candidate_wave/);
  assert.match(result.content[0].text, /next legal actions/);
  assert.match(result.content[0].text, /Managed candidate-wave substrate/);
  assert.match(result.content[0].text, /expected candidate lanes: 4/);
  assert.match(result.content[0].text, /explicit packet paths gate selection: yes/);
  assert.match(result.content[0].text, /Level-2 packet-only planning/);
  assert.match(result.content[0].text, /launch token: launch_visible_candidate_lanes/);
  assert.match(result.content[0].text, /finalizer token: finalize_post_fanin/);
  assert.match(result.content[0].text, /evidence token: ak_owner_write/);
  assert.match(result.content[0].text, /cleanup token: candidate_cleanup/);
  assert.match(result.content[0].text, /promotion token: promotion/);
  assert.match(result.content[0].text, /withheld launch calls: 4/);
  assert.match(result.content[0].text, /required runner: candidate_peer_spawn/);
  assert.match(result.content[0].text, /handoff: candidate_peer_spawn_to_candidate_worktree/);
  assert.match(result.content[0].text, /controller-inline implementation: process_violation/);
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

test("autoresearch_live_supervision plan_matrix_campaign fails closed against level-2 packet-only narrowing", async () => {
  const cwd = "/tmp/matrix-campaign-anti-narrowing";
  const runner = new AutoresearchLiveSupervisionRunner();
  const tool = registerAutoresearchLiveTool(runner);

  const blocked = await tool.execute(
    "tc-plan-matrix-campaign-anti-narrowing-blocked",
    {
      action: "plan_matrix_campaign",
      taskId: 2910,
      cwd,
      objective: "level-2 packet-only planning closure",
      metricName: "level2_packet_planning_blockers",
      metricThreshold: 0,
      scenarios: ["proof-only closure"],
      hypotheses: ["baseline-only target"],
      candidateCountPerCell: 1,
      constraints: ["no hidden peer launch"],
    },
    undefined,
    undefined,
    createToolContext(cwd),
  );

  assert.equal(blocked.details.ok, true);
  const blockedAntiNarrowing = blocked.details.matrixCampaign.managedWaveSubstrate.antiNarrowing;
  assert.equal(blockedAntiNarrowing.kind, "autoresearch.level2_packet_planning_anti_narrowing.v1");
  assert.equal(blockedAntiNarrowing.posture, "blocked_anti_narrowing");
  assert.equal(blockedAntiNarrowing.blockerMetric.name, "level2_packet_planning_blockers");
  assert.equal(blockedAntiNarrowing.blockerMetric.status, "blocked");
  assert.equal(blocked.details.matrixCampaign.level2PacketPlanning.metric.status, "blocked");
  assert.equal(
    blocked.details.matrixCampaign.operatorFollowup.level2PacketPlanningBlockers.status,
    "blocked",
  );
  assert.equal(blockedAntiNarrowing.proofOnlyBaselineOnlyTargetClosureBlocked, true);
  assert.equal(blockedAntiNarrowing.targetClosureAllowed, false);
  assert.deepEqual(blockedAntiNarrowing.proofOnlyBaselineOnlyLaneKeys, ["cell-01-01"]);
  assert.match(
    blocked.details.matrixCampaign.nextStep,
    /Resolve level-2 packet-only planning blockers/,
  );

  const downgraded = await tool.execute(
    "tc-plan-matrix-campaign-anti-narrowing-downgraded",
    {
      action: "plan_matrix_campaign",
      taskId: 2911,
      cwd,
      objective: "level-2 packet-only planning closure",
      metricName: "level2_packet_planning_blockers",
      metricThreshold: 0,
      scenarios: ["proof-only closure"],
      hypotheses: ["baseline-only target"],
      candidateCountPerCell: 1,
      constraints: ["explicit downgrade: packet-only planning report, not target closure"],
    },
    undefined,
    undefined,
    createToolContext(cwd),
  );

  const downgradedAntiNarrowing =
    downgraded.details.matrixCampaign.managedWaveSubstrate.antiNarrowing;
  assert.equal(downgradedAntiNarrowing.posture, "explicit_downgrade_recorded");
  assert.equal(downgradedAntiNarrowing.blockerMetric.status, "target_met");
  assert.equal(downgradedAntiNarrowing.explicitDowngradeRecorded, true);
  assert.equal(downgradedAntiNarrowing.targetClosureAllowed, false);

  const incompleteException = await tool.execute(
    "tc-plan-matrix-campaign-anti-narrowing-incomplete-exception",
    {
      action: "plan_matrix_campaign",
      taskId: 2912,
      cwd,
      objective: "level-2 packet-only planning closure",
      metricName: "level2_packet_planning_blockers",
      metricThreshold: 0,
      scenarios: ["proof-only closure"],
      hypotheses: ["baseline-only target"],
      candidateCountPerCell: 1,
      constraints: ["incomplete-matrix exception: owner accepted proof/baseline-only slice"],
    },
    undefined,
    undefined,
    createToolContext(cwd),
  );

  const exceptionAntiNarrowing =
    incompleteException.details.matrixCampaign.managedWaveSubstrate.antiNarrowing;
  assert.equal(exceptionAntiNarrowing.posture, "incomplete_matrix_exception_recorded");
  assert.equal(exceptionAntiNarrowing.blockerMetric.value, 0);
  assert.equal(exceptionAntiNarrowing.incompleteMatrixExceptionRecorded, true);
  assert.equal(exceptionAntiNarrowing.targetClosureAllowed, true);

  const duplicated = await tool.execute(
    "tc-plan-matrix-campaign-anti-narrowing-duplicate-lane",
    {
      action: "plan_matrix_campaign",
      taskId: 2913,
      cwd,
      objective: "level-2 packet-only planning closure",
      metricName: "level2_packet_planning_blockers",
      metricThreshold: 0,
      scenarios: ["operator happy path", "operator happy path"],
      hypotheses: ["candidate breadth"],
      candidateCountPerCell: 1,
    },
    undefined,
    undefined,
    createToolContext(cwd),
  );

  const duplicateAntiNarrowing =
    duplicated.details.matrixCampaign.managedWaveSubstrate.antiNarrowing;
  assert.equal(duplicateAntiNarrowing.posture, "failed_closed_missing_or_duplicate_lanes");
  assert.equal(duplicateAntiNarrowing.blockerMetric.status, "blocked");
  assert.deepEqual(duplicateAntiNarrowing.duplicateLaneKeys, ["scenario:operator_happy_path"]);
});

test("autoresearch_live_supervision prepare_matrix_campaign_runner exposes only visible peer launch before checkpoint", async () => {
  const cwd = "/tmp/matrix-campaign-runner";
  const runner = new AutoresearchLiveSupervisionRunner();
  const tool = registerAutoresearchLiveTool(runner);
  assert.ok(tool.parameters.properties.runnerManifestPath, "schema exposes runnerManifestPath");
  assert.ok(
    tool.parameters.properties.checkpointConfirmation,
    "schema exposes checkpointConfirmation",
  );

  const result = await tool.execute(
    "tc-prepare-matrix-campaign-runner",
    {
      action: "prepare_matrix_campaign_runner",
      taskId: 2801,
      cwd,
      objective: "checkpoint matrix campaign runner",
      direction: "lower",
      metricName: "operator_ux_blockers",
      metricThreshold: 0,
      scenarios: ["safety"],
      hypotheses: ["checkpointed launch"],
      candidateCountPerCell: 2,
      parentPeerTarget: "controller-peer-1",
      runnerManifestPath: ".autoresearch/matrix-campaign/checkpoint-runner.json",
      filesInScope: [
        "packages/pi-society-orchestrator/src/runtime/autoresearch-supervisor-runner.ts",
      ],
      constraints: ["do not auto benchmark"],
      maxIterations: 1,
      maxWallClockMinutes: 5,
    },
    undefined,
    undefined,
    createToolContext(cwd),
  );

  assert.equal(result.details.ok, true);
  assert.equal(result.details.action, "prepare_matrix_campaign_runner");
  const contract = result.details.matrixCampaignRunner;
  assert.equal(contract.kind, "autoresearch.matrix_campaign_runner_contract.v1");
  assert.equal(
    contract.operatorFollowup.currentState,
    "prepared_runner_waiting_for_visible_candidate_peers",
  );
  assert.equal(contract.operatorFollowup.primaryMetric.name, "operator_ux_blockers");
  assert.equal(contract.operatorFollowup.checkpointState.posture, "controller_checkpoint_required");
  assert.equal(
    contract.operatorFollowup.measurementReviewState.posture,
    "locked_until_controller_checkpoint",
  );
  assert.equal(contract.operatorFollowup.lanePacketPaths.length, 2);
  assert.equal(contract.operatorFollowup.lanePacketPaths[0].state, "locked_until_checkpoint");
  assert.equal(contract.operatorFollowup.nextLegalActions.length, 3);
  assert.equal(contract.manifest.identityAnchor, `2801|${path.resolve(cwd)}`);
  assert.equal(contract.manifest.path, ".autoresearch/matrix-campaign/checkpoint-runner.json");
  assert.equal(contract.manifest.exactTaskId, 2801);
  assert.equal(contract.manifest.exactCwd, cwd);
  assert.equal(contract.manifest.candidateLaneCount, 2);
  assert.equal(contract.launchPhase.posture, "ready_to_launch_visible_candidate_peers");
  assert.equal(contract.launchPhase.allowedTool, "candidate_peer_spawn");
  assert.equal(contract.launchPhase.launchCalls.length, 2);
  assert.equal(
    contract.launchPhase.visibleCandidateLaneBinding.name,
    "visible_candidate_lane_binding_blockers",
  );
  assert.equal(contract.launchPhase.visibleCandidateLaneBinding.value, 0);
  assert.equal(contract.launchPhase.visibleCandidateLaneBinding.status, "target_met");
  assert.equal(contract.launchPhase.visibleCandidateLaneBinding.expectedLaneCount, 2);
  assert.equal(contract.launchPhase.visibleCandidateLaneBinding.visibleLaunchCallCount, 2);
  assert.equal(contract.launchPhase.visibleCandidateLaneBinding.hiddenLaunchCallCount, 0);
  assert.equal(contract.launchPhase.visibleCandidateLaneBinding.missingParentPeerTarget, false);
  assert.match(contract.launchPhase.launchCalls[0], /candidate_peer_spawn/);
  assert.doesNotMatch(contract.launchPhase.launchCalls[0], /autoresearch_runtime_run/);
  assert.equal(
    contract.checkpointGate.posture,
    "controller_checkpoint_required_before_benchmark_export_review",
  );
  assert.match(contract.checkpointGate.requiredToken, /task:2801/);
  assert.match(
    contract.checkpointGate.requiredToken,
    /manifest:\.autoresearch\/matrix-campaign\/checkpoint-runner\.json/,
  );
  assert.equal(contract.checkpointGate.confirmationParameter, "checkpointConfirmation");
  assert.deepEqual(contract.checkpointGate.blockedUntilConfirmed, [
    "autoresearch_candidate_bind",
    "autoresearch_runtime_run",
    "candidate_result_export",
    "review_candidate_wave",
    "review_matrix_campaign",
  ]);
  assert.equal(contract.lockedBenchmarkExportReview.posture, "withheld_until_checkpoint");
  assert.deepEqual(contract.lockedBenchmarkExportReview.calls, []);
  assert.match(contract.checkpointGate.exactCheckpointCall, /checkpoint_matrix_campaign_runner/);
  assert.match(result.content[0].text, /prepare_matrix_campaign_runner/);
  assert.match(result.content[0].text, /Operator follow-up\/current-state summary/);
  assert.match(result.content[0].text, /checkpoint state: controller_checkpoint_required/);
  assert.match(result.content[0].text, /benchmark\/export\/review calls exposed: no/);
  assert.match(result.content[0].text, /Runner manifest/);
  assert.match(result.content[0].text, /allowed tool: candidate_peer_spawn/);
  assert.match(result.content[0].text, /visible_candidate_lane_binding_blockers: 0/);
  assert.match(result.content[0].text, /visible launch calls: 2\/2/);
  assert.match(result.content[0].text, /hidden launch calls: 0/);
  assert.match(
    result.content[0].text,
    /benchmark\/export\/review calls: withheld_until_checkpoint; count=0/,
  );
  assert.match(result.content[0].text, /exact task id: 2801/);

  const missingParent = await tool.execute(
    "tc-prepare-matrix-campaign-runner-missing-parent",
    {
      action: "prepare_matrix_campaign_runner",
      taskId: 2801,
      cwd,
      objective: "checkpoint matrix campaign runner",
      direction: "lower",
      scenarios: ["safety"],
      hypotheses: ["checkpointed launch"],
      candidateCountPerCell: 1,
      runnerManifestPath: ".autoresearch/matrix-campaign/checkpoint-runner.json",
    },
    undefined,
    undefined,
    createToolContext(cwd),
  );
  assert.equal(
    missingParent.details.matrixCampaignRunner.launchPhase.visibleCandidateLaneBinding.status,
    "blocked",
  );
  assert.equal(
    missingParent.details.matrixCampaignRunner.launchPhase.visibleCandidateLaneBinding.value,
    1,
  );
  assert.equal(
    missingParent.details.matrixCampaignRunner.launchPhase.visibleCandidateLaneBinding
      .missingParentPeerTarget,
    true,
  );

  const invalidPath = await tool.execute(
    "tc-prepare-matrix-campaign-runner-invalid-path",
    {
      action: "prepare_matrix_campaign_runner",
      taskId: 2801,
      cwd,
      objective: "checkpoint matrix campaign runner",
      scenarios: ["safety"],
      hypotheses: ["checkpointed launch"],
      runnerManifestPath: "../outside.json",
    },
    undefined,
    undefined,
    createToolContext(cwd),
  );
  assert.equal(invalidPath.details.ok, false);
  assert.match(invalidPath.content[0].text, /runnerManifestPath must be a repo-relative file/);
});

test("autoresearch_live_supervision checkpoint_matrix_campaign_runner gates benchmark export review calls", async () => {
  const cwd = "/tmp/matrix-campaign-runner-checkpoint";
  const runner = new AutoresearchLiveSupervisionRunner();
  const tool = registerAutoresearchLiveTool(runner);
  const baseRequest = {
    action: "checkpoint_matrix_campaign_runner",
    taskId: 2802,
    cwd,
    objective: "checkpoint matrix campaign runner",
    direction: "lower",
    metricName: "manual_controller_glue_blockers",
    metricThreshold: 0,
    scenarios: ["safety"],
    hypotheses: ["checkpointed launch"],
    candidateCountPerCell: 1,
    parentPeerTarget: "controller-peer-1",
    runnerManifestPath: ".autoresearch/matrix-campaign/checkpoint-runner.json",
  };

  const blocked = await tool.execute(
    "tc-checkpoint-matrix-campaign-runner-blocked",
    baseRequest,
    undefined,
    undefined,
    createToolContext(cwd),
  );

  assert.equal(blocked.details.ok, true);
  assert.equal(blocked.details.action, "checkpoint_matrix_campaign_runner");
  assert.equal(blocked.details.matrixCampaignRunnerCheckpoint.checkpointAccepted, false);
  assert.equal(
    blocked.details.matrixCampaignRunnerCheckpoint.posture,
    "blocked_until_exact_controller_checkpoint",
  );
  assert.deepEqual(blocked.details.matrixCampaignRunnerCheckpoint.benchmarkExportReviewCalls, []);
  assert.equal(blocked.details.matrixCampaignRunnerCheckpoint.reviewMatrixCampaignCall, null);
  assert.equal(blocked.details.matrixCampaignRunnerCheckpoint.controllerCommandPacket, null);
  assert.equal(
    blocked.details.matrixCampaignRunnerCheckpoint.operatorFollowup.checkpointState.posture,
    "blocked",
  );
  assert.equal(
    blocked.details.matrixCampaignRunnerCheckpoint.operatorFollowup.measurementReviewState
      .benchmarkExportReviewCallsExposed,
    false,
  );
  assert.match(blocked.content[0].text, /checkpoint state: blocked/);
  assert.match(blocked.content[0].text, /Unlocked benchmark\/export\/review calls: none/);

  const requiredToken = blocked.details.matrixCampaignRunnerCheckpoint.requiredToken;
  const unlocked = await tool.execute(
    "tc-checkpoint-matrix-campaign-runner-unlocked",
    { ...baseRequest, checkpointConfirmation: requiredToken },
    undefined,
    undefined,
    createToolContext(cwd),
  );

  assert.equal(unlocked.details.ok, true);
  assert.equal(unlocked.details.matrixCampaignRunnerCheckpoint.checkpointAccepted, true);
  assert.equal(
    unlocked.details.matrixCampaignRunnerCheckpoint.posture,
    "benchmark_export_review_unlocked",
  );
  assert.ok(
    unlocked.details.matrixCampaignRunnerCheckpoint.benchmarkExportReviewCalls.some((call) =>
      call.includes("autoresearch_runtime_run"),
    ),
  );
  assert.ok(
    unlocked.details.matrixCampaignRunnerCheckpoint.benchmarkExportReviewCalls.some((call) =>
      call.includes("candidate_result_export"),
    ),
  );
  assert.ok(
    unlocked.details.matrixCampaignRunnerCheckpoint.benchmarkExportReviewCalls.some((call) =>
      call.includes("review_candidate_wave"),
    ),
  );
  assert.match(
    unlocked.details.matrixCampaignRunnerCheckpoint.reviewMatrixCampaignCall,
    /review_matrix_campaign/,
  );
  const packet = unlocked.details.matrixCampaignRunnerCheckpoint.controllerCommandPacket;
  assert.equal(packet.kind, "autoresearch.matrix_cell_controller_command_packet.v1");
  assert.equal(packet.manualControllerGlueBlockers.name, "manual_controller_glue_blockers");
  assert.equal(packet.manualControllerGlueBlockers.target, 0);
  assert.equal(packet.cellMetric.name, "manual_controller_glue_blockers");
  assert.deepEqual(packet.cells[0].exactControllerSequence, [
    "autoresearch_candidate_bind",
    "autoresearch_runtime_run",
    "candidate_result_export",
    "review_candidate_wave",
    "review_matrix_campaign",
  ]);
  assert.match(
    packet.cells[0].lanes[0].metricRunCall,
    /"metricName": "manual_controller_glue_blockers"/,
  );
  assert.match(packet.cells[0].lanes[0].metricRunCall, /"metricThreshold": 0/);
  assert.match(packet.flattenedNextCallBundle.join("\n"), /review_candidate_wave/);
  assert.match(packet.flattenedNextCallBundle.join("\n"), /review_matrix_campaign/);
  assert.ok(packet.checkpointAndLineageVerification.controllerVerifiedLineageRequired);
  assert.ok(packet.checkpointAndLineageVerification.peerFinalIsCommunicationOnly);
  assert.ok(packet.boundaries.some((boundary) => /does not execute/.test(boundary)));
  assert.ok(packet.boundaries.some((boundary) => /promotion/.test(boundary)));
  const cockpit = unlocked.details.matrixCampaignRunnerCheckpoint.cockpit;
  assert.equal(cockpit.kind, "autoresearch.matrix_campaign_cockpit.v1");
  assert.equal(cockpit.source, "checkpoint_matrix_campaign_runner");
  assert.equal(cockpit.matrixCockpitBlockers.name, "matrix_cockpit_blockers");
  assert.equal(cockpit.matrixCockpitBlockers.value, 0);
  assert.equal(cockpit.progress.expectedCells, 1);
  assert.equal(cockpit.cellRows[0].posture, "measurement_export_unlocked");
  assert.match(cockpit.cellRows[0].nextLegalAction, /autoresearch_candidate_bind/);
  assert.equal(cockpit.ownerDecisionRoute.dashboardFirst, "/autoresearch export");
  assert.equal(cockpit.operatorUxDashboard.kind, "autoresearch.level2_operator_ux_dashboard.v1");
  assert.equal(cockpit.operatorUxDashboard.primaryMetric.name, "level2_operator_ux_blockers");
  assert.equal(cockpit.operatorUxDashboard.primaryMetric.value, 0);
  assert.deepEqual(
    cockpit.operatorUxDashboard.cellMetrics.map((metric) => metric.name),
    [
      "dashboard_readiness_summary_blockers",
      "authority_boundary_clarity_blockers",
      "fallback_recovery_ux_blockers",
    ],
  );
  assert.equal(cockpit.operatorUxDashboard.tokenAndAuthorityLegend.peerText, "communication_only");
  assert.equal(
    cockpit.operatorUxDashboard.tokenAndAuthorityLegend.reviewPackets,
    "owner_review_inputs_not_promotion",
  );
  assert.ok(
    cockpit.operatorUxDashboard.fallbackAndRecovery.some((item) => /Level-1 fallback/.test(item)),
  );
  assert.ok(
    cockpit.noHiddenExecutionBoundaries.some((boundary) => /does not execute/.test(boundary)),
  );
  assert.equal(
    unlocked.details.matrixCampaignRunnerCheckpoint.operatorFollowup.checkpointState.posture,
    "accepted",
  );
  assert.equal(
    unlocked.details.matrixCampaignRunnerCheckpoint.operatorFollowup.measurementReviewState
      .benchmarkExportReviewCallsExposed,
    true,
  );
  assert.match(unlocked.content[0].text, /Checkpoint accepted: yes/);
  assert.match(unlocked.content[0].text, /checkpoint state: accepted/);
  assert.match(unlocked.content[0].text, /Unlocked benchmark\/export\/review calls/);
  assert.match(unlocked.content[0].text, /Controller-command packet \/ next-call bundle/);
  assert.match(unlocked.content[0].text, /Matrix campaign cockpit\/dashboard/);
  assert.match(unlocked.content[0].text, /matrix_cockpit_blockers: 0/);
  assert.match(unlocked.content[0].text, /compact cell table/);
  assert.match(unlocked.content[0].text, /dashboard-first owner route/);
  assert.match(unlocked.content[0].text, /manual_controller_glue_blockers/);
  assert.match(
    unlocked.content[0].text,
    /autoresearch_candidate_bind -> autoresearch_runtime_run -> candidate_result_export -> review_candidate_wave -> review_matrix_campaign/,
  );
  assert.match(unlocked.content[0].text, /not cryptographic proof/);
});

test("autoresearch_live_supervision level3_matrix_cell_executor advances one safe Level-3 runner action", async () => {
  const cwd = "/tmp/matrix-cell-level3-executor";
  const runner = new AutoresearchLiveSupervisionRunner();
  const tool = registerAutoresearchLiveTool(runner);
  assert.ok(tool.parameters.properties.completedActionCount, "schema exposes completedActionCount");

  const baseRequest = {
    action: "level3_matrix_cell_executor",
    taskId: 2803,
    cwd,
    objective: "reduce manual controller glue for a checkpointed matrix cell",
    direction: "lower",
    metricName: "manual_controller_glue_blockers",
    metricThreshold: 0,
    scenarios: ["safety"],
    hypotheses: ["one-step deterministic runner"],
    candidateCountPerCell: 1,
    parentPeerTarget: "controller-peer-1",
    runnerManifestPath: ".autoresearch/matrix-campaign/checkpoint-runner.json",
  };

  const blocked = await tool.execute(
    "tc-level3-matrix-cell-executor-blocked",
    baseRequest,
    undefined,
    undefined,
    createToolContext(cwd),
  );

  assert.equal(blocked.details.ok, false);
  assert.equal(blocked.details.action, "level3_matrix_cell_executor");
  assert.equal(
    blocked.details.level3MatrixCellExecutor.kind,
    "autoresearch.level3_matrix_cell_executor.v1",
  );
  assert.equal(
    blocked.details.level3MatrixCellExecutor.sourceLevel3RunnerAlias,
    "level3_matrix_cell_runner",
  );
  assert.equal(blocked.details.level3MatrixCellExecutor.posture, "blocked_by_level3_runner");
  assert.equal(blocked.details.level3MatrixCellExecutor.selectedAction, null);
  assert.equal(blocked.details.level3MatrixCellExecutor.emittedNextLegalActions.length, 0);
  assert.equal(blocked.details.level3MatrixCellExecutor.stateMachineBlockers.value, 1);
  assert.match(blocked.content[0].text, /level3_matrix_cell_runner/);
  assert.match(blocked.content[0].text, /Hidden execution prevented: yes/);

  const requiredToken =
    blocked.details.level3MatrixCellExecutor.level3Runner.checkpointGate?.requiredToken ??
    blocked.details.level3MatrixCellExecutor.level3Runner.requiredToken;
  const first = await tool.execute(
    "tc-level3-matrix-cell-executor-first",
    { ...baseRequest, checkpointConfirmation: requiredToken, completedActionCount: 0 },
    undefined,
    undefined,
    createToolContext(cwd),
  );

  assert.equal(first.details.ok, true);
  const firstExecutor = first.details.level3MatrixCellExecutor;
  assert.equal(firstExecutor.posture, "ready_to_present_next_action");
  assert.equal(firstExecutor.completedActionCount, 0);
  assert.equal(firstExecutor.selectedAction.index, 0);
  assert.match(firstExecutor.selectedAction.call, /^autoresearch_candidate_bind\(/);
  assert.equal(firstExecutor.selectedAction.execution, "not_executed_by_orchestrator");
  assert.equal(firstExecutor.selectedAction.controllerMustRunExplicitly, true);
  assert.equal(firstExecutor.selectedAction.allowedByStateMachine, true);
  assert.deepEqual(firstExecutor.emittedNextLegalActions, [firstExecutor.selectedAction.call]);
  assert.equal(firstExecutor.stateMachineBlockers.value, 0);
  assert.equal(firstExecutor.stateMachineBlockers.hiddenExecutionPrevented, true);
  assert.doesNotMatch(
    firstExecutor.selectedAction.call,
    /candidate_peer_spawn\(|finalize_post_fanin|evidence_record\(/,
  );
  assert.match(first.content[0].text, /Selected one-step action/);

  const second = await tool.execute(
    "tc-level3-matrix-cell-executor-second",
    { ...baseRequest, checkpointConfirmation: requiredToken, completedActionCount: 1 },
    undefined,
    undefined,
    createToolContext(cwd),
  );

  const secondExecutor = second.details.level3MatrixCellExecutor;
  assert.equal(second.details.ok, true);
  assert.equal(secondExecutor.posture, "ready_to_present_next_action");
  assert.equal(secondExecutor.selectedAction.index, 1);
  assert.match(secondExecutor.selectedAction.call, /^autoresearch_runtime_run\(/);
  assert.equal(secondExecutor.emittedNextLegalActions.length, 1);
});

test("autoresearch_live_supervision level4_autoresearch_campaign_runner persists resumable receipts and preserves gates", async () => {
  await withTempDir(async (cwd) => {
    const runner = new AutoresearchLiveSupervisionRunner();
    const tool = registerAutoresearchLiveTool(runner);
    assert.ok(tool.parameters.properties.level4ReceiptPath, "schema exposes level4ReceiptPath");
    assert.ok(tool.parameters.properties.maxAutomatedActions, "schema exposes maxAutomatedActions");
    assert.ok(
      tool.parameters.properties.allowMeasureExportReview,
      "schema exposes Level-4 safe automation switch",
    );

    const baseRequest = {
      action: "level4_autoresearch_campaign_runner",
      taskId: 2804,
      cwd,
      objective: "automate safe Level-4 controller glue above Level-3",
      direction: "lower",
      metricName: "level4_autoresearch_automation_blockers",
      metricThreshold: 0,
      scenarios: ["safety"],
      hypotheses: ["resumable safe automation"],
      candidateCountPerCell: 1,
      parentPeerTarget: "controller-peer-1",
      runnerManifestPath: ".autoresearch/matrix-campaign/level4-runner.json",
      level4ReceiptPath: ".autoresearch/level4-test-receipts.jsonl",
    };

    const blocked = await tool.execute(
      "tc-level4-blocked",
      baseRequest,
      undefined,
      undefined,
      createToolContext(cwd),
    );
    assert.equal(blocked.details.ok, false);
    assert.equal(blocked.details.action, "level4_autoresearch_campaign_runner");
    assert.equal(
      blocked.details.level4CampaignRunner.kind,
      "autoresearch.level4_autoresearch_campaign_runner.v1",
    );
    assert.equal(blocked.details.level4CampaignRunner.posture, "blocked_by_level3");
    assert.equal(
      blocked.details.level4CampaignRunner.promptRunnerBundle.kind,
      "autoresearch.level4_prompt_runner_bundle.v1",
    );
    assert.equal(
      blocked.details.level4CampaignRunner.promptRunnerBundle.state,
      "ready_to_launch_visible_candidate_peers",
    );
    assert.equal(
      blocked.details.level4CampaignRunner.promptRunnerBundle.metric.name,
      "whole_matrix_execution_glue_blockers",
    );
    assert.equal(blocked.details.level4CampaignRunner.promptRunnerBundle.metric.value, 0);
    assert.match(
      blocked.details.level4CampaignRunner.promptRunnerBundle.visibleCandidatePeerSpawnCalls[0],
      /^candidate_peer_spawn\(/,
    );
    assert.match(
      blocked.details.level4CampaignRunner.promptRunnerBundle.visibleCandidatePeerSpawnCalls[0],
      /"workspaceName": "ar-2804-candidate-01-[a-f0-9]{8}"/,
    );
    assert.match(
      blocked.details.level4CampaignRunner.promptRunnerBundle.visibleCandidatePeerSpawnCalls[0],
      /"branchName": "candidatepeer\/ar-2804-candidate-01-[a-f0-9]{8}"/,
    );
    assert.doesNotMatch(
      blocked.details.level4CampaignRunner.promptRunnerBundle.visibleCandidatePeerSpawnCalls[0],
      /workspaceName": "automate safe Level-4 controller glue/,
    );
    assert.match(
      blocked.details.level4CampaignRunner.promptRunnerBundle.peerWatchCalls[0],
      /^intercom\(/,
    );
    assert.equal(
      blocked.details.level4CampaignRunner.promptRunnerBundle.visibleLaunchWatchPlan.kind,
      "autoresearch.level4_visible_candidate_launch_watch_orchestration.v1",
    );
    assert.equal(
      blocked.details.level4CampaignRunner.promptRunnerBundle.visibleLaunchWatchPlan.execution,
      "plan_only_controller_must_execute_visible_tools",
    );
    assert.equal(
      blocked.details.level4CampaignRunner.promptRunnerBundle.visibleLaunchWatchPlan.metric.name,
      "level4_visible_launch_watch_blockers",
    );
    assert.equal(
      blocked.details.level4CampaignRunner.promptRunnerBundle.visibleLaunchWatchPlan.metric.value,
      0,
    );
    assert.equal(
      blocked.details.level4CampaignRunner.promptRunnerBundle.visibleLaunchWatchPlan.lanePlans[0]
        .launchSurface,
      "candidate_peer_spawn",
    );
    assert.equal(
      blocked.details.level4CampaignRunner.promptRunnerBundle.visibleLaunchWatchPlan.lanePlans[0]
        .state,
      "ready_for_visible_launch",
    );
    assert.match(
      blocked.details.level4CampaignRunner.promptRunnerBundle.visibleLaunchWatchPlan.lanePlans[0]
        .ackWatchCall,
      /^intercom\(/,
    );
    assert.deepEqual(
      blocked.details.level4CampaignRunner.promptRunnerBundle.visibleLaunchWatchPlan
        .exactGatesPreserved,
      ["finalize_post_fanin", "candidate_cleanup", "ak_owner_write", "promotion"],
    );
    const closeoutPacket =
      blocked.details.level4CampaignRunner.promptRunnerBundle.candidateCloseoutPacket;
    assert.equal(closeoutPacket.kind, "autoresearch.level4_visible_candidate_closeout_packet.v1");
    assert.equal(closeoutPacket.execution, "plan_only_controller_verified_closeout");
    assert.equal(closeoutPacket.durableEvidence, false);
    assert.equal(closeoutPacket.metric.name, "level4_candidate_closeout_packet_blockers");
    assert.equal(closeoutPacket.metric.value, 0);
    assert.equal(closeoutPacket.laneCount, 1);
    assert.equal(closeoutPacket.packetInventory.totalLaneCount, 1);
    assert.equal(closeoutPacket.packetInventory.pendingVisibleLaunchCount, 1);
    assert.equal(closeoutPacket.packetInventory.pendingControllerLineageVerificationCount, 0);
    assert.equal(closeoutPacket.packetInventory.pendingMeasurementOrExportCount, 0);
    assert.equal(closeoutPacket.packetInventory.pendingCandidateResultPacketCount, 0);
    assert.equal(closeoutPacket.packetInventory.controllerVerifiedMeasuredPacketCount, 0);
    assert.equal(closeoutPacket.packetInventory.rows[0].status, "pending_visible_launch");
    assert.match(
      closeoutPacket.packetInventory.summary,
      /0\/1 controller-verified measured packet/,
    );
    assert.equal(
      closeoutPacket.postIntegrationCleanupReady.kind,
      "autoresearch.level4_post_integration_cleanup_ready.v1",
    );
    assert.equal(
      closeoutPacket.postIntegrationCleanupReady.readiness,
      "blocked_until_successful_integration_closeout",
    );
    assert.match(
      closeoutPacket.postIntegrationCleanupReady.blockers.join("\n"),
      /integrationCloseout\.status must be successful/,
    );
    assert.match(closeoutPacket.lanes[0].launch.call, /^candidate_peer_spawn\(/);
    assert.match(
      closeoutPacket.lanes[0].launch.workspaceName,
      /^ar-2804-candidate-01-[a-f0-9]{8}$/,
    );
    assert.match(
      closeoutPacket.lanes[0].launch.branchName,
      /^candidatepeer\/ar-2804-candidate-01-[a-f0-9]{8}$/,
    );
    assert.equal(closeoutPacket.lanes[0].lineage.peerFinalIsCommunicationOnly, true);
    assert.deepEqual(closeoutPacket.lanes[0].lineage.requiredFacts, [
      "worktree",
      "branch",
      "baseRef",
      "diffSummary",
      "filesChanged",
    ]);
    assert.match(closeoutPacket.lanes[0].lineage.verificationCommands.join("\n"), /git -C/);
    assert.equal(closeoutPacket.lanes[0].scopeReview.status, "pending_controller_verification");
    assert.equal(closeoutPacket.lanes[0].validation.peerClaimStatus, "communication_only");
    assert.equal(closeoutPacket.lanes[0].recommendation.disposition, "pending_controller_review");
    assert.equal(closeoutPacket.comparison.reviewRequiresControllerVerifiedPackets, true);
    assert.match(closeoutPacket.notAuthority.join("\n"), /not AK\/KES\/evidence authority/);
    assert.match(
      blocked.details.level4CampaignRunner.promptRunnerBundle.promptBundle[0].promptMarkdown,
      /Required execution pattern/,
    );
    assert.match(
      blocked.details.level4CampaignRunner.promptRunnerBundle.promptBundle[0].promptMarkdown,
      /Controller post-final calls after lineage verification/,
    );
    assert.match(blocked.content[0].text, /whole_matrix_execution_glue_blockers: 0/);
    assert.match(blocked.content[0].text, /level4_visible_launch_watch_blockers: 0/);
    assert.match(blocked.content[0].text, /Visible launch\/watch orchestration/);
    assert.match(blocked.content[0].text, /candidate_peer_spawn/);
    assert.deepEqual(blocked.details.level4CampaignRunner.exactGatesPreserved, [
      "finalize_post_fanin",
      "candidate_cleanup",
      "promotion",
      "ak_owner_write",
    ]);

    const requiredToken =
      blocked.details.level4CampaignRunner.sourceLevel3Executor.level3Runner.checkpointGate
        ?.requiredToken ??
      blocked.details.level4CampaignRunner.sourceLevel3Executor.level3Runner.requiredToken;
    const awaiting = await tool.execute(
      "tc-level4-awaiting-external",
      { ...baseRequest, checkpointConfirmation: requiredToken, maxAutomatedActions: 2 },
      undefined,
      undefined,
      createToolContext(cwd),
    );

    assert.equal(awaiting.details.ok, true);
    const level4 = awaiting.details.level4CampaignRunner;
    assert.equal(level4.posture, "awaiting_external_controller");
    assert.equal(level4.metric.value, 0);
    assert.equal(level4.promptRunnerBundle.state, "checkpoint_accepted_controller_sequence_ready");
    assert.equal(
      level4.promptRunnerBundle.visibleLaunchWatchPlan.lanePlans[0].state,
      "checkpoint_accepted_lineage_verified",
    );
    assert.equal(
      level4.promptRunnerBundle.candidateCloseoutPacket.packetInventory
        .pendingMeasurementOrExportCount,
      1,
    );
    assert.equal(
      level4.promptRunnerBundle.candidateCloseoutPacket.packetInventory.rows[0].status,
      "pending_measurement_or_export",
    );
    assert.match(
      level4.promptRunnerBundle.postFinalControllerSequence[0],
      /^autoresearch_candidate_bind\(/,
    );
    assert.equal(level4.newReceipts.length, 1);
    assert.equal(level4.newReceipts[0].disposition, "awaiting_external_controller");
    assert.match(level4.newReceipts[0].call, /^autoresearch_candidate_bind\(/);
    assert.equal(level4.loadedReceiptCount, 0);
    assert.match(awaiting.content[0].text, /level4_autoresearch_automation_blockers: 0/);
    assert.match(awaiting.content[0].text, /Exact gates preserved/);

    const measuredPacketRelativePath = closeoutPacket.packetInventory.rows[0].packetPath;
    writeCandidateResultPacket(cwd, path.join(cwd, measuredPacketRelativePath), {
      laneId: "cell-01-01-candidate-01",
    });
    const measuredPackets = await tool.execute(
      "tc-level4-measured-packet-inventory",
      {
        ...baseRequest,
        checkpointConfirmation: requiredToken,
        level4ReceiptPath: ".autoresearch/level4-measured-packet-inventory.jsonl",
      },
      undefined,
      undefined,
      createToolContext(cwd),
    );
    const measuredInventory =
      measuredPackets.details.level4CampaignRunner.promptRunnerBundle.candidateCloseoutPacket
        .packetInventory;
    assert.equal(measuredInventory.controllerVerifiedMeasuredPacketCount, 1);
    assert.equal(measuredInventory.pendingMeasurementOrExportCount, 0);
    assert.equal(measuredInventory.pendingPacketPaths.length, 0);
    assert.deepEqual(measuredInventory.controllerVerifiedMeasuredPacketPaths, [
      measuredPacketRelativePath,
    ]);
    assert.equal(measuredInventory.rows[0].status, "controller_verified_measured_packet");

    const receiptText = readFileSync(
      path.join(cwd, ".autoresearch", "level4-test-receipts.jsonl"),
      "utf8",
    );
    assert.match(receiptText, /autoresearch\.level4_campaign_runner_receipt\.v1/);
    assert.match(receiptText, /awaiting_external_controller/);

    const resumed = await tool.execute(
      "tc-level4-resume",
      { ...baseRequest, checkpointConfirmation: requiredToken },
      undefined,
      undefined,
      createToolContext(cwd),
    );
    assert.equal(resumed.details.level4CampaignRunner.loadedReceiptCount, 1);
    assert.match(
      resumed.details.level4CampaignRunner.sourceLevel3Executor.selectedAction.call,
      /^autoresearch_runtime_run\(/,
    );

    const concreteWorktree = path.join(cwd, ".worktrees", "cell-01-01-candidate-01");
    const concrete = await tool.execute(
      "tc-level4-concrete-binding",
      {
        ...baseRequest,
        checkpointConfirmation: requiredToken,
        level4ReceiptPath: ".autoresearch/level4-concrete-binding-receipts.jsonl",
        level3CandidateBindings: [
          {
            laneId: "cell-01-01-candidate-01",
            candidateWorktree: concreteWorktree,
            candidateBranch: "candidate/cell-01-01-candidate-01",
            candidateBaseRef: "HEAD",
            candidateDiffSummary: "controller verified test diff",
            candidateFilesChanged: ["src/runtime/autoresearch-supervisor-runner.ts"],
          },
        ],
      },
      undefined,
      undefined,
      createToolContext(cwd),
    );
    const concreteCall = concrete.details.level4CampaignRunner.newReceipts[0].call;
    assert.match(concreteCall, /autoresearch_candidate_bind/);
    assert.match(concreteCall, new RegExp(concreteWorktree.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")));
    assert.doesNotMatch(concreteCall, /worktree-from-candidate_peer_spawn/);

    const concreteResumed = await tool.execute(
      "tc-level4-concrete-binding-resume",
      {
        ...baseRequest,
        checkpointConfirmation: requiredToken,
        level4ReceiptPath: ".autoresearch/level4-concrete-binding-receipts.jsonl",
        level3CandidateBindings: [
          {
            laneId: "cell-01-01-candidate-01",
            candidateWorktree: concreteWorktree,
            candidateBranch: "candidate/cell-01-01-candidate-01",
            candidateBaseRef: "HEAD",
            candidateDiffSummary: "controller verified test diff",
            candidateFilesChanged: ["src/runtime/autoresearch-supervisor-runner.ts"],
          },
        ],
      },
      undefined,
      undefined,
      createToolContext(cwd),
    );
    const runCall =
      concreteResumed.details.level4CampaignRunner.sourceLevel3Executor.selectedAction.call;
    assert.match(runCall, /^autoresearch_runtime_run\(/);
    assert.match(runCall, new RegExp(concreteWorktree.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")));
    assert.match(runCall, /candidate\/cell-01-01-candidate-01/);
    assert.doesNotMatch(runCall, /branch-from-candidate_peer_spawn/);

    const cleanupReady = await tool.execute(
      "tc-level4-post-integration-cleanup-ready",
      {
        ...baseRequest,
        checkpointConfirmation: requiredToken,
        level4ReceiptPath: ".autoresearch/level4-cleanup-ready-receipts.jsonl",
        integrationCloseout: {
          status: "successful",
          commit: "abc1234",
          summary: "integrated test lane",
        },
        level3CandidateBindings: [
          {
            laneId: "cell-01-01-candidate-01",
            candidatePeerRunId: "candidatepeer-test-cleanup",
            candidateWorktree: concreteWorktree,
            candidateBranch: "candidate/cell-01-01-candidate-01",
            candidateBaseRef: "HEAD",
            candidateDiffSummary: "controller verified test diff",
            candidateFilesChanged: ["src/runtime/autoresearch-supervisor-runner.ts"],
          },
        ],
      },
      undefined,
      undefined,
      createToolContext(cwd),
    );
    const cleanupPacket =
      cleanupReady.details.level4CampaignRunner.promptRunnerBundle.candidateCloseoutPacket
        .postIntegrationCleanupReady;
    assert.equal(cleanupPacket.kind, "autoresearch.level4_post_integration_cleanup_ready.v1");
    assert.equal(cleanupPacket.readiness, "ready_after_successful_integration_closeout");
    assert.deepEqual(cleanupPacket.exactPeerRunIds, ["candidatepeer-test-cleanup"]);
    assert.deepEqual(cleanupPacket.exactWorktrees, [concreteWorktree]);
    assert.deepEqual(cleanupPacket.exactBranches, ["candidate/cell-01-01-candidate-01"]);
    assert.match(
      cleanupPacket.archiveDirectories[0],
      /cleanup-level4-task-2804-cell-01-01-candidate-01/,
    );
    assert.match(cleanupPacket.tabClosureHints[0], /candidatepeer-test-cleanup/);
    assert.match(
      cleanupPacket.processTerminationHints[0],
      new RegExp(concreteWorktree.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")),
    );
    assert.ok(
      cleanupPacket.exactControllerCommands.some((command) =>
        /worktree remove --force/.test(command),
      ),
    );
    assert.ok(cleanupPacket.exactControllerCommands.some((command) => /branch -D/.test(command)));
    assert.equal(cleanupPacket.blockers.length, 0);
  });
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
        metricName: "operator_ux_blockers",
        metricThreshold: 0,
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
    const reviewFollowup = result.details.matrixCampaignReview.operatorFollowup;
    assert.equal(reviewFollowup.currentState, "ready_for_matrix_owner_review");
    assert.equal(reviewFollowup.primaryMetric.name, "operator_ux_blockers");
    assert.equal(reviewFollowup.measurementReviewState.completedCells, 2);
    assert.equal(reviewFollowup.measurementReviewState.selectedCells, 2);
    assert.equal(reviewFollowup.lanePacketPaths.length, 4);
    assert.equal(reviewFollowup.lanePacketPaths[0].state, "measured_exported_selectable");
    assert.ok(
      reviewFollowup.nextLegalActions.some((call) =>
        call.includes("autoresearch_candidate_decision"),
      ),
    );
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
    assert.match(
      result.details.matrixCampaignReview.closeout.evidenceProjection.projectionKey,
      /^matrix-closeout\|task:2774\|/,
    );
    assert.match(
      result.details.matrixCampaignReview.closeout.evidenceProjection.exactRecordCall,
      /evidence_record/,
    );
    assert.match(
      result.details.matrixCampaignReview.closeout.evidenceProjection.exactRecordCall,
      /autoresearch:matrix-campaign:closeout/,
    );
    const cockpit = result.details.matrixCampaignReview.cockpit;
    assert.equal(cockpit.kind, "autoresearch.matrix_campaign_cockpit.v1");
    assert.equal(cockpit.source, "review_matrix_campaign");
    const level3 = result.details.matrixCampaignReview.level3ReviewSelection;
    assert.equal(level3.kind, "autoresearch.level3_review_selection_substrate.v1");
    assert.equal(level3.source, "level3_matrix_cell_runner_visible_candidate_lanes");
    assert.equal(level3.aggregationInput, "controller_verified_candidate_result_packets");
    assert.equal(level3.blockerMetric.name, "level3_review_selection_blockers");
    assert.equal(level3.blockerMetric.value, 0);
    assert.equal(level3.blockerMetric.status, "target_met");
    assert.deepEqual(
      level3.cellSelections.map((cell) => cell.winnerState),
      ["selected_for_owner_review", "selected_for_owner_review"],
    );
    assert.deepEqual(
      level3.cellSelections.map((cell) => cell.recommendedLaneId),
      ["candidate-01", "candidate-01"],
    );
    assert.equal(level3.cellSelections[0].nonSelectedSelectableLaneIds[0], "candidate-02");
    assert.equal(
      level3.finalizerReadiness.posture,
      "ready_for_validation_and_finalize_token_request",
    );
    assert.equal(level3.finalizerReadiness.selectedLaneCount, 2);
    assert.equal(level3.finalizerReadiness.applyCommandsExposed, false);
    assert.equal(level3.finalizerReadiness.promotionAuthority, false);
    assert.equal(level3.finalizerReadiness.cleanupAuthority, false);
    assert.match(
      level3.finalizerReadiness.exactFinalizePostFaninHandoffCall,
      /finalize_post_fanin/,
    );
    assert.match(
      level3.finalizerReadiness.exactFinalizePostFaninHandoffCall,
      /"sourceReview": "review_matrix_campaign"/,
    );
    assert.equal(level3.dangerousActionGates.promotion, "separate_promotion_token_required");
    const reviewPacket = result.details.matrixCampaignReview.reviewPacket;
    assert.equal(reviewPacket.kind, "autoresearch.review_matrix_campaign_packet.v1");
    assert.equal(reviewPacket.authorityBoundary.durableEvidence, false);
    assert.equal(reviewPacket.authorityBoundary.promotionAuthority, false);
    assert.deepEqual(
      reviewPacket.laneDispositionOptions.map((option) => option.option),
      [
        "ignore",
        "inspect further",
        "fold into synthesis",
        "cherry-pick after review",
        "merge after review",
      ],
    );
    assert.equal(
      reviewPacket.wholeMatrixMetricPosture.name,
      "level2_review_packet_generation_blockers",
    );
    assert.equal(reviewPacket.wholeMatrixMetricPosture.value, 0);
    assert.equal(reviewPacket.wholeMatrixMetricPosture.status, "target_met");
    assert.equal(reviewPacket.packetChainMetric.name, "candidate_review_packet_chain_blockers");
    assert.equal(reviewPacket.packetChainMetric.value, 0);
    assert.equal(reviewPacket.packetChainMetric.status, "target_met");
    assert.equal(reviewPacket.candidateResultPacketRefs.length, 4);
    assert.deepEqual(
      reviewPacket.candidateResultPacketRefs
        .filter((ref) => ref.selected)
        .map((ref) => `${ref.cellId}/${ref.laneId}`),
      ["cell-01-01/candidate-01", "cell-02-01/candidate-01"],
    );
    assert.equal(reviewPacket.canCloseMatrixTarget, true);
    assert.equal(cockpit.matrixCockpitBlockers.name, "matrix_cockpit_blockers");
    assert.equal(cockpit.matrixCockpitBlockers.value, 0);
    assert.equal(cockpit.progress.completedCells, 2);
    assert.equal(cockpit.progress.expectedCells, 2);
    assert.equal(cockpit.progress.selectedCells, 2);
    assert.equal(cockpit.cellRows.length, 2);
    assert.equal(cockpit.cellRows[0].selectedLaneId, "candidate-01");
    assert.match(cockpit.cellRows[0].nextLegalAction, /autoresearch_candidate_decision/);
    assert.equal(cockpit.packetInventory.length, 4);
    assert.equal(cockpit.selectedLanes.length, 2);
    assert.equal(cockpit.ownerDecisionRoute.dashboardFirst, "/autoresearch export");
    assert.equal(cockpit.operatorUxDashboard.primaryMetric.name, "level2_operator_ux_blockers");
    assert.equal(cockpit.operatorUxDashboard.primaryMetric.value, 0);
    assert.equal(
      cockpit.operatorUxDashboard.tokenAndAuthorityLegend.candidateResultPackets,
      "review_inputs_not_durable_evidence",
    );
    assert.equal(
      cockpit.operatorUxDashboard.tokenAndAuthorityLegend.finalizerCleanupPromotion,
      "separate_token_gates_required",
    );
    assert.match(cockpit.operatorUxDashboard.packetInventorySummary, /4 packet lane/);
    assert.ok(
      cockpit.operatorUxDashboard.fallbackAndRecovery.some((item) =>
        /Duplicate lane recovery/.test(item),
      ),
    );
    assert.ok(
      cockpit.matrixCockpitBlockers.proofs.some((proof) =>
        proof.proof.includes("docs/tests alignment mentioning matrix_cockpit_blockers"),
      ),
    );
    assert.ok(
      cockpit.noHiddenExecutionBoundaries.some((boundary) =>
        /does not launch peers/.test(boundary),
      ),
    );
    assert.equal(result.details.matrixCampaignReview.closeout.selectedLanes.length, 2);
    assert.equal(result.details.matrixCampaignReview.closeout.packetInventory.length, 4);
    assert.equal(
      result.details.matrixCampaignReview.closeout.packetInventory.filter((lane) => lane.selected)
        .length,
      2,
    );
    assert.equal(
      result.details.matrixCampaignReview.closeout.ownerDecisionRoute.dashboardFirst,
      "/autoresearch export",
    );
    assert.equal(
      result.details.matrixCampaignReview.closeout.ownerDecisionRoute.overlayFallback,
      "/autoresearch overlay",
    );
    assert.equal(
      result.details.matrixCampaignReview.closeout.ownerDecisionRoute.finalDecision,
      "/autoresearch review",
    );
    assert.deepEqual(result.details.matrixCampaignReview.closeout.ownerDecisionRoute.routeOrder, [
      "/autoresearch export",
      "/autoresearch review",
      "evidence_record",
    ]);
    assert.equal(
      result.details.matrixCampaignReview.closeout.ownerDecisionRoute.evidenceAfterReview,
      true,
    );
    assert.equal(
      result.details.matrixCampaignReview.closeout.evidenceHandoffBlockers.name,
      "evidence_handoff_blockers",
    );
    assert.equal(result.details.matrixCampaignReview.closeout.evidenceHandoffBlockers.value, 0);
    assert.equal(
      result.details.matrixCampaignReview.closeout.evidenceHandoffBlockers.status,
      "target_met",
    );
    assert.ok(
      result.details.matrixCampaignReview.closeout.evidenceHandoffBlockers.proofs.some((proof) =>
        proof.proof.includes("docs/tests alignment mentioning evidence_handoff_blockers"),
      ),
    );
    const learningActivation = result.details.matrixCampaignReview.closeout.learningActivation;
    assert.equal(learningActivation.posture, "ready_for_owner_routed_learning_handoff");
    assert.equal(learningActivation.ownerSurface, "autoresearch_learning_kes_adapter");
    assert.equal(learningActivation.requiredPacketKind, "autoresearch.learning.v1");
    assert.match(learningActivation.exactLearningExportCall, /learning_export/);
    assert.match(learningActivation.exactAdapterPlanCall, /"action": "plan"/);
    assert.match(learningActivation.exactAdapterMaterializeCall, /"action": "materialize"/);
    assert.deepEqual(learningActivation.routeOrder, [
      "autoresearch_runtime_status.learning_export",
      "autoresearch_learning_kes_adapter.plan",
      "owner_review",
      "autoresearch_learning_kes_adapter.materialize",
    ]);
    assert.equal(
      result.details.matrixCampaignReview.closeout.learningActivationBlockers.name,
      "learning_activation_blockers",
    );
    assert.equal(result.details.matrixCampaignReview.closeout.learningActivationBlockers.value, 0);
    assert.equal(
      result.details.matrixCampaignReview.closeout.learningActivationBlockers.status,
      "target_met",
    );
    assert.ok(
      result.details.matrixCampaignReview.closeout.learningActivationBlockers.proofs.some((proof) =>
        proof.proof.includes("docs/tests alignment mentioning learning_activation_blockers"),
      ),
    );
    assert.deepEqual(
      result.details.matrixCampaignReview.cells.map((cell) => cell.selectedLaneId),
      ["candidate-01", "candidate-01"],
    );
    assert.match(result.content[0].text, /review_matrix_campaign/);
    assert.match(result.content[0].text, /ready_for_matrix_owner_review/);
    assert.match(result.content[0].text, /Operator follow-up\/current-state summary/);
    assert.match(
      result.content[0].text,
      /measurement\/review state: ready_for_matrix_owner_review/,
    );
    assert.match(result.content[0].text, /UX proof checklist/);
    assert.match(result.content[0].text, /Managed cell reviews/);
    assert.match(result.content[0].text, /Cell progress: 2\/2/);
    assert.match(result.content[0].text, /primary UI command: \/autoresearch export/);
    assert.match(result.content[0].text, /final decision UI command: \/autoresearch review/);
    assert.match(result.content[0].text, /Matrix campaign cockpit\/dashboard/);
    assert.match(result.content[0].text, /matrix_cockpit_blockers: 0/);
    assert.match(result.content[0].text, /level-2 operator UX dashboard/);
    assert.match(result.content[0].text, /level2_operator_ux_blockers: 0/);
    assert.match(result.content[0].text, /dashboard_readiness_summary_blockers: 0/);
    assert.match(
      result.content[0].text,
      /candidate-result packets: review_inputs_not_durable_evidence/,
    );
    assert.match(result.content[0].text, /review packets: owner_review_inputs_not_promotion/);
    assert.match(result.content[0].text, /Level-1 fallback/);
    assert.match(result.content[0].text, /Review matrix-campaign packet/);
    assert.match(result.content[0].text, /Level-3 review\/selection substrate/);
    assert.match(result.content[0].text, /level3_review_selection_blockers: 0/);
    assert.match(result.content[0].text, /level2_review_packet_generation_blockers=0/);
    assert.match(result.content[0].text, /promotion authority: no/);
    assert.match(result.content[0].text, /compact cell table/);
    assert.match(result.content[0].text, /selected lane inventory/);
    assert.match(result.content[0].text, /next legal action: autoresearch_candidate_decision/);
    assert.match(
      result.content[0].text,
      /dashboard-first owner route: \/autoresearch export -> \/autoresearch review -> evidence_record/,
    );
    assert.match(
      result.content[0].text,
      /docs\/tests alignment mentioning matrix_cockpit_blockers/,
    );
    assert.match(result.content[0].text, /Campaign closeout/);
    assert.match(result.content[0].text, /autoresearch\.matrix_campaign_closeout\.v1/);
    assert.match(result.content[0].text, /closeout packet inventory/);
    assert.match(result.content[0].text, /evidence_handoff_blockers: 0/);
    assert.match(
      result.content[0].text,
      /evidence projection: ready_for_external_projection via AK/,
    );
    assert.match(result.content[0].text, /evidence handoff: evidence_record/);
    assert.match(result.content[0].text, /evidence record call: evidence_record/);
    assert.match(
      result.content[0].text,
      /owner route order: \/autoresearch export -> \/autoresearch review -> evidence_record/,
    );
    assert.match(
      result.content[0].text,
      /docs\/tests alignment mentioning evidence_handoff_blockers/,
    );
    assert.match(result.content[0].text, /learning_activation_blockers: 0/);
    assert.match(result.content[0].text, /learning export call: autoresearch_runtime_status/);
    assert.match(result.content[0].text, /adapter plan call: autoresearch_learning_kes_adapter/);
    assert.match(
      result.content[0].text,
      /adapter materialize call: autoresearch_learning_kes_adapter/,
    );
    assert.match(
      result.content[0].text,
      /autoresearch_runtime_status\.learning_export -> autoresearch_learning_kes_adapter\.plan -> owner_review -> autoresearch_learning_kes_adapter\.materialize/,
    );
    assert.match(
      result.content[0].text,
      /docs\/tests alignment mentioning learning_activation_blockers/,
    );
    assert.match(result.content[0].text, /No peer was launched/);
    assert.match(result.content[0].text, /Raw peer messages are communication only/);
  });
});

test("autoresearch_live_supervision review_matrix_campaign blocks proof-only review packet closure without downgrade", async () => {
  await withTempDir(async (cwd) => {
    const packetPath = path.join(
      cwd,
      ".autoresearch",
      "matrix-campaign",
      "cell-01-01",
      "candidate-01.candidate-result.json",
    );
    mkdirSync(path.dirname(packetPath), { recursive: true });
    writeFileSync(
      packetPath,
      JSON.stringify({
        packetKind: "autoresearch.candidate_result.v1",
        adapterContractVersion: 1,
        cwd,
        campaign: "proof-only-matrix-review",
        candidate: {
          source: "candidate_peer_spawn",
          worktreePath: path.join(cwd, ".worktrees", "proof-only-candidate"),
          branch: "candidate/proof-only",
          baseRef: "HEAD",
          diffSummary: "proof-only candidate packet",
          filesChanged: ["packages/pi-society-orchestrator/README.md"],
          peerRunId: "candidatepeer-proof-only",
        },
        candidateRun: {
          iteration: 1,
          status: "candidate",
          runKind: "ordinary",
          empiricalDecisionClass: "candidate_improvement",
          metric: 0,
          description: "Measure proof-only lane",
          timestamp: 1,
          checks: "pass",
          experiment: {
            hypothesisId: "candidate-01",
            hypothesis: "baseline-only target",
          },
        },
        empiricalDecisionClass: "candidate_improvement",
        resultSummary: "baseline-only packet exists but must not close target",
        closeout: { status: { confidence: 1.1 } },
        adapterBoundary: "packet boundary",
      }),
    );

    const runner = new AutoresearchLiveSupervisionRunner();
    const tool = registerAutoresearchLiveTool(runner);
    const result = await tool.execute(
      "tc-review-matrix-campaign-proof-only-blocked",
      {
        action: "review_matrix_campaign",
        taskId: 2981,
        cwd,
        objective: "level-2 review-packet generation proof-only closure",
        direction: "lower",
        metricName: "level2_review_packet_generation_blockers",
        metricThreshold: 0,
        scenarios: ["proof-only closure"],
        hypotheses: ["baseline-only target"],
        candidateCountPerCell: 1,
      },
      undefined,
      undefined,
      createToolContext(cwd),
    );

    assert.equal(result.details.ok, true);
    const review = result.details.matrixCampaignReview;
    assert.equal(review.posture, "cell_rerun_required");
    assert.equal(review.reviewPacket.kind, "autoresearch.review_matrix_campaign_packet.v1");
    assert.equal(review.reviewPacket.canCloseMatrixTarget, false);
    assert.equal(review.reviewPacket.wholeMatrixMetricPosture.status, "blocked");
    assert.equal(
      review.reviewPacket.wholeMatrixMetricPosture.proofOnlyBaselineOnlyTargetClosureBlocked,
      true,
    );
    assert.equal(review.closeout.evidenceProjection.posture, "blocked");
    assert.equal(review.closeout.evidenceProjection.exactRecordCall, null);
    assert.match(review.nextStep, /Do not close proof-only\/baseline-only matrix work/);
    assert.match(result.content[0].text, /can close matrix target: no/);
    assert.match(result.content[0].text, /proof-only\/baseline-only closure blocked: yes/);
  });
});

test("post-fan-in finalizer prepares token request while withholding apply packet until authorization", async () => {
  await withTempDir(async (cwd) => {
    const packetA = path.join(cwd, "candidate-01.candidate-result.json");
    const packetB = path.join(cwd, "candidate-02.candidate-result.json");
    writeCandidateResultPacket(cwd, packetA, { laneId: "candidate-01", metric: 4 });
    writeCandidateResultPacket(cwd, packetB, { laneId: "candidate-02", metric: 2 });

    const runner = new AutoresearchLiveSupervisionRunner();
    const preflight = runner.finalizePostFanin({
      action: "post_fanin_finalizer",
      taskId: 2959,
      cwd,
      objective: "finalize post-fan-in campaign",
      sourceReview: "review_candidate_wave",
      direction: "lower",
      candidateResultPacketPaths: [packetA, packetB],
      selectedLaneId: "candidate-02",
      validation: {
        command:
          "pnpm --filter @tryinget/pi-society-orchestrator test -- autoresearch-live-control-plane",
        status: "passed",
        summary: "focused finalizer checks passed",
      },
      offLimits: ["packages/pi-toolbox-discovery/**"],
      dirtyFiles: ["packages/pi-society-orchestrator/README.md"],
      reviewedAtEpochMs: Date.now() + 60_000,
    });

    assert.equal(preflight.kind, "autoresearch.post_fanin_finalizer_result.v1");
    assert.equal(preflight.outcome, "review_blocked");
    assert.equal(preflight.preflight.status, "passed");
    assert.equal(preflight.manualPostFaninResidue.value, 1);
    assert.equal(
      preflight.finalizerTokenRequest.kind,
      "autoresearch.post_fanin_finalizer_token_request.v1",
    );
    assert.equal(preflight.finalizerTokenRequest.requiredTokenName, "finalize_post_fanin");
    assert.equal(
      preflight.finalizerTokenRequest.metricPosture.name,
      "level2_finalizer_token_request_blockers",
    );
    assert.equal(preflight.finalizerTokenRequest.metricPosture.value, 0);
    assert.equal(preflight.finalizerTokenRequest.metricPosture.status, "target_met");
    assert.equal(
      preflight.finalizerTokenRequest.packetChainTrace.sourceReviewPacketKind,
      "autoresearch.review_candidate_wave_packet.v1",
    );
    assert.equal(
      preflight.finalizerTokenRequest.packetChainTrace.metric.name,
      "candidate_review_packet_chain_blockers",
    );
    assert.equal(preflight.finalizerTokenRequest.packetChainTrace.metric.value, 0);
    assert.equal(preflight.finalizerTokenRequest.packetChainTrace.metric.status, "target_met");
    assert.deepEqual(
      preflight.finalizerTokenRequest.packetChainTrace.selectedCandidateResultPacketRefs,
      [packetB],
    );
    assert.equal(
      preflight.finalizerTokenRequest.permittedFinalizerScope.applyCommandsWithheldUntilToken,
      true,
    );
    assert.deepEqual(preflight.finalizerTokenRequest.separateOwnerTokensRequired, [
      "candidate_cleanup",
      "promotion",
      "ak_owner_write",
    ]);
    assert.equal(
      preflight.authorizedFinalizerCleanupGate.name,
      "authorized_finalizer_cleanup_blockers",
    );
    assert.equal(preflight.authorizedFinalizerCleanupGate.value, 0);
    assert.equal(preflight.authorizedFinalizerCleanupGate.status, "target_met");
    assert.equal(preflight.authorizedFinalizerCleanupGate.finalizedWithToken, false);
    assert.equal(preflight.authorizedFinalizerCleanupGate.cleanupAuthorized, false);
    assert.equal(
      preflight.authorizedFinalizerCleanupGate.candidatePeerTabClosureIncludedInCleanup,
      true,
    );
    assert.equal(preflight.authorizedFinalizerCleanupGate.cleanupEvidenceRequired, false);
    assert.equal(preflight.authorizedFinalizerCleanupGate.promotionAuthorized, false);
    assert.deepEqual(preflight.authorizedFinalizerCleanupGate.requiredSeparateTokens, [
      "candidate_cleanup",
      "promotion",
    ]);
    assert.deepEqual(preflight.authorizedFinalizerCleanupGate.forbiddenCommandMatches, []);
    assert.ok(
      preflight.finalizerTokenRequest.nextLegalActions.some((action) =>
        /candidate cleanup.*candidate_cleanup/i.test(action),
      ),
    );
    assert.equal(preflight.exactApplyCommandPacket, null);

    const authorized = runner.finalizePostFanin({
      action: "post_fanin_finalizer",
      taskId: 2959,
      cwd,
      objective: "finalize post-fan-in campaign",
      sourceReview: "review_candidate_wave",
      direction: "lower",
      candidateResultPacketPaths: [packetA, packetB],
      selectedLaneId: "candidate-02",
      validation: {
        command:
          "pnpm --filter @tryinget/pi-society-orchestrator test -- autoresearch-live-control-plane",
        status: "passed",
      },
      offLimits: ["packages/pi-toolbox-discovery/**"],
      dirtyFiles: ["packages/pi-society-orchestrator/README.md"],
      reviewedAtEpochMs: Date.now() + 60_000,
      applyAuthorizationToken: preflight.contract.exactAuthorizationToken,
    });

    assert.equal(authorized.outcome, "committed_cleaned");
    assert.equal(
      authorized.exactApplyCommandPacket.kind,
      "autoresearch.post_fanin_finalizer_apply_command_packet.v1",
    );
    assert.equal(authorized.exactApplyCommandPacket.applyExecution, "not_executed_by_orchestrator");
    assert.match(
      authorized.exactApplyCommandPacket.exactCommands.join("\n"),
      /git -C .* checkout .*candidate\/candidate-02/,
    );
    assert.match(
      authorized.exactApplyCommandPacket.exactCommands.join("\n"),
      /git -C .* commit -m/,
    );
    const forbiddenCleanupPromotionCommands =
      /\b(?:merge|push|rebase|tag|release|publish)\b|worktree remove|branch -d|branch -D|rm -rf|candidate_cleanup|promotion/i;
    assert.doesNotMatch(
      authorized.exactApplyCommandPacket.exactCommands.join("\n"),
      forbiddenCleanupPromotionCommands,
    );
    assert.equal(authorized.manualPostFaninResidue.name, "manual_post_fanin_residue");
    assert.equal(authorized.manualPostFaninResidue.value, 0);
    assert.equal(authorized.manualPostFaninResidue.status, "target_met");
    assert.equal(authorized.authorizedFinalizerCleanupGate.value, 0);
    assert.equal(authorized.authorizedFinalizerCleanupGate.status, "target_met");
    assert.equal(authorized.authorizedFinalizerCleanupGate.finalizedWithToken, true);
    assert.equal(authorized.authorizedFinalizerCleanupGate.cleanupAuthorized, false);
    assert.equal(
      authorized.authorizedFinalizerCleanupGate.candidatePeerTabClosureIncludedInCleanup,
      true,
    );
    assert.equal(authorized.authorizedFinalizerCleanupGate.cleanupEvidenceRequired, false);
    assert.equal(authorized.authorizedFinalizerCleanupGate.promotionAuthorized, false);
    assert.deepEqual(authorized.authorizedFinalizerCleanupGate.forbiddenCommandMatches, []);
    assert.match(authorized.nextStep, /Cleanup requires candidate_cleanup/);
    assert.match(authorized.nextStep, /promotion requires promotion/);
    assert.ok(
      authorized.exactApplyCommandPacket.rollbackNotes.some((note) =>
        /candidate_cleanup token/.test(note),
      ),
    );
    assert.ok(
      authorized.exactApplyCommandPacket.rollbackNotes.some((note) => /promotion token/.test(note)),
    );
    assert.ok(
      authorized.boundaries.some((boundary) => /No checkout, merge, commit/.test(boundary)),
    );
    assert.ok(
      authorized.authorizedFinalizerCleanupGate.proofs.some((proof) =>
        /peer tab\/session closure/.test(proof),
      ),
    );
    assert.ok(
      authorized.authorizedFinalizerCleanupGate.proofs.some((proof) =>
        /does not require separate AK evidence/.test(proof),
      ),
    );
    assert.ok(
      authorized.boundaries.some((boundary) =>
        /candidate_cleanup authority, or promotion authority/.test(boundary),
      ),
    );
  });
});

test("post-fan-in finalizer fails closed on missing finals, off-limits drift, dirty overlap, stale review, and wrong authorization", async () => {
  await withTempDir(async (cwd) => {
    const packet = path.join(cwd, "candidate-01.candidate-result.json");
    writeCandidateResultPacket(cwd, packet, {
      laneId: "candidate-01",
      filesChanged: [
        "packages/pi-society-orchestrator/src/runtime/autoresearch-supervisor-runner.ts",
        "packages/pi-toolbox-discovery/src/index.ts",
      ],
    });
    const runner = new AutoresearchLiveSupervisionRunner();

    const blocked = runner.finalizePostFanin({
      action: "post_fanin_finalizer",
      taskId: 2959,
      cwd,
      objective: "finalize blocked post-fan-in campaign",
      sourceReview: "review_candidate_wave",
      candidateResultPacketPaths: [packet, path.join(cwd, "candidate-02.candidate-result.json")],
      selectedLaneId: "candidate-01",
      validation: { command: "pnpm test", status: "failed", summary: "validation failed" },
      offLimits: ["packages/pi-toolbox-discovery/**"],
      dirtyFiles: [
        "packages/pi-society-orchestrator/src/runtime/autoresearch-supervisor-runner.ts",
      ],
      reviewedAtEpochMs: 1,
      applyAuthorizationToken: "authorize-post-fanin-finalizer:wrong",
    });

    assert.equal(blocked.outcome, "failed_closed");
    assert.equal(blocked.finalizerTokenRequest.metricPosture.status, "blocked");
    assert.equal(blocked.authorizedFinalizerCleanupGate.value, 0);
    assert.equal(blocked.authorizedFinalizerCleanupGate.cleanupAuthorized, false);
    assert.equal(blocked.authorizedFinalizerCleanupGate.promotionAuthorized, false);
    assert.equal(blocked.exactApplyCommandPacket, null);
    assert.equal(blocked.preflight.status, "blocked");
    assert.ok(blocked.preflight.blockerCount >= 5);
    assert.equal(
      blocked.preflight.checks.find((check) => check.name === "finals_present").status,
      "blocked",
    );
    assert.equal(
      blocked.preflight.checks.find((check) => check.name === "validation_passed").status,
      "blocked",
    );
    assert.equal(
      blocked.preflight.checks.find((check) => check.name === "off_limits_clean").status,
      "blocked",
    );
    assert.equal(
      blocked.preflight.checks.find((check) => check.name === "dirty_overlap_clean").status,
      "blocked",
    );
    assert.equal(
      blocked.preflight.checks.find((check) => check.name === "review_artifacts_current").status,
      "blocked",
    );
    assert.match(blocked.nextStep, /Fail closed/);
    assert.ok(blocked.boundaries.some((boundary) => /Missing finals.*fail closed/.test(boundary)));
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
          candidateSource: "candidate_peer_spawn",
          candidateWorktree: path.join(cwd, ".worktrees", "candidate-01"),
          candidateBranch: "candidate/candidate-01",
          candidateBaseRef: "HEAD",
          candidateFilesChanged: ["src/a.ts"],
          candidatePeerRunId: "candidatepeer-positive-01",
        },
        {
          laneId: "candidate-02",
          objective: "review surface",
          metric: 9,
          status: "candidate_review_ready",
          checksStatus: "pass",
          confidence: 1.8,
          candidateSource: "candidate_peer_spawn",
          candidateWorktree: path.join(cwd, ".worktrees", "candidate-02"),
          candidateBranch: "candidate/candidate-02",
          candidateBaseRef: "HEAD",
          candidateFilesChanged: ["src/b.ts"],
          candidatePeerRunId: "candidatepeer-positive-02",
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
    result.details.candidateWaveReview.reviewPacket.kind,
    "autoresearch.review_candidate_wave_packet.v1",
  );
  assert.equal(
    result.details.candidateWaveReview.reviewPacket.generatedFrom,
    "bound_candidate_results",
  );
  assert.equal(
    result.details.candidateWaveReview.reviewPacket.authorityBoundary.durableEvidence,
    false,
  );
  assert.equal(
    result.details.candidateWaveReview.reviewPacket.authorityBoundary.promotionAuthority,
    false,
  );
  assert.deepEqual(
    result.details.candidateWaveReview.reviewPacket.laneDispositionOptions.map(
      (option) => option.option,
    ),
    [
      "ignore",
      "inspect further",
      "fold into synthesis",
      "cherry-pick after review",
      "merge after review",
    ],
  );
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
    result.details.candidateWaveReview.reliabilityRecovery.kind,
    "autoresearch.candidate_wave_reliability_recovery.v1",
  );
  assert.equal(
    result.details.candidateWaveReview.reliabilityRecovery.posture,
    "selection_ready_with_non_selected_lane_guidance",
  );
  assert.deepEqual(result.details.candidateWaveReview.reliabilityRecovery.nonSelectedLaneIds, [
    "candidate-01",
  ]);
  assert.match(
    result.details.candidateWaveReview.reliabilityRecovery.laneRecovery.find(
      (lane) => lane.laneId === "candidate-01",
    ).guidance,
    /stop\/cancel/,
  );
  assert.match(
    result.details.candidateWaveReview.reliabilityRecovery.latePacketPolicy,
    /late candidate-result packet.*rerun/i,
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
    assert.equal(
      result.details.candidateWaveReview.level2CandidateBinding.kind,
      "autoresearch.level2_candidate_binding.v1",
    );
    assert.equal(
      result.details.candidateWaveReview.level2CandidateBinding.metric.name,
      "level2_candidate_binding_blockers",
    );
    assert.equal(result.details.candidateWaveReview.level2CandidateBinding.metric.value, 0);
    assert.equal(
      result.details.candidateWaveReview.reviewPacket.packetChainMetric.name,
      "candidate_review_packet_chain_blockers",
    );
    assert.equal(result.details.candidateWaveReview.reviewPacket.packetChainMetric.value, 0);
    assert.equal(
      result.details.candidateWaveReview.reviewPacket.packetChainMetric.status,
      "target_met",
    );
    assert.deepEqual(
      result.details.candidateWaveReview.reviewPacket.candidateResultPacketRefs.map((ref) => ({
        laneId: ref.laneId,
        sourcePacketPath: ref.sourcePacketPath,
        packetPresent: ref.packetPresent,
        selected: ref.selected,
      })),
      [
        { laneId: "candidate-01", sourcePacketPath: packetA, packetPresent: true, selected: false },
        { laneId: "candidate-02", sourcePacketPath: packetB, packetPresent: true, selected: true },
      ],
    );
    assert.equal(
      result.details.candidateWaveReview.level2CandidateBinding.controllerVerifiedLaneCount,
      2,
    );
    assert.deepEqual(result.details.candidateWaveReview.level2CandidateBinding.missingLaneIds, []);
    assert.deepEqual(
      result.details.candidateWaveReview.level2CandidateBinding.duplicateLaneIds,
      [],
    );
    assert.deepEqual(
      result.details.candidateWaveReview.level2CandidateBinding.peerAssertionOnlyLaneIds,
      [],
    );
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
    assert.match(
      result.content[0].text,
      /candidate: source=candidate_peer_spawn; branch=candidate\/candidate-02/,
    );
    assert.match(result.content[0].text, /worktree=.*candidate-02/);
    assert.match(result.content[0].text, /caveat: candidate 02 improved more/);
    assert.match(result.content[0].text, /Packet discovery: explicit/);
    assert.match(result.content[0].text, /Level-2 candidate binding/);
    assert.match(result.content[0].text, /level2_candidate_binding_blockers: 0/);
    assert.match(result.content[0].text, /controller-verified lanes: 2/);
    assert.match(result.content[0].text, /binding candidate-02: bound_controller_verified_packet/);
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

test("autoresearch_live_supervision review_candidate_wave rejects controller-inline packet lineage", async () => {
  await withTempDir(async (cwd) => {
    const inlinePacket = path.join(cwd, "candidate-inline.json");
    const peerPacket = path.join(cwd, "candidate-peer.json");
    writeFileSync(
      inlinePacket,
      JSON.stringify({
        packetKind: "autoresearch.candidate_result.v1",
        adapterContractVersion: 1,
        cwd,
        campaign: "candidate-wave",
        candidate: {
          source: "manual",
          worktreePath: cwd,
          branch: "main",
          baseRef: "HEAD",
          diffSummary: "controller inline patch that would have won on metric alone",
          filesChanged: ["packages/pi-designmd-foundry/src/inline.ts"],
        },
        candidateRun: {
          iteration: 1,
          status: "candidate",
          runKind: "ordinary",
          empiricalDecisionClass: "candidate_improvement",
          metric: 0,
          description: "Measure inline controller patch",
          timestamp: 1,
          checks: "pass",
          experiment: {
            hypothesisId: "candidate-inline",
            hypothesis: "Inline controller patch should be rejected despite best metric",
          },
        },
        empiricalDecisionClass: "candidate_improvement",
        resultSummary: "inline patch had best metric but bypassed candidate runner handoff",
        closeout: { status: { confidence: 3.1 } },
        adapterBoundary: "packet boundary",
      }),
    );
    writeFileSync(
      peerPacket,
      JSON.stringify({
        packetKind: "autoresearch.candidate_result.v1",
        adapterContractVersion: 1,
        cwd,
        campaign: "candidate-wave",
        candidate: {
          source: "candidate_peer_spawn",
          peerRunId: "candidatepeer-positive-lineage",
          runnerId: "candidate-runner-positive-lineage",
          worktreePath: path.join(cwd, ".worktrees", "candidate-peer"),
          branch: "candidate/candidate-peer",
          baseRef: "HEAD",
          diffSummary: "visible candidate runner patch",
          filesChanged: ["packages/pi-designmd-foundry/src/candidate.ts"],
        },
        candidateRun: {
          iteration: 1,
          status: "candidate",
          runKind: "ordinary",
          empiricalDecisionClass: "candidate_improvement",
          metric: 5,
          description: "Measure visible candidate runner patch",
          timestamp: 2,
          checks: "pass",
          experiment: {
            hypothesisId: "candidate-peer",
            hypothesis: "Visible candidate runner lineage remains selectable",
          },
        },
        empiricalDecisionClass: "candidate_improvement",
        resultSummary:
          "candidate runner packet is selectable even with a worse metric than inline patch",
        closeout: { status: { confidence: 2.8 } },
        adapterBoundary: "packet boundary",
      }),
    );

    const runner = new AutoresearchLiveSupervisionRunner();
    const tool = registerAutoresearchLiveTool(runner);
    const result = await tool.execute(
      "tc-review-candidate-wave-lineage-enforcement",
      {
        action: "review_candidate_wave",
        taskId: 2815,
        cwd,
        objective: "reject controller-inline implementation packets during campaign review",
        direction: "lower",
        candidateResultPacketPaths: [inlinePacket, peerPacket],
      },
      undefined,
      undefined,
      createToolContext(cwd),
    );

    assert.equal(result.details.ok, true);
    assert.equal(result.details.candidateWaveReview.recommendation.laneId, "candidate-peer");
    const inlineLane = result.details.candidateWaveReview.lanes.find(
      (lane) => lane.laneId === "candidate-inline",
    );
    const peerLane = result.details.candidateWaveReview.lanes.find(
      (lane) => lane.laneId === "candidate-peer",
    );
    assert.equal(inlineLane.selectable, false);
    assert.match(inlineLane.selectionReason, /process_violation/);
    assert.match(inlineLane.selectionReason, /manual/);
    assert.equal(peerLane.selectable, true);
    assert.match(peerLane.selectionReason, /verified candidate_peer_spawn worktree lineage/);
    assert.equal(peerLane.candidateSource, "candidate_peer_spawn");
    assert.equal(peerLane.candidatePeerRunId, "candidatepeer-positive-lineage");
    assert.deepEqual(peerLane.candidateFilesChanged, [
      "packages/pi-designmd-foundry/src/candidate.ts",
    ]);
    assert.match(result.content[0].text, /candidate-inline/);
    assert.match(result.content[0].text, /process_violation/);
    assert.match(result.content[0].text, /candidate-peer/);
    assert.match(result.content[0].text, /peerRunId=candidatepeer-positive-lineage/);
  });
});

test("autoresearch_live_supervision review_candidate_wave fails closed on off-limits path drift", async () => {
  await withTempDir(async (cwd) => {
    const driftPacket = path.join(cwd, "candidate-drift.json");
    const cleanPacket = path.join(cwd, "candidate-clean.json");
    writeFileSync(
      driftPacket,
      JSON.stringify({
        packetKind: "autoresearch.candidate_result.v1",
        adapterContractVersion: 1,
        cwd,
        campaign: "candidate-wave",
        candidate: {
          source: "candidate_peer_spawn",
          peerRunId: "candidatepeer-off-limits-drift",
          worktreePath: path.join(cwd, ".worktrees", "candidate-drift"),
          branch: "candidate/off-limits-drift",
          baseRef: "HEAD",
          diffSummary: "best metric but touched off-limits toolbox package",
          filesChanged: ["packages/pi-toolbox-discovery/src/index.ts"],
        },
        candidateRun: {
          iteration: 1,
          status: "candidate",
          runKind: "ordinary",
          empiricalDecisionClass: "candidate_improvement",
          metric: 0,
          description: "Measure drift candidate",
          timestamp: 1,
          checks: "pass",
          experiment: {
            hypothesisId: "candidate-drift",
            hypothesis: "Off-limits drift must fail closed despite best metric",
          },
        },
        empiricalDecisionClass: "candidate_improvement",
        resultSummary: "best metric but illegal changed file",
        closeout: { status: { confidence: 3.0 } },
        adapterBoundary: "packet boundary",
      }),
    );
    writeFileSync(
      cleanPacket,
      JSON.stringify({
        packetKind: "autoresearch.candidate_result.v1",
        adapterContractVersion: 1,
        cwd,
        campaign: "candidate-wave",
        candidate: {
          source: "candidate_peer_spawn",
          peerRunId: "candidatepeer-clean",
          worktreePath: path.join(cwd, ".worktrees", "candidate-clean"),
          branch: "candidate/clean",
          baseRef: "HEAD",
          diffSummary: "clean scoped candidate",
          filesChanged: [
            "packages/pi-society-orchestrator/src/runtime/autoresearch-supervisor-runner.ts",
          ],
        },
        candidateRun: {
          iteration: 1,
          status: "candidate",
          runKind: "ordinary",
          empiricalDecisionClass: "candidate_improvement",
          metric: 5,
          description: "Measure clean candidate",
          timestamp: 2,
          checks: "pass",
          experiment: {
            hypothesisId: "candidate-clean",
            hypothesis: "Clean candidate remains selectable",
          },
        },
        empiricalDecisionClass: "candidate_improvement",
        resultSummary: "clean candidate is selectable",
        closeout: { status: { confidence: 2.0 } },
        adapterBoundary: "packet boundary",
      }),
    );

    const runner = new AutoresearchLiveSupervisionRunner();
    const tool = registerAutoresearchLiveTool(runner);
    const result = await tool.execute(
      "tc-review-candidate-wave-off-limits-drift",
      {
        action: "review_candidate_wave",
        taskId: 2959,
        cwd,
        objective: "fail closed when a candidate result drifts into off-limits paths",
        direction: "lower",
        offLimits: ["packages/pi-toolbox-discovery/**"],
        candidateResultPacketPaths: [driftPacket, cleanPacket],
      },
      undefined,
      undefined,
      createToolContext(cwd),
    );

    assert.equal(result.details.ok, true);
    assert.equal(result.details.candidateWaveReview.recommendation.laneId, "candidate-clean");
    const driftLane = result.details.candidateWaveReview.lanes.find(
      (lane) => lane.laneId === "candidate-drift",
    );
    assert.equal(driftLane.selectable, false);
    assert.match(driftLane.selectionReason, /process_violation/);
    assert.match(driftLane.selectionReason, /off-limits path drift/);
    assert.match(driftLane.selectionReason, /packages\/pi-toolbox-discovery\/src\/index\.ts/);
    assert.match(
      result.details.candidateWaveReview.recommendation.exactNextCalls.join("\n"),
      /candidate-clean/,
    );
    assert.match(result.content[0].text, /candidate-drift/);
    assert.match(result.content[0].text, /off-limits path drift/);
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
    assert.equal(
      result.details.candidateWaveReview.level2CandidateBinding.metric.status,
      "blocked",
    );
    assert.deepEqual(result.details.candidateWaveReview.level2CandidateBinding.missingLaneIds, [
      "candidate-02",
    ]);
    assert.equal(
      result.details.candidateWaveReview.reliabilityRecovery.posture,
      "missing_or_stalled_lane_recovery_required",
    );
    assert.deepEqual(
      result.details.candidateWaveReview.reliabilityRecovery.missingOrStalledLaneIds,
      ["candidate-02"],
    );
    const missingRecovery =
      result.details.candidateWaveReview.reliabilityRecovery.laneRecovery.find(
        (lane) => lane.laneId === "candidate-02",
      );
    assert.equal(missingRecovery.kind, "missing_or_stalled_packet");
    assert.match(missingRecovery.guidance, /missing\/stalled\/late lane/);
    assert.match(missingRecovery.guidance, /replan without this lane/);
    assert.match(missingRecovery.exactNextCalls.join("\n"), /candidate_result_export/);
    assert.match(missingRecovery.exactNextCalls.join("\n"), /review_candidate_wave/);
    assert.match(result.details.candidateWaveReview.recommendation.reason, /candidate-02/);
    assert.match(result.content[0].text, /Recommendation: planned_lanes_incomplete/);
    assert.match(result.content[0].text, /waiting_for_planned_lanes/);
    assert.match(result.content[0].text, /level2_candidate_binding_blockers: 1/);
    assert.match(result.content[0].text, /missing lanes: candidate-02/);
    assert.match(result.content[0].text, /missing_packet guidance: verify\/export/);
    assert.match(result.content[0].text, /still running\/failed/);
    assert.match(result.content[0].text, /Wait for every explicit planned lane/);
  });
});

test("autoresearch_live_supervision review_candidate_wave fails closed on duplicate level-2 lane binding", async () => {
  const cwd = "/tmp/candidate-wave-duplicate-binding";
  const runner = new AutoresearchLiveSupervisionRunner();
  const tool = registerAutoresearchLiveTool(runner);

  const result = await tool.execute(
    "tc-review-candidate-wave-duplicate-binding",
    {
      action: "review_candidate_wave",
      taskId: 2674,
      cwd,
      objective: "detect duplicate candidate binding lanes",
      direction: "lower",
      candidateResults: [
        {
          laneId: "candidate-duplicate",
          metric: 1,
          status: "candidate_review_ready",
          checksStatus: "pass",
          candidateSource: "candidate_peer_spawn",
          candidatePeerRunId: "candidatepeer-duplicate-a",
        },
        {
          laneId: "candidate-duplicate",
          metric: 2,
          status: "candidate_review_ready",
          checksStatus: "pass",
          candidateSource: "candidate_peer_spawn",
          candidatePeerRunId: "candidatepeer-duplicate-b",
        },
      ],
    },
    undefined,
    undefined,
    createToolContext(cwd),
  );

  assert.equal(result.details.ok, true);
  assert.equal(result.details.candidateWaveReview.level2CandidateBinding.metric.status, "blocked");
  assert.deepEqual(result.details.candidateWaveReview.level2CandidateBinding.duplicateLaneIds, [
    "candidate-duplicate",
  ]);
  assert.match(result.content[0].text, /duplicate lanes: candidate-duplicate/);
  assert.match(result.content[0].text, /blocked_duplicate_lane/);
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

/**
 * summary: "Shared fixtures for the autoresearch live-control-plane test suite (scheduler, runtime status, manifests, packets)."
 * read_when:
 *   - "changing shared fixtures across the live-control-plane split test files."
 */
import assert from "node:assert/strict";
import { chmodSync, mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import os from "node:os";
import path from "node:path";
import extension from "../../extensions/society-orchestrator.ts";

export class FakeScheduler {
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

export function createRuntimeStatus(overrides = {}) {
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

export function createFinalizationInspection(cwd, status, overrides = {}) {
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

export function createProjectorResult({
  action = "recorded",
  milestone = "decision-required",
  reason,
}) {
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

export function registerAutoresearchLiveTool(runner, options = {}) {
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

export function createToolContext(cwd = process.cwd()) {
  return { cwd, model: undefined };
}

export async function withTempDir(fn) {
  const cwd = mkdtempSync(path.join(os.tmpdir(), "pi-orch-autoresearch-live-"));
  try {
    await fn(cwd);
  } finally {
    rmSync(cwd, { recursive: true, force: true });
  }
}

export function writeExecutable(cwd, name, content) {
  const target = path.join(cwd, name);
  mkdirSync(path.dirname(target), { recursive: true });
  writeFileSync(target, content, "utf8");
  chmodSync(target, 0o755);
}

export function createLevel3Manifest(cwd, overrides = {}) {
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

export function writeCandidateResultPacket(cwd, packetPath, overrides = {}) {
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

export function writeCandidatePeerRegistrySidecar({
  stateHome,
  cwd,
  peerRunId,
  worktreePath,
  branchName,
  overrides = {},
}) {
  const registryPath = path.join(stateHome, "pi-quests", "peer-registry", `${peerRunId}.json`);
  const archiveDir = path.join(stateHome, "pi-quests", "archives", peerRunId);
  mkdirSync(path.dirname(registryPath), { recursive: true });
  writeFileSync(
    registryPath,
    JSON.stringify(
      {
        schemaVersion: 1,
        peerRunId,
        tool: "candidate_peer_spawn",
        canonicalTool: "candidate_peer_spawn",
        parentCwd: cwd,
        repoRoot: cwd,
        worktreePath,
        branchName,
        baseRef: "HEAD",
        registryPath,
        archiveDir,
        cleanupPacket: { archiveDir },
        ...overrides,
      },
      null,
      2,
    ),
  );
  return registryPath;
}

import assert from "node:assert/strict";
import path from "node:path";
import test from "node:test";
import {
  AUTORESEARCH_AK_LIFECYCLE_OWNER,
  AUTORESEARCH_AK_LIFECYCLE_RUNTIME_OWNER,
  buildAutoresearchAkLifecycleKey,
  deriveAutoresearchAkLifecycleCandidate,
  evaluateAutoresearchAkLifecycle,
} from "../src/runtime/autoresearch-ak-lifecycle.ts";
import { deriveAutoresearchAkMilestoneCandidate } from "../src/runtime/autoresearch-ak-projector.ts";

const NULL_LEDGER = {
  context: {
    blockedReason: null,
    completionReason: null,
  },
};

function createRuntimeStatus(overrides = {}) {
  const {
    currentSegment: currentSegmentOverrides = {},
    runtimeProjection: runtimeProjectionOverrides = {},
    ...rest
  } = overrides;
  const cwd = Object.hasOwn(rest, "cwd")
    ? rest.cwd
    : "/tmp/autoresearch-repo/campaigns/widget-speed";

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
      runCount: 4,
      successfulRunCount: 4,
      baselineMetric: 24.1,
      bestMetric: 18.4,
      lastRunStatus: "keep",
      lastRunMetric: 18.4,
      ...currentSegmentOverrides,
    },
    runtimeProjection: {
      state: "completed",
      source: "ledger",
      resumeState: null,
      blockedReason: null,
      completionReason: "campaign finalized",
      ledgerPath: path.join(cwd, "autoresearch.events.jsonl"),
      hasLedger: true,
      invalidLedgerLines: 0,
      eventCount: 8,
      replayedEventCount: 8,
      rejectedEvents: [],
      syncIssues: [],
      ...runtimeProjectionOverrides,
    },
    control: {
      kind: "continue",
      allowedActions: ["continue", "stop"],
      selectedAt: null,
      reason: null,
      consumedAt: null,
    },
    promptVaultDecisions: {
      enabled: true,
      availableTemplates: [
        "pi-autoresearch-setup",
        "pi-autoresearch-next-hypothesis",
        "pi-autoresearch-finalize",
      ],
      blockedTemplates: ["pi-autoresearch-state-router"],
      lastSetup: null,
      lastPostRun: null,
      lastFinalize: null,
    },
    nextSlices: ["ak_campaign_binding"],
    ...rest,
  };
}

function createFinalizationInspection(cwd, status, overrides = {}) {
  const branches = overrides.createdBranches ?? [
    "autoresearch/widget-speed-01-core",
    "autoresearch/widget-speed-02-docs",
  ];
  const materializationStatus = overrides.materializationStatus ?? "succeeded";
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
          status: materializationStatus,
          createdBranches: branches,
          verifiedAt: materializationStatus === "succeeded" ? 1_200 : null,
          failureReason: materializationStatus === "failed" ? "verification mismatch" : null,
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

function createCompletedProjector({ runtime, cwd = runtime.cwd, action = "recorded" } = {}) {
  const candidate = deriveAutoresearchAkMilestoneCandidate({
    runtime,
    ledger: {
      context: {
        blockedReason: null,
        completionReason: runtime.runtimeProjection.completionReason,
      },
    },
  });

  assert.equal(candidate.kind, "projectable");
  assert.equal(candidate.payload.details.milestone, "completed");

  return {
    ok: true,
    action,
    candidate,
    task: {
      id: 1545,
      repo: path.resolve(cwd),
      status: "claimed",
    },
  };
}

function createNoopProjector(runtime) {
  const candidate = deriveAutoresearchAkMilestoneCandidate({
    runtime,
    ledger: NULL_LEDGER,
  });
  assert.equal(candidate.kind, "noop");
  return {
    ok: true,
    action: "noop",
    candidate,
  };
}

function createObservation({ runtime, finalization } = {}) {
  const resolvedRuntime = runtime || createRuntimeStatus();
  return {
    cwd: path.resolve(resolvedRuntime.cwd),
    runtime: resolvedRuntime,
    finalization:
      finalization ||
      createFinalizationInspection(path.resolve(resolvedRuntime.cwd), resolvedRuntime),
  };
}

test("non-terminal milestones remain evidence-only", async () => {
  const runtime = createRuntimeStatus({
    runtimeProjection: {
      state: "running_checks",
      completionReason: null,
    },
  });
  const observation = createObservation({
    runtime,
    finalization: createFinalizationInspection(runtime.cwd, runtime, { plan: null }),
  });
  const projector = createNoopProjector(runtime);
  const akCalls = [];

  const result = await evaluateAutoresearchAkLifecycle({
    taskId: 1545,
    akPath: "/tmp/fake-ak",
    societyDb: "/tmp/fake.db",
    observation,
    projector,
    runAk: async (params) => {
      akCalls.push(params.args.join(" "));
      throw new Error("runAk should not be called for evidence-only lifecycle decisions");
    },
  });

  assert.equal(result.ok, true);
  assert.equal(result.action, "none");
  assert.match(result.summary, /no coarse milestone is ready yet/i);
  assert.deepEqual(akCalls, []);
});

test("completed lifecycle candidate requires completed-milestone evidence before task completion", async () => {
  const observation = createObservation();
  const projector = createCompletedProjector({
    runtime: observation.runtime,
    action: "noop",
  });
  const akCalls = [];

  const result = await evaluateAutoresearchAkLifecycle({
    taskId: 1545,
    akPath: "/tmp/fake-ak",
    societyDb: "/tmp/fake.db",
    observation,
    projector,
    runAk: async (params) => {
      akCalls.push(params.args.join(" "));
      throw new Error("runAk should not be called before milestone evidence is durable");
    },
  });

  assert.equal(result.ok, true);
  assert.equal(result.action, "none");
  assert.match(result.summary, /evidence is not durably recorded yet/i);
  assert.deepEqual(akCalls, []);
});

test("missing finalization proof keeps the lifecycle evidence-only", async () => {
  const observation = createObservation({
    finalization: createFinalizationInspection(
      "/tmp/autoresearch-repo/campaigns/widget-speed",
      createRuntimeStatus(),
      {
        createdBranches: [],
      },
    ),
  });
  const projector = createCompletedProjector({ runtime: observation.runtime });
  const candidate = deriveAutoresearchAkLifecycleCandidate({ observation, projector });
  const akCalls = [];

  assert.equal(candidate.kind, "evidence_only");
  assert.match(candidate.reason, /does not list created review branches/i);

  const result = await evaluateAutoresearchAkLifecycle({
    taskId: 1545,
    akPath: "/tmp/fake-ak",
    societyDb: "/tmp/fake.db",
    observation,
    projector,
    runAk: async (params) => {
      akCalls.push(params.args.join(" "));
      throw new Error("runAk should not be called when finalization proof is incomplete");
    },
  });

  assert.equal(result.ok, true);
  assert.equal(result.action, "none");
  assert.match(result.summary, /created review branches/i);
  assert.deepEqual(akCalls, []);
});

test("verified completed campaigns complete the anchored task exactly once with deterministic payload", async () => {
  const repoRoot = "/tmp/autoresearch-repo";
  const cwd = path.join(repoRoot, "campaigns", "widget-speed");
  const observation = createObservation({
    runtime: createRuntimeStatus({ cwd }),
    finalization: createFinalizationInspection(cwd, createRuntimeStatus({ cwd })),
  });
  const projector = createCompletedProjector({
    runtime: observation.runtime,
    cwd: repoRoot,
    action: "recorded",
  });
  const akCalls = [];
  let completionPayload = null;

  const result = await evaluateAutoresearchAkLifecycle({
    taskId: 1545,
    akPath: "/tmp/fake-ak",
    societyDb: "/tmp/fake.db",
    observation,
    projector,
    runAk: async (params) => {
      akCalls.push({ args: [...params.args], cwd: params.cwd });
      if (params.args[0] === "task" && params.args[1] === "show") {
        return {
          ok: true,
          stdout: JSON.stringify({
            id: 1545,
            repo: repoRoot,
            status: "claimed",
            entity_version: 7,
          }),
          stderr: "",
        };
      }

      if (params.args[0] === "task" && params.args[1] === "complete") {
        completionPayload = JSON.parse(params.args[4]);
        return {
          ok: true,
          stdout: "",
          stderr: "",
        };
      }

      throw new Error(`Unexpected ak args: ${params.args.join(" ")}`);
    },
  });

  assert.equal(result.ok, true);
  assert.equal(result.action, "completed_task");
  assert.match(result.summary, /completed after verified local finalization materialization/i);
  assert.deepEqual(
    akCalls.map((entry) => entry.args.join(" ")),
    ["task show 1545 -F json", `task complete 1545 --result ${JSON.stringify(completionPayload)}`],
  );
  assert.equal(akCalls[0].cwd, cwd);
  assert.equal(akCalls[1].cwd, repoRoot);

  assert.equal(completionPayload.contract_version, 1);
  assert.equal(completionPayload.completion_owner, AUTORESEARCH_AK_LIFECYCLE_OWNER);
  assert.equal(completionPayload.runtime_owner, AUTORESEARCH_AK_LIFECYCLE_RUNTIME_OWNER);
  assert.equal(completionPayload.cwd, path.resolve(cwd));
  assert.equal(
    completionPayload.lifecycle_key,
    buildAutoresearchAkLifecycleKey({
      segmentName: "widget-speed",
      runCount: 4,
      completionReason: "campaign finalized",
      branchCount: 2,
    }),
  );
  assert.equal(completionPayload.runtime.state, "completed");
  assert.equal(completionPayload.runtime.completion_reason, "campaign finalized");
  assert.equal(completionPayload.runtime.run_count, 4);
  assert.equal(completionPayload.runtime.best_metric, 18.4);
  assert.deepEqual(completionPayload.finalization.created_branches, [
    "autoresearch/widget-speed-01-core",
    "autoresearch/widget-speed-02-docs",
  ]);
});

test("already-terminal tasks are not mutated again", async () => {
  const observation = createObservation();
  const projector = createCompletedProjector({
    runtime: observation.runtime,
    action: "already-projected",
  });
  const akCalls = [];

  const result = await evaluateAutoresearchAkLifecycle({
    taskId: 1545,
    akPath: "/tmp/fake-ak",
    societyDb: "/tmp/fake.db",
    observation,
    projector,
    runAk: async (params) => {
      akCalls.push(params.args.join(" "));
      if (params.args[0] === "task" && params.args[1] === "show") {
        return {
          ok: true,
          stdout: JSON.stringify({
            id: 1545,
            repo: "/tmp/autoresearch-repo",
            status: "done",
          }),
          stderr: "",
        };
      }

      throw new Error(`Unexpected ak args: ${params.args.join(" ")}`);
    },
  });

  assert.equal(result.ok, true);
  assert.equal(result.action, "already_terminal");
  assert.match(result.summary, /already done/i);
  assert.deepEqual(akCalls, ["task show 1545 -F json"]);
});

test("repo mismatches fail closed and blocked states do not auto-fail tasks", async () => {
  const observation = createObservation();
  const projector = createCompletedProjector({ runtime: observation.runtime, action: "recorded" });
  const akCalls = [];

  const mismatch = await evaluateAutoresearchAkLifecycle({
    taskId: 1545,
    akPath: "/tmp/fake-ak",
    societyDb: "/tmp/fake.db",
    observation,
    projector,
    runAk: async (params) => {
      akCalls.push(params.args.join(" "));
      if (params.args[0] === "task" && params.args[1] === "show") {
        return {
          ok: true,
          stdout: JSON.stringify({
            id: 1545,
            repo: "/tmp/other-repo",
            status: "claimed",
          }),
          stderr: "",
        };
      }

      throw new Error(`Unexpected ak args: ${params.args.join(" ")}`);
    },
  });

  assert.equal(mismatch.ok, false);
  assert.equal(mismatch.action, "blocked");
  assert.match(mismatch.summary, /outside anchored task repo/i);
  assert.deepEqual(akCalls, ["task show 1545 -F json"]);
  assert.equal(
    akCalls.some((entry) => entry.startsWith("task fail ")),
    false,
  );

  const blocked = await evaluateAutoresearchAkLifecycle({
    taskId: 1545,
    akPath: "/tmp/fake-ak",
    societyDb: "/tmp/fake.db",
    observation,
    projector: {
      ok: false,
      action: "blocked",
      candidate: projector.candidate,
      error: "forced lifecycle preflight failure",
    },
    runAk: async () => {
      throw new Error("blocked lifecycle decisions must not mutate AK");
    },
  });

  assert.equal(blocked.ok, false);
  assert.equal(blocked.action, "blocked");
  assert.match(blocked.summary, /forced lifecycle preflight failure/);
});

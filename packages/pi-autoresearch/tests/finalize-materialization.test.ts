import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import os from "node:os";
import path from "node:path";
import test from "node:test";

import {
  type PiAutoresearchExtensionOptions,
  registerPiAutoresearchExtension,
} from "../extensions/pi-autoresearch.ts";
import {
  AUTORESEARCH_FINALIZE_TEMPLATE_NAME,
  type AutoresearchDecisionRuntime,
  type FinalizeDecisionResult,
} from "../src/core/decisions.ts";
import {
  approveAutoresearchFinalizationPlan,
  loadAutoresearchFinalizationPlan,
  materializeAutoresearchFinalizationPlan,
  planAutoresearchFinalizationFromDecision,
} from "../src/core/finalize.ts";
import {
  AUTORESEARCH_FINALIZE_TOOL_NAME,
  appendReceipt,
  buildAutoresearchRuntimeStatus,
  createConfigReceipt,
  createRunReceipt,
  setAutoresearchRuntimeControl,
} from "../src/core/runtime.ts";

type RepoFixture = {
  cwd: string;
  base: string;
  sourceBranch: string;
  commitA: string;
  commitB: string;
  finalTree: string;
};

type GroupSpec = {
  title: string;
  lastCommit: string;
  commits?: string[];
  metricEffect?: string;
  dependencyNotes?: string[];
  body?: string;
  slug?: string;
};

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

async function withTempRepo(fn: (fixture: RepoFixture) => Promise<void> | void): Promise<void> {
  const cwd = mkdtempSync(path.join(os.tmpdir(), "pi-autoresearch-finalize-materialize-"));
  try {
    const fixture = createRepoFixture(cwd);
    await fn(fixture);
  } finally {
    rmSync(cwd, { recursive: true, force: true });
  }
}

function createRepoFixture(cwd: string): RepoFixture {
  git(cwd, ["init", "--quiet"]);
  git(cwd, ["config", "user.name", "Pi Test"]);
  git(cwd, ["config", "user.email", "pi@example.com"]);
  git(cwd, ["checkout", "-b", "main"]);

  writeText(cwd, "file_a.txt", "original-a\n");
  writeText(cwd, "file_b.txt", "original-b\n");
  writeText(cwd, "file_c.txt", "original-c\n");
  git(cwd, ["add", "-A"]);
  git(cwd, ["commit", "-m", "initial", "--quiet"]);

  git(cwd, ["checkout", "-b", "autoresearch/session", "--quiet"]);

  writeText(cwd, "file_a.txt", "optimized-a\n");
  git(cwd, ["add", "-A"]);
  git(cwd, ["commit", "-m", "optimize file a", "--quiet"]);
  const commitA = git(cwd, ["rev-parse", "HEAD"]);

  writeText(cwd, "file_b.txt", "optimized-b\n");
  writeText(cwd, "libs/polaris/autoresearch.jsonl", '{"type":"config"}\n');
  git(cwd, ["add", "-A"]);
  git(cwd, ["commit", "-m", "optimize file b", "--quiet"]);
  const commitB = git(cwd, ["rev-parse", "HEAD"]);

  seedReceipts(cwd, commitA, commitB);

  return {
    cwd,
    base: git(cwd, ["merge-base", "HEAD", "main"]),
    sourceBranch: git(cwd, ["branch", "--show-current"]),
    commitA,
    commitB,
    finalTree: git(cwd, ["rev-parse", "HEAD"]),
  };
}

function seedReceipts(cwd: string, commitA: string, commitB: string): void {
  appendReceipt(
    cwd,
    createConfigReceipt({
      name: "Widget Speed",
      metricName: "total_ms",
      metricUnit: "ms",
      direction: "lower",
      createdAt: 1,
      benchmarkCommand: "bash autoresearch.sh",
      checksCommand: "bash autoresearch.checks.sh",
    }),
  );
  appendReceipt(
    cwd,
    createRunReceipt({
      status: "keep",
      metric: 120,
      description: "Keep the first optimization.",
      timestamp: 10,
      commit: commitA,
      iteration: 1,
    }),
  );
  appendReceipt(
    cwd,
    createRunReceipt({
      status: "keep",
      metric: 95,
      description: "Keep the second optimization and prepare finalization.",
      timestamp: 20,
      commit: commitB,
      iteration: 2,
      decision: {
        kind: "next_hypothesis",
        templateName: "pi-autoresearch-next-hypothesis",
        status: "finalize_candidate",
        mappedDecision: "finalize",
        blockingReason: null,
        failureStage: null,
        stateRead: "The runtime is now finalize-worthy.",
        nextHypothesis: "Prepare a finalization plan.",
        targetFiles: ["file_a.txt", "file_b.txt"],
        expectedPrimaryEffect: "Turn kept runs into reviewable groups.",
        timestamp: 21,
      },
    }),
  );
}

function createReadyFinalizeDecision(input: {
  base: string;
  finalTree: string;
  groups: GroupSpec[];
}): FinalizeDecisionResult {
  return {
    kind: "finalize",
    templateName: AUTORESEARCH_FINALIZE_TEMPLATE_NAME,
    status: "ready",
    baseRef: input.base,
    trunkRef: "main",
    overallResult: "Two kept optimizations are ready for grouped review branches.",
    proposedGroups: input.groups.map((group) => ({
      title: group.title,
      commits: group.commits ?? [group.lastCommit],
      files: [],
      metricEffect: group.metricEffect ?? "Improves bounded runtime reviewability.",
      dependencyNotes: group.dependencyNotes ?? [],
    })),
    groupingRationale: ["Keep each logical change isolated and reviewable."],
    approvalRequired: true,
    groupsJsonDraft: {
      base: input.base,
      trunk: "main",
      final_tree: input.finalTree,
      goal: "widget-speed",
      groups: input.groups.map((group) => ({
        title: group.title,
        body:
          group.body ??
          `${group.title}\n\nMetric: kept improvement\nExperiments: bounded runtime fixture`,
        last_commit: group.lastCommit,
        slug:
          group.slug ??
          group.title
            .toLowerCase()
            .replace(/[^a-z0-9]+/g, "-")
            .replace(/^-+|-+$/g, ""),
      })),
    },
    riskNotes: ["Approval remains explicit before any branch mutation."],
    cleanupHints: ["Leave session artifacts out of review branches."],
  };
}

function planAndApproveFinalization(fixture: RepoFixture) {
  const initialStatus = buildAutoresearchRuntimeStatus(fixture.cwd, { persistSnapshot: false });
  assert.equal(initialStatus.runtimeProjection.state, "finalize_candidate");

  setAutoresearchRuntimeControl({
    cwd: fixture.cwd,
    decision: "finalize",
    reason: "prepare grouped review branches",
  });

  const status = buildAutoresearchRuntimeStatus(fixture.cwd, { persistSnapshot: false });
  const planned = planAutoresearchFinalizationFromDecision({
    cwd: fixture.cwd,
    status,
    decision: createReadyFinalizeDecision({
      base: fixture.base,
      finalTree: fixture.finalTree,
      groups: [
        {
          title: "Optimize file A",
          lastCommit: fixture.commitA,
          slug: "optimize-a",
        },
        {
          title: "Optimize file B",
          lastCommit: fixture.commitB,
          commits: [fixture.commitA, fixture.commitB],
          slug: "optimize-b",
        },
      ],
    }),
  });
  const approved = approveAutoresearchFinalizationPlan({
    cwd: fixture.cwd,
    reason: "ready to materialize bounded review branches",
  });

  return {
    planned,
    approved,
  };
}

function createDecisionRuntimeStub(fixture: RepoFixture): AutoresearchDecisionRuntime {
  return {
    async runSetup() {
      throw new Error("setup not expected");
    },
    async runNextHypothesis() {
      throw new Error("next-hypothesis not expected");
    },
    async runFinalize() {
      return createReadyFinalizeDecision({
        base: fixture.base,
        finalTree: fixture.finalTree,
        groups: [
          {
            title: "Optimize file A",
            lastCommit: fixture.commitA,
            slug: "optimize-a",
          },
          {
            title: "Optimize file B",
            lastCommit: fixture.commitB,
            commits: [fixture.commitA, fixture.commitB],
            slug: "optimize-b",
          },
        ],
      });
    },
  };
}

function git(cwd: string, args: string[], options: { trim?: boolean } = {}): string {
  const result = spawnSync("git", args, {
    cwd,
    encoding: "utf8",
    stdio: ["ignore", "pipe", "pipe"],
  });
  if (result.error) {
    throw result.error;
  }
  if (result.status !== 0) {
    throw new Error(`git ${args.join(" ")} failed: ${(result.stderr || result.stdout).trim()}`);
  }
  const stdout = result.stdout ?? "";
  return options.trim === false ? stdout : stdout.trim();
}

function writeText(cwd: string, relativePath: string, content: string): void {
  const target = path.join(cwd, relativePath);
  const parent = path.dirname(target);
  if (parent !== cwd) {
    spawnSync("bash", ["-lc", `mkdir -p ${JSON.stringify(parent)}`], {
      cwd,
      stdio: "ignore",
    });
  }
  writeFileSync(target, content, "utf8");
}

test("materializeAutoresearchFinalizationPlan creates independent review branches and completes the local runtime", async () => {
  await withTempRepo((fixture) => {
    planAndApproveFinalization(fixture);

    const result = materializeAutoresearchFinalizationPlan({
      cwd: fixture.cwd,
      reason: "ship local review branches",
    });

    assert.deepEqual(result.createdBranches, [
      "autoresearch/widget-speed/01-optimize-a",
      "autoresearch/widget-speed/02-optimize-b",
    ]);
    assert.equal(result.verification.ok, true);
    assert.equal(result.plan?.approval.state, "materialized");
    assert.equal(result.plan?.materialization.status, "succeeded");
    assert.equal(result.status.runtimeProjection.state, "completed");
    assert.equal(result.status.control.kind, "none");
    assert.equal(git(fixture.cwd, ["branch", "--show-current"]), fixture.sourceBranch);

    assert.equal(
      git(fixture.cwd, ["show", "autoresearch/widget-speed/01-optimize-a:file_a.txt"]),
      "optimized-a",
    );
    assert.equal(
      git(fixture.cwd, ["show", "autoresearch/widget-speed/01-optimize-a:file_b.txt"]),
      "original-b",
    );
    assert.equal(
      git(fixture.cwd, ["show", "autoresearch/widget-speed/02-optimize-b:file_a.txt"]),
      "original-a",
    );
    assert.equal(
      git(fixture.cwd, ["show", "autoresearch/widget-speed/02-optimize-b:file_b.txt"]),
      "optimized-b",
    );

    const parentA = git(fixture.cwd, [
      "rev-list",
      "--parents",
      "-n",
      "1",
      "autoresearch/widget-speed/01-optimize-a",
    ]).split(/\s+/);
    const parentB = git(fixture.cwd, [
      "rev-list",
      "--parents",
      "-n",
      "1",
      "autoresearch/widget-speed/02-optimize-b",
    ]).split(/\s+/);
    assert.equal(parentA[1], fixture.base);
    assert.equal(parentB[1], fixture.base);

    const branchBFiles = git(
      fixture.cwd,
      [
        "diff-tree",
        "--no-commit-id",
        "--name-only",
        "-r",
        "autoresearch/widget-speed/02-optimize-b",
      ],
      { trim: false },
    )
      .split(/\r?\n/)
      .map((line) => line.trim())
      .filter(Boolean);
    assert.deepEqual(
      branchBFiles.filter((file) => path.basename(file).startsWith("autoresearch.")),
      [],
    );
  });
});

test("materializeAutoresearchFinalizationPlan rejects dirty non-session files before mutation", async () => {
  await withTempRepo((fixture) => {
    planAndApproveFinalization(fixture);
    writeText(fixture.cwd, "notes.txt", "dirty\n");

    assert.throws(
      () =>
        materializeAutoresearchFinalizationPlan({
          cwd: fixture.cwd,
        }),
      /Working tree is not clean/i,
    );

    assert.equal(git(fixture.cwd, ["branch", "--show-current"]), fixture.sourceBranch);
    assert.throws(
      () => git(fixture.cwd, ["rev-parse", "autoresearch/widget-speed/01-optimize-a"]),
      /failed/i,
    );
  });
});

test("materializeAutoresearchFinalizationPlan rolls back created branches on creation failure", async () => {
  await withTempRepo((fixture) => {
    planAndApproveFinalization(fixture);

    assert.throws(
      () =>
        materializeAutoresearchFinalizationPlan({
          cwd: fixture.cwd,
          testHooks: {
            beforeCreateGroup(group) {
              if (group.index === 2) {
                throw new Error("simulated group creation failure");
              }
            },
          },
        }),
      /simulated group creation failure/i,
    );

    assert.equal(git(fixture.cwd, ["branch", "--show-current"]), fixture.sourceBranch);
    assert.throws(
      () => git(fixture.cwd, ["rev-parse", "autoresearch/widget-speed/01-optimize-a"]),
      /failed/i,
    );
    assert.throws(
      () => git(fixture.cwd, ["rev-parse", "autoresearch/widget-speed/02-optimize-b"]),
      /failed/i,
    );

    const plan = loadAutoresearchFinalizationPlan(fixture.cwd);
    assert.ok(plan);
    assert.equal(plan?.materialization.status, "failed");
    assert.equal(plan?.materialization.createdBranches.length, 0);
    assert.match(plan?.materialization.failureReason ?? "", /simulated group creation failure/i);
  });
});

test("materializeAutoresearchFinalizationPlan keeps created branches when verification fails", async () => {
  await withTempRepo((fixture) => {
    planAndApproveFinalization(fixture);

    assert.throws(
      () =>
        materializeAutoresearchFinalizationPlan({
          cwd: fixture.cwd,
          testHooks: {
            beforeVerify() {
              throw new Error("simulated verification failure");
            },
          },
        }),
      /simulated verification failure/i,
    );

    assert.equal(git(fixture.cwd, ["branch", "--show-current"]), fixture.sourceBranch);
    git(fixture.cwd, ["rev-parse", "autoresearch/widget-speed/01-optimize-a"]);
    git(fixture.cwd, ["rev-parse", "autoresearch/widget-speed/02-optimize-b"]);

    const plan = loadAutoresearchFinalizationPlan(fixture.cwd);
    assert.ok(plan);
    assert.equal(plan?.materialization.status, "failed");
    assert.deepEqual(plan?.materialization.createdBranches, [
      "autoresearch/widget-speed/01-optimize-a",
      "autoresearch/widget-speed/02-optimize-b",
    ]);
    assert.match(plan?.materialization.failureReason ?? "", /simulated verification failure/i);
  });
});

test("autoresearch_runtime_finalize plans, approves, and materializes through the extension surface", async () => {
  await withTempRepo(async (fixture) => {
    const { tools } = registerHarness({
      createDecisionRuntime() {
        return createDecisionRuntimeStub(fixture);
      },
    });

    setAutoresearchRuntimeControl({
      cwd: fixture.cwd,
      decision: "finalize",
      reason: "prepare grouped review branches",
    });

    const tool = tools.get(AUTORESEARCH_FINALIZE_TOOL_NAME);
    assert.ok(tool);

    const planned = await tool?.execute(
      "plan",
      { action: "plan", cwd: fixture.cwd },
      undefined,
      undefined,
      { cwd: fixture.cwd },
    );
    assert.match(planned?.content[0]?.text ?? "", /approval state: pending/i);

    const approved = await tool?.execute(
      "approve",
      { action: "approve", cwd: fixture.cwd, reason: "approved for materialization" },
      undefined,
      undefined,
      { cwd: fixture.cwd },
    );
    assert.match(approved?.content[0]?.text ?? "", /approval state: approved/i);

    const materialized = await tool?.execute(
      "materialize",
      { action: "materialize", cwd: fixture.cwd },
      undefined,
      undefined,
      { cwd: fixture.cwd },
    );
    assert.match(materialized?.content[0]?.text ?? "", /materialization status: succeeded/i);
    assert.equal(
      (materialized?.details as { status: { runtimeProjection: { state: string } } }).status
        .runtimeProjection.state,
      "completed",
    );
  });
});

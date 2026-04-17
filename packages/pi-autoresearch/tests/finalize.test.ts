import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import os from "node:os";
import path from "node:path";
import test from "node:test";

import {
  AUTORESEARCH_FINALIZE_TEMPLATE_NAME,
  type AutoresearchDecisionRuntime,
  type FinalizeDecisionResult,
} from "../src/core/decisions.ts";
import {
  collectAutoresearchGitContext,
  createAutoresearchFinalizationContext,
  loadAutoresearchFinalizationPlan,
  loadAutoresearchFinalizationPlanState,
  planAutoresearchFinalizationFromDecision,
  requestAutoresearchFinalizationPlan,
  resolveAutoresearchFinalizationPlanPath,
} from "../src/core/finalize.ts";
import {
  appendReceipt,
  buildAutoresearchRuntimeStatus,
  createConfigReceipt,
  createRunReceipt,
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

async function withTempRepo(fn: (fixture: RepoFixture) => Promise<void> | void): Promise<void> {
  const cwd = mkdtempSync(path.join(os.tmpdir(), "pi-autoresearch-finalize-"));
  try {
    const fixture = createRepoFixture(cwd);
    await fn(fixture);
  } finally {
    rmSync(cwd, { recursive: true, force: true });
  }
}

function createRepoFixture(
  cwd: string,
  options: { secondChange?: "file_b" | "file_a_again" | "session_only" } = {},
): RepoFixture {
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

  const secondChange = options.secondChange ?? "file_b";
  if (secondChange === "file_b") {
    writeText(cwd, "file_b.txt", "optimized-b\n");
  } else if (secondChange === "file_a_again") {
    writeText(cwd, "file_a.txt", "optimized-a-again\n");
  } else {
    writeText(cwd, "libs/polaris/autoresearch.jsonl", '{"type":"config"}\n');
  }

  git(cwd, ["add", "-A"]);
  git(cwd, ["commit", "-m", "second change", "--quiet"]);
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
  trunkRef?: string;
  goal?: string;
  useShortRefs?: boolean;
  groups: GroupSpec[];
}): FinalizeDecisionResult {
  const short = (hash: string) => hash.slice(0, 12);
  const useRef = (hash: string) => (input.useShortRefs ? short(hash) : hash);
  return {
    kind: "finalize",
    templateName: AUTORESEARCH_FINALIZE_TEMPLATE_NAME,
    status: "ready",
    baseRef: useRef(input.base),
    trunkRef: input.trunkRef ?? "main",
    overallResult: "Two kept optimizations are ready for grouped review branches.",
    proposedGroups: input.groups.map((group) => ({
      title: group.title,
      commits: (group.commits ?? [group.lastCommit]).map(useRef),
      files: [],
      metricEffect: group.metricEffect ?? "Improves bounded runtime reviewability.",
      dependencyNotes: group.dependencyNotes ?? [],
    })),
    groupingRationale: ["Keep each logical change isolated and reviewable."],
    approvalRequired: true,
    groupsJsonDraft: {
      base: useRef(input.base),
      trunk: input.trunkRef ?? "main",
      final_tree: useRef(input.finalTree),
      goal: input.goal ?? "widget-speed",
      groups: input.groups.map((group) => ({
        title: group.title,
        body:
          group.body ??
          `${group.title}\n\nMetric: kept improvement\nExperiments: bounded runtime fixture`,
        last_commit: useRef(group.lastCommit),
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
    const shell = `mkdir -p ${JSON.stringify(parent)}`;
    spawnSync("bash", ["-lc", shell], { cwd, stdio: "ignore" });
  }
  writeFileSync(target, content, "utf8");
}

test("createAutoresearchFinalizationContext collects kept runs, git context, and packet inputs", async () => {
  await withTempRepo((fixture) => {
    writeText(
      fixture.cwd,
      "autoresearch.ideas.md",
      "- keep this for later\n- leave routing deferred\n",
    );
    const status = buildAutoresearchRuntimeStatus(fixture.cwd, { persistSnapshot: false });
    assert.equal(status.runtimeProjection.state, "finalize_candidate");

    const context = createAutoresearchFinalizationContext({ cwd: fixture.cwd, status });

    assert.equal(context.git.sourceBranch, fixture.sourceBranch);
    assert.equal(context.git.baseRef, fixture.base);
    assert.equal(context.git.finalTree, fixture.finalTree);
    assert.equal(context.goalSlug, "widget-speed");
    assert.equal(context.keptRuns.length, 2);
    assert.equal(context.packet.mergeBase, fixture.base);
    assert.equal(context.packet.trunkTarget, "main");
    assert.equal(context.packet.commitSummaries.length, 2);
    assert.deepEqual(context.packet.ideasToLeaveOut, [
      "keep this for later",
      "leave routing deferred",
    ]);
  });
});

test("planAutoresearchFinalizationFromDecision writes a normalized plan with full hashes", async () => {
  await withTempRepo((fixture) => {
    const status = buildAutoresearchRuntimeStatus(fixture.cwd, { persistSnapshot: false });
    const result = planAutoresearchFinalizationFromDecision({
      cwd: fixture.cwd,
      status,
      createdAt: 123,
      decision: createReadyFinalizeDecision({
        base: fixture.base,
        finalTree: fixture.finalTree,
        useShortRefs: true,
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

    assert.equal(result.plan.createdAt, 123);
    assert.equal(result.plan.baseRef, fixture.base);
    assert.equal(result.plan.finalTree, fixture.finalTree);
    assert.equal(result.plan.groups[0]?.lastCommit, fixture.commitA);
    assert.equal(result.plan.groups[1]?.lastCommit, fixture.commitB);
    assert.deepEqual(result.plan.groups[0]?.files, ["file_a.txt"]);
    assert.deepEqual(result.plan.groups[1]?.files, ["file_b.txt"]);
    assert.equal(result.plan.groups[0]?.branchName, "autoresearch/widget-speed/01-optimize-a");
    assert.equal(result.plan.groupsJsonDraft.base, fixture.base);
    assert.equal(result.plan.groupsJsonDraft.final_tree, fixture.finalTree);
    assert.equal(result.plan.groupsJsonDraft.groups[0]?.last_commit, fixture.commitA);
    assert.equal(result.planPath, resolveAutoresearchFinalizationPlanPath(fixture.cwd));

    const loaded = loadAutoresearchFinalizationPlan(fixture.cwd);
    assert.ok(loaded);
    assert.equal(loaded?.goalSlug, "widget-speed");
    assert.equal(loaded?.groups[1]?.branchName, "autoresearch/widget-speed/02-optimize-b");
  });
});

test("planAutoresearchFinalizationFromDecision rejects overlapping groups", async () => {
  const cwd = mkdtempSync(path.join(os.tmpdir(), "pi-autoresearch-finalize-overlap-"));
  try {
    const fixture = createRepoFixture(cwd, { secondChange: "file_a_again" });
    const status = buildAutoresearchRuntimeStatus(fixture.cwd, { persistSnapshot: false });

    assert.throws(
      () =>
        planAutoresearchFinalizationFromDecision({
          cwd: fixture.cwd,
          status,
          decision: createReadyFinalizeDecision({
            base: fixture.base,
            finalTree: fixture.finalTree,
            groups: [
              {
                title: "Optimize file A first",
                lastCommit: fixture.commitA,
                slug: "optimize-a-first",
              },
              {
                title: "Optimize file A again",
                lastCommit: fixture.commitB,
                slug: "optimize-a-again",
              },
            ],
          }),
        }),
      /appears in multiple finalization groups/i,
    );
  } finally {
    rmSync(cwd, { recursive: true, force: true });
  }
});

test("planAutoresearchFinalizationFromDecision rejects groups that only touch session artifacts", async () => {
  const cwd = mkdtempSync(path.join(os.tmpdir(), "pi-autoresearch-finalize-session-only-"));
  try {
    const fixture = createRepoFixture(cwd, { secondChange: "session_only" });
    const status = buildAutoresearchRuntimeStatus(fixture.cwd, { persistSnapshot: false });

    assert.throws(
      () =>
        planAutoresearchFinalizationFromDecision({
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
                title: "Session artifacts only",
                lastCommit: fixture.commitB,
                slug: "session-only",
              },
            ],
          }),
        }),
      /no non-session files after exclusion/i,
    );
  } finally {
    rmSync(cwd, { recursive: true, force: true });
  }
});

test("loadAutoresearchFinalizationPlanState marks plans stale when HEAD changes", async () => {
  await withTempRepo((fixture) => {
    const status = buildAutoresearchRuntimeStatus(fixture.cwd, { persistSnapshot: false });
    planAutoresearchFinalizationFromDecision({
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
            slug: "optimize-b",
          },
        ],
      }),
    });

    writeText(fixture.cwd, "file_c.txt", "changed-after-plan\n");
    git(fixture.cwd, ["add", "file_c.txt"]);
    git(fixture.cwd, ["commit", "-m", "post-plan drift", "--quiet"]);

    const state = loadAutoresearchFinalizationPlanState({ cwd: fixture.cwd });
    assert.equal(state.planStatus.reuse, "final_tree_mismatch");
    assert.match(state.planStatus.discardedReason ?? "", /current HEAD/i);
  });
});

test("requestAutoresearchFinalizationPlan builds the packet, invokes the runtime, and persists a plan", async () => {
  await withTempRepo(async (fixture) => {
    const runtime: AutoresearchDecisionRuntime = {
      async runSetup() {
        throw new Error("setup not expected");
      },
      async runNextHypothesis() {
        throw new Error("next-hypothesis not expected");
      },
      async runFinalize(packet) {
        assert.equal(packet.mergeBase, fixture.base);
        assert.equal(packet.trunkTarget, "main");
        assert.equal(packet.keptRuns.length, 2);
        assert.equal(packet.commitSummaries.length, 2);
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
              slug: "optimize-b",
            },
          ],
        });
      },
    };

    const result = await requestAutoresearchFinalizationPlan({
      cwd: fixture.cwd,
      runtime,
    });

    assert.equal(result.packet.mergeBase, fixture.base);
    assert.equal(result.plan.groups.length, 2);
    assert.equal(result.plan.groups[1]?.files[0], "file_b.txt");
    assert.equal(result.planPath, resolveAutoresearchFinalizationPlanPath(fixture.cwd));
  });
});

test("collectAutoresearchGitContext rejects trunk finalization planning", async () => {
  const cwd = mkdtempSync(path.join(os.tmpdir(), "pi-autoresearch-finalize-trunk-"));
  try {
    git(cwd, ["init", "--quiet"]);
    git(cwd, ["config", "user.name", "Pi Test"]);
    git(cwd, ["config", "user.email", "pi@example.com"]);
    git(cwd, ["checkout", "-b", "main"]);
    writeText(cwd, "file.txt", "hello\n");
    git(cwd, ["add", "-A"]);
    git(cwd, ["commit", "-m", "initial", "--quiet"]);

    assert.throws(() => collectAutoresearchGitContext(cwd), /requires a feature branch/i);
  } finally {
    rmSync(cwd, { recursive: true, force: true });
  }
});

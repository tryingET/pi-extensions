import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import {
  chmodSync,
  existsSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import { runInNewContext } from "node:vm";

import {
  type PiAutoresearchExtensionOptions,
  registerPiAutoresearchExtension,
} from "../extensions/pi-autoresearch.ts";
import { resolveAutoresearchRuntimeSnapshotPath } from "../src/core/resume.ts";
import {
  AUTORESEARCH_CAMPAIGN_START_TOOL_NAME,
  AUTORESEARCH_CANDIDATE_BIND_TOOL_NAME,
  AUTORESEARCH_CANDIDATE_DECISION_TOOL_NAME,
  appendReceipt,
  buildAutoresearchCandidateBindPlan,
  createConfigReceipt,
  createRunReceipt,
  formatAutoresearchCandidateBindPlan,
  loadReceiptLog,
} from "../src/core/runtime.ts";

type RegisteredCommand = {
  description?: string;
  handler: (args: string, ctx: unknown) => Promise<void> | void;
};

type RegisteredTool = {
  name: string;
  description?: string;
  execute: (
    toolCallId: string,
    params: unknown,
    signal: AbortSignal | undefined,
    onUpdate: unknown,
    ctx: { cwd?: string },
  ) => Promise<{ content: Array<{ type: string; text: string }>; details: unknown }>;
};

type RegisteredEventHandler = (...args: unknown[]) => unknown;

function registerHarness(options: PiAutoresearchExtensionOptions = {}) {
  const commands = new Map<string, RegisteredCommand>();
  const tools = new Map<string, RegisteredTool>();
  const eventHandlers = new Map<string, RegisteredEventHandler>();

  registerPiAutoresearchExtension(
    {
      registerCommand(name: string, command: RegisteredCommand) {
        commands.set(name, command);
      },
      registerTool(tool: RegisteredTool) {
        tools.set(tool.name, tool);
      },
      on(event: string, handler: RegisteredEventHandler) {
        eventHandlers.set(event, handler);
      },
    } as never,
    options,
  );

  return { commands, tools, eventHandlers };
}

async function withTempDir(fn: (cwd: string) => Promise<void> | void): Promise<void> {
  const cwd = mkdtempSync(path.join(os.tmpdir(), "pi-autoresearch-runtime-"));
  try {
    await fn(cwd);
  } finally {
    rmSync(cwd, { recursive: true, force: true });
  }
}

function writeFile(target: string, content: string): void {
  mkdirSync(path.dirname(target), { recursive: true });
  writeFileSync(target, content, "utf8");
}

test("autoresearch_candidate_bind inspects a worktree and prepares the measurement call", async () => {
  await withTempDir(async (cwd) => {
    execFileSync("git", ["init"], { cwd, stdio: "ignore" });
    mkdirSync(path.join(cwd, "src"), { recursive: true });
    writeFileSync(path.join(cwd, "src/value.txt"), "base\n");
    execFileSync("git", ["add", "src/value.txt"], { cwd, stdio: "ignore" });
    execFileSync(
      "git",
      ["-c", "user.name=Test", "-c", "user.email=test@example.invalid", "commit", "-m", "base"],
      { cwd, stdio: "ignore" },
    );
    execFileSync("git", ["checkout", "-b", "candidate/bind"], { cwd, stdio: "ignore" });
    writeFileSync(path.join(cwd, "src/value.txt"), "candidate\n");
    execFileSync("git", ["add", "src/value.txt"], { cwd, stdio: "ignore" });
    execFileSync(
      "git",
      [
        "-c",
        "user.name=Test",
        "-c",
        "user.email=test@example.invalid",
        "commit",
        "-m",
        "candidate",
      ],
      { cwd, stdio: "ignore" },
    );

    const runtimeSnapshotPath = resolveAutoresearchRuntimeSnapshotPath(cwd);
    const plan = buildAutoresearchCandidateBindPlan({
      cwd,
      candidateWorktree: cwd,
      candidateBaseRef: "HEAD~1",
    });

    assert.equal(existsSync(runtimeSnapshotPath), false);
    assert.equal(plan.inspection.exists, true);
    assert.equal(plan.inspection.isGitWorktree, true);
    assert.equal(plan.inspection.sameRepository, true);
    assert.equal(plan.inspection.branch, "candidate/bind");
    assert.deepEqual(plan.inspection.filesChanged, ["src/value.txt"]);
    assert.equal(plan.inspection.readiness, "needs_review");
    assert.match(plan.inspection.readinessReasons.join("\n"), /controller cwd/);
    writeFileSync(path.join(cwd, "src/dirty.txt"), "dirty\n");
    const dirtyPlan = buildAutoresearchCandidateBindPlan({
      cwd,
      candidateWorktree: cwd,
      candidateBaseRef: "HEAD~1",
    });
    assert.ok(dirtyPlan.inspection.filesChanged.includes("src/dirty.txt"));
    assert.ok(dirtyPlan.inspection.filesChanged.includes("src/value.txt"));
    assert.equal(dirtyPlan.inspection.readiness, "needs_review");
    assert.match(plan.exactNextCalls[0] ?? "", /autoresearch_candidate_bind/);
    assert.match(plan.exactNextCalls[0] ?? "", /candidateWorktree/);
    assert.match(plan.exactNextCalls[0] ?? "", /candidateBaseRef/);
    assert.doesNotMatch(plan.exactNextCalls.join("\n"), /<base-ref>|<branch>|<file>/);
    assert.match(plan.plannedCommands.join("\n"), /diff --stat/);
    assert.match(formatAutoresearchCandidateBindPlan(plan), /CANDIDATE BIND PLAN/);
    assert.match(formatAutoresearchCandidateBindPlan(plan), /intake readiness: needs_review/);

    const inferredPlan = buildAutoresearchCandidateBindPlan({
      cwd,
      candidateWorktree: cwd,
    });
    const expectedBase = execFileSync("git", ["rev-parse", "HEAD~1"], {
      cwd,
      encoding: "utf8",
    }).trim();
    assert.equal(inferredPlan.inspection.baseRef, expectedBase);
    assert.match(inferredPlan.inspection.baseRefSource ?? "", /merge-base/);
    assert.ok(inferredPlan.inspection.filesChanged.includes("src/value.txt"));
    assert.ok(inferredPlan.inspection.filesChanged.includes("src/dirty.txt"));
    assert.match(inferredPlan.inspection.warnings.join("\n"), /inferred/);
    assert.doesNotMatch(inferredPlan.inspection.warnings.join("\n"), /could not be inferred/);

    const { tools } = registerHarness();
    const result = await tools
      .get(AUTORESEARCH_CANDIDATE_BIND_TOOL_NAME)
      ?.execute(
        "call-candidate-bind",
        { cwd, candidateWorktree: cwd, candidateBaseRef: "HEAD~1" },
        undefined,
        undefined,
        { cwd },
      );
    assert.ok(result);
    assert.equal(existsSync(runtimeSnapshotPath), false);
    assert.match(result.content[0]?.text ?? "", /PI-AUTORESEARCH CANDIDATE BIND PLAN/);
    assert.match(result.content[0]?.text ?? "", /candidate\/bind/);
  });
});

test("autoresearch_candidate_decision renders a read-only candidate lifecycle plan", async () => {
  await withTempDir(async (cwd) => {
    const { tools } = registerHarness();
    appendReceipt(
      cwd,
      createConfigReceipt({
        name: "candidate-decision",
        metricName: "total_ms",
        metricUnit: "ms",
        direction: "lower",
        createdAt: 1,
        benchmarkCommand: "bash autoresearch.sh",
      }),
    );
    appendReceipt(
      cwd,
      createRunReceipt({
        status: "baseline",
        metric: 100,
        description: "baseline",
        timestamp: 2,
      }),
    );
    appendReceipt(
      cwd,
      createRunReceipt({
        status: "candidate",
        empiricalDecisionClass: "candidate_regression",
        metric: 130,
        description: "candidate regression",
        timestamp: 3,
        experiment: {
          candidate: {
            source: "manual",
            worktreePath: path.join(cwd, "../candidate-decision-worktree"),
            branch: "candidate/decision",
            baseRef: "HEAD~1",
            diffSummary: "slower implementation",
            filesChanged: ["src/slow.ts"],
          },
        },
      }),
    );

    const result = await tools
      .get(AUTORESEARCH_CANDIDATE_DECISION_TOOL_NAME)
      ?.execute("call-candidate-decision", { cwd, action: "plan_rewind" }, undefined, undefined, {
        cwd,
      });

    assert.ok(result);
    const output = result.content[0]?.text ?? "";
    assert.match(output, /PI-AUTORESEARCH CANDIDATE DECISION WORKBENCH/);
    assert.match(output, /recommended lifecycle decision: rewind/);
    assert.match(output, /candidate branch\/ref: candidate\/decision/);
    assert.match(output, /reset --hard/);
    assert.match(output, /Replay Fabric is observer\/history\/recovery-clue only/);
    const details = result.details as { recommendedDecision: string; plannedCommands: string[] };
    assert.equal(details.recommendedDecision, "rewind");
    assert.match(details.plannedCommands.join("\n"), /plan only/);
  });
});

test("autoresearch_campaign_start provides a plan-only supervised front door", async () => {
  await withTempDir(async (cwd) => {
    const { tools } = registerHarness();
    writeFile(
      path.join(cwd, "package.json"),
      JSON.stringify({
        name: "demo-speed",
        scripts: { bench: "node bench.js", check: "node check.js" },
      }),
    );
    writeFile(path.join(cwd, "src/index.ts"), "export const value = 1;\n");

    const result = await tools.get(AUTORESEARCH_CAMPAIGN_START_TOOL_NAME)?.execute(
      "call-campaign-start-plan",
      {
        cwd,
        objective: "reduce benchmark runtime",
        runMode: "plan_only",
        maxIterations: 4,
        peerMode: "plan",
      },
      undefined,
      undefined,
      { cwd },
    );

    assert.ok(result);
    const output = result.content[0]?.text ?? "";
    assert.match(output, /PI-AUTORESEARCH CAMPAIGN START/);
    assert.match(output, /run mode: plan_only/);
    assert.match(output, /benchmark command: npm run bench/);
    assert.match(output, /Candidate lifecycle policy/);
    assert.match(
      output,
      /replay-fabric role: observer\/history\/recovery-clue projection only; not the executor/,
    );
    assert.match(output, /Next exact tool call/);
    assert.match(output, /runMode: "baseline"/);
    assert.match(output, /candidatePolicy/);
    assert.match(output, /## Dashboard/);
    assert.match(output, /PI-AUTORESEARCH DASHBOARD/);
    const details = result.details as {
      objective: string;
      runMode: string;
      maxIterations: number;
      setupResult: null;
      loopResult: null;
      candidatePolicy: { mode: string; keep: string; discard: string; rewind: string };
      autoplan: { config: { metricName: string }; benchmarkCommand: string; checksCommand: string };
      nextToolCall: string;
    };
    assert.equal(details.objective, "reduce benchmark runtime");
    assert.equal(details.runMode, "plan_only");
    assert.equal(details.maxIterations, 4);
    assert.equal(details.setupResult, null);
    assert.equal(details.loopResult, null);
    assert.equal(details.candidatePolicy.mode, "worktree");
    assert.equal(details.candidatePolicy.keep, "preserve_branch");
    assert.equal(details.candidatePolicy.discard, "suggest_cleanup");
    assert.equal(details.candidatePolicy.rewind, "reset_worktree_to_base");
    assert.equal(details.autoplan.config.metricName, "total_ms");
    assert.equal(details.autoplan.benchmarkCommand, "npm run bench");
    assert.equal(details.autoplan.checksCommand, "npm run check");
    assert.match(details.nextToolCall, /autoresearch_campaign_start/);
    assert.equal(loadReceiptLog(cwd).entries.length, 0);

    appendReceipt(
      cwd,
      createConfigReceipt({
        name: "existing-speed",
        metricName: "total_ms",
        direction: "lower",
        benchmarkCommand: "npm run bench",
      }),
    );
    const configuredResult = await tools.get(AUTORESEARCH_CAMPAIGN_START_TOOL_NAME)?.execute(
      "call-campaign-start-plan-configured",
      {
        cwd,
        objective: "reduce benchmark runtime with fresh segment",
        runMode: "plan_only",
        maxIterations: 4,
      },
      undefined,
      undefined,
      { cwd },
    );
    const configuredDetails = configuredResult?.details as { nextToolCall: string };
    assert.match(configuredDetails.nextToolCall, /runMode: "baseline"/);
    assert.match(configuredDetails.nextToolCall, /reconfigure: true/);
  });
});

test("autoresearch_campaign_start fails closed before executing stale configured segments", async () => {
  // The next test exercises round-trip continuation and exact objective identity.
  await withTempDir(async (cwd) => {
    const { tools } = registerHarness();
    const campaignStartTool = tools.get(AUTORESEARCH_CAMPAIGN_START_TOOL_NAME);
    assert.ok(campaignStartTool);
    writeFile(
      path.join(cwd, "package.json"),
      JSON.stringify({
        name: "demo-campaign-reconfigure",
        scripts: { bench: "node bench.js" },
      }),
    );
    writeFile(path.join(cwd, "src/index.ts"), "export const value = 1;\n");
    writeFile(path.join(cwd, "bench.js"), "console.log('METRIC fresh_score=7');\n");
    appendReceipt(
      cwd,
      createConfigReceipt({
        name: "previous-campaign",
        metricName: "stale_score",
        metricUnit: "count",
        direction: "higher",
        benchmarkCommand: "node stale-bench.js",
        checksCommand: null,
      }),
    );

    for (const runMode of ["baseline", "bounded_loop"] as const) {
      await assert.rejects(
        () =>
          campaignStartTool.execute(
            `call-campaign-start-stale-${runMode}`,
            {
              cwd,
              objective: "measure fresh campaign score",
              runMode,
              maxIterations: 1,
              metricName: "fresh_score",
              metricUnit: "count",
              direction: "higher",
              benchmarkCommand: "node bench.js",
              checksCommand: null,
              peerMode: "plan",
            },
            undefined,
            undefined,
            { cwd },
          ),
        /refused to execute against a stale active segment[\s\S]*reconfigure=true/,
      );
    }
    assert.equal(loadReceiptLog(cwd).entries.length, 1);

    const result = await campaignStartTool.execute(
      "call-campaign-start-fresh-reconfigure",
      {
        cwd,
        objective: "measure fresh campaign score",
        runMode: "baseline",
        maxIterations: 1,
        metricName: "fresh_score",
        metricUnit: "count",
        direction: "higher",
        benchmarkCommand: "node bench.js",
        checksCommand: null,
        reconfigure: true,
      },
      undefined,
      undefined,
      { cwd },
    );

    assert.ok(result);
    const details = result.details as {
      setupResult: {
        appliedConfig: boolean;
        run: { primaryMetricName: string; primaryMetric: number };
      };
      status: {
        currentSegment: { metricName: string; benchmarkCommand: string; runCount: number };
      };
    };
    assert.equal(details.setupResult.appliedConfig, true);
    assert.equal(details.setupResult.run.primaryMetricName, "fresh_score");
    assert.equal(details.setupResult.run.primaryMetric, 7);
    assert.equal(details.status.currentSegment.metricName, "fresh_score");
    assert.equal(details.status.currentSegment.benchmarkCommand, "node bench.js");
    assert.equal(details.status.currentSegment.runCount, 1);
    assert.equal(loadReceiptLog(cwd).entries.length, 3);
  });
});

test("autoresearch_campaign_start round-trips its effective contract and distinguishes colliding objective slugs", async () => {
  await withTempDir(async (cwd) => {
    const { tools } = registerHarness();
    const campaignStartTool = tools.get(AUTORESEARCH_CAMPAIGN_START_TOOL_NAME);
    assert.ok(campaignStartTool);
    writeFile(
      path.join(cwd, "package.json"),
      JSON.stringify({ name: "objective-identity", scripts: { bench: "node bench.js" } }),
    );
    writeFile(path.join(cwd, "src/index.ts"), "export const value = 1;\n");
    writeFile(path.join(cwd, "bench.js"), "console.log('METRIC custom_score=7');\n");
    writeFile(path.join(cwd, "check.js"), "process.exit(0);\n");

    const sharedPrefix = "preserve this exact long objective identity ".repeat(3);
    const objectiveA = `${sharedPrefix}alpha`;
    const objectiveB = `${sharedPrefix}beta`;
    const contract = {
      metricName: "custom_score",
      metricUnit: "count",
      direction: "lower" as const,
      metricThreshold: 10,
      benchmarkCommand: "node bench.js",
      checksCommand: "node check.js",
    };

    const baseline = await campaignStartTool.execute(
      "call-campaign-start-round-trip-baseline",
      {
        cwd,
        objective: objectiveA,
        runMode: "baseline",
        maxIterations: 1,
        peerMode: "plan",
        filesInScope: ["src/runtime.ts"],
        ...contract,
      },
      undefined,
      undefined,
      { cwd },
    );
    const baselineDetails = baseline.details as { nextToolCall: string };
    assert.match(baselineDetails.nextToolCall, /metricName: "custom_score"/);
    assert.match(baselineDetails.nextToolCall, /metricUnit: "count"/);
    assert.match(baselineDetails.nextToolCall, /direction: "lower"/);
    assert.match(baselineDetails.nextToolCall, /metricThreshold: 10/);
    assert.match(baselineDetails.nextToolCall, /benchmarkCommand: "node bench.js"/);
    assert.match(baselineDetails.nextToolCall, /checksCommand: "node check.js"/);
    assert.match(baselineDetails.nextToolCall, /filesInScope: \["src\/runtime.ts"\]/);
    const entriesAfterBaseline = loadReceiptLog(cwd).entries.length;

    const exactContinuationInput = runInNewContext(baselineDetails.nextToolCall, {
      autoresearch_campaign_start: (params: unknown) => params,
    });
    const continuation = await campaignStartTool.execute(
      "call-campaign-start-round-trip-loop",
      exactContinuationInput,
      undefined,
      undefined,
      { cwd },
    );
    const continuationDetails = continuation.details as {
      loopResult: { completedIterations: number };
    };
    assert.equal(continuationDetails.loopResult.completedIterations, 1);
    assert.equal(loadReceiptLog(cwd).entries.length, entriesAfterBaseline + 1);

    await assert.rejects(
      () =>
        campaignStartTool.execute(
          "call-campaign-start-objective-collision",
          {
            cwd,
            objective: objectiveB,
            runMode: "bounded_loop",
            maxIterations: 1,
            peerMode: "off",
            ...contract,
          },
          undefined,
          undefined,
          { cwd },
        ),
      /objectiveDigest[\s\S]*reconfigure=true/,
    );
    assert.equal(loadReceiptLog(cwd).entries.length, entriesAfterBaseline + 1);

    const noBenchmarkRoot = path.join(cwd, "no-benchmark");
    mkdirSync(noBenchmarkRoot, { recursive: true });
    writeFile(path.join(noBenchmarkRoot, "package.json"), JSON.stringify({ name: "no-bench" }));
    const noBenchmarkPlan = await campaignStartTool.execute(
      "call-campaign-start-no-benchmark-plan",
      {
        cwd: noBenchmarkRoot,
        objective: "plan without an executable benchmark",
        runMode: "plan_only",
        maxIterations: 1,
      },
      undefined,
      undefined,
      { cwd: noBenchmarkRoot },
    );
    const noBenchmarkCall = (noBenchmarkPlan.details as { nextToolCall: string }).nextToolCall;
    assert.doesNotMatch(noBenchmarkCall, /benchmarkCommand: null/);
    assert.doesNotThrow(() =>
      runInNewContext(noBenchmarkCall, {
        autoresearch_campaign_start: (params: unknown) => params,
      }),
    );
  });
});

test("autoresearch_campaign_start can run DSPx program-gen and use its setup proposal", async () => {
  await withTempDir(async (cwd) => {
    const { tools } = registerHarness();
    writeFile(
      path.join(cwd, "package.json"),
      JSON.stringify({
        name: "demo-dspx-campaign",
        scripts: { bench: "node bench.js", check: "node check.js" },
      }),
    );
    writeFile(path.join(cwd, "src/index.ts"), "export const value = 1;\n");

    const previousDspxHome = process.env.DSPX_HOME;
    const previousPath = process.env.PATH;
    const shellInjectionSentinel = path.join(process.cwd(), "dspx-shell-injected");
    rmSync(shellInjectionSentinel, { force: true });
    const fakeDspxHome = path.join(cwd, "fake-$(touch dspx-shell-injected)-dspx");
    mkdirSync(fakeDspxHome, { recursive: true });
    const objective = "reduce runtime with dspx";
    const fakeJustBin = path.join(cwd, "fake-bin");
    mkdirSync(fakeJustBin, { recursive: true });
    const behaviorPayload = {
      summary: { status: "passed", total: 1, passed: 1, failed: 0, error: 0 },
      examples: [
        {
          index: 0,
          status: "passed",
          inputs: { objective },
          observed_outputs: {
            campaign_name: "dspx-campaign",
            metric_name: "latency_ms",
            metric_unit: "ms",
            direction: "lower",
            benchmark_command: "npm run dspx-bench",
            checks_command: "npm run dspx-check",
            risks: "watch generated planner assumptions",
            next_action: "baseline",
          },
        },
      ],
    };
    writeFile(
      path.join(fakeJustBin, "just"),
      `#!/usr/bin/env node\nconst fs = require("node:fs");\nconst path = require("node:path");\nconst args = process.argv.slice(2);\nconst outdir = args[args.indexOf("--outdir") + 1];\nif (args[0] !== "dspx" || args[1] !== "program-gen" || !outdir) process.exit(64);\nfs.mkdirSync(outdir, { recursive: true });\nfs.writeFileSync(path.join(outdir, "behavior_results.json"), ${JSON.stringify(JSON.stringify(behaviorPayload))});\n`,
    );
    chmodSync(path.join(fakeJustBin, "just"), 0o755);
    process.env.DSPX_HOME = fakeDspxHome;
    process.env.PATH = `${fakeJustBin}${path.delimiter}${previousPath ?? ""}`;
    try {
      const result = await tools.get(AUTORESEARCH_CAMPAIGN_START_TOOL_NAME)?.execute(
        "call-campaign-start-dspx-run",
        {
          cwd,
          objective,
          runMode: "plan_only",
          planner: "dspx_program",
          runDspxProgramGen: true,
          dspxProgramGenTimeoutSeconds: 10,
          dspxIntentPath: ".autoresearch/dspx/intent.yaml",
          dspxOutdir: ".autoresearch/dspx/generated/planner",
        },
        undefined,
        undefined,
        { cwd },
      );

      assert.ok(result);
      const output = result.content[0]?.text ?? "";
      assert.match(output, /DSPx program-gen run/);
      assert.match(output, /Generated DSPy planner output \(validated\)/);
      const details = result.details as {
        nextToolCall: string;
        dspxProgramGenRun: { exitCode: number; timedOut: boolean };
        autoplan: {
          config: { name: string; metricName: string; direction: string };
          benchmarkCommand: string;
          checksCommand: string;
          dspxProgramGen: { intentPath: string; materialized: boolean };
          dspxAdvisory: { available: boolean; matchedObjective: boolean };
        };
      };
      assert.equal(details.dspxProgramGenRun.exitCode, 0);
      assert.equal(details.dspxProgramGenRun.timedOut, false);
      assert.equal(details.autoplan.config.name, "dspx-campaign");
      assert.match(details.nextToolCall, /name: "dspx-campaign"/);
      const nextInput = runInNewContext(details.nextToolCall, {
        autoresearch_campaign_start: (params: { name?: string }) => params,
      }) as { name?: string };
      assert.equal(nextInput.name, "dspx-campaign");
      assert.equal(details.autoplan.config.metricName, "latency_ms");
      assert.equal(details.autoplan.config.direction, "lower");
      assert.equal(details.autoplan.benchmarkCommand, "npm run dspx-bench");
      assert.equal(details.autoplan.checksCommand, "npm run dspx-check");
      assert.equal(details.autoplan.dspxProgramGen.materialized, true);
      assert.equal(details.autoplan.dspxAdvisory.available, true);
      assert.equal(details.autoplan.dspxAdvisory.matchedObjective, true);
      const intentText = readFileSync(details.autoplan.dspxProgramGen.intentPath, "utf8");
      assert.match(intentText, /AutoresearchSetupPlanner/);
      assert.match(intentText, /metric_threshold/);
      assert.equal(existsSync(shellInjectionSentinel), false);
    } finally {
      if (previousDspxHome === undefined) {
        delete process.env.DSPX_HOME;
      } else {
        process.env.DSPX_HOME = previousDspxHome;
      }
      if (previousPath === undefined) {
        delete process.env.PATH;
      } else {
        process.env.PATH = previousPath;
      }
      rmSync(shellInjectionSentinel, { force: true });
    }
  });
});

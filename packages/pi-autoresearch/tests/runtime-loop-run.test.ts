import assert from "node:assert/strict";
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
import {
  type PiAutoresearchExtensionOptions,
  registerPiAutoresearchExtension,
} from "../extensions/pi-autoresearch.ts";
import {
  AUTORESEARCH_NEXT_HYPOTHESIS_TEMPLATE_NAME,
  type AutoresearchDecisionRuntime,
  type NextHypothesisDecisionOutcome,
} from "../src/core/decisions.ts";
import { resolveAutoresearchRuntimeSnapshotPath } from "../src/core/resume.ts";
import {
  AUTORESEARCH_LOOP_TOOL_NAME,
  AUTORESEARCH_PEER_ASSIST_TOOL_NAME,
  AUTORESEARCH_RUN_TOOL_NAME,
  AUTORESEARCH_SETUP_TOOL_NAME,
  appendReceipt,
  buildAutoresearchRuntimeStatus,
  createConfigReceipt,
  createRunReceipt,
  executeAutoresearchSetup,
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

function writeExecutable(cwd: string, name: string, content: string): void {
  const target = path.join(cwd, name);
  writeFileSync(target, content, "utf8");
  chmodSync(target, 0o755);
}

test("core setup rejects an exact aborted signal before any setup persistence", async () => {
  await withTempDir(async (cwd) => {
    const controller = new AbortController();
    const marker = new Error("exact core setup abort");
    controller.abort(marker);

    await assert.rejects(
      executeAutoresearchSetup({
        cwd,
        action: "apply",
        name: "must-not-persist",
        metricName: "score",
        direction: "higher",
        benchmarkCommand: "bash autoresearch.sh",
        benchmarkScript: '#!/usr/bin/env bash\necho "METRIC score=1"\n',
        checksScript: "#!/usr/bin/env bash\nexit 0\n",
        signal: controller.signal,
      }),
      (error) => error === marker,
    );
    for (const artifact of [
      "autoresearch.sh",
      "autoresearch.checks.sh",
      "autoresearch.jsonl",
      "autoresearch.events.jsonl",
      "autoresearch.runtime.json",
    ]) {
      assert.equal(existsSync(path.join(cwd, artifact)), false, artifact);
    }
  });
});

function createDecisionRuntimeStub(
  input: { nextHypothesisOutcome?: NextHypothesisDecisionOutcome } = {},
): AutoresearchDecisionRuntime {
  return {
    async runSetup() {
      throw new Error("setup decision is not used by runtime loop/run tests");
    },
    async runNextHypothesis() {
      return (
        input.nextHypothesisOutcome ?? {
          kind: "next_hypothesis",
          templateName: AUTORESEARCH_NEXT_HYPOTHESIS_TEMPLATE_NAME,
          status: "ready",
          stateRead: "The bounded runtime completed a clean run and can keep iterating.",
          nextHypothesis:
            "Tighten the live decision reporting inside runtime status/output surfaces.",
          whyNow:
            "The Prompt Vault decision adapter is landed and the runtime now needs to consume it.",
          targetFiles: ["packages/pi-autoresearch/src/core/runtime.ts"],
          changeShape: ["Wire the mapped decision into the machine-backed run surface."],
          expectedPrimaryEffect:
            "The runtime surfaces can report a governed next move after each run.",
          riskToGuard: ["Do not fall back to copied prompt text."],
          runPlan: ["Re-run the bounded benchmark after the runtime change."],
          asiToCaptureIfKept: ["Decision-aware runtime status/reporting."],
          asiToCaptureIfDiscarded: ["Why the decision packet did not help."],
          stopCondition: ["Stop when the machine truthfully reports the new governed next step."],
        }
      );
    },
    async runFinalize() {
      throw new Error("finalize decision is not used by runtime loop/run tests");
    },
  };
}

test("autoresearch_runtime_setup applies config without running and can baseline", async () => {
  await withTempDir(async (cwd) => {
    const { tools } = registerHarness();
    const setupTool = tools.get(AUTORESEARCH_SETUP_TOOL_NAME);
    assert.ok(setupTool);

    const apply = await setupTool.execute(
      "call-setup-apply",
      {
        cwd,
        action: "apply",
        name: "setup-speed",
        metricName: "total_ms",
        metricUnit: "ms",
        direction: "lower",
        benchmarkCommand: "bash autoresearch.sh",
        benchmarkScript: '#!/usr/bin/env bash\necho "METRIC total_ms=10"\n',
      },
      undefined,
      undefined,
      { cwd },
    );

    assert.match(apply.content[0]?.text ?? "", /applied config: yes/);
    assert.equal(loadReceiptLog(cwd).entries.filter((entry) => entry.type === "config").length, 1);
    assert.equal(loadReceiptLog(cwd).entries.filter((entry) => entry.type === "run").length, 0);

    const baseline = await setupTool.execute(
      "call-setup-baseline",
      {
        cwd,
        action: "baseline",
        reconfigure: true,
        name: "setup-speed-v2",
        metricName: "total_ms",
        metricUnit: "ms",
        direction: "lower",
        benchmarkCommand: "bash autoresearch.sh",
      },
      undefined,
      undefined,
      { cwd },
    );

    assert.match(baseline.content[0]?.text ?? "", /baseline: baseline total_ms=10ms/);
    const entries = loadReceiptLog(cwd).entries;
    assert.equal(entries.filter((entry) => entry.type === "config").length, 2);
    assert.equal(entries.filter((entry) => entry.type === "run").length, 1);
  });
});

test("autoresearch_runtime_peer_assist plans canonical peer tool calls without launching", async () => {
  await withTempDir(async (cwd) => {
    const { tools } = registerHarness();
    appendReceipt(
      cwd,
      createConfigReceipt({
        name: "peer-plan",
        metricName: "total_ms",
        metricUnit: "ms",
        direction: "lower",
        createdAt: 1,
        benchmarkCommand: "bash autoresearch.sh",
      }),
    );

    const result = await tools.get(AUTORESEARCH_PEER_ASSIST_TOOL_NAME)?.execute(
      "call-peer",
      {
        cwd,
        lane: "candidate",
        targetFiles: ["src/runner.ts"],
        offLimits: [".env"],
        constraints: ["focused patch only"],
        reportBack: "manual",
      },
      undefined,
      undefined,
      { cwd },
    );

    assert.ok(result);
    assert.match(result.content[0]?.text ?? "", /candidate_peer_spawn/);
    const details = result.details as { lane: string; toolName: string; toolCall: string };
    assert.equal(details.lane, "candidate");
    assert.equal(details.toolName, "candidate_peer_spawn");
    assert.match(details.toolCall, /filesInScope/);
  });
});

test("autoresearch_runtime_loop runs a bounded iteration budget and returns peer plan", async () => {
  await withTempDir(async (cwd) => {
    const { tools } = registerHarness();
    writeExecutable(
      cwd,
      "autoresearch.sh",
      [
        "#!/usr/bin/env bash",
        "set -euo pipefail",
        "count_file=.loop-count",
        "count=0",
        "if [ -f $count_file ]; then count=$(cat $count_file); fi",
        "count=$((count + 1))",
        "echo $count > $count_file",
        'echo "METRIC total_ms=$((200 - count))"',
      ].join("\n"),
    );

    const updates: Array<{
      content?: Array<{ text?: string }>;
      details?: { phase?: string; dashboard?: string };
    }> = [];
    const result = await tools.get(AUTORESEARCH_LOOP_TOOL_NAME)?.execute(
      "call-loop",
      {
        cwd,
        goal: "reduce total_ms",
        maxIterations: 2,
        name: "loop-speed",
        metricName: "total_ms",
        metricUnit: "ms",
        direction: "lower",
        peerMode: "launch_scout",
      },
      undefined,
      (update: {
        content?: Array<{ text?: string }>;
        details?: { phase?: string; dashboard?: string };
      }) => updates.push(update),
      { cwd },
    );

    assert.ok(result);
    const output = result.content[0]?.text ?? "";
    assert.match(output, /completed iterations: 2\/2/);
    assert.match(output, /Final dashboard/);
    assert.match(output, /PI-AUTORESEARCH DASHBOARD/);
    const details = result.details as {
      completedIterations: number;
      runs: Array<{ runReceipt: { status: string; metric: number } }>;
      peerAssist: { lane: string; toolName: string; objective: string; toolCall: string };
      peerLaunchHandoff: { status: string; toolName: string };
    };
    assert.equal(details.completedIterations, 2);
    assert.equal(details.runs[0]?.runReceipt.status, "baseline");
    assert.equal(details.runs[1]?.runReceipt.status, "candidate");
    assert.equal(details.peerAssist.lane, "scout");
    assert.equal(details.peerAssist.toolName, "scout_peer_spawn");
    assert.match(details.peerAssist.objective, /Review loop outcome/);
    assert.match(details.peerAssist.objective, /recommend one bounded next controller action/);
    assert.match(details.peerAssist.toolCall, /scout_peer_spawn/);
    assert.equal(details.peerLaunchHandoff.status, "handoff_required");
    assert.equal(details.peerLaunchHandoff.toolName, "scout_peer_spawn");
    assert.ok(updates.some((update) => update.details?.phase === "iteration_start"));
    assert.ok(updates.some((update) => update.details?.phase === "loop_complete"));
    assert.ok(
      updates.some((update) => /PI-AUTORESEARCH LIVE UPDATE/.test(update.content?.[0]?.text ?? "")),
    );
    assert.ok(
      updates.some((update) => /PI-AUTORESEARCH DASHBOARD/.test(update.details?.dashboard ?? "")),
    );
  });
});

test("autoresearch_runtime_loop auto candidate peer plan asks for a bounded patch", async () => {
  await withTempDir(async (cwd) => {
    const { tools } = registerHarness();
    writeExecutable(cwd, "autoresearch.sh", '#!/usr/bin/env bash\necho "METRIC total_ms=100"\n');

    const result = await tools.get(AUTORESEARCH_LOOP_TOOL_NAME)?.execute(
      "call-loop-candidate-peer",
      {
        cwd,
        goal: "reduce total_ms by simplifying the runner hot path",
        maxIterations: 1,
        name: "candidate-peer-loop",
        metricName: "total_ms",
        metricUnit: "ms",
        direction: "lower",
        decisionFilesInScope: ["src/runner.ts"],
        peerMode: "plan",
      },
      undefined,
      undefined,
      { cwd },
    );

    assert.ok(result);
    const details = result.details as {
      peerAssist: { lane: string; toolName: string; objective: string; toolCall: string };
      peerLaunchHandoff: { status: string; toolName: string; toolCall: string };
    };
    assert.equal(details.peerAssist.lane, "candidate");
    assert.equal(details.peerAssist.toolName, "candidate_peer_spawn");
    assert.match(details.peerAssist.objective, /Try one bounded candidate patch/);
    assert.match(details.peerAssist.objective, /isolated worktree/);
    assert.doesNotMatch(details.peerAssist.objective, /Review loop outcome/);
    assert.doesNotMatch(
      details.peerAssist.objective,
      /recommend one bounded next controller action/,
    );
    assert.match(details.peerAssist.toolCall, /candidate_peer_spawn/);
    assert.match(details.peerAssist.toolCall, /Try one bounded candidate patch/);
    assert.match(details.peerAssist.toolCall, /filesInScope: \["src\/runner\.ts"\]/);
    assert.doesNotMatch(details.peerAssist.toolCall, /Review loop outcome/);
    assert.doesNotMatch(
      details.peerAssist.toolCall,
      /recommend one bounded next controller action/,
    );
    assert.equal(details.peerLaunchHandoff.status, "not_requested");
    assert.equal(details.peerLaunchHandoff.toolName, "candidate_peer_spawn");
  });
});

test("autoresearch_runtime_loop stops by default on failed checks", async () => {
  await withTempDir(async (cwd) => {
    const { tools } = registerHarness();
    writeExecutable(cwd, "autoresearch.sh", '#!/usr/bin/env bash\necho "METRIC total_ms=1"\n');
    writeExecutable(cwd, "autoresearch.checks.sh", "#!/usr/bin/env bash\nexit 1\n");

    const result = await tools.get(AUTORESEARCH_LOOP_TOOL_NAME)?.execute(
      "call-loop-checks",
      {
        cwd,
        goal: "keep checks green while reducing total_ms",
        maxIterations: 2,
        name: "checks-loop",
        metricName: "total_ms",
        direction: "lower",
      },
      undefined,
      undefined,
      { cwd },
    );

    assert.ok(result);
    const details = result.details as { completedIterations: number; stopReason: string };
    assert.equal(details.completedIterations, 1);
    assert.equal(details.stopReason, "stopOn run status checks_failed");
  });
});

test("autoresearch_runtime_run fails closed when posture gate blocks", async () => {
  await withTempDir(async (cwd) => {
    const { tools } = registerHarness();
    writeExecutable(cwd, "autoresearch.sh", '#!/usr/bin/env bash\necho "METRIC total_ms=1"\n');
    writeExecutable(
      cwd,
      "posture.sh",
      '#!/usr/bin/env bash\necho \'{"reconcileRecommended":true,"recommendedCommand":"fix-gpu"}\'\n',
    );

    const tool = tools.get(AUTORESEARCH_RUN_TOOL_NAME);
    assert.ok(tool);
    await assert.rejects(
      () =>
        tool.execute(
          "call-posture",
          {
            cwd,
            description: "blocked posture",
            name: "posture-speed",
            metricName: "total_ms",
            direction: "lower",
            postureCommand: "bash posture.sh",
          },
          undefined,
          undefined,
          { cwd },
        ),
      /posture gate blocked/,
    );
    assert.equal(loadReceiptLog(cwd).entries.length, 0);
    assert.equal(existsSync(path.join(cwd, "autoresearch.events.jsonl")), false);
  });
});

test("autoresearch_runtime_loop stops cleanly when posture gate blocks", async () => {
  await withTempDir(async (cwd) => {
    const { tools } = registerHarness();
    writeExecutable(cwd, "autoresearch.sh", '#!/usr/bin/env bash\necho "METRIC total_ms=1"\n');
    writeExecutable(cwd, "posture.sh", "#!/usr/bin/env bash\necho '{\"ready\":false}'\n");

    const result = await tools.get(AUTORESEARCH_LOOP_TOOL_NAME)?.execute(
      "call-loop-posture",
      {
        cwd,
        goal: "reduce total_ms",
        maxIterations: 2,
        name: "posture-loop",
        metricName: "total_ms",
        direction: "lower",
        postureCommand: "bash posture.sh",
      },
      undefined,
      undefined,
      { cwd },
    );

    assert.ok(result);
    assert.match(result.content[0]?.text ?? "", /posture gate blocked/);
    const details = result.details as { completedIterations: number; stopReason: string };
    assert.equal(details.completedIterations, 0);
    assert.match(details.stopReason, /posture gate blocked/);
  });
});

test("autoresearch_runtime_run bootstraps config, executes benchmark, and appends receipts", async () => {
  await withTempDir(async (cwd) => {
    const { tools } = registerHarness();
    const tool = tools.get(AUTORESEARCH_RUN_TOOL_NAME);
    assert.ok(tool);

    writeExecutable(
      cwd,
      "autoresearch.sh",
      [
        "#!/usr/bin/env bash",
        "set -euo pipefail",
        'echo "METRIC total_ms=152"',
        'echo "METRIC render_ms=99"',
      ].join("\n"),
    );

    const result = await tool?.execute(
      "call-1",
      {
        cwd,
        description: "baseline run",
        name: "widget-speed",
        metricName: "total_ms",
        metricUnit: "ms",
        direction: "lower",
        hypothesisId: "H-baseline-001",
        hypothesis: "Baseline establishes the current timing floor before candidate work.",
        interventionSummary: "no code change baseline",
        expectedPrimaryEffect: "establish total_ms baseline",
        hypothesisTargetFiles: ["src/core/runtime.ts"],
        experimentRisk: "single baseline sample is not optimization evidence",
      },
      undefined,
      undefined,
      { cwd },
    );

    assert.ok(result);
    assert.match(result?.content[0]?.text ?? "", /run status: baseline/);
    assert.match(result?.content[0]?.text ?? "", /hypothesis id: H-baseline-001/);
    assert.match(
      result?.content[0]?.text ?? "",
      /expected primary effect: establish total_ms baseline/,
    );
    assert.match(result?.content[0]?.text ?? "", /machine state: ready/);
    const details = result?.details as {
      createdConfig: boolean;
      parsedMetrics: Record<string, number>;
      runReceipt: {
        status: string;
        metric: number;
        empiricalDecisionClass?: string;
        experiment?: {
          hypothesisId: string | null;
          hypothesis: string | null;
          interventionSummary: string | null;
          expectedPrimaryEffect: string | null;
          targetFiles: string[];
          risk: string | null;
        };
      };
      status: {
        currentSegment: {
          baselineMetric: number;
          bestMetric: number;
          runCount: number;
          empiricalDecisionClass: string;
        };
        runtimeProjection: {
          state: string;
          source: string;
          hasLedger: boolean;
          eventCount: number;
          replayedEventCount: number;
          ledgerPath?: string;
        };
        runtimeSnapshot: {
          reuse: string;
          path?: string;
        };
        control: {
          kind: string;
          allowedActions: string[];
        };
      };
      receiptPath: string;
      decisionSummary: null;
    };
    assert.equal(details.createdConfig, true);
    assert.deepEqual(details.parsedMetrics, { total_ms: 152, render_ms: 99 });
    assert.equal(details.runReceipt.status, "baseline");
    assert.equal(details.runReceipt.metric, 152);
    assert.equal(details.runReceipt.empiricalDecisionClass, "baseline");
    assert.deepEqual(details.runReceipt.experiment, {
      hypothesisId: "H-baseline-001",
      hypothesis: "Baseline establishes the current timing floor before candidate work.",
      interventionSummary: "no code change baseline",
      expectedPrimaryEffect: "establish total_ms baseline",
      targetFiles: ["src/core/runtime.ts"],
      risk: "single baseline sample is not optimization evidence",
    });
    assert.equal(details.status.currentSegment.baselineMetric, 152);
    assert.equal(details.status.currentSegment.bestMetric, 152);
    assert.equal(details.status.currentSegment.empiricalDecisionClass, "baseline");
    assert.equal(details.status.currentSegment.runCount, 1);
    assert.equal(details.decisionSummary, null);
    assert.equal(details.status.runtimeProjection.state, "ready");
    assert.equal(details.status.runtimeProjection.source, "ledger");
    assert.equal(details.status.runtimeProjection.hasLedger, true);
    assert.equal(details.status.runtimeProjection.eventCount, 5);
    assert.equal(details.status.runtimeProjection.replayedEventCount, 5);
    assert.equal(details.status.runtimeSnapshot.reuse, "missing");
    assert.equal(details.status.control.kind, "none");
    assert.deepEqual(details.status.control.allowedActions, ["continue", "stop"]);

    const log = loadReceiptLog(cwd);
    assert.equal(log.invalidLineCount, 0);
    assert.equal(log.entries.length, 2);
    assert.equal(readFileSync(details.receiptPath, "utf8").trim().split("\n").length, 2);
    assert.ok(
      (details.status.runtimeProjection.ledgerPath ?? "").endsWith("autoresearch.events.jsonl"),
    );
    assert.equal(
      readFileSync(details.status.runtimeProjection.ledgerPath ?? "", "utf8")
        .trim()
        .split("\n").length,
      5,
    );
    assert.equal(
      readFileSync(resolveAutoresearchRuntimeSnapshotPath(cwd), "utf8").includes(
        '"type": "runtime_snapshot"',
      ),
      true,
    );

    const resumedStatus = buildAutoresearchRuntimeStatus(cwd);
    assert.equal(resumedStatus.runtimeSnapshot.reuse, "reused");
    assert.equal(resumedStatus.control.kind, "none");
    assert.deepEqual(resumedStatus.control.allowedActions, ["continue", "stop"]);
  });
});

test("autoresearch_runtime_run records checks_failed receipts without establishing a baseline", async () => {
  await withTempDir(async (cwd) => {
    const { tools } = registerHarness();
    const tool = tools.get(AUTORESEARCH_RUN_TOOL_NAME);
    assert.ok(tool);

    writeExecutable(
      cwd,
      "autoresearch.sh",
      ["#!/usr/bin/env bash", "set -euo pipefail", 'echo "METRIC total_ms=111"'].join("\n"),
    );
    writeExecutable(
      cwd,
      "autoresearch.checks.sh",
      ["#!/usr/bin/env bash", "set -euo pipefail", 'echo "typecheck failed" >&2', "exit 1"].join(
        "\n",
      ),
    );

    const result = await tool?.execute(
      "call-2",
      {
        cwd,
        description: "candidate with failing checks",
        name: "widget-speed",
        metricName: "total_ms",
        metricUnit: "ms",
        direction: "lower",
      },
      undefined,
      undefined,
      { cwd },
    );

    assert.ok(result);
    const details = result?.details as {
      runReceipt: { status: string };
      status: {
        currentSegment: {
          baselineMetric: number | null;
          successfulRunCount: number;
          runCount: number;
        };
        runtimeProjection: {
          state: string;
          source: string;
          hasLedger: boolean;
          eventCount: number;
        };
      };
    };
    assert.equal(details.runReceipt.status, "checks_failed");
    assert.equal(details.status.currentSegment.baselineMetric, null);
    assert.equal(details.status.currentSegment.successfulRunCount, 0);
    assert.equal(details.status.currentSegment.runCount, 1);
    assert.equal(details.status.runtimeProjection.state, "ready");
    assert.equal(details.status.runtimeProjection.source, "ledger");
    assert.equal(details.status.runtimeProjection.hasLedger, true);
    assert.equal(details.status.runtimeProjection.eventCount, 6);
  });
});

test("autoresearch_runtime_run backfills the event ledger from existing receipts before appending a new run", async () => {
  await withTempDir(async (cwd) => {
    const { tools } = registerHarness();
    const tool = tools.get(AUTORESEARCH_RUN_TOOL_NAME);
    assert.ok(tool);

    appendReceipt(
      cwd,
      createConfigReceipt({
        name: "widget-speed",
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
        metric: 200,
        description: "historical baseline",
        timestamp: 2,
      }),
    );

    writeExecutable(
      cwd,
      "autoresearch.sh",
      ["#!/usr/bin/env bash", "set -euo pipefail", 'echo "METRIC total_ms=999"'].join("\n"),
    );
    const candidateWorktree = path.join(cwd, "candidate-peer-runtime");
    mkdirSync(candidateWorktree, { recursive: true });
    writeExecutable(
      candidateWorktree,
      "autoresearch.sh",
      ["#!/usr/bin/env bash", "set -euo pipefail", 'echo "METRIC total_ms=180"'].join("\n"),
    );

    const result = await tool?.execute(
      "call-3",
      {
        cwd,
        description: "candidate after ledger backfill",
        hypothesisId: "H-candidate-peer-001",
        hypothesis: "A visible candidate peer patch reduces total_ms.",
        interventionSummary: "Evaluate the visible candidate peer diff.",
        expectedPrimaryEffect: "lower total_ms beyond timing noise",
        hypothesisTargetFiles: ["src/core/runtime.ts"],
        candidateSource: "candidate_peer_spawn",
        candidateWorktree,
        candidateBranch: "candidate/runtime-speed",
        candidateBaseRef: "main",
        candidateDiffSummary: "tighten runtime hot path after peer exploration",
        candidateFilesChanged: ["src/core/runtime.ts"],
      },
      undefined,
      undefined,
      { cwd },
    );

    assert.match(result?.content[0]?.text ?? "", /candidate source: candidate_peer_spawn/);
    assert.match(result?.content[0]?.text ?? "", /candidate branch: candidate\/runtime-speed/);

    const details = result?.details as {
      runReceipt: {
        experiment?: {
          candidate?: {
            source: string | null;
            worktreePath: string | null;
            branch: string | null;
            baseRef: string | null;
            diffSummary: string | null;
            filesChanged: string[];
          };
        };
      };
      status: {
        currentSegment: { runCount: number; bestMetric: number | null };
        runtimeProjection: {
          state: string;
          source: string;
          eventCount: number;
          hasLedger: boolean;
          ledgerPath?: string;
        };
      };
    };

    assert.deepEqual(details.runReceipt.experiment?.candidate, {
      source: "candidate_peer_spawn",
      worktreePath: candidateWorktree,
      branch: "candidate/runtime-speed",
      baseRef: "main",
      diffSummary: "tighten runtime hot path after peer exploration",
      filesChanged: ["src/core/runtime.ts"],
    });
    assert.equal(details.status.currentSegment.runCount, 2);
    assert.equal(details.status.currentSegment.bestMetric, 180);
    assert.equal(details.status.runtimeProjection.state, "ready");
    assert.equal(details.status.runtimeProjection.source, "ledger");
    assert.equal(details.status.runtimeProjection.hasLedger, true);
    assert.equal(details.status.runtimeProjection.eventCount, 9);
    assert.equal(
      readFileSync(details.status.runtimeProjection.ledgerPath ?? "", "utf8")
        .trim()
        .split("\n").length,
      9,
    );
  });
});

test("autoresearch_runtime_run fails closed for missing candidate worktree", async () => {
  await withTempDir(async (cwd) => {
    const { tools } = registerHarness();
    const tool = tools.get(AUTORESEARCH_RUN_TOOL_NAME);
    assert.ok(tool);

    appendReceipt(
      cwd,
      createConfigReceipt({
        name: "missing-candidate-worktree",
        metricName: "score",
        metricUnit: "points",
        direction: "lower",
        createdAt: 1,
        benchmarkCommand: "bash autoresearch.sh",
      }),
    );
    writeExecutable(cwd, "autoresearch.sh", "#!/usr/bin/env bash\necho 'METRIC score=999'\n");

    await assert.rejects(
      () =>
        tool.execute(
          "call-missing-candidate-worktree",
          {
            cwd,
            description: "missing candidate worktree",
            candidateSource: "candidate_peer_spawn",
            candidateWorktree: path.join(cwd, "missing-candidate-worktree"),
          },
          undefined,
          undefined,
          { cwd },
        ),
      /candidateWorktree does not exist; refusing to measure controller cwd as candidate/,
    );
  });
});

test("autoresearch_runtime_run executes benchmark and checks from existing candidate worktree", async () => {
  await withTempDir(async (cwd) => {
    const { tools } = registerHarness();
    const tool = tools.get(AUTORESEARCH_RUN_TOOL_NAME);
    assert.ok(tool);

    appendReceipt(
      cwd,
      createConfigReceipt({
        name: "candidate-worktree-execution",
        metricName: "score",
        metricUnit: "points",
        direction: "lower",
        createdAt: 1,
        benchmarkCommand: "bash autoresearch.sh",
        checksCommand: "bash autoresearch.checks.sh",
      }),
    );
    appendReceipt(
      cwd,
      createRunReceipt({
        status: "baseline",
        metric: 100,
        description: "historical baseline",
        timestamp: 2,
      }),
    );

    writeExecutable(cwd, "autoresearch.sh", "#!/usr/bin/env bash\necho 'METRIC score=999'\n");
    writeExecutable(cwd, "autoresearch.checks.sh", "#!/usr/bin/env bash\nexit 1\n");
    const candidateWorktree = path.join(cwd, "candidate-worktree");
    mkdirSync(candidateWorktree, { recursive: true });
    writeExecutable(
      candidateWorktree,
      "autoresearch.sh",
      "#!/usr/bin/env bash\necho 'METRIC score=50'\n",
    );
    writeExecutable(candidateWorktree, "autoresearch.checks.sh", "#!/usr/bin/env bash\nexit 0\n");

    const result = await tool?.execute(
      "call-candidate-worktree-execution",
      {
        cwd,
        description: "candidate worktree execution",
        hypothesisId: "candidate-01",
        hypothesis: "candidate worktree lowers score",
        candidateSource: "candidate_peer_spawn",
        candidateWorktree,
        candidateBranch: "candidate/worktree-execution",
        candidateBaseRef: "HEAD",
        candidateDiffSummary: "candidate score change",
        candidateFilesChanged: ["score.txt"],
      },
      undefined,
      undefined,
      { cwd },
    );

    const details = result?.details as {
      primaryMetric: number;
      checks: { exitCode: number | null } | null;
      runReceipt: { status: string; metric: number };
    };
    assert.equal(details.primaryMetric, 50);
    assert.equal(details.checks?.exitCode, 0);
    assert.equal(details.runReceipt.status, "candidate");
    assert.equal(details.runReceipt.metric, 50);
  });
});

test("autoresearch_runtime_run maps a governed finalize_candidate into machine state", async () => {
  await withTempDir(async (cwd) => {
    const { tools } = registerHarness({
      createDecisionRuntime: () =>
        createDecisionRuntimeStub({
          nextHypothesisOutcome: {
            kind: "next_hypothesis",
            templateName: AUTORESEARCH_NEXT_HYPOTHESIS_TEMPLATE_NAME,
            status: "finalize_candidate",
            stateRead: "The latest candidate is stable and no longer needs another iteration.",
            nextHypothesis: "Stop iterating and prepare a bounded finalization proposal.",
            whyNow: "The runtime surface is ready for a finalize-worthy control-plane handoff.",
            targetFiles: ["packages/pi-autoresearch/src/core/runtime.ts"],
            changeShape: ["Keep the runtime slice intact and move to finalization planning."],
            expectedPrimaryEffect:
              "The machine should surface finalize_candidate instead of ready.",
            riskToGuard: ["Do not silently continue iterating."],
            runPlan: ["Inspect status and then stop before another run."],
            asiToCaptureIfKept: ["Why the runtime should stop iterating at this point."],
            asiToCaptureIfDiscarded: ["Why finalization was premature."],
            stopCondition: ["Stop once the runtime reports finalize_candidate truthfully."],
          },
        }),
    });
    const tool = tools.get(AUTORESEARCH_RUN_TOOL_NAME);
    assert.ok(tool);

    writeExecutable(
      cwd,
      "autoresearch.sh",
      ["#!/usr/bin/env bash", "set -euo pipefail", 'echo "METRIC total_ms=101"'].join("\n"),
    );

    const result = await tool?.execute(
      "call-4",
      {
        cwd,
        description: "candidate with governed finalize signal",
        name: "widget-speed",
        metricName: "total_ms",
        metricUnit: "ms",
        direction: "lower",
        decisionGoal: "Land truthful Prompt Vault runtime integration without another iteration.",
        decisionFilesInScope: ["packages/pi-autoresearch/src/core/runtime.ts"],
        decisionOffLimits: ["packages/pi-vault-client/src/**"],
      },
      undefined,
      undefined,
      { cwd },
    );

    assert.ok(result);
    assert.match(
      result?.content[0]?.text ?? "",
      /live post-run decision: finalize_candidate -> finalize/,
    );
    const details = result?.details as {
      decisionSummary: {
        status: string;
        mappedDecision: string;
        nextHypothesis: string | null;
      };
      runReceipt: {
        decision?: { status: string; mappedDecision: string };
      };
      status: {
        runtimeProjection: { state: string; source: string };
        promptVaultDecisions: {
          availability: string;
          lastPostRunDecision: { mappedDecision: string } | null;
        };
      };
    };

    assert.equal(details.decisionSummary.status, "finalize_candidate");
    assert.equal(details.decisionSummary.mappedDecision, "finalize");
    assert.equal(details.runReceipt.decision?.status, "finalize_candidate");
    assert.equal(details.status.runtimeProjection.state, "finalize_candidate");
    assert.equal(details.status.runtimeProjection.source, "ledger");
    assert.equal(
      details.status.promptVaultDecisions.availability,
      "available_last_used_successfully",
    );
    assert.equal(
      details.status.promptVaultDecisions.lastPostRunDecision?.mappedDecision,
      "finalize",
    );

    const log = loadReceiptLog(cwd);
    const lastRun = log.entries.at(-1);
    assert.equal(lastRun?.type, "run");
    assert.equal(
      lastRun && "decision" in lastRun ? lastRun.decision?.mappedDecision : null,
      "finalize",
    );
  });
});

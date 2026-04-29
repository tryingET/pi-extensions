import assert from "node:assert/strict";
import { chmodSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import os from "node:os";
import path from "node:path";
import test from "node:test";

import {
  type PiAutoresearchExtensionOptions,
  registerPiAutoresearchExtension,
} from "../extensions/pi-autoresearch.ts";
import {
  AUTORESEARCH_FINALIZE_TEMPLATE_NAME,
  AUTORESEARCH_NEXT_HYPOTHESIS_TEMPLATE_NAME,
  AUTORESEARCH_SETUP_TEMPLATE_NAME,
  type AutoresearchDecisionRuntime,
  type FinalizeDecisionOutcome,
  type NextHypothesisDecisionOutcome,
  type SetupDecisionOutcome,
} from "../src/core/decisions.ts";
import {
  AUTORESEARCH_LLAMACPP_CAMPAIGN_CONTROL_TOOL_NAME,
  AUTORESEARCH_LLAMACPP_CAMPAIGN_KIND,
  AUTORESEARCH_LLAMACPP_CAMPAIGN_TOOL_NAME,
  AUTORESEARCH_LLAMACPP_CAMPAIGN_VERSION,
  persistLlamacppCampaignProjection,
  resolveLlamacppCampaignProjectionPath,
} from "../src/core/llamacppCampaign.ts";
import { resolveAutoresearchRuntimeSnapshotPath } from "../src/core/resume.ts";
import {
  AUTORESEARCH_COMMAND_NAME,
  AUTORESEARCH_CONTROL_TOOL_NAME,
  AUTORESEARCH_FINALIZE_TOOL_NAME,
  AUTORESEARCH_LOCAL_ARTIFACTS,
  AUTORESEARCH_LOOP_TOOL_NAME,
  AUTORESEARCH_PEER_ASSIST_TOOL_NAME,
  AUTORESEARCH_RUN_TOOL_NAME,
  AUTORESEARCH_STATUS_TOOL_NAME,
  appendReceipt,
  buildAutoresearchHelpText,
  buildAutoresearchRuntimeStatus,
  createConfigReceipt,
  createRunReceipt,
  formatAutoresearchStatusText,
  loadReceiptLog,
  parseMetricLines,
  parseReceiptLine,
  serializeReceipt,
} from "../src/core/runtime.ts";
import { AUTORESEARCH_SELF_HOSTING_TOOL_NAME } from "../src/core/selfHosting.ts";

type RegisteredCommand = {
  description?: string;
  handler: (args: string, ctx: CommandContext) => Promise<void> | void;
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

type CommandContext = {
  cwd: string;
  hasUI: boolean;
  ui: {
    editor(title: string, text: string): Promise<void>;
    notify(message: string, level?: string): void;
  };
};

function registerHarness(options: PiAutoresearchExtensionOptions = {}) {
  const commands = new Map<string, RegisteredCommand>();
  const tools = new Map<string, RegisteredTool>();

  registerPiAutoresearchExtension(
    {
      registerCommand(name: string, command: RegisteredCommand) {
        commands.set(name, command);
      },
      registerTool(tool: RegisteredTool) {
        tools.set(tool.name, tool);
      },
    } as never,
    options,
  );

  return { commands, tools };
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

function writeFile(target: string, content: string): void {
  mkdirSync(path.dirname(target), { recursive: true });
  writeFileSync(target, content, "utf8");
}

function createLlamacppProjectionFixture(cwd: string): {
  manifestPath: string;
  receiptRootPath: string;
} {
  const sourceRepoPath = path.join(cwd, "source-llama-cpp");
  const workstationRepoPath = path.join(cwd, "workstation");
  const buildBinDir = path.join(cwd, "build-bins", "A", "bin");
  const manifestPath = path.join(cwd, "campaigns", "llamacpp-runtime-status.json");
  const manifestDir = path.dirname(manifestPath);
  const receiptRootPath = path.join(workstationRepoPath, "phasee/receipts/runtime-status");

  writeFile(path.join(sourceRepoPath, "README.md"), "# source\n");
  writeFile(path.join(buildBinDir, "llama-bench"), "A\n");
  writeFile(
    path.join(workstationRepoPath, "scripts/phasee/41-turboquant-pr45-qwen35-validation.py"),
    "#!/usr/bin/env python3\n",
  );
  writeFile(
    path.join(workstationRepoPath, "scripts/phasee/42-turboquant-pr45-qwen35-q8-comparison.py"),
    "#!/usr/bin/env python3\n",
  );
  writeFile(
    path.join(workstationRepoPath, "scripts/phasee/43-turboquant-pr45-qwen35-vllm-comparison.py"),
    "#!/usr/bin/env python3\n",
  );

  const payload = {
    kind: AUTORESEARCH_LLAMACPP_CAMPAIGN_KIND,
    version: AUTORESEARCH_LLAMACPP_CAMPAIGN_VERSION,
    campaignId: "llamacpp-runtime-status",
    objective: "Project one bounded llama.cpp campaign into runtime status.",
    sourceRepoPath,
    workstationRepoPath,
    fork: {
      targetRepoPath: path.join(cwd, "fork", "llama-cpp"),
      baseRef: "main",
      workingBranch: "campaign/runtime-status",
    },
    workflow: {
      kind: "phasee-41-43",
      stage41Script: "scripts/phasee/41-turboquant-pr45-qwen35-validation.py",
      stage42Script: "scripts/phasee/42-turboquant-pr45-qwen35-q8-comparison.py",
      stage43Script: "scripts/phasee/43-turboquant-pr45-qwen35-vllm-comparison.py",
      executionBinding: {
        receiptRootPath: "phasee/receipts/runtime-status",
      },
      stage41BuildIds: ["A"],
      stage42Matrix: [{ buildId: "A", laneIds: ["config_i_turbo3", "q8_0_turbo4"] }],
      stage43BuildIds: [],
    },
    builds: [
      {
        id: "A",
        title: "runtime status build",
        branch: "main",
        buildBinDir: path.relative(manifestDir, buildBinDir),
        cherryPickCommits: [],
        lineageSummary: "single-build status fixture",
        notes: ["runtime-status"],
      },
    ],
    lanes: [
      {
        id: "config_i_turbo3",
        title: "Config I + turbo3",
        runtimeFamily: "config_i",
        kvCacheMode: "turbo3",
        notes: [],
      },
      {
        id: "q8_0_turbo4",
        title: "q8_0 + turbo4",
        runtimeFamily: "q8_0",
        kvCacheMode: "turbo4",
        notes: [],
      },
    ],
    evidence: {
      expectedReceiptPaths: ["phasee/receipts/runtime-status/A-stage41-validation.json"],
      requiredMetrics: ["ppl"],
    },
  };

  writeFile(manifestPath, `${JSON.stringify(payload, null, 2)}\n`);
  return { manifestPath, receiptRootPath };
}

function createDecisionRuntimeStub(
  input: {
    setupOutcome?: SetupDecisionOutcome;
    nextHypothesisOutcome?: NextHypothesisDecisionOutcome;
    finalizeOutcome?: FinalizeDecisionOutcome;
  } = {},
): AutoresearchDecisionRuntime {
  return {
    async runSetup() {
      return (
        input.setupOutcome ?? {
          kind: "setup",
          templateName: AUTORESEARCH_SETUP_TEMPLATE_NAME,
          status: "ready",
          goal: "Bootstrap the bounded campaign with a governed setup packet.",
          primaryMetric: {
            name: "total_ms",
            unit: "ms",
            direction: "lower",
          },
          secondaryMetrics: ["render_ms"],
          benchmarkCommand: "bash autoresearch.sh",
          filesInScope: ["packages/pi-autoresearch/src/core/runtime.ts"],
          offLimits: ["packages/pi-vault-client/src/**"],
          hardConstraints: ["bounded runtime only"],
          checksRequired: "reuse_existing_checks",
          autoresearchMdPlan: ["Capture baseline and next experiment contract."],
          autoresearchShContract: ["Emit METRIC total_ms=<value>."],
          baselinePlan: ["Run the current benchmark once before editing."],
          firstExperimentRules: ["Keep the first experiment scoped to one runtime file."],
          missingInformation: [],
        }
      );
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
      return (
        input.finalizeOutcome ?? {
          kind: "finalize",
          templateName: AUTORESEARCH_FINALIZE_TEMPLATE_NAME,
          status: "ready",
          baseRef: "feature/autoresearch",
          trunkRef: "main",
          overallResult: "One bounded change group is ready for later materialization.",
          proposedGroups: [
            {
              title: "Decision-aware runtime reporting",
              commits: ["abc1234"],
              files: ["packages/pi-autoresearch/src/core/runtime.ts"],
              metricEffect: "No direct metric change; improves control-plane truth.",
              dependencyNotes: ["Materialization remains out of scope."],
            },
          ],
          groupingRationale: ["Keep the runtime integration slice isolated."],
          approvalRequired: true,
          groupsJsonDraft: {
            groups: [
              {
                title: "Decision-aware runtime reporting",
              },
            ],
          },
          riskNotes: ["Finalization branch materialization stays in Workstream C."],
          cleanupHints: ["Leave the bounded runtime receipts in place for replay."],
        }
      );
    },
  };
}

test("parseMetricLines extracts structured METRIC entries and ignores unrelated lines", () => {
  const metrics = parseMetricLines(
    [
      "warmup",
      "METRIC total_ms=15200",
      "METRIC render_ms=9800",
      "METRIC invalid=abc",
      "METRIC __proto__=17",
      "METRIC total_ms=15100",
    ].join("\n"),
  );

  assert.deepEqual(metrics, {
    total_ms: 15100,
    render_ms: 9800,
  });
});

test("receipt helpers round-trip config and run entries", () => {
  const config = createConfigReceipt({
    name: "widget-speed",
    metricName: "total_ms",
    metricUnit: "ms",
    direction: "lower",
    createdAt: 10,
    benchmarkCommand: "bash autoresearch.sh",
    checksCommand: "bash autoresearch.checks.sh",
  });
  const run = createRunReceipt({
    status: "candidate",
    metric: 14000,
    metrics: { render_ms: 9200 },
    description: "cache layout lookups",
    timestamp: 20,
    iteration: 3,
    confidence: 1.4,
    durationSeconds: 0.52,
    exitCode: 0,
    timedOut: false,
    benchmarkCommand: "bash autoresearch.sh",
    checksCommand: "bash autoresearch.checks.sh",
    checksPassed: true,
    checksDurationSeconds: 0.14,
  });

  assert.deepEqual(parseReceiptLine(serializeReceipt(config)), config);
  assert.deepEqual(parseReceiptLine(serializeReceipt(run)), run);
});

test("buildAutoresearchRuntimeStatus reports the bounded runtime surface", () => {
  const status = buildAutoresearchRuntimeStatus("/repo");

  assert.equal(status.phase, "bounded_runtime_kernel");
  assert.equal(status.commandName, AUTORESEARCH_COMMAND_NAME);
  assert.deepEqual(status.toolNames, [
    AUTORESEARCH_STATUS_TOOL_NAME,
    AUTORESEARCH_RUN_TOOL_NAME,
    AUTORESEARCH_CONTROL_TOOL_NAME,
    AUTORESEARCH_FINALIZE_TOOL_NAME,
    AUTORESEARCH_PEER_ASSIST_TOOL_NAME,
    AUTORESEARCH_LOOP_TOOL_NAME,
    AUTORESEARCH_SELF_HOSTING_TOOL_NAME,
    AUTORESEARCH_LLAMACPP_CAMPAIGN_TOOL_NAME,
    AUTORESEARCH_LLAMACPP_CAMPAIGN_CONTROL_TOOL_NAME,
  ]);
  assert.deepEqual(status.localArtifacts, [...AUTORESEARCH_LOCAL_ARTIFACTS]);
  assert.equal(status.currentSegment.configured, false);
  assert.equal(status.runtimeProjection.state, "segment_unconfigured");
  assert.equal(status.runtimeProjection.source, "receipt_fallback");
  assert.equal(status.runtimeProjection.hasLedger, false);
  assert.equal(status.control.kind, "none");
  assert.deepEqual(status.control.allowedActions, ["stop"]);
  assert.equal(status.runtimeSnapshot.reuse, "missing");
  assert.ok((status.runtimeSnapshot.path ?? "").endsWith("autoresearch.runtime.json"));
  assert.equal(status.promptVaultDecisions.availability, "available_not_yet_used");
  assert.equal(status.promptVaultDecisions.lastPostRunDecision, null);
  assert.equal(status.llamacppCampaignProjection.availability, "not_projected");
  assert.ok(
    (status.llamacppCampaignProjection.projectionPath ?? "").endsWith(
      "autoresearch.llamacpp-campaign.json",
    ),
  );
  assert.deepEqual(status.nextSlices, []);
  assert.match(formatAutoresearchStatusText(status), /phase: bounded_runtime_kernel/);
  assert.match(formatAutoresearchStatusText(status), /machine state: segment_unconfigured/);
  assert.match(formatAutoresearchStatusText(status), /live Prompt Vault decisions: available/);
  assert.match(formatAutoresearchStatusText(status), /manifest campaign projection: not projected/);
  assert.match(formatAutoresearchStatusText(status), /next slices: \(none currently committed\)/);
  assert.match(buildAutoresearchHelpText(status), /exact-task AK-binding snapshot derivation/);
  assert.match(buildAutoresearchHelpText(status), /one-step campaign-local advancement/);
  assert.match(
    buildAutoresearchHelpText(status),
    /dedicated public manifest campaign-control seam/,
  );
  assert.match(buildAutoresearchHelpText(status), /autoresearch_self_hosting_run/);
  assert.match(buildAutoresearchHelpText(status), /supervised self-hosting seam/);
  assert.match(buildAutoresearchHelpText(status), /autoresearch_llamacpp_campaign_control/);
  assert.match(buildAutoresearchHelpText(status), /lower-level technical manifest work/);
  assert.match(buildAutoresearchHelpText(status), /## Next bounded slices/);
  assert.match(buildAutoresearchHelpText(status), /none currently committed in current-vs-target/);
  assert.equal(
    buildAutoresearchHelpText(status).includes("llamacpp_campaign_projection_proof"),
    false,
  );
});

test("status builder summarizes best metric and confidence from appended receipts", () =>
  withTempDir((cwd) => {
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
        metric: 100,
        description: "baseline",
        timestamp: 2,
      }),
    );
    appendReceipt(
      cwd,
      createRunReceipt({
        status: "candidate",
        metric: 90,
        description: "candidate 1",
        timestamp: 3,
      }),
    );
    appendReceipt(
      cwd,
      createRunReceipt({
        status: "candidate",
        metric: 92,
        description: "candidate 2",
        timestamp: 4,
      }),
    );

    const status = buildAutoresearchRuntimeStatus(cwd);
    assert.equal(status.currentSegment.configured, true);
    assert.equal(status.currentSegment.runCount, 3);
    assert.equal(status.currentSegment.successfulRunCount, 3);
    assert.equal(status.currentSegment.baselineMetric, 100);
    assert.equal(status.currentSegment.bestMetric, 90);
    assert.equal(status.runtimeProjection.state, "ready");
    assert.equal(status.runtimeProjection.source, "receipt_fallback");
    assert.equal(status.runtimeProjection.hasLedger, false);
    assert.equal(status.promptVaultDecisions.availability, "available_not_yet_used");
    assert.ok((status.currentSegment.confidence ?? 0) > 0);
  }));

test("buildAutoresearchRuntimeStatus surfaces the current llama.cpp campaign projection", () =>
  withTempDir((cwd) => {
    const { manifestPath, receiptRootPath } = createLlamacppProjectionFixture(cwd);
    writeFile(path.join(receiptRootPath, "A-stage41-validation.json"), "{}\n");
    persistLlamacppCampaignProjection({ cwd, manifestPath });

    let status = buildAutoresearchRuntimeStatus(cwd);
    assert.equal(status.llamacppCampaignProjection.availability, "current");
    assert.equal(status.llamacppCampaignProjection.campaignId, "llamacpp-runtime-status");
    assert.equal(status.llamacppCampaignProjection.overallState, "stage41_complete");
    assert.equal(
      status.llamacppCampaignProjection.projectionPath,
      resolveLlamacppCampaignProjectionPath(cwd),
    );
    assert.match(formatAutoresearchStatusText(status), /projected overall state: stage41_complete/);
    assert.match(buildAutoresearchHelpText(status), /## Manifest campaign projection/);
    assert.match(buildAutoresearchHelpText(status), /availability: current/);

    writeFile(path.join(receiptRootPath, "A-stage42-q8-vs-config-i.json"), "{}\n");
    status = buildAutoresearchRuntimeStatus(cwd);
    assert.equal(status.llamacppCampaignProjection.overallState, "stage42_complete");
  }));

test("buildAutoresearchRuntimeStatus marks the llama.cpp campaign projection stale when refresh fails", () =>
  withTempDir((cwd) => {
    const { manifestPath } = createLlamacppProjectionFixture(cwd);
    persistLlamacppCampaignProjection({ cwd, manifestPath });
    writeFile(manifestPath, "{\n");

    const status = buildAutoresearchRuntimeStatus(cwd);
    assert.equal(status.llamacppCampaignProjection.availability, "stale");
    assert.match(status.llamacppCampaignProjection.staleReason ?? "", /projection refresh failed/);
    assert.match(formatAutoresearchStatusText(status), /manifest campaign projection: stale/);
  }));

test("extension registers /autoresearch plus the bounded runtime status, control, finalize, run, public self-hosting, technical llama.cpp campaign, and public campaign-control tools", () => {
  const { commands, tools } = registerHarness();

  assert.equal(typeof commands.get(AUTORESEARCH_COMMAND_NAME)?.handler, "function");
  assert.equal(typeof tools.get(AUTORESEARCH_STATUS_TOOL_NAME)?.execute, "function");
  assert.equal(typeof tools.get(AUTORESEARCH_CONTROL_TOOL_NAME)?.execute, "function");
  assert.equal(typeof tools.get(AUTORESEARCH_FINALIZE_TOOL_NAME)?.execute, "function");
  assert.equal(typeof tools.get(AUTORESEARCH_RUN_TOOL_NAME)?.execute, "function");
  assert.equal(typeof tools.get(AUTORESEARCH_PEER_ASSIST_TOOL_NAME)?.execute, "function");
  assert.equal(typeof tools.get(AUTORESEARCH_LOOP_TOOL_NAME)?.execute, "function");
  assert.equal(typeof tools.get(AUTORESEARCH_SELF_HOSTING_TOOL_NAME)?.execute, "function");
  assert.equal(typeof tools.get(AUTORESEARCH_LLAMACPP_CAMPAIGN_TOOL_NAME)?.execute, "function");
  assert.equal(
    typeof tools.get(AUTORESEARCH_LLAMACPP_CAMPAIGN_CONTROL_TOOL_NAME)?.execute,
    "function",
  );
});

test("/autoresearch reports status without pre-filling the editor", async () => {
  const { commands } = registerHarness();
  let editorOpened = false;
  const notifications: Array<{ message: string; level?: string }> = [];

  await commands.get(AUTORESEARCH_COMMAND_NAME)?.handler("optimize startup", {
    cwd: "/repo",
    hasUI: true,
    ui: {
      async editor(_title: string, _text: string) {
        editorOpened = true;
      },
      notify(message: string, level?: string) {
        notifications.push({ message, level });
      },
    },
  });

  assert.equal(editorOpened, false);
  assert.equal(notifications.length, 2);
  assert.equal(notifications[0]?.level, "warning");
  assert.match(notifications[0]?.message ?? "", /Ignored \/autoresearch arguments/);
  assert.equal(notifications[1]?.level, "info");
  assert.match(notifications[1]?.message ?? "", /pi-autoresearch:/);
  assert.match(notifications[1]?.message ?? "", /autoresearch_runtime_loop/);
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

    const updates: Array<{ details?: { phase?: string } }> = [];
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
      (update: { details?: { phase?: string } }) => updates.push(update),
      { cwd },
    );

    assert.ok(result);
    assert.match(result.content[0]?.text ?? "", /completed iterations: 2\/2/);
    const details = result.details as {
      completedIterations: number;
      runs: Array<{ runReceipt: { status: string; metric: number } }>;
      peerAssist: { lane: string; toolName: string };
      peerLaunchHandoff: { status: string; toolName: string };
    };
    assert.equal(details.completedIterations, 2);
    assert.equal(details.runs[0]?.runReceipt.status, "baseline");
    assert.equal(details.runs[1]?.runReceipt.status, "candidate");
    assert.equal(details.peerAssist.lane, "scout");
    assert.equal(details.peerAssist.toolName, "scout_peer_spawn");
    assert.equal(details.peerLaunchHandoff.status, "handoff_required");
    assert.equal(details.peerLaunchHandoff.toolName, "scout_peer_spawn");
    assert.ok(updates.some((update) => update.details?.phase === "iteration_start"));
    assert.ok(updates.some((update) => update.details?.phase === "loop_complete"));
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
      },
      undefined,
      undefined,
      { cwd },
    );

    assert.ok(result);
    assert.match(result?.content[0]?.text ?? "", /run status: baseline/);
    assert.match(result?.content[0]?.text ?? "", /machine state: ready/);
    const details = result?.details as {
      createdConfig: boolean;
      parsedMetrics: Record<string, number>;
      runReceipt: { status: string; metric: number };
      status: {
        currentSegment: { baselineMetric: number; bestMetric: number; runCount: number };
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
    assert.equal(details.status.currentSegment.baselineMetric, 152);
    assert.equal(details.status.currentSegment.bestMetric, 152);
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
      ["#!/usr/bin/env bash", "set -euo pipefail", 'echo "METRIC total_ms=180"'].join("\n"),
    );

    const result = await tool?.execute(
      "call-3",
      {
        cwd,
        description: "candidate after ledger backfill",
      },
      undefined,
      undefined,
      { cwd },
    );

    const details = result?.details as {
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

test("status builder preserves a receipt-only governed decision when the ledger is missing", () =>
  withTempDir((cwd) => {
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
        metric: 111,
        description: "baseline with governed stop signal",
        timestamp: 2,
        decision: {
          kind: "next_hypothesis",
          templateName: AUTORESEARCH_NEXT_HYPOTHESIS_TEMPLATE_NAME,
          status: "rebaseline_needed",
          mappedDecision: "rebaseline",
          blockingReason: null,
          failureStage: null,
          stateRead: "The benchmark noise floor changed.",
          nextHypothesis: "Accept the new baseline before another experiment.",
          targetFiles: ["packages/pi-autoresearch/src/core/runtime.ts"],
          expectedPrimaryEffect: "The machine should stop in rebaseline_needed.",
          timestamp: 2,
        },
      }),
    );

    const status = buildAutoresearchRuntimeStatus(cwd);
    assert.equal(status.runtimeProjection.source, "receipt_fallback");
    assert.equal(status.runtimeProjection.state, "rebaseline_needed");
    assert.equal(status.promptVaultDecisions.availability, "available_last_used_successfully");
    assert.equal(status.promptVaultDecisions.lastPostRunDecision?.mappedDecision, "rebaseline");
  }));

test("autoresearch_runtime_status can request governed setup and finalize packets", async () => {
  await withTempDir(async (cwd) => {
    const { tools } = registerHarness({
      createDecisionRuntime: () => createDecisionRuntimeStub(),
    });
    const tool = tools.get(AUTORESEARCH_STATUS_TOOL_NAME);
    assert.ok(tool);

    const setup = await tool?.execute(
      "call-5",
      {
        cwd,
        action: "setup",
        optimizationObjective: "Integrate governed Prompt Vault decisions into runtime surfaces.",
        filesInScope: ["packages/pi-autoresearch/src/core/runtime.ts"],
        offLimits: ["packages/pi-vault-client/src/**"],
        hardConstraints: ["bounded runtime only"],
      },
      undefined,
      undefined,
      { cwd },
    );
    assert.ok(setup);
    assert.match(setup?.content[0]?.text ?? "", /kind: setup/);
    assert.match(setup?.content[0]?.text ?? "", /template: pi-autoresearch-setup/);

    const finalize = await tool?.execute(
      "call-6",
      {
        cwd,
        action: "finalize",
        keptRuns: ["baseline 101ms"],
        commitSummaries: ["abc1234 runtime decision integration"],
      },
      undefined,
      undefined,
      { cwd },
    );
    assert.ok(finalize);
    assert.match(finalize?.content[0]?.text ?? "", /kind: finalize/);
    assert.match(finalize?.content[0]?.text ?? "", /template: pi-autoresearch-finalize/);
  });
});

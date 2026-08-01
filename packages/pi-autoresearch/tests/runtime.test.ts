import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import os from "node:os";
import path from "node:path";
import test from "node:test";

import {
  type PiAutoresearchExtensionOptions,
  registerPiAutoresearchExtension,
} from "../extensions/pi-autoresearch.ts";
import {
  AUTORESEARCH_SETUP_TEMPLATE_NAME,
  createAutoresearchDecisionRuntime,
} from "../src/core/decisions.ts";
import { beginAutoresearchCampaignGoal } from "../src/core/goal.ts";
import {
  AUTORESEARCH_LLAMACPP_CAMPAIGN_CONTROL_TOOL_NAME,
  AUTORESEARCH_LLAMACPP_CAMPAIGN_KIND,
  AUTORESEARCH_LLAMACPP_CAMPAIGN_TOOL_NAME,
  AUTORESEARCH_LLAMACPP_CAMPAIGN_VERSION,
  persistLlamacppCampaignProjection,
  resolveLlamacppCampaignProjectionPath,
} from "../src/core/llamacppCampaign.ts";
import {
  AUTORESEARCH_AUTOPLAN_TOOL_NAME,
  AUTORESEARCH_CAMPAIGN_START_TOOL_NAME,
  AUTORESEARCH_CANDIDATE_BIND_TOOL_NAME,
  AUTORESEARCH_CANDIDATE_DECISION_TOOL_NAME,
  AUTORESEARCH_COMMAND_NAME,
  AUTORESEARCH_CONTROL_TOOL_NAME,
  AUTORESEARCH_FINALIZE_TOOL_NAME,
  AUTORESEARCH_LOCAL_ARTIFACTS,
  AUTORESEARCH_LOOP_TOOL_NAME,
  AUTORESEARCH_PEER_ASSIST_TOOL_NAME,
  AUTORESEARCH_RESUME_APPLY_TOOL_NAME,
  AUTORESEARCH_RUN_TOOL_NAME,
  AUTORESEARCH_SETUP_TOOL_NAME,
  AUTORESEARCH_STATUS_TOOL_NAME,
  appendReceipt,
  buildAutoresearchHelpText,
  buildAutoresearchRuntimeStatus,
  createConfigReceipt,
  createRunReceipt,
  formatAutoresearchCampaignGoalStatus,
  formatAutoresearchStatusText,
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
    editor(title: string, text: string): Promise<string | undefined> | string | undefined;
    notify(message: string, level?: string): void;
    setWidget?(id: string, widget: unknown, options?: unknown): void;
    setEditorText?(text: string): void;
    custom?<T>(factory: (...args: unknown[]) => unknown, options?: unknown): Promise<T>;
  };
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

test("Prompt Vault decision errors include lawful owner-route recovery guidance", async () => {
  const runtime = createAutoresearchDecisionRuntime({
    loadPromptPlaneRuntime: async () => ({
      async prepareSelection() {
        return {
          ok: true,
          status: "ready",
          selection_mode: "exact",
          template: {
            name: AUTORESEARCH_SETUP_TEMPLATE_NAME,
            artifact_kind: "procedure",
            control_mode: "router",
            formalization_level: "structured",
            owner_company: "softwareco",
            visibility_companies: ["softwareco"],
          },
          prepared_text: "prepared setup prompt",
        };
      },
    }),
  });

  const outcome = await runtime.runSetup(
    {
      optimizationObjective: "Smooth lawful Prompt Vault binding failures.",
      repoContext: ["pi-autoresearch"],
      filesInScope: ["packages/pi-autoresearch/src/core/decisions.ts"],
      offLimits: [],
      benchmarkSurfaces: ["npm run check"],
      existingArtifacts: [],
      hardConstraints: ["do not interpret Prompt Vault prose manually"],
    },
    { cwd: "/repo" },
  );

  assert.equal(outcome.status, "blocked");
  assert.equal("failureStage" in outcome ? outcome.failureStage : null, "executor");
  assert.match("blockingReason" in outcome ? outcome.blockingReason : "", /No decision executor/);
  assert.match(
    "lawfulOwnerRoute" in outcome ? outcome.lawfulOwnerRoute : "",
    /autoresearch_runtime_status/,
  );
  assert.match(
    "missingBindingAction" in outcome ? outcome.missingBindingAction : "",
    /Do not interpret Prompt Vault prose manually/,
  );
  assert.ok("recoverySteps" in outcome && outcome.recoverySteps.length >= 3);
});

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
    experiment: {
      hypothesisId: "H-cache-layout-001",
      hypothesis: "Caching layout lookups reduces total runtime.",
      interventionSummary: "cache layout lookups",
      expectedPrimaryEffect: "lower total_ms",
      targetFiles: ["src/cache.ts"],
      risk: "microbenchmark may not represent full workload",
      candidate: {
        source: "candidate_peer_spawn",
        worktreePath: "/tmp/candidate-cache-layout",
        branch: "candidate/cache-layout",
        baseRef: "main",
        diffSummary: "memoize layout lookups in the hot path",
        filesChanged: ["src/cache.ts"],
      },
    },
  });

  assert.deepEqual(parseReceiptLine(serializeReceipt(config)), config);
  assert.deepEqual(parseReceiptLine(serializeReceipt(run)), run);
});

test("config receipt parser rejects malformed metricThreshold", () => {
  assert.throws(
    () =>
      parseReceiptLine(
        JSON.stringify({
          type: "config",
          version: 1,
          name: "bad-threshold",
          metricName: "review_findings",
          metricUnit: "count",
          direction: "lower",
          metricThreshold: "2",
          createdAt: 10,
        }),
      ),
    /metricThreshold must be a finite number/,
  );
});

test("buildAutoresearchRuntimeStatus reports the bounded runtime surface", () => {
  const status = buildAutoresearchRuntimeStatus("/repo");

  assert.equal(status.phase, "bounded_runtime_kernel");
  assert.equal(status.commandName, AUTORESEARCH_COMMAND_NAME);
  assert.deepEqual(status.toolNames, [
    AUTORESEARCH_CAMPAIGN_START_TOOL_NAME,
    AUTORESEARCH_STATUS_TOOL_NAME,
    AUTORESEARCH_CANDIDATE_BIND_TOOL_NAME,
    AUTORESEARCH_CANDIDATE_DECISION_TOOL_NAME,
    AUTORESEARCH_RUN_TOOL_NAME,
    AUTORESEARCH_CONTROL_TOOL_NAME,
    AUTORESEARCH_FINALIZE_TOOL_NAME,
    AUTORESEARCH_PEER_ASSIST_TOOL_NAME,
    AUTORESEARCH_LOOP_TOOL_NAME,
    AUTORESEARCH_RESUME_APPLY_TOOL_NAME,
    AUTORESEARCH_AUTOPLAN_TOOL_NAME,
    AUTORESEARCH_SETUP_TOOL_NAME,
    AUTORESEARCH_SELF_HOSTING_TOOL_NAME,
    AUTORESEARCH_LLAMACPP_CAMPAIGN_TOOL_NAME,
    AUTORESEARCH_LLAMACPP_CAMPAIGN_CONTROL_TOOL_NAME,
  ]);
  assert.deepEqual(status.localArtifacts, [...AUTORESEARCH_LOCAL_ARTIFACTS]);
  assert.equal(status.currentSegment.configured, false);
  assert.equal(status.empiricalPosture.classification, "unconfigured");
  assert.equal(status.empiricalPosture.promotionReady, false);
  assert.equal(status.runtimeProjection.state, "segment_unconfigured");
  assert.equal(status.runtimeProjection.source, "receipt_fallback");
  assert.equal(status.runtimeProjection.hasLedger, false);
  assert.equal(status.control.kind, "none");
  assert.deepEqual(status.control.allowedActions, ["stop"]);
  assert.equal(status.runtimeSnapshot.reuse, "missing");
  assert.ok((status.runtimeSnapshot.path ?? "").endsWith("autoresearch.runtime.json"));
  assert.equal(status.autoContinuation.eligible, false);
  assert.ok(status.autoContinuation.blockedReasons.includes("auto_continuation_disabled"));
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
  assert.match(formatAutoresearchStatusText(status), /auto-continuation eligible: no/);
  assert.match(
    formatAutoresearchStatusText(status),
    /auto-continuation blockers: auto_continuation_disabled/,
  );
  assert.match(
    formatAutoresearchStatusText(status),
    /session env gate: disabled \(PI_AUTORESEARCH_AUTO_CONTINUE=\(unset\); required PI_AUTORESEARCH_AUTO_CONTINUE=1\)/,
  );
  assert.match(formatAutoresearchStatusText(status), /live Prompt Vault decisions: available/);
  assert.match(formatAutoresearchStatusText(status), /manifest campaign projection: not projected/);
  assert.match(formatAutoresearchStatusText(status), /empirical posture: unconfigured/);
  assert.match(formatAutoresearchStatusText(status), /next slices: \(none currently committed\)/);
  assert.match(formatAutoresearchStatusText(status), /Setup guide/);
  assert.match(formatAutoresearchStatusText(status), /autoresearch_campaign_start/);
  assert.match(formatAutoresearchStatusText(status), /autoresearch_runtime_setup/);
  assert.match(
    formatAutoresearchStatusText(status),
    /Guided candidate journey: bind -> measure -> candidate_result_export/,
  );
  assert.match(formatAutoresearchStatusText(status), /autoresearch_candidate_bind/);
  assert.match(formatAutoresearchStatusText(status), /autoresearch_runtime_run/);
  assert.match(formatAutoresearchStatusText(status), /candidate_result_export/);
  assert.match(formatAutoresearchStatusText(status), /autoresearch_live_supervision/);
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
  assert.match(buildAutoresearchHelpText(status), /autoresearch_campaign_start/);
  assert.match(buildAutoresearchHelpText(status), /## Next bounded slices/);
  assert.match(buildAutoresearchHelpText(status), /none currently committed in product-posture/);
  assert.equal(
    buildAutoresearchHelpText(status).includes("llamacpp_campaign_projection_proof"),
    false,
  );
});

test("runtime and campaign-goal surfaces explain auto-continuation env/session gates", () => {
  const cwd = mkdtempSync(path.join(os.tmpdir(), "autoresearch-status-auto-gate-"));
  const previousEnabled = process.env.PI_AUTORESEARCH_AUTO_CONTINUE;
  const previousMax = process.env.PI_AUTORESEARCH_AUTO_CONTINUE_MAX;
  try {
    appendReceipt(
      cwd,
      createConfigReceipt({
        name: "status-auto-gate",
        metricName: "unresolved_auto_continuation_blockers",
        metricUnit: "count",
        direction: "lower",
        benchmarkCommand: "node bench.mjs",
        createdAt: 9,
      }),
    );
    beginAutoresearchCampaignGoal({
      cwd,
      objective: "Expose auto-continuation gate status",
      goalId: "goal-status-auto-gate",
      iterationBudget: 3,
      autoContinue: true,
      now: 10,
    });

    delete process.env.PI_AUTORESEARCH_AUTO_CONTINUE;
    delete process.env.PI_AUTORESEARCH_AUTO_CONTINUE_MAX;
    const disabled = buildAutoresearchRuntimeStatus(cwd, { persistSnapshot: false });
    const disabledStatusText = formatAutoresearchStatusText(disabled);
    const disabledGoalText = formatAutoresearchCampaignGoalStatus(disabled.campaignGoal, {
      autoContinuation: disabled.autoContinuation,
    });
    assert.equal(disabled.autoContinuation.eligible, false);
    assert.match(disabledStatusText, /auto-continuation follow-up: will not be sent/);
    assert.match(disabledStatusText, /PI_AUTORESEARCH_AUTO_CONTINUE=\(unset\)/);
    assert.match(disabledGoalText, /Auto-continuation eligibility/);
    assert.match(disabledGoalText, /auto_continuation_disabled/);

    process.env.PI_AUTORESEARCH_AUTO_CONTINUE = "1";
    process.env.PI_AUTORESEARCH_AUTO_CONTINUE_MAX = "2";
    const enabled = buildAutoresearchRuntimeStatus(cwd, {
      persistSnapshot: false,
      autoContinuationSession: {
        enabled: true,
        envValue: "1",
        autoContinueCount: 1,
        maxAutoContinueCount: 2,
      },
    });
    const enabledText = formatAutoresearchStatusText(enabled);
    assert.equal(enabled.autoContinuation.eligible, true);
    assert.match(enabledText, /auto-continuation eligible: yes/);
    assert.match(enabledText, /session count: 1\/2 used; 1 remaining/);
    assert.match(
      formatAutoresearchCampaignGoalStatus(enabled.campaignGoal, {
        autoContinuation: enabled.autoContinuation,
      }),
      /follow-up: will be sent after settle window/,
    );
  } finally {
    if (previousEnabled === undefined) delete process.env.PI_AUTORESEARCH_AUTO_CONTINUE;
    else process.env.PI_AUTORESEARCH_AUTO_CONTINUE = previousEnabled;
    if (previousMax === undefined) delete process.env.PI_AUTORESEARCH_AUTO_CONTINUE_MAX;
    else process.env.PI_AUTORESEARCH_AUTO_CONTINUE_MAX = previousMax;
    rmSync(cwd, { recursive: true, force: true });
  }
});

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

test("$$ autoresearch measure picker applies measure mode for ready worktrees", async () => {
  const pickers: Array<Record<string, unknown>> = [];
  const triggerSurface = {
    registerPickerInteraction(config: Record<string, unknown>) {
      pickers.push(config);
      return { unregister() {} };
    },
  };

  await withTempDir(async (cwd) => {
    execFileSync("git", ["init"], { cwd, stdio: "ignore" });
    writeFileSync(path.join(cwd, "value.txt"), "base\n");
    execFileSync("git", ["add", "value.txt"], { cwd, stdio: "ignore" });
    execFileSync(
      "git",
      ["-c", "user.name=Test", "-c", "user.email=test@example.invalid", "commit", "-m", "base"],
      { cwd, stdio: "ignore" },
    );
    const candidateDir = mkdtempSync(path.join(os.tmpdir(), "pi-autoresearch-picker-candidate-"));
    rmSync(candidateDir, { recursive: true, force: true });
    try {
      execFileSync(
        "git",
        ["worktree", "add", "-b", "candidate/picker-measure", candidateDir, "HEAD"],
        {
          cwd,
          stdio: "ignore",
        },
      );
      writeFileSync(path.join(candidateDir, "value.txt"), "candidate\n");
      execFileSync("git", ["add", "value.txt"], { cwd: candidateDir, stdio: "ignore" });
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
        { cwd: candidateDir, stdio: "ignore" },
      );

      registerHarness({ triggerSurface } as PiAutoresearchExtensionOptions);
      for (let attempt = 0; attempt < 50; attempt += 1) {
        if (pickers.length > 0) break;
        await new Promise((resolve) => setTimeout(resolve, 20));
      }
      const picker = pickers.find((entry) => entry.id === "autoresearch-candidate-bind-picker");
      assert.ok(picker);

      const parsed = (picker.parseInput as (match: unknown, context: unknown) => unknown)(
        { groups: ["measure", candidateDir] },
        { cwd },
      );
      let inserted = "";
      await (picker.applySelection as (input: unknown) => Promise<void>)({
        parsed,
        context: { cwd },
        api: {
          setText(text: string) {
            inserted = text;
          },
        },
      });

      assert.match(inserted, /autoresearch_runtime_run/);
      assert.doesNotMatch(inserted, /autoresearch_candidate_bind/);
      assert.match(inserted, /candidateFilesChanged: \["value.txt"\]/);
    } finally {
      execFileSync("git", ["worktree", "remove", "--force", candidateDir], {
        cwd,
        stdio: "ignore",
      });
    }
  });
});

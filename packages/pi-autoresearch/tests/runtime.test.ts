import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import {
  chmodSync,
  existsSync,
  mkdirSync,
  mkdtempSync,
  readdirSync,
  readFileSync,
  rmSync,
  symlinkSync,
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
  AUTORESEARCH_FINALIZE_TEMPLATE_NAME,
  AUTORESEARCH_NEXT_HYPOTHESIS_TEMPLATE_NAME,
  AUTORESEARCH_SETUP_TEMPLATE_NAME,
  type AutoresearchDecisionRuntime,
  createAutoresearchDecisionRuntime,
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
  AUTORESEARCH_AUTOPLAN_TOOL_NAME,
  AUTORESEARCH_CAMPAIGN_START_TOOL_NAME,
  AUTORESEARCH_CANDIDATE_BIND_TOOL_NAME,
  AUTORESEARCH_CANDIDATE_DECISION_TOOL_NAME,
  AUTORESEARCH_CANDIDATE_RESULT_EXPORT_FILE,
  AUTORESEARCH_CANDIDATE_WAVE_RESULT_EXPORT_DIR,
  AUTORESEARCH_COMMAND_NAME,
  AUTORESEARCH_CONTROL_TOOL_NAME,
  AUTORESEARCH_FINALIZE_TOOL_NAME,
  AUTORESEARCH_LEARNING_EXPORT_FILE,
  AUTORESEARCH_LOCAL_ARTIFACTS,
  AUTORESEARCH_LOOP_TOOL_NAME,
  AUTORESEARCH_ORACLE_EVIDENCE_EXPORT_FILE,
  AUTORESEARCH_PEER_ASSIST_TOOL_NAME,
  AUTORESEARCH_RESUME_APPLY_TOOL_NAME,
  AUTORESEARCH_RUN_TOOL_NAME,
  AUTORESEARCH_SETUP_TOOL_NAME,
  AUTORESEARCH_STATUS_TOOL_NAME,
  appendReceipt,
  buildAutoresearchAdapterContractCatalog,
  buildAutoresearchAkEvidencePacket,
  buildAutoresearchCandidateBindPlan,
  buildAutoresearchCandidateDecisionWorkbench,
  buildAutoresearchCandidateResultPacket,
  buildAutoresearchHelpText,
  buildAutoresearchKnowledgeExportPacket,
  buildAutoresearchOracleEvidencePacket,
  buildAutoresearchResumeApplyPlan,
  buildAutoresearchResumePlan,
  buildAutoresearchRuntimeStatus,
  buildAutoresearchSegmentCloseout,
  createConfigReceipt,
  createRunReceipt,
  executeAutoresearchResumeApply,
  exportAutoresearchDashboardHtml,
  formatAutoresearchAdapterContractCatalog,
  formatAutoresearchAdapterPacketValidationResult,
  formatAutoresearchAkEvidencePacket,
  formatAutoresearchCandidateBindPlan,
  formatAutoresearchCandidateDecisionDashboardSummary,
  formatAutoresearchCandidateDecisionWorkbench,
  formatAutoresearchCandidateResultExportResult,
  formatAutoresearchCandidateResultPacket,
  formatAutoresearchDashboard,
  formatAutoresearchKnowledgeExportPacket,
  formatAutoresearchLearningExportResult,
  formatAutoresearchOracleEvidenceExportResult,
  formatAutoresearchOracleEvidencePacket,
  formatAutoresearchResumeApplyPlan,
  formatAutoresearchResumeApplyResult,
  formatAutoresearchResumePlan,
  formatAutoresearchSegmentCloseout,
  formatAutoresearchStatusText,
  loadReceiptLog,
  parseMetricLines,
  parseReceiptLine,
  serializeReceipt,
  setAutoresearchRuntimeControl,
  validateAutoresearchAdapterPacket,
  writeAutoresearchCandidateResultPacket,
  writeAutoresearchKnowledgeExportPacket,
  writeAutoresearchOracleEvidencePacket,
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
  assert.match(formatAutoresearchStatusText(status), /empirical posture: unconfigured/);
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
  assert.match(buildAutoresearchHelpText(status), /autoresearch_campaign_start/);
  assert.match(buildAutoresearchHelpText(status), /## Next bounded slices/);
  assert.match(buildAutoresearchHelpText(status), /none currently committed in product-posture/);
  assert.equal(
    buildAutoresearchHelpText(status).includes("llamacpp_campaign_projection_proof"),
    false,
  );
});

test("product posture and dogfood playbook expose orchestrator supervision handoff seams", () => {
  const packageRoot = path.resolve(import.meta.dirname, "..");
  const productPosture = readFileSync(
    path.join(packageRoot, "docs/project/product-posture.md"),
    "utf8",
  );
  const dogfoodPlaybook = readFileSync(
    path.join(packageRoot, "docs/project/dogfood-playbook.md"),
    "utf8",
  );
  for (const toolName of [
    "autoresearch_live_supervision",
    "autoresearch_manifest_campaign_supervision",
    "autoresearch_self_hosting_supervision",
  ]) {
    assert.match(productPosture, new RegExp(toolName, "u"));
    assert.match(dogfoodPlaybook, new RegExp(toolName, "u"));
  }
  assert.match(
    dogfoodPlaybook,
    /orchestrator\/AK\/KES\/issue adapter promotion happens explicitly outside pi-autoresearch/u,
  );
});

test("dogfood workflow contract benchmark is current and strict-clean", () => {
  const packageRoot = path.resolve(import.meta.dirname, "..");
  const output = execFileSync(process.execPath, ["scripts/dogfood-workflow-contract.mjs"], {
    cwd: packageRoot,
    encoding: "utf8",
    env: { ...process.env, DOGFOOD_CONTRACT_STRICT: "1" },
  });

  assert.match(output, /CONTRACT ok posture-prioritizes-operator-clarity/u);
  assert.match(output, /CONTRACT ok orchestrator-supervision-handoff/u);
  assert.match(output, /CONTRACT ok resume-foreground-executor-contract/u);
  assert.match(output, /METRIC unresolved_dogfood_blockers=0/u);
});

test("foreground resume dogfood script preserves reviewed executor boundaries", () => {
  const packageRoot = path.resolve(import.meta.dirname, "..");
  const dogfoodCwd = mkdtempSync(path.join(os.tmpdir(), "autoresearch-resume-dogfood-"));
  try {
    const output = execFileSync(
      process.execPath,
      ["scripts/dogfood-foreground-resume-contract.mjs"],
      {
        cwd: packageRoot,
        encoding: "utf8",
        env: {
          ...process.env,
          DOGFOOD_CONTRACT_STRICT: "1",
          PI_AUTORESEARCH_DOGFOOD_CWD: dogfoodCwd,
        },
      },
    );

    assert.match(output, /CONTRACT ok foreground-resume-apply/u);
    assert.match(output, /CONTRACT ok foreground-resume-peer-boundary/u);
    assert.match(output, /METRIC unresolved_foreground_resume_blockers=0/u);
    assert.match(output, /"peerMode": "off"/u);
    assert.match(output, /"finalPosture": "threshold_preserved"/u);
  } finally {
    rmSync(dogfoodCwd, { recursive: true, force: true });
  }
});

test("candidate handoff dogfood script preserves visible-candidate boundaries", () => {
  const packageRoot = path.resolve(import.meta.dirname, "..");
  const output = execFileSync(
    process.execPath,
    ["scripts/dogfood-candidate-handoff-contract.mjs"],
    {
      cwd: packageRoot,
      encoding: "utf8",
      env: { ...process.env, DOGFOOD_CONTRACT_STRICT: "1" },
    },
  );

  assert.match(output, /CONTRACT ok candidate-bind-ready/u);
  assert.match(output, /CONTRACT ok candidate-decision-plan-only/u);
  assert.match(output, /METRIC unresolved_candidate_handoff_blockers=0/u);
  assert.match(output, /"decision": "threshold_satisfied"/u);
  assert.match(output, /"keep": "keep"/u);
  assert.match(output, /"discardCommandKinds": \[/u);
  assert.match(output, /"remove_worktree"/u);
  assert.match(output, /"delete_branch"/u);
  assert.match(output, /"rewindCommandKinds": \[/u);
  assert.match(output, /"reset_to_base"/u);
  assert.match(output, /"lifecycleStateUnchanged": true/u);
});

test("resume slash UI dogfood script preserves foreground review boundaries", () => {
  const packageRoot = path.resolve(import.meta.dirname, "..");
  const dogfoodCwd = mkdtempSync(path.join(os.tmpdir(), "autoresearch-resume-ui-dogfood-"));
  try {
    const output = execFileSync(process.execPath, ["scripts/dogfood-resume-ui-contract.mjs"], {
      cwd: packageRoot,
      encoding: "utf8",
      env: {
        ...process.env,
        DOGFOOD_CONTRACT_STRICT: "1",
        PI_AUTORESEARCH_RESUME_UI_DOGFOOD_CWD: dogfoodCwd,
      },
    });

    assert.match(output, /CONTRACT ok resume-slash-review/u);
    assert.match(output, /CONTRACT ok resume-slash-boundary/u);
    assert.match(output, /METRIC unresolved_resume_ui_blockers=0/u);
    assert.match(output, /"editorHasResumeApplyPlan": true/u);
    assert.match(output, /"editorHasExecutor": true/u);
    assert.match(output, /"editorHasExactConfirmation": true/u);
    assert.match(output, /"editorHasConcreteKeys": true/u);
    assert.match(output, /"editorHasBudgetPlaceholders": true/u);
    assert.match(output, /"toolInvocationCount": 0/u);
  } finally {
    rmSync(dogfoodCwd, { recursive: true, force: true });
  }
});

test("dogfood contract suite counts child execution failures as blockers", () => {
  const packageRoot = path.resolve(import.meta.dirname, "..");
  const output = execFileSync(
    process.execPath,
    [
      "--input-type=module",
      "--eval",
      `
        const { aggregateSuiteResults, blockerCount, parseMetric } = await import("./scripts/dogfood-contract-suite.mjs");
        const cases = [
          ["clean", blockerCount({ exitCode: 0, signalFailure: null, metric: 0 }), 0],
          ["metric_zero_nonzero_exit", blockerCount({ exitCode: 1, signalFailure: null, metric: 0 }), 1],
          ["missing_metric", blockerCount({ exitCode: 0, signalFailure: null, metric: null }), 1],
          ["negative_metric", blockerCount({ exitCode: 0, signalFailure: null, metric: -1 }), 1],
          ["signal_failure", blockerCount({ exitCode: 1, signalFailure: "signal:SIGTERM", metric: 0 }), 1],
        ];
        for (const [name, actual, expected] of cases) {
          if (actual !== expected) {
            throw new Error(name + ": expected " + expected + ", got " + actual);
          }
        }
        if (parseMetric("METRIC unresolved_example=0\\n", "unresolved_example") !== 0) {
          throw new Error("expected metric parser to read zero metric");
        }
        const aggregate = aggregateSuiteResults([
          { ok: true, blockers: 0 },
          { ok: false, blockers: 0 },
        ]);
        if (aggregate.unresolved !== 0 || aggregate.hasFailures !== true) {
          throw new Error("expected aggregate to preserve child failure even with zero blockers");
        }
        console.log("suite-failure-aggregation-ok");
      `,
    ],
    { cwd: packageRoot, encoding: "utf8" },
  );

  assert.match(output, /suite-failure-aggregation-ok/u);
});

test("dogfood contract suite treats symlink invocation as CLI execution", () => {
  const packageRoot = path.resolve(import.meta.dirname, "..");
  const linkRoot = mkdtempSync(path.join(os.tmpdir(), "autoresearch-suite-symlink-"));
  const suiteLink = path.join(linkRoot, "dogfood-contract-suite.mjs");

  try {
    symlinkSync(path.join(packageRoot, "scripts/dogfood-contract-suite.mjs"), suiteLink);
    for (const args of [[suiteLink], ["--preserve-symlinks-main", suiteLink]]) {
      const output = execFileSync(process.execPath, args, {
        cwd: packageRoot,
        encoding: "utf8",
        env: { ...process.env, DOGFOOD_CONTRACT_STRICT: "1" },
      });

      assert.match(output, /CONTRACT ok workflow-contract/u);
      assert.match(output, /CONTRACT ok foreground-resume-contract/u);
      assert.match(output, /CONTRACT ok resume-ui-contract/u);
      assert.match(output, /CONTRACT ok candidate-handoff-contract/u);
      assert.match(output, /METRIC unresolved_autoresearch_dogfood_suite_blockers=0/u);
    }
  } finally {
    rmSync(linkRoot, { recursive: true, force: true });
  }
});

test("dogfood contract suite runs all current strict autoresearch contracts", () => {
  const packageRoot = path.resolve(import.meta.dirname, "..");
  const hostileRoot = mkdtempSync(path.join(os.tmpdir(), "autoresearch-suite-hostile-env-"));
  const hostileCandidateRoot = path.join(hostileRoot, "candidate-root");
  const hostileResumeCwd = path.join(hostileRoot, "resume-cwd");
  const hostileBenchmarkLog = path.join(hostileRoot, "foreground-resume-benchmark.log");
  const hostileResumeUiCwd = path.join(hostileRoot, "resume-ui-cwd");

  try {
    const output = execFileSync(process.execPath, ["scripts/dogfood-contract-suite.mjs"], {
      cwd: packageRoot,
      encoding: "utf8",
      env: {
        ...process.env,
        DOGFOOD_CONTRACT_STRICT: "1",
        PI_AUTORESEARCH_CANDIDATE_DOGFOOD_ROOT: hostileCandidateRoot,
        PI_AUTORESEARCH_DOGFOOD_CWD: hostileResumeCwd,
        PI_AUTORESEARCH_FOREGROUND_RESUME_BENCHMARK_LOG: hostileBenchmarkLog,
        PI_AUTORESEARCH_RESUME_UI_DOGFOOD_CWD: hostileResumeUiCwd,
      },
    });

    assert.match(output, /CONTRACT ok workflow-contract/u);
    assert.match(output, /CONTRACT ok foreground-resume-contract/u);
    assert.match(output, /CONTRACT ok resume-ui-contract/u);
    assert.match(output, /CONTRACT ok candidate-handoff-contract/u);
    assert.match(output, /METRIC unresolved_autoresearch_dogfood_suite_blockers=0/u);
    assert.equal(existsSync(hostileCandidateRoot), false);
    assert.equal(existsSync(hostileResumeCwd), false);
    assert.equal(existsSync(hostileBenchmarkLog), false);
    assert.equal(existsSync(hostileResumeUiCwd), false);
    assert.deepEqual(readdirSync(hostileRoot), []);
  } finally {
    rmSync(hostileRoot, { recursive: true, force: true });
  }
});

test("buildAutoresearchRuntimeStatus only persists snapshots when explicitly requested", () =>
  withTempDir((cwd) => {
    const runtimeSnapshotPath = resolveAutoresearchRuntimeSnapshotPath(cwd);

    const readOnlyStatus = buildAutoresearchRuntimeStatus(cwd);
    assert.equal(readOnlyStatus.runtimeSnapshot.reuse, "missing");
    assert.equal(existsSync(runtimeSnapshotPath), false);

    const persistedStatus = buildAutoresearchRuntimeStatus(cwd, { persistSnapshot: true });
    assert.equal(persistedStatus.runtimeSnapshot.reuse, "missing");
    assert.equal(existsSync(runtimeSnapshotPath), true);

    const reusedStatus = buildAutoresearchRuntimeStatus(cwd);
    assert.equal(reusedStatus.runtimeSnapshot.reuse, "reused");
  }));

test("resume plan is read-only and requires a reusable runtime snapshot", () =>
  withTempDir((cwd) => {
    appendReceipt(
      cwd,
      createConfigReceipt({
        name: "resume-plan",
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

    const missingSnapshotPlan = buildAutoresearchResumePlan(cwd);
    assert.equal(missingSnapshotPlan.packetKind, "autoresearch.resume_plan.v1");
    assert.equal(missingSnapshotPlan.reusable, false);
    assert.match(
      missingSnapshotPlan.blockingReasons.join("\n"),
      /runtime snapshot is not reusable/,
    );
    assert.match(formatAutoresearchResumePlan(missingSnapshotPlan), /Read-only/);

    buildAutoresearchRuntimeStatus(cwd, { persistSnapshot: true });
    const reusablePlan = buildAutoresearchResumePlan(cwd);
    assert.equal(reusablePlan.reusable, true);
    assert.equal(reusablePlan.snapshotReuse, "reused");
    assert.equal(reusablePlan.blockingReasons.length, 0);
    assert.match(reusablePlan.wouldRun ?? "", /autoresearch_runtime_loop/);
    assert.match(formatAutoresearchResumePlan(reusablePlan), /resume_plan\.v1/);
  }));

test("resume apply plan is plan-only and never authorizes execution", () =>
  withTempDir((cwd) => {
    appendReceipt(
      cwd,
      createConfigReceipt({
        name: "resume-apply-plan",
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

    const missingSnapshotPlan = buildAutoresearchResumeApplyPlan(cwd);
    assert.equal(missingSnapshotPlan.packetKind, "autoresearch.resume_apply_plan.v1");
    assert.equal(missingSnapshotPlan.action, "plan_only");
    assert.equal(missingSnapshotPlan.executionAuthorized, false);
    assert.equal(missingSnapshotPlan.planReady, false);
    assert.equal(missingSnapshotPlan.futureForegroundCall, null);
    assert.match(missingSnapshotPlan.blockedReasons.join("\n"), /resume_plan is not reusable/);

    buildAutoresearchRuntimeStatus(cwd, { persistSnapshot: true });
    const readyPlan = buildAutoresearchResumeApplyPlan(cwd);
    assert.equal(readyPlan.planReady, true);
    assert.equal(readyPlan.executionAuthorized, false);
    assert.equal(readyPlan.executorAvailable, true);
    assert.match(readyPlan.futureForegroundCall ?? "", /autoresearch_runtime_resume_apply/);
    assert.match(readyPlan.futureExecutorContract, /callable foreground resume executor exists/);
    assert.match(formatAutoresearchResumeApplyPlan(readyPlan), /Plan-only proposal/);
    assert.match(formatAutoresearchResumeApplyPlan(readyPlan), /execution authorized: no/);
    assert.match(
      formatAutoresearchResumeApplyPlan(readyPlan),
      /autoresearch_runtime_resume_apply is the only callable executor/,
    );
  }));

test("resume apply executor requires exact keys, budgets, and foreground confirmation", async () => {
  await withTempDir(async (cwd) => {
    writeExecutable(
      cwd,
      "autoresearch.sh",
      ["#!/usr/bin/env bash", "set -euo pipefail", 'echo "METRIC total_ms=90"'].join("\n"),
    );
    appendReceipt(
      cwd,
      createConfigReceipt({
        name: "resume-apply",
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
    buildAutoresearchRuntimeStatus(cwd, { persistSnapshot: true });
    const plan = buildAutoresearchResumeApplyPlan(cwd);
    assert.equal(plan.planReady, true);
    assert.ok(plan.resumePlan.segmentKey);
    assert.ok(plan.resumePlan.runtimeKey);

    await assert.rejects(
      executeAutoresearchResumeApply({
        cwd,
        segmentKey: plan.resumePlan.segmentKey,
        runtimeKey: plan.resumePlan.runtimeKey,
        maxIterations: 1,
        maxWallClockMinutes: 1,
        operatorConfirmation: "RUN",
      }),
      /operatorConfirmation must exactly equal/,
    );
    await assert.rejects(
      executeAutoresearchResumeApply({
        cwd,
        segmentKey: plan.resumePlan.segmentKey,
        runtimeKey: plan.resumePlan.runtimeKey,
        maxIterations: 0,
        maxWallClockMinutes: 1,
        operatorConfirmation: "RUN FOREGROUND RESUME",
      }),
      /maxIterations must be a positive integer/,
    );
    await assert.rejects(
      executeAutoresearchResumeApply({
        cwd,
        segmentKey: plan.resumePlan.segmentKey,
        runtimeKey: plan.resumePlan.runtimeKey,
        maxIterations: 1,
        maxWallClockMinutes: 0,
        operatorConfirmation: "RUN FOREGROUND RESUME",
      }),
      /maxWallClockMinutes must be a positive number/,
    );
    await assert.rejects(
      executeAutoresearchResumeApply({
        cwd,
        segmentKey: "wrong",
        runtimeKey: plan.resumePlan.runtimeKey,
        maxIterations: 1,
        maxWallClockMinutes: 1,
        operatorConfirmation: "RUN FOREGROUND RESUME",
      }),
      /segmentKey does not match/,
    );

    const result = await executeAutoresearchResumeApply({
      cwd,
      segmentKey: plan.resumePlan.segmentKey,
      runtimeKey: plan.resumePlan.runtimeKey,
      maxIterations: 1,
      maxWallClockMinutes: 1,
      operatorConfirmation: "RUN FOREGROUND RESUME",
    });
    assert.equal(result.action, "resume_apply");
    assert.equal(result.executionAuthorized, true);
    assert.equal(result.loopResult.completedIterations, 1);
    assert.equal(result.loopResult.peerMode, "off");
    assert.match(formatAutoresearchResumeApplyResult(result), /PI-AUTORESEARCH RESUME APPLY/);
    assert.match(formatAutoresearchResumeApplyResult(result), /foreground tool call/);
  });
});

test("resume plan blocks stale snapshots and explicit operator gates", () =>
  withTempDir((cwd) => {
    appendReceipt(
      cwd,
      createConfigReceipt({
        name: "resume-gates",
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
    buildAutoresearchRuntimeStatus(cwd, { persistSnapshot: true });

    appendReceipt(
      cwd,
      createRunReceipt({
        status: "candidate",
        metric: 90,
        description: "new run after saved snapshot",
        timestamp: 3,
      }),
    );
    const stalePlan = buildAutoresearchResumePlan(cwd);
    assert.equal(stalePlan.reusable, false);
    assert.equal(stalePlan.snapshotReuse, "runtime_mismatch");
    assert.match(stalePlan.blockingReasons.join("\n"), /runtime snapshot is not reusable/);

    buildAutoresearchRuntimeStatus(cwd, { persistSnapshot: true });
    setAutoresearchRuntimeControl({
      cwd,
      decision: "continue",
      reason: "reviewed foreground continuation",
      selectedAt: 4,
    });
    const continuePlan = buildAutoresearchResumePlan(cwd);
    assert.equal(continuePlan.reusable, true);
    assert.equal(continuePlan.controlState, "continue");
    assert.match(continuePlan.wouldRun ?? "", /maxIterations: <explicit>/);

    setAutoresearchRuntimeControl({
      cwd,
      decision: "stop",
      reason: "operator interrupt",
      selectedAt: 5,
    });
    const stopPlan = buildAutoresearchResumePlan(cwd);
    assert.equal(stopPlan.reusable, false);
    assert.equal(stopPlan.controlState, "stop");
    assert.match(stopPlan.blockingReasons.join("\n"), /operator control state is stop/);
  }));

test("resume plan blocks rebaseline and finalize control gates", () =>
  withTempDir((cwd) => {
    appendReceipt(
      cwd,
      createConfigReceipt({
        name: "resume-decision-gates",
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
        status: "candidate",
        metric: 120,
        description: "candidate requiring rebaseline",
        timestamp: 2,
        decision: {
          kind: "next_hypothesis",
          templateName: AUTORESEARCH_NEXT_HYPOTHESIS_TEMPLATE_NAME,
          status: "rebaseline_needed",
          mappedDecision: "rebaseline",
          blockingReason: null,
          failureStage: null,
          stateRead: "The baseline moved.",
          nextHypothesis: "Rebaseline before another candidate run.",
          targetFiles: ["packages/pi-autoresearch/src/core/runtime.ts"],
          expectedPrimaryEffect: "The resume plan must block ordinary continuation.",
          timestamp: 2,
        },
      }),
    );
    buildAutoresearchRuntimeStatus(cwd, { persistSnapshot: true });
    const awaitingRebaselinePlan = buildAutoresearchResumePlan(cwd);
    assert.equal(awaitingRebaselinePlan.reusable, false);
    assert.equal(awaitingRebaselinePlan.machineState, "rebaseline_needed");
    assert.equal(awaitingRebaselinePlan.controlState, "awaiting_operator");
    assert.match(
      awaitingRebaselinePlan.blockingReasons.join("\n"),
      /machine state is rebaseline_needed/,
    );
    assert.match(
      awaitingRebaselinePlan.blockingReasons.join("\n"),
      /awaiting explicit operator control/,
    );

    setAutoresearchRuntimeControl({
      cwd,
      decision: "rebaseline",
      reason: "accept rebaseline gate",
      selectedAt: 3,
    });
    const selectedRebaselinePlan = buildAutoresearchResumePlan(cwd);
    assert.equal(selectedRebaselinePlan.reusable, false);
    assert.equal(selectedRebaselinePlan.controlState, "rebaseline");
    assert.match(
      selectedRebaselinePlan.blockingReasons.join("\n"),
      /operator control state is rebaseline/,
    );
  }));

test("resume plan blocks finalize gates before any resume executor", () =>
  withTempDir((cwd) => {
    appendReceipt(
      cwd,
      createConfigReceipt({
        name: "resume-finalize-gate",
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
        status: "candidate",
        metric: 80,
        description: "candidate ready to finalize",
        timestamp: 2,
        decision: {
          kind: "next_hypothesis",
          templateName: AUTORESEARCH_NEXT_HYPOTHESIS_TEMPLATE_NAME,
          status: "finalize_candidate",
          mappedDecision: "finalize",
          blockingReason: null,
          failureStage: null,
          stateRead: "The segment is stable.",
          nextHypothesis: "Prepare finalization instead of another run.",
          targetFiles: ["packages/pi-autoresearch/src/core/runtime.ts"],
          expectedPrimaryEffect: "The resume plan must block ordinary continuation.",
          timestamp: 2,
        },
      }),
    );
    buildAutoresearchRuntimeStatus(cwd, { persistSnapshot: true });
    const awaitingFinalizePlan = buildAutoresearchResumePlan(cwd);
    assert.equal(awaitingFinalizePlan.reusable, false);
    assert.equal(awaitingFinalizePlan.machineState, "finalize_candidate");
    assert.equal(awaitingFinalizePlan.controlState, "awaiting_operator");
    assert.match(
      awaitingFinalizePlan.blockingReasons.join("\n"),
      /machine state is finalize_candidate/,
    );
    assert.match(
      awaitingFinalizePlan.blockingReasons.join("\n"),
      /awaiting explicit operator control/,
    );

    setAutoresearchRuntimeControl({
      cwd,
      decision: "finalize",
      reason: "accept finalization gate",
      selectedAt: 3,
    });
    const selectedFinalizePlan = buildAutoresearchResumePlan(cwd);
    assert.equal(selectedFinalizePlan.reusable, false);
    assert.equal(selectedFinalizePlan.controlState, "finalize");
    assert.match(
      selectedFinalizePlan.blockingReasons.join("\n"),
      /operator control state is finalize/,
    );
  }));

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
    assert.equal(status.currentSegment.empiricalDecisionClass, "candidate_improvement");
    assert.equal(status.empiricalPosture.classification, "candidate_review_ready");
    assert.equal(status.empiricalPosture.promotionReady, true);
    assert.equal(status.currentSegment.metricInterpretation?.verdict, "meaningful_improvement");
    assert.equal(status.currentSegment.metricInterpretation?.sampleCount, 3);
    assert.equal(status.currentSegment.metricInterpretation?.bestDelta, 10);
    assert.match(
      formatAutoresearchStatusText(status),
      /timing interpretation: meaningful_improvement/,
    );
    assert.match(formatAutoresearchStatusText(status), /empirical decision: candidate_improvement/);
    assert.match(formatAutoresearchStatusText(status), /empirical posture: candidate_review_ready/);
    assert.equal(status.runtimeProjection.state, "ready");
    assert.equal(status.runtimeProjection.source, "receipt_fallback");
    assert.equal(status.runtimeProjection.hasLedger, false);
    assert.equal(status.promptVaultDecisions.availability, "available_not_yet_used");
    assert.ok((status.currentSegment.confidence ?? 0) > 0);
  }));

test("status builder treats zero-blocker threshold metrics as first-class success", () =>
  withTempDir((cwd) => {
    appendReceipt(
      cwd,
      createConfigReceipt({
        name: "self-hosting-threshold",
        metricName: "unresolved_dogfood_blockers",
        metricUnit: "count",
        direction: "lower",
        createdAt: 1,
        benchmarkCommand: "bash autoresearch.sh",
      }),
    );
    appendReceipt(
      cwd,
      createRunReceipt({
        status: "baseline",
        metric: 1,
        description: "baseline with one blocker",
        timestamp: 2,
      }),
    );
    appendReceipt(
      cwd,
      createRunReceipt({
        status: "candidate",
        metric: 0,
        description: "candidate clears the blocker threshold",
        timestamp: 3,
        experiment: {
          hypothesisId: "H-threshold-001",
          hypothesis: "A bounded self-hosting candidate clears unresolved blockers.",
          interventionSummary: "evaluate threshold-style success",
          expectedPrimaryEffect: "unresolved_dogfood_blockers reaches zero",
          targetFiles: ["src/core/runtime.ts"],
          risk: "threshold success is not an improvement-style duration metric",
          candidate: {
            source: "manual",
            worktreePath: "/tmp/candidate-threshold",
            branch: "candidate/threshold",
            baseRef: "main",
            diffSummary: "clear unresolved dogfood blocker",
            filesChanged: ["src/core/runtime.ts"],
          },
        },
      }),
    );

    const status = buildAutoresearchRuntimeStatus(cwd);
    assert.equal(status.currentSegment.empiricalDecisionClass, "threshold_satisfied");
    assert.equal(status.empiricalPosture.classification, "threshold_satisfied");
    assert.equal(status.empiricalPosture.promotionReady, true);
    assert.match(formatAutoresearchStatusText(status), /empirical posture: threshold_satisfied/);

    const closeout = buildAutoresearchSegmentCloseout(cwd);
    assert.equal(closeout.empiricalDecisionClass, "threshold_satisfied");
    assert.equal(closeout.empiricalPosture.promotionReady, true);
    assert.match(formatAutoresearchSegmentCloseout(closeout), /threshold-satisfied evidence/);

    const candidateDecision = buildAutoresearchCandidateDecisionWorkbench({
      cwd,
      action: "status",
    });
    assert.equal(candidateDecision.recommendedDecision, "keep");
  }));

test("status builder uses explicit non-zero threshold targets", () =>
  withTempDir((cwd) => {
    appendReceipt(
      cwd,
      createConfigReceipt({
        name: "explicit-threshold",
        metricName: "review_findings",
        metricUnit: "count",
        direction: "lower",
        metricThreshold: 2,
        createdAt: 1,
        benchmarkCommand: "bash autoresearch.sh",
      }),
    );
    appendReceipt(
      cwd,
      createRunReceipt({
        status: "baseline",
        metric: 5,
        description: "baseline has too many findings",
        timestamp: 2,
      }),
    );
    appendReceipt(
      cwd,
      createRunReceipt({
        status: "candidate",
        metric: 2,
        description: "candidate reaches explicit threshold",
        timestamp: 3,
        experiment: {
          candidate: {
            source: "manual",
            worktreePath: cwd,
            branch: "candidate/explicit-threshold",
            baseRef: "main",
            diffSummary: "reduce review findings to the explicit threshold",
            filesChanged: ["src/core/runtime.ts"],
          },
        },
      }),
    );

    const status = buildAutoresearchRuntimeStatus(cwd);
    assert.equal(status.currentSegment.metricThreshold, 2);
    assert.equal(status.currentSegment.empiricalDecisionClass, "threshold_satisfied");
    assert.equal(status.empiricalPosture.classification, "threshold_satisfied");
    assert.match(formatAutoresearchStatusText(status), /success threshold: 2count/);

    const candidateDecision = buildAutoresearchCandidateDecisionWorkbench({
      cwd,
      action: "plan_keep",
    });
    assert.equal(candidateDecision.recommendedDecision, "keep");
    assert.equal(candidateDecision.metricReadiness?.classification, "threshold_ready");
    assert.match(
      formatAutoresearchCandidateDecisionWorkbench(candidateDecision),
      /Metric readiness review/,
    );
    assert.match(
      formatAutoresearchCandidateDecisionWorkbench(candidateDecision),
      /threshold metric target <=2count/,
    );
    assert.ok(
      candidateDecision.confirmation.checklist.some((item) =>
        item.includes("explicit success threshold <=2count"),
      ),
    );
    assert.ok(
      candidateDecision.confirmation.checklist.some((item) =>
        item.includes("metric readiness reviewed: threshold_ready"),
      ),
    );
  }));

test("status builder blocks explicit threshold misses from generic promotion-ready improvement", () =>
  withTempDir((cwd) => {
    appendReceipt(
      cwd,
      createConfigReceipt({
        name: "explicit-threshold-not-met",
        metricName: "review_findings",
        metricUnit: "count",
        direction: "lower",
        metricThreshold: 2,
        createdAt: 1,
        benchmarkCommand: "bash autoresearch.sh",
      }),
    );
    appendReceipt(
      cwd,
      createRunReceipt({
        status: "baseline",
        metric: 10,
        description: "baseline misses explicit threshold",
        timestamp: 2,
      }),
    );
    appendReceipt(
      cwd,
      createRunReceipt({
        status: "candidate",
        metric: 5,
        description: "candidate improves but still misses explicit threshold",
        timestamp: 3,
        experiment: {
          candidate: {
            source: "manual",
            worktreePath: cwd,
            branch: "candidate/partial-threshold",
            baseRef: "main",
            diffSummary: "reduce findings without reaching target",
            filesChanged: ["src/core/runtime.ts"],
          },
        },
      }),
    );

    const status = buildAutoresearchRuntimeStatus(cwd);
    assert.equal(status.currentSegment.empiricalDecisionClass, "threshold_not_met");
    assert.equal(status.empiricalPosture.classification, "threshold_not_met");
    assert.equal(status.empiricalPosture.promotionReady, false);
    assert.match(formatAutoresearchStatusText(status), /empirical decision: threshold_not_met/);

    const candidateDecision = buildAutoresearchCandidateDecisionWorkbench({ cwd });
    assert.equal(candidateDecision.recommendedDecision, "collect_more_samples");
  }));

test("explicit threshold misses still discard directional regressions", async () => {
  for (const scenario of [
    { direction: "lower" as const, threshold: 2, baseline: 5, candidate: 8 },
    { direction: "higher" as const, threshold: 90, baseline: 80, candidate: 70 },
  ]) {
    await withTempDir((cwd) => {
      appendReceipt(
        cwd,
        createConfigReceipt({
          name: `explicit-threshold-regression-${scenario.direction}`,
          metricName: "review_score",
          metricUnit: "count",
          direction: scenario.direction,
          metricThreshold: scenario.threshold,
          createdAt: 1,
          benchmarkCommand: "bash autoresearch.sh",
        }),
      );
      appendReceipt(
        cwd,
        createRunReceipt({
          status: "baseline",
          metric: scenario.baseline,
          description: "baseline misses explicit threshold",
          timestamp: 2,
        }),
      );
      appendReceipt(
        cwd,
        createRunReceipt({
          status: "candidate",
          metric: scenario.candidate,
          description: "candidate regresses while still missing explicit threshold",
          timestamp: 3,
          experiment: {
            candidate: {
              source: "manual",
              worktreePath: cwd,
              branch: `candidate/threshold-regression-${scenario.direction}`,
              baseRef: "main",
              diffSummary: "regress threshold metric",
              filesChanged: ["src/core/runtime.ts"],
            },
          },
        }),
      );

      const status = buildAutoresearchRuntimeStatus(cwd);
      assert.equal(status.currentSegment.empiricalDecisionClass, "candidate_regression");
      assert.equal(status.empiricalPosture.classification, "candidate_regression");
      assert.equal(status.empiricalPosture.promotionReady, false);

      const candidateDecision = buildAutoresearchCandidateDecisionWorkbench({ cwd });
      assert.equal(candidateDecision.recommendedDecision, "discard");
    });
  }
});

test("status builder treats explicit higher-threshold targets as success", () =>
  withTempDir((cwd) => {
    appendReceipt(
      cwd,
      createConfigReceipt({
        name: "explicit-higher-threshold",
        metricName: "setup_quality_score",
        metricUnit: "pts",
        direction: "higher",
        metricThreshold: 90,
        createdAt: 1,
        benchmarkCommand: "bash autoresearch.sh",
      }),
    );
    appendReceipt(
      cwd,
      createRunReceipt({
        status: "baseline",
        metric: 80,
        description: "baseline below explicit score threshold",
        timestamp: 2,
      }),
    );
    appendReceipt(
      cwd,
      createRunReceipt({
        status: "candidate",
        metric: 91,
        description: "candidate reaches explicit score threshold",
        timestamp: 3,
      }),
    );

    const status = buildAutoresearchRuntimeStatus(cwd);
    assert.equal(status.currentSegment.empiricalDecisionClass, "threshold_satisfied");
    assert.equal(status.empiricalPosture.classification, "threshold_satisfied");
    assert.match(formatAutoresearchDashboard(status), /success threshold: 90pts/);

    const candidateDecision = buildAutoresearchCandidateDecisionWorkbench({ cwd });
    assert.equal(candidateDecision.metricReadiness?.classification, "threshold_ready");
    assert.match(
      formatAutoresearchCandidateDecisionDashboardSummary(candidateDecision),
      /metric readiness: threshold_ready/,
    );
  }));

test("duration explicit threshold misses stay non-promotion-ready after noise gates pass", () =>
  withTempDir((cwd) => {
    appendReceipt(
      cwd,
      createConfigReceipt({
        name: "duration-threshold-not-met",
        metricName: "total_ms",
        metricUnit: "ms",
        direction: "lower",
        metricThreshold: 80,
        createdAt: 1,
        benchmarkCommand: "bash autoresearch.sh",
      }),
    );
    appendReceipt(
      cwd,
      createRunReceipt({
        status: "baseline",
        metric: 100,
        description: "baseline misses duration threshold",
        timestamp: 2,
      }),
    );
    appendReceipt(
      cwd,
      createRunReceipt({
        status: "candidate",
        metric: 97,
        description: "candidate sample inside timing noise",
        timestamp: 3,
      }),
    );
    appendReceipt(
      cwd,
      createRunReceipt({
        status: "candidate",
        metric: 85,
        description: "candidate improves beyond noise but misses explicit threshold",
        timestamp: 4,
        experiment: {
          candidate: {
            source: "manual",
            worktreePath: cwd,
            branch: "candidate/duration-partial-threshold",
            baseRef: "main",
            diffSummary: "reduce total_ms without reaching target",
            filesChanged: ["src/core/runtime.ts"],
          },
        },
      }),
    );

    const status = buildAutoresearchRuntimeStatus(cwd);
    assert.equal(status.currentSegment.metricInterpretation?.verdict, "meaningful_improvement");
    assert.equal(status.currentSegment.empiricalDecisionClass, "threshold_not_met");
    assert.equal(status.empiricalPosture.classification, "threshold_not_met");
    assert.equal(status.empiricalPosture.promotionReady, false);

    const candidateDecision = buildAutoresearchCandidateDecisionWorkbench({ cwd });
    assert.equal(candidateDecision.recommendedDecision, "collect_more_samples");
    assert.equal(candidateDecision.metricReadiness?.classification, "duration_review_ready");
  }));

test("candidate metric readiness reports unconfigured segments", () =>
  withTempDir((cwd) => {
    const candidateDecision = buildAutoresearchCandidateDecisionWorkbench({ cwd });
    assert.equal(candidateDecision.metricReadiness?.classification, "unconfigured");
    assert.match(
      formatAutoresearchCandidateDecisionWorkbench(candidateDecision),
      /no metric contract is configured yet/,
    );
  }));

test("candidate metric readiness keeps duration thresholds behind duration gates", () =>
  withTempDir((cwd) => {
    appendReceipt(
      cwd,
      createConfigReceipt({
        name: "duration-explicit-threshold",
        metricName: "total_ms",
        metricUnit: "ms",
        direction: "lower",
        metricThreshold: 80,
        createdAt: 1,
        benchmarkCommand: "bash autoresearch.sh",
      }),
    );
    appendReceipt(
      cwd,
      createRunReceipt({
        status: "baseline",
        metric: 100,
        description: "baseline duration",
        timestamp: 2,
      }),
    );
    appendReceipt(
      cwd,
      createRunReceipt({
        status: "candidate",
        metric: 75,
        description: "candidate reaches threshold but is under-sampled",
        timestamp: 3,
        experiment: {
          candidate: {
            source: "manual",
            worktreePath: cwd,
            branch: "candidate/duration-threshold",
            baseRef: "main",
            diffSummary: "reduce total_ms",
            filesChanged: ["src/core/runtime.ts"],
          },
        },
      }),
    );

    const status = buildAutoresearchRuntimeStatus(cwd);
    assert.equal(status.currentSegment.empiricalDecisionClass, "insufficient_samples");
    const candidateDecision = buildAutoresearchCandidateDecisionWorkbench({
      cwd,
      action: "plan_keep",
    });
    assert.equal(candidateDecision.metricReadiness?.classification, "duration_under_sampled");
    assert.ok(
      candidateDecision.confirmation.blockedReasons.some((reason) =>
        reason.includes("metric readiness: duration metric is under-sampled"),
      ),
    );
    assert.match(
      formatAutoresearchCandidateDecisionWorkbench(candidateDecision),
      /threshold target <=80ms reviewed after duration\/noise gates/,
    );
  }));

test("candidate metric readiness reports generic non-threshold metrics", () =>
  withTempDir((cwd) => {
    appendReceipt(
      cwd,
      createConfigReceipt({
        name: "generic-review-metric",
        metricName: "review_quality_delta",
        metricUnit: "score",
        direction: "higher",
        createdAt: 1,
        benchmarkCommand: "bash autoresearch.sh",
      }),
    );
    appendReceipt(
      cwd,
      createRunReceipt({
        status: "baseline",
        metric: 3,
        description: "baseline quality",
        timestamp: 2,
      }),
    );
    appendReceipt(
      cwd,
      createRunReceipt({
        status: "candidate",
        metric: 4,
        description: "candidate raises quality",
        timestamp: 3,
      }),
    );

    const candidateDecision = buildAutoresearchCandidateDecisionWorkbench({ cwd });
    assert.equal(candidateDecision.metricReadiness?.classification, "generic_review");
  }));

test("status builder treats preserved zero-blocker thresholds as review-ready evidence", () =>
  withTempDir((cwd) => {
    appendReceipt(
      cwd,
      createConfigReceipt({
        name: "self-hosting-threshold-preserved",
        metricName: "unresolved_dogfood_blockers",
        metricUnit: "count",
        direction: "lower",
        createdAt: 1,
        benchmarkCommand: "bash autoresearch.sh",
      }),
    );
    appendReceipt(
      cwd,
      createRunReceipt({
        status: "baseline",
        metric: 0,
        description: "baseline already satisfies threshold",
        timestamp: 2,
      }),
    );
    appendReceipt(
      cwd,
      createRunReceipt({
        status: "candidate",
        metric: 0,
        description: "candidate preserves the zero-blocker threshold",
        timestamp: 3,
      }),
    );

    const status = buildAutoresearchRuntimeStatus(cwd);
    assert.equal(status.currentSegment.empiricalDecisionClass, "threshold_preserved");
    assert.equal(status.empiricalPosture.classification, "threshold_preserved");
    assert.equal(status.empiricalPosture.promotionReady, true);

    const candidateDecision = buildAutoresearchCandidateDecisionWorkbench({ cwd });
    assert.equal(candidateDecision.metricReadiness?.classification, "threshold_ready");
  }));

test("segment closeout summarizes empirical decisions and candidate bindings", () =>
  withTempDir((cwd) => {
    appendReceipt(
      cwd,
      createConfigReceipt({
        name: "widget-speed-closeout",
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
        empiricalDecisionClass: "candidate_improvement",
        metric: 80,
        description: "candidate peer patch",
        timestamp: 3,
        experiment: {
          hypothesisId: "H-closeout-001",
          hypothesis: "A visible candidate peer patch reduces runtime.",
          interventionSummary: "evaluate candidate peer patch",
          expectedPrimaryEffect: "lower total_ms",
          targetFiles: ["src/core/runtime.ts"],
          risk: "timing benchmark may be noisy",
          candidate: {
            source: "candidate_peer_spawn",
            worktreePath: "/tmp/candidate-closeout",
            branch: "candidate/closeout",
            baseRef: "main",
            diffSummary: "reduce runtime overhead",
            filesChanged: ["src/core/runtime.ts"],
          },
        },
      }),
    );

    const closeout = buildAutoresearchSegmentCloseout(cwd);
    assert.equal(closeout.packetKind, "autoresearch.closeout.v1");
    assert.equal(closeout.adapterContractVersion, 1);
    assert.ok(closeout.targetKinds.includes("evidence"));
    assert.equal(closeout.campaign, "widget-speed-closeout");
    assert.equal(closeout.runCount, 2);
    assert.equal(closeout.candidateBindings.length, 1);
    assert.equal(closeout.oracleReadyEvidence.recordCount, 2);
    assert.equal(closeout.oracleReadyEvidence.preflightStatus, "ready_for_dspx_owner_review");
    assert.equal(closeout.oracleReadyEvidence.target, "dspx_oracle_postgres_pgvector");
    assert.equal(closeout.empiricalPosture.classification, "under_sampled");
    assert.equal(closeout.empiricalPosture.promotionReady, false);
    assert.equal(closeout.candidateBindings[0]?.branch, "candidate/closeout");
    assert.equal(closeout.runs.at(-1)?.empiricalDecisionClass, "candidate_improvement");
    assert.match(formatAutoresearchSegmentCloseout(closeout), /SEGMENT CLOSEOUT/);
    assert.match(
      formatAutoresearchSegmentCloseout(closeout),
      /candidate branch: candidate\/closeout/,
    );
    assert.match(
      formatAutoresearchSegmentCloseout(closeout),
      /packet kind: autoresearch\.closeout\.v1/,
    );
    assert.match(formatAutoresearchSegmentCloseout(closeout), /adapter boundary:/);
    assert.match(formatAutoresearchSegmentCloseout(closeout), /empirical posture: under_sampled/);
    assert.match(formatAutoresearchSegmentCloseout(closeout), /Oracle-ready evidence records: 2/);

    const oracleEvidence = buildAutoresearchOracleEvidencePacket(cwd);
    assert.equal(oracleEvidence.packetKind, "autoresearch.oracle_evidence.v1");
    assert.equal(oracleEvidence.adapterContractVersion, 1);
    assert.ok(oracleEvidence.targetKinds.includes("dspx_oracle"));
    assert.equal(oracleEvidence.records.length, 2);
    assert.equal(oracleEvidence.records[1]?.hypothesisId, "H-closeout-001");
    assert.equal(oracleEvidence.records[1]?.candidate?.branch, "candidate/closeout");
    assert.equal(oracleEvidence.records[1]?.nonAuthority, true);
    assert.equal(oracleEvidence.publicationPreflight.sharedOracleMutated, false);
    assert.equal(oracleEvidence.publicationPreflight.localCoordinatesDbMigrated, false);
    assert.equal(oracleEvidence.publicationPreflight.canonicalAuthorityMutated, false);
    assert.match(formatAutoresearchOracleEvidencePacket(oracleEvidence), /ORACLE-READY EVIDENCE/);
    assert.match(
      formatAutoresearchOracleEvidencePacket(oracleEvidence),
      /shared Oracle mutated: no/,
    );
    assert.match(
      oracleEvidence.publicationPreflight.suggestedDspxPreflightCommandTemplate,
      /'dspx' 'oracle' 'autoresearch-evidence' 'publish-preflight'/u,
    );

    const exportedOracleEvidence = writeAutoresearchOracleEvidencePacket({ cwd });
    assert.equal(exportedOracleEvidence.exportKind, "autoresearch.oracle_evidence_export.v1");
    assert.equal(exportedOracleEvidence.packet.records.length, 2);
    assert.ok(exportedOracleEvidence.path.endsWith(AUTORESEARCH_ORACLE_EVIDENCE_EXPORT_FILE));
    assert.equal(
      exportedOracleEvidence.path,
      path.join(cwd, AUTORESEARCH_ORACLE_EVIDENCE_EXPORT_FILE),
    );
    assert.equal(exportedOracleEvidence.effect.sharedOracleMutated, false);
    assert.equal(exportedOracleEvidence.effect.localCoordinatesDbMigrated, false);
    assert.equal(exportedOracleEvidence.effect.canonicalAuthorityMutated, false);
    assert.match(
      exportedOracleEvidence.suggestedDspxPreflightCommand,
      /'dspx' 'oracle' 'autoresearch-evidence' 'publish-preflight'/u,
    );
    assert.ok(
      exportedOracleEvidence.suggestedDspxPreflightArgv.includes(exportedOracleEvidence.path),
    );
    assert.match(
      formatAutoresearchOracleEvidenceExportResult(exportedOracleEvidence),
      /ORACLE EVIDENCE EXPORT/u,
    );
    const exportedPayload = JSON.parse(readFileSync(exportedOracleEvidence.path, "utf8"));
    assert.equal(exportedPayload.packetKind, "autoresearch.oracle_evidence.v1");
    assert.equal(exportedPayload.records.length, 2);
    assert.throws(
      () => writeAutoresearchOracleEvidencePacket({ cwd }),
      /already exists; pass overwrite=true/u,
    );
    assert.doesNotThrow(() => writeAutoresearchOracleEvidencePacket({ cwd, overwrite: true }));
    assert.throws(
      () => writeAutoresearchOracleEvidencePacket({ cwd, outPath: "/tmp/oracle.json" }),
      /must be relative/u,
    );
    assert.throws(
      () => writeAutoresearchOracleEvidencePacket({ cwd, outPath: "../oracle.json" }),
      /must stay inside/u,
    );
    const weirdExport = writeAutoresearchOracleEvidencePacket({
      cwd,
      outPath: "safe-$(not-executed).json",
    });
    assert.match(weirdExport.suggestedDspxPreflightCommand, /'[^']*\$\(not-executed\)\.json'/u);

    const evidence = buildAutoresearchAkEvidencePacket({ cwd, taskId: 1234 });
    assert.equal(evidence.packetKind, "autoresearch.ak_evidence.v1");
    assert.equal(evidence.adapterContractVersion, 1);
    assert.ok(evidence.targetKinds.includes("ak"));
    assert.equal(evidence.taskId, 1234);
    assert.equal(evidence.checkType, "autoresearch:segment_closeout");
    assert.match(evidence.result, /empirical_decision=insufficient_samples/);
    assert.match(evidence.suggestedToolCall, /evidence_record/);
    assert.match(formatAutoresearchAkEvidencePacket(evidence), /AK EVIDENCE PACKET/);
    assert.match(
      formatAutoresearchAkEvidencePacket(evidence),
      /packet kind: autoresearch\.ak_evidence\.v1/,
    );
    assert.match(formatAutoresearchAkEvidencePacket(evidence), /task id: 1234/);

    const candidateResult = buildAutoresearchCandidateResultPacket(cwd);
    assert.equal(candidateResult.packetKind, "autoresearch.candidate_result.v1");
    assert.equal(candidateResult.candidate?.branch, "candidate/closeout");
    assert.equal(candidateResult.candidateRun?.empiricalDecisionClass, "candidate_improvement");
    assert.match(
      formatAutoresearchCandidateResultPacket(candidateResult),
      /CANDIDATE RESULT PACKET/,
    );

    const candidateResultExport = writeAutoresearchCandidateResultPacket({ cwd });
    assert.equal(candidateResultExport.exportKind, "autoresearch.candidate_result_export.v1");
    assert.equal(candidateResultExport.packet.packetKind, "autoresearch.candidate_result.v1");
    assert.equal(
      candidateResultExport.path,
      path.join(cwd, AUTORESEARCH_CANDIDATE_RESULT_EXPORT_FILE),
    );
    assert.equal(candidateResultExport.effect.candidateLifecycleMutated, false);
    assert.equal(candidateResultExport.effect.worktreeMutated, false);
    assert.equal(candidateResultExport.effect.akCalled, false);
    assert.equal(candidateResultExport.effect.kesWritten, false);
    assert.equal(candidateResultExport.effect.promotionStateChanged, false);
    assert.match(candidateResultExport.suggestedReviewCall, /review_candidate_wave/);
    assert.equal(candidateResultExport.suggestedAggregateReviewCall, null);
    assert.match(
      formatAutoresearchCandidateResultExportResult(candidateResultExport),
      /CANDIDATE RESULT EXPORT/,
    );
    const candidateWaveExport = writeAutoresearchCandidateResultPacket({
      cwd,
      outPath: `${AUTORESEARCH_CANDIDATE_WAVE_RESULT_EXPORT_DIR}/candidate-01.candidate-result.json`,
    });
    assert.equal(
      candidateWaveExport.path,
      path.join(
        cwd,
        AUTORESEARCH_CANDIDATE_WAVE_RESULT_EXPORT_DIR,
        "candidate-01.candidate-result.json",
      ),
    );
    assert.match(candidateWaveExport.suggestedAggregateReviewCall ?? "", /review_candidate_wave/);
    assert.doesNotMatch(
      candidateWaveExport.suggestedAggregateReviewCall ?? "",
      /candidateResultPacketPaths/,
    );
    assert.match(
      formatAutoresearchCandidateResultExportResult(candidateWaveExport),
      /default-discovery aggregate review call/,
    );
    const candidateResultPayload = JSON.parse(readFileSync(candidateResultExport.path, "utf8"));
    assert.equal(candidateResultPayload.packetKind, "autoresearch.candidate_result.v1");
    assert.throws(
      () => writeAutoresearchCandidateResultPacket({ cwd }),
      /already exists; pass overwrite=true/u,
    );
    assert.doesNotThrow(() => writeAutoresearchCandidateResultPacket({ cwd, overwrite: true }));
    assert.throws(
      () => writeAutoresearchCandidateResultPacket({ cwd, outPath: "/tmp/candidate-result.json" }),
      /must be relative/u,
    );
    assert.throws(
      () => writeAutoresearchCandidateResultPacket({ cwd, outPath: "../candidate-result.json" }),
      /must stay inside/u,
    );

    const candidateDecision = buildAutoresearchCandidateDecisionWorkbench({
      cwd,
      action: "status",
    });
    assert.equal(candidateDecision.candidate?.branch, "candidate/closeout");
    assert.equal(candidateDecision.recommendedDecision, "collect_more_samples");
    assert.equal(candidateDecision.empirical.checksStatus, "not run");
    assert.equal(candidateDecision.confirmation.required, false);
    assert.match(candidateDecision.exactNextCalls.join("\n"), /candidate_result/);
    assert.match(
      formatAutoresearchCandidateDecisionWorkbench(candidateDecision),
      /CANDIDATE DECISION WORKBENCH/,
    );

    const discardPlan = buildAutoresearchCandidateDecisionWorkbench({
      cwd,
      action: "plan_discard",
      candidatePolicy: { discard: "delete_worktree_after_confirm" },
    });
    assert.equal(discardPlan.recommendedDecision, "discard");
    assert.equal(discardPlan.confirmation.required, true);
    assert.equal(discardPlan.confirmation.riskLevel, "destructive_external");
    assert.match(discardPlan.confirmation.exactConfirmationPhrase, /confirm autoresearch discard/);
    assert.match(
      formatAutoresearchCandidateDecisionWorkbench(discardPlan),
      /Confirmation checklist/,
    );
    assert.match(discardPlan.plannedCommands.join("\n"), /worktree remove/);
    assert.match(discardPlan.plannedCommands.join("\n"), /plan only/);

    const rewindPlan = buildAutoresearchCandidateDecisionWorkbench({ cwd, action: "plan_rewind" });
    assert.equal(rewindPlan.recommendedDecision, "rewind");
    assert.match(rewindPlan.plannedCommands.join("\n"), /reset --hard/);

    const learning = buildAutoresearchKnowledgeExportPacket(cwd);
    assert.equal(learning.packetKind, "autoresearch.learning.v1");
    assert.ok(learning.targetKinds.includes("kms"));
    assert.match(learning.markdown, /## What was learned/);
    assert.match(formatAutoresearchKnowledgeExportPacket(learning), /KNOWLEDGE EXPORT PACKET/);

    const learningExport = writeAutoresearchKnowledgeExportPacket({ cwd });
    assert.equal(learningExport.exportKind, "autoresearch.learning_export.v1");
    assert.equal(learningExport.packet.packetKind, "autoresearch.learning.v1");
    assert.equal(learningExport.path, path.join(cwd, AUTORESEARCH_LEARNING_EXPORT_FILE));
    assert.equal(learningExport.effect.akCalled, false);
    assert.equal(learningExport.effect.kesWritten, false);
    assert.equal(learningExport.effect.externalAuthorityMutated, false);
    assert.equal(learningExport.effect.promotionStateChanged, false);
    assert.match(learningExport.suggestedKesAdapterCall, /autoresearch_learning_kes_adapter/);
    assert.match(formatAutoresearchLearningExportResult(learningExport), /LEARNING EXPORT/);
    const learningExportPayload = JSON.parse(readFileSync(learningExport.path, "utf8"));
    assert.equal(learningExportPayload.packetKind, "autoresearch.learning.v1");
    assert.throws(
      () => writeAutoresearchKnowledgeExportPacket({ cwd }),
      /already exists; pass overwrite=true/u,
    );
    assert.doesNotThrow(() => writeAutoresearchKnowledgeExportPacket({ cwd, overwrite: true }));
    assert.throws(
      () => writeAutoresearchKnowledgeExportPacket({ cwd, outPath: "/tmp/learning.json" }),
      /must be relative/u,
    );
    assert.throws(
      () => writeAutoresearchKnowledgeExportPacket({ cwd, outPath: "../learning.json" }),
      /must stay inside/u,
    );

    const packetPath = path.join(cwd, "learning-packet.json");
    writeFileSync(packetPath, `${JSON.stringify(learning)}\n`, "utf8");
    const notesAdapterOutput = execFileSync(
      process.execPath,
      ["examples/learning-notes-adapter-consumer.mjs", "--packet", packetPath],
      { cwd: path.resolve(import.meta.dirname, ".."), encoding: "utf8" },
    );
    const notesAdapterReceipt = JSON.parse(notesAdapterOutput) as {
      kind: string;
      status: string;
      apply: boolean;
      target: string;
      destinationPath: string;
    };
    assert.equal(notesAdapterReceipt.kind, "autoresearch.notes_adapter_dry_run.v1");
    assert.equal(notesAdapterReceipt.status, "planned");
    assert.equal(notesAdapterReceipt.apply, false);
    assert.equal(notesAdapterReceipt.target, "repo_notes");
    assert.match(notesAdapterReceipt.destinationPath, /^docs\/learnings\//);

    const catalog = buildAutoresearchAdapterContractCatalog();
    assert.equal(catalog.packetKind, "autoresearch.adapter_contracts.v1");
    assert.equal(catalog.adapterContractVersion, 1);
    assert.deepEqual(
      catalog.entries.map((entry) => entry.packetKind),
      [
        "autoresearch.closeout.v1",
        "autoresearch.oracle_evidence.v1",
        "autoresearch.ak_evidence.v1",
        "autoresearch.candidate_result.v1",
        "autoresearch.learning.v1",
      ],
    );
    assert.match(formatAutoresearchAdapterContractCatalog(catalog), /ADAPTER CONTRACT CATALOG/);

    const validCloseout = validateAutoresearchAdapterPacket(closeout);
    assert.equal(validCloseout.valid, true);
    assert.equal(validCloseout.validatedPacketKind, "autoresearch.closeout.v1");
    assert.match(formatAutoresearchAdapterPacketValidationResult(validCloseout), /valid: yes/);

    const validCandidateResult = validateAutoresearchAdapterPacket(candidateResult);
    assert.equal(validCandidateResult.valid, true);

    const validOracleEvidence = validateAutoresearchAdapterPacket(oracleEvidence);
    assert.equal(validOracleEvidence.valid, true);

    const invalidOracleEvidence = validateAutoresearchAdapterPacket({
      ...oracleEvidence,
      publicationPreflight: { ...oracleEvidence.publicationPreflight, sharedOracleMutated: true },
    });
    assert.equal(invalidOracleEvidence.valid, false);
    assert.match(
      formatAutoresearchAdapterPacketValidationResult(invalidOracleEvidence),
      /sharedOracleMutated/,
    );

    const invalidEvidence = validateAutoresearchAdapterPacket({ ...evidence, taskId: 0 });
    assert.equal(invalidEvidence.valid, false);
    assert.match(formatAutoresearchAdapterPacketValidationResult(invalidEvidence), /taskId/);
  }));

test("calibration runs inform timing noise without competing as best candidate", () =>
  withTempDir((cwd) => {
    appendReceipt(
      cwd,
      createConfigReceipt({
        name: "widget-speed-calibration",
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
        runKind: "calibration",
        metric: 90,
        description: "calibration sample 1",
        timestamp: 3,
      }),
    );
    appendReceipt(
      cwd,
      createRunReceipt({
        status: "candidate",
        runKind: "calibration",
        metric: 91,
        description: "calibration sample 2",
        timestamp: 4,
      }),
    );

    const status = buildAutoresearchRuntimeStatus(cwd);
    assert.equal(status.currentSegment.successfulRunCount, 3);
    assert.equal(status.currentSegment.bestMetric, 100);
    assert.equal(status.currentSegment.confidence, null);
    assert.equal(status.currentSegment.empiricalDecisionClass, "calibration_signal");
    assert.equal(status.empiricalPosture.classification, "calibration_only");
    assert.equal(status.empiricalPosture.promotionReady, false);
    assert.equal(status.currentSegment.lastRunKind, "calibration");
    assert.equal(status.currentSegment.metricInterpretation?.sampleCount, 3);
    assert.equal(status.currentSegment.metricInterpretation?.bestMetric, 90);
    assert.equal(status.currentSegment.metricInterpretation?.verdict, "calibration_signal");
    assert.match(formatAutoresearchStatusText(status), /empirical decision: calibration_signal/);
    assert.match(formatAutoresearchStatusText(status), /timing interpretation: calibration_signal/);
    assert.match(
      formatAutoresearchStatusText(status),
      /last run: candidate \(calibration\) @ 91ms/,
    );

    const candidateDecision = buildAutoresearchCandidateDecisionWorkbench({ cwd });
    assert.equal(candidateDecision.metricReadiness?.classification, "duration_review_ready");
  }));

test("duration candidates are baseline_drift when calibration explains the baseline gap", () =>
  withTempDir((cwd) => {
    appendReceipt(
      cwd,
      createConfigReceipt({
        name: "widget-speed-baseline-drift",
        metricName: "total_ms",
        metricUnit: "ms",
        direction: "lower",
        metricThreshold: 0,
        createdAt: 1,
        benchmarkCommand: "bash autoresearch.sh",
        checksCommand: "npm run check",
      }),
    );
    appendReceipt(
      cwd,
      createRunReceipt({
        status: "baseline",
        metric: 16699,
        description: "high baseline",
        timestamp: 2,
      }),
    );
    appendReceipt(
      cwd,
      createRunReceipt({
        status: "candidate",
        runKind: "calibration",
        metric: 9462,
        description: "calibration sample 1",
        timestamp: 3,
      }),
    );
    appendReceipt(
      cwd,
      createRunReceipt({
        status: "candidate",
        runKind: "calibration",
        metric: 9022,
        description: "calibration sample 2",
        timestamp: 4,
      }),
    );
    appendReceipt(
      cwd,
      createRunReceipt({
        status: "candidate",
        metric: 8665,
        description: "ordinary candidate near calibration band",
        timestamp: 5,
        experiment: {
          hypothesisId: "H-drift-001",
          hypothesis: "candidate should not overclaim a high baseline",
          interventionSummary: "candidate close to calibration samples",
          expectedPrimaryEffect: "lower total_ms",
          targetFiles: ["src/core/runtime.ts"],
          risk: "baseline may be a high outlier",
          candidate: {
            source: "candidate_peer_spawn",
            worktreePath: "/tmp/candidate-drift",
            branch: "candidate/drift",
            baseRef: "main",
            diffSummary: "candidate near calibration band",
            filesChanged: ["src/core/runtime.ts"],
          },
        },
      }),
    );

    const status = buildAutoresearchRuntimeStatus(cwd);
    assert.equal(status.currentSegment.empiricalDecisionClass, "baseline_drift");
    assert.equal(status.empiricalPosture.classification, "baseline_drift_suspected");
    assert.equal(status.empiricalPosture.promotionReady, false);
    assert.equal(status.currentSegment.metricInterpretation?.verdict, "baseline_drift");
    assert.match(formatAutoresearchStatusText(status), /timing interpretation: baseline_drift/);

    const closeout = buildAutoresearchSegmentCloseout(cwd);
    assert.equal(closeout.empiricalDecisionClass, "baseline_drift");
    assert.match(formatAutoresearchSegmentCloseout(closeout), /baseline drift/);

    const candidateResult = buildAutoresearchCandidateResultPacket(cwd);
    assert.equal(candidateResult.empiricalDecisionClass, "baseline_drift");
    assert.equal(candidateResult.candidate?.branch, "candidate/drift");

    const candidateDecision = buildAutoresearchCandidateDecisionWorkbench({ cwd });
    assert.equal(candidateDecision.metricReadiness?.classification, "duration_baseline_drift");
    assert.match(
      formatAutoresearchCandidateDecisionWorkbench(candidateDecision),
      /Metric readiness blockers/,
    );
    assert.match(
      formatAutoresearchCandidateDecisionDashboardSummary(candidateDecision),
      /metric readiness: duration_baseline_drift/,
    );
    const rebaselineCall = candidateDecision.exactNextCalls.find((call) =>
      call.includes("Rebaseline before candidate decision"),
    );
    assert.ok(rebaselineCall);
    assert.match(rebaselineCall, /name: "widget-speed-baseline-drift"/);
    assert.match(rebaselineCall, /metricName: "total_ms"/);
    assert.match(rebaselineCall, /metricUnit: "ms"/);
    assert.match(rebaselineCall, /direction: "lower"/);
    assert.match(rebaselineCall, /metricThreshold: 0/);
    assert.match(rebaselineCall, /benchmarkCommand: "bash autoresearch\.sh"/);
    assert.match(rebaselineCall, /checksCommand: "npm run check"/);
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

test("extension registers /autoresearch plus the supervised campaign front door and bounded runtime tools", () => {
  const { commands, tools } = registerHarness();

  assert.equal(typeof commands.get(AUTORESEARCH_COMMAND_NAME)?.handler, "function");
  assert.equal(typeof tools.get(AUTORESEARCH_CAMPAIGN_START_TOOL_NAME)?.execute, "function");
  assert.equal(typeof tools.get(AUTORESEARCH_STATUS_TOOL_NAME)?.execute, "function");
  assert.equal(typeof tools.get(AUTORESEARCH_CANDIDATE_DECISION_TOOL_NAME)?.execute, "function");
  assert.equal(typeof tools.get(AUTORESEARCH_CONTROL_TOOL_NAME)?.execute, "function");
  assert.equal(typeof tools.get(AUTORESEARCH_FINALIZE_TOOL_NAME)?.execute, "function");
  assert.equal(typeof tools.get(AUTORESEARCH_RUN_TOOL_NAME)?.execute, "function");
  assert.equal(typeof tools.get(AUTORESEARCH_PEER_ASSIST_TOOL_NAME)?.execute, "function");
  assert.equal(typeof tools.get(AUTORESEARCH_LOOP_TOOL_NAME)?.execute, "function");
  assert.equal(typeof tools.get(AUTORESEARCH_RESUME_APPLY_TOOL_NAME)?.execute, "function");
  assert.equal(typeof tools.get(AUTORESEARCH_AUTOPLAN_TOOL_NAME)?.execute, "function");
  assert.equal(typeof tools.get(AUTORESEARCH_SETUP_TOOL_NAME)?.execute, "function");
  assert.equal(typeof tools.get(AUTORESEARCH_SELF_HOSTING_TOOL_NAME)?.execute, "function");
  assert.equal(typeof tools.get(AUTORESEARCH_LLAMACPP_CAMPAIGN_TOOL_NAME)?.execute, "function");
  assert.equal(
    typeof tools.get(AUTORESEARCH_LLAMACPP_CAMPAIGN_CONTROL_TOOL_NAME)?.execute,
    "function",
  );
});

test("/autoresearch without an objective reports status", async () => {
  const { commands } = registerHarness();
  let editorOpened = false;
  const notifications: Array<{ message: string; level?: string }> = [];

  await commands.get(AUTORESEARCH_COMMAND_NAME)?.handler("status", {
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
  assert.equal(notifications.length, 1);
  assert.equal(notifications[0]?.level, "info");
  assert.match(notifications[0]?.message ?? "", /pi-autoresearch:/);
  assert.match(notifications[0]?.message ?? "", /autoresearch_campaign_start/);
});

test("/autoresearch dashboard opens a read-only operator dashboard", async () => {
  const { commands } = registerHarness();
  let editorTitle = "";
  let editorText = "";
  const notifications: Array<{ message: string; level?: string }> = [];

  await commands.get(AUTORESEARCH_COMMAND_NAME)?.handler("dashboard", {
    cwd: "/repo",
    hasUI: true,
    ui: {
      async editor(title: string, text: string) {
        editorTitle = title;
        editorText = text;
      },
      notify(message: string, level?: string) {
        notifications.push({ message, level });
      },
    },
  });

  assert.match(editorTitle, /Pi-autoresearch dashboard/);
  assert.match(editorText, /PI-AUTORESEARCH DASHBOARD/);
  assert.match(editorText, /Candidate lifecycle policy/);
  assert.match(editorText, /Resume apply plan-only proposal/);
  assert.match(editorText, /autoresearch\.resume_apply_plan\.v1/);
  assert.match(editorText, /execution authorized: no/);
  assert.match(editorText, /Learning handoff/);
  assert.match(editorText, /learning_export/);
  assert.match(editorText, /autoresearch_learning_kes_adapter/);
  assert.match(editorText, /Next legal surfaces/);
  assert.equal(notifications.length, 1);
  assert.match(notifications[0]?.message ?? "", /Opened read-only pi-autoresearch dashboard/);
});

test("/autoresearch review opens a candidate decision overlay before editor confirmation", async () => {
  const { commands } = registerHarness();
  let overlayText = "";
  let editorTitle = "";
  let editorText = "";
  const notifications: Array<{ message: string; level?: string }> = [];

  await commands.get(AUTORESEARCH_COMMAND_NAME)?.handler("review keep", {
    cwd: "/repo",
    hasUI: true,
    ui: {
      async editor(title: string, text: string) {
        editorTitle = title;
        editorText = text;
      },
      notify(message: string, level?: string) {
        notifications.push({ message, level });
      },
      async custom<T>(factory: (...args: unknown[]) => unknown, options?: unknown): Promise<T> {
        assert.deepEqual((options as { overlay?: boolean }).overlay, true);
        let result: unknown = null;
        const component = factory({ requestRender() {} }, {}, {}, (value: unknown) => {
          result = value;
        }) as {
          render(width: number): string[];
          handleInput(data: string): void;
        };
        overlayText = component.render(110).join("\n");
        component.handleInput("\r");
        return result as T;
      },
    },
  });

  assert.match(overlayText, /Review autoresearch candidate decision/);
  assert.match(overlayText, /read-only selector/);
  assert.match(overlayText, /Plan keep/);
  assert.match(overlayText, /direct/);
  assert.match(editorTitle, /candidate decision/i);
  assert.match(editorText, /PI-AUTORESEARCH CANDIDATE DECISION CONFIRMATION/);
  assert.match(editorText, /action: "plan_keep"/);
  assert.match(editorText, /plan-only/);
  assert.equal(notifications.length, 1);
  assert.match(
    notifications[0]?.message ?? "",
    /Prepared autoresearch_candidate_decision plan_keep/,
  );
});

test("/autoresearch review falls back to editor when overlay is unavailable", async () => {
  const { commands } = registerHarness();
  let editorText = "";
  const notifications: Array<{ message: string; level?: string }> = [];

  await commands.get(AUTORESEARCH_COMMAND_NAME)?.handler("review", {
    cwd: "/repo",
    hasUI: true,
    ui: {
      async editor(_title: string, text: string) {
        editorText = text;
      },
      notify(message: string, level?: string) {
        notifications.push({ message, level });
      },
    },
  });

  assert.match(editorText, /PI-AUTORESEARCH CANDIDATE DECISION CONFIRMATION/);
  assert.match(editorText, /autoresearch_candidate_decision/);
  assert.equal(notifications[0]?.level, "warning");
  assert.match(notifications[0]?.message ?? "", /overlay unavailable/);
});

test("/autoresearch resume prepares a foreground resume review", async () => {
  await withTempDir(async (cwd) => {
    appendReceipt(
      cwd,
      createConfigReceipt({
        name: "slash-resume",
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
    buildAutoresearchRuntimeStatus(cwd, { persistSnapshot: true });

    const { commands } = registerHarness();
    let editorTitle = "";
    let editorText = "";
    let composerText = "";
    const notifications: Array<{ message: string; level?: string }> = [];

    await commands.get(AUTORESEARCH_COMMAND_NAME)?.handler("resume", {
      cwd,
      hasUI: true,
      ui: {
        async editor(title: string, text: string) {
          editorTitle = title;
          editorText = text;
          return text;
        },
        setEditorText(text: string) {
          composerText = text;
        },
        notify(message: string, level?: string) {
          notifications.push({ message, level });
        },
      },
    });

    assert.match(editorTitle, /foreground autoresearch resume/i);
    assert.match(editorText, /PI-AUTORESEARCH RESUME APPLY REVIEW/);
    assert.match(editorText, /autoresearch\.resume_apply_plan\.v1/);
    assert.match(editorText, /autoresearch_runtime_resume_apply/);
    assert.match(editorText, /operatorConfirmation: "RUN FOREGROUND RESUME"/);
    assert.match(editorText, /Replace `<explicit>` budgets/);
    assert.notEqual(composerText, editorText);
    assert.match(composerText, /^autoresearch_runtime_resume_apply\(/);
    assert.doesNotMatch(composerText, /PI-AUTORESEARCH RESUME APPLY REVIEW/);
    assert.match(composerText, /operatorConfirmation: "RUN FOREGROUND RESUME"/);
    assert.equal(notifications.length, 1);
    assert.match(
      notifications[0]?.message ?? "",
      /Accepted foreground resume call into the message editor/,
    );
  });
});

test("exportAutoresearchDashboardHtml writes a browser dashboard artifact", () =>
  withTempDir((cwd) => {
    const result = exportAutoresearchDashboardHtml({ cwd });
    const html = readFileSync(result.path, "utf8");

    assert.equal(result.cwd, cwd);
    assert.match(result.fileUrl, /^file:/);
    assert.match(html, /pi-autoresearch live dashboard/);
    assert.match(html, /Auto-refreshes every 2s/);
    assert.match(html, /Resume plan/);
    assert.match(html, /autoresearch\.resume_plan\.v1/);
    assert.match(html, /Read-only: no benchmark run/);
    assert.match(html, /Resume apply plan-only proposal/);
    assert.match(html, /autoresearch\.resume_apply_plan\.v1/);
    assert.match(html, /autoresearch_runtime_resume_apply/);
    assert.match(html, /Learning handoff/);
    assert.match(html, /learning_export/);
    assert.match(html, /autoresearch_learning_kes_adapter/);
    assert.match(html, /Browser export is read-only/);
  }));

test("/autoresearch export off stops browser dashboard refresh without opening a browser", async () => {
  const { commands } = registerHarness();
  const notifications: Array<{ message: string; level?: string }> = [];

  await commands.get(AUTORESEARCH_COMMAND_NAME)?.handler("export off", {
    cwd: "/repo",
    hasUI: true,
    ui: {
      async editor() {},
      notify(message: string, level?: string) {
        notifications.push({ message, level });
      },
    },
  });

  assert.equal(notifications.length, 1);
  assert.match(
    notifications[0]?.message ?? "",
    /Stopped pi-autoresearch browser dashboard refresh/,
  );
});

test("/autoresearch overlay opens a read-only live dashboard overlay", async () => {
  const { commands } = registerHarness();
  let overlayOptions: unknown;
  let overlayText = "";
  const notifications: Array<{ message: string; level?: string }> = [];

  await commands.get(AUTORESEARCH_COMMAND_NAME)?.handler("overlay", {
    cwd: "/repo",
    hasUI: true,
    ui: {
      async editor() {},
      notify(message: string, level?: string) {
        notifications.push({ message, level });
      },
      async custom<T>(factory: (...args: unknown[]) => unknown, options?: unknown): Promise<T> {
        overlayOptions = options;
        const component = factory({ requestRender() {} }, {}, {}, () => {}) as {
          render(width: number): string[];
          dispose?: () => void;
        };
        overlayText = component.render(100).join("\n");
        component.dispose?.();
        return undefined as T;
      },
    },
  });

  const options = overlayOptions as {
    overlay: boolean;
    overlayOptions: {
      anchor: string;
      width: string;
      maxHeight: string;
      margin: number;
      visible: unknown;
    };
  };
  assert.equal(options.overlay, true);
  assert.equal(options.overlayOptions.anchor, "center");
  assert.equal(options.overlayOptions.width, "92%");
  assert.equal(options.overlayOptions.maxHeight, "85%");
  assert.equal(options.overlayOptions.margin, 1);
  assert.equal(typeof options.overlayOptions.visible, "function");
  assert.match(overlayText, /pi-autoresearch live dashboard/);
  assert.match(overlayText, /read-only/);
  assert.match(overlayText, /Candidate policy/);
  assert.equal(notifications.length, 0);
});

test("/autoresearch widget on and off controls the persistent status widget", async () => {
  const { commands } = registerHarness();
  const widgets = new Map<string, unknown>();
  const notifications: Array<{ message: string; level?: string }> = [];

  const ctx: CommandContext = {
    cwd: "/repo",
    hasUI: true,
    ui: {
      async editor() {},
      notify(message: string, level?: string) {
        notifications.push({ message, level });
      },
      setWidget(id: string, widget: unknown) {
        if (widget === undefined) {
          widgets.delete(id);
          return;
        }
        widgets.set(id, widget);
      },
    },
  };

  await commands.get(AUTORESEARCH_COMMAND_NAME)?.handler("widget on", ctx);
  assert.equal(widgets.size, 1);
  const widgetFactory = [...widgets.values()][0] as (tui: { requestRender?: () => void }) => {
    render(width: number): string[];
    dispose?: () => void;
  };
  const widget = widgetFactory({ requestRender() {} });
  const rendered = widget.render(120).join("\n");
  assert.match(rendered, /🔬 autoresearch/);
  assert.match(rendered, /0 runs\/0 ok/);
  widget.dispose?.();

  await commands.get(AUTORESEARCH_COMMAND_NAME)?.handler("widget off", ctx);
  assert.equal(widgets.size, 0);
  assert.match(notifications.at(-1)?.message ?? "", /Disabled the pi-autoresearch status widget/);
});

test("$$ autoresearch input fallback prepares exact tool calls without PTX", async () => {
  const { eventHandlers } = registerHarness();
  const inputHandler = eventHandlers.get("input");
  assert.equal(typeof inputHandler, "function");

  const rewindResult = (await inputHandler?.(
    { source: "user", text: "$$ autoresearch rewind" },
    {
      cwd: "/repo",
    },
  )) as { action: string; text: string };
  assert.equal(rewindResult.action, "transform");
  assert.match(rewindResult.text, /autoresearch_candidate_decision/);
  assert.match(rewindResult.text, /action: "plan_rewind"/);

  const bindResult = (await inputHandler?.(
    { source: "user", text: "$$ autoresearch bind current" },
    { cwd: "/repo" },
  )) as { action: string; text: string };
  assert.equal(bindResult.action, "transform");
  assert.match(bindResult.text, /autoresearch_candidate_bind/);
  assert.match(bindResult.text, /candidateWorktree: "\/repo"/);
  assert.doesNotMatch(bindResult.text, /<base-ref>/);

  const measureResult = (await inputHandler?.(
    { source: "user", text: "$$ autoresearch measure current" },
    { cwd: "/repo" },
  )) as { action: string; text: string };
  assert.equal(measureResult.action, "transform");
  assert.match(measureResult.text, /autoresearch_candidate_bind/);
  assert.match(measureResult.text, /candidateWorktree/);

  const nextResult = (await inputHandler?.(
    { source: "user", text: "$$ autoresearch next" },
    { cwd: "/repo" },
  )) as { action: string; text: string };
  assert.equal(nextResult.action, "transform");
  assert.match(nextResult.text, /autoresearch_candidate_bind/);

  const resumeResult = (await inputHandler?.(
    { source: "user", text: "$$ autoresearch resume" },
    { cwd: "/repo" },
  )) as { action: string; text: string };
  assert.equal(resumeResult.action, "transform");
  assert.match(resumeResult.text, /PI-AUTORESEARCH RESUME APPLY REVIEW/);
  assert.match(resumeResult.text, /resume_apply_plan/);

  const learningResult = (await inputHandler?.(
    { source: "user", text: "$$ autoresearch learning" },
    { cwd: "/repo" },
  )) as { action: string; text: string };
  assert.equal(learningResult.action, "transform");
  assert.match(learningResult.text, /autoresearch_runtime_status/);
  assert.match(learningResult.text, /action: "learning_export"/);
  assert.doesNotMatch(learningResult.text, /autoresearch_campaign_start/);

  const campaignResult = (await inputHandler?.(
    { source: "user", text: "$$ ar optimize startup" },
    { cwd: "/repo" },
  )) as { action: string; text: string };
  assert.equal(campaignResult.action, "transform");
  assert.match(campaignResult.text, /autoresearch_campaign_start/);
  assert.match(campaignResult.text, /optimize startup/);

  const slashResult = (await inputHandler?.(
    { source: "user", text: "$$ /100x mindset" },
    {
      cwd: "/repo",
    },
  )) as { action: string };
  assert.equal(slashResult.action, "continue");
});

test("/autoresearch next prepares the current recommended candidate call", async () => {
  await withTempDir(async (cwd) => {
    const { commands } = registerHarness();
    let editorTitle = "";
    let editorText = "";
    const notifications: Array<{ message: string; level?: string }> = [];

    await commands.get(AUTORESEARCH_COMMAND_NAME)?.handler("next", {
      cwd,
      hasUI: true,
      ui: {
        async editor(title: string, text: string) {
          editorTitle = title;
          editorText = text;
        },
        notify(message: string, level?: string) {
          notifications.push({ message, level });
        },
      },
    });

    assert.match(editorTitle, /Next autoresearch candidate action/);
    assert.match(editorText, /autoresearch_candidate_bind/);
    assert.match(editorText, /candidateWorktree/);
    assert.equal(notifications.length, 1);

    appendReceipt(
      cwd,
      createConfigReceipt({
        name: "next-candidate",
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
        metric: 150,
        description: "regression",
        timestamp: 3,
        experiment: {
          candidate: {
            source: "manual",
            worktreePath: path.join(cwd, "candidate"),
            branch: "candidate/next",
            baseRef: "HEAD~1",
            diffSummary: "regressed",
            filesChanged: ["src/value.ts"],
          },
        },
      }),
    );

    await commands.get(AUTORESEARCH_COMMAND_NAME)?.handler("candidate next", {
      cwd,
      hasUI: true,
      ui: {
        async editor(title: string, text: string) {
          editorTitle = title;
          editorText = text;
        },
        notify(message: string, level?: string) {
          notifications.push({ message, level });
        },
      },
    });

    assert.match(editorText, /autoresearch_runtime_run/);
    assert.match(editorText, /Collect another ordinary candidate sample/);
  });
});

test("/autoresearch measure prepares a candidate measurement run call", async () => {
  await withTempDir(async (cwd) => {
    const { commands, eventHandlers } = registerHarness();
    execFileSync("git", ["init"], { cwd, stdio: "ignore" });
    writeFileSync(path.join(cwd, "value.txt"), "base\n");
    execFileSync("git", ["add", "value.txt"], { cwd, stdio: "ignore" });
    execFileSync(
      "git",
      ["-c", "user.name=Test", "-c", "user.email=test@example.invalid", "commit", "-m", "base"],
      { cwd, stdio: "ignore" },
    );
    const candidateDir = mkdtempSync(path.join(os.tmpdir(), "pi-autoresearch-candidate-"));
    rmSync(candidateDir, { recursive: true, force: true });
    try {
      execFileSync("git", ["worktree", "add", "-b", "candidate/measure", candidateDir, "HEAD"], {
        cwd,
        stdio: "ignore",
      });
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

      let editorTitle = "";
      let editorText = "";
      const notifications: Array<{ message: string; level?: string }> = [];

      await commands.get(AUTORESEARCH_COMMAND_NAME)?.handler(`measure ${candidateDir}`, {
        cwd,
        hasUI: true,
        ui: {
          async editor(title: string, text: string) {
            editorTitle = title;
            editorText = text;
          },
          notify(message: string, level?: string) {
            notifications.push({ message, level });
          },
        },
      });

      assert.match(editorTitle, /Measure autoresearch candidate/);
      assert.match(editorText, /autoresearch_runtime_run/);
      assert.match(editorText, /candidateWorktree/);
      assert.match(editorText, /candidateFilesChanged: \["value.txt"\]/);
      assert.equal(notifications.length, 1);
      assert.match(notifications[0]?.message ?? "", /Prepared candidate measurement/);

      const inputHandler = eventHandlers.get("input");
      const fallbackResult = (await inputHandler?.(
        { source: "user", text: `$$ autoresearch measure ${candidateDir}` },
        { cwd },
      )) as { action: string; text: string };
      assert.equal(fallbackResult.action, "transform");
      assert.match(fallbackResult.text, /autoresearch_runtime_run/);
      assert.doesNotMatch(fallbackResult.text, /autoresearch_candidate_bind/);
      assert.match(fallbackResult.text, /candidateFilesChanged: \["value.txt"\]/);
    } finally {
      execFileSync("git", ["worktree", "remove", "--force", candidateDir], {
        cwd,
        stdio: "ignore",
      });
    }
  });
});

test("/autoresearch bind prepares a candidate-bind tool call", async () => {
  const { commands } = registerHarness();
  let editorTitle = "";
  let editorText = "";
  const notifications: Array<{ message: string; level?: string }> = [];

  await commands.get(AUTORESEARCH_COMMAND_NAME)?.handler("bind current", {
    cwd: "/repo",
    hasUI: true,
    ui: {
      async editor(title: string, text: string) {
        editorTitle = title;
        editorText = text;
      },
      notify(message: string, level?: string) {
        notifications.push({ message, level });
      },
    },
  });

  assert.match(editorTitle, /Bind autoresearch candidate/);
  assert.match(editorText, /autoresearch_candidate_bind/);
  assert.match(editorText, /candidateWorktree: "\/repo"/);
  assert.doesNotMatch(editorText, /<base-ref>/);
  assert.equal(notifications.length, 1);
  assert.match(notifications[0]?.message ?? "", /Prepared autoresearch_candidate_bind/);
});

test("/autoresearch keep/discard/rewind prepare candidate-decision tool calls", async () => {
  const { commands } = registerHarness();
  let editorTitle = "";
  let editorText = "";
  const notifications: Array<{ message: string; level?: string }> = [];

  await commands.get(AUTORESEARCH_COMMAND_NAME)?.handler("rewind", {
    cwd: "/repo",
    hasUI: true,
    ui: {
      async editor(title: string, text: string) {
        editorTitle = title;
        editorText = text;
      },
      notify(message: string, level?: string) {
        notifications.push({ message, level });
      },
    },
  });

  assert.match(editorTitle, /candidate decision/);
  assert.match(editorText, /CANDIDATE DECISION CONFIRMATION/);
  assert.match(editorText, /Confirmation checklist/);
  assert.match(editorText, /autoresearch_candidate_decision/);
  assert.match(editorText, /action: "plan_rewind"/);
  assert.match(editorText, /candidatePolicy/);
  assert.equal(notifications.length, 1);
  assert.match(
    notifications[0]?.message ?? "",
    /Prepared autoresearch_candidate_decision plan_rewind/,
  );
});

test("/autoresearch learning prepares a learning-export handoff call", async () => {
  const { commands } = registerHarness();
  let editorTitle = "";
  let editorText = "";
  const notifications: Array<{ message: string; level?: string }> = [];

  await commands.get(AUTORESEARCH_COMMAND_NAME)?.handler("learning", {
    cwd: "/repo",
    hasUI: true,
    ui: {
      async editor(title: string, text: string) {
        editorTitle = title;
        editorText = text;
      },
      notify(message: string, level?: string) {
        notifications.push({ message, level });
      },
    },
  });

  assert.match(editorTitle, /Export autoresearch learning packet/);
  assert.match(editorText, /autoresearch_runtime_status/);
  assert.match(editorText, /action: "learning_export"/);
  assert.doesNotMatch(editorText, /autoresearch_campaign_start/);
  assert.equal(notifications.length, 1);
  assert.match(notifications[0]?.message ?? "", /Prepared autoresearch learning export/);
});

test("/autoresearch with an objective prepares the campaign-start tool call", async () => {
  const { commands } = registerHarness();
  let editorTitle = "";
  let editorText = "";
  const notifications: Array<{ message: string; level?: string }> = [];

  await commands.get(AUTORESEARCH_COMMAND_NAME)?.handler("optimize startup", {
    cwd: "/repo",
    hasUI: true,
    ui: {
      async editor(title: string, text: string) {
        editorTitle = title;
        editorText = text;
      },
      notify(message: string, level?: string) {
        notifications.push({ message, level });
      },
    },
  });

  assert.match(editorTitle, /Start supervised autoresearch campaign/);
  assert.match(editorText, /autoresearch_campaign_start/);
  assert.match(editorText, /optimize startup/);
  assert.match(editorText, /runMode: "plan_only"/);
  assert.match(editorText, /candidatePolicy/);
  assert.match(editorText, /mode: "worktree"/);
  assert.equal(notifications.length, 1);
  assert.match(notifications[0]?.message ?? "", /Prepared autoresearch_campaign_start/);
});

test("/autoresearch run executes the bounded first-entrypoint campaign", async () => {
  await withTempDir(async (cwd) => {
    writeExecutable(cwd, "autoresearch.sh", '#!/usr/bin/env bash\necho "METRIC total_ms=7"\n');
    writeExecutable(cwd, "autoresearch.checks.sh", "#!/usr/bin/env bash\nexit 0\n");
    const { commands } = registerHarness();
    let editorTitle = "";
    let editorText = "";
    const notifications: Array<{ message: string; level?: string }> = [];

    await commands.get(AUTORESEARCH_COMMAND_NAME)?.handler("run optimize startup", {
      cwd,
      hasUI: true,
      ui: {
        async editor(title: string, text: string) {
          editorTitle = title;
          editorText = text;
        },
        notify(message: string, level?: string) {
          notifications.push({ message, level });
        },
      },
    });

    assert.match(editorTitle, /Autoresearch campaign result/);
    assert.match(editorText, /PI-AUTORESEARCH CAMPAIGN START/);
    assert.match(editorText, /run mode: bounded_loop/);
    assert.match(editorText, /completed iterations: 3\/3/);
    assert.match(editorText, /peer tool: candidate_peer_spawn/);
    assert.match(editorText, /peer call: candidate_peer_spawn/);
    assert.match(editorText, /peer launch handoff: not_requested/);
    assert.match(editorText, /Peer\/intercom messages are communication only/);
    assert.match(editorText, /machine state: ready/);
    assert.match(
      readFileSync(path.join(cwd, "autoresearch.jsonl"), "utf8"),
      /"status":"candidate"/,
    );
    assert.equal(notifications.length, 2);
    assert.match(notifications[0]?.message ?? "", /Starting bounded foreground autoresearch run/);
    assert.match(notifications[1]?.message ?? "", /Completed bounded foreground autoresearch run/);
  });
});

test("/autoresearch run is unavailable in the read toolbox profile", async () => {
  await withTempDir(async (cwd) => {
    writeExecutable(cwd, "autoresearch.sh", '#!/usr/bin/env bash\necho "METRIC total_ms=7"\n');
    const { commands } = registerHarness({ effectProfile: "read" });
    let editorTitle = "";
    let editorText = "";
    const notifications: Array<{ message: string; level?: string }> = [];

    await commands.get(AUTORESEARCH_COMMAND_NAME)?.handler("run optimize startup", {
      cwd,
      hasUI: true,
      ui: {
        async editor(title: string, text: string) {
          editorTitle = title;
          editorText = text;
        },
        notify(message: string, level?: string) {
          notifications.push({ message, level });
        },
      },
    });

    assert.match(editorTitle, /Autoresearch campaign blocked/);
    assert.match(editorText, /unavailable in the autoresearch read profile/);
    assert.equal(existsSync(path.join(cwd, "autoresearch.jsonl")), false);
    assert.equal(notifications.length, 1);
    assert.equal(notifications[0]?.level, "warning");
  });
});

test("autoresearch_runtime_status can render the compact dashboard", async () => {
  await withTempDir(async (cwd) => {
    const { tools } = registerHarness();

    const result = await tools
      .get(AUTORESEARCH_STATUS_TOOL_NAME)
      ?.execute("call-dashboard", { cwd, action: "dashboard" }, undefined, undefined, { cwd });

    assert.ok(result);
    const output = result.content[0]?.text ?? "";
    assert.match(output, /PI-AUTORESEARCH DASHBOARD/);
    assert.match(output, /Read-only operator dashboard/);
    assert.match(output, /Candidate lifecycle policy/);
    assert.match(
      output,
      /worktree role: primary candidate accept\/keep\/discard\/rewind primitive/,
    );
    assert.match(output, /Candidate decision/);
    assert.match(output, /no candidate bound yet/);
    assert.match(output, /Resume plan/);
    assert.match(output, /autoresearch\.resume_plan\.v1/);
    assert.match(output, /resume_plan" \}\)/);
    assert.match(output, /Resume apply plan-only proposal/);
    assert.match(output, /autoresearch\.resume_apply_plan\.v1/);
    assert.match(output, /execution authorized: no/);
    assert.match(output, /resume_apply_plan" \}\)/);
    assert.match(output, /Next legal surfaces/);
  });
});

test("autoresearch_runtime_control surfaces the read-only resume plan", async () => {
  await withTempDir(async (cwd) => {
    appendReceipt(
      cwd,
      createConfigReceipt({
        name: "control-resume-plan",
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
    buildAutoresearchRuntimeStatus(cwd, { persistSnapshot: true });

    const { tools } = registerHarness();
    const tool = tools.get(AUTORESEARCH_CONTROL_TOOL_NAME);
    assert.ok(tool);

    await tool?.execute("call-control-prime", { cwd, action: "status" }, undefined, undefined, {
      cwd,
    });
    buildAutoresearchRuntimeStatus(cwd, { persistSnapshot: true });

    const statusResult = await tool?.execute(
      "call-control-status",
      { cwd, action: "status" },
      undefined,
      undefined,
      { cwd },
    );
    const statusText = statusResult?.content[0]?.text ?? "";
    assert.match(statusText, /PI-AUTORESEARCH CONTROL/);
    assert.match(statusText, /## Resume plan/);
    assert.match(statusText, /reusable: yes/);
    assert.match(statusText, /autoresearch_runtime_loop/);
    assert.match(statusText, /## Resume apply plan-only proposal/);
    assert.match(statusText, /autoresearch\.resume_apply_plan\.v1/);
    assert.match(statusText, /execution authorized: no/);

    const stopResult = await tool?.execute(
      "call-control-stop",
      { cwd, action: "set", decision: "stop", reason: "hold before longer campaign" },
      undefined,
      undefined,
      { cwd },
    );
    const stopText = stopResult?.content[0]?.text ?? "";
    assert.match(stopText, /## Resume plan/);
    assert.match(stopText, /reusable: no/);
    assert.match(stopText, /operator control state is stop/);
    assert.match(stopText, /no benchmark run, resume_apply, daemon/);
    assert.match(stopText, /## Resume apply plan-only proposal/);
    assert.match(stopText, /plan ready: no/);
    assert.match(stopText, /resume_plan is not reusable/);
  });
});

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
    const shellInjectionSentinel = path.join(process.cwd(), "dspx-shell-injected");
    rmSync(shellInjectionSentinel, { force: true });
    const fakeDspxHome = path.join(cwd, "fake-$(touch dspx-shell-injected)-dspx");
    const objective = "reduce runtime with dspx";
    writeFile(
      path.join(fakeDspxHome, "justfile"),
      `dspx subcommand intentflag intent outdirflag outdir:\n    mkdir -p "{{outdir}}"\n    printf '%s\\n' '${JSON.stringify(
        {
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
        },
      ).replaceAll("'", "'\\''")} ' > "{{outdir}}/behavior_results.json"\n`,
    );
    process.env.DSPX_HOME = fakeDspxHome;
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
      rmSync(shellInjectionSentinel, { force: true });
    }
  });
});

test("autoresearch_runtime_autoplan infers setup and can materialize DSPx intent handoff", async () => {
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

    const dspxOutdir = path.join(cwd, ".autoresearch/dspx/generated/autosetup-planner");
    mkdirSync(dspxOutdir, { recursive: true });
    writeFile(
      path.join(dspxOutdir, "behavior_results.json"),
      JSON.stringify({
        summary: { status: "passed", total: 1, passed: 1, failed: 0, error: 0 },
        examples: [
          {
            index: 0,
            status: "passed",
            inputs: { objective: "reduce benchmark runtime" },
            observed_outputs: {
              campaign_name: "dspx-speed",
              metric_name: "total_ms",
              metric_unit: "ms",
              direction: "lower",
              benchmark_command: "npm run bench",
              checks_command: "npm run check",
              risks: "watch noisy timing",
              next_action: "apply via autoresearch_runtime_setup only",
            },
          },
        ],
      }),
    );

    const result = await tools.get(AUTORESEARCH_AUTOPLAN_TOOL_NAME)?.execute(
      "call-autoplan",
      {
        cwd,
        objective: "reduce benchmark runtime",
        planner: "dspx_program",
        materializeDspxIntent: true,
        dspxOutdir,
      },
      undefined,
      undefined,
      { cwd },
    );

    assert.ok(result);
    assert.match(result.content[0]?.text ?? "", /DSPx generated DSPy planner assembly/);
    const details = result.details as {
      config: { name: string; metricName: string; direction: string };
      benchmarkCommand: string;
      checksCommand: string;
      dspxProgramGen: { intentPath: string; materialized: boolean; command: string };
      dspxAdvisory: {
        available: boolean;
        status: string;
        matchedObjective: boolean;
        proposal: { campaignName: string; benchmarkCommand: string };
        nextToolCall: string;
      };
    };
    assert.equal(details.config.metricName, "total_ms");
    assert.equal(details.config.direction, "lower");
    assert.equal(details.benchmarkCommand, "npm run bench");
    assert.equal(details.checksCommand, "npm run check");
    assert.equal(details.dspxProgramGen.materialized, true);
    assert.equal(details.dspxAdvisory.available, true);
    assert.equal(details.dspxAdvisory.status, "passed");
    assert.equal(details.dspxAdvisory.matchedObjective, true);
    assert.equal(details.dspxAdvisory.proposal.campaignName, "dspx-speed");
    assert.equal(details.dspxAdvisory.proposal.benchmarkCommand, "npm run bench");
    assert.match(details.dspxAdvisory.nextToolCall, /autoresearch_runtime_setup/);
    assert.match(result.content[0]?.text ?? "", /DSPx advisory evidence/);
    assert.match(
      readFileSync(details.dspxProgramGen.intentPath, "utf8"),
      /AutoresearchSetupPlanner/,
    );
    assert.match(details.dspxProgramGen.command, /program-gen/);
  });
});

test("autoresearch_runtime_autoplan proposes duration script for generic total_ms benchmark", async () => {
  await withTempDir(async (cwd) => {
    const { tools } = registerHarness();
    writeFile(
      path.join(cwd, "package.json"),
      JSON.stringify({
        name: "demo-test",
        scripts: { test: "node test.js", check: "node check.js" },
      }),
    );

    const result = await tools.get(AUTORESEARCH_AUTOPLAN_TOOL_NAME)?.execute(
      "call-autoplan-duration-script",
      {
        cwd,
        objective: "reduce test runtime",
        metricName: "total_ms",
        direction: "lower",
      },
      undefined,
      undefined,
      { cwd },
    );

    assert.ok(result);
    const output = result.content[0]?.text ?? "";
    assert.match(output, /Measurement contract/);
    assert.match(output, /Benchmark script proposal/);
    assert.doesNotMatch(output, /may not print required METRIC total_ms=value/);
    const details = result.details as {
      risks: string[];
      nextToolCall: string;
      measurementContract: { optimizationAuthority: string; freshness: string };
      benchmarkScriptProposal: {
        benchmarkScript: string;
        source: string;
        measurementContract: { optimizationAuthority: string; freshness: string };
      };
    };
    assert.equal(details.measurementContract.optimizationAuthority, "baseline_allowed");
    assert.equal(details.measurementContract.freshness, "run_generated");
    assert.equal(details.benchmarkScriptProposal.source, "duration_wrapper");
    assert.equal(
      details.benchmarkScriptProposal.measurementContract.optimizationAuthority,
      "baseline_allowed",
    );
    assert.equal(details.benchmarkScriptProposal.measurementContract.freshness, "run_generated");
    assert.match(details.benchmarkScriptProposal.benchmarkScript, /npm test/);
    assert.match(
      details.benchmarkScriptProposal.benchmarkScript,
      /AUTORESEARCH_BENCHMARK_COMMAND=/,
    );
    assert.match(details.benchmarkScriptProposal.benchmarkScript, /METRIC total_ms=/);
    assert.doesNotMatch(details.benchmarkScriptProposal.benchmarkScript, /node -e 'console\.log/);
    assert.ok(
      !details.risks.some((risk) => risk.includes("METRIC total_ms=value")),
      "script proposal should resolve the generic metric-contract warning",
    );
    assert.match(details.nextToolCall, /action: "baseline"/);
    assert.match(details.nextToolCall, /benchmarkCommand: "bash autoresearch\.sh"/);
    assert.match(details.nextToolCall, /benchmarkScript:/);
    assert.match(details.nextToolCall, /allowOverwriteScripts: false/);
  });
});

test("autoresearch_runtime_autoplan omits inferred duplicate checks command", async () => {
  await withTempDir(async (cwd) => {
    const { tools } = registerHarness();
    writeFile(
      path.join(cwd, "package.json"),
      JSON.stringify({
        name: "demo-duplicate-checks",
        scripts: {
          test: "npm run quality:ci",
          check: "npm run quality:ci",
          "quality:ci": "node test.js",
        },
      }),
    );

    const result = await tools.get(AUTORESEARCH_AUTOPLAN_TOOL_NAME)?.execute(
      "call-autoplan-duplicate-checks",
      {
        cwd,
        objective: "reduce test runtime",
        benchmarkCommand: "npm test",
        metricName: "total_ms",
        direction: "lower",
      },
      undefined,
      undefined,
      { cwd },
    );

    assert.ok(result);
    const details = result.details as {
      checksCommand: null;
      risks: string[];
      nextToolCall: string;
    };
    assert.equal(details.checksCommand, null);
    assert.ok(details.risks.some((risk) => risk.includes("checks command omitted")));
    assert.match(details.nextToolCall, /checksCommand: null/);
    assert.match(details.nextToolCall, /action: "baseline"/);
  });
});

test("autoresearch_runtime_autoplan omits inferred duplicate checks for existing autoresearch wrapper", async () => {
  await withTempDir(async (cwd) => {
    const { tools } = registerHarness();
    writeFile(
      path.join(cwd, "package.json"),
      JSON.stringify({
        name: "demo-wrapper-duplicate-checks",
        scripts: {
          test: "npm run quality:ci",
          check: "npm run quality:ci",
          "quality:ci": "node test.js",
        },
      }),
    );
    writeFile(
      path.join(cwd, "autoresearch.sh"),
      [
        "#!/usr/bin/env bash",
        "set -euo pipefail",
        '# autoresearch-wrapped-command-json: "npm test"',
        "",
        "AUTORESEARCH_BENCHMARK_COMMAND='npm test' node <<'NODE'",
        'const { spawnSync } = require("node:child_process");',
        "const startedAt = Date.now();",
        "const result = spawnSync(process.env.AUTORESEARCH_BENCHMARK_COMMAND, { shell: true });",
        "const durationMs = Date.now() - startedAt;",
        "if (typeof result.status === 'number' && result.status !== 0) process.exit(result.status);",
        "console.log('METRIC total_ms=' + durationMs);",
        "NODE",
        "",
      ].join("\n"),
    );

    const result = await tools.get(AUTORESEARCH_AUTOPLAN_TOOL_NAME)?.execute(
      "call-autoplan-wrapper-duplicate-checks",
      {
        cwd,
        objective: "reduce test runtime",
        metricName: "total_ms",
        direction: "lower",
      },
      undefined,
      undefined,
      { cwd },
    );

    assert.ok(result);
    const details = result.details as {
      benchmarkCommand: string;
      checksCommand: null;
      risks: string[];
      nextToolCall: string;
    };
    assert.equal(details.benchmarkCommand, "bash autoresearch.sh");
    assert.equal(details.checksCommand, null);
    assert.ok(details.risks.some((risk) => risk.includes("checks command omitted")));
    assert.match(details.nextToolCall, /checksCommand: null/);
    assert.match(details.nextToolCall, /action: "baseline"/);
  });
});

test("autoresearch_runtime_autoplan does not invent score script without evidence", async () => {
  await withTempDir(async (cwd) => {
    const { tools } = registerHarness();
    writeFile(
      path.join(cwd, "package.json"),
      JSON.stringify({
        name: "demo-quality",
        scripts: { test: "node test.js", check: "node check.js" },
      }),
    );

    const result = await tools.get(AUTORESEARCH_AUTOPLAN_TOOL_NAME)?.execute(
      "call-autoplan-score-no-evidence",
      {
        cwd,
        objective: "improve setup quality",
        metricName: "setup_quality_score",
        direction: "higher",
      },
      undefined,
      undefined,
      { cwd },
    );

    assert.ok(result);
    assert.match(
      result.content[0]?.text ?? "",
      /may not print required METRIC setup_quality_score=value/,
    );
    const details = result.details as {
      risks: string[];
      nextToolCall: string;
      measurementContract: null;
      benchmarkScriptProposal: null;
    };
    assert.equal(details.measurementContract, null);
    assert.equal(details.benchmarkScriptProposal, null);
    assert.ok(details.risks.some((risk) => risk.includes("METRIC setup_quality_score=value")));
    assert.match(details.nextToolCall, /action: "plan"/);
    assert.doesNotMatch(details.nextToolCall, /benchmarkScript:/);
  });
});

test("autoresearch_runtime_autoplan keeps static DSPx behavior score advisory-only", async () => {
  await withTempDir(async (cwd) => {
    const { tools } = registerHarness();
    writeFile(
      path.join(cwd, "package.json"),
      JSON.stringify({
        name: "demo-quality",
        scripts: { test: "node test.js", check: "node check.js" },
      }),
    );
    const dspxOutdir = path.join(cwd, ".autoresearch/dspx/generated/autosetup-planner-real");
    const behaviorPath = path.join(dspxOutdir, "behavior_results.json");
    mkdirSync(dspxOutdir, { recursive: true });
    writeFile(
      behaviorPath,
      JSON.stringify({
        summary: { status: "passed", total: 4, passed: 3, failed: 1, error: 0 },
        examples: [
          {
            index: 0,
            status: "passed",
            inputs: { objective: "improve setup quality" },
            observed_outputs: {
              campaign_name: "setup-quality",
              metric_name: "setup_quality_score",
              metric_unit: "percent",
              direction: "higher",
              benchmark_command: "npm test",
              checks_command: "npm run check",
              risks: "quality score comes from DSPx behavior evidence",
              next_action: "apply setup through autoresearch_runtime_setup",
            },
          },
        ],
      }),
    );

    const result = await tools.get(AUTORESEARCH_AUTOPLAN_TOOL_NAME)?.execute(
      "call-autoplan-dspx-score-script",
      {
        cwd,
        objective: "improve setup quality",
        planner: "dspx_program",
        dspxOutdir,
        dspxBehaviorPath: behaviorPath,
        metricName: "setup_quality_score",
        direction: "higher",
      },
      undefined,
      undefined,
      { cwd },
    );

    assert.ok(result);
    const output = result.content[0]?.text ?? "";
    assert.match(output, /DSPx advisory evidence/);
    assert.match(output, /Advisory metric summary \(not baseline authority\)/);
    assert.doesNotMatch(output, /## Benchmark script proposal/);
    assert.match(output, /measurement authority: advisory_only/);
    const details = result.details as {
      risks: string[];
      nextToolCall: string;
      measurementContract: { optimizationAuthority: string; freshness: string };
      benchmarkScriptProposal: {
        benchmarkScript: string;
        source: string;
        measurementContract: { optimizationAuthority: string; freshness: string };
      };
      dspxAdvisory: {
        warnings: string[];
        nextToolCall: string;
        benchmarkScriptProposal: {
          benchmarkScript: string;
          source: string;
          measurementContract: { optimizationAuthority: string; freshness: string };
        };
      };
    };
    assert.equal(details.measurementContract.optimizationAuthority, "advisory_only");
    assert.equal(details.measurementContract.freshness, "static_existing_artifact");
    assert.equal(details.benchmarkScriptProposal.source, "dspx_behavior_score");
    assert.equal(
      details.benchmarkScriptProposal.measurementContract.optimizationAuthority,
      "advisory_only",
    );
    assert.equal(
      details.benchmarkScriptProposal.measurementContract.freshness,
      "static_existing_artifact",
    );
    assert.match(details.benchmarkScriptProposal.benchmarkScript, /behavior_results\.json/);
    assert.match(details.benchmarkScriptProposal.benchmarkScript, /METRIC setup_quality_score=/);
    assert.ok(details.risks.some((risk) => risk.includes("METRIC setup_quality_score=value")));
    assert.ok(details.risks.some((risk) => risk.includes("measurement contract is advisory_only")));
    assert.match(details.nextToolCall, /action: "plan"/);
    assert.match(details.nextToolCall, /benchmarkCommand: "npm test"/);
    assert.doesNotMatch(details.nextToolCall, /benchmarkScript:/);
    assert.equal(details.dspxAdvisory.benchmarkScriptProposal.source, "dspx_behavior_score");
    assert.equal(
      details.dspxAdvisory.benchmarkScriptProposal.measurementContract.optimizationAuthority,
      "advisory_only",
    );
    assert.match(details.dspxAdvisory.nextToolCall, /action: "plan"/);
    assert.ok(
      details.dspxAdvisory.warnings.some((warning) =>
        warning.includes("measurement contract is advisory_only"),
      ),
      "DSPx advisory must not become baseline authority when it reads static evidence",
    );
  });
});

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
        candidateWorktree: "/tmp/candidate-peer-runtime",
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
      worktreePath: "/tmp/candidate-peer-runtime",
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

test("autoresearch_runtime_status can request closeout, setup, and finalize packets", async () => {
  await withTempDir(async (cwd) => {
    const { tools } = registerHarness({
      createDecisionRuntime: () => createDecisionRuntimeStub(),
    });
    const tool = tools.get(AUTORESEARCH_STATUS_TOOL_NAME);
    assert.ok(tool);

    appendReceipt(
      cwd,
      createConfigReceipt({
        name: "status-closeout",
        metricName: "total_ms",
        metricUnit: "ms",
        direction: "lower",
        createdAt: 1,
      }),
    );
    appendReceipt(
      cwd,
      createRunReceipt({
        status: "baseline",
        metric: 100,
        description: "status closeout baseline",
        timestamp: 2,
      }),
    );

    const closeout = await tool?.execute(
      "call-4",
      {
        cwd,
        action: "closeout",
      },
      undefined,
      undefined,
      { cwd },
    );
    assert.ok(closeout);
    assert.match(closeout?.content[0]?.text ?? "", /SEGMENT CLOSEOUT/);
    assert.match(closeout?.content[0]?.text ?? "", /evidence boundary:/);

    const oracleEvidence = await tool?.execute(
      "call-4a2",
      {
        cwd,
        action: "oracle_evidence",
      },
      undefined,
      undefined,
      { cwd },
    );
    assert.ok(oracleEvidence);
    assert.match(oracleEvidence?.content[0]?.text ?? "", /ORACLE-READY EVIDENCE/);
    assert.equal(
      (oracleEvidence?.details as { packetKind?: string }).packetKind,
      "autoresearch.oracle_evidence.v1",
    );

    const oracleExportPath = path.join(cwd, ".autoresearch", "status-oracle-evidence.json");
    const oracleEvidenceExport = await tool?.execute(
      "call-4a3",
      {
        cwd,
        action: "oracle_evidence_export",
        outPath: "status-oracle-evidence.json",
      },
      undefined,
      undefined,
      { cwd },
    );
    assert.ok(oracleEvidenceExport);
    assert.match(oracleEvidenceExport?.content[0]?.text ?? "", /ORACLE EVIDENCE EXPORT/);
    assert.match(
      oracleEvidenceExport?.content[0]?.text ?? "",
      /'dspx' 'oracle' 'autoresearch-evidence' 'publish-preflight'/,
    );
    assert.equal(
      (oracleEvidenceExport?.details as { exportKind?: string }).exportKind,
      "autoresearch.oracle_evidence_export.v1",
    );
    const oracleEvidenceExportDetails = oracleEvidenceExport?.details as { path?: string };
    assert.equal(oracleEvidenceExportDetails.path, oracleExportPath);
    assert.equal(
      JSON.parse(readFileSync(oracleExportPath, "utf8")).packetKind,
      "autoresearch.oracle_evidence.v1",
    );

    const akEvidence = await tool?.execute(
      "call-4b",
      {
        cwd,
        action: "ak_evidence",
        akTaskId: 5678,
      },
      undefined,
      undefined,
      { cwd },
    );
    assert.ok(akEvidence);
    assert.match(akEvidence?.content[0]?.text ?? "", /AK EVIDENCE PACKET/);
    assert.match(akEvidence?.content[0]?.text ?? "", /task id: 5678/);
    assert.match(akEvidence?.content[0]?.text ?? "", /evidence_record/);

    const learning = await tool?.execute(
      "call-4c",
      {
        cwd,
        action: "learning",
      },
      undefined,
      undefined,
      { cwd },
    );
    assert.ok(learning);
    assert.match(learning?.content[0]?.text ?? "", /KNOWLEDGE EXPORT PACKET/);
    assert.match(learning?.content[0]?.text ?? "", /adapter boundary:/);

    const learningExportPath = path.join(cwd, ".autoresearch", "status-learning.json");
    const learningExport = await tool?.execute(
      "call-4c1",
      {
        cwd,
        action: "learning_export",
        outPath: "status-learning.json",
      },
      undefined,
      undefined,
      { cwd },
    );
    assert.ok(learningExport);
    assert.match(learningExport?.content[0]?.text ?? "", /LEARNING EXPORT/);
    assert.match(learningExport?.content[0]?.text ?? "", /autoresearch_learning_kes_adapter/);
    assert.equal(
      (learningExport?.details as { exportKind?: string }).exportKind,
      "autoresearch.learning_export.v1",
    );
    const learningExportDetails = learningExport?.details as { path?: string };
    assert.equal(learningExportDetails.path, learningExportPath);
    assert.equal(
      JSON.parse(readFileSync(learningExportPath, "utf8")).packetKind,
      "autoresearch.learning.v1",
    );

    const candidateResult = await tool?.execute(
      "call-4c2",
      {
        cwd,
        action: "candidate_result",
      },
      undefined,
      undefined,
      { cwd },
    );
    assert.ok(candidateResult);
    assert.match(candidateResult?.content[0]?.text ?? "", /CANDIDATE RESULT PACKET/);
    assert.match(
      candidateResult?.content[0]?.text ?? "",
      /packet kind: autoresearch\.candidate_result\.v1/,
    );

    const candidateResultExportPath = path.join(
      cwd,
      ".autoresearch",
      "status-candidate-result.json",
    );
    const candidateResultExport = await tool?.execute(
      "call-4c3",
      {
        cwd,
        action: "candidate_result_export",
        outPath: "status-candidate-result.json",
      },
      undefined,
      undefined,
      { cwd },
    );
    assert.ok(candidateResultExport);
    assert.match(candidateResultExport?.content[0]?.text ?? "", /CANDIDATE RESULT EXPORT/);
    assert.match(candidateResultExport?.content[0]?.text ?? "", /review_candidate_wave/);
    assert.equal(
      (candidateResultExport?.details as { exportKind?: string }).exportKind,
      "autoresearch.candidate_result_export.v1",
    );
    const candidateResultExportDetails = candidateResultExport?.details as { path?: string };
    assert.equal(candidateResultExportDetails.path, candidateResultExportPath);
    assert.equal(
      JSON.parse(readFileSync(candidateResultExportPath, "utf8")).packetKind,
      "autoresearch.candidate_result.v1",
    );

    const contracts = await tool?.execute(
      "call-4d",
      {
        cwd,
        action: "adapter_contracts",
      },
      undefined,
      undefined,
      { cwd },
    );
    assert.ok(contracts);
    assert.match(contracts?.content[0]?.text ?? "", /ADAPTER CONTRACT CATALOG/);
    assert.match(contracts?.content[0]?.text ?? "", /autoresearch\.closeout\.v1/);

    const resumePlan = await tool?.execute(
      "call-4d2",
      {
        cwd,
        action: "resume_plan",
      },
      undefined,
      undefined,
      { cwd },
    );
    assert.ok(resumePlan);
    assert.match(resumePlan?.content[0]?.text ?? "", /PI-AUTORESEARCH RESUME PLAN/);
    assert.equal(
      (resumePlan?.details as { packetKind?: string }).packetKind,
      "autoresearch.resume_plan.v1",
    );

    const resumeApplyPlan = await tool?.execute(
      "call-4d3",
      {
        cwd,
        action: "resume_apply_plan",
      },
      undefined,
      undefined,
      { cwd },
    );
    assert.ok(resumeApplyPlan);
    assert.match(resumeApplyPlan?.content[0]?.text ?? "", /PI-AUTORESEARCH RESUME APPLY PLAN/);
    assert.match(resumeApplyPlan?.content[0]?.text ?? "", /Plan-only proposal/);
    assert.equal(
      (resumeApplyPlan?.details as { packetKind?: string }).packetKind,
      "autoresearch.resume_apply_plan.v1",
    );
    assert.equal(
      (resumeApplyPlan?.details as { executionAuthorized?: boolean }).executionAuthorized,
      false,
    );

    const validation = await tool?.execute(
      "call-4e",
      {
        cwd,
        action: "validate_packet",
        packet: closeout.details,
      },
      undefined,
      undefined,
      { cwd },
    );
    assert.ok(validation);
    assert.match(validation?.content[0]?.text ?? "", /ADAPTER PACKET VALIDATION/);
    assert.match(validation?.content[0]?.text ?? "", /valid: yes/);

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

test("autoresearch_runtime_status read profile rejects local packet export writes", async () => {
  await withTempDir(async (cwd) => {
    const { tools } = registerHarness({ effectProfile: "read" });
    const tool = tools.get(AUTORESEARCH_STATUS_TOOL_NAME);
    assert.ok(tool);

    await assert.rejects(
      () =>
        Promise.resolve(
          tool.execute(
            "read-oracle-export",
            { cwd, action: "oracle_evidence_export" },
            undefined,
            undefined,
            { cwd },
          ),
        ),
      /read profile/u,
    );
    await assert.rejects(
      () =>
        Promise.resolve(
          tool.execute(
            "read-learning-export",
            { cwd, action: "learning_export" },
            undefined,
            undefined,
            { cwd },
          ),
        ),
      /read profile/u,
    );
    assert.equal(existsSync(path.join(cwd, AUTORESEARCH_ORACLE_EVIDENCE_EXPORT_FILE)), false);
    assert.equal(existsSync(path.join(cwd, AUTORESEARCH_LEARNING_EXPORT_FILE)), false);
  });
});

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
      (picker.applySelection as (input: unknown) => void)({
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

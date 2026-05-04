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
  buildAutoresearchRuntimeStatus,
  buildAutoresearchSegmentCloseout,
  createConfigReceipt,
  createRunReceipt,
  exportAutoresearchDashboardHtml,
  formatAutoresearchAdapterContractCatalog,
  formatAutoresearchAdapterPacketValidationResult,
  formatAutoresearchAkEvidencePacket,
  formatAutoresearchCandidateBindPlan,
  formatAutoresearchCandidateDecisionWorkbench,
  formatAutoresearchCandidateResultPacket,
  formatAutoresearchKnowledgeExportPacket,
  formatAutoresearchSegmentCloseout,
  formatAutoresearchStatusText,
  loadReceiptLog,
  parseMetricLines,
  parseReceiptLine,
  serializeReceipt,
  validateAutoresearchAdapterPacket,
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
    setWidget?(id: string, widget: unknown, options?: unknown): void;
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

    const candidateDecision = buildAutoresearchCandidateDecisionWorkbench({
      cwd,
      action: "status",
    });
    assert.equal(candidateDecision.candidate?.branch, "candidate/closeout");
    assert.equal(candidateDecision.recommendedDecision, "collect_more_samples");
    assert.equal(candidateDecision.empirical.checksStatus, "not run");
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

    const catalog = buildAutoresearchAdapterContractCatalog();
    assert.equal(catalog.packetKind, "autoresearch.adapter_contracts.v1");
    assert.equal(catalog.adapterContractVersion, 1);
    assert.deepEqual(
      catalog.entries.map((entry) => entry.packetKind),
      [
        "autoresearch.closeout.v1",
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
        createdAt: 1,
        benchmarkCommand: "bash autoresearch.sh",
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
  assert.match(editorText, /Next legal surfaces/);
  assert.equal(notifications.length, 1);
  assert.match(notifications[0]?.message ?? "", /Opened read-only pi-autoresearch dashboard/);
});

test("exportAutoresearchDashboardHtml writes a browser dashboard artifact", () =>
  withTempDir((cwd) => {
    const result = exportAutoresearchDashboardHtml({ cwd });
    const html = readFileSync(result.path, "utf8");

    assert.equal(result.cwd, cwd);
    assert.match(result.fileUrl, /^file:/);
    assert.match(html, /pi-autoresearch live dashboard/);
    assert.match(html, /Auto-refreshes every 2s/);
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
    const { commands } = registerHarness();
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
  assert.match(editorText, /autoresearch_candidate_decision/);
  assert.match(editorText, /action: "plan_rewind"/);
  assert.match(editorText, /candidatePolicy/);
  assert.equal(notifications.length, 1);
  assert.match(
    notifications[0]?.message ?? "",
    /Prepared autoresearch_candidate_decision plan_rewind/,
  );
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
    assert.match(output, /Next legal surfaces/);
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
    assert.match(result.content[0]?.text ?? "", /DSPx program-gen handoff/);
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
    assert.ok(
      updates.some((update) => /PI-AUTORESEARCH LIVE UPDATE/.test(update.content?.[0]?.text ?? "")),
    );
    assert.ok(
      updates.some((update) => /PI-AUTORESEARCH DASHBOARD/.test(update.details?.dashboard ?? "")),
    );
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

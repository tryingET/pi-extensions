import assert from "node:assert/strict";
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
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
  AUTORESEARCH_CANDIDATE_INVENTORY_CLEANUP_CONFIRMATION,
  AUTORESEARCH_CONTROL_TOOL_NAME,
  AUTORESEARCH_LEARNING_EXPORT_FILE,
  AUTORESEARCH_ORACLE_EVIDENCE_EXPORT_FILE,
  AUTORESEARCH_STATUS_TOOL_NAME,
  appendReceipt,
  buildAutoresearchRuntimeStatus,
  createConfigReceipt,
  createRunReceipt,
  discoverAutoresearchMatrixCampaignArtifacts,
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

test("autoresearch_runtime_status plans and applies candidate inventory cleanup", async () => {
  await withTempDir(async (cwd) => {
    const { tools } = registerHarness();
    const tool = tools.get(AUTORESEARCH_STATUS_TOOL_NAME);
    assert.ok(tool);

    appendReceipt(
      cwd,
      createConfigReceipt({
        name: "cleanup-candidates",
        metricName: "total_ms",
        metricUnit: "ms",
        direction: "lower",
        createdAt: 1,
      }),
    );
    appendReceipt(
      cwd,
      createRunReceipt({
        status: "candidate",
        metric: 90,
        description: "stale candidate",
        timestamp: 2,
      }),
    );
    const matrixCellDir = path.join(cwd, ".autoresearch", "matrix-campaign", "cell-01-01");
    mkdirSync(matrixCellDir, { recursive: true });
    writeFileSync(
      path.join(matrixCellDir, "candidate-01.candidate-result.json"),
      JSON.stringify({ packetKind: "autoresearch.candidate_result.v1" }),
    );
    writeFileSync(path.join(cwd, ".autoresearch", "autoresearch-dashboard.html"), "<html />");

    const plan = await tool?.execute(
      "cleanup-plan",
      { cwd, action: "candidate_inventory_cleanup_plan", archiveLabel: "cleanup-test" },
      undefined,
      undefined,
      { cwd },
    );
    assert.match(plan?.content[0]?.text ?? "", /CANDIDATE INVENTORY CLEANUP/);
    assert.match(plan?.content[0]?.text ?? "", /Would archive paths/);
    const planDetails = plan?.details as {
      before?: { candidateRunCount?: number };
      archivedPaths?: string[];
      skippedMissingPaths?: string[];
    };
    assert.equal(planDetails.before?.candidateRunCount, 1);
    assert.deepEqual(planDetails.archivedPaths?.sort(), [
      ".autoresearch/autoresearch-dashboard.html",
      ".autoresearch/matrix-campaign",
      "autoresearch.jsonl",
    ]);
    assert.ok(planDetails.skippedMissingPaths?.includes(".autoresearch/campaigns"));

    await assert.rejects(
      () =>
        tool?.execute(
          "cleanup-apply-blocked",
          { cwd, action: "candidate_inventory_cleanup_apply", archiveLabel: "cleanup-test" },
          undefined,
          undefined,
          { cwd },
        ),
      /requires operatorConfirmation/,
    );
    await assert.rejects(
      () =>
        tool?.execute(
          "cleanup-plan-unsafe-label",
          { cwd, action: "candidate_inventory_cleanup_plan", archiveLabel: "../escape" },
          undefined,
          undefined,
          { cwd },
        ),
      /archiveLabel must be a safe local slug/,
    );

    const applied = await tool?.execute(
      "cleanup-apply",
      {
        cwd,
        action: "candidate_inventory_cleanup_apply",
        archiveLabel: "cleanup-test",
        operatorConfirmation: AUTORESEARCH_CANDIDATE_INVENTORY_CLEANUP_CONFIRMATION,
      },
      undefined,
      undefined,
      { cwd },
    );
    const details = applied?.details as {
      mode?: string;
      before?: { candidateRunCount?: number; openCandidateReviewCellCount?: number };
      after?: { candidateRunCount?: number; openCandidateReviewCellCount?: number };
    };
    assert.equal(details.mode, "applied");
    assert.equal(details.before?.candidateRunCount, 1);
    assert.equal(details.before?.openCandidateReviewCellCount, 1);
    assert.equal(details.after?.candidateRunCount, 0);
    assert.equal(details.after?.openCandidateReviewCellCount, 0);
    assert.equal(existsSync(path.join(cwd, "autoresearch.jsonl")), false);
    assert.equal(
      existsSync(
        path.join(cwd, ".autoresearch", "closed-candidates", "cleanup-test", "autoresearch.jsonl"),
      ),
      true,
    );
    assert.equal(
      discoverAutoresearchMatrixCampaignArtifacts(cwd).openCandidateReview.openCellCount,
      0,
    );
    await assert.rejects(
      () =>
        tool?.execute(
          "cleanup-apply-collision",
          {
            cwd,
            action: "candidate_inventory_cleanup_apply",
            archiveLabel: "cleanup-test",
            operatorConfirmation: AUTORESEARCH_CANDIDATE_INVENTORY_CLEANUP_CONFIRMATION,
          },
          undefined,
          undefined,
          { cwd },
        ),
      /archive already exists/,
    );
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
    await assert.rejects(
      () =>
        Promise.resolve(
          tool.execute(
            "read-cleanup-apply",
            {
              cwd,
              action: "candidate_inventory_cleanup_apply",
              operatorConfirmation: AUTORESEARCH_CANDIDATE_INVENTORY_CLEANUP_CONFIRMATION,
            },
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

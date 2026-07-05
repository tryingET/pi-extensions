import type { ExtensionContext } from "@earendil-works/pi-coding-agent";
import {
  AUTORESEARCH_CAMPAIGN_START_TOOL_NAME,
  buildAutoresearchRuntimeStatus,
  executeAutoresearchCampaignStart,
  formatAutoresearchCampaignStartResult,
  formatAutoresearchDashboard,
} from "../../src/core/runtime.ts";
import { openAutoresearchCandidateDecisionReview } from "./candidateDecisionUi.ts";
import {
  buildAutoresearchCampaignStartEditorCall,
  buildAutoresearchLearningExportEditorCall,
  buildAutoresearchResumeApplyEditorCall,
  extractAutoresearchResumeEditorCall,
  formatAutoresearchCommandNotification,
  parseAutoresearchLearningHandoffCommand,
  parseAutoresearchResumeCommand,
  parseAutoresearchRunObjectiveCommand,
} from "./commandText.ts";
import {
  buildAutoresearchCandidateBindEditorCall,
  buildAutoresearchCandidateDecisionEditorCall,
  buildAutoresearchCandidateIntegrationEditorText,
  buildAutoresearchCandidateMeasureEditorCall,
  buildAutoresearchCandidateNextEditorCall,
  buildAutoresearchOpenCandidateReviewEditorText,
  parseAutoresearchCandidateBindCommand,
  parseAutoresearchCandidateDecisionCommand,
  parseAutoresearchCandidateDecisionReviewCommand,
  parseAutoresearchCandidateIntegrationCommand,
  parseAutoresearchCandidateMeasureCommand,
  parseAutoresearchCandidateNextCommand,
  parseAutoresearchOpenCandidateReviewCommand,
} from "./commandTextCandidates.ts";
import {
  clearAutoresearchWidget,
  exportAutoresearchDashboardToBrowser,
  openAutoresearchDashboardOverlay,
  registerAutoresearchWidget,
  stopAutoresearchDashboardBrowserExport,
} from "./dashboardUi.ts";
import type { AutoresearchWidgetContext } from "./extensionUiTypes.ts";
import {
  type AutoresearchEffectProfileOptions,
  assertReadProfileRejectsTool,
} from "./readProfile.ts";

export async function openAutoresearchShell(
  args: string,
  ctx: ExtensionContext,
  dashboardExportIntervals: Map<string, ReturnType<typeof setInterval>>,
  options: AutoresearchEffectProfileOptions,
): Promise<void> {
  if (!ctx.hasUI) return;

  const normalizedArgs = args.trim();
  const status = buildAutoresearchRuntimeStatus(ctx.cwd);

  if (normalizedArgs === "widget off") {
    clearAutoresearchWidget(ctx as AutoresearchWidgetContext);
    ctx.ui.notify("Disabled the pi-autoresearch status widget for this session.", "info");
    return;
  }

  if (normalizedArgs === "widget" || normalizedArgs === "widget on") {
    registerAutoresearchWidget(ctx as AutoresearchWidgetContext);
    ctx.ui.notify("Enabled the pi-autoresearch status widget for this session.", "info");
    return;
  }

  if (normalizedArgs === "export" || normalizedArgs === "browser") {
    await exportAutoresearchDashboardToBrowser(
      ctx as AutoresearchWidgetContext,
      dashboardExportIntervals,
    );
    return;
  }

  if (normalizedArgs === "export off" || normalizedArgs === "browser off") {
    stopAutoresearchDashboardBrowserExport(ctx.cwd, dashboardExportIntervals);
    ctx.ui.notify("Stopped pi-autoresearch browser dashboard refresh for this session.", "info");
    return;
  }

  if (normalizedArgs === "overlay" || normalizedArgs === "fullscreen") {
    await openAutoresearchDashboardOverlay(ctx as AutoresearchWidgetContext);
    return;
  }

  if (normalizedArgs === "dashboard") {
    await ctx.ui.editor("Pi-autoresearch dashboard", formatAutoresearchDashboard(status));
    ctx.ui.notify(
      "Opened read-only pi-autoresearch dashboard. Use the listed exact calls to act.",
      "info",
    );
    return;
  }

  if (parseAutoresearchResumeCommand(normalizedArgs)) {
    await openAutoresearchResumeReview(ctx);
    return;
  }

  if (parseAutoresearchLearningHandoffCommand(normalizedArgs)) {
    await ctx.ui.editor(
      "Export autoresearch learning packet",
      buildAutoresearchLearningExportEditorCall(ctx.cwd),
    );
    ctx.ui.notify(
      "Prepared autoresearch learning export call for review. Submit it to write the local packet, then use the returned KES adapter plan call.",
      "info",
    );
    return;
  }

  if (parseAutoresearchOpenCandidateReviewCommand(normalizedArgs)) {
    await ctx.ui.editor(
      "Open autoresearch candidate review posture",
      buildAutoresearchOpenCandidateReviewEditorText(ctx.cwd),
    );
    ctx.ui.notify(
      "Opened read-only open candidate review posture. Use the exact owner-review call only after packet review.",
      "info",
    );
    return;
  }

  if (parseAutoresearchCandidateIntegrationCommand(normalizedArgs)) {
    await ctx.ui.editor(
      "Integrate useful autoresearch candidates",
      buildAutoresearchCandidateIntegrationEditorText(ctx.cwd),
    );
    ctx.ui.notify(
      "Prepared read-only candidate integration handoff. Review decides usefulness; finalizer apply still requires the exact owner token.",
      "info",
    );
    return;
  }

  const runObjective = parseAutoresearchRunObjectiveCommand(normalizedArgs);
  if (runObjective) {
    await executeAutoresearchFirstRun(runObjective, ctx, options);
    return;
  }

  if (parseAutoresearchCandidateNextCommand(normalizedArgs)) {
    await ctx.ui.editor(
      "Next autoresearch candidate action",
      buildAutoresearchCandidateNextEditorCall(ctx.cwd),
    );
    ctx.ui.notify(
      "Prepared the next recommended autoresearch candidate call for review. No worktree or durable action was applied.",
      "info",
    );
    return;
  }

  const candidateMeasure = parseAutoresearchCandidateMeasureCommand(normalizedArgs, ctx.cwd);
  if (candidateMeasure) {
    await ctx.ui.editor(
      "Measure autoresearch candidate",
      buildAutoresearchCandidateMeasureEditorCall(ctx.cwd, candidateMeasure.candidateWorktree),
    );
    ctx.ui.notify(
      "Prepared candidate measurement or intake-review call. Review readiness, benchmark/check settings, and metadata before execution.",
      "info",
    );
    return;
  }

  const candidateBind = parseAutoresearchCandidateBindCommand(normalizedArgs, ctx.cwd);
  if (candidateBind) {
    await ctx.ui.editor(
      "Bind autoresearch candidate",
      buildAutoresearchCandidateBindEditorCall(ctx.cwd, candidateBind.candidateWorktree),
    );
    ctx.ui.notify(
      "Prepared autoresearch_candidate_bind plan. Review the candidate path/base ref, then send it to inspect and prepare measurement.",
      "info",
    );
    return;
  }

  const candidateDecisionReview = parseAutoresearchCandidateDecisionReviewCommand(normalizedArgs);
  if (candidateDecisionReview) {
    await openAutoresearchCandidateDecisionReview(
      ctx as AutoresearchWidgetContext,
      candidateDecisionReview,
    );
    return;
  }

  const candidateDecisionAction = parseAutoresearchCandidateDecisionCommand(normalizedArgs);
  if (candidateDecisionAction) {
    await ctx.ui.editor(
      "Plan autoresearch candidate decision",
      buildAutoresearchCandidateDecisionEditorCall(ctx.cwd, candidateDecisionAction),
    );
    ctx.ui.notify(
      `Prepared autoresearch_candidate_decision ${candidateDecisionAction} call. Review the plan before any external worktree action.`,
      "info",
    );
    return;
  }

  if (normalizedArgs.length > 0 && normalizedArgs !== "help" && normalizedArgs !== "status") {
    await executeAutoresearchPlanOnlyCampaignStart(normalizedArgs, ctx);
    return;
  }

  ctx.ui.notify(formatAutoresearchCommandNotification(status), "info");
}

async function executeAutoresearchFirstRun(
  objective: string,
  ctx: ExtensionContext,
  options: AutoresearchEffectProfileOptions,
): Promise<void> {
  let result: Awaited<ReturnType<typeof executeAutoresearchCampaignStart>>;
  try {
    assertReadProfileRejectsTool(options, AUTORESEARCH_CAMPAIGN_START_TOOL_NAME);
    ctx.ui.notify(
      "Starting bounded foreground autoresearch run. This stays local and stops on budget/gates.",
      "info",
    );
    result = await executeAutoresearchCampaignStart({
      cwd: ctx.cwd,
      objective,
      setupMode: "autoplan",
      runMode: "bounded_loop",
      maxIterations: 3,
      maxWallClockMinutes: 30,
      peerMode: "plan",
      model: ctx.model?.id,
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    const planCall = buildAutoresearchCampaignStartEditorCall(ctx.cwd, objective);
    await ctx.ui.editor(
      "Autoresearch campaign blocked",
      [
        "# PI-AUTORESEARCH CAMPAIGN BLOCKED",
        "",
        `- objective: ${objective}`,
        `- reason: ${message}`,
        "",
        "The first-entrypoint run did not execute. Review the fallback exact call below, usually by adding an explicit benchmarkCommand or running setup first.",
        "",
        "```ts",
        planCall,
        "```",
      ].join("\n"),
    );
    ctx.ui.notify(
      "Autoresearch run blocked before execution; opened fallback review call.",
      "warning",
    );
    return;
  }

  await ctx.ui.editor(
    "Autoresearch campaign result",
    formatAutoresearchCampaignStartResult(result),
  );
  ctx.ui.notify(
    "Completed bounded foreground autoresearch run. Review the final dashboard and next exact call.",
    "info",
  );
}

async function executeAutoresearchPlanOnlyCampaignStart(
  objective: string,
  ctx: ExtensionContext,
): Promise<void> {
  ctx.ui.notify("Resolving /autoresearch objective as a plan-only campaign start...", "info");

  let result: Awaited<ReturnType<typeof executeAutoresearchCampaignStart>>;
  try {
    result = await executeAutoresearchCampaignStart({
      cwd: ctx.cwd,
      objective,
      setupMode: "autoplan",
      runMode: "plan_only",
      maxIterations: 3,
      peerMode: "plan",
      candidatePolicy: {
        mode: "worktree",
        keep: "preserve_branch",
        discard: "suggest_cleanup",
        rewind: "reset_worktree_to_base",
      },
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    await ctx.ui.editor(
      "Autoresearch campaign start failed",
      [
        "# PI-AUTORESEARCH CAMPAIGN START FAILED",
        "",
        `- objective: ${objective}`,
        `- reason: ${message}`,
        "",
        "The /autoresearch slash command was handled by pi-autoresearch, but the plan-only campaign-start front door failed before producing a result.",
      ].join("\n"),
    );
    ctx.ui.notify(
      "/autoresearch plan-only campaign start failed; opened failure details.",
      "error",
    );
    return;
  }

  await ctx.ui.editor(
    "Autoresearch campaign start result",
    [
      "# /autoresearch PLAN-ONLY RESULT",
      "",
      "The /autoresearch command has already executed the plan-only campaign-start front door. Pressing Enter in this review closes it; it does not submit another message or start a hidden loop.",
      "",
      formatAutoresearchCampaignStartResult(result),
    ].join("\n"),
  );
  ctx.ui.notify(
    "Closed /autoresearch plan-only result review. No further action was submitted.",
    "info",
  );
}

async function openAutoresearchResumeReview(ctx: ExtensionContext): Promise<void> {
  const reviewText = buildAutoresearchResumeApplyEditorCall(ctx.cwd);
  const editedText = await ctx.ui.editor("Review foreground autoresearch resume", reviewText);
  if (typeof editedText !== "string") {
    ctx.ui.notify("Canceled foreground resume review. No resume call was submitted.", "warning");
    return;
  }

  const editorCall = extractAutoresearchResumeEditorCall(editedText);
  if (!editorCall) {
    ctx.ui.notify(
      "Canceled foreground resume review: could not find an autoresearch resume call in the edited text.",
      "warning",
    );
    return;
  }

  ctx.ui.setEditorText(editorCall);
  ctx.ui.notify(
    "Accepted foreground resume call into the message editor. Replace any remaining <explicit> budgets, then press Enter to submit.",
    "info",
  );
}

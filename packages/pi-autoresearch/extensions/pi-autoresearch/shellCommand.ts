// ---
// summary: "Routes /autoresearch subcommands across dashboards, candidate workflows, learning, resume review, and bounded campaign starts."
// read_when:
//   - "Changing slash-command behavior, UI notifications, candidate handoffs, or plan-only and foreground-run fallbacks."
// ---
import type { ExtensionContext } from "@earendil-works/pi-coding-agent";
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
import { AUTORESEARCH_CAMPAIGN_START_TOOL_NAME } from "./eagerContract.ts";
import type { AutoresearchWidgetContext } from "./extensionUiTypes.ts";
import type { AutoresearchLazyModules } from "./lazyModules.ts";
import {
  type AutoresearchEffectProfileOptions,
  assertReadProfileRejectsTool,
} from "./readProfile.ts";
import {
  type AutoresearchSessionEffects,
  notifyAutoresearch,
  openAutoresearchEditor,
} from "./sessionEffects.ts";

export async function openAutoresearchShell(
  args: string,
  ctx: ExtensionContext,
  dashboardExportIntervals: Map<string, ReturnType<typeof setInterval>>,
  options: AutoresearchEffectProfileOptions,
  modules: AutoresearchLazyModules,
  effects: AutoresearchSessionEffects,
): Promise<void> {
  if (!ctx.hasUI || !effects.isActive()) return;

  const normalizedArgs = args.trim();

  if (normalizedArgs === "widget off") {
    clearAutoresearchWidget(ctx as AutoresearchWidgetContext, effects);
    notifyAutoresearch(
      ctx,
      effects,
      "Disabled the pi-autoresearch status widget for this session.",
      "info",
    );
    return;
  }

  if (normalizedArgs === "widget" || normalizedArgs === "widget on") {
    await registerAutoresearchWidget(ctx as AutoresearchWidgetContext, modules, effects);
    if (!effects.isActive()) return;
    notifyAutoresearch(
      ctx,
      effects,
      "Enabled the pi-autoresearch status widget for this session.",
      "info",
    );
    return;
  }

  if (normalizedArgs === "export" || normalizedArgs === "browser") {
    await exportAutoresearchDashboardToBrowser(
      ctx as AutoresearchWidgetContext,
      dashboardExportIntervals,
      modules,
      effects,
    );
    return;
  }

  if (normalizedArgs === "export off" || normalizedArgs === "browser off") {
    stopAutoresearchDashboardBrowserExport(ctx.cwd, dashboardExportIntervals);
    notifyAutoresearch(
      ctx,
      effects,
      "Stopped pi-autoresearch browser dashboard refresh for this session.",
      "info",
    );
    return;
  }

  if (normalizedArgs === "overlay" || normalizedArgs === "fullscreen") {
    await openAutoresearchDashboardOverlay(ctx as AutoresearchWidgetContext, modules, effects);
    return;
  }

  if (normalizedArgs === "dashboard") {
    const runtimeModule = await modules.runtime();
    if (!effects.isActive()) return;
    const status = runtimeModule.buildAutoresearchRuntimeStatus(ctx.cwd);
    await openAutoresearchEditor(
      ctx,
      effects,
      "Pi-autoresearch dashboard",
      runtimeModule.formatAutoresearchDashboard(status),
    );
    notifyAutoresearch(
      ctx,
      effects,
      "Opened read-only pi-autoresearch dashboard. Use the listed exact calls to act.",
      "info",
    );
    return;
  }

  if (parseAutoresearchResumeCommand(normalizedArgs)) {
    await openAutoresearchResumeReview(ctx, modules, effects);
    return;
  }

  if (parseAutoresearchLearningHandoffCommand(normalizedArgs)) {
    await openAutoresearchEditor(
      ctx,
      effects,
      "Export autoresearch learning packet",
      buildAutoresearchLearningExportEditorCall(ctx.cwd),
    );
    notifyAutoresearch(
      ctx,
      effects,
      "Prepared autoresearch learning export call for review. Submit it to write the local packet, then use the returned KES adapter plan call.",
      "info",
    );
    return;
  }

  if (parseAutoresearchOpenCandidateReviewCommand(normalizedArgs)) {
    const runtimeModule = await modules.runtime();
    if (!effects.isActive()) return;
    await openAutoresearchEditor(
      ctx,
      effects,
      "Open autoresearch candidate review posture",
      buildAutoresearchOpenCandidateReviewEditorText(ctx.cwd, runtimeModule),
    );
    notifyAutoresearch(
      ctx,
      effects,
      "Opened read-only open candidate review posture. Use the exact owner-review call only after packet review.",
      "info",
    );
    return;
  }

  if (parseAutoresearchCandidateIntegrationCommand(normalizedArgs)) {
    const runtimeModule = await modules.runtime();
    if (!effects.isActive()) return;
    await openAutoresearchEditor(
      ctx,
      effects,
      "Integrate useful autoresearch candidates",
      buildAutoresearchCandidateIntegrationEditorText(ctx.cwd, runtimeModule),
    );
    notifyAutoresearch(
      ctx,
      effects,
      "Prepared read-only candidate integration handoff. Review decides usefulness; finalizer apply still requires the exact owner token.",
      "info",
    );
    return;
  }

  const runObjective = parseAutoresearchRunObjectiveCommand(normalizedArgs);
  if (runObjective) {
    await executeAutoresearchFirstRun(runObjective, ctx, options, modules, effects);
    return;
  }

  if (parseAutoresearchCandidateNextCommand(normalizedArgs)) {
    const runtimeModule = await modules.runtime();
    if (!effects.isActive()) return;
    await openAutoresearchEditor(
      ctx,
      effects,
      "Next autoresearch candidate action",
      buildAutoresearchCandidateNextEditorCall(ctx.cwd, runtimeModule),
    );
    notifyAutoresearch(
      ctx,
      effects,
      "Prepared the next recommended autoresearch candidate call for review. No worktree or durable action was applied.",
      "info",
    );
    return;
  }

  const candidateMeasure = parseAutoresearchCandidateMeasureCommand(normalizedArgs, ctx.cwd);
  if (candidateMeasure) {
    const runtimeModule = await modules.runtime();
    if (!effects.isActive()) return;
    await openAutoresearchEditor(
      ctx,
      effects,
      "Measure autoresearch candidate",
      buildAutoresearchCandidateMeasureEditorCall(
        ctx.cwd,
        candidateMeasure.candidateWorktree,
        runtimeModule,
      ),
    );
    notifyAutoresearch(
      ctx,
      effects,
      "Prepared candidate measurement or intake-review call. Review readiness, benchmark/check settings, and metadata before execution.",
      "info",
    );
    return;
  }

  const candidateBind = parseAutoresearchCandidateBindCommand(normalizedArgs, ctx.cwd);
  if (candidateBind) {
    await openAutoresearchEditor(
      ctx,
      effects,
      "Bind autoresearch candidate",
      buildAutoresearchCandidateBindEditorCall(ctx.cwd, candidateBind.candidateWorktree),
    );
    notifyAutoresearch(
      ctx,
      effects,
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
      modules,
      effects,
    );
    return;
  }

  const candidateDecisionAction = parseAutoresearchCandidateDecisionCommand(normalizedArgs);
  if (candidateDecisionAction) {
    const runtimeModule = await modules.runtime();
    if (!effects.isActive()) return;
    await openAutoresearchEditor(
      ctx,
      effects,
      "Plan autoresearch candidate decision",
      buildAutoresearchCandidateDecisionEditorCall(ctx.cwd, candidateDecisionAction, runtimeModule),
    );
    notifyAutoresearch(
      ctx,
      effects,
      `Prepared autoresearch_candidate_decision ${candidateDecisionAction} call. Review the plan before any external worktree action.`,
      "info",
    );
    return;
  }

  if (normalizedArgs.length > 0 && normalizedArgs !== "help" && normalizedArgs !== "status") {
    await executeAutoresearchPlanOnlyCampaignStart(normalizedArgs, ctx, modules, effects);
    return;
  }

  const runtimeModule = await modules.runtime();
  if (!effects.isActive()) return;
  const status = runtimeModule.buildAutoresearchRuntimeStatus(ctx.cwd);
  notifyAutoresearch(ctx, effects, formatAutoresearchCommandNotification(status), "info");
}

async function executeAutoresearchFirstRun(
  objective: string,
  ctx: ExtensionContext,
  options: AutoresearchEffectProfileOptions,
  modules: AutoresearchLazyModules,
  effects: AutoresearchSessionEffects,
): Promise<void> {
  try {
    assertReadProfileRejectsTool(options, AUTORESEARCH_CAMPAIGN_START_TOOL_NAME);
    const { executeAutoresearchCampaignStart, formatAutoresearchCampaignStartResult } =
      await modules.runtime();
    if (!effects.isActive()) return;
    notifyAutoresearch(
      ctx,
      effects,
      "Starting bounded foreground autoresearch run. This stays local and stops on budget/gates.",
      "info",
    );
    const result = await executeAutoresearchCampaignStart({
      cwd: ctx.cwd,
      objective,
      setupMode: "autoplan",
      runMode: "bounded_loop",
      maxIterations: 3,
      maxWallClockMinutes: 30,
      peerMode: "plan",
      model: ctx.model?.id,
      signal: effects.signal,
    });
    if (!effects.isActive()) return;
    await openAutoresearchEditor(
      ctx,
      effects,
      "Autoresearch campaign result",
      formatAutoresearchCampaignStartResult(result),
    );
    if (!effects.isActive()) return;
    notifyAutoresearch(
      ctx,
      effects,
      "Completed bounded foreground autoresearch run. Review the final dashboard and next exact call.",
      "info",
    );
  } catch (error) {
    if (!effects.isActive()) return;
    const message = error instanceof Error ? error.message : String(error);
    const planCall = buildAutoresearchCampaignStartEditorCall(ctx.cwd, objective);
    await openAutoresearchEditor(
      ctx,
      effects,
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
    notifyAutoresearch(
      ctx,
      effects,
      "Autoresearch run blocked before execution; opened fallback review call.",
      "warning",
    );
  }
}

async function executeAutoresearchPlanOnlyCampaignStart(
  objective: string,
  ctx: ExtensionContext,
  modules: AutoresearchLazyModules,
  effects: AutoresearchSessionEffects,
): Promise<void> {
  if (!effects.isActive()) return;
  notifyAutoresearch(
    ctx,
    effects,
    "Resolving /autoresearch objective as a plan-only campaign start...",
    "info",
  );

  try {
    const { executeAutoresearchCampaignStart, formatAutoresearchCampaignStartResult } =
      await modules.runtime();
    if (!effects.isActive()) return;
    const result = await executeAutoresearchCampaignStart({
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
      signal: effects.signal,
    });
    if (!effects.isActive()) return;
    await openAutoresearchEditor(
      ctx,
      effects,
      "Autoresearch campaign start result",
      [
        "# /autoresearch PLAN-ONLY RESULT",
        "",
        "The /autoresearch command has already executed the plan-only campaign-start front door. Pressing Enter in this review closes it; it does not submit another message or start a hidden loop.",
        "",
        formatAutoresearchCampaignStartResult(result),
      ].join("\n"),
    );
    if (!effects.isActive()) return;
    notifyAutoresearch(
      ctx,
      effects,
      "Closed /autoresearch plan-only result review. No further action was submitted.",
      "info",
    );
  } catch (error) {
    if (!effects.isActive()) return;
    const message = error instanceof Error ? error.message : String(error);
    await openAutoresearchEditor(
      ctx,
      effects,
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
    notifyAutoresearch(
      ctx,
      effects,
      "/autoresearch plan-only campaign start failed; opened failure details.",
      "error",
    );
  }
}

async function openAutoresearchResumeReview(
  ctx: ExtensionContext,
  modules: AutoresearchLazyModules,
  effects: AutoresearchSessionEffects,
): Promise<void> {
  const runtimeModule = await modules.runtime();
  if (!effects.isActive()) return;
  const reviewText = buildAutoresearchResumeApplyEditorCall(ctx.cwd, runtimeModule);
  const editor = await openAutoresearchEditor(
    ctx,
    effects,
    "Review foreground autoresearch resume",
    reviewText,
  );
  if (!editor.committed) return;
  const editedText = editor.value;
  if (typeof editedText !== "string") {
    notifyAutoresearch(
      ctx,
      effects,
      "Canceled foreground resume review. No resume call was submitted.",
      "warning",
    );
    return;
  }

  const editorCall = extractAutoresearchResumeEditorCall(editedText);
  if (!editorCall) {
    notifyAutoresearch(
      ctx,
      effects,
      "Canceled foreground resume review: could not find an autoresearch resume call in the edited text.",
      "warning",
    );
    return;
  }

  effects.commit(() => ctx.ui.setEditorText(editorCall));
  notifyAutoresearch(
    ctx,
    effects,
    "Accepted foreground resume call into the message editor. Replace any remaining <explicit> budgets, then press Enter to submit.",
    "info",
  );
}

// ---
// summary: "Parses autoresearch dollar commands and formats campaign-start, resume, learning, and status editor calls."
// read_when:
//   - "Changing $$ autoresearch routing, resume or learning aliases, generated tool calls, or command notifications."
// ---
import type { buildAutoresearchRuntimeStatus } from "../../src/core/runtime.ts";
import {
  AUTORESEARCH_RESUME_APPLY_TOOL_NAME,
  AUTORESEARCH_STATUS_TOOL_NAME,
  buildAutoresearchResumeApplyPlan,
  formatAutoresearchResumeApplyPlan,
} from "../../src/core/runtime.ts";
import {
  buildAutoresearchCandidateBindEditorCall,
  buildAutoresearchCandidateBindOrMeasureEditorCall,
  buildAutoresearchCandidateDecisionEditorCall,
  buildAutoresearchCandidateIntegrationEditorText,
  buildAutoresearchCandidateNextEditorCall,
  buildAutoresearchOpenCandidateReviewEditorText,
  parseAutoresearchCandidateBindCommand,
  parseAutoresearchCandidateDecisionCommand,
  parseAutoresearchCandidateIntegrationCommand,
  parseAutoresearchCandidateMeasureCommand,
  parseAutoresearchCandidateNextCommand,
  parseAutoresearchOpenCandidateReviewCommand,
} from "./commandTextCandidates.ts";

export type AutoresearchTriggerRunMode = "plan_only" | "baseline" | "bounded_loop";

export type AutoresearchTriggerSetupMode = "autoplan" | "prompt_vault_setup";

export type AutoresearchCandidateDecisionTriggerAction =
  | "status"
  | "plan_keep"
  | "plan_discard"
  | "plan_rewind";

export type AutoresearchCandidateDecisionReviewParsedInput = {
  directAction: AutoresearchCandidateDecisionTriggerAction | null;
};

export type AutoresearchCandidateBindTriggerMode = "bind" | "measure";

export function buildAutoresearchCampaignStartEditorCall(cwd: string, objective: string): string {
  return buildAutoresearchCampaignStartToolCall({
    cwd,
    objective,
    setupMode: "autoplan",
    runMode: "plan_only",
    maxIterations: 3,
  });
}

export function transformAutoresearchDollarInput(text: string, cwd: string): string | null {
  const match = text.trim().match(/^\$\$\s*(?:autoresearch|ar)(?:\s+([^\n]*))?$/);
  if (!match) return null;
  const raw = String(match[1] ?? "").trim();
  if (!raw) return "$$ autoresearch <objective>";
  if (parseAutoresearchResumeCommand(raw)) {
    return buildAutoresearchResumeApplyEditorCall(cwd);
  }
  if (parseAutoresearchLearningHandoffCommand(raw)) {
    return buildAutoresearchLearningExportEditorCall(cwd);
  }
  if (parseAutoresearchOpenCandidateReviewCommand(raw)) {
    return buildAutoresearchOpenCandidateReviewEditorText(cwd);
  }
  if (parseAutoresearchCandidateIntegrationCommand(raw)) {
    return buildAutoresearchCandidateIntegrationEditorText(cwd);
  }
  if (parseAutoresearchCandidateNextCommand(raw)) {
    return buildAutoresearchCandidateNextEditorCall(cwd);
  }
  const candidateMeasure = parseAutoresearchCandidateMeasureCommand(raw, cwd);
  if (candidateMeasure) {
    return buildAutoresearchCandidateBindOrMeasureEditorCall(
      cwd,
      candidateMeasure.candidateWorktree,
      "measure",
    );
  }
  const candidateBind = parseAutoresearchCandidateBindCommand(raw, cwd);
  if (candidateBind) {
    return buildAutoresearchCandidateBindEditorCall(cwd, candidateBind.candidateWorktree);
  }
  const candidateDecisionAction = parseAutoresearchCandidateDecisionCommand(raw);
  if (candidateDecisionAction) {
    return buildAutoresearchCandidateDecisionEditorCall(cwd, candidateDecisionAction);
  }
  return buildAutoresearchCampaignStartEditorCall(cwd, raw);
}

export function parseAutoresearchResumeCommand(value: string): boolean {
  switch (value.trim().toLowerCase()) {
    case "resume":
    case "resume apply":
    case "resume_apply":
    case "foreground resume":
    case "apply resume":
      return true;
    default:
      return false;
  }
}

export function parseAutoresearchLearningHandoffCommand(value: string): boolean {
  switch (value.trim().toLowerCase()) {
    case "learning":
    case "learning export":
    case "export learning":
    case "learning handoff":
    case "handoff learning":
    case "kes handoff":
      return true;
    default:
      return false;
  }
}

export function buildAutoresearchLearningExportEditorCall(cwd: string): string {
  return `${AUTORESEARCH_STATUS_TOOL_NAME}({ cwd: ${JSON.stringify(cwd)}, action: "learning_export" })`;
}

export function parseAutoresearchRunObjectiveCommand(value: string): string | null {
  const match = /^(?:run|loop|go|start)\s+(.+)$/iu.exec(value.trim());
  const objective = match?.[1]?.trim() ?? "";
  return objective.length > 0 ? objective : null;
}

export function extractAutoresearchResumeEditorCall(text: string): string | null {
  const trimmed = text.trim();
  if (isAutoresearchResumeEditorCall(trimmed)) return trimmed;

  const exactCallSection = trimmed.split("## Exact foreground call to review", 2)[1] ?? trimmed;
  const fencedCall = /```(?:ts|typescript)?\s*\n([\s\S]*?)\n```/u
    .exec(exactCallSection)?.[1]
    ?.trim();
  if (fencedCall && isAutoresearchResumeEditorCall(fencedCall)) return fencedCall;

  return null;
}

export function isAutoresearchResumeEditorCall(value: string): boolean {
  const trimmed = value.trim();
  return (
    trimmed.startsWith(`${AUTORESEARCH_RESUME_APPLY_TOOL_NAME}(`) ||
    (trimmed.startsWith(`${AUTORESEARCH_STATUS_TOOL_NAME}(`) &&
      trimmed.includes('action: "resume_apply_plan"'))
  );
}

export function buildAutoresearchResumeApplyEditorCall(cwd: string): string {
  const plan = buildAutoresearchResumeApplyPlan(cwd);
  const exactCall =
    plan.futureForegroundCall ??
    `${AUTORESEARCH_STATUS_TOOL_NAME}({ cwd: ${JSON.stringify(cwd)}, action: "resume_apply_plan" })`;
  return [
    "# PI-AUTORESEARCH RESUME APPLY REVIEW",
    "",
    "Review this foreground continuation before execution. This editor output does not run benchmarks, resume a loop, spawn peers, mutate candidates, or write external evidence.",
    "",
    formatAutoresearchResumeApplyPlan(plan),
    "",
    "## Exact foreground call to review",
    "```ts",
    exactCall,
    "```",
    "",
    'Replace `<explicit>` budgets before execution. Keep `operatorConfirmation: "RUN FOREGROUND RESUME"` only when you intentionally approve the foreground call.',
  ].join("\n");
}

export function buildAutoresearchCampaignStartToolCall(input: {
  cwd: string;
  objective: string;
  setupMode: AutoresearchTriggerSetupMode;
  runMode: AutoresearchTriggerRunMode;
  maxIterations: number;
}): string {
  return `autoresearch_campaign_start({\n  cwd: ${JSON.stringify(input.cwd)},\n  objective: ${JSON.stringify(input.objective)},\n  setupMode: ${JSON.stringify(input.setupMode)},\n  runMode: ${JSON.stringify(input.runMode)},\n  maxIterations: ${input.maxIterations},\n  peerMode: "plan",\n  candidatePolicy: {\n    mode: "worktree",\n    keep: "preserve_branch",\n    discard: "suggest_cleanup",\n    rewind: "reset_worktree_to_base"\n  }\n})`;
}

export function formatAutoresearchCommandNotification(
  status: ReturnType<typeof buildAutoresearchRuntimeStatus>,
): string {
  return [
    `pi-autoresearch: ${status.runtimeProjection.state}`,
    `campaign=${status.currentSegment.name ?? "unconfigured"}`,
    `last=${status.currentSegment.lastRunStatus ?? "none"}`,
    `best=${status.currentSegment.bestMetric ?? "n/a"}${status.currentSegment.metricUnit}`,
    "front door: /autoresearch <objective> -> autoresearch_campaign_start",
    "candidate next: /autoresearch next -> open candidate review posture when matrix packets are waiting, otherwise recommended candidate bind/measure/decision call",
    "candidate bind: /autoresearch bind [current|<worktree>] -> autoresearch_candidate_bind",
    "candidate measure: /autoresearch measure [current|<worktree>] -> autoresearch_runtime_run candidate call",
    "candidate decision: /autoresearch candidate|keep|discard|rewind -> autoresearch_candidate_decision",
    "open candidate review: /autoresearch open candidates -> read-only open candidate review posture and owner-review call",
    "resume: /autoresearch resume -> review, then stage only the exact foreground resume call",
    "learning: /autoresearch learning -> export autoresearch.learning.v1 for owner-routed adapter handoff",
    'dashboard: /autoresearch dashboard or autoresearch_runtime_status({ action: "dashboard" })',
    "overlay: /autoresearch overlay",
    "export: /autoresearch export -> measured packet inventory inspection before /autoresearch review",
    "review: /autoresearch review -> final owner decision only after packet inventory is complete",
    "widget: /autoresearch widget on|off",
    "tools: autoresearch_campaign_start | autoresearch_candidate_bind | autoresearch_candidate_decision | autoresearch_runtime_status | autoresearch_runtime_loop | autoresearch_runtime_finalize",
  ].join("; ");
}

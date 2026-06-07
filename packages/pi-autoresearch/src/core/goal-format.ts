import type { AutoresearchAutoContinuationDecision } from "./autoContinuation.ts";
import { formatAutoresearchAutoContinuationGateLines } from "./autoContinuation.ts";
import type { AutoresearchCampaignGoalStatusView } from "./goal-model.ts";

export function formatAutoresearchCampaignGoalStatus(
  status: AutoresearchCampaignGoalStatusView,
  options: { autoContinuation?: AutoresearchAutoContinuationDecision } = {},
): string {
  const autoContinuationLines = options.autoContinuation
    ? [
        "",
        "## Auto-continuation eligibility",
        `- eligible: ${options.autoContinuation.eligible ? "yes" : "no"}`,
        `- follow-up: ${options.autoContinuation.eligible ? "will be sent after settle window" : "will not be sent"}`,
        `- blockers: ${options.autoContinuation.blockedReasons.length > 0 ? options.autoContinuation.blockedReasons.join(", ") : "(none)"}`,
        ...formatAutoresearchAutoContinuationGateLines(options.autoContinuation),
      ]
    : [
        "",
        "## Auto-continuation eligibility",
        "- status: not evaluated on this formatter call",
        "- note: use autoresearch_runtime_status for the current PI_AUTORESEARCH_AUTO_CONTINUE env/session gate decision",
      ];
  return [
    "# PI-AUTORESEARCH CAMPAIGN GOAL",
    "",
    `- path: ${status.path}`,
    `- exists: ${status.exists ? "yes" : "no"}`,
    `- goal id: ${status.goalId ?? "(none)"}`,
    `- objective: ${status.objective ?? "(none)"}`,
    `- status: ${status.status}`,
    `- budget iterations: ${formatNullableNumber(status.budget.iterations)}`,
    `- usage iterations: ${status.usage.completedIterations}`,
    `- remaining iterations: ${formatNullableNumber(status.remainingBudget.iterations)}`,
    `- budget wall clock seconds: ${formatNullableNumber(status.budget.wallClockSeconds)}`,
    `- usage wall clock seconds: ${status.usage.elapsedSeconds.toFixed(2)}`,
    `- remaining wall clock seconds: ${formatNullableNumber(status.remainingBudget.wallClockSeconds)}`,
    `- budget token-like units: ${formatNullableNumber(status.budget.tokenLikeUnits)}`,
    `- usage token-like units: ${status.usage.tokenLikeUnits}`,
    `- foreground segments: ${status.usage.foregroundSegments}`,
    `- next continuation: ${status.nextContinuationCall ?? "(none)"}`,
    `- parse error: ${status.parseError ?? "(none)"}`,
    "",
    "## Explicit control actions",
    `- pause: ${status.exactControlActions.pause}`,
    `- resume: ${status.exactControlActions.resume}`,
    `- complete: ${status.exactControlActions.complete}`,
    "",
    "## Authority warnings",
    ...status.authorityWarnings.map((warning) => `- ${warning}`),
    ...autoContinuationLines,
  ].join("\n");
}

function formatNullableNumber(value: number | null): string {
  return value === null ? "(unbounded)" : String(value);
}

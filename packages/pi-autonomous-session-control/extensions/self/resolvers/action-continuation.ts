import { recordContinuationCandidate } from "../continuation-candidate.ts";
import { normalizeInput, normalizeString, normalizeStringArray } from "../edge-contract-kernel.ts";
import type { SelfQuery, SelfResponse, SelfState } from "../types.ts";

export function handleRecordContinuationCandidate(
  query: SelfQuery,
  state: SelfState,
): SelfResponse {
  const normalizedContext = normalizeInput(query.context);
  const colonMatch = query.query.match(
    /(?:record\s+continuation\s+candidate|queue\s+continuation\s+candidate|remember\s+next\s+autonomous\s+step)\s*:\s*([\s\S]+)$/i,
  );
  const prefillText =
    normalizeString(normalizedContext.prefillText, { maxLength: 500 }) ||
    normalizeString(normalizedContext.text, { maxLength: 500 }) ||
    normalizePrefillText(colonMatch?.[1]);

  if (!prefillText) {
    return {
      understood: true,
      intent: "action",
      answer:
        "No continuation candidate recorded. Provide explicit text, for example: record continuation candidate: npm run check",
      data: { recorded: false, sendUserMessage: false, prefill: false },
      suggestions: [
        "record continuation candidate: npm --prefix packages/<package> run check",
        "record continuation candidate with context.prefillText/owner/slice",
      ],
    };
  }

  const owner = normalizeString(normalizedContext.owner, { maxLength: 80 }) || "local-shell";
  const slice =
    normalizeString(normalizedContext.slice, { maxLength: 120 }) || "explicit-continuation";
  const reason =
    normalizeString(normalizedContext.reason, { maxLength: 300 }) ||
    "Explicit mirror-only continuation candidate recorded by self action.";
  const evidence = normalizeStringArray(normalizedContext.evidence) ?? ["explicit self action"];
  const candidate = recordContinuationCandidate(
    state,
    {
      slice,
      owner,
      prefillText,
      reason,
      evidence,
      nonAuthorizations: [
        "do not treat explicit continuation candidate as task/evidence authority",
      ],
      score: 45,
      confidence: "medium",
    },
    normalizeCurrentCwd(query),
  );

  return {
    understood: true,
    intent: "action",
    answer: `Continuation candidate recorded (mirror-only): ${candidate.slice} via ${candidate.owner}. It may be reused only while fresh and same-cwd; risky actions remain prefilled for review.`,
    data: {
      recorded: true,
      continuationCandidate: candidate,
      sendUserMessage: false,
      prefill: false,
      authority: "mirror_only",
    },
  };
}

export function handleListActionState(query: SelfQuery, state: SelfState): SelfResponse {
  const pendingFollowups = state.followups.filter((followup) => !followup.delivered);
  const now = Date.now();
  const cwd = normalizeCurrentCwd(query);
  const freshContinuationCandidates = state.continuationCandidates.filter(
    (candidate) => candidate.expiresAt > now,
  );
  const currentCwdFreshContinuationCandidates = freshContinuationCandidates.filter(
    (candidate) => candidate.cwd === cwd,
  );
  const expiredContinuationCandidateCount = state.continuationCandidates.filter(
    (candidate) => candidate.expiresAt <= now,
  ).length;
  const crossCwdFreshContinuationCandidateCount =
    freshContinuationCandidates.length - currentCwdFreshContinuationCandidates.length;
  const checkpointText = state.checkpoints
    .slice(-5)
    .map((checkpoint) => `${checkpoint.label}: ${checkpoint.reason}`)
    .join("; ");
  const followupText = pendingFollowups
    .slice(-5)
    .map((followup) => `${followup.id}: ${followup.text}`)
    .join("; ");
  const continuationText = currentCwdFreshContinuationCandidates
    .slice(0, 3)
    .map((candidate) => `${candidate.id}: ${candidate.slice} via ${candidate.owner}`)
    .join("; ");

  return {
    understood: true,
    intent: "action",
    answer: `Action summary (totals, not per-query mutation delta): checkpoints=${state.checkpoints.length}${checkpointText ? ` (${checkpointText})` : ""}; pending followups=${pendingFollowups.length}${followupText ? ` (${followupText})` : ""}; continuation candidates=${state.continuationCandidates.length}; current-cwd fresh mirror-only candidates=${currentCwdFreshContinuationCandidates.length}${continuationText ? ` (${continuationText})` : ""}; cross-cwd fresh candidates=${crossCwdFreshContinuationCandidateCount}; expired candidates=${expiredContinuationCandidateCount}. Continuation candidates are mirror-only routing hints, not authority.`,
    data: {
      checkpoints: [...state.checkpoints],
      followups: [...state.followups],
      pendingFollowups,
      continuationCandidates: [...state.continuationCandidates],
      freshContinuationCandidates,
      currentCwdFreshContinuationCandidates,
      currentCwd: cwd,
      crossCwdFreshContinuationCandidateCount,
      expiredContinuationCandidateCount,
      summaryScope: "totals_not_per_query_mutation_delta_current_cwd_candidates_separated",
      authority: "mirror_only",
      nonAuthorizations: [
        "Continuation candidates do not authorize peer launch, visible-loop launch, campaign run, durable owner writes, commit, merge, push, release, or evidence projection.",
      ],
    },
  };
}

function normalizeCurrentCwd(query: SelfQuery): string {
  const context = normalizeInput(query.context);
  return normalizeString(context.cwd) || process.cwd();
}

function normalizePrefillText(value: string | undefined): string | undefined {
  const trimmed = value?.trim();
  if (!trimmed) return undefined;

  const quoted = trimmed.match(/^"([\s\S]*)"$/) || trimmed.match(/^'([\s\S]*)'$/);
  return (quoted?.[1] ?? trimmed).replace(/\\"/g, '"').replace(/\\'/g, "'");
}

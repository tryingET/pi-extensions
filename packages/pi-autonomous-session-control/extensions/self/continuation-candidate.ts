import { createEdgeMonotonicId } from "./edge-contract-kernel.ts";
import type { SliceCandidate } from "./perception-slices.ts";
import type { ContinuationCandidate, SelfState } from "./types.ts";

export const CONTINUATION_CANDIDATE_TTL_MS = 24 * 60 * 60 * 1000;
const MAX_CONTINUATION_CANDIDATES = 5;

export function recordContinuationCandidate(
  state: SelfState,
  nextMove: SliceCandidate,
  cwd: string,
  now = Date.now(),
): ContinuationCandidate {
  const candidate: ContinuationCandidate = {
    kind: "self.continuation_candidate.v1",
    id: createEdgeMonotonicId("continuation"),
    cwd,
    slice: nextMove.slice,
    owner: nextMove.owner,
    prefillText: nextMove.prefillText,
    reason: nextMove.reason,
    evidence: [...nextMove.evidence],
    nonAuthorizations: [
      ...new Set([
        ...nextMove.nonAuthorizations,
        "Mirror-only continuation candidate; verify current git/AK/package state before acting.",
        "Does not authorize peer launch, visible-loop launch, campaign run, durable owner writes, commit, merge, push, release, or evidence projection.",
      ]),
    ],
    score: nextMove.score,
    confidence: nextMove.confidence,
    source: "mirror_only",
    createdAt: now,
    expiresAt: now + CONTINUATION_CANDIDATE_TTL_MS,
  };

  state.continuationCandidates = [
    candidate,
    ...state.continuationCandidates.filter(
      (existing) => existing.cwd !== cwd || existing.owner !== nextMove.owner,
    ),
  ].slice(0, MAX_CONTINUATION_CANDIDATES);

  return candidate;
}

export function latestFreshContinuationCandidate(
  state: SelfState,
  cwd: string,
  now = Date.now(),
): ContinuationCandidate | undefined {
  return latestFreshContinuationCandidateMatching(state, cwd, () => true, now);
}

export function latestFreshExplicitContinuationCandidate(
  state: SelfState,
  cwd: string,
  now = Date.now(),
): ContinuationCandidate | undefined {
  return latestFreshContinuationCandidateMatching(
    state,
    cwd,
    (candidate) => candidate.evidence.includes("explicit self action"),
    now,
  );
}

function latestFreshContinuationCandidateMatching(
  state: SelfState,
  cwd: string,
  predicate: (candidate: ContinuationCandidate) => boolean,
  now = Date.now(),
): ContinuationCandidate | undefined {
  return state.continuationCandidates
    .filter(
      (candidate) => candidate.cwd === cwd && candidate.expiresAt > now && predicate(candidate),
    )
    .sort((left, right) => right.createdAt - left.createdAt)[0];
}

export function candidateToSliceCandidate(candidate: ContinuationCandidate): SliceCandidate {
  return {
    slice: candidate.slice,
    owner: candidate.owner,
    prefillText: candidate.prefillText,
    score: candidate.score,
    confidence: candidate.confidence,
    reason: `${candidate.reason} (reloaded from mirror-only continuation candidate ${candidate.id})`,
    evidence: [...candidate.evidence, `continuation candidate ${candidate.id}`],
    nonAuthorizations: [...candidate.nonAuthorizations],
  };
}

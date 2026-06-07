import type {
  AutoresearchCandidateLifecyclePolicy,
  AutoresearchCandidateLifecyclePolicyInput,
} from "./runtime-model.ts";
import { DEFAULT_AUTORESEARCH_CANDIDATE_LIFECYCLE_POLICY } from "./runtime-model.ts";

export function normalizeAutoresearchCandidateLifecyclePolicy(
  input?: AutoresearchCandidateLifecyclePolicyInput,
): AutoresearchCandidateLifecyclePolicy {
  const mode = input?.mode ?? DEFAULT_AUTORESEARCH_CANDIDATE_LIFECYCLE_POLICY.mode;
  if (mode !== "worktree") throw new Error(`Unsupported candidatePolicy.mode: ${mode}`);

  const keep = input?.keep ?? DEFAULT_AUTORESEARCH_CANDIDATE_LIFECYCLE_POLICY.keep;
  if (keep !== "preserve_branch" && keep !== "plan_review_branch") {
    throw new Error(`Unsupported candidatePolicy.keep: ${keep}`);
  }

  const discard = input?.discard ?? DEFAULT_AUTORESEARCH_CANDIDATE_LIFECYCLE_POLICY.discard;
  if (discard !== "suggest_cleanup" && discard !== "delete_worktree_after_confirm") {
    throw new Error(`Unsupported candidatePolicy.discard: ${discard}`);
  }

  const rewind = input?.rewind ?? DEFAULT_AUTORESEARCH_CANDIDATE_LIFECYCLE_POLICY.rewind;
  if (rewind !== "reset_worktree_to_base" && rewind !== "recreate_worktree_from_base") {
    throw new Error(`Unsupported candidatePolicy.rewind: ${rewind}`);
  }

  return {
    ...DEFAULT_AUTORESEARCH_CANDIDATE_LIFECYCLE_POLICY,
    mode,
    keep,
    discard,
    rewind,
  };
}

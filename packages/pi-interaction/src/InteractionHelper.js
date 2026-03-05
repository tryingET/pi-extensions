/**
 * Reusable interaction helper used by live input triggers.
 *
 * Public API is intentionally stable and re-exported from internal modules.
 */

export {
  rankCandidatesFallback,
  rankCandidatesWithFzf,
  splitQueryAndContext,
} from "./interaction-helper/core.js";

export {
  registerPickerInteraction,
  runFzfProbe,
  selectFuzzyCandidate,
} from "./interaction-helper/flows.js";

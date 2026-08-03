// summary: Preserves the public input-trigger compatibility facade and default extension export.
// read_when:
//   - Importing legacy helper exports or the historical input-triggers entrypoint.

export {
  rankCandidatesFallback,
  rankCandidatesWithFzf,
  runFzfProbe,
  selectFuzzyCandidate,
} from "@tryinget/pi-interaction-kit";
export {
  getBroker,
  registerPickerInteraction,
  resetBroker,
  splitQueryAndContext,
} from "@tryinget/pi-trigger-adapter";
export { default } from "./register-input-triggers.ts";

// summary: Re-exports the interaction kit's ranking, probing, selection, and telemetry helpers.
// read_when:
//   - Importing the public pi-interaction-kit runtime surface.

export {
  DEFAULT_TIMEOUT_MS,
  normalize,
  rankCandidatesFallback,
  rankCandidatesWithFzf,
  splitQueryAndContext,
  toMessage,
} from "./src/core.js";

export { runFzfProbe } from "./src/probe.js";
export { selectFuzzyCandidate } from "./src/selection.js";
export { emitTelemetry } from "./src/telemetry.js";

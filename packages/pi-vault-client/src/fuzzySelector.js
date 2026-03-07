// vault-client delegates fuzzy interaction primitives to shared pi-interaction packages.

export {
  rankCandidatesFallback,
  rankCandidatesWithFzf,
  runFzfProbe,
  selectFuzzyCandidate,
} from "@tryinget/pi-interaction-kit";

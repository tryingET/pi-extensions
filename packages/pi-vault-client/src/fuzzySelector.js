// vault-client consumes shared interaction runtime helpers through a narrow local seam.

export {
  rankCandidatesFallback,
  rankCandidatesWithFzf,
  runFzfProbe,
  selectFuzzyCandidate,
} from "@tryinget/pi-interaction-kit";

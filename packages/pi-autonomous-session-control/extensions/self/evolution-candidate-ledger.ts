// ---
// summary: screens evolution candidate text and maintains a bounded session-local candidate ledger.
// read_when:
//   - changing candidate safety filters, retention limits, or candidate lookup semantics.
// ---

import type { SelfEvolutionCandidate, SelfState } from "./types.ts";

const MAX_EVOLUTION_CANDIDATES = 20;
const UNSAFE_INSTRUCTION_PATTERN =
  /\b(?:ignore|disregard|override)\b.{0,40}\b(?:previous|system|instructions?|membrane)\b|(?:^|\s)(?:system|assistant|developer|tool)\s*:|<\/?(?:system|assistant|developer|tool)>|\b(?:tool_call|function call|sendUserMessage)\b|(?:^|\s)\/[A-Za-z][\w-]*/iu;

export function isSafeEvolutionCandidateText(value: string): boolean {
  for (const character of value) {
    const codePoint = character.codePointAt(0) ?? 0;
    if (
      codePoint < 32 ||
      (codePoint >= 127 && codePoint <= 159) ||
      codePoint === 0x2028 ||
      codePoint === 0x2029 ||
      (codePoint >= 0x202a && codePoint <= 0x202e) ||
      (codePoint >= 0x2066 && codePoint <= 0x2069) ||
      codePoint === 0xfeff
    ) {
      return false;
    }
  }
  return !UNSAFE_INSTRUCTION_PATTERN.test(value);
}

export function recordEvolutionCandidate(
  state: SelfState,
  candidate: SelfEvolutionCandidate,
): SelfEvolutionCandidate {
  state.evolutionCandidates.push(candidate);
  if (state.evolutionCandidates.length > MAX_EVOLUTION_CANDIDATES) {
    state.evolutionCandidates.splice(
      0,
      state.evolutionCandidates.length - MAX_EVOLUTION_CANDIDATES,
    );
  }
  return candidate;
}

export function latestEvolutionCandidate(
  state: SelfState,
  sessionId: string,
): SelfEvolutionCandidate | undefined {
  return [...state.evolutionCandidates]
    .reverse()
    .find((candidate) => candidate.sessionId === sessionId);
}

export function findEvolutionCandidate(
  state: SelfState,
  candidateId: string,
  sessionId: string,
): SelfEvolutionCandidate | undefined {
  return state.evolutionCandidates.find(
    (candidate) => candidate.candidateId === candidateId && candidate.sessionId === sessionId,
  );
}

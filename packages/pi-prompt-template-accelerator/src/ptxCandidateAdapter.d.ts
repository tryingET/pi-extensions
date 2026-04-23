import type { CommandLike } from "./commandProvenance.js";
import type { FuzzyCandidate } from "./fuzzySelector.js";

export interface PtxTemplateCandidate extends FuzzyCandidate {
  preview?: string;
  source: string;
  commandName?: string;
  commandPath?: string;
  commandDescription?: string;
}

export function toPtxCandidates(commands: readonly CommandLike[]): PtxTemplateCandidate[];

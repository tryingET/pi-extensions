// summary: "declares picker candidate metadata produced from discovered prompt commands"
// read_when:
//   - "changing the typed PTX candidate contract or command-to-candidate adapter signature"

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

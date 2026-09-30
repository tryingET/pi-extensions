/**
summary: "The modes pi-modes ships with; global and project modes of the same key take their place."
read_when:
  - "Changing or adding a built-in mode."
*/
import type { ModeDefinition } from "./mode-definitions.ts";

export const BUILTIN_MODES: ModeDefinition[] = [
  {
    schemaVersion: 2,
    key: "plan",
    label: "Plan",
    description: "Plan carefully without changing files until asked.",
    promptStrategy: "append",
    systemPrompt:
      "Make a concise implementation plan before changing files. Do not edit files unless the user asks you to proceed.",
  },
  {
    schemaVersion: 2,
    key: "review",
    label: "Review",
    description: "Prioritize correctness, risks, and missing verification.",
    promptStrategy: "append",
    systemPrompt:
      "Review the current work for correctness, risks, regressions, and missing tests before proposing changes.",
  },
  {
    schemaVersion: 2,
    key: "explain",
    label: "Explain",
    description: "Explain code and decisions before proposing changes.",
    promptStrategy: "append",
    systemPrompt: "Explain the relevant code and decisions clearly before proposing changes.",
  },
];

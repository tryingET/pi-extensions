/**
 * Predefined subagent profiles.
 */

import type { DispatchThinkingLevel } from "./subagent-runtime-types.ts";

export interface CognitiveRolePolicy {
  id: string;
  instructions: string;
}

export interface SubagentExecutionDefaults {
  tools: string;
  thinking: DispatchThinkingLevel;
}

/** Exact compatibility shape for the existing public profile catalog. */
export interface SubagentProfile extends SubagentExecutionDefaults {
  systemPrompt: string;
}

export const SUBAGENT_ROLE_POLICIES: Record<string, CognitiveRolePolicy> = {
  explorer: {
    id: "explorer",
    instructions:
      "You are the explorer. Build a high-value map of the problem space: what matters, how the relevant parts relate, where uncertainty remains, and which paths are most promising. Distinguish observations from hypotheses, surface surprises and constraints, and report a concise map that enables the next decision.",
  },
  reviewer: {
    id: "reviewer",
    instructions:
      "You are the reviewer. Independently assess the proposed work against its intent and constraints, assuming plausible defects may be hidden. Identify concrete correctness, security, maintainability, and integration risks; support each finding with specific evidence, rank findings by consequence and confidence, distinguish blockers from optional improvements, and state the limits of what was inspected.",
  },
  tester: {
    id: "tester",
    instructions:
      "You are the verification tester. Evaluate whether stated behavior follows from the implementation and tests. Derive focused checks from requirements and invariants. Examine normal cases, malformed local inputs, interruptions, and state transitions using repository-local fixtures only. Report confirmed discrepancies, missing coverage, passing evidence, and untested risks separately with calibrated confidence. Do not access external systems or perform destructive actions.",
  },
  researcher: {
    id: "researcher",
    instructions:
      "You are the researcher. Reduce uncertainty by finding and synthesizing the most relevant, credible, and diverse evidence for the question. Follow promising leads, triangulate conflicting sources, distinguish established fact from interpretation, cite provenance, and deliver decision-ready conclusions with material gaps and calibrated confidence.",
  },
  minimal: {
    id: "minimal",
    instructions:
      "You are the minimal agent. Solve the objective with full precision and judgment while using the least context, ceremony, and output that preserves correctness. Surface only assumptions, risks, or details that materially affect the result; brevity must never substitute for understanding. Complete the objective, report the essential result, and stop.",
  },
};

export const SUBAGENT_EXECUTION_DEFAULTS: Record<string, SubagentExecutionDefaults> = {
  explorer: { tools: "read,bash", thinking: "low" },
  reviewer: { tools: "read,bash", thinking: "medium" },
  tester: { tools: "read,bash", thinking: "medium" },
  researcher: { tools: "read,bash", thinking: "medium" },
  minimal: { tools: "read,bash", thinking: "off" },
};

function projectLegacyProfile(id: string): SubagentProfile {
  const role = SUBAGENT_ROLE_POLICIES[id];
  const defaults = SUBAGENT_EXECUTION_DEFAULTS[id];
  if (!role || !defaults) throw new Error(`incomplete subagent profile: ${id}`);
  return {
    tools: defaults.tools,
    thinking: defaults.thinking,
    systemPrompt: role.instructions,
  };
}

/** Preserve the exact enumerable legacy profile shape during local separation. */
export const SUBAGENT_PROFILES: Record<string, SubagentProfile> = {
  explorer: projectLegacyProfile("explorer"),
  reviewer: projectLegacyProfile("reviewer"),
  tester: projectLegacyProfile("tester"),
  researcher: projectLegacyProfile("researcher"),
  minimal: projectLegacyProfile("minimal"),
};

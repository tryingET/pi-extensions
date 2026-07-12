export interface AgentRolePolicy {
  id: string;
  description: string;
  instructions: string;
}

export interface AgentExecutionDefaults {
  tools: string;
}

/** Exact compatibility shape for workflow, loop, and cognitive-dispatch callers. */
export interface AgentDef extends AgentExecutionDefaults {
  name: string;
  description: string;
  systemPrompt: string;
}

export const AGENT_ROLE_POLICIES: Record<string, AgentRolePolicy> = {
  scout: {
    id: "explorer",
    description: "High-value problem-space mapping and uncertainty discovery",
    instructions:
      "You are the explorer. Build a high-value map of the problem space: what matters, how the relevant parts relate, where uncertainty remains, and which paths are most promising. Distinguish observations from hypotheses, surface surprises and constraints, and report a concise map that enables the next decision.",
  },
  builder: {
    id: "builder",
    description: "Complete, integrated outcome construction",
    instructions:
      "You are the builder. Convert the objective, constraints, and available context into the simplest complete solution that genuinely satisfies the intended outcome. Preserve relevant invariants, integrate with surrounding patterns, resolve consequential gaps rather than papering over them, and clearly surface assumptions, achieved capability, validation status, and residual risk.",
  },
  reviewer: {
    id: "reviewer",
    description: "Independent, evidence-ranked assessment of proposed work",
    instructions:
      "You are the reviewer. Independently assess the proposed work against its intent and constraints, assuming plausible defects may be hidden. Identify concrete correctness, security, maintainability, and integration risks; support each finding with specific evidence, rank findings by consequence and confidence, distinguish blockers from optional improvements, and state the limits of what was inspected.",
  },
  researcher: {
    id: "researcher",
    description: "Source-grounded uncertainty reduction and synthesis",
    instructions:
      "You are the researcher. Reduce uncertainty by finding and synthesizing the most relevant, credible, and diverse evidence for the question. Follow promising leads, triangulate conflicting sources, distinguish established fact from interpretation, cite provenance, and deliver decision-ready conclusions with material gaps and calibrated confidence.",
  },
};

export const AGENT_EXECUTION_DEFAULTS: Record<string, AgentExecutionDefaults> = {
  scout: { tools: "read,grep,find,ls" },
  builder: { tools: "read,write,edit,bash" },
  reviewer: { tools: "read,bash,grep,find,ls" },
  researcher: { tools: "read,bash" },
};

function projectLegacyProfile(id: string): AgentDef {
  const role = AGENT_ROLE_POLICIES[id];
  const defaults = AGENT_EXECUTION_DEFAULTS[id];
  if (!role || !defaults) throw new Error(`incomplete orchestrator agent profile: ${id}`);
  return {
    name: id,
    description: role.description,
    tools: defaults.tools,
    systemPrompt: role.instructions,
  };
}

/** Preserve the exact enumerable legacy profile shape during local separation. */
export const AGENT_PROFILES: Record<string, AgentDef> = {
  scout: projectLegacyProfile("scout"),
  builder: projectLegacyProfile("builder"),
  reviewer: projectLegacyProfile("reviewer"),
  researcher: projectLegacyProfile("researcher"),
};

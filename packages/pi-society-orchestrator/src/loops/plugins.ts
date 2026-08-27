// ---
// summary: "Built-in cognitive loop plugin definitions and their stable phase semantics."
// read_when:
//   - "Changing built-in loop phases, agents, tools, or descriptions."
// ---

import type { LoopPlugin } from "./contracts.ts";

// ============================================================================
// BUILT-IN PLUGINS
// ============================================================================

export const OODA_PLUGIN: LoopPlugin = {
  name: "ooda",
  phases: ["observe", "orient", "decide", "act"],
  description: "OODA Loop — Observe, Orient, Decide, Act. Military-grade decision cycle.",
  cognitiveTools: {
    observe: ["telescopic", "dependency-cartography"],
    orient: ["inversion", "audit", "evidence-matrix"],
    decide: ["nexus", "constraint-inventory"],
    act: ["controlled", "atomic-completion"],
  },
  agents: {
    observe: "scout",
    orient: "reviewer",
    decide: "researcher",
    act: "builder",
  },
};

export const STRATEGIC_PLUGIN: LoopPlugin = {
  name: "strategic",
  phases: ["mission", "intelligence", "tooling", "operations"],
  description:
    "Strategic loop — Mission, Intelligence, Tooling, Operations. Strategic execution frame.",
  cognitiveTools: {
    mission: ["first-principles", "nexus"],
    intelligence: ["telescopic", "inversion"],
    tooling: ["audit", "blast-radius"],
    operations: ["controlled", "atomic-completion"],
  },
  agents: {
    mission: "researcher",
    intelligence: "scout",
    tooling: "reviewer",
    operations: "builder",
  },
};

export const KAIZEN_PLUGIN: LoopPlugin = {
  name: "kaizen",
  phases: ["plan", "do", "check", "act"],
  description: "Kaizen (PDCA) — Plan, Do, Check, Act. Continuous improvement cycle.",
  cognitiveTools: {
    plan: ["first-principles", "nexus", "constraint-inventory"],
    do: ["controlled", "atomic-completion"],
    check: ["audit", "inversion", "mirror"],
    act: ["knowledge-crystallization", "elevate"],
  },
  agents: {
    plan: "researcher",
    do: "builder",
    check: "reviewer",
    act: "researcher",
  },
};

export const ADKAR_PLUGIN: LoopPlugin = {
  name: "adkar",
  phases: ["awareness", "desire", "knowledge", "ability", "reinforcement"],
  description: "ADKAR — Awareness, Desire, Knowledge, Ability, Reinforcement. Change management.",
  cognitiveTools: {
    awareness: ["telescopic", "dependency-cartography"],
    desire: ["nexus", "decision"],
    knowledge: ["knowledge-crystallization", "first-principles"],
    ability: ["controlled", "atomic-completion"],
    reinforcement: ["elevate", "temporal-degradation"],
  },
  agents: {
    awareness: "scout",
    desire: "researcher",
    knowledge: "researcher",
    ability: "builder",
    reinforcement: "reviewer",
  },
};

export const TRANSCENDENT_PLUGIN: LoopPlugin = {
  name: "transcendent",
  phases: [
    "diagnose",
    "first-100x",
    "second-100x",
    "debt-targeting",
    "dissolve",
    "rebuild",
    "alien-pass",
    "closure-gate",
  ],
  description:
    "Transcendent Iteration v4 — Diagnose → 100x → 100x → Debt Targeting → Dissolve → Rebuild → Alien Pass → Closure Gate",
  continueOnFailure: false,
  cognitiveTools: {
    diagnose: ["first-principles", "constraint-inventory", "inversion"],
    "first-100x": ["nexus", "simplification", "telescopic"],
    "second-100x": ["audit", "inversion", "telescopic"],
    "debt-targeting": ["audit", "constraint-inventory", "inversion"],
    dissolve: ["first-principles", "scaffold"],
    rebuild: ["first-principles", "scaffold", "recursion-engine"],
    "alien-pass": ["elevate", "telescopic", "nexus"],
    "closure-gate": ["knowledge-crystallization", "audit", "elevate"],
  },
  agents: {
    diagnose: "scout",
    "first-100x": "builder",
    "second-100x": "reviewer",
    "debt-targeting": "reviewer",
    dissolve: "researcher",
    rebuild: "builder",
    "alien-pass": "builder",
    "closure-gate": "researcher",
  },
};

export const BUILT_IN_PLUGINS: Record<string, LoopPlugin> = {
  ooda: OODA_PLUGIN,
  strategic: STRATEGIC_PLUGIN,
  kaizen: KAIZEN_PLUGIN,
  adkar: ADKAR_PLUGIN,
  transcendent: TRANSCENDENT_PLUGIN,
};

import assert from "node:assert/strict";
import test from "node:test";
import { SUBAGENT_ROLE_POLICIES } from "../../pi-autonomous-session-control/extensions/self/subagent-profiles.ts";
import {
  AGENT_EXECUTION_DEFAULTS,
  AGENT_PROFILES,
  AGENT_ROLE_POLICIES,
} from "../src/runtime/agent-profiles.ts";

const expectedProfiles = {
  scout: {
    name: "scout",
    description: "High-value problem-space mapping and uncertainty discovery",
    tools: "read,grep,find,ls",
    systemPrompt:
      "You are the explorer. Build a high-value map of the problem space: what matters, how the relevant parts relate, where uncertainty remains, and which paths are most promising. Distinguish observations from hypotheses, surface surprises and constraints, and report a concise map that enables the next decision.",
  },
  builder: {
    name: "builder",
    description: "Complete, integrated outcome construction",
    tools: "read,write,edit,bash",
    systemPrompt:
      "You are the builder. Convert the objective, constraints, and available context into the simplest complete solution that genuinely satisfies the intended outcome. Preserve relevant invariants, integrate with surrounding patterns, resolve consequential gaps rather than papering over them, and clearly surface assumptions, achieved capability, validation status, and residual risk.",
  },
  reviewer: {
    name: "reviewer",
    description: "Independent, evidence-ranked assessment of proposed work",
    tools: "read,bash,grep,find,ls",
    systemPrompt:
      "You are the reviewer. Independently assess the proposed work against its intent and constraints, assuming plausible defects may be hidden. Identify concrete correctness, security, maintainability, and integration risks; support each finding with specific evidence, rank findings by consequence and confidence, distinguish blockers from optional improvements, and state the limits of what was inspected.",
  },
  researcher: {
    name: "researcher",
    description: "Source-grounded uncertainty reduction and synthesis",
    tools: "read,bash",
    systemPrompt:
      "You are the researcher. Reduce uncertainty by finding and synthesizing the most relevant, credible, and diverse evidence for the question. Follow promising leads, triangulate conflicting sources, distinguish established fact from interpretation, cite provenance, and deliver decision-ready conclusions with material gaps and calibrated confidence.",
  },
};

test("orchestrator profiles expose the decided canonical role semantics", () => {
  assert.deepEqual(AGENT_PROFILES, expectedProfiles);
});

test("orchestrator profile catalogs have exact matching keysets and independent axes", () => {
  const expectedKeys = Object.keys(expectedProfiles).sort();
  assert.deepEqual(Object.keys(AGENT_PROFILES).sort(), expectedKeys);
  assert.deepEqual(Object.keys(AGENT_ROLE_POLICIES).sort(), expectedKeys);
  assert.deepEqual(Object.keys(AGENT_EXECUTION_DEFAULTS).sort(), expectedKeys);

  for (const [key, profile] of Object.entries(AGENT_PROFILES)) {
    const role = AGENT_ROLE_POLICIES[key];
    const defaults = AGENT_EXECUTION_DEFAULTS[key];
    assert.equal(role.id, key === "scout" ? "explorer" : key);
    assert.equal(role.description, profile.description);
    assert.equal(role.instructions, profile.systemPrompt);
    assert.equal(defaults.tools, profile.tools);
    assert.deepEqual(Object.keys(role).sort(), ["description", "id", "instructions"]);
  }
});

test("shared reviewer and researcher semantics remain byte-identical across runtime owners", () => {
  for (const key of ["reviewer", "researcher"]) {
    assert.equal(AGENT_ROLE_POLICIES[key].instructions, SUBAGENT_ROLE_POLICIES[key].instructions);
  }
});

test("builder remains a cognitive role while execution and domain disciplines stay separate", () => {
  const builder = AGENT_ROLE_POLICIES.builder;
  assert.match(builder.instructions, /simplest complete solution/);
  assert.doesNotMatch(
    builder.instructions,
    /RefactorOps|Prompt Vault|worktree|PEER_ACK|commit|push|read|write|edit|bash/i,
  );
  assert.equal(AGENT_EXECUTION_DEFAULTS.builder.tools, "read,write,edit,bash");
});

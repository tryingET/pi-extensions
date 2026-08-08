import assert from "node:assert/strict";
import test from "node:test";
import {
  SUBAGENT_EXECUTION_DEFAULTS,
  SUBAGENT_PROFILES,
  SUBAGENT_ROLE_POLICIES,
} from "../extensions/self/subagent-profiles.ts";

const expectedProfiles = {
  explorer: {
    tools: "read,bash",
    thinking: "low",
    systemPrompt:
      "You are the explorer. Build a high-value map of the problem space: what matters, how the relevant parts relate, where uncertainty remains, and which paths are most promising. Distinguish observations from hypotheses, surface surprises and constraints, and report a concise map that enables the next decision.",
  },
  reviewer: {
    tools: "read,bash",
    thinking: "medium",
    systemPrompt:
      "You are the reviewer. Independently assess the proposed work against its intent and constraints, assuming plausible defects may be hidden. Identify concrete correctness, security, maintainability, and integration risks; support each finding with specific evidence, rank findings by consequence and confidence, distinguish blockers from optional improvements, and state the limits of what was inspected.",
  },
  tester: {
    tools: "read,bash",
    thinking: "medium",
    systemPrompt:
      "You are the verification tester. Evaluate whether stated behavior follows from the implementation and tests. Derive focused checks from requirements and invariants. Examine normal cases, malformed local inputs, interruptions, and state transitions using repository-local fixtures only. Report confirmed discrepancies, missing coverage, passing evidence, and untested risks separately with calibrated confidence. Do not access external systems or perform destructive actions.",
  },
  researcher: {
    tools: "read,bash",
    thinking: "medium",
    systemPrompt:
      "You are the researcher. Reduce uncertainty by finding and synthesizing the most relevant, credible, and diverse evidence for the question. Follow promising leads, triangulate conflicting sources, distinguish established fact from interpretation, cite provenance, and deliver decision-ready conclusions with material gaps and calibrated confidence.",
  },
  minimal: {
    tools: "read,bash",
    thinking: "off",
    systemPrompt:
      "You are the minimal agent. Solve the objective with full precision and judgment while using the least context, ceremony, and output that preserves correctness. Surface only assumptions, risks, or details that materially affect the result; brevity must never substitute for understanding. Complete the objective, report the essential result, and stop.",
  },
};

test("subagent profiles expose the decided canonical role semantics", () => {
  assert.deepEqual(SUBAGENT_PROFILES, expectedProfiles);
});

test("subagent profile catalogs have exact matching keysets and independent axes", () => {
  const expectedKeys = Object.keys(expectedProfiles).sort();
  assert.deepEqual(Object.keys(SUBAGENT_PROFILES).sort(), expectedKeys);
  assert.deepEqual(Object.keys(SUBAGENT_ROLE_POLICIES).sort(), expectedKeys);
  assert.deepEqual(Object.keys(SUBAGENT_EXECUTION_DEFAULTS).sort(), expectedKeys);

  for (const [key, profile] of Object.entries(SUBAGENT_PROFILES)) {
    const role = SUBAGENT_ROLE_POLICIES[key];
    const defaults = SUBAGENT_EXECUTION_DEFAULTS[key];
    assert.equal(role.id, key);
    assert.equal(role.instructions, profile.systemPrompt);
    assert.equal(defaults.tools, profile.tools);
    assert.equal(defaults.thinking, profile.thinking);
    assert.deepEqual(Object.keys(role).sort(), ["id", "instructions"]);
  }
});

test("builder and domain procedures remain outside the ASC role catalog", () => {
  assert.equal(SUBAGENT_ROLE_POLICIES.builder, undefined);
  for (const role of Object.values(SUBAGENT_ROLE_POLICIES)) {
    assert.doesNotMatch(
      role.instructions,
      /RefactorOps|Prompt Vault|worktree|PEER_ACK|commit|push/i,
    );
  }
});

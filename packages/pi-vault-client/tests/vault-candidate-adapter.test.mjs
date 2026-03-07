import assert from "node:assert/strict";
import test from "node:test";
import { toVaultCandidates } from "../src/vaultCandidateAdapter.js";

test("toVaultCandidates normalizes template rows to selector contract", () => {
  const templates = [
    {
      name: "nexus",
      description: "Find the highest-leverage intervention",
      content: "nexus body",
      artifact_kind: "cognitive",
      control_mode: "one_shot",
      formalization_level: "structured",
    },
    {
      name: "inversion",
      description: "Shadow analysis",
      content: "inversion body",
      artifact_kind: "cognitive",
      control_mode: "one_shot",
      formalization_level: "structured",
    },
  ];

  const candidates = toVaultCandidates(templates);
  assert.equal(candidates.length, 2);
  assert.deepEqual(
    candidates.map((candidate) => candidate.id),
    ["inversion", "nexus"],
  );

  assert.deepEqual(candidates[1], {
    id: "nexus",
    label: "/vault:nexus",
    detail: "[cognitive/one_shot/structured] Find the highest-leverage intervention",
    preview: "nexus body",
    source: "vault",
  });
});

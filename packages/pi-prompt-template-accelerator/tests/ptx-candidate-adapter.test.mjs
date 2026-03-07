import assert from "node:assert/strict";
import test from "node:test";
import { toPtxCandidates } from "../src/ptxCandidateAdapter.js";

test("toPtxCandidates keeps only prompt commands and normalizes contract", () => {
  const commands = [
    { name: "inversion", source: "prompt", description: "Shadow analysis" },
    { name: "vault", source: "extension", description: "Vault command" },
    { name: "nexus", source: "prompt", description: "Highest leverage intervention" },
  ];

  const candidates = toPtxCandidates(commands);

  assert.equal(candidates.length, 2);
  assert.deepEqual(
    candidates.map((candidate) => candidate.id),
    ["inversion", "nexus"],
  );

  assert.deepEqual(candidates[0], {
    id: "inversion",
    label: "/inversion",
    detail: "Shadow analysis",
    preview: undefined,
    source: "ptx",
  });
});

test("toPtxCandidates truncates long descriptions deterministically", () => {
  const commands = [
    {
      name: "long-one",
      source: "prompt",
      description: "x".repeat(120),
    },
  ];

  const [candidate] = toPtxCandidates(commands);
  assert.equal(candidate.detail.length, 80);
  assert.ok(candidate.detail.endsWith("..."));
});

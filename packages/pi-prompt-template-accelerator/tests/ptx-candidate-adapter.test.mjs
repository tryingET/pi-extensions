import assert from "node:assert/strict";
import test from "node:test";
import { toPtxCandidates } from "../src/ptxCandidateAdapter.js";

test("toPtxCandidates keeps only prompt commands and preserves command metadata", () => {
  const commands = [
    {
      name: "inversion",
      source: "prompt",
      description: "Shadow analysis",
      path: "/tmp/prompts/inversion.md",
    },
    { name: "vault", source: "extension", description: "Vault command" },
    {
      name: "nexus",
      source: "prompt",
      description: "Highest leverage intervention",
      path: "/tmp/prompts/nexus.md",
    },
  ];

  const candidates = toPtxCandidates(commands);

  assert.equal(candidates.length, 2);
  assert.deepEqual(
    candidates.map((candidate) => candidate.commandName),
    ["inversion", "nexus"],
  );

  assert.deepEqual(candidates[0], {
    id: "inversion::/tmp/prompts/inversion.md",
    label: "/inversion",
    detail: "Shadow analysis",
    preview: undefined,
    source: "ptx",
    commandName: "inversion",
    commandPath: "/tmp/prompts/inversion.md",
    commandDescription: "Shadow analysis",
  });
});

test("toPtxCandidates truncates long descriptions deterministically", () => {
  const commands = [
    {
      name: "long-one",
      source: "prompt",
      description: "x".repeat(120),
      path: "/tmp/prompts/long-one.md",
    },
  ];

  const [candidate] = toPtxCandidates(commands);
  assert.equal(candidate.detail.length, 80);
  assert.ok(candidate.detail.endsWith("..."));
});

test("toPtxCandidates excludes prompt commands without template paths from picker candidates", () => {
  const commands = [
    {
      name: "analysis-router",
      source: "prompt",
      description: "Router without path",
    },
    {
      name: "implementation-planning",
      source: "prompt",
      description: "Plan implementation work",
      path: "/tmp/prompts/implementation-planning.md",
    },
  ];

  const candidates = toPtxCandidates(commands);
  assert.deepEqual(
    candidates.map((candidate) => candidate.commandName),
    ["implementation-planning"],
  );
});

test("toPtxCandidates disambiguates duplicate prompt names with origin detail and unique ids", () => {
  const commands = [
    {
      name: "implementation-planning",
      source: "prompt",
      description: "Draft an implementation plan for a requested change",
      path: "/repo-a/prompts/implementation-planning.md",
    },
    {
      name: "implementation-planning",
      source: "prompt",
      description: "Draft an implementation plan for a requested change",
      path: "/repo-b/prompts/implementation-planning.md",
    },
  ];

  const candidates = toPtxCandidates(commands);

  assert.equal(candidates.length, 2);
  assert.notEqual(candidates[0].id, candidates[1].id);
  assert.match(candidates[0].detail ?? "", /repo-a\/prompts\/implementation-planning\.md|repo-b\/prompts\/implementation-planning\.md/);
  assert.match(candidates[1].detail ?? "", /repo-a\/prompts\/implementation-planning\.md|repo-b\/prompts\/implementation-planning\.md/);
  assert.notEqual(candidates[0].detail, candidates[1].detail);
});

test("toPtxCandidates supports sourceInfo-only prompt command metadata", () => {
  const commands = [
    {
      name: "nexus",
      description: "Highest leverage intervention",
      sourceInfo: {
        source: "prompt",
        path: "/tmp/prompts/nexus.md",
      },
    },
    {
      name: "vault",
      description: "Vault command",
      sourceInfo: {
        source: "extension",
      },
    },
  ];

  const candidates = toPtxCandidates(commands);

  assert.equal(candidates.length, 1);
  assert.equal(candidates[0].commandName, "nexus");
  assert.equal(candidates[0].commandPath, "/tmp/prompts/nexus.md");
  assert.equal(candidates[0].commandDescription, "Highest leverage intervention");
});

test("toPtxCandidates prefers top-level command source over provenance sourceInfo.source", () => {
  const commands = [
    {
      name: "commit",
      source: "prompt",
      description: "Commit workflow",
      sourceInfo: {
        source: "auto",
        path: "/tmp/prompts/commit.md",
      },
    },
  ];

  const candidates = toPtxCandidates(commands);

  assert.equal(candidates.length, 1);
  assert.equal(candidates[0].commandName, "commit");
  assert.equal(candidates[0].commandPath, "/tmp/prompts/commit.md");
});

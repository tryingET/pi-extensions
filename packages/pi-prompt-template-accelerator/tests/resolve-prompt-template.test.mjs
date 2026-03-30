import assert from "node:assert/strict";
import test from "node:test";
import { resolvePromptTemplate } from "../src/resolvePromptTemplate.js";

test("resolvePromptTemplate resolves a unique prompt-name match", () => {
  const resolution = resolvePromptTemplate(
    [
      { name: "inversion", source: "prompt", path: "/tmp/inversion.md" },
      { name: "vault", source: "extension" },
    ],
    "inversion",
  );

  assert.equal(resolution.status, "ok");
  assert.equal(resolution.resolution, "unique-match");
  assert.equal(resolution.templateCommand?.path, "/tmp/inversion.md");
});

test("resolvePromptTemplate prefers the single prefillable duplicate match", () => {
  const resolution = resolvePromptTemplate(
    [
      { name: "same", source: "prompt", description: "missing path" },
      { name: "same", source: "prompt", path: "/tmp/same.md" },
    ],
    "same",
  );

  assert.equal(resolution.status, "ok");
  assert.equal(resolution.resolution, "single-prefillable-match");
  assert.equal(resolution.templateCommand?.path, "/tmp/same.md");
});

test("resolvePromptTemplate returns explicit ambiguity for multiple prefillable duplicate matches", () => {
  const resolution = resolvePromptTemplate(
    [
      { name: "same", source: "prompt", path: "/tmp/a.md" },
      { name: "same", source: "prompt", path: "/tmp/b.md" },
    ],
    "same",
  );

  assert.equal(resolution.status, "ambiguous");
  assert.equal(resolution.resolution, "duplicate-name");
  assert.equal(resolution.prefillableMatches.length, 2);
});

test("resolvePromptTemplate supports sourceInfo-only prompt command metadata", () => {
  const resolution = resolvePromptTemplate(
    [
      {
        name: "nexus",
        sourceInfo: {
          source: "prompt",
          path: "/tmp/nexus.md",
        },
      },
      {
        name: "vault",
        sourceInfo: {
          source: "extension",
        },
      },
    ],
    "nexus",
  );

  assert.equal(resolution.status, "ok");
  assert.equal(resolution.resolution, "unique-match");
  assert.equal(resolution.templateCommand?.source, "prompt");
  assert.equal(resolution.templateCommand?.path, "/tmp/nexus.md");
});

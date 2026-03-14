import assert from "node:assert/strict";
import path from "node:path";
import test from "node:test";
import { createWorkspacePort } from "../src/adapters/workspace.ts";
import { createTempOntologyRepo } from "./helpers.ts";

const workspace = createWorkspacePort();

test("auto scope resolves to current repo when ontology manifest exists", async () => {
  const repo = await createTempOntologyRepo();
  const target = await workspace.resolveTarget({
    cwd: repo,
    scope: "auto",
    artifactKind: "concept",
  });
  assert.equal(target.scope, "repo");
  assert.equal(target.repoPath, repo);
});

test("explicit company scope resolves to softwareco overlay from package cwd", async () => {
  const cwd =
    "/home/tryinget/ai-society/softwareco/owned/pi-extensions/packages/pi-ontology-workflows";
  const target = await workspace.resolveTarget({ cwd, scope: "company" });
  assert.equal(target.scope, "company");
  assert.equal(target.repoPath, path.resolve("/home/tryinget/ai-society/softwareco/ontology"));
});

test("auto scope resolves core for core.* target ids", async () => {
  const cwd =
    "/home/tryinget/ai-society/softwareco/owned/pi-extensions/packages/pi-ontology-workflows";
  const target = await workspace.resolveTarget({ cwd, scope: "auto", targetId: "core.Agent" });
  assert.equal(target.scope, "core");
  assert.equal(target.repoPath, path.resolve("/home/tryinget/ai-society/core/ontology-kernel"));
});

// summary: "Covers ontology workspace target resolution across repo, company, core, and bootstrap scopes."
// read_when:
//   - "Changing ontology scope inference or workspace repository resolution."

import assert from "node:assert/strict";
import test from "node:test";
import { createWorkspacePort } from "../src/adapters/workspace.ts";
import {
  createTempDirectoryWithoutGit,
  createTempOntologyRepo,
  createTempOntologyWorkspace,
  createTempRepoWithoutOntology,
  type TempOntologyWorkspace,
} from "./helpers.ts";

async function withTempWorkspace<T>(
  run: (fixture: TempOntologyWorkspace) => Promise<T>,
): Promise<T> {
  const previousRoot = process.env.PI_ONTOLOGY_WORKSPACE_ROOT;
  const fixture = await createTempOntologyWorkspace();
  process.env.PI_ONTOLOGY_WORKSPACE_ROOT = fixture.root;
  try {
    return await run(fixture);
  } finally {
    if (previousRoot === undefined) delete process.env.PI_ONTOLOGY_WORKSPACE_ROOT;
    else process.env.PI_ONTOLOGY_WORKSPACE_ROOT = previousRoot;
  }
}

test("auto scope resolves to current repo when ontology manifest exists", async () => {
  const repo = await createTempOntologyRepo();
  const target = await createWorkspacePort().resolveTarget({
    cwd: repo,
    scope: "auto",
    artifactKind: "concept",
  });
  assert.equal(target.scope, "repo");
  assert.equal(target.repoPath, repo);
});

test("explicit repo scope resolves without manifest for bootstrap", async () => {
  const repo = await createTempRepoWithoutOntology();
  const target = await createWorkspacePort().resolveTarget({
    cwd: repo,
    scope: "repo",
    artifactKind: "bootstrap",
  });
  assert.equal(target.scope, "repo");
  assert.equal(target.repoPath, repo);
});

test("auto scope resolves current repo for bootstrap before ontology exists", async () => {
  const repo = await createTempRepoWithoutOntology();
  const target = await createWorkspacePort().resolveTarget({
    cwd: repo,
    scope: "auto",
    artifactKind: "bootstrap",
  });
  assert.equal(target.scope, "repo");
  assert.equal(target.repoPath, repo);
});

test("bootstrap fails closed when cwd is not inside a git repo", async () => {
  const cwd = await createTempDirectoryWithoutGit();
  await assert.rejects(
    createWorkspacePort().resolveTarget({
      cwd,
      scope: "repo",
      artifactKind: "bootstrap",
    }),
    /requires a git repo root or child directory/,
  );
});

test("explicit company scope resolves to a fixture company overlay", async () => {
  await withTempWorkspace(async ({ repo, company }) => {
    const target = await createWorkspacePort().resolveTarget({ cwd: repo, scope: "company" });
    assert.equal(target.scope, "company");
    assert.equal(target.repoPath, company);
  });
});

test("auto scope resolves fixture core for core.* target ids", async () => {
  await withTempWorkspace(async ({ repo, core }) => {
    const target = await createWorkspacePort().resolveTarget({
      cwd: repo,
      scope: "auto",
      targetId: "core.Agent",
    });
    assert.equal(target.scope, "core");
    assert.equal(target.repoPath, core);
  });
});

import assert from "node:assert/strict";
import { existsSync } from "node:fs";
import test from "node:test";
import { createFilesystemPort } from "../src/adapters/filesystem.ts";
import { createRocsCliPort } from "../src/adapters/rocs-cli.ts";
import { runOntologyChange } from "../src/core/change.ts";
import { inspectOntology } from "../src/core/inspect.ts";
import { createFakeWorkspacePort, createTempOntologyRepo } from "./helpers.ts";

test("apply concept change validates, builds, searches, and packs", async () => {
  const repo = await createTempOntologyRepo();
  const files = createFilesystemPort();
  const rocs = createRocsCliPort();
  const workspace = createFakeWorkspacePort(repo);

  const change = await runOntologyChange(
    {
      mode: "apply",
      artifactKind: "concept",
      operation: "create",
      targetId: "demo.Agent",
      title: "Agent",
      description: "A deterministic test agent.",
      examples: ["automation helper"],
      antiExamples: ["random shell script"],
      validateAfter: true,
      buildAfter: true,
    },
    { cwd: repo },
    { files, rocs, workspace },
  );

  assert.equal(change.applied, true);
  assert.equal(change.validation?.ok, true);
  assert.equal(Boolean(change.build?.idIndexPath), true);
  assert.equal(existsSync(change.build?.idIndexPath ?? ""), true);

  const search = await inspectOntology(
    { kind: "search", query: "demo.Agent" },
    { cwd: repo },
    { files, rocs, workspace },
  );
  assert.equal(search.search?.hits[0]?.ontId, "demo.Agent");

  const defaultSearch = await inspectOntology(
    { kind: "search", query: "" },
    { cwd: repo },
    { files, rocs, workspace },
  );
  assert.equal(defaultSearch.search?.hits.length === 0, false);

  const pack = await inspectOntology(
    { kind: "pack", ontId: "demo.Agent" },
    { cwd: repo },
    { files, rocs, workspace },
  );
  assert.match(pack.pack?.text ?? "", /demo.Agent/);
  assert.match(pack.pack?.text ?? "", /deterministic test agent/);
});

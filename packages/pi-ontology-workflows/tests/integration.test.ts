// summary: "Runs ontology change, validation, build, search, and pack flows against temporary repository layouts."
// read_when:
//   - "Changing applied ontology workflows or nested and root layout integration behavior."

import assert from "node:assert/strict";
import { existsSync } from "node:fs";
import { writeFile } from "node:fs/promises";
import test from "node:test";
import { createFilesystemPort } from "../src/adapters/filesystem.ts";
import { runOntologyChange } from "../src/core/change.ts";
import { inspectOntology } from "../src/core/inspect.ts";
import {
  createFakeWorkspacePort,
  createFixtureRocsPort,
  createTempOntologyRepo,
  createTempRepoWithoutOntology,
  createTempRootLayoutOntologyRepo,
} from "./helpers.ts";

test("apply concept change validates, builds, searches, and packs for repo-local nested ontology layout", async () => {
  const repo = await createTempOntologyRepo();
  const files = createFilesystemPort();
  const rocs = createFixtureRocsPort();
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

test("bootstrap apply creates a repo-local ontology skeleton and validates/builds", async () => {
  const repo = await createTempRepoWithoutOntology();
  const files = createFilesystemPort();
  const rocs = createFixtureRocsPort();
  const workspace = createFakeWorkspacePort(repo);

  const change = await runOntologyChange(
    {
      mode: "apply",
      artifactKind: "bootstrap",
      operation: "create",
      validateAfter: true,
      buildAfter: true,
    },
    { cwd: repo },
    { files, rocs, workspace },
  );

  assert.equal(change.applied, true);
  assert.equal(change.validation?.ok, true);
  assert.equal(Boolean(change.build?.idIndexPath), true);
  assert.equal(existsSync(`${repo}/ontology/manifest.yaml`), true);
  assert.equal(existsSync(`${repo}/ontology/src/system4d.yaml`), true);
  assert.equal(existsSync(`${repo}/ontology/src/reference/concepts/README.md`), true);
  assert.equal(existsSync(`${repo}/ontology/src/reference/relations/README.md`), true);
});

test("manifest apply updates repo-local ontology manifest and validates/builds", async () => {
  const repo = await createTempOntologyRepo();
  const files = createFilesystemPort();
  const rocs = createFixtureRocsPort();
  const workspace = createFakeWorkspacePort(repo);

  const change = await runOntologyChange(
    {
      mode: "apply",
      artifactKind: "manifest",
      operation: "update",
      manifestDefaultProfile: "review",
      manifestProfiles: {
        review: {
          include_layers: ["core"],
          exclude_layers: ["repo"],
          budget: 1500,
        },
      },
      validateAfter: true,
      buildAfter: true,
    },
    { cwd: repo },
    { files, rocs, workspace },
  );

  assert.equal(change.applied, true);
  assert.equal(change.validation?.ok, true);
  assert.equal(Boolean(change.build?.idIndexPath), true);
  const manifest = await files.readText(`${repo}/ontology/manifest.yaml`);
  assert.match(manifest, /default: review/);
  assert.match(manifest, /review:/);
});

test("apply concept change validates and builds for root-layout ontology repos", async () => {
  const repo = await createTempRootLayoutOntologyRepo();
  const files = createFilesystemPort();
  const rocs = createFixtureRocsPort();
  const workspace = createFakeWorkspacePort(repo);

  const change = await runOntologyChange(
    {
      mode: "apply",
      artifactKind: "concept",
      operation: "create",
      targetId: "co.demo.Agent",
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
  assert.equal(existsSync(`${repo}/src/reference/concepts/co.demo.Agent.md`), true);
});

test("fixture ROCS rejects malformed and ontology-less inputs before build", async () => {
  const context = {
    workspaceRoot: "/fixture-workspace",
    workspaceRefMode: "loose" as const,
    resolveRefs: true,
  };
  const malformed = await createTempOntologyRepo();
  await writeFile(`${malformed}/ontology/src/system4d.yaml`, "ontology: []\n", "utf8");
  const rocs = createFixtureRocsPort();
  const malformedValidation = await rocs.validate(malformed, context);
  assert.equal(malformedValidation.ok, false);
  assert.match(malformedValidation.findings[0]?.message ?? "", /system4d/);
  await assert.rejects(rocs.build(malformed, context), /validation failed.*system4d/);

  const ontologyLess = await createTempRepoWithoutOntology();
  const missingValidation = await rocs.validate(ontologyLess, context);
  assert.equal(missingValidation.ok, false);
  assert.match(
    missingValidation.findings.map((finding) => finding.message).join(" "),
    /missing ontology manifest/,
  );
  await assert.rejects(rocs.build(ontologyLess, context), /validation failed.*manifest/);
});

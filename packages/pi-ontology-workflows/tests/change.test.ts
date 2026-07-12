// summary: "Verifies ontology change planning for concepts, bootstraps, manifests, bridges, and system4d entries."
// read_when:
//   - "Changing ontology change planners or their canonical file outputs."

import assert from "node:assert/strict";
import test from "node:test";
import { createFilesystemPort } from "../src/adapters/filesystem.ts";
import { planOntologyChange } from "../src/core/change.ts";
import {
  createFakeWorkspacePort,
  createTempOntologyRepo,
  createTempRepoWithoutOntology,
  createTempRootLayoutOntologyRepo,
} from "./helpers.ts";

const noopRocs = {
  async summary() {
    throw new Error("not used");
  },
  async validate() {
    throw new Error("not used");
  },
  async build() {
    throw new Error("not used");
  },
  async pack() {
    throw new Error("not used");
  },
};

test("planOntologyChange creates canonical concept docs for repo-local nested ontology layout", async () => {
  const repo = await createTempOntologyRepo();
  const result = await planOntologyChange(
    {
      mode: "plan",
      artifactKind: "concept",
      operation: "create",
      targetId: "demo.Agent",
      title: "Agent",
      description: "A deterministic test agent.",
      examples: ["automation helper"],
      antiExamples: ["random shell script"],
      notes: ["Keep naming stable"],
    },
    { cwd: repo },
    { files: createFilesystemPort(), rocs: noopRocs, workspace: createFakeWorkspacePort(repo) },
  );

  assert.equal(result.writes.length, 1);
  assert.equal(
    result.writes[0]?.path.endsWith("ontology/src/reference/concepts/demo.Agent.md"),
    true,
  );
  assert.match(result.writes[0]?.content ?? "", /A deterministic test agent\./);
  assert.match(result.writes[0]?.content ?? "", /## Examples/);
});

test("planOntologyChange creates canonical concept docs for root-layout ontology repos", async () => {
  const repo = await createTempRootLayoutOntologyRepo();
  const result = await planOntologyChange(
    {
      mode: "plan",
      artifactKind: "concept",
      operation: "create",
      targetId: "co.demo.Agent",
      title: "Agent",
      description: "A deterministic test agent.",
      examples: ["automation helper"],
      antiExamples: ["random shell script"],
    },
    { cwd: repo },
    { files: createFilesystemPort(), rocs: noopRocs, workspace: createFakeWorkspacePort(repo) },
  );

  assert.equal(result.writes.length, 1);
  assert.equal(result.writes[0]?.path.endsWith("src/reference/concepts/co.demo.Agent.md"), true);
  assert.equal(result.writes[0]?.path.includes("/ontology/src/"), false);
});

test("planOntologyChange bootstraps a repo-local ontology skeleton when none exists", async () => {
  const repo = await createTempRepoWithoutOntology();
  const result = await planOntologyChange(
    {
      mode: "plan",
      artifactKind: "bootstrap",
      operation: "create",
    },
    { cwd: repo },
    { files: createFilesystemPort(), rocs: noopRocs, workspace: createFakeWorkspacePort(repo) },
  );

  assert.equal(result.writes.length >= 7, true);
  assert.equal(
    result.writes.some((write) => write.path.endsWith("ontology/manifest.yaml")),
    true,
  );
  assert.equal(
    result.writes.some((write) => write.path.endsWith("ontology/src/system4d.yaml")),
    true,
  );
  assert.equal(
    result.writes.some((write) =>
      write.path.endsWith("ontology/src/reference/relations/README.md"),
    ),
    true,
  );
});

test("planOntologyChange creates repo-local manifests with default layers and profiles", async () => {
  const repo = await createTempRepoWithoutOntology();
  const result = await planOntologyChange(
    {
      mode: "plan",
      artifactKind: "manifest",
      operation: "create",
    },
    { cwd: repo },
    { files: createFilesystemPort(), rocs: noopRocs, workspace: createFakeWorkspacePort(repo) },
  );

  assert.equal(result.writes.length, 1);
  assert.equal(result.writes[0]?.path.endsWith("ontology/manifest.yaml"), true);
  assert.match(result.writes[0]?.content ?? "", /path: ontology\/src/);
  assert.match(result.writes[0]?.content ?? "", /default: repo-dev/);
});

test("planOntologyChange updates repo-local manifest profiles", async () => {
  const repo = await createTempOntologyRepo();
  const result = await planOntologyChange(
    {
      mode: "plan",
      artifactKind: "manifest",
      operation: "update",
      manifestDefaultProfile: "review",
      manifestProfiles: {
        review: {
          include_layers: ["core", "company"],
          exclude_layers: ["repo"],
          budget: 1600,
        },
      },
    },
    { cwd: repo },
    { files: createFilesystemPort(), rocs: noopRocs, workspace: createFakeWorkspacePort(repo) },
  );

  assert.equal(result.writes.length, 1);
  assert.match(result.writes[0]?.content ?? "", /default: review/);
  assert.match(result.writes[0]?.content ?? "", /review:/);
  assert.match(result.writes[0]?.content ?? "", /budget: 1600/);
});

test("planOntologyChange upserts bridge mappings", async () => {
  const repo = await createTempOntologyRepo();
  const result = await planOntologyChange(
    {
      mode: "plan",
      artifactKind: "bridge",
      operation: "upsert",
      bridgeMappings: [
        {
          concept_id: "demo.Agent",
          target: "src/agent.ts",
          kind: "symbol",
          note: "primary implementation",
        },
      ],
    },
    { cwd: repo },
    { files: createFilesystemPort(), rocs: noopRocs, workspace: createFakeWorkspacePort(repo) },
  );

  assert.match(result.writes[0]?.content ?? "", /demo.Agent/);
  assert.match(result.writes[0]?.content ?? "", /src\/agent.ts/);
});

test("planOntologyChange appends system4d entries", async () => {
  const repo = await createTempOntologyRepo();
  const result = await planOntologyChange(
    {
      mode: "plan",
      artifactKind: "system4d",
      operation: "upsert",
      system4dPath: "fog.risks",
      system4dAction: "append",
      system4dValue: {
        id: "DEMO-R-001",
        statement: "Test drift",
        mitigation: "Run package checks",
      },
    },
    { cwd: repo },
    { files: createFilesystemPort(), rocs: noopRocs, workspace: createFakeWorkspacePort(repo) },
  );

  assert.match(result.writes[0]?.content ?? "", /DEMO-R-001/);
  assert.match(result.writes[0]?.content ?? "", /Run package checks/);
});

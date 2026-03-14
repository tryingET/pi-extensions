import assert from "node:assert/strict";
import test from "node:test";
import { createFilesystemPort } from "../src/adapters/filesystem.ts";
import { planOntologyChange } from "../src/core/change.ts";
import { createFakeWorkspacePort, createTempOntologyRepo } from "./helpers.ts";

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

test("planOntologyChange creates canonical concept docs", async () => {
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

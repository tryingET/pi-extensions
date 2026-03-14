import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import { getCognitiveToolByName, listCognitiveTools } from "../src/runtime/cognitive-tools.ts";

function seedVault(vaultDir) {
  execFileSync("dolt", ["init", "-b", "main"], { cwd: vaultDir, encoding: "utf-8" });
  execFileSync(
    "dolt",
    [
      "sql",
      "-q",
      [
        "CREATE TABLE prompt_templates (",
        "name VARCHAR(64) PRIMARY KEY,",
        "artifact_kind VARCHAR(32) NOT NULL,",
        "description TEXT,",
        "content TEXT,",
        "status VARCHAR(16) NOT NULL",
        ");",
        "INSERT INTO prompt_templates VALUES",
        "('inversion','cognitive','Find hidden bugs','shadow analysis','active'),",
        "('audit','cognitive','Review quality','quality pass','active'),",
        "('builder-playbook','procedure','Build things','do work','active');",
      ].join(" "),
    ],
    { cwd: vaultDir, encoding: "utf-8" },
  );
}

test("cognitive tool queries use artifact_kind schema and return cognitive templates", async () => {
  const vaultDir = fs.mkdtempSync(path.join(os.tmpdir(), "pi-orch-vault-"));

  try {
    seedVault(vaultDir);

    const listed = await listCognitiveTools(vaultDir);
    assert.equal(listed.ok, true);
    if (listed.ok) {
      assert.deepEqual(
        listed.value.map((tool) => tool.name),
        ["audit", "inversion"],
      );
    }

    const inversion = await getCognitiveToolByName(vaultDir, "inversion");
    assert.equal(inversion.ok, true);
    if (inversion.ok) {
      assert.equal(inversion.value?.name, "inversion");
      assert.equal(inversion.value?.type, "cognitive");
      assert.equal(inversion.value?.content, "shadow analysis");
    }

    const procedure = await getCognitiveToolByName(vaultDir, "builder-playbook");
    assert.equal(procedure.ok, true);
    if (procedure.ok) {
      assert.equal(procedure.value, null);
    }
  } finally {
    fs.rmSync(vaultDir, { recursive: true, force: true });
  }
});

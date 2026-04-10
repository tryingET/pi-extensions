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
        "id INT PRIMARY KEY,",
        "name VARCHAR(64) NOT NULL,",
        "artifact_kind VARCHAR(32) NOT NULL,",
        "control_mode VARCHAR(32) NOT NULL,",
        "formalization_level VARCHAR(32) NOT NULL,",
        "owner_company VARCHAR(32) NOT NULL,",
        "visibility_companies JSON NOT NULL,",
        "controlled_vocabulary JSON,",
        "description TEXT,",
        "content TEXT,",
        "status VARCHAR(16) NOT NULL,",
        "export_to_pi BOOLEAN NOT NULL,",
        "version INT NOT NULL,",
        "UNIQUE KEY prompt_templates_name (name)",
        ");",
        "INSERT INTO prompt_templates VALUES",
        "(1,'inversion','cognitive','one_shot','bounded','software','[\"software\"]',NULL,'Find hidden bugs','shadow analysis','active',true,1),",
        "(2,'audit','cognitive','one_shot','bounded','software','[\"software\"]',NULL,'Review quality','quality pass','active',true,1),",
        "(3,'builder-playbook','procedure','one_shot','bounded','software','[\"software\"]',NULL,'Build things','do work','active',true,1);",
      ].join(" "),
    ],
    { cwd: vaultDir, encoding: "utf-8" },
  );
}

test("cognitive tool helpers keep metadata listing local but load prepared prompt bodies via the prompt-plane seam", async () => {
  const vaultDir = fs.mkdtempSync(path.join(os.tmpdir(), "pi-orch-vault-"));
  const previousVaultDir = process.env.VAULT_DIR;
  const previousPiCompany = process.env.PI_COMPANY;

  try {
    seedVault(vaultDir);
    process.env.VAULT_DIR = vaultDir;
    delete process.env.PI_COMPANY;

    const listed = await listCognitiveTools(vaultDir);
    assert.equal(listed.ok, true);
    if (listed.ok) {
      assert.deepEqual(
        listed.value.map((tool) => tool.name),
        ["audit", "inversion"],
      );
    }

    const inversion = await getCognitiveToolByName("inversion", { currentCompany: "software" });
    assert.equal(inversion.ok, true);
    if (inversion.ok) {
      assert.equal(inversion.value?.name, "inversion");
      assert.equal(inversion.value?.type, "cognitive");
      assert.equal(inversion.value?.content, "shadow analysis");
    }

    const procedure = await getCognitiveToolByName("builder-playbook", {
      currentCompany: "software",
    });
    assert.equal(procedure.ok, true);
    if (procedure.ok) {
      assert.equal(procedure.value, null);
    }

    const missingCompanyContext = await getCognitiveToolByName("inversion", {
      cwd: "/tmp/pi-orch-no-company-context",
    });
    assert.equal(missingCompanyContext.ok, false);
    if (!missingCompanyContext.ok) {
      assert.match(missingCompanyContext.error, /Explicit company context is required/);
    }
  } finally {
    if (previousVaultDir === undefined) {
      delete process.env.VAULT_DIR;
    } else {
      process.env.VAULT_DIR = previousVaultDir;
    }
    if (previousPiCompany === undefined) {
      delete process.env.PI_COMPANY;
    } else {
      process.env.PI_COMPANY = previousPiCompany;
    }
    fs.rmSync(vaultDir, { recursive: true, force: true });
  }
});

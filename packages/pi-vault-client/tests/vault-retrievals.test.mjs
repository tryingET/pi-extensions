import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { mkdtempSync, readFileSync } from "node:fs";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import {
  createTranspiledModuleHarness,
  PACKAGE_ROOT,
} from "./helpers/transpiled-module-harness.mjs";

function resolvePromptVaultSchema() {
  const candidates = [
    process.env.PROMPT_VAULT_SCHEMA,
    path.join(PACKAGE_ROOT, "tests/fixtures/prompt-vault/schema/schema.sql"),
    path.resolve(PACKAGE_ROOT, "../../../../../core/prompt-vault/schema/schema.sql"),
    path.join(os.homedir(), "ai-society/core/prompt-vault/schema/schema.sql"),
  ].filter((candidate) => typeof candidate === "string" && candidate.length > 0);
  for (const candidate of candidates) {
    try {
      readFileSync(candidate, "utf8");
      return candidate;
    } catch {
      // next candidate
    }
  }
  throw new Error("Could not locate prompt-vault schema.sql");
}

function run(command, args, options = {}) {
  const result = spawnSync(command, args, { encoding: "utf8", ...options });
  if (result.status !== 0) {
    throw new Error(`${command} failed: ${result.stderr || result.stdout}`);
  }
  return result.stdout;
}

test("logRetrievalBatch writes retrievals rows against schema v10 and stays fail-open", async () => {
  const dir = mkdtempSync(path.join(os.tmpdir(), "pi-vault-retrievals-"));
  run("dolt", ["init", "--name", "Test", "--email", "t@e.st"], { cwd: dir });
  run("dolt", ["--data-dir", ".", "sql", "-q", readFileSync(resolvePromptVaultSchema(), "utf8")], {
    cwd: dir,
  });
  run(
    "dolt",
    [
      "--data-dir",
      ".",
      "sql",
      "-q",
      "INSERT INTO prompt_templates (name, content, artifact_kind, control_mode, formalization_level, owner_company, visibility_companies, version) VALUES ('probe-a', 'x', 'cognitive', 'one_shot', 'workflow', 'core', '[\"core\"]', 1), ('probe-b', 'y', 'cognitive', 'one_shot', 'workflow', 'core', '[\"core\"]', 2)",
    ],
    { cwd: dir },
  );

  const harness = await createTranspiledModuleHarness({
    prefix: "vault-retrievals-",
    files: [
      "src/vaultTypes.ts",
      "src/companyContext.ts",
      "src/vaultSchema.ts",
      "src/vaultMutations.ts",
      "src/vaultFeedback.ts",
      "src/vaultDb.ts",
      "src/vaultReceipts.ts",
      "src/dispatchPosture.ts",
      "src/dispatchRuntime.ts",
      "src/templateRenderer.js",
    ],
  });
  process.env.VAULT_DIR = dir;
  process.env.PROMPT_VAULT_ROOT = path.dirname(path.dirname(resolvePromptVaultSchema()));
  try {
    const module = await harness.importModule("src/vaultDb.js");
    const runtimeFactory =
      module.createVaultRuntime ??
      module.default ??
      Object.values(module).find(
        (value) => typeof value === "function" && value.name === "createVaultRuntime",
      );
    assert.equal(typeof runtimeFactory, "function", "vault runtime factory found");
    const runtime = runtimeFactory({ vaultDir: dir });

    runtime.logRetrievalBatch(
      [
        { templateId: 1, entityVersion: 1, rank: 1 },
        { templateId: 2, entityVersion: 2, rank: 2 },
      ],
      {
        tool: "vault_query",
        queryContext: { filters: { artifact_kind: ["cognitive"] }, limit: 20 },
        resultCount: 2,
        company: "core",
      },
    );

    const rows = JSON.parse(
      run(
        "dolt",
        [
          "--data-dir",
          ".",
          "sql",
          "-r",
          "json",
          "-q",
          "SELECT entity_id, tool, selected_rank, result_count, company FROM retrievals ORDER BY id",
        ],
        { cwd: dir },
      ),
    ).rows;
    assert.equal(rows.length, 2);
    assert.deepEqual(
      rows.map((row) => [Number(row.entity_id), row.tool, Number(row.selected_rank)]),
      [
        [1, "vault_query", 1],
        [2, "vault_query", 2],
      ],
    );
    assert.equal(Number(rows[0].result_count), 2);
    assert.equal(rows[0].company, "core");

    // fail-open: invalid entries and a broken dolt dir must never throw
    runtime.logRetrievalBatch([{ templateId: Number.NaN }], { tool: "vault_retrieve" });
    process.env.VAULT_DIR = path.join(dir, "does-not-exist");
    runtime.logRetrievalBatch([{ templateId: 1, rank: 1 }], { tool: "vault_query" });
    assert.ok(true, "no throw surfaced from fail-open logging");
  } finally {
    delete process.env.VAULT_DIR;
  }
});

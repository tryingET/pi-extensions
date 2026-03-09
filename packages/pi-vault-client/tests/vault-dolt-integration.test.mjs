import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import { fileURLToPath, pathToFileURL } from "node:url";
import ts from "typescript";

const TEST_DIR = fileURLToPath(new URL(".", import.meta.url));
const PACKAGE_ROOT = path.resolve(TEST_DIR, "..");
const PROMPT_VAULT_SCHEMA = path.resolve(
  PACKAGE_ROOT,
  "../../../../../core/prompt-vault/schema/schema.sql",
);

function run(command, args, options = {}) {
  const result = spawnSync(command, args, {
    encoding: "utf8",
    ...options,
  });
  if (result.status !== 0) {
    throw new Error(
      `${command} ${args.join(" ")} failed (${String(result.status)}): ${result.stderr || result.stdout}`,
    );
  }
  return result;
}

function setupTempVaultRepo() {
  const dir = mkdtempSync(path.join(os.tmpdir(), "pi-vault-dolt-"));
  run("dolt", ["init", "--name", "Test User", "--email", "test@example.com"], { cwd: dir });
  run("dolt", ["sql"], {
    cwd: dir,
    input: readFileSync(PROMPT_VAULT_SCHEMA, "utf8"),
  });
  return dir;
}

function createTranspiledVaultModules() {
  const baseDir = path.join(PACKAGE_ROOT, ".tmp-test");
  mkdirSync(baseDir, { recursive: true });
  const tempDir = mkdtempSync(path.join(baseDir, "vault-dolt-"));

  for (const relativePath of ["src/vaultTypes.ts", "src/vaultDb.ts", "src/templateRenderer.js"]) {
    const sourcePath = path.join(PACKAGE_ROOT, relativePath);
    const source = readFileSync(sourcePath, "utf8");
    const outputPath = path.join(tempDir, relativePath.replace(/\.ts$/, ".js"));
    mkdirSync(path.dirname(outputPath), { recursive: true });

    if (relativePath.endsWith(".ts")) {
      const transpiled = ts.transpileModule(source, {
        compilerOptions: {
          module: ts.ModuleKind.ESNext,
          target: ts.ScriptTarget.ES2022,
        },
        fileName: sourcePath,
      }).outputText;
      writeFileSync(outputPath, transpiled, "utf8");
      continue;
    }

    writeFileSync(outputPath, source, "utf8");
  }

  return {
    async importModule(relativePath) {
      return import(
        `${pathToFileURL(path.join(tempDir, relativePath)).href}?t=${Date.now()}-${Math.random()}`
      );
    },
    cleanup() {
      rmSync(tempDir, { recursive: true, force: true });
    },
  };
}

async function withTempVaultRuntime(runTest) {
  const repoDir = setupTempVaultRepo();
  const modules = createTranspiledVaultModules();
  const originalVaultDir = process.env.VAULT_DIR;
  const originalPromptVaultRoot = process.env.PROMPT_VAULT_ROOT;
  const originalPiCompany = process.env.PI_COMPANY;

  try {
    process.env.VAULT_DIR = repoDir;
    process.env.PROMPT_VAULT_ROOT = path.dirname(path.dirname(PROMPT_VAULT_SCHEMA));
    delete process.env.PI_COMPANY;

    return await runTest({
      repoDir,
      importModule: modules.importModule,
    });
  } finally {
    modules.cleanup();
    rmSync(repoDir, { recursive: true, force: true });
    if (originalVaultDir === undefined) delete process.env.VAULT_DIR;
    else process.env.VAULT_DIR = originalVaultDir;
    if (originalPromptVaultRoot === undefined) delete process.env.PROMPT_VAULT_ROOT;
    else process.env.PROMPT_VAULT_ROOT = originalPromptVaultRoot;
    if (originalPiCompany === undefined) delete process.env.PI_COMPANY;
    else process.env.PI_COMPANY = originalPiCompany;
  }
}

test("vault runtime supports end-to-end execution-bound feedback in a real temp dolt repo", async () => {
  await withTempVaultRuntime(async ({ importModule }) => {
    const { createVaultRuntime } = await importModule("src/vaultDb.js");
    const runtime = createVaultRuntime();

    assert.equal(runtime.checkSchemaVersion(), true);

    const insertResult = runtime.insertTemplate(
      "demo-template",
      "Demo body",
      "Demo description",
      "procedure",
      "one_shot",
      "structured",
      "software",
      ["software"],
      null,
      { actorCompany: "software", allowAmbientCwdFallback: false },
    );
    assert.equal(insertResult.status, "ok");

    const template = runtime.getTemplate("demo-template", { currentCompany: "software" });
    assert.ok(template);
    if (!template) return;

    runtime.logExecution(template, "unit-test-model", "ctx");

    const executionLookup = runtime.queryVaultJsonDetailed(`
      SELECT id, entity_version FROM executions
      WHERE entity_type = 'template' AND entity_id = ${template.id}
      ORDER BY created_at DESC, id DESC
      LIMIT 1
    `);
    assert.equal(executionLookup.ok, true);
    if (!executionLookup.ok) return;
    assert.equal(executionLookup.value.rows.length, 1);

    const executionId = Number(executionLookup.value.rows[0].id);
    const firstRating = runtime.rateTemplate(executionId, 5, true, "solid", {
      actorCompany: "software",
      allowAmbientCwdFallback: false,
    });
    assert.deepEqual(firstRating.ok, true);
    assert.match(firstRating.message, /Recorded rating 5\/5 for execution/);

    const duplicateRating = runtime.rateTemplate(executionId, 4, true, "duplicate", {
      actorCompany: "software",
      allowAmbientCwdFallback: false,
    });
    assert.deepEqual(duplicateRating.ok, false);
    assert.match(duplicateRating.message, /Feedback already exists for execution/);

    const feedbackRows = runtime.queryVaultJsonDetailed(
      `SELECT execution_id, rating, notes FROM feedback WHERE execution_id = ${executionId}`,
    );
    assert.equal(feedbackRows.ok, true);
    if (!feedbackRows.ok) return;
    assert.equal(feedbackRows.value.rows.length, 1);
    assert.equal(Number(feedbackRows.value.rows[0].rating), 5);
    assert.equal(String(feedbackRows.value.rows[0].notes), "solid");
  });
});

import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import {
  createTranspiledModuleHarness,
  PACKAGE_ROOT,
} from "./helpers/transpiled-module-harness.mjs";

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
  return createTranspiledModuleHarness({
    prefix: "vault-dolt-",
    files: [
      "src/vaultTypes.ts",
      "src/companyContext.ts",
      "src/vaultSchema.ts",
      "src/vaultMutations.ts",
      "src/vaultFeedback.ts",
      "src/vaultDb.ts",
      "src/vaultReceipts.ts",
      "src/templateRenderer.js",
    ],
  });
}

async function withTempVaultRuntime(runTest) {
  const repoDir = setupTempVaultRepo();
  const modules = createTranspiledVaultModules();
  const originalVaultDir = process.env.VAULT_DIR;
  const originalPromptVaultRoot = process.env.PROMPT_VAULT_ROOT;
  const originalPiCompany = process.env.PI_COMPANY;
  const originalPiVaultTmpDir = process.env.PI_VAULT_TMPDIR;

  try {
    process.env.VAULT_DIR = repoDir;
    process.env.PROMPT_VAULT_ROOT = path.dirname(path.dirname(PROMPT_VAULT_SCHEMA));
    delete process.env.PI_COMPANY;
    delete process.env.PI_VAULT_TMPDIR;

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
    if (originalPiVaultTmpDir === undefined) delete process.env.PI_VAULT_TMPDIR;
    else process.env.PI_VAULT_TMPDIR = originalPiVaultTmpDir;
  }
}

test("vault runtime prefers repo-local temp before falling back to host tmp", async () => {
  await withTempVaultRuntime(async ({ importModule, repoDir }) => {
    const { createVaultRuntime } = await importModule("src/vaultDb.js");
    const runtime = createVaultRuntime();

    const environment = runtime.getDoltExecutionEnvironment();
    assert.match(environment.source, /^vault:\./);
    assert.notEqual(environment.source, "os.tmpdir()");
    assert.equal(environment.attempts.at(-1)?.ok, true);
    if (environment.source === "vault:.tmp") {
      assert.equal(existsSync(path.join(repoDir, ".tmp")), true);
    }
    assert.equal(runtime.checkSchemaVersion(), true);
  });
});

test("inspect-mode dolt diagnostics do not create repo-local temp directories", async () => {
  await withTempVaultRuntime(async ({ importModule, repoDir }) => {
    const { createVaultRuntime } = await importModule("src/vaultDb.js");
    const runtime = createVaultRuntime();

    assert.equal(existsSync(path.join(repoDir, ".tmp")), false);
    const environment = runtime.getDoltExecutionEnvironment({ probeMode: "inspect" });

    assert.equal(environment.probeMode, "inspect");
    assert.equal(environment.source, "vault:.tmp");
    assert.equal(environment.attempts.at(-1)?.wouldCreate, true);
    assert.equal(existsSync(path.join(repoDir, ".tmp")), false);
  });
});

test("vault runtime honors explicit PI_VAULT_TMPDIR when it is writable", async () => {
  await withTempVaultRuntime(async ({ importModule }) => {
    const explicitRoot = mkdtempSync(path.join(os.tmpdir(), "pi-vault-explicit-tmp-"));
    const explicitTempDir = path.join(explicitRoot, "nested", "vault-tmp");

    try {
      process.env.PI_VAULT_TMPDIR = explicitTempDir;
      const { createVaultRuntime } = await importModule("src/vaultDb.js");
      const runtime = createVaultRuntime();

      const environment = runtime.getDoltExecutionEnvironment();
      assert.equal(environment.source, "env:PI_VAULT_TMPDIR");
      assert.equal(environment.tempDir, explicitTempDir);
      assert.equal(environment.attempts[0]?.source, "env:PI_VAULT_TMPDIR");
      assert.equal(environment.attempts[0]?.ok, true);
      assert.equal(environment.attempts[0]?.created, true);
      assert.equal(runtime.checkSchemaVersion(), true);
    } finally {
      rmSync(explicitRoot, { recursive: true, force: true });
    }
  });
});

test("vault runtime falls back from an invalid PI_VAULT_TMPDIR to repo-local temp", async () => {
  await withTempVaultRuntime(async ({ importModule, repoDir }) => {
    process.env.PI_VAULT_TMPDIR = path.join(repoDir, ".dolt", "config.json", "blocked-child");
    const { createVaultRuntime } = await importModule("src/vaultDb.js");
    const runtime = createVaultRuntime();

    const environment = runtime.getDoltExecutionEnvironment();
    assert.match(environment.source, /^vault:\./);
    assert.notEqual(environment.source, "env:PI_VAULT_TMPDIR");
    assert.notEqual(environment.source, "os.tmpdir()");
    assert.equal(environment.attempts[0]?.source, "env:PI_VAULT_TMPDIR");
    assert.equal(environment.attempts[0]?.ok, false);
    assert.match(String(environment.attempts[0]?.error), /ENOTDIR|not a directory/i);
    assert.equal(environment.attempts.at(-1)?.ok, true);
    assert.equal(runtime.checkSchemaVersion(), true);
  });
});

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

test("vault runtime can still rate an archived execution when a local receipt preserves visibility provenance", async () => {
  await withTempVaultRuntime(async ({ importModule }) => {
    const { createVaultRuntime } = await importModule("src/vaultDb.js");
    const { createPreparedExecutionToken, createVaultReceiptManager, withPreparedExecutionMarker } =
      await importModule("src/vaultReceipts.js");
    const runtime = createVaultRuntime();
    const receiptDir = mkdtempSync(path.join(os.tmpdir(), "pi-vault-receipt-rate-"));

    try {
      const receipts = createVaultReceiptManager(runtime, {
        filePath: path.join(receiptDir, "vault-execution-receipts.jsonl"),
      });
      const insertResult = runtime.insertTemplate(
        "receipt-demo",
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

      const template = runtime.getTemplate("receipt-demo", { currentCompany: "software" });
      assert.ok(template);
      if (!template) return;

      const executionToken = createPreparedExecutionToken();
      receipts.queuePreparedExecution({
        execution_token: executionToken,
        queued_at: new Date().toISOString(),
        invocation: {
          surface: "/vault",
          channel: "slash-command",
          selection_mode: "exact",
          llm_tool_call: null,
        },
        template: {
          id: template.id,
          name: template.name,
          version: template.version,
          artifact_kind: template.artifact_kind,
          control_mode: template.control_mode,
          formalization_level: template.formalization_level,
          owner_company: template.owner_company,
          visibility_companies: [...template.visibility_companies],
        },
        company: {
          current_company: "software",
          company_source: "explicit:test",
        },
        render: {
          engine: "none",
          explicit_engine: null,
          context_appended: false,
          append_context_section: true,
          used_render_keys: [],
        },
        prepared: { text: "Demo body" },
        replay_safe_inputs: {
          kind: "vault-selection",
          query: template.name,
          context: "",
        },
        input_context: "",
      });

      const finalized = receipts.finalizePreparedExecution(
        withPreparedExecutionMarker("Demo body", executionToken),
        "unit-test-model",
      );
      assert.equal(finalized.status, "matched");
      if (finalized.status !== "matched") return;

      runtime.execVault("UPDATE prompt_templates SET status='archived' WHERE name='receipt-demo'");

      const rating = runtime.rateTemplate(
        finalized.receipt.execution_id,
        5,
        true,
        "still visible via receipt",
        { actorCompany: "software", allowAmbientCwdFallback: false },
        { executionReceipt: finalized.receipt },
      );
      assert.equal(rating.ok, true);
      assert.match(rating.message, /Recorded rating 5\/5/);
    } finally {
      rmSync(receiptDir, { recursive: true, force: true });
    }
  });
});

test("vault runtime rejects forged local receipt identity when execution template id does not match", async () => {
  await withTempVaultRuntime(async ({ importModule }) => {
    const { createVaultRuntime } = await importModule("src/vaultDb.js");
    const runtime = createVaultRuntime();

    const insertResult = runtime.insertTemplate(
      "forge-check",
      "body",
      "desc",
      "procedure",
      "one_shot",
      "structured",
      "finance",
      ["finance"],
      null,
      { actorCompany: "finance", allowAmbientCwdFallback: false },
    );
    assert.equal(insertResult.status, "ok");

    const template = runtime.getTemplate("forge-check", { currentCompany: "finance" });
    assert.ok(template);
    if (!template) return;

    const execution = runtime.logExecution(template, "unit-test-model", "ctx");
    assert.equal(execution.ok, true);
    if (!execution.ok) return;

    const forgedReceipt = {
      schema_version: 1,
      receipt_kind: "vault_execution",
      execution_id: execution.executionId,
      recorded_at: execution.createdAt,
      invocation: {
        surface: "/vault",
        channel: "slash-command",
        selection_mode: "exact",
        llm_tool_call: null,
      },
      template: {
        id: Number(template.id) + 999,
        name: "forged-template",
        version: template.version,
        artifact_kind: template.artifact_kind,
        control_mode: template.control_mode,
        formalization_level: template.formalization_level,
        owner_company: "finance",
        visibility_companies: ["finance"],
      },
      company: {
        current_company: "finance",
        company_source: "forged",
      },
      model: { id: "unit-test-model" },
      render: {
        engine: "none",
        explicit_engine: null,
        context_appended: false,
        append_context_section: true,
        used_render_keys: [],
      },
      prepared: {
        text: "body",
        sha256: "forged",
        edited_after_prepare: false,
      },
      replay_safe_inputs: {
        kind: "vault-selection",
        query: template.name,
        context: "",
      },
    };

    const rating = runtime.rateTemplate(
      execution.executionId,
      5,
      true,
      "forged",
      { actorCompany: "finance", allowAmbientCwdFallback: false },
      { executionReceipt: forgedReceipt },
    );
    assert.equal(rating.ok, false);
    assert.match(rating.message, /Execution receipt template mismatch/);
  });
});

test("vault runtime centralizes active + company-visible reads independent of export_to_pi", async () => {
  await withTempVaultRuntime(async ({ importModule, repoDir }) => {
    const { createVaultRuntime } = await importModule("src/vaultDb.js");
    const runtime = createVaultRuntime();

    run(
      "dolt",
      [
        "sql",
        "-q",
        `INSERT INTO prompt_templates (name, description, content, artifact_kind, control_mode, formalization_level, owner_company, visibility_companies, controlled_vocabulary, status, export_to_pi, version)
         VALUES
           ('visible-template', 'visible', 'visible body', 'procedure', 'one_shot', 'structured', 'software', '["software"]', NULL, 'active', true, 1),
           ('hidden-template', 'hidden', 'hidden body', 'procedure', 'one_shot', 'structured', 'software', '["software"]', NULL, 'active', false, 1)`,
      ],
      { cwd: repoDir },
    );

    const visible = runtime.getTemplate("visible-template", { currentCompany: "software" });
    assert.ok(visible);
    assert.equal(visible?.export_to_pi, true);

    const hidden = runtime.getTemplate("hidden-template", { currentCompany: "software" });
    assert.ok(hidden);
    assert.equal(hidden?.export_to_pi, false);

    const listResult = runtime.listTemplatesDetailed(
      undefined,
      { currentCompany: "software", requireExplicitCompany: true },
      { includeContent: false },
    );
    assert.equal(listResult.ok, true);
    if (!listResult.ok) return;
    assert.deepEqual(
      listResult.value.map((template) => template.name),
      ["hidden-template", "visible-template"],
    );
    assert.equal(listResult.value[0]?.content, "");

    const searchResult = runtime.searchTemplatesDetailed(
      "template",
      { currentCompany: "software", requireExplicitCompany: true },
      { includeContent: false },
    );
    assert.equal(searchResult.ok, true);
    if (!searchResult.ok) return;
    assert.deepEqual(
      searchResult.value.map((template) => template.name),
      ["hidden-template", "visible-template"],
    );

    const retrieveResult = runtime.retrieveByNamesDetailed(
      ["visible-template", "hidden-template"],
      false,
      { currentCompany: "software", requireExplicitCompany: true },
    );
    assert.equal(retrieveResult.ok, true);
    if (!retrieveResult.ok) return;
    assert.deepEqual(
      retrieveResult.value.map((template) => template.name),
      ["hidden-template", "visible-template"],
    );

    const queryResult = runtime.queryTemplatesDetailed({}, 10, false, {
      currentCompany: "software",
      requireExplicitCompany: true,
    });
    assert.equal(queryResult.ok, true);
    if (!queryResult.ok) return;
    assert.deepEqual(
      queryResult.value.map((template) => template.name),
      ["hidden-template", "visible-template"],
    );

    const strictRead = runtime.listTemplatesDetailed(undefined, {
      cwd: "/tmp",
      requireExplicitCompany: true,
    });
    assert.equal(strictRead.ok, false);
    if (strictRead.ok) return;
    assert.match(
      strictRead.error,
      /Explicit company context is required for visibility-sensitive vault reads/,
    );
  });
});

test("vault runtime refreshes governed contracts when ontology files change in-process", async () => {
  const tempRoot = mkdtempSync(path.join(os.tmpdir(), "pi-vault-contracts-"));
  const modules = createTranspiledVaultModules();
  const originalVaultDir = process.env.VAULT_DIR;
  const originalPromptVaultRoot = process.env.PROMPT_VAULT_ROOT;

  try {
    mkdirSync(path.join(tempRoot, "prompt-vault-db"), { recursive: true });
    mkdirSync(path.join(tempRoot, "ontology"), { recursive: true });
    writeFileSync(
      path.join(tempRoot, "ontology", "v2-contract.json"),
      JSON.stringify({
        facets: {
          artifact_kind: ["procedure"],
          control_mode: ["one_shot"],
          formalization_level: ["structured"],
        },
      }),
    );
    writeFileSync(
      path.join(tempRoot, "ontology", "controlled-vocabulary-contract.json"),
      JSON.stringify({
        dimensions: {
          routing_context: ["a"],
          activity_phase: ["a"],
          input_artifact: ["a"],
          transition_target_type: ["a"],
          selection_principles: ["a"],
          output_commitment: ["a"],
        },
        router_required_dimensions: ["routing_context"],
      }),
    );
    writeFileSync(
      path.join(tempRoot, "ontology", "company-visibility-contract.json"),
      JSON.stringify({
        companies: ["software"],
        defaults: { owner_company: "software", visibility_companies: ["software"] },
      }),
    );

    process.env.VAULT_DIR = path.join(tempRoot, "prompt-vault-db");
    process.env.PROMPT_VAULT_ROOT = tempRoot;

    const { createVaultRuntime } = await modules.importModule("src/vaultDb.js");
    const runtime = createVaultRuntime();
    assert.deepEqual(runtime.getContracts().ontology.facets.artifact_kind, ["procedure"]);

    await new Promise((resolve) => setTimeout(resolve, 10));
    writeFileSync(
      path.join(tempRoot, "ontology", "v2-contract.json"),
      JSON.stringify({
        facets: {
          artifact_kind: ["session"],
          control_mode: ["loop"],
          formalization_level: ["workflow"],
        },
      }),
    );

    assert.deepEqual(runtime.getContracts().ontology.facets.artifact_kind, ["session"]);
    assert.deepEqual(runtime.getContracts().ontology.facets.control_mode, ["loop"]);
  } finally {
    modules.cleanup();
    rmSync(tempRoot, { recursive: true, force: true });
    if (originalVaultDir === undefined) delete process.env.VAULT_DIR;
    else process.env.VAULT_DIR = originalVaultDir;
    if (originalPromptVaultRoot === undefined) delete process.env.PROMPT_VAULT_ROOT;
    else process.env.PROMPT_VAULT_ROOT = originalPromptVaultRoot;
  }
});

test("vault runtime exposes detailed schema compatibility diagnostics for v9", async () => {
  await withTempVaultRuntime(async ({ importModule, repoDir }) => {
    const { createVaultRuntime } = await importModule("src/vaultDb.js");
    const runtime = createVaultRuntime();

    const okReport = runtime.checkSchemaCompatibilityDetailed();
    assert.equal(okReport.ok, true);
    assert.equal(okReport.expectedVersion, 9);
    assert.equal(okReport.actualVersion, 9);
    assert.deepEqual(okReport.missingPromptTemplateColumns, []);
    assert.deepEqual(okReport.missingExecutionColumns, []);
    assert.deepEqual(okReport.missingFeedbackColumns, []);

    run("dolt", ["sql", "-q", "ALTER TABLE executions DROP COLUMN output_text"], { cwd: repoDir });

    const mismatchReport = runtime.checkSchemaCompatibilityDetailed();
    assert.equal(mismatchReport.ok, false);
    assert.equal(mismatchReport.expectedVersion, 9);
    assert.equal(mismatchReport.actualVersion, 9);
    assert.deepEqual(mismatchReport.missingExecutionColumns, ["output_text"]);
  });
});

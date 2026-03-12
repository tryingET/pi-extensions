import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { createHash } from "node:crypto";
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

function sha256(text) {
  return createHash("sha256").update(text, "utf8").digest("hex");
}

function setupTempVaultRepo() {
  const dir = mkdtempSync(path.join(os.tmpdir(), "pi-vault-replay-dolt-"));
  run("dolt", ["init", "--name", "Test User", "--email", "test@example.com"], { cwd: dir });
  run("dolt", ["sql"], {
    cwd: dir,
    input: readFileSync(PROMPT_VAULT_SCHEMA, "utf8"),
  });
  return dir;
}

function createTranspiledReplayModules() {
  const baseDir = path.join(PACKAGE_ROOT, ".tmp-test");
  mkdirSync(baseDir, { recursive: true });
  const tempDir = mkdtempSync(path.join(baseDir, "vault-replay-"));

  for (const relativePath of [
    "src/vaultTypes.ts",
    "src/vaultDb.ts",
    "src/vaultReceipts.ts",
    "src/vaultReplay.ts",
    "src/vaultRoute.ts",
    "src/vaultGrounding.ts",
    "src/templatePreparationCompat.js",
    "src/templateRenderer.js",
  ]) {
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
  const modules = createTranspiledReplayModules();
  const originalVaultDir = process.env.VAULT_DIR;
  const originalPromptVaultRoot = process.env.PROMPT_VAULT_ROOT;
  const originalPiCompany = process.env.PI_COMPANY;

  try {
    process.env.VAULT_DIR = repoDir;
    process.env.PROMPT_VAULT_ROOT = path.dirname(path.dirname(PROMPT_VAULT_SCHEMA));
    delete process.env.PI_COMPANY;
    return await runTest({ repoDir, importModule: modules.importModule });
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

function makeBaseReceipt(template, preparedText, overrides = {}) {
  return {
    schema_version: 1,
    receipt_kind: "vault_execution",
    execution_id: 501,
    recorded_at: "2026-03-12T06:20:00.000Z",
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
    model: { id: "unit-test-model" },
    render: {
      engine: "none",
      explicit_engine: null,
      context_appended: false,
      append_context_section: true,
      used_render_keys: [],
    },
    prepared: {
      text: preparedText,
      sha256: sha256(preparedText),
      edited_after_prepare: false,
    },
    replay_safe_inputs: {
      kind: "vault-selection",
      query: template.name,
      context: "",
    },
    ...overrides,
  };
}

test("replay core reports match for a same-version /vault receipt", async () => {
  await withTempVaultRuntime(async ({ importModule }) => {
    const { createVaultRuntime } = await importModule("src/vaultDb.js");
    const { createVaultReceiptManager, createPreparedExecutionToken, withPreparedExecutionMarker } =
      await importModule("src/vaultReceipts.js");
    const { replayVaultExecutionById } = await importModule("src/vaultReplay.js");
    const { prepareTemplateForExecutionCompat } = await importModule(
      "src/templatePreparationCompat.js",
    );
    const runtime = createVaultRuntime();
    const receiptDir = mkdtempSync(path.join(os.tmpdir(), "pi-vault-replay-receipts-"));

    try {
      const receipts = createVaultReceiptManager(runtime, {
        filePath: path.join(receiptDir, "vault-execution-receipts.jsonl"),
      });
      const insertResult = runtime.insertTemplate(
        "replay-match",
        "---\nrender_engine: nunjucks\n---\nCompany: {{ current_company }}\nContext: {{ context }}",
        "Replay match template",
        "procedure",
        "one_shot",
        "structured",
        "software",
        ["software"],
        null,
        { actorCompany: "software", allowAmbientCwdFallback: false },
      );
      assert.equal(insertResult.status, "ok");

      const template = runtime.getTemplate("replay-match", { currentCompany: "software" });
      assert.ok(template);
      if (!template) return;

      const prepared = prepareTemplateForExecutionCompat(template.content, {
        currentCompany: "software",
        context: "receipt replay",
        templateName: template.name,
        appendContextSection: true,
        allowLegacyPiVarsAutoDetect: false,
      });
      assert.equal(prepared.ok, true);
      if (!prepared.ok) return;

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
          engine: prepared.engine,
          explicit_engine: prepared.explicitEngine,
          context_appended: prepared.contextAppended,
          append_context_section: true,
          used_render_keys: prepared.usedRenderKeys,
        },
        prepared: {
          text: prepared.prepared,
        },
        replay_safe_inputs: {
          kind: "vault-selection",
          query: template.name,
          context: "receipt replay",
        },
        input_context: "receipt replay",
      });

      const finalized = receipts.finalizePreparedExecution(
        withPreparedExecutionMarker(prepared.prepared, executionToken),
        "unit-test-model",
      );
      assert.equal(finalized.status, "matched");
      if (finalized.status !== "matched") return;

      const replay = replayVaultExecutionById(runtime, receipts, finalized.receipt.execution_id, {
        currentCompany: "software",
      });
      assert.equal(replay.status, "match");
      assert.deepEqual(replay.reasons, []);
      assert.equal(replay.matches_prepared_text, true);
      assert.equal(replay.matches_prepared_sha256, true);
      assert.equal(replay.regenerated?.text, prepared.prepared);
    } finally {
      rmSync(receiptDir, { recursive: true, force: true });
    }
  });
});

test("replay core reports drift when the recorded template version changes", async () => {
  await withTempVaultRuntime(async ({ importModule }) => {
    const { createVaultRuntime } = await importModule("src/vaultDb.js");
    const { createVaultReceiptManager, createPreparedExecutionToken, withPreparedExecutionMarker } =
      await importModule("src/vaultReceipts.js");
    const { replayVaultExecutionById } = await importModule("src/vaultReplay.js");
    const { prepareTemplateForExecutionCompat } = await importModule(
      "src/templatePreparationCompat.js",
    );
    const runtime = createVaultRuntime();
    const receiptDir = mkdtempSync(path.join(os.tmpdir(), "pi-vault-replay-receipts-"));

    try {
      const receipts = createVaultReceiptManager(runtime, {
        filePath: path.join(receiptDir, "vault-execution-receipts.jsonl"),
      });
      const insertResult = runtime.insertTemplate(
        "replay-drift",
        "---\nrender_engine: nunjucks\n---\nCompany: {{ current_company }}\nContext: {{ context }}",
        "Replay drift template",
        "procedure",
        "one_shot",
        "structured",
        "software",
        ["software"],
        null,
        { actorCompany: "software", allowAmbientCwdFallback: false },
      );
      assert.equal(insertResult.status, "ok");

      const template = runtime.getTemplate("replay-drift", { currentCompany: "software" });
      assert.ok(template);
      if (!template) return;

      const prepared = prepareTemplateForExecutionCompat(template.content, {
        currentCompany: "software",
        context: "version drift",
        templateName: template.name,
        appendContextSection: true,
        allowLegacyPiVarsAutoDetect: false,
      });
      assert.equal(prepared.ok, true);
      if (!prepared.ok) return;

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
          engine: prepared.engine,
          explicit_engine: prepared.explicitEngine,
          context_appended: prepared.contextAppended,
          append_context_section: true,
          used_render_keys: prepared.usedRenderKeys,
        },
        prepared: {
          text: prepared.prepared,
        },
        replay_safe_inputs: {
          kind: "vault-selection",
          query: template.name,
          context: "version drift",
        },
        input_context: "version drift",
      });
      const finalized = receipts.finalizePreparedExecution(
        withPreparedExecutionMarker(prepared.prepared, executionToken),
        "unit-test-model",
      );
      assert.equal(finalized.status, "matched");
      if (finalized.status !== "matched") return;

      const updateResult = runtime.updateTemplate(
        "replay-drift",
        {
          content:
            "---\nrender_engine: nunjucks\n---\nChanged: {{ current_company }} / {{ context }}",
        },
        { actorCompany: "software", allowAmbientCwdFallback: false },
      );
      assert.equal(updateResult.status, "ok");

      const replay = replayVaultExecutionById(runtime, receipts, finalized.receipt.execution_id, {
        currentCompany: "software",
      });
      assert.equal(replay.status, "drift");
      assert.match(replay.reasons.join(","), /version-mismatch/);
      assert.match(replay.reasons.join(","), /render-mismatch/);
    } finally {
      rmSync(receiptDir, { recursive: true, force: true });
    }
  });
});

test("replay core reports unavailable when the recorded template is no longer visible", async () => {
  await withTempVaultRuntime(async ({ importModule }) => {
    const { createVaultRuntime } = await importModule("src/vaultDb.js");
    const { replayVaultExecutionReceipt } = await importModule("src/vaultReplay.js");
    const runtime = createVaultRuntime();

    const insertResult = runtime.insertTemplate(
      "replay-missing-template",
      "Body",
      "Replay missing template",
      "procedure",
      "one_shot",
      "structured",
      "software",
      ["software"],
      null,
      { actorCompany: "software", allowAmbientCwdFallback: false },
    );
    assert.equal(insertResult.status, "ok");

    const template = runtime.getTemplate("replay-missing-template", { currentCompany: "software" });
    assert.ok(template);
    if (!template) return;

    const receipt = makeBaseReceipt(template, "Body");
    runtime.execVault(
      "UPDATE prompt_templates SET status='archived' WHERE name='replay-missing-template'",
    );

    const replay = replayVaultExecutionReceipt(runtime, receipt, { currentCompany: "software" });
    assert.equal(replay.status, "unavailable");
    assert.deepEqual(replay.reasons, ["template-missing"]);
  });
});

test("replay core reports unavailable for bad company context", async () => {
  await withTempVaultRuntime(async ({ importModule }) => {
    const { createVaultRuntime } = await importModule("src/vaultDb.js");
    const { replayVaultExecutionReceipt } = await importModule("src/vaultReplay.js");
    const runtime = createVaultRuntime();

    const insertResult = runtime.insertTemplate(
      "replay-company-mismatch",
      "Body",
      "Replay bad company",
      "procedure",
      "one_shot",
      "structured",
      "software",
      ["software"],
      null,
      { actorCompany: "software", allowAmbientCwdFallback: false },
    );
    assert.equal(insertResult.status, "ok");

    const template = runtime.getTemplate("replay-company-mismatch", { currentCompany: "software" });
    assert.ok(template);
    if (!template) return;

    const receipt = makeBaseReceipt(template, "Body");
    const replay = replayVaultExecutionReceipt(runtime, receipt, { currentCompany: "finance" });
    assert.equal(replay.status, "unavailable");
    assert.deepEqual(replay.reasons, ["company-mismatch"]);
  });
});

test("replay core reports unavailable for missing input contract", async () => {
  await withTempVaultRuntime(async ({ importModule }) => {
    const { createVaultRuntime } = await importModule("src/vaultDb.js");
    const { replayVaultExecutionReceipt } = await importModule("src/vaultReplay.js");
    const runtime = createVaultRuntime();

    const insertResult = runtime.insertTemplate(
      "replay-missing-input",
      "Body",
      "Replay missing input",
      "procedure",
      "one_shot",
      "structured",
      "software",
      ["software"],
      null,
      { actorCompany: "software", allowAmbientCwdFallback: false },
    );
    assert.equal(insertResult.status, "ok");

    const template = runtime.getTemplate("replay-missing-input", { currentCompany: "software" });
    assert.ok(template);
    if (!template) return;

    const receipt = makeBaseReceipt(template, "Body", {
      replay_safe_inputs: {
        kind: "unknown-kind",
      },
    });
    const replay = replayVaultExecutionReceipt(runtime, receipt, { currentCompany: "software" });
    assert.equal(replay.status, "unavailable");
    assert.deepEqual(replay.reasons, ["missing-input-contract"]);
  });
});

test("replay core replays /route receipts through the shared route wrapper", async () => {
  await withTempVaultRuntime(async ({ importModule }) => {
    const { createVaultRuntime } = await importModule("src/vaultDb.js");
    const { replayVaultExecutionReceipt } = await importModule("src/vaultReplay.js");
    const { prepareRoutePrompt, getRoutePromptShapeForChannel } =
      await importModule("src/vaultRoute.js");
    const runtime = createVaultRuntime();

    const insertResult = runtime.insertTemplate(
      "meta-orchestration",
      "---\nrender_engine: nunjucks\n---\nCompany: {{ current_company }}\nContext: {{ context }}",
      "Route template",
      "procedure",
      "one_shot",
      "structured",
      "software",
      ["software"],
      null,
      { actorCompany: "software", allowAmbientCwdFallback: false },
    );
    assert.equal(insertResult.status, "ok");

    const template = runtime.getTemplate("meta-orchestration", { currentCompany: "software" });
    assert.ok(template);
    if (!template) return;

    const prepared = prepareRoutePrompt(template, {
      context: "release drift",
      currentCompany: "software",
      shape: getRoutePromptShapeForChannel("slash-command"),
    });
    assert.equal(prepared.ok, true);
    if (!prepared.ok) return;

    const receipt = makeBaseReceipt(template, prepared.prompt, {
      execution_id: 701,
      invocation: {
        surface: "/route",
        channel: "slash-command",
        selection_mode: "fixed-template",
        llm_tool_call: null,
      },
      render: {
        engine: prepared.prepared.engine,
        explicit_engine: prepared.prepared.explicitEngine,
        context_appended: prepared.prepared.contextAppended,
        append_context_section: false,
        used_render_keys: prepared.prepared.usedRenderKeys,
      },
      replay_safe_inputs: {
        kind: "route-request",
        context: "release drift",
      },
    });

    const replay = replayVaultExecutionReceipt(runtime, receipt, { currentCompany: "software" });
    assert.equal(replay.status, "match");
    assert.deepEqual(replay.reasons, []);
    assert.equal(replay.regenerated?.text, prepared.prompt);
  });
});

test("grounding replay uses stored framework resolution instead of rediscovery", async () => {
  await withTempVaultRuntime(async ({ importModule }) => {
    const { createVaultRuntime } = await importModule("src/vaultDb.js");
    const { replayVaultExecutionReceipt } = await importModule("src/vaultReplay.js");
    const { rebuildGroundedNext10PromptFromReplayInputs } =
      await importModule("src/vaultGrounding.js");
    const runtime = createVaultRuntime();

    for (const [name, content] of [
      ["next-10-expert-suggestions", "Use $1 / $2 / $3 / $4"],
      ["nexus", "Nexus for {{ current_company }}"],
      ["inversion", "Inversion for {{ current_company }}"],
    ]) {
      const insertResult = runtime.insertTemplate(
        name,
        content,
        `${name} description`,
        name === "next-10-expert-suggestions" ? "procedure" : "cognitive",
        "one_shot",
        "structured",
        "software",
        ["software"],
        null,
        { actorCompany: "software", allowAmbientCwdFallback: false },
      );
      assert.equal(insertResult.status, "ok");
    }

    const template = runtime.getTemplate("next-10-expert-suggestions", {
      currentCompany: "software",
    });
    assert.ok(template);
    if (!template) return;

    const replaySafeInputs = {
      kind: "grounding-request",
      command_text:
        '/next-10-expert-suggestions "ship replay" "verification" "lite" "frameworks=nexus|inversion"',
      objective: "ship replay",
      workflow: "verification",
      mode: "lite",
      extras: "frameworks=nexus|inversion",
      framework_resolution: {
        selected_names: ["nexus", "inversion"],
        retrieval_method: "exact",
        discovery_used: 0,
        invalid_overrides: [],
        warnings: [],
      },
    };
    const grounded = rebuildGroundedNext10PromptFromReplayInputs(runtime, replaySafeInputs, {
      currentCompany: "software",
      companySource: "explicit:test",
    });
    assert.equal(grounded.ok, true);
    if (!grounded.ok) return;

    const receipt = makeBaseReceipt(template, grounded.prompt, {
      execution_id: 801,
      invocation: {
        surface: "grounding",
        channel: "input-transform",
        selection_mode: "fixed-template",
        llm_tool_call: null,
      },
      render: {
        engine: grounded.prepared.engine,
        explicit_engine: grounded.prepared.explicitEngine,
        context_appended: grounded.prepared.contextAppended,
        append_context_section: false,
        used_render_keys: grounded.prepared.usedRenderKeys,
      },
      replay_safe_inputs: replaySafeInputs,
    });

    const replay = replayVaultExecutionReceipt(runtime, receipt, { currentCompany: "software" });
    assert.equal(replay.status, "match");
    assert.deepEqual(replay.reasons, []);
    assert.equal(replay.regenerated?.text, grounded.prompt);
  });
});

test("formatted replay report captures drift details for operator review", async () => {
  await withTempVaultRuntime(async ({ importModule }) => {
    const { createVaultRuntime } = await importModule("src/vaultDb.js");
    const { createVaultReceiptManager, createPreparedExecutionToken, withPreparedExecutionMarker } =
      await importModule("src/vaultReceipts.js");
    const { replayVaultExecutionById, formatVaultReplayReport } =
      await importModule("src/vaultReplay.js");
    const { prepareTemplateForExecutionCompat } = await importModule(
      "src/templatePreparationCompat.js",
    );
    const runtime = createVaultRuntime();
    const receiptDir = mkdtempSync(path.join(os.tmpdir(), "pi-vault-replay-receipts-"));

    try {
      const receipts = createVaultReceiptManager(runtime, {
        filePath: path.join(receiptDir, "vault-execution-receipts.jsonl"),
      });
      const insertResult = runtime.insertTemplate(
        "replay-format-drift",
        "---\nrender_engine: nunjucks\n---\nCompany: {{ current_company }}\nContext: {{ context }}",
        "Replay formatted drift template",
        "procedure",
        "one_shot",
        "structured",
        "software",
        ["software"],
        null,
        { actorCompany: "software", allowAmbientCwdFallback: false },
      );
      assert.equal(insertResult.status, "ok");

      const template = runtime.getTemplate("replay-format-drift", { currentCompany: "software" });
      assert.ok(template);
      if (!template) return;

      const prepared = prepareTemplateForExecutionCompat(template.content, {
        currentCompany: "software",
        context: "operator drift review",
        templateName: template.name,
        appendContextSection: true,
        allowLegacyPiVarsAutoDetect: false,
      });
      assert.equal(prepared.ok, true);
      if (!prepared.ok) return;

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
          engine: prepared.engine,
          explicit_engine: prepared.explicitEngine,
          context_appended: prepared.contextAppended,
          append_context_section: true,
          used_render_keys: prepared.usedRenderKeys,
        },
        prepared: {
          text: prepared.prepared,
        },
        replay_safe_inputs: {
          kind: "vault-selection",
          query: template.name,
          context: "operator drift review",
        },
        input_context: "operator drift review",
      });

      const finalized = receipts.finalizePreparedExecution(
        withPreparedExecutionMarker(prepared.prepared, executionToken),
        "unit-test-model",
      );
      assert.equal(finalized.status, "matched");
      if (finalized.status !== "matched") return;

      const updateResult = runtime.updateTemplate(
        "replay-format-drift",
        {
          content:
            "---\nrender_engine: nunjucks\n---\nChanged company: {{ current_company }}\nChanged context: {{ context }}",
        },
        { actorCompany: "software", allowAmbientCwdFallback: false },
      );
      assert.equal(updateResult.status, "ok");

      const replay = replayVaultExecutionById(runtime, receipts, finalized.receipt.execution_id, {
        currentCompany: "software",
      });
      const formatted = formatVaultReplayReport(replay);

      assert.match(formatted, /# Vault Execution Replay/);
      assert.match(formatted, /status: drift/);
      assert.match(formatted, /reasons: .*version-mismatch/);
      assert.match(formatted, /reasons: .*render-mismatch/);
      assert.match(formatted, /recorded_template_version: 1/);
      assert.match(formatted, /current_template_version: 2/);
      assert.match(formatted, /## Stored Prepared Prompt/);
      assert.match(formatted, /## Regenerated Prepared Prompt/);
      assert.match(formatted, /Recorded template version 1; current version 2\./);
    } finally {
      rmSync(receiptDir, { recursive: true, force: true });
    }
  });
});

test("missing-receipt replay report preserves requested company context without template leakage", async () => {
  await withTempVaultRuntime(async ({ importModule }) => {
    const { createVaultRuntime } = await importModule("src/vaultDb.js");
    const { replayVaultExecutionById, formatVaultReplayReport } =
      await importModule("src/vaultReplay.js");
    const runtime = createVaultRuntime();

    const replay = replayVaultExecutionById(
      runtime,
      { readReceiptByExecutionId: () => null },
      999999,
      { currentCompany: "software" },
    );
    const formatted = formatVaultReplayReport(replay);

    assert.equal(replay.status, "unavailable");
    assert.deepEqual(replay.reasons, ["receipt-missing"]);
    assert.match(formatted, /status: unavailable/);
    assert.match(formatted, /reasons: receipt-missing/);
    assert.match(formatted, /current_company: software/);
    assert.match(formatted, /company_source: explicit:currentCompany/);
    assert.match(formatted, /template: \(unknown\)/);
    assert.doesNotMatch(formatted, /hidden-template/);
  });
});

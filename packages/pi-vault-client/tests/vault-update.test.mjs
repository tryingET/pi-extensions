import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { mkdtempSync, rmSync } from "node:fs";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import { withTranspiledModuleHarness } from "./helpers/transpiled-module-harness.mjs";

function makeContracts() {
  return {
    ontology: {
      facets: {
        artifact_kind: ["cognitive", "procedure", "session"],
        control_mode: ["one_shot", "router", "loop"],
        formalization_level: ["napkin", "bounded", "structured", "workflow"],
      },
    },
    controlledVocabulary: {
      dimensions: {
        routing_context: ["analysis_followup", "review_followup", "review_closeout"],
        activity_phase: ["post_analysis", "post_review", "closeout"],
        input_artifact: ["analysis_output", "review_findings", "review_summary"],
        transition_target_type: ["framework_mode"],
        selection_principles: ["evidence_based", "constraint_preserving", "minimal_change"],
        output_commitment: ["exact_next_prompt"],
      },
      router_required_dimensions: [
        "routing_context",
        "activity_phase",
        "input_artifact",
        "transition_target_type",
        "selection_principles",
        "output_commitment",
      ],
    },
    companyVisibility: {
      companies: ["core", "software", "finance"],
      defaults: {
        owner_company: "core",
        visibility_companies: ["core", "software", "finance"],
      },
    },
  };
}

function makeTemplate(overrides = {}) {
  return {
    id: 7,
    name: "analysis-router",
    description: "Original description",
    content: "Original content",
    artifact_kind: "procedure",
    control_mode: "router",
    formalization_level: "structured",
    owner_company: "core",
    visibility_companies: ["core", "software"],
    controlled_vocabulary: {
      routing_context: "review_followup",
      activity_phase: "post_review",
      input_artifact: "review_findings",
      transition_target_type: "framework_mode",
      selection_principles: ["constraint_preserving"],
      output_commitment: "exact_next_prompt",
    },
    status: "active",
    export_to_pi: true,
    version: 1,
    ...overrides,
  };
}

function sha256(text) {
  return createHash("sha256").update(text, "utf8").digest("hex");
}

function makeReplayReceipt(template, preparedText, overrides = {}) {
  return {
    schema_version: 1,
    receipt_kind: "vault_execution",
    execution_id: 41,
    recorded_at: "2026-03-12T12:00:00.000Z",
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
      company_source: "cwd:/tmp/softwareco/owned/demo",
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

async function withVaultModules(run) {
  return withTranspiledModuleHarness(
    {
      prefix: "vault-update-",
      files: [
        "src/vaultTypes.ts",
        "src/companyContext.ts",
        "src/vaultSchema.ts",
        "src/vaultMutations.ts",
        "src/vaultFeedback.ts",
        "src/vaultDb.ts",
        "src/doltDiagnostics.ts",
        "src/vaultTools.ts",
        "src/vaultReceipts.ts",
        "src/vaultReplay.ts",
        "src/vaultRoute.ts",
        "src/vaultGrounding.ts",
        "src/templatePreparationCompat.js",
        "src/templateRenderer.js",
      ],
    },
    run,
  );
}

test("vault runtime resolves company from explicit cwd without shared session state", async () => {
  await withVaultModules(async ({ importModule }) => {
    const { createVaultRuntime } = await importModule("src/vaultDb.js");
    const runtime = createVaultRuntime();

    assert.equal(
      runtime.getCurrentCompany(
        "/tmp/work/softwareco/owned/pi-extensions/packages/pi-vault-client",
      ),
      "software",
    );
    assert.equal(runtime.getCurrentCompany("/tmp/work/finance/reports"), "finance");
    assert.equal(typeof runtime.setSessionCwd, "undefined");
    assert.equal(typeof runtime.getSessionCwd, "undefined");
  });
});

test("vault_update tool registers with an exact-name patch contract", async () => {
  await withVaultModules(async ({ importModule }) => {
    const { registerVaultTools } = await importModule("src/vaultTools.js");
    const tools = new Map();
    const pi = {
      registerTool(tool) {
        tools.set(tool.name, tool);
      },
    };

    registerVaultTools(pi, {
      updateTemplate() {
        return { status: "ok", message: "updated", templateId: 7 };
      },
    });

    const tool = tools.get("vault_update");
    assert.ok(tool);
    assert.deepEqual(tool.parameters.required, ["name"]);
    for (const field of [
      "content",
      "description",
      "artifact_kind",
      "control_mode",
      "formalization_level",
      "owner_company",
      "visibility_companies",
      "controlled_vocabulary",
    ]) {
      assert.ok(tool.parameters.properties[field], `expected property ${field}`);
    }
    assert.equal(tool.parameters.properties.new_name, undefined);
  });
});

test("vault_executions and vault_rate use execution-bound provenance contracts", async () => {
  await withVaultModules(async ({ importModule }) => {
    const { registerVaultTools } = await importModule("src/vaultTools.js");
    const tools = new Map();
    const pi = {
      registerTool(tool) {
        tools.set(tool.name, tool);
      },
    };

    registerVaultTools(pi, {
      queryVaultJsonDetailed() {
        return { ok: true, value: { rows: [] }, error: null };
      },
      buildVisibilityPredicate() {
        return "1 = 1";
      },
      escapeSql(value) {
        return String(value);
      },
      resolveCurrentCompanyContext(cwd) {
        return {
          company: cwd?.includes("softwareco") ? "software" : "core",
          source: cwd ? `cwd:${cwd}` : "contract-default",
        };
      },
      rateTemplate() {
        return { ok: true, message: "rated" };
      },
    });

    const replayTool = tools.get("vault_replay");
    assert.ok(replayTool);
    assert.deepEqual(replayTool.parameters.required, ["execution_id"]);
    assert.equal(replayTool.parameters.properties.execution_id?.type, "number");

    const executionsTool = tools.get("vault_executions");
    assert.ok(executionsTool);
    assert.equal(executionsTool.parameters.properties.template_name?.type, "string");

    const rateTool = tools.get("vault_rate");
    assert.ok(rateTool);
    assert.deepEqual(rateTool.parameters.required, ["execution_id", "rating", "success"]);
    assert.equal(rateTool.parameters.properties.execution_id?.type, "number");
    assert.equal(rateTool.parameters.properties.template_name, undefined);
  });
});

test("vault_executions warns when DB execution rows are unavailable but local receipts exist", async () => {
  await withVaultModules(async ({ importModule }) => {
    const { registerVaultTools } = await importModule("src/vaultTools.js");
    const tools = new Map();
    const pi = {
      registerTool(tool) {
        tools.set(tool.name, tool);
      },
    };

    registerVaultTools(
      pi,
      {
        resolveCurrentCompanyContext(cwd) {
          return {
            company: cwd?.includes("softwareco") ? "software" : "core",
            source: cwd ? `cwd:${cwd}` : "contract-default",
          };
        },
        buildActiveVisibleTemplatePredicate() {
          return "1 = 1";
        },
        escapeSql(value) {
          return String(value);
        },
        queryVaultJsonDetailed() {
          return { ok: false, value: null, error: "db-down" };
        },
      },
      {
        readReceiptByExecutionId() {
          return null;
        },
        readTrustedReceiptByExecutionId() {
          return null;
        },
        listRecentReceipts(options) {
          assert.equal(options?.trustedOnly, true);
          return [
            {
              execution_id: 41,
              template: {
                name: "nexus",
                version: 3,
                owner_company: "software",
                artifact_kind: "cognitive",
                control_mode: "one_shot",
                formalization_level: "structured",
                visibility_companies: ["software"],
              },
              model: { id: "unit-model" },
              recorded_at: "2026-03-22T00:00:00.000Z",
            },
          ];
        },
      },
    );

    const executionsTool = tools.get("vault_executions");
    assert.ok(executionsTool);
    const result = await executionsTool.execute("call-1", { limit: 5 }, undefined, undefined, {
      cwd: "/tmp/softwareco/owned/demo",
    });

    const text = result.content[0]?.text || "";
    assert.match(text, /WARNING: executions DB query failed \(db-down\)/);
    assert.match(text, /\| 41 \| nexus \| 3 \| software \|/);
    assert.equal(result.details.ok, true);
    assert.equal(result.details.partial, true);
    assert.equal(result.details.error, "db-down");
  });
});

test("vault_replay tool surfaces drift and unavailable replay classifications", async () => {
  await withVaultModules(async ({ importModule }) => {
    const { registerVaultTools } = await importModule("src/vaultTools.js");
    const tools = new Map();
    const baseTemplate = makeTemplate({
      name: "replay-template",
      content: "Stable prompt",
      owner_company: "software",
      visibility_companies: ["core", "software"],
      control_mode: "one_shot",
      formalization_level: "workflow",
    });
    const scenarios = [
      {
        currentCompany: "software",
        receipt: makeReplayReceipt(baseTemplate, "Stable prompt"),
        templateResult: {
          ok: true,
          value: { ...baseTemplate, version: 2, content: "Changed prompt" },
          error: null,
        },
        expectedStatus: "drift",
        expectedReasons: ["version-mismatch", "render-mismatch"],
      },
      {
        currentCompany: "finance",
        receipt: makeReplayReceipt(baseTemplate, "Stable prompt"),
        templateResult: { ok: true, value: baseTemplate, error: null },
        expectedStatus: "unavailable",
        expectedReasons: ["receipt-missing"],
      },
      {
        currentCompany: "software",
        receipt: makeReplayReceipt(baseTemplate, "Stable prompt"),
        templateResult: { ok: true, value: null, error: null },
        expectedStatus: "unavailable",
        expectedReasons: ["template-missing"],
      },
      {
        currentCompany: "software",
        receipt: makeReplayReceipt(baseTemplate, "Stable prompt", {
          replay_safe_inputs: { kind: "unknown-kind" },
        }),
        templateResult: { ok: true, value: baseTemplate, error: null },
        expectedStatus: "unavailable",
        expectedReasons: ["missing-input-contract"],
      },
    ];
    let scenario = scenarios[0];
    const pi = {
      registerTool(tool) {
        tools.set(tool.name, tool);
      },
    };

    registerVaultTools(
      pi,
      {
        resolveCurrentCompanyContext(cwd) {
          return {
            company: scenario.currentCompany,
            source: cwd ? `cwd:${cwd}` : "contract-default",
          };
        },
        getTemplateDetailed() {
          return scenario.templateResult;
        },
      },
      {
        readTrustedReceiptByExecutionId(executionId) {
          assert.equal(executionId, 41);
          return scenario.receipt;
        },
        listRecentReceipts() {
          return [];
        },
      },
    );

    const replayTool = tools.get("vault_replay");
    assert.ok(replayTool);

    for (const testScenario of scenarios) {
      scenario = testScenario;
      const result = await replayTool.execute(
        "call-1",
        { execution_id: 41 },
        undefined,
        undefined,
        { cwd: "/tmp/softwareco/owned/demo" },
      );
      const text = result.content[0]?.text || "";
      assert.match(text, new RegExp(`status: ${testScenario.expectedStatus}`));
      for (const reason of testScenario.expectedReasons) {
        assert.match(text, new RegExp(reason));
      }
      assert.equal(result.details.status, testScenario.expectedStatus);
    }
  });
});

test("vault_replay hides non-visible receipts as missing", async () => {
  await withVaultModules(async ({ importModule }) => {
    const { registerVaultTools } = await importModule("src/vaultTools.js");
    const tools = new Map();
    const hiddenReceipt = makeReplayReceipt(
      makeTemplate({
        name: "hidden-template",
        owner_company: "software",
        visibility_companies: ["software"],
        control_mode: "one_shot",
      }),
      "Hidden prompt",
    );
    const pi = {
      registerTool(tool) {
        tools.set(tool.name, tool);
      },
    };

    registerVaultTools(
      pi,
      {
        resolveCurrentCompanyContext(cwd) {
          return {
            company: "finance",
            source: cwd ? `cwd:${cwd}` : "contract-default",
          };
        },
        getTemplateDetailed() {
          throw new Error("template lookup should not run for non-visible receipts");
        },
      },
      {
        readTrustedReceiptByExecutionId() {
          return hiddenReceipt;
        },
        listRecentReceipts() {
          return [];
        },
      },
    );

    const replayTool = tools.get("vault_replay");
    const result = await replayTool.execute("call-1", { execution_id: 41 }, undefined, undefined, {
      cwd: "/tmp/softwareco/owned/demo",
    });

    const text = result.content[0]?.text || "";
    assert.match(text, /status: unavailable/);
    assert.match(text, /reasons: receipt-missing/);
    assert.match(text, /current_company: finance/);
    assert.doesNotMatch(text, /hidden-template/);
    assert.equal(result.details.status, "unavailable");
  });
});

test("vault_schema_diagnostics reports detailed compatibility in headless tool mode", async () => {
  await withVaultModules(async ({ importModule }) => {
    const { registerVaultDiagnosticsTool } = await importModule("src/vaultTools.js");
    const tools = new Map();
    const pi = {
      registerTool(tool) {
        tools.set(tool.name, tool);
      },
    };

    registerVaultDiagnosticsTool(pi, {
      checkSchemaCompatibilityDetailed() {
        return {
          ok: false,
          expectedVersion: 9,
          actualVersion: 8,
          missingPromptTemplateColumns: ["controlled_vocabulary"],
          missingExecutionColumns: ["output_capture_mode", "output_text"],
          missingFeedbackColumns: [],
        };
      },
      getDoltExecutionEnvironment() {
        return {
          tempDir: "/tmp/pi-vault",
          source: "vault:.dolt/tmp",
          attempts: [
            {
              source: "vault:.dolt/tmp",
              path: "/tmp/pi-vault",
              ok: true,
              created: false,
            },
          ],
        };
      },
      resolveCurrentCompanyContext(cwd) {
        return {
          company: cwd?.includes("softwareco") ? "software" : "core",
          source: cwd ? `cwd:${cwd}` : "contract-default",
        };
      },
    });

    const tool = tools.get("vault_schema_diagnostics");
    assert.ok(tool);
    const result = await tool.execute("call-1", {}, undefined, undefined, {
      cwd: "/tmp/softwareco/owned/demo",
    });

    const text = result.content[0]?.text || "";
    assert.match(text, /# Vault Schema Diagnostics/);
    assert.match(text, /schema_required: 9/);
    assert.match(text, /schema_actual: 8/);
    assert.match(text, /schema_status: mismatch/);
    assert.match(text, /missing_prompt_template_columns: controlled_vocabulary/);
    assert.match(text, /missing_execution_columns: output_capture_mode, output_text/);
    assert.match(text, /current_company: software/);
    assert.match(text, /dolt_temp_status: ok/);
    assert.match(text, /dolt_temp_source: vault:.dolt\/tmp/);
    assert.match(text, /dolt_temp_dir: \/tmp\/pi-vault/);
    assert.deepEqual(result.details.ok, false);
    assert.equal(result.details.doltTempStatus, "ok");
    assert.equal(result.details.doltTempSource, "vault:.dolt/tmp");
  });
});

test("vault_update forwards only provided patch fields and strict tool context to the runtime", async () => {
  await withVaultModules(async ({ importModule }) => {
    const { registerVaultTools } = await importModule("src/vaultTools.js");
    const tools = new Map();
    const calls = [];
    const pi = {
      registerTool(tool) {
        tools.set(tool.name, tool);
      },
    };

    registerVaultTools(pi, {
      updateTemplate(name, patch, context) {
        calls.push({ name, patch, context });
        return { status: "ok", message: `updated ${name}`, templateId: 11 };
      },
    });

    const tool = tools.get("vault_update");
    const result = await tool.execute(
      "call-1",
      {
        name: "analysis-router",
        description: "Refined router guidance",
        controlled_vocabulary: {
          output_commitment: "exact_next_prompt",
        },
      },
      undefined,
      undefined,
      { cwd: "/tmp/softwareco/owned/demo" },
    );

    assert.deepEqual(calls, [
      {
        name: "analysis-router",
        patch: {
          description: "Refined router guidance",
          controlled_vocabulary: {
            output_commitment: "exact_next_prompt",
          },
        },
        context: {
          cwd: "/tmp/softwareco/owned/demo",
          allowAmbientCwdFallback: false,
        },
      },
    ]);
    assert.equal(result.details.ok, true);
    assert.deepEqual(result.details.updatedFields, ["controlled_vocabulary", "description"]);
  });
});

test("vault_query forwards explicit tool execution context to the runtime", async () => {
  await withVaultModules(async ({ importModule }) => {
    const { registerVaultTools } = await importModule("src/vaultTools.js");
    const tools = new Map();
    const calls = [];
    const pi = {
      registerTool(tool) {
        tools.set(tool.name, tool);
      },
    };

    registerVaultTools(pi, {
      resolveCurrentCompanyContext(cwd) {
        return {
          company: cwd?.includes("softwareco") ? "software" : "core",
          source: cwd ? `cwd:${cwd}` : "contract-default",
        };
      },
      queryTemplatesDetailed(filters, limit, includeContent, context) {
        calls.push({ filters, limit, includeContent, context });
        return { ok: true, value: [], error: null };
      },
    });

    const tool = tools.get("vault_query");
    const result = await tool.execute(
      "call-1",
      { artifact_kind: ["procedure"], limit: 7 },
      undefined,
      undefined,
      { cwd: "/tmp/softwareco/owned/demo" },
    );

    assert.equal(calls.length, 1);
    assert.equal(calls[0].limit, 7);
    assert.equal(calls[0].includeContent, false);
    assert.equal(calls[0].context.cwd, "/tmp/softwareco/owned/demo");
    assert.equal(calls[0].context.currentCompany, "software");
    assert.equal(result.details.currentCompany, "software");
    assert.equal(result.details.currentCompanySource, "cwd:/tmp/softwareco/owned/demo");
  });
});

test("vault_retrieve forwards explicit tool execution context to the runtime", async () => {
  await withVaultModules(async ({ importModule }) => {
    const { registerVaultTools } = await importModule("src/vaultTools.js");
    const tools = new Map();
    const calls = [];
    const pi = {
      registerTool(tool) {
        tools.set(tool.name, tool);
      },
    };

    registerVaultTools(pi, {
      resolveCurrentCompanyContext(cwd) {
        return {
          company: cwd?.includes("softwareco") ? "software" : "core",
          source: cwd ? `cwd:${cwd}` : "contract-default",
        };
      },
      retrieveByNamesDetailed(names, includeContent, context) {
        calls.push({ names, includeContent, context });
        return { ok: true, value: [], error: null };
      },
    });

    const tool = tools.get("vault_retrieve");
    const result = await tool.execute(
      "call-1",
      { names: ["nexus"], include_content: true },
      undefined,
      undefined,
      { cwd: "/tmp/softwareco/owned/demo" },
    );

    assert.deepEqual(calls, [
      {
        names: ["nexus"],
        includeContent: true,
        context: {
          cwd: "/tmp/softwareco/owned/demo",
          currentCompany: "software",
          companySource: "cwd:/tmp/softwareco/owned/demo",
        },
      },
    ]);
    assert.equal(result.details.currentCompany, "software");
  });
});

test("vault tool reads fail closed without explicit company context", async () => {
  await withVaultModules(async ({ importModule }) => {
    const { registerVaultTools } = await importModule("src/vaultTools.js");
    const tools = new Map();
    const pi = {
      registerTool(tool) {
        tools.set(tool.name, tool);
      },
    };

    registerVaultTools(pi, {
      resolveCurrentCompanyContext() {
        return { company: "core", source: "contract-default" };
      },
      queryTemplatesDetailed() {
        throw new Error("query should not run without explicit company context");
      },
    });

    const tool = tools.get("vault_query");
    const result = await tool.execute("call-1", { limit: 1 }, undefined, undefined, undefined);

    assert.equal(result.details.ok, false);
    assert.match(result.content[0]?.text || "", /Explicit company context is required/);
  });
});

test("vault_query rejects cross-company visibility overrides on the tool surface", async () => {
  await withVaultModules(async ({ importModule }) => {
    const { registerVaultTools } = await importModule("src/vaultTools.js");
    const tools = new Map();
    const pi = {
      registerTool(tool) {
        tools.set(tool.name, tool);
      },
    };

    registerVaultTools(pi, {
      resolveCurrentCompanyContext(cwd) {
        return {
          company: cwd?.includes("softwareco") ? "software" : "core",
          source: cwd ? `cwd:${cwd}` : "contract-default",
        };
      },
      queryTemplatesDetailed() {
        throw new Error("query should not run for cross-company visibility override");
      },
    });

    const tool = tools.get("vault_query");
    const result = await tool.execute(
      "call-1",
      { visibility_company: "finance" },
      undefined,
      undefined,
      { cwd: "/tmp/softwareco/owned/demo" },
    );

    assert.equal(result.details.ok, false);
    assert.match(result.content[0]?.text || "", /Cross-company visibility overrides are rejected/);
  });
});

test("vault_insert and vault_rate forward strict mutation context to the runtime", async () => {
  await withVaultModules(async ({ importModule }) => {
    const { registerVaultTools } = await importModule("src/vaultTools.js");
    const tools = new Map();
    const calls = [];
    const pi = {
      registerTool(tool) {
        tools.set(tool.name, tool);
      },
    };

    registerVaultTools(pi, {
      insertTemplate(...args) {
        calls.push({ method: "insertTemplate", context: args.at(-1) });
        return { status: "ok", message: "inserted", templateId: 1 };
      },
      rateTemplate(...args) {
        calls.push({
          method: "rateTemplate",
          executionId: args[0],
          rating: args[1],
          success: args[2],
          notes: args[3],
          context: args[4],
          options: args[5],
        });
        return { ok: true, message: "rated" };
      },
    });

    const insertTool = tools.get("vault_insert");
    await insertTool.execute(
      "call-1",
      {
        name: "analysis-router",
        content: "body",
        artifact_kind: "procedure",
        control_mode: "one_shot",
        formalization_level: "structured",
        owner_company: "software",
        visibility_companies: ["software"],
      },
      undefined,
      undefined,
      { cwd: "/tmp/softwareco/owned/demo" },
    );

    const rateTool = tools.get("vault_rate");
    await rateTool.execute(
      "call-2",
      { execution_id: 42, rating: 4, success: true, notes: "solid" },
      undefined,
      undefined,
      { cwd: "/tmp/softwareco/owned/demo" },
    );

    assert.deepEqual(calls, [
      {
        method: "insertTemplate",
        context: {
          cwd: "/tmp/softwareco/owned/demo",
          allowAmbientCwdFallback: false,
        },
      },
      {
        method: "rateTemplate",
        executionId: 42,
        rating: 4,
        success: true,
        notes: "solid",
        context: {
          cwd: "/tmp/softwareco/owned/demo",
          allowAmbientCwdFallback: false,
        },
        options: {
          executionReceipt: null,
          executionReceiptVerificationKeys: [],
        },
      },
    ]);
  });
});

test("resolveMutationActorContext fails closed without explicit company context", async () => {
  await withVaultModules(async ({ importModule }) => {
    const { resolveMutationActorContext } = await importModule("src/vaultDb.js");
    const originalCwd = process.cwd();
    const originalPiCompany = process.env.PI_COMPANY;
    const originalVaultCompany = process.env.VAULT_CURRENT_COMPANY;
    const tempNeutralDir = mkdtempSync(path.join(os.tmpdir(), "vault-neutral-cwd-"));

    try {
      delete process.env.PI_COMPANY;
      delete process.env.VAULT_CURRENT_COMPANY;
      process.chdir(tempNeutralDir);
      assert.deepEqual(resolveMutationActorContext(), {
        status: "error",
        message:
          "Explicit company context is required for vault mutations. Set PI_COMPANY or run from a company-scoped cwd.",
      });
    } finally {
      process.chdir(originalCwd);
      rmSync(tempNeutralDir, { recursive: true, force: true });
      if (originalPiCompany === undefined) delete process.env.PI_COMPANY;
      else process.env.PI_COMPANY = originalPiCompany;
      if (originalVaultCompany === undefined) delete process.env.VAULT_CURRENT_COMPANY;
      else process.env.VAULT_CURRENT_COMPANY = originalVaultCompany;
    }
  });
});

test("resolveMutationActorContext can disable ambient process cwd fallback", async () => {
  await withVaultModules(async ({ importModule }) => {
    const { resolveMutationActorContext } = await importModule("src/vaultDb.js");
    const originalPiCompany = process.env.PI_COMPANY;
    const originalVaultCompany = process.env.VAULT_CURRENT_COMPANY;

    try {
      delete process.env.PI_COMPANY;
      delete process.env.VAULT_CURRENT_COMPANY;
      assert.deepEqual(resolveMutationActorContext({ allowAmbientCwdFallback: false }), {
        status: "error",
        message:
          "Explicit company context is required for vault mutations. Set PI_COMPANY or run from a company-scoped cwd.",
      });
    } finally {
      if (originalPiCompany === undefined) delete process.env.PI_COMPANY;
      else process.env.PI_COMPANY = originalPiCompany;
      if (originalVaultCompany === undefined) delete process.env.VAULT_CURRENT_COMPANY;
      else process.env.VAULT_CURRENT_COMPANY = originalVaultCompany;
    }
  });
});

test("authorizeTemplateInsert requires owner_company to match the active mutation company", async () => {
  await withVaultModules(async ({ importModule }) => {
    const { authorizeTemplateInsert } = await importModule("src/vaultDb.js");

    assert.equal(authorizeTemplateInsert("software", "software"), null);
    assert.equal(
      authorizeTemplateInsert("core", "software"),
      "owner_company must match the active mutation company (software) for vault_insert",
    );
  });
});

test("authorizeTemplateUpdate is owner-only and blocks owner reassignment", async () => {
  await withVaultModules(async ({ importModule }) => {
    const { authorizeTemplateUpdate } = await importModule("src/vaultDb.js");
    const existing = makeTemplate({ owner_company: "core" });

    assert.equal(authorizeTemplateUpdate(existing, existing, "core"), null);
    assert.equal(
      authorizeTemplateUpdate(existing, existing, "software"),
      "Template is owned by core; active mutation company software cannot update it.",
    );
    assert.equal(
      authorizeTemplateUpdate(existing, { ...existing, owner_company: "software" }, "core"),
      "owner_company cannot be reassigned via vault_update",
    );
  });
});

test("prepareTemplateUpdate fails when the target template is missing", async () => {
  await withVaultModules(async ({ importModule }) => {
    const { prepareTemplateUpdate } = await importModule("src/vaultDb.js");
    const result = prepareTemplateUpdate(
      "missing-template",
      null,
      { description: "New description" },
      makeContracts(),
    );

    assert.deepEqual(result, {
      status: "error",
      message: "Template not found: missing-template",
    });
  });
});

test("prepareTemplateUpdate fails when no update fields are provided", async () => {
  await withVaultModules(async ({ importModule }) => {
    const { prepareTemplateUpdate } = await importModule("src/vaultDb.js");
    const result = prepareTemplateUpdate("analysis-router", makeTemplate(), {}, makeContracts());

    assert.equal(result.status, "error");
    assert.match(result.message, /No update fields provided/);
  });
});

test("prepareTemplateUpdate merges only the provided fields", async () => {
  await withVaultModules(async ({ importModule }) => {
    const { prepareTemplateUpdate } = await importModule("src/vaultDb.js");
    const result = prepareTemplateUpdate(
      "analysis-router",
      makeTemplate(),
      {
        description: "Refined router guidance",
        controlled_vocabulary: {
          selection_principles: ["minimal_change"],
        },
      },
      makeContracts(),
    );

    assert.equal(result.status, "ok");
    if (result.status !== "ok") return;

    assert.equal(result.merged.description, "Refined router guidance");
    assert.equal(result.merged.content, "Original content");
    assert.equal(result.merged.owner_company, "core");
    assert.deepEqual(result.merged.visibility_companies, ["core", "software"]);
    assert.deepEqual(result.merged.controlled_vocabulary, {
      routing_context: "review_followup",
      activity_phase: "post_review",
      input_artifact: "review_findings",
      transition_target_type: "framework_mode",
      selection_principles: ["minimal_change"],
      output_commitment: "exact_next_prompt",
    });
  });
});

test("prepareTemplateUpdate revalidates governed updated fields", async () => {
  await withVaultModules(async ({ importModule }) => {
    const { prepareTemplateUpdate } = await importModule("src/vaultDb.js");
    const result = prepareTemplateUpdate(
      "analysis-router",
      makeTemplate(),
      {
        controlled_vocabulary: {
          output_commitment: "freeform_next_step",
        },
      },
      makeContracts(),
    );

    assert.deepEqual(result, {
      status: "error",
      message: "Unknown controlled_vocabulary.output_commitment value: freeform_next_step",
    });
  });
});

test("validateTemplateContent rejects blank and frontmatter-only bodies", async () => {
  await withVaultModules(async ({ importModule }) => {
    const { validateTemplateContent } = await importModule("src/vaultDb.js");

    assert.equal(validateTemplateContent("   \n\t  "), "content must be non-empty");
    assert.equal(
      validateTemplateContent(`---\nrender_engine: none\n---\n   `),
      "content body must be non-empty after frontmatter",
    );
  });
});

test("validateTemplateContent rejects unsupported explicit render engines at mutation time", async () => {
  await withVaultModules(async ({ importModule }) => {
    const { validateTemplateContent, prepareTemplateUpdate } = await importModule("src/vaultDb.js");

    assert.equal(
      validateTemplateContent(`---\nrender_engine: liquid\n---\nBody`),
      "Unsupported render_engine: liquid",
    );

    const result = prepareTemplateUpdate(
      "analysis-router",
      makeTemplate(),
      { content: `---\nrender_engine: liquid\n---\nBody` },
      makeContracts(),
    );
    assert.deepEqual(result, {
      status: "error",
      message: "Unsupported render_engine: liquid",
    });
  });
});

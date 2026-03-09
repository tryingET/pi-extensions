import assert from "node:assert/strict";
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import { fileURLToPath, pathToFileURL } from "node:url";
import ts from "typescript";

const TEST_DIR = fileURLToPath(new URL(".", import.meta.url));
const PACKAGE_ROOT = path.resolve(TEST_DIR, "..");

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

function createTranspiledVaultModules() {
  const baseDir = path.join(PACKAGE_ROOT, ".tmp-test");
  mkdirSync(baseDir, { recursive: true });
  const tempDir = mkdtempSync(path.join(baseDir, "vault-update-"));

  for (const relativePath of [
    "src/vaultTypes.ts",
    "src/vaultDb.ts",
    "src/vaultTools.ts",
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

async function withVaultModules(run) {
  const modules = createTranspiledVaultModules();
  try {
    return await run(modules);
  } finally {
    modules.cleanup();
  }
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
          context: args.at(-1),
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

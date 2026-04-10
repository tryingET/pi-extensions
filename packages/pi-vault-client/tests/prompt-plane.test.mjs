import assert from "node:assert/strict";
import test from "node:test";
import packageJson from "../package.json" with { type: "json" };
import { createVaultPromptPlaneRuntime } from "../src/promptPlane.js";

function template(overrides = {}) {
  return {
    name: "analysis-router",
    description: "analysis",
    content:
      "---\nrender_engine: nunjucks\n---\nCompany={{ current_company }}\nContext={{ context }}",
    artifact_kind: "procedure",
    control_mode: "router",
    formalization_level: "structured",
    owner_company: "software",
    visibility_companies: ["software"],
    controlled_vocabulary: null,
    version: 3,
    id: 7,
    ...overrides,
  };
}

function ok(value) {
  return { ok: true, value, error: null };
}

function createRuntime(options = {}) {
  const templates = new Map(
    (options.templates || [template()]).map((entry) => [String(entry.name), entry]),
  );
  const search = options.search || {};
  return {
    resolveCurrentCompanyContext(cwd) {
      return (
        options.companyContext || {
          company: cwd?.includes("finance") ? "finance" : "software",
          source: cwd ? `cwd:${cwd}` : "env:PI_COMPANY",
        }
      );
    },
    getTemplateDetailed(name, context) {
      if (typeof options.onGetTemplateDetailed === "function") {
        options.onGetTemplateDetailed(name, context);
      }
      return ok(templates.get(String(name)) || null);
    },
    searchTemplatesDetailed(query, context) {
      if (typeof options.onSearchTemplatesDetailed === "function") {
        options.onSearchTemplatesDetailed(query, context);
      }
      return ok(search[String(query)] || []);
    },
  };
}

test("package exports expose the supported prompt-plane seam", () => {
  assert.equal(packageJson.exports["./prompt-plane"].default, "./src/promptPlane.js");
  assert.equal(packageJson.exports["./prompt-plane"].types, "./src/promptPlane.d.ts");
});

test("createVaultPromptPlaneRuntime prepares exact visible selections through package-owned render rules", async () => {
  const runtime = createVaultPromptPlaneRuntime({
    runtime: createRuntime({
      onGetTemplateDetailed(_name, context) {
        assert.equal(context.currentCompany, "software");
        assert.equal(context.requireExplicitCompany, true);
      },
    }),
  });

  const result = await runtime.prepareSelection(
    {
      query: "analysis-router",
      context: "Need a bounded review",
    },
    { currentCompany: "software", cwd: "/tmp/software/project" },
  );

  assert.equal(result.ok, true);
  assert.equal(result.status, "ready");
  assert.equal(result.selection_mode, "exact");
  assert.equal(result.template?.name, "analysis-router");
  assert.match(result.prepared_text || "", /Company=software/);
  assert.match(result.prepared_text || "", /Context=Need a bounded review/);
  assert.deepEqual(result.render, {
    engine: "nunjucks",
    explicit_engine: "nunjucks",
    context_appended: false,
    used_render_keys: ["current_company", "context"],
  });
});

test("prompt-plane seam fails closed without explicit company context", async () => {
  const runtime = createVaultPromptPlaneRuntime({
    runtime: createRuntime({
      companyContext: { company: "software", source: "contract-default" },
    }),
  });

  const result = await runtime.prepareSelection({ query: "analysis-router" }, { cwd: "/tmp/any" });

  assert.equal(result.ok, false);
  assert.equal(result.status, "blocked");
  assert.match(result.blocking_reason || "", /Explicit company context is required/);
});

test("query-based prompt selection reports ambiguous visible matches instead of inventing a choice", async () => {
  const runtime = createVaultPromptPlaneRuntime({
    runtime: createRuntime({
      templates: [],
      search: {
        analysis: [template({ name: "analysis-router" }), template({ name: "analysis-review" })],
      },
    }),
  });

  const result = await runtime.prepareSelection(
    { query: "analysis" },
    { currentCompany: "software" },
  );

  assert.equal(result.ok, false);
  assert.equal(result.status, "ambiguous");
  assert.equal(result.selection_mode, "picker-fallback");
  assert.match(result.blocking_reason || "", /analysis-router/);
  assert.match(result.blocking_reason || "", /analysis-review/);
});

test("continuation envelopes can prepare an exact next prompt with args and governed context", async () => {
  const nextTemplate = template({
    name: "next-step-router",
    content:
      "---\nrender_engine: nunjucks\n---\nCompany={{ current_company }}\nArg={{ args[0] }}\nContext={{ context }}",
  });

  const runtime = createVaultPromptPlaneRuntime({
    runtime: createRuntime({ templates: [nextTemplate] }),
  });

  const result = await runtime.prepareContinuation(
    {
      contract_version: 1,
      status: "ready",
      resolution: {
        kind: "exact_template",
        template_name: "next-step-router",
        allow_picker_fallback: false,
      },
      preparation: {
        context: "Teacher-facing app",
        args: ["audit"],
        inherit_current_company: true,
      },
      provenance: {
        source_template: "execution-chain-overview",
        source_execution_id: 41,
        source_output_commitment: "exact_next_prompt",
      },
    },
    { currentCompany: "software" },
  );

  assert.equal(result.ok, true);
  assert.equal(result.status, "ready");
  assert.equal(result.template?.name, "next-step-router");
  assert.match(result.prepared_text || "", /Company=software/);
  assert.match(result.prepared_text || "", /Arg=audit/);
  assert.match(result.prepared_text || "", /Context=Teacher-facing app/);
});

test("continuation preparation rejects semantically invalid exact-template ambiguity", async () => {
  const runtime = createVaultPromptPlaneRuntime({ runtime: createRuntime() });

  const result = await runtime.prepareContinuation(
    {
      contract_version: 1,
      status: "ambiguous",
      resolution: {
        kind: "exact_template",
        template_name: "analysis-router",
      },
    },
    { currentCompany: "software" },
  );

  assert.equal(result.ok, false);
  assert.equal(result.status, "blocked");
  assert.match(result.blocking_reason || "", /ambiguous continuations must use picker_query/);
});

test("continuation preparation rejects prose-only or malformed continuation input", async () => {
  const runtime = createVaultPromptPlaneRuntime({ runtime: createRuntime() });

  const result = await runtime.prepareContinuation("next_prompt: analysis-router", {
    currentCompany: "software",
  });

  assert.equal(result.ok, false);
  assert.equal(result.status, "blocked");
  assert.match(result.blocking_reason || "", /Invalid vault continuation envelope/);
});

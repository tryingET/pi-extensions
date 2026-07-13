import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import packageJson from "../package.json" with { type: "json" };
import { createVaultPromptPlaneRuntime } from "../src/promptPlane.js";

const ROOT_ENTRY_SOURCE = readFileSync(new URL("../index.ts", import.meta.url), "utf8");

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
    controlled_vocabulary: {
      routing_context: "analysis_followup",
      activity_phase: "post_analysis",
      input_artifact: "analysis_output",
      transition_target_type: "framework_mode",
      selection_principles: ["evidence_based"],
      output_commitment: "exact_next_prompt",
    },
    status: "active",
    export_to_pi: true,
    version: 3,
    id: 7,
    ...overrides,
  };
}

function ok(value) {
  return { ok: true, value, error: null };
}

function createRuntime(options = {}) {
  const templateEntries = options.templates || [template()];
  const templates = new Map(templateEntries.map((entry) => [String(entry.name), entry]));
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
    queryTemplatesDetailed(filters = {}, limit = 50, _includeContent = false, context) {
      // Prompt-plane listing uses the same in-memory candidates as dispatch revalidation.
      if (typeof options.onQueryTemplatesDetailed === "function") {
        options.onQueryTemplatesDetailed(filters, limit, context);
      }
      const values = templateEntries.filter((entry) => {
        if (
          Array.isArray(filters.artifact_kind) &&
          filters.artifact_kind.length > 0 &&
          !filters.artifact_kind.includes(entry.artifact_kind)
        ) {
          return false;
        }
        if (
          Array.isArray(filters.control_mode) &&
          filters.control_mode.length > 0 &&
          !filters.control_mode.includes(entry.control_mode)
        ) {
          return false;
        }
        if (
          Array.isArray(filters.formalization_level) &&
          filters.formalization_level.length > 0 &&
          !filters.formalization_level.includes(entry.formalization_level)
        ) {
          return false;
        }
        if (
          Array.isArray(filters.owner_company) &&
          filters.owner_company.length > 0 &&
          !filters.owner_company.includes(entry.owner_company)
        ) {
          return false;
        }
        return true;
      });
      return ok(values.slice(0, limit));
    },
    escapeSql(value) {
      return String(value).replaceAll("'", "''");
    },
    buildVisibilityPredicate() {
      return "TRUE";
    },
    queryVaultJsonDetailed() {
      return ok({ rows: templateEntries });
    },
    parseTemplateRows() {
      return templateEntries;
    },
  };
}

test("package exports expose the supported prompt-plane seam", () => {
  assert.equal(packageJson.exports["./prompt-plane"].default, "./src/promptPlane.js");
  assert.equal(packageJson.exports["./prompt-plane"].types, "./src/promptPlane.d.ts");
});

test("root entrypoint mirrors packaged runtime semantics", () => {
  assert.equal(packageJson.exports["."], "./extensions/vault.js");
  assert.match(ROOT_ENTRY_SOURCE, /export \{ default \} from "\.\/extensions\/vault\.js";/);
});

test("prompt-plane rejects caller-forged dispatch runtimes", () => {
  assert.throws(
    () =>
      createVaultPromptPlaneRuntime({
        runtime: createRuntime(),
        dispatchRuntime: {
          policy: {},
          authorizePreparedExecution() {
            return { disposition: "text_ready", authorizationId: "forged" };
          },
          claimPreparedExecution() {
            return { ok: true, value: { sealedText: "forged" } };
          },
          settlePreparedExecution() {
            return true;
          },
        },
      }),
    /package-created/,
  );
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

test("prompt-plane V1 blocks gated templates without prepared text", async () => {
  const gated = template({ name: "ooda", control_mode: "loop", formalization_level: "workflow" });
  const runtime = createVaultPromptPlaneRuntime({ runtime: createRuntime({ templates: [gated] }) });
  const result = await runtime.prepareSelection({ query: "ooda" }, { currentCompany: "software" });
  assert.equal(result.ok, false);
  assert.equal(result.status, "blocked");
  assert.equal(result.prepared_text, undefined);
  assert.equal(result.dispatch?.posture, "orchestrator_loop_required");
});

test("prompt-plane V1 fails closed on incomplete governed vocabulary", async () => {
  const invalid = template({ controlled_vocabulary: null });
  const runtime = createVaultPromptPlaneRuntime({
    runtime: createRuntime({ templates: [invalid] }),
  });
  const result = await runtime.prepareSelection(
    { query: "analysis-router" },
    { currentCompany: "software" },
  );
  assert.equal(result.ok, false);
  assert.equal(result.status, "blocked");
  assert.equal(result.prepared_text, undefined);
  assert.match(result.blocking_reason, /invalid governed metadata/);
});

test("prompt-plane V2 returns dispatch authorization without exposing gated raw text", async () => {
  const gated = template({ name: "ooda", control_mode: "loop", formalization_level: "workflow" });
  const runtime = createVaultPromptPlaneRuntime({ runtime: createRuntime({ templates: [gated] }) });
  const result = await runtime.prepareSelectionV2(
    { query: "ooda" },
    { currentCompany: "software" },
  );
  assert.equal(result.ok, true);
  assert.equal(result.status, "dispatch_required");
  assert.equal(result.prepared_text, undefined);
  assert.equal(result.authorization.disposition, "dispatch_required");
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

test("prompt-plane seam rejects explicit company context that conflicts with resolved cwd context", async () => {
  const runtime = createVaultPromptPlaneRuntime({ runtime: createRuntime() });

  const result = await runtime.prepareSelection(
    { query: "analysis-router" },
    { currentCompany: "finance", cwd: "/tmp/software/project" },
  );

  assert.equal(result.ok, false);
  assert.equal(result.status, "blocked");
  assert.match(result.blocking_reason || "", /conflicts with resolved company context/);
  assert.match(result.blocking_reason || "", /software/);
});

test("prompt-plane seam rejects explicit company context that conflicts with ambient resolved context", async () => {
  const runtime = createVaultPromptPlaneRuntime({
    runtime: {
      resolveCurrentCompanyContext(cwd) {
        return cwd
          ? { company: "core", source: "contract-default" }
          : { company: "software", source: "env:PI_COMPANY" };
      },
      getTemplateDetailed(name) {
        return ok(template({ name }));
      },
      searchTemplatesDetailed() {
        return ok([]);
      },
    },
  });

  const result = await runtime.prepareSelection(
    { query: "analysis-router" },
    { currentCompany: "finance", cwd: "/tmp/outside-workspace" },
  );

  assert.equal(result.ok, false);
  assert.equal(result.status, "blocked");
  assert.match(result.blocking_reason || "", /env:PI_COMPANY/);
  assert.match(result.blocking_reason || "", /software/);
});

test("prompt-plane seam does not fall back to ambient company context when an explicit cwd lacks company scope", async () => {
  const runtime = createVaultPromptPlaneRuntime({
    runtime: {
      resolveCurrentCompanyContext(cwd) {
        return cwd
          ? { company: "core", source: "contract-default" }
          : { company: "software", source: "env:PI_COMPANY" };
      },
      getTemplateDetailed(name) {
        return ok(template({ name }));
      },
      searchTemplatesDetailed() {
        return ok([]);
      },
    },
  });

  const result = await runtime.prepareSelection(
    { query: "analysis-router" },
    { cwd: "/tmp/outside-workspace" },
  );

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

test("continuation preparation rejects exact-template picker fallback", async () => {
  const runtime = createVaultPromptPlaneRuntime({ runtime: createRuntime() });

  const result = await runtime.prepareContinuation(
    {
      contract_version: 1,
      status: "ready",
      resolution: {
        kind: "exact_template",
        template_name: "analysis-router",
        allow_picker_fallback: true,
      },
    },
    { currentCompany: "software" },
  );

  assert.equal(result.ok, false);
  assert.equal(result.status, "blocked");
  assert.match(result.blocking_reason || "", /cannot set allow_picker_fallback=true/);
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

test("prompt-plane seam can list visible templates through the owning runtime", async () => {
  const runtime = createVaultPromptPlaneRuntime({
    runtime: createRuntime({
      templates: [
        template({
          name: "inversion",
          artifact_kind: "cognitive",
          description: "Find hidden bugs",
        }),
        template({ name: "audit", artifact_kind: "cognitive", description: "Review quality" }),
        template({
          name: "builder-playbook",
          artifact_kind: "procedure",
          description: "Build things",
        }),
      ],
      onQueryTemplatesDetailed(filters, limit, context) {
        assert.deepEqual(filters, { artifact_kind: ["cognitive"] });
        assert.equal(limit, 5);
        assert.equal(context?.currentCompany, "software");
        assert.equal(context?.requireExplicitCompany, true);
      },
    }),
  });

  const result = await runtime.listVisibleTemplates(
    { filters: { artifact_kind: ["cognitive"] }, limit: 5 },
    { currentCompany: "software", cwd: "/tmp/software/project" },
  );

  assert.equal(result.ok, true);
  assert.equal(result.status, "ready");
  assert.deepEqual(
    result.templates?.map((entry) => ({ name: entry.name, description: entry.description })),
    [
      { name: "inversion", description: "Find hidden bugs" },
      { name: "audit", description: "Review quality" },
    ],
  );
});

test("prompt-plane list seam fails closed without explicit company context", async () => {
  const runtime = createVaultPromptPlaneRuntime({
    runtime: createRuntime({
      companyContext: { company: "software", source: "contract-default" },
    }),
  });

  const result = await runtime.listVisibleTemplates(
    { filters: { artifact_kind: ["cognitive"] } },
    { cwd: "/tmp/outside-workspace" },
  );

  assert.equal(result.ok, false);
  assert.equal(result.status, "blocked");
  assert.match(result.blocking_reason || "", /Explicit company context is required/);
});

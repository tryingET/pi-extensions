import assert from "node:assert/strict";
import test from "node:test";
import { withTranspiledModuleHarness } from "./helpers/transpiled-module-harness.mjs";

function makeTemplate(overrides = {}) {
  return {
    id: 7,
    name: "template",
    description: "",
    content: "Body",
    artifact_kind: "procedure",
    control_mode: "one_shot",
    formalization_level: "structured",
    owner_company: "core",
    visibility_companies: ["software"],
    controlled_vocabulary: null,
    status: "active",
    export_to_pi: true,
    version: 1,
    ...overrides,
  };
}

async function withGroundingModules(run) {
  return withTranspiledModuleHarness(
    {
      prefix: "vault-grounding-",
      files: [
        "src/vaultTypes.ts",
        "src/vaultGrounding.ts",
        "src/templatePreparationCompat.js",
        "src/templateRenderer.js",
      ],
    },
    run,
  );
}

test("framework grounding appendix prepares explicit nunjucks templates through the shared renderer", async () => {
  await withGroundingModules(async ({ importModule }) => {
    const { createGroundingRuntime } = await importModule("src/vaultGrounding.js");
    const framework = makeTemplate({
      name: "nexus",
      artifact_kind: "cognitive",
      content: `---
render_engine: nunjucks
---
Company: {{ current_company }}
Template: {{ template_name }}
Objective: {{ args[0] }}
Context: {{ context }}`,
    });
    const next10 = makeTemplate({
      name: "next-10-expert-suggestions",
      content: "Base prompt",
    });

    const grounding = createGroundingRuntime({
      getCurrentCompany() {
        return "software";
      },
      retrieveByNamesDetailed() {
        return { ok: true, value: [framework], error: null };
      },
      getTemplateDetailed(name) {
        return {
          ok: true,
          value: name === "next-10-expert-suggestions" ? next10 : null,
          error: null,
        };
      },
    });

    const result = grounding.buildGroundedNext10Prompt(
      '/next-10-expert-suggestions "ship templating" "workflow"',
      { currentCompany: "software" },
    );

    assert.equal(result.ok, true);
    if (!result.ok) return;
    assert.match(result.prompt, /^Base prompt/m);
    assert.match(result.prompt, /### F1: nexus/);
    assert.match(result.prompt, /Company: software/);
    assert.match(result.prompt, /Template: nexus/);
    assert.match(result.prompt, /Objective: ship templating/);
    assert.match(result.prompt, /Context: Objective: ship templating/);
  });
});

test("framework grounding fails clearly when an explicit framework render contract cannot be satisfied", async () => {
  await withGroundingModules(async ({ importModule }) => {
    const { createGroundingRuntime } = await importModule("src/vaultGrounding.js");
    const framework = makeTemplate({
      name: "nexus",
      artifact_kind: "cognitive",
      content: `---
render_engine: pi-vars
---
Fifth arg: $5`,
    });
    const next10 = makeTemplate({
      name: "next-10-expert-suggestions",
      content: "Base prompt",
    });

    const grounding = createGroundingRuntime({
      getCurrentCompany() {
        return "software";
      },
      retrieveByNamesDetailed() {
        return { ok: true, value: [framework], error: null };
      },
      getTemplateDetailed(name) {
        return {
          ok: true,
          value: name === "next-10-expert-suggestions" ? next10 : null,
          error: null,
        };
      },
    });

    const result = grounding.buildGroundedNext10Prompt(
      '/next-10-expert-suggestions "ship templating" "workflow"',
      { currentCompany: "software" },
    );

    assert.deepEqual(result.ok, false);
    if (result.ok) return;
    assert.match(
      result.reason,
      /BLOCKED: framework grounding render failed for nexus: Pi-vars render failed:/,
    );
  });
});

test("framework grounding preserves validated explicit framework override order without truncation", async () => {
  await withGroundingModules(async ({ importModule }) => {
    const { createGroundingRuntime } = await importModule("src/vaultGrounding.js");
    const next10 = makeTemplate({
      name: "next-10-expert-suggestions",
      content: "Base prompt",
    });
    const frameworks = ["inversion", "telescopic", "nexus", "audit"].map((name) =>
      makeTemplate({
        name,
        artifact_kind: "cognitive",
        content: `${name} body`,
      }),
    );

    const grounding = createGroundingRuntime({
      getCurrentCompany() {
        return "software";
      },
      retrieveByNamesDetailed(names) {
        return {
          ok: true,
          value: frameworks.filter((framework) => names.includes(framework.name)),
          error: null,
        };
      },
      getTemplateDetailed(name) {
        return {
          ok: true,
          value: name === "next-10-expert-suggestions" ? next10 : null,
          error: null,
        };
      },
      queryVaultJsonDetailed() {
        throw new Error("discovery should not run when explicit overrides are requested");
      },
      parseTemplateRows() {
        return [];
      },
      buildActiveVisibleTemplatePredicate() {
        return "1 = 1";
      },
      escapeSql(value) {
        return String(value);
      },
    });

    const result = grounding.buildGroundedNext10Prompt(
      '/next-10-expert-suggestions "ship templating" "workflow" lite "frameworks=inversion|telescopic|nexus"',
      { currentCompany: "software" },
    );

    assert.equal(result.ok, true);
    if (!result.ok) return;
    assert.match(result.prompt, /### F1: inversion/);
    assert.match(result.prompt, /### F2: telescopic/);
    assert.match(result.prompt, /### F3: nexus/);
  });
});

test("framework grounding fails closed when explicit framework overrides exceed the supported limit", async () => {
  await withGroundingModules(async ({ importModule }) => {
    const { createGroundingRuntime } = await importModule("src/vaultGrounding.js");
    const next10 = makeTemplate({
      name: "next-10-expert-suggestions",
      content: "Base prompt",
    });
    const frameworks = ["inversion", "telescopic", "nexus", "audit"].map((name) =>
      makeTemplate({
        name,
        artifact_kind: "cognitive",
        content: `${name} body`,
      }),
    );

    const grounding = createGroundingRuntime({
      getCurrentCompany() {
        return "software";
      },
      retrieveByNamesDetailed(names) {
        return {
          ok: true,
          value: frameworks.filter((framework) => names.includes(framework.name)),
          error: null,
        };
      },
      getTemplateDetailed(name) {
        return {
          ok: true,
          value: name === "next-10-expert-suggestions" ? next10 : null,
          error: null,
        };
      },
      queryVaultJsonDetailed() {
        throw new Error("discovery should not run when explicit overrides are requested");
      },
      parseTemplateRows() {
        return [];
      },
      buildActiveVisibleTemplatePredicate() {
        return "1 = 1";
      },
      escapeSql(value) {
        return String(value);
      },
    });

    const result = grounding.buildGroundedNext10Prompt(
      '/next-10-expert-suggestions "ship templating" "workflow" lite "frameworks=inversion|telescopic|nexus|audit"',
      { currentCompany: "software" },
    );

    assert.deepEqual(result.ok, false);
    if (result.ok) return;
    assert.match(
      result.reason,
      /BLOCKED: framework grounding lookup failed: Explicit framework override limit is 3; received 4: inversion, telescopic, nexus, audit/,
    );
  });
});

test("framework grounding fails closed when explicit framework overrides are not visible", async () => {
  await withGroundingModules(async ({ importModule }) => {
    const { createGroundingRuntime } = await importModule("src/vaultGrounding.js");
    const next10 = makeTemplate({
      name: "next-10-expert-suggestions",
      content: "Base prompt",
    });

    const grounding = createGroundingRuntime({
      getCurrentCompany() {
        return "software";
      },
      retrieveByNamesDetailed() {
        return { ok: true, value: [], error: null };
      },
      getTemplateDetailed(name) {
        return {
          ok: true,
          value: name === "next-10-expert-suggestions" ? next10 : null,
          error: null,
        };
      },
      queryVaultJsonDetailed() {
        throw new Error("discovery should not run when explicit overrides are requested");
      },
      parseTemplateRows() {
        return [];
      },
      buildActiveVisibleTemplatePredicate() {
        return "1 = 1";
      },
      escapeSql(value) {
        return String(value);
      },
    });

    const result = grounding.buildGroundedNext10Prompt(
      '/next-10-expert-suggestions "ship templating" "workflow" lite "frameworks=missing-framework"',
      { currentCompany: "software" },
    );

    assert.deepEqual(result.ok, false);
    if (result.ok) return;
    assert.match(
      result.reason,
      /BLOCKED: framework grounding lookup failed: Explicit framework override\(s\) not found or not visible: missing-framework/,
    );
  });
});

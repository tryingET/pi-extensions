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

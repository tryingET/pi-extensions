import assert from "node:assert/strict";
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import path from "node:path";
import test from "node:test";
import { fileURLToPath, pathToFileURL } from "node:url";
import ts from "typescript";

const TEST_DIR = fileURLToPath(new URL(".", import.meta.url));
const PACKAGE_ROOT = path.resolve(TEST_DIR, "..");

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

function createTranspiledGroundingModules() {
  const baseDir = path.join(PACKAGE_ROOT, ".tmp-test");
  mkdirSync(baseDir, { recursive: true });
  const tempDir = mkdtempSync(path.join(baseDir, "vault-grounding-"));

  for (const relativePath of [
    "src/vaultTypes.ts",
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

async function withGroundingModules(run) {
  const modules = createTranspiledGroundingModules();
  try {
    return await run(modules);
  } finally {
    modules.cleanup();
  }
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

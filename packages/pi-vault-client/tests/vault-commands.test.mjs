import assert from "node:assert/strict";
import { mkdirSync, mkdtempSync, readFileSync, rmSync, symlinkSync, writeFileSync } from "node:fs";
import path from "node:path";
import test from "node:test";
import { fileURLToPath, pathToFileURL } from "node:url";
import ts from "typescript";

const TEST_DIR = fileURLToPath(new URL(".", import.meta.url));
const PACKAGE_ROOT = path.resolve(TEST_DIR, "..");
const INSTALLED_INTERACTION_KIT_ROOT = path.join(
  PACKAGE_ROOT,
  "node_modules",
  "@tryinget",
  "pi-interaction-kit",
);
const INSTALLED_TRIGGER_ADAPTER_ROOT = path.join(
  PACKAGE_ROOT,
  "node_modules",
  "@tryinget",
  "pi-trigger-adapter",
);

function makeTemplate(overrides = {}) {
  return {
    id: 11,
    name: "meta-orchestration",
    description: "meta",
    content: "Reply with V9-OK",
    artifact_kind: "cognitive",
    control_mode: "one_shot",
    formalization_level: "structured",
    owner_company: "core",
    visibility_companies: ["core", "software"],
    controlled_vocabulary: null,
    status: "active",
    export_to_pi: true,
    version: 3,
    ...overrides,
  };
}

function linkPackageDependency(tempDir, packageName, packageRoot) {
  const destination = path.join(tempDir, "node_modules", ...packageName.split("/"));
  mkdirSync(path.dirname(destination), { recursive: true });
  symlinkSync(packageRoot, destination, "dir");
}

function createTranspiledCommandModules() {
  const baseDir = path.join(PACKAGE_ROOT, ".tmp-test");
  mkdirSync(baseDir, { recursive: true });
  const tempDir = mkdtempSync(path.join(baseDir, "vault-commands-"));

  linkPackageDependency(tempDir, "@tryinget/pi-interaction-kit", INSTALLED_INTERACTION_KIT_ROOT);
  linkPackageDependency(tempDir, "@tryinget/pi-trigger-adapter", INSTALLED_TRIGGER_ADAPTER_ROOT);

  for (const relativePath of [
    "src/vaultTypes.ts",
    "src/vaultCommands.ts",
    "src/fuzzySelector.js",
    "src/triggerAdapter.js",
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

async function withCommandModules(run) {
  const modules = createTranspiledCommandModules();
  try {
    return await run(modules);
  } finally {
    modules.cleanup();
  }
}

function makePiStub() {
  const events = new Map();
  const commands = new Map();
  return {
    on(event, handler) {
      events.set(event, handler);
    },
    registerCommand(name, definition) {
      commands.set(name, definition);
    },
    events,
    commands,
  };
}

test("live /vault: exact-name path transforms in non-UI mode without picker fallback", async () => {
  await withCommandModules(async ({ importModule }) => {
    const { registerVaultCommands } = await importModule("src/vaultCommands.js");
    const pi = makePiStub();
    const template = makeTemplate();
    const logged = [];

    registerVaultCommands(pi, {
      checkSchemaCompatibilityDetailed() {
        return {
          ok: true,
          expectedVersion: 9,
          actualVersion: 9,
          missingPromptTemplateColumns: [],
          missingExecutionColumns: [],
          missingFeedbackColumns: [],
        };
      },
      parseVaultSelectionInput(text) {
        return text.startsWith("/vault:") ? { query: text.slice(7), context: "" } : null;
      },
      getCurrentCompany() {
        return "software";
      },
      getTemplateDetailed(name) {
        assert.equal(name, "meta-orchestration");
        return { ok: true, value: template, error: null };
      },
      async pickVaultTemplate() {
        throw new Error("picker should not run for exact /vault: matches");
      },
      prepareVaultPrompt(_template, options) {
        assert.equal(options?.currentCompany, "software");
        return {
          ok: true,
          prepared: "Reply with V9-OK",
        };
      },
      logExecution(...args) {
        logged.push(args);
      },
    });

    const inputHandler = pi.events.get("input");
    assert.equal(typeof inputHandler, "function");

    const result = await inputHandler(
      { source: "interactive", text: "/vault:meta-orchestration" },
      { hasUI: false, cwd: "/tmp/software/project", model: { id: "unit-model" } },
    );

    assert.deepEqual(result, { action: "transform", text: "Reply with V9-OK" });
    assert.equal(logged.length, 1);
    assert.equal(logged[0][0].name, "meta-orchestration");
    assert.equal(logged[0][1], "unit-model");
  });
});

test("interactive /vault command loads exact-name templates into the editor", async () => {
  await withCommandModules(async ({ importModule }) => {
    const { registerVaultCommands } = await importModule("src/vaultCommands.js");
    const pi = makePiStub();
    const template = makeTemplate();
    const notifications = [];
    const editorWrites = [];
    const logged = [];

    registerVaultCommands(pi, {
      checkSchemaCompatibilityDetailed() {
        return {
          ok: true,
          expectedVersion: 9,
          actualVersion: 9,
          missingPromptTemplateColumns: [],
          missingExecutionColumns: [],
          missingFeedbackColumns: [],
        };
      },
      parseVaultSelectionInput() {
        return null;
      },
      splitVaultQueryAndContext(text) {
        return { query: text, context: "" };
      },
      getCurrentCompany() {
        return "software";
      },
      getTemplateDetailed(name) {
        assert.equal(name, "meta-orchestration");
        return { ok: true, value: template, error: null };
      },
      async pickVaultTemplate() {
        throw new Error("picker should not run for exact /vault matches");
      },
      prepareVaultPrompt(_template, options) {
        assert.equal(options?.currentCompany, "software");
        return {
          ok: true,
          prepared: "Reply with V9-OK",
        };
      },
      facetLabel(resolved) {
        return `${resolved.artifact_kind}/${resolved.control_mode}/${resolved.formalization_level}`;
      },
      logExecution(...args) {
        logged.push(args);
      },
    });

    const vaultCommand = pi.commands.get("vault");
    assert.ok(vaultCommand);

    await vaultCommand.handler("meta-orchestration", {
      hasUI: true,
      cwd: "/tmp/software/project",
      model: { id: "unit-model" },
      ui: {
        notify(message, level) {
          notifications.push({ message, level });
        },
        setEditorText(text) {
          editorWrites.push(text);
        },
      },
    });

    assert.deepEqual(editorWrites, ["Reply with V9-OK"]);
    assert.equal(logged.length, 1);
    assert.match(notifications[0]?.message || "", /Prepared: meta-orchestration/);
  });
});

test("vault command surface degrades to schema diagnostics instead of disappearing on mismatch", async () => {
  await withCommandModules(async ({ importModule }) => {
    const { registerVaultCommands } = await importModule("src/vaultCommands.js");
    const pi = makePiStub();
    const notifications = [];

    registerVaultCommands(pi, {
      checkSchemaCompatibilityDetailed() {
        return {
          ok: false,
          expectedVersion: 9,
          actualVersion: 8,
          missingPromptTemplateColumns: [],
          missingExecutionColumns: ["output_text"],
          missingFeedbackColumns: [],
        };
      },
      parseVaultSelectionInput() {
        return null;
      },
      splitVaultQueryAndContext(text) {
        return { query: text, context: "" };
      },
    });

    const vaultCommand = pi.commands.get("vault");
    assert.ok(vaultCommand);
    await vaultCommand.handler("meta-orchestration", {
      hasUI: true,
      ui: {
        notify(message, level) {
          notifications.push({ message, level });
        },
      },
    });

    assert.match(notifications[0]?.message || "", /Vault schema mismatch/);
    assert.match(notifications[0]?.message || "", /output_text/);
  });
});

test("interactive /route prepares meta-orchestration through the shared vault renderer", async () => {
  await withCommandModules(async ({ importModule }) => {
    const { registerVaultCommands } = await importModule("src/vaultCommands.js");
    const pi = makePiStub();
    const editorWrites = [];
    const prepareCalls = [];

    registerVaultCommands(pi, {
      checkSchemaCompatibilityDetailed() {
        return {
          ok: true,
          expectedVersion: 9,
          actualVersion: 9,
          missingPromptTemplateColumns: [],
          missingExecutionColumns: [],
          missingFeedbackColumns: [],
        };
      },
      getCurrentCompany() {
        return "software";
      },
      getTemplateDetailed(name) {
        assert.equal(name, "meta-orchestration");
        return {
          ok: true,
          value: makeTemplate({
            content:
              "---\nrender_engine: nunjucks\n---\nCompany: {{ current_company }}\nContext: {{ context }}",
          }),
          error: null,
        };
      },
      prepareVaultPrompt(template, options) {
        prepareCalls.push({ template, options });
        return {
          ok: true,
          prepared: `Company: ${options?.currentCompany}\nContext: ${options?.context}`,
        };
      },
    });

    const routeCommand = pi.commands.get("route");
    assert.ok(routeCommand);
    await routeCommand.handler("release drift", {
      hasUI: true,
      cwd: "/tmp/software/project",
      ui: {
        notify() {},
        setEditorText(text) {
          editorWrites.push(text);
        },
      },
    });

    assert.equal(prepareCalls.length, 1);
    assert.equal(prepareCalls[0].options?.currentCompany, "software");
    assert.equal(prepareCalls[0].options?.context, "release drift");
    assert.equal(prepareCalls[0].options?.appendContextSection, false);
    assert.match(editorWrites[0] || "", /^Company: software/);
    assert.doesNotMatch(editorWrites[0] || "", /^---/);
    assert.match(editorWrites[0] || "", /## ROUTING REQUEST/);
  });
});

test("non-UI /route surfaces shared render failures instead of emitting raw template text", async () => {
  await withCommandModules(async ({ importModule }) => {
    const { registerVaultCommands } = await importModule("src/vaultCommands.js");
    const pi = makePiStub();

    registerVaultCommands(pi, {
      checkSchemaCompatibilityDetailed() {
        return {
          ok: true,
          expectedVersion: 9,
          actualVersion: 9,
          missingPromptTemplateColumns: [],
          missingExecutionColumns: [],
          missingFeedbackColumns: [],
        };
      },
      getCurrentCompany() {
        return "software";
      },
      getTemplateDetailed(name) {
        assert.equal(name, "meta-orchestration");
        return { ok: true, value: makeTemplate(), error: null };
      },
      prepareVaultPrompt() {
        return {
          ok: false,
          error: "Nunjucks render failed: Unsupported Nunjucks syntax",
        };
      },
      parseVaultSelectionInput() {
        return null;
      },
    });

    const inputHandler = pi.events.get("input");
    const result = await inputHandler(
      { source: "interactive", text: "/route release drift" },
      { hasUI: false, cwd: "/tmp/software/project" },
    );

    assert.equal(result.action, "transform");
    assert.match(result.text, /Vault template render failed \(meta-orchestration\)/);
    assert.match(result.text, /Unsupported Nunjucks syntax/);
  });
});

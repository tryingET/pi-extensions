import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import path from "node:path";
import test from "node:test";
import { stripPreparedExecutionMarkers } from "../src/vaultReceipts.js";
import {
  createPackageTempDir,
  PACKAGE_ROOT,
  withTranspiledModuleHarness,
} from "./helpers/transpiled-module-harness.mjs";

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
      company_source: "cwd:/tmp/software/project",
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

async function withCommandModules(run) {
  return withTranspiledModuleHarness(
    {
      prefix: "vault-commands-",
      files: [
        "src/vaultTypes.ts",
        "src/doltDiagnostics.ts",
        "src/vaultCommands.ts",
        "src/vaultReceipts.ts",
        "src/vaultReplay.ts",
        "src/vaultRoute.ts",
        "src/vaultGrounding.ts",
        "src/fuzzySelector.js",
        "src/triggerAdapter.js",
        "src/templatePreparationCompat.js",
        "src/templateRenderer.js",
      ],
      linkedPackages: [
        {
          packageName: "@tryinget/pi-interaction-kit",
          packageRoot: INSTALLED_INTERACTION_KIT_ROOT,
        },
        {
          packageName: "@tryinget/pi-trigger-adapter",
          packageRoot: INSTALLED_TRIGGER_ADAPTER_ROOT,
        },
      ],
    },
    run,
  );
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
    const { createVaultReceiptManager } = await importModule("src/vaultReceipts.js");
    const pi = makePiStub();
    const template = makeTemplate();
    const logged = [];
    const receiptDir = createPackageTempDir("receipts-");
    const receipts = createVaultReceiptManager(
      {
        logExecution(...args) {
          logged.push(args);
          return {
            ok: true,
            executionId: 41,
            templateId: args[0].id,
            entityVersion: args[0].version,
            createdAt: "2026-03-11T12:00:00.000Z",
            model: args[1],
            inputContext: args[2] || "",
          };
        },
      },
      { filePath: path.join(receiptDir, "receipts.jsonl") },
    );

    registerVaultCommands(
      pi,
      {
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
            engine: "none",
            explicitEngine: null,
            body: "Reply with V9-OK",
            hasFrontmatter: false,
            error: null,
            rendered: "Reply with V9-OK",
            prepared: "Reply with V9-OK",
            renderContext: {},
            usedRenderKeys: [],
            contextAppended: false,
          };
        },
      },
      receipts,
    );

    const inputHandler = pi.events.get("input");
    const messageEndHandler = pi.events.get("message_end");
    assert.equal(typeof inputHandler, "function");
    assert.equal(typeof messageEndHandler, "function");

    const result = await inputHandler(
      { source: "interactive", text: "/vault:meta-orchestration" },
      { hasUI: false, cwd: "/tmp/software/project", model: { id: "unit-model" } },
    );

    assert.equal(result.action, "transform");
    assert.equal(stripPreparedExecutionMarkers(result.text), "Reply with V9-OK");
    assert.equal(logged.length, 0);

    await messageEndHandler(
      { type: "message_end", message: { role: "user", content: result.text } },
      { hasUI: false, model: { id: "unit-model" } },
    );

    assert.equal(logged.length, 1);
    assert.equal(logged[0][0].name, "meta-orchestration");
    assert.equal(logged[0][1], "unit-model");
  });
});

test("message_end warns when a prepared vault prompt was edited before send", async () => {
  await withCommandModules(async ({ importModule }) => {
    const { registerVaultCommands } = await importModule("src/vaultCommands.js");
    const { createVaultReceiptManager } = await importModule("src/vaultReceipts.js");
    const pi = makePiStub();
    const template = makeTemplate();
    const notifications = [];
    const logged = [];
    const receiptDir = createPackageTempDir("receipts-");
    const receipts = createVaultReceiptManager(
      {
        logExecution(...args) {
          logged.push(args);
          return {
            ok: true,
            executionId: 45,
            templateId: args[0].id,
            entityVersion: args[0].version,
            createdAt: "2026-03-11T12:00:05.000Z",
            model: args[1],
            inputContext: args[2] || "",
          };
        },
      },
      { filePath: path.join(receiptDir, "receipts.jsonl") },
    );

    registerVaultCommands(
      pi,
      {
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
        prepareVaultPrompt() {
          return {
            ok: true,
            engine: "none",
            explicitEngine: null,
            body: "Reply with V9-OK",
            hasFrontmatter: false,
            error: null,
            rendered: "Reply with V9-OK",
            prepared: "Reply with V9-OK",
            renderContext: {},
            usedRenderKeys: [],
            contextAppended: false,
          };
        },
      },
      receipts,
    );

    const inputHandler = pi.events.get("input");
    const messageEndHandler = pi.events.get("message_end");
    assert.equal(typeof inputHandler, "function");
    assert.equal(typeof messageEndHandler, "function");

    const result = await inputHandler(
      { source: "interactive", text: "/vault:meta-orchestration" },
      { hasUI: false, cwd: "/tmp/software/project", model: { id: "unit-model" } },
    );

    assert.equal(result.action, "transform");

    await messageEndHandler(
      {
        type: "message_end",
        message: {
          role: "user",
          content: result.text.replace("Reply with V9-OK", "Edited prompt"),
        },
      },
      {
        hasUI: true,
        model: { id: "unit-model" },
        ui: {
          notify(message, level) {
            notifications.push({ message, level });
          },
        },
      },
    );

    assert.equal(logged.length, 0);
    assert.deepEqual(notifications.at(-1), {
      message:
        "Vault execution receipt skipped: Prepared vault prompt was edited after preparation; skipped execution logging and local receipt persistence.",
      level: "warning",
    });
  });
});

test("interactive /vault command loads exact-name templates into the editor", async () => {
  await withCommandModules(async ({ importModule }) => {
    const { registerVaultCommands } = await importModule("src/vaultCommands.js");
    const { createVaultReceiptManager } = await importModule("src/vaultReceipts.js");
    const pi = makePiStub();
    const template = makeTemplate();
    const notifications = [];
    const editorWrites = [];
    const logged = [];
    const receiptDir = createPackageTempDir("receipts-");
    const receipts = createVaultReceiptManager(
      {
        logExecution(...args) {
          logged.push(args);
          return {
            ok: true,
            executionId: 42,
            templateId: args[0].id,
            entityVersion: args[0].version,
            createdAt: "2026-03-11T12:00:01.000Z",
            model: args[1],
            inputContext: args[2] || "",
          };
        },
      },
      { filePath: path.join(receiptDir, "receipts.jsonl") },
    );

    registerVaultCommands(
      pi,
      {
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
            engine: "none",
            explicitEngine: null,
            body: "Reply with V9-OK",
            hasFrontmatter: false,
            error: null,
            rendered: "Reply with V9-OK",
            prepared: "Reply with V9-OK",
            renderContext: {},
            usedRenderKeys: [],
            contextAppended: false,
          };
        },
        facetLabel(resolved) {
          return `${resolved.artifact_kind}/${resolved.control_mode}/${resolved.formalization_level}`;
        },
      },
      receipts,
    );

    const vaultCommand = pi.commands.get("vault");
    const messageEndHandler = pi.events.get("message_end");
    assert.ok(vaultCommand);
    assert.equal(typeof messageEndHandler, "function");

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

    assert.deepEqual(
      editorWrites.map((text) => stripPreparedExecutionMarkers(text)),
      ["Reply with V9-OK"],
    );
    assert.equal(logged.length, 0);
    await messageEndHandler(
      { type: "message_end", message: { role: "user", content: editorWrites[0] } },
      { hasUI: false, model: { id: "unit-model" } },
    );
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
    assert.doesNotMatch(editorWrites[0] || "", /COMMAND: \/vault/);
  });
});

test("non-UI /vault-search returns transformed company-visible results", async () => {
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
      resolveCurrentCompanyContext(cwd) {
        return { company: "software", source: `cwd:${cwd || "/tmp/software/project"}` };
      },
      parseVaultSelectionInput() {
        return null;
      },
      searchTemplatesDetailed(query, context, options) {
        assert.equal(query, "demo");
        assert.equal(context?.currentCompany, "software");
        assert.equal(context?.requireExplicitCompany, true);
        assert.equal(options?.includeContent, false);
        return {
          ok: true,
          value: [makeTemplate({ name: "demo-template", description: "demo" })],
          error: null,
        };
      },
      formatTemplateDetails() {
        return "DETAIL";
      },
    });

    const inputHandler = pi.events.get("input");
    const result = await inputHandler(
      { source: "interactive", text: "/vault-search demo" },
      { hasUI: false, cwd: "/tmp/software/project" },
    );

    assert.equal(result.action, "transform");
    assert.match(result.text, /# Search Results: "demo"/);
    assert.match(result.text, /current_company: software/);
    assert.match(result.text, /DETAIL/);
  });
});

test("vault receipt inspection commands respect current company visibility", async () => {
  await withCommandModules(async ({ importModule }) => {
    const { registerVaultCommands } = await importModule("src/vaultCommands.js");
    const pi = makePiStub();
    const notifications = [];

    registerVaultCommands(
      pi,
      {
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
        resolveCurrentCompanyContext(cwd) {
          return {
            company: cwd?.includes("finance") ? "finance" : "software",
            source: `cwd:${cwd}`,
          };
        },
      },
      {
        listRecentReceipts({ currentCompany }) {
          if (currentCompany !== "finance") {
            return [
              {
                execution_id: 7,
                template: { visibility_companies: ["software"] },
              },
            ];
          }
          return [];
        },
        readReceiptByExecutionId() {
          return {
            execution_id: 7,
            template: { visibility_companies: ["software"] },
          };
        },
      },
    );

    const lastReceipt = pi.commands.get("vault-last-receipt");
    const receiptById = pi.commands.get("vault-receipt");
    assert.ok(lastReceipt);
    assert.ok(receiptById);

    await lastReceipt.handler("", {
      hasUI: true,
      cwd: "/tmp/finance/project",
      ui: {
        notify(message, level) {
          notifications.push({ message, level });
        },
      },
    });

    await receiptById.handler("7", {
      hasUI: true,
      cwd: "/tmp/finance/project",
      ui: {
        notify(message, level) {
          notifications.push({ message, level });
        },
      },
    });

    assert.match(
      notifications[0]?.message || "",
      /No local vault execution receipts recorded yet for the current company/,
    );
    assert.match(
      notifications[1]?.message || "",
      /No local receipt found for execution 7 in the current company context/,
    );
  });
});

test("vault replay command renders a deterministic replay report", async () => {
  await withCommandModules(async ({ importModule }) => {
    const { registerVaultCommands } = await importModule("src/vaultCommands.js");
    const pi = makePiStub();
    const template = makeTemplate({
      name: "replay-match",
      content: "Replay body",
      owner_company: "software",
      visibility_companies: ["software"],
      artifact_kind: "procedure",
      formalization_level: "workflow",
    });
    const receipt = makeReplayReceipt(template, "Replay body");
    const editors = [];
    const notifications = [];

    registerVaultCommands(
      pi,
      {
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
        resolveCurrentCompanyContext(cwd) {
          return {
            company: "software",
            source: `cwd:${cwd}`,
          };
        },
        getTemplateDetailed(name) {
          assert.equal(name, "replay-match");
          return { ok: true, value: template, error: null };
        },
      },
      {
        readReceiptByExecutionId(executionId) {
          assert.equal(executionId, 41);
          return receipt;
        },
        listRecentReceipts() {
          return [receipt];
        },
      },
    );

    const replayCommand = pi.commands.get("vault-replay");
    assert.ok(replayCommand);

    await replayCommand.handler("41", {
      hasUI: true,
      cwd: "/tmp/software/project",
      ui: {
        async editor(title, text) {
          editors.push({ title, text });
        },
        notify(message, level) {
          notifications.push({ message, level });
        },
      },
    });

    assert.equal(editors.length, 1);
    assert.equal(editors[0].title, "Vault Replay 41");
    assert.match(editors[0].text, /# Vault Execution Replay/);
    assert.match(editors[0].text, /status: match/);
    assert.match(editors[0].text, /reasons: none/);
    assert.match(editors[0].text, /template: replay-match/);
    assert.match(editors[0].text, /## Stored Prepared Prompt/);
    assert.match(editors[0].text, /## Regenerated Prepared Prompt/);
    assert.deepEqual(notifications.at(-1), {
      message: "Vault replay status: match",
      level: "info",
    });
  });
});

test("vault replay command treats non-visible receipts as missing in the current company context", async () => {
  await withCommandModules(async ({ importModule }) => {
    const { registerVaultCommands } = await importModule("src/vaultCommands.js");
    const pi = makePiStub();
    const notifications = [];
    const editors = [];
    const hiddenReceipt = makeReplayReceipt(
      makeTemplate({
        name: "hidden-template",
        owner_company: "software",
        visibility_companies: ["software"],
        control_mode: "one_shot",
      }),
      "Hidden prompt",
    );

    registerVaultCommands(
      pi,
      {
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
        resolveCurrentCompanyContext(cwd) {
          return {
            company: cwd?.includes("finance") ? "finance" : "software",
            source: `cwd:${cwd}`,
          };
        },
      },
      {
        readReceiptByExecutionId(executionId) {
          assert.equal(executionId, 41);
          return hiddenReceipt;
        },
        listRecentReceipts() {
          return [hiddenReceipt];
        },
      },
    );

    const replayCommand = pi.commands.get("vault-replay");
    assert.ok(replayCommand);

    await replayCommand.handler("41", {
      hasUI: true,
      cwd: "/tmp/finance/project",
      ui: {
        async editor(title, text) {
          editors.push({ title, text });
        },
        notify(message, level) {
          notifications.push({ message, level });
        },
      },
    });

    assert.equal(editors.length, 0);
    assert.match(
      notifications.at(-1)?.message || "",
      /No local receipt found for execution 41 in the current company context/,
    );
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

test("vault-check reports dolt temp environment diagnostics", async () => {
  await withCommandModules(async ({ importModule }) => {
    const { registerVaultCommands } = await importModule("src/vaultCommands.js");
    const pi = makePiStub();
    const editors = [];
    const notifications = [];

    registerVaultCommands(pi, {
      resolveCurrentCompanyContext(cwd) {
        return {
          company: "software",
          source: `cwd:${cwd}`,
        };
      },
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
      getDoltExecutionEnvironment() {
        return {
          tempDir: "/tmp/pi-vault",
          source: "env:PI_VAULT_TMPDIR",
          attempts: [
            {
              source: "env:PI_VAULT_TMPDIR",
              path: "/tmp/pi-vault",
              ok: true,
              created: false,
            },
          ],
        };
      },
      listTemplatesDetailed() {
        return { ok: true, value: [makeTemplate({ control_mode: "router" })], error: null };
      },
      getTemplateDetailed(name) {
        if (name === "meta-orchestration") return { ok: true, value: makeTemplate(), error: null };
        return { ok: true, value: null, error: null };
      },
      facetLabel(template) {
        return `${template.artifact_kind}/${template.control_mode}/${template.formalization_level}`;
      },
    });

    const command = pi.commands.get("vault-check");
    assert.ok(command);
    await command.handler("", {
      hasUI: true,
      cwd: "/tmp/softwareco/owned/demo",
      ui: {
        async editor(title, text) {
          editors.push({ title, text });
        },
        notify(message, level) {
          notifications.push({ message, level });
        },
      },
    });

    const text = editors[0]?.text || "";
    assert.match(text, /# Vault Check/);
    assert.match(text, /dolt_temp_status: ok/);
    assert.match(text, /dolt_temp_source: env:PI_VAULT_TMPDIR/);
    assert.match(text, /dolt_temp_dir: \/tmp\/pi-vault/);
    assert.match(text, /dolt_temp_attempts: env:PI_VAULT_TMPDIR:ok/);
    assert.match(notifications[0]?.message || "", /Vault check complete/);
  });
});

import assert from "node:assert/strict";
import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";
import { pathToFileURL } from "node:url";
import {
  extractFirstTemplateNameFromVaultQueryOutput,
  extractSingleRetrievedTemplateEnvelope,
  getCrossExtensionHarnessPaths,
  getCrossExtensionHarnessReadiness,
} from "../extensions/self/cross-extension-harness.ts";
import { createSubagentState, registerSubagentTool } from "../extensions/self/subagent.ts";

function createPiHarness() {
  const tools = new Map();
  const commands = new Map();
  const events = new Map();

  const pi = {
    registerTool(definition) {
      tools.set(definition.name, definition);
    },
    registerCommand(name, definition) {
      commands.set(name, definition);
    },
    on(eventName, handler) {
      events.set(eventName, handler);
    },
  };

  return { pi, tools, commands, events };
}

test("extractFirstTemplateNameFromVaultQueryOutput parses first template heading", () => {
  const output = [
    "# Vault Query Results (2)",
    "",
    "## audit",
    "Type: cognitive",
    "Tags: action:validate",
    "Audit template",
    "",
    "## nexus",
    "Type: cognitive",
  ].join("\n");

  assert.equal(extractFirstTemplateNameFromVaultQueryOutput(output), "audit");
});

test("extractSingleRetrievedTemplateEnvelope parses retrieved template output", () => {
  const output = [
    "# Retrieved Templates (1)",
    "",
    "## nexus",
    "Type: cognitive",
    "Tags: action:reduce, phase:hypothesis",
    "NEXUS — The Single Highest-Leverage Intervention",
    "",
    "---",
    "Template body line 1",
    "Template body line 2",
    "",
    "---",
    "",
  ].join("\n");

  assert.deepEqual(extractSingleRetrievedTemplateEnvelope(output), {
    prompt_name: "nexus",
    prompt_content: "Template body line 1\nTemplate body line 2",
    prompt_tags: ["action:reduce", "phase:hypothesis"],
    prompt_source: "vault-client-live",
  });
});

test("extractSingleRetrievedTemplateEnvelope preserves internal markdown separators", () => {
  const output = [
    "# Retrieved Templates (1)",
    "",
    "## telescopic",
    "Type: cognitive",
    "Tags: action:expand",
    "TELESCOPIC",
    "",
    "---",
    "## Section A",
    "details",
    "---",
    "## Section B",
    "more details",
    "",
    "---",
    "",
  ].join("\n");

  assert.deepEqual(extractSingleRetrievedTemplateEnvelope(output), {
    prompt_name: "telescopic",
    prompt_content: "## Section A\ndetails\n---\n## Section B\nmore details",
    prompt_tags: ["action:expand"],
    prompt_source: "vault-client-live",
  });
});

test("getCrossExtensionHarnessReadiness reports not ready for missing paths", () => {
  const readiness = getCrossExtensionHarnessReadiness({
    vaultClientDir: "/tmp/does-not-exist-vault-client",
    vaultDir: "/tmp/does-not-exist-vault-db",
  });

  assert.equal(readiness.ready, false);
  assert.match(readiness.reasons.join("\n"), /vault-client/i);
  assert.match(readiness.reasons.join("\n"), /vault db/i);
});

test("getCrossExtensionHarnessPaths resolves entry from package pi.extensions", async () => {
  const vaultClientDir = await mkdtemp(join(tmpdir(), "cross-extension-paths-"));

  try {
    await mkdir(join(vaultClientDir, "extensions"), { recursive: true });
    await writeFile(
      join(vaultClientDir, "package.json"),
      JSON.stringify({ pi: { extensions: ["./extensions/vault.ts"] } }),
    );
    await writeFile(join(vaultClientDir, "extensions", "vault.ts"), "export default () => {};\n");

    const paths = getCrossExtensionHarnessPaths({
      vaultClientDir,
      vaultDir: "/tmp/mock-vault-db",
    });

    assert.equal(paths.vaultClientEntryPath, join(vaultClientDir, "extensions", "vault.ts"));
  } finally {
    await rm(vaultClientDir, { recursive: true, force: true });
  }
});

test("getCrossExtensionHarnessPaths falls back to extensions/vault.ts when package parsing fails", async () => {
  const vaultClientDir = await mkdtemp(join(tmpdir(), "cross-extension-paths-fallback-"));

  try {
    await mkdir(join(vaultClientDir, "extensions"), { recursive: true });
    await writeFile(join(vaultClientDir, "package.json"), "{ not-json }");
    await writeFile(join(vaultClientDir, "extensions", "vault.ts"), "export default () => {};\n");

    const paths = getCrossExtensionHarnessPaths({
      vaultClientDir,
      vaultDir: "/tmp/mock-vault-db",
    });

    assert.equal(paths.vaultClientEntryPath, join(vaultClientDir, "extensions", "vault.ts"));
  } finally {
    await rm(vaultClientDir, { recursive: true, force: true });
  }
});

const readiness = getCrossExtensionHarnessReadiness();

test(
  "live cross-extension harness: vault-client retrieval feeds dispatch_subagent prompt envelope",
  { skip: !readiness.ready },
  async (t) => {
    const harness = createPiHarness();
    const sessionsDir = await mkdtemp(join(tmpdir(), "cross-extension-live-test-"));

    try {
      const vaultClientModule = await import(
        pathToFileURL(readiness.paths.vaultClientEntryPath).href
      );
      const registerVaultClient = vaultClientModule.default;
      assert.equal(typeof registerVaultClient, "function");

      registerVaultClient(harness.pi);

      let capturedDef;
      registerSubagentTool(
        harness.pi,
        createSubagentState(sessionsDir),
        () => "test/model",
        async (def) => {
          capturedDef = def;
          return {
            output: "ok",
            exitCode: 0,
            elapsed: 50,
            status: "done",
          };
        },
      );

      const queryTool = harness.tools.get("vault_query");
      const retrieveTool = harness.tools.get("vault_retrieve");
      const dispatchTool = harness.tools.get("dispatch_subagent");

      assert.ok(queryTool, "vault_query should be registered");
      assert.ok(retrieveTool, "vault_retrieve should be registered");
      assert.ok(dispatchTool, "dispatch_subagent should be registered");

      const queryResult = await queryTool.execute(
        "tc-x-1",
        { limit: 1, include_content: false },
        null,
        null,
        { cwd: process.cwd(), hasUI: false },
      );

      const queryText =
        queryResult?.content?.[0]?.type === "text" ? queryResult.content[0].text : "";
      const templateName = extractFirstTemplateNameFromVaultQueryOutput(queryText);
      if (!templateName) {
        t.skip("vault_query returned no templates to validate live retrieval path");
        return;
      }

      const retrieveResult = await retrieveTool.execute(
        "tc-x-2",
        { names: [templateName], include_content: true },
        null,
        null,
        { cwd: process.cwd(), hasUI: false },
      );

      const retrieveText =
        retrieveResult?.content?.[0]?.type === "text" ? retrieveResult.content[0].text : "";
      const envelope = extractSingleRetrievedTemplateEnvelope(retrieveText);

      assert.ok(envelope, "vault_retrieve output should contain a parseable template envelope");

      const dispatchResult = await dispatchTool.execute(
        "tc-x-3",
        {
          profile: "reviewer",
          objective: "Validate prompt envelope propagation",
          ...envelope,
        },
        null,
        null,
        { cwd: process.cwd(), hasUI: false },
      );

      assert.equal(dispatchResult.details.prompt_applied, true);
      assert.equal(dispatchResult.details.prompt_name, envelope.prompt_name);
      assert.equal(dispatchResult.details.prompt_source, "vault-client-live");
      assert.match(capturedDef.systemPrompt, /^\[Prompt Envelope\]/);
      assert.match(capturedDef.systemPrompt, new RegExp(`name: ${envelope.prompt_name}`));
    } finally {
      await rm(sessionsDir, { recursive: true, force: true });
    }
  },
);

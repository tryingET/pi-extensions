import assert from "node:assert/strict";
import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";
import {
  extractFirstTemplateNameFromVaultQueryOutput,
  extractSingleRetrievedTemplateEnvelope,
  getCrossExtensionHarnessPaths,
  getCrossExtensionHarnessReadiness,
} from "../extensions/self/cross-extension-harness.ts";

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

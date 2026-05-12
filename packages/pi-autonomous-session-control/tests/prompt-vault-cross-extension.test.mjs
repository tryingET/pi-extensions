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

test("extractSingleRetrievedTemplateEnvelope parses retrieved template output without closing fence", () => {
  const output = [
    "# Retrieved Templates (1)",
    "",
    "- current_company: software",
    "",
    "## 100x-mindset",
    "Abbreviated 100x mindset",
    "",
    "### Core classification",
    "- artifact_kind: cognitive",
    "",
    "---",
    "100x MINDSET — Delete More Than You Add",
    "",
    "Stop when boring.",
  ].join("\n");

  assert.deepEqual(extractSingleRetrievedTemplateEnvelope(output), {
    prompt_name: "100x-mindset",
    prompt_content: "100x MINDSET — Delete More Than You Add\n\nStop when boring.",
    prompt_tags: undefined,
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

test("getCrossExtensionHarnessPaths uses sibling fallback when legacy default lacks an entry", async () => {
  const legacyVaultClientDir = await mkdtemp(join(tmpdir(), "cross-extension-legacy-"));
  const siblingVaultClientDir = await mkdtemp(join(tmpdir(), "cross-extension-sibling-"));

  try {
    await mkdir(join(siblingVaultClientDir, "extensions"), { recursive: true });
    await writeFile(
      join(siblingVaultClientDir, "package.json"),
      JSON.stringify({ pi: { extensions: ["./extensions/vault.js"] } }),
    );
    await writeFile(
      join(siblingVaultClientDir, "extensions", "vault.js"),
      "export default () => {};\n",
    );

    const paths = getCrossExtensionHarnessPaths({
      defaultVaultClientDirCandidates: [legacyVaultClientDir, siblingVaultClientDir],
      vaultDir: "/tmp/mock-vault-db",
    });

    assert.equal(paths.vaultClientDir, siblingVaultClientDir);
    assert.equal(paths.vaultClientEntryPath, join(siblingVaultClientDir, "extensions", "vault.js"));
  } finally {
    await rm(legacyVaultClientDir, { recursive: true, force: true });
    await rm(siblingVaultClientDir, { recursive: true, force: true });
  }
});

test("getCrossExtensionHarnessReadiness ignores non-runtime pi-coding-agent root export", async () => {
  const vaultClientDir = await mkdtemp(join(tmpdir(), "cross-extension-deps-"));
  const vaultDir = await mkdtemp(join(tmpdir(), "cross-extension-vault-db-"));

  try {
    await mkdir(join(vaultClientDir, "extensions"), { recursive: true });
    await mkdir(join(vaultClientDir, "node_modules", "typebox"), { recursive: true });
    await mkdir(join(vaultClientDir, "node_modules", "@mariozechner", "pi-tui"), {
      recursive: true,
    });
    await mkdir(join(vaultClientDir, "node_modules", "@mariozechner", "pi-coding-agent"), {
      recursive: true,
    });

    await writeFile(join(vaultClientDir, "extensions", "vault.js"), "export default () => {};\n");
    await writeFile(
      join(vaultClientDir, "node_modules", "typebox", "package.json"),
      JSON.stringify({ name: "typebox", main: "index.js" }),
    );
    await writeFile(join(vaultClientDir, "node_modules", "typebox", "index.js"), "");
    await writeFile(
      join(vaultClientDir, "node_modules", "@mariozechner", "pi-tui", "package.json"),
      JSON.stringify({ name: "@mariozechner/pi-tui", main: "index.js" }),
    );
    await writeFile(
      join(vaultClientDir, "node_modules", "@mariozechner", "pi-tui", "index.js"),
      "",
    );
    await writeFile(
      join(vaultClientDir, "node_modules", "@mariozechner", "pi-coding-agent", "package.json"),
      JSON.stringify({
        name: "@mariozechner/pi-coding-agent",
        exports: { "./extension": "./extension.js" },
      }),
    );
    await writeFile(
      join(vaultClientDir, "node_modules", "@mariozechner", "pi-coding-agent", "extension.js"),
      "",
    );

    const readiness = getCrossExtensionHarnessReadiness({
      vaultClientDir,
      vaultDir,
    });

    assert.doesNotMatch(readiness.reasons.join("\n"), /runtime deps missing/);
    assert.doesNotMatch(readiness.reasons.join("\n"), /@mariozechner\/pi-coding-agent/);
  } finally {
    await rm(vaultClientDir, { recursive: true, force: true });
    await rm(vaultDir, { recursive: true, force: true });
  }
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

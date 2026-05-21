import assert from "node:assert/strict";
import { chmod, mkdir, mkdtemp, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";
import { buildContextPacket, formatContextPacket } from "../src/context-pack.js";

const makeWorkspace = async () => {
  const root = await mkdtemp(join(tmpdir(), "pi-context-pack-"));
  await mkdir(join(root, "docs", "project"), { recursive: true });
  await writeFile(join(root, "AGENTS.md"), "# AGENTS\n\nUse bounded read-only context.\n", "utf8");
  await writeFile(
    join(root, "docs", "project", "note.md"),
    "# Note\n\nThis is source-owned Markdown context.\n",
    "utf8",
  );
  return root;
};

test("context_pack assembles AGENTS and seeded Markdown without mutating providers", async () => {
  const root = await makeWorkspace();
  const result = await buildContextPacket({
    objective: "Plan docs context for implementation",
    cwd: root,
    repoRoot: root,
    seeds: [{ kind: "path", value: "docs/project/note.md" }],
    providers: { git: "off" },
  });

  assert.equal(result.ok, true);
  const byProvider = Object.fromEntries(
    result.packet.sections.map((section) => [section.provider, section]),
  );
  assert.equal(byProvider.agents.items.length, 1);
  assert.equal(byProvider.docs.items.length, 1);
  assert.match(byProvider.docs.items[0].content, /source-owned Markdown/);
  assert.ok(result.packet.nonAuthorizations.some((item) => item.includes("does not mutate")));
  assert.ok(result.packet.measurementReceipt.selectedItemCount >= 2);
  assert.ok(result.packet.measurementReceipt.estimatedToolCallsAvoided >= 2);
});

test("context_pack enforces the global packet budget across providers while preserving reserve", async () => {
  const root = await makeWorkspace();
  const body = "x".repeat(2400);
  await writeFile(join(root, "AGENTS.md"), body, "utf8");
  await writeFile(join(root, "docs", "project", "note.md"), body, "utf8");

  const result = await buildContextPacket({
    objective: "Read docs context",
    cwd: root,
    repoRoot: root,
    budget: { maxTokens: 1000 },
    seeds: [{ kind: "path", value: "docs/project/note.md" }],
    providers: { git: "off", sci: "off" },
  });

  assert.equal(result.ok, true);
  const usableTokens = result.packet.budget.maxTokens - result.packet.budget.reserveTokens;
  assert.ok(result.packet.totals.estimatedTokens <= usableTokens, result.packet);
  assert.ok(result.packet.totals.bytes <= result.packet.budget.maxBytes, result.packet);
  assert.ok(result.packet.measurementReceipt.packetFillRatio <= 1, result.packet);
  assert.ok(result.packet.omissions.some((omission) => omission.reason === "budget"));
});

test("context_pack discovers ranked Markdown docs through docs-list when available", async () => {
  const root = await makeWorkspace();
  await writeFile(
    join(root, "docs", "project", "auto.md"),
    "# Auto\n\nRanked docs-list context.\n",
    "utf8",
  );
  const script = join(root, "docs-list-fake.mjs");
  await writeFile(script, "console.log('docs/project/auto.md');\n", "utf8");
  await chmod(script, 0o755);

  const result = await buildContextPacket(
    {
      objective: "Use architecture docs for implementation",
      cwd: root,
      repoRoot: root,
      providers: { docs: "required", git: "off", sci: "off" },
    },
    { docsListScript: script },
  );

  const docs = result.packet.sections.find((section) => section.provider === "docs");
  assert.equal(docs.items.length, 1);
  assert.equal(docs.items[0].provenance.path, "docs/project/auto.md");
  assert.match(docs.items[0].content, /Ranked docs-list context/);
});

test("context_pack treats uppercase Markdown seeds as docs", async () => {
  const root = await makeWorkspace();
  await writeFile(join(root, "docs", "project", "README.MD"), "# Uppercase markdown\n", "utf8");

  const result = await buildContextPacket({
    objective: "Read docs context",
    cwd: root,
    repoRoot: root,
    seeds: [{ kind: "path", value: "docs/project/README.MD" }],
    providers: { git: "off", sci: "off" },
  });

  const docs = result.packet.sections.find((section) => section.provider === "docs");
  assert.equal(docs.items.length, 1);
  assert.equal(docs.items[0].kind, "doc");
  assert.match(docs.items[0].content, /Uppercase markdown/);
});

test("context_pack preserves loader-style AGENTS order", async () => {
  const root = await makeWorkspace();
  await mkdir(join(root, "packages", "pkg"), { recursive: true });
  await writeFile(join(root, "packages", "pkg", "AGENTS.md"), "# Package AGENTS\n", "utf8");

  const result = await buildContextPacket({
    objective: "Read instruction context",
    cwd: join(root, "packages", "pkg"),
    repoRoot: root,
    providers: { git: "off", sci: "off", docs: "off" },
  });

  const agents = result.packet.sections.find((section) => section.provider === "agents");
  assert.deepEqual(
    agents.items.map((item) => item.provenance.path),
    ["AGENTS.md", "packages/pkg/AGENTS.md"],
  );
});

test("context_pack records planned provider omissions for selected unwired providers", async () => {
  const root = await makeWorkspace();
  const result = await buildContextPacket({
    objective: "Use SCI and FCOS context for code coordination",
    cwd: root,
    repoRoot: root,
    providers: { git: "off" },
  });

  const omittedProviders = result.packet.omissions.map((omission) => omission.provider);
  assert.ok(omittedProviders.includes("sci"));
  assert.ok(omittedProviders.includes("fcos"));
  assert.ok(result.packet.nextToolSuggestions.length >= 2);
});

test("context_pack reports missing workspace roots instead of throwing", async () => {
  const root = await makeWorkspace();
  const missingRoot = join(root, "missing-root");
  const result = await buildContextPacket({
    objective: "Read docs context",
    cwd: missingRoot,
    repoRoot: missingRoot,
    seeds: [{ kind: "path", value: "docs/project/note.md" }],
    providers: { git: "off" },
  });

  assert.equal(result.ok, true);
  assert.equal(result.packet.repoRoot, missingRoot);
  assert.ok(
    result.packet.omissions.some((omission) =>
      omission.detail.includes("workspace root does not exist"),
    ),
  );
});

test("context_pack fails closed on unsafe path seeds", async () => {
  const root = await makeWorkspace();
  const result = await buildContextPacket({
    objective: "Read docs context",
    cwd: root,
    repoRoot: root,
    seeds: [{ kind: "path", value: "../secret.md" }],
    providers: { git: "off" },
  });

  assert.equal(result.ok, true);
  assert.equal(
    result.packet.sections.some((section) => section.provider === "docs"),
    false,
  );
  assert.ok(
    result.packet.omissions.some(
      (omission) => omission.reason === "unsafe_path" && omission.detail.includes("parent"),
    ),
  );
});

test("formatContextPacket summarizes selected sections and omissions", async () => {
  const root = await makeWorkspace();
  const result = await buildContextPacket({
    objective: "Use docs and SCI",
    cwd: root,
    repoRoot: root,
    seeds: [{ kind: "path", value: "docs/project/note.md" }],
    providers: { git: "off" },
  });
  const text = formatContextPacket(result);

  assert.match(text, /# Context packet:/);
  assert.match(text, /## Section summary/);
  assert.match(text, /## Omissions/);
});

test("context_pack emits measurement receipt for packet usefulness", async () => {
  const root = await makeWorkspace();
  const result = await buildContextPacket({
    objective: "Measure docs context packet",
    cwd: root,
    repoRoot: root,
    seeds: [{ kind: "path", value: "docs/project/note.md" }],
    providers: { git: "off" },
  });

  assert.equal(result.packet.measurementReceipt.wiredProviders.includes("agents"), true);
  assert.equal(result.packet.measurementReceipt.wiredProviders.includes("docs"), true);
  assert.equal(typeof result.packet.measurementReceipt.packetFillRatio, "number");
  assert.ok(result.packet.measurementHints.some((hint) => hint.metric === "tool_calls_avoided"));
});

test("context_pack deduplicates content already loaded in the system prompt", async () => {
  const root = await makeWorkspace();
  const loadedAgents = "# AGENTS\n\nUse bounded read-only context.\n";
  const result = await buildContextPacket(
    {
      objective: "Plan with already-loaded instructions",
      cwd: root,
      repoRoot: root,
      providers: { git: "off" },
    },
    { systemPrompt: `prefix\n${loadedAgents}\nsuffix` },
  );

  const agents = result.packet.sections.find((section) => section.provider === "agents");
  assert.equal(agents.items[0].contentMode, "metadata");
  assert.equal(agents.items[0].duplicateOf, "system_prompt");
  assert.equal(result.packet.measurementReceipt.alreadyLoadedItems, 1);
  assert.ok(result.packet.measurementReceipt.duplicateTokensAvoided > 0);
});

test("context_pack includes session environment metadata when selected", async () => {
  const root = await makeWorkspace();
  const result = await buildContextPacket(
    {
      objective: "Plan current context window environment",
      cwd: root,
      repoRoot: root,
      providers: { session: "required", git: "off" },
    },
    {
      systemPrompt: "loaded prompt",
      contextUsage: { tokens: 1234 },
      modelLabel: "test/model",
    },
  );

  const session = result.packet.sections.find((section) => section.provider === "session");
  assert.equal(session.items.length, 1);
  assert.match(session.items[0].content, /systemPromptEstimatedTokens/);
  assert.match(session.items[0].content, /test\/model/);
});

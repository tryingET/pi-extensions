import assert from "node:assert/strict";
import { mkdir, mkdtemp, writeFile } from "node:fs/promises";
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
  assert.equal(result.packet.measurementReceipt.selectedItemCount, 2);
  assert.ok(result.packet.measurementReceipt.estimatedToolCallsAvoided >= 2);
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

  assert.match(text, /Context packet for:/);
  assert.match(text, /sections:/);
  assert.match(text, /omissions:/);
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

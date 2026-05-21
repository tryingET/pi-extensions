import assert from "node:assert/strict";
import { mkdir, mkdtemp, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";
import { contextPacketToolResult } from "../src/context-pack.js";

const makeWorkspace = async () => {
  const root = await mkdtemp(join(tmpdir(), "pi-context-pack-tool-"));
  await mkdir(join(root, "docs"), { recursive: true });
  await writeFile(join(root, "AGENTS.md"), "# AGENTS\n", "utf8");
  await writeFile(join(root, "docs", "note.md"), "# Note\n\nUseful packet content.\n", "utf8");
  return root;
};

test("contextPacketToolResult returns markdown content and compact details", async () => {
  const root = await makeWorkspace();
  const result = await contextPacketToolResult({
    objective: "Assemble readable packet",
    cwd: root,
    repoRoot: root,
    seeds: [{ kind: "path", value: "docs/note.md" }],
    providers: { git: "off", sci: "off" },
  });

  assert.match(result.content[0].text, /# Context packet:/);
  assert.match(result.content[0].text, /Useful packet content/);
  assert.equal(result.details.ok, true);
  assert.equal(result.details.sections[0].items[0].content, undefined);
  assert.equal(result.details.sections[0].items[0].id.startsWith("agents:"), true);
  assert.equal(typeof result.details.measurementReceipt.estimatedToolCallsAvoided, "number");
});

import assert from "node:assert/strict";
import { mkdir, mkdtemp, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";
import { buildContextPacket } from "../src/context-pack.js";

const makeWorkspace = async () => {
  const root = await mkdtemp(join(tmpdir(), "pi-context-pack-sci-"));
  await mkdir(join(root, "src"), { recursive: true });
  await writeFile(join(root, "AGENTS.md"), "# AGENTS\n", "utf8");
  await writeFile(join(root, "src", "example.js"), "export const target = 1;\n", "utf8");
  return root;
};

const sciStdout = (value) =>
  JSON.stringify({
    content: [{ type: "text", text: JSON.stringify(value) }],
    isError: false,
  });

test("context_pack uses SCI read_file for code path seeds", async () => {
  const root = await makeWorkspace();
  const calls = [];
  const fakeExec = async (command, args, options) => {
    calls.push({ command, args, options });
    assert.equal(command, "/tmp/fake-sci");
    assert.deepEqual(args.slice(0, 2), ["workflow", "read_file"]);
    return {
      stdout: sciStdout({
        path: "src/example.js",
        range: { startLine: 1, endLine: 120 },
        content: "export const target = 1;\n",
        truncated: false,
      }),
    };
  };

  const result = await buildContextPacket(
    {
      objective: "Use code context for implementation",
      cwd: root,
      repoRoot: root,
      seeds: [{ kind: "path", value: "src/example.js" }],
      providers: { git: "off" },
    },
    { sciCommand: "/tmp/fake-sci", execFileAsync: fakeExec },
  );

  const sci = result.packet.sections.find((section) => section.provider === "sci");
  assert.equal(calls.length, 1);
  assert.equal(sci.items.length, 1);
  assert.equal(sci.items[0].content, "export const target = 1;\n");
  assert.equal(sci.items[0].contentMode, "range");
  assert.ok(result.packet.measurementReceipt.estimatedToolCallsAvoided >= 3);
});

test("context_pack does not route uppercase Markdown path seeds to SCI", async () => {
  const root = await makeWorkspace();
  await mkdir(join(root, "docs"), { recursive: true });
  await writeFile(join(root, "docs", "README.MD"), "# Uppercase Markdown\n", "utf8");
  const calls = [];
  const fakeExec = async (command, args, options) => {
    calls.push({ command, args, options });
    return { stdout: sciStdout({}) };
  };

  const result = await buildContextPacket(
    {
      objective: "Read docs context",
      cwd: root,
      repoRoot: root,
      seeds: [{ kind: "path", value: "docs/README.MD" }],
      providers: { git: "off", sci: "required" },
    },
    { sciCommand: "/tmp/fake-sci", execFileAsync: fakeExec },
  );

  const docs = result.packet.sections.find((section) => section.provider === "docs");
  assert.equal(calls.length, 0);
  assert.equal(docs.items.length, 1);
  assert.equal(docs.items[0].kind, "doc");
  assert.ok(result.packet.omissions.some((omission) => omission.provider === "sci"));
});

test("context_pack falls back from SCI symbol_search to text_search", async () => {
  const root = await makeWorkspace();
  const workflows = [];
  const fakeExec = async (_command, args) => {
    workflows.push(args[1]);
    if (args[1] === "symbol_search") {
      return { stdout: sciStdout({ query: "target", count: 0, symbols: [] }) };
    }
    return {
      stdout: sciStdout({
        count: 1,
        results: [{ file: "src/example.js", line: 1, text: "export const target = 1;" }],
      }),
    };
  };

  const result = await buildContextPacket(
    {
      objective: "Find code symbol context",
      cwd: root,
      repoRoot: root,
      seeds: [{ kind: "symbol", value: "target" }],
      providers: { git: "off" },
    },
    { sciCommand: "/tmp/fake-sci", execFileAsync: fakeExec },
  );

  const sci = result.packet.sections.find((section) => section.provider === "sci");
  assert.deepEqual(workflows, ["symbol_search", "text_search"]);
  assert.equal(sci.items.length, 1);
  assert.match(sci.items[0].content, /src\/example\.js/);
});

/**
summary: "Coverage for repairing parser-leaked wrapping newlines in tool arguments without touching exact-match content."
read_when:
  - "Changing which tool parameters are normalized before execution."
*/
import assert from "node:assert/strict";
import test from "node:test";
import {
  describeRepairs,
  repairToolArguments,
} from "../extensions/workstation-tool-argument-hygiene.ts";

test("repairs the observed livelock: a read path with a trailing newline", () => {
  // Verbatim from session 01a09733, which retried this call 21 times over 456 s.
  const input = { path: "/home/tryinget/ai-society/core/agent-kernel/AGENTS.md\n" };
  const repairs = repairToolArguments("read", input);

  assert.equal(input.path, "/home/tryinget/ai-society/core/agent-kernel/AGENTS.md");
  assert.equal(repairs.length, 1);
  assert.equal(repairs[0].parameter, "path");
});

test("repairs leading newlines and CRLF residue", () => {
  const input = { path: "\n/etc/hosts\r\n" };
  repairToolArguments("read", input);
  assert.equal(input.path, "/etc/hosts");
});

test("leaves a clean argument untouched and reports no repair", () => {
  const input = { command: "ls -la /tmp" };
  const repairs = repairToolArguments("bash", input);

  assert.equal(input.command, "ls -la /tmp");
  assert.deepEqual(repairs, []);
});

test("never alters interior newlines in a bash heredoc", () => {
  const command = "cat <<'EOF' > f.txt\nline1\n\nline2\nEOF";
  const input = { command: `${command}\n` };
  repairToolArguments("bash", input);
  assert.equal(input.command, command);
});

test("does not touch write.content, where trailing newlines are real content", () => {
  const input = { path: "/tmp/x.txt\n", content: "final line\n\n" };
  repairToolArguments("write", input);

  assert.equal(input.path, "/tmp/x.txt", "the path is parser residue and is repaired");
  assert.equal(input.content, "final line\n\n", "file content is preserved byte for byte");
});

test("does not touch edit oldText/newText, which are matched exactly against the file", () => {
  const input = {
    path: "/tmp/x.ts\n",
    edits: [{ oldText: "\nconst a = 1;\n", newText: "\nconst a = 2;\n" }],
  };
  repairToolArguments("edit", input);

  assert.equal(input.path, "/tmp/x.ts");
  assert.equal(input.edits[0].oldText, "\nconst a = 1;\n");
  assert.equal(input.edits[0].newText, "\nconst a = 2;\n");
});

test("leaves a whitespace-only argument alone so it fails visibly", () => {
  const input = { path: "\n\n" };
  const repairs = repairToolArguments("read", input);

  assert.equal(input.path, "\n\n");
  assert.deepEqual(repairs, [], "emptying the value would hide a real model error");
});

test("ignores tools with no trimmable parameters and non-string values", () => {
  const custom = { anything: "\nkeep\n" };
  assert.deepEqual(repairToolArguments("some_extension_tool", custom), []);
  assert.equal(custom.anything, "\nkeep\n");

  const typed = { path: 42, pattern: "\nTODO\n" };
  repairToolArguments("grep", typed);
  assert.equal(typed.path, 42);
  assert.equal(typed.pattern, "TODO");
});

test("describeRepairs names every repaired parameter", () => {
  const input = { pattern: "\nTODO\n", path: "\nsrc\n", glob: "*.ts" };
  const repairs = repairToolArguments("grep", input);

  assert.equal(repairs.length, 2);
  assert.equal(
    describeRepairs(repairs),
    "Trimmed parser-leaked newlines from grep.pattern, grep.path",
  );
});

import assert from "node:assert/strict";
import test from "node:test";
import { previewRecentEvidence, splitAkEvidenceBlocks } from "../src/runtime/society.ts";

test("splitAkEvidenceBlocks groups ak evidence text into entry blocks", () => {
  const text = [
    "#3  validation:alpha    pass   task_id=1 task_ref=- repo=- repo_scope=-",
    "  checked_at: 2026-03-30T12:00:00Z",
    "  checked_by: cli",
    "#2  validation:beta     fail   task_id=2 task_ref=- repo=- repo_scope=-",
    "  checked_at: 2026-03-30T11:00:00Z",
    "  checked_by: cli",
    "",
  ].join("\n");

  assert.deepEqual(splitAkEvidenceBlocks(text), [
    [
      "#3  validation:alpha    pass   task_id=1 task_ref=- repo=- repo_scope=-",
      "  checked_at: 2026-03-30T12:00:00Z",
      "  checked_by: cli",
    ].join("\n"),
    [
      "#2  validation:beta     fail   task_id=2 task_ref=- repo=- repo_scope=-",
      "  checked_at: 2026-03-30T11:00:00Z",
      "  checked_by: cli",
    ].join("\n"),
  ]);
});

test("previewRecentEvidence uses ak evidence search and truncates to the requested entry limit", async () => {
  const calls = [];
  const output = [
    "#3  validation:alpha    pass   task_id=1 task_ref=- repo=- repo_scope=-",
    "  checked_at: 2026-03-30T12:00:00Z",
    "  checked_by: cli",
    "#2  validation:beta     fail   task_id=2 task_ref=- repo=- repo_scope=-",
    "  checked_at: 2026-03-30T11:00:00Z",
    "  checked_by: cli",
    "#1  validation:gamma    pass   task_id=3 task_ref=- repo=- repo_scope=-",
    "  checked_at: 2026-03-30T10:00:00Z",
    "  checked_by: cli",
  ].join("\n");

  const result = await previewRecentEvidence(
    {
      akPath: "/tmp/fake-ak",
      societyDb: "/tmp/fake.db",
      cwd: "/tmp/repo/packages/demo",
      async runAk(params) {
        calls.push(params);
        return {
          ok: true,
          stdout: output,
          stderr: "",
        };
      },
    },
    undefined,
    2,
  );

  assert.equal(result.ok, true);
  if (result.ok) {
    assert.equal(result.value.entryCount, 3);
    assert.equal(result.value.truncated, true);
    assert.match(result.value.text, /^#3\s+validation:alpha/m);
    assert.match(result.value.text, /^#2\s+validation:beta/m);
    assert.doesNotMatch(result.value.text, /^#1\s+validation:gamma/m);
  }

  assert.deepEqual(calls, [
    {
      akPath: "/tmp/fake-ak",
      societyDb: "/tmp/fake.db",
      args: ["evidence", "search"],
      cwd: "/tmp/repo/packages/demo",
      signal: undefined,
    },
  ]);
});

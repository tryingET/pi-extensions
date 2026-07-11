import assert from "node:assert/strict";
import { execFile } from "node:child_process";
import { mkdir, mkdtemp, readFile, rm, stat, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";
import { promisify } from "node:util";

const execFileAsync = promisify(execFile);

function entries(toolCallId, resultText) {
  return [
    {
      type: "message",
      id: `assistant-${toolCallId}`,
      timestamp: "2026-07-11T00:00:00.000Z",
      message: {
        role: "assistant",
        content: [
          {
            type: "toolCall",
            name: "edit",
            id: toolCallId,
            arguments: {
              path: "private/example.ts",
              edits: [{ oldText: "secret repeated text", newText: "replacement" }],
            },
          },
        ],
      },
    },
    {
      type: "message",
      id: `result-${toolCallId}`,
      timestamp: "2026-07-11T00:00:01.000Z",
      message: {
        role: "toolResult",
        toolCallId,
        toolName: "edit",
        isError: true,
        content: [{ type: "text", text: resultText }],
      },
    },
  ];
}

async function writeJsonl(path, values) {
  await writeFile(path, `${values.map((value) => JSON.stringify(value)).join("\n")}\n`, "utf8");
}

test("jq-only analyzer uses jq 1.6-compatible conditional binding syntax", async () => {
  const analyzer = new URL("../scripts/analyze-edit-failures.sh", import.meta.url).pathname;
  const source = await readFile(analyzer, "utf8");
  assert.match(source, /\| \(if \$occurrence != null then[\s\S]*?\n\s+end\) as \$category/);
  assert.doesNotMatch(source, /\bend as \$[A-Za-z_][A-Za-z0-9_]*/);
});

test("jq-only analyzer deduplicates forked calls and retains no source text or paths", async () => {
  const directory = await mkdtemp(join(tmpdir(), "pi-snapshot-evidence-"));
  const sessions = join(directory, "sessions");
  const output = join(directory, "baseline.json");
  await mkdir(sessions);
  const ambiguous = entries(
    "call-ambiguous",
    "Found 2 occurrences of edits[0] in private/example.ts. Each oldText must be unique.",
  );
  const overlap = entries(
    "call-overlap",
    "edits[1] and edits[0] overlap in private/example.ts. Merge them into one edit.",
  );
  try {
    await writeJsonl(join(sessions, "one.jsonl"), [...ambiguous, ...overlap]);
    await writeJsonl(join(sessions, "fork.jsonl"), ambiguous);
    await execFileAsync("bash", [
      new URL("../scripts/analyze-edit-failures.sh", import.meta.url).pathname,
      sessions,
      output,
    ]);

    const text = await readFile(output, "utf8");
    const baseline = JSON.parse(text);
    assert.equal(baseline.uniqueEditErrors, 2);
    assert.equal(baseline.categories.ambiguous_old_text, 1);
    assert.equal(baseline.categories.overlapping_edits, 1);
    assert.equal(baseline.ambiguousOccurrenceCounts["2"], 1);
    assert.equal(baseline.ambiguousOldText.chars.median, "secret repeated text".length);
    assert.match(baseline.capturedOn, /^\d{4}-\d{2}-\d{2}$/);
    assert.equal((await stat(output)).mode & 0o777, 0o600);
    assert.doesNotMatch(text, /secret repeated text|private\/example\.ts|call-ambiguous/);
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
});

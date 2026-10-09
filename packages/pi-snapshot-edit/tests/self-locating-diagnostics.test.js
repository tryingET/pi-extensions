// summary: "Failed edits say where the revision differs: match lines, near misses, conflicting edits, every problem of a batch at once; success previews show the changed regions."
// read_when:
//   - "Changing selector diagnostics, batch validation, or edit previews."

import assert from "node:assert/strict";
import { mkdtemp, readFile, realpath, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";
import { SnapshotEditService } from "../src/snapshot-service.js";

async function attempt(text, edits) {
  const directory = await realpath(await mkdtemp(join(tmpdir(), "pi-snapshot-diag-")));
  const path = join(directory, "f.txt");
  await writeFile(path, text);
  const service = new SnapshotEditService();
  try {
    const read = await service.read({ path: "f.txt" }, directory);
    const outcome = await service
      .edit({ path: "f.txt", base: read.details.revision, edits }, directory)
      .then((result) => ({ result }))
      .catch((error) => ({ error }));
    return { ...outcome, after: await readFile(path, "utf8") };
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
}

const replace = (oldText, newText, extra = {}) => ({ op: "replace", oldText, newText, ...extra });

test("an ambiguous selector lists every match with its line", async () => {
  const { error, after } = await attempt("a\nreturn x;\nb\nreturn x;\n", [
    replace("return x;", "return y;"),
  ]);
  assert.match(
    error.message,
    /matches 2 occurrences; occurrence is required and 1-indexed\. Matches: #1 line 2: "return x;"; #2 line 4: "return x;"\./u,
  );
  assert.equal(after, "a\nreturn x;\nb\nreturn x;\n");
});

test("an out-of-range occurrence lists the matches it could have chosen", async () => {
  const { error } = await attempt("x\nx\n", [replace("x", "y", { occurrence: 3 })]);
  assert.match(
    error.message,
    /occurrence 3 is out of range for 2 match\(es\)\. Matches: #1 line 1: "x"; #2 line 2: "x"\./u,
  );
});

test("long match lists stay bounded", async () => {
  const { error } = await attempt("v\n".repeat(20), [replace("v", "w")]);
  assert.match(error.message, /#8 line 8: "v"; and 12 more\./u);
});

test("a whitespace-only difference is diagnosed with the revision's exact text, never applied", async () => {
  const { error, after } = await attempt("function f() {\n\treturn  1;\n}\n", [
    replace("function f() {\n  return 1;\n}", "function f() {\n\treturn 2;\n}"),
  ]);
  assert.match(
    error.message,
    /has no exact match in the base revision; it matches at line 1 if whitespace is ignored; the revision has "function f\(\) \{\\n\\treturn {2}1;\\n\}"/u,
  );
  assert.equal(after, "function f() {\n\treturn  1;\n}\n");
});

test("a multi-line selector reports the line where the closest candidate diverges", async () => {
  const { error } = await attempt("start\nmiddle\nend\n", [replace("start\nmidle\nend", "x")]);
  assert.match(
    error.message,
    /its first line occurs at line 1, but its line 2 differs: the revision has "middle" where it has "midle"/u,
  );
});

test("a single-line selector reports its longest present prefix", async () => {
  const { error } = await attempt("const value = compute(alpha);\n", [
    replace("const value = compute(beta);", "x"),
  ]);
  assert.match(
    error.message,
    /its first 22 of 28 characters occur at line 1, where the revision continues "const value = compute\(alpha\);"/u,
  );
});

test("conflicting operations name both edits and their lines", async () => {
  const { error } = await attempt("one two three\n", [
    replace("one two", "1 2"),
    replace("two three", "2 3"),
  ]);
  assert.match(
    error.message,
    /edits\[0\] \(line 1\) and edits\[1\] \(line 1\) overlap: overlapping replacements/u,
  );
});

test("every problem of a batch is reported at once and nothing is written", async () => {
  const { error, after } = await attempt("a\na\nb\n", [
    replace("a", "A"),
    replace("missing", "M"),
    replace("b", "B"),
    { op: "insert_after", anchorText: "b", newText: "!" },
  ]);
  assert.match(
    error.message,
    /^3 problems in 4 edit\(s\) against this revision; fix all of them and retry:/u,
  );
  assert.match(error.message, /- edits\[0\]\.oldText matches 2 occurrences/u);
  assert.match(error.message, /- edits\[1\]\.oldText has no exact match/u);
  assert.match(
    error.message,
    /- edits\[2\] \(line 3\) and edits\[3\] \(line 3\) overlap: an insertion on a replacement boundary or interior/u,
  );
  assert.equal(after, "a\na\nb\n");
});

test("a single problem keeps the plain message", async () => {
  const { error } = await attempt("a\n", [replace("missing", "x")]);
  assert.match(error.message, /^edits\[0\]\.oldText has no exact match/u);
});

test("the success preview shows each changed region with context, not the file's top", async () => {
  const lines = Array.from({ length: 40 }, (_, index) => `line ${index + 1}`);
  const { result } = await attempt(`${lines.join("\n")}\n`, [
    replace("line 20", "LINE 20"),
    { op: "insert_after", anchorText: "line 35\n", newText: "inserted\n" },
  ]);
  assert.match(
    result.text,
    /^Applied 2 snapshot edit\(s\)\. New revision: \S+\n\n@@ lines 18-22 @@\nline 18\nline 19\nLINE 20\nline 21\nline 22\n@@ lines 34-38 @@\nline 34\nline 35\ninserted\nline 36\nline 37\n$/u,
  );
  assert.doesNotMatch(result.text, /line 1\n/u);
  assert.deepEqual(result.details.changedLines, [
    [20, 20],
    [36, 36],
  ]);
});

test("nearby changes share one hunk and the preview keeps the file's exact last line", async () => {
  const { result } = await attempt("a\nb\nc\nd", [replace("b", "B"), replace("d", "D")]);
  assert.match(result.text, /\n\n@@ lines 1-4 @@\na\nB\nc\nD$/u);
});

test("regions past the preview cap are counted, not silently dropped", async () => {
  const chunk = "x".repeat(200);
  const lines = Array.from({ length: 300 }, (_, index) => `row ${index}:${chunk}`);
  const edits = Array.from({ length: 60 }, (_, index) =>
    replace(`row ${index * 5}:${chunk}`, `row ${index * 5}:y`),
  );
  const { result } = await attempt(`${lines.join("\n")}\n`, edits);
  assert.match(
    result.text,
    /\[\d+ more changed region\(s\) omitted from the 8192-byte preview; read the file to see them\.\]$/u,
  );
  assert.ok(Buffer.byteLength(result.text, "utf8") < 8192 + 300);
});

test("an oversized first region shows its leading lines and where it continues", async () => {
  const big = Array.from(
    { length: 400 },
    (_, index) => `generated ${index} ${"z".repeat(80)}`,
  ).join("\n");
  const { result } = await attempt("head\nold\ntail\n", [replace("old", big)]);
  assert.match(result.text, /\n\n@@ lines 1-\d+ @@\nhead\ngenerated 0 /u);
  assert.match(
    result.text,
    /\[the changed region continues to line 402; read the file to see lines \d+-402\]$/u,
  );
  assert.ok(Buffer.byteLength(result.text, "utf8") < 8192 + 200);
});

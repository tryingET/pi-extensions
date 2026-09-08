import assert from "node:assert/strict";
import { mkdir, mkdtemp, rm, symlink, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";
import { copyApprovedCorpus } from "../src/ripwire-corpus.js";
import { discoveryArguments } from "../src/ripwire-exec.js";
import { parseRipwireCandidates } from "../src/ripwire-output.js";

const fixture =
  '<candidates count="1" total="2" capped="1" route="name" weak="1"><cand r="1" s="0.4" n="read" id="read" k="fn" p="src/a.ts" l="2"><sig>function read(x: A&lt;B&gt;)</sig></cand></candidates>';
const corpus = { files: new Map([["src/a.ts", { sha256: "a".repeat(64) }]]) };
test("pinned candidates parsing retains identity, uncertainty and rank", () => {
  const out = parseRipwireCandidates(fixture, corpus);
  assert.equal(out.records[0].signature, "function read(x: A<B>)");
  assert.equal(out.capped, true);
  assert.equal(out.weak, true);
  for (const text of [
    fixture.replace('count="1"', 'count="2"'),
    fixture.replace("src/a.ts", "../secret.ts"),
    fixture.replace('r="1"', 'r="2"'),
    fixture.replace("&lt;", "&external;"),
    `<!DOCTYPE a>${fixture}`,
    fixture.replace('s="0.4"', 's="NaN"'),
    `${fixture}junk`,
  ])
    assert.throws(() => parseRipwireCandidates(text, corpus));
});
test("caller objectives cannot add arguments or shell commands", () => {
  const query = "--run-trace=touch /tmp/forged; $(echo secret)";
  const args = discoveryArguments("/approved", query, 10);
  assert.equal(args[1], `--for=${query}`);
  assert.equal(args.length, 6);
  assert.throws(() => discoveryArguments("/approved", "", 10));
  assert.throws(() => discoveryArguments("/approved", "x", 101));
});
test("corpus is descriptor anchored, excludes symlinks and fingerprints source", async () => {
  const root = await mkdtemp(join(tmpdir(), "rw-corpus-"));
  const dest = await mkdtemp(join(tmpdir(), "rw-copy-"));
  try {
    await mkdir(join(root, "src"));
    await writeFile(join(root, "src", "a.ts"), "export const x = 1;");
    await symlink("/etc/passwd", join(root, "src", "escape.ts"));
    const data = await copyApprovedCorpus(root, dest);
    assert.equal(data.files.size, 1);
    assert.equal(data.skipped.symlink, 1);
    assert.match(data.snapshotId, /^[a-f0-9]{64}$/u);
  } finally {
    await rm(root, { recursive: true, force: true });
    await rm(dest, { recursive: true, force: true });
  }
});

test("candidate signature redaction markers retain a non-byte-exact disclosure", () => {
  const xml = fixture.replace(
    "function read(x: A&lt;B&gt;)",
    "function read(key = [REDACTED:secret])",
  );
  assert.equal(parseRipwireCandidates(xml, corpus).records[0].redacted, true);
  assert.equal(parseRipwireCandidates(fixture, corpus).records[0].redacted, false);
});

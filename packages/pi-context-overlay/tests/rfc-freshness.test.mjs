// ---
// summary: "Rendered-vs-tree check: RFC-claimed test counts and §10 command paths must match the actual tree."
// read_when:
//   - "Adding tests, changing §5/§10 of the context-core RFC, or renaming test/script files."
// ---
// The RFC once shipped stale status lines and test counts (recorded as a review finding in
// §6, and recurred post-P2.5). This test makes that class of staleness fail the gate instead
// of recurring: hand-maintained numbers in the RFC must equal the tree.

import assert from "node:assert/strict";
import { existsSync, readdirSync, readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";

const PKG_ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const RFC_PATH = join(PKG_ROOT, "docs", "project", "2026-08-26-context-core-profiler-rfc.md");
const rfc = readFileSync(RFC_PATH, "utf8");

const countTests = (file) => {
  const text = readFileSync(join(PKG_ROOT, file), "utf8");
  return [...text.matchAll(/^(?:test|it)\(/gm)].length;
};

test("RFC §5 model-test count matches the actual test file", () => {
  const actual = countTests("tests/context-strata-lib.test.mjs");
  const match = /`tests\/context-strata-lib\.test\.mjs` — (\d+) `node:test` cases/.exec(rfc);
  assert.ok(match, "RFC §5 must state the model test count in the pinned phrasing");
  assert.equal(
    Number(match[1]),
    actual,
    `RFC claims ${match[1]} model tests but tests/context-strata-lib.test.mjs has ${actual}; update the RFC`,
  );
});

test("RFC §5 live-TUI test count matches the actual test file", () => {
  const actual = countTests("tests/context-overlay.test.ts");
  const match = /`tests\/context-overlay\.test\.ts` — (\d+) cases/.exec(rfc);
  assert.ok(match, "RFC §5 must state the live TUI test count in the pinned phrasing");
  assert.equal(
    Number(match[1]),
    actual,
    `RFC claims ${match[1]} live TUI tests but tests/context-overlay.test.ts has ${actual}; update the RFC`,
  );
});

test("RFC §5 corpus test count matches the corpus package", () => {
  const corpusTests = join(PKG_ROOT, "..", "pi-context-corpus", "tests");
  if (!existsSync(corpusTests)) return; // corpus package absent in this checkout
  const actual = readdirSync(corpusTests)
    .filter((f) => f.endsWith(".test.mjs"))
    .sort()
    .flatMap((f) => [...readFileSync(join(corpusTests, f), "utf8").matchAll(/^test\(/gm)]).length;
  const match = /pi-context-corpus`\): (\d+) `node:test` cases/.exec(rfc);
  assert.ok(match, "RFC §5 must state the corpus test count in the pinned phrasing");
  assert.equal(
    Number(match[1]),
    actual,
    `RFC claims ${match[1]} corpus tests but pi-context-corpus has ${actual}; update the RFC`,
  );
});

test("every script path named in RFC §10 exists in the tree", () => {
  const section = rfc.split("## 10. Commands")[1] ?? "";
  const paths = [
    ...section.matchAll(
      /(scripts\/[a-z0-9-]+(?:\.[a-z0-9]+)*\.(?:mjs|sh)|tests\/[a-z0-9-]+(?:\.[a-z0-9]+)*\.(?:mjs|ts))/g,
    ),
  ].map((m) => m[1]);
  assert.ok(paths.length >= 3, "§10 must name at least the replay script and test files");
  for (const p of new Set(paths)) {
    assert.ok(existsSync(join(PKG_ROOT, p)), `RFC §10 names ${p} but it does not exist`);
  }
});

test("P3 gate: no P3/decision-support prompt may exist without wire-order drift evidence", () => {
  // RFC §9 decision: positional P3 claims require a dated wire-order evidence note
  // (≥3 sessions, ≥2 providers, drift bound). This makes the gate mechanical: authoring
  // a P3 prompt without the evidence note fails CI here, not in prose.
  const projectDir = join(PKG_ROOT, "docs", "project");
  const files = readdirSync(projectDir);
  const p3Prompt = files.find((f) => /p3|decision-support/.test(f) && f.endsWith(".md"));
  if (!p3Prompt) return; // gate satisfied vacuously until P3 is prompted
  const evidence = files.find((f) => /wire-order/.test(f) && f.endsWith(".md"));
  assert.ok(
    evidence,
    `RFC §9 wire-order gate violated: ${p3Prompt} exists without a wire-order evidence note in docs/project/`,
  );
  // The evidence note must itself state a measured bound, not just exist.
  const evidenceText = readFileSync(join(projectDir, evidence), "utf8");
  assert.match(
    evidenceText,
    /drift bound|mae|divergence/i,
    "wire-order evidence note must state a measured drift bound",
  );
});

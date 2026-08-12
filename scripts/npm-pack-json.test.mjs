import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import path from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";
import { normalizeNpmPackJson, parseNpmPackJson } from "./npm-pack-json.mjs";

const SCRIPT = path.join(path.dirname(fileURLToPath(import.meta.url)), "npm-pack-json.mjs");
const ENTRY = {
  id: "@tryinget/example@1.2.3",
  name: "@tryinget/example",
  version: "1.2.3",
  filename: "tryinget-example-1.2.3.tgz",
  files: [{ path: "package.json", size: 42, mode: 420 }],
};

test("accepts the npm 11 single-entry array contract", () => {
  assert.deepEqual(parseNpmPackJson(JSON.stringify([ENTRY])), ENTRY);
});

test("accepts the npm 12 package-keyed object contract", () => {
  assert.deepEqual(parseNpmPackJson(JSON.stringify({ [ENTRY.name]: ENTRY })), ENTRY);
});

test("normalizes both supported contracts to the legacy single-entry array", () => {
  assert.deepEqual(JSON.parse(normalizeNpmPackJson(JSON.stringify([ENTRY]))), [ENTRY]);
  assert.deepEqual(JSON.parse(normalizeNpmPackJson(JSON.stringify({ [ENTRY.name]: ENTRY }))), [
    ENTRY,
  ]);
});

test("fails closed for malformed, ambiguous, and mismatched pack output", () => {
  for (const invalid of [
    "not-json",
    "null",
    JSON.stringify([]),
    JSON.stringify([ENTRY, ENTRY]),
    JSON.stringify(ENTRY),
    JSON.stringify({}),
    JSON.stringify({ one: ENTRY, two: ENTRY }),
    JSON.stringify({ "@tryinget/wrong": ENTRY }),
    JSON.stringify({ [ENTRY.name]: null }),
    JSON.stringify([{ ...ENTRY, name: "" }]),
    JSON.stringify([{ ...ENTRY, filename: "" }]),
    JSON.stringify([{ ...ENTRY, files: null }]),
    JSON.stringify([{ ...ENTRY, version: "" }]),
    JSON.stringify([{ ...ENTRY, id: "@tryinget/example@wrong" }]),
    JSON.stringify([{ ...ENTRY, filename: "../example.tgz" }]),
    JSON.stringify([{ ...ENTRY, files: [null] }]),
    JSON.stringify([{ ...ENTRY, files: [{}] }]),
    JSON.stringify([{ ...ENTRY, files: [{ path: "same" }, { path: "./same" }] }]),
    `{"${ENTRY.name}":${JSON.stringify(ENTRY)},"${ENTRY.name}":${JSON.stringify(ENTRY)}}`,
  ]) {
    assert.throws(() => parseNpmPackJson(invalid));
  }
});

test("CLI reads stdin, emits one canonical array, and rejects invalid input", () => {
  const accepted = spawnSync(process.execPath, [SCRIPT], {
    input: JSON.stringify({ [ENTRY.name]: ENTRY }),
    encoding: "utf8",
  });
  assert.equal(accepted.status, 0, accepted.stderr);
  assert.deepEqual(JSON.parse(accepted.stdout), [ENTRY]);

  const rejected = spawnSync(process.execPath, [SCRIPT], {
    input: JSON.stringify({ "@tryinget/wrong": ENTRY }),
    encoding: "utf8",
  });
  assert.notEqual(rejected.status, 0);
  assert.match(rejected.stderr, /package key must match/);
});

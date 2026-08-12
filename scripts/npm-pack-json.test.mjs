import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";
import { normalizeNpmPackJson, parseNpmPackJson } from "./npm-pack-json.mjs";

const SCRIPT = path.join(path.dirname(fileURLToPath(import.meta.url)), "npm-pack-json.mjs");
const REPO_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
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

function trackedReleaseCheckScripts() {
  const result = spawnSync(
    "git",
    ["ls-files", "packages/*/scripts/release-check.sh", "packages/*/*/scripts/release-check.sh"],
    { cwd: REPO_ROOT, encoding: "utf8" },
  );
  assert.equal(result.status, 0, result.stderr);
  return result.stdout
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean);
}

test("every tracked shell consumer that parses npm pack JSON normalizes it first", () => {
  const consumers = [];
  for (const relativePath of trackedReleaseCheckScripts()) {
    const source = fs.readFileSync(path.join(REPO_ROOT, relativePath), "utf8");
    if (!/npm(?: --cache [^\n]+)? pack --dry-run --json/.test(source)) continue;
    if (!/JSON\.parse\([^\n]*(?:PACK_JSON|PACK_JSON_FILE)|release-artifact-check\.mjs/.test(source)) {
      continue;
    }
    consumers.push(relativePath);
    assert.match(
      source,
      /npm-pack-json\.mjs/,
      `${relativePath} consumes npm pack JSON without the shared normalizer`,
    );
    assert.ok(
      source.indexOf("npm-pack-json.mjs") <
        Math.max(
          source.indexOf("PACK_JSON=\"$PACK_JSON\" node"),
          source.indexOf("PACK_JSON_FILE=\"$PACK_JSON_FILE\" node"),
        ),
      `${relativePath} must normalize before its legacy canonical-array parser`,
    );
  }
  assert.ok(consumers.length >= 25, `expected all pack parser consumers, got ${consumers.length}`);
});

test("pi-interaction package helper uses the shared parser for direct npm output", () => {
  const source = fs.readFileSync(
    path.join(REPO_ROOT, "packages/pi-interaction/scripts/release-check-package.mjs"),
    "utf8",
  );
  assert.match(source, /import \{ parseNpmPackJson \} from "\.\.\/\.\.\/\.\.\/scripts\/npm-pack-json\.mjs"/);
  assert.match(source, /parseNpmPackJson\(packDryRunResult\.stdout\)/);
  assert.doesNotMatch(source, /JSON\.parse\(packDryRunResult\.stdout/);
});

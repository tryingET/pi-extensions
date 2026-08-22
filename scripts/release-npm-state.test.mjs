import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";

import {
  classifyNpmPublication,
  expectedPublication,
  isNpmNotFound,
  queryNpmPublication,
} from "./release-npm-state.mjs";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const SCRIPT = path.join(ROOT, "scripts", "release-npm-state.mjs");
const expected = {
  name: "@tryinget/example",
  version: "1.2.3",
  integrity: "sha512-EXACT",
  shasum: "0123456789abcdef0123456789abcdef01234567",
};

test("classifies absent, exact, and each immutable mismatch", () => {
  assert.equal(classifyNpmPublication(expected, null).state, "absent");
  assert.equal(
    classifyNpmPublication(expected, {
      name: expected.name,
      version: expected.version,
      dist: { integrity: expected.integrity, shasum: expected.shasum },
    }).state,
    "exact",
  );
  for (const field of ["name", "version", "integrity", "shasum"]) {
    const observed = {
      name: expected.name,
      version: expected.version,
      dist: { integrity: expected.integrity, shasum: expected.shasum },
    };
    if (field === "name" || field === "version") observed[field] += "-different";
    else observed.dist[field] += "different";
    const result = classifyNpmPublication(expected, observed);
    assert.equal(result.state, "mismatch");
    assert.deepEqual(result.mismatches, [field]);
  }
});

test("loads exact registry expectations from pi.release-artifact.v1", () => {
  assert.deepEqual(
    expectedPublication({
      schema: "pi.release-artifact.v1",
      package: { name: expected.name, version: expected.version },
      artifact: { npmIntegrity: expected.integrity, npmShasum: expected.shasum.toUpperCase() },
    }),
    expected,
  );
  assert.throws(() => expectedPublication({ schema: "other" }), /Unsupported release artifact schema/u);
  assert.throws(
    () =>
      expectedPublication({
        schema: "pi.release-artifact.v1",
        package: { name: expected.name, version: expected.version },
        artifact: { npmIntegrity: expected.integrity, npmShasum: "not-a-sha" },
      }),
    /lowercase SHA-1/u,
  );
});

test("recognizes npm E404 without downgrading other registry failures", () => {
  assert.equal(isNpmNotFound("npm error code E404\nnpm error 404 Not Found"), true);
  assert.equal(isNpmNotFound("npm error code E401\nUnauthorized"), false);
  assert.equal(isNpmNotFound("network timeout"), false);
});

function fakeNpm(t, body) {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "release-npm-state-"));
  t.after(() => fs.rmSync(root, { recursive: true, force: true }));
  const executable = path.join(root, "npm");
  fs.writeFileSync(executable, `#!/usr/bin/env node\n${body}\n`, {
    encoding: "utf8",
    mode: 0o755,
  });
  return executable;
}

test("queries an exact immutable registry record through an injectable npm client", (t) => {
  const executable = fakeNpm(
    t,
    `console.log(${JSON.stringify(JSON.stringify({
      name: expected.name,
      version: expected.version,
      dist: { integrity: expected.integrity, shasum: expected.shasum },
    }))});`,
  );
  assert.deepEqual(queryNpmPublication(expected, { executable }), expected);
});

test("treats only a confirmed npm 404 as absent", (t) => {
  const missing = fakeNpm(t, `console.error("npm error code E404"); process.exit(1);`);
  assert.equal(queryNpmPublication(expected, { executable: missing }), null);

  const unavailable = fakeNpm(t, `console.error("network timeout"); process.exit(1);`);
  assert.throws(
    () => queryNpmPublication(expected, { executable: unavailable }),
    /npm view failed/u,
  );
});

test("CLI writes a resumable exact state and enforces required state", (t) => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "release-npm-cli-"));
  t.after(() => fs.rmSync(root, { recursive: true, force: true }));
  const manifestPath = path.join(root, "artifact.json");
  const envPath = path.join(root, "github.env");
  fs.writeFileSync(
    manifestPath,
    `${JSON.stringify({
      schema: "pi.release-artifact.v1",
      package: { name: expected.name, version: expected.version },
      artifact: { npmIntegrity: expected.integrity, npmShasum: expected.shasum },
    })}\n`,
  );
  const executable = fakeNpm(
    t,
    `console.log(${JSON.stringify(JSON.stringify({
      name: expected.name,
      version: expected.version,
      dist: { integrity: expected.integrity, shasum: expected.shasum },
    }))});`,
  );
  const result = spawnSync(
    process.execPath,
    [
      SCRIPT,
      "inspect",
      "--manifest",
      manifestPath,
      "--output-env-file",
      envPath,
      "--require",
      "exact",
    ],
    { encoding: "utf8", env: { ...process.env, NPM_EXECUTABLE: executable } },
  );
  assert.equal(result.status, 0, `${result.stdout}\n${result.stderr}`);
  assert.equal(JSON.parse(result.stdout).state, "exact");
  assert.equal(fs.readFileSync(envPath, "utf8"), "RELEASE_NPM_PUBLICATION_STATE=exact\n");

  const wrongRequirement = spawnSync(
    process.execPath,
    [SCRIPT, "inspect", "--manifest", manifestPath, "--require", "absent"],
    { encoding: "utf8", env: { ...process.env, NPM_EXECUTABLE: executable } },
  );
  assert.notEqual(wrongRequirement.status, 0);
  assert.match(wrongRequirement.stderr, /required absent/u);
});

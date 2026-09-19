import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";
import * as npmState from "./release-npm-state.mjs";

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

function pollFixture(t, terminal, absentAttempts = 0) {
  const executable = fakeNpm(t, `
    const fs = require("node:fs");
    const counter = __filename + ".count";
    const attempt = fs.existsSync(counter) ? Number(fs.readFileSync(counter, "utf8")) + 1 : 1;
    fs.writeFileSync(counter, String(attempt));
    if (attempt <= ${absentAttempts} || ${JSON.stringify(terminal)} === "absent") {
      console.error("npm error code E404"); process.exit(1);
    }
    if (${JSON.stringify(terminal)} === "error") {
      console.error("npm error code E401"); process.exit(1);
    }
    if (${JSON.stringify(terminal)} === "invalid") { console.log("not JSON"); process.exit(0); }
    if (${JSON.stringify(terminal)}.startsWith("json:")) {
      console.log(${JSON.stringify(terminal)}.slice(5)); process.exit(0);
    }
    if (${JSON.stringify(terminal)} === "hung") {
      process.on("SIGTERM", () => {}); setInterval(() => {}, 1000);
    } else {
      console.log(JSON.stringify(${JSON.stringify({ ...expected, integrity: terminal === "mismatch" ? "sha512-OTHER" : expected.integrity })}));
    }
  `);
  const manifest = path.join(path.dirname(executable), "artifact.json");
  fs.writeFileSync(manifest, JSON.stringify({
    schema: "pi.release-artifact.v1",
    package: { name: expected.name, version: expected.version },
    artifact: { npmIntegrity: expected.integrity, npmShasum: expected.shasum },
  }));
  return {
    attempts: () => Number(fs.readFileSync(`${executable}.count`, "utf8")),
    run: (args = []) => spawnSync(process.execPath, [SCRIPT, "wait", "--manifest", manifest, ...args], {
      encoding: "utf8", env: { ...process.env, NPM_EXECUTABLE: executable }, timeout: 10000,
    }),
  };
}

const shortPoll = ["--deadline-ms", "2000", "--initial-delay-ms", "10", "--max-delay-ms", "20"];

test("wait CLI succeeds immediately for exact bytes without sleeping", (t) => {
  const fixture = pollFixture(t, "exact");
  const result = fixture.run();
  assert.equal(result.status, 0, result.stderr);
  assert.equal(JSON.parse(result.stdout).state, "exact");
  assert.equal(fixture.attempts(), 1);
  assert.doesNotMatch(result.stderr, /retrying/u);
});

test("wait CLI retries absent N times then succeeds with exact bytes", (t) => {
  const fixture = pollFixture(t, "exact", 3);
  const result = fixture.run(shortPoll);
  assert.equal(result.status, 0, result.stderr);
  assert.equal(JSON.parse(result.stdout).state, "exact");
  assert.equal(fixture.attempts(), 4);
  assert.match(result.stderr, /absent.*retrying in 10ms/u);
  assert.equal((result.stderr.match(/retrying in 20ms/gu) ?? []).length, 2);
});

test("wait CLI stops immediately on mismatch, including after absence", (t) => {
  for (const absentAttempts of [0, 2]) {
    const fixture = pollFixture(t, "mismatch", absentAttempts);
    const result = fixture.run(shortPoll);
    assert.equal(result.status, 1, result.stderr);
    assert.match(result.stderr, /mismatch.*integrity/u);
    assert.equal(fixture.attempts(), absentAttempts + 1);
  }
});

test("wait CLI never retries authentication or malformed registry responses", (t) => {
  for (const terminal of ["error", "invalid"]) {
    const fixture = pollFixture(t, terminal);
    const result = fixture.run(shortPoll);
    assert.equal(result.status, 1, result.stderr);
    assert.match(result.stderr, terminal === "error" ? /E401/u : /invalid JSON/u);
    assert.equal(fixture.attempts(), 1);
  }
});

test("wait CLI rejects structurally malformed JSON without retrying", (t) => {
  for (const value of [[42], [null], ["invalid"], [[]], {}]) {
    const fixture = pollFixture(t, `json:${JSON.stringify(value)}`);
    const result = fixture.run(shortPoll);
    assert.equal(result.status, 1, result.stderr);
    assert.match(result.stderr, /must be/u);
    assert.equal(fixture.attempts(), 1);
  }
});

test("wait CLI accepts npm 12 flattened array publication records", (t) => {
  const fixture = pollFixture(t, `json:${JSON.stringify([{
    name: expected.name, version: expected.version,
    "dist.integrity": expected.integrity, "dist.shasum": expected.shasum,
  }])}`);
  const result = fixture.run(shortPoll);
  assert.equal(result.status, 0, result.stderr);
  assert.equal(JSON.parse(result.stdout).state, "exact");
  assert.equal(fixture.attempts(), 1);
});

test("wait CLI exhausts absent deadline clearly and bounds a hung npm process", (t) => {
  for (const terminal of ["absent", "hung"]) {
    const fixture = pollFixture(t, terminal);
    const started = performance.now();
    const result = fixture.run(["--deadline-ms", "500", "--initial-delay-ms", "20", "--max-delay-ms", "40"]);
    const elapsed = performance.now() - started;
    assert.equal(result.status, 1, result.stderr);
    assert.match(result.stderr, /deadline of 500ms exceeded/u);
    assert.match(result.stderr, /@tryinget\/example@1\.2\.3/u);
    assert.match(result.stderr, terminal === "absent" ? /last state: absent/u : /npm view timed out/u);
    assert.ok(elapsed >= 500 && elapsed < 5000, `elapsed ${elapsed}ms`);
    if (terminal === "hung") assert.equal(fixture.attempts(), 1);
    else assert.ok(fixture.attempts() > 1);
  }
});

test("wait CLI rejects unsafe timing and unknown options before querying npm", (t) => {
  for (const args of [
    ["--deadline-ms", "0"], ["--deadline-ms", "-1"], ["--deadline-ms", "NaN"],
    ["--deadline-ms", "Infinity"], ["--deadline-ms", "2147483648"],
    ["--initial-delay-ms", "0.5"], ["--max-delay-ms", "0"],
    ["--initial-delay-ms", "30", "--max-delay-ms", "10"], ["--require", "absent"],
  ]) {
    const fixture = pollFixture(t, "exact");
    const result = fixture.run(args);
    assert.equal(result.status, 1, `${args}: ${result.stderr}`);
    assert.match(result.stderr, /must be|Unknown wait option/u);
    assert.throws(fixture.attempts, /ENOENT/u);
  }
});

test("wait bounds queries and capped exponential sleeps by a monotonic deadline", async () => {
  let now = 0;
  const sleeps = [];
  const timeouts = [];
  await assert.rejects(() => npmState.waitForExact(expected, {
    deadlineMs: 105, initialDelayMs: 10, maxDelayMs: 30,
    now: () => now,
    sleep: async (ms) => { sleeps.push(ms); now += ms; },
    query: (_expected, { timeout }) => { timeouts.push(timeout); now += 2; return null; },
    report: () => {},
  }), /deadline of 105ms exceeded.*last state: absent/u);
  assert.deepEqual(sleeps, [10, 20, 30, 30, 5]);
  assert.deepEqual(timeouts, [105, 93, 71, 39, 7]);
  assert.equal(now, 105);
});

test("wait does not accept an exact result arriving at the deadline or query after oversleep", async () => {
  let now = 0;
  let queries = 0;
  const options = {
    deadlineMs: 100, initialDelayMs: 10, maxDelayMs: 30,
    now: () => now, report: () => {},
    sleep: async () => { now = 101; },
    query: () => { queries++; return null; },
  };
  await assert.rejects(() => npmState.waitForExact(expected, options), /deadline/u);
  assert.equal(queries, 1);
  now = 0;
  await assert.rejects(() => npmState.waitForExact(expected, {
    ...options, query: () => { now = 100; return expected; },
  }), /deadline/u);
});

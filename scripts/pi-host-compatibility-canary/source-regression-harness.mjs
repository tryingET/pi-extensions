// Portable trusted-repo SOURCE-REGRESSION harness. Not a security sandbox.
// No provisioning, ambient executable lookup, retry or parent cleanup. Retain
// evidence; finite wrappers still remove their own new config/state scratch.
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { accessSync, chmodSync, constants, lstatSync, mkdirSync, mkdtempSync, writeFileSync } from "node:fs";
import path from "node:path";
import { assertSupportedNode, canonicalPath, fixtureEnv, verifyFixtureNode, verifySource } from "./completion-fixture-closure.mjs";
import { observeSourceRegression } from "./source-regression-observation.mjs";
export function safeScratchParent(candidate) {
  canonicalPath(candidate); // includes ancestor symlink refusal, absolute and normalized
  assert.ok(candidate !== "/" && candidate !== "/tmp" && !candidate.startsWith("/tmp/"), "unsafe scratch path");
  const stat = lstatSync(candidate);
  assert.ok(stat.isDirectory() && stat.uid === process.geteuid() && (stat.mode & 0o022) === 0,
    "scratch parent must be an owned directory without group/other writes");
  accessSync(candidate, constants.W_OK | constants.X_OK);
  return candidate;
}
export function createSourceScratch(env = process.env) {
  assertSupportedNode(process.version);
  // Existing suitable explicit parent first. HOME itself is the safe local fallback;
  // mkdtemp creates a unique private child, never a fixed cache or existing file.
  let parent;
  for (const candidate of [env.TMPDIR, env.RUNNER_TEMP, env.HOME]) {
    if (candidate === undefined) continue;
    try { parent = safeScratchParent(candidate); break; } catch { /* unsuitable: try next declared parent */ }
  }
  assert.ok(parent, "no suitable explicit TMPDIR/RUNNER_TEMP or safe HOME scratch parent");
  const scratch = mkdtempSync(path.join(parent, "source-regression-"));
  chmodSync(scratch, 0o700);
  assert.equal(lstatSync(scratch).mode & 0o777, 0o700);
  return scratch;
}
export function syntheticEnvironment(base) {
  for (const dir of ["home", "tmp", "state"]) mkdirSync(path.join(base, dir), { mode: 0o700 });
  return fixtureEnv(base);
}
export function assertCompleteTap(result, count) {
  assert.ok(Number.isSafeInteger(count) && count > 0, "nonvacuous expected count required");
  assert.equal(result.error, undefined, result.error?.message);
  assert.equal(result.signal, null);
  assert.equal(result.status, 0, result.stdout + result.stderr);
  assert.equal(result.stderr, "", "unexpected source_regression stderr");
  for (const [field, expected] of Object.entries({ tests: count, suites: 0, pass: count,
    fail: 0, cancelled: 0, skipped: 0, todo: 0 })) {
    assert.deepEqual([...result.stdout.matchAll(new RegExp(`^# ${field} (\\d+)$`, "gm"))]
      .map(match => Number(match[1])), [expected], `source_regression summary: ${field}`);
  }
  assert.deepEqual(result.stdout.match(/^1\.\.\d+$/gm), [`1..${count}`]);
  assert.deepEqual([...result.stdout.matchAll(/^ok (\d+) - /gm)].map(match => Number(match[1])),
    Array.from({ length: count }, (_, index) => index + 1));
  assert.doesNotMatch(result.stdout, /^not ok |^(?:not )?ok .*# (?:SKIP|TODO)\b/im);
}
export const SOURCE_SUITES = Object.freeze([
  ["completion-source-regression.test.mjs", 21],
  ["mutation-completion.test.mjs", 76],
  ["child-clearance.test.mjs", 6],
  ["recovery-snapshots.test.mjs", 11],
  ["child-clearance.io.test.mjs", 10],
  ["source-regression.test.mjs", 8],
].map(suite => Object.freeze(suite)));
export function runSourceRegressionSuites(directory, cwd) {
  const OBSERVATION = observeSourceRegression(directory);
  const scratch = createSourceScratch();
  const evidence = (file, value) => writeFileSync(path.join(scratch, file), JSON.stringify(value, null, 2),
    { flag: "wx", mode: 0o600 });
  evidence("source-regression-OBSERVATION.json", OBSERVATION);
  for (const [index, [file, count]] of SOURCE_SUITES.entries()) {
    try {
      verifySource(directory, OBSERVATION);
      const node = verifyFixtureNode(OBSERVATION);
      const base = path.join(scratch, `suite-${index}`);
      mkdirSync(base, { mode: 0o700 });
      const env = syntheticEnvironment(base);
      if (file === "child-clearance.io.test.mjs") {
        env.PI_HOST_COMPAT_CLEARANCE_FIXTURE_DIR = path.join(base, "clearance-io");
        mkdirSync(env.PI_HOST_COMPAT_CLEARANCE_FIXTURE_DIR, { mode: 0o700 });
      }
      // Direct node:test module, not --test worker indirection. Fixed suites only.
      const argv = ["--test-reporter=tap", path.join(directory, file)];
      evidence(`${file}.launch.json`, { purpose: "source_regression", node, argv, cwd, env,
        expectedTests: count, timeoutMs: 600000, timeoutSignal: "SIGTERM", maxBuffer: 1024 * 1024 });
      const result = spawnSync(node.path, argv, { cwd, env, encoding: "utf8", timeout: 600000,
        killSignal: "SIGTERM", maxBuffer: 1024 * 1024 });
      evidence(`${file}.receipt.json`, { purpose: "source_regression", file, expectedTests: count,
        status: result.status, signal: result.signal, error: result.error ? String(result.error) : null,
        stdout: result.stdout, stderr: result.stderr });
      assertCompleteTap(result, count);
      verifySource(directory, OBSERVATION);
      verifyFixtureNode(OBSERVATION);
    } catch (error) {
      evidence("STOP.json", { purpose: "source_regression", file, error: String(error),
        action: "STOP: retain evidence; no next suite, retry, cleanup or qualification claim" });
      throw error;
    }
  }
  return { purpose: "source_regression", scratch, suites: SOURCE_SUITES };
}

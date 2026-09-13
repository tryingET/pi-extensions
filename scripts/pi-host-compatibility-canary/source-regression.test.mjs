// Authored regression checks; running them is a separate operation, not qualification.
import assert from "node:assert/strict";
import { chmodSync, lstatSync, mkdirSync, readFileSync, symlinkSync, writeFileSync } from "node:fs";
import path from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";
import { COPIED, OBSERVATION_KIND, assertSupportedNode, canonicalPath, digest, validatePins,
  validatePurpose, verifyFixtureNode, verifyNode } from "./completion-fixture-closure.mjs";
import { observeSourceRegression } from "./source-regression-observation.mjs";
import { assertIntentPathBudget } from "./completion-fixture-cases.mjs";
import { assertCompleteTap, createSourceScratch, safeScratchParent, syntheticEnvironment } from "./source-regression-harness.mjs";
const source = path.dirname(fileURLToPath(import.meta.url));
const inputFile = path.join(source, "completion-fixture-inputs.json");
const reviewed = () => JSON.parse(readFileSync(inputFile, "utf8"));

test("source_regression: purposes are explicit and cannot exchange authority inputs", () => {
  const observation = observeSourceRegression(source);
  assert.equal(observation.purpose, "source_regression");
  assert.equal(observation.observationKind, OBSERVATION_KIND);
  assert.equal(observation.nodes, undefined);
  assert.throws(() => verifyNode(observation), /strict admission refuses/);
  for (const mutate of [p => { delete p.purpose; }, p => { p.purpose = "qualification"; },
    p => { p.nodes = reviewed().nodes; }, p => { p.purpose = "admitted_fixture"; },
    p => { delete p.observationKind; }]) {
    const altered = structuredClone(observation); mutate(altered);
    assert.throws(() => validatePurpose(altered));
  }
  const admitted = reviewed();
  validatePins(admitted);
  assert.equal(admitted.purpose, "admitted_fixture");
  assert.throws(() => validatePurpose({ ...admitted, observedNode: observation.observedNode }));
});
test("source_regression: exact supported versions only, no major-range or unknown fallback", () => {
  for (const version of ["v22.22.2", "v26.8.1"]) assertSupportedNode(version);
  for (const version of [undefined, "", "22.22.2", "v22.22.1", "v22.22.3", "v26.8.0", "v26.8.2", "v24.0.0"]) {
    assert.throws(() => assertSupportedNode(version), /unsupported exact Node version/);
  }
  const bad = observeSourceRegression(source); bad.observedNode.version = "v99.0.0";
  assert.throws(() => verifyFixtureNode(bad), /unsupported exact Node version/);
});
test("source_regression: current Node path/hash is observed, never fixed-workstation approval", () => {
  const observation = observeSourceRegression(source);
  assert.equal(observation.observedNode.path, canonicalPath(process.execPath));
  assert.equal(observation.observedNode.sha256, digest(readFileSync("/proc/self/exe")));
  assert.equal(observation.observedNode.identityBasis, OBSERVATION_KIND);
  verifyFixtureNode(observation);
  const changedPath = structuredClone(observation); changedPath.observedNode.path = "/not-the-caller/node";
  assert.throws(() => verifyFixtureNode(changedPath), /observed source-regression path changed/);
  const changedHash = structuredClone(observation); changedHash.observedNode.sha256 = "0".repeat(64);
  assert.throws(() => verifyFixtureNode(changedHash), /observed binary changed/);
  const admitted = reviewed();
  admitted.nodes.find(pin => pin.version === process.version).path = "/not-the-admitted/node";
  assert.throws(() => verifyNode(admitted), /unreviewed Node executable path/);
  const pin = admitted.nodes.find(pin => pin.version === process.version);
  pin.path = process.execPath; pin.sha256 = "0".repeat(64);
  assert.throws(() => verifyNode(admitted), /Node binary changed/);
});
test("source_regression: exact copied inputs and transformations; admission file is not repinned", () => {
  const before = readFileSync(inputFile);
  const observation = observeSourceRegression(source);
  assert.deepEqual(readFileSync(inputFile), before);
  assert.deepEqual(Object.keys(observation.copied).sort(), [...COPIED].sort());
  assert.deepEqual(Object.entries(observation.copied).filter(([, pin]) => pin.transform !== "identity")
    .map(([file]) => file).sort(), ["host-lifecycle.mjs", "recovery.mjs"]);
  for (const original of [observation, reviewed()]) {
    for (const mutate of [p => { delete p.copied["runner.mjs"]; },
      p => { p.copied["extra.mjs"] = p.copied["runner.mjs"]; },
      p => { delete p.parentOnly["completion.test.mjs"]; }]) {
      const altered = structuredClone(original); mutate(altered);
      assert.throws(() => validatePins(altered));
    }
  }
  for (const nodes of [[], reviewed().nodes.slice(0, 1), undefined]) {
    assert.throws(() => validatePins({ ...reviewed(), nodes }));
  }
});
test("source_regression: unsafe scratch paths, symlinks and writable parents refuse", () => {
  assert.doesNotThrow(() => assertIntentPathBudget("/short", process.execPath));
  assert.throws(() => assertIntentPathBudget("/" + "x".repeat(256), process.execPath), /exceeds 256/);
  assert.throws(() => assertIntentPathBudget("/short", "/" + "x".repeat(256)), /exceeds 256/);
  for (const candidate of [undefined, "relative", "/", "/tmp", "/tmp/escape"]) {
    assert.throws(() => safeScratchParent(candidate));
  }
  const scratch = createSourceScratch();
  const shared = path.join(scratch, "shared"); mkdirSync(shared); chmodSync(shared, 0o777);
  assert.throws(() => safeScratchParent(shared), /without group\/other writes/);
  const alias = path.join(scratch, "alias"); symlinkSync(scratch, alias);
  assert.throws(() => safeScratchParent(alias), /symlink/);
  assert.throws(() => createSourceScratch({ TMPDIR: shared, RUNNER_TEMP: alias, HOME: "/tmp" }), /no suitable/);
});
test("source_regression: scratch fallback stays unique/private; synthetic env has no ambient controls", () => {
  const home = createSourceScratch();
  const sentinel = path.join(home, "sentinel"); writeFileSync(sentinel, "keep", { flag: "wx" });
  const first = createSourceScratch({ TMPDIR: "/tmp", HOME: home });
  const second = createSourceScratch({ RUNNER_TEMP: home, HOME: "/tmp" });
  assert.equal(path.dirname(first), home); assert.equal(path.dirname(second), home);
  assert.notEqual(first, second);
  for (const directory of [first, second]) assert.equal(lstatSync(directory).mode & 0o777, 0o700);
  assert.equal(readFileSync(sentinel, "utf8"), "keep");
  assert.deepEqual(syntheticEnvironment(first), { HOME: path.join(first, "home"),
    TMPDIR: path.join(first, "tmp"), XDG_STATE_HOME: path.join(first, "state") });
  assert.throws(() => syntheticEnvironment(first), /EEXIST/); // never overwrite/reuse existing dirs
});
test("source_regression: TAP gate refuses zero/incomplete/duplicate/skipped/error results", () => {
  const stdout = "TAP version 13\nok 1 - example\n1..1\n# tests 1\n# suites 0\n# pass 1\n# fail 0\n# cancelled 0\n# skipped 0\n# todo 0\n";
  const good = { status: 0, signal: null, stdout, stderr: "" };
  assertCompleteTap(good, 1);
  assert.throws(() => assertCompleteTap(good, 0), /nonvacuous/);
  for (const patch of [{ stdout: "" }, { stdout: stdout.replaceAll("1", "0") }, { stdout: stdout + "# tests 1\n" },
    { stdout: stdout.replace("ok 1 - example", "ok 1 - example # SKIP") },
    { stdout: stdout.replace("# skipped 0", "# skipped 1") },
    { stdout: stdout.replace("ok 1 -", "ok 2 -") }, { stdout: stdout.replace("# fail 0", "# fail 1") },
    { stderr: "warning" }, { signal: "SIGTERM" }, { status: 1 }, { error: Error("spawn failed") }]) {
    assert.throws(() => assertCompleteTap({ ...good, ...patch }, 1));
  }
});
test("source_regression: root source gate and strict external manifest bootstrap stay separate", () => {
  const strict = readFileSync(path.join(source, "completion.test.mjs"), "utf8");
  assert.match(strict, /pins.purpose, "admitted_fixture"/);
  assert.match(strict, /verifySource\(source, pins\)/); assert.match(strict, /verifyNode\(pins\)/);
  assert.doesNotMatch(strict, /observeSourceRegression|createSourceScratch|process.env.HOME/);
  const root = readFileSync(path.resolve(source, "../pi-host-compatibility-canary.test.mjs"), "utf8")
    .split('test("compatibility canary root validation executes bounded completion regressions"')[1];
  assert.match(root, /runSourceRegressionSuites/);
  assert.doesNotMatch(root, /completion.test.mjs|verifyNode|completion-fixture-inputs/);
  const registration = readFileSync(path.join(source, "completion-fixture-runner.mjs"), "utf8");
  assert.match(registration, /if \(stopped\) break/);
  assert.doesNotMatch(registration, /skip:/);
});

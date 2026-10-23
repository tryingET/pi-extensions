import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";
import { runOwnershipChallenges } from "./support/challenge-ownership-oracle.mjs";
import {
  CHILD_TEST_TIMEOUT_MS,
  detectedNamedFailure,
  minimizedFailure,
  ReplayMismatch,
  runOwnershipWorker,
} from "./support/ownership-oracle-checks.mjs";

const packageRoot = fileURLToPath(new URL("../", import.meta.url));
const evidence = fs.mkdtempSync(
  path.join(process.env.PI_ACTIVITY_STRIP_ORACLE_EVIDENCE_DIR ?? os.tmpdir(), "oracle-regression-"),
);
const named = "Scenario: oracle boundary hover reorder";
const duplicate = "Scenario: duplicate hover Enter before release cannot consume the intent twice";

function scenario(name, check) {
  test(`Scenario: oracle correctness ${name}`, async (t) => {
    const dir = path.join(evidence, name);
    fs.mkdirSync(dir);
    t.diagnostic(`evidence=${dir}`);
    let outcome = { passed: true };
    try {
      await check(dir);
    } catch (error) {
      outcome = { passed: false, error: error.stack };
      throw error;
    } finally {
      fs.writeFileSync(path.join(dir, "outcome.json"), `${JSON.stringify(outcome, null, 2)}\n`);
    }
  });
}

function fixtureSource(dir, body) {
  const root = path.join(dir, "source");
  fs.mkdirSync(path.join(root, "tests/support"), { recursive: true });
  fs.cpSync(path.join(packageRoot, "src"), path.join(root, "src"), { recursive: true });
  for (const file of ["production-panel-fixture.mjs", "ownership-oracle-checks.mjs"])
    fs.copyFileSync(
      path.join(packageRoot, "tests/support", file),
      path.join(root, "tests/support", file),
    );
  fs.writeFileSync(
    path.join(root, "tests/generated-ownership.test.mjs"),
    `import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
const changed = !fs.readFileSync('src/native/interaction-context.mjs', 'utf8').includes('].sort();') ||
  fs.readFileSync('src/native/panel-projection.mjs', 'utf8').includes('visibility.isEligible() && generation === intentGeneration &&') ||
  !fs.readFileSync('src/native/panel-projection.mjs', 'utf8').includes('focusWindowId === null ||\\n        consumedJumpRequest === request');
${body}\n`,
  );
  return root;
}

scenario("passing-name-unrelated-failure-is-not-detection", (dir) => {
  const sourceRoot = fixtureSource(
    dir,
    `
    test(${JSON.stringify(named)}, () => {});
    test(${JSON.stringify(duplicate)}, () => {});
    test('unrelated failure', () => assert.equal(changed, false));
  `,
  );
  const scratch = path.join(dir, "challenge");
  assert.throws(() => runOwnershipChallenges({ sourceRoot, scratch }), /named mechanism must fail/);
  const report = JSON.parse(fs.readFileSync(path.join(scratch, "report.json")));
  const check = report.checks.find((entry) => entry.name === "publisher-order");
  assert.equal(check.status, 1);
  assert.equal(check.detected, false);
  const tap = fs.readFileSync(check.tapPath, "utf8");
  assert.match(tap, /^ok \d+ - Scenario: oracle boundary hover reorder$/m);
  assert.match(tap, /^not ok \d+ - unrelated failure$/m);
});

scenario("real-named-failures-detect-production-mutants", (dir) => {
  const report = runOwnershipChallenges({
    sourceRoot: packageRoot,
    scratch: path.join(dir, "challenge"),
  });
  assert.equal(report.checks[0].status, 0);
  for (const name of ["publisher-order", "own-release", "duplicate-consumption"]) {
    const check = report.checks.find((entry) => entry.name === name);
    assert.ok(check.detected, name);
    assert.ok(check.completed, name);
    assert.equal(check.error ?? null, null);
    assert.equal(check.signal, null);
    const tap = fs.readFileSync(check.tapPath, "utf8");
    assert.ok(
      tap
        .split("\n")
        .some(
          (line) =>
            /^not ok \d+ - /.test(line) && line.replace(/^not ok \d+ - /, "") === check.expected,
        ),
    );
  }
});

for (const classification of ["wrong-kind", "fixture-error"])
  scenario(`${classification}-reduction-preserves-original`, async (dir) => {
    const trace = { seed: 7417, kind: "revoked", mode: "hover", events: ["essential", "noise"] };
    const original = new ReplayMismatch("focus-effects", new Error("original failure"));
    const attempts = [];
    let reduced;
    await assert.rejects(
      async () => {
        try {
          throw original;
        } catch (error) {
          reduced = await minimizedFailure(trace, error.kind, async (candidate) => {
            attempts.push(candidate);
            if (candidate.events.includes("essential")) throw new ReplayMismatch(error.kind);
            if (classification === "wrong-kind") throw new ReplayMismatch("post-release");
            throw new Error("fixture unavailable");
          });
          throw error;
        }
      },
      (error) => error === original,
    );
    assert.deepEqual(reduced, { ...trace, events: ["essential"] });
    assert.deepEqual(trace.events, ["essential", "noise"]);
    fs.writeFileSync(
      path.join(dir, "reductions.json"),
      JSON.stringify({ original: original.message, trace, reduced, attempts }, null, 2),
    );
  });

scenario("missing-worker-retains-artifact", (dir) => {
  const tapPath = path.join(dir, "worker.tap");
  const check = runOwnershipWorker({
    root: dir,
    tapPath,
    execPath: path.join(dir, "no-such-worker"),
  });
  fs.writeFileSync(path.join(dir, "worker.json"), JSON.stringify(check, null, 2));
  assert.equal(check.error.code, "ENOENT");
  assert.equal(check.status, null);
  assert.equal(check.signal, null);
  assert.ok(fs.existsSync(tapPath));
  assert.equal(check.completed, false);
  assert.equal(detectedNamedFailure(check, named), false);
});

scenario("deadline-retains-output-and-is-not-detection", (dir) => {
  assert.equal(CHILD_TEST_TIMEOUT_MS, 120000);
  const tapPath = path.join(dir, "worker.tap");
  const output = `TAP version 13\nnot ok 1 - ${named}\n1..1\n# fail 1\n# cancelled 0`;
  const check = runOwnershipWorker({
    root: dir,
    tapPath,
    timeout: 1000,
    args: ["-e", `console.log(${JSON.stringify(output)}); setTimeout(() => {}, 3000);`],
  });
  fs.writeFileSync(path.join(dir, "worker.json"), JSON.stringify(check, null, 2));
  assert.equal(check.error?.code, "ETIMEDOUT");
  assert.equal(check.status, null);
  assert.equal(check.signal, "SIGKILL");
  assert.match(fs.readFileSync(tapPath, "utf8"), /not ok 1/);
  assert.equal(check.completed, false);
  assert.equal(detectedNamedFailure(check, named), false);
});

scenario("crashed-test-runner-is-not-detection", (dir) => {
  const sourceRoot = fixtureSource(
    dir,
    `
    test(${JSON.stringify(named)}, () => assert.equal(changed, false));
    test(${JSON.stringify(duplicate)}, () => assert.equal(changed, false));
    if (changed) setTimeout(() => process.kill(process.pid, 'SIGKILL'), 50);
  `,
  );
  const scratch = path.join(dir, "challenge");
  assert.throws(() => runOwnershipChallenges({ sourceRoot, scratch }), /worker did not complete/);
  const report = JSON.parse(fs.readFileSync(path.join(scratch, "report.json")));
  const check = report.checks.find((entry) => entry.name === "publisher-order");
  assert.equal(check.detected, false);
  assert.equal(check.completed, false);
  const tap = fs.readFileSync(check.tapPath, "utf8");
  assert.match(tap, /^not ok \d+ - Scenario: oracle boundary hover reorder$/m);
  assert.equal(check.signal, "SIGKILL");
  assert.equal(check.status, null);
  assert.equal(check.error, null);
});

scenario("pipeline-deadline-retains-report-before-assertion", (dir) => {
  const sourceRoot = fixtureSource(
    dir,
    `
    test(${JSON.stringify(named)}, () => assert.equal(changed, false));
    if (changed) setTimeout(() => {}, 3000);
  `,
  );
  const scratch = path.join(dir, "challenge");
  assert.throws(
    () => runOwnershipChallenges({ sourceRoot, scratch, timeout: 1000 }),
    /worker did not complete/,
  );
  const report = JSON.parse(fs.readFileSync(path.join(scratch, "report.json")));
  const check = report.checks.find((entry) => entry.name === "publisher-order");
  assert.equal(check.error.code, "ETIMEDOUT");
  assert.equal(check.signal, "SIGKILL");
  assert.equal(check.status, null);
  assert.equal(check.detected, false);
  assert.ok(fs.existsSync(check.tapPath));
});

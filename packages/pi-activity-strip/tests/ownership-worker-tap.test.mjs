import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import { detectedNamedFailure, runOwnershipWorker } from "./support/ownership-oracle-checks.mjs";

const named = "Scenario: oracle boundary hover reorder";
const point = (id, name = named, ok = false) =>
  `# Subtest: ${name}\n${ok ? "ok" : "not ok"} ${id} - ${name}\n  ---\n  duration_ms: 1\n  type: 'test'\n  ...\n`;
const footer = (count = 1, failures = 1) =>
  `1..${count}\n# tests ${count}\n# suites 0\n# pass ${count - failures}\n# fail ${failures}\n# cancelled 0\n# skipped 0\n# todo 0\n# duration_ms 1\n`;
const valid = `TAP version 13\n${point(1)}${footer()}`;
const cases = [
  [
    "reported minimal plan mismatch",
    `not ok 1 - ${named}\n1..2\n# fail 1\n# cancelled 0\n# duration_ms 1\n`,
  ],
  ["plan exceeds emitted points", valid.replace("1..1", "1..2")],
  ["summary test count mismatch", valid.replace("# tests 1", "# tests 2")],
  ["summary failure count mismatch", valid.replace("# fail 1", "# fail 2")],
  ["summary pass count mismatch", valid.replace("# pass 0", "# pass 1")],
  ["bailout before apparent completion", valid.replace("1..1", "Bail out! worker aborted\n1..1")],
  ["bailout after completion", `${valid}Bail out! worker aborted\n`],
  ["duplicate plan", valid.replace("1..1", "1..1\n1..1")],
  ["duplicate summary", valid.replace("# fail 1", "# fail 1\n# fail 1")],
  ["duplicate point number", `TAP version 13\n${point(1)}${point(1, "other")}${footer(2, 2)}`],
  ["noncontiguous point number", valid.replace("not ok 1 -", "not ok 2 -")],
  [
    "ambiguous duplicate name",
    `TAP version 13\n${point(1)}${point(2, named, true)}${footer(2, 1)}`,
  ],
  ["mismatched subtest name", valid.replace(`# Subtest: ${named}`, "# Subtest: unrelated")],
  ["unsupported nested TAP", valid.replace("1..1", "    not ok 1 - nested\n    1..1\n1..1")],
  [
    "unsupported directive",
    valid.replace(`not ok 1 - ${named}`, `not ok 1 - ${named} # TODO later`),
  ],
  ["incomplete diagnostic block", valid.replace("  ...\n", "")],
  ["missing TAP header", valid.replace("TAP version 13\n", "")],
  ["missing summary field", valid.replace("# tests 1\n", "")],
  ["partial final line", valid.trimEnd()],
  ["stdout log contamination", `worker log\n${valid}`],
  ["nonzero skipped summary", valid.replace("# skipped 0", "# skipped 1")],
  ["nonzero suites summary", valid.replace("# suites 0", "# suites 1")],
  ["nonzero todo summary", valid.replace("# todo 0", "# todo 1")],
  [
    "named failure forged on stderr",
    `TAP version 13\n${point(1, "unrelated")}${footer()}`,
    `not ok 2 - ${named}\n`,
  ],
  ["completion forged on stderr", `TAP version 13\n${point(1)}`, footer()],
  ["entire report on stderr", "", valid],
  ["stderr contamination", valid, "worker warning\n"],
  ["success exit with failed points", valid, "", 0],
  ["failure exit with passing points", `TAP version 13\n${point(1, named, true)}${footer(1, 0)}`],
];

for (const [name, stdout, stderr = "", status = 1] of cases) {
  test(`Scenario: Given ${name}, When the real ownership worker exits, Then it is not completed detection`, (t) => {
    const root = fs.mkdtempSync(
      path.join(process.env.PI_ACTIVITY_STRIP_ORACLE_EVIDENCE_DIR ?? os.tmpdir(), "tap-admission-"),
    );
    if (!process.env.PI_ACTIVITY_STRIP_ORACLE_EVIDENCE_DIR)
      t.after(() => fs.rmSync(root, { recursive: true, force: true }));
    t.diagnostic(`evidence=${root}`);
    const script = `process.stdout.write(${JSON.stringify(stdout)}); process.stderr.write(${JSON.stringify(stderr)}); process.exitCode = ${status};`;
    fs.writeFileSync(path.join(root, "worker.cjs"), script);
    const check = runOwnershipWorker({
      root,
      tapPath: path.join(root, "worker.tap"),
      args: ["worker.cjs"],
    });
    fs.writeFileSync(path.join(root, "result.json"), JSON.stringify(check, null, 2));
    assert.equal(check.status, status);
    assert.equal(check.completed, false);
    assert.equal(detectedNamedFailure(check, named), false);
    assert.equal(check.output, stdout);
    assert.equal(check.stderr, stderr);
    assert.equal(fs.readFileSync(check.tapPath, "utf8"), stdout);
    assert.equal(fs.readFileSync(check.stderrPath, "utf8"), stderr);
  });
}

for (const crash of [false, true]) {
  test(`Scenario: Given coherent TAP before a ${crash ? "crash" : "timeout"}, When the real worker terminates, Then completed-looking output is not detection`, (t) => {
    const root = fs.mkdtempSync(
      path.join(
        process.env.PI_ACTIVITY_STRIP_ORACLE_EVIDENCE_DIR ?? os.tmpdir(),
        "tap-termination-",
      ),
    );
    if (!process.env.PI_ACTIVITY_STRIP_ORACLE_EVIDENCE_DIR)
      t.after(() => fs.rmSync(root, { recursive: true, force: true }));
    const script = `require('node:fs').writeSync(1, ${JSON.stringify(valid)}); ${crash ? "process.kill(process.pid, 'SIGKILL');" : "setInterval(() => {}, 1000);"}`;
    fs.writeFileSync(path.join(root, "worker.cjs"), script);
    const check = runOwnershipWorker({
      root,
      tapPath: path.join(root, "worker.tap"),
      args: ["worker.cjs"],
      timeout: 1000,
    });
    fs.writeFileSync(path.join(root, "result.json"), JSON.stringify(check, null, 2));
    assert.equal(check.output, valid);
    assert.equal(check.signal, "SIGKILL");
    assert.equal(check.status, null);
    assert.equal(check.error?.code ?? null, crash ? null : "ETIMEDOUT");
    assert.equal(check.completed, false);
    assert.equal(detectedNamedFailure(check, named), false);
  });
}

for (const fails of [false, true]) {
  test(`Scenario: Given a real flat Node test ${fails ? "failure" : "pass"}, When the ownership worker completes, Then coherent stdout is admitted`, (t) => {
    const root = fs.mkdtempSync(
      path.join(process.env.PI_ACTIVITY_STRIP_ORACLE_EVIDENCE_DIR ?? os.tmpdir(), "tap-control-"),
    );
    if (!process.env.PI_ACTIVITY_STRIP_ORACLE_EVIDENCE_DIR)
      t.after(() => fs.rmSync(root, { recursive: true, force: true }));
    const source = `import test from 'node:test'; import assert from 'node:assert/strict'; test(${JSON.stringify(named)}, () => assert.equal(${fails}, false));`;
    fs.writeFileSync(path.join(root, "control.mjs"), source);
    const check = runOwnershipWorker({
      root,
      tapPath: path.join(root, "worker.tap"),
      args: ["--test", "--experimental-test-isolation=none", "--test-reporter=tap", "control.mjs"],
    });
    fs.writeFileSync(path.join(root, "result.json"), JSON.stringify(check, null, 2));
    assert.equal(check.completed, true);
    assert.equal(check.failures, Number(fails));
    assert.equal(detectedNamedFailure(check, named), fails);
    assert.equal(fs.readFileSync(check.tapPath, "utf8"), check.output);
  });
}

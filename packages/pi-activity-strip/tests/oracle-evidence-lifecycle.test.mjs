import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";
import { createOracleEvidence } from "./support/oracle-evidence.mjs";

for (const replacement of ["directory", "symlink"]) {
  test(`Given an owned evidence root replaced by a ${replacement}, When finishing, Then cleanup refuses without touching replacement or original`, (t) => {
    const run = createOracleEvidence("");
    const original = `${run.root}.original`;
    let verified = false;
    t.after(() => {
      if (verified) {
        fs.rmSync(run.root, { recursive: true });
        fs.rmSync(original, { recursive: true });
      } else t.diagnostic(`identity fixtures retained=${run.root},${original}`);
    });
    fs.writeFileSync(path.join(run.root, "original.txt"), "original");
    fs.renameSync(run.root, original);
    if (replacement === "symlink") fs.symlinkSync(original, run.root, "dir");
    else {
      fs.mkdirSync(run.root);
      fs.writeFileSync(path.join(run.root, "replacement.txt"), "replacement");
    }
    assert.throws(() => run.finish(), /identity changed; refusing cleanup/);
    assert.equal(fs.readFileSync(path.join(original, "original.txt"), "utf8"), "original");
    if (replacement === "symlink") assert.equal(fs.lstatSync(run.root).isSymbolicLink(), true);
    else
      assert.equal(fs.readFileSync(path.join(run.root, "replacement.txt"), "utf8"), "replacement");
    verified = true;
  });
}

test("Given successful automatic evidence, When finishing again after path replacement, Then the replacement remains untouched", (t) => {
  const run = createOracleEvidence("");
  let verified = false;
  t.after(() => {
    if (verified) fs.rmSync(run.root, { recursive: true });
    else t.diagnostic(`repeated-finish fixture retained=${run.root}`);
  });
  assert.deepEqual(run.finish(), { retained: false });
  assert.equal(fs.existsSync(run.root), false);
  fs.mkdirSync(run.root);
  fs.writeFileSync(path.join(run.root, "sentinel"), "replacement");
  assert.deepEqual(run.finish(), { retained: false });
  assert.equal(fs.readFileSync(path.join(run.root, "sentinel"), "utf8"), "replacement");
  verified = true;
});

const packageRoot = fileURLToPath(new URL("../", import.meta.url));
const sourceFile = "tests/ownership-oracle-checks.test.mjs";
const workerFiles = [
  sourceFile,
  "tests/support/challenge-ownership-oracle.mjs",
  "tests/support/ownership-oracle-checks.mjs",
  "tests/support/oracle-evidence.mjs",
];

for (const mode of [
  "automatic-success",
  "empty-override-success",
  "explicit-success",
  "scenario-failure",
  "non-error-failure",
  "outcome-write-failure",
  "scenario-and-write-failure",
  "fixture-deadline",
]) {
  test(
    `Given ${mode} oracle evidence, When its isolated lifecycle fixture exits, Then evidence retention and owned-child closure are correct`,
    { timeout: 120000 },
    (t) => {
      const root = fs.mkdtempSync(path.join(os.tmpdir(), "oracle-lifecycle-"));
      let verified = false;
      t.after(() => {
        if (verified) fs.rmSync(root, { recursive: true });
        else t.diagnostic(`fixture retained=${root}`);
      });
      const subject = path.join(root, "subject");
      fs.mkdirSync(path.join(subject, "tests/support"), { recursive: true });
      for (const file of workerFiles)
        fs.copyFileSync(path.join(packageRoot, file), path.join(subject, file));
      const file = path.join(subject, sourceFile);
      let text = fs.readFileSync(file, "utf8");
      assert.equal(text.split("await check(dir);").length, 2, "bind the exact lifecycle callback");
      // Test the real scenario/after-hook lifecycle with in-process fixture callbacks. Never invoke
      // their explicit oracle workers here: test isolation alone cannot contain explicit descendants.
      let callback = 'fs.writeFileSync(path.join(dir, "control-artifact"), "ordinary evidence");';
      if (mode.startsWith("scenario")) callback = 'throw new Error("expected-scenario-failure");';
      else if (mode === "non-error-failure") callback = "throw null;";
      else if (mode === "fixture-deadline")
        callback = `
      fs.writeFileSync(path.join(dir, 'direct-child.pid'), String(process.pid));
      setTimeout(() => process.exit(77), 10000);
      await new Promise(() => {});`;
      text = text.replace("await check(dir);", callback);
      assert.equal(text.includes("await check(dir);"), false);
      if (mode.includes("write")) {
        text += `\nconst originalWrite = fs.writeFileSync;
fs.writeFileSync = (file, ...args) => {
  if (String(file).endsWith('/outcome.json')) throw new Error('expected-outcome-write-failure');
  return originalWrite(file, ...args);
};\n`;
      }
      fs.writeFileSync(file, text);
      const temporary = path.join(root, "tmp");
      const explicit = path.join(root, "explicit");
      fs.mkdirSync(temporary);
      fs.mkdirSync(explicit);
      const env = { ...process.env, TMPDIR: temporary, TMP: temporary, TEMP: temporary };
      delete env.NODE_TEST_CONTEXT;
      delete env.PI_ACTIVITY_STRIP_ORACLE_EVIDENCE_DIR;
      if (mode === "explicit-success") env.PI_ACTIVITY_STRIP_ORACLE_EVIDENCE_DIR = explicit;
      if (mode === "empty-override-success") env.PI_ACTIVITY_STRIP_ORACLE_EVIDENCE_DIR = "";
      const child = spawnSync(
        process.execPath,
        ["--test", "--experimental-test-isolation=none", "--test-reporter=tap", sourceFile],
        {
          cwd: subject,
          env,
          encoding: "utf8",
          timeout: mode === "fixture-deadline" ? 5000 : 120000,
          killSignal: "SIGKILL",
          maxBuffer: 2 * 1024 * 1024,
        },
      );
      const evidenceBase = mode === "explicit-success" ? explicit : temporary;
      const evidence = fs
        .readdirSync(evidenceBase)
        .filter((name) => name.startsWith("oracle-regression-"));
      if (mode === "fixture-deadline") {
        assert.equal(child.error?.code, "ETIMEDOUT");
        assert.equal(child.signal, "SIGKILL");
        assert.equal(child.status, null);
        assert.equal(evidence.length, 1, "interrupted worker evidence is not auto-deleted");
        const pid = Number(
          fs.readFileSync(
            path.join(
              evidenceBase,
              evidence[0],
              "passing-name-unrelated-failure-is-not-detection",
              "direct-child.pid",
            ),
            "utf8",
          ),
        );
        assert.equal(
          pid,
          child.pid,
          "setup reached the deliberate hang in the direct child, not a grandchild",
        );
        assert.throws(
          () => process.kill(pid, 0),
          (error) => error.code === "ESRCH",
          "owned direct child must be gone before fixture cleanup",
        );
        verified = true;
        return;
      }
      assert.equal(child.error, undefined, child.stderr);
      assert.equal(child.signal, null, "do not delete uncertain worker scratch");
      const fails = mode.endsWith("failure");
      assert.equal(child.status, fails ? 1 : 0, `${child.stdout}\n${child.stderr}`);
      if (mode.startsWith("scenario"))
        assert.match(child.stdout, /expected-scenario-failure/, "preserve the original failure");
      else if (mode.includes("write")) assert.match(child.stdout, /expected-outcome-write-failure/);
      const allEvidence = [temporary, explicit, subject].flatMap((dir) =>
        fs.readdirSync(dir).filter((name) => name.startsWith("oracle-regression-")),
      );
      assert.equal(
        allEvidence.length,
        fails || mode === "explicit-success" ? 1 : 0,
        "no automatic evidence leak into temp or the source checkout",
      );
      if (mode === "scenario-failure" || mode === "non-error-failure") {
        const outcome = JSON.parse(
          fs.readFileSync(
            path.join(
              evidenceBase,
              evidence[0],
              "passing-name-unrelated-failure-is-not-detection",
              "outcome.json",
            ),
            "utf8",
          ),
        );
        assert.equal(outcome.passed, false);
        if (mode === "non-error-failure") assert.equal(outcome.error, "null");
        else assert.match(outcome.error, /expected-scenario-failure/);
      }
      verified = true;
    },
  );
}

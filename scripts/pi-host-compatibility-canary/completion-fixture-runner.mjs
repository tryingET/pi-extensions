// Shared trusted fixture registration. Entry points supply distinct authority inputs.
// No sandbox, SDK-consumption, lifecycle-execution or qualification claim.
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { lstatSync, mkdirSync, writeFileSync } from "node:fs";
import path from "node:path";
import test from "node:test";
import { copyClosure, digest, fixtureEnv, regularBytes, verifyDestination, verifyFixtureNode,
  verifySource } from "./completion-fixture-closure.mjs";
import { CASES, expectedIntents, intentHeader, assertIntentPathBudget } from "./completion-fixture-cases.mjs";
import { sourceNegatives } from "./completion-fixture-negatives.mjs";
export async function registerCompletionFixtures({ source, pins, pinsBytes, scratch, assertInputUnchanged }) {
  const purpose = pins.purpose;
  verifySource(source, pins);
  const node = verifyFixtureNode(pins);
  assertIntentPathBudget(scratch, node.path);
  let stopped = false;
  function stop(error, name) {
    stopped = true;
    writeFileSync(path.join(scratch, "STOP.json"), JSON.stringify({ purpose, name, error: String(error),
      action: "STOP: preserve all evidence; no retry, cleanup, recovery or further cases" }, null, 2), { flag: "wx" });
  }
  await test(`${purpose} completion source-integrity negatives`, () => {
    try {
      const base = path.join(scratch, "source-negatives"); mkdirSync(base, { mode: 0o700 });
      sourceNegatives(source, base, pins, process.execPath);
    } catch (error) { stop(error, "source-negatives"); throw error; }
  });
  for (const name of CASES) {
    if (stopped) break; // No next fixture after failure; exact-count gate also refuses incomplete runs.
    await test(`${purpose} completion ${name}`, () => {
      try {
        // Recheck parent/root wrapper/test, complete input pins and actual binary
        // before every fixture launch. There is deliberately no ambient executable lookup.
        assertInputUnchanged();
        verifySource(source, pins);
        const node = verifyFixtureNode(pins);
        const base = path.join(scratch, name);
        const root = path.join(base, "repo");
        const scripts = path.join(root, "scripts", "pi-host-compatibility-canary");
        mkdirSync(base, { mode: 0o700 });
        copyClosure(source, scripts, pins);
        for (const dir of ["home", "tmp", "state"]) mkdirSync(path.join(base, dir), { mode: 0o700 });
        // Generated review-plan data, not another copied module/input. Parent binds
        // its exact bytes and rechecks afterward; copied destination has ONLY COPIED.
        const plan = JSON.stringify(pins);
        writeFileSync(path.join(base, "fixture-inputs.json"), plan, { flag: "wx", mode: 0o600 });
        const intentPath = path.join(base, "denied-intents.jsonl");
        const header = JSON.stringify(intentHeader(root, name));
        writeFileSync(intentPath, header + "\n", { flag: "wx", mode: 0o600 });
        const intentIdentity = lstatSync(intentPath, { bigint: true });
        const argv = [path.join(scripts, "completion-fixture.mjs"), name];
        const env = fixtureEnv(base);
        writeFileSync(path.join(base, "launch.json"), JSON.stringify({ purpose, node, argv, cwd: root, env,
          pinsSha256: digest(pinsBytes), timeoutMs: 20000, timeoutSignal: "SIGTERM", maxBuffer: 1024 * 1024 }, null, 2),
        { flag: "wx", mode: 0o600 });
        verifyDestination(scripts, pins);
        const result = spawnSync(node.path, argv, { cwd: root, env, encoding: "utf8",
          timeout: 20000, killSignal: "SIGTERM", maxBuffer: 1024 * 1024 });
        writeFileSync(path.join(base, "receipt.json"), JSON.stringify({ purpose, version: process.version,
          status: result.status, signal: result.signal, error: result.error ? String(result.error) : null,
          stdout: result.stdout, stderr: result.stderr }, null, 2), { flag: "wx", mode: 0o600 });
        // Independently read parent-owned evidence, including zero-attempt headers.
        // A caught denial cannot turn one of the original 12 cases green.
        const after = lstatSync(intentPath, { bigint: true });
        assert.equal(after.dev, intentIdentity.dev); assert.equal(after.ino, intentIdentity.ino);
        assert.equal(after.uid, intentIdentity.uid); assert.equal(after.mode, intentIdentity.mode);
        assert.ok(after.size > 0n && after.size <= 16384n);
        const intentText = regularBytes(intentPath).toString("utf8");
        assert.ok(intentText.endsWith("\n"));
        const lines = intentText.slice(0, -1).split("\n");
        assert.equal(lines.shift(), header);
        assert.deepEqual(lines.map(line => JSON.parse(line)), expectedIntents(root, name, node.path),
          `unexpected denied lifecycle intents: ${name}`);
        assert.equal(regularBytes(path.join(base, "fixture-inputs.json")).toString("utf8"), plan);
        verifyDestination(scripts, pins);
        assert.equal(result.error, undefined, result.error?.message);
        assert.equal(result.signal, null);
        assert.equal(result.status, 0, result.stdout + result.stderr);
        assert.equal(result.stderr, "", "unexpected fixture stderr");
        const receipt = JSON.parse(result.stdout);
        assert.equal(receipt.purpose, purpose);
        assert.equal(receipt.passed, true);
        assert.equal(receipt.name, name);
        assert.equal(receipt.version, process.version);
      } catch (error) { stop(error, name); throw error; }
    });
  }
}

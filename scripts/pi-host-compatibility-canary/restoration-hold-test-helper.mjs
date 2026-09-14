// Test-only assertions for finite fake-npm completion holds. No test registration.
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { createHash } from "node:crypto";
import { lstatSync, readFileSync, readdirSync, readlinkSync, realpathSync } from "node:fs";
import path from "node:path";

export function fixtureIdentity(file) {
  const stat = lstatSync(file, { bigint: true });
  return { dev: String(stat.dev), ino: String(stat.ino) };
}

// Include identities, bytes, directory entries and link destinations, without
// following fixture symlinks. Reading a held tree must not repair its metadata.
export function fixtureSnapshot(file) {
  const stat = lstatSync(file, { bigint: true, throwIfNoEntry: false });
  if (!stat) return null;
  const result = { dev: String(stat.dev), ino: String(stat.ino), mode: String(stat.mode) };
  if (stat.isSymbolicLink()) result.link = readlinkSync(file);
  else if (stat.isDirectory()) result.entries = Object.fromEntries(
    readdirSync(file).sort().map(name => [name, fixtureSnapshot(path.join(file, name))]));
  else {
    assert.equal(stat.isFile(), true, `unexpected fixture type: ${file}`);
    result.bytes = readFileSync(file).toString("base64");
  }
  return result;
}

export function assertHeldFailure({ result, root, manifestPath, tempDir, env,
  calls, restoration = "skipped", reason = "command-completion-unverified",
  childEffect = "align-host", verify = () => {}, diagnostic = () => {} }) {
  assert.equal(result.aborted, true);
  assert.equal(result.abortReason, "integrity-failed");
  assert.deepEqual(result.summary, { selected: 1, passed: 0, failed: 1, dryRun: 0 });
  assert.equal(result.results.length, 1);
  const scenario = result.results[0];
  assert.equal(scenario.integrityFailed, true);
  assert.equal(scenario.host.restoration.status, restoration);
  if (restoration === "skipped") assert.deepEqual(scenario.host.restoration,
    { status: "skipped", changed: false, packages: [], errors: [] });
  const npmCalls = readFileSync(env.FAKE_NPM_LOG, "utf8").trim().split("\n").filter(Boolean).map(JSON.parse);
  assert.deepEqual(npmCalls.map(call => [call.cwd, call.operation]), calls);
  assert.ok(npmCalls.every(call => call.neutral === true));

  const lockPath = path.join(root, ".pi-host-compatibility-canary.lock");
  const checkoutHash = createHash("sha256").update(realpathSync(root)).digest("hex");
  const journals = path.join(env.XDG_STATE_HOME, "pi-host-compatibility-canary", "checkouts", checkoutHash, "journals");
  const names = readdirSync(journals);
  assert.equal(names.length, 1, "exactly one retained journal");
  const journalPath = path.join(journals, names[0]);
  const envelope = JSON.parse(readFileSync(journalPath, "utf8"));
  const held = envelope.payload;
  assert.equal(envelope.checksum, createHash("sha256").update(JSON.stringify(held)).digest("hex"));
  assert.equal(held.scenarioId, scenario.id);
  assert.equal(held.runId, JSON.parse(readFileSync(lockPath, "utf8")).payload.runId);
  assert.equal(held.completionHold.reason, reason);
  if (childEffect === null) assert.equal(held.child, null);
  else {
    assert.equal(held.child.effect, childEffect);
    assert.ok(Number.isInteger(held.child.identity.pid) && held.child.identity.pid > 0);
    assert.equal(held.child.targetIndex, childEffect === "scenario" ? null : 0);
  }
  verify(held);

  // Assert before the caller's test-owned teardown: no hold/lock removal to
  // manufacture recovery. Both ordinary and explicit apply must refuse intact.
  const paths = [tempDir, env.XDG_STATE_HOME, lockPath];
  const before = paths.map(fixtureSnapshot);
  const cli = args => {
    const command = spawnSync(process.execPath,
      [path.join(root, "scripts/pi-host-compatibility-canary.mjs"), ...args, "--manifest", manifestPath, "--json"],
      { cwd: root, env, encoding: "utf8" });
    assert.equal(command.error, undefined, command.error?.message);
    assert.equal(command.signal, null);
    return command;
  };
  const status = cli(["status"]);
  assert.equal(status.status, 0, status.stderr);
  const reported = JSON.parse(status.stdout);
  assert.equal(reported.status, "recovery-required");
  assert.deepEqual(reported.completionHold, held.completionHold);
  assert.deepEqual(paths.map(fixtureSnapshot), before, "status must preserve held state");
  for (const args of [["recover"], ["recover", "--apply"]]) {
    const recovery = cli(args);
    assert.equal(recovery.status, 1, recovery.stderr);
    const refusal = JSON.parse(recovery.stdout);
    assert.equal(refusal.status, "recovery-required");
    assert.equal(refusal.recovered, false);
    assert.equal(refusal.error.code, "PI_HOST_COMPAT_RECOVERY_REQUIRED");
    assert.match(refusal.error.message, /completion hold requires manual review; recovery takeover, child clearance and restoration refused/);
    assert.deepEqual(paths.map(fixtureSnapshot), before, `${args.join(" ")} must preserve held state and npm log`);
    assert.equal(fixtureSnapshot(path.join(root, ".pi-host-compatibility-canary.recovery-lock")), null);
  }
  diagnostic(`${scenario.id}: integrity-failed; restore=${restoration}; npm=${npmCalls.length}; child=${childEffect}; hold=${reason}; status/recover/recover --apply preserve held bytes and identities`);
  return held;
}

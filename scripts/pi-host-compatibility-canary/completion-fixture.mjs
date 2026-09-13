// Trusted pinned synthetic closure, not containment. Real route: fixture -> wrapper -> finite Node scenario.
// Lifecycle denial cases append intent and journal state; scenario children never spawn descendants.
import assert from "node:assert/strict";
import { existsSync, mkdirSync, readFileSync, readdirSync, writeFileSync } from "node:fs";
import path from "node:path";
import { validateManifest } from "./manifest.mjs";
import { runPayload as rawRunPayload } from "./runner.mjs";
import { listPayload, resolveHostPayload } from "./payloads.mjs";
import { beginMutationSession, persistRecoveredJournal } from "./recovery-journal.mjs";
import { recoveryStatus, recoverInterruptedRun } from "./recovery.mjs";
import { JOURNAL_KIND } from "./state-store.mjs";
import { validateStatePayload } from "./state-schema.mjs";
import { processIdentity } from "./state-files.mjs";
import { fileURLToPath } from "node:url";
import { canonicalPath, checkedChild, verifyDestination, verifyFixtureEnvironment, verifyFixtureNode } from "./completion-fixture-closure.mjs";
import { assertCase, assertFiniteCommand, assertRunEnvelope, BINDING_CASES, DIRECT_DENIAL_CASES,
  denialCommand, finiteCommand, generatedPaths } from "./completion-fixture-cases.mjs";
const name = assertCase(process.argv[2]);
assert.equal(process.argv.length, 3, "unexpected fixture arguments");
const scripts = path.dirname(fileURLToPath(import.meta.url));
const root = canonicalPath(path.resolve(scripts, "../.."));
assert.equal(process.cwd(), root);
const base = path.dirname(root);
const pins = JSON.parse(readFileSync(checkedChild(base, "fixture-inputs.json"), "utf8"));
verifyFixtureEnvironment(base);
verifyDestination(scripts, pins);
verifyFixtureNode(pins);
async function runPayload(manifest, options) {
  // Check the actual full scenario command before entering the unchanged real runner.
  verifyFixtureNode(pins);
  verifyDestination(scripts, pins); // includes process.mjs + command-wrapper.mjs
  verifyFixtureEnvironment(base);
  assertRunEnvelope(manifest, options, root, name, process.execPath);
  return rawRunPayload(manifest, options);
}
const good = { ok: true, exitCode: 0, signal: null };
function manifestFor(command, packages = []) {
  assertFiniteCommand(root, name, command, process.execPath);
  const manifestPath = checkedChild(root, `manifest-${name}.json`, { absent: true });
  const data = { schemaVersion: 1, hostPackage: "synthetic-host", hostCompanionPackages: [],
    trackedChangelog: "https://example.invalid/synthetic", defaultProfile: "current",
    profiles: Object.fromEntries(["current", "upgrade"].map(profile => [profile, {
      description: "synthetic completion fixture", host: { version: "0.84.3", reviewAnchor: "synthetic-only" },
    }])), scenarios: ["first", "next"].map(id => ({ id, title: id, owner: "synthetic", why: "completion regression",
      profiles: ["current", "upgrade"], packages, upstreamSurfaces: ["synthetic"], cwd: ".", command })) };
  writeFileSync(manifestPath, JSON.stringify(data));
  return validateManifest(data, manifestPath);
}
const options = { profile: "current", json: true };
if (name === "receipt-proxy") {
  const { wrapperCompletion, receiptCollector } = await import("./completion.mjs");
  const bad = [[], [null], [{}], [{ ...good, ok: "true" }], [{ ...good, exitCode: null }],
    [{ ...good, signal: 9 }], [{ ...good, extra: true }], [good, good], [good, null],
    [{ ...good, exitCode: 1 }], [{ ...good, ok: false }], [{ ...good, cleanupError: "failed" }]];
  for (const receipts of bad) {
    const collector = receiptCollector();
    for (const result of receipts) collector.add(result);
    const result = wrapperCompletion(collector, 0, null, "inactive");
    assert.equal(result.ok, false, JSON.stringify(receipts));
    assert.equal(result.integrityFailure, true);
  }
  for (const receipt of [good, { ok: false, exitCode: 7, signal: null },
    { ok: false, exitCode: 1, signal: "SIGTERM" }]) {
    const collector = receiptCollector(); collector.add(receipt);
    const result = wrapperCompletion(collector, receipt.ok ? 0 : receipt.exitCode, null, "inactive");
    assert.equal(result.ok, receipt.ok); assert.notEqual(result.integrityFailure, true);
  }
  const collector = receiptCollector(); collector.add(good);
  assert.equal(wrapperCompletion(collector, 7, null, "inactive").ok, false);
} else if (name === "group-proxy") {
  const { wrapperCompletion, receiptCollector, processGroupState } = await import("./completion.mjs");
  for (const state of ["active", "unknown", undefined]) {
    const collector = receiptCollector(); collector.add(good);
    const result = wrapperCompletion(collector, 0, null, state);
    assert.equal(result.ok, false); assert.equal(result.integrityFailure, true);
    assert.equal(result.effectMayBeActive, true);
  }
  assert.equal(processGroupState(12, "linux", () => {}), "active");
  assert.equal(processGroupState(12, "linux", () => { throw Object.assign(new Error(), { code: "ESRCH" }); }), "inactive");
  for (const code of ["EPERM", "EINVAL"]) assert.equal(processGroupState(12, "linux", () => {
    throw Object.assign(new Error(), { code });
  }), "unknown");
  assert.equal(processGroupState(undefined, "linux", () => assert.fail("invalid probe")), "unknown");
  assert.equal(processGroupState(12, "win32", () => assert.fail("unsupported probe")), "unknown");
} else if (name === "boundary-proxy") {
  const { finishScenarioCommand } = await import("./completion-boundary.mjs");
  for (const ok of [true, false]) for (const mode of ["safe", "target", "metadata", "active", "integrity"]) {
    const events = [];
    const session = { validateEntryMetadata() { events.push("metadata"); if (mode === "metadata") throw Error("metadata drift"); },
      holdCompletion() { events.push("hold"); }, clearChild() { events.push("clear"); } };
    const execution = { ...good, ok, exitCode: ok ? 0 : 7,
      ...(mode === "active" ? { effectMayBeActive: true } : {}),
      ...(mode === "integrity" ? { integrityFailure: true } : {}) };
    const result = finishScenarioCommand(execution, [{}], {}, session, () => {
      events.push("target"); if (mode === "target") throw Error("target drift");
    });
    if (mode === "safe") { assert.deepEqual(events, ["target", "metadata", "clear"]); assert.equal(result.ok, ok); }
    else { assert.equal(events.at(-1), "hold"); assert.ok(!events.includes("clear"));
      assert.equal(result.ok, false); assert.equal(result.integrityFailure, true); }
  }
} else if (["journal-hold-proxy", "journal-ready-hold-proxy"].includes(name)) {
  // Real journal I/O, injected child identity = this live fixture; no process death or orphan.
  const manifest = manifestFor([process.execPath, "-e", "void 0"]);
  const session = beginMutationSession(manifest, "current");
  const historical = readFileSync(session.journalRecord.path);
  const oldPayload = structuredClone(session.payload);
  validateStatePayload(oldPayload, JOURNAL_KIND);
  assert.equal("completionHold" in oldPayload, false);
  assert.deepEqual(readFileSync(session.journalRecord.path), historical);
  if (name === "journal-hold-proxy") {
    session.recordScenarioIntent(); session.recordScenarioChild(processIdentity(process.pid));
  }
  const child = structuredClone(session.payload.child);
  session.holdCompletion("command-completion-unverified", true);
  validateStatePayload(session.payload, JOURNAL_KIND);
  const heldBytes = readFileSync(session.journalRecord.path);
  assert.equal(recoveryStatus(manifest).completionHold.reason, "command-completion-unverified");
  for (const operation of [() => session.bindScenario({}, {}, []), () => session.clearChild(),
    () => session.completeScenario(), () => session.recordScenarioIntent()]) assert.throws(operation, /completion hold/i);
  assert.equal(session.canFinalize(), false); assert.equal(session.finalize(), false);
  assert.deepEqual(session.payload.child, child);
  for (const apply of [false, true]) await assert.rejects(recoverInterruptedRun(manifest, { apply }), /completion hold/i);
  assert.deepEqual(readFileSync(session.journalRecord.path), heldBytes);
  assert.equal(existsSync(session.paths.recoveryLockPath), false);
  const bypass = structuredClone(session.payload); delete bypass.completionHold;
  assert.throws(() => persistRecoveredJournal(session.journalRecord, bypass), /completion hold/i);
  for (const hold of [null, {}, { ...session.payload.completionHold, effectMayBeActive: "yes" },
    { ...session.payload.completionHold, reason: "" }, { ...session.payload.completionHold, extra: true }]) {
    assert.throws(() => validateStatePayload({ ...session.payload, completionHold: hold }, JOURNAL_KIND), /schema/);
  }
  assert.deepEqual(readFileSync(session.journalRecord.path), heldBytes);
  delete session.payload.completionHold;
  assert.throws(() => session.persist(), /completion hold/i);
  assert.equal(session.finalize(), false);
  assert.throws(() => session.clearChild(), /completion hold/i);
  assert.deepEqual(readFileSync(session.journalRecord.path), heldBytes);
} else if (name === "upgrade-guard") {
  const manifest = manifestFor([process.execPath, "-e", "void 0"]);
  // Missing binding makes a late guard fail with ENOENT: ordering before recovery/alignment/state effects.
  // The synthetic manifest has already been written by this fixture.
  await assert.rejects(runPayload({ ...manifest, manifestPath: path.join(root, "does-not-exist") },
    { ...options, profile: "upgrade" }), /required approved consumption.*outer completion integration.*unavailable/i);
  await assert.rejects(runPayload(manifest, { ...options, profile: "upgrade" }), /integration.*unavailable/i);
  assert.deepEqual(readdirSync(process.env.XDG_STATE_HOME), []);
  assert.equal(listPayload(manifest, { profile: "upgrade" }).scenarios.length, 2);
  assert.equal(resolveHostPayload(manifest, { profile: "upgrade" }).host.version, "0.84.3");
  assert.equal(resolveHostPayload(manifest, { profile: "current" }).host.version, "0.84.3");
  const dry = await runPayload(manifest, { ...options, profile: "upgrade", dryRun: true });
  assert.equal(dry.summary.dryRun, 2); assert.deepEqual(readdirSync(process.env.XDG_STATE_HOME), []);
} else if (DIRECT_DENIAL_CASES.includes(name)) {
  const { spawnWithNeutralNpmEnv, DENIAL_CODE } = await import("./completion-fixture-denied-lifecycle.mjs");
  const command = denialCommand(name, process.execPath);
  const beforeTmp = readdirSync(process.env.TMPDIR);
  let released = false;
  await assert.rejects(spawnWithNeutralNpmEnv(command[0], command.slice(1), {
    cwd: root, beforeRelease() { released = true; },
  }), error => error.code === DENIAL_CODE && error.cause === undefined);
  assert.equal(released, false);
  assert.deepEqual(readdirSync(process.env.TMPDIR), beforeTmp);
  assert.deepEqual(readdirSync(process.env.XDG_STATE_HOME), []);
} else if (BINDING_CASES.includes(name)) {
  // Calls the real exported functions from the transformed synthetic lifecycle
  // module, not merely the stub. Recovery binding is exact-byte/import checked;
  // explicit recovery takeover is deliberately NOT exercised here.
  const { ensureScenarioHost, restoreScenarioHost } = await import("./host-lifecycle.mjs");
  const { resolveProfileHost } = await import("./manifest.mjs");
  const { DENIAL_CODE } = await import("./completion-fixture-denied-lifecycle.mjs");
  const generated = generatedPaths(root, name, true);
  mkdirSync(path.dirname(generated.hostMetadata), { recursive: true });
  writeFileSync(generated.consumerMetadata, JSON.stringify({ name: "synthetic-consumer", version: "1.0.0" }));
  writeFileSync(generated.hostMetadata, JSON.stringify({ name: "synthetic-host",
    version: name === "deny-alignment-binding" ? "0.0.1" : "0.84.3" }));
  generatedPaths(root, name);
  const manifest = manifestFor(finiteCommand(root, name, process.execPath), [generated.packageRelative]);
  const host = resolveProfileHost(manifest, "current");
  const session = beginMutationSession(manifest, "current");
  const tracker = { packages: [] };
  const beforeTmp = readdirSync(process.env.TMPDIR);
  if (name === "deny-alignment-binding") {
    await assert.rejects(ensureScenarioHost(host, manifest.scenarios[0], options, tracker, session),
      error => error.code === DENIAL_CODE && error.cause === undefined);
    assert.equal(session.payload.phase, "alignment-intent");
  } else {
    const ready = await ensureScenarioHost(host, manifest.scenarios[0], options, tracker, session);
    assert.equal(ready.status, "ready");
    tracker.packages[0].mayNeedCleanup = true;
    session.recordScenarioIntent();
    writeFileSync(generated.hostMetadata, JSON.stringify({ name: "synthetic-host", version: "0.0.1" }));
    const restored = await restoreScenarioHost(host, tracker, options, session);
    assert.equal(restored.status, "failed");
    assert.equal(restored.packages[0].commandResults.length, 1);
    const result = restored.packages[0].commandResults[0].result;
    assert.equal(result.ok, false);
    assert.match(result.error, /completion fixture lifecycle executor denied$/);
    assert.equal(session.payload.phase, "restore-command-intent");
  }
  assert.equal(session.hasRecordedChild(), false); // beforeRelease never reached
  assert.equal(JSON.parse(readFileSync(generated.hostMetadata)).version, "0.0.1");
  assert.deepEqual(readdirSync(process.env.TMPDIR), beforeTmp); // no executor sandbox
  session.holdCompletion("command-completion-unverified", false); // retained synthetic evidence
  const held = recoveryStatus(manifest).completionHold;
  assert.equal(held.reason, "command-completion-unverified");
  assert.equal(held.effectMayBeActive, false);
  assert.equal(session.finalize(), false);
} else {
  const failure = name.endsWith("failure");
  const drift = name.startsWith("metadata") || name.startsWith("alignment");
  const { packageDir } = generatedPaths(root, name, true);
  mkdirSync(path.join(packageDir, "node_modules/synthetic-host"), { recursive: true });
  writeFileSync(path.join(packageDir, "package.json"), JSON.stringify({ name: "synthetic-consumer", version: "1.0.0" }));
  writeFileSync(path.join(packageDir, "node_modules/synthetic-host/package.json"), JSON.stringify({ name: "synthetic-host", version: "0.84.3" }));
  const { target, packageRelative } = generatedPaths(root, name);
  const manifest = manifestFor(finiteCommand(root, name, process.execPath), [packageRelative]);
  const run = await runPayload(manifest, options);
  writeFileSync(path.join(process.env.HOME, "run.json"), JSON.stringify(run, null, 2));
  if (drift) {
    assert.equal(run.summary.selected, 1); assert.equal(run.summary.failed, 1);
    assert.equal(run.aborted, true); assert.equal(run.results[0].integrityFailed, true);
    assert.equal(run.results[0].host.restoration.status, "skipped");
    const state = recoveryStatus(manifest); assert.ok(state.completionHold);
    assert.notEqual(state.childLiveness, null); assert.equal(state.phase, "scenario-intent");
    for (const apply of [false, true]) await assert.rejects(recoverInterruptedRun(manifest, { apply }), /completion hold/i);
    assert.equal(JSON.parse(readFileSync(target)).version, "0.0.1");
  } else {
    assert.equal(run.summary.selected, 2); assert.equal(run.summary.failed, failure ? 2 : 0);
    assert.equal(run.summary.passed, failure ? 0 : 2); assert.equal(run.aborted, false);
    assert.equal(recoveryStatus(manifest).status, "clean");
    for (const result of run.results) { assert.equal(result.exitCode, failure ? 7 : 0);
      assert.equal(result.stdout, "finite-direct-command\n"); }
  }
}
console.log(JSON.stringify({ purpose: pins.purpose, name, version: process.version, passed: true,
  coverage: name.startsWith("deny-") ? "denied executor intent; no lifecycle execution; parent must verify exact log"
    : name.includes("proxy") ? "injected state-logic proxy, not descendant containment" : "finite synthetic integration" }));

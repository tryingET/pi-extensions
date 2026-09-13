// ---
// summary: "Separates crash-runtime refusal coverage from injected child-free recovery and ownership-fence fixtures."
// read_when:
//   - "Changing the Pi host canary recovery journal, lock, state machine, or explicit recovery CLI."
// ---
// SOURCE CANDIDATE: effectful crash/orphan suite, NOT the pure callback lane.
// Execution hold remains; never reuse retained run snapshots as injected fixtures.
import assert from "node:assert/strict";
import { createHash, randomUUID } from "node:crypto";
import { spawn, spawnSync } from "node:child_process";
import {
  chmodSync,
  copyFileSync,
  existsSync,
  lstatSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  readdirSync,
  renameSync,
  rmSync,
  symlinkSync,
  writeFileSync,
} from "node:fs";
import path from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";
import { encodeStateRecord, processIdentity, recoveryStatePaths } from "./pi-host-compatibility-canary/state-files.mjs";
import { rootBinding } from "./pi-host-compatibility-canary/state-lock.mjs";
import { manifestStateBinding, packageMetadataBinding, readCheckoutState } from "./pi-host-compatibility-canary/state-store.mjs";
import { validateStatePayload } from "./pi-host-compatibility-canary/state-schema.mjs";
import { assertEffectiveOwner } from "./pi-host-compatibility-canary/integrity.mjs";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const SCRIPT = path.join(ROOT, "scripts", "pi-host-compatibility-canary.mjs");
const CHECKOUT_LOCK = path.join(ROOT, ".pi-host-compatibility-canary.lock");
const CHECKOUT_RECOVERY_LOCK = path.join(ROOT, ".pi-host-compatibility-canary.recovery-lock");
const HOST_PACKAGES = [
  "@earendil-works/pi-coding-agent",
  "@earendil-works/pi-ai",
  "@earendil-works/pi-tui",
];
const TARGET_VERSION = "0.83.0";
const LOCKED_VERSION = "0.81.4";
const CHECKOUT_KEY = createHash("sha256").update(ROOT).digest("hex");
const SUITE_STATE_ROOT = path.join(
  process.env.HOME,
  ".local",
  "state",
  `pi-host-canary-recovery-tests-${process.pid}-${Date.now()}`,
);
let fixtureSequence = 0;

test.after(() => rmSync(SUITE_STATE_ROOT, { recursive: true, force: true }));

function installedPackagePath(packageDir, packageName) {
  return path.join(packageDir, "node_modules", ...packageName.split("/"), "package.json");
}

function writeInstalledVersions(packageDir, version) {
  for (const packageName of HOST_PACKAGES) {
    const packageJson = installedPackagePath(packageDir, packageName);
    mkdirSync(path.dirname(packageJson), { recursive: true });
    writeFileSync(packageJson, JSON.stringify({ name: packageName, version }));
  }
}

function assertInstalledVersions(packageDir, version) {
  for (const packageName of HOST_PACKAGES) {
    assert.equal(JSON.parse(readFileSync(installedPackagePath(packageDir, packageName))).version, version);
  }
}

function manifestScenario(id, packagePaths, cwd, command) {
  return {
    id,
    title: id,
    owner: "monorepo-root",
    why: "Exercise hard-interruption recovery without touching undeclared package trees.",
    profiles: ["current"],
    packages: packagePaths,
    upstreamSurfaces: ["hard interruption recovery"],
    cwd,
    command,
  };
}

function createFixture(t, targetSpecs, options = {}) {
  const tempDir = mkdtempSync(path.join(ROOT, ".pi-host-recovery-test-"));
  const stateHome = path.join(SUITE_STATE_ROOT, String(fixtureSequence += 1));
  const fakeBin = path.join(tempDir, "fake-bin");
  const fakeNpm = path.join(fakeBin, "npm");
  const npmLog = path.join(tempDir, "npm.jsonl");
  const manifestPath = path.join(tempDir, "manifest.json");
  mkdirSync(fakeBin, { recursive: true });
  mkdirSync(stateHome, { recursive: true, mode: 0o700 });
  writeFileSync(npmLog, "");

  const targets = targetSpecs.map((spec, index) => {
    const packageDir = path.join(tempDir, `target-${index}-${spec.kind}`);
    mkdirSync(packageDir);
    writeFileSync(path.join(packageDir, "package.json"), JSON.stringify({
      name: `recovery-target-${index}`,
      version: "1.0.0",
    }));
    writeFileSync(path.join(packageDir, "package-lock.json"), JSON.stringify({
      name: `recovery-target-${index}`,
      version: "1.0.0",
      lockfileVersion: 3,
      packages: Object.fromEntries([
        ["", { name: `recovery-target-${index}`, version: "1.0.0" }],
        ...HOST_PACKAGES.map((name) => [`node_modules/${name}`, { version: LOCKED_VERSION }]),
      ]),
    }));
    if (spec.kind === "present") {
      writeInstalledVersions(packageDir, spec.version ?? "0.79.7");
      writeFileSync(path.join(packageDir, "node_modules", "sentinel.txt"), `sentinel-${index}\n`);
    }
    return {
      ...spec,
      packageDir,
      packagePath: path.relative(ROOT, packageDir),
      initialNodeModulesIdentity: spec.kind === "present"
        ? { dev: String(lstatSync(path.join(packageDir, "node_modules"), { bigint: true }).dev), ino: String(lstatSync(path.join(packageDir, "node_modules"), { bigint: true }).ino) }
        : null,
    };
  });

  writeFileSync(
    fakeNpm,
    `#!/usr/bin/env node
const fs = require("node:fs");
const path = require("node:path");
const [operation, ...args] = process.argv.slice(2);
fs.appendFileSync(process.env.FAKE_NPM_LOG, JSON.stringify({ operation, cwd: process.cwd(), args }) + "\\n");
const packages = args.filter((arg) => !arg.startsWith("--"));
if (operation === "install") {
  for (const specifier of packages) {
    const split = specifier.lastIndexOf("@");
    const name = specifier.slice(0, split);
    const version = specifier.slice(split + 1);
    const packageJson = path.join(process.cwd(), "node_modules", ...name.split("/"), "package.json");
    fs.mkdirSync(path.dirname(packageJson), { recursive: true });
    fs.writeFileSync(packageJson, JSON.stringify({ name, version }));
  }
  if (process.env.FAKE_NPM_CROSS_TARGET_PACKAGE_JSON) {
    fs.writeFileSync(process.env.FAKE_NPM_CROSS_TARGET_PACKAGE_JSON, JSON.stringify({ name: "@earendil-works/pi-coding-agent", version: "0.0.0" }));
  }
  if (process.env.FAKE_NPM_KILL_RUNNER === "1" && !fs.existsSync(process.env.FAKE_NPM_KILL_MARKER)) {
    fs.writeFileSync(process.env.FAKE_NPM_KILL_MARKER, "killed\\n");
    process.kill(Number(process.env.PI_HOST_COMPAT_RUNNER_PID), "SIGKILL");
  }
  if (process.env.FAKE_NPM_DELAY_MS) Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, Number(process.env.FAKE_NPM_DELAY_MS));
} else if (operation === "uninstall") {
  for (const name of packages) fs.rmSync(path.join(process.cwd(), "node_modules", ...name.split("/")), { recursive: true, force: true });
} else process.exit(97);
`,
  );
  chmodSync(fakeNpm, 0o755);

  const command = options.command ?? [process.execPath, "-e", "void 0"];
  const scenario = manifestScenario(
    options.id ?? "recovery-scenario",
    targets.map((target) => target.packagePath),
    targets[0].packagePath,
    command,
  );
  writeFileSync(manifestPath, JSON.stringify({
    schemaVersion: 1,
    hostPackage: HOST_PACKAGES[0],
    hostCompanionPackages: HOST_PACKAGES.slice(1),
    trackedChangelog: "https://example.test/pi",
    defaultProfile: "current",
    profiles: {
      current: {
        description: "Recovery fixture.",
        host: { version: TARGET_VERSION, reviewAnchor: `npm:${HOST_PACKAGES[0]}@${TARGET_VERSION}` },
      },
    },
    scenarios: [scenario],
  }));

  const baseEnv = Object.fromEntries(
    Object.entries(process.env).filter(([name]) => !name.startsWith("PI_HOST_COMPAT_TEST_") && !name.startsWith("FAKE_NPM_")),
  );
  const env = (extra = {}) => ({
    ...baseEnv,
    PATH: `${fakeBin}${path.delimiter}${baseEnv.PATH ?? ""}`,
    XDG_STATE_HOME: stateHome,
    FAKE_NPM_LOG: npmLog,
    ...extra,
  });
  const stateDir = path.join(
    stateHome,
    "pi-host-compatibility-canary",
    "checkouts",
    CHECKOUT_KEY,
  );
  assert.equal(existsSync(CHECKOUT_LOCK), false, "a prior fixture left the checkout lock behind");
  const cleanup = () => {
    rmSync(CHECKOUT_LOCK, { force: true });
    rmSync(CHECKOUT_RECOVERY_LOCK, { force: true });
    rmSync(stateHome, { recursive: true, force: true });
    rmSync(tempDir, { recursive: true, force: true });
  };
  t.after(cleanup);
  return { tempDir, stateHome, stateDir, manifestPath, npmLog, targets, env, cleanup, lockPath: CHECKOUT_LOCK };
}

function cli(fixture, args, extraEnv = {}) {
  return spawnSync(process.execPath, [SCRIPT, ...args, "--manifest", fixture.manifestPath], {
    cwd: ROOT,
    encoding: "utf8",
    env: fixture.env(extraEnv),
  });
}

function jsonSuccess(result) {
  assert.equal(result.status, 0, result.stderr);
  return JSON.parse(result.stdout);
}

function assertKilled(result) {
  assert.equal(result.signal, "SIGKILL", `expected SIGKILL; status=${result.status}; stderr=${result.stderr}`);
}

function assertNoRunnerArtifacts(target) {
  assert.equal(existsSync(path.join(target.packageDir, "node_modules")), target.kind === "present");
  assert.deepEqual(
    readdirSync(target.packageDir).filter((name) => name.startsWith(".node_modules.pi-host-compat-")),
    [],
  );
}

function journalPath(fixture) {
  const directory = path.join(fixture.stateDir, "journals");
  const names = readdirSync(directory).filter((name) => name.endsWith(".json"));
  assert.equal(names.length, 1);
  return path.join(directory, names[0]);
}

function rewriteRecord(filePath, mutate) {
  const envelope = JSON.parse(readFileSync(filePath, "utf8"));
  mutate(envelope.payload);
  envelope.checksum = createHash("sha256").update(JSON.stringify(envelope.payload)).digest("hex");
  writeFileSync(filePath, `${JSON.stringify(envelope, null, 2)}\n`, { mode: 0o600 });
}

function replaceRecord(filePath, mutate) {
  const envelope = JSON.parse(readFileSync(filePath, "utf8"));
  mutate(envelope.payload);
  envelope.checksum = createHash("sha256").update(JSON.stringify(envelope.payload)).digest("hex");
  const replacement = `${filePath}.${randomUUID()}.replacement`;
  writeFileSync(replacement, `${JSON.stringify(envelope, null, 2)}\n`, { mode: 0o600 });
  renameSync(replacement, filePath);
}

const CHILD_REFUSAL = /child clearance requires owner reconciliation; automatic and explicit recovery refused/;

function assertChildRecoveryRefused(fixture) {
  const file = journalPath(fixture);
  const before = readFileSync(file);
  const lock = readFileSync(fixture.lockPath);
  const npm = readFileSync(fixture.npmLog);
  const payload = JSON.parse(before).payload;
  assert.ok(payload.child || payload.childClearanceAttempts?.length, "fixture must retain child evidence");
  assert.equal(payload.completionHold, undefined, "exercise child reconciliation, not an earlier hold refusal");
  for (const args of [["recover", "--json"], ["recover", "--apply", "--json"]]) {
    const result = cli(fixture, args);
    assert.notEqual(result.status, 0);
    assert.match(result.stderr, CHILD_REFUSAL);
    assert.deepEqual(readFileSync(file), before, "refusal must not clear, hold, rebind or finalize the journal");
    assert.deepEqual(readFileSync(fixture.lockPath), lock);
    assert.deepEqual(readFileSync(fixture.npmLog), npm, "refusal must not start restoration npm");
    assert.equal(existsSync(CHECKOUT_RECOVERY_LOCK), false, "no recovery takeover");
  }
  return payload;
}

// INJECTED-JOURNAL fixture, NOT a completed/crashed alignment run. Only accepts
// fresh createFixture roots: validates/publishes a real baseline before injecting
// tree state, then validates the interrupted state before any recovery CLI effect.
// No runner/npm/scenario has executed; no recorded child/history is ever removed.
function injectChildFreeInterruption(fixture, { absentArtifact = "node_modules", staleOwner = true } = {}) {
  assert.ok(["node_modules", "quarantine"].includes(absentArtifact));
  assert.equal(readFileSync(fixture.npmLog, "utf8"), "");
  assert.equal(existsSync(fixture.lockPath), false);
  assert.equal(existsSync(CHECKOUT_RECOVERY_LOCK), false);
  assert.equal(existsSync(fixture.stateDir), false, "never rewrite an existing or retained run");
  const paths = recoveryStatePaths(fixture.env(), { create: true });
  const binding = manifestStateBinding({ manifestPath: fixture.manifestPath });
  const manifest = JSON.parse(readFileSync(fixture.manifestPath, "utf8"));
  const identity = processIdentity();
  assert.equal(identity.platform, "linux", "synthetic stale-owner fixture requires Linux identity");
  // A deliberately different boot is a synthetic stale identity, not death proof.
  const priorBoot = identity.bootId;
  if (staleOwner) identity.bootId = priorBoot === "11111111-1111-4111-8111-111111111111"
    ? "22222222-2222-4222-8222-222222222222" : "11111111-1111-4111-8111-111111111111";
  const now = new Date().toISOString();
  const common = { runId: randomUUID(), owner: { token: "d".repeat(64), identity },
    root: rootBinding(), manifest: binding, createdAt: now };
  const fsIdentity = file => {
    const stats = lstatSync(file, { bigint: true });
    return { dev: String(stats.dev), ino: String(stats.ino) };
  };
  const payload = { ...common, kind: "pi-host-compatibility-canary-recovery-journal",
    revision: 0, updatedAt: now, profile: "current", phase: "pre-alignment",
    scenarioId: manifest.scenarios[0].id, child: null,
    host: { packageName: HOST_PACKAGES[0], companionPackages: HOST_PACKAGES.slice(1), version: TARGET_VERSION },
    targets: fixture.targets.map((target, index) => {
      const lock = JSON.parse(readFileSync(path.join(target.packageDir, "package-lock.json"), "utf8"));
      return { index, declaredPath: target.packagePath, canonicalPackagePath: target.packagePath,
        packageIdentity: fsIdentity(target.packageDir), metadata: packageMetadataBinding(target.packageDir),
        initialNodeModules: { kind: target.kind === "present" ? "directory" : "absent",
          identity: target.initialNodeModulesIdentity },
        restoreSnapshot: HOST_PACKAGES.map(packageName => ({ packageName,
          installedVersion: lock.packages[`node_modules/${packageName}`]?.version ?? null })),
        state: "baselined", artifactToken: "e".repeat(64), stageIdentity: null,
        ownedNodeModulesIdentity: null, quarantineIdentity: null };
    }) };
  const lock = { ...common, kind: "pi-host-compatibility-canary-mutation-lock", state: "journal-ready" };
  const file = path.join(paths.journalsDir, `${payload.runId}.json`);
  for (const [destination, record] of [[fixture.lockPath, lock], [file, payload]]) {
    validateStatePayload(record, record.kind);
    writeFileSync(destination, encodeStateRecord(record), { flag: "wx", mode: 0o600 });
  }
  assert.deepEqual(readCheckoutState(paths, binding).journal.payload, payload);
  for (const [index, target] of fixture.targets.entries()) {
    const journalTarget = payload.targets[index];
    journalTarget.state = "alignment-exposed";
    if (target.kind === "present") {
      // Inject alignment-like bytes in a NEW tree without executing alignment.
      writeInstalledVersions(target.packageDir, TARGET_VERSION);
    } else {
      const artifact = absentArtifact === "node_modules" ? "node_modules"
        : `.node_modules.pi-host-compat-${payload.runId}-${index}.quarantine`;
      const artifactPath = path.join(target.packageDir, artifact);
      mkdirSync(artifactPath);
      writeFileSync(path.join(artifactPath, "injected-sentinel.txt"), "synthetic child-free artifact\n");
      journalTarget.ownedNodeModulesIdentity = fsIdentity(artifactPath);
      if (absentArtifact === "quarantine") journalTarget.quarantineIdentity = fsIdentity(artifactPath);
      journalTarget.state = absentArtifact === "quarantine" ? "quarantined" : "owned-node-modules";
    }
  }
  payload.phase = "alignment-exposed";
  payload.revision += 1;
  validateStatePayload(payload, payload.kind);
  replaceRecord(file, record => Object.assign(record, payload));
  const state = readCheckoutState(paths, binding);
  assert.deepEqual(state.journal.payload, payload);
  assert.equal(state.journal.payload.child, null);
  assert.equal("childClearanceAttempts" in state.journal.payload, false);
  assert.equal(readFileSync(fixture.npmLog, "utf8"), "");
}

async function waitFor(predicate, message, timeoutMs = 5000) {
  const deadline = Date.now() + timeoutMs;
  while (!predicate() && Date.now() < deadline) await new Promise((resolve) => setTimeout(resolve, 20));
  assert.equal(predicate(), true, message);
}

test("effective-UID fence rejects a foreign-owned deletion candidate", () => {
  assert.throws(
    () => assertEffectiveOwner({ uid: BigInt(process.geteuid() + 1) }, "test deletion candidate"),
    /wrong effective-user owner/,
  );
});

for (const boundary of ["pre-alignment", "stage-mkdir", "stage-identity", "stage-marker"]) {
  test(`automatic recovery restores an initially absent tree after SIGKILL at ${boundary}`, (t) => {
    const fixture = createFixture(t, [{ kind: "absent" }], { id: `absent-${boundary}` });
    const killed = cli(
      fixture,
      ["run", "--json"],
      { PI_HOST_COMPAT_TEST_SIGKILL_AT: boundary },
    );
    assertKilled(killed);
    const before = jsonSuccess(cli(fixture, ["status", "--json"]));
    assert.equal(before.status, "recovery-required");
    const recovered = jsonSuccess(cli(fixture, ["recover", "--json"]));
    assert.equal(recovered.recoveryMode, "automatic-safe");
    assertNoRunnerArtifacts(fixture.targets[0]);
    assert.equal(jsonSuccess(cli(fixture, ["status", "--json"])).status, "clean");
  });
}

for (const boundary of ["post-alignment", "post-quarantine"]) {
  test(`crash-runtime: child history refuses automatic AND explicit recovery after ${boundary}`, (t) => {
    const fixture = createFixture(t, [{ kind: "absent" }], { id: `history-${boundary}` });
    assertKilled(cli(fixture, ["run", "--json"], { PI_HOST_COMPAT_TEST_SIGKILL_AT: boundary }));
    const status = jsonSuccess(cli(fixture, ["status", "--json"]));
    assert.equal(status.status, "recovery-required");
    assert.equal(status.ownerReconciliationRequired, true);
    const payload = assertChildRecoveryRefused(fixture);
    assert.equal(payload.child, null, "historical clearance alone must block recovery");
    assert.ok(payload.childClearanceAttempts.length > 0);
    const target = payload.targets[0];
    const artifact = boundary === "post-quarantine"
      ? `.node_modules.pi-host-compat-${payload.runId}-0.quarantine` : "node_modules";
    const stats = lstatSync(path.join(fixture.targets[0].packageDir, artifact), { bigint: true });
    assert.deepEqual({ dev: String(stats.dev), ino: String(stats.ino) },
      target.quarantineIdentity ?? target.ownedNodeModulesIdentity);
  });
}

for (const absentArtifact of ["node_modules", "quarantine"]) {
  test(`injected-journal: child-free automatic recovery removes owned ${absentArtifact}`, (t) => {
    const fixture = createFixture(t, [{ kind: "absent" }], { id: `injected-${absentArtifact}` });
    injectChildFreeInterruption(fixture, { absentArtifact });
    const before = jsonSuccess(cli(fixture, ["status", "--json"]));
    assert.equal(before.ownerLiveness, "dead"); // injected prior boot, not a killed runner
    assert.equal(before.ownerReconciliationRequired, false);
    const recovered = jsonSuccess(cli(fixture, ["recover", "--json"]));
    assert.equal(recovered.recoveryMode, "automatic-safe");
    assertNoRunnerArtifacts(fixture.targets[0]);
    assert.equal(readFileSync(fixture.npmLog, "utf8"), "");
    assert.equal(jsonSuccess(cli(fixture, ["status", "--json"])).status, "clean");
  });
}

test("recovery preserves a nonempty unmarked stage after SIGKILL immediately after mkdir", (t) => {
  const fixture = createFixture(t, [{ kind: "absent" }], { id: "unmarked-stage-foreign-content" });
  assertKilled(cli(fixture, ["run", "--json"], { PI_HOST_COMPAT_TEST_SIGKILL_AT: "stage-mkdir" }));
  const stageName = readdirSync(fixture.targets[0].packageDir).find((name) => name.endsWith(".stage"));
  assert.ok(stageName);
  const sentinel = path.join(fixture.targets[0].packageDir, stageName, "unknown.txt");
  writeFileSync(sentinel, "preserve\n");
  const recovery = cli(fixture, ["recover", "--json"]);
  assert.notEqual(recovery.status, 0);
  assert.match(recovery.stderr, /unmarked runner stage is not safely empty/);
  assert.equal(readFileSync(sentinel, "utf8"), "preserve\n");
});

test("crash-runtime: npm child evidence refuses recovery even after the child exits", (t) => {
  const fixture = createFixture(t, [{ kind: "absent" }], { id: "absent-during-npm" });
  const marker = path.join(fixture.tempDir, "npm-killed.marker");
  const killed = cli(fixture, ["run", "--json"], {
    FAKE_NPM_KILL_RUNNER: "1",
    FAKE_NPM_KILL_MARKER: marker,
  });
  assertKilled(killed);
  assert.equal(readFileSync(marker, "utf8"), "killed\n");
  assert.equal(jsonSuccess(cli(fixture, ["status", "--json"])).childLiveness, "dead");
  const payload = assertChildRecoveryRefused(fixture);
  assert.equal(payload.child.effect, "align-host");
  assert.equal(existsSync(path.join(fixture.targets[0].packageDir, "node_modules")), true);
});

test("crash-runtime: orphan child evidence refuses recovery both before and after exit", async (t) => {
  const fixture = createFixture(t, [{ kind: "absent" }], { id: "live-orphan" });
  const marker = path.join(fixture.tempDir, "orphan.marker");
  const runner = spawn(
    process.execPath,
    [SCRIPT, "run", "--json", "--manifest", fixture.manifestPath],
    {
      cwd: ROOT,
      env: fixture.env({
        FAKE_NPM_KILL_RUNNER: "1",
        FAKE_NPM_KILL_MARKER: marker,
        FAKE_NPM_DELAY_MS: "1200",
      }),
      stdio: "ignore",
    },
  );
  const exit = await new Promise((resolve) => runner.once("exit", (code, signal) => resolve({ code, signal })));
  assert.deepEqual(exit, { code: null, signal: "SIGKILL" });
  assert.equal(readFileSync(marker, "utf8"), "killed\n");
  assert.equal(jsonSuccess(cli(fixture, ["status", "--json"])).childLiveness, "active");
  const early = assertChildRecoveryRefused(fixture);
  await new Promise((resolve) => setTimeout(resolve, 1300));
  assert.equal(jsonSuccess(cli(fixture, ["status", "--json"])).childLiveness, "dead");
  assert.deepEqual(assertChildRecoveryRefused(fixture), early);
  assert.equal(existsSync(path.join(fixture.targets[0].packageDir, "node_modules")), true);
});

test("cross-target npm mutation is never accepted as an untouched baseline after SIGKILL", (t) => {
  const fixture = createFixture(
    t,
    [{ kind: "absent" }, { kind: "present" }],
    { id: "cross-target-exposure" },
  );
  const marker = path.join(fixture.tempDir, "cross-target.marker");
  const victimPackageJson = installedPackagePath(
    fixture.targets[1].packageDir,
    HOST_PACKAGES[0],
  );
  assertKilled(cli(fixture, ["run", "--json"], {
    FAKE_NPM_CROSS_TARGET_PACKAGE_JSON: victimPackageJson,
    FAKE_NPM_KILL_RUNNER: "1",
    FAKE_NPM_KILL_MARKER: marker,
  }));
  assert.equal(JSON.parse(readFileSync(victimPackageJson)).version, "0.0.0");
  assertChildRecoveryRefused(fixture);
  assert.equal(existsSync(path.join(fixture.targets[0].packageDir, "node_modules")), true);
  assert.equal(JSON.parse(readFileSync(victimPackageJson)).version, "0.0.0");
});

test("crash-runtime: wrapper-only death retains a completion hold and child evidence without restoration", async (t) => {
  const fixture = createFixture(t, [{ kind: "absent" }], { id: "wrapper-death" });
  const runner = spawn(
    process.execPath,
    [SCRIPT, "run", "--json", "--manifest", fixture.manifestPath],
    {
      cwd: ROOT,
      env: fixture.env({ FAKE_NPM_DELAY_MS: "5000" }),
      stdio: ["ignore", "pipe", "pipe"],
    },
  );
  let stdout = "";
  let stderr = "";
  runner.stdout.setEncoding("utf8").on("data", (chunk) => { stdout += chunk; });
  runner.stderr.setEncoding("utf8").on("data", (chunk) => { stderr += chunk; });
  const deadline = Date.now() + 5000;
  while (readFileSync(fixture.npmLog, "utf8").trim() === "" && Date.now() < deadline) {
    await new Promise((resolve) => setTimeout(resolve, 20));
  }
  const journal = JSON.parse(readFileSync(journalPath(fixture), "utf8"));
  const wrapperPid = journal.payload.child.identity.pid;
  process.kill(wrapperPid, "SIGKILL");
  const exit = await new Promise((resolve) => runner.once("close", (code, signal) => resolve({ code, signal })));
  assert.deepEqual(exit, { code: 1, signal: null }, stderr);
  const result = JSON.parse(stdout);
  assert.equal(result.summary.failed, 1);
  assert.equal(result.aborted, true);
  assert.equal(result.abortReason, "integrity-failed");
  const file = journalPath(fixture);
  const heldBytes = readFileSync(file);
  const held = JSON.parse(heldBytes).payload;
  assert.deepEqual(held.child, journal.payload.child);
  assert.equal(held.completionHold.reason, "command-completion-unverified");
  assert.equal(held.completionHold.effectMayBeActive, true);
  assert.equal(existsSync(path.join(fixture.targets[0].packageDir, "node_modules")), true);
  assert.equal(existsSync(CHECKOUT_LOCK), true);
  for (const args of [["recover", "--json"], ["recover", "--apply", "--json"]]) {
    const recovery = cli(fixture, args);
    assert.notEqual(recovery.status, 0);
    assert.match(recovery.stderr, /completion hold requires manual review; recovery takeover, child clearance and restoration refused/);
    assert.deepEqual(readFileSync(file), heldBytes);
  }
});

test("crash-runtime: pre-existing tree child history refuses even explicit apply", (t) => {
  const fixture = createFixture(t, [{ kind: "present" }], { id: "present-explicit" });
  const target = fixture.targets[0];
  const killed = cli(
    fixture,
    ["run", "--json"],
    { PI_HOST_COMPAT_TEST_SIGKILL_AT: "post-alignment" },
  );
  assertKilled(killed);
  assertInstalledVersions(target.packageDir, TARGET_VERSION);
  const currentIdentity = lstatSync(path.join(target.packageDir, "node_modules"), { bigint: true });
  assert.deepEqual(
    { dev: String(currentIdentity.dev), ino: String(currentIdentity.ino) },
    target.initialNodeModulesIdentity,
  );
  assertChildRecoveryRefused(fixture);
  assertInstalledVersions(target.packageDir, TARGET_VERSION);
  assert.equal(readFileSync(path.join(target.packageDir, "node_modules", "sentinel.txt"), "utf8"), "sentinel-0\n");
});

test("injected-journal: child-free pre-existing tree requires explicit bounded apply", (t) => {
  const fixture = createFixture(t, [{ kind: "present" }], { id: "injected-present-explicit" });
  const target = fixture.targets[0];
  injectChildFreeInterruption(fixture);
  const automatic = cli(fixture, ["recover", "--json"]);
  assert.notEqual(automatic.status, 0);
  assert.match(automatic.stderr, /requires explicit recovery/);
  assert.equal(readFileSync(fixture.npmLog, "utf8"), "");
  assertInstalledVersions(target.packageDir, TARGET_VERSION);
  const applied = jsonSuccess(cli(fixture, ["recover", "--apply", "--json"]));
  assert.equal(applied.recoveryMode, "explicit-apply");
  assertInstalledVersions(target.packageDir, LOCKED_VERSION);
  assert.equal(readFileSync(path.join(target.packageDir, "node_modules", "sentinel.txt"), "utf8"), "sentinel-0\n");
  assertNoRunnerArtifacts(target);
  const restoredIdentity = lstatSync(path.join(target.packageDir, "node_modules"), { bigint: true });
  assert.deepEqual({ dev: String(restoredIdentity.dev), ino: String(restoredIdentity.ino) }, target.initialNodeModulesIdentity);
  assert.equal(jsonSuccess(cli(fixture, ["status", "--json"])).status, "clean");
});

test("crash-runtime: multi-target child history refuses cleanup and explicit apply", (t) => {
  const command = [
    process.execPath,
    "-e",
    'process.kill(Number(process.env.PI_HOST_COMPAT_RUNNER_PID), "SIGKILL")',
  ];
  const fixture = createFixture(
    t,
    [{ kind: "absent" }, { kind: "present" }],
    { id: "multi-target", command },
  );
  assertKilled(cli(fixture, ["run", "--json"]));
  assertChildRecoveryRefused(fixture);
  assert.equal(existsSync(path.join(fixture.targets[0].packageDir, "node_modules")), true);
  assertInstalledVersions(fixture.targets[1].packageDir, TARGET_VERSION);
});

test("injected-journal: child-free multi-target recovery cleans absent state before explicit present-tree apply", (t) => {
  const fixture = createFixture(t, [{ kind: "absent" }, { kind: "present" }], { id: "injected-multi-target" });
  injectChildFreeInterruption(fixture);
  const automatic = cli(fixture, ["recover", "--json"]);
  assert.notEqual(automatic.status, 0);
  assert.match(automatic.stderr, /requires explicit recovery/);
  assertNoRunnerArtifacts(fixture.targets[0]);
  assertInstalledVersions(fixture.targets[1].packageDir, TARGET_VERSION);
  jsonSuccess(cli(fixture, ["recover", "--apply", "--json"]));
  assertNoRunnerArtifacts(fixture.targets[0]);
  assertInstalledVersions(fixture.targets[1].packageDir, LOCKED_VERSION);
  assertNoRunnerArtifacts(fixture.targets[1]);
  assert.equal(jsonSuccess(cli(fixture, ["status", "--json"])).status, "clean");
});

test("crash-runtime: exclusive checkout lock rejects a concurrent run from another state home", async (t) => {
  const fixture = createFixture(t, [{ kind: "absent" }], { id: "concurrent-run" });
  const first = spawn(process.execPath, [SCRIPT, "run", "--json", "--manifest", fixture.manifestPath], {
    cwd: ROOT,
    env: fixture.env({ FAKE_NPM_DELAY_MS: "1200" }),
    stdio: ["ignore", "pipe", "pipe"],
  });
  let stdout = "";
  let stderr = "";
  first.stdout.setEncoding("utf8").on("data", (chunk) => { stdout += chunk; });
  first.stderr.setEncoding("utf8").on("data", (chunk) => { stderr += chunk; });
  const deadline = Date.now() + 5000;
  while (readFileSync(fixture.npmLog, "utf8").trim() === "" && Date.now() < deadline) {
    await new Promise((resolve) => setTimeout(resolve, 20));
  }
  assert.notEqual(readFileSync(fixture.npmLog, "utf8").trim(), "");
  const status = jsonSuccess(cli(fixture, ["status", "--json"]));
  assert.equal(status.status, "active");
  const otherStateHome = path.join(SUITE_STATE_ROOT, "concurrent-other-state");
  mkdirSync(otherStateHome, { recursive: true, mode: 0o700 });
  const second = cli(fixture, ["run", "--json"], { XDG_STATE_HOME: otherStateHome });
  assert.notEqual(second.status, 0);
  assert.match(second.stderr, /a canary mutation lock is active/);
  const exit = await new Promise((resolve) => first.once("close", (code, signal) => resolve({ code, signal })));
  assert.deepEqual(exit, { code: 0, signal: null }, stderr);
  assert.equal(JSON.parse(stdout).summary.passed, 1);
  assertNoRunnerArtifacts(fixture.targets[0]);
});

test("injected-journal: child-free active strong owner still rejects a concurrent run", (t) => {
  const fixture = createFixture(t, [{ kind: "present" }], { id: "injected-active-owner" });
  injectChildFreeInterruption(fixture, { staleOwner: false });
  const status = jsonSuccess(cli(fixture, ["status", "--json"]));
  assert.equal(status.ownerLiveness, "active"); // current test process, no synthetic death
  assert.equal(status.ownerReconciliationRequired, false);
  const file = journalPath(fixture);
  const before = readFileSync(file);
  const lock = readFileSync(fixture.lockPath);
  const result = cli(fixture, ["run", "--json"]);
  assert.notEqual(result.status, 0);
  assert.match(result.stderr, /a canary mutation owner is still active/);
  assert.deepEqual(readFileSync(file), before);
  assert.deepEqual(readFileSync(fixture.lockPath), lock);
  assert.equal(readFileSync(fixture.npmLog, "utf8"), "");
  assertInstalledVersions(fixture.targets[0].packageDir, TARGET_VERSION);
});

test("malformed, oversized, symlinked, and multiple journal states fail closed", (t) => {
  const corruptions = [
    ["malformed", (file) => writeFileSync(file, "{")],
    ["oversized", (file) => writeFileSync(file, "x".repeat(300 * 1024))],
    ["symlinked", (file) => {
      const backup = `${file}.backup`;
      renameSync(file, backup);
      symlinkSync(backup, file);
    }],
    ["multiple", (file) => copyFileSync(file, path.join(path.dirname(file), `${randomUUID()}.json`))],
    ["open-mode", (file) => chmodSync(file, 0o644)],
    ["unknown-field", (file) => rewriteRecord(file, (payload) => { payload.unexpected = true; })],
  ];
  for (const [name, corrupt] of corruptions) {
    const fixture = createFixture(t, [{ kind: "absent" }], { id: `corrupt-${name}` });
    assertKilled(cli(fixture, ["run", "--json"], { PI_HOST_COMPAT_TEST_SIGKILL_AT: "pre-alignment" }));
    corrupt(journalPath(fixture));
    const result = cli(fixture, ["status", "--json"]);
    assert.notEqual(result.status, 0, name);
    assert.match(result.stderr, /recovery|journal|state|multiple|owner-only|size|malformed/i, name);
    assert.equal(existsSync(path.join(fixture.targets[0].packageDir, "node_modules")), false);
    fixture.cleanup();
  }
});

test("identity-drifted target and unknown stale-owner identity fail without deleting replacements", (t) => {
  const drift = createFixture(t, [{ kind: "absent" }], { id: "identity-drift" });
  // Pre-effect crash: keep identity-drift coverage reachable without child-history refusal.
  assertKilled(cli(drift, ["run", "--json"], { PI_HOST_COMPAT_TEST_SIGKILL_AT: "pre-alignment" }));
  const original = `${drift.targets[0].packageDir}.original`;
  renameSync(drift.targets[0].packageDir, original);
  mkdirSync(drift.targets[0].packageDir);
  writeFileSync(path.join(drift.targets[0].packageDir, "package.json"), JSON.stringify({ name: "replacement", version: "1.0.0" }));
  writeFileSync(path.join(drift.targets[0].packageDir, "package-lock.json"), readFileSync(path.join(original, "package-lock.json")));
  mkdirSync(path.join(drift.targets[0].packageDir, "node_modules"));
  writeFileSync(path.join(drift.targets[0].packageDir, "node_modules", "replacement.txt"), "survive\n");
  const driftResult = cli(drift, ["recover", "--json"]);
  assert.notEqual(driftResult.status, 0);
  assert.match(driftResult.stderr, /identity|metadata drifted/);
  assert.equal(readFileSync(path.join(drift.targets[0].packageDir, "node_modules", "replacement.txt"), "utf8"), "survive\n");
  drift.cleanup();

  const owner = createFixture(t, [{ kind: "absent" }], { id: "unknown-owner" });
  assertKilled(cli(owner, ["run", "--json"], { PI_HOST_COMPAT_TEST_SIGKILL_AT: "pre-alignment" }));
  rewriteRecord(owner.lockPath, (payload) => {
    payload.owner.identity.platform = "unsupported-test-platform";
  });
  const ownerResult = cli(owner, ["recover", "--json"]);
  assert.notEqual(ownerResult.status, 0);
  assert.match(ownerResult.stderr, /cannot be proven stale|owner identities differ|state schema/);
  assert.equal(existsSync(path.join(owner.targets[0].packageDir, "node_modules")), false);
});

test("active mutation never overwrites changed checkout-lock or journal ownership", async (t) => {
  for (const role of ["lock", "journal"]) {
    const fixture = createFixture(t, [{ kind: "absent" }], { id: `owner-fence-${role}` });
    const runner = spawn(process.execPath, [SCRIPT, "run", "--json", "--manifest", fixture.manifestPath], {
      cwd: ROOT,
      env: fixture.env({ FAKE_NPM_DELAY_MS: "700" }),
      stdio: "ignore",
    });
    const closed = new Promise((resolve) => runner.once("close", (code, signal) => resolve({ code, signal })));
    await waitFor(() => readFileSync(fixture.npmLog, "utf8").trim() !== "", "npm effect did not start");
    const recordPath = role === "lock" ? fixture.lockPath : journalPath(fixture);
    const foreignToken = (role === "lock" ? "a" : "b").repeat(64);
    const mutateRecord = role === "lock" ? replaceRecord : rewriteRecord;
    mutateRecord(recordPath, (payload) => { payload.owner.token = foreignToken; });
    assert.deepEqual(await closed, { code: 1, signal: null });
    assert.equal(JSON.parse(readFileSync(recordPath, "utf8")).payload.owner.token, foreignToken);
    assert.equal(existsSync(fixture.lockPath), true, "changed owner state must remain for review");
    fixture.cleanup();
  }
});

test("injected-journal: child-free explicit recovery re-resolves the canonical package root before every npm command", async (t) => {
  const fixture = createFixture(t, [{ kind: "present" }], { id: "explicit-root-reresolve" });
  const target = fixture.targets[0];
  const packageLockPath = path.join(target.packageDir, "package-lock.json");
  const packageLock = JSON.parse(readFileSync(packageLockPath, "utf8"));
  delete packageLock.packages[`node_modules/${HOST_PACKAGES[2]}`];
  writeFileSync(packageLockPath, JSON.stringify(packageLock));
  injectChildFreeInterruption(fixture);
  const automatic = cli(fixture, ["recover", "--json"]);
  assert.notEqual(automatic.status, 0);
  assert.match(automatic.stderr, /requires explicit recovery/);
  assert.equal(readFileSync(fixture.npmLog, "utf8"), "");
  const recovery = spawn(process.execPath, [SCRIPT, "recover", "--apply", "--json", "--manifest", fixture.manifestPath], {
    cwd: ROOT,
    env: fixture.env({ FAKE_NPM_DELAY_MS: "700" }),
    stdio: "ignore",
  });
  const closed = new Promise((resolve) => recovery.once("close", (code, signal) => resolve({ code, signal })));
  await waitFor(() => readFileSync(fixture.npmLog, "utf8").trim() !== "", "explicit npm restore did not start");
  const packageJson = readFileSync(path.join(target.packageDir, "package.json"));
  const lockJson = readFileSync(packageLockPath);
  const original = `${target.packageDir}.original`;
  renameSync(target.packageDir, original);
  mkdirSync(target.packageDir);
  writeFileSync(path.join(target.packageDir, "package.json"), packageJson);
  writeFileSync(path.join(target.packageDir, "package-lock.json"), lockJson);
  mkdirSync(path.join(target.packageDir, "node_modules"));
  const sentinel = path.join(target.packageDir, "node_modules", "replacement.txt");
  writeFileSync(sentinel, "preserve\n");
  assert.deepEqual(await closed, { code: 1, signal: null });
  const calls = readFileSync(fixture.npmLog, "utf8").trim().split("\n").map((line) => JSON.parse(line));
  assert.deepEqual(calls.map((call) => call.operation), ["install"]);
  assert.equal(readFileSync(sentinel, "utf8"), "preserve\n");
  assert.equal(existsSync(fixture.lockPath), true, "failed recovery state must remain reviewable");
});

test("injected-journal: child-free explicit recovery preserves state when its checkout recovery ownership changes", async (t) => {
  const fixture = createFixture(t, [{ kind: "present" }], { id: "recovery-owner-fence" });
  injectChildFreeInterruption(fixture);
  const automatic = cli(fixture, ["recover", "--json"]);
  assert.notEqual(automatic.status, 0);
  assert.match(automatic.stderr, /requires explicit recovery/);
  assert.equal(readFileSync(fixture.npmLog, "utf8"), "");
  const recovery = spawn(process.execPath, [SCRIPT, "recover", "--apply", "--json", "--manifest", fixture.manifestPath], {
    cwd: ROOT,
    env: fixture.env({ FAKE_NPM_DELAY_MS: "700" }),
    stdio: "ignore",
  });
  const closed = new Promise((resolve) => recovery.once("close", (code, signal) => resolve({ code, signal })));
  await waitFor(() => readFileSync(fixture.npmLog, "utf8").trim() !== "", "explicit recovery effect did not start");
  const foreignToken = "c".repeat(64);
  replaceRecord(CHECKOUT_RECOVERY_LOCK, (payload) => { payload.owner.token = foreignToken; });
  assert.deepEqual(await closed, { code: 1, signal: null });
  assert.equal(JSON.parse(readFileSync(CHECKOUT_RECOVERY_LOCK, "utf8")).payload.owner.token, foreignToken);
  const journal = JSON.parse(readFileSync(journalPath(fixture), "utf8"));
  assert.equal(journal.payload.child.effect, "explicit-restore-host");
  assert.equal(existsSync(fixture.lockPath), true);
});

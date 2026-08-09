// ---
// summary: "Exercises durable canary recovery with real SIGKILL, stale-owner, and concurrency boundaries."
// read_when:
//   - "Changing the Pi host canary recovery journal, lock, state machine, or explicit recovery CLI."
// ---
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

for (const boundary of ["pre-alignment", "stage-marker", "post-alignment", "post-quarantine"]) {
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

test("automatic recovery waits for and restores a runner-owned tree after SIGKILL during npm", (t) => {
  const fixture = createFixture(t, [{ kind: "absent" }], { id: "absent-during-npm" });
  const marker = path.join(fixture.tempDir, "npm-killed.marker");
  const killed = cli(fixture, ["run", "--json"], {
    FAKE_NPM_KILL_RUNNER: "1",
    FAKE_NPM_KILL_MARKER: marker,
  });
  assertKilled(killed);
  assert.equal(readFileSync(marker, "utf8"), "killed\n");
  const recovered = jsonSuccess(cli(fixture, ["recover", "--json"]));
  assert.equal(recovered.recoveryMode, "automatic-safe");
  assertNoRunnerArtifacts(fixture.targets[0]);
});

test("recovery refuses an orphaned npm process until its journaled strong identity exits", async (t) => {
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
  const early = cli(fixture, ["recover", "--json"]);
  assert.notEqual(early.status, 0);
  assert.match(early.stderr, /child process is still active/);
  await new Promise((resolve) => setTimeout(resolve, 1300));
  jsonSuccess(cli(fixture, ["recover", "--json"]));
  assertNoRunnerArtifacts(fixture.targets[0]);
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
  const automatic = cli(fixture, ["recover", "--json"]);
  assert.notEqual(automatic.status, 0);
  assert.match(automatic.stderr, /requires explicit recovery/);
  assertNoRunnerArtifacts(fixture.targets[0]);
  jsonSuccess(cli(fixture, ["recover", "--apply", "--json"]));
  assertInstalledVersions(fixture.targets[1].packageDir, LOCKED_VERSION);
});

test("wrapper-only death terminates its process group before restoration", async (t) => {
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
  assert.equal(JSON.parse(stdout).summary.failed, 1);
  assertNoRunnerArtifacts(fixture.targets[0]);
  assert.equal(existsSync(CHECKOUT_LOCK), false);
});

test("pre-existing tree recovery fails closed until explicit bounded apply", (t) => {
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
  const automatic = cli(fixture, ["recover", "--json"]);
  assert.notEqual(automatic.status, 0);
  assert.match(automatic.stderr, /requires explicit recovery/);
  assertInstalledVersions(target.packageDir, TARGET_VERSION);
  const applied = jsonSuccess(cli(fixture, ["recover", "--apply", "--json"]));
  assert.equal(applied.recoveryMode, "explicit-apply");
  assertInstalledVersions(target.packageDir, LOCKED_VERSION);
  assert.equal(readFileSync(path.join(target.packageDir, "node_modules", "sentinel.txt"), "utf8"), "sentinel-0\n");
  assertNoRunnerArtifacts(target);
});

test("multi-target recovery safely cleans absent state before explicit present-tree apply", (t) => {
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
  const automatic = cli(fixture, ["recover", "--json"]);
  assert.notEqual(automatic.status, 0);
  assert.match(automatic.stderr, /requires explicit recovery/);
  assertNoRunnerArtifacts(fixture.targets[0]);
  assertInstalledVersions(fixture.targets[1].packageDir, TARGET_VERSION);
  jsonSuccess(cli(fixture, ["recover", "--apply", "--json"]));
  assertNoRunnerArtifacts(fixture.targets[0]);
  assertInstalledVersions(fixture.targets[1].packageDir, LOCKED_VERSION);
  assertNoRunnerArtifacts(fixture.targets[1]);
});

test("exclusive checkout lock rejects a concurrent mutation run with live strong identity", async (t) => {
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
  assert.match(second.stderr, /active|concurrent/);
  const exit = await new Promise((resolve) => first.once("close", (code, signal) => resolve({ code, signal })));
  assert.deepEqual(exit, { code: 0, signal: null }, stderr);
  assert.equal(JSON.parse(stdout).summary.passed, 1);
  assertNoRunnerArtifacts(fixture.targets[0]);
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
  assertKilled(cli(drift, ["run", "--json"], { PI_HOST_COMPAT_TEST_SIGKILL_AT: "post-alignment" }));
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

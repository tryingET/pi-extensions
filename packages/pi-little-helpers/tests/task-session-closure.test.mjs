// AK7845: the policy that decides whether a task-session closure may be installed. The real install
// runs in tests/live/task-session-install.reality.live.mjs; this covers each refusal without npm.
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { mkdtempSync, readdirSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";
import {
  assertLayerOneLock,
  assertOverridesCurrent,
  LOCK_DIR,
  nodeRefusal,
  ownClosure,
  readLock,
  SDK_PACKAGES,
  SDK_VERSION,
  verifyInstalled,
} from "../task-session-runtime/closure.mjs";

const packageRoot = dirname(dirname(fileURLToPath(import.meta.url)));
const REGISTRY = "https://registry.npmjs.org";
const integrity = (seed) => `sha512-${seed}`;
const third = (name, version) => ({
  version,
  resolved: `${REGISTRY}/${name}/-/${name.split("/").at(-1)}-${version}.tgz`,
  integrity: integrity(`${name}${version}`),
});
function lockFixture() {
  const packages = {
    "": { dependencies: Object.fromEntries(SDK_PACKAGES.map((name) => [name, SDK_VERSION])) },
    "node_modules/left-pad": third("left-pad", "1.0.0"),
  };
  for (const name of SDK_PACKAGES) packages[`node_modules/${name}`] = third(name, SDK_VERSION);
  return { lockfileVersion: 3, packages };
}
const own = (name) => ({ name, version: "1.0.0", integrity: integrity(name) });
const ownEntry = (name) => ({
  version: "1.0.0",
  resolved: `file:${name}.tgz`,
  integrity: integrity(name),
});
function installedFixture(lock, packed) {
  const installed = structuredClone(lock.packages);
  for (const { name } of packed) installed[`node_modules/${name}`] = ownEntry(name);
  return installed;
}

test("Given the committed lock, when it is checked, then it passes as layer one", () => {
  assert.doesNotThrow(() => assertLayerOneLock(readLock()));
});

test("Given the lock, then every SDK package and companion sits at exactly SDK_VERSION", () => {
  const versions = Object.entries(readLock().packages)
    .filter(([path]) => path.split("node_modules/").at(-1).startsWith("@earendil-works/"))
    .map(([, entry]) => entry.version);
  assert.ok(versions.length >= SDK_PACKAGES.length);
  assert.deepEqual([...new Set(versions)], [SDK_VERSION]);
});

test("Given the root manifest, then the lock's root declares the same exact dependencies", () => {
  const manifest = JSON.parse(readFileSync(join(LOCK_DIR, "runtime-package.json"), "utf8"));
  assert.deepEqual(readLock().packages[""].dependencies, manifest.dependencies);
});

test("Given the package's dev pins and the identity hashes, then they name SDK_VERSION", () => {
  // Manifests have a drift check; these literals do not, and the 1.4.0 move nearly left them behind.
  const manifest = JSON.parse(readFileSync(join(packageRoot, "package.json"), "utf8"));
  for (const name of SDK_PACKAGES) assert.equal(manifest.devDependencies[name], SDK_VERSION, name);
  const identity = readFileSync(join(packageRoot, "src/task-session/identity.ts"), "utf8");
  assert.ok(identity.includes(`// Pi ${SDK_VERSION} SDK:`));
});

test("Given Node matching the pin in the process and on PATH, then nothing refuses", () => {
  const same = { pinned: "22.23.4", running: "22.23.4", onPath: "v22.23.4" };
  assert.equal(nodeRefusal(same), undefined);
});

test("Given the installer running on another Node, then it refuses", () => {
  const running = { pinned: "22.23.4", running: "26.13.0", onPath: "v22.23.4" };
  assert.match(nodeRefusal(running), /^install_node_not_pinned/);
});

test("Given another Node on PATH for npm and prepack, then it refuses", () => {
  const onPath = { pinned: "22.23.4", running: "22.23.4", onPath: "v26.13.0" };
  assert.match(nodeRefusal(onPath), /^install_node_mixed/);
});

for (const [label, argv] of [
  ["only --root", ["--root"]],
  ["only --bin-dir", ["--bin-dir"]],
]) {
  test(`Given ${label}, when installing, then it refuses and writes nothing`, (t) => {
    const scratch = mkdtempSync(join(tmpdir(), "task-session-paths-"));
    t.after(() => rmSync(scratch, { recursive: true, force: true }));
    const result = spawnSync(
      process.execPath,
      [join(packageRoot, "scripts/task-session-install.mjs"), ...argv, scratch],
      { encoding: "utf8" },
    );
    assert.notEqual(result.status, 0);
    assert.match(result.stderr, /install_paths_required/);
    assert.deepEqual(readdirSync(scratch), []);
  });
}

test("Given the committed override, then the lock installs it and no exact pin has passed it", () => {
  const manifest = JSON.parse(readFileSync(join(LOCK_DIR, "runtime-package.json"), "utf8"));
  const lock = readLock();
  assert.doesNotThrow(() => assertOverridesCurrent(lock, manifest));
  for (const [name, version] of Object.entries(manifest.overrides))
    assert.equal(lock.packages[`node_modules/${name}`].version, version, name);
});

test("Given an SDK pin that moved past an override, when checked, then it refuses", () => {
  const lock = lockFixture();
  lock.packages["node_modules/@earendil-works/pi-ai"].dependencies = { undici: "8.12.3" };
  assert.throws(
    () => assertOverridesCurrent(lock, { overrides: { undici: "8.12.2" } }),
    /lock_override_stale/,
  );
});

for (const [label, pin] of [
  ["an equal pin", "8.12.2"],
  ["an older pin", "8.10.2"],
  ["a range, which only exact pins can trip", "^9.0.0"],
]) {
  test(`Given ${label}, when an override is checked, then it passes`, () => {
    const lock = lockFixture();
    lock.packages["node_modules/@earendil-works/pi-ai"].dependencies = { undici: pin };
    lock.packages["node_modules/undici"] = third("undici", "8.12.2");
    assert.doesNotThrow(() => assertOverridesCurrent(lock, { overrides: { undici: "8.12.2" } }));
  });
}

test("Given a companion that drifted from the SDK, when the lock is checked, then it refuses", () => {
  const lock = lockFixture();
  lock.packages["node_modules/@earendil-works/pi-mcp"] = third("@earendil-works/pi-mcp", "1.2.0");
  assert.throws(() => assertLayerOneLock(lock), /lock_companion_drift/);
});

test("Given a nested companion that drifted, when the lock is checked, then it refuses", () => {
  const lock = lockFixture();
  lock.packages["node_modules/x/node_modules/@earendil-works/pi-ai"] = third(
    "@earendil-works/pi-ai",
    "1.1.0",
  );
  assert.throws(() => assertLayerOneLock(lock), /lock_companion_drift/);
});

test("Given an SDK pin that floats, when the lock is checked, then it refuses", () => {
  const lock = lockFixture();
  lock.packages[""].dependencies["@earendil-works/pi-ai"] = `^${SDK_VERSION}`;
  assert.throws(() => assertLayerOneLock(lock), /lock_sdk_not_exact/);
});

test("Given a @tryinget entry from the registry, when the lock is checked, then it refuses", () => {
  const lock = lockFixture();
  lock.packages["node_modules/@tryinget/pi-telemetry"] = third("pi-telemetry", "0.4.2");
  assert.throws(() => assertLayerOneLock(lock), /lock_own_package_forbidden/);
});

for (const [label, change, code] of [
  ["without integrity", (entry) => delete entry.integrity, /lock_entry_without_integrity/],
  ["from another host", (entry) => (entry.resolved = "https://evil.test/a.tgz"), /not_registry/],
  ["from a local link", (entry) => (entry.link = true), /not_registry/],
]) {
  test(`Given a third-party entry ${label}, when the lock is checked, then it refuses`, () => {
    const lock = lockFixture();
    change(lock.packages["node_modules/left-pad"]);
    assert.throws(() => assertLayerOneLock(lock), code);
  });
}

test("Given a matching install, when it is verified, then the digest is stable and order-free", () => {
  const lock = lockFixture();
  const packed = [own("@tryinget/a")];
  const first = verifyInstalled(installedFixture(lock, packed), lock, packed);
  const reversed = Object.fromEntries(Object.entries(installedFixture(lock, packed)).reverse());
  assert.equal(verifyInstalled(reversed, lock, packed).digest, first.digest);
  assert.match(first.digest, /^[0-9a-f]{64}$/);
});

test("Given only an own tarball changed, when verified, then the closure digest changes", () => {
  const lock = lockFixture();
  const before = [own("@tryinget/a")];
  const after = [{ ...own("@tryinget/a"), integrity: integrity("other") }];
  const changed = installedFixture(lock, after);
  changed["node_modules/@tryinget/a"].integrity = integrity("other");
  assert.notEqual(
    verifyInstalled(changed, lock, after).digest,
    verifyInstalled(installedFixture(lock, before), lock, before).digest,
  );
});

for (const [label, change, code] of [
  [
    "an own package resolved from the registry",
    (i) => (i["node_modules/@tryinget/a"].resolved = `${REGISTRY}/a.tgz`),
    /own_package_from_registry/,
  ],
  [
    "an own package nobody packed",
    (i) => (i["node_modules/@tryinget/b"] = ownEntry("@tryinget/b")),
    /own_package_unpacked/,
  ],
  [
    "an own package with other bytes",
    (i) => (i["node_modules/@tryinget/a"].integrity = integrity("forged")),
    /own_package_mismatch/,
  ],
  ["an own package missing", (i) => delete i["node_modules/@tryinget/a"], /own_package_missing/],
  [
    "a package the lock does not hold",
    (i) => (i["node_modules/extra"] = third("extra", "1.0.0")),
    /closure_entry_unlocked/,
  ],
  [
    "a companion at another version",
    (i) => (i["node_modules/@earendil-works/pi-ai"].version = "1.2.0"),
    /closure_entry_mismatch/,
  ],
  [
    "a package with other bytes",
    (i) => (i["node_modules/left-pad"].integrity = integrity("forged")),
    /closure_entry_mismatch/,
  ],
  ["a locked package missing", (i) => delete i["node_modules/left-pad"], /closure_entry_missing/],
]) {
  test(`Given ${label}, when the install is verified, then it refuses`, () => {
    const lock = lockFixture();
    const packed = [own("@tryinget/a")];
    const installed = installedFixture(lock, packed);
    change(installed);
    assert.throws(() => verifyInstalled(installed, lock, packed), code);
  });
}

test("Given a locked optional package that is absent, when verified, then it is allowed", () => {
  const lock = lockFixture();
  lock.packages["node_modules/fsevents"] = { ...third("fsevents", "2.0.0"), optional: true };
  const packed = [own("@tryinget/a")];
  const installed = installedFixture(lock, packed);
  delete installed["node_modules/fsevents"];
  assert.doesNotThrow(() => verifyInstalled(installed, lock, packed));
});

test("Given the monorepo, when the own closure is walked, then both roots and their chain are in it", () => {
  const names = ownClosure(dirname(packageRoot)).map(({ name }) => name);
  for (const required of [
    "@tryinget/pi-little-helpers",
    "@tryinget/pi-society-orchestrator",
    "@tryinget/pi-session-compaction",
    "@tryinget/pi-interaction-kit",
  ])
    assert.ok(names.includes(required), required);
  assert.deepEqual(
    names,
    [...names].sort((a, b) => a.localeCompare(b)),
  );
  assert.equal(new Set(names).size, names.length);
});

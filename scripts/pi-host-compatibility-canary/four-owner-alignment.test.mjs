// ---
// summary: "Builtin-only four-owner canary metadata and synthetic host-state contract tests."
// read_when:
//   - "Changing the stock SDK owner set or generic owner validation and host-state alignment."
// ---
import assert from "node:assert/strict";
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import test from "node:test";
import {
  buildInstallCommand, buildRestoreCommands, describeHostAlignment,
  resolveRestoreSnapshot, snapshotHostPackages, snapshotTargetHostPackages,
  snapshotsMatch, summarizeAlignment, summarizeSnapshot,
} from "./host-state.mjs";
import { loadManifest, resolveProfileHost, validateManifest } from "./manifest.mjs";
import { DEFAULT_MANIFEST_PATH } from "./paths.mjs";
import { listPayload, resolveHostPayload } from "./payloads.mjs";

const OWNERS = [
  "@earendil-works/pi-coding-agent",
  "@earendil-works/pi-ai",
  "@earendil-works/pi-tui",
  "@earendil-works/pi-agent-core",
];
const AGENT_CORE = OWNERS[3];
const CURRENT = "0.84.4";
const rawStock = () => loadManifest(DEFAULT_MANIFEST_PATH);
const stock = () => validateManifest(rawStock(), DEFAULT_MANIFEST_PATH);
const stockHost = () => resolveProfileHost(stock(), "current");
const snapshot = (versions) => OWNERS.map((packageName, index) => ({
  packageName, installedVersion: versions[index],
}));
const targetSnapshot = () => snapshot(OWNERS.map(() => CURRENT));
const install = (specifiers) => ["npm", "install", "--no-save", "--package-lock=false", ...specifiers];

// These fixtures contain metadata only: no SDK imports, package managers, child
// processes, runner sessions, or recovery mutations. Preserve them for receipts
// with PI_HOST_COMPAT_KEEP_FIXTURES=1; otherwise remove only this test's directory.
function fixture(t, versions = OWNERS.map(() => CURRENT)) {
  const cwd = mkdtempSync(path.join(tmpdir(), "pi-four-owner-"));
  t.diagnostic(`synthetic fixture: ${cwd}`);
  t.after(() => {
    if (process.env.PI_HOST_COMPAT_KEEP_FIXTURES !== "1") rmSync(cwd, { recursive: true, force: true });
  });
  writeFileSync(path.join(cwd, "package.json"), JSON.stringify({ name: "synthetic-four-owner", private: true }));
  for (const [index, name] of OWNERS.entries()) {
    if (versions[index] === null) continue;
    const dir = path.join(cwd, "node_modules", ...name.split("/"));
    mkdirSync(dir, { recursive: true });
    writeFileSync(path.join(dir, "package.json"), JSON.stringify({ name, version: versions[index] }));
  }
  return cwd;
}

function writeLock(cwd, versions) {
  const packages = Object.fromEntries(OWNERS.flatMap((name, index) => versions[index] === null
    ? [] : [[`node_modules/${name}`, { version: versions[index] }]]));
  writeFileSync(path.join(cwd, "package-lock.json"), JSON.stringify({ lockfileVersion: 3, packages }));
}

function genericManifest(companions) {
  const raw = rawStock();
  raw.hostPackage = "@fixture/host";
  if (companions === undefined) delete raw.hostCompanionPackages;
  else raw.hostCompanionPackages = companions;
  // Validation needs a contained directory, not any real scenario execution.
  raw.scenarios = [{
    id: "metadata-only", title: "Metadata only", owner: "fixture", why: "Generic manifests remain generic.",
    profiles: ["current", "upgrade"], packages: [], upstreamSurfaces: ["synthetic metadata"],
    cwd: ".", command: ["never-executed"],
  }];
  return raw;
}

// Validate names as an ordered set, not a hard-coded four-package schema. Do not
// inject/reorder owners in historical manifests: recovery compares that lineage.
for (const companions of [undefined, [], ["@fixture/z", "@fixture/a"]]) {
  test(`generic manifests preserve declared companions: ${JSON.stringify(companions)}`, () => {
    const raw = genericManifest(companions);
    const before = structuredClone(raw);
    const manifest = validateManifest(raw, "synthetic.json");
    assert.deepEqual(raw, before);
    const host = resolveProfileHost(manifest, "current");
    assert.deepEqual(host.companionPackages, companions ?? []);
    assert.deepEqual(buildInstallCommand(host), install([
      `@fixture/host@${CURRENT}`, ...(companions ?? []).map((name) => `${name}@${CURRENT}`),
    ]));
  });
}

test("historical three-owner manifests retain their order and snapshot shape", () => {
  const raw = rawStock();
  raw.hostCompanionPackages = OWNERS.slice(1, 3);
  const host = resolveProfileHost(validateManifest(raw, "historical.json"), "current");
  assert.deepEqual(host.companionPackages, OWNERS.slice(1, 3));
  const expected = targetSnapshot().slice(0, 3);
  assert.deepEqual(snapshotTargetHostPackages(host), expected);
  assert.deepEqual(buildRestoreCommands(expected), [install(OWNERS.slice(0, 3).map((name) => `${name}@${CURRENT}`))]);
});

for (const [label, companions, duplicate] of [
  ["repeated companion", ["@fixture/other", "@fixture/other"], "@fixture/other"],
  ["host repeated as companion", ["@fixture/other", "@fixture/host"], "@fixture/host"],
  ["normalized repeated companion", [" @fixture/other ", "@fixture/other"], "@fixture/other"],
  ["normalized repeated host", [" @fixture/host "], "@fixture/host"],
  ["repeated agent-core", [AGENT_CORE, AGENT_CORE], AGENT_CORE],
]) {
  test(`duplicate owner validation rejects ${label}`, () => {
    assert.throws(() => validateManifest(genericManifest(companions), "synthetic.json"), (error) => {
      assert.equal(error.message, `Duplicate host package owner: ${duplicate}`);
      return true;
    });
  });
}

test("stock metadata declares exactly four independent owners without changing current pin", () => {
  const manifest = stock();
  assert.equal(manifest.schemaVersion, 1);
  assert.equal(manifest.defaultProfile, "current");
  assert.deepEqual([manifest.hostPackage, ...manifest.hostCompanionPackages], OWNERS);
  const host = stockHost();
  assert.equal(host.version, CURRENT);
  assert.equal(host.reviewAnchor, `npm:${OWNERS[0]}@${CURRENT}`);
  assert.equal(host.versionSource, "profile:current");
  for (const payload of [resolveHostPayload(manifest, {}), listPayload(manifest, {})]) {
    assert.deepEqual([payload.hostPackage, ...payload.hostCompanionPackages], OWNERS);
    assert.deepEqual([payload.host.packageName, ...payload.host.companionPackages], OWNERS);
  }
});

test("upgrade metadata and install argv use the same four owners at the explicit candidate", () => {
  const env = { PI_HOST_COMPAT_HOST_VERSION: "0.85.0", PI_HOST_COMPAT_CHANGELOG_REF: "synthetic:candidate" };
  const before = Object.fromEntries(Object.keys(env).map((key) => [key, process.env[key]]));
  try {
    Object.assign(process.env, env);
    const manifest = stock();
    for (const payload of [resolveHostPayload(manifest, { profile: "upgrade" }), listPayload(manifest, { profile: "upgrade" })]) {
      assert.deepEqual([payload.hostPackage, ...payload.hostCompanionPackages], OWNERS);
      assert.equal(payload.host.version, "0.85.0");
      assert.equal(payload.host.reviewAnchor, "synthetic:candidate");
      assert.equal(payload.host.versionSource, "env:PI_HOST_COMPAT_HOST_VERSION");
      assert.deepEqual(buildInstallCommand(payload.host), install(OWNERS.map((name) => `${name}@0.85.0`)));
    }
  } finally {
    for (const [key, value] of Object.entries(before)) {
      if (value === undefined) delete process.env[key];
      else process.env[key] = value;
    }
  }
});

test("stock install argv and target snapshot include all four owners exactly once", () => {
  const host = stockHost();
  assert.deepEqual(buildInstallCommand(host), install(OWNERS.map((name) => `${name}@${CURRENT}`)));
  assert.deepEqual(snapshotTargetHostPackages(host), targetSnapshot());
});

test("synthetic installed snapshot and alignment include all four independently", (t) => {
  const cwd = fixture(t);
  const host = stockHost();
  assert.deepEqual(snapshotHostPackages(cwd, host), targetSnapshot());
  const alignment = describeHostAlignment(host, cwd);
  assert.equal(alignment.aligned, true);
  assert.deepEqual(alignment.packages, OWNERS.map((packageName) => ({
    packageName, expectedVersion: CURRENT, installedVersion: CURRENT, aligned: true,
  })));
  assert.equal(summarizeAlignment(alignment), OWNERS.map((name) => `${name}=${CURRENT}`).join(", "));
});

for (const [label, version] of [["missing", null], ["stale", "0.83.0"]]) {
  test(`${label} independent agent-core fails alignment while the other three match`, (t) => {
    const versions = [CURRENT, CURRENT, CURRENT, version];
    const cwd = fixture(t, versions);
    // A matching nested transitive copy cannot stand in for the independent owner.
    const nested = path.join(cwd, "node_modules", OWNERS[0], "node_modules", AGENT_CORE);
    mkdirSync(nested, { recursive: true });
    writeFileSync(path.join(nested, "package.json"), JSON.stringify({ name: AGENT_CORE, version: CURRENT }));
    const host = stockHost();
    const alignment = describeHostAlignment(host, cwd);
    assert.equal(alignment.aligned, false);
    assert.deepEqual(alignment.packages.filter((entry) => !entry.aligned), [{
      packageName: AGENT_CORE, expectedVersion: CURRENT, installedVersion: version, aligned: false,
    }]);
    const actual = snapshotHostPackages(cwd, host);
    assert.deepEqual(actual, snapshot(versions));
    assert.equal(snapshotsMatch(snapshotTargetHostPackages(host), actual), false);
    assert.ok(summarizeSnapshot(actual).includes(`${AGENT_CORE}=${version ?? "missing"}`));
  });
}

test("no-lock restoration preserves each independently installed owner version", (t) => {
  const versions = ["0.80.0", "0.81.0", "0.82.0", "0.83.0"];
  const cwd = fixture(t, versions);
  const host = stockHost();
  const before = snapshotHostPackages(cwd, host);
  const restored = resolveRestoreSnapshot(cwd, host, before);
  assert.deepEqual(restored, snapshot(versions));
  assert.deepEqual(buildRestoreCommands(restored), [install(OWNERS.map((name, index) => `${name}@${versions[index]}`))]);
});

test("lockfile restoration includes all four owners and takes precedence over installed versions", (t) => {
  const cwd = fixture(t);
  const versions = ["0.80.0", "0.81.0", "0.82.0", "0.83.0"];
  writeLock(cwd, versions);
  const host = stockHost();
  const restored = resolveRestoreSnapshot(cwd, host, snapshotHostPackages(cwd, host));
  assert.deepEqual(restored, snapshot(versions));
  assert.deepEqual(buildRestoreCommands(restored), [install(OWNERS.map((name, index) => `${name}@${versions[index]}`))]);
});

for (const source of ["installed", "lockfile"]) {
  test(`${source} agent-core absence produces an explicit independent uninstall`, (t) => {
    const versions = [CURRENT, CURRENT, CURRENT, null];
    const cwd = fixture(t, source === "installed" ? versions : undefined);
    if (source === "lockfile") writeLock(cwd, versions);
    const host = stockHost();
    const restored = resolveRestoreSnapshot(cwd, host, snapshotHostPackages(cwd, host));
    assert.deepEqual(restored, snapshot(versions));
    assert.deepEqual(buildRestoreCommands(restored), [
      install(OWNERS.slice(0, 3).map((name) => `${name}@${CURRENT}`)),
      ["npm", "uninstall", "--no-save", AGENT_CORE],
    ]);
  });
}

test("all-absent restore snapshot produces one uninstall argv covering all four owners", (t) => {
  const cwd = fixture(t, [null, null, null, null]);
  const host = stockHost();
  const before = snapshotHostPackages(cwd, host);
  assert.deepEqual(before, snapshot([null, null, null, null]));
  assert.deepEqual(buildRestoreCommands(resolveRestoreSnapshot(cwd, host, before)), [
    ["npm", "uninstall", "--no-save", ...OWNERS],
  ]);
});

test("snapshot comparison rejects an omitted or reordered independent owner", () => {
  const expected = snapshotTargetHostPackages(stockHost());
  assert.equal(snapshotsMatch(expected, targetSnapshot()), true);
  assert.equal(snapshotsMatch(expected, targetSnapshot().slice(0, 3)), false);
  assert.equal(snapshotsMatch(expected, targetSnapshot().toReversed()), false);
});

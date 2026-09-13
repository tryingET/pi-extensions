// Shared exact-copy mechanics, NOT a hostile-code sandbox.
// admitted_fixture pins need external exact-source review; source_regression
// OBSERVATION inputs assert copy consistency only, never independent approval.
import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { lstatSync, mkdirSync, readFileSync, readdirSync, realpathSync, writeFileSync } from "node:fs";
import path from "node:path";

export const COPIED = Object.freeze([
  "completion-fixture.mjs", "completion.mjs", "completion-boundary.mjs", "manifest.mjs",
  "runner.mjs", "payloads.mjs", "host-lifecycle.mjs", "host-state.mjs", "process.mjs",
  "command-wrapper.mjs", "recovery.mjs", "recovery-journal.mjs", "state-files.mjs",
  "state-lock.mjs", "state-schema.mjs", "state-store.mjs", "integrity.mjs", "paths.mjs",
  "mutation-completion.mjs", "host-restoration-barrier.mjs", "recovery-verification.mjs",
  "child-clearance.mjs", "recovery-snapshots.mjs",
  "completion-fixture-closure.mjs", "completion-fixture-cases.mjs", "completion-fixture-denied-lifecycle.mjs",
]);
export const PARENT_ONLY = Object.freeze(["completion.test.mjs", "completion-fixture-negatives.mjs",
  "mutation-completion.test.mjs", "child-clearance.test.mjs", "child-clearance.io.test.mjs", "recovery-snapshots.test.mjs",
  "../pi-host-compatibility-canary.recovery.test.mjs", "completion-fixture-runner.mjs",
  "completion-source-regression.test.mjs", "source-regression-observation.mjs",
  "source-regression-harness.mjs", "source-regression.test.mjs"]);
export const ORIGINAL_IMPORT = 'from "./process.mjs"';
export const DENIED_IMPORT = 'from "./completion-fixture-denied-lifecycle.mjs"';
const TRANSFORMED = ["host-lifecycle.mjs", "recovery.mjs"];
export const digest = bytes => createHash("sha256").update(bytes).digest("hex");

export function canonicalPath(candidate) {
  assert.equal(typeof candidate, "string");
  assert.ok(path.isAbsolute(candidate) && path.resolve(candidate) === candidate, "non-canonical absolute path");
  let cursor = path.parse(candidate).root;
  for (const part of candidate.slice(cursor.length).split(path.sep).filter(Boolean)) {
    cursor = path.join(cursor, part);
    assert.equal(lstatSync(cursor).isSymbolicLink(), false, `symlink: ${cursor}`);
  }
  assert.equal(realpathSync(candidate), candidate, "canonical path drift");
  return candidate;
}
export function regularBytes(file) {
  canonicalPath(file);
  const stats = lstatSync(file);
  assert.ok(stats.isFile() && stats.nlink === 1, `not a single-link regular file: ${file}`);
  return readFileSync(file);
}
export function checkedChild(root, relative, { absent = false } = {}) {
  canonicalPath(root);
  assert.ok(lstatSync(root).isDirectory(), "root must be directory");
  assert.equal(typeof relative, "string");
  assert.ok(relative.length > 0 && !path.isAbsolute(relative) &&
    relative.split("/").every(part => /^[A-Za-z0-9._-]+$/.test(part) && part !== "." && part !== ".."), "unsafe generated path");
  const target = path.join(root, relative);
  assert.ok(target.startsWith(`${root}${path.sep}`), "generated path escaped root");
  let cursor = root;
  for (const part of relative.split(path.sep)) {
    cursor = path.join(cursor, part);
    const stats = lstatSync(cursor, { throwIfNoEntry: false });
    if (!stats) { assert.ok(absent, `missing path: ${cursor}`); continue; }
    assert.equal(stats.isSymbolicLink(), false, "generated path symlink");
    assert.equal(realpathSync(cursor), cursor, "generated path alias");
  }
  return target;
}
export function transformBytes(file, bytes) {
  if (!TRANSFORMED.includes(file)) return bytes;
  const text = bytes.toString("utf8");
  assert.deepEqual(Buffer.from(text), bytes, "non-UTF8 transformation input");
  assert.equal(text.split(ORIGINAL_IMPORT).length - 1, 1, `${file}: expected exactly one process import`);
  assert.equal(text.includes(DENIED_IMPORT), false, "preexisting denied import");
  const output = text.replace(ORIGINAL_IMPORT, DENIED_IMPORT);
  assert.equal(output.includes(ORIGINAL_IMPORT), false);
  // Named import binding, not just an occurrence in a comment/string.
  assert.equal(output.split(`import { spawnWithNeutralNpmEnv } ${DENIED_IMPORT};`).length - 1, 1,
    `${file}: denied executor binding missing`);
  return Buffer.from(output);
}
export const SUPPORTED_NODE_VERSIONS = Object.freeze(["v22.22.2", "v26.8.1"]);
export const OBSERVATION_KIND = "source-regression-identity-OBSERVATION-copy-consistency-only";
export function assertSupportedNode(version) {
  assert.ok(SUPPORTED_NODE_VERSIONS.includes(version), `unsupported exact Node version: ${version}`);
}
export function validatePurpose(pins) {
  assert.ok(["admitted_fixture", "source_regression"].includes(pins.purpose), "unknown fixture purpose");
  if (pins.purpose === "admitted_fixture") {
    assert.equal(pins.observedNode, undefined, "observations cannot be qualification inputs");
    assert.equal(pins.observationKind, undefined);
    assert.deepEqual(pins.nodes.map(pin => pin.version).sort(), [...SUPPORTED_NODE_VERSIONS]);
  } else {
    assert.equal(pins.nodes, undefined, "source observations cannot contain admitted nodes");
    assert.equal(pins.observationKind, OBSERVATION_KIND);
    assertSupportedNode(pins.observedNode.version);
    assert.equal(pins.observedNode.identityBasis, OBSERVATION_KIND);
  }
}
export function validatePins(pins) {
  validatePurpose(pins);
  assert.equal(pins.schemaVersion, 1);
  assert.deepEqual(Object.keys(pins.copied).sort(), [...COPIED].sort());
  assert.deepEqual(Object.keys(pins.parentOnly).sort(), [...PARENT_ONLY].sort());
  assert.equal(pins.rootWrapper.file, "../pi-host-compatibility-canary.test.mjs");
  for (const [file, pin] of Object.entries(pins.copied)) {
    assert.match(pin.sha256, /^[a-f0-9]{64}$/);
    assert.match(pin.destinationSha256, /^[a-f0-9]{64}$/);
    assert.equal(pin.transform, TRANSFORMED.includes(file) ? "deny-lifecycle-import-once" : "identity");
    if (!TRANSFORMED.includes(file)) assert.equal(pin.sha256, pin.destinationSha256);
  }
  for (const hash of [...Object.values(pins.parentOnly), pins.rootWrapper.sha256]) assert.match(hash, /^[a-f0-9]{64}$/);
}
export function originalBytes(source, file, pins) {
  assert.ok(COPIED.includes(file), "unlisted copied input");
  const bytes = regularBytes(path.join(source, file));
  assert.equal(digest(bytes), pins.copied[file].sha256, `changed source: ${file}`);
  const transformed = transformBytes(file, bytes);
  assert.equal(digest(transformed), pins.copied[file].destinationSha256, `changed transformation: ${file}`);
  return transformed;
}
export function verifySource(source, pins) {
  validatePins(pins);
  for (const file of COPIED) originalBytes(source, file, pins);
  for (const file of PARENT_ONLY) {
    assert.equal(digest(regularBytes(path.join(source, file))), pins.parentOnly[file], `changed parent: ${file}`);
  }
  assert.equal(digest(regularBytes(path.resolve(source, pins.rootWrapper.file))), pins.rootWrapper.sha256,
    "changed root regression wrapper");
}
export function verifyDestination(destination, pins) {
  validatePins(pins);
  canonicalPath(destination);
  assert.deepEqual(readdirSync(destination).sort(), [...COPIED].sort(), "extra/missing destination input");
  for (const file of COPIED) {
    const bytes = regularBytes(path.join(destination, file));
    assert.equal(digest(bytes), pins.copied[file].destinationSha256, `changed destination: ${file}`);
    if (TRANSFORMED.includes(file)) {
      const text = bytes.toString("utf8");
      assert.equal(text.includes(ORIGINAL_IMPORT), false);
      assert.equal(text.split(`import { spawnWithNeutralNpmEnv } ${DENIED_IMPORT};`).length - 1, 1);
    }
  }
}
export function copyClosure(source, destination, pins) {
  verifySource(source, pins);
  mkdirSync(destination, { recursive: true, mode: 0o700 });
  canonicalPath(destination);
  assert.deepEqual(readdirSync(destination), [], "destination must start empty");
  for (const file of COPIED) writeFileSync(path.join(destination, file), originalBytes(source, file, pins),
    { flag: "wx", mode: 0o600 });
  verifyDestination(destination, pins);
}
export function verifyNode(pins) {
  assert.equal(pins.purpose, "admitted_fixture", "strict admission refuses source observations");
  validatePurpose(pins);
  assertSupportedNode(process.version);
  assert.equal(process.platform, "linux");
  const pin = pins.nodes.find(entry => entry.version === process.version);
  assert.ok(pin, `unreviewed Node version: ${process.version}`);
  assert.equal(canonicalPath(process.execPath), pin.path, "unreviewed Node executable path");
  assert.equal(digest(regularBytes(pin.path)), pin.sha256, "Node binary changed");
  assert.equal(digest(readFileSync("/proc/self/exe")), pin.sha256, "actual running Node binary differs");
  return pin;
}
export function verifyFixtureNode(pins) {
  validatePurpose(pins);
  if (pins.purpose === "admitted_fixture") return verifyNode(pins);
  // Caller trusts this running Node; observed path/hash bind its children only.
  assertSupportedNode(process.version);
  assert.equal(process.platform, "linux");
  const observed = pins.observedNode;
  assert.equal(observed.version, process.version);
  assert.equal(canonicalPath(process.execPath), observed.path, "observed source-regression path changed");
  assert.equal(digest(regularBytes(observed.path)), observed.sha256, "observed binary changed");
  assert.equal(digest(readFileSync("/proc/self/exe")), observed.sha256, "observed running binary differs");
  return observed;
}
export function fixtureEnv(base) {
  // No ambient spread, PATH lookup, NODE_OPTIONS, compile cache, npm, or crash controls.
  return Object.fromEntries([["HOME", "home"], ["TMPDIR", "tmp"], ["XDG_STATE_HOME", "state"]]
    .map(([key, dir]) => [key, checkedChild(base, dir)]));
}
export function verifyFixtureEnvironment(base) {
  assert.deepEqual({ ...process.env }, fixtureEnv(base), "fixture environment is not the exact allowlist");
  assert.deepEqual(process.execArgv, [], "fixture Node flags are not allowed");
}

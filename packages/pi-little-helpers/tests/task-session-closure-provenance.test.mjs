// AK7845 inspection findings F1-F3 (evidence 20303): the closure may hold only what the lock names by its
// real package identity, a reused runtime must still be the tree that was installed, and every packed file
// must be tracked at the commit or rebuilt output. Real installs: tests/live/task-session-install.reality.live.mjs.
import assert from "node:assert/strict";
import {
  chmodSync,
  mkdirSync,
  mkdtempSync,
  rmSync,
  symlinkSync,
  unlinkSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";
import * as closure from "../task-session-runtime/closure.mjs";

const { SDK_PACKAGES, SDK_VERSION } = closure;
const REGISTRY = "https://registry.npmjs.org/";
const tarball = (name, version) => `${REGISTRY}${name}/-/${name.split("/").at(-1)}-${version}.tgz`;
const entry = (name, version) => ({
  version,
  resolved: tarball(name, version),
  integrity: `sha512-${name}${version}`,
});
function lockFixture() {
  const packages = {
    "": { dependencies: Object.fromEntries(SDK_PACKAGES.map((name) => [name, SDK_VERSION])) },
    "node_modules/left-pad": entry("left-pad", "1.0.0"),
  };
  for (const name of SDK_PACKAGES) packages[`node_modules/${name}`] = entry(name, SDK_VERSION);
  return { lockfileVersion: 3, packages };
}

test("F1: Given an npm alias installing an own package under another name, then the lock refuses", () => {
  const lock = lockFixture();
  lock.packages["node_modules/innocent-alias"] = {
    ...entry("@tryinget/pi-model-selection", "0.1.0"),
    name: "@tryinget/pi-model-selection",
  };
  assert.throws(() => closure.assertLayerOneLock(lock), /lock_alias_forbidden/);
});

test("F1: Given an entry resolved to another package's tarball, then the lock refuses", () => {
  const lock = lockFixture();
  lock.packages["node_modules/left-pad"].resolved = tarball("@tryinget/pi-telemetry", "0.4.2");
  assert.throws(() => closure.assertLayerOneLock(lock), /lock_entry_not_registry/);
});

for (const spec of ["npm:@tryinget/pi-telemetry@0.4.2", "^1.0.0", "file:../x", "latest"]) {
  test(`F1: Given a root manifest dependency ${spec}, then it refuses anything but an exact version`, () => {
    assert.throws(
      () => closure.assertRuntimeManifest({ dependencies: { x: spec } }),
      /runtime_spec_not_exact/,
    );
  });
}

test("F1: Given the committed root manifest, then every dependency is an exact version", () => {
  assert.doesNotThrow(() => closure.assertRuntimeManifest(closure.readRuntimeManifest()));
});

test("F1: Given an installed entry whose package name differs from its path, then verify refuses", () => {
  const lock = lockFixture();
  const installed = structuredClone(lock.packages);
  installed["node_modules/left-pad"].name = "@tryinget/pi-telemetry";
  assert.throws(() => closure.verifyInstalled(installed, lock, []), /closure_entry_alias/);
});

test("Given an override the lock does not install, then the override check refuses", () => {
  const lock = lockFixture();
  lock.packages["node_modules/undici"] = entry("undici", "8.10.2");
  assert.throws(
    () => closure.assertOverridesCurrent(lock, { overrides: { undici: "8.12.3" } }),
    /lock_override_not_applied/,
  );
});

test("F2: Given two equal trees, then their digests match, and any change to a file, link or entry shows", (t) => {
  const root = mkdtempSync(join(tmpdir(), "task-session-tree-"));
  t.after(() => rmSync(root, { recursive: true, force: true }));
  const make = (name) => {
    const dir = join(root, name);
    mkdirSync(join(dir, "pkg/lib"), { recursive: true });
    writeFileSync(join(dir, "pkg/package.json"), "{}");
    writeFileSync(join(dir, "pkg/lib/a.js"), "a");
    symlinkSync("../pkg/lib/a.js", join(dir, "pkg/bin"));
    return dir;
  };
  const [a, b] = [make("a"), make("b")];
  const digest = closure.treeDigest(a);
  assert.match(digest, /^[0-9a-f]{64}$/);
  assert.equal(closure.treeDigest(b), digest);
  writeFileSync(join(b, "pkg/lib/a.js"), "b");
  assert.notEqual(closure.treeDigest(b), digest);
  writeFileSync(join(b, "pkg/lib/a.js"), "a");
  unlinkSync(join(b, "pkg/bin"));
  symlinkSync("../pkg/package.json", join(b, "pkg/bin"));
  assert.notEqual(closure.treeDigest(b), digest);
  rmSync(join(b, "pkg"), { recursive: true });
  assert.notEqual(closure.treeDigest(b), digest);
});

test("F3: Given packed files, then only those neither tracked nor rebuilt output are reported", () => {
  const files = ["package.json", "src/a.js", "src/dist/injected.js", "dist/built.js", "notes.md"];
  const tracked = new Set(["package.json", "src/a.js"]);
  assert.deepEqual(closure.untrackedPackedFiles(files, tracked), [
    "src/dist/injected.js",
    "notes.md",
  ]);
});

test("Given npm other than the toolchain pin, then the environment check refuses", () => {
  const refusal = closure.nodeRefusal({
    pinned: "22.23.4",
    running: "22.23.4",
    onPath: "v22.23.4",
    pinnedNpm: "12.0.2",
    npm: "10.9.9",
  });
  assert.match(refusal ?? "", /^install_npm_not_pinned/);
});

test("Given a nested copy of an overridden package at another version, then the override check refuses", () => {
  const lock = lockFixture();
  lock.packages["node_modules/undici"] = entry("undici", "8.12.3");
  lock.packages["node_modules/@earendil-works/pi-ai/node_modules/undici"] = entry(
    "undici",
    "7.0.0",
  );
  assert.throws(
    () => closure.assertOverridesCurrent(lock, { overrides: { undici: "8.12.3" } }),
    /lock_override_not_applied/,
  );
});

test("F2: Given a file whose mode changed, then the tree digest changes", (t) => {
  const root = mkdtempSync(join(tmpdir(), "task-session-mode-"));
  t.after(() => rmSync(root, { recursive: true, force: true }));
  writeFileSync(join(root, "run.js"), "x");
  chmodSync(join(root, "run.js"), 0o755);
  const before = closure.treeDigest(root);
  chmodSync(join(root, "run.js"), 0o644);
  assert.notEqual(closure.treeDigest(root), before);
});

test("F3: Given ignored paths in an own package, then all but installs, rebuilt output and scratch are inputs", () => {
  const ignored = [
    "node_modules/",
    "dist/",
    ".tmp/",
    ".tmp-self-tests/",
    "src/dist/injected.js",
    "tsconfig.tsbuildinfo",
    ".package.json.prepack.backup",
  ];
  assert.deepEqual(closure.ignoredInputs(ignored), [
    "src/dist/injected.js",
    "tsconfig.tsbuildinfo",
    ".package.json.prepack.backup",
  ]);
});

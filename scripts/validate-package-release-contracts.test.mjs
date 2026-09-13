/**
summary: "Tests release-owner discovery without packing generated fixture packages."
read_when:
  - "Changing aggregate package release discovery or its CI wiring."
*/
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";
import { walkPackageJsonPaths } from "./validate-package-release-contracts.mjs";

const SCRIPTS = path.dirname(fileURLToPath(import.meta.url));

function fixture(t) {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "pi-release-discovery-"));
  t.after(() => fs.rmSync(root, { recursive: true, force: true }));
  const packages = path.join(root, "packages");
  fs.mkdirSync(packages);
  const write = (relativePath, text) => {
    const target = path.join(root, relativePath);
    fs.mkdirSync(path.dirname(target), { recursive: true });
    fs.writeFileSync(target, text);
    return target;
  };
  const manifest = (owner, value = { name: owner, version: "1.0.0" }) =>
    write(`packages/${owner}/package.json`, JSON.stringify(value));
  const discover = () => walkPackageJsonPaths(packages).map((p) => path.relative(packages, p));
  return { root, write, manifest, discover };
}

function runValidator(f) {
  // Exercise the real CLI/checks in an isolated tree. Never run npm pack or
  // lifecycle scripts: a failing stub records which owners reached packing.
  for (const script of [
    "scripts/validate-package-release-contracts.mjs",
    "scripts/npm-pack-json.mjs",
    "packages/pi-eval-kernel/scripts/npm-pack-json.mjs",
  ]) {
    f.write(script, fs.readFileSync(path.resolve(SCRIPTS, "..", script), "utf8"));
  }
  const npm = f.write("bin/npm", '#!/bin/sh\nprintf "%s\\n" "$PWD" >> "$PACK_CALLS"\necho "packing disabled in discovery test" >&2\nexit 97\n');
  fs.chmodSync(npm, 0o755);
  const calls = path.join(f.root, "pack-calls");
  const result = spawnSync(process.execPath, [path.join(f.root, "scripts/validate-package-release-contracts.mjs")], {
    cwd: f.root,
    encoding: "utf8",
    env: { ...process.env, PATH: path.dirname(npm), PACK_CALLS: calls },
  });
  assert.ifError(result.error);
  assert.equal(result.signal, null);
  return {
    ...result,
    packedOwners: fs.existsSync(calls)
      ? fs.readFileSync(calls, "utf8").trim().split("\n").map((p) => path.relative(f.root, p))
      : [],
  };
}

test("discovers sorted owners recursively through private and non-private package groups", (t) => {
  const f = fixture(t);
  const owners = ["z-simple", "private-group", "private-group/child", "private-group/nested/leaf", "public-group", "public-group/child"];
  for (const owner of owners) f.manifest(owner);
  f.manifest("private-group", { private: true });
  assert.deepEqual(f.discover(), owners.map((owner) => `${owner}/package.json`).sort());
});

test("excludes the entire owner dist subtree regardless of manifest contents", (t) => {
  const f = fixture(t);
  f.manifest("helpers");
  f.manifest("helpers/dist/task-session", { type: "module" });
  f.manifest("helpers/dist/copied-owner");
  f.write("packages/helpers/dist/deep/broken/package.json", "not JSON");
  f.manifest("group", { private: true });
  f.manifest("group/child");
  f.manifest("group/child/dist/task-session", { type: "module" });
  f.manifest("group/dist/generated", { type: "module" });
  assert.deepEqual(f.discover(), ["group/child/package.json", "group/package.json", "helpers/package.json"]);
});

test("does not broaden exclusions to other directory names or unowned dist directories", (t) => {
  const f = fixture(t);
  const owners = ["dist", "group/dist", "owner", "owner/dist-tools", "owner/build", "owner/src/nested"];
  for (const owner of owners) f.manifest(owner);
  assert.deepEqual(f.discover(), owners.map((owner) => `${owner}/package.json`).sort());
});

test("retains hidden and node_modules exclusions", (t) => {
  const f = fixture(t);
  f.manifest("owner");
  for (const owner of [".hidden", "node_modules/dependency", "owner/.cache/nested", "owner/node_modules/dependency"]) {
    f.manifest(owner);
  }
  assert.deepEqual(f.discover(), ["owner/package.json"]);
});

test("the real nested pi-interaction release owners remain discoverable", () => {
  const packages = path.resolve(SCRIPTS, "../packages");
  const paths = new Set(walkPackageJsonPaths(packages));
  for (const owner of ["pi-interaction", "pi-interaction/pi-interaction", "pi-interaction/pi-interaction-kit", "pi-little-helpers"]) {
    assert.ok(paths.has(path.join(packages, owner, "package.json")), owner);
  }
});

test("CLI ignores generated scope markers without attempting to parse or pack them", (t) => {
  const f = fixture(t);
  f.manifest("owner", { private: true });
  f.manifest("owner/dist/task-session", { type: "module" });
  f.write("packages/owner/dist/broken/package.json", "not JSON");
  const result = runValidator(f);
  assert.equal(result.status, 0, result.stderr);
  assert.match(result.stdout, /validation passed \(0 publishable packages\)/);
  assert.deepEqual(result.packedOwners, []);
});

test("authored scope-only manifests still fail the unchanged release requirements", (t) => {
  const f = fixture(t);
  f.manifest("group", { private: true });
  f.manifest("group/malformed", { type: "module" });
  f.manifest("group/malformed/dist/task-session", { type: "module" });
  const result = runValidator(f);
  assert.equal(result.status, 1);
  assert.match(result.stderr, /package release contract validation failed/);
  assert.match(result.stderr, /packages\/group\/malformed\/package.json/);
  assert.match(result.stderr, /must define a non-empty files\[\] array/);
  assert.match(result.stderr, /scripts.release:check:quick is required/);
  assert.deepEqual(result.packedOwners, ["packages/group/malformed"]);
  assert.doesNotMatch(result.stderr, /dist\/task-session/);
});

test("invalid authored JSON remains a hard failure", (t) => {
  const f = fixture(t);
  f.write("packages/malformed/package.json", "not JSON");
  const result = runValidator(f);
  assert.equal(result.status, 1);
  assert.match(result.stderr, /SyntaxError/);
  assert.deepEqual(result.packedOwners, []);
});

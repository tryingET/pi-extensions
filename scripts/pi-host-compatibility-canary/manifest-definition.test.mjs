import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { pathToFileURL } from "node:url";
import test from "node:test";
import * as manifestApi from "./manifest.mjs";
import { loadCurrentHostVersion } from "./host-contract.mjs";
import { POLICY, VERSION, fixture, policy, pass, fail } from "./drift-test-fixtures.mjs";

function absentScenario() {
  const data = policy();
  data.scenarios[0].cwd = "packages/ak5588-unrelated-missing-scenario";
  return data;
}

test("Given aligned package A and missing unrelated scenario B, When scoped admission loads policy, Then admit A without resolving B", (t) => {
  const f = fixture(t);
  f.put(POLICY, absentScenario());
  pass(f.run("--package", "packages/a"));
  assert.equal(loadCurrentHostVersion(path.join(f.root, POLICY)), VERSION);
});

test("Given missing scenario directories in index and revision, When checking immutable policy, Then validate definition without requiring execution directories", (t) => {
  const f = fixture(t, true);
  f.put(POLICY, absentScenario());
  f.git("add", POLICY);
  pass(f.run("--staged"));
  f.git("-c", "core.hooksPath=/dev/null", "commit", "-qm", "missing execution directory");
  f.put(POLICY, "malformed worktree policy must not contaminate snapshot");
  pass(f.run("--revision", "HEAD"));
  f.put("packages/a/src.ts", "// changed");
  f.git("add", "packages/a/src.ts");
  pass(f.run("--staged"));
});

test("Given a pure manifest definition, When normalized, Then preserve schema validation but omit filesystem identities", () => {
  const data = absentScenario();
  data.scenarios[0].cwd = `  ${data.scenarios[0].cwd}  `;
  const original = structuredClone(data);
  const result = manifestApi.validateManifestDefinition(data, "fixture.json");
  assert.equal(result.scenarios[0].cwd, data.scenarios[0].cwd.trim());
  assert.equal(result.manifestPath, "fixture.json");
  assert.equal(Object.hasOwn(result.scenarios[0], "cwdAbs"), false);
  assert.equal(Object.hasOwn(result.scenarios[0], "cwdIdentity"), false);
  assert.deepEqual(data, original);
  for (const cwd of [undefined, null, "", "   ", 42]) {
    const invalid = policy();
    invalid.scenarios[0].cwd = cwd;
    assert.throws(() => manifestApi.validateManifestDefinition(invalid), /cwd must be a non-empty string/);
  }
  for (const mutate of [
    d => { d.schemaVersion = 2; },
    d => { d.scenarios[0].command = []; },
    d => { d.scenarios[0].profiles = ["absent"]; },
    d => { d.scenarios.push(d.scenarios[0]); },
    d => { d.profiles.current.host.version = "^0.83.0"; },
  ]) {
    const invalid = policy();
    mutate(invalid);
    assert.throws(() => manifestApi.validateManifestDefinition(invalid));
  }
});

test("Given definition-only owners and missing scenario cwd, When normalizing, Then reject duplicate owners without resolving directories", () => {
  const data = absentScenario();
  data.hostPackage = " @historical/host ";
  data.hostCompanionPackages = [" @historical/tui ", "@historical/ai"];
  const original = structuredClone(data);
  const normalized = manifestApi.validateManifestDefinition(data, "definition-only.json");
  assert.equal(normalized.hostPackage, "@historical/host");
  assert.deepEqual(normalized.hostCompanionPackages, ["@historical/tui", "@historical/ai"]);
  assert.equal(normalized.scenarios[0].cwd, data.scenarios[0].cwd);
  assert.equal(Object.hasOwn(normalized.scenarios[0], "cwdAbs"), false);
  assert.equal(Object.hasOwn(normalized.scenarios[0], "cwdIdentity"), false);
  assert.deepEqual(data, original);
  for (const companions of [undefined, [], [" @historical/ai "]]) {
    const generic = structuredClone(data);
    generic.hostCompanionPackages = companions;
    assert.deepEqual(
      manifestApi.validateManifestDefinition(generic).hostCompanionPackages,
      companions?.map(name => name.trim()) ?? [],
    );
  }
  for (const [companions, duplicate] of [
    [["@historical/host"], "@historical/host"],
    [[" @historical/host "], "@historical/host"],
    [[" @historical/tui ", "@historical/tui"], "@historical/tui"],
    [["@historical/tui", " @historical/tui "], "@historical/tui"],
  ]) {
    const invalid = structuredClone(data);
    invalid.hostCompanionPackages = companions;
    const unchanged = structuredClone(invalid);
    assert.throws(() => manifestApi.validateManifestDefinition(invalid, "definition-only.json"), {
      name: "Error",
      message: `Duplicate host package owner: ${duplicate}`,
    });
    assert.deepEqual(invalid, unchanged);
  }
});

test("Given runtime manifest callers, When validating, Then still resolve every cwd, require directories, and capture canonical identities", async (t) => {
  const f = fixture(t);
  for (const name of ["manifest.mjs", "paths.mjs", "integrity.mjs"]) {
    f.put(`scripts/pi-host-compatibility-canary/${name}`, fs.readFileSync(new URL(name, import.meta.url), "utf8"));
  }
  const runtime = await import(pathToFileURL(path.join(f.root, "scripts/pi-host-compatibility-canary/manifest.mjs")));
  const data = policy();
  data.scenarios[0].cwd = "packages/a";
  const result = runtime.validateManifest(data, "fixture.json");
  const stats = fs.statSync(path.join(f.root, "packages/a"), { bigint: true });
  assert.equal(result.scenarios[0].cwdAbs, fs.realpathSync(path.join(f.root, "packages/a")));
  assert.deepEqual(result.scenarios[0].cwdIdentity, { dev: String(stats.dev), ino: String(stats.ino) });
  data.scenarios.push({ ...data.scenarios[0], id: "missing", cwd: "missing" });
  assert.throws(() => runtime.validateManifest(data), /cwd does not exist/);
  data.scenarios.pop();
  data.scenarios[0].cwd = "packages/a/package.json";
  assert.throws(() => runtime.validateManifest(data), /cwd must be a directory/);
  fs.symlinkSync(path.dirname(f.root), path.join(f.root, "escape"));
  data.scenarios[0].cwd = "escape";
  assert.throws(() => runtime.validateManifest(data), /cwd must stay within repository root/);
  // Runtime callers retain their previous support for absolute, canonically contained cwd.
  data.scenarios[0].cwd = path.join(f.root, "packages/a");
  assert.equal(runtime.validateManifest(data).scenarios[0].cwdAbs, path.join(f.root, "packages/a"));
});

test("Given lexically unsafe or malformed cwd, When checker policy is loaded, Then reject in worktree, index, and revision modes", (t) => {
  const f = fixture(t, true);
  for (const cwd of ["../escape", "packages/../../escape", "/absolute", "", "   "]) {
    const data = policy();
    data.scenarios[0].cwd = cwd;
    f.put(POLICY, data);
    assert.throws(() => loadCurrentHostVersion(path.join(f.root, POLICY)), /cwd/);
    f.git("add", POLICY);
    fail(f.run("--staged"), /cwd/);
    f.git("-c", "core.hooksPath=/dev/null", "commit", "-qm", "unsafe cwd");
    fail(f.run("--revision", "HEAD"), /cwd/);
  }
});

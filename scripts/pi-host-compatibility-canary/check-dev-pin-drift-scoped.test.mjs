import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import test from "node:test";
import { AI, POLICY, VERSION, fixture, pkg, lock, policy, pass, fail, report } from "./drift-test-fixtures.mjs";

test("Given unrelated bad packages, When an explicit .tmp-test root is checked, Then scope is isolated and repeatable", (t) => {
  const f = fixture(t);
  f.put("packages/b/package.json", pkg("0.82.0"));
  f.put(".tmp-test/good/package.json", pkg());
  f.put(".tmp-test/bad/package.json", pkg("0.82.0"));
  pass(f.run("--package", path.join(f.root, ".tmp-test/good")));
  fail(f.run("--package", path.join(f.root, ".tmp-test/bad")), /expected 0.83.0/);
  const result = f.run("--package", path.join(f.root, ".tmp-test/good"), "--package", "packages/a", "--json");
  pass(result);
  const r = report(result);
  assert.equal(r.source.kind, "worktree");
  assert.equal(r.scope.kind, "explicit");
  assert.deepEqual(r.scope.packages, [".tmp-test/good", "packages/a"]);
  assert.equal(r.baseline.version, VERSION);
  assert.deepEqual(r.offenders, []);
  assert.equal(r.counts.packages, 2);
  assert.equal(r.counts.checks, 2);
  fail(f.run()); // default still finds the unrelated, untracked bad consumer
});

test("Given devTestFloor drift, When checked, Then report it but ignore historical hostBaseline and peers", (t) => {
  const f = fixture(t);
  const data = { ...pkg(), peerDependencies: { [AI]: ">=0.1.0" },
    "x-pi-template": { piHostContract: { hostBaseline: "0.1.0", devTestFloor: "0.82.0" } } };
  f.put("packages/a/package.json", data);
  fail(f.run(), /devTestFloor=0.82.0/);
  data["x-pi-template"].piHostContract.devTestFloor = VERSION;
  f.put("packages/a/package.json", data);
  pass(f.run());
});

test("Given a lock lacking the governed root spec, When checked, Then fail even with correct resolution", (t) => {
  const f = fixture(t);
  const data = lock();
  delete data.packages[""].devDependencies;
  f.put("packages/a/package-lock.json", data);
  fail(f.run(), /missing packages\[""\].devDependencies/);
  f.put("packages/a/package-lock.json", lock());
  pass(f.run());
});

test("Given explicit missing, escaped, or symlinked inputs, When checked, Then fail closed", (t) => {
  const f = fixture(t);
  fail(f.run("--package", "missing"));
  fail(f.run("--package", ".."), /repository root/);
  fs.symlinkSync(path.dirname(f.root), path.join(f.root, "outside"));
  fail(f.run("--package", "outside"), /repository root/);
  fs.symlinkSync("../a/package.json", path.join(f.root, "packages/b/link.json"));
  fs.rmSync(path.join(f.root, "packages/b/package.json"));
  fs.renameSync(path.join(f.root, "packages/b/link.json"), path.join(f.root, "packages/b/package.json"));
  fail(f.run("--package", "packages/b"), /symlink/);
  fs.symlinkSync("package.json", path.join(f.root, "packages/a/package-lock.json"));
  fail(f.run("--package", "packages/a"), /symlink/);
});

test("Given an empty fleet, When default checked, Then refuse a vacuous pass", (t) => {
  const f = fixture(t);
  fs.rmSync(path.join(f.root, "packages"), { recursive: true });
  fail(f.run(), /refusing to pass vacuously/);
});

test("Given the public host loader, When loading valid or unbound policy, Then return exact current version or throw", async (t) => {
  const f = fixture(t);
  const { loadCurrentHostVersion } = await import("./host-contract.mjs");
  assert.equal(loadCurrentHostVersion(path.join(f.root, POLICY)), VERSION);
  const data = policy();
  delete data.profiles.current.host.version;
  data.profiles.current.host.versionFromEnv = "SHOULD_NOT_BE_USED";
  f.put(POLICY, data);
  assert.throws(() => loadCurrentHostVersion(path.join(f.root, POLICY)), /current.host.version/);
});

test("Given nested untracked consumers and all four governed packages, When default checked, Then preserve exact pins and closure exceptions", (t) => {
  const f = fixture(t);
  const names = [AI, "@earendil-works/pi-tui", "@earendil-works/pi-coding-agent", "@earendil-works/pi-agent-core"];
  f.put("packages/group/child/package.json", { optionalDependencies: Object.fromEntries(names.map(n => [n, VERSION])) });
  const data = lock();
  data.packages[`../external/node_modules/${AI}`] = { version: "0.1.0" };
  data.packages[`node_modules/@earendil-works/pi-agent-core/node_modules/${AI}`] = { version: "0.1.0" };
  f.put("packages/a/package-lock.json", data);
  pass(f.run());
  for (const name of names) {
    f.put("packages/group/child/package.json", { optionalDependencies: { [name]: `^${VERSION}` } });
    fail(f.run(), /expected 0.83.0/);
  }
});

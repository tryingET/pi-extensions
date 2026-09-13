import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import test from "node:test";
import { POLICY, VERSION, fixture, pkg, lock, policy, pass, fail, report } from "./drift-test-fixtures.mjs";

test("Given bad staged content and good unstaged content, When staged checked, Then reject immutable index bytes", (t) => {
  const f = fixture(t, true);
  f.put("packages/a/package.json", pkg("0.82.0"));
  f.git("add", "packages/a/package.json");
  f.put("packages/a/package.json", pkg());
  const result = f.run("--staged", "--json");
  fail(result);
  const r = report(result);
  assert.equal(r.source.kind, "index");
  assert.equal(r.status, "fail");
  assert.match(r.offenders.join("\n"), /0.82.0/);
  assert.deepEqual(r.scope.packages, ["packages/a"]);
  assert.match(r.source.entries.find(e => e.path === "packages/a/package.json").oid, /^[a-f0-9]{40,64}$/);
});

test("Given good staged content, bad unstaged policy/consumers and untracked contamination, When staged checked, Then ignore the worktree", (t) => {
  const f = fixture(t, true);
  f.put("packages/a/src.ts", "// staged source change\n");
  f.git("add", "packages/a/src.ts");
  f.put("packages/a/package.json", pkg("0.1.0"));
  f.put("packages/b/package.json", "not JSON");
  f.put("packages/untracked/package.json", pkg("0.1.0"));
  f.put(POLICY, "broken unstaged policy");
  const result = f.run("--staged", "--json");
  pass(result);
  const r = report(result);
  assert.equal(r.baseline.version, VERSION);
  assert.deepEqual(r.scope.packages, ["packages/a"]);
  assert.equal(r.counts.packages, 1);
  assert.equal(r.scope.kind, "changed-packages");
});

test("Given a changed root policy, When staged checked, Then require coherent pins across the entire index fleet", (t) => {
  const f = fixture(t, true);
  f.put(POLICY, policy("0.84.0"));
  f.put("packages/a/package.json", pkg("0.84.0"));
  f.git("add", POLICY, "packages/a/package.json");
  fail(f.run("--staged"), /packages\/b\/package.json.*expected 0.84.0/);
  f.put("packages/b/package.json", pkg("0.84.0"));
  f.git("add", "packages/b/package.json");
  const result = f.run("--staged", "--json");
  pass(result);
  const r = report(result);
  assert.equal(r.scope.kind, "fleet");
  assert.equal(r.scope.reason, "root-policy-changed");
  assert.equal(r.counts.packages, 2);
  assert.equal(r.baseline.version, "0.84.0");
});

test("Given no package changes, When staged checked, Then explicitly skip rather than claim a fleet pass", (t) => {
  const f = fixture(t, true);
  f.put("unrelated.txt", "change");
  f.git("add", "unrelated.txt");
  const result = f.run("--staged", "--json");
  pass(result);
  const r = report(result);
  assert.equal(r.status, "skip");
  assert.equal(r.counts.packages, 0);
  assert.deepEqual(r.scope.packages, []);
  assert.match(f.run("--staged").stdout, /skip:.*no changed packages/);
  f.put(POLICY, "bad policy");
  f.git("add", POLICY);
  fail(f.run("--staged"));
});

test("Given nested packages, When any nested file changes or is deleted, Then select the nearest package", (t) => {
  const f = fixture(t, true);
  f.put("packages/a/child/package.json", pkg());
  f.put("packages/a/child/src.ts", "// old");
  f.git("add", ".");
  f.git("-c", "core.hooksPath=/dev/null", "commit", "-qm", "nested");
  f.git("rm", "packages/a/child/src.ts");
  const result = f.run("--staged", "--json");
  pass(result);
  assert.deepEqual(report(result).scope.packages, ["packages/a/child"]);
});

test("Given deleted selected manifest or lock, When staged checked, Then fail closed", (t) => {
  const f = fixture(t, true);
  f.git("rm", "packages/a/package.json");
  fail(f.run("--staged"), /deleted.*package.json|missing.*package.json/);
  f.git("reset", "--hard", "HEAD");
  f.put("packages/a/package-lock.json", lock());
  f.git("add", ".");
  f.git("-c", "core.hooksPath=/dev/null", "commit", "-qm", "lock");
  f.git("rm", "packages/a/package-lock.json");
  fail(f.run("--staged"), /deleted.*package-lock.json/);
});

test("Given absent, malformed, or unbound index policy, When staged checked, Then fail before a no-change skip", (t) => {
  const f = fixture(t, true);
  for (const value of ["{", {}, { ...policy(), profiles: {} }]) {
    f.put(POLICY, value);
    f.git("add", POLICY);
    fail(f.run("--staged"));
  }
  const unbound = policy();
  delete unbound.profiles.current.host.version;
  unbound.profiles.current.host.versionFromEnv = "NO_FALLBACK";
  f.put(POLICY, unbound);
  f.git("add", POLICY);
  fail(f.run("--staged"), /current.host.version/);
  f.git("rm", "-f", POLICY);
  fail(f.run("--staged"), /missing.*policy/);
});

test("Given unmerged index entries, When staged checked, Then reject even unrelated conflicts", (t) => {
  const f = fixture(t, true);
  const oid = f.git("rev-parse", "HEAD:packages/a/package.json");
  // Only scratch fixture Git is mutated; index-info creates an unmerged unrelated entry.
  const result = spawnSync("git", ["-C", f.root, "update-index", "--index-info"], {
    input: `100644 ${oid} 1\tunrelated-conflict\n100644 ${oid} 2\tunrelated-conflict\n`, encoding: "utf8",
  });
  assert.equal(result.status, 0, result.stderr);
  fail(f.run("--staged"), /unmerged/);
});

test("Given indexed symlink manifest, lock, or policy, When snapshot checked, Then reject without dereferencing", (t) => {
  const f = fixture(t, true);
  for (const name of ["packages/a/package.json", "packages/a/package-lock.json", POLICY]) {
    f.git("reset", "--hard", "HEAD");
    fs.rmSync(path.join(f.root, name), { force: true });
    fs.symlinkSync("/outside/snapshot", path.join(f.root, name));
    f.git("add", name);
    fail(f.run("--staged"), /symlink|regular.*blob/);
  }
});

test("Given historical good and bad revisions, When checked, Then verify full tracked snapshots without checkout", (t) => {
  const f = fixture(t, true);
  const good = f.git("rev-parse", "HEAD");
  f.put("packages/b/package.json", pkg("0.82.0"));
  f.git("add", ".");
  f.git("-c", "core.hooksPath=/dev/null", "commit", "-qm", "bad revision");
  const bad = f.git("rev-parse", "HEAD");
  f.put("packages/b/package.json", pkg());
  f.put(POLICY, "bad worktree policy");
  f.put("packages/untracked/package.json", "bad worktree consumer");
  const result = f.run("--revision", good, "--json");
  pass(result);
  const r = report(result);
  assert.equal(r.source.kind, "revision");
  assert.match(r.source.tree, /^[a-f0-9]{40,64}$/);
  assert.equal(r.scope.kind, "fleet");
  assert.equal(r.counts.packages, 2);
  fail(f.run("--revision", bad), /0.82.0/);
  fail(f.run("--revision", "does-not-exist"));
});

test("Given snapshot admission, When weakening flags or a nested repo-root are supplied, Then reject", (t) => {
  const f = fixture(t, true);
  for (const mode of [["--staged"], ["--revision", "HEAD"]]) {
    fail(f.run(...mode, "--package", "packages/a"), /cannot combine/);
    fail(f.run(...mode, "--manifest", path.join(f.root, POLICY)), /cannot combine/);
    fail(f.run(...mode, "--repo-root", path.join(f.root, "packages/a")), /repository root/);
  }
  fail(f.run("--staged", "--revision", "HEAD"), /cannot combine/);
});

test("Given staged missing lock specs and metadata mismatch, When checked, Then use index metadata and locks rather than repairs in the worktree", (t) => {
  const f = fixture(t, true);
  const data = lock();
  delete data.packages[""].devDependencies;
  f.put("packages/a/package-lock.json", data);
  f.put("packages/a/package.json", { ...pkg(), "x-pi-template": {
    piHostContract: { devTestFloor: "0.1.0", hostBaseline: "0.1.0" },
  } });
  f.git("add", "packages/a");
  f.put("packages/a/package-lock.json", lock());
  f.put("packages/a/package.json", pkg());
  const result = f.run("--staged", "--json");
  fail(result);
  const r = report(result);
  assert.match(r.offenders.join("\n"), /missing packages\[""\].devDependencies/);
  assert.match(r.offenders.join("\n"), /devTestFloor=0.1.0/);
  f.git("add", "packages/a");
  pass(f.run("--staged"));
});

test("Given snapshot-only scenario directories, When policy validated, Then no live checkout directory is required", (t) => {
  const f = fixture(t, true);
  const data = policy();
  data.scenarios[0].cwd = "packages/snapshot-only";
  f.put(POLICY, data);
  f.put("packages/snapshot-only/package.json", pkg());
  f.git("add", ".");
  fs.rmSync(path.join(f.root, "packages/snapshot-only"), { recursive: true });
  pass(f.run("--staged"));
  data.scenarios[0].cwd = "../escape";
  f.put(POLICY, data);
  f.git("add", POLICY);
  fail(f.run("--staged"), /repository root/);
});

test("Given a tracked bad consumer whose source is renamed or mode-changed, When staged checked, Then each entry change selects its owner", (t) => {
  const f = fixture(t, true);
  f.put("packages/a/package.json", pkg("0.1.0"));
  f.git("add", ".");
  f.git("-c", "core.hooksPath=/dev/null", "commit", "-qm", "bad tracked consumer");
  f.git("mv", "packages/a/src.ts", "packages/a/renamed source\nfile.ts");
  fail(f.run("--staged"), /expected 0.83.0/);
  f.git("reset", "--hard", "HEAD");
  f.git("update-index", "--chmod=+x", "packages/a/src.ts");
  fail(f.run("--staged"), /expected 0.83.0/);
});

test("Given revision policy changes without aligned consumers, When checked, Then reject the entire historical fleet", (t) => {
  const f = fixture(t, true);
  f.put(POLICY, policy("0.84.0"));
  f.git("add", POLICY);
  f.git("-c", "core.hooksPath=/dev/null", "commit", "-qm", "changed root baseline");
  const result = f.run("--revision", "HEAD", "--json");
  fail(result);
  const r = report(result);
  assert.equal(r.baseline.version, "0.84.0");
  assert.equal(r.counts.offenders, 2);
  assert.equal(r.counts.packages, 2);
});

test("Given a revision with no packages, When checked, Then fail vacuous verification", (t) => {
  const f = fixture(t, true);
  f.git("rm", "-r", "packages");
  f.git("-c", "core.hooksPath=/dev/null", "commit", "-qm", "empty fleet");
  fail(f.run("--revision", "HEAD"), /refusing to pass vacuously/);
});

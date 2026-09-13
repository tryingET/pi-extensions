import assert from "node:assert/strict";
import test from "node:test";
import { POLICY, fixture, pkg, lock, policy, pass, fail, report } from "./drift-test-fixtures.mjs";

function withLock(f) {
  f.put("packages/a/package-lock.json", lock());
  f.git("add", "packages/a");
  f.git("-c", "core.hooksPath=/dev/null", "commit", "-qm", "tracked lock");
}

test("Given complete package retirement including its lock, When staged checked, Then report reviewed removal rather than no-change or fleet pass", (t) => {
  const f = fixture(t, true);
  withLock(f);
  f.git("rm", "-r", "packages/a");
  // Untracked/unstaged leftovers are not evidence of indexed package contents.
  f.put("packages/a/untracked.txt", "ignored workspace residue");
  const result = f.run("--staged", "--json");
  pass(result);
  const r = report(result);
  assert.equal(r.status, "pass");
  assert.equal(r.scope.kind, "changed-packages");
  assert.deepEqual(r.scope.packages, []);
  assert.deepEqual(r.removedPackages, ["packages/a"]);
  assert.equal(r.counts.removedPackages, 1);
  assert.equal(r.counts.packages, 0);
  const text = f.run("--staged");
  pass(text);
  assert.match(text.stdout, /complete package removal/);
  assert.match(text.stdout, /not a full fleet check/);
  assert.doesNotMatch(text.stdout, /skip:|no changed packages/);
});

test("Given a complete package move, When staged checked, Then allow removal of old root and validate destination pins", (t) => {
  const f = fixture(t, true);
  withLock(f);
  f.git("mv", "packages/a", "packages/moved-a");
  const result = f.run("--staged", "--json");
  pass(result);
  const r = report(result);
  assert.deepEqual(r.removedPackages, ["packages/a"]);
  assert.deepEqual(r.scope.packages, ["packages/moved-a"]);
  assert.equal(r.counts.checks, 3);
  f.put("packages/moved-a/package.json", pkg("0.1.0"));
  f.git("add", "packages/moved-a/package.json");
  fail(f.run("--staged"), /packages\/moved-a\/package.json.*expected 0.83.0/);
});

test("Given orphaned manifest removal with a residual hidden indexed entry, When staged checked, Then do not classify retirement", (t) => {
  const f = fixture(t, true);
  f.put("packages/a/.residual", "must not be ignored");
  f.git("add", ".");
  f.git("-c", "core.hooksPath=/dev/null", "commit", "-qm", "hidden residue");
  f.git("rm", "packages/a/package.json", "packages/a/src.ts");
  const result = f.run("--staged", "--json");
  fail(result, /deleted.*package.json/);
  assert.deepEqual(report(result).removedPackages, []);
});

test("Given selected lock-only deletion, When staged checked, Then still reject", (t) => {
  const f = fixture(t, true);
  withLock(f);
  f.git("rm", "packages/a/package-lock.json");
  fail(f.run("--staged"), /deleted.*package-lock.json/);
});

test("Given removal of the entire indexed fleet, When staged checked, Then fail vacuously even with explicit retirement evidence", (t) => {
  const f = fixture(t, true);
  f.git("rm", "-r", "packages");
  const result = f.run("--staged", "--json");
  fail(result, /refusing to pass vacuously/);
  assert.deepEqual(report(result).removedPackages, ["packages/a", "packages/b"]);
});

test("Given root policy change plus retirement, When staged checked, Then validate all surviving consumers", (t) => {
  const f = fixture(t, true);
  f.git("rm", "-r", "packages/a");
  f.put(POLICY, policy("0.84.0"));
  f.git("add", POLICY);
  fail(f.run("--staged"), /packages\/b\/package.json.*expected 0.84.0/);
  f.put("packages/b/package.json", pkg("0.84.0"));
  f.git("add", "packages/b/package.json");
  const result = f.run("--staged", "--json");
  pass(result);
  assert.equal(report(result).scope.kind, "fleet");
  assert.deepEqual(report(result).removedPackages, ["packages/a"]);
});

test("Given a complete move outside default fleet discovery, When staged checked, Then still inspect the newly changed destination manifest", (t) => {
  const f = fixture(t, true);
  f.git("mv", "packages/a", ".moved-a");
  const result = f.run("--staged", "--json");
  pass(result);
  assert.deepEqual(report(result).scope.packages, [".moved-a"]);
  f.put(".moved-a/package.json", pkg("0.1.0"));
  f.git("add", ".moved-a/package.json");
  fail(f.run("--staged"), /\.moved-a\/package.json.*expected 0.83.0/);
});

for (const version of ["0.83.0", "9.0.0"]) {
  test(`Given a complete move to repository root with ${version} pins, When staged checked, Then inspect the root destination`, (t) => {
    const f = fixture(t, true);
    f.git("mv", "packages/a/package.json", "package.json");
    f.git("mv", "packages/a/src.ts", "src.ts");
    f.put("package.json", pkg(version));
    f.git("add", "package.json");
    const result = f.run("--staged", "--json");
    if (version === "0.83.0") pass(result);
    else fail(result, /package.json.*expected 0.83.0/);
    assert.deepEqual(report(result).scope.packages, ["."]);
    assert.deepEqual(report(result).removedPackages, ["packages/a"]);
  });
}

test("Given a removed repository-root manifest with residual indexed files, When staged checked, Then do not approve root retirement", (t) => {
  const f = fixture(t, true);
  f.put("package.json", pkg());
  f.git("add", "package.json");
  f.git("-c", "core.hooksPath=/dev/null", "commit", "-qm", "root package");
  f.git("rm", "package.json");
  fail(f.run("--staged"), /deleted.*package.json/);
});


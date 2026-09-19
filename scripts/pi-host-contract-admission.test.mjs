// ---
// summary: "Exercises root smoke/index and full-gate host admission before expensive work."
// read_when:
//   - "Changing root host admission or staged snapshot routing."
// ---
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";
import { fixture, pkg, pass, fail } from "./pi-host-compatibility-canary/drift-test-fixtures.mjs";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
function gateFixture(t) {
  const f = fixture(t, true);
  // This fixture isolates host-pin admission, not the separate toolchain contract.
  f.put("scripts/check-gate-toolchain.mjs", fs.readFileSync(path.join(ROOT, "scripts/check-gate-toolchain.mjs"), "utf8"));
  f.put("policy/ci-toolchain-lock.json", { schemaVersion: 1, nodeVersion: process.versions.node,
    npmVersion: spawnSync("npm", ["--version"], { encoding: "utf8" }).stdout.trim() });
  for (const name of ["check-dev-pin-drift.mjs", "drift-snapshot.mjs", "drift-worktree.mjs", "host-contract.mjs", "manifest.mjs", "paths.mjs", "integrity.mjs"]) {
    f.put(`scripts/pi-host-compatibility-canary/${name}`, fs.readFileSync(path.join(ROOT, "scripts/pi-host-compatibility-canary", name), "utf8"));
  }
  for (const name of ["smoke.sh", "full.sh"]) {
    f.put(`scripts/ci/${name}`, fs.readFileSync(path.join(ROOT, "scripts/ci", name), "utf8"));
    fs.chmodSync(path.join(f.root, `scripts/ci/${name}`), 0o755);
  }
  f.git("add", "scripts");
  f.git("-c", "core.hooksPath=/dev/null", "commit", "-qm", "fixture gate wiring");
  return { ...f, gate: (stage, ...args) => spawnSync("sh", [`scripts/ci/${stage}.sh`, ...args], {
    cwd: f.root, encoding: "utf8", env: { ...process.env, PI_EXTENSIONS_TMPDIR: path.join(f.root, "scratch") },
  }) };
}

test("Given staged drift hidden by an unstaged repair, When root pre-commit smoke runs, Then reject index bytes", (t) => {
  const f = gateFixture(t);
  f.put("packages/a/package.json", pkg("9.0.0"));
  f.git("add", "packages/a/package.json");
  f.put("packages/a/package.json", pkg());
  fail(f.gate("smoke", "--staged-only"), /Pi host contract drift/);
});

test("Given aligned staged bytes and unrelated workspace drift, When root smoke runs, Then admit only the staged package", (t) => {
  const f = gateFixture(t);
  f.put("packages/a/src.ts", "// changed\n");
  f.git("add", "packages/a/src.ts");
  f.put("packages/a/package.json", pkg("9.0.0"));
  f.put("packages/untracked/package.json", pkg("9.0.0"));
  pass(f.gate("smoke", "--staged-only"));
});

test("Given fleet drift, When full validation starts, Then fail before dependency hydration or expensive suites", (t) => {
  const f = gateFixture(t);
  f.put("packages/b/package.json", pkg("9.0.0"));
  const result = f.gate("full");
  fail(result, /Pi host contract drift/);
  assert.doesNotMatch(result.stderr, /Cannot find module|MODULE_NOT_FOUND/);
});

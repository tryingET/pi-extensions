// ---
// summary: "Tests registry-integrity alignment of the host package set and the run-bound canary evidence file."
// read_when:
//   - "Changing expected integrity parsing, integrity-aware alignment, evidence pass criteria, or request ids."
// ---
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import test from "node:test";
import { describeHostAlignment, EXPECTED_INTEGRITY_ENV, parseExpectedIntegrity, withExpectedIntegrity } from "./host-state.mjs";
import { buildRunEvidence, evidenceOutcome, resolveRequestId, writeRunEvidence } from "./evidence.mjs";
import { loadManifest, resolveProfileHost, validateManifest } from "./manifest.mjs";
import { DEFAULT_MANIFEST_PATH, ROOT } from "./paths.mjs";

// Unit tests only: synthetic trees, no package manager and no canonical-checkout lock.

const OWNERS = [
  "@earendil-works/pi-coding-agent",
  "@earendil-works/pi-ai",
  "@earendil-works/pi-tui",
  "@earendil-works/pi-agent-core",
];
const VERSION = "1.4.0";
const sri = (seed) => `sha512-${Buffer.alloc(64, seed).toString("base64")}`;
const EXPECTED = Object.fromEntries(OWNERS.map((name, index) => [name, sri(index + 1)]));
const tarball = (name, registry = "https://registry.npmjs.org/") =>
  `${registry}${name}/-/${name.split("/")[1]}-${VERSION}.tgz`;
const host = (expectedIntegrity) => ({
  packageName: OWNERS[0], companionPackages: OWNERS.slice(1), version: VERSION,
  ...(expectedIntegrity ? { expectedIntegrity } : {}),
});

function scratch(t, prefix) {
  const dir = mkdtempSync(path.join(tmpdir(), prefix));
  t.after(() => rmSync(dir, { recursive: true, force: true }));
  return dir;
}

// Synthetic installed tree: package.json versions plus npm's hidden lockfile.
function installedTree(t, { integrity = EXPECTED, resolved = tarball, hiddenLock = true } = {}) {
  const cwd = scratch(t, "pi-host-integrity-");
  const packages = {};
  for (const name of OWNERS) {
    const dir = path.join(cwd, "node_modules", ...name.split("/"));
    mkdirSync(dir, { recursive: true });
    writeFileSync(path.join(dir, "package.json"), JSON.stringify({ name, version: VERSION }));
    packages[`node_modules/${name}`] = { version: VERSION, resolved: resolved(name), integrity: integrity[name] };
  }
  if (hiddenLock) {
    writeFileSync(path.join(cwd, "node_modules", ".package-lock.json"),
      JSON.stringify({ name: "fixture", lockfileVersion: 3, packages }));
  }
  return cwd;
}

test("expected integrity is optional and must name exactly the host package set with sha512", () => {
  assert.equal(parseExpectedIntegrity(undefined, OWNERS), undefined);
  assert.equal(parseExpectedIntegrity("  ", OWNERS), undefined);
  assert.deepEqual(parseExpectedIntegrity(JSON.stringify(EXPECTED), OWNERS), EXPECTED);
  const without = { ...EXPECTED };
  delete without[OWNERS[3]];
  for (const [label, raw, pattern] of [
    ["not JSON", "{", /JSON object/],
    ["array", "[]", /JSON object/],
    ["missing owner", JSON.stringify(without), /must name exactly/],
    ["extra package", JSON.stringify({ ...EXPECTED, other: sri(9) }), /must name exactly/],
    ["sha1", JSON.stringify({ ...EXPECTED, [OWNERS[1]]: "sha1-abc=" }), /single sha512.*pi-ai/],
    ["two hashes", JSON.stringify({ ...EXPECTED, [OWNERS[2]]: `${sri(3)} ${sri(4)}` }), /single sha512.*pi-tui/],
  ]) {
    assert.throws(() => parseExpectedIntegrity(raw, OWNERS), pattern, label);
  }
});

test("the run host carries expected integrity from the environment only when set", () => {
  const manifest = validateManifest(loadManifest(DEFAULT_MANIFEST_PATH), DEFAULT_MANIFEST_PATH);
  const base = resolveProfileHost(manifest, "current");
  assert.equal("expectedIntegrity" in withExpectedIntegrity(base, {}), false);
  assert.deepEqual(withExpectedIntegrity(base, { [EXPECTED_INTEGRITY_ENV]: JSON.stringify(EXPECTED) }).expectedIntegrity, EXPECTED);
  assert.throws(() => withExpectedIntegrity(base, { [EXPECTED_INTEGRITY_ENV]: "{\"x\":1}" }), /must name exactly/);
});

test("matching registry integrity keeps the host package set aligned and is reported", (t) => {
  const alignment = describeHostAlignment(host(EXPECTED), installedTree(t));
  assert.equal(alignment.aligned, true);
  for (const state of alignment.packages) {
    assert.equal(state.installedIntegrity, EXPECTED[state.packageName]);
    assert.equal(state.resolved, tarball(state.packageName));
    assert.equal(state.integrityAligned, true);
  }
});

for (const [label, options, culprit] of [
  ["a different tarball for the same version", { integrity: { ...EXPECTED, [OWNERS[3]]: sri(42) } }, OWNERS[3]],
  ["a tarball from another registry", { resolved: (name) => tarball(name, name === OWNERS[1] ? "https://mirror.example.test/" : undefined) }, OWNERS[1]],
]) {
  test(`integrity alignment fails for ${label} even though every version matches`, (t) => {
    const alignment = describeHostAlignment(host(EXPECTED), installedTree(t, options));
    assert.equal(alignment.aligned, false);
    assert.deepEqual(alignment.packages.filter((state) => !state.aligned).map((state) => state.packageName), [culprit]);
    assert.ok(alignment.packages.every((state) => state.installedVersion === VERSION));
  });
}

test("integrity alignment fails closed when npm recorded no hidden lockfile", (t) => {
  const alignment = describeHostAlignment(host(EXPECTED), installedTree(t, { hiddenLock: false }));
  assert.equal(alignment.aligned, false);
  assert.ok(alignment.packages.every((state) => state.installedIntegrity === null && !state.aligned));
});

test("without expected integrity the version-only alignment shape is unchanged", (t) => {
  const alignment = describeHostAlignment(host(), installedTree(t, { integrity: {} }));
  assert.equal(alignment.aligned, true);
  assert.deepEqual(Object.keys(alignment.packages[0]), ["packageName", "expectedVersion", "installedVersion", "aligned"]);
});

const passed = (id) => ({ id, status: "passed", exitCode: 0 });
const payload = (overrides = {}) => ({
  profile: "upgrade", host: host(EXPECTED), dryRun: false, aborted: false,
  requestedScenarioIds: ["a", "b"], results: [passed("a"), passed("b")],
  summary: { selected: 2, passed: 2, failed: 0, dryRun: 0 }, ...overrides,
});

test("evidence passes only when every requested scenario ran and passed", () => {
  const outcome = (p, error) => evidenceOutcome({ payload: p, error, requested: p?.requestedScenarioIds ?? [] });
  assert.deepEqual(outcome(payload()), { outcome: "passed", reasons: [] });
  assert.deepEqual(outcome(payload({ requestedScenarioIds: [], results: [], summary: { selected: 0, passed: 0, failed: 0, dryRun: 0 } })),
    { outcome: "failed", reasons: ["no-scenarios-executed"] });
  assert.deepEqual(outcome(payload({ results: [passed("a")] })).reasons, ["requested-scenarios-not-run"]);
  assert.deepEqual(outcome(payload({ results: [passed("a"), { id: "b", status: "failed" }], summary: { selected: 2, passed: 1, failed: 1, dryRun: 0 } })).reasons,
    ["scenario-failed", "non-passing-result"]);
  assert.deepEqual(outcome(payload({ aborted: true, abortReason: "restoration-failed" })).reasons, ["aborted:restoration-failed"]);
  assert.deepEqual(outcome(undefined, new Error("boom")), { outcome: "error", reasons: ["run-error"] });
  assert.equal(outcome(payload({ dryRun: true })).outcome, "dry-run");
});

test("evidence binds run identities, replaces output with digests, and never overwrites", (t) => {
  const env = { GITHUB_RUN_ID: "77", GITHUB_RUN_ATTEMPT: "2", GITHUB_SHA: "abc", GITHUB_REPOSITORY: "o/r" };
  const evidence = buildRunEvidence({
    payload: payload({ results: [{ ...passed("a"), stdout: "out", stderr: "" }], requestedScenarioIds: ["a"] }),
    requestId: "req-1", options: {}, env, now: new Date("2026-11-15T00:00:00Z"),
  });
  assert.equal(evidence.schema, "pi-host-compat-canary-evidence/v1");
  assert.equal(evidence.requestId, "req-1");
  assert.deepEqual([evidence.github.runId, evidence.github.runAttempt, evidence.github.sha], ["77", "2", "abc"]);
  assert.deepEqual(evidence.host.expectedIntegrity, EXPECTED);
  assert.equal(evidence.results[0].stdout, undefined);
  assert.equal(evidence.results[0].stdoutDigest.bytes, 3);
  assert.match(evidence.results[0].stdoutDigest.sha256, /^[0-9a-f]{64}$/);
  assert.deepEqual(evidence.scenarios, { requested: ["a"], executed: [{ id: "a", status: "passed" }], notRun: [] });
  const errorEvidence = buildRunEvidence({ error: Object.assign(new Error("locked"), { code: "PI_HOST_COMPAT_CONCURRENT" }),
    requestId: null, options: { profile: "current", scenarioIds: ["a"] }, env: {} });
  assert.equal(errorEvidence.outcome, "error");
  assert.deepEqual(errorEvidence.scenarios.notRun, ["a"]);
  assert.equal(errorEvidence.error.code, "PI_HOST_COMPAT_CONCURRENT");
  const file = path.join(scratch(t, "pi-host-evidence-"), "nested", "e.json");
  writeRunEvidence(file, evidence);
  assert.equal(JSON.parse(readFileSync(file, "utf8")).requestId, "req-1");
  assert.throws(() => writeRunEvidence(file, evidence), /EEXIST/);
});

test("request ids are optional and bounded to a safe character set", () => {
  assert.equal(resolveRequestId(undefined), null);
  assert.equal(resolveRequestId(""), null);
  assert.equal(resolveRequestId("AK8727.pilot-1_a"), "AK8727.pilot-1_a");
  for (const bad of ["has space", "a/b", "x".repeat(65), "line\nbreak", "$(id)"]) {
    assert.throws(() => resolveRequestId(bad), /PI_HOST_COMPAT_REQUEST_ID/);
  }
});

const CLI = path.join(ROOT, "scripts/pi-host-compatibility-canary.mjs");
const cli = (args, env = {}) => spawnSync(process.execPath, [CLI, ...args], {
  cwd: ROOT, encoding: "utf8", env: { ...process.env, ...env }, timeout: 30000,
});

test("CLI rejects evidence-out outside run and invalid request ids before any host effect", (t) => {
  const out = path.join(scratch(t, "pi-host-evidence-cli-"), "e.json");
  const listed = cli(["list", "--evidence-out", out]);
  assert.equal(listed.status, 1);
  assert.match(listed.stderr, /--evidence-out is only valid with run/);
  const bad = cli(["run", "--dry-run", "--evidence-out", out], { PI_HOST_COMPAT_REQUEST_ID: "bad id" });
  assert.equal(bad.status, 1);
  assert.match(bad.stderr, /PI_HOST_COMPAT_REQUEST_ID/);
  assert.equal(existsSync(out), false);
});

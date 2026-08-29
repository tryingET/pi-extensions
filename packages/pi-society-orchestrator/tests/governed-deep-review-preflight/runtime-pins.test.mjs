/**
 * summary: "Governed deep-review preflight coverage (runtime pins); split from governed-deep-review-preflight.test.mjs."
 * read_when:
 *   - "changing runtime pins governed preflight verification."
 */
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import test from "node:test";
import {
  classifyGovernedRuntimeAscRegistryOwnerEvidence,
  classifyGovernedRuntimeHostLockEvidence,
  GOVERNED_RUNTIME_ASC_REGISTRY_OWNER,
  GOVERNED_RUNTIME_HOST_CACHE_TARBALLS,
  GOVERNED_RUNTIME_HOST_PEERS,
  GOVERNED_RUNTIME_HOST_VERSION,
  GOVERNED_RUNTIME_LOCAL_EDGES,
  GOVERNED_RUNTIME_REGISTRY_EDGES,
  GOVERNED_RUNTIME_TYPEBOX_INTEGRITY,
  GOVERNED_RUNTIME_TYPEBOX_VERSION,
  governedRuntimeCacheTarballName,
} from "../../src/runtime/governed-runtime-materialization.ts";
import { createHostLockFixture, SOURCE_ROOT } from "./helpers.mjs";

test("governed runtime pins match the Pi 0.84.3 lock identities", () => {
  const lock = JSON.parse(
    readFileSync(
      resolve(SOURCE_ROOT, "packages/pi-society-orchestrator/package-lock.json"),
      "utf8",
    ),
  );
  const lockedPackages = lock.packages ?? {};

  assert.equal(GOVERNED_RUNTIME_HOST_VERSION, "0.84.3");
  for (const [name, expected] of Object.entries(GOVERNED_RUNTIME_HOST_PEERS)) {
    const direct = lockedPackages[`node_modules/${name}`];
    const nested = Object.entries(lockedPackages).find(([packagePath]) =>
      packagePath.endsWith(`/node_modules/${name}`),
    )?.[1];
    const locked = direct ?? nested;
    assert.equal(locked?.version, GOVERNED_RUNTIME_HOST_VERSION, name);
    if (locked?.integrity !== undefined) assert.equal(locked.integrity, expected.integrity, name);
    assert.equal(GOVERNED_RUNTIME_HOST_CACHE_TARBALLS[name].integrity, expected.integrity, name);
  }

  assert.equal(GOVERNED_RUNTIME_TYPEBOX_VERSION, "1.3.7");
  const lockedTypebox = lockedPackages["node_modules/typebox"];
  assert.equal(lockedTypebox?.version, GOVERNED_RUNTIME_TYPEBOX_VERSION);
  assert.equal(lockedTypebox?.integrity, GOVERNED_RUNTIME_TYPEBOX_INTEGRITY);
});

test("cache-backed host closure pins all four Pi 0.84.3 runtime owners", () => {
  assert.deepEqual(Object.keys(GOVERNED_RUNTIME_HOST_CACHE_TARBALLS), [
    "@earendil-works/pi-ai",
    "@earendil-works/pi-agent-core",
    "@earendil-works/pi-coding-agent",
    "@earendil-works/pi-tui",
  ]);
  for (const expected of Object.values(GOVERNED_RUNTIME_HOST_CACHE_TARBALLS)) {
    assert.equal(expected.version, GOVERNED_RUNTIME_HOST_VERSION);
    assert.match(expected.url, /^https:\/\/registry\.npmjs\.org\//u);
    assert.match(expected.integrity, /^sha512-/u);
  }
});

test("ASC registry handoff atomically binds selector, regular lock, hidden lock, and graph class", () => {
  const manifest = JSON.parse(
    readFileSync(resolve(SOURCE_ROOT, "packages/pi-society-orchestrator/package.json"), "utf8"),
  );
  const regularLock = JSON.parse(
    readFileSync(
      resolve(SOURCE_ROOT, "packages/pi-society-orchestrator/package-lock.json"),
      "utf8",
    ),
  );
  const hiddenLock = JSON.parse(
    readFileSync(
      resolve(SOURCE_ROOT, "packages/pi-society-orchestrator/node_modules/.package-lock.json"),
      "utf8",
    ),
  );
  assert.deepEqual(
    classifyGovernedRuntimeAscRegistryOwnerEvidence(manifest, regularLock, hiddenLock),
    {
      name: GOVERNED_RUNTIME_ASC_REGISTRY_OWNER.name,
      version: GOVERNED_RUNTIME_ASC_REGISTRY_OWNER.version,
      selector: GOVERNED_RUNTIME_ASC_REGISTRY_OWNER.selector,
      url: GOVERNED_RUNTIME_ASC_REGISTRY_OWNER.url,
      integrity: GOVERNED_RUNTIME_ASC_REGISTRY_OWNER.integrity,
    },
  );
  assert.equal(
    GOVERNED_RUNTIME_LOCAL_EDGES.some(
      ({ expectedOwnerName }) => expectedOwnerName === GOVERNED_RUNTIME_ASC_REGISTRY_OWNER.name,
    ),
    false,
  );
  assert.deepEqual(
    GOVERNED_RUNTIME_REGISTRY_EDGES.map(({ specifier }) => specifier),
    [...GOVERNED_RUNTIME_ASC_REGISTRY_OWNER.specifiers],
  );

  const driftedHiddenLock = structuredClone(hiddenLock);
  driftedHiddenLock.packages[`node_modules/${GOVERNED_RUNTIME_ASC_REGISTRY_OWNER.name}`].version =
    "0.5.1";
  assert.throws(
    () => classifyGovernedRuntimeAscRegistryOwnerEvidence(manifest, regularLock, driftedHiddenLock),
    (error) => error?.failureClass === "materialization_registry_owner_lock_mismatch",
  );
});

test("host provenance is derived from all four regular and hidden lock entries", () => {
  const registry = createHostLockFixture("registry_resolution");
  assert.equal(
    classifyGovernedRuntimeHostLockEvidence(registry.manifest, registry.regular, registry.hidden)
      .kind,
    "registry_resolution",
  );
  const cache = createHostLockFixture("verified_cache_tarballs");
  assert.equal(
    classifyGovernedRuntimeHostLockEvidence(cache.manifest, cache.regular, cache.hidden).kind,
    "verified_cache_tarballs",
  );

  const packageName = "@earendil-works/pi-agent-core";
  const expected = GOVERNED_RUNTIME_HOST_CACHE_TARBALLS[packageName];
  const tarballName = governedRuntimeCacheTarballName(packageName, expected.version);
  const selector = `file:tarballs/${tarballName}`;
  registry.manifest.dependencies[packageName] = selector;
  registry.regular.packages[""].dependencies[packageName] = selector;
  registry.regular.packages[`node_modules/${packageName}`].resolved = selector;
  registry.hidden.packages[`node_modules/${packageName}`].resolved = selector;
  assert.throws(
    () =>
      classifyGovernedRuntimeHostLockEvidence(registry.manifest, registry.regular, registry.hidden),
    (error) => error?.failureClass === "materialization_host_lock_mixed_provenance",
  );
});

/**
 * Provisions a self-contained governed-npm posture instead of borrowing the
 * operator's ambient environment. The gate must not depend on machine-local
 * ~/.npmrc contents (min-release-age) or an exported TMPDIR; a fresh CI runner
 * has neither, which made these tests fail there while passing locally.
 */

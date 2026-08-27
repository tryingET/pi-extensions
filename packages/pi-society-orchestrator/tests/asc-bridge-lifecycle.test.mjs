import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import test from "node:test";
import {
  ASC_MINIMUM_RELEASE_AGE_MS,
  ASC_PACKAGE_NAME,
  classifyAscBridgeLifecycle,
  evaluateAscBridgeLifecycle,
  evaluateAscRegistryLock,
  formatAscBridgeLifecycleSummary,
  isMinimumReleaseAgeExempt,
  lookupAscRegistryArtifact,
  lookupAscRegistryReleaseState,
  parseAscRegistryArtifactLookup,
  parseAscRegistryReleaseStateLookup,
  versionSatisfiesAscRange,
} from "../scripts/validate-asc-bridge-lifecycle.mjs";

const REGISTRY_NOW = new Date("2026-08-23T18:13:50.000Z");
const ASC_051_INTEGRITY =
  "sha512-wNRFFqKEEyxtTwujf2lOBGF1aaYNmS2lUOyNlUtJDsBojfk/AuIOZGrnRArF9d2jTjzkqh+Cwogr/DXeGpvRUA==";
const ASC_052_INTEGRITY =
  "sha512-y+RvaTMca0VoMDI66TwLx5RzdTQGvov4a7MbrGKFXWNaXa86Ml9n3O/b812s+5pFIJOibWF7WAbM4n5uPaV7Nw==";

function createManifest(ascSpec = "^0.5.0", overrides = {}) {
  return {
    name: "@tryinget/pi-society-orchestrator",
    dependencies: {
      [ASC_PACKAGE_NAME]: ascSpec,
      "@tryinget/pi-vault-client": "file:../pi-vault-client",
    },
    ...overrides,
  };
}

function ascTarball(version) {
  return `https://registry.npmjs.org/@tryinget/pi-autonomous-session-control/-/pi-autonomous-session-control-${version}.tgz`;
}

function createRegistryLock(version = "0.5.2", overrides = {}) {
  return {
    lockfileVersion: 3,
    packages: {
      "": { dependencies: { [ASC_PACKAGE_NAME]: "^0.5.0" } },
      [`node_modules/${ASC_PACKAGE_NAME}`]: {
        version,
        resolved: ascTarball(version),
        integrity:
          overrides.integrity ?? (version === "0.5.1" ? ASC_051_INTEGRITY : ASC_052_INTEGRITY),
        ...overrides,
      },
    },
  };
}

function createRegistryReleaseState() {
  return {
    versions: ["0.5.0", "0.5.1", "0.5.2"],
    time: {
      "0.5.0": "2026-08-15T18:01:22.673Z",
      "0.5.1": "2026-08-16T08:07:41.295Z",
      "0.5.2": "2026-08-20T18:26:40.021Z",
    },
  };
}

function createRegistryArtifact(
  version = "0.5.2",
  integrity = version === "0.5.1" ? ASC_051_INTEGRITY : ASC_052_INTEGRITY,
) {
  return {
    version,
    dist: {
      tarball: ascTarball(version),
      integrity,
      signatures: [{ keyid: "registry-key", sig: "registry-signature" }],
      attestations: {
        url: `https://registry.npmjs.org/-/npm/v1/attestations/${version}`,
        provenance: { predicateType: "https://slsa.dev/provenance/v1" },
      },
    },
  };
}

function evaluateLock({ version = "0.5.2", lock, artifact, now = REGISTRY_NOW, packageName } = {}) {
  return evaluateAscRegistryLock({
    pkg: createManifest(),
    lock: lock ?? createRegistryLock(version),
    registryReleaseState: createRegistryReleaseState(),
    registryArtifact: artifact ?? createRegistryArtifact(version),
    packageName,
    now,
  });
}

test("classifyAscBridgeLifecycle accepts only the retired-bundle registry topology", () => {
  const result = classifyAscBridgeLifecycle(createManifest());
  assert.equal(result.ok, true);
  assert.equal(result.mode, "registry-cutover");
  assert.equal(result.ascSpec, "^0.5.0");
  assert.deepEqual(result.bundledDependencies, []);
});

test("classifyAscBridgeLifecycle rejects local ASC dependencies after cutover", () => {
  for (const ascSpec of [
    "file:../pi-autonomous-session-control",
    "../pi-autonomous-session-control",
    "/workspace/pi-autonomous-session-control",
  ]) {
    const result = classifyAscBridgeLifecycle(createManifest(ascSpec));
    assert.equal(result.ok, false, `expected ${ascSpec} to fail closed`);
    assert.equal(result.mode, "invalid");
    assert.match(result.issues.join("\n"), /forbidden after registry cutover/i);
  }
});

test("classifyAscBridgeLifecycle rejects non-semver selectors", () => {
  for (const ascSpec of [
    "latest",
    "https://example.invalid/asc.tgz",
    "git+https://example.invalid/asc.git",
  ]) {
    const result = classifyAscBridgeLifecycle(createManifest(ascSpec));
    assert.equal(result.ok, false, `expected ${ascSpec} to fail closed`);
    assert.match(result.issues.join("\n"), /not a supported registry semver selector/i);
  }
});

test("classifyAscBridgeLifecycle rejects any revived bundle", () => {
  const result = classifyAscBridgeLifecycle(
    createManifest("^0.5.0", { bundleDependencies: [ASC_PACKAGE_NAME, "left-pad"] }),
  );
  assert.equal(result.ok, false);
  assert.match(result.issues.join("\n"), /Unexpected bundled dependencies.*left-pad/i);
  assert.match(result.issues.join("\n"), /must remain retired/i);
});

test("versionSatisfiesAscRange implements exact and caret zero-major ranges", () => {
  assert.equal(versionSatisfiesAscRange("0.5.0", "^0.5.0"), true);
  assert.equal(versionSatisfiesAscRange("0.5.9", "^0.5.0"), true);
  assert.equal(versionSatisfiesAscRange("0.6.0", "^0.5.0"), false);
  assert.equal(versionSatisfiesAscRange("1.2.9", "^1.2.3"), true);
  assert.equal(versionSatisfiesAscRange("2.0.0", "^1.2.3"), false);
  assert.equal(versionSatisfiesAscRange("0.5.1", "0.5.1"), true);
  assert.equal(versionSatisfiesAscRange("0.5.2", "0.5.1"), false);
  assert.equal(versionSatisfiesAscRange("not-semver", "^0.5.0"), false);
});

test("evaluateAscBridgeLifecycle requires a satisfying published release", () => {
  const missing = evaluateAscBridgeLifecycle({ pkg: createManifest(), publishedAscVersions: [] });
  assert.equal(missing.ok, false);
  assert.match(missing.issues.join("\n"), /no proven satisfying published version/i);

  const unrelated = evaluateAscBridgeLifecycle({
    pkg: createManifest(),
    publishedAscVersions: ["0.4.0"],
  });
  assert.equal(unrelated.ok, false);
  assert.match(unrelated.issues.join("\n"), /does not satisfy/i);

  const valid = evaluateAscBridgeLifecycle({
    pkg: createManifest(),
    publishedAscVersions: ["0.5.0", "0.5.1"],
  });
  assert.equal(valid.ok, true);
  assert.match(formatAscBridgeLifecycleSummary(valid, ["0.5.0", "0.5.1"]), /registry-backed/);
});

test("registry metadata lookups request release times and exact artifact provenance", () => {
  const calls = [];
  const stateResult = lookupAscRegistryReleaseState((command, args, options) => {
    calls.push({ command, args, options });
    return { status: 0, stdout: JSON.stringify(createRegistryReleaseState()), stderr: "" };
  });
  const artifactResult = lookupAscRegistryArtifact("0.5.1", (command, args, options) => {
    calls.push({ command, args, options });
    return { status: 0, stdout: JSON.stringify(createRegistryArtifact("0.5.1")), stderr: "" };
  });

  assert.equal(stateResult.ok, true);
  assert.equal(artifactResult.ok, true);
  assert.deepEqual(calls[0].args, [
    "view",
    ASC_PACKAGE_NAME,
    "versions",
    "time",
    "--json",
    "--registry",
    "https://registry.npmjs.org/",
  ]);
  assert.deepEqual(calls[1].args, [
    "view",
    `${ASC_PACKAGE_NAME}@0.5.1`,
    "version",
    "dist",
    "--json",
    "--registry",
    "https://registry.npmjs.org/",
  ]);
  assert.equal(calls[0].command, "npm");
  assert.equal(calls[0].options.encoding, "utf8");
});

test("registry metadata parsers accept npm 11 objects and npm 12 singleton arrays", () => {
  const releaseState = createRegistryReleaseState();
  const artifact = createRegistryArtifact("0.5.1");

  for (const output of [releaseState, [releaseState]]) {
    const result = parseAscRegistryReleaseStateLookup({
      status: 0,
      stdout: JSON.stringify(output),
      stderr: "",
    });
    assert.equal(result.ok, true);
    assert.deepEqual(result.versions, releaseState.versions);
    assert.deepEqual(result.time, releaseState.time);
  }

  for (const output of [artifact, [artifact]]) {
    const result = parseAscRegistryArtifactLookup(
      { status: 0, stdout: JSON.stringify(output), stderr: "" },
      "0.5.1",
    );
    assert.equal(result.ok, true);
    assert.deepEqual(result.artifact, artifact);
  }
});

test("registry metadata parsers reject malformed or ambiguous npm multi-field arrays", () => {
  const releaseState = createRegistryReleaseState();
  const artifact = createRegistryArtifact("0.5.1");

  for (const output of [[], [null], [[releaseState]], [releaseState, releaseState]]) {
    const result = parseAscRegistryReleaseStateLookup({
      status: 0,
      stdout: JSON.stringify(output),
      stderr: "",
    });
    assert.equal(result.ok, false, `expected release state to reject ${JSON.stringify(output)}`);
    assert.deepEqual(result.versions, []);
    assert.deepEqual(result.time, {});
  }

  for (const output of [[], [null], [[artifact]], [artifact, artifact]]) {
    const result = parseAscRegistryArtifactLookup(
      { status: 0, stdout: JSON.stringify(output), stderr: "" },
      "0.5.1",
    );
    assert.equal(result.ok, false, `expected artifact to reject ${JSON.stringify(output)}`);
  }
});

test("registry metadata parsers fail closed", () => {
  for (const stdout of ["", "not-json", "{}", '{"versions":["0.5.1"],"time":{}}']) {
    assert.equal(
      parseAscRegistryReleaseStateLookup({ status: 0, stdout, stderr: "" }).ok,
      false,
      `expected release state to fail: ${stdout}`,
    );
  }
  assert.equal(
    parseAscRegistryReleaseStateLookup({ status: 1, stdout: "", stderr: "npm E404" }).ok,
    false,
  );
  assert.equal(
    parseAscRegistryArtifactLookup({ status: 0, stdout: "{}", stderr: "" }, "0.5.1").ok,
    false,
  );
  assert.equal(
    parseAscRegistryArtifactLookup({ status: 1, stdout: "", stderr: "npm ETARGET" }, "0.5.1").ok,
    false,
  );
});

test("evaluateAscRegistryLock accepts the latest published @tryinget artifact immediately", () => {
  const result = evaluateLock();
  assert.equal(ASC_MINIMUM_RELEASE_AGE_MS, 604_800_000);
  assert.equal(isMinimumReleaseAgeExempt(ASC_PACKAGE_NAME), true);
  assert.equal(result.ok, true);
  assert.equal(result.ageExempt, true);
  assert.equal(result.selectedVersion, "0.5.2");
  assert.equal(result.latestEligibleVersion, "0.5.2");
  assert.equal(result.publishedAt, "2026-08-20T18:26:40.021Z");
  assert.deepEqual(result.issues, []);
});

test("evaluateAscRegistryLock rejects a local-link lock regression", () => {
  const lock = createRegistryLock("0.5.1", {
    resolved: "../pi-autonomous-session-control",
    link: true,
  });
  lock.packages["../pi-autonomous-session-control"] = {
    name: ASC_PACKAGE_NAME,
    version: "0.5.1",
  };
  const result = evaluateLock({ lock });
  assert.equal(result.ok, false);
  assert.match(result.issues.join("\n"), /local link/i);
  assert.match(result.issues.join("\n"), /canonical npm registry tarball/i);
  assert.match(result.issues.join("\n"), /non-registry\/local entries/i);
});

test("evaluateAscRegistryLock rejects a stale owner-scoped selection", () => {
  const alternateIntegrity = "sha512-YWJjZA==";
  const stale = evaluateLock({
    version: "0.5.1",
    lock: createRegistryLock("0.5.1", { integrity: alternateIntegrity }),
    artifact: createRegistryArtifact("0.5.1", alternateIntegrity),
  });
  assert.equal(stale.ok, false);
  assert.equal(stale.latestEligibleVersion, "0.5.2");
  assert.match(stale.issues.join("\n"), /latest published.*0\.5\.2/i);
});

test("evaluateAscRegistryLock still applies the age floor to non-@tryinget artifacts", () => {
  const result = evaluateLock({
    version: "0.5.2",
    packageName: "fast-xml-parser",
  });
  assert.equal(isMinimumReleaseAgeExempt("fast-xml-parser"), false);
  assert.equal(result.ok, false);
  assert.equal(result.ageExempt, false);
  assert.equal(result.latestEligibleVersion, "0.5.1");
  assert.match(result.issues.join("\n"), /inside the seven-day minimum-release-age floor/i);
});

test("evaluateAscRegistryLock requires integrity, signatures, and SLSA provenance", () => {
  const artifact = createRegistryArtifact();
  artifact.dist.integrity = "sha512-YWJjZA==";
  artifact.dist.signatures = [];
  delete artifact.dist.attestations;
  const result = evaluateLock({ artifact });
  assert.equal(result.ok, false);
  assert.match(result.issues.join("\n"), /integrity does not match/i);
  assert.match(result.issues.join("\n"), /SLSA provenance/i);
  assert.match(result.issues.join("\n"), /registry signatures/i);
});

test("checked-in ASC lock records the proven registry artifact", () => {
  const packageDir = path.resolve(import.meta.dirname, "..");
  const pkg = JSON.parse(fs.readFileSync(path.join(packageDir, "package.json"), "utf8"));
  const lock = JSON.parse(fs.readFileSync(path.join(packageDir, "package-lock.json"), "utf8"));
  const result = evaluateAscRegistryLock({
    pkg,
    lock,
    registryReleaseState: createRegistryReleaseState(),
    registryArtifact: createRegistryArtifact("0.5.2"),
    now: REGISTRY_NOW,
  });
  const entry = lock.packages[`node_modules/${ASC_PACKAGE_NAME}`];
  assert.equal(result.ok, true, result.issues.join("\n"));
  assert.equal(entry.link, undefined);
  assert.equal(entry.version, "0.5.2");
  assert.equal(entry.resolved, ascTarball("0.5.2"));
  assert.equal(entry.integrity, ASC_052_INTEGRITY);
});

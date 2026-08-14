import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import test from "node:test";
import {
  ASC_PACKAGE_NAME,
  ascRegistrySelector,
  classifyAscBridgeLifecycle,
  evaluateAscBridgeLifecycle,
  formatAscBridgeLifecycleSummary,
  lookupPublishedAscVersions,
  parsePublishedPackageVersionLookup,
  versionSatisfiesAscRange,
} from "../scripts/validate-asc-bridge-lifecycle.mjs";

function createManifest(overrides = {}) {
  return {
    name: "@tryinget/pi-society-orchestrator",
    dependencies: {
      [ASC_PACKAGE_NAME]: "file:../pi-autonomous-session-control",
      "@tryinget/pi-vault-client": "file:../pi-vault-client",
      ...(overrides.dependencies || {}),
    },
    bundleDependencies: [ASC_PACKAGE_NAME],
    ...(overrides.bundleDependencies ? { bundleDependencies: overrides.bundleDependencies } : {}),
    ...(overrides.bundledDependencies
      ? { bundledDependencies: overrides.bundledDependencies }
      : {}),
  };
}

test("classifyAscBridgeLifecycle accepts the current transitional bundled bridge", () => {
  const result = classifyAscBridgeLifecycle(createManifest());

  assert.equal(result.ok, true);
  assert.equal(result.mode, "transitional-bundled-bridge");
  assert.equal(result.ascSpec, "file:../pi-autonomous-session-control");
  assert.deepEqual(result.issues, []);
});

test("evaluateAscBridgeLifecycle keeps the transitional bridge quiet while the intended cutover version is unpublished", () => {
  // Cutover-aware trigger: the workspace ASC version (>= the fixture's
  // published 0.1.0-era baseline) is not yet on the registry, so the
  // transitional bundled bridge remains the sanctioned state.
  const result = evaluateAscBridgeLifecycle({
    pkg: createManifest(),
    publishedAscVersions: ["0.1.0"],
  });

  assert.equal(result.ok, true);
  assert.equal(result.classification.mode, "transitional-bundled-bridge");
  assert.deepEqual(result.issues, []);
});

test("evaluateAscBridgeLifecycle blocks the transitional bridge once the cutover version is published", () => {
  const result = evaluateAscBridgeLifecycle({
    pkg: createManifest(),
    publishedAscVersions: [readWorkspaceAscVersionForTest()],
  });

  assert.equal(result.ok, false);
  assert.equal(result.classification.mode, "transitional-bundled-bridge");
  assert.match(result.issues.join("\n"), /is visible/);
});

function readWorkspaceAscVersionForTest() {
  const manifestPath = path.resolve(
    import.meta.dirname,
    "../../pi-autonomous-session-control/package.json",
  );
  return JSON.parse(fs.readFileSync(manifestPath, "utf8")).version;
}

test("classifyAscBridgeLifecycle accepts the registry-backed cutover topology", () => {
  const result = classifyAscBridgeLifecycle(
    createManifest({
      dependencies: {
        [ASC_PACKAGE_NAME]: "^0.1.0",
      },
      bundleDependencies: [],
    }),
  );

  assert.equal(result.ok, true);
  assert.equal(result.mode, "registry-cutover");
  assert.deepEqual(result.issues, []);
});

test("classifyAscBridgeLifecycle rejects mixed local-file without bundle topology", () => {
  const result = classifyAscBridgeLifecycle(
    createManifest({
      bundleDependencies: [],
    }),
  );

  assert.equal(result.ok, false);
  assert.equal(result.mode, "invalid");
  assert.match(result.issues.join("\n"), /must keep bundleDependencies aligned/i);
});

test("classifyAscBridgeLifecycle rejects unbundled raw local paths and non-semver registry specs", () => {
  for (const ascSpec of [
    "../pi-autonomous-session-control",
    "/workspace/pi-autonomous-session-control",
    "latest",
    "https://example.invalid/asc.tgz",
    "git+https://example.invalid/asc.git",
  ]) {
    const result = classifyAscBridgeLifecycle(
      createManifest({
        dependencies: { [ASC_PACKAGE_NAME]: ascSpec },
        bundleDependencies: [],
      }),
    );
    assert.equal(result.ok, false, `expected ${ascSpec} to fail closed`);
    assert.equal(result.mode, "invalid");
  }
});

test("classifyAscBridgeLifecycle rejects semver plus bundle topology", () => {
  const result = classifyAscBridgeLifecycle(
    createManifest({
      dependencies: {
        [ASC_PACKAGE_NAME]: "^0.1.0",
      },
    }),
  );

  assert.equal(result.ok, false);
  assert.equal(result.mode, "invalid");
  assert.match(
    result.issues.join("\n"),
    /must be removed once orchestrator consumes it as a normal dependency/i,
  );
});

test("classifyAscBridgeLifecycle rejects unrelated extra bundled dependencies", () => {
  const result = classifyAscBridgeLifecycle(
    createManifest({
      bundleDependencies: [ASC_PACKAGE_NAME, "left-pad"],
    }),
  );

  assert.equal(result.ok, false);
  assert.equal(result.mode, "transitional-bundled-bridge");
  assert.match(result.issues.join("\n"), /Unexpected bundled dependencies present: left-pad/);
});

test("parsePublishedPackageVersionLookup accepts npm string and array response shapes", () => {
  const selector = `${ASC_PACKAGE_NAME}@^0.4.0`;
  assert.deepEqual(
    parsePublishedPackageVersionLookup(
      { status: 0, stdout: '"0.4.1"\n', stderr: "" },
      selector,
      "^0.4.0",
    ),
    { ok: true, versions: ["0.4.1"] },
  );
  assert.deepEqual(
    parsePublishedPackageVersionLookup(
      { status: 0, stdout: '["0.4.0", "0.4.1", "0.4.1"]\n', stderr: "" },
      selector,
      "^0.4.0",
    ),
    { ok: true, versions: ["0.4.0", "0.4.1"] },
  );
});

test("parsePublishedPackageVersionLookup fails closed for E404 and ETARGET", () => {
  const selector = `${ASC_PACKAGE_NAME}@^0.4.0`;
  const e404 = parsePublishedPackageVersionLookup(
    {
      status: 1,
      stdout: "",
      stderr: "npm error code E404\nnpm error 404 Not Found - package not found\n",
    },
    selector,
  );
  assert.equal(e404.ok, false);
  assert.deepEqual(e404.versions, []);
  assert.match(e404.error, /E404/);

  const etarget = parsePublishedPackageVersionLookup(
    {
      status: 1,
      stdout: "",
      stderr: "npm error code ETARGET\nnpm error No matching version found\n",
    },
    selector,
  );
  assert.equal(etarget.ok, false);
  assert.deepEqual(etarget.versions, []);
  assert.match(etarget.error, /ETARGET/);
});

test("parsePublishedPackageVersionLookup fails closed for malformed and empty responses", () => {
  const selector = `${ASC_PACKAGE_NAME}@^0.4.0`;
  for (const stdout of ["", "not-json", "{}", "[]", '["0.4.0", null]']) {
    const result = parsePublishedPackageVersionLookup({ status: 0, stdout, stderr: "" }, selector);
    assert.equal(result.ok, false, `expected response to fail closed: ${stdout}`);
    assert.deepEqual(result.versions, []);
    assert.ok(result.error.length > 0);
  }
});

test("parsePublishedPackageVersionLookup rejects invalid or range-mismatched versions", () => {
  const selector = `${ASC_PACKAGE_NAME}@^0.4.0`;
  for (const stdout of ['"not-semver"', '"0.3.0"', '["0.4.0", "0.5.0"]']) {
    const result = parsePublishedPackageVersionLookup(
      { status: 0, stdout, stderr: "" },
      selector,
      "^0.4.0",
    );
    assert.equal(result.ok, false, `expected response to fail closed: ${stdout}`);
    assert.deepEqual(result.versions, []);
  }
});

test("versionSatisfiesAscRange implements the supported exact and caret range contract", () => {
  assert.equal(versionSatisfiesAscRange("0.4.0", "^0.4.0"), true);
  assert.equal(versionSatisfiesAscRange("0.4.9", "^0.4.0"), true);
  assert.equal(versionSatisfiesAscRange("0.5.0", "^0.4.0"), false);
  assert.equal(versionSatisfiesAscRange("1.2.9", "^1.2.3"), true);
  assert.equal(versionSatisfiesAscRange("2.0.0", "^1.2.3"), false);
  assert.equal(versionSatisfiesAscRange("0.4.0", "0.4.0"), true);
  assert.equal(versionSatisfiesAscRange("0.4.1", "0.4.0"), false);
  assert.equal(versionSatisfiesAscRange("not-semver", "^0.4.0"), false);
});

test("lookupPublishedAscVersions queries the declared range rather than package latest", () => {
  const calls = [];
  const result = lookupPublishedAscVersions("^0.4.0", (command, args, options) => {
    calls.push({ command, args, options });
    return {
      status: 1,
      stdout: "",
      stderr: "npm error code ETARGET\nnpm error No matching version found",
    };
  });

  assert.equal(ascRegistrySelector("^0.4.0"), `${ASC_PACKAGE_NAME}@^0.4.0`);
  assert.equal(result.ok, false);
  assert.match(result.error, /ETARGET/);
  assert.equal(calls.length, 1);
  assert.equal(calls[0].command, "npm");
  assert.deepEqual(calls[0].args, [
    "view",
    `${ASC_PACKAGE_NAME}@^0.4.0`,
    "version",
    "--json",
    "--registry",
    "https://registry.npmjs.org/",
  ]);
  assert.equal(calls[0].options.encoding, "utf8");
});

test("registry cutover cannot pass with no version satisfying the declared range", () => {
  const pkg = createManifest({
    dependencies: { [ASC_PACKAGE_NAME]: "^0.4.0" },
    bundleDependencies: [],
  });
  const evaluation = evaluateAscBridgeLifecycle({ pkg, publishedAscVersions: [] });

  assert.equal(evaluation.ok, false);
  assert.match(evaluation.issues.join("\n"), /no proven satisfying published version/i);
  assert.match(evaluation.issues.join("\n"), /unrelated registry versions/i);
});

test("registry cutover cannot pass with an unrelated published version", () => {
  const pkg = createManifest({
    dependencies: { [ASC_PACKAGE_NAME]: "^0.4.0" },
    bundleDependencies: [],
  });
  const evaluation = evaluateAscBridgeLifecycle({ pkg, publishedAscVersions: ["0.3.0"] });

  assert.equal(evaluation.ok, false);
  assert.match(evaluation.issues.join("\n"), /does not satisfy/i);
});

test("formatAscBridgeLifecycleSummary reports the proven satisfying registry versions", () => {
  const evaluation = evaluateAscBridgeLifecycle({
    pkg: createManifest({
      dependencies: { [ASC_PACKAGE_NAME]: "^0.4.0" },
      bundleDependencies: [],
    }),
    publishedAscVersions: ["0.4.0", "0.4.1"],
  });

  assert.equal(evaluation.ok, true);
  assert.match(
    formatAscBridgeLifecycleSummary(evaluation, ["0.4.0", "0.4.1"]),
    /registry-backed cutover; @tryinget\/pi-autonomous-session-control@0\.4\.0, 0\.4\.1 satisfies \^0\.4\.0/,
  );
});

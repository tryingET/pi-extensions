import assert from "node:assert/strict";
import test from "node:test";
import {
  ASC_PACKAGE_NAME,
  classifyAscBridgeLifecycle,
  evaluateAscBridgeLifecycle,
  formatAscBridgeLifecycleSummary,
  parsePublishedPackageVersionLookup,
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

test("evaluateAscBridgeLifecycle blocks the transitional bridge once ASC is published", () => {
  const result = evaluateAscBridgeLifecycle({
    pkg: createManifest(),
    publishedAscVersion: "0.1.0",
  });

  assert.equal(result.ok, false);
  assert.equal(result.classification.mode, "transitional-bundled-bridge");
  assert.match(result.issues.join("\n"), /0\.1\.0 is visible/);
});

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

test("parsePublishedPackageVersionLookup parses published and unpublished npm view results", () => {
  const published = parsePublishedPackageVersionLookup({
    status: 0,
    stdout: '"0.1.0"\n',
    stderr: "",
  });
  assert.deepEqual(published, { ok: true, published: true, version: "0.1.0" });

  const unpublished = parsePublishedPackageVersionLookup({
    status: 1,
    stdout: "",
    stderr:
      "npm error code E404\nnpm error 404 Not Found - GET https://registry.npmjs.org/@tryinget/pi-autonomous-session-control - Not found\n",
  });
  assert.deepEqual(unpublished, { ok: true, published: false });
});

test("formatAscBridgeLifecycleSummary reports the current mode and publish state", () => {
  const evaluation = evaluateAscBridgeLifecycle({
    pkg: createManifest(),
    publishedAscVersion: undefined,
  });

  assert.equal(evaluation.ok, true);
  assert.match(
    formatAscBridgeLifecycleSummary(evaluation, undefined),
    /transitional bundled bridge; @tryinget\/pi-autonomous-session-control is not yet published/,
  );
});

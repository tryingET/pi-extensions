import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import test from "node:test";

const HOST_BASELINE = "1.4.0";
const DEV_TEST_FLOOR = "1.4.0";
const TEMPLATE_SOURCE = "@tryinget/pi-extensions-package-template";
const HOST_PACKAGES = ["@earendil-works/pi-coding-agent", "@earendil-works/pi-ai"];
const PEER_COMPATIBILITY = Object.fromEntries(HOST_PACKAGES.map((name) => [name, "*"]));
const LEGACY_PI_NAME = /^@mariozechner\/pi-/;
const CURRENT_PI_NAME = /^@earendil-works\/pi-/;
const DEPENDENCY_SECTIONS = [
  "dependencies",
  "devDependencies",
  "optionalDependencies",
  "peerDependencies",
];

function readPackageJson(filePath = "package.json") {
  return JSON.parse(fs.readFileSync(filePath, "utf8"));
}

test("artifact test host is an exact, development-only alias independent of live host links", () => {
  const pkg = readPackageJson();
  const lock = readPackageJson("package-lock.json");
  const alias = "pi-test-host";
  const name = "@earendil-works/pi-coding-agent";
  const spec = `npm:${name}@${DEV_TEST_FLOOR}`;
  assert.equal(pkg.devDependencies[alias], spec);
  assert.equal(lock.packages[""].devDependencies[alias], spec);
  for (const section of ["dependencies", "optionalDependencies", "peerDependencies"]) {
    assert.equal(pkg[section]?.[alias], undefined);
  }
  const pinned = lock.packages[`node_modules/${alias}`];
  assert.equal(pinned.name, name);
  assert.equal(pinned.version, DEV_TEST_FLOOR);
  assert.equal(pinned.integrity, lock.packages[`node_modules/${name}`].integrity);
  const installed = readPackageJson(`node_modules/${alias}/package.json`);
  assert.equal(installed.name, name);
  assert.equal(installed.version, DEV_TEST_FLOOR);
});

test("Pi host contract keeps package, host, development, and peer versions distinct", () => {
  const pkg = readPackageJson();
  const contract = pkg["x-pi-template"]?.piHostContract;
  const lock = readPackageJson("package-lock.json");

  assert.match(pkg.version, /^\d+\.\d+\.\d+(?:[-+][0-9A-Za-z.-]+)?$/);
  assert.equal(contract?.schemaVersion, 1);
  assert.equal(contract?.source, TEMPLATE_SOURCE);
  assert.equal(contract?.packageVersionSource, "package.json#version");
  assert.equal(contract?.hostBaseline, HOST_BASELINE);
  assert.equal(contract?.devTestFloor, DEV_TEST_FLOOR);
  assert.deepEqual(contract?.peerCompatibility, PEER_COMPATIBILITY);

  for (const packageName of HOST_PACKAGES) {
    assert.equal(pkg.devDependencies?.[packageName], DEV_TEST_FLOOR);
    assert.equal(pkg.peerDependencies?.[packageName], PEER_COMPATIBILITY[packageName]);

    // Canonical installs are deliberately linked to the live Pi, which can be
    // older after rollback. Authored development pins still bind the test host.
    assert.equal(lock.packages[""].devDependencies[packageName], DEV_TEST_FLOOR);
    assert.equal(lock.packages[`node_modules/${packageName}`].version, DEV_TEST_FLOOR);
  }
});

test("current host metadata and host-provided TypeBox stay out of runtime dependencies", () => {
  const pkg = readPackageJson();
  assert.equal(pkg["x-pi-template"]?.piHostContract?.hostBaseline, HOST_BASELINE);
  assert.equal(pkg["x-pi-template"]?.piHostContract?.devTestFloor, DEV_TEST_FLOOR);
  for (const name of [...HOST_PACKAGES, "typebox"]) {
    assert.equal(pkg.dependencies?.[name], undefined, `dependencies.${name} must be absent`);
    assert.equal(
      pkg.optionalDependencies?.[name],
      undefined,
      `optionalDependencies.${name} must be absent`,
    );
    assert.equal(pkg.peerDependencies?.[name], "*");
    assert.equal(pkg.devDependencies?.[name], name === "typebox" ? "1.3.7" : DEV_TEST_FLOOR);
  }
});

test("host-provided TypeBox has a wildcard peer and an exact development pin only", () => {
  const pkg = readPackageJson();
  assert.equal(pkg.dependencies?.typebox, undefined, "runtime TypeBox creates a host copy warning");
  assert.equal(pkg.optionalDependencies?.typebox, undefined);
  assert.equal(pkg.peerDependencies?.typebox, "*");
  assert.equal(pkg.devDependencies?.typebox, "1.3.7");
});

test("Pi host dependencies and live imports use only the governed namespace", () => {
  const pkg = readPackageJson();
  const governed = new Set(HOST_PACKAGES);

  for (const section of DEPENDENCY_SECTIONS) {
    for (const [name, specifier] of Object.entries(pkg[section] ?? {})) {
      assert.doesNotMatch(name, LEGACY_PI_NAME, `${section}.${name} uses the legacy Pi namespace`);
      assert.doesNotMatch(
        String(specifier),
        /^npm:@mariozechner\/pi-/,
        `${section}.${name} aliases the legacy Pi namespace`,
      );
      if (CURRENT_PI_NAME.test(name)) {
        assert.ok(governed.has(name), `${section}.${name} is outside x-pi-template.piHostContract`);
        assert.ok(
          section === "devDependencies" || section === "peerDependencies",
          `${section}.${name} must be a governed development pin or compatibility peer`,
        );
      }
    }
  }

  const liveFiles = ["extensions", "src"].flatMap((root) =>
    fs
      .readdirSync(root, { recursive: true })
      .filter((name) => /\.(?:[cm]?[jt]s|[jt]sx)$/.test(name))
      .map((name) => path.join(root, name)),
  );
  assert.ok(liveFiles.length > 0);
  for (const name of liveFiles) {
    const source = fs.readFileSync(name, "utf8");
    assert.doesNotMatch(source, /["']@mariozechner\/pi-/);
    assert.doesNotMatch(source, /pi-test-host/, "the artifact host must never enter live code");
  }
});

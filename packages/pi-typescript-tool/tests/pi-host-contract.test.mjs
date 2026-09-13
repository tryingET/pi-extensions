import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import test from "node:test";
import { loadCurrentHostVersion } from "../../../scripts/pi-host-compatibility-canary/host-contract.mjs";

// Scaffold lineage is historical; the repository owns today's development baseline.
const HOST_BASELINE = "0.84.3";
const DEV_TEST_FLOOR = loadCurrentHostVersion();
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

test("Given the root development baseline, When package declarations and installation are checked, Then all development pins match it without changing scaffold lineage or peers", () => {
  const pkg = readPackageJson();
  const contract = pkg["x-pi-template"]?.piHostContract;

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

    const installed = readPackageJson(
      path.join("node_modules", ...packageName.split("/"), "package.json"),
    );
    assert.equal(installed.name, packageName);
    assert.equal(installed.version, DEV_TEST_FLOOR);
  }
});

test("Pi host dependencies and extension imports use only the governed namespace", () => {
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

  const extensionFiles = fs.readdirSync("extensions").filter((name) => name.endsWith(".ts"));
  assert.ok(extensionFiles.length > 0);
  for (const name of extensionFiles) {
    const source = fs.readFileSync(path.join("extensions", name), "utf8");
    assert.doesNotMatch(source, /["']@mariozechner\/pi-/);
  }
});

test("private metadata, runtime compiler, lockfile and artifact notices stay aligned", () => {
  const pkg = readPackageJson();
  const lock = readPackageJson("package-lock.json");
  assert.equal(pkg.private, true);
  assert.equal(pkg["x-pi-template"].releaseConfigMode, "none");
  assert.deepEqual(pkg.dependencies, { typescript: "6.0.3" });
  assert.equal(pkg.peerDependencies.typebox, "*");
  assert.equal(pkg.devDependencies.typebox, "1.3.7");
  assert.deepEqual(lock.packages[""].dependencies, pkg.dependencies);
  assert.deepEqual(lock.packages[""].devDependencies, pkg.devDependencies);
  assert.deepEqual(lock.packages[""].peerDependencies, pkg.peerDependencies);
  assert.equal(lock.packages["node_modules/typescript"].version, "6.0.3");
  assert.notEqual(lock.packages["node_modules/typescript"].dev, true);
  for (const file of ["src", "NOTICE", "external/LICENSE-Apache-2.0.txt"]) {
    assert.ok(pkg.files.includes(file));
  }
  assert.match(fs.readFileSync(".copier-answers.yml", "utf8"), /^_commit: 8bcc39a$/m);
  assert.match(
    fs.readFileSync("docs/project/provenance.md", "utf8"),
    /8bcc39a85a62b6b8dc4b96e5879f79b4e97d8192/,
  );
});

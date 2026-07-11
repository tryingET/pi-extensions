/**
summary: "Tests release component inventory plus stable, prerelease, JSON, and environment tag resolution."
read_when:
  - "Changing release component discovery, component tag syntax, or npm dist-tag projection."
*/
import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import path from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const SCRIPT = path.join(ROOT, "scripts", "release-components.mjs");

function resolveTag(tag) {
  return JSON.parse(
    execFileSync(process.execPath, [SCRIPT, "resolve-tag", tag, "--json"], {
      cwd: ROOT,
      encoding: "utf-8",
    }),
  );
}

function resolveTagEnv(tag) {
  return execFileSync(process.execPath, [SCRIPT, "resolve-tag", tag, "--env"], {
    cwd: ROOT,
    encoding: "utf-8",
  });
}

function listComponents() {
  return JSON.parse(
    execFileSync(process.execPath, [SCRIPT, "list", "--json"], {
      cwd: ROOT,
      encoding: "utf-8",
    }),
  );
}

test("list reports pi-model-selection as a top-level support package", () => {
  const components = listComponents();
  const component = components.find((entry) => entry.component === "pi-model-selection");
  assert.equal(component?.packagePath, "packages/pi-model-selection");
  assert.equal(component?.packageName, "@tryinget/pi-model-selection");
});

test("resolve-tag reports latest dist-tag for stable versions", () => {
  const result = resolveTag("pi-society-orchestrator-v0.1.0");
  assert.equal(result.packageName, "@tryinget/pi-society-orchestrator");
  assert.equal(result.tagVersion, "0.1.0");
  assert.equal(result.npmDistTag, "latest");
});

test("resolve-tag derives prerelease dist-tags from prerelease identifiers", () => {
  const result = resolveTag("pi-society-orchestrator-v0.1.0-beta.2");
  assert.equal(result.npmDistTag, "beta");
});

test("resolve-tag env output exports RELEASE_NPM_DIST_TAG", () => {
  const output = resolveTagEnv("pi-vault-client-v0.1.0-rc.1");
  assert.match(output, /RELEASE_NPM_DIST_TAG=rc/);
});

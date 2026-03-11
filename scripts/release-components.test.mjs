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

test("resolve-tag reports latest dist-tag for stable versions", () => {
  const result = resolveTag("pi-society-orchestrator-v0.1.0");
  assert.equal(result.packageName, "pi-society-orchestrator");
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

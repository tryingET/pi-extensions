import assert from "node:assert/strict";
import { execFileSync, spawnSync } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
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

test("snapshot-edit component resolves to its public npm package and changelog", () => {
  const components = listComponents();
  const component = components.find((entry) => entry.component === "pi-snapshot-edit");
  assert.equal(component?.packagePath, "packages/pi-snapshot-edit");
  assert.equal(component?.packageName, "@tryinget/pi-snapshot-edit");
  assert.equal(component?.changelogPath, "packages/pi-snapshot-edit/CHANGELOG.md");
  assert.match(component?.version ?? "", /^\d+\.\d+\.\d+$/);
  const resolved = resolveTag("pi-snapshot-edit-v0.2.0");
  assert.equal(resolved.packagePath, "packages/pi-snapshot-edit");
  assert.equal(resolved.packageName, "@tryinget/pi-snapshot-edit");
  assert.equal(resolved.tagVersion, "0.2.0");
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

test("publish workflow retains, verifies, uploads, and publishes one exact tarball", () => {
  const workflow = fs.readFileSync(path.join(ROOT, ".github", "workflows", "publish.yml"), "utf8");
  const packMatches = workflow.match(/npm pack\b/g) ?? [];
  assert.equal(packMatches.length, 1, "workflow must create the release tarball exactly once");
  assert.match(workflow, /RELEASE_TARBALL_PATH=\$tarball_path/);
  assert.match(workflow, /RELEASE_TARBALL_BASENAME=\$tarball_basename/);
  assert.match(workflow, /RELEASE_TARBALL_SHA256=\$tarball_sha256/);
  const check = workflow.indexOf("npm run release:check:quick -- \"$RELEASE_TARBALL_PATH\"");
  const upload = workflow.indexOf("uses: actions/upload-artifact@v6");
  const publish = workflow.indexOf('npm publish "$RELEASE_TARBALL_PATH" --provenance');
  assert.ok(
    check >= 0 && upload > check && publish > upload,
    "check, upload, and exact-path publish order must be preserved",
  );
  assert.ok((workflow.match(/sha256sum --check --status/g) ?? []).length >= 2);
});

test("snapshot release check fails closed on retained tarball SHA drift", () => {
  const fixture = fs.mkdtempSync(path.join(os.tmpdir(), "snapshot-release-sha-"));
  try {
    const tarball = path.join(fixture, "release.tgz");
    fs.writeFileSync(tarball, "changed artifact");
    const result = spawnSync(
      "bash",
      [path.join(ROOT, "packages", "pi-snapshot-edit", "scripts", "release-check.sh"), tarball],
      {
        cwd: path.join(ROOT, "packages", "pi-snapshot-edit"),
        encoding: "utf8",
        env: { ...process.env, RELEASE_TARBALL_SHA256: "0".repeat(64), SKIP_PI_SMOKE: "1" },
      },
    );
    assert.notEqual(result.status, 0);
    assert.match(`${result.stdout}\n${result.stderr}`, /Release tarball SHA-256 changed/);
    assert.doesNotMatch(`${result.stdout}\n${result.stderr}`, /== npm pack/);
  } finally {
    fs.rmSync(fixture, { recursive: true, force: true });
  }
});

test("snapshot supplied-tarball contract requires exact artifact operations", () => {
  const script = fs.readFileSync(
    path.join(ROOT, "packages", "pi-snapshot-edit", "scripts", "release-check.sh"),
    "utf8",
  );
  assert.match(script, /Supplied release tarball path must be absolute/);
  assert.match(script, /RELEASE_TARBALL_SHA256 is required/);
  assert.match(script, /npm publish \"\$TARBALL_PATH\" --dry-run/);
  assert.match(script, /PACKAGE_SPEC=\"npm:\$TARBALL_PATH\"/);
  assert.match(script, /Tarball identity mismatch/);
});

/**
summary: "Tests release component inventory, tag resolution, and production publication workflow guards."
read_when:
  - "Changing release component discovery, tag syntax, retained-artifact publishing, or release dispatch."
*/
import assert from "node:assert/strict";
import { execFileSync, spawnSync } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const SCRIPT = path.join(ROOT, "scripts", "release-components.mjs");
const PUBLISH_WORKFLOW = path.join(ROOT, ".github", "workflows", "publish.yml");
const RELEASE_CHECK_WORKFLOW = path.join(ROOT, ".github", "workflows", "release-check.yml");
const RELEASE_PLEASE_WORKFLOW = path.join(ROOT, ".github", "workflows", "release-please.yml");

function workflowStep(workflow, name) {
  const marker = `      - name: ${name}\n`;
  const start = workflow.indexOf(marker);
  assert.notEqual(start, -1, `workflow step not found: ${name}`);
  const next = workflow.indexOf("\n      - name:", start + marker.length);
  return workflow.slice(start, next === -1 ? workflow.length : next);
}

function workflowRunBlock(workflow, name) {
  const step = workflowStep(workflow, name);
  const marker = "        run: |\n";
  const start = step.indexOf(marker);
  assert.notEqual(start, -1, `multiline run block not found: ${name}`);
  return step.slice(start + marker.length).replace(/^ {10}/gm, "");
}

function resolveTag(tag) {
  return JSON.parse(
    execFileSync(process.execPath, [SCRIPT, "resolve-tag", tag, "--json"], {
      cwd: ROOT,
      encoding: "utf8",
    }),
  );
}

function resolveTagEnv(tag) {
  return execFileSync(process.execPath, [SCRIPT, "resolve-tag", tag, "--env"], {
    cwd: ROOT,
    encoding: "utf8",
  });
}

function listComponents() {
  return JSON.parse(
    execFileSync(process.execPath, [SCRIPT, "list", "--json"], {
      cwd: ROOT,
      encoding: "utf8",
    }),
  );
}

test("list reports managed package components", () => {
  const components = listComponents();
  const modelSelection = components.find((entry) => entry.component === "pi-model-selection");
  assert.equal(modelSelection?.packagePath, "packages/pi-model-selection");
  assert.equal(modelSelection?.packageName, "@tryinget/pi-model-selection");
  const modes = components.find((entry) => entry.component === "pi-modes");
  assert.equal(modes?.packagePath, "packages/pi-modes");
  assert.equal(modes?.packageName, "@tryinget/pi-modes");
});

test("resolve-tag projects stable and prerelease npm dist-tags", () => {
  const stable = resolveTag("pi-modes-v0.3.0");
  assert.equal(stable.packageName, "@tryinget/pi-modes");
  assert.equal(stable.tagVersion, "0.3.0");
  assert.equal(stable.npmDistTag, "latest");
  const prerelease = resolveTag("pi-society-orchestrator-v0.1.0-beta.2");
  assert.equal(prerelease.npmDistTag, "beta");
  assert.match(resolveTagEnv("pi-vault-client-v0.1.0-rc.1"), /RELEASE_NPM_DIST_TAG=rc/);
});

test("release-please serializes release creation and dispatches created tags", () => {
  const workflow = fs.readFileSync(RELEASE_PLEASE_WORKFLOW, "utf8");
  assert.match(workflow, /group: release-please-main/);
  assert.match(workflow, /cancel-in-progress: false/);
  assert.match(workflow, /actions: write/);
  assert.match(workflowStep(workflow, "Run release-please"), /id: release/);
  const dispatch = workflowStep(workflow, "Dispatch npm publication for created releases");
  assert.match(dispatch, /steps\.release\.outputs\.releases_created == 'true'/);
  assert.match(dispatch, /gh workflow run publish\.yml[\s\S]*-f "tag=\$tag"/);
});

test("publish resolver sources same-step output and rejects a mismatched tag", () => {
  const workflow = fs.readFileSync(PUBLISH_WORKFLOW, "utf8");
  const step = workflowStep(workflow, "Resolve release tag to component");
  assert.match(step, /resolve-tag "\$RELEASE_TAG" --env > "\$resolver_env"/);
  assert.match(step, /cat "\$resolver_env" >> "\$GITHUB_ENV"/);
  assert.match(step, /source "\$resolver_env"/);

  const fixture = fs.mkdtempSync(path.join(os.tmpdir(), "release-tag-guard-"));
  try {
    const env = {
      ...process.env,
      GITHUB_ENV: path.join(fixture, "github-env"),
      RELEASE_TAG: "pi-modes-v9.9.9",
      RUNNER_TEMP: fixture,
    };
    delete env.RELEASE_PACKAGE_VERSION;
    delete env.RELEASE_TAG_VERSION;
    const result = spawnSync(
      "bash",
      ["-c", workflowRunBlock(workflow, "Resolve release tag to component")],
      { cwd: ROOT, encoding: "utf8", env },
    );
    assert.notEqual(result.status, 0);
    assert.match(
      `${result.stdout}\n${result.stderr}`,
      /Resolved package version \(.+\) does not match release tag version \(9\.9\.9\)/,
    );
  } finally {
    fs.rmSync(fixture, { recursive: true, force: true });
  }
});

test("pi-modes validates and publishes one retained tarball", () => {
  const workflow = fs.readFileSync(PUBLISH_WORKFLOW, "utf8");
  for (const name of [
    "Create immutable retained release tarball",
    "Verify retained tarball after release checks",
    "Upload retained release tarball",
    "Publish retained tarball to npm (OIDC + provenance)",
  ]) {
    const step = workflowStep(workflow, name);
    assert.match(step, /env\.RELEASE_COMPONENT == 'pi-modes'/);
  }
  const check = workflowStep(workflow, "Run pi-modes release checks against retained tarball");
  assert.match(check, /npm run release:check:ci -- "\$RELEASE_TARBALL_PATH"/);
  assert.equal((workflow.match(/npm pack\b/g) ?? []).length, 1);
  assert.match(workflow, /RELEASE_TARBALL_SHA256=\$tarball_sha256/);
  const upload = workflow.indexOf("uses: actions/upload-artifact@v6");
  const publish = workflow.indexOf('npm publish "$RELEASE_TARBALL_PATH" --provenance');
  assert.ok(workflow.indexOf(check) < upload && upload < publish);
  assert.ok((workflow.match(/sha256sum --check --status/g) ?? []).length >= 2);
});

test("generic publication excludes retained-artifact components", () => {
  const workflow = fs.readFileSync(PUBLISH_WORKFLOW, "utf8");
  for (const name of [
    "Run generic package release checks (artifact-only)",
    "Publish generic package directory to npm (OIDC + provenance)",
  ]) {
    const step = workflowStep(workflow, name);
    assert.match(step, /env\.RELEASE_COMPONENT != 'pi-snapshot-edit'/);
    assert.match(step, /env\.RELEASE_COMPONENT != 'pi-modes'/);
    assert.doesNotMatch(step, /RELEASE_TARBALL/);
  }
});

test("release-check CI runs pi-modes credential-free installed-artifact smoke", () => {
  const workflow = fs.readFileSync(RELEASE_CHECK_WORKFLOW, "utf8");
  const modes = workflowStep(workflow, "Run pi-modes credential-free installed-artifact checks");
  assert.match(modes, /if: matrix\.component == 'pi-modes'/);
  assert.match(modes, /run: npm run release:check:ci/);
  const generic = workflowStep(workflow, "Run generic release checks (artifact-only)");
  assert.match(generic, /if: matrix\.component != 'pi-modes'/);
  assert.match(generic, /run: npm run release:check:quick/);
});

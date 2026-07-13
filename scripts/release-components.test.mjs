import assert from "node:assert/strict";
import { execFileSync, spawnSync } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const SCRIPT = path.join(ROOT, "scripts", "release-components.mjs");
const WORKFLOW_PATH = path.join(ROOT, ".github", "workflows", "publish.yml");
const RELEASE_PLEASE_WORKFLOW_PATH = path.join(
  ROOT,
  ".github",
  "workflows",
  "release-please.yml",
);
const RUNBOOK_PATH = path.join(
  ROOT,
  "packages",
  "pi-snapshot-edit",
  "docs",
  "project",
  "trusted-publishing.md",
);

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

test("release quality gate disables machine-local engineering-core smoke", () => {
  const workflow = fs.readFileSync(WORKFLOW_PATH, "utf8");
  const step = workflowStep(workflow, "Run package quality gate");
  assert.match(step, /PI_ENGINEERING_SMOKE: "0"/);
  assert.match(step, /run: npm run check/);
});

test("release-please serializes release creation and dispatches created tags to publish", () => {
  const workflow = fs.readFileSync(RELEASE_PLEASE_WORKFLOW_PATH, "utf8");
  assert.match(workflow, /group: release-please-main/);
  assert.match(workflow, /cancel-in-progress: false/);
  assert.match(workflow, /actions: write/);
  assert.match(workflowStep(workflow, "Run release-please"), /id: release/);
  const dispatch = workflowStep(workflow, "Dispatch npm publication for created releases");
  assert.match(dispatch, /steps\.release\.outputs\.releases_created == 'true'/);
  assert.match(dispatch, /PATHS_RELEASED: \$\{\{ steps\.release\.outputs\.paths_released \}\}/);
  assert.match(dispatch, /gh release view "\$tag"/);
  assert.match(dispatch, /gh workflow run publish\.yml[\s\S]*-f "tag=\$tag"/);
});

test("resolve-tag workflow guard sources same-step output and rejects a mismatched tag", () => {
  const workflow = fs.readFileSync(WORKFLOW_PATH, "utf8");
  const step = workflowStep(workflow, "Resolve release tag to component");
  assert.match(step, /set -euo pipefail/);
  assert.match(step, /resolve-tag "\$RELEASE_TAG" --env > "\$resolver_env"/);
  assert.match(step, /cat "\$resolver_env" >> "\$GITHUB_ENV"/);
  assert.match(step, /source "\$resolver_env"/);

  const fixture = fs.mkdtempSync(path.join(os.tmpdir(), "release-tag-guard-"));
  try {
    const env = {
      ...process.env,
      GITHUB_ENV: path.join(fixture, "github-env"),
      RELEASE_TAG: "pi-snapshot-edit-v9.9.9",
      RUNNER_TEMP: fixture,
    };
    delete env.RELEASE_PACKAGE_VERSION;
    delete env.RELEASE_TAG_VERSION;
    const result = spawnSync("bash", ["-c", workflowRunBlock(workflow, "Resolve release tag to component")], {
      cwd: ROOT,
      encoding: "utf8",
      env,
    });
    assert.notEqual(result.status, 0, "mismatched package/tag versions must fail");
    assert.match(
      `${result.stdout}\n${result.stderr}`,
      /Resolved package version \(.+\) does not match release tag version \(9\.9\.9\)/,
    );
  } finally {
    fs.rmSync(fixture, { recursive: true, force: true });
  }
});

test("snapshot-edit alone retains, verifies, uploads, and publishes one exact tarball", () => {
  const workflow = fs.readFileSync(WORKFLOW_PATH, "utf8");
  const snapshotSteps = [
    "Create immutable snapshot-edit release tarball",
    "Run snapshot-edit release checks against retained tarball",
    "Verify snapshot-edit retained tarball after release checks",
    "Upload snapshot-edit retained release tarball",
    "Publish snapshot-edit retained tarball to npm (OIDC + provenance)",
  ];
  for (const name of snapshotSteps) {
    assert.match(workflowStep(workflow, name), /if: env\.RELEASE_COMPONENT == 'pi-snapshot-edit'/);
  }

  const packMatches = workflow.match(/npm pack\b/g) ?? [];
  assert.equal(packMatches.length, 1, "snapshot workflow path must create its tarball exactly once");
  assert.match(workflow, /RELEASE_TARBALL_PATH=\$tarball_path/);
  assert.match(workflow, /RELEASE_TARBALL_BASENAME=\$tarball_basename/);
  assert.match(workflow, /RELEASE_TARBALL_SHA256=\$tarball_sha256/);
  const check = workflow.indexOf("npm run release:check:quick -- \"$RELEASE_TARBALL_PATH\"");
  const upload = workflow.indexOf("uses: actions/upload-artifact@v6");
  const publish = workflow.indexOf('npm publish "$RELEASE_TARBALL_PATH" --provenance');
  assert.ok(
    check >= 0 && upload > check && publish > upload,
    "snapshot check, upload, and exact-path publish order must be preserved",
  );
  assert.ok((workflow.match(/sha256sum --check --status/g) ?? []).length >= 2);
});

test("generic publish path preserves directory-based release check and publish", () => {
  const workflow = fs.readFileSync(WORKFLOW_PATH, "utf8");
  const check = workflowStep(workflow, "Run generic package release checks (artifact-only)");
  const publish = workflowStep(
    workflow,
    "Publish generic package directory to npm (OIDC + provenance)",
  );
  for (const step of [check, publish]) {
    assert.match(step, /if: env\.RELEASE_COMPONENT != 'pi-snapshot-edit'/);
    assert.doesNotMatch(step, /RELEASE_TARBALL/);
  }
  assert.match(check, /run: npm run release:check:quick\n/);
  assert.match(publish, /run: npm publish --provenance --access public --tag "\$RELEASE_NPM_DIST_TAG"/);
  assert.ok(workflow.indexOf(check) < workflow.indexOf(publish), "generic check must precede publish");
});

test("manual bootstrap requires run identity and verifies run/tag commit before artifact use", () => {
  const runbook = fs.readFileSync(RUNBOOK_PATH, "utf8");
  const scriptStart = runbook.indexOf("set -euo pipefail", runbook.indexOf("Failed-run artifact"));
  const scriptEnd = runbook.indexOf("\n```", scriptStart);
  assert.ok(scriptStart >= 0 && scriptEnd > scriptStart, "bootstrap shell block must exist");
  const script = runbook.slice(scriptStart, scriptEnd);

  for (const [envOverrides, expectedError] of [
    [{}, /EXPECTED_TAG is required/],
    [{ EXPECTED_TAG: "pi-snapshot-edit-v0.2.0" }, /RUN_ID is required/],
  ]) {
    const env = { ...process.env, ...envOverrides };
    delete env.RUN_ID;
    if (!("EXPECTED_TAG" in envOverrides)) delete env.EXPECTED_TAG;
    const result = spawnSync("bash", ["-c", script], { cwd: ROOT, encoding: "utf8", env });
    assert.notEqual(result.status, 0);
    assert.match(`${result.stdout}\n${result.stderr}`, expectedError);
  }

  assert.match(runbook, /"\$RUN_ID" =~ \^\[0-9\]\+\$/);
  assert.match(runbook, /gh run view "\$RUN_ID"[\s\S]*--json name,event,conclusion,headBranch,headSha/);
  assert.match(runbook, /run\.name !== "publish"/);
  assert.match(runbook, /run\.event !== "release"/);
  assert.match(runbook, /run\.conclusion !== "failure"/);
  assert.match(runbook, /run\.headBranch !== expected/);
  assert.match(runbook, /git -C "\$workdir\/tag-check" fetch/);
  assert.match(runbook, /rev-parse "\$EXPECTED_TAG\^\{commit\}"/);
  assert.match(runbook, /"\$tag_commit" == "\$run_head_sha"/);
  assert.match(runbook, /sha256sum --check/);
  assert.match(runbook, /npm publish "\$tarball"/);
  assert.ok(
    runbook.indexOf("gh run view") < runbook.indexOf("gh run download"),
    "run metadata must be checked before artifact download",
  );
  assert.ok(
    runbook.indexOf("sha256sum --check") < runbook.indexOf('npm publish "$tarball"'),
    "artifact checksum must be checked before exact-path publish",
  );
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

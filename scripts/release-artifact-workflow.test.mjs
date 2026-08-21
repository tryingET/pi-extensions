// ---
// summary: "Asserts that every release component is packed, verified, retained, and published by exact tarball path."
// read_when:
//   - "Changing publish.yml, release-check.yml, or the exact release-artifact contract."
// ---

import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const PUBLISH_PATH = path.join(ROOT, ".github", "workflows", "publish.yml");
const RELEASE_CHECK_PATH = path.join(ROOT, ".github", "workflows", "release-check.yml");
const FULL_GATE_PATH = path.join(ROOT, "scripts", "ci", "full.sh");
const ARTIFACT_HELPER_PATH = path.join(ROOT, "scripts", "release-artifact.mjs");

function workflowStep(workflow, name) {
  const marker = `      - name: ${name}\n`;
  const start = workflow.indexOf(marker);
  assert.notEqual(start, -1, `workflow step not found: ${name}`);
  const next = workflow.indexOf("\n      - name:", start + marker.length);
  return workflow.slice(start, next === -1 ? workflow.length : next);
}

test("publish never repairs tagged lockfiles or leaves source mutations", () => {
  const workflow = fs.readFileSync(PUBLISH_PATH, "utf8");
  assert.doesNotMatch(workflow, /npm ci\s*\|\|/u);
  assert.doesNotMatch(workflow, /--package-lock-only/u);
  assert.doesNotMatch(workflow, /refresh(?:ing)? lockfile/iu);
  for (const name of [
    "Verify dependency installation did not rewrite tagged source",
    "Verify release preparation restored tagged source",
  ]) {
    assert.match(workflowStep(workflow, name), /git diff --exit-code -- \./u);
  }
});

test("the artifact helper reuses the canonical npm parser and records local closure", () => {
  const helper = fs.readFileSync(ARTIFACT_HELPER_PATH, "utf8");
  assert.match(helper, /import \{ parseNpmPackJson \} from "\.\/npm-pack-json\.mjs";/u);
  assert.match(helper, /parseCapturedNpmPackOutput\(result\.stdout/u);
  assert.match(helper, /collectLocalDependencyClosure/u);
  assert.match(helper, /dependencies:\s*\{\s*localArtifacts/su);
  assert.match(helper, /buildExactInstallManifest\(exactArtifacts\)/u);
  assert.match(helper, /dependencies\[name\] = pathToFileURL\(artifactPath\)\.href/u);
  assert.match(helper, /"--package-lock=false"/u);
  assert.doesNotMatch(helper, /\.\.\.localPaths/u);
  assert.doesNotMatch(helper, /function matchingArrayEnd/u);
});

test("special and generic components each create one authoritative artifact", () => {
  const workflow = fs.readFileSync(PUBLISH_PATH, "utf8");
  const retained = workflowStep(workflow, "Create immutable retained release tarball");
  const generic = workflowStep(workflow, "Create authoritative generic release tarball");
  assert.match(retained, /env\.RELEASE_COMPONENT == 'pi-snapshot-edit'/u);
  assert.match(retained, /env\.RELEASE_COMPONENT == 'pi-modes'/u);
  assert.match(generic, /env\.RELEASE_COMPONENT != 'pi-snapshot-edit'/u);
  assert.match(generic, /env\.RELEASE_COMPONENT != 'pi-modes'/u);
  for (const step of [retained, generic]) {
    assert.match(step, /release-artifact\.mjs pack/u);
    assert.match(step, /--package-path "\$RELEASE_PACKAGE_PATH"/u);
    assert.match(step, /--artifact-dir "\$RUNNER_TEMP\/release-package"/u);
    assert.match(step, /--output-env-file "\$GITHUB_ENV"/u);
  }
  assert.equal((workflow.match(/release-artifact\.mjs pack/gu) ?? []).length, 2);
  const directPacks = workflow
    .split(/\r?\n/u)
    .filter((line) => /^\s*(?:run:\s*)?npm pack\b/u.test(line));
  assert.deepEqual(directPacks, []);
});

test("every artifact closure is reverified, retained, and published by exact path", () => {
  const workflow = fs.readFileSync(PUBLISH_PATH, "utf8");
  const verifySteps = [
    workflowStep(workflow, "Verify retained tarball after release checks"),
    workflowStep(workflow, "Verify authoritative generic tarball after release checks"),
    workflowStep(workflow, "Publish retained tarball to npm (OIDC + provenance)"),
    workflowStep(workflow, "Publish authoritative generic tarball to npm (OIDC + provenance)"),
  ];
  for (const step of verifySteps) {
    assert.match(step, /release-artifact\.mjs"? verify/u);
    assert.match(step, /--manifest "\$RELEASE_ARTIFACT_MANIFEST_PATH"/u);
  }
  for (const name of [
    "Upload retained release tarball",
    "Upload authoritative generic release tarball",
  ]) {
    const step = workflowStep(workflow, name);
    assert.match(step, /RELEASE_ARTIFACT_DIRECTORY/u);
    assert.match(step, /RELEASE_EVIDENCE_ARCHIVE_PATH/u);
    assert.match(step, /RELEASE_EVIDENCE_ARCHIVE_CHECKSUM_PATH/u);
    assert.match(step, /if-no-files-found: error/u);
  }
  for (const name of [
    "Publish retained tarball to npm (OIDC + provenance)",
    "Publish authoritative generic tarball to npm (OIDC + provenance)",
  ]) {
    assert.match(workflowStep(workflow, name), /npm publish "\$RELEASE_TARBALL_PATH" --provenance/u);
  }
  const compatibilityDryRun = workflowStep(
    workflow,
    "Publish generic package directory to npm (OIDC + provenance)",
  );
  assert.match(compatibilityDryRun, /NPM_CONFIG_DRY_RUN: "true"/u);
  assert.doesNotMatch(compatibilityDryRun, /RELEASE_TARBALL/u);
});

test("release-check packs and installs the exact artifact for every managed component", () => {
  const workflow = fs.readFileSync(RELEASE_CHECK_PATH, "utf8");
  const pack = workflowStep(workflow, "Pack authoritative release artifact");
  const verify = workflowStep(workflow, "Verify authoritative release artifact");
  assert.match(pack, /release-artifact\.mjs pack/u);
  assert.match(pack, /matrix\.package_path/u);
  assert.doesNotMatch(pack, /if: matrix\.component/u);
  assert.match(verify, /release-artifact\.mjs verify/u);
  assert.match(verify, /RELEASE_ARTIFACT_MANIFEST_PATH/u);
  assert.doesNotMatch(verify, /if: matrix\.component/u);
  assert.ok(workflow.indexOf(pack) < workflow.indexOf(verify));
});

test("the root full gate executes exact-artifact tests", () => {
  const gate = fs.readFileSync(FULL_GATE_PATH, "utf8");
  assert.match(gate, /node --test \.\/scripts\/release-artifact\.test\.mjs/u);
  assert.match(gate, /node --test \.\/scripts\/release-artifact-workflow\.test\.mjs/u);
});

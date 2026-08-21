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

function workflowStep(workflow, name) {
  const marker = `      - name: ${name}\n`;
  const start = workflow.indexOf(marker);
  assert.notEqual(start, -1, `workflow step not found: ${name}`);
  const next = workflow.indexOf("\n      - name:", start + marker.length);
  return workflow.slice(start, next === -1 ? workflow.length : next);
}

test("publish never repairs tagged lockfiles or metadata", () => {
  const workflow = fs.readFileSync(PUBLISH_PATH, "utf8");
  assert.doesNotMatch(workflow, /npm ci\s*\|\|/u);
  assert.doesNotMatch(workflow, /--package-lock-only/u);
  assert.doesNotMatch(workflow, /refresh(?:ing)? lockfile/iu);
  assert.match(
    workflowStep(workflow, "Verify dependency installation did not rewrite tagged source"),
    /git diff --exit-code -- \./u,
  );
});

test("special and generic components each create one authoritative artifact through the shared helper", () => {
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
    assert.match(step, /--env-file "\$GITHUB_ENV"/u);
  }

  assert.equal(
    (workflow.match(/release-artifact\.mjs pack/gu) ?? []).length,
    2,
    "exactly two mutually exclusive workflow steps may invoke the single-pack helper",
  );
  const directPackCommands = workflow
    .split(/\r?\n/u)
    .filter((line) => /^\s*(?:run:\s*)?npm pack\b/u.test(line));
  assert.deepEqual(directPackCommands, [], "publish.yml must not invoke npm pack outside the helper");
});

test("every authoritative artifact is reverified, retained with evidence, and published by path", () => {
  const workflow = fs.readFileSync(PUBLISH_PATH, "utf8");
  const specialVerify = workflowStep(workflow, "Verify retained tarball after release checks");
  const genericVerify = workflowStep(
    workflow,
    "Verify authoritative generic tarball after release checks",
  );
  const specialUpload = workflowStep(workflow, "Upload retained release tarball");
  const genericUpload = workflowStep(workflow, "Upload authoritative generic release tarball");
  const specialPublish = workflowStep(
    workflow,
    "Publish retained tarball to npm (OIDC + provenance)",
  );
  const genericPublish = workflowStep(
    workflow,
    "Publish authoritative generic tarball to npm (OIDC + provenance)",
  );

  for (const step of [specialVerify, genericVerify, specialPublish, genericPublish]) {
    assert.match(step, /release-artifact\.mjs"? verify/u);
    assert.match(step, /--manifest "\$RELEASE_ARTIFACT_MANIFEST_PATH"/u);
  }
  for (const step of [specialUpload, genericUpload]) {
    assert.match(step, /RELEASE_TARBALL_PATH/u);
    assert.match(step, /RELEASE_TARBALL_CHECKSUM_PATH/u);
    assert.match(step, /RELEASE_ARTIFACT_MANIFEST_PATH/u);
    assert.match(step, /if-no-files-found: error/u);
  }
  for (const step of [specialPublish, genericPublish]) {
    assert.match(step, /npm publish "\$RELEASE_TARBALL_PATH" --provenance/u);
  }

  const genericDirectory = workflowStep(
    workflow,
    "Publish generic package directory to npm (OIDC + provenance)",
  );
  assert.match(genericDirectory, /NPM_CONFIG_DRY_RUN: "true"/u);
  assert.doesNotMatch(genericDirectory, /RELEASE_TARBALL/u);
  assert.ok(
    workflow.indexOf(genericDirectory) < workflow.indexOf(genericPublish),
    "the compatibility dry-run must precede exact-path publication",
  );
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

test("the root full gate executes release-artifact unit and workflow tests", () => {
  const gate = fs.readFileSync(FULL_GATE_PATH, "utf8");
  assert.match(gate, /node --test \.\/scripts\/release-artifact\.test\.mjs/u);
  assert.match(gate, /node --test \.\/scripts\/release-artifact-workflow\.test\.mjs/u);
});

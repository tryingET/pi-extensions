// ---
// summary: "Asserts durable GitHub Release evidence retention, idempotent recovery, and least-privilege job separation."
// read_when:
//   - "Changing publish.yml, durable release evidence assets, or release recovery controls."
// ---

import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const PUBLISH_PATH = path.join(ROOT, ".github", "workflows", "publish.yml");
const LOCK_PATH = path.join(ROOT, "policy", "ci-toolchain-lock.json");
const FULL_PATH = path.join(ROOT, "scripts", "ci", "full.sh");
const DOWNLOAD_SHA = "3e5f45b2cfb9172054b4087a40e8e0b5a5461e7c";

function step(workflow, name) {
  const marker = `      - name: ${name}\n`;
  const start = workflow.indexOf(marker);
  assert.notEqual(start, -1, `workflow step not found: ${name}`);
  const next = workflow.indexOf("\n      - name:", start + marker.length);
  return workflow.slice(start, next === -1 ? workflow.length : next);
}

function job(workflow, name) {
  const marker = `  ${name}:\n`;
  const start = workflow.indexOf(marker);
  assert.notEqual(start, -1, `workflow job not found: ${name}`);
  const remainder = workflow.slice(start + marker.length);
  const nextJob = remainder.match(/\n  [A-Za-z0-9_-]+:\n/u);
  const end = nextJob ? start + marker.length + nextJob.index : workflow.length;
  return workflow.slice(start, end);
}

test("publish job creates deterministic durable evidence after attestations and before upload", () => {
  const workflow = fs.readFileSync(PUBLISH_PATH, "utf8");
  const attest = step(workflow, "Retain attestation bundles with the exact artifact closure");
  const archive = step(workflow, "Create deterministic durable release evidence archive");
  const specialUpload = step(workflow, "Upload retained release tarball");
  const genericUpload = step(workflow, "Upload authoritative generic release tarball");
  assert.match(archive, /release-evidence-archive\.mjs create/u);
  assert.match(archive, /git show -s --format=%ct HEAD/u);
  assert.match(archive, /--directory "\$RELEASE_ARTIFACT_DIRECTORY"/u);
  assert.match(archive, /--output-env-file "\$GITHUB_ENV"/u);
  for (const upload of [specialUpload, genericUpload]) {
    assert.match(upload, /RELEASE_EVIDENCE_ARCHIVE_PATH/u);
    assert.match(upload, /RELEASE_EVIDENCE_ARCHIVE_CHECKSUM_PATH/u);
  }
  assert.ok(workflow.indexOf(attest) < workflow.indexOf(archive));
  assert.ok(workflow.indexOf(archive) < workflow.indexOf(specialUpload));
});

test("durable retention is a separate job with only actions read and contents write", () => {
  const workflow = fs.readFileSync(PUBLISH_PATH, "utf8");
  const publisher = job(workflow, "publish-npm");
  const retention = job(workflow, "retain-github-release-evidence");
  assert.match(retention, /needs: publish-npm/u);
  assert.match(retention, /actions: read/u);
  assert.match(retention, /contents: write/u);
  assert.doesNotMatch(retention, /id-token: write/u);
  assert.doesNotMatch(publisher, /contents: write/u);
  assert.match(
    retention,
    new RegExp(`uses: actions/download-artifact@${DOWNLOAD_SHA}`, "u"),
  );
});

test("retention refuses clobber and verifies all existing or uploaded assets byte-for-byte", () => {
  const workflow = fs.readFileSync(PUBLISH_PATH, "utf8");
  const retention = step(workflow, "Retain or verify immutable GitHub Release evidence");
  assert.doesNotMatch(retention, /--clobber/u);
  assert.match(retention, /gh release view/u);
  assert.match(retention, /gh release download/u);
  assert.match(retention, /gh release upload/u);
  assert.match(retention, /cmp --/u);
  assert.match(retention, /release-evidence-archive\.mjs verify/u);
  assert.match(retention, /archive_exists/u);
  assert.match(retention, /checksum_exists/u);
  assert.match(retention, /Existing GitHub Release asset differs/u);
  assert.match(retention, /Remote release evidence differs after retention/u);
});

test("download-artifact is pinned and represented in the reviewed toolchain lock", () => {
  const lock = JSON.parse(fs.readFileSync(LOCK_PATH, "utf8"));
  assert.deepEqual(lock.actions["actions/download-artifact"], {
    version: "v8.0.1",
    sha: DOWNLOAD_SHA,
  });
});

test("root full gate executes durable archive and recovery decision tests", () => {
  const full = fs.readFileSync(FULL_PATH, "utf8");
  assert.match(full, /node --test \.\/scripts\/release-evidence-archive\.test\.mjs/u);
  assert.match(full, /node --test \.\/scripts\/release-state\.test\.mjs/u);
  assert.match(full, /node --test \.\/scripts\/release-recovery-workflow\.test\.mjs/u);
});

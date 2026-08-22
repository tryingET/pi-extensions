import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const PUBLISH = path.join(ROOT, ".github", "workflows", "publish.yml");
const RELEASE_CHECK = path.join(ROOT, ".github", "workflows", "release-check.yml");
const LOCK = path.join(ROOT, "policy", "ci-toolchain-lock.json");
const FULL = path.join(ROOT, "scripts", "ci", "full.sh");
const ATTEST_SHA = "1e69f48acb82d1966a394da916b4c1698aa569d6";

function step(workflow, name) {
  const marker = `      - name: ${name}\n`;
  const start = workflow.indexOf(marker);
  assert.notEqual(start, -1, `workflow step not found: ${name}`);
  const next = workflow.indexOf("\n      - name:", start + marker.length);
  return workflow.slice(start, next < 0 ? workflow.length : next);
}

function job(workflow, name) {
  const marker = `  ${name}:\n`;
  const start = workflow.indexOf(marker);
  assert.notEqual(start, -1, `workflow job not found: ${name}`);
  const jobHeader = /^  [A-Za-z0-9_-]+:\n/gmu;
  jobHeader.lastIndex = start + marker.length;
  const match = jobHeader.exec(workflow);
  return workflow.slice(start, match ? match.index : workflow.length);
}

test("publish uses least-privilege attestations and a locked immutable action", () => {
  const workflow = fs.readFileSync(PUBLISH, "utf8");
  const publishJob = job(workflow, "publish-npm");
  assert.match(publishJob, /^      contents: read$/mu);
  assert.match(publishJob, /^      id-token: write$/mu);
  assert.match(publishJob, /^      attestations: write$/mu);
  assert.doesNotMatch(publishJob, /^      contents: write$/mu);
  assert.equal(
    (publishJob.match(new RegExp(`uses: actions/attest@${ATTEST_SHA}`, "gu")) ?? []).length,
    3,
  );
  const lock = JSON.parse(fs.readFileSync(LOCK, "utf8"));
  assert.deepEqual(lock.actions["actions/attest"], {
    version: "v4.1.0",
    sha: ATTEST_SHA,
  });
});

test("durable retention isolates write permission from npm publication", () => {
  const workflow = fs.readFileSync(PUBLISH, "utf8");
  const publishJob = job(workflow, "publish-npm");
  const retainJob = job(workflow, "retain-github-release-evidence");
  assert.doesNotMatch(publishJob, /^      contents: write$/mu);
  assert.match(retainJob, /^      contents: write$/mu);
  assert.doesNotMatch(retainJob, /^      id-token: write$/mu);
  assert.doesNotMatch(retainJob, /^      attestations: write$/mu);
  assert.match(retainJob, /needs: publish-npm/u);
});

test("evidence is generated, verified, attested, retained, then published", () => {
  const workflow = fs.readFileSync(PUBLISH, "utf8");
  const names = [
    "Generate deterministic release SBOM and evidence manifest",
    "Verify deterministic release evidence",
    "Attest exact release tarball provenance",
    "Attest exact release SBOM",
    "Attest retained release evidence manifests",
    "Retain attestation bundles with the exact artifact closure",
    "Upload retained release tarball",
    "Publish retained tarball to npm (OIDC + provenance)",
  ];
  const offsets = names.map((name) => workflow.indexOf(step(workflow, name)));
  assert.deepEqual(offsets, [...offsets].sort((left, right) => left - right));

  const generate = step(workflow, names[0]);
  assert.match(generate, /release-sbom\.mjs generate/u);
  assert.match(generate, /git show -s --format=%ct HEAD/u);
  assert.match(generate, /--output-env-file "\$GITHUB_ENV"/u);

  const sbomAttestation = step(workflow, "Attest exact release SBOM");
  assert.match(sbomAttestation, /subject-path: \$\{\{ env\.RELEASE_TARBALL_PATH \}\}/u);
  assert.match(sbomAttestation, /sbom-path: \$\{\{ env\.RELEASE_SBOM_PATH \}\}/u);
  const evidenceAttestation = step(workflow, "Attest retained release evidence manifests");
  assert.match(evidenceAttestation, /RELEASE_ARTIFACT_MANIFEST_PATH/u);
  assert.match(evidenceAttestation, /RELEASE_EVIDENCE_MANIFEST_PATH/u);

  const publishSteps = [
    step(workflow, "Publish retained tarball to npm (OIDC + provenance)"),
    step(workflow, "Publish authoritative generic tarball to npm (OIDC + provenance)"),
  ];
  for (const publish of publishSteps) {
    assert.match(publish, /release-sbom\.mjs"? verify/u);
    assert.match(publish, /npm publish "\$RELEASE_TARBALL_PATH" --provenance/u);
  }
});

test("release-check exercises deterministic evidence for every component without signing", () => {
  const workflow = fs.readFileSync(RELEASE_CHECK, "utf8");
  const generate = step(workflow, "Generate deterministic release SBOM and evidence manifest");
  const verify = step(workflow, "Verify deterministic release evidence");
  assert.match(generate, /release-sbom\.mjs generate/u);
  assert.match(verify, /release-sbom\.mjs verify/u);
  assert.doesNotMatch(generate, /if: matrix\.component/u);
  assert.doesNotMatch(verify, /if: matrix\.component/u);
  assert.doesNotMatch(workflow, /actions\/attest@/u);
});

test("root quality gate executes the evidence unit and topology tests", () => {
  const full = fs.readFileSync(FULL, "utf8");
  assert.match(full, /node --test \.\/scripts\/release-sbom\.test\.mjs/u);
  assert.match(full, /node --test \.\/scripts\/release-evidence-workflow\.test\.mjs/u);
});

import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const PUBLISH = path.join(ROOT, ".github", "workflows", "publish.yml");
const FULL = path.join(ROOT, "scripts", "ci", "full.sh");

function step(workflow, name) {
  const marker = `      - name: ${name}\n`;
  const start = workflow.indexOf(marker);
  assert.notEqual(start, -1, `workflow step not found: ${name}`);
  const next = workflow.indexOf("\n      - name:", start + marker.length);
  return workflow.slice(start, next < 0 ? workflow.length : next);
}

test("publication inspects immutable npm state before either exact publish path", () => {
  const workflow = fs.readFileSync(PUBLISH, "utf8");
  const inspect = step(workflow, "Inspect immutable npm publication state");
  const special = step(workflow, "Publish retained tarball to npm (OIDC + provenance)");
  const generic = step(workflow, "Publish authoritative generic tarball to npm (OIDC + provenance)");
  assert.match(inspect, /release-npm-state\.mjs inspect/u);
  assert.match(inspect, /--manifest "\$RELEASE_ARTIFACT_MANIFEST_PATH"/u);
  assert.match(inspect, /--output-env-file "\$GITHUB_ENV"/u);
  assert.ok(workflow.indexOf(inspect) < workflow.indexOf(special));
  assert.ok(workflow.indexOf(inspect) < workflow.indexOf(generic));
});

test("missing bytes publish once, exact bytes are a no-op, and mismatches fail closed", () => {
  const workflow = fs.readFileSync(PUBLISH, "utf8");
  for (const name of [
    "Publish retained tarball to npm (OIDC + provenance)",
    "Publish authoritative generic tarball to npm (OIDC + provenance)",
  ]) {
    const publish = step(workflow, name);
    assert.match(publish, /case "\$RELEASE_NPM_PUBLICATION_STATE" in/u);
    assert.match(publish, /absent\)/u);
    assert.match(publish, /npm publish "\$RELEASE_TARBALL_PATH" --provenance/u);
    assert.match(publish, /exact\)/u);
    assert.match(publish, /already contains the exact immutable bytes/u);
    assert.match(publish, /mismatch\)/u);
    assert.match(publish, /refusing to overwrite/u);
    assert.match(publish, /release-npm-state\.mjs"?\s+inspect[\s\S]*--require exact/u);
  }
});

test("durable evidence retention remains reachable after an exact publication no-op", () => {
  const workflow = fs.readFileSync(PUBLISH, "utf8");
  const retainStart = workflow.indexOf("  retain-github-release-evidence:\n");
  assert.notEqual(retainStart, -1);
  const retain = workflow.slice(retainStart);
  assert.match(retain, /needs: publish-npm/u);
  assert.match(retain, /needs\.publish-npm\.result == 'success'/u);
});

test("root quality gate executes npm state and workflow regression tests", () => {
  const full = fs.readFileSync(FULL, "utf8");
  assert.match(full, /node --test \.\/scripts\/release-npm-state\.test\.mjs/u);
  assert.match(full, /node --test \.\/scripts\/release-npm-workflow\.test\.mjs/u);
});

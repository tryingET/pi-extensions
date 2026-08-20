import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const WORKFLOW_ROOT = path.join(ROOT, ".github", "workflows");
const LOCK_PATH = path.join(ROOT, "policy", "ci-toolchain-lock.json");
const FULL_SHA = /^[0-9a-f]{40}$/u;

function loadLock() {
  const lock = JSON.parse(fs.readFileSync(LOCK_PATH, "utf8"));
  assert.equal(lock.schemaVersion, 1);
  assert.match(lock.nodeVersion, /^\d+\.\d+\.\d+$/u);
  assert.match(lock.npmVersion, /^\d+\.\d+\.\d+$/u);
  assert.equal(typeof lock.actions, "object");
  return lock;
}

function workflowFiles() {
  return fs
    .readdirSync(WORKFLOW_ROOT)
    .filter((name) => name.endsWith(".yml") || name.endsWith(".yaml"))
    .sort()
    .map((name) => ({
      name,
      content: fs.readFileSync(path.join(WORKFLOW_ROOT, name), "utf8"),
    }));
}

function externalUses(content) {
  const uses = [];
  for (const line of content.split(/\r?\n/u)) {
    const match = line.match(/^\s*-?\s*uses:\s*([^\s#]+)(?:\s+#.*)?$/u);
    if (!match) continue;
    const value = match[1];
    if (value.startsWith("./")) continue;
    const separator = value.lastIndexOf("@");
    assert.notEqual(separator, -1, `external action is missing a ref: ${value}`);
    uses.push({ action: value.slice(0, separator), ref: value.slice(separator + 1) });
  }
  return uses;
}

function npmBootstrapVersions(content) {
  const versions = [];
  for (const line of content.split(/\r?\n/u)) {
    if (!/\bnpm\s+install\b/u.test(line) || !/\bnpm@/u.test(line)) continue;
    const match = line.match(/\bnpm@([^\s"'\\]+)/u);
    if (match) versions.push(match[1]);
  }
  return versions;
}

test("every external GitHub Action is pinned to the reviewed full commit SHA", () => {
  const lock = loadLock();
  const observed = new Map();

  for (const workflow of workflowFiles()) {
    for (const use of externalUses(workflow.content)) {
      assert.match(
        use.ref,
        FULL_SHA,
        `${workflow.name}: ${use.action} must use a full immutable commit SHA`,
      );
      const expected = lock.actions[use.action];
      assert.ok(
        expected,
        `${workflow.name}: ${use.action} is not present in ${path.relative(ROOT, LOCK_PATH)}`,
      );
      assert.equal(
        use.ref,
        expected.sha,
        `${workflow.name}: ${use.action} differs from the reviewed toolchain lock`,
      );
      observed.set(use.action, (observed.get(use.action) ?? 0) + 1);
    }
  }

  for (const action of Object.keys(lock.actions)) {
    assert.ok(observed.has(action), `${action} is locked but unused; remove or update it deliberately`);
  }
});

test("workflow Node and npm inputs are exact and match the toolchain lock", () => {
  const lock = loadLock();
  let nodeUses = 0;
  let npmUses = 0;

  for (const workflow of workflowFiles()) {
    for (const match of workflow.content.matchAll(/node-version:\s*["']?([^\s"']+)["']?/gu)) {
      nodeUses += 1;
      assert.equal(match[1], lock.nodeVersion, `${workflow.name}: node-version must match the lock`);
    }

    const versions = npmBootstrapVersions(workflow.content);
    for (const version of versions) {
      npmUses += 1;
      assert.equal(version, lock.npmVersion, `${workflow.name}: npm must match the lock exactly`);
    }

    const performsNpmEffects = /\bnpm\s+(?:ci|install|run|exec|pack|publish|view)\b/u.test(
      workflow.content,
    );
    if (performsNpmEffects) {
      assert.ok(
        versions.includes(lock.npmVersion),
        `${workflow.name}: npm effects require an exact governed npm bootstrap`,
      );
    }
  }

  assert.ok(nodeUses > 0, "no setup-node version was checked");
  assert.ok(npmUses > 0, "no npm bootstrap version was checked");
});

test("npm bootstrap never mutates the active setup-node installation", () => {
  for (const workflow of workflowFiles()) {
    for (const line of workflow.content.split(/\r?\n/u)) {
      if (!/\bnpm\s+install\s+--global\b/u.test(line) || !/\bnpm@/u.test(line)) continue;
      assert.match(
        line,
        /--prefix\s+/u,
        `${workflow.name}: install the governed npm client into an isolated prefix`,
      );
    }
  }
});

test("workflows do not reintroduce mutable action tags", () => {
  for (const workflow of workflowFiles()) {
    assert.doesNotMatch(
      workflow.content,
      /uses:\s*[^\s#]+@(main|master|latest|v\d+(?:\.\d+){0,2})(?:\s|#|$)/u,
      `${workflow.name}: mutable action ref detected`,
    );
  }
});

test("Dolt bootstrap is versioned and bound to reviewed source", () => {
  const lock = loadLock();
  assert.deepEqual(lock.dolt, {
    version: "2.3.1",
    tag: "v2.3.1",
    tagCommit: "b15770fe588268027d799c11356af0ce24ba882a",
    installerTemplateBlobSha: "b212efe0dcb5b8ac05ceeefad17a65f19a5f502b",
  });

  const combined = workflowFiles().map(({ content }) => content).join("\n");
  assert.doesNotMatch(combined, /dolthub\/dolt\/releases\/latest\//u);
  assert.ok(
    combined.includes("dolthub/dolt/releases/download/v$dolt_version/install.sh"),
    "Dolt installation must use the locked versioned release asset",
  );
  assert.ok(combined.includes(lock.dolt.tagCommit));
  assert.ok(combined.includes(lock.dolt.installerTemplateBlobSha));
  assert.ok(
    combined.includes('cmp "$expected" "$installer"'),
    "downloaded release installer must match the installer generated from locked source",
  );
});

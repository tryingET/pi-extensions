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
    uses.push({ action: value.slice(0, separator), ref: value.slice(separator + 1), line });
  }
  return uses;
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
      assert.ok(expected, `${workflow.name}: ${use.action} is not present in ${path.relative(ROOT, LOCK_PATH)}`);
      assert.equal(
        use.ref,
        expected.sha,
        `${workflow.name}: ${use.action} differs from the reviewed toolchain lock`,
      );
      observed.set(use.action, (observed.get(use.action) ?? 0) + 1);
    }
  }

  for (const action of Object.keys(lock.actions)) {
    assert.ok(observed.has(action), `${action} is locked but unused; remove or update the lock deliberately`);
  }
});

test("workflow Node and npm inputs are exact and match the toolchain lock", () => {
  const lock = loadLock();
  const workflows = workflowFiles();
  let nodeUses = 0;
  let npmUses = 0;

  for (const workflow of workflows) {
    for (const match of workflow.content.matchAll(/node-version:\s*["']?([^\s"']+)["']?/gu)) {
      nodeUses += 1;
      assert.equal(match[1], lock.nodeVersion, `${workflow.name}: node-version must match the lock`);
    }
    for (const match of workflow.content.matchAll(/npm install --global npm@([^\s"']+)/gu)) {
      npmUses += 1;
      assert.equal(match[1], lock.npmVersion, `${workflow.name}: npm must match the lock exactly`);
    }
  }

  assert.ok(nodeUses > 0, "no setup-node version was checked");
  assert.ok(npmUses > 0, "no npm bootstrap version was checked");
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

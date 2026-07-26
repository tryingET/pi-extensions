import assert from "node:assert/strict";
import { mkdirSync, mkdtempSync, rmSync, symlinkSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";

import {
  createDispatchHandoffStore,
  probeDispatchHandoffStoreReadiness,
} from "../src/dispatchGuard.js";

test("dispatch handoff readiness is owner-branded and does not write a receipt", () => {
  const root = mkdtempSync(join(tmpdir(), "vault-handoff-readiness-"));
  try {
    const filePath = join(root, "nested", "handoffs.jsonl");
    const store = createDispatchHandoffStore({ filePath });
    assert.deepEqual(probeDispatchHandoffStoreReadiness(store), { ok: true, filePath });
    assert.equal(probeDispatchHandoffStoreReadiness({ filePath }).ok, false);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test("dispatch handoff readiness rejects an existing symlink path", () => {
  const root = mkdtempSync(join(tmpdir(), "vault-handoff-symlink-"));
  try {
    const target = join(root, "target.jsonl");
    const filePath = join(root, "handoffs.jsonl");
    writeFileSync(target, "", "utf8");
    symlinkSync(target, filePath);
    const result = probeDispatchHandoffStoreReadiness(createDispatchHandoffStore({ filePath }));
    assert.equal(result.ok, false);
    assert.match(result.error, /symlink/);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test("dispatch handoff readiness rejects symlinked parent traversal", () => {
  const root = mkdtempSync(join(tmpdir(), "vault-handoff-parent-symlink-"));
  try {
    const realParent = join(root, "real-parent");
    const linkedParent = join(root, "linked-parent");
    mkdirSync(join(realParent, "nested"), { recursive: true });
    symlinkSync(realParent, linkedParent, "dir");
    const filePath = join(linkedParent, "nested", "handoffs.jsonl");
    const result = probeDispatchHandoffStoreReadiness(createDispatchHandoffStore({ filePath }));
    assert.equal(result.ok, false);
    assert.match(result.error, /traverses a symlink component/);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

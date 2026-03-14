import assert from "node:assert/strict";
import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import { loadPtxPolicyConfig } from "../src/ptxPolicyConfig.js";

test("loadPtxPolicyConfig searches parent directories from the active cwd", async () => {
  const tempDir = await mkdtemp(path.join(os.tmpdir(), "ptx-policy-config-"));
  const subDir = path.join(tempDir, "nested", "deeper");

  await mkdir(path.join(tempDir, ".pi"), { recursive: true });
  await mkdir(subDir, { recursive: true });
  await writeFile(
    path.join(tempDir, ".pi", "ptx-config.json"),
    JSON.stringify({ templates: { blocked: { policy: "block", fallback: "block" } } }),
    "utf8",
  );

  try {
    const loaded = await loadPtxPolicyConfig({ cwd: subDir });

    assert.equal(loaded.loadedFromFile, true);
    assert.equal(loaded.configPath, path.join(tempDir, ".pi", "ptx-config.json"));
    assert.equal(loaded.config.templates.blocked.policy, "block");
    assert.equal(loaded.searchBaseDir, subDir);
  } finally {
    await rm(tempDir, { recursive: true, force: true });
  }
});

test("loadPtxPolicyConfig surfaces invalid JSON from the nearest ancestor config", async () => {
  const tempDir = await mkdtemp(path.join(os.tmpdir(), "ptx-policy-config-invalid-"));
  const subDir = path.join(tempDir, "nested");

  await mkdir(path.join(tempDir, ".pi"), { recursive: true });
  await mkdir(subDir, { recursive: true });
  await writeFile(path.join(tempDir, ".pi", "ptx-config.json"), "{ not valid json", "utf8");

  try {
    const loaded = await loadPtxPolicyConfig({ cwd: subDir });

    assert.equal(loaded.loadedFromFile, false);
    assert.equal(loaded.configPath, path.join(tempDir, ".pi", "ptx-config.json"));
    assert.ok(loaded.error instanceof Error);
  } finally {
    await rm(tempDir, { recursive: true, force: true });
  }
});

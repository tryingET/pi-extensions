import assert from "node:assert/strict";
import { chmodSync, mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import os from "node:os";
import path from "node:path";
import test from "node:test";

import { createVaultRuntime, resolveDoltTimeoutMs } from "../src/vaultDb.js";

test("Dolt timeout parsing is strict and bounded", () => {
  assert.equal(resolveDoltTimeoutMs(undefined), 30_000);
  assert.equal(resolveDoltTimeoutMs("250"), 250);
  assert.equal(resolveDoltTimeoutMs("10ms"), 30_000);
  assert.equal(resolveDoltTimeoutMs("0"), 30_000);
  assert.equal(resolveDoltTimeoutMs("999999999"), 300_000);
});

test("Dolt subprocess timeout fails with a clear bounded-execution error", () => {
  const root = mkdtempSync(path.join(os.tmpdir(), "pi-vault-dolt-timeout-"));
  const bin = path.join(root, "bin");
  const dolt = path.join(bin, "dolt");
  const previous = {
    path: process.env.PATH,
    vault: process.env.VAULT_DIR,
    tmp: process.env.PI_VAULT_TMPDIR,
    timeout: process.env.PI_VAULT_DOLT_TIMEOUT_MS,
  };
  try {
    mkdirSync(bin, { recursive: true });
    writeFileSync(dolt, "#!/bin/sh\nsleep 2\n", "utf8");
    chmodSync(dolt, 0o755);
    process.env.PATH = `${bin}:${previous.path ?? ""}`;
    process.env.VAULT_DIR = root;
    process.env.PI_VAULT_TMPDIR = path.join(root, "tmp");
    process.env.PI_VAULT_DOLT_TIMEOUT_MS = "40";

    const result = createVaultRuntime().queryVaultJsonDetailed("SELECT 1");
    assert.equal(result.ok, false);
    assert.match(result.error, /Dolt command timed out after 40ms \(sql:select\)/);
  } finally {
    if (previous.path === undefined) delete process.env.PATH;
    else process.env.PATH = previous.path;
    if (previous.vault === undefined) delete process.env.VAULT_DIR;
    else process.env.VAULT_DIR = previous.vault;
    if (previous.tmp === undefined) delete process.env.PI_VAULT_TMPDIR;
    else process.env.PI_VAULT_TMPDIR = previous.tmp;
    if (previous.timeout === undefined) delete process.env.PI_VAULT_DOLT_TIMEOUT_MS;
    else process.env.PI_VAULT_DOLT_TIMEOUT_MS = previous.timeout;
    rmSync(root, { recursive: true, force: true });
  }
});

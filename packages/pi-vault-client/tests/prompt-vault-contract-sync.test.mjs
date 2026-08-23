import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import path from "node:path";
import test from "node:test";
import { PACKAGE_ROOT } from "./helpers/transpiled-module-harness.mjs";

test("generated client contract and fixtures match the Prompt Vault owner source", () => {
  const result = spawnSync(
    process.execPath,
    [path.join(PACKAGE_ROOT, "scripts/sync-prompt-vault-contract.mjs"), "--check"],
    { cwd: PACKAGE_ROOT, encoding: "utf8" },
  );
  assert.equal(result.status, 0, result.stderr || result.stdout);
  assert.match(result.stdout, /Prompt Vault contract verified \(schema v13, epoch 1\)/);
});

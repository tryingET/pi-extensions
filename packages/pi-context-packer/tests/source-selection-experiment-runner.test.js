import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import test from "node:test";

const runner = resolve("scripts/run-source-selection-experiment.mjs");

test("prepared-file runner rejects bytes that do not match the caller-supplied hash", () => {
  const root = mkdtempSync(join(tmpdir(), "context-packer-ablation-runner-"));
  try {
    const input = join(root, "prepared.json");
    const output = join(root, "result.json");
    writeFileSync(input, '{"protocol":"untrusted"}\n', "utf8");
    const result = spawnSync(
      process.execPath,
      [runner, "--input", input, "--input-sha256", "0".repeat(64), "--output", output],
      { encoding: "utf8" },
    );
    assert.notEqual(result.status, 0);
    assert.match(result.stderr, /prepared input hash mismatch/);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

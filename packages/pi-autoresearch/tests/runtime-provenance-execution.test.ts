import assert from "node:assert/strict";
import { mkdtempSync, readdirSync, rmSync } from "node:fs";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import { buildAutoresearchSegmentCloseout } from "../src/core/runtime-closeout.ts";
import { executeAutoresearchRun } from "../src/core/runtime-run.ts";

for (const mode of ["passed", "disabled", "skipped", "failed"] as const)
  test(`real synthetic process records checks ${mode}, not configured intent as execution`, async () => {
    const cwd = mkdtempSync(path.join(process.env.TMPDIR ?? os.tmpdir(), "ak6426-protocol-test-"));
    try {
      const result = await executeAutoresearchRun({
        cwd,
        description: "SYNTHETIC protocol test; no optimization",
        name: "test",
        metricName: "test_ms",
        direction: "lower",
        benchmarkCommand: mode === "skipped" ? "exit 1" : "printf 'METRIC test_ms=1.21\\n'",
        checksCommand: mode === "disabled" ? null : mode === "failed" ? "exit 1" : "true",
      });
      assert.equal(result.runReceipt.execution?.cwd, cwd);
      assert.equal(result.runReceipt.execution?.checks.state, mode);
      const run = buildAutoresearchSegmentCloseout(cwd).runs[0];
      assert.deepEqual(run.execution, result.runReceipt.execution);
      assert.equal(run.benchmarkCommand, result.benchmark.command);
      assert.equal(run.checksCommand, result.runReceipt.checksCommand);
      if (mode === "skipped") assert.equal(result.checks, null);
    } finally {
      rmSync(cwd, { recursive: true, force: true });
    }
  });

test("malformed supplied provenance is rejected before any receipt, ledger or command effect", async () => {
  const cwd = mkdtempSync(path.join(process.env.TMPDIR ?? os.tmpdir(), "ak6426-protocol-reject-"));
  try {
    await assert.rejects(
      executeAutoresearchRun({
        cwd,
        description: "invalid",
        provenance: {} as never,
        name: "test",
        metricName: "test_ms",
        direction: "lower",
        benchmarkCommand: "false",
      }),
      /Empty provenance/,
    );
    assert.deepEqual(readdirSync(cwd), []);
  } finally {
    rmSync(cwd, { recursive: true, force: true });
  }
});

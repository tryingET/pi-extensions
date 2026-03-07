import assert from "node:assert/strict";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";
import {
  evaluateRuntimeInvariants,
  formatRuntimeInvariantReport,
} from "../extensions/self/runtime-invariants.ts";

test("evaluateRuntimeInvariants reports ok for healthy state", async () => {
  const sessionsDir = await mkdtemp(join(tmpdir(), "invariants-ok-"));

  try {
    const report = evaluateRuntimeInvariants({
      operations: {
        turnCount: 5,
        turnsSinceMeaningfulChange: 2,
      },
      subagent: {
        sessionsDir,
        activeCount: 1,
        completedCount: 3,
        maxConcurrent: 5,
        reservedSessionNames: new Set(["reviewer"]),
      },
    });

    assert.equal(report.ok, true);
    assert.equal(report.issues.length, 0);
  } finally {
    await rm(sessionsDir, { recursive: true, force: true });
  }
});

test("evaluateRuntimeInvariants reports issues for invalid counters", () => {
  const report = evaluateRuntimeInvariants({
    operations: {
      turnCount: 1,
      turnsSinceMeaningfulChange: 3,
    },
    subagent: {
      sessionsDir: "/tmp/non-existent-invariant-dir",
      activeCount: 8,
      completedCount: -1,
      maxConcurrent: 4,
      reservedSessionNames: new Set(),
    },
  });

  assert.equal(report.ok, false);
  assert.ok(
    report.issues.some((issue) => issue.id === "ops.turnsSinceMeaningfulChange.gt.turnCount"),
  );
  assert.ok(report.issues.some((issue) => issue.id === "subagent.completedCount.invalid"));
  assert.ok(report.issues.some((issue) => issue.id === "subagent.activeCount.gt.maxConcurrent"));
});

test("formatRuntimeInvariantReport renders issue summary", () => {
  const report = evaluateRuntimeInvariants({
    operations: {
      turnCount: 0,
      turnsSinceMeaningfulChange: -1,
    },
    subagent: {
      activeCount: 0,
      completedCount: 0,
      maxConcurrent: 5,
      reservedSessionNames: new Set(),
    },
  });

  const text = formatRuntimeInvariantReport(report);
  assert.match(text, /Runtime Invariant Check/);
  assert.match(text, /issues:/);
});

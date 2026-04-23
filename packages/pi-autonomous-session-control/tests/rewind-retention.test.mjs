import assert from "node:assert/strict";
import test from "node:test";
import { planRetentionLiveSet } from "../extensions/self/rewind/index.ts";

test("rewind retention planning keeps current, undo, and pinned commits while pruning ordinary bindings", () => {
  const now = Date.parse("2026-04-22T00:00:00.000Z");

  const plan = planRetentionLiveSet(
    [
      {
        commitSha: "binding-fresh",
        timestamp: now - 1_000,
        kind: "binding",
      },
      {
        commitSha: "binding-stale",
        timestamp: now - 40 * 24 * 60 * 60 * 1000,
        kind: "binding",
      },
      {
        commitSha: "binding-pinned",
        timestamp: now - 50 * 24 * 60 * 60 * 1000,
        kind: "binding",
        pinned: true,
      },
      {
        commitSha: "current-commit",
        timestamp: now - 2_000,
        kind: "current",
      },
      {
        commitSha: "undo-commit",
        timestamp: now - 3_000,
        kind: "undo",
      },
    ],
    {
      maxSnapshots: 1,
      maxAgeDays: 30,
    },
    now,
  );

  assert.deepEqual(plan.pinnedCommitShas.sort(), [
    "binding-pinned",
    "current-commit",
    "undo-commit",
  ]);
  assert.deepEqual(plan.retainedCommitShas, ["binding-fresh"]);
  assert.deepEqual(plan.liveCommitShas.sort(), [
    "binding-fresh",
    "binding-pinned",
    "current-commit",
    "undo-commit",
  ]);
});

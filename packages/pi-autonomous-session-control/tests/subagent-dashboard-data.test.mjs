// summary: "Tests dashboard snapshot sorting, filtering, counts, previews, and ownership checks."
// read_when:
//   - "Changing subagent dashboard row selection or presentation metadata."

import assert from "node:assert/strict";
import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";
import { createSubagentDashboardSnapshot } from "../extensions/self/subagent-dashboard-data.ts";
import { writeStatus } from "./subagent-dashboard-data-harness.mjs";

test("createSubagentDashboardSnapshot sorts recent sessions and computes hints", async () => {
  const sessionsDir = await mkdtemp(join(tmpdir(), "subagent-dashboard-"));

  try {
    await writeStatus(
      sessionsDir,
      "older-done",
      "done",
      "2026-03-06T10:00:00.000Z",
      "Summarize the repository and propose follow-up steps",
    );
    await writeStatus(
      sessionsDir,
      "newer-timeout",
      "timeout",
      "2026-03-06T11:00:00.000Z",
      "Investigate a timeout in the dispatch lifecycle and isolate the cause",
      {
        parentSessionKey: "live-2",
        resultPreview: "Subagent timed out after 300s",
      },
    );

    const snapshot = createSubagentDashboardSnapshot(sessionsDir, {
      now: Date.parse("2026-03-06T12:00:00.000Z"),
      currentSessionKey: "live-2",
    });

    assert.equal(snapshot.total, 2);
    assert.equal(snapshot.counts.done, 1);
    assert.equal(snapshot.counts.timeout, 1);
    assert.equal(snapshot.rows[0].sessionName, "newer-timeout");
    assert.equal(snapshot.rows[0].ageLabel, "1h ago");
    assert.equal(snapshot.rows[0].sessionScopeLabel, "Current live session (live-2)");
    assert.equal(snapshot.rows[0].resultPreview, "Subagent timed out after 300s");
    assert.match(snapshot.rows[0].recommendedActionHint, /narrower objective/i);
    assert.equal(snapshot.rows[1].sessionName, "older-done");
    assert.match(snapshot.rows[1].recommendedActionHint, /review outcome/i);
  } finally {
    await rm(sessionsDir, { recursive: true, force: true });
  }
});
test("createSubagentDashboardSnapshot truncates long objectives and respects row limit", async () => {
  const sessionsDir = await mkdtemp(join(tmpdir(), "subagent-dashboard-limit-"));

  try {
    await writeStatus(
      sessionsDir,
      "running-now",
      "running",
      "2026-03-06T12:00:30.000Z",
      "This objective is deliberately long so the dashboard preview has to truncate it cleanly for the compact widget presentation.",
      { parentSessionKey: "live-now" },
    );
    await writeStatus(
      sessionsDir,
      "abandoned-before",
      "abandoned",
      "2026-03-06T12:00:00.000Z",
      "Resume or rerun the abandoned session after restart reconciliation.",
    );

    const snapshot = createSubagentDashboardSnapshot(sessionsDir, {
      limit: 1,
      now: Date.parse("2026-03-06T12:01:00.000Z"),
    });

    assert.equal(snapshot.total, 2);
    assert.equal(snapshot.rows.length, 1);
    assert.equal(snapshot.rows[0].sessionName, "running-now");
    assert.match(snapshot.rows[0].objectivePreview, /…$/);
    assert.equal(snapshot.rows[0].sessionScope, "recorded");
    assert.match(snapshot.rows[0].recommendedActionHint, /monitor/i);
  } finally {
    await rm(sessionsDir, { recursive: true, force: true });
  }
});
test("createSubagentDashboardSnapshot can filter to the current live session and freshness window", async () => {
  const sessionsDir = await mkdtemp(join(tmpdir(), "subagent-dashboard-filter-"));

  try {
    await writeStatus(
      sessionsDir,
      "current-recent",
      "done",
      "2026-03-06T11:30:00.000Z",
      "Summarize the successful current-session run.",
      { parentSessionKey: "live-2" },
    );
    await writeStatus(
      sessionsDir,
      "current-stale",
      "timeout",
      "2026-03-06T10:00:00.000Z",
      "Retry the stale current-session run.",
      { parentSessionKey: "live-2" },
    );
    await writeStatus(
      sessionsDir,
      "other-recent",
      "error",
      "2026-03-06T11:45:00.000Z",
      "Inspect another session's failure.",
      { parentSessionKey: "live-9" },
    );

    const snapshot = createSubagentDashboardSnapshot(sessionsDir, {
      now: Date.parse("2026-03-06T12:00:00.000Z"),
      currentSessionKey: "live-2",
      sessionScope: "current",
      maxAgeMs: 60 * 60 * 1000,
    });

    assert.equal(snapshot.total, 1);
    assert.equal(snapshot.counts.done, 1);
    assert.equal(snapshot.counts.timeout, 0);
    assert.equal(snapshot.counts.error, 0);
    assert.equal(snapshot.rows.length, 1);
    assert.equal(snapshot.rows[0].sessionName, "current-recent");
    assert.equal(snapshot.rows[0].sessionScope, "current");
  } finally {
    await rm(sessionsDir, { recursive: true, force: true });
  }
});
test("createSubagentDashboardSnapshot keeps current-session records that lack legacy repo-root metadata", async () => {
  const sessionsDir = await mkdtemp(join(tmpdir(), "subagent-dashboard-legacy-repo-filter-"));

  try {
    await writeStatus(
      sessionsDir,
      "legacy-current-session",
      "done",
      "2026-03-06T11:30:00.000Z",
      "Summarize a current-session run recorded before repo-root metadata existed.",
      { parentSessionKey: "live-2" },
    );

    const snapshot = createSubagentDashboardSnapshot(sessionsDir, {
      now: Date.parse("2026-03-06T12:00:00.000Z"),
      currentSessionKey: "live-2",
      currentRepoRoot: "/repo/current",
      sessionScope: "current",
      maxAgeMs: 60 * 60 * 1000,
    });

    assert.equal(snapshot.total, 1);
    assert.equal(snapshot.rows[0].sessionName, "legacy-current-session");
  } finally {
    await rm(sessionsDir, { recursive: true, force: true });
  }
});
test("createSubagentDashboardSnapshot ignores valid-shaped sidecars without ASC ownership markers", async () => {
  const sessionsDir = await mkdtemp(join(tmpdir(), "subagent-dashboard-unowned-status-"));

  try {
    await writeFile(join(sessionsDir, "foreign.jsonl"), "{}\n");
    await writeFile(
      join(sessionsDir, "foreign.status.json"),
      JSON.stringify({
        sessionName: "foreign",
        status: "done",
        pid: process.pid,
        ppid: process.ppid,
        createdAt: "2026-03-06T11:30:00.000Z",
        updatedAt: "2026-03-06T11:30:00.000Z",
      }),
    );

    const snapshot = createSubagentDashboardSnapshot(sessionsDir, {
      now: Date.parse("2026-03-06T12:00:00.000Z"),
    });

    assert.equal(snapshot.total, 0);
    assert.deepEqual(snapshot.rows, []);
    assert.deepEqual(snapshot.counts, {
      running: 0,
      done: 0,
      error: 0,
      timeout: 0,
      aborted: 0,
      abandoned: 0,
    });
  } finally {
    await rm(sessionsDir, { recursive: true, force: true });
  }
});
test("createSubagentDashboardSnapshot ignores invalid status sidecars", async () => {
  const sessionsDir = await mkdtemp(join(tmpdir(), "subagent-dashboard-invalid-status-"));

  try {
    await writeFile(
      join(sessionsDir, "weird.status.json"),
      JSON.stringify({
        sessionName: "weird",
        status: "bogus",
        pid: process.pid,
        ppid: process.ppid,
        createdAt: "2026-03-06T11:30:00.000Z",
        updatedAt: "2026-03-06T11:30:00.000Z",
      }),
    );

    const snapshot = createSubagentDashboardSnapshot(sessionsDir, {
      now: Date.parse("2026-03-06T12:00:00.000Z"),
    });

    assert.equal(snapshot.total, 0);
    assert.deepEqual(snapshot.rows, []);
    assert.deepEqual(snapshot.counts, {
      running: 0,
      done: 0,
      error: 0,
      timeout: 0,
      aborted: 0,
      abandoned: 0,
    });
  } finally {
    await rm(sessionsDir, { recursive: true, force: true });
  }
});
test("createSubagentDashboardSnapshot can filter to the current repo root as well as the live session", async () => {
  const sessionsDir = await mkdtemp(join(tmpdir(), "subagent-dashboard-repo-filter-"));

  try {
    await writeStatus(
      sessionsDir,
      "current-repo",
      "done",
      "2026-03-06T11:30:00.000Z",
      "Summarize the current-repo run.",
      { parentSessionKey: "live-2", parentRepoRoot: "/repo/current" },
    );
    await writeStatus(
      sessionsDir,
      "other-repo",
      "done",
      "2026-03-06T11:45:00.000Z",
      "Summarize the other-repo run.",
      { parentSessionKey: "live-2", parentRepoRoot: "/repo/other" },
    );

    const snapshot = createSubagentDashboardSnapshot(sessionsDir, {
      now: Date.parse("2026-03-06T12:00:00.000Z"),
      currentSessionKey: "live-2",
      currentRepoRoot: "/repo/current",
      sessionScope: "current",
      maxAgeMs: 60 * 60 * 1000,
    });

    assert.equal(snapshot.total, 1);
    assert.equal(snapshot.rows.length, 1);
    assert.equal(snapshot.rows[0].sessionName, "current-repo");
  } finally {
    await rm(sessionsDir, { recursive: true, force: true });
  }
});

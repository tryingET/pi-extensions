import assert from "node:assert/strict";
import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";
import {
  createSubagentDashboardSnapshot,
  createSubagentSessionInspection,
} from "../extensions/self/subagent-dashboard-data.ts";
import { getSessionStatusPath } from "../extensions/self/subagent-session.ts";

async function writeStatus(sessionsDir, sessionName, status, updatedAt, objective) {
  await writeFile(
    getSessionStatusPath(sessionsDir, sessionName),
    JSON.stringify({
      sessionName,
      status,
      pid: process.pid,
      ppid: process.ppid,
      createdAt: updatedAt,
      updatedAt,
      objective,
    }),
  );
}

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
    );

    const snapshot = createSubagentDashboardSnapshot(sessionsDir, {
      now: Date.parse("2026-03-06T12:00:00.000Z"),
    });

    assert.equal(snapshot.total, 2);
    assert.equal(snapshot.counts.done, 1);
    assert.equal(snapshot.counts.timeout, 1);
    assert.equal(snapshot.rows[0].sessionName, "newer-timeout");
    assert.equal(snapshot.rows[0].ageLabel, "1h ago");
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
    assert.match(snapshot.rows[0].recommendedActionHint, /monitor/i);
  } finally {
    await rm(sessionsDir, { recursive: true, force: true });
  }
});

test("createSubagentSessionInspection summarizes lifecycle metadata and artifact paths", async () => {
  const sessionsDir = await mkdtemp(join(tmpdir(), "subagent-dashboard-inspect-"));
  const updatedAt = "2026-03-06T11:59:00.000Z";

  try {
    await writeFile(
      getSessionStatusPath(sessionsDir, "done-session"),
      JSON.stringify({
        sessionName: "done-session",
        status: "done",
        pid: process.pid,
        ppid: process.ppid,
        createdAt: "2026-03-06T11:58:00.000Z",
        updatedAt,
        objective: "Review the migrated dashboard slice and capture next steps",
        exitCode: 0,
        elapsed: 61_000,
      }),
    );
    await writeFile(join(sessionsDir, "done-session.json"), '{"session":true}\n');

    const inspection = createSubagentSessionInspection(sessionsDir, "done-session", {
      now: Date.parse("2026-03-06T12:00:00.000Z"),
    });

    assert.equal(inspection.found, true);
    assert.equal(inspection.status, "done");
    assert.equal(inspection.ageLabel, "1m ago");
    assert.equal(inspection.elapsedLabel, "1m 1s");
    assert.equal(inspection.exitCode, 0);
    assert.equal(inspection.pidState, "not-applicable");
    assert.equal(inspection.sessionArtifact.exists, true);
    assert.equal(inspection.statusArtifact.exists, true);
    assert.match(inspection.recommendedActionHint, /review outcome/i);
    assert.equal(inspection.warnings.length, 0);
    assert.match(inspection.rawStatusJson, /"done-session"/);
  } finally {
    await rm(sessionsDir, { recursive: true, force: true });
  }
});

test("createSubagentSessionInspection suggests recent sessions when the requested name is missing", async () => {
  const sessionsDir = await mkdtemp(join(tmpdir(), "subagent-dashboard-missing-"));

  try {
    await writeStatus(
      sessionsDir,
      "analysis-run-2",
      "error",
      "2026-03-06T12:05:00.000Z",
      "Inspect a failed subagent run and decide whether retry is safe.",
    );
    await writeStatus(
      sessionsDir,
      "review-run-1",
      "done",
      "2026-03-06T12:00:00.000Z",
      "Summarize the completed review results.",
    );

    const inspection = createSubagentSessionInspection(sessionsDir, "analysis", {
      now: Date.parse("2026-03-06T12:06:00.000Z"),
    });

    assert.equal(inspection.found, false);
    assert.match(inspection.recommendedActionHint, /inspect artifact paths/i);
    assert.deepEqual(inspection.recentSessionSuggestions, ["analysis-run-2", "review-run-1"]);
    assert.match(inspection.warnings.join("\n"), /missing status sidecar/i);
  } finally {
    await rm(sessionsDir, { recursive: true, force: true });
  }
});

import assert from "node:assert/strict";
import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";
import { visibleWidth } from "@mariozechner/pi-tui";
import { buildDashboardLines } from "../extensions/self/subagent-dashboard.ts";
import {
  createSubagentDashboardSnapshot,
  createSubagentSessionInspection,
} from "../extensions/self/subagent-dashboard-data.ts";
import { getSessionStatusPath } from "../extensions/self/subagent-session.ts";

async function writeStatus(sessionsDir, sessionName, status, updatedAt, objective, extras = {}) {
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
      ...extras,
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
        parentSessionKey: "live-9",
        resultPreview: "Review landed cleanly; next step is to verify the dashboard in Pi.",
        exitCode: 0,
        elapsed: 61_000,
      }),
    );
    await writeFile(join(sessionsDir, "done-session.json"), '{"session":true}\n');

    const inspection = createSubagentSessionInspection(sessionsDir, "done-session", {
      now: Date.parse("2026-03-06T12:00:00.000Z"),
      currentSessionKey: "live-9",
    });

    assert.equal(inspection.found, true);
    assert.equal(inspection.status, "done");
    assert.equal(inspection.ageLabel, "1m ago");
    assert.equal(inspection.sessionScopeLabel, "Current live session (live-9)");
    assert.equal(
      inspection.resultPreview,
      "Review landed cleanly; next step is to verify the dashboard in Pi.",
    );
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
      { parentSessionKey: "live-7" },
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

test("buildDashboardLines never exceeds the requested width", async () => {
  const sessionsDir = await mkdtemp(join(tmpdir(), "subagent-dashboard-width-"));
  const theme = {
    fg(_name, value) {
      return value;
    },
  };

  try {
    const recentDoneAt = new Date(Date.now() - 5 * 60 * 1000).toISOString();
    const recentTimeoutAt = new Date(Date.now() - 2 * 60 * 1000).toISOString();

    await writeStatus(
      sessionsDir,
      "reviewer-2",
      "done",
      recentDoneAt,
      "Reply with exactly DIRECT_OK_GHOSTTY_SUBAGENT_ETEST_2 after inspecting the session.",
      {
        parentSessionKey: "f50f147a-7a83-4d5e-8123-123456789abc",
      },
    );
    await writeStatus(
      sessionsDir,
      "task-662-scope",
      "timeout",
      recentTimeoutAt,
      "Inspect AK task #662 scope in /home/tryinget/ai-society/softwareco/owned/pi-extensions and summarize the blast radius.",
      {
        parentSessionKey: "f50f147a-7a83-4d5e-8123-123456789abc",
      },
    );

    const baselineLines = buildDashboardLines(
      93,
      theme,
      sessionsDir,
      "f50f147a-7a83-4d5e-8123-123456789abc",
    );
    assert.ok(baselineLines.length > 0);

    for (const width of [1, 2, 3, 10, 24, 40, 60, 93]) {
      const lines = buildDashboardLines(
        width,
        theme,
        sessionsDir,
        "f50f147a-7a83-4d5e-8123-123456789abc",
      );
      for (const line of lines) {
        assert.ok(
          visibleWidth(line) <= width,
          `expected line width <= ${width}, got ${visibleWidth(line)} for ${JSON.stringify(line)}`,
        );
      }
    }
  } finally {
    await rm(sessionsDir, { recursive: true, force: true });
  }
});

test("buildDashboardLines hides the widget until this live session has recent subagent activity", async () => {
  const sessionsDir = await mkdtemp(join(tmpdir(), "subagent-dashboard-empty-"));
  const theme = {
    fg(_name, value) {
      return value;
    },
  };

  try {
    await writeStatus(
      sessionsDir,
      "other-session",
      "done",
      "2026-03-06T11:45:00.000Z",
      "This belongs to another live session and should stay hidden.",
      { parentSessionKey: "other-live-session" },
    );
    await writeStatus(
      sessionsDir,
      "current-but-stale",
      "done",
      "2026-03-06T10:00:00.000Z",
      "This current-session entry is too old for the widget.",
      { parentSessionKey: "live-session-key" },
    );

    for (const width of [1, 2, 3, 10, 24, 40]) {
      const lines = buildDashboardLines(width, theme, sessionsDir, "live-session-key");
      assert.deepEqual(lines, []);
    }
  } finally {
    await rm(sessionsDir, { recursive: true, force: true });
  }
});

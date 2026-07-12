// summary: "Tests secure dashboard session inspection, artifact warnings, and lifecycle summaries."
// read_when:
//   - "Changing dashboard inspection path containment or status interpretation."

import assert from "node:assert/strict";
import { mkdir, mkdtemp, rm, symlink, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";
import { createSubagentSessionInspection } from "../extensions/self/subagent-dashboard-data.ts";
import { getSessionStatusPath } from "../extensions/self/subagent-session.ts";
import { writeStatus } from "./subagent-dashboard-data-harness.mjs";

test("createSubagentSessionInspection does not classify unowned status sidecars as ASC lifecycle state", async () => {
  const sessionsDir = await mkdtemp(join(tmpdir(), "subagent-dashboard-inspect-unowned-"));

  try {
    await writeFile(join(sessionsDir, "foreign.jsonl"), "{}\n");
    await writeFile(
      getSessionStatusPath(sessionsDir, "foreign"),
      JSON.stringify({
        sessionName: "foreign",
        status: "done",
        pid: process.pid,
        ppid: process.ppid,
        createdAt: "2026-03-06T11:30:00.000Z",
        updatedAt: "2026-03-06T11:30:00.000Z",
      }),
    );

    const inspection = createSubagentSessionInspection(sessionsDir, "foreign", {
      now: Date.parse("2026-03-06T12:00:00.000Z"),
    });

    assert.equal(inspection.found, true);
    assert.equal(inspection.status, undefined);
    assert.match(inspection.warnings.join("\n"), /not an owned ASC subagent status artifact/i);
    assert.match(inspection.recommendedActionHint, /inspect artifact paths/i);
  } finally {
    await rm(sessionsDir, { recursive: true, force: true });
  }
});
test("createSubagentSessionInspection rejects path traversal session names", async () => {
  const root = await mkdtemp(join(tmpdir(), "subagent-dashboard-inspect-traversal-"));
  const sessionsDir = join(root, "native", "sessions");
  const outsideDir = join(root, "native", "outside");

  try {
    await mkdir(sessionsDir, { recursive: true });
    await mkdir(outsideDir, { recursive: true });
    await writeFile(
      join(outsideDir, "probe.status.json"),
      JSON.stringify({
        sessionName: "../outside/probe",
        sessionKind: "subagent",
        status: "done",
        pid: process.pid,
        ppid: process.ppid,
        createdAt: "2026-03-06T11:30:00.000Z",
        updatedAt: "2026-03-06T11:30:00.000Z",
        resultPreview: "OUTSIDE_READ",
      }),
    );

    const inspection = createSubagentSessionInspection(sessionsDir, "../outside/probe", {
      now: Date.parse("2026-03-06T12:00:00.000Z"),
    });

    assert.equal(inspection.found, false);
    assert.equal(inspection.status, undefined);
    assert.equal(inspection.resultPreview, undefined);
    assert.match(inspection.warnings.join("\n"), /invalid session name/i);
    assert.ok(inspection.statusArtifact.path.startsWith(sessionsDir));
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});
test("createSubagentSessionInspection ignores recorded session files outside the session dir", async () => {
  const root = await mkdtemp(join(tmpdir(), "subagent-dashboard-inspect-contained-"));
  const sessionsDir = join(root, "native", "sessions");
  const outsideDir = join(root, "native", "outside");

  try {
    await mkdir(sessionsDir, { recursive: true });
    await mkdir(outsideDir, { recursive: true });
    await writeFile(join(outsideDir, "probe.jsonl"), "outside\n");
    await writeFile(
      getSessionStatusPath(sessionsDir, "probe"),
      JSON.stringify({
        sessionName: "probe",
        sessionKind: "subagent",
        status: "done",
        pid: process.pid,
        ppid: process.ppid,
        createdAt: "2026-03-06T11:30:00.000Z",
        updatedAt: "2026-03-06T11:30:00.000Z",
        sessionFile: join(outsideDir, "probe.jsonl"),
        resultPreview: "STATUS_OK",
      }),
    );

    const inspection = createSubagentSessionInspection(sessionsDir, "probe", {
      now: Date.parse("2026-03-06T12:00:00.000Z"),
    });

    assert.equal(inspection.status, "done");
    assert.equal(inspection.resultPreview, "STATUS_OK");
    assert.match(inspection.warnings.join("\n"), /escapes the subagent session directory/i);
    assert.equal(inspection.sessionArtifact.path, join(sessionsDir, "probe.jsonl"));
    assert.equal(inspection.sessionArtifact.exists, false);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});
test("createSubagentSessionInspection does not follow recorded symlinks outside the session dir", async () => {
  const root = await mkdtemp(join(tmpdir(), "subagent-dashboard-inspect-symlink-"));
  const sessionsDir = join(root, "native", "sessions");
  const outsideDir = join(root, "native", "outside");

  try {
    await mkdir(sessionsDir, { recursive: true });
    await mkdir(outsideDir, { recursive: true });
    const outsideFile = join(outsideDir, "probe.jsonl");
    const symlinkFile = join(sessionsDir, "probe-link.jsonl");
    await writeFile(outsideFile, "outside\n");
    await symlink(outsideFile, symlinkFile);
    await writeFile(
      getSessionStatusPath(sessionsDir, "probe"),
      JSON.stringify({
        sessionName: "probe",
        sessionKind: "subagent",
        status: "done",
        pid: process.pid,
        ppid: process.ppid,
        createdAt: "2026-03-06T11:30:00.000Z",
        updatedAt: "2026-03-06T11:30:00.000Z",
        sessionFile: symlinkFile,
        resultPreview: "STATUS_OK",
      }),
    );

    const inspection = createSubagentSessionInspection(sessionsDir, "probe", {
      now: Date.parse("2026-03-06T12:00:00.000Z"),
    });

    assert.equal(inspection.status, "done");
    assert.equal(inspection.resultPreview, "STATUS_OK");
    assert.match(inspection.warnings.join("\n"), /escapes the subagent session directory/i);
    assert.equal(inspection.sessionArtifact.path, join(sessionsDir, "probe.jsonl"));
    assert.notEqual(inspection.sessionArtifact.path, symlinkFile);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});
test("createSubagentSessionInspection reports missing recorded files inside the session dir without escape warnings", async () => {
  const sessionsDir = await mkdtemp(
    join(tmpdir(), "subagent-dashboard-inspect-missing-contained-"),
  );

  try {
    const missingFile = join(sessionsDir, "missing-recorded.jsonl");
    await writeFile(
      getSessionStatusPath(sessionsDir, "probe"),
      JSON.stringify({
        sessionName: "probe",
        sessionKind: "subagent",
        status: "done",
        pid: process.pid,
        ppid: process.ppid,
        createdAt: "2026-03-06T11:30:00.000Z",
        updatedAt: "2026-03-06T11:30:00.000Z",
        sessionFile: missingFile,
        resultPreview: "STATUS_OK",
      }),
    );

    const inspection = createSubagentSessionInspection(sessionsDir, "probe", {
      now: Date.parse("2026-03-06T12:00:00.000Z"),
    });

    assert.equal(inspection.status, "done");
    assert.equal(inspection.sessionArtifact.path, missingFile);
    assert.equal(inspection.sessionArtifact.exists, false);
    assert.doesNotMatch(inspection.warnings.join("\n"), /escapes the subagent session directory/i);
    assert.match(inspection.warnings.join("\n"), /missing session file/i);
  } finally {
    await rm(sessionsDir, { recursive: true, force: true });
  }
});
test("createSubagentSessionInspection rejects malformed non-string sessionFile sidecars", async () => {
  const sessionsDir = await mkdtemp(join(tmpdir(), "subagent-dashboard-inspect-bad-file-"));

  try {
    await writeFile(
      getSessionStatusPath(sessionsDir, "bad-session-file"),
      JSON.stringify({
        sessionName: "bad-session-file",
        status: "done",
        pid: process.pid,
        ppid: process.ppid,
        createdAt: "2026-03-06T11:30:00.000Z",
        updatedAt: "2026-03-06T11:30:00.000Z",
        sessionKind: "subagent",
        sessionFile: 123,
      }),
    );

    const inspection = createSubagentSessionInspection(sessionsDir, "bad-session-file", {
      now: Date.parse("2026-03-06T12:00:00.000Z"),
    });

    assert.equal(inspection.status, undefined);
    assert.match(inspection.warnings.join("\n"), /not an owned ASC subagent status artifact/i);
  } finally {
    await rm(sessionsDir, { recursive: true, force: true });
  }
});
test("createSubagentSessionInspection reports stale process identity as not live", async () => {
  const sessionsDir = await mkdtemp(join(tmpdir(), "subagent-dashboard-stale-pid-"));

  try {
    await writeStatus(
      sessionsDir,
      "stale-pid",
      "running",
      new Date().toISOString(),
      "Inspect a stale running sidecar after PID reuse.",
      { pidStartedAt: -1 },
    );
    await writeFile(join(sessionsDir, "stale-pid.jsonl"), "{}\n");

    const inspection = createSubagentSessionInspection(sessionsDir, "stale-pid");

    assert.equal(inspection.status, "running");
    assert.equal(inspection.pidState, "dead");
    assert.match(inspection.warnings.join("\n"), /process identity mismatch/i);
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
        sessionKind: "subagent",
      }),
    );
    await writeFile(join(sessionsDir, "done-session.jsonl"), '{"session":true}\n');

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

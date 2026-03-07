import assert from "node:assert/strict";
import { mkdtemp, rm, utimes, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";
import {
  canSpawnSubagent,
  cleanupOldSessions,
  createSubagentState,
  getSessionStatusPath,
  getSubagentStats,
} from "../extensions/self/subagent-session.ts";

test("createSubagentState uses default maxConcurrent", () => {
  const state = createSubagentState("/tmp/test-sessions");
  assert.equal(state.maxConcurrent, 5);
});

test("createSubagentState accepts custom maxConcurrent", () => {
  const state = createSubagentState("/tmp/test-sessions", { maxConcurrent: 10 });
  assert.equal(state.maxConcurrent, 10);
});

test("canSpawnSubagent returns true when under limit", () => {
  const state = createSubagentState("/tmp/test-sessions", { maxConcurrent: 5 });
  state.activeCount = 3;
  assert.equal(canSpawnSubagent(state), true);
});

test("canSpawnSubagent returns false when at limit", () => {
  const state = createSubagentState("/tmp/test-sessions", { maxConcurrent: 5 });
  state.activeCount = 5;
  assert.equal(canSpawnSubagent(state), false);
});

test("cleanupOldSessions removes files older than maxAgeMs", async () => {
  const sessionsDir = await mkdtemp(join(tmpdir(), "session-cleanup-age-"));

  try {
    // Create old session file
    const oldFile = join(sessionsDir, "old-session.json");
    await writeFile(oldFile, "{}");
    await writeFile(join(sessionsDir, "old-session.lock"), "busy");
    await writeFile(getSessionStatusPath(sessionsDir, "old-session"), "{}");

    // Set mtime to 10 days ago
    const tenDaysAgo = Date.now() - 10 * 24 * 60 * 60 * 1000;
    await utimes(oldFile, new Date(tenDaysAgo), new Date(tenDaysAgo));

    // Create new session file
    const newFile = join(sessionsDir, "new-session.json");
    await writeFile(newFile, "{}");

    const state = createSubagentState(sessionsDir);
    const result = cleanupOldSessions(state, { maxAgeMs: 7 * 24 * 60 * 60 * 1000 });

    assert.equal(result.removedSessions, 1);
    assert.equal(result.removedFiles, 3);
    assert.equal(result.kept, 1);
  } finally {
    await rm(sessionsDir, { recursive: true, force: true });
  }
});

test("cleanupOldSessions removes excess files based on maxCount", async () => {
  const sessionsDir = await mkdtemp(join(tmpdir(), "session-cleanup-count-"));

  try {
    // Create 10 session files
    for (let i = 0; i < 10; i++) {
      const name = `session-${i.toString().padStart(2, "0")}`;
      const file = join(sessionsDir, `${name}.json`);
      await writeFile(file, "{}");
      await writeFile(join(sessionsDir, `${name}.lock`), "busy");
      await writeFile(getSessionStatusPath(sessionsDir, name), "{}");
      // Stagger mtimes so they have different ages
      await new Promise((r) => setTimeout(r, 10));
    }

    const state = createSubagentState(sessionsDir);
    const result = cleanupOldSessions(state, { maxCount: 5 });

    assert.equal(result.removedSessions, 5);
    assert.equal(result.removedFiles, 15);
    assert.equal(result.kept, 5);
  } finally {
    await rm(sessionsDir, { recursive: true, force: true });
  }
});

test("getSubagentStats returns correct session count", async () => {
  const sessionsDir = await mkdtemp(join(tmpdir(), "session-stats-"));

  try {
    // Create 3 session files
    for (let i = 0; i < 3; i++) {
      await writeFile(join(sessionsDir, `session-${i}.json`), "{}");
    }
    await writeFile(
      getSessionStatusPath(sessionsDir, "session-0"),
      JSON.stringify({
        sessionName: "session-0",
        status: "done",
        pid: process.pid,
        ppid: process.ppid,
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      }),
    );
    await writeFile(
      getSessionStatusPath(sessionsDir, "session-1"),
      JSON.stringify({
        sessionName: "session-1",
        status: "abandoned",
        pid: process.pid,
        ppid: process.ppid,
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      }),
    );

    const state = createSubagentState(sessionsDir);
    const stats = getSubagentStats(state);

    assert.equal(stats.sessionFiles, 3);
    assert.equal(stats.active, 0);
    assert.equal(stats.completed, 0);
    assert.equal(stats.maxConcurrent, 5);
    assert.equal(stats.statusCounts.done, 1);
    assert.equal(stats.statusCounts.abandoned, 1);
    assert.equal(stats.statusCounts.running, 0);
  } finally {
    await rm(sessionsDir, { recursive: true, force: true });
  }
});

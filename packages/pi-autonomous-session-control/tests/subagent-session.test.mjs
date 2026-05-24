import assert from "node:assert/strict";
import { mkdtemp, readdir, readFile, rm, utimes, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";
import {
  canSpawnSubagent,
  cleanupOldSessions,
  clearSubagentSessions,
  createSubagentState,
  getSessionStatusPath,
  getSubagentStats,
} from "../extensions/self/subagent-session.ts";

async function writeStatus(sessionsDir, sessionName, status = "done", extras = {}) {
  const now = new Date().toISOString();
  await writeFile(
    getSessionStatusPath(sessionsDir, sessionName),
    JSON.stringify({
      sessionName,
      status,
      pid: process.pid,
      ppid: process.ppid,
      createdAt: now,
      updatedAt: now,
      sessionKind: "subagent",
      ...extras,
    }),
  );
}

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
    await writeStatus(sessionsDir, "old-session");

    // Set mtime to 10 days ago
    const tenDaysAgo = Date.now() - 10 * 24 * 60 * 60 * 1000;
    await utimes(oldFile, new Date(tenDaysAgo), new Date(tenDaysAgo));

    // Create new session file
    const newFile = join(sessionsDir, "new-session.json");
    await writeFile(newFile, "{}");
    await writeStatus(sessionsDir, "new-session");

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
      await writeStatus(sessionsDir, name);
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

test("cleanupOldSessions ignores native Pi sessions without ASC status sidecars", async () => {
  const sessionsDir = await mkdtemp(join(tmpdir(), "session-cleanup-native-safe-"));

  try {
    await writeFile(join(sessionsDir, "human-session.jsonl"), "{}\n");
    const subagentFile = join(sessionsDir, "subagent-session.jsonl");
    await writeFile(subagentFile, "{}\n");
    await writeStatus(sessionsDir, "subagent-session");
    const tenDaysAgo = Date.now() - 10 * 24 * 60 * 60 * 1000;
    await utimes(subagentFile, new Date(tenDaysAgo), new Date(tenDaysAgo));

    const state = createSubagentState(sessionsDir);
    const result = cleanupOldSessions(state, { maxAgeMs: 7 * 24 * 60 * 60 * 1000 });

    assert.equal(result.removedSessions, 1);
    assert.equal(result.removedFiles, 2);
    assert.equal(result.kept, 0);
    assert.equal(await readFile(join(sessionsDir, "human-session.jsonl"), "utf8"), "{}\n");
  } finally {
    await rm(sessionsDir, { recursive: true, force: true });
  }
});

test("cleanupOldSessions ignores legacy JSON files without valid ASC status sidecars", async () => {
  const sessionsDir = await mkdtemp(join(tmpdir(), "session-cleanup-json-safe-"));

  try {
    const humanFile = join(sessionsDir, "human-session.json");
    await writeFile(humanFile, "{}\n");
    const tenDaysAgo = Date.now() - 10 * 24 * 60 * 60 * 1000;
    await utimes(humanFile, new Date(tenDaysAgo), new Date(tenDaysAgo));

    const state = createSubagentState(sessionsDir);
    const result = cleanupOldSessions(state, { maxAgeMs: 7 * 24 * 60 * 60 * 1000 });

    assert.equal(result.removedSessions, 0);
    assert.equal(result.removedFiles, 0);
    assert.equal(await readFile(humanFile, "utf8"), "{}\n");
  } finally {
    await rm(sessionsDir, { recursive: true, force: true });
  }
});

test("cleanupOldSessions keeps live running subagents even when their trace mtime is old", async () => {
  const sessionsDir = await mkdtemp(join(tmpdir(), "session-cleanup-running-safe-"));

  try {
    const sessionFile = join(sessionsDir, "live-subagent.jsonl");
    await writeFile(sessionFile, "{}\n");
    await writeStatus(sessionsDir, "live-subagent", "running");
    const tenDaysAgo = Date.now() - 10 * 24 * 60 * 60 * 1000;
    await utimes(sessionFile, new Date(tenDaysAgo), new Date(tenDaysAgo));

    const state = createSubagentState(sessionsDir);
    const result = cleanupOldSessions(state, { maxAgeMs: 7 * 24 * 60 * 60 * 1000 });

    assert.equal(result.removedSessions, 0);
    assert.equal(result.removedFiles, 0);
    assert.equal(await readFile(sessionFile, "utf8"), "{}\n");
  } finally {
    await rm(sessionsDir, { recursive: true, force: true });
  }
});

test("clearSubagentSessions ignores foreign lock files without ASC status sidecars", async () => {
  const sessionsDir = await mkdtemp(join(tmpdir(), "session-clear-lock-safe-"));

  try {
    await writeFile(join(sessionsDir, "human.jsonl"), "{}\n");
    await writeFile(join(sessionsDir, "foreign.lock"), "not-asc");

    const state = createSubagentState(sessionsDir);
    clearSubagentSessions(state);

    const files = await readdir(sessionsDir);
    assert.ok(files.includes("human.jsonl"));
    assert.ok(files.includes("foreign.lock"));
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
    await writeStatus(sessionsDir, "session-0", "done");
    await writeStatus(sessionsDir, "session-1", "abandoned");

    const state = createSubagentState(sessionsDir);
    const stats = getSubagentStats(state);

    assert.equal(stats.sessionFiles, 2);
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

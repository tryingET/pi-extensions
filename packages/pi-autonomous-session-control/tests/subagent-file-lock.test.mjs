import assert from "node:assert/strict";
import { mkdtemp, readdir, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";
import {
  clearSubagentSessions,
  createSubagentState,
  registerSubagentTool,
} from "../extensions/self/subagent.ts";

function createHarness(sessionsDir, capturedDefs) {
  const state = createSubagentState(sessionsDir);
  let tool;
  const pi = {
    registerTool(definition) {
      tool = definition;
    },
  };

  registerSubagentTool(
    pi,
    state,
    () => "test/model",
    async (def) => {
      capturedDefs.push(def);
      return {
        output: "ok",
        exitCode: 0,
        elapsed: 10,
        status: "done",
      };
    },
  );

  return { tool, state };
}

test("dispatch_subagent skips locked base session name when file-lock reservation is enabled", async () => {
  const sessionsDir = await mkdtemp(join(tmpdir(), "subagent-lock-enabled-"));
  const previous = process.env.PI_SUBAGENT_FILE_LOCK_SESSION_NAMES;
  delete process.env.PI_SUBAGENT_FILE_LOCK_SESSION_NAMES;

  try {
    await writeFile(
      join(sessionsDir, "same.lock"),
      JSON.stringify({
        pid: process.pid,
        ppid: process.ppid,
        sessionName: "same",
        createdAt: new Date().toISOString(),
      }),
    );

    const capturedDefs = [];
    const { tool } = createHarness(sessionsDir, capturedDefs);

    await tool.execute(
      "tc-lock-1",
      { profile: "reviewer", objective: "Review", name: "same" },
      null,
      null,
      { cwd: process.cwd() },
    );

    assert.equal(capturedDefs.length, 1);
    assert.match(capturedDefs[0].sessionFile, /same-1\.json$/);
  } finally {
    if (previous === undefined) {
      delete process.env.PI_SUBAGENT_FILE_LOCK_SESSION_NAMES;
    } else {
      process.env.PI_SUBAGENT_FILE_LOCK_SESSION_NAMES = previous;
    }
    await rm(sessionsDir, { recursive: true, force: true });
  }
});

test("dispatch_subagent can ignore lock files when file-lock reservation is disabled", async () => {
  const sessionsDir = await mkdtemp(join(tmpdir(), "subagent-lock-disabled-"));
  const previous = process.env.PI_SUBAGENT_FILE_LOCK_SESSION_NAMES;
  process.env.PI_SUBAGENT_FILE_LOCK_SESSION_NAMES = "false";

  try {
    await writeFile(join(sessionsDir, "same.lock"), "busy");

    const capturedDefs = [];
    const { tool } = createHarness(sessionsDir, capturedDefs);

    await tool.execute(
      "tc-lock-2",
      { profile: "reviewer", objective: "Review", name: "same" },
      null,
      null,
      { cwd: process.cwd() },
    );

    assert.equal(capturedDefs.length, 1);
    assert.match(capturedDefs[0].sessionFile, /same\.json$/);
  } finally {
    if (previous === undefined) {
      delete process.env.PI_SUBAGENT_FILE_LOCK_SESSION_NAMES;
    } else {
      process.env.PI_SUBAGENT_FILE_LOCK_SESSION_NAMES = previous;
    }
    await rm(sessionsDir, { recursive: true, force: true });
  }
});

test("dispatch_subagent releases file-lock reservations after execution", async () => {
  const sessionsDir = await mkdtemp(join(tmpdir(), "subagent-lock-release-"));
  const previous = process.env.PI_SUBAGENT_FILE_LOCK_SESSION_NAMES;
  delete process.env.PI_SUBAGENT_FILE_LOCK_SESSION_NAMES;

  try {
    const capturedDefs = [];
    const { tool } = createHarness(sessionsDir, capturedDefs);

    await tool.execute(
      "tc-lock-3",
      { profile: "reviewer", objective: "Review", name: "same" },
      null,
      null,
      { cwd: process.cwd() },
    );

    await tool.execute(
      "tc-lock-4",
      { profile: "reviewer", objective: "Review again", name: "same" },
      null,
      null,
      { cwd: process.cwd() },
    );

    assert.equal(capturedDefs.length, 2);
    assert.match(capturedDefs[0].sessionFile, /same\.json$/);
    assert.match(capturedDefs[1].sessionFile, /same\.json$/);
  } finally {
    if (previous === undefined) {
      delete process.env.PI_SUBAGENT_FILE_LOCK_SESSION_NAMES;
    } else {
      process.env.PI_SUBAGENT_FILE_LOCK_SESSION_NAMES = previous;
    }
    await rm(sessionsDir, { recursive: true, force: true });
  }
});

test("dispatch_subagent writes lock metadata for live reservations", async () => {
  const sessionsDir = await mkdtemp(join(tmpdir(), "subagent-lock-metadata-"));
  const previous = process.env.PI_SUBAGENT_FILE_LOCK_SESSION_NAMES;
  delete process.env.PI_SUBAGENT_FILE_LOCK_SESSION_NAMES;

  try {
    let releaseReservation;
    const state = createSubagentState(sessionsDir);
    let tool;
    const pi = {
      registerTool(definition) {
        tool = definition;
      },
    };

    registerSubagentTool(
      pi,
      state,
      () => "test/model",
      async (def) => {
        const lockPath = join(sessionsDir, "same.lock");
        const payload = JSON.parse(await readFile(lockPath, "utf-8"));
        assert.equal(payload.sessionName, "same");
        assert.equal(payload.pid, process.pid);
        assert.equal(typeof payload.createdAt, "string");
        releaseReservation = true;
        return {
          output: def.objective,
          exitCode: 0,
          elapsed: 10,
          status: "done",
        };
      },
    );

    await tool.execute(
      "tc-lock-meta",
      { profile: "reviewer", objective: "Review", name: "same" },
      null,
      null,
      { cwd: process.cwd() },
    );

    assert.equal(releaseReservation, true);
  } finally {
    if (previous === undefined) {
      delete process.env.PI_SUBAGENT_FILE_LOCK_SESSION_NAMES;
    } else {
      process.env.PI_SUBAGENT_FILE_LOCK_SESSION_NAMES = previous;
    }
    await rm(sessionsDir, { recursive: true, force: true });
  }
});

test("dispatch_subagent reclaims stale locks from dead pids", async () => {
  const sessionsDir = await mkdtemp(join(tmpdir(), "subagent-lock-stale-"));
  const previous = process.env.PI_SUBAGENT_FILE_LOCK_SESSION_NAMES;
  delete process.env.PI_SUBAGENT_FILE_LOCK_SESSION_NAMES;

  try {
    await writeFile(
      join(sessionsDir, "same.lock"),
      JSON.stringify({
        pid: 99999999,
        ppid: 99999998,
        sessionName: "same",
        createdAt: new Date().toISOString(),
      }),
    );

    const capturedDefs = [];
    const { tool } = createHarness(sessionsDir, capturedDefs);

    await tool.execute(
      "tc-lock-stale",
      { profile: "reviewer", objective: "Review", name: "same" },
      null,
      null,
      { cwd: process.cwd() },
    );

    assert.equal(capturedDefs.length, 1);
    assert.match(capturedDefs[0].sessionFile, /same\.json$/);
  } finally {
    if (previous === undefined) {
      delete process.env.PI_SUBAGENT_FILE_LOCK_SESSION_NAMES;
    } else {
      process.env.PI_SUBAGENT_FILE_LOCK_SESSION_NAMES = previous;
    }
    await rm(sessionsDir, { recursive: true, force: true });
  }
});

test("dispatch_subagent does not reclaim live locks solely due to age", async () => {
  const sessionsDir = await mkdtemp(join(tmpdir(), "subagent-lock-live-old-"));
  const previousLockFlag = process.env.PI_SUBAGENT_FILE_LOCK_SESSION_NAMES;
  const previousStaleAfter = process.env.PI_SUBAGENT_LOCK_STALE_AFTER_MS;
  delete process.env.PI_SUBAGENT_FILE_LOCK_SESSION_NAMES;
  process.env.PI_SUBAGENT_LOCK_STALE_AFTER_MS = "0";

  try {
    await writeFile(
      join(sessionsDir, "same.lock"),
      JSON.stringify({
        pid: process.pid,
        ppid: process.ppid,
        sessionName: "same",
        createdAt: new Date(0).toISOString(),
      }),
    );

    const capturedDefs = [];
    const { tool } = createHarness(sessionsDir, capturedDefs);

    await tool.execute(
      "tc-lock-live-old",
      { profile: "reviewer", objective: "Review", name: "same" },
      null,
      null,
      { cwd: process.cwd() },
    );

    assert.equal(capturedDefs.length, 1);
    assert.match(capturedDefs[0].sessionFile, /same-1\.json$/);
  } finally {
    if (previousLockFlag === undefined) {
      delete process.env.PI_SUBAGENT_FILE_LOCK_SESSION_NAMES;
    } else {
      process.env.PI_SUBAGENT_FILE_LOCK_SESSION_NAMES = previousLockFlag;
    }
    if (previousStaleAfter === undefined) {
      delete process.env.PI_SUBAGENT_LOCK_STALE_AFTER_MS;
    } else {
      process.env.PI_SUBAGENT_LOCK_STALE_AFTER_MS = previousStaleAfter;
    }
    await rm(sessionsDir, { recursive: true, force: true });
  }
});

test("clearSubagentSessions removes stale lock files for a true fresh start", async () => {
  const sessionsDir = await mkdtemp(join(tmpdir(), "subagent-lock-clear-"));

  try {
    await writeFile(join(sessionsDir, "same.lock"), "busy");
    await writeFile(join(sessionsDir, "same.json"), "{}");

    const state = createSubagentState(sessionsDir);
    clearSubagentSessions(state);

    const files = await readdir(sessionsDir);
    assert.equal(files.includes("same.lock"), false);
    assert.equal(files.includes("same.json"), false);
  } finally {
    await rm(sessionsDir, { recursive: true, force: true });
  }
});

import assert from "node:assert/strict";
import { mkdtemp, readdir, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";
import { registerSubagentCommands } from "../extensions/self/subagent-commands.ts";
import { createSubagentState, getSessionStatusPath } from "../extensions/self/subagent-session.ts";

function createPiHarness() {
  const commands = new Map();
  const pi = {
    registerCommand(name, definition) {
      commands.set(name, definition);
    },
  };
  return { pi, commands };
}

async function writeStatus(sessionsDir, sessionName, extras = {}) {
  const now = new Date().toISOString();
  await writeFile(
    getSessionStatusPath(sessionsDir, sessionName),
    JSON.stringify({
      sessionName,
      status: "done",
      pid: process.pid,
      ppid: process.ppid,
      createdAt: now,
      updatedAt: now,
      sessionKind: "subagent",
      ...extras,
    }),
  );
}

test("subagent-cleanup preserves sessions unless destructive deletion is explicit", async () => {
  const sessionsDir = await mkdtemp(join(tmpdir(), "subagent-command-cleanup-preserve-"));

  try {
    const sessionFile = join(sessionsDir, "done.jsonl");
    await writeFile(sessionFile, "done\n");
    await writeStatus(sessionsDir, "done", { sessionFile });

    const state = createSubagentState(sessionsDir);
    const harness = createPiHarness();
    registerSubagentCommands(harness.pi, state);

    await harness.commands.get("subagent-cleanup").handler("0 0", { hasUI: false });

    const files = await readdir(sessionsDir);
    assert.ok(files.includes("done.jsonl"));
    assert.ok(files.includes("done.status.json"));
  } finally {
    await rm(sessionsDir, { recursive: true, force: true });
  }
});

test("subagent-cleanup treats explicit --delete zero thresholds as remove-all", async () => {
  const sessionsDir = await mkdtemp(join(tmpdir(), "subagent-command-cleanup-zero-"));

  try {
    const sessionFile = join(sessionsDir, "done.jsonl");
    await writeFile(sessionFile, "done\n");
    await writeStatus(sessionsDir, "done", { sessionFile });

    const state = createSubagentState(sessionsDir);
    const harness = createPiHarness();
    registerSubagentCommands(harness.pi, state);

    await harness.commands.get("subagent-cleanup").handler("--delete 0 0", { hasUI: false });

    assert.deepEqual(await readdir(sessionsDir), []);
  } finally {
    await rm(sessionsDir, { recursive: true, force: true });
  }
});

test("subagent-clear preserves sessions unless destructive deletion is explicit", async () => {
  const sessionsDir = await mkdtemp(join(tmpdir(), "subagent-command-clear-preserve-"));

  try {
    const sessionFile = join(sessionsDir, "done.jsonl");
    await writeFile(sessionFile, "done\n");
    await writeStatus(sessionsDir, "done", { sessionFile });

    const state = createSubagentState(sessionsDir);
    const harness = createPiHarness();
    registerSubagentCommands(harness.pi, state);

    await harness.commands.get("subagent-clear").handler("", { hasUI: false });

    const files = await readdir(sessionsDir);
    assert.ok(files.includes("done.jsonl"));
    assert.ok(files.includes("done.status.json"));

    await harness.commands.get("subagent-clear").handler("--delete", { hasUI: false });

    assert.deepEqual(await readdir(sessionsDir), []);
  } finally {
    await rm(sessionsDir, { recursive: true, force: true });
  }
});

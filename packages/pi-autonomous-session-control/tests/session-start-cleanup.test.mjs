import assert from "node:assert/strict";
import { mkdtemp, readdir, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";
import { createExtension } from "../extensions/self.ts";

async function writeStatus(sessionsDir, sessionName, extras = {}) {
  const now = new Date().toISOString();
  await writeFile(
    join(sessionsDir, `${sessionName}.status.json`),
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

function createPiHarness() {
  const tools = new Map();
  const commands = new Map();
  const eventHandlers = new Map();

  const pi = {
    registerTool(definition) {
      tools.set(definition.name, definition);
    },
    registerCommand(name, definition) {
      commands.set(name, definition);
    },
    on(eventName, handler) {
      eventHandlers.set(eventName, handler);
    },
    getModel() {
      return undefined;
    },
  };

  return { pi, tools, commands, eventHandlers };
}

test("session_start does not clear subagent sessions by default", async () => {
  const sessionsDir = await mkdtemp(join(tmpdir(), "session-start-default-"));
  const previous = process.env.PI_SUBAGENT_CLEAR_ON_SESSION_START;
  delete process.env.PI_SUBAGENT_CLEAR_ON_SESSION_START;

  try {
    await writeStatus(sessionsDir, "keep");
    await writeFile(join(sessionsDir, "keep.jsonl"), "{}");

    const harness = createPiHarness();
    createExtension(sessionsDir)(harness.pi);

    const handler = harness.eventHandlers.get("session_start");
    assert.equal(typeof handler, "function");

    await handler({}, { hasUI: false });

    const files = await readdir(sessionsDir);
    assert.ok(files.includes("keep.jsonl"));
  } finally {
    if (previous === undefined) {
      delete process.env.PI_SUBAGENT_CLEAR_ON_SESSION_START;
    } else {
      process.env.PI_SUBAGENT_CLEAR_ON_SESSION_START = previous;
    }
    await rm(sessionsDir, { recursive: true, force: true });
  }
});

test("session_start clears only the current live session when explicitly enabled", async () => {
  const sessionsDir = await mkdtemp(join(tmpdir(), "session-start-enabled-"));
  const previous = process.env.PI_SUBAGENT_CLEAR_ON_SESSION_START;
  process.env.PI_SUBAGENT_CLEAR_ON_SESSION_START = "true";

  try {
    await writeStatus(sessionsDir, "delete-me", { parentSessionKey: "live-current" });
    await writeFile(join(sessionsDir, "delete-me.jsonl"), "{}");
    await writeStatus(sessionsDir, "keep-other", { parentSessionKey: "live-other" });
    await writeFile(join(sessionsDir, "keep-other.jsonl"), "{}");

    const harness = createPiHarness();
    createExtension(sessionsDir)(harness.pi);

    const handler = harness.eventHandlers.get("session_start");
    assert.equal(typeof handler, "function");

    await handler({}, { sessionManager: { getSessionId: () => "live-current" }, hasUI: false });

    const files = await readdir(sessionsDir);
    assert.equal(files.includes("delete-me.jsonl"), false);
    assert.equal(files.includes("delete-me.status.json"), false);
    assert.ok(files.includes("keep-other.jsonl"));
    assert.ok(files.includes("keep-other.status.json"));
  } finally {
    if (previous === undefined) {
      delete process.env.PI_SUBAGENT_CLEAR_ON_SESSION_START;
    } else {
      process.env.PI_SUBAGENT_CLEAR_ON_SESSION_START = previous;
    }
    await rm(sessionsDir, { recursive: true, force: true });
  }
});

test("session_start skips enabled cleanup when the live session key is unavailable", async () => {
  const sessionsDir = await mkdtemp(join(tmpdir(), "session-start-enabled-no-key-"));
  const previous = process.env.PI_SUBAGENT_CLEAR_ON_SESSION_START;
  process.env.PI_SUBAGENT_CLEAR_ON_SESSION_START = "true";

  try {
    await writeStatus(sessionsDir, "keep");
    await writeFile(join(sessionsDir, "keep.jsonl"), "{}");

    const harness = createPiHarness();
    createExtension(sessionsDir)(harness.pi);

    const handler = harness.eventHandlers.get("session_start");
    assert.equal(typeof handler, "function");

    await handler({}, { hasUI: false });

    const files = await readdir(sessionsDir);
    assert.ok(files.includes("keep.jsonl"));
    assert.ok(files.includes("keep.status.json"));
  } finally {
    if (previous === undefined) {
      delete process.env.PI_SUBAGENT_CLEAR_ON_SESSION_START;
    } else {
      process.env.PI_SUBAGENT_CLEAR_ON_SESSION_START = previous;
    }
    await rm(sessionsDir, { recursive: true, force: true });
  }
});

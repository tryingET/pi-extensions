import assert from "node:assert/strict";
import { mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import test from "node:test";

import { createSessionPresenceExtension } from "../extensions/session-presence.ts";

function createTempDir() {
  return mkdtempSync(path.join(tmpdir(), "session-presence-"));
}

function registerExtension(extension) {
  const handlers = new Map();
  const commands = new Map();

  extension({
    on(eventName, handler) {
      handlers.set(eventName, handler);
    },
    registerCommand(name, definition) {
      commands.set(name, definition);
    },
  });

  return { handlers, commands };
}

function createContext({ cwd, sessionId, sessionFile, sessionName }) {
  const notifications = [];
  const titles = [];

  return {
    notifications,
    titles,
    ctx: {
      hasUI: true,
      ui: {
        notify(message, type = "info") {
          notifications.push({ message, type });
        },
        setTitle(title) {
          titles.push(title);
        },
      },
      sessionManager: {
        getCwd() {
          return cwd;
        },
        getSessionId() {
          return sessionId;
        },
        getSessionFile() {
          return sessionFile;
        },
        getSessionName() {
          return sessionName;
        },
      },
    },
  };
}

test("session presence publishes exact session metadata and updates the title", async () => {
  const presenceDir = createTempDir();

  try {
    const extension = createSessionPresenceExtension({
      presenceDir,
      processId: 424242,
      now: () => "2026-04-12T02:30:00.000Z",
      piBin: "pi",
    });

    const { handlers } = registerExtension(extension);
    const sessionStart = handlers.get("session_start");
    assert.equal(typeof sessionStart, "function");

    const { ctx, titles } = createContext({
      cwd: "/home/tryinget/ai-society/softwareco/owned/agent-kernel",
      sessionId: "77bc82bb-21b8-4651-a058-8b6e4d50636c",
      sessionFile:
        "/home/tryinget/.pi/agent/sessions/--home-tryinget-ai-society-softwareco-owned-agent-kernel--/2026-04-11T19-25-03-681Z_77bc82bb-21b8-4651-a058-8b6e4d50636c.jsonl",
      sessionName: "AK hotfix",
    });

    await sessionStart({}, ctx);

    const state = JSON.parse(readFileSync(path.join(presenceDir, "424242.json"), "utf8"));
    assert.equal(state.schemaVersion, 1);
    assert.equal(state.cwd, "/home/tryinget/ai-society/softwareco/owned/agent-kernel");
    assert.equal(state.cwdLabel, "agent-kernel");
    assert.equal(state.sessionIdShort, "77bc82bb");
    assert.equal(state.windowTitle, "π - agent-kernel · 77bc82bb");
    assert.deepEqual(state.resumeArgv, [
      "pi",
      "--session",
      "/home/tryinget/.pi/agent/sessions/--home-tryinget-ai-society-softwareco-owned-agent-kernel--/2026-04-11T19-25-03-681Z_77bc82bb-21b8-4651-a058-8b6e4d50636c.jsonl",
    ]);
    assert.deepEqual(titles, ["π - agent-kernel · 77bc82bb"]);
  } finally {
    rmSync(presenceDir, { recursive: true, force: true });
  }
});

test("/session-presence path reports the exact session file after refreshing presence", async () => {
  const presenceDir = createTempDir();

  try {
    const extension = createSessionPresenceExtension({
      presenceDir,
      processId: 525252,
      now: () => "2026-04-12T02:31:00.000Z",
    });
    const { commands } = registerExtension(extension);
    const command = commands.get("session-presence");
    assert.equal(typeof command?.handler, "function");

    const harness = createContext({
      cwd: "/home/tryinget/mito-s3-direction-lab",
      sessionId: "12345678-0000-4000-8000-abcdefabcdef",
      sessionFile:
        "/home/tryinget/.pi/agent/sessions/--home-tryinget-mito-s3-direction-lab--/2026-04-12T02-00-00-000Z_12345678-0000-4000-8000-abcdefabcdef.jsonl",
      sessionName: undefined,
    });

    await command.handler("path", harness.ctx);

    assert.equal(harness.notifications.length, 1);
    assert.equal(
      harness.notifications[0].message,
      "/home/tryinget/.pi/agent/sessions/--home-tryinget-mito-s3-direction-lab--/2026-04-12T02-00-00-000Z_12345678-0000-4000-8000-abcdefabcdef.jsonl",
    );
    const state = JSON.parse(readFileSync(path.join(presenceDir, "525252.json"), "utf8"));
    assert.equal(state.windowTitle, "π - mito-s3-direction-lab · 12345678");
  } finally {
    rmSync(presenceDir, { recursive: true, force: true });
  }
});

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

test("session presence can override the base title and reapply it after startup", async () => {
  const presenceDir = createTempDir();

  try {
    const extension = createSessionPresenceExtension({
      presenceDir,
      processId: 626262,
      now: () => "2026-04-12T02:32:00.000Z",
      titleBase: "Sidequest: trace this failure",
      titleRefreshDelaysMs: [0, 0],
    });

    const { handlers } = registerExtension(extension);
    const sessionStart = handlers.get("session_start");
    const sessionShutdown = handlers.get("session_shutdown");
    assert.equal(typeof sessionStart, "function");

    const harness = createContext({
      cwd: "/home/tryinget/ai-society/softwareco/owned/pi-extensions",
      sessionId: "6e7c38f0-8b33-40ed-aa6f-4852c5aa64c4",
      sessionFile:
        "/home/tryinget/.pi/agent/sessions/--home-tryinget-ai-society-softwareco-owned-pi-extensions--/2026-04-18T10-21-37-313Z_6e7c38f0-8b33-40ed-aa6f-4852c5aa64c4.jsonl",
      sessionName: undefined,
    });

    await sessionStart({}, harness.ctx);
    await new Promise((resolve) => setTimeout(resolve, 10));

    const state = JSON.parse(readFileSync(path.join(presenceDir, "626262.json"), "utf8"));
    assert.equal(state.windowTitleBase, "Sidequest: trace this failure");
    assert.equal(state.windowTitle, "Sidequest: trace this failure · 6e7c38f0");
    assert.deepEqual(harness.titles, [
      "Sidequest: trace this failure · 6e7c38f0",
      "Sidequest: trace this failure · 6e7c38f0",
      "Sidequest: trace this failure · 6e7c38f0",
    ]);

    if (typeof sessionShutdown === "function") {
      await sessionShutdown({}, harness.ctx);
    }
  } finally {
    rmSync(presenceDir, { recursive: true, force: true });
  }
});

test("session presence delayed refresh restores the session hash title after host title reset", async () => {
  const presenceDir = createTempDir();

  try {
    const extension = createSessionPresenceExtension({
      presenceDir,
      processId: 727272,
      now: () => "2026-04-12T02:33:00.000Z",
      titleRefreshDelaysMs: [1],
    });

    const { handlers } = registerExtension(extension);
    const sessionStart = handlers.get("session_start");
    const sessionShutdown = handlers.get("session_shutdown");
    assert.equal(typeof sessionStart, "function");

    const harness = createContext({
      cwd: "/home/tryinget/ai-society/holdingco/infra/template-propagator",
      sessionId: "bebad8f0-d324-4ed9-aeda-d0fbeb787a35",
      sessionFile:
        "/home/tryinget/.pi/agent/sessions/--home-tryinget-ai-society-holdingco-infra-template-propagator--/2026-04-24T19-34-19-868Z_bebad8f0-d324-4ed9-aeda-d0fbeb787a35.jsonl",
      sessionName: undefined,
    });

    await sessionStart({}, harness.ctx);
    harness.ctx.ui.setTitle("π - template-propagator");
    await new Promise((resolve) => setTimeout(resolve, 10));

    assert.deepEqual(harness.titles, [
      "π - template-propagator · bebad8f0",
      "π - template-propagator",
      "π - template-propagator · bebad8f0",
    ]);

    if (typeof sessionShutdown === "function") {
      await sessionShutdown({}, harness.ctx);
    }
  } finally {
    rmSync(presenceDir, { recursive: true, force: true });
  }
});

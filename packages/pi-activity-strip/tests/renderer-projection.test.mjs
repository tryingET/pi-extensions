// ---
// summary: "verifies raw publisher updates project to stable renderer card snapshots"
// read_when:
//   - "changing Electron renderer projection or focused-card retention"
// ---

import assert from "node:assert/strict";
import test from "node:test";

import { createRendererProjection } from "../src/electron/renderer-projection.mjs";

const sessionId = "019fa4d0-7142-7fb4-8d30-f98e951f0513";
const terminalKey = "ghostty:main:17";

function publisher(publisherId, overrides = {}) {
  return {
    sessionId,
    publisherId,
    terminalKey,
    terminalKind: "ghostty-surface",
    terminalFamily: "main",
    terminalSurfaceId: "17",
    state: "success",
    agentActive: false,
    lastEventAt: 10,
    startedAt: 1,
    ...overrides,
  };
}

test("duplicate publisher heartbeats retain one stable terminal card", () => {
  const delivered = [];
  const window = {
    webContents: {
      send(_channel, snapshot) {
        delivered.push(snapshot);
      },
    },
  };
  const projection = createRendererProjection({
    isNiriSession: () => true,
    getWindow: () => window,
    isUsableWindow: () => true,
  });
  const active = publisher("active", {
    state: "tool",
    agentActive: true,
    lastEventAt: 20,
  });
  const idle = publisher("idle", { updatedAt: 10_000 });

  projection.updateSnapshot({ generatedAt: 1, sessions: [active, idle] });
  projection.publishWorkspaceView({
    workspace: { id: 1, is_focused: true },
    sessions: [
      {
        ...active,
        cardId: `terminal:${terminalKey}`,
        publisherRecordKeys: [`${sessionId}|active`, `${sessionId}|idle`],
      },
    ],
    focusedSessionId: null,
    focusedCardId: null,
  });
  projection.updateSnapshot({
    generatedAt: 2,
    sessions: [
      { ...active, updatedAt: 20_000 },
      { ...idle, updatedAt: 30_000 },
    ],
  });

  const latest = delivered.at(-1);
  assert.equal(latest.sessions.length, 1);
  assert.equal(latest.sessions[0].publisherId, "active");
  assert.equal(latest.sessions[0].publisherCount, 2);
  assert.equal(latest.sessions[0].cardId, `terminal:${terminalKey}`);
});

test("renderer cannot re-admit a rejected stale logical session sharing one terminal key", () => {
  const delivered = [];
  const window = { webContents: { send: (_channel, snapshot) => delivered.push(snapshot) } };
  const projection = createRendererProjection({
    isNiriSession: () => true,
    getWindow: () => window,
    isUsableWindow: () => true,
  });
  const current = publisher("current", { state: "idle" });
  const stale = publisher("stale", {
    sessionId: "019fa4d1-7142-7fb4-8d30-f98e951f0513",
    state: "tool",
    agentActive: true,
    lastEventAt: 100,
  });

  projection.updateSnapshot({ generatedAt: 1, sessions: [current, stale] });
  projection.publishWorkspaceView({
    workspace: { id: 1, is_focused: true },
    sessions: [
      {
        ...current,
        cardId: `terminal:${terminalKey}`,
        publisherRecordKeys: [`${sessionId}|current`],
      },
    ],
    focusedSessionId: null,
    focusedCardId: null,
  });

  const [card] = delivered.at(-1).sessions;
  assert.equal(card.sessionId, sessionId);
  assert.equal(card.publisherId, "current");
  assert.equal(card.publisherCount, 1);
});

test("focused card clears only when its projected card disappears", () => {
  const window = { webContents: { send() {} } };
  const projection = createRendererProjection({
    isNiriSession: () => false,
    getWindow: () => window,
    isUsableWindow: () => true,
  });
  const session = publisher("active");
  projection.updateSnapshot({ generatedAt: 1, sessions: [session] });
  projection.setFocused({ ...session, cardId: `terminal:${terminalKey}` });
  assert.ok(projection.resolveTarget(`terminal:${terminalKey}`));
  projection.updateSnapshot({ generatedAt: 2, sessions: [] });
  assert.equal(projection.resolveTarget(`terminal:${terminalKey}`), null);
});

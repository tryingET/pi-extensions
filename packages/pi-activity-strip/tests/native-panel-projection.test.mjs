// ---
// summary: "verifies native panel view revisions, workspace membership, and focus retention"
// read_when:
//   - "changing broker-to-native-panel projection"
// ---

import assert from "node:assert/strict";
import test from "node:test";
import { sessionRecordKey } from "../src/common/session-cards.mjs";
import { createNativePanelProjection } from "../src/native/panel-projection.mjs";

function session(overrides = {}) {
  return {
    sessionId: "session-a",
    publisherId: "publisher-a",
    repoLabel: "native",
    state: "tool",
    updatedAt: 100,
    lastEventAt: 100,
    startedAt: 50,
    ...overrides,
  };
}

test("native projection publishes only the focused workspace card with monotonic revisions", () => {
  const published = [];
  const raw = session();
  const projection = createNativePanelProjection({
    isNiriSession: () => true,
    publish: (view) => published.push(view),
  });

  projection.updateSnapshot({ generatedAt: 100, sessions: [raw] });
  projection.publishWorkspaceView({
    workspace: { id: 7, is_focused: true },
    sessions: [
      {
        ...raw,
        cardId: "session:session-a",
        publisherRecordKeys: [sessionRecordKey(raw)],
      },
    ],
    focusedSessionId: raw.sessionId,
    focusedCardId: "session:session-a",
  });

  const visible = published.at(-1);
  assert.equal(visible.protocol, 1);
  assert.equal(visible.type, "view");
  assert.equal(visible.visible, true);
  assert.equal(visible.sessions.length, 1);
  assert.equal(visible.focusedCardId, "session:session-a");
  assert.ok(visible.revision > published[0].revision);

  projection.publishWorkspaceView({
    workspace: { id: 8, is_focused: true },
    sessions: [],
    focusedSessionId: null,
    focusedCardId: null,
  });
  assert.equal(published.at(-1).visible, false);
  assert.deepEqual(published.at(-1).sessions, []);
});

test("native projection keeps generic desktops globally visible", () => {
  const published = [];
  const projection = createNativePanelProjection({
    isNiriSession: () => false,
    publish: (view) => published.push(view),
  });
  projection.updateSnapshot({ generatedAt: 100, sessions: [session()] });
  assert.equal(published.at(-1).visible, true);
  assert.equal(published.at(-1).sessions.length, 1);
});

test("native projection carries workspace placement onto display cards", () => {
  const published = [];
  const raw = session({
    terminalKind: "ghostty-surface",
    terminalKey: "ghostty:main:16",
    terminalFamily: "main",
    terminalSurfaceId: "16",
  });
  const projection = createNativePanelProjection({
    isNiriSession: () => true,
    publish: (view) => published.push(view),
  });
  projection.updateSnapshot({ generatedAt: 100, sessions: [raw] });
  projection.publishWorkspaceView({
    workspace: { id: 7, is_focused: true },
    sessions: [
      {
        ...raw,
        cardId: "terminal:ghostty:main:16",
        publisherRecordKeys: [sessionRecordKey(raw)],
        placement: "binding",
        surfaceVisible: false,
        windowId: 44,
        workspaceIdx: 2,
      },
    ],
    focusedSessionId: null,
    focusedCardId: null,
  });
  const card = published.at(-1).sessions[0];
  assert.equal(card.placement, "binding");
  assert.equal(card.surfaceVisible, false);
  assert.equal(card.windowId, 44);
  assert.equal(card.workspaceIdx, 2);
  assert.equal(projection.resolveTarget("terminal:ghostty:main:16")?.surfaceVisible, false);

  projection.updateSnapshot({ generatedAt: 101, sessions: [{ ...raw, state: "thinking" }] });
  assert.equal(published.at(-1).sessions[0].surfaceVisible, false, "placement survives updates");
  assert.equal(published.at(-1).sessions[0].windowId, 44, "window id survives updates");
  assert.equal(published.at(-1).sessions[0].workspaceIdx, 2, "workspace number survives updates");
});

test("native projection drops a workspace number that is not an integer", () => {
  const published = [];
  const raw = session({
    terminalKind: "ghostty-surface",
    terminalKey: "ghostty:main:16",
    terminalFamily: "main",
    terminalSurfaceId: "16",
  });
  const projection = createNativePanelProjection({
    isNiriSession: () => true,
    publish: (view) => published.push(view),
  });
  projection.updateSnapshot({ generatedAt: 100, sessions: [raw] });
  projection.publishWorkspaceView({
    workspace: { id: 7, is_focused: true },
    sessions: [
      {
        ...raw,
        cardId: "terminal:ghostty:main:16",
        publisherRecordKeys: [sessionRecordKey(raw)],
        windowId: 44,
        workspaceIdx: "2",
      },
    ],
    focusedSessionId: null,
    focusedCardId: null,
  });
  const card = published.at(-1).sessions[0];
  assert.equal(card.windowId, 44);
  assert.equal(card.workspaceIdx, null, "a non-integer index is dropped, not coerced");
});

test("native projection joins AK task chips onto cards and clears them fail-closed", () => {
  const published = [];
  const raw = session({
    sessionId: "01a0993a-d336-739f-a308-cfa4c21d6332",
    terminalKind: "ghostty-surface",
    terminalKey: "ghostty:main:16",
    terminalFamily: "main",
    terminalSurfaceId: "16",
    cwd: "/home/tryinget/ai-society/softwareco/owned/pi-extensions",
  });
  const projection = createNativePanelProjection({
    isNiriSession: () => false,
    publish: (view) => published.push(view),
  });
  projection.updateSnapshot({ generatedAt: 100, sessions: [raw] });
  assert.equal(published.at(-1).sessions[0].akTasks, undefined, "no chips before AK data");

  const now = Date.now();
  projection.setAkTasks({
    claims: [
      {
        id: 5701,
        title: "Show clickable AK-task references",
        repo: "/home/tryinget/ai-society/softwareco/owned/pi-extensions",
        sessionId: "01a0993a-d336-739f-a308-cfa4c21d6332",
        leaseExpiresAt: now + 3_600_000,
        claimedAt: now - 60_000,
      },
    ],
    deferred: [],
  });
  const card = published.at(-1).sessions[0];
  assert.deepEqual(card.akTasks, [
    { id: 5701, title: "Show clickable AK-task references", state: "active" },
  ]);
  assert.equal(card.publisherSessionIds?.[0], "01a0993a-d336-739f-a308-cfa4c21d6332");

  // A failed AK read clears every chip instead of leaving stale references behind.
  projection.setAkTasks({ claims: [], deferred: [] });
  assert.equal(published.at(-1).sessions[0].akTasks, undefined);
});

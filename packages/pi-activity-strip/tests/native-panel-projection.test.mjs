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

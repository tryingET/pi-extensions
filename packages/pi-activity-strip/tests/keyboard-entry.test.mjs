import assert from "node:assert/strict";
import test from "node:test";
import { createKeyboardEntry } from "../src/native/keyboard-entry.mjs";
import { createNativePanelProjection } from "../src/native/panel-projection.mjs";

function fixture() {
  const views = [],
    writes = [];
  const raw = { sessionId: "agent", publisherId: "publisher" };
  const projection = createNativePanelProjection({
    isNiriSession: () => true,
    publish: (v) => views.push(v),
  });
  projection.updateSnapshot({ generatedAt: 1, sessions: [raw] });
  const publish = (focusKind) =>
    projection.publishWorkspaceView({
      workspace: { id: 7, is_focused: true },
      sessions: [{ ...raw, cardId: "session:agent", windowId: 44, surfaceVisible: true }],
      focusedSessionId: "agent",
      focusedCardId: "session:agent",
      focusKind,
    });
  publish("agent");
  const runtimeStatus = { clickThrough: false, windowVisible: true };
  const options = {
    projection,
    runtimeStatus,
    writePanel: (m) => {
      writes.push(m);
      return true;
    },
  };
  return { projection, publish, views, writes, runtimeStatus, options };
}

test("entry is synchronous, reserves before panel NULL/ack, and hidden/click-through fail closed", () => {
  const f = fixture();
  const enter = createKeyboardEntry(f.options);
  f.runtimeStatus.clickThrough = true;
  assert.equal(enter().ok, false);
  f.runtimeStatus.clickThrough = false;
  f.publish("non-agent");
  assert.equal(enter().ok, false);
  f.publish("agent");
  const result = enter();
  assert.equal(
    result instanceof Promise,
    false,
    "no delayed command can capture after returning failure",
  );
  assert.equal(result.ok, true);
  assert.ok(f.projection.ownsKeyboardRequest(f.writes[0].revision));
  assert.equal(f.writes[0].epoch, f.views.at(-1).interactionEpoch);
  f.projection.publishWindowFocus(null);
  assert.equal(f.views.at(-1).visible, true, "NULL before panel acknowledgement is safe");
});

test("known non-agent event dominates stale visible status and a late active panel acknowledgement", () => {
  const f = fixture();
  const request = f.projection.requestKeyboard();
  f.projection.publishWindowFocus(99);
  f.projection.keyboardChanged(request, true);
  assert.equal(
    f.runtimeStatus.windowVisible,
    true,
    "old native status intentionally not acknowledged yet",
  );
  assert.equal(createKeyboardEntry(f.options)().ok, false);
  assert.deepEqual(f.writes, []);
  assert.equal(f.views.at(-1).visible, false);
});

test("failed writes revoke provisional keyboard ownership", () => {
  const f = fixture();
  assert.equal(createKeyboardEntry({ ...f.options, writePanel: () => false })().ok, false);
  f.projection.publishWindowFocus(null);
  assert.equal(f.views.at(-1).visible, false);
  f.projection.publishWindowFocus(44);
  assert.equal(f.views.at(-1).visible, true);
  assert.deepEqual(f.writes, [], "no deferred command runs when agent focus returns");
});

test("closing or invalidating the exact owner revokes keyboard eligibility even during panel NULL focus", () => {
  const f = fixture();
  assert.equal(createKeyboardEntry(f.options)().ok, true);
  f.projection.publishWindowFocus(null);
  assert.equal(f.views.at(-1).visible, true);
  f.projection.invalidateWindowFocus(99);
  assert.equal(f.views.at(-1).visible, true, "an unrelated window is not the owner");
  f.projection.invalidateWindowFocus(44);
  assert.equal(f.views.at(-1).visible, false);
  assert.equal(createKeyboardEntry(f.options)().ok, false);
});

test("empty workspaces reject entry even before the old visibility receipt arrives", () => {
  const f = fixture();
  f.projection.publishWorkspaceView({
    workspace: { id: 8, is_focused: true },
    sessions: [],
    focusedSessionId: null,
    focusKind: "none",
  });
  assert.equal(createKeyboardEntry(f.options)().ok, false);
  assert.deepEqual(f.writes, []);
});

test("loss of the admitted owner hides even when another window's cards remain, including keyboard NULL", () => {
  for (const keyboard of [false, true]) {
    const views = [];
    const projection = createNativePanelProjection({
      isNiriSession: () => true,
      publish: (view) => views.push(view),
    });
    const owner = { sessionId: "owner", publisherId: "owner-p" };
    const other = { sessionId: "other", publisherId: "other-p" };
    projection.updateSnapshot({ generatedAt: 1, sessions: [owner, other] });
    projection.publishWorkspaceView({
      workspace: { id: 7, is_focused: true },
      sessions: [
        { ...owner, cardId: "session:owner", windowId: 44 },
        { ...other, cardId: "session:other", windowId: 55 },
      ],
      focusKind: "agent",
      focusedCardId: "session:owner",
      focusedSessionId: "owner",
    });
    const request = keyboard ? projection.requestKeyboard() : null;
    if (keyboard) projection.publishWindowFocus(null);
    assert.equal(views.at(-1).visible, true);
    projection.updateSnapshot({ generatedAt: 2, sessions: [other] });
    if (request !== null) projection.keyboardChanged(request, true);
    projection.send();
    assert.equal(views.at(-1).sessions.length, 1, "another admitted card really remains");
    assert.equal(
      views.at(-1).visible,
      false,
      "that card cannot inherit the lost window's eligibility",
    );
    assert.equal(projection.requestKeyboard(), null);
  }
});

test("a focused-card hint without exact Niri window identity cannot authorize entry", () => {
  const f = fixture();
  f.projection.publishWorkspaceView({
    workspace: { id: 7, is_focused: true },
    sessions: [{ sessionId: "agent", publisherId: "publisher", cardId: "session:agent" }],
    focusKind: "agent",
    focusedCardId: "session:agent",
    focusedSessionId: "agent",
  });
  assert.equal(f.views.at(-1).visible, false);
  assert.equal(createKeyboardEntry(f.options)().ok, false);
});

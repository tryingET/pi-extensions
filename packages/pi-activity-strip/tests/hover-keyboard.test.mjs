import assert from "node:assert/strict";
import test from "node:test";
import { createHoverKeyboard } from "../src/native/hover-keyboard.mjs";
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
  const publish = (focusKind = "agent", windowId = 44, workspaceId = 7) =>
    projection.publishWorkspaceView({
      workspace: { id: workspaceId, is_focused: true },
      sessions: [{ ...raw, cardId: "session:agent", windowId, surfaceVisible: true }],
      focusedCardId: "session:agent",
      focusedSessionId: "agent",
      focusKind,
    });
  publish();
  const runtimeStatus = { clickThrough: false, windowVisible: true };
  const options = {
    projection,
    runtimeStatus,
    writePanel: (m) => {
      writes.push(m);
      return true;
    },
  };
  return {
    views,
    writes,
    projection,
    publish,
    runtimeStatus,
    options,
    hover: createHoverKeyboard(options),
    epoch: () => projection.getInteractionEpoch(),
  };
}

test("production handshake preclaims BEFORE grant; NULL before ack and ordinary telemetry preserve epoch/claim", () => {
  const f = fixture();
  const epoch = f.epoch();
  const hover = createHoverKeyboard({
    ...f.options,
    writePanel: (m) => {
      assert.equal(f.projection.keyboardMode(), "hover");
      f.projection.publishWindowFocus(null); // Compositor can beat the panel ack.
      assert.equal(f.views.at(-1).visible, true);
      f.writes.push(m);
      return true;
    },
  });
  assert.equal(hover.request(1, epoch), true);
  assert.equal(f.projection.keyboardChanged(f.writes[0].request, true), true);
  for (let i = 0; i < 3; i++) {
    f.projection.send();
    f.publish("none");
  }
  assert.equal(f.epoch(), epoch);
  assert.equal(f.views.at(-1).visible, true);
  assert.equal(f.projection.keyboardMode(), "hover");
});

test("same data revision, leave/reenter, old cancels and old acks cannot release the newer hover", () => {
  const f = fixture();
  const revision = f.views.at(-1).revision;
  const epoch = f.epoch();
  assert.equal(f.hover.request(1, epoch), true);
  const old = f.writes.at(-1).request;
  assert.equal(f.hover.cancel(1), true);
  assert.equal(f.hover.request(2, epoch), true);
  const current = f.writes.at(-1).request;
  assert.notEqual(old, current);
  assert.equal(f.views.at(-1).revision, revision);
  assert.equal(f.hover.cancel(1), false);
  assert.equal(f.hover.request(1, epoch), false);
  assert.equal(f.projection.keyboardChanged(old, false), false);
  assert.equal(f.projection.ownsKeyboardRequest(current), true);
});

test("explicit upgrade cannot be overridden/released by stale hover cancellation or acknowledgement", () => {
  const f = fixture();
  f.hover.request(1, f.epoch());
  const old = f.writes.at(-1).request;
  f.projection.publishWindowFocus(null);
  assert.equal(createKeyboardEntry(f.options)().ok, true);
  const explicit = f.writes.at(-1).revision;
  assert.equal(f.hover.cancel(1), false);
  assert.equal(f.projection.keyboardChanged(old, false), false);
  assert.equal(f.hover.request(2, f.epoch()), false);
  assert.equal(f.projection.keyboardMode(), "explicit");
  assert.equal(f.projection.ownsKeyboardRequest(explicit), true);
  assert.equal(f.views.at(-1).visible, true);
});

for (const revoke of [
  (f) => f.publish("non-agent"),
  (f) => f.publish("unknown"),
  (f) => f.publish("none", 44, 8),
  (f) => f.projection.invalidateWindowFocus(44),
  (f) => f.projection.updateSnapshot({ generatedAt: 2, sessions: [] }),
])
  test(`identity/workspace/non-agent revocation dominates late hover ack: ${revoke}`, () => {
    const f = fixture();
    const epoch = f.epoch();
    f.hover.request(1, epoch);
    const claim = f.writes.at(-1).request;
    f.projection.publishWindowFocus(null);
    revoke(f);
    assert.equal(f.projection.keyboardChanged(claim, true), false);
    assert.equal(f.projection.isEligible(), false);
    assert.notEqual(f.epoch(), epoch);
    f.publish();
    assert.equal(f.hover.request(2, epoch), false, "hide/show cannot accept an old grant epoch");
  });

test("hidden/click-through/stale epoch deny; failed write revokes immediately with no queued capture", () => {
  for (const setting of ["windowVisible", "clickThrough"]) {
    const f = fixture();
    f.runtimeStatus[setting] = setting === "clickThrough";
    assert.equal(f.hover.request(1, f.epoch()), false);
    assert.equal(f.projection.keyboardMode(), "none");
    assert.equal(f.writes.at(-1).type, "hover-denied");
  }
  const f = fixture();
  assert.equal(f.hover.request(1, f.epoch() - 1), false);
  const failed = createHoverKeyboard({ ...f.options, writePanel: () => false });
  assert.equal(failed.request(2, f.epoch()), false);
  f.projection.publishWindowFocus(null);
  assert.equal(f.projection.isEligible(), false);
  assert.equal(f.projection.keyboardMode(), "none");
});

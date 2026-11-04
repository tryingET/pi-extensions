// ---
// summary: "Legacy focus visibility: handoffs revoke interaction without tearing down an eligible ribbon surface."
// read_when:
//   - "Changing selection revocation, passive presentation, or focus-change geometry."
// ---
import assert from "node:assert/strict";
import test from "node:test";
import { SessionStore } from "../src/broker/session-store.mjs";
import { resolveWorkspaceView } from "../src/common/workspace-view.mjs";
import { createNativePanelProjection } from "../src/native/panel-projection.mjs";
import { createPlacementRuntime } from "../src/native/placement.mjs";
import { createWorkspaceProjectionHandlers } from "../src/native/workspace-events.mjs";

function fixture(source = 44) {
  const ids = ["019fa4d0-7142-7fb4-8d30-f98e951f0513", "019fa4d1-7142-7fb4-8d30-f98e951f0513"];
  const store = new SessionStore();
  for (const [index, id] of ids.entries()) {
    assert.ok(
      store.upsert(
        {
          sessionId: id,
          publisherId: `p-${index}`,
          terminalKind: "ghostty-surface",
          terminalKey: `ghostty:main:${16 + index}`,
          terminalFamily: "main",
          terminalSurfaceId: String(16 + index),
          cwd: "/fixture",
          repoLabel: `source-${index}`,
          state: "tool",
          updatedAt: 1000,
          lastEventAt: 1000,
          startedAt: 1,
          publisherSequence: 1,
        },
        1000,
      ),
    );
  }
  let windows = [
    ...ids.map((id, index) => ({
      id: index ? 55 : 44,
      workspace_id: 7,
      app_id: "com.mitchellh.ghostty",
      pid: 4000 + index,
      is_focused: source === (index ? 55 : 44),
      title: `π - fixture · gs:main:${16 + index} · ${id.replaceAll("-", "")}`,
    })),
    {
      id: 66,
      workspace_id: 7,
      app_id: "com.onepassword.OnePassword",
      pid: 5000,
      is_focused: source === 66,
      title: "presence fixture",
    },
    {
      id: 99,
      workspace_id: 7,
      app_id: "ordinary-browser",
      pid: 6000,
      is_focused: false,
      title: "non-presence fixture",
    },
  ];
  let workspace = { id: 7, idx: 1, is_focused: true, active_window_id: source };
  const views = [];
  const placement = createPlacementRuntime({
    env: {},
    runtimeStatus: {},
    execFileAsync: async () => assert.fail("synthetic fixture must not invoke external IPC"),
    onBindingsLearned() {},
    bindingsFilePath: "",
  });
  placement.options.resolveHostPid = () => 0;
  const projection = createNativePanelProjection({
    isNiriSession: () => true,
    getWindowFacts: placement.getObservedWindow,
    env: { PI_ACTIVITY_STRIP_VISIBILITY: "focus" },
    publish: (view) => views.push(view),
  });
  projection.updateSnapshot(store.snapshot(1000));
  function reconcile() {
    placement.observeWindowList(windows);
    const records = projection.getRawSessions();
    const view = resolveWorkspaceView(windows, workspace, records, placement.options);
    placement.learnFromPlacements(view.sessions, windows, records);
    projection.publishWorkspaceView(view);
  }
  reconcile();
  const handlers = createWorkspaceProjectionHandlers({ projection, placement, reconcile() {} });
  return {
    projection,
    placement,
    views,
    handlers,
    reconcile,
    select(id) {
      workspace = { ...workspace, active_window_id: id };
      handlers.onWorkspaceActiveWindowChanged(workspace.id, id);
    },
    focus(id) {
      windows = windows.map((window) => ({ ...window, is_focused: window.id === id }));
      handlers.onWindowFocusChanged(id);
    },
    snapshot(focused, selected) {
      windows = windows.map((window) => ({ ...window, is_focused: window.id === focused }));
      workspace = { ...workspace, active_window_id: selected };
      reconcile();
    },
  };
}

for (const [source, destination] of [
  [44, 55],
  [44, 66],
  [66, 44],
]) {
  for (const order of ["selection-first", "focus-first"]) {
    test(`Given passive eligible source ${source}, When focus moves to ${destination} ${order}, Then the ribbon never hides or reserves a new working area`, () => {
      const f = fixture(source);
      assert.equal(f.views.at(-1).visible, true, "SETUP: admitted source is visible");
      const boundary = f.views.length;
      if (order === "selection-first") {
        f.select(destination);
        f.focus(destination);
      } else {
        f.focus(destination);
        f.select(destination);
      }
      f.reconcile();
      assert.ok(f.views.length > boundary);
      assert.equal(
        f.views.slice(boundary).every((view) => view.visible === true),
        true,
        "BEHAVIOR: a known eligible handoff must not hide/remap or change the exclusive zone",
      );
      assert.equal(
        f.projection.requestHoverKeyboard(f.projection.getInteractionEpoch(), 100, false) !== null,
        true,
        "fresh coherent focus may authorize a NEW interaction",
      );
    });
  }
}

for (const mode of ["hover", "explicit"]) {
  for (const [source, destination] of [
    [44, 55],
    [44, 66],
    [66, 44],
  ]) {
    test(`Given ${mode} source ${source}, When a mixed full read selects eligible ${destination} before incremental events, Then revoke immediately without hiding`, () => {
      const f = fixture(source);
      const epoch = f.projection.getInteractionEpoch();
      const request =
        mode === "hover"
          ? f.projection.requestHoverKeyboard(epoch, 1, false)
          : f.projection.requestKeyboard();
      assert.ok(request);
      const intent = f.projection.acceptJumpIntent(request, epoch);
      assert.ok(intent);
      f.snapshot(source, destination);
      assert.equal(f.projection.ownsKeyboardRequest(request), false);
      assert.equal(intent.isCurrent(), false);
      assert.equal(f.projection.keyboardChanged(request, true), false);
      assert.equal(
        f.projection.requestKeyboard(),
        null,
        "mixed read is not replacement seat authority",
      );
      assert.equal(
        f.views.at(-1).visible,
        true,
        "a mixed full read needs the same passive continuity as an incremental handoff",
      );
    });
  }

  test(`Given captured ${mode} source A, When selection changes to eligible B, Then immediately revoke A but keep presentation and do not grant from selection`, () => {
    const f = fixture();
    const epoch = f.projection.getInteractionEpoch();
    const request =
      mode === "hover"
        ? f.projection.requestHoverKeyboard(epoch, 1, false)
        : f.projection.requestKeyboard();
    assert.ok(request);
    assert.equal(f.projection.keyboardChanged(request, true), true);
    f.focus(null);
    const intent = f.projection.acceptJumpIntent(request, epoch);
    assert.ok(intent);
    f.select(55);
    assert.equal(
      f.projection.ownsKeyboardRequest(request),
      false,
      "old request revoked immediately",
    );
    assert.equal(intent.isCurrent(), false, "accepted old jump cannot outlive source revocation");
    assert.equal(
      f.projection.keyboardChanged(request, true),
      false,
      "late acknowledgement cannot revive it",
    );
    assert.equal(
      f.projection.requestHoverKeyboard(f.projection.getInteractionEpoch(), 2, false),
      null,
      "selection cannot establish replacement keyboard authority",
    );
    assert.equal(
      f.views.at(-1).visible,
      true,
      "BEHAVIOR: input revocation is not destruction of known eligible presentation",
    );
  });
}

for (const destination of [null, 99, 777]) {
  test(`Given a presentation handoff, When full NULL-focus reconciliation selects ${destination}, Then hide and deny keyboard just like the incremental event`, () => {
    const f = fixture();
    f.select(55);
    assert.equal(f.views.at(-1).visible, true, "SETUP: known eligible handoff retained");
    f.snapshot(null, destination);
    assert.equal(
      f.views.at(-1).visible,
      false,
      "a full snapshot cannot retain a contradicted presentation hold",
    );
    assert.equal(f.projection.requestKeyboard(), null);
  });

  test(`Given visible source A, When selection becomes non-presentable ${destination}, Then hide and deny keyboard`, () => {
    const f = fixture();
    f.select(destination);
    assert.equal(f.views.at(-1).visible, false);
    assert.equal(f.projection.requestKeyboard(), null);
  });
}

for (const [source, first, second] of [
  [44, 55, 66],
  [44, 66, 55],
  [66, 44, 55],
]) {
  test(`Given visible eligible ${source}, When selection advances through ${first} to ${second} before reconciliation, Then keep presentation but grant no input`, () => {
    const f = fixture(source);
    const boundary = f.views.length;
    f.select(first);
    f.select(second);
    assert.equal(
      f.views.slice(boundary).every((view) => view.visible === true),
      true,
      "rapid eligible selections must be checked against the NEW selection",
    );
    assert.equal(f.projection.requestKeyboard(), null);
  });
}

test("Given an eligible handoff, When the compositor stream becomes unknown, Then no presentation hold may retain permission or visibility", () => {
  const f = fixture();
  f.select(55);
  f.handlers.onFocusInvalidated();
  assert.equal(f.views.at(-1).visible, false);
  assert.equal(f.projection.requestKeyboard(), null);
});

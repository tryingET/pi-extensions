import assert from "node:assert/strict";
import { SessionStore } from "../../src/broker/session-store.mjs";
import { readNiriWorkspaces } from "../../src/common/niri-focus.mjs";
import { resolveWindowDirectory, resolveWorkspaceView } from "../../src/common/workspace-view.mjs";
import { createNativePanelProjection } from "../../src/native/panel-projection.mjs";
import { createPanelWindowJump } from "../../src/native/panel-window-jump.mjs";
import { createPlacementRuntime } from "../../src/native/placement.mjs";
import { createWorkspaceProjectionHandlers } from "../../src/native/workspace-events.mjs";

export function productionFixture() {
  const sourceId = "019fa4d0-7142-7fb4-8d30-f98e951f0513";
  const raw = (sessionId, publisherId, surface, activity) => ({
    sessionId,
    publisherId,
    terminalKind: "ghostty-surface",
    terminalKey: `ghostty:main:${surface}`,
    terminalFamily: "main",
    terminalSurfaceId: String(surface),
    cwd: "/fixture",
    repoLabel: publisherId,
    state: "tool",
    updatedAt: activity,
    lastEventAt: activity,
    startedAt: 1,
    publisherSequence: 1,
  });
  const a = raw(sourceId, "a", 16, 1000),
    b = raw(sourceId, "b", 16, 900);
  const target = raw("019fa4d1-7142-7fb4-8d30-f98e951f0513", "t", 17, 800);
  const store = new SessionStore();
  for (const record of [a, b, target]) assert.ok(store.upsert(record, 1000));
  const views = [],
    focused = [];
  let windows = [
    {
      id: 44,
      workspace_id: 7,
      app_id: "com.mitchellh.ghostty",
      pid: 4000,
      is_focused: true,
      title: `π - source · gs:main:16 · ${sourceId.replaceAll("-", "")}`,
    },
    {
      id: 55,
      workspace_id: 8,
      app_id: "com.mitchellh.ghostty",
      pid: 5000,
      is_focused: false,
      title: `π - target · gs:main:17 · ${target.sessionId.replaceAll("-", "")}`,
    },
    {
      id: 99,
      workspace_id: 7,
      app_id: "browser",
      pid: 6000,
      is_focused: false,
      title: "ordinary browser",
    },
  ];
  const projection = createNativePanelProjection({
    isNiriSession: () => true,
    publish: (view) => views.push(view),
  });
  projection.updateSnapshot(store.snapshot(1000));
  const placement = createPlacementRuntime({
    env: {},
    runtimeStatus: {},
    execFileAsync: async () => assert.fail("no external IPC"),
    onBindingsLearned: () => {},
    bindingsFilePath: "",
  });
  placement.options.resolveHostPid = () => 0;
  const refresh = () => {
    placement.observeWindowList(windows);
    const records = projection.getRawSessions();
    const view = resolveWorkspaceView(
      windows,
      { id: 7, is_focused: true },
      records,
      placement.options,
    );
    placement.learnFromPlacements(view.sessions, windows, records);
    projection.setDirectory(
      resolveWindowDirectory(windows, [{ id: 7 }, { id: 8 }], records, placement.options),
    );
    projection.publishWorkspaceView(view);
  };
  refresh();
  const handlers = createWorkspaceProjectionHandlers({
    projection,
    placement,
    reconcile: () => {},
  });
  const focus = (id) => {
    windows = windows.map((w) => ({ ...w, is_focused: w.id === id }));
    handlers.onWindowFocusChanged(id);
  };
  const workspaces = [
    { id: 7, idx: 1, is_focused: true, is_active: true },
    { id: 8, idx: 2, is_focused: false, is_active: true },
    { id: 9, idx: 3, is_focused: false, is_active: false },
  ];
  let finish, finishWorkspaces, rejectWorkspaces;
  const jump = createPanelWindowJump({
    projection,
    placementOptions: placement.options,
    getWindowFacts: placement.getObservedWindow,
    isNiriSession: () => true,
    readWindows: () =>
      new Promise((resolve) => {
        finish = resolve;
      }),
    readWorkspaces: () =>
      readNiriWorkspaces(
        async (_command, args) => {
          assert.deepEqual(args, ["msg", "-j", "workspaces"]);
          return new Promise((resolve, reject) => {
            finishWorkspaces = (facts) => resolve({ stdout: JSON.stringify(facts) });
            rejectWorkspaces = reject;
          });
        },
        { NIRI_SOCKET: "/fixture/not-a-real-socket" },
        1000,
      ),
    focusWindow: async (id) => {
      focused.push(id);
    },
    reconcile: () => {},
  });
  const claim = (mode) =>
    mode === "hover"
      ? projection.requestHoverKeyboard(projection.getInteractionEpoch(), 1, false)
      : projection.requestKeyboard();
  return {
    a,
    b,
    target,
    store,
    projection,
    placement,
    handlers,
    views,
    focused,
    refresh,
    focus,
    claim,
    jump,
    windows: () => windows,
    update: (records) => projection.updateSnapshot({ generatedAt: 2000, sessions: records }),
    workspaces: () => workspaces.map((w) => ({ ...w })),
    finish: (next = windows, facts = workspaces) => {
      finish(next);
      if (facts instanceof Error) rejectWorkspaces(facts);
      else finishWorkspaces(facts);
    },
  };
}

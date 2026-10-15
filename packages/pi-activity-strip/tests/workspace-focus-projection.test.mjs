import assert from "node:assert/strict";
import { EventEmitter } from "node:events";
import test from "node:test";
import { resolveWorkspaceView } from "../src/common/workspace-view.mjs";
import { createKeyboardEntry } from "../src/native/keyboard-entry.mjs";
import { createNativePanelProjection } from "../src/native/panel-projection.mjs";
import { createPlacementRuntime } from "../src/native/placement.mjs";
import {
  createNiriWorkspaceEventWatcher,
  createWorkspaceProjectionHandlers,
} from "../src/native/workspace-events.mjs";

function fixture({
  productionTitle,
  rawSession,
  extraSessions = [],
  extraWindows = [],
  learnSources = true,
} = {}) {
  const views = [];
  const raw = rawSession ?? {
    sessionId: productionTitle ? "019fa4d0-7142-7fb4-8d30-f98e951f0513" : "agent",
    publisherId: "p",
  };
  const owner = {
    id: 44,
    title: productionTitle,
    app_id: "com.mitchellh.ghostty",
    pid: 4000,
    workspace_id: 7,
    is_focused: true,
  };
  const placement = createPlacementRuntime({
    env: {},
    runtimeStatus: {},
    execFileAsync: async () => assert.fail("no external IPC"),
    onBindingsLearned: () => {},
    bindingsFilePath: "",
  });
  placement.options.resolveHostPid = () => 0;
  const initialWindows = [owner, ...extraWindows];
  placement.observeWindowList(initialWindows);
  const workspace = { id: 7, is_focused: true };
  const project = (window) =>
    resolveWorkspaceView(
      Array.isArray(window) ? window : [window, ...extraWindows],
      workspace,
      [raw, ...extraSessions],
      placement.options,
    );
  const projection = createNativePanelProjection({
    isNiriSession: () => true,
    publish: (view) => views.push(view),
  });
  projection.updateSnapshot({ generatedAt: 1, sessions: [raw, ...extraSessions] });
  const view = productionTitle
    ? project(owner)
    : {
        workspace,
        sessions: [{ ...raw, cardId: "session:agent", windowId: 44 }],
        focusedCardId: "session:agent",
        focusedSessionId: "agent",
        focusKind: "agent",
      };
  if (learnSources)
    placement.learnFromPlacements(view.sessions, initialWindows, [raw, ...extraSessions]);
  projection.publishWorkspaceView(view);
  const child = new EventEmitter();
  child.stdout = new EventEmitter();
  child.kill = () => {};
  let reconciliations = 0;
  const handlers = createWorkspaceProjectionHandlers({
    projection,
    placement: productionTitle
      ? placement
      : {
          observeWindowEvent: () => true,
          forgetWindow: () => false,
          observeWindowList: () => {},
          resolveCachedWorkspaceView: () => view,
        },
    reconcile: () => {
      reconciliations++;
    },
  });
  const watcher = createNiriWorkspaceEventWatcher({
    ...handlers,
    spawn: () => child,
    env: {},
    fallbackMs: 1500,
    setIntervalFn: () => ({ unref() {} }),
    clearIntervalFn: () => {},
  });
  const emit = (message) => child.stdout.emit("data", `${JSON.stringify(message)}\n`);
  return {
    projection,
    views,
    view,
    child,
    emit,
    watcher,
    owner,
    project,
    placement,
    refresh(windows) {
      placement.observeWindowList(windows);
      const next = project(windows);
      placement.learnFromPlacements(next.sessions, windows, [raw, ...extraSessions]);
      projection.publishWorkspaceView(next);
      return next;
    },
    reconciliations: () => reconciliations,
  };
}

test("actual event bindings veto non-agent focus synchronously, without waiting for a slow fallback read", () => {
  const f = fixture();
  try {
    const request = f.projection.requestKeyboard();
    f.emit({ WindowFocusChanged: { id: null } });
    assert.equal(f.views.at(-1).visible, true);
    f.emit({ WindowFocusChanged: { id: 99 } });
    f.projection.keyboardChanged(request, true);
    f.projection.send();
    assert.equal(f.views.at(-1).visible, false);
    const enter = createKeyboardEntry({
      projection: f.projection,
      runtimeStatus: { windowVisible: true },
      writePanel: () => assert.fail("hidden focus must not capture"),
    });
    assert.equal(enter().ok, false);
    f.emit({ WindowFocusChanged: { id: 44 } });
    assert.equal(f.views.at(-1).visible, true);
    assert.equal(f.views.at(-1).focusedCardId, "session:agent");
    assert.equal(f.reconciliations(), 3);
  } finally {
    f.watcher.stop();
  }
});

for (const event of [
  { WindowFocusChanged: {} },
  { WindowFocusChanged: { id: "44" } },
  { WindowsChanged: { windows: [] } },
  { WindowsChanged: { windows: [null] } },
  { WindowsChanged: { windows: [{ id: 44 }] } },
  { WorkspacesChanged: { workspaces: [null] } },
  {
    WindowsChanged: {
      windows: [
        { id: 44, is_focused: true },
        { id: 99, is_focused: true },
      ],
    },
  },
  { WorkspaceActivated: { id: 8, focused: true } },
  { WorkspacesChanged: { workspaces: [{ id: 8, is_focused: true }] } },
]) {
  test(`unknown/ambiguous focus or workspace transition fails closed: ${JSON.stringify(event)}`, () => {
    const f = fixture();
    try {
      const request = f.projection.requestKeyboard();
      f.emit({ WindowFocusChanged: { id: null } });
      f.emit(event);
      f.projection.keyboardChanged(request, true);
      f.projection.send();
      assert.equal(f.views.at(-1).visible, false);
    } finally {
      f.watcher.stop();
    }
  });
}

test("owner close/title changes revoke NULL ownership; unrelated changes do not, and stale focus cannot re-admit invalidated identity", () => {
  for (const event of [
    { WindowClosed: { id: 44 } },
    { WindowOpenedOrChanged: { window: { id: 44, title: "plain shell" } } },
  ]) {
    const f = fixture();
    try {
      f.projection.requestKeyboard();
      f.emit({ WindowFocusChanged: { id: null } });
      f.emit({ WindowOpenedOrChanged: { window: { id: 99 } } });
      assert.equal(f.views.at(-1).visible, true);
      f.emit(event);
      assert.equal(f.views.at(-1).visible, false);
      f.emit({ WindowFocusChanged: { id: 44 } });
      assert.equal(f.views.at(-1).visible, false, "requires a new full identity projection");
    } finally {
      f.watcher.stop();
    }
  }
});

for (const suffix of [
  "019fa4d0",
  "019fa4d071427fb48d30f98e951f0513",
  "gs:main:16 · 019fa4d071427fb48d30f98e951f0513",
]) {
  for (const keyboardNull of [false, true]) {
    test(`production placement revokes lost identity before polling: ${suffix}, NULL=${keyboardNull}`, () => {
      const f = fixture({ productionTitle: `π - topic · ${suffix}` });
      const writes = [];
      const enter = createKeyboardEntry({
        projection: f.projection,
        runtimeStatus: { windowVisible: true },
        writePanel: (message) => {
          writes.push(message);
          return true;
        },
      });
      try {
        assert.equal(f.view.sessions.length, 1, "real projection admitted the owner");
        assert.equal(f.views.at(-1).visible, true);
        if (keyboardNull) {
          assert.equal(enter().ok, true);
          f.emit({ WindowFocusChanged: { id: null } });
        }
        const baseline = f.reconciliations();
        f.emit({
          WindowOpenedOrChanged: {
            window: { ...f.owner, title: `π - renamed display · ${suffix}` },
          },
        });
        assert.equal(f.views.at(-1).visible, true, "same identity does not revoke ownership");
        assert.equal(f.reconciliations(), baseline, "display-only updates do not reconcile");
        const lost = { ...f.owner, title: "ordinary shell" };
        f.emit({ WindowOpenedOrChanged: { window: lost } });
        assert.equal(f.reconciliations(), baseline + 1, "identity loss requests reconciliation");
        assert.equal(f.views.at(-1).visible, false, "synchronous revocation before any full poll");
        if (keyboardNull) {
          f.projection.keyboardChanged(writes[0].revision, true);
          f.projection.send();
          assert.equal(
            f.views.at(-1).visible,
            false,
            "late acknowledgement cannot restore eligibility",
          );
        }
        const sent = writes.length;
        assert.equal(enter().ok, false);
        assert.equal(writes.length, sent, "no focus-strip command after revocation");
        f.emit({ WindowFocusChanged: { id: 44 } });
        assert.equal(f.views.at(-1).visible, false, "stale focus cannot re-admit identity");
        const next = f.project(lost);
        assert.equal(
          next.sessions.length,
          0,
          "production full projection agrees identity was lost",
        );
        f.projection.publishWorkspaceView(next);
        assert.equal(f.views.at(-1).visible, false);
      } finally {
        f.watcher.stop();
      }
    });
  }
}

for (const token of ["deadbeef", "deadbeefdeadbeefdeadbeefdeadbeef"]) {
  for (const keyboardNull of [false, true]) {
    test(`Claude hex suffix collision revokes before polling: ${token}, NULL=${keyboardNull}`, () => {
      const rawSession = {
        sessionId: "agent:claude:fixture",
        publisherId: "claude",
        terminalKind: "ghostty-surface",
        terminalKey: "ghostty:main:16",
        terminalFamily: "main",
        terminalSurfaceId: "16",
        titleSuffix: `Fix patch · ${token}`,
      };
      const f = fixture({ productionTitle: rawSession.titleSuffix, rawSession });
      const writes = [];
      const enter = createKeyboardEntry({
        projection: f.projection,
        runtimeStatus: { windowVisible: true },
        writePanel: (message) => {
          writes.push(message);
          return true;
        },
      });
      try {
        assert.equal(f.view.sessions.length, 1);
        assert.equal(f.view.focusKind, "agent");
        assert.equal(f.views.at(-1).visible, true);
        if (keyboardNull) {
          assert.equal(enter().ok, true);
          f.emit({ WindowFocusChanged: { id: null } });
        }
        const baseline = f.reconciliations();
        const lost = { ...f.owner, title: `ordinary shell · ${token}` };
        f.emit({ WindowOpenedOrChanged: { window: lost } });
        assert.equal(f.reconciliations(), baseline + 1);
        assert.equal(f.views.at(-1).visible, false, "revoked synchronously before a full poll");
        assert.equal(f.projection.isEligible(), false);
        if (keyboardNull) {
          f.projection.keyboardChanged(writes[0].revision, true);
          f.projection.send();
          assert.equal(
            f.views.at(-1).visible,
            false,
            "late acknowledgement cannot restore eligibility",
          );
        }
        const sent = writes.length;
        assert.equal(enter().ok, false);
        assert.equal(writes.length, sent);
        f.emit({ WindowFocusChanged: { id: 44 } });
        assert.equal(f.views.at(-1).visible, false, "stale owner focus cannot re-admit");
        const next = f.project(lost);
        assert.equal(next.sessions.length, 0);
        assert.equal(next.focusKind, "non-agent");
      } finally {
        f.watcher.stop();
      }
    });
  }
}

for (const keyboardNull of [false, true]) {
  test(`Pi prefix revealing a non-Pi title predicate invalidates: NULL=${keyboardNull}`, () => {
    const token = "019fa4d071427fb48d30f98e951f0513";
    const claude = {
      sessionId: "agent:claude:fixture",
      terminalKind: "ghostty-surface",
      terminalKey: "ghostty:main:17",
      terminalFamily: "main",
      terminalSurfaceId: "17",
      titleSuffix: `Fix patch · ${token}`,
    };
    const f = fixture({ productionTitle: `π - topic · ${token}`, extraSessions: [claude] });
    try {
      assert.equal(f.view.sessions.length, 1, "only Pi was admitted");
      if (keyboardNull) {
        assert.notEqual(f.projection.requestKeyboard(), null);
        f.emit({ WindowFocusChanged: { id: null } });
      }
      const baseline = f.reconciliations();
      f.emit({ WindowOpenedOrChanged: { window: { ...f.owner, title: claude.titleSuffix } } });
      assert.equal(
        f.reconciliations(),
        baseline + 1,
        "Pi proof must not mask other admission predicates",
      );
      assert.equal(f.views.at(-1).visible, false);
    } finally {
      f.watcher.stop();
    }
  });
}

for (const retireProof of [false, true]) {
  test(`unknown or retired Pi source facts retain full title: retired=${retireProof}`, () => {
    const f = fixture({
      productionTitle: "π - topic · 019fa4d071427fb48d30f98e951f0513",
      learnSources: retireProof,
    });
    try {
      if (retireProof) f.placement.learnFromPlacements([], [f.owner], []);
      f.emit({
        WindowOpenedOrChanged: {
          window: {
            ...f.owner,
            title: "π - renamed · 019fa4d071427fb48d30f98e951f0513",
          },
        },
      });
      assert.equal(f.reconciliations(), 1);
      assert.equal(f.views.at(-1).visible, false, "hex shape cannot replace missing source proof");
    } finally {
      f.watcher.stop();
    }
  });
}

const piId = "019fa4d0-7142-7fb4-8d30-f98e951f0513";
const piToken = piId.replaceAll("-", "");
const surface = {
  terminalKind: "ghostty-surface",
  terminalKey: "ghostty:main:16",
  terminalFamily: "main",
  terminalSurfaceId: "16",
};
const duplicateCases = [
  { name: "Pi legacy8", title: `π - topic · ${piToken.slice(0, 8)}`, raw: { sessionId: piId } },
  { name: "Pi token32", title: `π - topic · ${piToken}`, raw: { sessionId: piId } },
  {
    name: "Pi surface",
    title: `π - topic · gs:main:16 · ${piToken}`,
    raw: { sessionId: piId, ...surface },
  },
  ...["deadbeef", "deadbeefdeadbeefdeadbeefdeadbeef"].map((token) => ({
    name: `Claude suffix${token.length}`,
    title: `Fix patch · ${token}`,
    raw: { sessionId: "agent:claude:fixture", ...surface, titleSuffix: `Fix patch · ${token}` },
  })),
];
for (const entry of duplicateCases) {
  for (const keyboardNull of [false, true]) {
    for (const route of ["changed", "opened", "inventory-other-workspace"]) {
      test(`cross-window conflict revokes established ${entry.name}: NULL=${keyboardNull}, ${route}`, () => {
        const unrelated = {
          id: 45,
          app_id: "browser",
          pid: 5000,
          workspace_id: 7,
          is_focused: false,
          title: "notes",
        };
        const f = fixture({
          productionTitle: entry.title,
          rawSession: entry.raw,
          extraWindows: route === "opened" ? [] : [unrelated],
        });
        const writes = [];
        const enter = createKeyboardEntry({
          projection: f.projection,
          runtimeStatus: { windowVisible: true },
          writePanel: (message) => {
            writes.push(message);
            return true;
          },
        });
        const reserve = () => {
          if (!keyboardNull) return null;
          assert.equal(enter().ok, true);
          const revision = writes.at(-1).revision;
          f.emit({ WindowFocusChanged: { id: null } });
          return revision;
        };
        const assertRevoked = (request) => {
          assert.equal(
            f.views.at(-1).visible,
            false,
            "revoke affected owner synchronously before polling",
          );
          if (request !== null) {
            f.projection.keyboardChanged(request, true);
            f.projection.send();
          }
          assert.equal(
            f.projection.isEligible(),
            false,
            "late acknowledgement cannot restore eligibility",
          );
          const sent = writes.length;
          assert.equal(enter().ok, false);
          assert.equal(writes.length, sent, "no focus-strip command after conflicting ownership");
          f.emit({ WindowFocusChanged: { id: 44 } });
          assert.equal(f.views.at(-1).visible, false, "stale focus cannot re-admit");
        };
        try {
          assert.equal(
            f.view.sessions.length,
            1,
            "proof established before a conflicting window exists",
          );
          if (route !== "opened") {
            f.emit({
              WindowOpenedOrChanged: { window: { ...unrelated, title: "changed browser notes" } },
            });
            assert.equal(
              f.projection.isEligible(),
              true,
              "unrelated browser display changes retain ownership",
            );
          }
          const request = reserve();
          const duplicate = {
            ...f.owner,
            id: 45,
            pid: 5000,
            is_focused: false,
            workspace_id: route === "inventory-other-workspace" ? 8 : 7,
          };
          if (route === "inventory-other-workspace") {
            f.emit({
              WindowsChanged: { windows: [{ ...f.owner, is_focused: !keyboardNull }, duplicate] },
            });
          } else f.emit({ WindowOpenedOrChanged: { window: duplicate } });
          assertRevoked(request);
          const ambiguous = f.project([f.owner, duplicate]);
          assert.equal(
            ambiguous.sessions.length,
            0,
            "full production projection agrees placement is ambiguous",
          );
          assert.equal(ambiguous.focusKind, "non-agent");
          f.emit({ WindowClosed: { id: 45 } });
          assert.equal(
            f.views.at(-1).visible,
            false,
            "conflict disappearance alone must not re-admit stale proof",
          );
          f.refresh([f.owner]);
          assert.equal(
            f.projection.isEligible(),
            true,
            "a new full projection can re-establish proof",
          );
          const reopenedRequest = reserve();
          f.emit({ WindowOpenedOrChanged: { window: { ...duplicate, pid: 6000 } } });
          assertRevoked(reopenedRequest);
        } finally {
          f.watcher.stop();
        }
      });
    }
  }
}

for (const entry of duplicateCases) {
  for (const keyboardNull of [false, true]) {
    test(`cached move/close/reopen facts revoke ${entry.name}: NULL=${keyboardNull}`, () => {
      const other = {
        id: 45,
        app_id: "browser",
        pid: 5000,
        workspace_id: 7,
        is_focused: false,
        title: "notes",
      };
      const f = fixture({
        productionTitle: entry.title,
        rawSession: entry.raw,
        extraWindows: [other],
      });
      const writes = [];
      const enter = createKeyboardEntry({
        projection: f.projection,
        runtimeStatus: { windowVisible: true },
        writePanel: (message) => {
          writes.push(message);
          return true;
        },
      });
      const reserve = () => {
        if (!keyboardNull) return null;
        assert.equal(enter().ok, true);
        f.emit({ WindowFocusChanged: { id: null } });
        return writes.at(-1).revision;
      };
      const rejected = (request) => {
        if (request !== null) {
          f.projection.keyboardChanged(request, true);
          f.projection.send();
        }
        assert.equal(f.views.at(-1).visible, false);
        const sent = writes.length;
        assert.equal(enter().ok, false);
        assert.equal(writes.length, sent);
      };
      try {
        f.emit({ WindowOpenedOrChanged: { window: { ...other, workspace_id: 8 } } });
        assert.equal(
          f.projection.isEligible(),
          true,
          "unrelated workspace movement preserves the owner",
        );
        assert.equal(f.reconciliations(), 0, "no admission changed");
        const request = reserve();
        f.emit({ WindowOpenedOrChanged: { window: { ...f.owner, workspace_id: 8 } } });
        rejected(request);
        assert.equal(f.project([{ ...f.owner, workspace_id: 8 }, other]).sessions.length, 0);
        f.emit({ WindowOpenedOrChanged: { window: f.owner } });
        f.emit({ WindowFocusChanged: { id: 44 } });
        rejected(request);
        f.refresh([f.owner, other]);
        assert.equal(f.projection.isEligible(), true);
        const closingRequest = reserve();
        f.emit({ WindowClosed: { id: 44 } });
        rejected(closingRequest);
        f.emit({ WindowOpenedOrChanged: { window: { ...f.owner, pid: 6000 } } });
        f.emit({ WindowFocusChanged: { id: 44 } });
        rejected(closingRequest);
      } finally {
        f.watcher.stop();
      }
    });
  }
}

test("focus transfer revalidates a stale non-owner card before publishing any eligible frame", () => {
  const secondId = "019fa4d1-7142-7fb4-8d30-f98e951f0513";
  const second = {
    id: 45,
    app_id: "com.mitchellh.ghostty",
    pid: 5000,
    workspace_id: 7,
    is_focused: false,
    title: `π - second · ${secondId.replaceAll("-", "")}`,
  };
  const f = fixture({
    productionTitle: `π - first · ${piToken}`,
    extraSessions: [{ sessionId: secondId }],
    extraWindows: [second],
  });
  try {
    assert.equal(f.view.sessions.length, 2);
    f.emit({ WindowOpenedOrChanged: { window: { ...second, title: "ordinary shell" } } });
    assert.equal(f.projection.isEligible(), true, "the unaffected current owner remains eligible");
    const before = f.views.length;
    f.emit({ WindowFocusChanged: { id: 45 } });
    assert.equal(f.projection.isEligible(), false);
    assert.equal(
      f.views.slice(before).some((view) => view.visible),
      false,
      "no optimistic stale-owner frame",
    );
  } finally {
    f.watcher.stop();
  }
});

for (const change of [
  { app_id: "ordinary.app" },
  { pid: 4001 },
  { workspace_id: 8 },
  { title: "π - topic · 019fa4d171427fb48d30f98e951f0513" },
]) {
  test(`production placement invalidates changed admission fact: ${JSON.stringify(change)}`, () => {
    const f = fixture({ productionTitle: "π - topic · 019fa4d071427fb48d30f98e951f0513" });
    try {
      f.emit({ WindowOpenedOrChanged: { window: { ...f.owner, ...change } } });
      assert.equal(f.reconciliations(), 1);
      assert.equal(f.views.at(-1).visible, false);
    } finally {
      f.watcher.stop();
    }
  });
}

test("initial full window inventory forwards exact focus, and a broken stream revokes ownership", () => {
  const f = fixture();
  try {
    f.emit({ WindowsChanged: { windows: [{ id: 44, is_focused: true }] } });
    assert.equal(f.views.at(-1).visible, true);
    f.projection.requestKeyboard();
    f.emit({ WindowFocusChanged: { id: null } });
    f.child.emit("close", 0);
    assert.equal(f.views.at(-1).visible, false);
  } finally {
    f.watcher.stop();
  }
});

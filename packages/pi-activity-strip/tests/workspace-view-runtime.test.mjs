// ---
// summary: "tests workspace-local strip filtering and native hide, show, move, and alignment sequencing"
// read_when:
//   - "changing Niri workspace projection or strip visibility lifecycle"
// ---

import assert from "node:assert/strict";
import test from "node:test";
import {
  createNiriWorkspaceViewRuntime,
  haveSameSessionIds,
} from "../src/electron/workspace-view-runtime.mjs";

const sessionId = "019fa4d0-7142-7fb4-8d30-f98e951f0513";
const workspace = { id: 76, idx: 2, name: null, is_focused: true };
const ghostty = {
  id: 44,
  title: "π - dspx · 019fa4d071427fb48d30f98e951f0513",
  app_id: "com.tryinget.ghosttysidequest",
  workspace_id: 76,
};
const strip = { id: 423, title: "Pi Activity Strip", pid: 9001, workspace_id: 76 };

test("session membership comparison ignores detail and order changes", () => {
  assert.equal(
    haveSameSessionIds(
      [{ sessionId: "a", state: "thinking" }, { sessionId: "b" }],
      [
        { sessionId: "b", state: "success" },
        { sessionId: "a", detail: "updated" },
      ],
    ),
    true,
  );
  assert.equal(haveSameSessionIds([{ sessionId: "a" }], [{ sessionId: "b" }]), false);
  assert.equal(
    haveSameSessionIds([{ sessionId: "a" }], [{ sessionId: "a" }, { sessionId: "b" }]),
    false,
  );
  assert.equal(
    haveSameSessionIds(
      [{ sessionId: "a" }, { sessionId: "a" }],
      [{ sessionId: "a" }, { sessionId: "a" }],
    ),
    true,
  );
});

function createHarness({
  windows = [ghostty, strip],
  workspaces = [workspace],
  sessions = [{ sessionId, state: "success" }],
  visible = true,
  expanded = false,
  moveResult = true,
  moveApplies = true,
  discoveryWindows = windows,
  postMoveWindows = null,
  verificationWorkspaces = workspaces,
  readWindowsError = null,
  concealResult = true,
  revealResult = true,
  alignResult = true,
  alignAnimated = true,
  settleResult = true,
  alignedWindow = true,
  showWindowEffect = null,
} = {}) {
  const events = [];
  let windowReadCount = 0;
  let workspaceReadCount = 0;
  let laterWindows = discoveryWindows;
  const runtime = createNiriWorkspaceViewRuntime({
    readWindows: async () => {
      windowReadCount += 1;
      if (readWindowsError) throw readWindowsError;
      return windowReadCount === 1 ? windows : laterWindows;
    },
    readWorkspaces: async () => {
      workspaceReadCount += 1;
      return workspaceReadCount === 1 ? workspaces : verificationWorkspaces;
    },
    getSessions: () => sessions,
    getStripWindow: (candidates) =>
      candidates.find((candidate) => candidate.title === "Pi Activity Strip") ?? null,
    isWindowVisible: () => visible,
    isWindowExpanded: () => expanded,
    showWindow: async () => {
      events.push("show");
      if (showWindowEffect) await showWindowEffect();
      visible = true;
    },
    hideWindow: () => {
      events.push("hide");
      visible = false;
    },
    concealWindow: () => {
      events.push("conceal");
      return concealResult;
    },
    revealWindow: () => {
      events.push("reveal");
      return revealResult;
    },
    cancelReveal: () => events.push("cancel-reveal"),
    collapseWindow: async () => {
      events.push("collapse");
      expanded = false;
    },
    publishView: (view) =>
      events.push(`publish:${view.sessions.map((session) => session.sessionId).join(",")}`),
    moveWindowToWorkspace: async (stripWindow, targetWorkspace) => {
      events.push(`move:${targetWorkspace.id}`);
      if (moveResult && moveApplies) {
        laterWindows = (postMoveWindows ?? laterWindows).map((candidate) =>
          candidate.id === stripWindow.id
            ? { ...candidate, workspace_id: targetWorkspace.id }
            : candidate,
        );
      }
      return moveResult;
    },
    alignWindow: async () => {
      events.push("align-native");
      return { ok: alignResult, animated: alignAnimated };
    },
    settleWindow: async () => {
      events.push("settle");
      return settleResult;
    },
    isWindowAligned: () => alignedWindow,
    wait: async () => {},
  });
  return {
    runtime,
    events,
    getWindowReadCount: () => windowReadCount,
    getWorkspaceReadCount: () => workspaceReadCount,
  };
}

test("empty focused workspaces conceal and clear without unmapping a resident strip", async () => {
  const harness = createHarness({ sessions: [] });
  harness.runtime.request();
  await harness.runtime.waitForIdle();
  assert.deepEqual(harness.events, ["conceal", "publish:"]);

  const terminalClosed = createHarness({ windows: [strip] });
  terminalClosed.runtime.request();
  await terminalClosed.runtime.waitForIdle();
  assert.deepEqual(terminalClosed.events, ["conceal", "publish:"]);

  const expandedStrip = createHarness({ sessions: [], expanded: true });
  expandedStrip.runtime.request();
  await expandedStrip.runtime.waitForIdle();
  assert.deepEqual(expandedStrip.events, ["collapse", "conceal", "publish:"]);

  const alreadyHidden = createHarness({ sessions: [], visible: false });
  alreadyHidden.runtime.request();
  await alreadyHidden.runtime.waitForIdle();
  assert.deepEqual(
    alreadyHidden.events,
    ["conceal", "publish:"],
    "an already-hidden, collapsed strip must not churn native geometry",
  );
});

test("ambiguous focused-workspace truth conceals instead of reviving a resident view", async () => {
  const harness = createHarness({
    workspaces: [workspace, { ...workspace, id: 102, idx: 3 }],
  });
  harness.runtime.request();
  await harness.runtime.waitForIdle();
  assert.deepEqual(harness.events, ["conceal", "publish:"]);
  assert.equal(harness.events.includes("reveal"), false);
});

test("an inactive resident strip stays rendered when its workspace still has sessions", async () => {
  const focusedEmptyWorkspace = { id: 3, idx: 1, name: null, is_focused: true };
  const inactiveResidentWorkspace = { ...workspace, is_focused: false };
  const harness = createHarness({
    workspaces: [focusedEmptyWorkspace, inactiveResidentWorkspace],
  });
  harness.runtime.request();
  await harness.runtime.waitForIdle();
  assert.deepEqual(harness.events, [`publish:${sessionId}`, "reveal"]);
});

test("a hidden strip stays concealed until its local view is remapped", async () => {
  const harness = createHarness({
    windows: [ghostty],
    visible: false,
    discoveryWindows: [ghostty, strip],
  });
  harness.runtime.request();
  await harness.runtime.waitForIdle();
  assert.deepEqual(harness.events, [
    "conceal",
    "publish:",
    "show",
    "align-native",
    "settle",
    `publish:${sessionId}`,
    "reveal",
  ]);
  assert.equal(harness.getWindowReadCount(), 5);
});

test("native discovery waits for asynchronous BrowserWindow recovery", async () => {
  let releaseShow;
  const showGate = new Promise((resolve) => {
    releaseShow = resolve;
  });
  const harness = createHarness({
    windows: [ghostty],
    visible: false,
    discoveryWindows: [ghostty, strip],
    showWindowEffect: () => showGate,
  });

  harness.runtime.request();
  await new Promise((resolve) => setImmediate(resolve));
  assert.deepEqual(harness.events, ["conceal", "publish:", "show"]);

  releaseShow();
  await harness.runtime.waitForIdle();
  assert.deepEqual(harness.events.slice(-4), [
    "align-native",
    "settle",
    `publish:${sessionId}`,
    "reveal",
  ]);
});

test("a visible strip moves before publishing another workspace view", async () => {
  const harness = createHarness({
    windows: [ghostty, { ...strip, workspace_id: 102 }],
  });
  harness.runtime.request();
  await harness.runtime.waitForIdle();
  assert.deepEqual(harness.events, [
    "conceal",
    "publish:",
    "move:76",
    "align-native",
    "settle",
    `publish:${sessionId}`,
    "reveal",
  ]);
});

test("an aligned resident strip reveals immediately without native placement", async () => {
  const harness = createHarness();
  harness.runtime.request();
  await harness.runtime.waitForIdle();
  assert.deepEqual(harness.events, [`publish:${sessionId}`, "reveal"]);
});

test("a strip stays hidden when the compositor settle barrier fails", async () => {
  const harness = createHarness({
    windows: [ghostty, { ...strip, workspace_id: 102 }],
    settleResult: false,
  });
  harness.runtime.request();
  await harness.runtime.waitForIdle();
  assert.deepEqual(harness.events, [
    "conceal",
    "publish:",
    "move:76",
    "align-native",
    "settle",
    "collapse",
    "publish:",
    "hide",
  ]);
  assert.equal(harness.events.includes(`publish:${sessionId}`), false);
  assert.equal(harness.events.includes("reveal"), false);
});

test("a remapped strip stays concealed when native top alignment fails", async () => {
  const harness = createHarness({
    windows: [ghostty, { ...strip, workspace_id: 102 }],
    alignResult: false,
  });
  harness.runtime.request();
  await harness.runtime.waitForIdle();
  assert.deepEqual(harness.events, [
    "conceal",
    "publish:",
    "move:76",
    "align-native",
    "collapse",
    "publish:",
    "hide",
  ]);
  assert.equal(harness.events.includes(`publish:${sessionId}`), false);
  assert.equal(harness.events.includes("reveal"), false);
});

test("a remapped strip is not revealed until fresh Niri geometry is exact", async () => {
  const harness = createHarness({
    windows: [ghostty, { ...strip, workspace_id: 102 }],
    alignedWindow: false,
  });
  harness.runtime.request();
  await harness.runtime.waitForIdle();
  assert.deepEqual(harness.events, [
    "conceal",
    "publish:",
    "move:76",
    "align-native",
    "collapse",
    "publish:",
    "hide",
  ]);
  assert.equal(harness.events.includes(`publish:${sessionId}`), false);
  assert.equal(harness.events.includes("reveal"), false);
});

test("move or remap failure conceals and hides without publishing the local session", async () => {
  const harness = createHarness({
    windows: [ghostty, { ...strip, workspace_id: 102 }],
    moveResult: false,
  });
  harness.runtime.request();
  await harness.runtime.waitForIdle();
  assert.deepEqual(harness.events, [
    "conceal",
    "publish:",
    "move:76",
    "collapse",
    "publish:",
    "hide",
  ]);

  const missing = createHarness({ windows: [ghostty], discoveryWindows: [ghostty] });
  missing.runtime.request();
  await missing.runtime.waitForIdle();
  assert.deepEqual(missing.events, ["conceal", "publish:", "collapse", "publish:", "hide"]);
  assert.equal(
    missing.events.some((event) => event === `publish:${sessionId}`),
    false,
  );
});

test("successful move commands must still prove focused-workspace placement", async () => {
  const noOpMove = createHarness({
    windows: [ghostty, { ...strip, workspace_id: 102 }],
    moveApplies: false,
  });
  noOpMove.runtime.request();
  await noOpMove.runtime.waitForIdle();
  assert.deepEqual(noOpMove.events, [
    "conceal",
    "publish:",
    "move:76",
    "collapse",
    "publish:",
    "hide",
  ]);

  const focusChanged = createHarness({
    windows: [ghostty, { ...strip, workspace_id: 102 }],
    verificationWorkspaces: [{ id: 102, idx: 3, name: null, is_focused: true }],
  });
  focusChanged.runtime.request();
  await focusChanged.runtime.waitForIdle();
  assert.equal(
    focusChanged.events.some((event) => event === `publish:${sessionId}`),
    false,
  );
  assert.equal(focusChanged.events.at(-1), "hide");
});

test("placement verification re-resolves terminal membership before reveal", async () => {
  const terminalClosed = createHarness({
    windows: [ghostty, { ...strip, workspace_id: 102 }],
    postMoveWindows: [{ ...strip, workspace_id: 76 }],
  });
  terminalClosed.runtime.request();
  await terminalClosed.runtime.waitForIdle();
  assert.equal(
    terminalClosed.events.some((event) => event === `publish:${sessionId}`),
    false,
  );
  assert.deepEqual(terminalClosed.events, [
    "conceal",
    "publish:",
    "move:76",
    "collapse",
    "publish:",
    "hide",
  ]);
});

test("unexpected workspace-query rejection hides the stale renderer view", async () => {
  const harness = createHarness({ readWindowsError: new Error("niri read failed") });
  harness.runtime.request();
  await harness.runtime.waitForIdle();
  assert.deepEqual(harness.events, ["collapse", "conceal", "publish:", "hide"]);
});

test("fallback requests probe once without forcing redundant full reconciliation", async () => {
  let readCount = 0;
  let releaseFirstRead;
  let reportFirstReadStarted;
  const firstReadGate = new Promise((resolve) => {
    releaseFirstRead = resolve;
  });
  const firstReadStarted = new Promise((resolve) => {
    reportFirstReadStarted = resolve;
  });
  const events = [];
  const runtime = createNiriWorkspaceViewRuntime({
    readWindows: async () => {
      readCount += 1;
      if (readCount === 1) {
        reportFirstReadStarted();
        await firstReadGate;
      }
      return [ghostty, strip];
    },
    readWorkspaces: async () => [workspace],
    getSessions: () => [{ sessionId, state: "thinking" }],
    getStripWindow: (windows) =>
      windows.find((window) => window.title === "Pi Activity Strip") ?? null,
    isWindowVisible: () => true,
    isWindowExpanded: () => false,
    showWindow: () => {},
    hideWindow: () => events.push("hide"),
    concealWindow: () => true,
    revealWindow: () => {
      events.push("reveal");
      return true;
    },
    cancelReveal: () => events.push("cancel-reveal"),
    collapseWindow: () => {},
    publishView: (view) => events.push(`publish:${view.sessions.length}`),
    moveWindowToWorkspace: async () => true,
    alignWindow: async () => ({ ok: true, animated: false }),
    settleWindow: async () => true,
    isWindowAligned: () => true,
    wait: async () => {},
  });

  runtime.request();
  await firstReadStarted;
  runtime.requestPassive();
  runtime.requestPassive();
  releaseFirstRead();
  await runtime.waitForIdle();

  assert.equal(readCount, 1, "multiple fallback ticks use the bounded workspace probe");
  assert.deepEqual(events, ["publish:1", "reveal"]);
});

test("fallback queued during initial reads rechecks focus before reveal", async () => {
  const secondSessionId = "019fa4d1-7142-7fb4-8d30-f98e951f0513";
  const secondWorkspace = { id: 102, idx: 3, name: null, is_focused: true };
  const secondGhostty = {
    ...ghostty,
    id: 45,
    title: "π - kernel · 019fa4d171427fb48d30f98e951f0513",
    workspace_id: 102,
  };
  let focusedWorkspace = workspace;
  let windows = [ghostty, strip];
  let firstWindowRead = true;
  let firstWorkspaceRead = true;
  let releaseFirstWindowRead;
  let reportFirstWorkspaceRead;
  const firstWindowReadGate = new Promise((resolve) => {
    releaseFirstWindowRead = resolve;
  });
  const firstWorkspaceReadFinished = new Promise((resolve) => {
    reportFirstWorkspaceRead = resolve;
  });
  const events = [];
  const runtime = createNiriWorkspaceViewRuntime({
    readWindows: async () => {
      const capturedWindows = windows;
      if (firstWindowRead) {
        firstWindowRead = false;
        await firstWindowReadGate;
      }
      return capturedWindows;
    },
    readWorkspaces: async () => {
      const capturedWorkspaces = [focusedWorkspace];
      if (firstWorkspaceRead) {
        firstWorkspaceRead = false;
        reportFirstWorkspaceRead();
      }
      return capturedWorkspaces;
    },
    getSessions: () => [
      { sessionId, state: "thinking" },
      { sessionId: secondSessionId, state: "tool" },
    ],
    getStripWindow: (candidates) =>
      candidates.find((candidate) => candidate.title === "Pi Activity Strip") ?? null,
    isWindowVisible: () => true,
    isWindowExpanded: () => false,
    showWindow: () => events.push("show"),
    hideWindow: () => events.push("hide"),
    concealWindow: () => true,
    revealWindow: () => {
      events.push("reveal");
      return true;
    },
    cancelReveal: () => events.push("cancel-reveal"),
    collapseWindow: () => events.push("collapse"),
    publishView: (view) =>
      events.push(`publish:${view.sessions.map((session) => session.sessionId).join(",")}`),
    moveWindowToWorkspace: async () => true,
    alignWindow: async () => ({ ok: true, animated: false }),
    settleWindow: async () => true,
    isWindowAligned: () => true,
    wait: async () => {},
  });

  runtime.request();
  await firstWorkspaceReadFinished;
  focusedWorkspace = secondWorkspace;
  windows = [secondGhostty, { ...strip, workspace_id: 102 }];
  runtime.requestPassive();
  releaseFirstWindowRead();
  await runtime.waitForIdle();

  assert.equal(events.includes(`publish:${sessionId}`), false);
  assert.deepEqual(events.slice(-2), [`publish:${secondSessionId}`, "reveal"]);
});

test("fallback focus probes invalidate a stale reconciliation before reveal", async () => {
  const secondSessionId = "019fa4d1-7142-7fb4-8d30-f98e951f0513";
  const secondWorkspace = { id: 102, idx: 3, name: null, is_focused: true };
  const secondGhostty = {
    ...ghostty,
    id: 45,
    title: "π - kernel · 019fa4d171427fb48d30f98e951f0513",
    workspace_id: 102,
  };
  let focusedWorkspace = workspace;
  let sessions = [{ sessionId, state: "thinking" }];
  let windows = [ghostty, { ...strip, workspace_id: 102 }];
  let settleCount = 0;
  let releaseFirstSettle;
  let reportFirstSettleStarted;
  const firstSettleGate = new Promise((resolve) => {
    releaseFirstSettle = resolve;
  });
  const firstSettleStarted = new Promise((resolve) => {
    reportFirstSettleStarted = resolve;
  });
  const events = [];
  const runtime = createNiriWorkspaceViewRuntime({
    readWindows: async () => windows,
    readWorkspaces: async () => [focusedWorkspace],
    getSessions: () => sessions,
    getStripWindow: (candidates) =>
      candidates.find((candidate) => candidate.title === "Pi Activity Strip") ?? null,
    isWindowVisible: () => true,
    isWindowExpanded: () => false,
    showWindow: () => events.push("show"),
    hideWindow: () => events.push("hide"),
    concealWindow: () => {
      events.push("conceal");
      return true;
    },
    revealWindow: () => {
      events.push("reveal");
      return true;
    },
    cancelReveal: () => events.push("cancel-reveal"),
    collapseWindow: () => events.push("collapse"),
    publishView: (view) =>
      events.push(`publish:${view.sessions.map((session) => session.sessionId).join(",")}`),
    moveWindowToWorkspace: async (stripWindow, targetWorkspace) => {
      events.push(`move:${targetWorkspace.id}`);
      windows = windows.map((candidate) =>
        candidate.id === stripWindow.id
          ? { ...candidate, workspace_id: targetWorkspace.id }
          : candidate,
      );
      return true;
    },
    alignWindow: async () => {
      events.push("align-native");
      return { ok: true, animated: true };
    },
    settleWindow: async () => {
      settleCount += 1;
      events.push("settle");
      if (settleCount === 1) {
        reportFirstSettleStarted();
        await firstSettleGate;
      }
      return true;
    },
    isWindowAligned: () => true,
    wait: async () => {},
  });

  runtime.request();
  await firstSettleStarted;
  focusedWorkspace = secondWorkspace;
  sessions = [{ sessionId: secondSessionId, state: "tool" }];
  windows = [secondGhostty, { ...strip, workspace_id: 102 }];
  runtime.requestPassive();
  await new Promise((resolve) => setImmediate(resolve));
  releaseFirstSettle();
  await runtime.waitForIdle();

  assert.equal(events.includes(`publish:${sessionId}`), false);
  assert.deepEqual(events.slice(-2), [`publish:${secondSessionId}`, "reveal"]);
});

test("a newer workspace request repairs a stale in-flight move before revealing", async () => {
  const secondSessionId = "019fa4d1-7142-7fb4-8d30-f98e951f0513";
  const secondWorkspace = { id: 102, idx: 3, name: null, is_focused: true };
  const secondGhostty = {
    ...ghostty,
    id: 45,
    title: "π - kernel · 019fa4d171427fb48d30f98e951f0513",
    workspace_id: 102,
  };
  let focusedWorkspace = workspace;
  let sessions = [{ sessionId, state: "thinking" }];
  let windows = [ghostty, { ...strip, workspace_id: 102 }];
  let moveCount = 0;
  let releaseFirstMove;
  let reportFirstMoveStarted;
  const firstMoveGate = new Promise((resolve) => {
    releaseFirstMove = resolve;
  });
  const firstMoveStarted = new Promise((resolve) => {
    reportFirstMoveStarted = resolve;
  });
  const events = [];
  const runtime = createNiriWorkspaceViewRuntime({
    readWindows: async () => windows,
    readWorkspaces: async () => [focusedWorkspace],
    getSessions: () => sessions,
    getStripWindow: (candidates) =>
      candidates.find((candidate) => candidate.title === "Pi Activity Strip") ?? null,
    isWindowVisible: () => true,
    isWindowExpanded: () => false,
    showWindow: () => events.push("show"),
    hideWindow: () => events.push("hide"),
    concealWindow: () => {
      events.push("conceal");
      return true;
    },
    revealWindow: () => {
      events.push("reveal");
      return true;
    },
    cancelReveal: () => events.push("cancel-reveal"),
    collapseWindow: () => events.push("collapse"),
    publishView: (view) =>
      events.push(`publish:${view.sessions.map((session) => session.sessionId).join(",")}`),
    moveWindowToWorkspace: async (stripWindow, targetWorkspace) => {
      moveCount += 1;
      events.push(`move:${targetWorkspace.id}`);
      if (moveCount === 1) {
        reportFirstMoveStarted();
        await firstMoveGate;
      }
      windows = windows.map((candidate) =>
        candidate.id === stripWindow.id
          ? { ...candidate, workspace_id: targetWorkspace.id }
          : candidate,
      );
      return true;
    },
    alignWindow: async () => {
      events.push("align-native");
      return { ok: true, animated: true };
    },
    settleWindow: async () => {
      events.push("settle");
      return true;
    },
    isWindowAligned: () => true,
    wait: async () => {},
  });

  runtime.request();
  await firstMoveStarted;
  focusedWorkspace = secondWorkspace;
  sessions = [{ sessionId: secondSessionId, state: "tool" }];
  windows = [secondGhostty, { ...strip, workspace_id: 102 }];
  runtime.request();
  releaseFirstMove();
  await runtime.waitForIdle();

  assert.equal(events.includes(`publish:${sessionId}`), false);
  assert.deepEqual(events.slice(-2), [`publish:${secondSessionId}`, "reveal"]);
  assert.deepEqual(
    events.filter((event) => event.startsWith("move:")),
    ["move:76", "move:102"],
  );
});

test("a newer workspace request cancels an in-flight reveal before enabling stale input", async () => {
  const secondSessionId = "019fa4d1-7142-7fb4-8d30-f98e951f0513";
  const secondWorkspace = { id: 102, idx: 3, name: null, is_focused: true };
  const secondGhostty = {
    ...ghostty,
    id: 45,
    title: "π - kernel · 019fa4d171427fb48d30f98e951f0513",
    workspace_id: 102,
  };
  let focusedWorkspace = workspace;
  let sessions = [{ sessionId, state: "thinking" }];
  let windows = [ghostty, strip];
  let revealCount = 0;
  let releaseFirstReveal;
  let reportFirstRevealStarted;
  const firstRevealGate = new Promise((resolve) => {
    releaseFirstReveal = resolve;
  });
  const firstRevealStarted = new Promise((resolve) => {
    reportFirstRevealStarted = resolve;
  });
  const events = [];
  const runtime = createNiriWorkspaceViewRuntime({
    readWindows: async () => windows,
    readWorkspaces: async () => [focusedWorkspace],
    getSessions: () => sessions,
    getStripWindow: (candidates) =>
      candidates.find((candidate) => candidate.title === "Pi Activity Strip") ?? null,
    isWindowVisible: () => true,
    isWindowExpanded: () => false,
    showWindow: () => events.push("show"),
    hideWindow: () => events.push("hide"),
    concealWindow: () => {
      events.push("conceal");
      return true;
    },
    revealWindow: async () => {
      revealCount += 1;
      events.push(`reveal:${revealCount}:start`);
      if (revealCount === 1) {
        reportFirstRevealStarted();
        await firstRevealGate;
      }
      events.push(`reveal:${revealCount}:finish`);
      return true;
    },
    cancelReveal: () => events.push("cancel-reveal"),
    collapseWindow: () => events.push("collapse"),
    publishView: (view) =>
      events.push(`publish:${view.sessions.map((session) => session.sessionId).join(",")}`),
    moveWindowToWorkspace: async () => true,
    alignWindow: async () => ({ ok: true, animated: false }),
    settleWindow: async () => true,
    isWindowAligned: () => true,
    wait: async () => {},
  });

  runtime.request();
  await firstRevealStarted;
  focusedWorkspace = secondWorkspace;
  sessions = [{ sessionId: secondSessionId, state: "tool" }];
  windows = [secondGhostty, { ...strip, workspace_id: 102 }];
  runtime.request();
  assert.equal(events.includes("cancel-reveal"), true);
  releaseFirstReveal();
  await runtime.waitForIdle();

  assert.deepEqual(events.slice(-2), ["reveal:2:start", "reveal:2:finish"]);
  assert.equal(events.includes("conceal"), true);
  assert.equal(events.at(-3), `publish:${secondSessionId}`);
});

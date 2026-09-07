import assert from "node:assert/strict";
import test from "node:test";
import {
  focusNiriSession,
  readNiriWindows,
  resolveExactGhosttyWindow,
  resolveFocusedSnapshotSessionId,
  resolvePiSessionIdentity,
  resolveSnapshotSession,
} from "../src/common/niri-focus.mjs";
import {
  resolveFocusedNiriWorkspace,
  resolveFocusedWorkspaceView,
} from "../src/common/workspace-view.mjs";

const sessionId = "019fa4d0-7142-7fb4-8d30-f98e951f0513";
const ghostty = (id, title) => ({
  id,
  title,
  app_id: "com.tryinget.ghosttysidequest",
  workspace_id: 76,
});

test("bounded Niri list reads preserve query options and fail closed", async () => {
  const env = { NIRI_SOCKET: "socket" };
  const windows = [{ id: 44, is_focused: true }];
  const exec = async (file, args, options) => {
    assert.equal(file, "niri");
    assert.deepEqual(args, ["msg", "-j", "windows"]);
    assert.deepEqual(options, { env, timeout: 750 });
    return { stdout: JSON.stringify(windows) };
  };

  assert.deepEqual(await readNiriWindows(exec, env, 750), windows);
  assert.deepEqual(await readNiriWindows(async () => ({ stdout: "{}" }), env, 750), []);
  assert.deepEqual(
    await readNiriWindows(async () => Promise.reject(new Error("timeout")), env, 750),
    [],
  );
  assert.deepEqual(await readNiriWindows(() => assert.fail("must not execute"), {}, 750), []);
});

test("session focus resolves only one exact Ghostty title suffix", () => {
  const exact = ghostty(44, "π - dspx · 019fa4d071427fb48d30f98e951f0513");
  assert.equal(resolveExactGhosttyWindow([exact], sessionId)?.id, 44);
  assert.equal(
    resolveExactGhosttyWindow([ghostty(43, "π - dspx · 019fa4d0")], sessionId)?.id,
    43,
    "an unambiguous legacy title remains focusable during migration",
  );
  assert.equal(
    resolveExactGhosttyWindow(
      [ghostty(45, "π - dspx · 019fa4d171427fb48d30f98e951f0513")],
      sessionId,
    ),
    null,
  );
  assert.equal(resolveExactGhosttyWindow([exact, ghostty(46, exact.title)], sessionId), null);
  assert.equal(resolveExactGhosttyWindow([{ ...exact, app_id: "brave-browser" }], sessionId), null);
  assert.equal(resolveExactGhosttyWindow([{ ...exact, app_id: "not-ghostty" }], sessionId), null);
  assert.equal(
    resolveExactGhosttyWindow([{ ...exact, app_id: "com.mitchellh.ghostty.preview" }], sessionId),
    null,
    "lookalike app ids must fail closed",
  );
  assert.equal(
    resolveExactGhosttyWindow([{ ...exact, app_id: "COM.TRYINGET.GHOSTTYSIDEQUEST" }], sessionId),
    null,
    "app ids are exact case-sensitive compositor identities",
  );
  assert.equal(
    resolveExactGhosttyWindow([{ ...exact, title: `${exact.title}\n` }], sessionId),
    null,
    "the identity token must be the literal final title suffix",
  );
  assert.equal(resolveExactGhosttyWindow([exact], sessionId.slice(0, 8)), null);
});

test("terminal surface title segment disambiguates two windows sharing one logical session", () => {
  const token = sessionId.replaceAll("-", "");
  const windows = [
    ghostty(44, `π - dspx · gs:legacy:17 · ${token}`),
    ghostty(45, `π - dspx · gs:legacy:18 · ${token}`),
  ];
  const terminal = {
    sessionId,
    terminalKind: "ghostty-surface",
    terminalKey: "ghostty:legacy:17",
    terminalFamily: "legacy",
    terminalSurfaceId: "17",
  };
  assert.equal(resolveExactGhosttyWindow(windows, sessionId, terminal)?.id, 44);
  assert.equal(
    resolveExactGhosttyWindow(windows, sessionId, {
      ...terminal,
      terminalKey: "ghostty:legacy:18",
    }),
    null,
    "incoherent terminal fields must fail closed",
  );
  assert.equal(
    resolveExactGhosttyWindow([windows[1]], sessionId, terminal),
    null,
    "a bound surface must never fall back to another surface with the same logical session",
  );
  assert.equal(resolveExactGhosttyWindow(windows, sessionId), null);
});

test("Niri projection prefers one bound terminal card over an unbound mixed-version publisher", () => {
  const token = sessionId.replaceAll("-", "");
  const window = ghostty(44, `π - dspx · gs:legacy:17 · ${token}`);
  const bound = {
    sessionId,
    publisherId: "bound",
    terminalKind: "ghostty-surface",
    terminalKey: "ghostty:legacy:17",
    terminalFamily: "legacy",
    terminalSurfaceId: "17",
  };
  const view = resolveFocusedWorkspaceView(
    [window],
    [{ id: 76, idx: 2, name: null, is_focused: true }],
    [bound, { sessionId, publisherId: "unbound" }],
  );
  assert.equal(view?.sessions.length, 1);
  assert.equal(view?.sessions[0]?.cardId, "terminal:ghostty:legacy:17");
});

test("session focus rejects colliding legacy prefixes and resolves full identity titles", () => {
  const rocsSessionId = "019f4f3f-5d94-751e-a458-ddbc430dc568";
  const ontologySessionId = "019f4f3f-acde-751e-a458-ddbc430dc568";
  const legacyWindows = [
    ghostty(645, "π - rocs-cli · 019f4f3f"),
    ghostty(641, "π - ontology-kernel · 019f4f3f"),
  ];
  assert.equal(resolveExactGhosttyWindow(legacyWindows, rocsSessionId), null);
  assert.equal(resolveExactGhosttyWindow(legacyWindows, ontologySessionId), null);

  const currentWindows = [
    ghostty(645, "π - rocs-cli · 019f4f3f5d94751ea458ddbc430dc568"),
    ghostty(641, "π - ontology-kernel · 019f4f3facde751ea458ddbc430dc568"),
  ];
  assert.equal(resolveExactGhosttyWindow(currentWindows, rocsSessionId)?.id, 645);
  assert.equal(resolveExactGhosttyWindow(currentWindows, ontologySessionId)?.id, 641);

  const mixedVersionWindows = [currentWindows[0], ...legacyWindows];
  assert.equal(resolveExactGhosttyWindow(mixedVersionWindows, rocsSessionId)?.id, 645);
  assert.equal(resolveExactGhosttyWindow(mixedVersionWindows, ontologySessionId), null);

  const crossVersionPrefixCollision = [currentWindows[0], legacyWindows[1]];
  assert.equal(
    resolveExactGhosttyWindow(crossVersionPrefixCollision, ontologySessionId),
    null,
    "a migrated full title sharing the prefix makes a lone legacy fallback ambiguous",
  );
});

test("legacy telemetry resolves through a process-bound session-presence sidecar", () => {
  const legacy = {
    sessionId: "steve-1997373-legacy",
    processId: 1997373,
    cwd: "/workspace/agent-scripts",
  };
  const readFileSync = (filePath, encoding) => {
    assert.equal(filePath, "/run/user/1000/pi-session-presence/1997373.json");
    assert.equal(encoding, "utf8");
    return JSON.stringify({
      source: "@tryinget/pi-little-helpers/session-presence",
      pid: 1997373,
      cwd: legacy.cwd,
      sessionId,
    });
  };

  assert.equal(
    resolvePiSessionIdentity(legacy, {
      env: { XDG_RUNTIME_DIR: "/run/user/1000" },
      readFileSync,
      existsSync: () => true,
    }),
    sessionId,
  );
  assert.equal(
    resolvePiSessionIdentity(legacy, {
      env: { XDG_RUNTIME_DIR: "/run/user/1000" },
      readFileSync: () =>
        JSON.stringify({
          source: "@tryinget/pi-little-helpers/session-presence",
          pid: legacy.processId,
          cwd: "/different/repo",
          sessionId,
        }),
      existsSync: () => true,
    }),
    null,
    "cwd drift must fail closed",
  );
  assert.equal(
    resolvePiSessionIdentity({ ...legacy, processId: 0 }, { readFileSync }),
    null,
    "arbitrary or absent process ids must fail closed",
  );
  assert.equal(
    resolvePiSessionIdentity(
      { ...legacy, cwd: "" },
      {
        env: { XDG_RUNTIME_DIR: "/run/user/1000" },
        readFileSync,
        existsSync: () => true,
      },
    ),
    null,
    "missing telemetry cwd must fail closed",
  );
  assert.equal(
    resolvePiSessionIdentity(legacy, {
      env: { XDG_RUNTIME_DIR: "/run/user/1000" },
      readFileSync,
      existsSync: () => false,
    }),
    null,
    "a stale sidecar for a dead process must fail closed",
  );
});

test("focusNiriSession invokes focus only after an unambiguous lookup", async () => {
  const calls = [];
  const exec = async (_file, args) => {
    calls.push(args);
    if (args.at(-1) === "windows")
      return {
        stdout: JSON.stringify([ghostty(44, "π - dspx · 019fa4d071427fb48d30f98e951f0513")]),
      };
    return { stdout: "" };
  };
  assert.deepEqual(await focusNiriSession(sessionId, exec, { NIRI_SOCKET: "socket" }), {
    ok: true,
    windowId: 44,
  });
  assert.deepEqual(calls.at(-1), ["msg", "action", "focus-window", "--id", "44"]);

  const legacyResult = await focusNiriSession(
    { sessionId: "steve-legacy", processId: 1997373, cwd: "/workspace/agent-scripts" },
    exec,
    { NIRI_SOCKET: "socket", XDG_RUNTIME_DIR: "/run/user/1000" },
    {
      readFileSync: () =>
        JSON.stringify({
          source: "@tryinget/pi-little-helpers/session-presence",
          pid: 1997373,
          cwd: "/workspace/agent-scripts",
          sessionId,
        }),
      existsSync: () => true,
    },
  );
  assert.deepEqual(legacyResult, { ok: true, windowId: 44 });

  const ambiguous = async (_file, args) => ({
    stdout:
      args.at(-1) === "windows"
        ? JSON.stringify([
            ghostty(44, "π - dspx · 019fa4d071427fb48d30f98e951f0513"),
            ghostty(45, "π - dspx · 019fa4d071427fb48d30f98e951f0513"),
          ])
        : "",
  });
  assert.equal((await focusNiriSession(sessionId, ambiguous, { NIRI_SOCKET: "socket" })).ok, false);
});

test("snapshot focus selection rejects missing and duplicate session ids", () => {
  const session = { sessionId, processId: 44, cwd: "/workspace/dspx" };
  assert.equal(resolveSnapshotSession([session], sessionId), session);
  assert.equal(resolveSnapshotSession([], sessionId), null);
  assert.equal(resolveSnapshotSession([session, { ...session }], sessionId), null);
});

test("focused session resolution highlights only the exact focused Ghostty session", () => {
  const focused = {
    ...ghostty(44, "π - dspx · 019fa4d071427fb48d30f98e951f0513"),
    is_focused: true,
  };
  const otherSessionId = "019fa4d1-7142-7fb4-8d30-f98e951f0513";
  const other = ghostty(45, "π - kernel · 019fa4d171427fb48d30f98e951f0513");
  const sessions = [{ sessionId }, { sessionId: otherSessionId }];

  assert.equal(resolveFocusedSnapshotSessionId([focused, other], sessions), sessionId);
  assert.equal(
    resolveFocusedSnapshotSessionId([{ ...focused, app_id: "brave-browser" }, other], sessions),
    null,
    "a non-Ghostty focused window must not select a session",
  );
  assert.equal(
    resolveFocusedSnapshotSessionId([focused, { ...other, is_focused: true }], sessions),
    null,
    "ambiguous compositor focus must fail closed",
  );
  assert.equal(
    resolveFocusedSnapshotSessionId([focused, other], [sessions[0], { ...sessions[0] }]),
    null,
    "duplicate snapshot identity must fail closed",
  );
});

test("focused workspace view includes every exact tracked terminal on only that workspace", () => {
  const otherSessionId = "019fa4d1-7142-7fb4-8d30-f98e951f0513";
  const workspaces = [
    { id: 76, idx: 2, name: null, is_focused: true },
    { id: 102, idx: 3, name: null, is_focused: false },
  ];
  const localWindow = ghostty(44, "π - dspx · 019fa4d071427fb48d30f98e951f0513");
  const otherWindow = {
    ...ghostty(45, "π - kernel · 019fa4d171427fb48d30f98e951f0513"),
    workspace_id: 102,
  };
  const browser = {
    id: 46,
    title: "Browser",
    app_id: "brave-browser",
    workspace_id: 76,
    is_focused: true,
  };
  const sessions = [
    { sessionId, state: "success" },
    { sessionId: otherSessionId, state: "tool" },
    { sessionId: "headless-session", state: "thinking" },
  ];

  const view = resolveFocusedWorkspaceView(
    [localWindow, otherWindow, browser],
    workspaces,
    sessions,
  );
  assert.equal(view?.workspace.id, 76);
  assert.deepEqual(
    view?.sessions.map((session) => session.sessionId),
    [sessions[0].sessionId],
    "activity state must not filter membership",
  );
  assert.equal(view?.sessions[0]?.cardId, `session:${sessionId}`);
  assert.equal(view?.focusedSessionId, null, "browser focus must not hide other local terminals");

  const terminalFocused = resolveFocusedWorkspaceView(
    [{ ...localWindow, is_focused: true }, otherWindow],
    workspaces,
    sessions,
  );
  assert.equal(terminalFocused?.focusedSessionId, sessionId);

  const empty = resolveFocusedWorkspaceView(
    [localWindow, otherWindow],
    [{ id: 999, idx: 4, name: null, is_focused: true }],
    sessions,
  );
  assert.deepEqual(empty?.sessions, []);
  assert.equal(resolveFocusedWorkspaceView([], [], sessions), null);
  assert.equal(
    resolveFocusedWorkspaceView(
      [localWindow],
      [workspaces[0], { ...workspaces[0], id: 77, idx: 5 }],
      sessions,
    ),
    null,
  );
  const duplicateView = resolveFocusedWorkspaceView([localWindow], workspaces, [
    { ...sessions[0], publisherId: "publisher-a" },
    { ...sessions[0], publisherId: "publisher-b" },
  ]);
  assert.equal(duplicateView?.sessions.length, 1);
  assert.equal(duplicateView?.sessions[0]?.publisherCount, 2);
  assert.deepEqual(
    resolveFocusedWorkspaceView([{ ...localWindow, workspace_id: "76" }], workspaces, sessions)
      ?.sessions,
    [],
    "workspace identity must remain numeric and exact",
  );
});

test("workspace membership includes every activity state", () => {
  const states = ["idle", "thinking", "tool", "waiting", "success", "error"];
  const sessions = states.map((state, index) => ({
    sessionId: `019fa4d${index}-7142-7fb4-8d30-f98e951f0513`,
    state,
    agentActive: index % 2 === 0,
  }));
  const windows = sessions.map((session, index) => ({
    ...ghostty(100 + index, `π - ${session.state} · ${session.sessionId.replaceAll("-", "")}`),
    workspace_id: 76,
  }));
  const view = resolveFocusedWorkspaceView(
    windows,
    [{ id: 76, idx: 2, name: null, is_focused: true }],
    sessions,
  );
  assert.deepEqual(
    view?.sessions.map(({ sessionId: id, state, agentActive }) => ({
      sessionId: id,
      state,
      agentActive,
    })),
    sessions,
  );
});

test("focused-workspace resolution is exact and supports empty focused workspaces", () => {
  const focused = { id: 76, idx: 3, name: null, is_focused: true };
  assert.equal(resolveFocusedNiriWorkspace([focused])?.id, 76);
  assert.equal(resolveFocusedNiriWorkspace([]), null);
  assert.equal(resolveFocusedNiriWorkspace([focused, { ...focused, id: 77, idx: 4 }]), null);
});

test("focused workspace view places hidden Ghostty tabs through their host process and memory", () => {
  const token = sessionId.replaceAll("-", "");
  const hiddenSessionId = "019fa4d1-7142-7fb4-8d30-f98e951f0513";
  const orphanSessionId = "019fa4d2-7142-7fb4-8d30-f98e951f0513";
  const soloSessionId = "019fa4d3-7142-7fb4-8d30-f98e951f0513";
  const bound = (id, surface, processId) => ({
    sessionId: id,
    processId,
    state: "idle",
    terminalKind: "ghostty-surface",
    terminalKey: `ghostty:main:${surface}`,
    terminalFamily: "main",
    terminalSurfaceId: surface,
  });
  const main = (id, title, pid, extra = {}) => ({
    id,
    title,
    pid,
    app_id: "com.mitchellh.ghostty",
    workspace_id: 76,
    ...extra,
  });
  const windows = [
    main(44, `π - dspx · gs:main:16 · ${token}`, 4000, { is_focused: true }),
    main(45, "~/programming", 4000),
    main(46, "~/other", 4001),
    main(47, "elsewhere", 4000, { workspace_id: 102 }),
  ];
  const sessions = [
    bound(sessionId, "16", 501),
    bound(hiddenSessionId, "17", 502),
    bound(orphanSessionId, "18", 503),
    bound(soloSessionId, "19", 504),
  ];
  const hostByProcess = new Map([
    [501, 4000],
    [502, 4000],
    [503, 4000],
    [504, 4001],
  ]);
  const options = {
    resolveHostPid: (session) => hostByProcess.get(session.processId) ?? 0,
    lookupBinding: (key) => (key === "ghostty:main:17" ? { windowId: 44, windowPid: 4000 } : null),
  };
  const view = resolveFocusedWorkspaceView(
    windows,
    [{ id: 76, idx: 2, name: null, is_focused: true }],
    sessions,
    options,
  );
  const byId = new Map(view.sessions.map((session) => [session.sessionId, session]));
  assert.deepEqual(
    [...byId.keys()].sort(),
    [sessionId, hiddenSessionId, soloSessionId].sort(),
    "the unremembered tab of a multi-window host stays unplaced",
  );
  assert.equal(byId.get(sessionId).placement, "title");
  assert.equal(byId.get(sessionId).surfaceVisible, true);
  assert.equal(byId.get(sessionId).windowId, 44);
  assert.equal(byId.get(hiddenSessionId).placement, "binding");
  assert.equal(byId.get(hiddenSessionId).surfaceVisible, false);
  assert.equal(byId.get(hiddenSessionId).windowId, 44, "two tabs may share one window");
  assert.equal(byId.get(soloSessionId).placement, "host");
  assert.equal(byId.get(soloSessionId).windowId, 46);
  assert.equal(view.focusedCardId, "terminal:ghostty:main:16");
  assert.equal(view.focusedSessionId, sessionId);

  const hiddenFocus = resolveFocusedWorkspaceView(
    [{ ...windows[0], title: "~/dspx" }, ...windows.slice(1)],
    [{ id: 76, idx: 2, name: null, is_focused: true }],
    sessions,
    options,
  );
  assert.equal(
    hiddenFocus.focusedCardId,
    null,
    "a hidden tab in the focused window is never current",
  );
  assert.equal(hiddenFocus.sessions.length, 2);

  const otherWorkspace = resolveFocusedWorkspaceView(
    windows,
    [{ id: 102, idx: 3, name: null, is_focused: true }],
    sessions,
    { ...options, lookupBinding: () => ({ windowId: 47, windowPid: 4000 }) },
  );
  assert.deepEqual(
    otherWorkspace.sessions.map((session) => [session.sessionId, session.placement]),
    [
      [hiddenSessionId, "binding"],
      [orphanSessionId, "binding"],
    ],
    "remembered windows follow their workspace",
  );
});

test("focusNiriSession presents a hidden tab and confirms it through the window title", async () => {
  const token = sessionId.replaceAll("-", "");
  const session = {
    sessionId,
    processId: 501,
    terminalKind: "ghostty-surface",
    terminalKey: "ghostty:main:16",
    terminalFamily: "main",
    terminalSurfaceId: "16",
  };
  const main = (id, title) => ({ id, title, pid: 4000, app_id: "com.mitchellh.ghostty" });
  const calls = [];
  let presentedTitle = false;
  const exec = async (file, args) => {
    calls.push([file, ...args]);
    if (args.at(-1) === "windows") {
      return {
        stdout: JSON.stringify([
          main(44, presentedTitle ? `π - dspx · gs:main:16 · ${token}` : "~/dspx"),
        ]),
      };
    }
    return { stdout: "" };
  };
  const presentCalls = [];
  const presentSurface = async (target) => {
    presentCalls.push(target);
    presentedTitle = true;
    return { ok: true, busName: ":1.10" };
  };
  const env = { NIRI_SOCKET: "socket" };
  const options = { resolveHostPid: () => 4000, presentSurface, sleep: async () => {} };

  assert.deepEqual(await focusNiriSession(session, exec, env, options), {
    ok: true,
    windowId: 44,
    presented: true,
    verified: true,
  });
  assert.equal(presentCalls.length, 1);
  assert.equal(presentCalls[0].hostPid, 4000);
  assert.equal(presentCalls[0].surfaceId, "16");
  assert.equal(presentCalls[0].terminalFamily, "main");
  assert.deepEqual(calls[1], ["niri", "msg", "action", "focus-window", "--id", "44"]);

  presentedTitle = false;
  const unconfirmed = await focusNiriSession(session, exec, env, {
    ...options,
    presentSurface: async () => ({ ok: true, busName: ":1.10" }),
  });
  assert.equal(unconfirmed.ok, false);
  assert.equal(unconfirmed.presented, false);
  assert.match(unconfirmed.error, /did not become visible/);

  const rejected = await focusNiriSession(session, exec, env, {
    ...options,
    presentSurface: async () => ({
      ok: false,
      error: "the Ghostty process is not on the session bus",
    }),
  });
  assert.equal(rejected.ok, false);
  assert.match(
    rejected.error,
    /could not present the hidden tab \(the Ghostty process is not on the session bus\)/,
  );
  assert.deepEqual(calls.at(-1), ["niri", "msg", "action", "focus-window", "--id", "44"]);

  const unplaced = await focusNiriSession(session, exec, env, {
    ...options,
    resolveHostPid: () => 0,
  });
  assert.equal(unplaced.ok, false);
  assert.match(unplaced.error, /did not resolve to exactly one Ghostty window/);
  assert.equal(presentCalls.length, 1, "an unplaced surface is never presented");
});

test("an agent tab whose visibility cannot be read is presented without a false failure", async () => {
  // Agents that write no recognizable terminal title leave the compositor nothing to confirm.
  // Presenting must then report what actually happened rather than claiming a failure.
  const agent = {
    sessionId: "agent:gemini:7",
    processId: 501,
    terminalKind: "ghostty-surface",
    terminalKey: "ghostty:main:16",
    terminalFamily: "main",
    terminalSurfaceId: "16",
    titleSuffix: "",
  };
  const window = (id, title) => ({ id, title, pid: 4000, app_id: "com.mitchellh.ghostty" });
  const calls = [];
  const exec = async (file, args) => {
    calls.push([file, ...args]);
    return {
      stdout: args.at(-1) === "windows" ? JSON.stringify([window(44, "a plain title")]) : "",
    };
  };
  let presented = 0;
  const result = await focusNiriSession(
    agent,
    exec,
    { NIRI_SOCKET: "socket" },
    {
      resolveHostPid: () => 4000,
      presentSurface: async () => {
        presented += 1;
        return { ok: true, busName: ":1.10" };
      },
      sleep: async () => {},
    },
  );
  assert.deepEqual(result, { ok: true, windowId: 44, presented: true, verified: false });
  assert.equal(presented, 1);
  assert.deepEqual(calls.at(-1), ["niri", "msg", "action", "focus-window", "--id", "44"]);
  assert.equal(
    calls.filter((call) => call.at(-1) === "windows").length,
    1,
    "an unverifiable tab is never re-read in a confirmation loop",
  );
});

test("visibility is only claimed hidden on evidence", async () => {
  const { resolveSurfaceVisibility } = await import("../src/common/workspace-view.mjs");
  const token = sessionId.replaceAll("-", "");
  const piSession = {
    sessionId,
    terminalKind: "ghostty-surface",
    terminalKey: "ghostty:main:16",
    terminalFamily: "main",
    terminalSurfaceId: "16",
  };
  const agent = { ...piSession, sessionId: "agent:gemini:7", titleSuffix: "" };
  const titled = { title: `π - dspx · gs:main:17 · ${token}` };

  assert.equal(resolveSurfaceVisibility({ title: "x" }, piSession, "title"), "visible");
  assert.equal(
    resolveSurfaceVisibility({ title: "a plain title" }, piSession, "host"),
    "hidden",
    "a session that writes its identity into the title and did not match is behind another tab",
  );
  assert.equal(
    resolveSurfaceVisibility(titled, agent, "host"),
    "hidden",
    "a window showing another surface proves the tab is behind it",
  );
  assert.equal(
    resolveSurfaceVisibility({ title: "a plain title" }, agent, "host"),
    "unknown",
    "an agent with no readable title is never assumed hidden",
  );
});

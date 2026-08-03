import assert from "node:assert/strict";
import test from "node:test";
import {
  createFocusedSessionPoller,
  focusNiriSession,
  focusNiriStrip,
  readNiriWindows,
  resolveActivityStripWindow,
  resolveExactGhosttyWindow,
  resolveFocusedNiriWorkspace,
  resolveFocusedSnapshotSessionId,
  resolvePiSessionIdentity,
  resolveSnapshotSession,
} from "../src/common/niri-focus.mjs";

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

test("focused session polling is single-flight and always releases its guard", async () => {
  let releaseRead = () => {};
  const seen = [];
  const poll = createFocusedSessionPoller({
    readWindows: () =>
      new Promise((resolve) => {
        releaseRead = resolve;
      }),
    onWindows: (windows) => seen.push(windows),
  });

  const first = poll();
  assert.equal(await poll(), false, "an overlapping poll must not start another Niri read");
  releaseRead([{ id: 44, is_focused: true }]);
  assert.equal(await first, true);
  assert.deepEqual(seen, [[{ id: 44, is_focused: true }]]);

  let attempts = 0;
  const recoveringPoll = createFocusedSessionPoller({
    readWindows: async () => {
      attempts += 1;
      if (attempts === 1) throw new Error("niri timeout");
      return [];
    },
    onWindows: () => {},
  });
  await assert.rejects(recoveringPoll(), /niri timeout/);
  assert.equal(await recoveringPoll(), true, "a failed read must release the next polling cycle");
});

test("focused-workspace resolution is exact and supports empty focused workspaces", () => {
  const focused = { id: 76, idx: 3, name: null, is_focused: true };
  assert.equal(resolveFocusedNiriWorkspace([focused])?.id, 76);
  assert.equal(resolveFocusedNiriWorkspace([]), null);
  assert.equal(resolveFocusedNiriWorkspace([focused, { ...focused, id: 77, idx: 4 }]), null);
});

test("focusNiriStrip is compositor-bindable and moves the unique strip before focusing", async () => {
  const strip = { id: 423, title: "Pi Activity Strip", workspace_id: 4 };
  assert.equal(resolveActivityStripWindow([strip])?.id, 423);
  assert.equal(resolveActivityStripWindow([strip, { ...strip, id: 424 }]), null);

  const calls = [];
  const exec = async (_file, args) => {
    calls.push(args);
    if (args.at(-1) === "windows") return { stdout: JSON.stringify([strip]) };
    if (args.at(-1) === "workspaces") {
      return { stdout: JSON.stringify([{ id: 76, idx: 3, name: null, is_focused: true }]) };
    }
    return { stdout: "" };
  };
  const result = await focusNiriStrip(exec, { NIRI_SOCKET: "socket" });
  assert.equal(result.ok, true);
  assert.deepEqual(calls.at(-2), [
    "msg",
    "action",
    "move-window-to-workspace",
    "--window-id",
    "423",
    "--focus",
    "false",
    "3",
  ]);
  assert.deepEqual(calls.at(-1), ["msg", "action", "focus-window", "--id", "423"]);
});

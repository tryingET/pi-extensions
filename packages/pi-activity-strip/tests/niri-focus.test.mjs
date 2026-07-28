import assert from "node:assert/strict";
import test from "node:test";
import {
  focusNiriSession,
  focusNiriStrip,
  resolveActivityStripWindow,
  resolveExactGhosttyWindow,
  resolveFocusedNiriWorkspace,
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

test("session focus resolves only one exact Ghostty title suffix", () => {
  const exact = ghostty(44, "π - dspx · 019fa4d0");
  assert.equal(resolveExactGhosttyWindow([exact], sessionId)?.id, 44);
  assert.equal(resolveExactGhosttyWindow([ghostty(45, "π - dspx · 019fa4d1")], sessionId), null);
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
      return { stdout: JSON.stringify([ghostty(44, "π - dspx · 019fa4d0")]) };
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
        ? JSON.stringify([ghostty(44, "π - dspx · 019fa4d0"), ghostty(45, "π - dspx · 019fa4d0")])
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

// ---
// summary: "verifies hidden Ghostty tab placement through host process containment and remembered windows"
// read_when:
//   - "changing how hidden tabs are attributed to windows"
// ---

import assert from "node:assert/strict";
import test from "node:test";
import { describePlacement, resolveHiddenSurfaceWindow } from "../src/common/window-placement.mjs";

const session = {
  sessionId: "019fa4d0-7142-7fb4-8d30-f98e951f0513",
  processId: 501,
  terminalKind: "ghostty-surface",
  terminalKey: "ghostty:main:16",
  terminalFamily: "main",
  terminalSurfaceId: "16",
};
const window = (id, pid, app_id = "com.mitchellh.ghostty") => ({
  id,
  pid,
  app_id,
  title: "plain shell",
  workspace_id: 2,
});

test("a single host window is an exact placement without any memory", () => {
  const windows = [window(44, 4000), window(45, 4001), window(46, 4000, "brave-browser")];
  const placed = resolveHiddenSurfaceWindow(windows, session, { resolveHostPid: () => 4000 });
  assert.equal(placed?.window.id, 44);
  assert.equal(placed?.placement, "host");
  assert.equal(
    describePlacement(placed?.placement),
    "hidden tab inside its Ghostty process's only window",
  );
});

test("several host windows need the remembered window, which must still belong to the host", () => {
  const windows = [window(44, 4000), window(45, 4000), window(46, 4001)];
  const options = { resolveHostPid: () => 4000, lookupBinding: () => null };
  assert.equal(resolveHiddenSurfaceWindow(windows, session, options), null);
  const remembered = resolveHiddenSurfaceWindow(windows, session, {
    ...options,
    lookupBinding: (key) => (key === "ghostty:main:16" ? { windowId: 45, windowPid: 4000 } : null),
  });
  assert.equal(remembered?.window.id, 45);
  assert.equal(remembered?.placement, "binding");
  assert.equal(
    resolveHiddenSurfaceWindow(windows, session, {
      ...options,
      lookupBinding: () => ({ windowId: 46, windowPid: 4001 }),
    }),
    null,
    "a memory pointing at another process's window is not trusted",
  );
  const token = "019fa4d071427fb48d30f98e951f0513";
  const byToken = resolveHiddenSurfaceWindow(windows, session, {
    ...options,
    sessionToken: token,
    lookupBinding: (key) =>
      key === `pi-session:${token}` ? { windowId: 45, windowPid: 4000 } : null,
  });
  assert.equal(
    byToken?.window.id,
    45,
    "a drifted surface id still places through the session token",
  );
  assert.equal(
    resolveHiddenSurfaceWindow(windows, session, {
      ...options,
      sessionToken: "not-a-token",
      lookupBinding: (key) =>
        key.startsWith("pi-session:") ? { windowId: 45, windowPid: 4000 } : null,
    }),
    null,
    "a malformed token never forms a binding key",
  );
  assert.equal(
    resolveHiddenSurfaceWindow(windows, session, {
      ...options,
      lookupBinding: () => ({ windowId: 45, windowPid: 4002 }),
    }),
    null,
    "a memory whose pid drifted is not trusted",
  );
});

test("placement fails closed without a host, a canonical surface, or a matching family", () => {
  const windows = [window(44, 4000)];
  assert.equal(resolveHiddenSurfaceWindow(windows, session, {}), null);
  assert.equal(resolveHiddenSurfaceWindow(windows, session, { resolveHostPid: () => 0 }), null);
  assert.equal(
    resolveHiddenSurfaceWindow(windows, session, { resolveHostPid: () => 4001 }),
    null,
    "no window of the host process means no placement",
  );
  assert.equal(
    resolveHiddenSurfaceWindow(
      windows,
      { ...session, terminalKey: "ghostty:main:17" },
      {
        resolveHostPid: () => 4000,
      },
    ),
    null,
  );
  assert.equal(
    resolveHiddenSurfaceWindow(
      windows,
      { ...session, terminalFamily: "legacy", terminalKey: "ghostty:legacy:16" },
      { resolveHostPid: () => 4000 },
    ),
    null,
    "a legacy surface never lands on a main-family window",
  );
  assert.equal(
    resolveHiddenSurfaceWindow(
      windows,
      { sessionId: session.sessionId },
      {
        resolveHostPid: () => 4000,
      },
    ),
    null,
    "unbound sessions are only ever placed by their visible title",
  );
});

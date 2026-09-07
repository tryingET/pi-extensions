// ---
// summary: "tests immediate focused-workspace events and the bounded Niri polling fallback"
// read_when:
//   - "changing Niri workspace event watching or fallback polling"
// ---

import assert from "node:assert/strict";
import { EventEmitter } from "node:events";
import test from "node:test";
import { createNiriWorkspaceEventWatcher } from "../src/native/workspace-events.mjs";

test("focused workspace events reconcile immediately while other events are ignored", () => {
  const stdout = new EventEmitter();
  const child = new EventEmitter();
  child.stdout = stdout;
  child.killed = false;
  child.kill = () => {
    child.killed = true;
  };
  const env = { NIRI_SOCKET: "socket" };
  let fallbackHandler = () => {};
  let timerCleared = false;
  const focusedWorkspaceIds = [];
  let fallbacks = 0;
  const watcher = createNiriWorkspaceEventWatcher({
    spawn: (file, args, spawnOptions) => {
      assert.equal(file, "niri");
      assert.deepEqual(args, ["msg", "-j", "event-stream"]);
      assert.deepEqual(spawnOptions, { env, stdio: ["ignore", "pipe", "ignore"] });
      return child;
    },
    env,
    onFocusedWorkspace: (workspaceId) => focusedWorkspaceIds.push(workspaceId),
    onFallback: () => {
      fallbacks += 1;
    },
    fallbackMs: 1500,
    setIntervalFn: (handler, milliseconds) => {
      assert.equal(milliseconds, 1500);
      fallbackHandler = handler;
      return { unref() {} };
    },
    clearIntervalFn: () => {
      timerCleared = true;
    },
  });

  stdout.emit("data", '{"WindowsChanged":{}}\nnot-json\n{"WorkspaceActivated":');
  stdout.emit("data", '{"id":3,"focused":false}}\n');
  assert.deepEqual(focusedWorkspaceIds, []);
  stdout.emit("data", '{"WorkspaceActivated":{"id":76,"focused":true}}\n');
  stdout.emit("data", '{"WorkspaceActivated":{"id":76,"focused":true}}\n');
  stdout.emit("data", '{"WorkspaceActivated":{"id":102,"focused":true}}\n');
  assert.deepEqual(focusedWorkspaceIds, [76, 102]);

  fallbackHandler();
  assert.equal(fallbacks, 1);
  watcher.stop();
  assert.equal(timerCleared, true);
  assert.equal(child.killed, true);
  stdout.emit("data", '{"WorkspaceActivated":{"id":3,"focused":true}}\n');
  fallbackHandler();
  assert.deepEqual(focusedWorkspaceIds, [76, 102]);
  assert.equal(fallbacks, 1);
});

test("event-stream spawn failure leaves the polling fallback operational", () => {
  let fallbackHandler = () => {};
  let reconciliations = 0;
  const watcher = createNiriWorkspaceEventWatcher({
    spawn: () => {
      throw new Error("niri unavailable");
    },
    env: {},
    onFocusedWorkspace: () => {},
    onFallback: () => {
      reconciliations += 1;
    },
    fallbackMs: 1500,
    setIntervalFn: (handler) => {
      fallbackHandler = handler;
      return 1;
    },
    clearIntervalFn: () => {},
  });
  fallbackHandler();
  assert.equal(reconciliations, 1);
  watcher.stop();
});

test("window open, change, close, and focus events are forwarded alongside workspace focus", () => {
  const stdout = new EventEmitter();
  const child = new EventEmitter();
  child.stdout = stdout;
  child.kill = () => {};
  const changed = [];
  const closed = [];
  const focused = [];
  const watcher = createNiriWorkspaceEventWatcher({
    spawn: () => child,
    env: { NIRI_SOCKET: "socket" },
    onFocusedWorkspace: () => {},
    onFallback: () => {},
    onWindowChanged: (window) => changed.push(window.id),
    onWindowClosed: (id) => closed.push(id),
    onWindowFocusChanged: (id) => focused.push(id),
    fallbackMs: 1500,
    setIntervalFn: () => ({ unref() {} }),
    clearIntervalFn: () => {},
  });
  stdout.emit(
    "data",
    `${[
      '{"WindowOpenedOrChanged":{"window":{"id":44,"title":"π","workspace_id":2}}}',
      '{"WindowOpenedOrChanged":{"window":null}}',
      '{"WindowClosed":{"id":45}}',
      '{"WindowClosed":{"id":"45"}}',
      '{"WindowFocusChanged":{"id":44}}',
      '{"WindowFocusChanged":{"id":null}}',
    ].join("\n")}\n`,
  );
  assert.deepEqual(changed, [44]);
  assert.deepEqual(closed, [45]);
  assert.deepEqual(focused, [44, null]);
  watcher.stop();
});

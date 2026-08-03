// ---
// summary: "tests acknowledged renderer visibility frames and fail-closed input gating"
// read_when:
//   - "changing renderer visibility handshake behavior"
// ---

import assert from "node:assert/strict";
import test from "node:test";
import {
  createBrowserWindowVisibilityRuntime,
  createRendererVisibilityRuntime,
  VISIBILITY_APPLIED_CHANNEL,
  VISIBILITY_CHANNEL,
} from "../src/electron/renderer-visibility-runtime.mjs";

function createHarness() {
  const sent = [];
  const inputStates = [];
  const webContents = {
    send: (channel, ...args) => sent.push([channel, ...args]),
  };
  const runtime = createRendererVisibilityRuntime({
    getWebContents: () => webContents,
    setInputEnabled: (enabled) => inputStates.push(enabled),
    timeoutMs: 1000,
  });
  return { inputStates, runtime, sent, webContents };
}

test("concealment resolves only after the matching renderer acknowledges it", async () => {
  const harness = createHarness();
  const applied = harness.runtime.apply(false);
  assert.deepEqual(harness.inputStates, [false]);
  assert.deepEqual(harness.sent, [[VISIBILITY_CHANNEL, false, 1]]);
  assert.equal(
    harness.runtime.acknowledge({ sender: {} }, 1, false),
    false,
    "another renderer cannot acknowledge the request",
  );
  assert.equal(harness.runtime.acknowledge({ sender: harness.webContents }, 1, true), false);
  assert.equal(harness.runtime.acknowledge({ sender: harness.webContents }, 1, false), true);
  assert.equal(await applied, true);
});

test("renderer input is enabled only after a successful reveal acknowledgement", async () => {
  const harness = createHarness();
  const applied = harness.runtime.apply(true);
  assert.deepEqual(harness.inputStates, []);
  assert.deepEqual(harness.sent, [[VISIBILITY_CHANNEL, true, 1]]);
  harness.runtime.acknowledge({ sender: harness.webContents }, 1, true);
  assert.equal(await applied, true);
  assert.deepEqual(harness.inputStates, [true]);
  assert.equal(VISIBILITY_APPLIED_CHANNEL, "pi-activity-strip:visibility-applied");
});

test("a newer conceal request invalidates an acknowledged in-flight reveal", async () => {
  const harness = createHarness();
  const reveal = harness.runtime.apply(true);
  const conceal = harness.runtime.apply(false);

  harness.runtime.acknowledge({ sender: harness.webContents }, 1, true);
  assert.equal(await reveal, false);
  harness.runtime.acknowledge({ sender: harness.webContents }, 2, false);
  assert.equal(await conceal, true);
  assert.deepEqual(harness.inputStates, [false]);
});

test("stale generations and renderer-rejected visibility never enable input", async () => {
  const staleHarness = createHarness();
  const stale = staleHarness.runtime.apply(true, () => false);
  staleHarness.runtime.acknowledge({ sender: staleHarness.webContents }, 1, true);
  assert.equal(await stale, false);
  assert.deepEqual(staleHarness.inputStates, []);

  const rejectedHarness = createHarness();
  const rejected = rejectedHarness.runtime.apply(true);
  rejectedHarness.runtime.acknowledge({ sender: rejectedHarness.webContents }, 1, true, false);
  assert.equal(await rejected, false);
  assert.deepEqual(rejectedHarness.inputStates, []);
});

test("BrowserWindow focus and pointer input follow acknowledged renderer visibility", async () => {
  const focusable = [];
  const ignored = [];
  const sent = [];
  const webContents = { send: (channel, ...args) => sent.push([channel, ...args]) };
  const window = {
    isDestroyed: () => false,
    setFocusable: (enabled) => focusable.push(enabled),
    setIgnoreMouseEvents: (disabled, options) => ignored.push([disabled, options]),
    webContents,
  };
  const runtime = createBrowserWindowVisibilityRuntime(() => window, true);

  const concealed = runtime.apply(false);
  runtime.acknowledge({ sender: webContents }, 1, false);
  assert.equal(await concealed, true);
  const revealed = runtime.apply(true);
  runtime.acknowledge({ sender: webContents }, 2, true);
  assert.equal(await revealed, true);

  assert.deepEqual(focusable, [false, true]);
  assert.deepEqual(ignored, [
    [true, { forward: true }],
    [false, { forward: true }],
  ]);
  assert.deepEqual(sent, [
    [VISIBILITY_CHANNEL, false, 1],
    [VISIBILITY_CHANNEL, true, 2],
  ]);
});

test("timeout and disposal fail closed without enabling renderer input", async () => {
  let fireTimeout = () => {};
  const inputStates = [];
  const webContents = { send: () => {} };
  const runtime = createRendererVisibilityRuntime({
    getWebContents: () => webContents,
    setInputEnabled: (enabled) => inputStates.push(enabled),
    timeoutMs: 10,
    setTimer: (handler) => {
      fireTimeout = handler;
      return 1;
    },
    clearTimer: () => {},
  });

  const timedOut = runtime.apply(true);
  fireTimeout();
  assert.equal(await timedOut, false);
  assert.deepEqual(inputStates, []);

  const disposed = runtime.apply(false);
  runtime.dispose();
  assert.equal(await disposed, false);
  assert.deepEqual(inputStates, [false, false]);
});

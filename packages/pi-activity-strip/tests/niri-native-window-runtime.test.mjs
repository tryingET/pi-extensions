// ---
// summary: "tests compositor-native strip remapping, floating conversion, and exact top alignment"
// read_when:
//   - "changing Niri native window placement or animation classification"
// ---

import assert from "node:assert/strict";
import test from "node:test";
import { createNiriNativeWindowRuntime } from "../src/electron/niri-native-window-runtime.mjs";

const bounds = { x: 8, y: 0, width: 1904, height: 84 };
const alignedStrip = {
  id: 423,
  pid: 9001,
  title: "Pi Activity Strip",
  workspace_id: 76,
  is_floating: true,
  layout: {
    window_size: [1904, 84],
    tile_pos_in_workspace_view: [8, 0],
  },
};

function createHarness({ windows = [[alignedStrip]], niri = true } = {}) {
  const calls = [];
  const sizes = [];
  const setBounds = [];
  const waits = [];
  let readCount = 0;
  const browserWindow = {
    isDestroyed: () => false,
    setBounds: (...args) => setBounds.push(args),
    setSize: (...args) => sizes.push(args),
  };
  const runtime = createNiriNativeWindowRuntime({
    execFileAsync: async (_file, args, options) => {
      calls.push([args, options]);
      return {};
    },
    env: { NIRI_SOCKET: "socket" },
    timeoutMs: 1500,
    processId: 9001,
    readWindows: async () => windows[Math.min(readCount++, windows.length - 1)],
    getBrowserWindow: () => browserWindow,
    getBounds: () => bounds,
    isNiriSession: () => niri,
    wait: async (milliseconds) => waits.push(milliseconds),
  });
  return { calls, readCount: () => readCount, runtime, setBounds, sizes, waits };
}

test("an already-aligned floating strip needs no animated compositor action", async () => {
  const harness = createHarness();
  const result = await harness.runtime.alignWindowToTop(() => true);
  assert.deepEqual(result, { ok: true, animated: false });
  assert.deepEqual(harness.calls, []);
  assert.deepEqual(harness.sizes, []);
  assert.equal(harness.runtime.isWindowAligned(alignedStrip), true);
  assert.equal(harness.readCount(), 2);
});

test("tiled startup is resized, floated, and moved before reporting animated alignment", async () => {
  const tiled = {
    ...alignedStrip,
    is_floating: false,
    layout: { window_size: [936, 1084], tile_pos_in_workspace_view: null },
  };
  const resizedTiled = {
    ...tiled,
    layout: { window_size: [1904, 84], tile_pos_in_workspace_view: null },
  };
  const floating = {
    ...alignedStrip,
    layout: { window_size: [1904, 84], tile_pos_in_workspace_view: [16, 150] },
  };
  const harness = createHarness({ windows: [[tiled], [resizedTiled], [floating], [alignedStrip]] });

  const result = await harness.runtime.alignWindowToTop(() => true);

  assert.deepEqual(result, { ok: true, animated: true });
  assert.deepEqual(harness.sizes, [[1904, 84, false]]);
  assert.deepEqual(
    harness.calls.map(([args]) => args),
    [
      ["msg", "action", "move-window-to-floating", "--id", "423"],
      ["msg", "action", "move-floating-window", "--id", "423", "-x", "-8", "-y", "-150"],
    ],
  );
  assert.deepEqual(harness.waits, [80, 60, 60]);
});

test("workspace remapping preserves no-focus semantics and the bounded timeout", async () => {
  const harness = createHarness();
  const moved = await harness.runtime.moveWindowToWorkspace(alignedStrip, {
    id: 102,
    idx: 3,
    name: null,
  });
  assert.equal(moved, true);
  assert.deepEqual(harness.calls[0], [
    ["msg", "action", "move-window-to-workspace", "--window-id", "423", "--focus", "false", "3"],
    { env: { NIRI_SOCKET: "socket" }, timeout: 1500 },
  ]);
});

test("non-Niri alignment uses Electron bounds without classifying an animation", async () => {
  const harness = createHarness({ niri: false });
  const result = await harness.runtime.alignWindowToTop(() => true);
  assert.deepEqual(result, { ok: true, animated: false });
  assert.deepEqual(harness.setBounds, [[bounds, false]]);
  assert.deepEqual(harness.calls, []);
});

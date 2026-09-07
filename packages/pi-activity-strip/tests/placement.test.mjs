// ---
// summary: "verifies placement runtime window memory, unplaced counting, and bounded tab-inventory cadence"
// read_when:
//   - "changing hidden-tab placement orchestration or inventory backoff"
// ---

import assert from "node:assert/strict";
import test from "node:test";
import {
  createPlacementRuntime,
  TAB_INVENTORY_FAILURE_BACKOFF_MS,
  TAB_INVENTORY_INTERVAL_MS,
  TAB_INVENTORY_UNAVAILABLE_RETRY_MS,
  TAB_INVENTORY_URGENT_INTERVAL_MS,
} from "../src/native/placement.mjs";

const token = "019fa4d071427fb48d30f98e951f0513";
const sessionId = "019fa4d0-7142-7fb4-8d30-f98e951f0513";
const ghostty = (id, title, pid = 4000, extra = {}) => ({
  id,
  title,
  pid,
  app_id: "com.mitchellh.ghostty",
  workspace_id: 2,
  ...extra,
});

function runtime(overrides = {}) {
  const runtimeStatus = { tabInventoryState: "pending" };
  const placement = createPlacementRuntime({
    env: { NIRI_SOCKET: "socket" },
    runtimeStatus,
    execFileAsync: async () => ({ stdout: "" }),
    onBindingsLearned: () => {},
    bindingsFilePath: "",
    ...overrides,
    ...(overrides.runtimeStatus ? {} : { runtimeStatus }),
  });
  return { placement, runtimeStatus };
}

test("window observation learns memory, reports meaningful changes, and forgets closed windows", () => {
  const { placement } = runtime();
  const visible = ghostty(44, `π - dspx · gs:main:16 · ${token}`);
  placement.observeWindowList([visible, ghostty(45, "~/programming")]);
  assert.equal(placement.bindingCount, 2, "the surface key and the session key are both learned");
  assert.equal(placement.observeWindowEvent(visible), false, "an unchanged window is not news");
  assert.equal(
    placement.observeWindowEvent({ ...visible, workspace_id: 9 }),
    true,
    "a workspace move is news",
  );
  assert.equal(
    placement.observeWindowEvent(ghostty(45, `π - other · gs:main:17 · ${token}`)),
    true,
    "a title revealing another surface is news",
  );
  assert.equal(placement.observeWindowEvent({ id: "bad" }), false);
  assert.equal(placement.forgetWindow(45), true);
  assert.equal(placement.forgetWindow(45), false);
  assert.equal(placement.bindingCount, 3, "the second revealed surface is remembered too");
  placement.observeWindowList([]);
  assert.equal(placement.bindingCount, 3, "an empty observation never prunes memory");
});

test("unplaced counting only counts bound surfaces that resolve to no window", () => {
  const bound = (surface, processId, id = sessionId) => ({
    sessionId: id,
    processId,
    terminalKind: "ghostty-surface",
    terminalKey: `ghostty:main:${surface}`,
    terminalFamily: "main",
    terminalSurfaceId: surface,
  });
  const hosts = new Map([
    [501, 4000],
    [502, 4000],
    [503, 4001],
  ]);
  const { placement } = runtime();
  const windows = [
    ghostty(44, `π - dspx · gs:main:16 · ${token}`),
    ghostty(45, "~/programming"),
    ghostty(46, "solo", 4001),
  ];
  placement.observeWindowList(windows);
  placement.options.resolveHostPid = (session) => hosts.get(Number(session.processId)) ?? 0;
  const otherSessionId = "019fa4d1-7142-7fb4-8d30-f98e951f0513";
  const sessions = [
    bound("16", 501),
    bound("17", 502, otherSessionId),
    bound("18", 503, otherSessionId),
    { sessionId, processId: 504 },
  ];
  assert.equal(
    placement.countUnplaced(windows, sessions),
    1,
    "only the unremembered tab of a multi-window host is unplaced",
  );
  assert.equal(
    placement.countUnplaced(windows, [bound("99", 501)]),
    0,
    "a drifted surface still places through its remembered session token",
  );
});

test("tab inventory runs bounded, never concurrently, and backs off per failure kind", async () => {
  let clock = 1_000_000;
  const calls = [];
  const frameName = `π - dspx · gs:main:16 · ${token}`;
  let response = {
    ok: true,
    frames: [{ pid: 4000, name: frameName, tabs: [`x · gs:main:16 · ${token}`] }],
  };
  let release;
  let gate = null;
  let learned = 0;
  const { placement, runtimeStatus } = runtime({
    now: () => clock,
    onBindingsLearned: () => {
      learned += 1;
    },
    probeInventory: async (request) => {
      calls.push(request.pids);
      if (gate) await gate;
      return response;
    },
  });
  const windows = [ghostty(44, frameName), { id: 9, pid: 5, app_id: "foot" }];
  placement.observeWindowList(windows);

  gate = new Promise((resolve) => {
    release = resolve;
  });
  const first = placement.scheduleInventory(windows);
  assert.equal(placement.scheduleInventory(windows), undefined, "a probe never runs concurrently");
  release();
  await first;
  assert.deepEqual(calls, [[4000]], "only Ghostty processes are inventoried");
  assert.equal(runtimeStatus.tabInventoryState, "ready");
  assert.equal(runtimeStatus.tabInventoryTabCount, 1);
  assert.equal(runtimeStatus.tabInventoryProbedAt, clock);
  gate = null;

  assert.equal(placement.scheduleInventory(windows), undefined, "the calm interval is respected");
  clock += TAB_INVENTORY_INTERVAL_MS;
  await placement.scheduleInventory(windows);
  assert.equal(calls.length, 2);

  runtimeStatus.unplacedSurfaceCount = 3;
  clock += TAB_INVENTORY_URGENT_INTERVAL_MS;
  assert.equal(
    placement.scheduleInventory(windows),
    undefined,
    "the shorter interval only takes effect after a probe observes unplaced surfaces",
  );
  clock += TAB_INVENTORY_INTERVAL_MS;
  response = {
    ok: true,
    frames: [{ pid: 4000, name: frameName, tabs: [`x · gs:main:21 · ${token}`] }],
  };
  await placement.scheduleInventory(windows);
  assert.equal(calls.length, 3);
  clock += TAB_INVENTORY_URGENT_INTERVAL_MS;
  await placement.scheduleInventory(windows);
  assert.equal(calls.length, 4, "a probe still learning keeps the shorter interval");

  // The same frames teach nothing new, so the probe must fall back to the calm interval instead
  // of spawning every few seconds for a surface the inventory will never see.
  clock += TAB_INVENTORY_URGENT_INTERVAL_MS;
  assert.equal(
    placement.scheduleInventory(windows),
    undefined,
    "a probe that learns nothing returns to the calm cadence",
  );
  clock += TAB_INVENTORY_INTERVAL_MS;
  await placement.scheduleInventory(windows);
  assert.equal(calls.length, 5);

  response = { ok: false, unavailable: false, error: "boom" };
  clock += TAB_INVENTORY_INTERVAL_MS;
  await placement.scheduleInventory(windows);
  assert.equal(runtimeStatus.tabInventoryState, "failed");
  assert.equal(runtimeStatus.tabInventoryDetail, "boom");
  clock += TAB_INVENTORY_URGENT_INTERVAL_MS;
  assert.equal(placement.scheduleInventory(windows), undefined, "a failure backs off");
  clock += TAB_INVENTORY_FAILURE_BACKOFF_MS;

  response = { ok: false, unavailable: true, error: "no gi" };
  await placement.scheduleInventory(windows);
  assert.equal(runtimeStatus.tabInventoryState, "unavailable");
  clock += TAB_INVENTORY_FAILURE_BACKOFF_MS;
  assert.equal(placement.scheduleInventory(windows), undefined, "an unavailable host waits longer");
  clock += TAB_INVENTORY_UNAVAILABLE_RETRY_MS;
  response = {
    ok: true,
    frames: [{ pid: 4000, name: frameName, tabs: [`x · gs:main:99 · ${token}`] }],
  };
  await placement.scheduleInventory(windows);
  assert.equal(runtimeStatus.tabInventoryState, "ready");
  assert.ok(learned > 0, "newly learned bindings request reconciliation");
  assert.equal(placement.scheduleInventory([]), undefined, "no Ghostty windows means no probe");

  const disabled = runtime({ runtimeStatus: { tabInventoryState: "disabled" } });
  assert.equal(disabled.placement.scheduleInventory(windows), undefined);
});

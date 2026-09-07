// ---
// summary: "verifies stale-height detection evidence rules and the bounded repair pass"
// read_when:
//   - "changing window height repair or its safety bounds"
// ---

import assert from "node:assert/strict";
import test from "node:test";
import {
  createHeightRepair,
  findStaleWindows,
  HEIGHT_REPAIR_MAX_PER_TRANSITION,
} from "../src/native/height-repair.mjs";

const tile = (id, height, extra = {}) => ({
  id,
  layout: { window_size: [936, height] },
  ...extra,
});

test("a window is stale only when it still sits at a height other windows just left", () => {
  const before = [tile(1, 1084), tile(2, 1084), tile(3, 1084), tile(4, 1076)];
  const after = [tile(1, 1168), tile(2, 1084), tile(3, 1084), tile(4, 1076)];
  assert.deepEqual(findStaleWindows(before, after), [
    { id: 2, height: 1084 },
    { id: 3, height: 1084 },
  ]);
  assert.equal(
    findStaleWindows(before, after).some((window) => window.id === 4),
    false,
    "a deliberately chosen height that nobody vacated is never touched",
  );
});

test("no observed movement means no evidence and no repair", () => {
  const same = [tile(1, 1084), tile(2, 1084)];
  assert.deepEqual(findStaleWindows(same, same), []);
  assert.deepEqual(findStaleWindows([], [tile(1, 1084)]), []);
  assert.deepEqual(findStaleWindows([tile(1, 1084)], []), []);
});

test("floating, unknown, and newly appeared windows are excluded from the evidence", () => {
  const before = [tile(1, 1084), tile(2, 1084, { is_floating: true }), tile(3, 1084)];
  const after = [
    tile(1, 1168),
    tile(2, 1084, { is_floating: true }),
    tile(3, 1084),
    tile(9, 1084),
    { id: 10 },
  ];
  assert.deepEqual(findStaleWindows(before, after), [{ id: 3, height: 1084 }]);
});

function repairHarness({ env = {}, sequence } = {}) {
  const calls = [];
  const runtimeStatus = {};
  let index = 0;
  const repair = createHeightRepair({
    env,
    runtimeStatus,
    execFileAsync: async (file, args) => {
      calls.push([file, ...args]);
      return { stdout: "" };
    },
    readWindows: async () => sequence[Math.min(index++, sequence.length - 1)],
    sleep: async () => {},
    settleMs: 0,
  });
  return { repair, calls, runtimeStatus };
}

test("a repair pass resets exactly the stranded windows and never repeats one", async () => {
  const before = [tile(1, 1084), tile(2, 1084), tile(3, 1084), tile(4, 1076)];
  const after = [tile(1, 1168), tile(2, 1084), tile(3, 1084), tile(4, 1076)];
  const { repair, calls, runtimeStatus } = repairHarness({ sequence: [after, after] });
  repair.observe(before);

  assert.deepEqual(await repair.repairAfterZoneChange(), [2, 3]);
  assert.deepEqual(calls, [
    ["niri", "msg", "action", "reset-window-height", "--id", "2"],
    ["niri", "msg", "action", "reset-window-height", "--id", "3"],
  ]);
  assert.equal(runtimeStatus.heightRepairCount, 2);
  assert.ok(runtimeStatus.lastHeightRepairAt > 0);

  repair.observe(before);
  assert.deepEqual(
    await repair.repairAfterZoneChange(),
    [],
    "a window already reset at that height is never reset again",
  );
  assert.equal(calls.length, 2);
});

test("repair is bounded, skippable, and survives a rejected action", async () => {
  const before = Array.from({ length: 80 }, (_, index) => tile(index + 1, 1084));
  const after = [tile(1, 1168), ...before.slice(1)];
  const { repair, calls } = repairHarness({ sequence: [after] });
  repair.observe(before);
  const applied = await repair.repairAfterZoneChange();
  assert.equal(applied.length, HEIGHT_REPAIR_MAX_PER_TRANSITION);
  assert.equal(calls.length, HEIGHT_REPAIR_MAX_PER_TRANSITION);

  const runtimeStatus = {};
  const disabled = createHeightRepair({
    env: { PI_ACTIVITY_STRIP_HEIGHT_REPAIR: "0" },
    runtimeStatus,
    execFileAsync: async () => assert.fail("must not act"),
    readWindows: async () => after,
    sleep: async () => {},
  });
  disabled.observe(before);
  assert.equal(disabled.enabled, false);
  assert.equal(runtimeStatus.heightRepairState, "disabled");
  assert.deepEqual(await disabled.repairAfterZoneChange(), []);

  const rejecting = createHeightRepair({
    runtimeStatus: {},
    env: {},
    execFileAsync: async (_file, args) => {
      if (args.at(-1) === "2") throw new Error("window is gone");
      return { stdout: "" };
    },
    readWindows: async () => after.slice(0, 4),
    sleep: async () => {},
    settleMs: 0,
  });
  rejecting.observe(before.slice(0, 4));
  assert.deepEqual(
    await rejecting.repairAfterZoneChange(),
    [3, 4],
    "a window that vanished mid-pass does not abort the others",
  );
});

test("repair never runs concurrently and needs an observation first", async () => {
  const before = [tile(1, 1084), tile(2, 1084)];
  const after = [tile(1, 1168), tile(2, 1084)];
  let releaseSleep;
  const gate = new Promise((resolve) => {
    releaseSleep = resolve;
  });
  const runtimeStatus = {};
  const calls = [];
  const repair = createHeightRepair({
    env: {},
    runtimeStatus,
    execFileAsync: async (_file, args) => {
      calls.push(args.at(-1));
      return { stdout: "" };
    },
    readWindows: async () => after,
    sleep: () => gate,
  });
  assert.deepEqual(
    await repair.repairAfterZoneChange(),
    [],
    "with nothing observed there is no before state to compare",
  );
  repair.observe(before);
  const first = repair.repairAfterZoneChange();
  assert.deepEqual(await repair.repairAfterZoneChange(), [], "a second pass never overlaps");
  releaseSleep();
  assert.deepEqual(await first, [2]);
  assert.deepEqual(calls, ["2"]);
});

test("a window that moves again may be repaired again", async () => {
  const before = [tile(1, 1084), tile(2, 1084)];
  const after = [tile(1, 1168), tile(2, 1084)];
  const { repair, calls } = repairHarness({ sequence: [after, after, after] });
  repair.observe(before);
  assert.deepEqual(await repair.repairAfterZoneChange(), [2]);

  repair.observe(before);
  assert.deepEqual(await repair.repairAfterZoneChange(), [], "no repeat while it sits there");

  // The window is seen at another height, so it moved; being stranded there later is a new event.
  repair.observe([tile(1, 1168), tile(2, 1168)]);
  repair.observe(before);
  assert.deepEqual(await repair.repairAfterZoneChange(), [2], "the guard forgets a moved window");
  assert.equal(calls.length, 2);
});

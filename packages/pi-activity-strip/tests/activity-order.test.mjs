import assert from "node:assert/strict";
import test from "node:test";
import {
  isMonitoringSession,
  moveOrderItem,
  reconcileActivityOrder,
} from "../src/common/activity-order.mjs";

const session = (sessionId, state, updatedAt = 0) => ({
  sessionId,
  state,
  updatedAt,
  agentActive: state === "tool" || state === "thinking" || state === "waiting",
});

test("calm ordering puts green monitoring sessions next to the Activity tile", () => {
  const initial = [
    session("idle", "idle"),
    session("work", "tool"),
    session("monitor-a", "success"),
    session("monitor-b", "success"),
  ];
  const grouped = reconcileActivityOrder(initial, []);
  assert.deepEqual(grouped, ["monitor-a", "monitor-b", "work", "idle"]);
  assert.equal(isMonitoringSession(initial[2]), true);
  assert.equal(isMonitoringSession({ ...initial[2], toolName: "bash" }), false);

  const stateChanged = [
    session("idle", "thinking"),
    session("work", "success"),
    session("monitor-a", "tool"),
    session("monitor-b", "success"),
  ];
  assert.deepEqual(
    reconcileActivityOrder(stateChanged, grouped, { regroup: false }),
    ["monitor-a", "monitor-b", "work", "idle"],
    "live detail/state updates must not cause immediate card movement",
  );
  assert.deepEqual(
    reconcileActivityOrder(stateChanged, grouped, { regroup: true }),
    ["monitor-b", "work", "monitor-a", "idle"],
    "the calm-clock refresh must keep monitoring first, then preserve order within groups",
  );
});

test("new sessions append immediately and manual arrow moves are bounded", () => {
  const next = reconcileActivityOrder(
    [session("a", "idle"), session("b", "idle"), session("c", "idle")],
    ["a", "b"],
    { regroup: false },
  );
  assert.deepEqual(next, ["a", "b", "c"]);
  assert.deepEqual(moveOrderItem(next, "b", -1), ["b", "a", "c"]);
  assert.deepEqual(moveOrderItem(next, "a", -1), next);
  assert.deepEqual(moveOrderItem(next, "c", 1), next);
});

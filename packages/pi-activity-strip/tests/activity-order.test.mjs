import assert from "node:assert/strict";
import test from "node:test";
import { moveOrderItem, reconcileActivityOrder } from "../src/common/activity-order.mjs";

const session = (sessionId, state, updatedAt = 0) => ({
  sessionId,
  state,
  updatedAt,
  agentActive: state === "tool" || state === "thinking" || state === "waiting",
});

test("calm ordering regroups active sessions only on an explicit refresh", () => {
  const initial = [session("idle", "idle"), session("work", "tool")];
  const grouped = reconcileActivityOrder(initial, []);
  assert.deepEqual(grouped, ["work", "idle"]);

  const stateChanged = [session("idle", "thinking"), session("work", "success")];
  assert.deepEqual(
    reconcileActivityOrder(stateChanged, grouped, { regroup: false }),
    ["work", "idle"],
    "live detail/state updates must not cause immediate card movement",
  );
  assert.deepEqual(
    reconcileActivityOrder(stateChanged, grouped, { regroup: true }),
    ["idle", "work"],
    "the calm-clock refresh may regroup activity",
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

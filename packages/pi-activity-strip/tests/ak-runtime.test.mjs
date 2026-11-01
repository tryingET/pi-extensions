// ---
// summary: "verifies the AK polling runtime reads only the ak CLI and fails closed"
// read_when:
//   - "changing AK polling, CLI arguments, or fail-closed behavior"
// ---

import assert from "node:assert/strict";
import test from "node:test";
import { formatBrokerRuntimeStatus } from "../src/common/status-report.mjs";
import {
  AK_DEFERRED_REFRESH_MS,
  AK_TASK_REFRESH_MS,
  createAkTaskRuntime,
} from "../src/native/ak-runtime.mjs";

const LIVE_LEASE = new Date(Date.now() + 60 * 60 * 1000).toISOString();
const SESSION = "01a0993a-d336-739f-a308-cfa4c21d6332";

function claimList(rows) {
  return JSON.stringify(
    rows.map((row) => ({
      id: 5701,
      repo: "/repo",
      title: "task",
      status: "claimed",
      claimed_by: `session-${SESSION}`,
      lease_expires_at: LIVE_LEASE,
      ...row,
    })),
  );
}

/**
 * @param {{claims?: string; deferred?: string; error?: Error; claimsError?: Error; deferredError?: Error}} [behavior]
 *   mutable between refreshes
 */
function makeExec(behavior = {}) {
  const calls = [];
  const exec = async (file, args) => {
    calls.push({ file, args });
    if (behavior.error) throw behavior.error;
    if (behavior.claimsError && args.includes("list")) throw behavior.claimsError;
    if (behavior.deferredError && args.includes("deferred")) throw behavior.deferredError;
    if (args.includes("deferred")) return { stdout: behavior.deferred ?? "[]" };
    return { stdout: behavior.claims ?? claimList([{}]) };
  };
  return { exec, calls };
}

const DEFERRED = JSON.stringify([
  {
    task: { id: 5702, repo: "/repo", title: "parked" },
    deferral: { state: "active", reason: "x".repeat(2000) },
  },
]);

function makeOptions(exec, env = {}, now = Date.now) {
  /** @type {import("../src/common/contracts.ts").ActivityStripRuntimeStatus} */
  const runtimeStatus = { state: "starting", startedAt: 0 };
  const states = [];
  const runtime = createAkTaskRuntime({
    execFileAsync: exec,
    env,
    now,
    runtimeStatus,
    onChange: (state) => states.push(state),
  });
  return { runtime, runtimeStatus, states };
}

test("refresh reads only the read-only ak CLI surface", async () => {
  const { exec, calls } = makeExec();
  const { runtime, runtimeStatus, states } = makeOptions(exec);
  const ok = await runtime.refresh();
  assert.equal(ok, true);
  assert.equal(runtimeStatus.akTaskState, "ok");
  assert.equal(runtimeStatus.akTaskClaimCount, 1);
  assert.deepEqual(
    calls.map((call) => `${call.file} ${call.args.join(" ")}`),
    [
      "ak task list --status claimed --format json --all --verbose",
      "ak task deferred --format json --all",
    ],
  );
  assert.equal(states.length, 1);
  assert.equal(states[0]?.claims.length, 1);
  // The observed CLI surface stays read-only: list and deferred only, never a write verb.
  for (const call of calls) {
    assert.equal(call.args[0], "task");
    assert.ok(["list", "deferred"].includes(call.args[1] ?? ""));
  }
});

test("missing ak binary fails closed and clears chips", async () => {
  const { exec } = makeExec({
    error: Object.assign(new Error("spawn ak ENOENT"), { code: "ENOENT" }),
  });
  const { runtime, runtimeStatus, states } = makeOptions(exec);
  const ok = await runtime.refresh();
  assert.equal(ok, false);
  assert.equal(runtimeStatus.akTaskState, "unavailable");
  assert.match(String(runtimeStatus.akTaskError), /ak CLI unavailable/);
  assert.deepEqual(states, [{ claims: [], deferred: [] }]);
});

test("malformed output fails closed", async () => {
  const { exec } = makeExec({ claims: "<not json>" });
  const { runtime, runtimeStatus, states } = makeOptions(exec);
  await runtime.refresh();
  assert.equal(runtimeStatus.akTaskState, "unavailable");
  assert.match(String(runtimeStatus.akTaskError), /not JSON/);
  assert.deepEqual(states, [{ claims: [], deferred: [] }]);
});

test("the runtime stays inert when disabled by environment", async () => {
  const { exec, calls } = makeExec();
  const { runtime, runtimeStatus, states } = makeOptions(exec, {
    PI_ACTIVITY_STRIP_AK_TASKS: "0",
  });
  assert.equal(runtime.disabled, true);
  assert.equal(runtimeStatus.akTaskState, "disabled");
  const ok = await runtime.refresh();
  assert.equal(ok, false);
  runtime.start();
  assert.equal(calls.length, 0);
  assert.equal(states.length, 0);
});

test("an alternate ak binary is honored", async () => {
  const { exec, calls } = makeExec();
  const { runtime } = makeOptions(exec, { PI_ACTIVITY_STRIP_AK_BIN: "/opt/ak/bin/ak" });
  await runtime.refresh();
  assert.equal(calls[0]?.file, "/opt/ak/bin/ak");
});

test("the deferral list is read once per AK_DEFERRED_REFRESH_MS while claims refresh every tick", async () => {
  // Given the full deferral list held the workstation-wide AK lock 3.3 s of every 15 s (AK7943)
  assert.equal(AK_DEFERRED_REFRESH_MS, 300_000);
  let clock = 1_000_000;
  const { exec, calls } = makeExec({ deferred: DEFERRED });
  const { runtime, runtimeStatus, states } = makeOptions(exec, {}, () => clock);
  const reads = () => calls.map((call) => call.args[1]);
  assert.equal(await runtime.refresh(), true);
  for (const step of [AK_TASK_REFRESH_MS, AK_DEFERRED_REFRESH_MS - AK_TASK_REFRESH_MS - 1]) {
    clock += step;
    assert.equal(await runtime.refresh(), true);
    // Then a cached tick still reports the original read and the cached count, never "just read"
    assert.equal(runtimeStatus.akTaskDeferredReadAt, 1_000_000);
    assert.equal(runtimeStatus.akTaskDeferredCount, 1);
  }
  assert.deepEqual(reads(), ["list", "deferred", "list", "list"]);
  assert.deepEqual(states.at(-1)?.deferred, [{ id: 5702, title: "parked", repo: "/repo" }]);
  clock += 1;
  assert.equal(await runtime.refresh(), true);
  assert.deepEqual(reads().slice(4), ["list", "deferred"]);
  assert.equal(runtimeStatus.akTaskDeferredReadAt, clock);
  assert.equal(runtimeStatus.akTaskDeferredMaxAgeMs, AK_DEFERRED_REFRESH_MS);
});

test("a failed deferral read fails closed and is retried on the next tick", async () => {
  for (const failure of [
    { deferred: "<not json>" },
    { deferredError: new Error("ak timed out") },
  ]) {
    let clock = 1_000_000;
    /** @type {Record<string, unknown>} */
    const behavior = { deferred: DEFERRED };
    const { exec, calls } = makeExec(behavior);
    const { runtime, runtimeStatus, states } = makeOptions(exec, {}, () => clock);
    assert.equal(await runtime.refresh(), true);
    clock += AK_DEFERRED_REFRESH_MS;
    Object.assign(behavior, failure);
    assert.equal(await runtime.refresh(), false);
    assert.equal(runtimeStatus.akTaskState, "unavailable");
    assert.deepEqual(states.at(-1), { claims: [], deferred: [] });
    // A failure never leaves the older list standing in for a fresh read.
    Object.assign(behavior, { deferred: DEFERRED, deferredError: undefined });
    clock += AK_TASK_REFRESH_MS;
    assert.equal(await runtime.refresh(), true);
    assert.deepEqual(
      calls.map((call) => call.args[1]),
      ["list", "deferred", "list", "deferred", "list", "deferred"],
    );
  }
});

test("a claim failure fails closed without spending the deferral read and keeps the list", async () => {
  for (const failure of [{ claims: "<not json>" }, { claimsError: new Error("ak timed out") }]) {
    let clock = 1_000_000;
    /** @type {Record<string, unknown>} */
    const behavior = { deferred: DEFERRED };
    const { exec, calls } = makeExec(behavior);
    const { runtime, runtimeStatus, states } = makeOptions(exec, {}, () => clock);
    assert.equal(await runtime.refresh(), true);
    clock += AK_TASK_REFRESH_MS;
    Object.assign(behavior, failure);
    assert.equal(await runtime.refresh(), false);
    assert.equal(runtimeStatus.akTaskState, "unavailable");
    assert.equal(runtimeStatus.akTaskDeferredReadAt, null);
    assert.deepEqual(states.at(-1), { claims: [], deferred: [] });
    Object.assign(behavior, { claims: undefined, claimsError: undefined });
    clock += AK_TASK_REFRESH_MS;
    assert.equal(await runtime.refresh(), true);
    assert.equal(runtimeStatus.akTaskDeferredReadAt, 1_000_000);
    assert.deepEqual(
      calls.map((call) => call.args[1]),
      ["list", "deferred", "list", "list"],
    );
  }
});

test("a live claim newer than the list on a task it holds as deferred rereads the list at once", async () => {
  // Given AK refuses to claim a task with an active deferral, such a claim proves the list stale
  let clock = 1_000_000;
  /** @type {Record<string, unknown>} */
  const behavior = { deferred: DEFERRED };
  const { exec, calls } = makeExec(behavior);
  const { runtime, states } = makeOptions(exec, {}, () => clock);
  assert.equal(await runtime.refresh(), true);
  clock += 20_000;
  // A row both claimed and deferred but claimed before the read (corrupt) does not force reads.
  behavior.claims = claimList([{ id: 5702, claimed_at: new Date(999_000).toISOString() }]);
  assert.equal(await runtime.refresh(), true);
  assert.deepEqual(
    calls.map((call) => call.args[1]),
    ["list", "deferred", "list"],
  );
  // When 5702 is resumed and claimed after the list was read
  behavior.claims = claimList([{ id: 5702, claimed_at: new Date(1_015_000).toISOString() }]);
  behavior.deferred = "[]";
  clock += AK_TASK_REFRESH_MS;
  assert.equal(await runtime.refresh(), true);
  assert.deepEqual(calls.map((call) => call.args[1]).slice(3), ["list", "deferred"]);
  assert.deepEqual(states.at(-1)?.deferred, []);
});

test("a clock that steps back expires the list instead of stretching it", async () => {
  let clock = 1_000_000_000;
  const { exec, calls } = makeExec({ deferred: DEFERRED });
  const { runtime } = makeOptions(exec, {}, () => clock);
  assert.equal(await runtime.refresh(), true);
  clock -= 3_600_000;
  assert.equal(await runtime.refresh(), true);
  assert.deepEqual(
    calls.map((call) => call.args[1]),
    ["list", "deferred", "list", "deferred"],
  );
});

test("the status line names when the deferral list was read and its reuse window", () => {
  const status = (runtime) =>
    formatBrokerRuntimeStatus({
      ok: true,
      runtimeStatus: {
        state: "ready",
        startedAt: 0,
        akTaskState: "ok",
        akTaskClaimCount: 1,
        ...runtime,
      },
    });
  assert.match(
    status({ akTaskDeferredReadAt: 0, akTaskDeferredMaxAgeMs: AK_DEFERRED_REFRESH_MS }),
    /deferral list read 1970-01-01T00:00:00\.000Z, reused up to 300 s/,
  );
  for (const bad of [Number.NaN, 9e15, null]) {
    assert.doesNotMatch(status({ akTaskDeferredReadAt: bad }), /deferral list read/);
  }
});

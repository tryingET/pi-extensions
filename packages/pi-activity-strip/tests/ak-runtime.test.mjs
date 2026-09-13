// ---
// summary: "verifies the AK polling runtime reads only the ak CLI and fails closed"
// read_when:
//   - "changing AK polling, CLI arguments, or fail-closed behavior"
// ---

import assert from "node:assert/strict";
import test from "node:test";
import { createAkTaskRuntime } from "../src/native/ak-runtime.mjs";

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

/** @param {{claims?: string; deferred?: string; error?: Error}} [behavior] */
function makeExec(behavior = {}) {
  const calls = [];
  const exec = async (file, args) => {
    calls.push({ file, args });
    if (behavior.error) throw behavior.error;
    if (args.includes("deferred")) return { stdout: behavior.deferred ?? "[]" };
    return { stdout: behavior.claims ?? claimList([{}]) };
  };
  return { exec, calls };
}

function makeOptions(exec, env = {}) {
  /** @type {import("../src/common/contracts.ts").ActivityStripRuntimeStatus} */
  const runtimeStatus = { state: "starting", startedAt: 0 };
  const states = [];
  const runtime = createAkTaskRuntime({
    execFileAsync: exec,
    env,
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

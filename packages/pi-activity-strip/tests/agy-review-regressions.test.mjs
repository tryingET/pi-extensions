// ---
// summary: "regressions from the AK8809 review: lock holders vs waiters, failed tool steps, stale in-flight rows, failed store reads, stale Nodecode turns, launcher folding"
// read_when:
//   - "changing agy lock binding, agy step state, Nodecode open-turn handling, or launcher folding"
// ---
import assert from "node:assert/strict";
import test from "node:test";
import { AGY_STEP_STATUS, AGY_STEP_TYPE, parseAgySteps } from "../src/common/agy-conversation.mjs";
import { protoNumber, protoString } from "../src/common/protobuf-wire.mjs";
import {
  agyTelemetryForProcess,
  devInodeKey,
  heldLockKeys,
  readAgySteps,
  readAgyTelemetry,
} from "../src/native/agy-discovery.mjs";
import {
  NODECODE_OPEN_TURN_QUIET_MS,
  nodecodeTelemetry,
} from "../src/native/nodecode-discovery.mjs";
import { foldRuntimeLaunchers } from "../src/native/recovery-proc.mjs";

const T0 = 1_795_005_184_000;
/** @param {number} idx @param {number} stepType @param {number} status */
const step = (idx, stepType, status) => ({ idx, stepType, status, metadata: null, payload: null });

test("M1: a process waiting for a presence lock is not its holder, and the device is part of the key", () => {
  const locks = [
    "1: FLOCK  ADVISORY  WRITE 700 00:23:222 0 EOF",
    "1: -> FLOCK  ADVISORY  WRITE 800 00:23:222 0 EOF",
    "2: FLOCK  ADVISORY  WRITE 800 fd:01:222 0 EOF",
    "3: FLOCK  ADVISORY  WRITE 800 garbage 0 EOF",
  ].join("\n");
  assert.deepEqual([...heldLockKeys(locks, 700)], ["0:35:222"]);
  assert.deepEqual([...heldLockKeys(locks, 800)], ["253:1:222"], "the waiter line is skipped");
  // glibc's userspace encoding of 00:23 and fd:01, as stat.dev reports them
  assert.equal(devInodeKey(35, 222), "0:35:222");
  assert.equal(devInodeKey(0xfd01, 222n), "253:1:222");
  assert.notEqual(devInodeKey(0xfd01, 222), devInodeKey(35, 222), "same inode, other filesystem");
});

test("M2: a failed tool step is ordinary work; agy's error message or a failed model step is an error", () => {
  const failedTool = parseAgySteps([
    step(1, AGY_STEP_TYPE.PLANNER_RESPONSE, AGY_STEP_STATUS.DONE),
    step(2, AGY_STEP_TYPE.GENERIC, AGY_STEP_STATUS.ERROR),
  ]);
  assert.equal(failedTool.state, "thinking");
  assert.equal(failedTool.stateIsCurrent, false, "it decays through the liveness window");
  assert.equal(
    parseAgySteps([step(3, AGY_STEP_TYPE.ERROR_MESSAGE, AGY_STEP_STATUS.DONE)]).state,
    "error",
  );
  assert.equal(
    parseAgySteps([step(4, AGY_STEP_TYPE.PLANNER_RESPONSE, AGY_STEP_STATUS.ERROR)]).state,
    "error",
  );
});

test("M3: an in-flight row older than the process that holds the conversation is history", () => {
  const running = { state: "tool", stateIsCurrent: true, toolName: "run_command", lastEventAt: T0 };
  assert.equal(agyTelemetryForProcess(running, T0 - 60_000), running, "written by this process");
  assert.equal(
    agyTelemetryForProcess(running, T0 + 1_000),
    running,
    "within the start-time margin",
  );
  const resumed = agyTelemetryForProcess(running, T0 + 60_000);
  assert.equal(resumed.state, "idle");
  assert.equal(resumed.stateIsCurrent, false);
  assert.equal(resumed.toolName, "");
  const waiting = agyTelemetryForProcess({ ...running, state: "waiting" }, T0 + 60_000);
  assert.equal(waiting.state, "idle", "a question an earlier process asked is not pending now");
  assert.equal(agyTelemetryForProcess(running, 0), running, "unknown process start: unchanged");
  assert.equal(agyTelemetryForProcess({ ...running, lastEventAt: 0 }, T0 + 60_000).state, "tool");
});

test("S1: a failed store read is retried, never cached as an empty conversation", () => {
  assert.equal(readAgySteps("/nonexistent/agy/conversations/x.db"), null);
  assert.equal(readAgySteps(""), null);
  let reads = 0;
  const procfs = {
    readFile: () => "",
    readLink: () => "",
    readDir: () => [],
    statMtimeMs: () => T0,
  };
  const session = {
    conversationId: "c",
    home: "/h",
    databasePath: "/h/conversations/c.db",
    evidence: "presence-lock-held",
  };
  const cache = new Map();
  const failing = () => {
    reads += 1;
    return null;
  };
  readAgyTelemetry(session, procfs, cache, failing);
  readAgyTelemetry(session, procfs, cache, failing);
  assert.equal(reads, 2);
  assert.equal(cache.size, 0);
});

test("M3: a Nodecode open turn quiet past the bound is a leftover, not current work", () => {
  const row = {
    session_id: "s-A",
    turn_id: "t1",
    open_turn: "t1",
    last_event_at: new Date(T0).toISOString(),
  };
  assert.equal(nodecodeTelemetry(row, T0 + 60_000).stateIsCurrent, true);
  const stale = nodecodeTelemetry(row, T0 + NODECODE_OPEN_TURN_QUIET_MS + 1);
  assert.equal(stale.stateIsCurrent, false);
  assert.equal(stale.state, "idle");
});

test("S3: only a Codex launcher folds; a Node-hosted Claude or Pi with a native child of its kind stays", () => {
  const base = { bootId: "b", startTicks: "1", birthMs: 0, pidDomain: "d" };
  const processes = [
    { ...base, pid: 10, ppid: 1, executable: "/usr/bin/node", harness: "claude" },
    { ...base, pid: 11, ppid: 10, executable: "/x/claude", harness: "claude" },
    { ...base, pid: 20, ppid: 1, executable: "/usr/bin/node", harness: "pi" },
    { ...base, pid: 21, ppid: 20, executable: "/x/pi", harness: "pi" },
    { ...base, pid: 30, ppid: 1, executable: "/usr/bin/node", harness: "codex" },
    { ...base, pid: 31, ppid: 30, executable: "/x/vendor/codex/codex", harness: "codex" },
  ];
  assert.equal(foldRuntimeLaunchers(/** @type {any} */ (processes)), 1);
  assert.deepEqual(
    processes.map((p) => `${p.pid}:${p.harness}`),
    ["10:claude", "11:claude", "20:pi", "21:pi", "30:", "31:codex"],
  );
});

test("nit: a singular protobuf field repeated on the wire takes its last value", () => {
  const bytes = Uint8Array.from([0x0a, 1, 0x61, 0x0a, 1, 0x62, 0x10, 1, 0x10, 2]);
  assert.equal(protoString(bytes, [1]), "b");
  assert.equal(protoNumber(bytes, [2]), 2);
});

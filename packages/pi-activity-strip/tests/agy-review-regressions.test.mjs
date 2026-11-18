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
  heldLockInodes,
  lockInode,
  readAgySteps,
  readAgyTelemetry,
  resolveAgySession,
} from "../src/native/agy-discovery.mjs";
import {
  NODECODE_OPEN_TURN_QUIET_MS,
  nodecodeTelemetry,
} from "../src/native/nodecode-discovery.mjs";
import { foldRuntimeLaunchers } from "../src/native/recovery-proc.mjs";

const T0 = 1_795_005_184_000;
/** @param {number} idx @param {number} stepType @param {number} status */
const step = (idx, stepType, status) => ({ idx, stepType, status, metadata: null, payload: null });

test("M1: a process waiting for a presence lock is not its holder; a holder is matched by inode", () => {
  const locks = [
    "1: FLOCK  ADVISORY  WRITE 700 00:23:222 0 EOF",
    "1: -> FLOCK  ADVISORY  WRITE 800 00:23:333 0 EOF",
    "2: FLOCK  ADVISORY  WRITE 800 fd:01:444 0 EOF",
    "3: FLOCK  ADVISORY  WRITE 800 garbage 0 EOF",
  ].join("\n");
  assert.deepEqual([...heldLockInodes(locks, 700)], ["222"]);
  assert.deepEqual([...heldLockInodes(locks, 800)], ["444"], "the waiter line is skipped");
  assert.equal(lockInode(222n), "222");
  assert.equal(lockInode("1046903017"), "1046903017");
});

test("M1 regression: on btrfs /proc/locks names another device than stat, and the flock still binds", () => {
  // live 2026-11-18 on this host: agy pid 3698859 holds presence/d2365b17-….lock; stat dev is
  // 36 (0:36, the subvolume) while /proc/locks says 00:23 (the superblock), inode 1046903017
  const ID = "d2365b17-2ab6-4b23-8d88-2cd00c7324f8";
  const OTHER = "e2373407-0000-4000-8000-000000000000";
  const home = "/home/u/.gemini/antigravity-cli";
  const links = {
    "/proc/3698859/fd/48": `${home}/presence/${ID}.lock`,
    "/proc/3698859/fd/49": `${home}/presence/${OTHER}.lock`,
  };
  const procfs = {
    readFile: () => "",
    readLink: (/** @type {string} */ p) => links[/** @type {keyof typeof links} */ (p)] ?? "",
    readDir: () => ["48", "49"],
    statMtimeMs: () => 0,
  };
  // what fs.statSync(fd, {bigint: true}).ino answers for each descriptor's target
  const inodes = { "/proc/3698859/fd/48": 1046903017n, "/proc/3698859/fd/49": 1046903018n };
  const lockInodeOf = (/** @type {string} */ fd) =>
    lockInode(inodes[/** @type {keyof typeof inodes} */ (fd)] ?? 0n);
  const locks = "161: FLOCK  ADVISORY  WRITE 3698859 00:23:1046903017 0 EOF\n";
  const session = resolveAgySession(3698859, procfs, { locks, lockInodeOf });
  assert.equal(session?.conversationId, ID);
  assert.equal(session?.evidence, "presence-lock-held");
  // a flock on the same inode held by another process does not bind this one
  const foreign = "161: FLOCK  ADVISORY  WRITE 42 00:23:1046903017 0 EOF\n";
  assert.equal(resolveAgySession(3698859, procfs, { locks: foreign, lockInodeOf }), null);
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

import assert from "node:assert/strict";
import { existsSync, mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";
import {
  atomicGroupExists,
  OwnedReaders,
  runCommand,
  scanOwnedGroup,
} from "../src/command-runner.ts";
import { snapshotConfig } from "../src/config.ts";
import { type CollectionPacket, RefreshLifecycle } from "../src/refresh-lifecycle.ts";

const cfg = () => snapshotConfig("/virtual/ai-society/repo", { HOME: "/virtual" });
const fast = (): CollectionPacket => ({
  applicable: true,
  packetTier: "fast",
  fullRefreshStatus: "pending",
  sourceHealth: "not_checked",
});
const full = (health: "healthy" | "degraded"): CollectionPacket => ({
  applicable: true,
  packetTier: "full",
  fullRefreshStatus: "complete",
  sourceHealth: health,
});
const tick = () => new Promise<void>((resolve) => setImmediate(resolve));
const pause = (ms: number) => new Promise<void>((resolve) => setTimeout(resolve, ms));
// Independent fixture oracle: do not use the runner's proc scanner or readProcMember.
function identity(pid: number) {
  try {
    const stat = readFileSync(`/proc/${pid}/stat`, "utf8");
    const fields = stat.slice(stat.lastIndexOf(")") + 2).split(" ");
    return { start: fields[19], state: fields[0] };
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") return undefined;
    throw error;
  }
}
const live = (pid: number, start: string) => {
  const value = identity(pid);
  return value?.start === start && !["Z", "X"].includes(value.state);
};

test("a superseded completed promise cannot erase unresolved ownership; all controller entrypoints stay blocked until proof", async () => {
  let current = cfg();
  let calls = 0;
  let settled = false;
  let release: () => void = () => {};
  const barrier = new Promise<void>((resolve) => {
    release = resolve;
  });
  const resources = new OwnedReaders();
  const lifecycle = new RefreshLifecycle({
    fast,
    resources,
    collect: async (_config, _signal, owned) => {
      calls++;
      if (calls === 1) {
        await barrier;
        owned.retain({ description: "unresolved old generation", isSettled: () => settled });
        return full("degraded");
      }
      return full("healthy");
    },
  });
  const old = lifecycle.request(() => current, true);
  await tick();
  current = snapshotConfig("/virtual/ai-society/replacement", { HOME: "/virtual", AK_DB: "new" });
  const replacement = lifecycle.request(() => current, true);
  release();
  assert.equal(await old, undefined);
  assert.equal((await replacement)?.refreshState, "blocked_cleanup");
  for (let i = 0; i < 3; i++) {
    const blocked = await lifecycle.request(() => current, i % 2 === 0);
    assert.equal(blocked?.packetTier, "fast");
    assert.equal(blocked?.sourceHealth, "degraded");
    assert.equal(blocked?.freshness, "stale");
    assert.equal(blocked?.refreshState, "blocked_cleanup");
  }
  assert.equal(calls, 1);
  lifecycle.restart();
  assert.equal((await lifecycle.request(() => current, true))?.refreshState, "blocked_cleanup");
  await lifecycle.shutdown();
  assert.equal(lifecycle.hasBlockedCleanup(), true);
  lifecycle.restart();
  assert.equal((await lifecycle.request(() => current, true))?.refreshState, "blocked_cleanup");
  assert.equal(calls, 1);
  settled = true;
  assert.equal((await lifecycle.request(() => current, true))?.sourceHealth, "healthy");
  assert.equal(calls, 2);
  await lifecycle.shutdown();
});

test(
  "actual cleanup_failure receipt remains owned after transport promise completes and blocks config/manual/due retry",
  { skip: process.platform !== "linux" },
  async () => {
    let current = cfg();
    let calls = 0;
    let proofAvailable = false;
    let now = 0;
    const lifecycle = new RefreshLifecycle({
      fast,
      now: () => now,
      collect: async (_config, _signal, resources) => {
        calls++;
        if (calls > 1) return full("healthy");
        const result = await runCommand(
          process.execPath,
          ["-e", "process.on('SIGTERM',()=>{});setInterval(()=>{},1000)"],
          {
            resources,
            timeoutMs: 200,
            probeGroup: (group) => {
              const value = identity(group);
              if (!proofAvailable && (!value || ["Z", "X"].includes(value.state)))
                throw new Error("kernel observation unavailable");
              return atomicGroupExists(group);
            },
          },
        );
        assert.equal(result.reason, "cleanup_failure");
        assert.ok(result.unresolvedResource);
        return full("degraded");
      },
    });
    const failed = await lifecycle.request(() => current, true);
    assert.equal(failed?.refreshState, "blocked_cleanup");
    now = 1_000_000;
    assert.equal((await lifecycle.request(() => current))?.refreshState, "blocked_cleanup");
    current = { ...current, fingerprint: "different executable/db/cwd" };
    assert.equal((await lifecycle.request(() => current, true))?.refreshState, "blocked_cleanup");
    assert.equal(calls, 1);
    assert.equal(lifecycle.hasBlockedCleanup(), true);
    proofAvailable = true;
    assert.equal((await lifecycle.request(() => current, true))?.sourceHealth, "healthy");
    assert.equal(calls, 2);
    await lifecycle.shutdown();
  },
);

test(
  "fork/exit handoff plus one empty census still receives TERM and KILL; independent PID/start liveness confirms settlement",
  { skip: process.platform !== "linux" },
  async () => {
    const root = mkdtempSync(join(tmpdir(), "society-fork-exit-"));
    const ready = join(root, "ready");
    const term = join(root, "term");
    let member: { pid: number; start: string } | undefined;
    let pending: ReturnType<typeof runCommand> | undefined;
    try {
      const leaf = `const fs=require('fs');process.on('SIGTERM',()=>fs.writeFileSync(${JSON.stringify(term)},'term'));const f=fs.readFileSync('/proc/self/stat','utf8');fs.writeFileSync(${JSON.stringify(ready)},JSON.stringify({pid:process.pid,start:f.slice(f.lastIndexOf(')')+2).split(' ')[19]}));setInterval(()=>{},1000)`;
      const relay = `require('child_process').spawn(process.execPath,['-e',${JSON.stringify(leaf)}],{stdio:'ignore'});process.exit(0)`;
      const leader = `require('child_process').spawn(process.execPath,['-e',${JSON.stringify(relay)}],{stdio:'ignore'});const t=setInterval(()=>{if(require('fs').existsSync(${JSON.stringify(ready)})){clearInterval(t);process.exit(0)}},5)`;
      let scans = 0;
      pending = runCommand(process.execPath, ["-e", leader], {
        timeoutMs: 2_000,
        scanGroup: (group, start, includeZombies) =>
          ++scans === 1 ? [] : scanOwnedGroup(group, start, includeZombies),
      });
      for (let i = 0; i < 160 && !existsSync(ready); i++) await pause(25);
      assert.ok(existsSync(ready));
      member = JSON.parse(readFileSync(ready, "utf8"));
      assert.ok(member && live(member.pid, member.start));
      const result = await pending;
      assert.equal(result.cleanup, "settled");
      assert.equal(result.ok, true);
      assert.ok(scans > 1);
      assert.ok(existsSync(term), "empty census must not suppress owned-group TERM");
      assert.equal(
        live(member.pid, member.start),
        false,
        "same PID/start must not retain live work after SIGKILL",
      );
    } finally {
      if (member && live(member.pid, member.start)) process.kill(member.pid, "SIGKILL");
      await pending;
      if (member) for (let i = 0; i < 100 && live(member.pid, member.start); i++) await pause(20);
      rmSync(root, { recursive: true, force: true });
    }
  },
);

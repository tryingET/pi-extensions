import assert from "node:assert/strict";
import { existsSync, mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";
import {
  atomicGroupExists,
  readProcMember,
  runCommand,
  scanOwnedGroup,
} from "../src/command-runner.ts";

const pause = (ms: number) => new Promise<void>((resolve) => setTimeout(resolve, ms));
async function marker(file: string): Promise<string> {
  for (let i = 0; i < 160; i++) {
    if (existsSync(file)) return readFileSync(file, "utf8");
    await pause(25);
  }
  throw new Error(`fixture did not become ready: ${file}`);
}
const scratch = () => mkdtempSync(join(tmpdir(), "society-runner-"));

test("transport records success, launch failure, exits and output cap without conflating SIGTERM with timeout", async () => {
  const success = await runCommand(process.execPath, [
    "-e",
    "const b=Buffer.from('€');process.stdout.write(b.subarray(0,1));setTimeout(()=>process.stdout.write(b.subarray(1)),20)",
  ]);
  assert.equal(success.ok, true);
  assert.equal(success.stdout, "€");
  assert.equal(success.cleanup, "settled");
  assert.ok(success.elapsedMs > 0);
  const failed = await runCommand(process.execPath, [
    "-e",
    "process.stdout.write('{}');process.exitCode=17",
  ]);
  assert.equal(failed.reason, "nonzero_exit");
  assert.equal(failed.code, 17);
  const term = await runCommand(process.execPath, ["-e", "process.kill(process.pid,'SIGTERM')"]);
  assert.equal(term.reason, "nonzero_exit");
  assert.equal(term.timedOut, false);
  const launch = await runCommand("/no-such-society-reader", []);
  assert.equal(launch.reason, "launch_failure");
  assert.equal(launch.cleanup, "not_started");
  const flood = await runCommand(process.execPath, [
    "-e",
    "process.stdout.write('x'.repeat(2*1024*1024));setInterval(()=>{},1000)",
  ]);
  assert.equal(flood.reason, "output_limit");
  assert.equal(flood.cleanup, "settled");
});

test("pre-aborted and zero-budget commands never start, active abort preserves deadline provenance", async () => {
  const root = scratch();
  try {
    const file = join(root, "ready");
    const script = `require('fs').writeFileSync(${JSON.stringify(file)},String(process.pid));setInterval(()=>{},1000)`;
    const before = new AbortController();
    before.abort("shutdown");
    assert.equal(
      (await runCommand(process.execPath, ["-e", script], { signal: before.signal })).reason,
      "cancelled",
    );
    assert.equal(
      (await runCommand(process.execPath, ["-e", script], { timeoutMs: 0 })).reason,
      "timeout",
    );
    assert.equal(existsSync(file), false);
    for (const reason of ["shutdown", "refresh_timeout"]) {
      const abort = new AbortController();
      const pending = runCommand(process.execPath, ["-e", script], { signal: abort.signal });
      await marker(file);
      abort.abort(reason);
      const result = await pending;
      assert.equal(result.reason, reason === "refresh_timeout" ? reason : "cancelled");
      assert.equal(result.cleanup, "settled");
      rmSync(file);
    }
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test(
  "Linux TERM leader exit does not skip descendant SIGKILL; another controller is never signalled",
  { skip: process.platform !== "linux" },
  async () => {
    const root = scratch();
    const otherAbort = new AbortController();
    let other: ReturnType<typeof runCommand> | undefined;
    try {
      const unrelated = join(root, "other");
      other = runCommand(
        process.execPath,
        [
          "-e",
          `require('fs').writeFileSync(${JSON.stringify(unrelated)},String(process.pid));setInterval(()=>{},1000)`,
        ],
        { signal: otherAbort.signal },
      );
      const otherPid = Number(await marker(unrelated));
      const ready = join(root, "group");
      const childCode = `process.on('SIGTERM',()=>{});require('fs').writeFileSync(${JSON.stringify(ready)},JSON.stringify({pid:process.pid,group:process.ppid}));setInterval(()=>{},1000)`;
      const leader = `require('child_process').spawn(process.execPath,['-e',${JSON.stringify(childCode)}],{stdio:'ignore'});process.on('SIGTERM',()=>process.exit(0));setInterval(()=>{},1000)`;
      const pending = runCommand(process.execPath, ["-e", leader], { timeoutMs: 800 });
      const owned = JSON.parse(await marker(ready)) as { pid: number; group: number };
      assert.ok(scanOwnedGroup(owned.group).some((member) => member.pid === owned.pid));
      const result = await pending;
      assert.equal(result.reason, "timeout");
      assert.equal(result.cleanup, "settled");
      assert.deepEqual(scanOwnedGroup(owned.group), []);
      const residual = readProcMember(owned.pid);
      assert.ok(!residual || ["Z", "X"].includes(residual.state), "zombie is not a live member");
      assert.ok(
        readProcMember(otherPid) && !["Z", "X"].includes(readProcMember(otherPid)?.state || ""),
      );
      assert.ok(result.elapsedMs >= 1_000, "TERM grace was not skipped after leader exit");
    } finally {
      otherAbort.abort("test_cleanup");
      await other;
      rmSync(root, { recursive: true, force: true });
    }
  },
);

test(
  "cleanup_failure is bounded and distinct when group settlement cannot be established",
  { skip: process.platform !== "linux" },
  async () => {
    const started = performance.now();
    const result = await runCommand(
      process.execPath,
      ["-e", "process.on('SIGTERM',()=>{});setInterval(()=>{},1000)"],
      {
        timeoutMs: 150,
        // Real signals kill the controlled reader; unavailable subsequent kernel proof stays blocked.
        probeGroup: (group) => {
          const member = readProcMember(group);
          if (!member || ["Z", "X"].includes(member.state))
            throw new Error("settlement observation unavailable");
          return atomicGroupExists(group);
        },
      },
    );
    assert.equal(result.reason, "cleanup_failure");
    assert.equal(result.cause, "timeout");
    assert.equal(result.cleanup, "failed");
    assert.ok(result.unresolvedResource);
    assert.throws(() => result.unresolvedResource?.isSettled(), /observation unavailable/);
    assert.ok(performance.now() - started >= 2_400);
    assert.ok(performance.now() - started < 4_000);
  },
);

test(
  "/proc scanner refuses leader PID reuse and ignores zombies",
  { skip: process.platform !== "linux" },
  () => {
    assert.throws(() => scanOwnedGroup(process.pid, "not-the-leader-start-time"), /PID reused/);
  },
);

test(
  "an intentionally escaped session is an explicit process-group containment limitation",
  { skip: process.platform !== "linux" },
  async () => {
    const root = scratch();
    let escaped: ReturnType<typeof readProcMember>;
    try {
      const ready = join(root, "escaped");
      const childCode = `require('fs').writeFileSync(${JSON.stringify(ready)},String(process.pid));process.on('SIGTERM',()=>{});setInterval(()=>{},1000)`;
      const leader = `require('child_process').spawn(process.execPath,['-e',${JSON.stringify(childCode)}],{detached:true,stdio:'ignore'}).unref();setInterval(()=>{},1000)`;
      const pending = runCommand(process.execPath, ["-e", leader], { timeoutMs: 700 });
      escaped = readProcMember(Number(await marker(ready)));
      const result = await pending;
      assert.equal(
        result.cleanup,
        "settled",
        "only the owned group, not escaped sessions, is checked",
      );
      assert.ok(escaped);
      assert.equal(readProcMember(escaped.pid)?.start, escaped.start);
      assert.ok(!["Z", "X"].includes(readProcMember(escaped.pid)?.state || ""));
    } finally {
      if (escaped && readProcMember(escaped.pid)?.start === escaped.start) {
        process.kill(escaped.pid, "SIGKILL");
        for (let i = 0; i < 100; i++) {
          const member = readProcMember(escaped.pid);
          if (!member || ["Z", "X"].includes(member.state)) break;
          await pause(20);
        }
      }
      rmSync(root, { recursive: true, force: true });
    }
  },
);

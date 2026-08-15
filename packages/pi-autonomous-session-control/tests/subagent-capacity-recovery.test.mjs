import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { once } from "node:events";
import { mkdtemp, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";
import { pathToFileURL } from "node:url";
import {
  inspectSharedSubagentCapacity,
  parseLinuxProcessState,
  reserveSharedSubagentCapacity,
} from "../extensions/self/subagent-capacity.ts";
import { processGroupIsQuiescent } from "../extensions/self/subagent-capacity-record.ts";
import { createAscExecutionRuntime } from "../extensions/self/subagent-runtime.ts";
import { getProcessStartTicks, writeSessionStatus } from "../extensions/self/subagent-session.ts";

const DEAD_PID = 2_147_483_647;

function writeRunningStatus(sessionsDir, overrides = {}) {
  writeSessionStatus(sessionsDir, overrides.sessionName ?? "held-review", {
    status: "running",
    pid: overrides.pid ?? process.pid,
    ppid: process.pid,
    pidStartedAt: overrides.pidStartedAt ?? getProcessStartTicks(process.pid),
    pidIdentity: "proc-start-ticks",
    rawChildPid: overrides.rawChildPid,
    rawChildPidStartedAt: overrides.rawChildPidStartedAt,
    rawChildProcessGroupId: overrides.rawChildProcessGroupId,
    createdAt: overrides.createdAt ?? new Date().toISOString(),
    dispatchId: overrides.dispatchId ?? "dispatch-held-review",
    attemptId: overrides.attemptId ?? "attempt-held-review",
    cancelSupported: overrides.cancelSupported ?? true,
    parentRepoRoot: process.cwd(),
    sessionKind: "subagent",
    sessionFile: join(sessionsDir, `${overrides.sessionName ?? "held-review"}.jsonl`),
  });
}

async function leaveDeadOwnerLease(sessionsDir, spawnCommitted) {
  const moduleUrl = pathToFileURL(join(process.cwd(), "extensions/self/subagent-capacity.ts")).href;
  const script = `import { reserveSharedSubagentCapacity } from ${JSON.stringify(moduleUrl)}; const lease = reserveSharedSubagentCapacity(${JSON.stringify(sessionsDir)}, 1, { leaseMetadata: { dispatchId: "dispatch-dead-owner", attemptId: "attempt-dead-owner", sessionName: "dead-owner" } }); if (!lease) process.exit(2); if (${JSON.stringify(spawnCommitted)}) lease.markSpawnCommitted();`;
  const child = spawn(process.execPath, ["--input-type=module", "-e", script], {
    stdio: "ignore",
  });
  const [code] = await once(child, "exit");
  assert.equal(code, 0);
}

async function reserveAfterConclusiveProcSnapshot(sessionsDir) {
  for (let attempt = 0; attempt < 100; attempt += 1) {
    const lease = reserveSharedSubagentCapacity(sessionsDir, 1);
    if (lease) return lease;
    await new Promise((resolve) => setTimeout(resolve, 5));
  }
  return null;
}

test("Linux process-state parsing recognizes zombies even when comm contains spaces", () => {
  assert.equal(parseLinuxProcessState("123 (pi helper worker) Z 1 2 3"), "Z");
  assert.equal(parseLinuxProcessState("123 (pi helper) S 1 2 3"), "S");
  assert.equal(parseLinuxProcessState("malformed"), undefined);
});

test(
  "process-group quiescence fails closed when a listed proc entry disappears",
  { skip: process.platform !== "linux" },
  () => {
    const reads = [];
    const procView = {
      // PID 4100 represents a group member that forked a same-group child and exited
      // after this snapshot. The new child is deliberately absent from the snapshot.
      listEntries: () => ["self", "4100"],
      readStat: (pid) => {
        reads.push(pid);
        const error = new Error("simulated proc churn");
        error.code = "ENOENT";
        throw error;
      },
    };

    assert.equal(processGroupIsQuiescent(7300, procView), false);
    assert.deepEqual(reads, ["4100"]);
  },
);

test("dead owners are reclaimed in the proven pre-spawn no-status phase", async () => {
  const sessionsDir = await mkdtemp(join(tmpdir(), "asc-pre-spawn-dead-owner-"));
  try {
    await leaveDeadOwnerLease(sessionsDir, false);
    const replacement = reserveSharedSubagentCapacity(sessionsDir, 1);
    assert.ok(replacement);
    replacement.release();
  } finally {
    await rm(sessionsDir, { recursive: true, force: true });
  }
});

test("spawn-committed dead owners without custody status remain fail-closed", async () => {
  const sessionsDir = await mkdtemp(join(tmpdir(), "asc-committed-unknown-owner-"));
  try {
    await leaveDeadOwnerLease(sessionsDir, true);
    assert.equal(reserveSharedSubagentCapacity(sessionsDir, 1), null);
  } finally {
    await rm(sessionsDir, { recursive: true, force: true });
  }
});

test(
  "a live parent cannot preserve capacity after its exact helper and raw group are gone",
  { skip: process.platform !== "linux" },
  async () => {
    const sessionsDir = await mkdtemp(join(tmpdir(), "asc-dead-helper-capacity-"));
    let replacement;
    try {
      const lease = reserveSharedSubagentCapacity(sessionsDir, 1, {
        leaseMetadata: {
          dispatchId: "dispatch-dead-helper",
          attemptId: "attempt-dead-helper",
          sessionName: "dead-helper",
        },
      });
      assert.ok(lease);
      writeRunningStatus(sessionsDir, {
        sessionName: "dead-helper",
        dispatchId: "dispatch-dead-helper",
        attemptId: "attempt-dead-helper",
        pid: DEAD_PID,
        pidStartedAt: 0,
        rawChildPid: DEAD_PID,
        rawChildPidStartedAt: 0,
        rawChildProcessGroupId: DEAD_PID,
      });

      replacement = await reserveAfterConclusiveProcSnapshot(sessionsDir);
      assert.ok(replacement);

      // A late release from the stranded owner cannot delete the replacement inode.
      lease.release();
      assert.equal(reserveSharedSubagentCapacity(sessionsDir, 1), null);
    } finally {
      replacement?.release();
      await rm(sessionsDir, { recursive: true, force: true });
    }
  },
);

test(
  "a dead helper cannot release capacity while its detached raw process group is live",
  { skip: process.platform !== "linux" },
  async () => {
    const sessionsDir = await mkdtemp(join(tmpdir(), "asc-live-raw-group-capacity-"));
    const rawChild = spawn(process.execPath, ["-e", "setInterval(() => {}, 1000)"], {
      detached: true,
      stdio: "ignore",
    });
    try {
      assert.equal(typeof rawChild.pid, "number");
      const rawStartedAt = getProcessStartTicks(rawChild.pid);
      assert.equal(typeof rawStartedAt, "number");
      const lease = reserveSharedSubagentCapacity(sessionsDir, 1, {
        leaseMetadata: {
          dispatchId: "dispatch-live-raw",
          attemptId: "attempt-live-raw",
          sessionName: "live-raw",
        },
      });
      assert.ok(lease);
      writeRunningStatus(sessionsDir, {
        sessionName: "live-raw",
        dispatchId: "dispatch-live-raw",
        attemptId: "attempt-live-raw",
        pid: DEAD_PID,
        pidStartedAt: 0,
        rawChildPid: rawChild.pid,
        rawChildPidStartedAt: rawStartedAt,
        rawChildProcessGroupId: rawChild.pid,
      });

      assert.equal(reserveSharedSubagentCapacity(sessionsDir, 1), null);
      lease.release();
    } finally {
      if (rawChild.exitCode === null && rawChild.signalCode === null) {
        process.kill(-rawChild.pid, "SIGKILL");
        await once(rawChild, "exit");
      }
      await rm(sessionsDir, { recursive: true, force: true });
    }
  },
);

test("an exact live helper keeps its lease fail-closed", async () => {
  const sessionsDir = await mkdtemp(join(tmpdir(), "asc-live-helper-capacity-"));
  try {
    const lease = reserveSharedSubagentCapacity(sessionsDir, 1, {
      leaseMetadata: {
        dispatchId: "dispatch-live-helper",
        attemptId: "attempt-live-helper",
        sessionName: "live-helper",
      },
    });
    assert.ok(lease);
    writeRunningStatus(sessionsDir, {
      sessionName: "live-helper",
      dispatchId: "dispatch-live-helper",
      attemptId: "attempt-live-helper",
    });

    assert.equal(reserveSharedSubagentCapacity(sessionsDir, 1), null);
    lease.release();
  } finally {
    await rm(sessionsDir, { recursive: true, force: true });
  }
});

test(
  "an exact terminal sidecar is reclaimable only after its raw group is quiescent",
  { skip: process.platform !== "linux" },
  async () => {
    const sessionsDir = await mkdtemp(join(tmpdir(), "asc-terminal-status-capacity-"));
    let replacement;
    try {
      const lease = reserveSharedSubagentCapacity(sessionsDir, 1, {
        leaseMetadata: {
          dispatchId: "dispatch-terminal",
          attemptId: "attempt-terminal",
          sessionName: "terminal",
        },
      });
      assert.ok(lease);
      writeRunningStatus(sessionsDir, {
        sessionName: "terminal",
        dispatchId: "dispatch-terminal",
        attemptId: "attempt-terminal",
        rawChildPid: DEAD_PID,
        rawChildPidStartedAt: 0,
        rawChildProcessGroupId: DEAD_PID,
      });
      const status = JSON.parse(await readFile(join(sessionsDir, "terminal.status.json"), "utf8"));
      const { sessionName: _sessionName, updatedAt: _updatedAt, ...terminal } = status;
      writeSessionStatus(sessionsDir, "terminal", { ...terminal, status: "done" });

      replacement = await reserveAfterConclusiveProcSnapshot(sessionsDir);
      assert.ok(replacement);
      lease.release();
      assert.equal(reserveSharedSubagentCapacity(sessionsDir, 1), null);
    } finally {
      replacement?.release();
      await rm(sessionsDir, { recursive: true, force: true });
    }
  },
);

test("rate-limit diagnostics identify bounded repository-scoped holders without lease tokens", async () => {
  const sessionsDir = await mkdtemp(join(tmpdir(), "asc-capacity-diagnostics-"));
  try {
    const lease = reserveSharedSubagentCapacity(sessionsDir, 1, {
      leaseMetadata: {
        dispatchId: "dispatch-visible-holder",
        attemptId: "attempt-visible-holder",
        sessionName: "visible-holder",
      },
    });
    assert.ok(lease);
    writeRunningStatus(sessionsDir, {
      sessionName: "visible-holder",
      dispatchId: "dispatch-visible-holder",
      attemptId: "attempt-visible-holder",
    });

    const holders = inspectSharedSubagentCapacity(sessionsDir, 1);
    assert.equal(holders.length, 1);
    assert.equal(holders[0].sessionName, "visible-holder");
    assert.equal(holders[0].helperPid, process.pid);
    assert.equal(holders[0].stale, false);
    assert.doesNotMatch(JSON.stringify(holders), /token/);

    const runtime = createAscExecutionRuntime({
      sessionsDir,
      maxConcurrent: 1,
      modelProvider: () => "test/model",
      spawner: async () => assert.fail("capacity denial must happen before spawn"),
    });
    const result = await runtime.execute(
      { profile: "reviewer", objective: "Should fail before spawn" },
      { cwd: process.cwd(), sessionKey: "diagnostic-parent" },
    );

    assert.equal(result.ok, false);
    assert.equal(result.details.failureKind, "rate_limited");
    assert.equal(result.details.capacityScope, "repository_sessions_dir");
    assert.equal(result.details.capacityHolders[0].sessionName, "visible-holder");
    assert.match(result.text, /Blocking holders: slot=0 session=visible-holder/);
    assert.doesNotMatch(result.text, /Maximum concurrent subagents reached across Pi processes/);
    lease.release();
  } finally {
    await rm(sessionsDir, { recursive: true, force: true });
  }
});

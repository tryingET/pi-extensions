import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { once } from "node:events";
import { link, mkdtemp, readFile, rm, unlink, utimes, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";
import { pathToFileURL } from "node:url";
import {
  acquireSharedSubagentCapacityTransition,
  inspectSharedSubagentCapacity,
  parseLinuxProcessState,
  reserveSharedSubagentCapacity,
} from "../extensions/self/subagent-capacity.ts";
import {
  readSubagentCapacityCustody,
  writeSubagentCapacityCustody,
} from "../extensions/self/subagent-capacity-custody.ts";
import {
  getCapacityCustodyBinding,
  getCapacityPath,
  getCapacitySpawnCommittedPath,
  processGroupIsQuiescent,
  readCapacityLease,
} from "../extensions/self/subagent-capacity-record.ts";
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
  const script = `import { reserveSharedSubagentCapacity } from ${JSON.stringify(moduleUrl)}; const lease = reserveSharedSubagentCapacity(${JSON.stringify(sessionsDir)}, 1, { leaseMetadata: { dispatchId: "dispatch-dead-owner", attemptId: "attempt-dead-owner", sessionName: "dead-owner", custodyMode: "helper_owned" } }); if (!lease) process.exit(2); if (${JSON.stringify(spawnCommitted)}) lease.markSpawnCommitted();`;
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
  "process-group quiescence uses one kernel group probe and only ESRCH proves absence",
  { skip: process.platform !== "linux" },
  () => {
    let probes = 0;
    assert.equal(
      processGroupIsQuiescent(7300, {
        signalZero: () => {
          probes += 1;
          const error = new Error("missing group");
          error.code = "ESRCH";
          throw error;
        },
      }),
      true,
    );
    assert.equal(probes, 1);

    for (const code of ["EPERM", "EACCES"]) {
      assert.equal(
        processGroupIsQuiescent(7300, {
          signalZero: () => {
            const error = new Error("inconclusive group probe");
            error.code = code;
            throw error;
          },
        }),
        false,
      );
    }
    assert.equal(processGroupIsQuiescent(7300, { signalZero: () => undefined }), false);
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

test("shared capacity limit cannot be expanded by a later runtime", async () => {
  const sessionsDir = await mkdtemp(join(tmpdir(), "asc-shared-capacity-limit-"));
  try {
    const lease = reserveSharedSubagentCapacity(sessionsDir, 1);
    assert.ok(lease);
    assert.equal(reserveSharedSubagentCapacity(sessionsDir, 2), null);
    lease.release();
    assert.equal(
      reserveSharedSubagentCapacity(sessionsDir, 2),
      null,
      "the repository session root retains its first immutable shared limit",
    );
  } finally {
    await rm(sessionsDir, { recursive: true, force: true });
  }
});

test("stale takeover and helper start transition are mutually exclusive", async () => {
  const sessionsDir = await mkdtemp(join(tmpdir(), "asc-capacity-start-fence-"));
  try {
    await leaveDeadOwnerLease(sessionsDir, false);
    const observed = readCapacityLease(getCapacityPath(sessionsDir, 0), 0);
    assert.ok(observed);
    const binding = getCapacityCustodyBinding(sessionsDir, observed);
    assert.ok(binding);

    let transitionDuringTakeover;
    const replacement = reserveSharedSubagentCapacity(sessionsDir, 1, {
      afterStaleLeaseClaim() {
        transitionDuringTakeover = acquireSharedSubagentCapacityTransition(binding);
      },
    });
    assert.equal(transitionDuringTakeover, null);
    assert.ok(replacement);
    replacement.release();
  } finally {
    await rm(sessionsDir, { recursive: true, force: true });
  }
});

test("helper-written custody closes the parent transport window", async () => {
  const sessionsDir = await mkdtemp(join(tmpdir(), "asc-helper-custody-"));
  let replacement;
  try {
    const lease = reserveSharedSubagentCapacity(sessionsDir, 1, {
      leaseMetadata: {
        dispatchId: "dispatch-helper-custody",
        attemptId: "attempt-helper-custody",
        sessionName: "helper-custody",
        custodyMode: "helper_owned",
      },
    });
    assert.ok(lease?.custodyBinding);
    lease.markSpawnCommitted();
    writeSubagentCapacityCustody(lease.custodyBinding, {
      helperPid: DEAD_PID,
      helperPidStartedAt: 0,
      rawChildPid: DEAD_PID,
      rawChildPidStartedAt: 0,
      rawChildProcessGroupId: DEAD_PID,
    });

    replacement = reserveSharedSubagentCapacity(sessionsDir, 1);
    assert.ok(replacement);
  } finally {
    replacement?.release();
    await rm(sessionsDir, { recursive: true, force: true });
  }
});

test("helper custody is immutable under duplicate publication", async () => {
  const sessionsDir = await mkdtemp(join(tmpdir(), "asc-immutable-helper-custody-"));
  try {
    const lease = reserveSharedSubagentCapacity(sessionsDir, 1, {
      leaseMetadata: {
        dispatchId: "dispatch-immutable-custody",
        attemptId: "attempt-immutable-custody",
        sessionName: "immutable-custody",
        custodyMode: "helper_owned",
      },
    });
    assert.ok(lease?.custodyBinding);
    writeSubagentCapacityCustody(lease.custodyBinding, {
      helperPid: DEAD_PID,
      helperPidStartedAt: 1,
      rawChildPid: DEAD_PID,
      rawChildPidStartedAt: 2,
      rawChildProcessGroupId: DEAD_PID,
    });

    assert.throws(
      () =>
        writeSubagentCapacityCustody(lease.custodyBinding, {
          helperPid: DEAD_PID - 1,
          helperPidStartedAt: 3,
          rawChildPid: DEAD_PID - 1,
          rawChildPidStartedAt: 4,
          rawChildProcessGroupId: DEAD_PID - 1,
        }),
      { code: "EEXIST" },
    );
    const retained = readSubagentCapacityCustody(lease.custodyBinding);
    assert.equal(retained?.rawChildPid, DEAD_PID);
    lease.release({ confirmedNoEffects: true });
  } finally {
    await rm(sessionsDir, { recursive: true, force: true });
  }
});

test("oversized writer metadata remains readable and cannot bypass the hard cap", async () => {
  const sessionsDir = await mkdtemp(join(tmpdir(), "asc-bounded-capacity-metadata-"));
  try {
    const lease = reserveSharedSubagentCapacity(sessionsDir, 1, {
      leaseMetadata: {
        dispatchId: "dispatch-bounded",
        attemptId: "attempt-bounded",
        sessionName: "x".repeat(1_000),
      },
    });
    assert.ok(lease);
    const payload = readCapacityLease(getCapacityPath(sessionsDir, 0), 0);
    assert.equal(payload?.sessionName?.length, 240);
    assert.equal(reserveSharedSubagentCapacity(sessionsDir, 1), null);
    lease.release();
  } finally {
    await rm(sessionsDir, { recursive: true, force: true });
  }
});

test("malformed effect-bearing capacity leases never become reclaimable by age", async () => {
  const sessionsDir = await mkdtemp(join(tmpdir(), "asc-malformed-capacity-"));
  try {
    const path = getCapacityPath(sessionsDir, 0);
    await writeFile(path, "{malformed", { mode: 0o600 });
    const old = new Date(Date.now() - 60_000);
    await utimes(path, old, old);
    assert.equal(reserveSharedSubagentCapacity(sessionsDir, 1), null);
    const holders = inspectSharedSubagentCapacity(sessionsDir, 1);
    assert.equal(holders.length, 1);
    assert.equal(holders[0].unreadable, true);
    assert.equal(holders[0].stale, false);
  } finally {
    await rm(sessionsDir, { recursive: true, force: true });
  }
});
test("failed exact lease release preserves its spawn marker", async () => {
  const sessionsDir = await mkdtemp(join(tmpdir(), "asc-release-marker-race-"));
  try {
    const lease = reserveSharedSubagentCapacity(sessionsDir, 1, {
      leaseMetadata: {
        dispatchId: "dispatch-release-race",
        attemptId: "attempt-release-race",
        sessionName: "release-race",
      },
    });
    assert.ok(lease);
    lease.markSpawnCommitted();
    const capacityPath = getCapacityPath(sessionsDir, 0);
    const payload = readCapacityLease(capacityPath, 0);
    assert.ok(payload);
    const markerPath = getCapacitySpawnCommittedPath(sessionsDir, payload);
    const contenderPath = `${capacityPath}.simulated-contender`;
    await link(capacityPath, contenderPath);

    assert.equal(lease.release({ confirmedNoEffects: true }), false);
    assert.equal(await readFile(markerPath, "utf8").then(() => true), true);
    await unlink(contenderPath);
    assert.equal(lease.release({ confirmedNoEffects: true }), true);
    await assert.rejects(readFile(markerPath, "utf8"), { code: "ENOENT" });
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
    let lease;
    try {
      assert.equal(typeof rawChild.pid, "number");
      const rawStartedAt = getProcessStartTicks(rawChild.pid);
      assert.equal(typeof rawStartedAt, "number");
      lease = reserveSharedSubagentCapacity(sessionsDir, 1, {
        leaseMetadata: {
          dispatchId: "dispatch-live-raw",
          attemptId: "attempt-live-raw",
          sessionName: "live-raw",
        },
      });
      assert.ok(lease?.custodyBinding);
      lease.markSpawnCommitted();
      writeSubagentCapacityCustody(lease.custodyBinding, {
        helperPid: DEAD_PID,
        helperPidStartedAt: 0,
        rawChildPid: rawChild.pid,
        rawChildPidStartedAt: rawStartedAt,
        rawChildProcessGroupId: rawChild.pid,
      });
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
      assert.equal(lease.release(), false);
    } finally {
      if (rawChild.exitCode === null && rawChild.signalCode === null) {
        process.kill(-rawChild.pid, "SIGKILL");
        await once(rawChild, "exit");
      }
      assert.equal(lease?.release(), true);
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
        pid: DEAD_PID,
        pidStartedAt: 0,
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
      customSpawnerCapacityOwnership: "parent_owned",
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

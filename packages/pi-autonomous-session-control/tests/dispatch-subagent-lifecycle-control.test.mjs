import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { EventEmitter, once } from "node:events";
import { unlinkSync } from "node:fs";
import { link, mkdtemp, readdir, readFile, rm, unlink, utimes, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";
import { pathToFileURL } from "node:url";
import { getContextRepoRoot } from "../extensions/self/session-context.ts";
import { reserveSharedSubagentCapacity } from "../extensions/self/subagent-capacity.ts";
import {
  cancelSubagentDispatch,
  getSubagentCancelRequestPath,
} from "../extensions/self/subagent-control.ts";
import { createAscExecutionRuntime } from "../extensions/self/subagent-runtime.ts";
import {
  createSubagentState,
  getProcessStartTicks,
  writeSessionStatus,
} from "../extensions/self/subagent-session.ts";
import { spawnSubagentWithSpawn } from "../extensions/self/subagent-spawn.ts";

const MODERN_HANDSHAKE = `${JSON.stringify({
  type: "transport_ready",
  settlementMode: "agent_settled",
  piVersion: "0.80.6",
})}\n`;

async function withEnv(overrides, run) {
  const previous = new Map();
  for (const [key, value] of Object.entries(overrides)) {
    previous.set(key, process.env[key]);
    if (value === undefined) delete process.env[key];
    else process.env[key] = value;
  }
  try {
    return await run();
  } finally {
    for (const [key, value] of previous) {
      if (value === undefined) delete process.env[key];
      else process.env[key] = value;
    }
  }
}

function doneResult(output = "ok") {
  return { output, exitCode: 0, elapsed: 25, status: "done" };
}

test("non-git working directories retain distinct repository ownership identities", async () => {
  const first = await mkdtemp(join(tmpdir(), "asc-non-git-owner-a-"));
  const second = await mkdtemp(join(tmpdir(), "asc-non-git-owner-b-"));
  try {
    assert.equal(getContextRepoRoot({ cwd: first }), first);
    assert.equal(getContextRepoRoot({ cwd: second }), second);
    assert.notEqual(getContextRepoRoot({ cwd: first }), getContextRepoRoot({ cwd: second }));
  } finally {
    await rm(first, { recursive: true, force: true });
    await rm(second, { recursive: true, force: true });
  }
});

test("runtime forwards the typed task contract, thinking, progress, usage, and effective-model extension selection", async () => {
  const sessionsDir = await mkdtemp(join(tmpdir(), "asc-dispatch-contract-"));
  const extensionDir = await mkdtemp(join(tmpdir(), "asc-dispatch-extension-"));
  const extensionPath = join(extensionDir, "multi-sub.ts");
  await writeFile(extensionPath, "export default () => {};\n");
  let capturedDef;
  const updates = [];

  try {
    await withEnv({ PI_MULTI_PASS_EXTENSION: extensionPath }, async () => {
      const runtime = createAscExecutionRuntime({
        sessionsDir,
        modelProvider: () => ({
          requestedModel: "anthropic/claude-test",
          effectiveModel: "openai-codex-2/gpt-test",
          source: "fallback",
        }),
        spawner: async (def, _model, _ctx, _state, _signal, onProgress) => {
          capturedDef = def;
          onProgress?.({
            phase: "running",
            elapsedMs: 1250,
            lastActivityAt: 123456,
            outputChars: 10,
            latestTool: "read",
            usage: {
              turns: 2,
              input: 100,
              output: 20,
              cacheRead: 5,
              cacheWrite: 1,
              cost: 0.01,
              contextTokens: 120,
            },
          });
          return doneResult("contract ok");
        },
      });

      const result = await runtime.execute(
        {
          profile: "custom",
          objective: "Implement the bounded slice",
          systemPrompt: "Follow repository policy.",
          thinking: "high",
          startupTimeout: 12,
          deliverable: "A verified patch",
          acceptanceCriteria: ["Focused tests pass"],
          constraints: ["Preserve public parity"],
          evidenceRequired: ["Test command"],
          mutationPolicy: "bounded_mutation",
          stopConditions: ["Owner boundary changes"],
          allowedPaths: ["packages/pi-autonomous-session-control/**"],
          forbiddenPaths: ["packages/pi-society-orchestrator/**"],
        },
        {
          cwd: process.cwd(),
          model: { provider: "anthropic", id: "claude-test" },
        },
        (update) => updates.push(update),
      );

      assert.equal(result.ok, true);
      assert.equal(capturedDef.thinking, "high");
      assert.equal(capturedDef.startupTimeout, 12_000);
      assert.deepEqual(capturedDef.extensionSources, [extensionPath]);
      assert.equal(capturedDef.taskContract.deliverable, "A verified patch");
      assert.deepEqual(capturedDef.taskContract.acceptanceCriteria, ["Focused tests pass"]);
      assert.deepEqual(capturedDef.taskContract.constraints, ["Preserve public parity"]);
      assert.deepEqual(capturedDef.taskContract.evidenceRequired, ["Test command"]);
      assert.equal(capturedDef.taskContract.mutationPolicy, "bounded_mutation");
      assert.deepEqual(capturedDef.taskContract.stopConditions, ["Owner boundary changes"]);
      assert.deepEqual(capturedDef.taskContract.allowedPaths, [
        "packages/pi-autonomous-session-control/**",
      ]);
      assert.deepEqual(capturedDef.taskContract.forbiddenPaths, [
        "packages/pi-society-orchestrator/**",
      ]);
      assert.match(capturedDef.systemPrompt, /DISPATCH TASK CONTRACT/);
      assert.match(capturedDef.systemPrompt, /packages\/pi-society-orchestrator\/\*\*/);
      assert.equal(updates.length, 2);
      assert.equal(updates[1].details.status, "running");
      assert.equal(updates[1].details.progressPhase, "running");
      assert.equal(updates[1].details.latestTool, "read");
      assert.equal(updates[1].details.usage.input, 100);
      assert.equal(result.details.effectiveModel, "openai-codex-2/gpt-test");
    });
  } finally {
    await rm(sessionsDir, { recursive: true, force: true });
    await rm(extensionDir, { recursive: true, force: true });
  }
});

test("profile thinking defaults remain distinct and explicit request thinking wins", async () => {
  const sessionsDir = await mkdtemp(join(tmpdir(), "asc-dispatch-thinking-"));
  const defs = [];
  const runtime = createAscExecutionRuntime({
    sessionsDir,
    modelProvider: () => "test/model",
    spawner: async (def) => {
      defs.push(def);
      return doneResult();
    },
  });

  try {
    await runtime.execute(
      { profile: "explorer", objective: "Explore defaults" },
      { cwd: process.cwd() },
    );
    await runtime.execute(
      { profile: "minimal", objective: "Use minimal defaults" },
      { cwd: process.cwd() },
    );
    await runtime.execute(
      { profile: "explorer", objective: "Override defaults", thinking: "max" },
      { cwd: process.cwd() },
    );
    assert.deepEqual(
      defs.map((def) => def.thinking),
      ["low", "off", "max"],
    );
  } finally {
    await rm(sessionsDir, { recursive: true, force: true });
  }
});

test("unlimited execution requires both request and host opt-in while startup stays bounded", async () => {
  const sessionsDir = await mkdtemp(join(tmpdir(), "asc-dispatch-unlimited-"));
  let capturedDef;
  const runtime = createAscExecutionRuntime({
    sessionsDir,
    modelProvider: () => "test/model",
    spawner: async (def) => {
      capturedDef = def;
      return doneResult();
    },
  });

  try {
    await withEnv({ PI_SUBAGENT_ALLOW_UNLIMITED_TIMEOUT: undefined }, async () => {
      const rejected = await runtime.execute(
        {
          profile: "reviewer",
          objective: "Review without an execution deadline",
          timeout: 0,
          allowUnlimited: true,
        },
        { cwd: process.cwd() },
      );
      assert.equal(rejected.ok, false);
      assert.equal(rejected.details.reason, "unlimited_timeout_policy_failed");
      assert.equal(capturedDef, undefined);
    });

    await withEnv({ PI_SUBAGENT_ALLOW_UNLIMITED_TIMEOUT: "true" }, async () => {
      const accepted = await runtime.execute(
        {
          profile: "reviewer",
          objective: "Review without an execution deadline",
          timeout: 0,
          allowUnlimited: true,
          startupTimeout: 9,
        },
        { cwd: process.cwd() },
      );
      assert.equal(accepted.ok, true);
      assert.equal(capturedDef.timeout, 0);
      assert.equal(capturedDef.startupTimeout, 9_000);
    });
  } finally {
    await rm(sessionsDir, { recursive: true, force: true });
  }
});

test("resume requires one exact owned dispatch id and reuses only its canonical JSONL", async () => {
  const sessionsDir = await mkdtemp(join(tmpdir(), "asc-dispatch-resume-"));
  const defs = [];
  const runtime = createAscExecutionRuntime({
    sessionsDir,
    modelProvider: () => "test/model",
    spawner: async (def) => {
      defs.push(def);
      return doneResult(def.resumed ? "resumed" : "initial");
    },
  });
  const ownerCtx = { cwd: process.cwd(), sessionKey: "parent-session-1" };

  try {
    const first = await runtime.execute(
      { profile: "reviewer", objective: "Review once", name: "owned-review" },
      ownerCtx,
    );
    assert.equal(first.ok, true);
    await writeFile(first.details.sessionFile, "{}\n");
    assert.match(first.text, new RegExp(`Dispatch ID: ${first.details.dispatchId}`));
    assert.match(
      first.text,
      new RegExp(`resumeDispatchId=${JSON.stringify(first.details.dispatchId)}`),
    );
    assert.ok(first.text.indexOf("Dispatch ID:") < first.text.indexOf("initial"));

    const resumed = await runtime.execute(
      {
        profile: "reviewer",
        objective: "Continue the review",
        resumeDispatchId: first.details.dispatchId,
      },
      ownerCtx,
    );
    assert.equal(resumed.ok, true);
    assert.equal(resumed.details.dispatchId, first.details.dispatchId);
    assert.notEqual(resumed.details.attemptId, first.details.attemptId);
    assert.equal(resumed.details.resumed, true);
    assert.equal(defs[1].sessionFile, defs[0].sessionFile);

    const statusPath = join(sessionsDir, "owned-review.status.json");
    const ownedStatus = JSON.parse(await readFile(statusPath, "utf8"));
    const { sessionName: _sessionName, updatedAt: _updatedAt, ...statusPayload } = ownedStatus;
    const legacyDispatchId = "asc-legacy-owned-dispatch:reviewer_1";
    writeSessionStatus(sessionsDir, "owned-review", {
      ...statusPayload,
      dispatchId: legacyDispatchId,
    });
    const legacyResumed = await runtime.execute(
      {
        profile: "reviewer",
        objective: "Continue an exactly owned legacy dispatch",
        resumeDispatchId: legacyDispatchId,
      },
      ownerCtx,
    );
    assert.equal(legacyResumed.ok, true);
    assert.equal(legacyResumed.details.dispatchId, legacyDispatchId);
    assert.match(legacyResumed.text, new RegExp(`Dispatch ID: ${legacyDispatchId}`));
    writeSessionStatus(sessionsDir, "owned-review", statusPayload);

    const rejected = await runtime.execute(
      {
        profile: "reviewer",
        objective: "Cross-session resume",
        resumeDispatchId: first.details.dispatchId,
      },
      { cwd: process.cwd(), sessionKey: "different-parent-session" },
    );
    assert.equal(rejected.ok, false);
    assert.equal(rejected.details.reason, "resume_rejected");
    assert.match(rejected.text, /different parent session/);

    const wrongRepo = await runtime.execute(
      {
        profile: "reviewer",
        objective: "Cross-repository resume",
        resumeDispatchId: first.details.dispatchId,
      },
      { cwd: "/tmp", sessionKey: "parent-session-1" },
    );
    assert.equal(wrongRepo.ok, false);
    assert.match(wrongRepo.text, /different repository/);

    const { parentRepoRoot: _parentRepoRoot, ...unownedPayload } = statusPayload;
    writeSessionStatus(sessionsDir, "owned-review", unownedPayload);
    const unowned = await runtime.execute(
      {
        profile: "reviewer",
        objective: "Resume without owner metadata",
        resumeDispatchId: first.details.dispatchId,
      },
      ownerCtx,
    );
    assert.equal(unowned.ok, false);
    assert.match(unowned.text, /lacks verifiable repository ownership/);

    const { parentSessionKey: _parentSessionKey, ...sessionlessPayload } = statusPayload;
    writeSessionStatus(sessionsDir, "owned-review", sessionlessPayload);
    const sessionless = await runtime.execute(
      {
        profile: "reviewer",
        objective: "Resume without parent session metadata",
        resumeDispatchId: first.details.dispatchId,
      },
      ownerCtx,
    );
    assert.equal(sessionless.ok, false);
    assert.match(sessionless.text, /lacks verifiable parent session ownership/);

    writeSessionStatus(sessionsDir, "owned-review", {
      ...statusPayload,
      status: "running",
      pid: process.pid,
      pidStartedAt: getProcessStartTicks(process.pid),
      pidIdentity: "proc-start-ticks",
    });
    const stillRunning = await runtime.execute(
      {
        profile: "reviewer",
        objective: "Resume a live dispatch",
        resumeDispatchId: first.details.dispatchId,
      },
      ownerCtx,
    );
    assert.equal(stillRunning.ok, false);
    assert.match(stillRunning.text, /still running/);

    writeSessionStatus(sessionsDir, "owned-review", statusPayload);
    await rm(first.details.sessionFile);
    const missingTrace = await runtime.execute(
      {
        profile: "reviewer",
        objective: "Resume without canonical trace",
        resumeDispatchId: first.details.dispatchId,
      },
      ownerCtx,
    );
    assert.equal(missingTrace.ok, false);
    assert.match(missingTrace.text, /no canonical resumable JSONL/);
    await writeFile(first.details.sessionFile, "{}\n");

    writeSessionStatus(sessionsDir, "duplicate-owned-review", {
      ...statusPayload,
      sessionFile: join(sessionsDir, "duplicate-owned-review.jsonl"),
    });
    await writeFile(join(sessionsDir, "duplicate-owned-review.jsonl"), "{}\n");
    const ambiguous = await runtime.execute(
      {
        profile: "reviewer",
        objective: "Resume ambiguous dispatch",
        resumeDispatchId: first.details.dispatchId,
      },
      ownerCtx,
    );
    assert.equal(ambiguous.ok, false);
    assert.match(ambiguous.text, /ambiguous/);
  } finally {
    await rm(sessionsDir, { recursive: true, force: true });
  }
});

test("custom spawner sidecars cannot cancel the parent Pi process", async () => {
  const sessionsDir = await mkdtemp(join(tmpdir(), "asc-dispatch-custom-cancel-"));
  let release;
  const gate = new Promise((resolve) => {
    release = resolve;
  });
  const runtime = createAscExecutionRuntime({
    sessionsDir,
    modelProvider: () => "test/model",
    spawner: async () => {
      await gate;
      return doneResult();
    },
  });
  const ctx = { cwd: process.cwd(), sessionKey: "parent-session-cancel" };

  try {
    const pending = runtime.execute(
      { profile: "reviewer", objective: "Hold for cancellation", name: "custom-held" },
      ctx,
    );
    await new Promise((resolve) => setTimeout(resolve, 10));
    const status = JSON.parse(await readFile(join(sessionsDir, "custom-held.status.json"), "utf8"));
    const cancellation = runtime.cancel(status.dispatchId, ctx, "test cancellation");
    assert.equal(cancellation.ok, false);
    assert.equal(cancellation.status, "not_live");
    assert.match(cancellation.error, /does not expose a signal-safe child process owner/);
    release();
    assert.equal((await pending).ok, true);
  } finally {
    release?.();
    await rm(sessionsDir, { recursive: true, force: true });
  }
});

test("shared capacity leases fail closed until the exact holder releases", async () => {
  const sessionsDir = await mkdtemp(join(tmpdir(), "asc-dispatch-capacity-"));
  try {
    const first = reserveSharedSubagentCapacity(sessionsDir, 1);
    assert.ok(first);
    assert.equal(reserveSharedSubagentCapacity(sessionsDir, 1), null);
    await unlink(join(sessionsDir, ".asc-subagent-capacity-0.lock"));
    const replacement = reserveSharedSubagentCapacity(sessionsDir, 1);
    assert.ok(replacement);
    first.release();
    assert.equal(reserveSharedSubagentCapacity(sessionsDir, 1), null);
    replacement.release();
  } finally {
    await rm(sessionsDir, { recursive: true, force: true });
  }
});

test("fresh malformed capacity locks fail closed and only age-bounded stale locks are reclaimed", async () => {
  const sessionsDir = await mkdtemp(join(tmpdir(), "asc-dispatch-malformed-capacity-"));
  const lockPath = join(sessionsDir, ".asc-subagent-capacity-0.lock");
  try {
    await writeFile(
      lockPath,
      JSON.stringify({
        kind: "asc.subagent_capacity_lease.v1",
        slot: 0,
        pid: process.pid,
        pidStartedAt: 0.5,
        token: "partial-owner",
        createdAt: new Date().toISOString(),
      }),
    );
    assert.equal(reserveSharedSubagentCapacity(sessionsDir, 1), null);
    const staleTime = new Date(Date.now() - 10_000);
    await utimes(lockPath, staleTime, staleTime);
    const reclaimed = reserveSharedSubagentCapacity(sessionsDir, 1);
    assert.ok(reclaimed);
    reclaimed.release();
    await writeFile(
      lockPath,
      JSON.stringify({
        kind: "asc.subagent_capacity_lease.v1",
        slot: 0,
        pid: process.pid,
        token: "missing-process-start-owner",
        createdAt: new Date().toISOString(),
      }),
    );
    assert.equal(reserveSharedSubagentCapacity(sessionsDir, 1), null);
  } finally {
    await rm(sessionsDir, { recursive: true, force: true });
  }
});

test("stale lease takeover cannot unlink a replacement interposed after observation", async () => {
  const sessionsDir = await mkdtemp(join(tmpdir(), "asc-dispatch-takeover-replacement-"));
  const lockPath = join(sessionsDir, ".asc-subagent-capacity-0.lock");
  let replacement;
  try {
    await writeFile(lockPath, "malformed-stale-owner");
    const staleTime = new Date(Date.now() - 10_000);
    await utimes(lockPath, staleTime, staleTime);

    const takeover = reserveSharedSubagentCapacity(sessionsDir, 1, {
      afterStaleLeaseClaim() {
        unlinkSync(lockPath);
        replacement = reserveSharedSubagentCapacity(sessionsDir, 1);
      },
    });

    assert.equal(takeover, null);
    assert.ok(replacement);
    assert.equal(reserveSharedSubagentCapacity(sessionsDir, 1), null);
    replacement.release();
    replacement = undefined;
    const next = reserveSharedSubagentCapacity(sessionsDir, 1);
    assert.ok(next);
    next.release();
  } finally {
    replacement?.release();
    await rm(sessionsDir, { recursive: true, force: true });
  }
});

test("crashed capacity reclaim owners do not permanently strand a slot", async () => {
  const sessionsDir = await mkdtemp(join(tmpdir(), "asc-dispatch-stale-reclaim-"));
  const lockPath = join(sessionsDir, ".asc-subagent-capacity-0.lock");
  const reclaimPath = `${lockPath}.reclaim`;
  try {
    await writeFile(lockPath, "malformed-stale-owner");
    const staleTime = new Date(Date.now() - 10_000);
    await utimes(lockPath, staleTime, staleTime);
    const crashedPid = 2_147_483_647;
    await writeFile(
      reclaimPath,
      JSON.stringify({
        kind: "asc.subagent_capacity_reclaim.v1",
        slot: 0,
        pid: crashedPid,
        pidStartedAt: 0,
        token: "crashed-reclaimer",
        createdAt: new Date().toISOString(),
      }),
    );
    // Simulate a crash after the stale-takeover hard-link claim was created.
    await link(reclaimPath, `${reclaimPath}.claim-${crashedPid}-0-abandoned`);

    const reclaimed = reserveSharedSubagentCapacity(sessionsDir, 1);
    assert.ok(reclaimed);
    reclaimed.release();
  } finally {
    await rm(sessionsDir, { recursive: true, force: true });
  }
});

test("concurrent stale reclaim contenders admit exactly one capacity owner", async () => {
  const sessionsDir = await mkdtemp(join(tmpdir(), "asc-dispatch-concurrent-reclaim-"));
  const lockPath = join(sessionsDir, ".asc-subagent-capacity-0.lock");
  const moduleUrl = pathToFileURL(join(process.cwd(), "extensions/self/subagent-capacity.ts")).href;
  try {
    await writeFile(lockPath, "malformed-stale-owner");
    const staleTime = new Date(Date.now() - 10_000);
    await utimes(lockPath, staleTime, staleTime);
    const startAt = Date.now() + 300;
    const script = `import { reserveSharedSubagentCapacity } from ${JSON.stringify(moduleUrl)}; const delay = Math.max(0, ${startAt} - Date.now()); setTimeout(() => { const lease = reserveSharedSubagentCapacity(${JSON.stringify(sessionsDir)}, 1); console.log(lease ? "acquired" : "blocked"); if (lease) setTimeout(() => { lease.release(); }, 500); }, delay);`;
    const contenders = Array.from({ length: 6 }, () =>
      spawn(process.execPath, ["--input-type=module", "-e", script], {
        stdio: ["ignore", "pipe", "inherit"],
      }),
    );
    const outcomes = await Promise.all(
      contenders.map(
        (child) =>
          new Promise((resolve, reject) => {
            let output = "";
            child.stdout.setEncoding("utf8");
            child.stdout.on("data", (chunk) => {
              output += String(chunk);
            });
            child.once("error", reject);
            child.once("exit", (code) =>
              code === 0 ? resolve(output.trim()) : reject(new Error(`contender exited ${code}`)),
            );
          }),
      ),
    );
    assert.equal(outcomes.filter((outcome) => outcome === "acquired").length, 1);
    assert.equal(outcomes.filter((outcome) => outcome === "blocked").length, 5);
  } finally {
    await rm(sessionsDir, { recursive: true, force: true });
  }
});

test("a suspended creator publishes a complete capacity identity before exposing the lock", async () => {
  const sessionsDir = await mkdtemp(join(tmpdir(), "asc-dispatch-suspended-capacity-"));
  const lockPath = join(sessionsDir, ".asc-subagent-capacity-0.lock");
  const moduleUrl = pathToFileURL(join(process.cwd(), "extensions/self/subagent-capacity.ts")).href;
  const holder = spawn(
    process.execPath,
    [
      "--input-type=module",
      "-e",
      `import { reserveSharedSubagentCapacity } from ${JSON.stringify(moduleUrl)}; const lease = reserveSharedSubagentCapacity(${JSON.stringify(sessionsDir)}, 1); if (!lease) process.exit(2); console.log("ready"); setInterval(() => {}, 1000);`,
    ],
    { stdio: ["ignore", "pipe", "inherit"] },
  );

  try {
    await new Promise((resolve, reject) => {
      holder.stdout.setEncoding("utf8");
      holder.stdout.once("data", (chunk) =>
        String(chunk).includes("ready") ? resolve() : reject(new Error(`unexpected: ${chunk}`)),
      );
      holder.once("error", reject);
      holder.once("exit", (code) => reject(new Error(`capacity holder exited early: ${code}`)));
    });
    holder.kill("SIGSTOP");
    const payload = JSON.parse(await readFile(lockPath, "utf8"));
    assert.equal(payload.kind, "asc.subagent_capacity_lease.v1");
    assert.equal(payload.pid, holder.pid);
    assert.equal(typeof payload.token, "string");
    assert.deepEqual(
      (await readdir(sessionsDir)).filter((entry) => entry.includes(".publish-")),
      [],
    );
    const staleTime = new Date(Date.now() - 10_000);
    await utimes(lockPath, staleTime, staleTime);
    assert.equal(reserveSharedSubagentCapacity(sessionsDir, 1), null);

    holder.kill("SIGKILL");
    await once(holder, "exit");
    const reclaimed = reserveSharedSubagentCapacity(sessionsDir, 1);
    assert.ok(reclaimed);
    reclaimed.release();
  } finally {
    if (holder.exitCode === null && holder.signalCode === null) holder.kill("SIGKILL");
    await rm(sessionsDir, { recursive: true, force: true });
  }
});

test("shared capacity is enforced and stale holders are reclaimed across processes", async () => {
  const sessionsDir = await mkdtemp(join(tmpdir(), "asc-dispatch-cross-process-capacity-"));
  const moduleUrl = pathToFileURL(join(process.cwd(), "extensions/self/subagent-capacity.ts")).href;
  const holder = spawn(
    process.execPath,
    [
      "--input-type=module",
      "-e",
      `import { reserveSharedSubagentCapacity } from ${JSON.stringify(moduleUrl)}; const lease = reserveSharedSubagentCapacity(${JSON.stringify(sessionsDir)}, 1); if (!lease) process.exit(2); console.log("ready"); setInterval(() => {}, 1000);`,
    ],
    { stdio: ["ignore", "pipe", "inherit"] },
  );

  try {
    await new Promise((resolve, reject) => {
      holder.stdout.setEncoding("utf8");
      holder.stdout.once("data", (chunk) =>
        String(chunk).includes("ready") ? resolve() : reject(new Error(`unexpected: ${chunk}`)),
      );
      holder.once("error", reject);
      holder.once("exit", (code) => reject(new Error(`capacity holder exited early: ${code}`)));
    });
    assert.equal(reserveSharedSubagentCapacity(sessionsDir, 1), null);
    holder.kill("SIGKILL");
    await once(holder, "exit");
    const reclaimed = reserveSharedSubagentCapacity(sessionsDir, 1);
    assert.ok(reclaimed);
    reclaimed.release();
  } finally {
    if (holder.exitCode === null && holder.signalCode === null) holder.kill("SIGKILL");
    await rm(sessionsDir, { recursive: true, force: true });
  }
});

test("targeted cancellation signals only a live identity-verified child", async () => {
  const sessionsDir = await mkdtemp(join(tmpdir(), "asc-dispatch-signal-cancel-"));
  const state = createSubagentState(sessionsDir);
  const child = spawn(process.execPath, ["-e", "setInterval(() => {}, 1000)"]);
  const sibling = spawn(process.execPath, ["-e", "setInterval(() => {}, 1000)"]);

  try {
    assert.equal(typeof child.pid, "number");
    const pidStartedAt = getProcessStartTicks(child.pid);
    assert.equal(typeof pidStartedAt, "number");
    assert.equal(typeof sibling.pid, "number");
    const siblingStartedAt = getProcessStartTicks(sibling.pid);
    assert.equal(typeof siblingStartedAt, "number");
    writeSessionStatus(sessionsDir, "stale-identity", {
      status: "running",
      pid: sibling.pid,
      ppid: process.pid,
      createdAt: new Date().toISOString(),
      pidStartedAt: siblingStartedAt + 1,
      pidIdentity: "proc-start-ticks",
      dispatchId: "dispatch-stale-identity",
      attemptId: "attempt-stale-identity",
      cancelSupported: true,
      parentRepoRoot: process.cwd(),
      sessionKind: "subagent",
      sessionFile: join(sessionsDir, "stale-identity.jsonl"),
    });
    const staleIdentity = cancelSubagentDispatch({
      state,
      dispatchId: "dispatch-stale-identity",
      requestedBy: "test-parent",
      parentRepoRoot: process.cwd(),
    });
    assert.equal(staleIdentity.ok, false);
    assert.equal(staleIdentity.status, "not_live");
    assert.doesNotThrow(() => process.kill(sibling.pid, 0));

    await writeFile(
      getSubagentCancelRequestPath(sessionsDir, "signal-fails", "attempt-old"),
      JSON.stringify({
        kind: "asc.subagent_cancel_request.v1",
        token: "old-attempt-token",
        dispatchId: "dispatch-signal-fails",
        attemptId: "attempt-old",
        sessionName: "signal-fails",
        requestedAt: new Date().toISOString(),
        requestedBy: "old-parent",
      }),
    );
    writeSessionStatus(sessionsDir, "signal-fails", {
      status: "running",
      pid: process.pid,
      ppid: process.ppid,
      createdAt: new Date().toISOString(),
      pidStartedAt: getProcessStartTicks(process.pid),
      pidIdentity: "proc-start-ticks",
      dispatchId: "dispatch-signal-fails",
      attemptId: "attempt-signal-fails",
      cancelSupported: true,
      parentRepoRoot: process.cwd(),
      sessionKind: "subagent",
      sessionFile: join(sessionsDir, "signal-fails.jsonl"),
    });
    const originalKill = process.kill;
    process.kill = (pid, signal) => {
      if (pid === process.pid && signal === "SIGTERM") {
        throw Object.assign(new Error("simulated ESRCH"), { code: "ESRCH" });
      }
      return originalKill(pid, signal);
    };
    try {
      const failedSignal = cancelSubagentDispatch({
        state,
        dispatchId: "dispatch-signal-fails",
        requestedBy: "test-parent",
        parentRepoRoot: process.cwd(),
      });
      assert.equal(failedSignal.ok, false);
      assert.equal(failedSignal.status, "not_live");
      assert.doesNotMatch(failedSignal.error, /conflicting cancellation request/);

      writeSessionStatus(sessionsDir, "signal-existing", {
        status: "running",
        pid: process.pid,
        ppid: process.ppid,
        createdAt: new Date().toISOString(),
        pidStartedAt: getProcessStartTicks(process.pid),
        pidIdentity: "proc-start-ticks",
        dispatchId: "dispatch-signal-existing",
        attemptId: "attempt-signal-existing",
        cancelSupported: true,
        parentRepoRoot: process.cwd(),
        sessionKind: "subagent",
        sessionFile: join(sessionsDir, "signal-existing.jsonl"),
      });
      const existingPath = getSubagentCancelRequestPath(
        sessionsDir,
        "signal-existing",
        "attempt-signal-existing",
      );
      await writeFile(
        existingPath,
        JSON.stringify({
          kind: "asc.subagent_cancel_request.v1",
          token: "existing-exact-token",
          dispatchId: "dispatch-signal-existing",
          attemptId: "attempt-signal-existing",
          sessionName: "signal-existing",
          requestedAt: new Date().toISOString(),
          requestedBy: "earlier-request",
        }),
      );
      const failedExistingSignal = cancelSubagentDispatch({
        state,
        dispatchId: "dispatch-signal-existing",
        requestedBy: "test-parent",
        parentRepoRoot: process.cwd(),
      });
      assert.equal(failedExistingSignal.ok, false);
      assert.equal(failedExistingSignal.status, "not_live");
      await assert.rejects(readFile(existingPath, "utf8"), { code: "ENOENT" });
    } finally {
      process.kill = originalKill;
    }
    const rolledBackStatus = JSON.parse(
      await readFile(join(sessionsDir, "signal-fails.status.json"), "utf8"),
    );
    assert.equal(rolledBackStatus.status, "running");
    assert.equal(rolledBackStatus.cancelRequestedAt, undefined);
    assert.equal(rolledBackStatus.cancelRequestedBy, undefined);
    await assert.rejects(
      readFile(
        getSubagentCancelRequestPath(sessionsDir, "signal-fails", "attempt-signal-fails"),
        "utf8",
      ),
      { code: "ENOENT" },
    );

    writeSessionStatus(sessionsDir, "cancel-me", {
      status: "running",
      pid: child.pid,
      ppid: process.pid,
      createdAt: new Date().toISOString(),
      pidStartedAt,
      pidIdentity: "proc-start-ticks",
      dispatchId: "dispatch-cancel-test",
      attemptId: "attempt-cancel-test",
      cancelSupported: true,
      parentRepoRoot: process.cwd(),
      sessionKind: "subagent",
      sessionFile: join(sessionsDir, "cancel-me.jsonl"),
    });

    const result = cancelSubagentDispatch({
      state,
      dispatchId: "dispatch-cancel-test",
      requestedBy: "test-parent",
      reason: "bounded test",
      parentRepoRoot: process.cwd(),
    });
    assert.equal(result.ok, true);
    assert.equal(result.status, "cancel_requested");
    const [code, signal] = await once(child, "exit");
    assert.equal(code, null);
    assert.equal(signal, "SIGTERM");
    assert.doesNotThrow(() => process.kill(sibling.pid, 0));
  } finally {
    if (child.exitCode === null && child.signalCode === null) child.kill("SIGKILL");
    if (sibling.exitCode === null && sibling.signalCode === null) sibling.kill("SIGKILL");
    await rm(sessionsDir, { recursive: true, force: true });
  }
});

test("a spawn without a child PID never exposes the parent process as cancellable", async () => {
  const sessionsDir = await mkdtemp(join(tmpdir(), "asc-dispatch-no-child-pid-"));
  const state = createSubagentState(sessionsDir);
  const stdout = new EventEmitter();
  const stderr = new EventEmitter();
  stdout.setEncoding = () => stdout;
  stderr.setEncoding = () => stderr;
  const child = new EventEmitter();
  child.stdout = stdout;
  child.stderr = stderr;
  child.kill = () => true;

  try {
    const resultPromise = spawnSubagentWithSpawn(
      {
        name: "no-child-pid",
        dispatchId: "dispatch-no-child-pid",
        attemptId: "attempt-no-child-pid",
        objective: "Do not signal the parent",
        tools: "read,bash",
        sessionFile: join(sessionsDir, "no-child-pid.jsonl"),
        parentRepoRoot: process.cwd(),
      },
      "test/model",
      { cwd: process.cwd() },
      state,
      () => child,
    );
    const running = JSON.parse(
      await readFile(join(sessionsDir, "no-child-pid.status.json"), "utf8"),
    );
    assert.equal(running.pid, process.pid);
    assert.equal(running.cancelSupported, false);
    const cancellation = cancelSubagentDispatch({
      state,
      dispatchId: "dispatch-no-child-pid",
      requestedBy: "test-parent",
      parentRepoRoot: process.cwd(),
    });
    assert.equal(cancellation.ok, false);
    assert.equal(cancellation.status, "not_live");

    stdout.emit(
      "data",
      `${MODERN_HANDSHAKE}${JSON.stringify({ type: "assistant_message_end", stopReason: "stop", text: "done" })}\n${JSON.stringify({ type: "agent_settled" })}\n`,
    );
    child.emit("close", 0);
    assert.equal((await resultPromise).status, "done");
  } finally {
    await rm(sessionsDir, { recursive: true, force: true });
  }
});

test("a sidecar-backed targeted cancellation is classified as aborted, not protocol corruption", async () => {
  const sessionsDir = await mkdtemp(join(tmpdir(), "asc-dispatch-cancel-classification-"));
  const state = createSubagentState(sessionsDir);
  const stdout = new EventEmitter();
  const stderr = new EventEmitter();
  stdout.setEncoding = () => stdout;
  stderr.setEncoding = () => stderr;
  const child = new EventEmitter();
  child.stdout = stdout;
  child.stderr = stderr;
  child.pid = 616161;
  child.kill = () => true;

  try {
    const resultPromise = spawnSubagentWithSpawn(
      {
        name: "cancel-classification",
        dispatchId: "dispatch-cancel-classification",
        attemptId: "attempt-cancel-classification",
        objective: "Wait for targeted cancellation",
        tools: "read,bash",
        sessionFile: join(sessionsDir, "cancel-classification.jsonl"),
      },
      "test/model",
      { cwd: process.cwd() },
      state,
      () => child,
    );
    await writeFile(
      getSubagentCancelRequestPath(
        sessionsDir,
        "cancel-classification",
        "attempt-cancel-classification",
      ),
      JSON.stringify({
        kind: "asc.subagent_cancel_request.v1",
        token: "test-cancel-token",
        dispatchId: "dispatch-cancel-classification",
        attemptId: "attempt-cancel-classification",
        sessionName: "cancel-classification",
        requestedAt: new Date().toISOString(),
        requestedBy: "test-parent",
      }),
    );
    child.emit("close", 143);
    const result = await resultPromise;
    assert.equal(result.status, "aborted");
    assert.equal(result.exitCode, 130);
    assert.equal(result.executionState?.protocol, undefined);
    assert.equal(result.output, "Subagent aborted.");
    const completedStatus = JSON.parse(
      await readFile(join(sessionsDir, "cancel-classification.status.json"), "utf8"),
    );
    assert.equal(completedStatus.cancelRequestedBy, "test-parent");
    await assert.rejects(
      readFile(
        getSubagentCancelRequestPath(
          sessionsDir,
          "cancel-classification",
          "attempt-cancel-classification",
        ),
        "utf8",
      ),
      { code: "ENOENT" },
    );
  } finally {
    await rm(sessionsDir, { recursive: true, force: true });
  }
});

test("multiple terminal assistant events fail closed", async () => {
  const sessionsDir = await mkdtemp(join(tmpdir(), "asc-dispatch-duplicate-terminal-"));
  const state = createSubagentState(sessionsDir);
  const stdout = new EventEmitter();
  const stderr = new EventEmitter();
  stdout.setEncoding = () => stdout;
  stderr.setEncoding = () => stderr;
  const child = new EventEmitter();
  child.stdout = stdout;
  child.stderr = stderr;
  child.pid = 717171;
  child.kill = () => true;

  try {
    const resultPromise = spawnSubagentWithSpawn(
      {
        name: "duplicate-terminal",
        dispatchId: "dispatch-duplicate-terminal",
        attemptId: "attempt-duplicate-terminal",
        objective: "Reject duplicate terminal events",
        tools: "read,bash",
        sessionFile: join(sessionsDir, "duplicate-terminal.jsonl"),
      },
      "test/model",
      { cwd: process.cwd() },
      state,
      () => child,
    );
    stdout.emit(
      "data",
      `${MODERN_HANDSHAKE}${JSON.stringify({ type: "assistant_message_end", stopReason: "stop", text: "first" })}\n${JSON.stringify({ type: "assistant_message_end", stopReason: "stop", text: "second" })}\n`,
    );
    child.emit("close", 0);
    const result = await resultPromise;
    assert.equal(result.status, "error");
    assert.equal(result.executionState?.protocol?.kind, "assistant_protocol_incomplete");
    assert.match(result.output, /settlementMode=agent_settled/);
    assert.match(result.output, /outcomes=2/);
  } finally {
    await rm(sessionsDir, { recursive: true, force: true });
  }
});

test("one agent settlement accepts a recovered final outcome after an automatic retry", async () => {
  const sessionsDir = await mkdtemp(join(tmpdir(), "asc-dispatch-retry-settlement-"));
  const state = createSubagentState(sessionsDir);
  const stdout = new EventEmitter();
  const stderr = new EventEmitter();
  stdout.setEncoding = () => stdout;
  stderr.setEncoding = () => stderr;
  const child = new EventEmitter();
  child.stdout = stdout;
  child.stderr = stderr;
  child.pid = 818181;
  child.kill = () => true;

  try {
    const resultPromise = spawnSubagentWithSpawn(
      {
        name: "retry-settlement",
        dispatchId: "dispatch-retry-settlement",
        attemptId: "attempt-retry-settlement",
        objective: "Accept final retry truth",
        tools: "read,bash",
        sessionFile: join(sessionsDir, "retry-settlement.jsonl"),
      },
      "test/model",
      { cwd: process.cwd() },
      state,
      () => child,
    );
    stdout.emit(
      "data",
      `${JSON.stringify({ type: "transport_ready", settlementMode: "agent_settled", piVersion: "0.80.6" })}\n${JSON.stringify({ type: "assistant_message_end", stopReason: "error", errorMessage: "retryable" })}\n${JSON.stringify({ type: "assistant_message_end", stopReason: "stop", text: "recovered" })}\n${JSON.stringify({ type: "agent_settled" })}\n`,
    );
    child.emit("close", 0);
    const result = await resultPromise;
    assert.equal(result.status, "done");
    assert.equal(result.output, "recovered");
    assert.equal(result.usage?.turns, 2);
    assert.equal(result.assistantStopReason, "stop");
  } finally {
    await rm(sessionsDir, { recursive: true, force: true });
  }
});

test("declared Pi 0.80 fails closed when agent_settled is missing", async () => {
  const sessionsDir = await mkdtemp(join(tmpdir(), "asc-dispatch-modern-missing-settlement-"));
  const state = createSubagentState(sessionsDir);
  const stdout = new EventEmitter();
  const stderr = new EventEmitter();
  stdout.setEncoding = () => stdout;
  stderr.setEncoding = () => stderr;
  const child = new EventEmitter();
  child.stdout = stdout;
  child.stderr = stderr;
  child.pid = 838383;
  child.kill = () => true;

  try {
    const resultPromise = spawnSubagentWithSpawn(
      {
        name: "modern-missing-settlement",
        dispatchId: "dispatch-modern-missing-settlement",
        attemptId: "attempt-modern-missing-settlement",
        objective: "Reject missing modern settlement",
        tools: "read,bash",
        sessionFile: join(sessionsDir, "modern-missing-settlement.jsonl"),
      },
      "test/model",
      { cwd: process.cwd() },
      state,
      () => child,
    );
    stdout.emit(
      "data",
      `${JSON.stringify({ type: "transport_ready", settlementMode: "agent_settled", piVersion: "0.80.6" })}\n${JSON.stringify({ type: "assistant_message_end", stopReason: "stop", text: "premature" })}\n${JSON.stringify({ type: "agent_run_end", willRetry: false })}\n`,
    );
    child.emit("close", 0);
    const result = await resultPromise;
    assert.equal(result.status, "error");
    assert.equal(result.executionState?.protocol?.kind, "assistant_protocol_incomplete");
    assert.match(result.output, /settlementMode=agent_settled/);
    assert.match(result.output, /settlements=0/);
  } finally {
    await rm(sessionsDir, { recursive: true, force: true });
  }
});

test("Pi 0.80 settlement must follow the final terminal assistant outcome", async () => {
  const sessionsDir = await mkdtemp(join(tmpdir(), "asc-dispatch-settlement-order-"));
  const state = createSubagentState(sessionsDir);
  const stdout = new EventEmitter();
  const stderr = new EventEmitter();
  stdout.setEncoding = () => stdout;
  stderr.setEncoding = () => stderr;
  const child = new EventEmitter();
  child.stdout = stdout;
  child.stderr = stderr;
  child.pid = 848484;
  child.kill = () => true;

  try {
    const resultPromise = spawnSubagentWithSpawn(
      {
        name: "settlement-order",
        dispatchId: "dispatch-settlement-order",
        attemptId: "attempt-settlement-order",
        objective: "Reject premature modern settlement",
        tools: "read,bash",
        sessionFile: join(sessionsDir, "settlement-order.jsonl"),
      },
      "test/model",
      { cwd: process.cwd() },
      state,
      () => child,
    );
    stdout.emit(
      "data",
      `${JSON.stringify({ type: "transport_ready", settlementMode: "agent_settled", piVersion: "0.80.6" })}\n${JSON.stringify({ type: "agent_settled" })}\n${JSON.stringify({ type: "assistant_message_end", stopReason: "stop", text: "too late" })}\n`,
    );
    child.emit("close", 0);
    const result = await resultPromise;
    assert.equal(result.status, "error");
    assert.equal(result.executionState?.protocol?.kind, "assistant_protocol_incomplete");
    assert.match(result.output, /settlementOrdinal=1, outcomes=1, finalOutcomeOrdinal=2/);
  } finally {
    await rm(sessionsDir, { recursive: true, force: true });
  }
});

test("clean Pi 0.76 JSON exit plus final agent_end accepts an automatic retry", async () => {
  const sessionsDir = await mkdtemp(join(tmpdir(), "asc-dispatch-legacy-retry-settlement-"));
  const state = createSubagentState(sessionsDir);
  const stdout = new EventEmitter();
  const stderr = new EventEmitter();
  stdout.setEncoding = () => stdout;
  stderr.setEncoding = () => stderr;
  const child = new EventEmitter();
  child.stdout = stdout;
  child.stderr = stderr;
  child.pid = 828282;
  child.kill = () => true;

  try {
    const resultPromise = spawnSubagentWithSpawn(
      {
        name: "legacy-retry-settlement",
        dispatchId: "dispatch-legacy-retry-settlement",
        attemptId: "attempt-legacy-retry-settlement",
        objective: "Accept final retry truth from the pinned legacy host",
        tools: "read,bash",
        sessionFile: join(sessionsDir, "legacy-retry-settlement.jsonl"),
      },
      "test/model",
      { cwd: process.cwd() },
      state,
      () => child,
    );
    stdout.emit(
      "data",
      `${JSON.stringify({ type: "transport_ready", settlementMode: "legacy_agent_end_exit", piVersion: "0.76.0" })}\n${JSON.stringify({ type: "assistant_message_end", stopReason: "error", errorMessage: "retryable" })}\n${JSON.stringify({ type: "agent_run_end", willRetry: true })}\n${JSON.stringify({ type: "assistant_message_end", stopReason: "stop", text: "recovered" })}\n${JSON.stringify({ type: "agent_run_end", willRetry: false })}\n`,
    );
    child.emit("close", 0);
    const result = await resultPromise;
    assert.equal(result.status, "done");
    assert.equal(result.output, "recovered");
    assert.equal(result.usage?.turns, 2);
    assert.equal(result.assistantStopReason, "stop");
  } finally {
    await rm(sessionsDir, { recursive: true, force: true });
  }
});

test("startup timeout is distinct from execution timeout and fails before transport readiness", async () => {
  const sessionsDir = await mkdtemp(join(tmpdir(), "asc-dispatch-startup-timeout-"));
  const state = createSubagentState(sessionsDir);
  const stdout = new EventEmitter();
  const stderr = new EventEmitter();
  stdout.setEncoding = () => stdout;
  stderr.setEncoding = () => stderr;
  const child = new EventEmitter();
  child.stdout = stdout;
  child.stderr = stderr;
  child.pid = 515151;
  child.kill = () => {
    setImmediate(() => child.emit("close", null));
    return true;
  };
  const fakeChildProcessKeepAlive = setTimeout(() => {}, 1_000);

  try {
    const result = await spawnSubagentWithSpawn(
      {
        name: "startup-timeout",
        dispatchId: "dispatch-startup-timeout",
        attemptId: "attempt-startup-timeout",
        objective: "Wait for bootstrap",
        tools: "read,bash",
        sessionFile: join(sessionsDir, "startup-timeout.jsonl"),
        startupTimeout: 10,
        timeout: 1000,
      },
      "test/model",
      { cwd: process.cwd() },
      state,
      () => child,
    );
    assert.equal(result.status, "timeout");
    assert.equal(result.timeoutPhase, "startup");
    assert.match(result.output, /timed out during startup after 10ms/);
  } finally {
    clearTimeout(fakeChildProcessKeepAlive);
    await rm(sessionsDir, { recursive: true, force: true });
  }
});

import assert from "node:assert/strict";
import { chmodSync, mkdirSync, mkdtempSync, rmSync, symlinkSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";
import { type ContextConfig, snapshotConfig } from "../src/config.ts";
import { type CollectionPacket, RefreshLifecycle } from "../src/refresh-lifecycle.ts";

interface Packet extends CollectionPacket {
  marker: string;
}
const config = (extra: NodeJS.ProcessEnv = {}) =>
  snapshotConfig("/virtual/ai-society/repo", { HOME: "/virtual", ...extra });
const packet = (marker: string, health: "healthy" | "degraded" = "healthy"): Packet => ({
  marker,
  applicable: true,
  packetTier: "full",
  fullRefreshStatus: "complete",
  sourceHealth: health,
});
const fast = (cfg: ContextConfig, error?: unknown): Packet => ({
  marker: cfg.cwd,
  applicable: cfg.enabled,
  packetTier: "fast",
  fullRefreshStatus: error ? "failed" : "pending",
  sourceHealth: error ? "degraded" : "not_checked",
});
const deferred = <T>() => {
  let resolve: (value: T) => void = () => {};
  const promise = new Promise<T>((done) => {
    resolve = done;
  });
  return { promise, resolve };
};
const tick = () => new Promise<void>((resolve) => setImmediate(resolve));

test("effective identity snapshots normalized cwd, PATH resolution, AK_DB and all limits/budgets without a default database", () => {
  const root = mkdtempSync(join(tmpdir(), "society-config-"));
  try {
    mkdirSync(join(root, "cwd"));
    mkdirSync(join(root, "bin"));
    symlinkSync(join(root, "cwd"), join(root, "alias"));
    const executable = join(root, "bin", "ak");
    writeFileSync(executable, "#!/bin/sh\nexit 0\n");
    chmodSync(executable, 0o755);
    const env = { HOME: root, PATH: join(root, "bin") };
    const first = snapshotConfig(join(root, "cwd"), env);
    assert.equal(snapshotConfig(join(root, "alias"), env).fingerprint, first.fingerprint);
    assert.equal(first.executable, executable);
    assert.equal(first.env.AK_DB, undefined);
    assert.equal(first.commandTimeoutMs, 45_000);
    assert.equal(first.refreshTimeoutMs, 120_000);
    assert.equal(first.waitMs, 250);
    assert.equal(first.ttlMs, 300_000);
    for (const [name, value] of Object.entries({
      AK_DB: "caller.db",
      PATH: "",
      PI_SOCIETY_CONTEXT_AK: "./ak",
      PI_SOCIETY_STARTUP_CONTEXT: "0",
      PI_SOCIETY_CONTEXT_COMMAND_TIMEOUT_MS: "0",
      PI_SOCIETY_CONTEXT_REFRESH_TIMEOUT_MS: "1",
      PI_SOCIETY_CONTEXT_FULL_WAIT_MS: "0",
      PI_SOCIETY_CONTEXT_MAX_TASKS: "0",
      PI_SOCIETY_CONTEXT_MAX_WARNINGS: "0",
      PI_SOCIETY_CONTEXT_MAX_GIT_LINES: "0",
      PI_SOCIETY_CONTEXT_TTL_MS: "0",
      PI_SOCIETY_CONTEXT_RETRY_BASE_MS: "1",
      PI_SOCIETY_CONTEXT_RETRY_CAP_MS: "2",
    })) {
      assert.notEqual(
        snapshotConfig(first.cwd, { ...env, [name]: value }).fingerprint,
        first.fingerprint,
        name,
      );
    }
    const short = config({
      PI_SOCIETY_CONTEXT_COMMAND_TIMEOUT_MS: "0",
      PI_SOCIETY_CONTEXT_FULL_WAIT_MS: "0",
      PI_SOCIETY_CONTEXT_MAX_TASKS: "0",
    });
    assert.equal(short.commandTimeoutMs, 0);
    assert.equal(short.waitMs, 0);
    assert.equal(short.maxTasks, 0);
    assert.equal(
      config({ PI_SOCIETY_CONTEXT_COMMAND_TIMEOUT_MS: "3oops" }).commandTimeoutMs,
      45_000,
    );
    assert.equal(config({ PI_SOCIETY_CONTEXT_RETRY_CAP_MS: "999999" }).retryCapMs, 120_000);
    const supplied = { ...env, AK_DB: "custom" };
    const snap = snapshotConfig(first.cwd, supplied);
    supplied.AK_DB = "changed";
    assert.equal(snap.env.AK_DB, "custom");
    symlinkSync(executable, join(root, "bin", "alternate"));
    assert.equal(
      snapshotConfig(first.cwd, { ...env, PI_SOCIETY_CONTEXT_AK: "alternate" }).fingerprint,
      first.fingerprint,
    );
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test("healthy TTL starts at collection start, refresh keeps prior facts explicitly stale and no idle polling occurs", async () => {
  let now = 0;
  let calls = 0;
  const cfg = config();
  let barrier = deferred<Packet>();
  const lifecycle = new RefreshLifecycle({
    fast,
    now: () => now,
    collect: async () => {
      calls++;
      return barrier.promise;
    },
  });
  assert.equal((await lifecycle.request(() => cfg, false, 0))?.refreshState, "refreshing");
  await tick();
  now = 299_000;
  barrier.resolve(packet("first"));
  assert.equal((await lifecycle.request(() => cfg, true))?.freshness, "fresh");
  now = 300_000;
  assert.equal(lifecycle.view()?.freshness, "stale");
  await tick();
  assert.equal(calls, 1, "clock passage alone cannot poll");
  barrier = deferred<Packet>();
  const stale = await lifecycle.request(() => cfg, false, 0);
  assert.equal(stale?.marker, "first");
  assert.equal(stale?.freshness, "stale");
  assert.equal(stale?.refreshState, "refreshing");
  await tick();
  assert.equal(calls, 2);
  now = 600_001;
  barrier.resolve(packet("second"));
  assert.equal(
    (await lifecycle.request(() => cfg, true))?.freshness,
    "stale",
    "long collections do not renew earliest-source TTL",
  );
  await lifecycle.shutdown();
});

test("degraded retries are demand-driven, exponential, jittered before cap and reset only by healthy collection", async () => {
  let now = 0;
  let calls = 0;
  let health: "healthy" | "degraded" = "degraded";
  const cfg = config();
  const lifecycle = new RefreshLifecycle({
    fast,
    now: () => now,
    random: () => 1,
    collect: async () => {
      calls++;
      return packet(String(calls), health);
    },
  });
  for (const delay of [18_750, 37_500, 75_000, 120_000, 120_000]) {
    const result = await lifecycle.request(() => cfg, true);
    assert.equal(result?.sourceHealth, "degraded");
    assert.equal(result?.refreshState, "backoff");
    const before = calls;
    now += delay - 1;
    await lifecycle.request(() => cfg, false, 0);
    assert.equal(calls, before);
    now++;
    assert.equal(lifecycle.view()?.refreshState, "idle");
  }
  health = "healthy";
  assert.equal((await lifecycle.request(() => cfg, true))?.sourceHealth, "healthy");
  health = "degraded";
  await lifecycle.request(() => cfg, true);
  now += 18_749;
  const before = calls;
  await lifecycle.request(() => cfg, false, 0);
  assert.equal(calls, before);
  now++;
  await lifecycle.request(() => cfg, false, 0);
  await tick();
  assert.equal(calls, before + 1);
  await lifecycle.shutdown();
});

test("manual requests coalesce; thrown failure counts toward backoff rather than becoming permanently cached", async () => {
  const cfg = config();
  let calls = 0;
  const barrier = deferred<Packet>();
  const lifecycle = new RefreshLifecycle({
    fast,
    collect: async () => {
      calls++;
      return barrier.promise;
    },
  });
  const first = lifecycle.request(() => cfg, true);
  const second = lifecycle.request(() => cfg, true);
  await tick();
  assert.equal(calls, 1);
  barrier.resolve(packet("shared"));
  assert.equal((await first)?.marker, "shared");
  assert.equal((await second)?.marker, "shared");
  await lifecycle.shutdown();
  const failing = new RefreshLifecycle({
    fast,
    collect: async () => {
      throw new Error("transport crashed");
    },
  });
  const result = await failing.request(() => cfg, true);
  assert.equal(result?.fullRefreshStatus, "failed");
  assert.equal(result?.sourceHealth, "degraded");
  assert.equal(result?.refreshState, "backoff");
  await failing.shutdown();
});

test("cwd/config supersession rejects publication AND consumption, drains old generation before new collection", async () => {
  let current = config();
  const barriers: Array<ReturnType<typeof deferred<Packet>>> = [];
  const signals: AbortSignal[] = [];
  const lifecycle = new RefreshLifecycle({
    fast,
    collect: async (_cfg, signal) => {
      signals.push(signal);
      const item = deferred<Packet>();
      barriers.push(item);
      return item.promise;
    },
  });
  const old = lifecycle.request(() => current, true);
  await tick();
  current = snapshotConfig("/virtual/ai-society/new", { HOME: "/virtual", AK_DB: "next" });
  const replacement = lifecycle.request(() => current, true);
  await tick();
  assert.equal(signals[0].aborted, true);
  assert.equal(signals[0].reason, "superseded");
  assert.equal(barriers.length, 1, "new reads wait for old cleanup");
  barriers[0].resolve(packet("old"));
  assert.equal(await old, undefined);
  await tick();
  assert.equal(barriers.length, 2);
  barriers[1].resolve(packet("new"));
  assert.equal((await replacement)?.marker, "new");
  assert.equal(lifecycle.view()?.marker, "new");
  await lifecycle.shutdown();
});

test("configuration changing DURING bounded wait invalidates old packet even without another request", async () => {
  let current = config({ PI_SOCIETY_CONTEXT_FULL_WAIT_MS: "10" });
  const barrier = deferred<Packet>();
  const lifecycle = new RefreshLifecycle({ fast, collect: async () => barrier.promise });
  const request = lifecycle.request(() => current);
  await tick();
  current = config({ AK_DB: "changed", PI_SOCIETY_CONTEXT_FULL_WAIT_MS: "10" });
  const value = await request;
  assert.equal(value?.packetTier, "fast");
  assert.equal(value?.configFingerprint, current.fingerprint);
  barrier.resolve(packet("obsolete"));
  await lifecycle.shutdown();
});

test("shutdown drains in-flight work and suppresses all waiting/manual results and later activity", async () => {
  const cfg = config();
  const barrier = deferred<Packet>();
  let signal: AbortSignal | undefined;
  let settled = false;
  const lifecycle = new RefreshLifecycle({
    fast,
    collect: async (_cfg, abort) => {
      signal = abort;
      return barrier.promise;
    },
  });
  const request = lifecycle.request(() => cfg, true);
  await tick();
  const shutdown = lifecycle.shutdown().then(() => {
    settled = true;
  });
  await tick();
  assert.equal(signal?.aborted, true);
  assert.equal(signal?.reason, "shutdown");
  assert.equal(settled, false);
  barrier.resolve(packet("after-shutdown"));
  await shutdown;
  assert.equal(await request, undefined);
  assert.equal(await lifecycle.request(() => cfg, true), undefined);
  assert.equal(lifecycle.view(), undefined);
});

test("independent controllers get distinct deterministic jitter and disabled contexts never collect", async () => {
  let now = 0;
  const cfg = config();
  const controllers = [0, 1].map(
    (random) =>
      new RefreshLifecycle({
        fast,
        now: () => now,
        random: () => random,
        collect: async () => packet("failure", "degraded"),
      }),
  );
  await Promise.all(controllers.map((item) => item.request(() => cfg, true)));
  now = 15_000;
  assert.equal(controllers[0].view()?.refreshState, "idle");
  assert.equal(controllers[1].view()?.refreshState, "backoff");
  await Promise.all(controllers.map((item) => item.shutdown()));
  const disabled = config({ PI_SOCIETY_STARTUP_CONTEXT: "0" });
  const off = new RefreshLifecycle({
    fast,
    collect: async () => {
      throw new Error("must not collect");
    },
  });
  assert.equal((await off.request(() => disabled, true))?.applicable, false);
  await off.shutdown();
});

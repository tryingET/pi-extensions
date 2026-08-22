/**
summary: "Tests immutable contract generations and singleflight health for the workstation provider hot path."
read_when:
  - "Changing contract refresh, model lookup, health cache, or voice-latency behavior."
*/
import assert from "node:assert/strict";
import test from "node:test";
import {
  ContractGenerationCache,
  EndpointHealthCache,
} from "../extensions/workstation-provider-hot-path.ts";

test("endpoint health cache distinguishes hard failure from partial degradation", async () => {
  const cache = new EndpointHealthCache({
    probe: async (key) =>
      key === "dead" ? "connection refused" : { degraded: "degraded-side-lanes" },
    ttlMs: 60_000,
  });

  const deadStatus = (await cache.check("dead")) ?? "";
  const degradedStatus = await cache.check("degraded");
  assert.equal(deadStatus, "connection refused");
  assert.equal(degradedStatus, undefined, "degradation must not gate requests");

  const statuses = cache.status();
  const dead = statuses.find((entry) => entry.key === "dead");
  const degraded = statuses.find((entry) => entry.key === "degraded");
  assert.equal(dead.unhealthy, "connection refused");
  assert.equal(dead.degraded, undefined);
  assert.equal(degraded.unhealthy, undefined);
  assert.equal(degraded.degraded, "degraded-side-lanes");
});

function makeCache(options) {
  return new ContractGenerationCache({
    load: options.load,
    merge: (sources) => ({
      contract: {
        name: sources[0]?.contract.name ?? "missing",
        models: sources.flatMap((source) => source.contract.models),
      },
      source: sources.map((source) => source.source).join(" + "),
    }),
    models: (contract) => contract.models,
    modelId: (model) => model.id,
    refreshIntervalMs: options.refreshIntervalMs ?? 1000,
    refreshRetryMs: options.refreshRetryMs ?? 100,
    now: options.now,
  });
}

function deferred() {
  let resolve;
  let reject;
  const promise = new Promise((res, rej) => {
    resolve = res;
    reject = rej;
  });
  return { promise, resolve, reject };
}

test("a ready generation serves repeated model lookups without reloading", async () => {
  let loads = 0;
  const generations = makeCache({
    load: async () => {
      loads += 1;
      return [{ contract: { name: "canonical", models: [{ id: "m1" }] }, source: "a" }];
    },
  });
  const first = await generations.resolve("m1");
  for (let index = 0; index < 100_000; index += 1) {
    assert.equal(generations.resolveCurrent("m1")?.generationId, first?.generationId);
  }
  assert.equal(loads, 1);
});

test("TTL refresh is singleflight and leaves the current generation available", async () => {
  let now = 0;
  const gate = deferred();
  let loads = 0;
  const generations = makeCache({
    now: () => now,
    refreshIntervalMs: 10,
    load: async () => {
      loads += 1;
      if (loads === 1) {
        return [{ contract: { name: "v1", models: [{ id: "m1", value: 1 }] }, source: "v1" }];
      }
      return gate.promise;
    },
  });
  await generations.initialize();
  now = 11;
  assert.equal(generations.resolveCurrent("m1")?.model.value, 1);
  assert.equal(generations.status().refreshInFlight, true);
  gate.resolve([{ contract: { name: "v2", models: [{ id: "m1", value: 2 }] }, source: "v2" }]);
  while (generations.status().refreshInFlight)
    await new Promise((resolve) => setImmediate(resolve));
  assert.equal(generations.resolveCurrent("m1")?.model.value, 2);
});

test("failed refresh preserves the previous generation and applies retry backoff", async () => {
  let now = 0;
  let loads = 0;
  const generations = makeCache({
    now: () => now,
    refreshIntervalMs: 10,
    refreshRetryMs: 50,
    load: async () => {
      loads += 1;
      if (loads === 1) {
        return [{ contract: { name: "v1", models: [{ id: "m1" }] }, source: "v1" }];
      }
      throw new Error("refresh failed");
    },
  });
  await generations.initialize();
  now = 11;
  generations.resolveCurrent("m1");
  while (generations.status().refreshInFlight)
    await new Promise((resolve) => setImmediate(resolve));
  assert.equal(generations.resolveCurrent("m1")?.contract.name, "v1");
  assert.equal(loads, 2);
  now = 20;
  generations.resolveCurrent("m1");
  await new Promise((resolve) => setImmediate(resolve));
  assert.equal(loads, 2);
});

test("background health probes are singleflight and do not block a cold caller", async () => {
  const gate = deferred();
  let probes = 0;
  const health = new EndpointHealthCache({
    ttlMs: 1000,
    probe: async () => {
      probes += 1;
      return gate.promise;
    },
  });
  const start = performance.now();
  const values = await Promise.all(
    Array.from({ length: 100 }, () => health.check("endpoint", { mode: "background" })),
  );
  assert.ok(performance.now() - start < 25);
  assert.ok(values.every((value) => value === undefined));
  assert.equal(probes, 1);
  gate.resolve(undefined);
});

test("blocking health callers share one probe and caller cancellation is isolated", async () => {
  const gate = deferred();
  let probes = 0;
  const health = new EndpointHealthCache({
    ttlMs: 1000,
    probe: async () => {
      probes += 1;
      return gate.promise;
    },
  });
  const controller = new AbortController();
  const cancelled = health.check("endpoint", { mode: "blocking", signal: controller.signal });
  const survivor = health.check("endpoint", { mode: "blocking" });
  controller.abort();
  assert.equal(await cancelled, "health check cancelled by caller");
  gate.resolve(undefined);
  assert.equal(await survivor, undefined);
  assert.equal(probes, 1);
});

test("clearing during generation refresh prevents a late generation from repopulating the cache", async () => {
  const gate = deferred();
  const generations = makeCache({ load: async () => gate.promise });
  const pending = generations.refresh("explicit");
  generations.clear();
  gate.resolve([{ contract: { name: "late", models: [{ id: "m1" }] }, source: "late" }]);
  await assert.rejects(pending, /cleared during refresh/);
  assert.equal(generations.status().initialized, false);
});

test("clearing during a health probe prevents a late verdict from repopulating the cache", async () => {
  const gate = deferred();
  const health = new EndpointHealthCache({ ttlMs: 1000, probe: async () => gate.promise });
  const pending = health.check("endpoint", { mode: "blocking" });
  health.clear();
  gate.resolve("late failure");
  assert.equal(await pending, "late failure");
  assert.deepEqual(health.status(), []);
});

test("concurrent initial callers share one contract load", async () => {
  const gate = deferred();
  let loads = 0;
  const generations = makeCache({
    load: async () => {
      loads += 1;
      return gate.promise;
    },
  });
  const first = generations.resolve("m1");
  const second = generations.resolve("m1");
  gate.resolve([{ contract: { name: "v1", models: [{ id: "m1" }] }, source: "v1" }]);
  const [a, b] = await Promise.all([first, second]);
  assert.equal(a?.generationId, b?.generationId);
  assert.equal(loads, 1);
});

test("duplicate model IDs preserve first-contract-wins semantics", async () => {
  const generations = makeCache({
    load: async () => [
      { contract: { name: "canonical", models: [{ id: "same", value: 1 }] }, source: "a" },
      { contract: { name: "canary", models: [{ id: "same", value: 2 }] }, source: "b" },
    ],
  });
  assert.equal((await generations.resolve("same"))?.model.value, 1);
});

test("explicit refresh atomically replaces the active generation", async () => {
  let version = 1;
  const generations = makeCache({
    load: async () => [
      {
        contract: { name: `v${version}`, models: [{ id: "m1", value: version }] },
        source: `v${version}`,
      },
    ],
  });
  const before = await generations.resolve("m1");
  version = 2;
  await generations.refresh("explicit");
  const after = generations.resolveCurrent("m1");
  assert.notEqual(before?.generationId, after?.generationId);
  assert.equal(after?.model.value, 2);
});

test("stale healthy background health allows while one recovery probe runs", async () => {
  let now = 0;
  const recovery = deferred();
  let probes = 0;
  const health = new EndpointHealthCache({
    now: () => now,
    ttlMs: 10,
    probe: async () => {
      probes += 1;
      return probes === 1 ? undefined : recovery.promise;
    },
  });
  assert.equal(await health.check("endpoint", { mode: "blocking" }), undefined);
  now = 11;
  assert.equal(await health.check("endpoint", { mode: "background" }), undefined);
  assert.equal(health.status()[0]?.probeInFlight, true);
  recovery.resolve(undefined);
});

test("stale unhealthy background health remains fail-closed until recovery", async () => {
  let now = 0;
  const recovery = deferred();
  let probes = 0;
  const health = new EndpointHealthCache({
    now: () => now,
    ttlMs: 10,
    probe: async () => {
      probes += 1;
      return probes === 1 ? "down" : recovery.promise;
    },
  });
  assert.equal(await health.check("endpoint", { mode: "blocking" }), "down");
  now = 11;
  assert.equal(await health.check("endpoint", { mode: "background" }), "down");
  recovery.resolve(undefined);
  while (health.status()[0]?.probeInFlight) await new Promise((resolve) => setImmediate(resolve));
  assert.equal(await health.check("endpoint", { mode: "background" }), undefined);
});

test("prime deduplicates endpoint keys", async () => {
  let probes = 0;
  const health = new EndpointHealthCache({
    ttlMs: 1000,
    probe: async () => {
      probes += 1;
      return undefined;
    },
  });
  await health.prime(["a", "a", "b", "b"]);
  assert.equal(probes, 2);
});

test("skip health mode performs no probe", async () => {
  let probes = 0;
  const health = new EndpointHealthCache({
    ttlMs: 1000,
    probe: async () => {
      probes += 1;
      return undefined;
    },
  });
  assert.equal(await health.check("endpoint", { mode: "skip" }), undefined);
  assert.equal(probes, 0);
});

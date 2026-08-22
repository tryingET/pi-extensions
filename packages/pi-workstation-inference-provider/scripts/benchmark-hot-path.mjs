/**
summary: "Synthetic adapter-only benchmark for contract startup, model lookup, and cached health."
read_when:
  - "Measuring workstation-provider adapter overhead."
*/
import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { performance } from "node:perf_hooks";
import {
  ContractGenerationCache,
  EndpointHealthCache,
} from "../extensions/workstation-provider-hot-path.ts";

function percentile(values, p) {
  const sorted = [...values].sort((a, b) => a - b);
  return sorted[Math.min(sorted.length - 1, Math.floor(sorted.length * p))] ?? 0;
}

function createCache(load) {
  return new ContractGenerationCache({
    load,
    merge: (sources) => ({
      contract: {
        ...sources[0].contract,
        models: sources.flatMap((source) => source.contract.models),
      },
      source: sources.map((source) => source.source).join(" + "),
    }),
    models: (contract) => contract.models,
    modelId: (model) => model.id,
    refreshIntervalMs: 60_000,
  });
}

const fixtureDir = await mkdtemp(path.join(tmpdir(), "pi-workstation-hot-path-"));
try {
  const fixturePaths = ["canonical.json", "canary.json", "audio.json"].map((name) =>
    path.join(fixtureDir, name),
  );
  await Promise.all(
    fixturePaths.map((fixturePath, index) =>
      writeFile(
        fixturePath,
        JSON.stringify({
          name: `contract-${index}`,
          models: Array.from({ length: 4 }, (_, modelIndex) => ({
            id: `model-${index}-${modelIndex}`,
          })),
        }),
        "utf8",
      ),
    ),
  );

  const coldStartSamples = [];
  for (let index = 0; index < 1_000; index += 1) {
    const cache = createCache(async () =>
      Promise.all(
        fixturePaths.map(async (fixturePath) => ({
          contract: JSON.parse(await readFile(fixturePath, "utf8")),
          source: fixturePath,
        })),
      ),
    );
    const startedAt = performance.now();
    await cache.initialize();
    coldStartSamples.push(performance.now() - startedAt);
  }

  const generations = createCache(async () => [
    { contract: { name: "inline", models: [{ id: "baseline-text" }] }, source: "inline" },
  ]);
  await generations.initialize();

  const iterations = 1_000_000;
  const lookupStartedAt = performance.now();
  for (let index = 0; index < iterations; index += 1) {
    const selected = generations.resolveCurrent("baseline-text");
    if (!selected) throw new Error("missing model");
  }
  const lookupElapsedMs = performance.now() - lookupStartedAt;

  let probes = 0;
  const health = new EndpointHealthCache({
    ttlMs: 5_000,
    probe: async () => {
      probes += 1;
      return undefined;
    },
  });
  await health.prime(["http://127.0.0.1:1234/health"]);
  const healthStartedAt = performance.now();
  for (let index = 0; index < iterations; index += 1) {
    await health.check("http://127.0.0.1:1234/health", { mode: "background" });
  }
  const healthElapsedMs = performance.now() - healthStartedAt;

  console.log(
    JSON.stringify(
      {
        runtime: process.version,
        scope:
          "adapter-only synthetic benchmark; cold generation includes three local file reads and JSON parses but excludes Pi module loading, model server startup, GPU, and network",
        coldContractGeneration: {
          samples: coldStartSamples.length,
          p50Ms: percentile(coldStartSamples, 0.5),
          p95Ms: percentile(coldStartSamples, 0.95),
          p99Ms: percentile(coldStartSamples, 0.99),
        },
        generationLookup: {
          iterations,
          elapsedMs: lookupElapsedMs,
          callsPerSecond: (iterations / lookupElapsedMs) * 1_000,
          averageMicroseconds: (lookupElapsedMs / iterations) * 1_000,
        },
        freshBackgroundHealth: {
          iterations,
          elapsedMs: healthElapsedMs,
          callsPerSecond: (iterations / healthElapsedMs) * 1_000,
          averageMicroseconds: (healthElapsedMs / iterations) * 1_000,
          probes,
        },
      },
      null,
      2,
    ),
  );
} finally {
  await rm(fixtureDir, { recursive: true, force: true });
}

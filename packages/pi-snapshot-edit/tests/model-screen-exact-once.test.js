// summary: "Enforces exact-once model-screen claims, atomic publication, complete matrices, and interruption handling."
// read_when:
//   - "Changing model-screen claim files, aggregate publication, or exact-once execution safeguards."

import assert from "node:assert/strict";
import { link, mkdtemp, readdir, readFile, stat, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";
import { aggregateResults } from "../scripts/model-screen-core.mjs";
import {
  ALLOWED_MODELS,
  buildPlan,
  runClaimedSuite,
  writeAtomicJson,
} from "../scripts/run-model-screen.mjs";

const plan = buildPlan(ALLOWED_MODELS, "crossover");
const completeResults = () =>
  plan.map((cell) => ({
    ...cell,
    validJson: true,
    correct: true,
    error: null,
    usage: { input: 1, output: 1, cacheRead: 0, cacheWrite: 0, total: 2, cost: null },
  }));

async function paths() {
  const directory = await mkdtemp(join(tmpdir(), "model-screen-exact-once-"));
  return {
    directory,
    claimPath: join(directory, "crossover.claim.json"),
    outputPath: join(directory, "crossover.aggregate.json"),
  };
}

function options(artifacts, overrides = {}) {
  return {
    suite: "crossover",
    models: ALLOWED_MODELS,
    plan,
    ...artifacts,
    execute: async () => completeResults(),
    ...overrides,
  };
}

test("preexisting claim or output refuses before any executor call", async () => {
  for (const occupied of ["claimPath", "outputPath"]) {
    const artifacts = await paths();
    await writeFile(artifacts[occupied], "occupied", { mode: 0o600 });
    let calls = 0;
    await assert.rejects(
      runClaimedSuite(
        options(artifacts, {
          execute: undefined,
          executor: async () => {
            calls += 1;
            return "";
          },
        }),
      ),
      /already exists/,
    );
    assert.equal(calls, 0);
  }
});

test("destination created at publication boundary is never overwritten", async () => {
  const artifacts = await paths();
  let raced = false;
  await assert.rejects(
    runClaimedSuite(
      options(artifacts, {
        atomicWriter: (path, value, writeOptions = {}) =>
          writeAtomicJson(path, value, {
            ...writeOptions,
            linker: async (temporary, destination) => {
              raced = true;
              await writeFile(destination, "do not replace", { mode: 0o600 });
              return link(temporary, destination);
            },
          }),
      }),
    ),
    /destination already exists; refusing publication/,
  );
  assert.equal(raced, true);
  assert.equal(await readFile(artifacts.outputPath, "utf8"), "do not replace");
  assert.equal(JSON.parse(await readFile(artifacts.claimPath, "utf8")).state, "running");
  assert.deepEqual(await readdir(artifacts.directory), [
    "crossover.aggregate.json",
    "crossover.claim.json",
  ]);
});

test("empty and incomplete matrices write truthful fail-closed aggregates", async () => {
  for (const results of [[], completeResults().slice(1)]) {
    const artifacts = await paths();
    const { aggregate } = await runClaimedSuite(
      options(artifacts, { execute: async () => results }),
    );
    assert.equal(aggregate.matrixComplete, false);
    assert.equal(aggregate.expectedCellCount, 12);
    assert.equal(aggregate.observedCellCount, results.length);
    assert.equal(aggregate.usageComplete, false);
    assert.equal(aggregate.observedTokenTotalsAreLowerBounds, true);
    assert.equal(aggregate.failedClosed, true);
    assert.deepEqual(JSON.parse(await readFile(artifacts.outputPath, "utf8")), aggregate);
  }
});

test("exact 12-cell matrix completes with exactly one attempt per key", async () => {
  const artifacts = await paths();
  const { aggregate } = await runClaimedSuite(options(artifacts));
  assert.equal(aggregate.matrixComplete, true);
  assert.equal(aggregate.expectedCellCount, 12);
  assert.equal(aggregate.observedCellCount, 12);
  assert.equal(aggregate.usageComplete, true);
  assert.equal(aggregate.observedTokenTotalsAreLowerBounds, false);
  assert.equal(aggregate.failedClosed, false);
  assert.ok(aggregate.cells.every((cell) => cell.attempts === 1));

  const duplicate = aggregateResults([...completeResults(), completeResults()[0]], plan);
  assert.equal(duplicate.matrixComplete, false);
  assert.equal(duplicate.failedClosed, true);
});

test("claim and aggregate use 0600 atomic artifacts and content-free claim state", async () => {
  const artifacts = await paths();
  await runClaimedSuite(options(artifacts));
  for (const path of [artifacts.claimPath, artifacts.outputPath])
    assert.equal((await stat(path)).mode & 0o777, 0o600);
  assert.deepEqual(await readdir(artifacts.directory), [
    "crossover.aggregate.json",
    "crossover.claim.json",
  ]);
  const claim = JSON.parse(await readFile(artifacts.claimPath, "utf8"));
  assert.deepEqual(Object.keys(claim), [
    "suite",
    "models",
    "expectedCellKeys",
    "expectedCellCount",
    "state",
  ]);
  assert.equal(claim.state, "completed");
  assert.equal(claim.expectedCellKeys.length, 12);

  const separate = join(artifacts.directory, "atomic.json");
  await writeAtomicJson(separate, { state: "verified" });
  assert.equal((await stat(separate)).mode & 0o777, 0o600);
});

test("interruption retains running claim and creates no aggregate", async () => {
  const artifacts = await paths();
  await assert.rejects(
    runClaimedSuite(
      options(artifacts, {
        execute: async () => {
          throw new Error("simulated interruption");
        },
      }),
    ),
    /simulated interruption/,
  );
  const claim = JSON.parse(await readFile(artifacts.claimPath, "utf8"));
  assert.equal(claim.state, "running");
  await assert.rejects(readFile(artifacts.outputPath), /ENOENT/);
  await assert.rejects(runClaimedSuite(options(artifacts)), /claim already exists/);
});

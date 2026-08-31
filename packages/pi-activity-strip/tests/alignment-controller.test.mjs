import assert from "node:assert/strict";
import test from "node:test";
import { createLatestOnlyRunner } from "../src/common/alignment-controller.mjs";

function deferred() {
  let resolve;
  const promise = new Promise((next) => {
    resolve = next;
  });
  return { promise, resolve };
}

test("latest-only alignment invalidates stale asynchronous geometry work", async () => {
  const firstStarted = deferred();
  const releaseFirst = deferred();
  const observations = [];
  const runner = createLatestOnlyRunner(async ({ generation, isCurrent }) => {
    observations.push({ generation, stage: "start", current: isCurrent() });
    if (generation === 1) {
      firstStarted.resolve();
      await releaseFirst.promise;
      observations.push({ generation, stage: "resume", current: isCurrent() });
    }
  });

  assert.equal(runner.request(), 1);
  await firstStarted.promise;
  assert.equal(runner.request(), 2);
  assert.equal(runner.request(), 3);
  releaseFirst.resolve();
  await runner.waitForIdle();

  assert.deepEqual(observations, [
    { generation: 1, stage: "start", current: true },
    { generation: 1, stage: "resume", current: false },
    { generation: 3, stage: "start", current: true },
  ]);
});

test("latest-only runner cannot drop a request during worker finalization", async () => {
  const release = deferred();
  const generations = [];
  const runner = createLatestOnlyRunner(async ({ generation }) => {
    generations.push(generation);
    if (generation === 1) await release.promise;
  });

  runner.request();
  release.promise.then(() => runner.request());
  release.resolve();
  await new Promise((resolve) => setImmediate(resolve));
  await runner.waitForIdle();

  assert.deepEqual(generations, [1, 2]);
});

test("alignment runner recovers after a best-effort attempt fails", async () => {
  const generations = [];
  const runner = createLatestOnlyRunner(async ({ generation }) => {
    generations.push(generation);
    if (generation === 1) throw new Error("transient compositor failure");
  });

  runner.request();
  await runner.waitForIdle();
  runner.request();
  await runner.waitForIdle();

  assert.deepEqual(generations, [1, 2]);
});

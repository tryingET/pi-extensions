// summary: "Tests launcher reuse, spawn readiness polling, compatibility failures, and starting-state timeouts."
// read_when:
//   - "Changing activity-strip startup, broker readiness checks, or launcher error reporting."

import assert from "node:assert/strict";
import test from "node:test";
import { ensureActivityStripRunning } from "../src/client/launcher.mjs";

test("ensureActivityStripRunning reuses an already ready broker", async () => {
  const result = await ensureActivityStripRunning("/tmp/pi-activity-strip.mjs", {
    async getBrokerStatusImpl() {
      return {
        ok: true,
        runtimeStatus: {
          state: "ready",
          startedAt: Date.now(),
          readyAt: Date.now(),
        },
      };
    },
    async assessCompatibilityImpl() {
      throw new Error("compatibility should not be checked when broker is already ready");
    },
  });

  assert.deepEqual(result, { ok: true, started: false });
});

test("ensureActivityStripRunning waits for overlay readiness after spawning", async () => {
  const statuses = [
    null,
    {
      ok: true,
      runtimeStatus: {
        state: "starting",
        startedAt: Date.now(),
        warnings: ["Detected 2 displays; the strip currently renders on the primary display only."],
      },
    },
    {
      ok: true,
      runtimeStatus: {
        state: "ready",
        startedAt: Date.now(),
        readyAt: Date.now(),
        warnings: [],
      },
    },
  ];
  let spawnCount = 0;

  const result = await ensureActivityStripRunning("/tmp/pi-activity-strip.mjs", {
    timeoutMs: 400,
    async getBrokerStatusImpl() {
      const next = statuses.shift();
      if (!next) {
        throw new Error("not running yet");
      }
      return next;
    },
    async assessCompatibilityImpl() {
      return {
        ok: true,
        blockers: [],
        warnings: [],
      };
    },
    spawnProcess() {
      spawnCount += 1;
    },
  });

  assert.deepEqual(result, { ok: true, started: true });
  assert.equal(spawnCount, 1);
});

test("ensureActivityStripRunning fails closed on compatibility blockers", async () => {
  let spawnCount = 0;

  const result = await ensureActivityStripRunning("/tmp/pi-activity-strip.mjs", {
    async getBrokerStatusImpl() {
      throw new Error("not running yet");
    },
    async assessCompatibilityImpl() {
      return {
        ok: false,
        blockers: ["No graphical display session detected."],
        warnings: [],
      };
    },
    spawnProcess() {
      spawnCount += 1;
    },
  });

  assert.equal(result.ok, false);
  assert.equal(result.started, false);
  assert.match(result.error || "", /No graphical display session detected/i);
  assert.equal(spawnCount, 0);
});

test("ensureActivityStripRunning surfaces starting-state timeout context", async () => {
  let calls = 0;

  const result = await ensureActivityStripRunning("/tmp/pi-activity-strip.mjs", {
    timeoutMs: 20,
    async getBrokerStatusImpl() {
      calls += 1;
      return {
        ok: true,
        runtimeStatus: {
          state: "starting",
          startedAt: Date.now(),
          warnings: [
            "Detected 2 displays; the strip currently renders on the primary display only.",
          ],
        },
      };
    },
    async assessCompatibilityImpl() {
      return {
        ok: true,
        blockers: [],
        warnings: [],
      };
    },
    spawnProcess() {},
  });

  assert.equal(result.ok, false);
  assert.equal(result.started, false);
  assert.match(result.error || "", /overlay is still starting/i);
  assert.match(result.error || "", /primary display only/i);
  assert.ok(calls >= 1);
});

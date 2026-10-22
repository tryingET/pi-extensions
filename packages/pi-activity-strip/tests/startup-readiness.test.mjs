// ---
// summary: "Given/When/Then production readiness regressions distinguish broker liveness from overlay readiness"
// read_when:
//   - "changing launcher, startup waiter, CLI reuse or legacy broker handling"
// ---

import assert from "node:assert/strict";
import { execFile } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";
import { promisify } from "node:util";
import { ActivityStripBroker } from "../src/broker/server.mjs";
import { ensureActivityStripRunning } from "../src/client/launcher.mjs";
import { waitForStartedRuntime } from "../src/client/runtime-lock.mjs";
import { createSocketFixture } from "./support/socket-fixture.mjs";

function productionPong(runtimeStatus) {
  const broker = new ActivityStripBroker({ getRuntimeStatus: () => runtimeStatus });
  let response;
  broker.reply = (_socket, message) => {
    response = message;
  };
  broker.handleMessage(null, JSON.stringify({ type: "ping" }));
  return response;
}

test("Scenario: launcher cannot treat a production pong without overlay metadata as ready", async () => {
  // Given the actual broker ping implementation without a native ready fact,
  const pong = productionPong(undefined);
  assert.equal(pong.ok, true);
  let spawned = 0;
  // When the extension checks startup, Then it refuses readiness and leaves the runtime alone.
  const result = await ensureActivityStripRunning("/unused/bin.mjs", {
    timeoutMs: 0,
    getBrokerStatusImpl: async () => pong,
    assessCompatibilityImpl: async () => ({ ok: true, blockers: [], warnings: [] }),
    spawnProcess: () => {
      spawned += 1;
    },
  });
  assert.equal(result.ok, false);
  assert.equal(result.started, false);
  assert.match(result.error, /without overlay readiness metadata/);
  assert.equal(spawned, 0);
});

test("Scenario: spawned-runtime waiter cannot upgrade liveness into readiness", async () => {
  const pong = productionPong(undefined);
  const result = await waitForStartedRuntime({
    controller: { exitCode: undefined },
    getStatus: async () => pong,
    timeoutMs: 0,
  });
  assert.equal(result.ok, false);
  assert.equal(result.reason, "timeout");
});

for (const waiter of [false, true])
  test(`Scenario: legacy then starting then ready succeeds without replacing another starter (waiter=${waiter})`, async () => {
    const states = [
      undefined,
      { state: "starting", startedAt: 1 },
      { state: "ready", startedAt: 1 },
    ];
    const status = async () => productionPong(states.length > 1 ? states.shift() : states[0]);
    let clock = 0;
    const result = waiter
      ? await waitForStartedRuntime({
          controller: { exitCode: 75 },
          getStatus: status,
          timeoutMs: 500,
          now: () => clock,
          sleep: async (ms) => {
            clock += ms;
          },
        })
      : await ensureActivityStripRunning("/unused/bin.mjs", {
          timeoutMs: 500,
          getBrokerStatusImpl: status,
          assessCompatibilityImpl: async () => ({ ok: true, blockers: [], warnings: [] }),
          spawnProcess: () => assert.fail("existing broker must not be replaced"),
        });
    assert.deepEqual(result, { ok: true, started: false });
  });

for (const state of ["legacy", "starting", "ready"])
  for (const command of ["status", "open"])
    test(`Scenario: CLI ${command} reports ${state} readiness without replacing the runtime`, async (t) => {
      const fixture = createSocketFixture(t, { prefix: "ak7417-ready-" });
      const { root, socketDir, socketPath } = fixture;
      let shutdowns = 0;
      const broker = await fixture.startBroker({
        getRuntimeStatus: () =>
          state === "legacy" ? undefined : { state, startedAt: 1, windowVisible: false },
      });
      broker.on("shutdown-requested", () => {
        shutdowns += 1;
      });
      try {
        const cli = fileURLToPath(new URL("../bin/pi-activity-strip.mjs", import.meta.url));
        let result;
        try {
          const success = await promisify(execFile)(process.execPath, [cli, command], {
            timeout: 3000,
            env: {
              ...process.env,
              PI_ACTIVITY_STRIP_SOCKET_DIR: socketDir,
              PI_ACTIVITY_STRIP_SOCKET_PATH: socketPath,
              PI_ACTIVITY_STRIP_AUTO_START: "0",
            },
          });
          result = { code: 0, ...success };
        } catch (error) {
          result = error;
        }
        assert.equal(
          result.code,
          state === "ready" ? 0 : 1,
          "only explicit readiness succeeds, including a correctly hidden surface",
        );
        assert.match(
          `${result.stdout}${result.stderr}`,
          state === "legacy"
            ? /readiness metadata/
            : state === "ready"
              ? /ready|already running/
              : /starting/,
        );
        assert.equal(shutdowns, 0, "observation never stops a live unknown/starting broker");
        assert.equal(
          fs.existsSync(path.join(root, "runtime.lock")),
          false,
          "no replacement was spawned",
        );
      } finally {
        await fixture.cleanup();
      }
    });

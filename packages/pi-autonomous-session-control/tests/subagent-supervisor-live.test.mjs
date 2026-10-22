import assert from "node:assert/strict";
import { once } from "node:events";
import { readFile } from "node:fs/promises";
import { join } from "node:path";
import test from "node:test";
import { createSubagentState, spawnSubagentWithSpawn } from "../extensions/self/subagent.ts";
import {
  processIsAlive,
  resistantRawPi,
  spawnSupervisedFixture,
  waitForRawChildFixture,
  withFakePiOnPath,
} from "./subagent-transport-harness.mjs";

// Whole-test watchdog, not a teardown latency target: admission (5s), process
// and group checks (1s + 4s), and fixture cleanup (4s) retain their own bounds.
const TEST_TIMEOUT_MS = 15_000;

for (const { stopSignal, delayedObservation } of [
  { stopSignal: "SIGTERM", delayedObservation: false },
  { stopSignal: "SIGKILL", delayedObservation: false },
  { stopSignal: "SIGTERM", delayedObservation: true },
]) {
  const cause = stopSignal === "SIGTERM" ? "parent startup timeout" : "helper SIGKILL";
  const observation = delayedObservation ? " with delayed parent close observation" : "";
  const name = `raw supervisor kills the complete managed group after ${cause}${observation}`;
  test(name, { timeout: TEST_TIMEOUT_MS }, async (t) => {
    await withFakePiOnPath(resistantRawPi, async (tempRoot) => {
      const rawPidPath = join(tempRoot, "raw-pi.pid");
      const helper = spawnSupervisedFixture(tempRoot);
      helper.stderr?.resume();
      // A watchdog failure must also release a stuck exit wait so the fixture
      // can prove closure/group quiescence before deleting its scratch.
      const onAbort = () => {
        if (helper.exitCode === null && helper.signalCode === null) helper.kill("SIGKILL");
      };
      t.signal.addEventListener("abort", onAbort, { once: true });
      try {
        const [rawPid, descendantPid] = await waitForRawChildFixture(helper);
        assert.deepEqual((await readFile(rawPidPath, "utf8")).trim().split(/\s+/).map(Number), [
          rawPid,
          descendantPid,
        ]);
        assert.equal(typeof rawPid, "number");
        assert.equal(typeof descendantPid, "number");
        assert.ok(Number.isSafeInteger(rawPid) && rawPid > 0);
        assert.ok(Number.isSafeInteger(descendantPid) && descendantPid > 0);
        assert.equal(processIsAlive(rawPid), true, "raw child must exist before stop");
        assert.equal(processIsAlive(descendantPid), true, "descendant must exist before stop");
        const stat = await readFile(`/proc/${rawPid}/stat`, "utf8");
        const processGroupId = Number(
          stat
            .slice(stat.lastIndexOf(")") + 1)
            .trim()
            .split(/\s+/)[2],
        );
        assert.ok(Number.isSafeInteger(processGroupId) && processGroupId > 0);
        const helperExit = once(helper, "exit");
        const stopStartedAt = Date.now();
        let observationDelayed = false;
        if (delayedObservation) {
          helper.prependOnceListener("close", () => {
            // Real OS exit has occurred. Stall this observer's event loop before
            // the parent's close handler, as under scheduling contention. Do not
            // fake exit, intercept signals, or change any production deadline.
            Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, 800);
            observationDelayed = true;
          });
        }
        if (stopSignal === "SIGTERM") {
          // Attach the parent only after the real raw-child barrier. The fixture
          // has consumed readiness; no further events arrive, so the unchanged
          // 250ms parent startup deadline causes the stop, not a manual signal.
          const state = createSubagentState(join(tempRoot, "sessions"));
          const result = await spawnSubagentWithSpawn(
            {
              name: "timeout-reaps-raw-pi",
              objective: "Review changes",
              tools: "read,bash",
              sessionFile: join(state.sessionsDir, "timeout-reaps-raw-pi.json"),
              timeout: 5_000,
              startupTimeout: 250,
            },
            "test/model",
            { cwd: tempRoot },
            state,
            () => helper,
          );
          assert.equal(result.status, "timeout");
          assert.equal(result.timedOut, true);
          assert.equal(result.timeoutPhase, "startup");
          assert.equal(result.output, "Subagent timed out during startup after 250ms");
          if (delayedObservation) {
            assert.equal(observationDelayed, true);
            // A counterexample to both former <750ms proxies, not a new SLA.
            assert.ok(result.elapsed >= 750, "result must include delayed observation");
            assert.ok(Date.now() - stopStartedAt >= 750);
          }
        } else {
          helper.kill(stopSignal);
        }
        const [code, signal] = await helperExit;
        if (stopSignal === "SIGTERM") {
          // Prove the resistant raw child is gone when the helper exits on its
          // own. Exit status plus the complete parent signal history prove
          // graceful exit without force-kill; observer latency cannot prove it.
          assert.equal(code, 143);
          assert.equal(signal, null, "helper must exit before parent force-kill");
          assert.deepEqual(helper.fixtureSignals, ["SIGTERM"], "parent must not send SIGKILL");
          assert.equal(processIsAlive(rawPid), false);
        } else {
          assert.equal(signal, "SIGKILL");
        }
        helper.stdout?.resume();
        for (
          let attempt = 0;
          attempt < 100 && (processIsAlive(rawPid) || processIsAlive(descendantPid));
          attempt += 1
        ) {
          await new Promise((resolve) => setTimeout(resolve, 10));
        }
        assert.equal(processIsAlive(rawPid), false);
        assert.equal(processIsAlive(descendantPid), false);
        let groupQuiescent = false;
        for (let attempt = 0; attempt < 400 && !groupQuiescent; attempt += 1) {
          try {
            process.kill(-processGroupId, 0);
          } catch (error) {
            if (error?.code === "ESRCH") groupQuiescent = true;
          }
          if (!groupQuiescent) await new Promise((resolve) => setTimeout(resolve, 10));
        }
        assert.equal(groupQuiescent, true, "managed process-group identity remained live");
      } finally {
        t.signal.removeEventListener("abort", onAbort);
        if (helper.exitCode === null && helper.signalCode === null) helper.kill("SIGKILL");
      }
    });
  });
}

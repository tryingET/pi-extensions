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

for (const stopSignal of ["SIGTERM", "SIGKILL"]) {
  const cause = stopSignal === "SIGTERM" ? "parent startup timeout" : "helper SIGKILL";
  test(`raw supervisor kills the complete managed group after ${cause}`, async () => {
    await withFakePiOnPath(resistantRawPi, async (tempRoot) => {
      const rawPidPath = join(tempRoot, "raw-pi.pid");
      const helper = spawnSupervisedFixture(tempRoot);
      helper.stderr?.resume();
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
          assert.ok(
            result.elapsed < 750,
            `expected timeout teardown under 750ms, got ${result.elapsed}`,
          );
        } else {
          helper.kill(stopSignal);
        }
        const [code, signal] = await helperExit;
        if (stopSignal === "SIGTERM") {
          // Prove the resistant raw child is gone when the helper exits on its
          // own, independently of how quickly the helper initially boots.
          assert.equal(code, 143);
          assert.equal(signal, null, "helper must exit before parent force-kill");
          assert.deepEqual(helper.fixtureSignals, ["SIGTERM"], "parent must not send SIGKILL");
          assert.equal(processIsAlive(rawPid), false);
          assert.ok(Date.now() - stopStartedAt < 750, "timeout teardown exceeded 750ms");
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
        if (helper.exitCode === null && helper.signalCode === null) helper.kill("SIGKILL");
      }
    });
  });
}

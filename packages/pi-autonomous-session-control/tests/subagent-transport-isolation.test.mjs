import assert from "node:assert/strict";
import childProcess from "node:child_process";
import { once } from "node:events";
import { existsSync, readFileSync } from "node:fs";
import { mkdtemp, readdir, readFile, rm, stat, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";
import {
  processIsAlive,
  resistantRawPi,
  spawnSupervisedFixture,
  waitForRawChildFixture,
  withFakePiOnPath,
  withTemporaryEnv,
} from "./subagent-transport-harness.mjs";

function assertQuiescent(records) {
  for (const record of records) {
    assert.equal(record.closed, true, "helper pipes must be closed");
    assert.ok(record.groups.size > 0, "quiescence requires known custody");
    for (const group of record.groups) {
      assert.throws(() => process.kill(-group, 0), { code: "ESRCH" });
    }
  }
}

test("fixture excludes inherited nonsecret auth and removes SIGKILL scratch only after quiescence", async () => {
  const source = await mkdtemp(join(tmpdir(), "asc-synthetic-auth-source-"));
  const auth = '{"token":"NONSECRET-EXTERNAL-AUTH-SENTINEL"}\n';
  const subscription = '{"token":"NONSECRET-EXTERNAL-SUBSCRIPTION-SENTINEL"}\n';
  await writeFile(join(source, "auth.json"), auth);
  await writeFile(join(source, "multi-pass.json"), subscription);
  const originalSpawn = childProcess.spawn;
  let ownedRoot;
  let records;
  try {
    await withTemporaryEnv({ PI_CODING_AGENT_DIR: source }, async () => {
      const previousTmp = process.env.TMPDIR;
      await withFakePiOnPath(resistantRawPi, async (root, fixture) => {
        ownedRoot = root;
        records = fixture.records;
        assert.equal(process.env.PI_CODING_AGENT_DIR, fixture.agentDir);
        assert.notEqual(fixture.agentDir, source);
        assert.equal((await stat(fixture.agentDir)).mode & 0o777, 0o700);
        assert.deepEqual(await readdir(fixture.agentDir), []);
        assert.equal(process.env.TMPDIR, fixture.scratchDir);
        const helper = spawnSupervisedFixture(root);
        helper.stderr.resume();
        await waitForRawChildFixture(helper);
        const isolated = await readFile(join(root, "raw-pi.pid.agent-dir"), "utf8");
        assert.ok(isolated.startsWith(`${fixture.scratchDir}/pi-subagent-agent-dir-`));
        assert.equal(existsSync(join(isolated, "auth.json")), false);
        assert.equal(existsSync(join(isolated, "multi-pass.json")), false);
        assert.equal((await readFile(join(isolated, "settings.json"), "utf8")).trim(), "{}");
        const close = once(helper, "close");
        helper.kill("SIGKILL");
        await close;
        // SIGKILL may leave the isolated directory, but never inherited auth.
        assert.equal(existsSync(join(isolated, "auth.json")), false);
      });
      assertQuiescent(records);
      assert.equal(existsSync(ownedRoot), false);
      assert.equal(process.env.PI_CODING_AGENT_DIR, source);
      assert.equal(process.env.TMPDIR, previousTmp);
      assert.equal(childProcess.spawn, originalSpawn);
      assert.equal(await readFile(join(source, "auth.json"), "utf8"), auth);
      assert.equal(await readFile(join(source, "multi-pass.json"), "utf8"), subscription);
    });
  } finally {
    await rm(source, { recursive: true, force: true });
  }
});

test("fixture cleanup does not swallow falsy callback failures", async () => {
  for (const reason of [0, null, undefined, false, ""]) {
    let caught = false;
    let root;
    try {
      await withFakePiOnPath("#!/usr/bin/env bash\nexit 0\n", async (ownedRoot) => {
        root = ownedRoot;
        throw reason;
      });
    } catch (error) {
      caught = true;
      assert.equal(error, reason);
    }
    assert.equal(caught, true);
    assert.equal(existsSync(root), false);
  }
});

test("fixture assertion failure still waits helper closure, descendant death and group quiescence", async () => {
  let root;
  let records;
  let pids;
  await assert.rejects(
    withFakePiOnPath(resistantRawPi, async (ownedRoot, fixture) => {
      root = ownedRoot;
      records = fixture.records;
      const helper = spawnSupervisedFixture(root);
      helper.stderr.resume();
      pids = await waitForRawChildFixture(helper);
      throw new Error("deliberate fixture assertion failure");
    }),
    /deliberate fixture assertion failure/,
  );
  assertQuiescent(records);
  for (const pid of pids) assert.equal(processIsAlive(pid), false);
  assert.equal(existsSync(root), false);
});

test("fixture preserves owned scratch when independent cleanup inspection is uncertain", async () => {
  let root;
  let records;
  const previousEnv = { agent: process.env.PI_CODING_AGENT_DIR, tmp: process.env.TMPDIR };
  const originalSpawn = childProcess.spawn;
  try {
    await assert.rejects(
      withFakePiOnPath(resistantRawPi, async (ownedRoot, fixture) => {
        root = ownedRoot;
        records = fixture.records;
        const helper = spawnSupervisedFixture(root);
        helper.stderr.resume();
        await waitForRawChildFixture(helper);
        // Synthetic nonsecret inspection failure: cleanup must not infer safety.
        records[0].inspectionError = new Error("synthetic custody inspection uncertainty");
        throw new Error("deliberate callback failure");
      }),
      /Fixture cleanup uncertain; preserved/,
    );
    assert.equal(existsSync(root), true);
    assert.equal(process.env.PI_CODING_AGENT_DIR, previousEnv.agent);
    assert.equal(process.env.TMPDIR, previousEnv.tmp);
    assert.equal(childProcess.spawn, originalSpawn);
  } finally {
    // This test owns the preserved path; independently prove inactivity before removal.
    if (root) {
      assertQuiescent(records);
      await rm(root, { recursive: true, force: true });
    }
  }
});

test("fixture refuses deletion when a closed helper has no retained custody proof", async () => {
  let root;
  let records;
  let knownGroups;
  try {
    await assert.rejects(
      withFakePiOnPath(resistantRawPi, async (ownedRoot, fixture) => {
        root = ownedRoot;
        records = fixture.records;
        const helper = spawnSupervisedFixture(root);
        helper.stderr.resume();
        await waitForRawChildFixture(helper);
        const close = once(helper, "close");
        helper.kill("SIGTERM");
        await close;
        knownGroups = [...records[0].groups];
        assert.ok(knownGroups.length > 0);
        // Erase fixture evidence only after closure; sampling cannot reacquire it.
        records[0].groups.clear();
        delete records[0].custody;
      }),
      /Fixture cleanup uncertain; preserved/,
    );
    assert.equal(existsSync(root), true);
    assert.equal(records[0].groups.size, 0);
  } finally {
    if (root) {
      // Separate retained test evidence, not the now-unknown fixture record.
      assert.equal(records[0].closed, true);
      assert.ok(knownGroups?.length > 0);
      for (const group of knownGroups) {
        assert.throws(() => process.kill(-group, 0), { code: "ESRCH" });
      }
      await rm(root, { recursive: true, force: true });
    }
  }
});

test("missing raw-child barrier after agent_start expires fixture admission and cleans the group", async () => {
  let root;
  let records;
  let pids;
  let cleared = false;
  await assert.rejects(
    withFakePiOnPath(
      resistantRawPi.replace(
        '  console.log("raw-child-ready " + process.pid + " " + descendant.pid);',
        "",
      ),
      async (ownedRoot, fixture) => {
        root = ownedRoot;
        records = fixture.records;
        const helper = spawnSupervisedFixture(root);
        helper.stderr.resume();
        let expire;
        const onReady = () => {
          if (!records[0].custody) return;
          // transport_ready is emitted by this helper only after agent_start.
          helper.stdout.off("data", onReady);
          queueMicrotask(expire);
        };
        helper.stdout.on("data", onReady);
        try {
          await waitForRawChildFixture(helper, {
            setAdmissionTimeout(callback, milliseconds) {
              assert.equal(milliseconds, 5_000);
              expire = callback;
              return "fixture-admission";
            },
            clearAdmissionTimeout(timer) {
              assert.equal(timer, "fixture-admission");
              cleared = true;
            },
          });
        } catch (error) {
          pids = (await readFile(join(root, "raw-pi.pid"), "utf8")).trim().split(/\s+/).map(Number);
          for (const pid of pids) assert.equal(processIsAlive(pid), true);
          throw error;
        } finally {
          helper.stdout.off("data", onReady);
        }
      },
    ),
    /raw-child fixture admission timed out after 5000ms/,
  );
  assert.equal(cleared, true);
  assert.ok(pids, "must reach agent_start before injecting admission expiry");
  assertQuiescent(records);
  for (const pid of pids) assert.equal(processIsAlive(pid), false);
  assert.equal(existsSync(root), false);
});

test("buffered transport custody survives unobserved helper completion while the parent event loop is blocked", async () => {
  let root;
  let records;
  await withFakePiOnPath(
    [
      "#!/usr/bin/env node",
      'console.log(JSON.stringify({ type: "agent_start" }));',
      'require("node:fs").writeFileSync(process.env.PI_PROVENANCE_OUTPUT_FILE, String(Date.now()));',
      "",
    ].join("\n"),
    async (ownedRoot, fixture) => {
      root = ownedRoot;
      records = fixture.records;
      const helper = spawnSupervisedFixture(root);
      const close = once(helper, "close");
      assert.equal(helper.stdout.listenerCount("data"), 0);
      assert.equal(helper.stdout.readableFlowing, null);
      const pausedAt = Date.now();
      // Wait for the causal condition, not an assumed cold-start duration. No
      // parent callback can sample custody while this synchronous loop runs.
      const pause = new Int32Array(new SharedArrayBuffer(4));
      let helperState;
      do {
        const stat = readFileSync(`/proc/${helper.pid}/stat`, "utf8");
        helperState = stat
          .slice(stat.lastIndexOf(")") + 1)
          .trim()
          .split(/\s+/)[0];
        if (helperState !== "Z") Atomics.wait(pause, 0, 0, 10);
      } while (helperState !== "Z" && Date.now() - pausedAt < 5_000);
      assert.equal(
        helperState,
        "Z",
        "fixture helper must finish within its existing admission budget",
      );
      const finishedAt = Number(readFileSync(join(root, "raw-pi.pid"), "utf8"));
      assert.ok(finishedAt >= pausedAt && finishedAt < Date.now());
      // Synchronous /proc evidence precedes ANY parent timer, data or exit callback.
      const helperStat = readFileSync(`/proc/${helper.pid}/stat`, "utf8");
      assert.equal(
        helperStat
          .slice(helperStat.lastIndexOf(")") + 1)
          .trim()
          .split(/\s+/)[0],
        "Z",
      );
      assert.equal(records[0].closed, false);
      assert.equal(records[0].exited, false);
      assert.equal(records[0].groups.size, 0, "polling cannot have observed this supervisor");
      assert.equal(records[0].custody, undefined);
      const [code, signal] = await close;
      assert.equal(code, 0);
      assert.equal(signal, null);
      assert.ok(Object.isFrozen(records[0].custody));
      assert.deepEqual([...records[0].groups], [records[0].custody.rawChildProcessGroupId]);
      assert.deepEqual(helper.fixtureSignals, [], "helper completed without fixture signals");
    },
  );
  assertQuiescent(records);
  assert.equal(existsSync(root), false);
});

// A living PID is deliberately insufficient: no descendant ACK means no ready barrier.
test("invalid descendant ACK fails readiness and still cleans the live process group", async () => {
  let root;
  let records;
  await assert.rejects(
    withFakePiOnPath(
      resistantRawPi.replace("term-handler-ready", "invalid-ack"),
      async (ownedRoot, fixture) => {
        root = ownedRoot;
        records = fixture.records;
        const helper = spawnSupervisedFixture(root);
        helper.stderr.resume();
        await waitForRawChildFixture(helper);
      },
    ),
    /helper exited before raw-child barrier/,
  );
  assertQuiescent(records);
  assert.equal(existsSync(root), false);
});

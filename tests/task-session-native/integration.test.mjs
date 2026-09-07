import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";
import { pendingNativeCases } from "./coverage.mjs";
import {
  available,
  delay,
  hostAlive,
  native,
  setup,
  signalOwnedHost,
  startSupervisor,
  trace,
  wait,
} from "./fixture.mjs";
import { claimEffects, exchange } from "./oracles.mjs";
import { canonical, digest, json, verifyPins } from "./pins.mjs";

const here = dirname(fileURLToPath(import.meta.url));
// Deliberate fail, not skip/pass, when invoked without a verified export.
assert(
  process.env.TASK_SESSION_NATIVE_PINS,
  "PENDING_ARTIFACT: run through scripts/task-session-native-integration.mjs",
);
const pins = await verifyPins(json(process.env.TASK_SESSION_NATIVE_PINS));
const cases = [
  "complete-recover",
  "baseline-drift",
  "commit-result-loss",
  "host-failure",
  "helper-failure",
  "envelope-mismatch",
  "profile-mismatch",
  "pin-mismatch",
  "namespace-after-closed",
  "domain-after-send",
  "lease-after-closed",
  "closed-loss",
  "post-closed-persistence",
  "corrupt-t1",
  "policy-before-t2",
];
for (const scenario of cases)
  test(`ACTUAL native AK + sealed Pi: ${scenario}`, { timeout: 240000 }, async (t) => {
    const f = await setup(pins, scenario);
    t.diagnostic(`owned synthetic evidence retained: ${f.root}`);
    const { launchReserved } = await import(`${f.dist}/launch.js`);
    const { encodeTaskSessionStartup } = await import(`${f.dist}/producer-adapter.js`);
    let viewer, supervisor, attempt, baseline, launchError, monitor, monitorError;
    const touch = (name) => writeFileSync(join(f.root, name), "owned harness checkpoint");
    let dir;
    async function monitorHost() {
      await wait(
        () => existsSync(join(f.root, "host-pid.json")) || supervisor.child.exitCode !== null,
        "host entry",
      );
      if (scenario === "envelope-mismatch") return;
      if (scenario === "pin-mismatch") {
        await wait(() => existsSync(join(f.root, "host-result.json")), "pin refusal");
        assert.equal(json(join(f.root, "host-result.json")).sends, 0);
        assert.equal(json(join(f.root, "host-result.json")).reason, "producer_binding_mismatch");
        assert(available(f.lock), "pin mismatch must precede T0");
        supervisor.child.kill("SIGTERM");
        return;
      }
      if (scenario === "commit-result-loss") {
        const exit = await supervisor.done;
        assert.notEqual(exit.code, 0);
        assert(hostAlive(f), "surviving Pi host owns inherited OFD");
        assert(!available(f.lock), "failed native result must not unlock surviving host");
        return;
      }
      await wait(
        () =>
          trace(f.root).some((e) => e.value?.kind === "ADMISSION_RESULT") ||
          existsSync(join(f.root, "host-result.json")),
        "actual admission",
      );
      assert(
        trace(f.root).some((e) => e.value?.kind === "ADMISSION_RESULT"),
        "producer failed before admission; inspect retained logs",
      );
      await wait(() => trace(f.root).some((e) => e.event === "fd-custody"), "CLOEXEC observation");
      const custody = trace(f.root).find((e) => e.event === "fd-custody");
      assert(custody.held.length >= 1);
      assert.equal(custody.ordinaryExecExit, 0);
      assert.equal(custody.ordinaryExecLeaked, false);
      for (const fd of custody.held) {
        const flags = /^flags:\s+(\d+)/m.exec(fd.info);
        assert(flags && (Number.parseInt(flags[1], 8) & 0o2000000) !== 0, "retained FD is CLOEXEC");
      }
      assert(!available(f.lock), "independent OFD excluded after actual native result");
      assert(!trace(f.root).some((e) => e.event === "fetch"));
      if (scenario === "helper-failure") {
        supervisor.child.kill("SIGKILL");
        await supervisor.done;
        assert(hostAlive(f));
        assert(!available(f.lock), "host retains custody after helper death");
        touch("allow-admission");
        touch("allow-t1");
        return;
      }
      if (scenario === "host-failure") {
        signalOwnedHost(f);
        return;
      }
      touch("allow-admission");
      await wait(() => existsSync(join(dir, "t1.json")), "durable T1");
      const t1 = json(join(dir, "t1.json"));
      const admission = json(join(dir, "ak-admission.json"));
      if (scenario === "baseline-drift") {
        assert.equal(admission.body.outcome, "DENIED");
        assert.equal(admission.body.effects, "not_attempted");
        assert.equal(t1.body.outcome, "DENIED");
      }
      assert.deepEqual(t1.binding, admission.binding);
      assert.equal(t1.body.admission_digest, digest(admission));
      assert.equal(t1.body.no_dispatch, true);
      assert.equal(readFileSync(join(dir, "t1.json"), "utf8").trim(), canonical(t1));
      assert(!available(f.lock), "T1 alone must not unlock");
      assert(!existsSync(join(dir, "dispatch.json")));
      if (scenario === "corrupt-t1") writeFileSync(join(dir, "t1.json"), "{}");
      if (scenario === "policy-before-t2") writeFileSync(join(f.root, "policy.json"), "{}");
      touch("allow-t1");
      if (["corrupt-t1", "policy-before-t2"].includes(scenario)) {
        assert.notEqual((await supervisor.done).code, 0);
        assert(hostAlive(f));
        assert(!available(f.lock));
        return;
      }
      await wait(() => trace(f.root).some((e) => e.value?.kind === "CLOSED"), "private CLOSED");
      assert(available(f.lock), "T2 actually unlocked before CLOSED consumption");
      assert(!trace(f.root).some((e) => e.event === "fetch"));
      if (scenario === "namespace-after-closed") {
        const snapshot = json(join(f.root, "state.json"));
        snapshot.withdrawn = true;
        f.state.durableWrite(join(f.root, "state.json"), snapshot);
      }
      if (scenario === "post-closed-persistence")
        mkdirSync(join(dir, "dispatch.json"), { mode: 0o700 });
      if (scenario === "lease-after-closed") {
        // Real wall time, no Date monkeypatch or fake lease tuple.
        await delay(
          Math.max(0, Date.parse(admission.body.claim.lease_expires_at) - Date.now()) + 100,
        );
      }
      touch("allow-closed");
    }
    try {
      try {
        await launchReserved(f.request, f.locator, {
          plan: async () => {
            baseline = native(pins, f.root, "--inspect");
            return {
              protocol: "ak.task-session.baseline.v1",
              evaluated_at: new Date().toISOString(),
              baseline_digest: digest(baseline),
              baseline,
            };
          },
          openViewer: async (id) => {
            attempt = f.state.readSnapshot(f.locator).attempts[0];
            dir = join(f.root, "attempts", attempt.attempt, attempt.incarnation);
            viewer = spawn(process.execPath, [join(here, "viewer.mjs"), f.root, id], {
              cwd: f.root,
              stdio: "ignore",
              env: { PATH: "/usr/bin:/bin", HOME: join(f.root, "home"), PI_OFFLINE: "1" },
            });
            return { ok: true };
          },
          supervise: async (input) => {
            if (scenario === "baseline-drift") native(pins, f.root, "--drift");
            supervisor = startSupervisor(f, encodeTaskSessionStartup(input));
            monitor = monitorHost().catch((error) => {
              monitorError = error;
              throw error;
            });
            // Observe monitor failures immediately while the real helper is still running.
            const result = await Promise.all([supervisor.done, monitor]).then(([r]) => r);
            if (result.code !== 0) throw Error(`supervisor_exit_${result.code}_${result.signal}`);
          },
        });
      } catch (error) {
        launchError = error;
      }
      // A failing oracle must never be swallowed as an expected launch refusal.
      assert.ifError(monitorError);
      if (scenario === "profile-mismatch") {
        assert.match(launchError?.message ?? "", /model_pin_mismatch/);
        assert.equal(f.state.readSnapshot(f.locator).attempts.length, 0);
        assert(!supervisor && !viewer);
        assert.equal(native(pins, f.root, "--inspect").task.status, "pending");
        return;
      }
      if (scenario !== "host-failure")
        await wait(() => existsSync(join(f.root, "host-result.json")), "host terminal result");
      const events = trace(f.root),
        sends = events.filter((e) => e.event === "fetch");
      assert.equal(events.filter((e) => e.event === "forbidden-fetch").length, 0);
      const expectedSends =
        scenario === "complete-recover" ? 2 : scenario === "domain-after-send" ? 1 : 0;
      assert.equal(
        sends.length,
        expectedSends,
        JSON.stringify({ launchError: launchError?.message, events }),
      );
      const proof = join(f.checkout, "src/proof.txt");
      assert.equal(existsSync(proof), scenario === "complete-recover");
      if (expectedSends) {
        const closedIndex = events.findIndex((e) => e.value?.kind === "CLOSED");
        assert(closedIndex >= 0 && closedIndex < events.findIndex((e) => e.event === "fetch"));
        for (const send of sends) {
          assert(
            send.lockAvailable &&
              send.accountMatches &&
              send.authorizationMatches &&
              send.hasObjective,
          );
          assert.equal(send.model, "gpt-5.4");
          assert.equal(send.reasoning.effort, "high");
          assert.equal(send.stream, true);
          assert.match(send.url, /^https:\/\/chatgpt\.com\/backend-api\/codex\/responses$/);
        }
      }
      const retained = f.state.readSnapshot(f.locator).attempts;
      assert.equal(retained.length, 1);
      for (const key of ["hostClosed", "effectsDisposed", "claimResolved"])
        assert.equal(retained[0][key], false);
      if (scenario !== "domain-after-send") {
        let effects = 0;
        const again = await launchReserved(f.request, f.locator, {
          plan: async () => {
            effects++;
          },
          openViewer: async () => {
            effects++;
          },
          supervise: async () => {
            effects++;
          },
        });
        assert.equal(again.status, "existing");
        assert.equal(effects, 0, "retained reservation must not relaunch");
      }
      // Do not inspect a synthetic DB while the real inherited native interval remains held.
      touch("release-owned-host");
      touch("allow-admission");
      touch("allow-t1");
      touch("allow-closed");
      await wait(() => !hostAlive(f), "owned host closure");
      await supervisor?.done;
      assert(available(f.lock));
      assert.equal(readFileSync(f.lock).length, 0);
      const after = native(pins, f.root, "--inspect");
      const noClaim = ["baseline-drift", "pin-mismatch", "envelope-mismatch"].includes(scenario);
      assert.equal(after.task.status, noClaim ? "pending" : "claimed");
      assert.equal(after.task.entity_version, noClaim ? 1 : 2);
      if (scenario === "commit-result-loss")
        assert(
          !existsSync(join(dir, "ak-admission.json")),
          "no fabricated admission after failed result",
        );
      if (scenario === "complete-recover") {
        assert.ifError(launchError);
        const admission = json(join(dir, "ak-admission.json"));
        exchange(events, admission, json(join(dir, "t1.json")), after);
        claimEffects(baseline, after, admission.body.claim);
        assert.equal(digest(after), admission.body.readback_digest);
        assert.equal(admission.body.claim.claimed_by, after.task.claimed_by);
        assert.equal(admission.body.claim.version, after.task.entity_version);
        assert.equal(readFileSync(proof, "utf8"), "task5513 native SDK proof");
        assert(sends[1].hasToolResult, "actual SDK tool result serialized into second send");
        assert.equal(json(join(dir, "host-closure.json")).future_dispatch_closed, true);
        const request = {
          schema: "ak.task-session.recovery.v1",
          attempt: attempt.attempt,
          incarnation: attempt.incarnation,
          claim: admission.body.claim,
        };
        assert.notEqual(
          (await startSupervisor(f, request, "recover").done).code,
          0,
          "missing effect disposition refuses",
        );
        assert(!existsSync(join(dir, "ak-recovery-started.json")));
        // Test owns the only synthetic started effect: the completed SDK write (no shell descendants).
        f.state.durableWrite(
          join(dir, "effect-disposition.json"),
          {
            schema: "pi.task-session.effect-disposition.v1",
            attempt: attempt.attempt,
            incarnation: attempt.incarnation,
            started_effects_disposed: true,
            owner_receipt_digest: digest({
              proof: readFileSync(proof, "utf8"),
              sends: sends.length,
              hostExited: !hostAlive(f),
            }),
          },
          true,
        );
        const recovered = await startSupervisor(f, request, "recover").done;
        assert.equal(recovered.code, 0, recovered.err);
        assert.equal(JSON.parse(recovered.out).outcome, "RECOVERED");
        const final = native(pins, f.root, "--inspect");
        assert.equal(final.task.status, "pending");
        assert.equal(final.task.entity_version, 3);
        assert.equal(final.task.claimed_by, null);
        assert.notEqual(
          (await startSupervisor(f, request, "recover").done).code,
          0,
          "explicit recovery is not replayable",
        );
        assert.equal(
          f.state.readSnapshot(f.locator).attempts[0].claimResolved,
          false,
          "AK recovery is not Pi occupancy retirement",
        );
      }
    } finally {
      // Only this case's owned identities; no scratch deletion or other-worker actions.
      for (const name of [
        "release-owned-host",
        "allow-admission",
        "allow-t1",
        "allow-closed",
        "quit-viewer",
      ])
        touch(name);
      if (supervisor && supervisor.child.exitCode === null && supervisor.child.signalCode === null)
        supervisor.child.kill("SIGTERM");
      await supervisor?.done;
      if (hostAlive(f)) signalOwnedHost(f);
      await wait(() => !hostAlive(f), "cleanup owned host", 5000);
      if (viewer) {
        await wait(
          () => viewer.exitCode !== null || viewer.signalCode !== null,
          "viewer exit",
          5000,
        );
      }
      await monitor?.catch(() => {});
      writeFileSync(
        join(f.root, "harness-end.json"),
        JSON.stringify({
          scenario,
          piHead: pins.pi.head,
          akHead: pins.ak.head,
          launchError: launchError?.message ?? null,
        }),
      );
    }
  });
for (const gap of pendingNativeCases) test.todo(gap);
test.after(async () => {
  await verifyPins(pins);
});

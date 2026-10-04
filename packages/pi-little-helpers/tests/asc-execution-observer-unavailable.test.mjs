import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { once } from "node:events";
import { chmodSync, mkdtempSync, renameSync, rmSync, unlinkSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";
import { setTimeout as delay } from "node:timers/promises";

const scriptPath = new URL("../scripts/asc-execution-observer.mjs", import.meta.url);
const clearScreen = "\u001b[2J\u001b[H";
const instance = "unavailable-renderer-test";

function snapshot(overrides = {}) {
  const now = Date.now();
  return {
    schema: "pi.asc_execution_observer_state.v1",
    group: { id: "test", kind: "dispatch", label: "Remembered dispatch" },
    controllerInstanceId: instance,
    ownerPid: process.pid,
    controllerActive: true,
    createdAt: new Date(now - 20_000).toISOString(),
    updatedAt: new Date(now).toISOString(),
    lastObservationAt: now,
    lastActivityAt: now,
    status: "running",
    activeDispatch: {
      latestTool: "bash",
      profile: "reviewer",
      dispatchId: "dispatch-remembered",
      usage: { turns: 2, input: 100, output: 20 },
    },
    phases: [{ name: "inspect", index: 1, count: 2, status: "running" }],
    ...overrides,
  };
}

function renderer(t, initial = snapshot(), env = {}) {
  const root = mkdtempSync(join(tmpdir(), "pi-asc-unavailable-"));
  chmodSync(root, 0o700);
  const statePath = join(root, "state.json");
  function write(state, mode = 0o600) {
    const temporary = join(root, "replacement.json");
    writeFileSync(temporary, `${JSON.stringify(state)}\n`, { mode });
    chmodSync(temporary, mode);
    renameSync(temporary, statePath);
  }
  if (initial) write(initial);
  const child = spawn(
    process.execPath,
    [scriptPath.pathname, "--state", statePath, "--controller-instance", instance],
    {
      env: {
        ...process.env,
        PI_ASC_OBSERVER_LIVENESS_LEASE_MS: "15000",
        PI_ASC_OBSERVER_QUIET_MS: "60000",
        PI_ASC_OBSERVER_STALLED_MS: "300000",
        PI_ASC_OBSERVER_DISCONNECTED_HOLD_MS: "30000",
        PI_ASC_OBSERVER_SUCCESS_HOLD_MS: "15000",
        PI_ASC_OBSERVER_FAILURE_HOLD_MS: "60000",
        ...env,
      },
      stdio: ["ignore", "pipe", "pipe"],
    },
  );
  const closed = once(child, "close");
  const watchdog = setTimeout(() => child.kill("SIGKILL"), 7000);
  let output = "";
  let stderr = "";
  child.stdout.setEncoding("utf8");
  child.stderr.setEncoding("utf8");
  child.stdout.on("data", (chunk) => {
    output += chunk;
  });
  child.stderr.on("data", (chunk) => {
    stderr += chunk;
  });
  const frames = () => output.split(clearScreen).slice(1);
  async function waitFrame(predicate, after = 0) {
    const deadline = Date.now() + 4000;
    while (Date.now() < deadline) {
      const frame = frames().slice(after).find(predicate);
      if (frame) return frame;
      assert.equal(child.exitCode, null, `renderer exited: ${stderr}`);
      await delay(20);
    }
    assert.fail(`renderer frame did not arrive:\n${output}\n${stderr}`);
  }
  t.after(async () => {
    clearTimeout(watchdog);
    if (child.exitCode === null && child.signalCode === null) child.kill("SIGTERM");
    await closed;
    rmSync(root, { recursive: true, force: true });
  });
  return { child, closed, frames, waitFrame, write, statePath };
}

function assertUnavailable(frame, hasSnapshot = true) {
  assert.match(frame, /Progress updates unavailable/);
  assert.match(frame, /Check the parent Pi session for the execution result/);
  assert.match(frame, /Closing this tab does not cancel work/);
  assert.ok(frame.indexOf("Technical details:") > frame.indexOf("Progress updates unavailable"));
  if (hasSnapshot) {
    assert.match(frame, /Last known progress \(stale — no longer live\)/);
    assert.match(frame, /last known status:/);
    assert.match(frame, /snapshot age:/);
    assert.ok(frame.indexOf("Technical details:") > frame.indexOf("last known status:"));
  } else {
    assert.match(frame, /No progress snapshot has been read yet/);
    assert.doesNotMatch(frame, /last known status:|Remembered dispatch/);
  }
  assert.doesNotMatch(
    frame,
    /supervision: healthy|supervision: complete|The controller is inactive/,
  );
}

test("missing telemetry preserves stale progress and recovery replaces it", async (t) => {
  const r = renderer(t);
  await r.waitFrame((frame) => frame.includes("latest tool: bash"));
  unlinkSync(r.statePath);
  const lost = await r.waitFrame((frame) => frame.includes("Progress updates unavailable"));
  assertUnavailable(lost);
  assert.match(lost, /observer status file is no longer available/);
  assert.match(lost, /last known status: running/);
  assert.match(lost, /latest tool: bash/);
  assert.match(lost, /profile: reviewer/);
  assert.match(lost, /dispatch: dispatch-remembered/);
  assert.match(lost, /usage: 2 turns · 100 input · 20 output/);
  assert.match(lost, /1\/2 inspect: running/);
  assert.match(lost, /elapsed at last snapshot: 20s/);
  assert.match(lost, /Technical details: ENOENT/);
  const after = r.frames().length;
  r.write(snapshot({ activeDispatch: { latestTool: "read" } }));
  const recovered = await r.waitFrame((frame) => frame.includes("latest tool: read"), after);
  assert.doesNotMatch(
    recovered,
    /Progress updates unavailable|stale — no longer live|Technical details:/,
  );
  assert.match(recovered, /supervision: healthy/);
});

test("first-read failure has no invented progress and recovers", async (t) => {
  const r = renderer(t, null);
  assertUnavailable(
    await r.waitFrame((frame) => frame.includes("Progress updates unavailable")),
    false,
  );
  r.write(snapshot());
  const recovered = await r.waitFrame((frame) => frame.includes("latest tool: bash"));
  assert.doesNotMatch(recovered, /No progress snapshot|Technical details:/);
});

test("malformed and non-private replacements never overwrite the checked snapshot", async (t) => {
  const r = renderer(t);
  await r.waitFrame((frame) => frame.includes("latest tool: bash"));
  writeFileSync(r.statePath, '{"private-secret":"never-display-me", BROKEN');
  const malformed = await r.waitFrame((frame) => frame.includes("Progress updates unavailable"));
  assertUnavailable(malformed);
  assert.match(malformed, /Technical details: State snapshot is not valid JSON/);
  assert.doesNotMatch(malformed, /private-secret|never-display-me/);
  const after = r.frames().length;
  r.write(snapshot({ activeDispatch: { latestTool: "untrusted-tool" } }), 0o644);
  const nonPrivate = await r.waitFrame((frame) => frame.includes("expected mode 0600"), after);
  assertUnavailable(nonPrivate);
  assert.match(nonPrivate, /latest tool: bash/);
  assert.doesNotMatch(nonPrivate, /untrusted-tool/);
});

test("schema rejection keeps only previously checked progress", async (t) => {
  const r = renderer(t);
  await r.waitFrame((frame) => frame.includes("latest tool: bash"));
  r.write(snapshot({ schema: "untrusted", activeDispatch: { latestTool: "untrusted-tool" } }));
  const rejected = await r.waitFrame((frame) => frame.includes("state schema is not supported"));
  assertUnavailable(rejected);
  assert.match(rejected, /latest tool: bash/);
  assert.doesNotMatch(rejected, /untrusted-tool/);
});

test("a successor generation shuts down without displaying its progress", async (t) => {
  const r = renderer(t);
  await r.waitFrame((frame) => frame.includes("latest tool: bash"));
  unlinkSync(r.statePath);
  await r.waitFrame((frame) => frame.includes("Progress updates unavailable"));
  const after = r.frames().length;
  r.write(snapshot({ controllerInstanceId: "successor", group: { label: "New owner" } }));
  const [code, signal] = await r.closed;
  assert.equal(code, 0);
  assert.equal(signal, null);
  assert.equal(r.frames().length, after);
  assert.doesNotMatch(r.frames().join(""), /New owner/);
});

test("cached terminal state is historical, with only the unavailable countdown", async (t) => {
  const r = renderer(
    t,
    snapshot({
      status: "done",
      activeDispatch: undefined,
      terminal: { ok: true, status: "done", effectDisposition: "settled" },
    }),
  );
  await r.waitFrame((frame) => frame.includes("terminal: settled successfully"));
  unlinkSync(r.statePath);
  const lost = await r.waitFrame((frame) => frame.includes("Progress updates unavailable"));
  assertUnavailable(lost);
  assert.match(lost, /last known terminal: settled successfully/);
  assert.match(lost, /last known status: done/);
  assert.equal((lost.match(/observer closes in:/g) ?? []).length, 1);
});

test("unavailable display still exits after the bounded hold without signalling the controller", async (t) => {
  const startedAt = performance.now();
  const r = renderer(t, null, { PI_ASC_OBSERVER_DISCONNECTED_HOLD_MS: "600" });
  assertUnavailable(
    await r.waitFrame((frame) => frame.includes("Progress updates unavailable")),
    false,
  );
  const [code, signal] = await r.closed;
  assert.equal(code, 0);
  assert.equal(signal, null);
  assert.ok(performance.now() - startedAt >= 550, "unavailable hold ended early");
  assert.doesNotThrow(() => process.kill(process.pid, 0));
});

test("long phase lists repeat the stale notice at the footer", async (t) => {
  const phases = Array.from({ length: 64 }, (_, index) => ({
    name: `phase-${index + 1}`,
    index: index + 1,
    count: 64,
    status: "running",
  }));
  const r = renderer(t, snapshot({ phases }));
  await r.waitFrame((frame) => frame.includes("64/64 phase-64"));
  unlinkSync(r.statePath);
  const lost = await r.waitFrame((frame) => frame.includes("Progress updates unavailable"));
  assertUnavailable(lost);
  assert.match(lost.slice(-500), /all progress above is stale, not live/);
});

test("recovery grants a fresh unavailable hold on a second outage", async (t) => {
  const r = renderer(t, snapshot(), { PI_ASC_OBSERVER_DISCONNECTED_HOLD_MS: "1200" });
  await r.waitFrame((frame) => frame.includes("latest tool: bash"));
  unlinkSync(r.statePath);
  await r.waitFrame((frame) => frame.includes("Progress updates unavailable"));
  const afterFirstOutage = r.frames().length;
  r.write(snapshot({ activeDispatch: { latestTool: "read" } }));
  await r.waitFrame((frame) => frame.includes("latest tool: read"), afterFirstOutage);
  const afterRecovery = r.frames().length;
  unlinkSync(r.statePath);
  const lostAgain = await r.waitFrame(
    (frame) => frame.includes("Progress updates unavailable"),
    afterRecovery,
  );
  assert.match(lostAgain, /latest tool: read/);
  const secondOutageAt = performance.now();
  const [code, signal] = await r.closed;
  assert.equal(code, 0);
  assert.equal(signal, null);
  assert.ok(performance.now() - secondOutageAt >= 1000, "second outage reused the old hold");
});

for (const [name, overrides, env] of [
  [
    "terminal success",
    { status: "done", terminal: { ok: true, status: "done" } },
    { PI_ASC_OBSERVER_SUCCESS_HOLD_MS: "600" },
  ],
  [
    "terminal failure",
    { status: "error", terminal: { ok: false, status: "error" } },
    { PI_ASC_OBSERVER_FAILURE_HOLD_MS: "600" },
  ],
  [
    "controller disconnection",
    { controllerActive: false },
    { PI_ASC_OBSERVER_DISCONNECTED_HOLD_MS: "600" },
  ],
]) {
  test(`normal ${name} still exits after its bounded hold`, async (t) => {
    const startedAt = performance.now();
    const r = renderer(t, snapshot(overrides), env);
    await r.waitFrame((frame) => frame.includes("observer closes in:"));
    const [code, signal] = await r.closed;
    assert.equal(code, 0);
    assert.equal(signal, null);
    assert.ok(performance.now() - startedAt >= 550, `${name} hold ended early`);
  });
}

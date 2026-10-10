// Causal singleton/renderer-ACK regression coverage; no Ghostty or model calls.
// AK6867: rejected or unclassified launch callbacks do not prove absence of renderer effects.

import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { once } from "node:events";
import {
  chmodSync,
  existsSync,
  linkSync,
  mkdtempSync,
  readdirSync,
  readFileSync,
  rmSync,
  symlinkSync,
  unlinkSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";
import { setTimeout as delay } from "node:timers/promises";
import { launchAscExecutionObserverSession } from "../extensions/sidequestLaunch.ts";
import { createAscExecutionObserverController } from "../src/ascExecutionObserver.ts";
import { LOCAL_GHOSTTY_ORIGIN_MAIN_BIN } from "./sidequest-harness.mjs";

const script = new URL("../scripts/asc-execution-observer.mjs", import.meta.url).pathname;
const host = { mode: "tui", hasUI: true, cwd: "/repo", sessionId: "session-6844" };
function progress(id, kind = "dispatch", sequence = 1) {
  return {
    schema: "asc.execution_observation.v1",
    event: "dispatch_progress",
    observedAt: new Date().toISOString(),
    cwd: "/repo",
    producer: kind === "loop" ? "loop_execute" : "dispatch_subagent",
    group: { id, kind, label: id },
    ...(kind === "loop" ? { phase: { name: "build", index: 1, count: 2 } } : {}),
    dispatch: { dispatchId: id, attemptId: `${id}-attempt` },
    progress: {
      status: "running",
      sequence,
      phase: "running",
      latestTool: "read",
      lastActivityAt: Date.now(),
    },
  };
}
function terminal(event, groupTerminal = false, ok = true) {
  return {
    ...event,
    event: groupTerminal ? "group_terminal" : "dispatch_terminal",
    progress: undefined,
    ...(groupTerminal ? { phase: undefined, dispatch: undefined } : {}),
    terminal: {
      ok,
      status: ok ? "done" : "error",
      failureKind: ok ? undefined : "provider_error",
      effectDisposition: "settled",
    },
  };
}
async function until(predicate) {
  const end = Date.now() + 3000;
  while (Date.now() < end) {
    if (predicate()) return;
    await delay(20);
  }
  assert.fail("condition not reached within 3s");
}
function fixture(launch, extra = {}) {
  const root = mkdtempSync(join(tmpdir(), "asc-session-6844-"));
  const children = [];
  const requests = [];
  const controller = createAscExecutionObserverController({
    env: { TERM_PROGRAM: "ghostty" },
    stateRoot: root,
    startupTimeoutMs: 100,
    async launch(request) {
      requests.push(request);
      return launch(request, children);
    },
    ...extra,
  });
  controller.setHostContext(host);
  const snapshot = () => JSON.parse(readFileSync(requests[0].statePath, "utf8"));
  return {
    root,
    controller,
    requests,
    children,
    snapshot,
    async cleanup() {
      await controller.dispose();
      for (const child of children) {
        if (child.exitCode === null && child.signalCode === null) {
          const closed = once(child, "close");
          child.kill("SIGTERM");
          await closed;
        }
      }
      rmSync(root, { recursive: true, force: true });
    },
  };
}
function renderer(request, children, env = {}) {
  const child = spawn(
    process.execPath,
    [
      script,
      "--state",
      request.statePath,
      "--controller-instance",
      request.controllerInstanceId,
      "--session-id",
      request.sessionId,
      "--startup-token",
      request.startupToken,
      "--startup-receipt",
      request.startupReceiptPath,
    ],
    { stdio: ["ignore", "pipe", "pipe"], env: { ...process.env, ...env } },
  );
  child.output = "";
  child.errors = "";
  child.stdout.on("data", (chunk) => {
    child.output += chunk;
  });
  child.stderr.on("data", (chunk) => {
    child.errors += chunk;
  });
  children.push(child);
  return child;
}

test("four concurrent distinct dispatches plus loop share exactly one launch and aggregate", async () => {
  const f = fixture(async () => ({ ok: true, launchMode: "tab" }));
  try {
    for (let i = 0; i < 4; i++) f.controller.handle(progress(`direct-${i}`));
    f.controller.handle(progress("loop", "loop"));
    await f.controller.flush();
    assert.equal(f.requests.length, 1);
    assert.equal(f.snapshot().groups.length, 5);
    assert.equal(f.snapshot().sessionId, host.sessionId);
    assert.equal(f.snapshot().observer.launchStatus, "unconfirmed");
    for (let i = 0; i < 4; i++) {
      const path = f.controller.statePathFor(`direct-${i}`, "dispatch_subagent", "dispatch");
      assert.equal(JSON.parse(readFileSync(path, "utf8")).observer.launchStatus, "unconfirmed");
    }
  } finally {
    await f.cleanup();
  }
});

test("real launch adapter carries exact session/ACK arguments once across parallel groups", async () => {
  const activations = [];
  const f = fixture(
    async (request, children) =>
      launchAscExecutionObserverSession(
        { getThinkingLevel: () => "off" },
        {
          env: {
            TERM_PROGRAM: "ghostty",
            GHOSTTY_SURFACE_ID: "19",
            PI_SIDEQUEST_LAUNCH_STAGGER_MS: "0",
          },
          currentGhosttyAncestor: { pid: 111, exe: LOCAL_GHOSTTY_ORIGIN_MAIN_BIN },
          currentSessionGhosttyBin: LOCAL_GHOSTTY_ORIGIN_MAIN_BIN,
          readProcessExecutable: () => LOCAL_GHOSTTY_ORIGIN_MAIN_BIN,
          pathExists: () => true,
          async exec(command, args) {
            if (args[0] === "+help") return { code: 0, stdout: "+new-tab\n" };
            if (command === "busctl" && args[1] === "list")
              return {
                code: 0,
                stdout:
                  ":1.11 111 ghostty user :1.11 unit - -\ncom.mitchellh.ghostty 111 ghostty user :1.11 unit - -\n",
              };
            if (args.includes("Describe")) return { code: 0, stdout: '(bgav) true "(tas)" 0' };
            assert.equal(command, "busctl");
            assert.ok(args.includes("Activate"));
            activations.push(args);
            for (const [flag, value] of [
              ["--session-id", request.sessionId],
              ["--startup-token", request.startupToken],
              ["--startup-receipt", request.startupReceiptPath],
            ])
              assert.equal(args[args.indexOf(flag) + 1], value);
            renderer(request, children);
            return { code: 0, stdout: "" };
          },
        },
        request,
        process.execPath,
        script,
      ),
    { startupTimeoutMs: 1500 },
  );
  try {
    for (let i = 0; i < 4; i++) f.controller.handle(progress(`adapter-${i}`));
    f.controller.handle(progress("loop", "loop"));
    await f.controller.flush();
    assert.equal(activations.length, 1);
    assert.equal(activations[0][2], "--expect-reply=no");
    assert.equal(f.snapshot().observer.launchStatus, "launched");
    assert.equal(f.snapshot().groups.length, 5);
  } finally {
    await f.cleanup();
  }
});

test("transport acceptance without renderer ACK is never launched", async () => {
  const f = fixture(async () => ({ ok: true }));
  try {
    f.controller.handle(progress("a"));
    await f.controller.flush();
    assert.equal(f.snapshot().observer.launchStatus, "unconfirmed");
  } finally {
    await f.cleanup();
  }
});

test("actual renderer ACK marks launched; group terminal never closes shared viewer; resume and teardown", async () => {
  const f = fixture(
    async (request, children) => {
      renderer(request, children);
      return { ok: true };
    },
    { startupTimeoutMs: 1500 },
  );
  try {
    const loop = progress("loop", "loop");
    f.controller.handle(loop);
    f.controller.handle(progress("direct"));
    await f.controller.flush();
    const child = f.children[0];
    assert.equal(f.snapshot().observer.launchStatus, "launched", child.errors);
    assert.equal(f.snapshot().observer.rendererPid, child.pid);
    const receipt = JSON.parse(readFileSync(f.requests[0].startupReceiptPath, "utf8"));
    assert.equal(receipt.rendererPid, child.pid);
    assert.equal(receipt.startupToken, f.requests[0].startupToken);
    f.controller.handle(terminal(progress("direct"), false, false));
    f.controller.handle(terminal(loop));
    await f.controller.flush();
    assert.equal(f.snapshot().groups.find((g) => g.group.id === "loop").phases[0].status, "done");
    assert.equal(
      f.snapshot().groups.find((g) => g.group.id === "direct").terminal.failureKind,
      "provider_error",
    );
    await until(
      () => child.output.includes("provider_error") && child.output.includes("between dispatches"),
    );
    f.controller.handle(terminal(loop, true));
    await f.controller.flush();
    await until(() => child.output.includes("session idle"));
    await delay(600);
    assert.equal(child.exitCode, null, "terminal groups must not close a live session viewer");
    f.controller.handle(progress("direct", "dispatch", 2));
    await f.controller.flush();
    assert.equal(f.snapshot().groups.find((g) => g.group.id === "direct").terminal, undefined);
    assert.equal(f.requests.length, 1);
    const closed = once(child, "close");
    await f.controller.dispose();
    await closed;
    assert.equal(child.exitCode, 0);
    assert.equal(f.snapshot().controllerActive, false);
  } finally {
    await f.cleanup();
  }
});

test("timeout, late renderer start and manual close never relaunch", async () => {
  const f = fixture(async () => ({ ok: true }));
  try {
    f.controller.handle(progress("a"));
    await f.controller.flush();
    assert.equal(f.snapshot().observer.launchStatus, "unconfirmed");
    const child = renderer(f.requests[0], f.children);
    await until(() => f.snapshot().observer.launchStatus === "launched");
    const closed = once(child, "close");
    child.kill("SIGTERM");
    await closed;
    await until(() => f.snapshot().observer.launchStatus === "closed");
    f.controller.handle(progress("b"));
    f.controller.handle(progress("a", "dispatch", 2));
    await f.controller.flush();
    assert.equal(f.requests.length, 1);
    assert.equal(f.snapshot().observer.launchStatus, "closed");
  } finally {
    await f.cleanup();
  }
});

for (const variant of [
  "token",
  "instance",
  "session",
  "pid",
  "start",
  "mode",
  "symlink",
  "hardlink",
  "oversize",
]) {
  test(`startup receipt rejects wrong/unsafe ${variant}`, async () => {
    const f = fixture(async (request, children) => {
      renderer(request, children);
      await until(() => existsSync(request.startupReceiptPath));
      const receipt = JSON.parse(readFileSync(request.startupReceiptPath, "utf8"));
      unlinkSync(request.startupReceiptPath);
      if (variant === "token") receipt.startupToken = "wrong";
      if (variant === "instance") receipt.controllerInstanceId = "wrong";
      if (variant === "session") receipt.sessionId = "wrong";
      if (variant === "pid") receipt.rendererPid = process.pid;
      if (variant === "start") receipt.rendererStart = "0";
      const text = variant === "oversize" ? "x".repeat(4097) : JSON.stringify(receipt);
      if (variant === "symlink") {
        const target = join(f.root, "other.json");
        writeFileSync(target, text, { mode: 0o600 });
        symlinkSync(target, request.startupReceiptPath);
      } else {
        writeFileSync(request.startupReceiptPath, text, { mode: 0o600 });
        if (variant === "mode") chmodSync(request.startupReceiptPath, 0o644);
        if (variant === "hardlink")
          linkSync(request.startupReceiptPath, join(f.root, "linked.json"));
      }
      return { ok: true };
    });
    try {
      f.controller.handle(progress("a"));
      await f.controller.flush();
      assert.equal(f.snapshot().observer.launchStatus, "unconfirmed");
    } finally {
      await f.cleanup();
    }
  });
}

test("proven transport refusal is session-wide, once only, and execution telemetry continues", async () => {
  const failures = [];
  const f = fixture(
    async () => ({ ok: false, effectDisposition: "confirmed_no_effects", failure: "rejected" }),
    {
      onLaunchFailure: (m) => failures.push(m),
    },
  );
  try {
    f.controller.handle(progress("a"));
    f.controller.handle(progress("b"));
    await f.controller.flush();
    f.controller.handle(terminal(progress("a"), false, false));
    await f.controller.flush();
    assert.equal(f.requests.length, 1);
    assert.equal(failures.length, 1);
    assert.equal(f.snapshot().observer.launchStatus, "failed");
    assert.equal(f.snapshot().groups.length, 2);
  } finally {
    await f.cleanup();
  }
});

test("shared renderer retains per-group quiet and telemetry-lease classifications", async () => {
  const f = fixture(
    async (request, children) => {
      renderer(request, children, {
        PI_ASC_OBSERVER_QUIET_MS: "10",
        PI_ASC_OBSERVER_STALLED_MS: "20",
      });
      return { ok: true };
    },
    { startupTimeoutMs: 1500 },
  );
  try {
    const event = progress("quiet");
    event.progress.lastActivityAt = Date.now() - 10000;
    f.controller.handle(event);
    await f.controller.flush();
    await until(() => f.children[0].output.includes("suspected stall — inspect before cancelling"));
    assert.equal(f.snapshot().observer.launchStatus, "launched");
    assert.equal(f.requests.length, 1);
  } finally {
    await f.cleanup();
  }
});

test("a shared viewer survives missing updates beyond the legacy hold while its controller is live", async () => {
  const f = fixture(
    async (request, children) => {
      renderer(request, children, { PI_ASC_OBSERVER_DISCONNECTED_HOLD_MS: "100" });
      return { ok: true };
    },
    { startupTimeoutMs: 1500 },
  );
  try {
    f.controller.handle(progress("a"));
    await f.controller.flush();
    const child = f.children[0];
    unlinkSync(f.requests[0].statePath);
    await until(() =>
      child.output.includes("Observer waits for updates while its controller is live"),
    );
    await delay(600);
    assert.equal(child.exitCode, null);
    f.controller.handle(progress("a", "dispatch", 2));
    await f.controller.flush();
    assert.equal(f.snapshot().observer.launchStatus, "launched");
    assert.equal(f.requests.length, 1);
  } finally {
    await f.cleanup();
  }
});

test("a controller cannot mix replacement session identity into the old viewer", async () => {
  const f = fixture(async () => ({ ok: true }));
  try {
    f.controller.handle(progress("old"));
    await f.controller.flush();
    f.controller.setHostContext({ ...host, sessionId: "replacement" });
    f.controller.handle(progress("new"));
    await f.controller.flush();
    assert.equal(f.snapshot().controllerActive, false);
    assert.deepEqual(
      f.snapshot().groups.map((g) => g.group.id),
      ["old"],
    );
    assert.equal(f.requests.length, 1);
  } finally {
    await f.cleanup();
  }
});

test("review regression: acknowledged/manual-closed reservation survives same-session controller reload", async () => {
  const f = fixture(
    async (request, children) => {
      renderer(request, children);
      return { ok: true };
    },
    { startupTimeoutMs: 1500 },
  );
  let next;
  try {
    f.controller.handle(progress("old"));
    await f.controller.flush();
    const child = f.children[0];
    const closed = once(child, "close");
    child.kill("SIGTERM");
    await closed;
    await until(() => f.snapshot().observer.launchStatus === "closed");
    await f.controller.dispose();
    next = fixture(async () => ({ ok: true }), { stateRoot: f.root });
    next.controller.handle(progress("later"));
    await next.controller.flush();
    assert.equal(
      next.requests.length,
      0,
      "same Pi session must not regain a launch slot on reload",
    );
    const state = JSON.parse(
      readFileSync(next.controller.statePathFor("later", "dispatch_subagent", "dispatch"), "utf8"),
    );
    assert.equal(state.observer.launchStatus, "closed");
    assert.notEqual(state.controllerInstanceId, f.requests[0].controllerInstanceId);
    next.controller.handle(progress("later", "dispatch", 2));
    await next.controller.flush();
    assert.equal(next.requests.length, 0);
  } finally {
    if (next) await next.cleanup();
    await f.cleanup();
  }
});

for (const late of [false, true]) {
  test(`review regression: effect-indeterminate ${late ? "late" : "immediate"} renderer ACK confirms original attempt`, async () => {
    const f = fixture(
      async (request, children) => {
        if (!late) renderer(request, children);
        return {
          ok: false,
          effectDisposition: "effect_indeterminate",
          failure: "activation timed out",
        };
      },
      { startupTimeoutMs: late ? 50 : 1500 },
    );
    try {
      f.controller.handle(progress("a"));
      await f.controller.flush();
      if (late) {
        assert.equal(f.snapshot().observer.launchStatus, "unconfirmed");
        renderer(f.requests[0], f.children);
        await until(() => f.snapshot().observer.launchStatus === "launched");
      }
      assert.equal(f.snapshot().observer.launchStatus, "launched");
      assert.equal(f.snapshot().observer.effectDisposition, "effect_indeterminate");
      assert.equal(f.snapshot().observer.rendererPid, f.children[0].pid);
      f.controller.handle(progress("b"));
      await f.controller.flush();
      assert.equal(f.requests.length, 1);
    } finally {
      await f.cleanup();
    }
  });
}

test("review regression: adapter preserves effect-indeterminate instead of plain failure", async () => {
  const root = mkdtempSync(join(tmpdir(), "asc-disposition-"));
  try {
    const result = await launchAscExecutionObserverSession(
      { getThinkingLevel: () => "off" },
      {
        env: {
          TERM_PROGRAM: "ghostty",
          GHOSTTY_SURFACE_ID: "19",
          PI_SIDEQUEST_LAUNCH_STAGGER_MS: "0",
        },
        currentGhosttyAncestor: { pid: 111, exe: LOCAL_GHOSTTY_ORIGIN_MAIN_BIN },
        currentSessionGhosttyBin: LOCAL_GHOSTTY_ORIGIN_MAIN_BIN,
        pathExists: () => true,
        readProcessExecutable: () => LOCAL_GHOSTTY_ORIGIN_MAIN_BIN,
        async exec(_command, args) {
          if (args[0] === "+help") return { code: 0, stdout: "+new-tab\n" };
          if (args[1] === "list")
            return { code: 0, stdout: ":1.11 111 ghostty user :1.11 unit - -\n" };
          if (args.includes("Describe")) return { code: 0, stdout: '(bgav) true "(tas)" 0' };
          assert.ok(args.includes("Activate"));
          return { code: 0, killed: true, stdout: "" };
        },
      },
      {
        statePath: join(root, "state.json"),
        cwd: "/repo",
        title: "test",
        sessionId: "session",
        controllerInstanceId: "instance",
        startupToken: "token",
        startupReceiptPath: join(root, "receipt.json"),
      },
      process.execPath,
      script,
    );
    assert.equal(result.ok, false);
    assert.equal(result.effectDisposition, "effect_indeterminate");
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test("review regression: confirmed-no-effects stays failed even if a receipt appears", async () => {
  const f = fixture(async (request, children) => {
    renderer(request, children);
    return { ok: false, effectDisposition: "confirmed_no_effects", failure: "refused" };
  });
  try {
    f.controller.handle(progress("a"));
    await f.controller.flush();
    await until(() => existsSync(f.requests[0].startupReceiptPath));
    await delay(100);
    await f.controller.flush();
    assert.equal(f.snapshot().observer.launchStatus, "failed");
    assert.equal(f.requests.length, 1);
  } finally {
    await f.cleanup();
  }
});

test("review regression: expiry plus redundant progress republishes aggregate membership", async () => {
  let clock = Date.now();
  const f = fixture(async () => ({ ok: true }), { now: () => clock });
  try {
    f.controller.handle(progress("expired"));
    f.controller.handle(terminal(progress("expired")));
    f.controller.handle(progress("live"));
    await f.controller.flush();
    clock += 10 * 60 * 1000 + 1;
    f.controller.handle(progress("live"));
    await f.controller.flush();
    assert.equal(
      existsSync(f.controller.statePathFor("expired", "dispatch_subagent", "dispatch")),
      false,
    );
    assert.deepEqual(
      f.snapshot().groups.map((g) => g.group.id),
      ["live"],
    );
  } finally {
    await f.cleanup();
  }
});

test("review regression: dispose detaches hung launch and late settlement cannot revive state", async () => {
  let settle;
  const f = fixture(
    () =>
      new Promise((resolve) => {
        settle = resolve;
      }),
  );
  let disposed;
  try {
    f.controller.handle(progress("a"));
    await until(() => f.requests.length === 1);
    f.controller.handle(progress("b"));
    await until(() => f.snapshot().groups.length === 2);
    disposed = f.controller.dispose();
    const drained = await Promise.race([disposed.then(() => true), delay(150).then(() => false)]);
    settle({ ok: true });
    await disposed;
    assert.equal(drained, true, "dispose must not await unresolved transport");
    await delay(100);
    assert.equal(f.snapshot().controllerActive, false);
    assert.notEqual(f.snapshot().observer.launchStatus, "launched");
    const text = readFileSync(f.requests[0].statePath, "utf8");
    f.controller.handle(progress("late"));
    await f.controller.flush();
    assert.equal(readFileSync(f.requests[0].statePath, "utf8"), text);
  } finally {
    settle?.({ ok: true });
    if (disposed) await disposed;
    await f.cleanup();
  }
});

test("review regression: reload during unresolved transport cannot produce a parallel or revived viewer", async () => {
  let settle;
  const f = fixture(
    () =>
      new Promise((resolve) => {
        settle = resolve;
      }),
  );
  let next;
  try {
    f.controller.handle(progress("old"));
    await until(() => f.requests.length === 1);
    await f.controller.dispose();
    const inactive = readFileSync(f.requests[0].statePath, "utf8");
    next = fixture(async () => ({ ok: true }), { stateRoot: f.root });
    next.controller.handle(progress("new"));
    await next.controller.flush();
    assert.equal(next.requests.length, 0);
    settle({ ok: false, effectDisposition: "effect_indeterminate" });
    await delay(100);
    assert.equal(readFileSync(f.requests[0].statePath, "utf8"), inactive);
    const child = renderer(f.requests[0], f.children);
    await once(child, "close");
    assert.equal(existsSync(f.requests[0].startupReceiptPath), false);
    assert.doesNotMatch(child.output, /ASC execution observer|active dispatches/);
    assert.equal(next.requests.length, 0);
  } finally {
    settle?.({ ok: true });
    if (next) await next.controller.dispose();
    await f.controller.dispose();
    if (next) await next.cleanup();
    await f.cleanup();
  }
});

test("review regression: reservation resets only for actual session replacement, not cwd or elapsed retention", async () => {
  let clock = Date.now();
  const f = fixture(async () => ({ ok: true }), { now: () => clock });
  let same;
  let replacement;
  try {
    f.controller.handle(progress("old"));
    await f.controller.flush();
    await f.controller.dispose();
    clock += 2 * 24 * 60 * 60 * 1000;
    same = fixture(async () => ({ ok: true }), { stateRoot: f.root, now: () => clock });
    same.controller.setHostContext({ ...host, cwd: "/changed" });
    same.controller.handle({ ...progress("same"), cwd: "/changed" });
    await same.controller.flush();
    assert.equal(same.requests.length, 0);
    replacement = fixture(async () => ({ ok: true }), { stateRoot: f.root, now: () => clock });
    replacement.controller.setHostContext({ ...host, sessionId: "genuinely-new-session" });
    replacement.controller.handle(progress("new"));
    await replacement.controller.flush();
    assert.equal(replacement.requests.length, 1);
    assert.equal(replacement.snapshot().sessionId, "genuinely-new-session");
  } finally {
    // Dispose shared-root controllers before removing either fixture directory.
    if (same) await same.controller.dispose();
    if (replacement) await replacement.controller.dispose();
    if (same) await same.cleanup();
    if (replacement) await replacement.cleanup();
    await f.cleanup();
  }
});

for (const variant of ["mode", "symlink", "hardlink", "oversize", "schema"]) {
  test(`review regression: unsafe reservation ${variant} fails closed without reclaiming a slot`, async () => {
    const f = fixture(async () => ({ ok: true }));
    let next;
    try {
      f.controller.handle(progress("old"));
      await f.controller.flush();
      await f.controller.dispose();
      const path = join(
        f.root,
        readdirSync(f.root).find((name) => name.endsWith(".reservation.json")),
      );
      const text = readFileSync(path, "utf8");
      if (variant === "mode") chmodSync(path, 0o644);
      if (variant === "hardlink") linkSync(path, join(f.root, "link.json"));
      if (variant === "oversize") writeFileSync(path, "x".repeat(4097));
      if (variant === "schema")
        writeFileSync(path, JSON.stringify({ schema: "wrong", sessionId: host.sessionId }));
      if (variant === "symlink") {
        unlinkSync(path);
        const target = join(f.root, "target.json");
        writeFileSync(target, text, { mode: 0o600 });
        symlinkSync(target, path);
      }
      next = fixture(async () => ({ ok: true }), { stateRoot: f.root });
      next.controller.handle(progress("next"));
      await next.controller.flush();
      assert.equal(next.requests.length, 0);
      const state = JSON.parse(
        readFileSync(next.controller.statePathFor("next", "dispatch_subagent", "dispatch"), "utf8"),
      );
      assert.equal(state.observer.launchStatus, "failed");
    } finally {
      if (next) await next.cleanup();
      await f.cleanup();
    }
  });
}

for (const failure of ["rejected", "unclassified", "failed-settled"]) {
  for (const ack of ["none", "immediate", "late"]) {
    test(`Scenario: Given ${failure} launch settlement, When renderer ACK is ${ack}, Then uncertainty or exact same-attempt startup is retained without retry`, async () => {
      const f = fixture(
        async (request, children) => {
          if (ack === "immediate") renderer(request, children);
          if (failure === "rejected") throw new Error("launcher settlement lost");
          return {
            ok: false,
            failure: "launcher settlement lost",
            ...(failure === "failed-settled" ? { effectDisposition: "settled" } : {}),
          };
        },
        { startupTimeoutMs: ack === "immediate" ? 1500 : 50 },
      );
      try {
        f.controller.handle(progress("uncertain"));
        await f.controller.flush();
        assert.equal(f.snapshot().observer.effectDisposition, "effect_indeterminate");
        if (ack === "immediate") {
          assert.equal(f.snapshot().observer.launchStatus, "launched");
        } else {
          assert.equal(f.snapshot().observer.launchStatus, "unconfirmed");
          if (ack === "late") {
            renderer(f.requests[0], f.children);
            await until(() => f.snapshot().observer.launchStatus === "launched");
          }
        }
        f.controller.handle(progress("subsequent"));
        await f.controller.flush();
        assert.equal(f.requests.length, 1, "No callback replay or duplicate launch");
      } finally {
        await f.cleanup();
      }
    });
  }
}

test("disposed/delayed renderer cannot ACK or show stale controller state; reload uses separate instance", async () => {
  const f = fixture(async () => ({ ok: true }));
  const next = fixture(async () => ({ ok: true }), { stateRoot: f.root });
  try {
    f.controller.handle(progress("a"));
    await f.controller.flush();
    await f.controller.dispose();
    const child = renderer(f.requests[0], f.children);
    await once(child, "close");
    assert.doesNotMatch(child.output, /ASC execution observer|active dispatches|latest tool/);
    assert.equal(existsSync(f.requests[0].startupReceiptPath), false);
    next.controller.handle(progress("a"));
    await next.controller.flush();
    assert.equal(
      next.requests.length,
      0,
      "attempt reservation survives same-session reload even without ACK",
    );
    const nextGroup = JSON.parse(
      readFileSync(next.controller.statePathFor("a", "dispatch_subagent", "dispatch"), "utf8"),
    );
    assert.notEqual(f.requests[0].controllerInstanceId, nextGroup.controllerInstanceId);
    assert.equal(nextGroup.observer.launchStatus, "unconfirmed");
  } finally {
    await next.cleanup();
    await f.cleanup();
  }
});

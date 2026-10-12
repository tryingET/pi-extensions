// Source-loaded command/controller proof with actual Node renderer ACK, never Ghostty/GUI.
import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { once } from "node:events";
import { mkdtempSync, readdirSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";
import { setTimeout as delay } from "node:timers/promises";
import { createSidequestExtension } from "../extensions/sidequest.ts";
import {
  ASC_EXECUTION_OBSERVATION_EVENT,
  createAscExecutionObserverController,
} from "../src/ascExecutionObserver.ts";
import { createContext, registerExtension } from "./sidequest-harness.mjs";

const script = new URL("../scripts/asc-execution-observer.mjs", import.meta.url).pathname;
function progress(id = "retained", cwd = "/repo") {
  return {
    schema: "asc.execution_observation.v1",
    event: "dispatch_progress",
    observedAt: new Date().toISOString(),
    cwd,
    producer: "dispatch_subagent",
    group: { id, kind: "dispatch", label: id },
    dispatch: { dispatchId: id, attemptId: `${id}-attempt` },
    progress: { status: "running", sequence: 1, latestTool: "read", lastActivityAt: Date.now() },
    objective: "excluded content",
    fullOutput: "excluded content",
  };
}
async function until(predicate) {
  const deadline = Date.now() + 3000;
  while (Date.now() < deadline) {
    if (predicate()) return;
    await delay(20);
  }
  assert.fail("condition not reached within 3s");
}
function fixture({ env = {}, mode = "tui", launch, now, startupTimeoutMs = 1500 } = {}) {
  const root = mkdtempSync(join(tmpdir(), "ak7039-observer-"));
  const requests = [];
  const children = [];
  const controller = createAscExecutionObserverController({
    env: { TERM_PROGRAM: "ghostty", ...env },
    stateRoot: root,
    startupTimeoutMs,
    now,
    async launch(request) {
      requests.push(request);
      if (launch) return launch(request);
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
        { stdio: "ignore" },
      );
      children.push(child);
      return { ok: true, launchMode: "tab", effectDisposition: "settled" };
    },
  });
  const harness = registerExtension(
    createSidequestExtension({
      env,
      ascExecutionObserver: controller,
      registerTools: false,
    }),
  );
  const { ctx, notifications } = createContext({
    cwd: "/repo",
    sessionId: "current-session",
    mode,
  });
  const command = (args = "", context = ctx) =>
    harness.commands.get("subagent-observer").handler(args, context);
  const start = async () => {
    for (const handler of harness.events.get("session_start") ?? []) await handler({}, ctx);
  };
  const deliver = (event) => {
    for (const handler of harness.busEvents.get(ASC_EXECUTION_OBSERVATION_EVENT) ?? [])
      handler(event);
  };
  return {
    root,
    controller,
    requests,
    children,
    harness,
    ctx,
    notifications,
    command,
    start,
    deliver,
    snapshot: () => JSON.parse(readFileSync(requests[0].statePath, "utf8")),
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

test("default and status have no external effects; command launches retained telemetry with exact ACK; close/reload cannot relaunch", async () => {
  const f = fixture();
  let next;
  try {
    await f.start();
    f.deliver(progress());
    f.deliver(progress("foreign", "/foreign"));
    await f.controller.flush();
    await f.command("status");
    await f.command("unknown");
    assert.deepEqual(readdirSync(f.root), []);
    assert.equal(f.requests.length, 0);
    assert.equal(f.controller.status().status, "idle");
    assert.match(f.notifications[0].message, /idle.*not armed/);
    await f.command();
    assert.equal(f.requests.length, 1);
    assert.equal(f.requests[0].sessionId, f.ctx.sessionManager.getSessionId());
    assert.equal(f.snapshot().observer.launchStatus, "launched");
    assert.deepEqual(
      f.snapshot().groups.map((g) => g.group.id),
      ["retained"],
    );
    assert.doesNotMatch(JSON.stringify(f.snapshot()), /excluded content/);
    assert.match(f.notifications.at(-1).message, /launched \(settled\).*ACK verified/);
    await f.command();
    assert.equal(f.requests.length, 1);
    const closed = once(f.children[0], "close");
    f.children[0].kill("SIGTERM");
    await closed;
    await until(() => f.controller.status().status === "closed");
    await f.command();
    assert.match(f.notifications.at(-1).message, /closed.*cannot be reused/);
    f.deliver(progress("later"));
    await f.controller.flush();
    assert.equal(f.requests.length, 1);
    await f.controller.dispose();
    next = createAscExecutionObserverController({
      env: {},
      stateRoot: f.root,
      async launch() {
        assert.fail("same-session reservation must prevent relaunch");
      },
    });
    next.setHostContext({ mode: "tui", hasUI: true, cwd: "/repo", sessionId: "current-session" });
    next.handle(progress("after-reload"));
    await next.flush();
    assert.equal(next.status().status, "idle");
    assert.equal((await next.open()).status, "closed");
  } finally {
    await next?.dispose();
    await f.cleanup();
  }
});

test("explicit command before valid progress arms without files/launch; invalid events do not trigger it", async () => {
  const f = fixture({
    launch: async () => ({
      ok: false,
      effectDisposition: "confirmed_no_effects",
      failure: "receiver refused",
    }),
  });
  try {
    await f.start();
    await f.command();
    assert.match(f.notifications.at(-1).message, /armed.*no launch yet/);
    f.deliver({ ...progress(), schema: "invalid" });
    f.deliver(progress("foreign", "/foreign"));
    await f.controller.flush();
    assert.deepEqual(readdirSync(f.root), []);
    f.deliver(progress("future"));
    await f.controller.flush();
    await f.command();
    assert.match(
      f.notifications.at(-1).message,
      /failed \(confirmed_no_effects\).*receiver refused/,
    );
    assert.equal(f.requests.length, 1);
  } finally {
    await f.cleanup();
  }
});

for (const mode of ["print", "json", "rpc"]) {
  test(`${mode}, even with UI/Ghostty and explicit opt-in, has no command or controller effects`, async () => {
    const f = fixture({ mode, env: { PI_ASC_OBSERVER: "on" } });
    try {
      await f.start();
      f.deliver(progress());
      await f.command();
      await f.command("status");
      assert.equal((await f.controller.open()).status, "unavailable");
      await f.controller.flush();
      await f.controller.dispose();
      assert.deepEqual(readdirSync(f.root), []);
      assert.deepEqual(f.notifications, []);
      assert.equal(f.requests.length, 0);
    } finally {
      await f.cleanup();
    }
  });
}

for (const value of ["ghostty", "on", "1", "true"]) {
  test(`legacy explicit ${value} still launches automatically on valid TUI progress`, async () => {
    const f = fixture({ env: { PI_ASC_OBSERVER: value } });
    try {
      await f.start();
      f.deliver(progress());
      await f.controller.flush();
      assert.equal(f.requests.length, 1);
      assert.equal(f.controller.status().status, "launched");
    } finally {
      await f.cleanup();
    }
  });
}

test("off remains disabled even for explicit command", async () => {
  const f = fixture({ env: { PI_ASC_OBSERVER: "off" } });
  try {
    await f.start();
    f.deliver(progress());
    await f.command();
    await f.controller.flush();
    assert.match(f.notifications.at(-1).message, /disabled/);
    assert.deepEqual(readdirSync(f.root), []);
    assert.equal(f.requests.length, 0);
  } finally {
    await f.cleanup();
  }
});

test("retained replay preserves observation age, expires terminal groups, and is capped at 128", async () => {
  let clock = Date.now();
  const f = fixture({ now: () => clock });
  try {
    await f.start();
    const event = progress("expired");
    f.deliver(event);
    f.deliver({
      ...event,
      event: "dispatch_terminal",
      progress: undefined,
      terminal: { ok: true, status: "done" },
    });
    await f.controller.flush();
    clock += 600001;
    for (let i = 0; i < 130; i++) f.deliver(progress(`retained-${i}`));
    await f.controller.flush();
    const observed = clock;
    clock += 60000;
    await f.command();
    assert.equal(f.snapshot().groups.length, 128);
    assert.ok(
      f
        .snapshot()
        .groups.every((g) => g.group.id !== "expired" && g.lastObservationAt === observed),
    );
  } finally {
    await f.cleanup();
  }
});

test("hung transport reports pending within a bounded wait; repeated command never redispatches", async () => {
  let settle;
  const f = fixture({
    startupTimeoutMs: 0,
    launch: () =>
      new Promise((resolve) => {
        settle = resolve;
      }),
  });
  try {
    await f.start();
    f.deliver(progress());
    await f.controller.flush();
    const started = Date.now();
    await Promise.all([f.command(), f.command()]);
    assert.ok(Date.now() - started < 2500);
    assert.equal(f.requests.length, 1);
    assert.match(f.notifications.at(-1).message, /pending.*no verified renderer startup; no retry/);
    settle({ ok: true });
    await f.controller.flush();
    await f.command();
    assert.match(
      f.notifications.at(-1).message,
      /unconfirmed.*no verified renderer startup; no retry/,
    );
    assert.equal(f.requests.length, 1);
  } finally {
    settle?.({ ok: true });
    await f.cleanup();
  }
});

for (const value of [undefined, "auto"]) {
  test(`default ${value ?? "unset"} teardown has no files/reservation/probe/launch effects`, async () => {
    const f = fixture({ env: value ? { PI_ASC_OBSERVER: value } : {} });
    try {
      await f.start();
      f.deliver(progress());
      await f.controller.flush();
      await f.controller.dispose();
      assert.deepEqual(readdirSync(f.root), []);
      assert.equal(f.requests.length, 0);
    } finally {
      await f.cleanup();
    }
  });
}

test("session/cwd replacement before arming fences retained data", async () => {
  const f = fixture();
  try {
    await f.start();
    f.deliver(progress());
    await f.controller.flush();
    const replacement = createContext({ sessionId: "replacement", cwd: "/other" }).ctx;
    await f.command("", replacement);
    assert.equal(f.controller.status().status, "disposed");
    assert.deepEqual(readdirSync(f.root), []);
    assert.equal(f.requests.length, 0);
  } finally {
    await f.cleanup();
  }
});

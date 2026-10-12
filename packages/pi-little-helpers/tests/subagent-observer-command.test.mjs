// Source-loaded event relay/controller proof with actual Node renderer ACK, never Ghostty/GUI.
import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { once } from "node:events";
import { mkdtempSync, readdirSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";
import { setTimeout as delay } from "node:timers/promises";
import { createSidequestExtension } from "../extensions/sidequest.ts";
import { ASC_SUBAGENT_OBSERVER_DIAGNOSE_EVENT } from "../extensions/sidequestSubagentDiagnostics.ts";
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
  const replies = [];
  const relay = async (request) => {
    await Promise.all(
      (harness.busEvents.get(ASC_SUBAGENT_OBSERVER_DIAGNOSE_EVENT) ?? []).map((handler) =>
        handler(request),
      ),
    );
  };
  const diagnose = (action = "open", context = ctx) =>
    relay({
      schema: "asc.subagent-observer.diagnose.v1",
      requestId: "test-request",
      cwd: context.cwd,
      parentSessionKey: context.sessionManager.getSessionId(),
      action,
      reply: (response) => replies.push(response),
    });
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
    diagnose,
    relay,
    replies,
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

test("default and status have no external effects; diagnostic request launches retained telemetry with exact ACK; close/reload cannot relaunch", async () => {
  const f = fixture();
  let next;
  try {
    await f.start();
    f.deliver(progress());
    f.deliver(progress("foreign", "/foreign"));
    await f.controller.flush();
    await f.diagnose("status");
    await f.diagnose("unknown");
    assert.deepEqual(readdirSync(f.root), []);
    assert.equal(f.requests.length, 0);
    assert.equal(f.controller.status().status, "idle");
    assert.match(f.replies[0].message, /idle.*not armed/);
    assert.equal(f.replies.length, 1);
    assert.equal(f.harness.commands.has("subagent-observer"), false);
    await f.diagnose();
    assert.equal(f.requests.length, 1);
    assert.equal(f.requests[0].sessionId, f.ctx.sessionManager.getSessionId());
    assert.equal(f.snapshot().observer.launchStatus, "launched");
    assert.deepEqual(
      f.snapshot().groups.map((g) => g.group.id),
      ["retained"],
    );
    assert.doesNotMatch(JSON.stringify(f.snapshot()), /excluded content/);
    assert.match(f.replies.at(-1).message, /launched \(settled\).*ACK verified/);
    await f.diagnose();
    assert.equal(f.requests.length, 1);
    const closed = once(f.children[0], "close");
    f.children[0].kill("SIGTERM");
    await closed;
    await until(() => f.controller.status().status === "closed");
    await f.diagnose();
    assert.match(f.replies.at(-1).message, /closed.*cannot be reused/);
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

test("explicit diagnostic request before valid progress arms without files/launch; invalid events do not trigger it", async () => {
  const f = fixture({
    launch: async () => ({
      ok: false,
      effectDisposition: "confirmed_no_effects",
      failure: "receiver refused",
    }),
  });
  try {
    await f.start();
    await f.diagnose();
    assert.match(f.replies.at(-1).message, /armed.*no launch yet/);
    f.deliver({ ...progress(), schema: "invalid" });
    f.deliver(progress("foreign", "/foreign"));
    await f.controller.flush();
    assert.deepEqual(readdirSync(f.root), []);
    f.deliver(progress("future"));
    await f.controller.flush();
    await f.diagnose();
    assert.match(f.replies.at(-1).message, /failed \(confirmed_no_effects\).*receiver refused/);
    assert.equal(f.requests.length, 1);
  } finally {
    await f.cleanup();
  }
});

for (const mode of ["print", "json", "rpc"]) {
  test(`${mode}, even with UI/Ghostty and explicit opt-in, has no diagnostic request or controller effects`, async () => {
    const f = fixture({ mode, env: { PI_ASC_OBSERVER: "on" } });
    try {
      await f.start();
      f.deliver(progress());
      await f.diagnose();
      await f.diagnose("status");
      assert.equal((await f.controller.open()).status, "unavailable");
      await f.controller.flush();
      await f.controller.dispose();
      assert.deepEqual(readdirSync(f.root), []);
      assert.deepEqual(f.notifications, []);
      assert.deepEqual(f.replies, []);
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

test("off remains disabled even for explicit diagnostic request", async () => {
  const f = fixture({ env: { PI_ASC_OBSERVER: "off" } });
  try {
    await f.start();
    f.deliver(progress());
    await f.diagnose();
    await f.controller.flush();
    assert.match(f.replies.at(-1).message, /disabled/);
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
    await f.diagnose();
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

test("hung transport reports pending within a bounded wait; repeated diagnostic request never redispatches", async () => {
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
    await Promise.all([f.diagnose(), f.diagnose()]);
    assert.ok(Date.now() - started < 2500);
    assert.equal(f.requests.length, 1);
    assert.match(f.replies.at(-1).message, /pending.*no verified renderer startup; no retry/);
    settle({ ok: true });
    await f.controller.flush();
    await f.diagnose();
    assert.match(f.replies.at(-1).message, /unconfirmed.*no verified renderer startup; no retry/);
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
    await f.diagnose("open", replacement);
    assert.equal(f.controller.status().status, "idle");
    assert.deepEqual(f.replies, []);
    assert.deepEqual(readdirSync(f.root), []);
    assert.equal(f.requests.length, 0);
  } finally {
    await f.cleanup();
  }
});

function wired(options = {}) {
  const calls = { host: 0, open: 0, status: 0, dispose: 0 };
  const observer = {
    setHostContext() {
      calls.host++;
    },
    async open() {
      calls.open++;
      return options.open ? options.open() : { status: "armed" };
    },
    status() {
      calls.status++;
      return options.status ? options.status() : { status: "idle" };
    },
    handle() {},
    async dispose() {
      calls.dispose++;
      await options.dispose?.();
    },
  };
  const harness = registerExtension(
    createSidequestExtension({
      registerCommands: options.registerCommands ?? true,
      registerTools: false,
      ascExecutionObserver: observer,
    }),
  );
  const { ctx, notifications } = createContext(options);
  ctx.hasUI = options.hasUI ?? true;
  const replies = [];
  const request = (overrides = {}) => ({
    schema: "asc.subagent-observer.diagnose.v1",
    requestId: "diagnose-1",
    cwd: ctx.cwd,
    parentSessionKey: ctx.sessionManager.getSessionId(),
    action: "open",
    reply(response) {
      replies.push(response);
    },
    ...overrides,
  });
  const lifecycle = async (name, context = ctx) => {
    for (const handler of harness.events.get(name) ?? []) await handler({}, context);
  };
  const send = async (data) => {
    await Promise.all(
      (harness.busEvents.get(ASC_SUBAGENT_OBSERVER_DIAGNOSE_EVENT) ?? []).map((handler) =>
        handler(data),
      ),
    );
  };
  return { harness, ctx, calls, observer, replies, notifications, request, send, lifecycle };
}

test("relay consumes only normal command projection, after start, exact TUI/UI/session/cwd", async () => {
  for (const options of [
    { registerCommands: false },
    { mode: "print" },
    { mode: "json" },
    { mode: "rpc" },
    { hasUI: false },
  ]) {
    const f = wired(options);
    await f.lifecycle("session_start");
    f.calls.host = 0;
    await f.send(f.request());
    await f.send(f.request({ action: "status" }));
    assert.deepEqual(f.replies, []);
    assert.equal(f.calls.host, 0);
    assert.equal(f.calls.open + f.calls.status, 0);
    await f.lifecycle("session_shutdown");
  }
  const f = wired();
  const beforeStart = f.request();
  await f.send(beforeStart);
  assert.equal(f.calls.open, 0);
  await f.lifecycle("session_start");
  await f.send(f.request({ cwd: "/foreign" }));
  await f.send(f.request({ parentSessionKey: "foreign-session" }));
  assert.deepEqual(f.replies, []);
  await f.send(beforeStart); // Ineligible delivery did not claim original.
  assert.equal(f.calls.open, 1);
  assert.equal(f.replies.length, 1);
  assert.deepEqual(f.notifications, []);
  await f.lifecycle("session_shutdown");
});

test("strict descriptor membrane rejects malformed, unbounded, accessor, prototype and unknown fields", async () => {
  const f = wired();
  await f.lifecycle("session_start");
  f.calls.host = 0;
  let accessorReads = 0;
  const malformed = [
    null,
    [],
    "status",
    1,
    Object.create(f.request()),
    f.request({ schema: "wrong" }),
    f.request({ requestId: "" }),
    f.request({ requestId: "x".repeat(257) }),
    f.request({ requestId: "bad\n" }),
    f.request({ parentSessionKey: "x".repeat(257) }),
    f.request({ cwd: "x".repeat(4097) }),
    f.request({ cwd: "relative" }),
    f.request({ cwd: "/repo/../repo" }),
    f.request({ action: "" }),
    f.request({ action: "status extra" }),
    f.request({ action: "launch" }),
    f.request({ reply: "not callable" }),
    f.request({ command: "pi" }),
    f.request({ env: {} }),
    f.request({ args: [] }),
    f.request({ [Symbol("unknown")]: true }),
  ];
  for (const key of ["schema", "requestId", "cwd", "parentSessionKey", "action", "reply"]) {
    const data = f.request();
    Object.defineProperty(data, key, {
      get() {
        accessorReads++;
        throw new Error("getter called");
      },
    });
    malformed.push(data);
    const missing = f.request();
    delete missing[key];
    malformed.push(missing);
  }
  const { proxy, revoke } = Proxy.revocable({}, {});
  revoke();
  malformed.push(proxy);
  for (const data of malformed) await f.send(data);
  assert.equal(accessorReads, 0);
  assert.equal(f.calls.host + f.calls.open + f.calls.status, 0);
  assert.deepEqual(f.replies, []);
  await f.send(Object.assign(Object.create(null), f.request({ action: "status" })));
  assert.equal(f.calls.status, 1);
  assert.equal(f.calls.open, 0);
  assert.deepEqual(Object.keys(f.replies[0]).sort(), ["level", "message", "requestId"]);
  assert.equal(f.replies[0].requestId, "diagnose-1");
  assert.equal(f.replies[0].level, "info");
  await f.lifecycle("session_shutdown");
});

test("process-wide original-object fence spans eligible listeners/module copies; ineligible cannot claim or overwrite", async () => {
  let finish;
  const f = wired({
    open: () =>
      new Promise((resolve) => {
        finish = resolve;
      }),
  });
  const duplicate = wired();
  const foreign = wired({ cwd: "/foreign" });
  for (const item of [f, duplicate, foreign]) await item.lifecycle("session_start");
  const copy = await import("../extensions/sidequestSubagentDiagnostics.ts?duplicate-module");
  let copyRelay;
  const copyHarness = registerExtension((pi) => {
    copyRelay = copy.createSidequestSubagentDiagnostics(pi);
    copyRelay.start(duplicate.ctx, duplicate.observer);
  });
  const data = f.request();
  await foreign.send(data);
  const pending = f.send(data);
  assert.equal(f.calls.open, 1);
  await duplicate.send(data);
  for (const handler of copyHarness.busEvents.get(ASC_SUBAGENT_OBSERVER_DIAGNOSE_EVENT))
    await handler(data);
  assert.equal(duplicate.calls.open, 0);
  finish({ status: "launched", effectDisposition: "settled" });
  await pending;
  assert.equal(f.replies.length, 1);
  assert.match(f.replies[0].message, /ACK verified.*not proven/);
  await f.send(data);
  await duplicate.send(data);
  assert.equal(f.replies.length, 1);
  assert.deepEqual(duplicate.replies, []);
  // Same requestId is not a fence: only original object identity is.
  await f.send(f.request({ action: "status" }));
  assert.equal(f.calls.status, 1);
  copyRelay.stop();
  for (const item of [f, duplicate, foreign]) await item.lifecycle("session_shutdown");
});

for (const migration of ["shutdown", "session", "cwd", "mutable-context"]) {
  test(
    "stale callbacks/in-flight replies fenced after " +
      migration +
      "; fresh start restores subscription",
    async () => {
      let finish;
      const f = wired({
        open: () =>
          new Promise((resolve) => {
            finish = resolve;
          }),
      });
      await f.lifecycle("session_start");
      const stale = f.harness.busEvents.get(ASC_SUBAGENT_OBSERVER_DIAGNOSE_EVENT)[0];
      const pending = f.send(f.request());
      assert.equal(f.calls.open, 1);
      let nextContext = f.ctx;
      if (migration === "shutdown") {
        await f.lifecycle("session_shutdown");
        assert.deepEqual(f.harness.busEvents.get(ASC_SUBAGENT_OBSERVER_DIAGNOSE_EVENT), []);
      } else if (migration === "mutable-context") {
        f.ctx.sessionManager.getSessionId = () => "changed-in-place";
      } else {
        nextContext = createContext(
          migration === "session"
            ? { sessionId: "next-session", cwd: f.ctx.cwd }
            : { sessionId: f.ctx.sessionManager.getSessionId(), cwd: "/next-cwd" },
        ).ctx;
        await f.lifecycle("session_start", nextContext);
      }
      await stale(f.request({ action: "status" }));
      finish({ status: "launched" });
      await pending;
      assert.deepEqual(f.replies, []);
      assert.equal(f.calls.open, 1);
      assert.equal(f.calls.status, 0);
      await f.lifecycle("session_start", nextContext);
      await f.send(
        f.request({
          cwd: nextContext.cwd,
          parentSessionKey: nextContext.sessionManager.getSessionId(),
          action: "status",
        }),
      );
      assert.equal(f.calls.open, 1);
      assert.equal(f.calls.status, 1);
      assert.equal(f.replies.length, 1);
      await f.lifecycle("session_shutdown", nextContext);
    },
  );
}

test("reply is bounded, request data snapshotted, callback failure/reentrancy cannot retry", async () => {
  let finish;
  const f = wired({
    open: () =>
      new Promise((resolve) => {
        finish = resolve;
      }),
  });
  await f.lifecycle("session_start");
  let deliveries = 0;
  const data = f.request({
    reply(response) {
      deliveries++;
      f.replies.push(response);
      void f.send(data);
      throw new Error("receiver failed");
    },
  });
  const pending = f.send(data);
  data.requestId = "mutated";
  data.action = "status";
  data.reply = () => assert.fail("mutable reply used");
  finish({ status: "failed", detail: "x".repeat(10000) });
  await pending;
  assert.equal(deliveries, 1);
  assert.equal(f.replies[0].message.length, 4096);
  assert.equal(f.replies[0].requestId, "diagnose-1");
  assert.equal(f.replies[0].level, "warning");
  assert.equal(f.calls.open, 1);
  assert.equal(f.calls.status, 0);
  await f.lifecycle("session_shutdown");
});

test("shutdown during awaited session migration cannot resurrect the diagnostic listener", async () => {
  let finish;
  const disposal = new Promise((resolve) => {
    finish = resolve;
  });
  const f = wired({ dispose: () => disposal });
  await f.lifecycle("session_start");
  const next = createContext({ sessionId: "next", cwd: "/next" }).ctx;
  const starting = f.lifecycle("session_start", next);
  await until(() => f.calls.dispose === 1);
  const shutdown = f.lifecycle("session_shutdown");
  await until(() => f.calls.dispose === 2);
  finish();
  await Promise.all([starting, shutdown]);
  assert.deepEqual(f.harness.busEvents.get(ASC_SUBAGENT_OBSERVER_DIAGNOSE_EVENT), []);
  await f.send(f.request({ cwd: next.cwd, parentSessionKey: "next", action: "status" }));
  assert.deepEqual(f.replies, []);
  assert.equal(f.calls.status, 0);
  await f.lifecycle("session_start", next);
  await f.send(f.request({ cwd: next.cwd, parentSessionKey: "next", action: "status" }));
  assert.equal(f.calls.status, 1);
  await f.lifecycle("session_shutdown", next);
});

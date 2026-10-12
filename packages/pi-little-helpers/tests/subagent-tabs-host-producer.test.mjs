// Actual ASC public entrypoint /subagents producer + registry callbacks, two LH listeners,
// actual Pi event bus with distinct API/events wrappers. Transport remains a stub: no GUI/model.
import assert from "node:assert/strict";
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import test from "node:test";
import { setTimeout as delay } from "node:timers/promises";
import { createEventBus } from "@earendil-works/pi-coding-agent";
import { readAttachment } from "../../pi-autonomous-session-control/attachments.ts";
// Test-only public ASC surfaces; LH production has no ASC imports/dependency.
import { createExtension } from "../../pi-autonomous-session-control/extensions/self.ts";
import { registerSubagentTabHost } from "../extensions/sidequestSubagentTabs.ts";
import { ASC_SUBAGENT_TABS_EVENT } from "../extensions/sidequestSubagentTabsProtocol.ts";
import { createContext } from "./sidequest-harness.mjs";

async function until(predicate, timeout = 2000) {
  const deadline = Date.now() + timeout;
  while (!predicate()) {
    if (Date.now() >= deadline) assert.fail("condition timeout");
    await delay(10);
  }
}
function api(bus, emit = (name, value) => bus.emit(name, value)) {
  const commands = new Map(),
    lifecycle = new Map();
  const pi = {
    // Match Pi loader: wrappers differ but on/emit address the same underlying event bus.
    events: { on: (name, handler) => bus.on(name, handler), emit },
    on(name, handler) {
      const handlers = lifecycle.get(name) ?? [];
      handlers.push(handler);
      lifecycle.set(name, handlers);
    },
    registerCommand(name, command) {
      commands.set(name, command);
    },
    registerTool() {},
    registerShortcut() {},
    getModel() {
      return undefined;
    },
  };
  return {
    pi,
    commands,
    lifecycle,
    async event(name, ctx) {
      for (const handler of lifecycle.get(name) ?? []) await handler({}, ctx);
    },
  };
}
async function fixture(t, { invalidFirst = false, outcome = "refused" } = {}) {
  const root = mkdtempSync(join(resolve(tmpdir()), "ak7039-tabs-producer-"));
  const sessionsDir = join(root, "sessions");
  mkdirSync(join(root, ".git"));
  mkdirSync(sessionsDir, { mode: 0o700 });
  const stat = readFileSync(`/proc/${process.pid}/stat`, "utf8");
  const ticks = Number(stat.slice(stat.lastIndexOf(")") + 2).split(" ")[19]);
  writeFileSync(
    join(sessionsDir, "child.status.json"),
    JSON.stringify({
      sessionName: "child",
      sessionKind: "subagent",
      status: "running",
      pid: process.pid,
      ppid: process.ppid,
      pidStartedAt: ticks,
      pidIdentity: "proc-start-ticks",
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
      dispatchId: "dispatch",
      attemptId: "attempt",
      parentSessionKey: "parent",
      parentRepoRoot: root,
      sessionFile: join(sessionsDir, "child.jsonl"),
    }),
    { mode: 0o600 },
  );
  const previous = {
    TERM_PROGRAM: process.env.TERM_PROGRAM,
    GHOSTTY_SURFACE_ID: process.env.GHOSTTY_SURFACE_ID,
  };
  process.env.TERM_PROGRAM = "ghostty";
  process.env.GHOSTTY_SURFACE_ID = "4660";
  const bus = createEventBus();
  const first = api(bus),
    second = api(bus);
  const emitted = [],
    replies = [],
    claims = [],
    launches = [];
  const producer = api(bus, (name, request) => {
    if (name === ASC_SUBAGENT_TABS_EVENT) {
      emitted.push(request);
      const claim = request.claim,
        reply = request.reply;
      request.claim = (key) => {
        claims.push(key);
        return claim(key);
      };
      request.reply = (result) => {
        replies.push(result);
        reply(result);
      };
    }
    bus.emit(name, request);
  });
  const { ctx, notifications } = createContext({ cwd: root, sessionId: "parent" });
  ctx.ui.setStatus = () => {};
  let release;
  const hostOptions = {
    env: { TERM_PROGRAM: "ghostty", GHOSTTY_SURFACE_ID: "4660" },
    subagentTabsLaunch: async (request) => {
      launches.push(request);
      assert.equal(await request.beforeDispatch(), true);
      return new Promise((done) => {
        release = done;
      });
    },
  };
  registerSubagentTabHost(first.pi, hostOptions, "pi");
  registerSubagentTabHost(second.pi, hostOptions, "pi");
  assert.notEqual(first.pi, second.pi);
  assert.notEqual(first.pi.events, second.pi.events);
  const firstContext =
    invalidFirst === "session"
      ? { ...ctx, sessionManager: { ...ctx.sessionManager, getSessionId: () => "foreign-session" } }
      : invalidFirst
        ? { ...ctx, mode: "rpc" }
        : ctx;
  await first.event("session_start", firstContext);
  await second.event("session_start", ctx);
  createExtension(sessionsDir)(producer.pi);
  const command = () => producer.commands.get("subagents").handler("", ctx);
  t.after(async () => {
    await first.event("session_shutdown", ctx);
    await second.event("session_shutdown", ctx);
    await producer.event("session_shutdown", ctx);
    bus.clear();
    for (const [key, value] of Object.entries(previous)) {
      if (value === undefined) delete process.env[key];
      else process.env[key] = value;
    }
    rmSync(root, { recursive: true, force: true });
  });
  return {
    first,
    second,
    emitted,
    replies,
    claims,
    launches,
    notifications,
    command,
    release() {
      release(
        outcome === "refused"
          ? { ok: false, effectDisposition: "confirmed_no_effects", launchMode: "tab" }
          : { ok: true, effectDisposition: "settled", launchMode: "tab" },
      );
    },
  };
}

for (const invalidFirst of [false, "rpc", "session"]) {
  test(`actual ASC command cannot finish early with duplicate blocked reply (invalid first: ${invalidFirst})`, async (t) => {
    const f = await fixture(t, { invalidFirst });
    let finished = false;
    const command = f.command().then(() => {
      finished = true;
    });
    await until(() => f.launches.length === 1);
    assert.equal(f.claims.length, 1);
    assert.equal(f.replies.length, 0, "neither duplicate nor wrong-context listener may reply");
    assert.equal(finished, false);
    assert.equal(readAttachment(f.emitted[0].items[0]).status, "claimed");
    f.release();
    await command;
    assert.equal(f.replies.length, 1);
    assert.equal(f.replies[0].items[0].status, "failed");
    assert.match(f.notifications.at(-1).message, /child: failed/);
    assert.equal(readAttachment(f.emitted[0].items[0]).status, "confirmed_no_effects");
  });
}

test("actual ASC producer waits for original consumer's bounded native-ready result after transport acceptance", async (t) => {
  const f = await fixture(t, { outcome: "accepted" });
  let finished = false;
  const command = f.command().then(() => {
    finished = true;
  });
  await until(() => f.launches.length === 1);
  f.release();
  await until(() => readAttachment(f.emitted[0].items[0]).status === "awaiting_ready");
  assert.equal(finished, false);
  assert.equal(f.replies.length, 0);
  await command;
  assert.equal(f.replies.length, 1);
  assert.equal(f.replies[0].items[0].status, "unconfirmed", "no synthetic native ACK supplied");
  assert.equal(f.claims.length, 1);
  assert.equal(f.launches.length, 1);
  assert.match(f.notifications.at(-1).message, /child: unconfirmed/);
});

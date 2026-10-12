// Focused controller routing, read-only reporting, destructive opt-in, and observer protocol tests.
import assert from "node:assert/strict";
import { mkdtemp, readdir, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import test from "node:test";
import { ATTACHMENT_EVENT } from "../extensions/self/subagent-attachment-registry.ts";
import { reserveSharedSubagentCapacity } from "../extensions/self/subagent-capacity.ts";
import {
  registerSubagentCommands,
  routeSubagentCommand,
} from "../extensions/self/subagent-commands.ts";
import { createSubagentState, writeSessionStatus } from "../extensions/self/subagent-session.ts";
import { fixture } from "./subagent-cockpit-harness.mjs";

const OBSERVER_EVENT = "asc:subagent-observer:diagnose:v1";

function harness(f, consumer) {
  const commands = new Map();
  const notices = [];
  const events = [];
  const ctx = {
    cwd: f?.root ?? process.cwd(),
    mode: "tui",
    hasUI: true,
    sessionKey: f?.binding.parentSessionKey ?? "parent-command-test",
    ui: {
      notify: (message, level) => notices.push({ message, level }),
      custom() {
        throw new Error("No controller overlay");
      },
      setEditorText() {
        throw new Error("No controller editor mutation");
      },
    },
  };
  const pi = {
    registerCommand(name, definition) {
      assert.ok(!commands.has(name), `duplicate command ${name}`);
      commands.set(name, definition);
    },
    events: {
      emit(name, request) {
        events.push({ name, request });
        consumer?.(request, ctx, name);
      },
    },
  };
  return { pi, commands, ctx, notices, events };
}

async function snapshot(dir) {
  const names = (await readdir(dir, { recursive: true })).sort();
  const files = {};
  for (const name of names) {
    try {
      files[name] = await readFile(join(dir, name), "utf8");
    } catch (error) {
      if (error.code !== "EISDIR") throw error;
    }
  }
  return files;
}

async function scratch(action) {
  const sessionsDir = await mkdtemp(join(tmpdir(), "asc-command-test-"));
  try {
    const state = createSubagentState(sessionsDir);
    const sessionFile = join(sessionsDir, "done.jsonl");
    await writeFile(sessionFile, "test-owned trace\n");
    await writeFile(
      join(sessionsDir, "done.lock"),
      JSON.stringify({ sessionName: "done", sessionKind: "subagent" }),
    );
    writeSessionStatus(sessionsDir, "done", {
      status: "done",
      pid: process.pid,
      ppid: process.ppid,
      createdAt: new Date().toISOString(),
      sessionKind: "subagent",
      sessionFile,
    });
    await action(state);
  } finally {
    await rm(sessionsDir, { recursive: true, force: true });
  }
}

async function ghostty(action) {
  const old = process.env.TERM_PROGRAM;
  const oldSurface = process.env.GHOSTTY_SURFACE_ID;
  process.env.TERM_PROGRAM = "ghostty";
  process.env.GHOSTTY_SURFACE_ID = "123";
  try {
    await action();
  } finally {
    if (old === undefined) delete process.env.TERM_PROGRAM;
    else process.env.TERM_PROGRAM = old;
    if (oldSurface === undefined) delete process.env.GHOSTTY_SURFACE_ID;
    else process.env.GHOSTTY_SURFACE_ID = oldSurface;
  }
}

function addChild(f, name, status, extras = {}) {
  writeSessionStatus(f.state.sessionsDir, name, {
    ...f.fields,
    status,
    dispatchId: `dispatch-${name}`,
    attemptId: `attempt-${name}`,
    sessionFile: join(f.state.sessionsDir, `${name}.jsonl`),
    ...extras,
  });
}

function fakeDeadline(t) {
  const oldSet = globalThis.setTimeout;
  const oldClear = globalThis.clearTimeout;
  const timers = [];
  globalThis.setTimeout = (callback, ms) => {
    const timer = { callback, ms, cleared: false };
    timers.push(timer);
    return timer;
  };
  globalThis.clearTimeout = (timer) => {
    timer.cleared = true;
  };
  t.after(() => {
    globalThis.setTimeout = oldSet;
    globalThis.clearTimeout = oldClear;
  });
  return timers;
}

function observerReply(request, extras = {}) {
  return { requestId: request.requestId, message: "Observer available", level: "info", ...extras };
}

test("registers only subagents; dashboard router is exported", () => {
  const h = harness();
  registerSubagentCommands(h.pi, {});
  assert.deepEqual([...h.commands.keys()], ["subagents"]);
  assert.equal(typeof routeSubagentCommand, "function");
});

test("empty opens running/current; exact names include settled original attempts and reserved-name escapes", async () =>
  ghostty(async () => {
    const f = fixture();
    try {
      const names = ["terminal", "status", "diagnose", "all", "done", "cancel"];
      for (const name of names) addChild(f, name, "done");
      addChild(f, "foreign", "running", { parentSessionKey: "another-parent" });
      addChild(f, "foreign-repo", "running", { parentRepoRoot: "/another-repo" });
      const h = harness(f, (request, _ctx, event) => {
        assert.equal(event, ATTACHMENT_EVENT);
        request.reply({
          requestId: request.requestId,
          items: request.items.map((item) => ({ key: item.key, status: "blocked" })),
        });
      });
      registerSubagentCommands(h.pi, f.state);
      await h.commands.get("subagents").handler(" \t ", h.ctx);
      assert.deepEqual(
        h.events[0].request.items.map((item) => item.sessionName),
        ["child"],
      );
      for (const name of names) {
        const args = ["status", "diagnose"].includes(name) ? `--name ${name}` : `  ${name}  `;
        await routeSubagentCommand(h.pi, f.state, h.ctx, args);
        const items = h.events.at(-1).request.items;
        assert.equal(items.length, 1);
        assert.equal(items[0].sessionName, name);
        assert.equal(items[0].dispatchId, `dispatch-${name}`);
        assert.equal(items[0].attemptId, `attempt-${name}`);
      }
      const count = h.events.length;
      await routeSubagentCommand(h.pi, f.state, h.ctx, "missing");
      await routeSubagentCommand(h.pi, f.state, h.ctx, "terminal extra");
      await routeSubagentCommand(h.pi, f.state, h.ctx, "foreign");
      assert.equal(h.events.length, count);
      assert.ok(h.notices.some((n) => /No matching/.test(n.message)));
      assert.equal(f.state.activeCount, 0);
      assert.equal(f.state.completedCount, 0);
      assert.ok(
        !(await readdir(f.state.sessionsDir)).some((name) => name.endsWith(".cancel.json")),
      );
    } finally {
      f.cleanup();
    }
  }));

test("status is concise, read-only, current-session scoped; detailed capacity remains advanced", async () => {
  const f = fixture();
  let lease;
  try {
    for (const status of ["done", "error", "timeout", "aborted", "abandoned"])
      addChild(f, status, status);
    addChild(f, "other", "done", { parentSessionKey: "another-parent" });
    addChild(f, "other-repo", "done", { parentRepoRoot: "/another-repo" });
    addChild(f, "unlinked", "done", { parentSessionKey: undefined });
    // Reporting must not reconcile/write a dead running record.
    addChild(f, "dead-running", "running", { pid: 2147483647 });
    lease = reserveSharedSubagentCapacity(f.state.sessionsDir, f.state.maxConcurrent, {
      leaseMetadata: {
        dispatchId: "dispatch-holder-private-id",
        attemptId: "attempt-holder-private-id",
        sessionName: "holder-private-name",
      },
    });
    assert.ok(lease);
    const before = await snapshot(f.state.sessionsDir);
    const h = harness(f);
    await routeSubagentCommand(h.pi, f.state, h.ctx, "  status  ");
    assert.equal(h.notices.length, 1);
    assert.equal(h.notices[0].level, "info");
    const message = h.notices[0].message;
    assert.match(message, /current session/);
    assert.match(message, /running=2, done=1, error=1, timeout=1, aborted=1, abandoned=1/);
    assert.match(message, /repository shared holders=1\/5/);
    assert.doesNotMatch(message, /holder-private|parentPid|slot=|process-local/);
    await routeSubagentCommand(h.pi, f.state, h.ctx, "diagnose capacity");
    assert.match(h.notices[1].message, /shared holders=1\/5/);
    assert.match(h.notices[1].message, /session=holder-private-name/);
    assert.match(h.notices[1].message, /parentPid=/);
    assert.deepEqual(await snapshot(f.state.sessionsDir), before);
    assert.equal(h.events.length, 0);
    assert.equal(f.state.activeCount, 0);
    assert.equal(f.state.completedCount, 0);
    assert.equal(f.state.reservedSessionNames.size, 0);
  } finally {
    lease?.release();
    f.cleanup();
  }
});

test("status without identity cannot silently report all sessions", async () => {
  const f = fixture();
  try {
    const h = harness(f);
    delete h.ctx.sessionKey;
    await routeSubagentCommand(h.pi, f.state, h.ctx, "status");
    assert.match(h.notices[0].message, /identity required/);
    assert.equal(h.events.length, 0);
  } finally {
    f.cleanup();
  }
});

test("clear and cleanup preserve all artifacts without explicit --delete, including headless", async () =>
  scratch(async (state) => {
    const before = await snapshot(state.sessionsDir);
    const h = harness();
    for (const args of ["diagnose clear", "diagnose cleanup", "diagnose cleanup 0 0"]) {
      await routeSubagentCommand(h.pi, state, h.ctx, args);
      assert.match(h.notices.at(-1).message, /preserved/);
      await routeSubagentCommand(h.pi, state, { ...h.ctx, hasUI: false }, args);
      assert.deepEqual(await snapshot(state.sessionsDir), before);
    }
    assert.equal(h.events.length, 0);
  }));

test("malformed/unknown/extra diagnostic arguments fail closed even when --delete occurs", async () =>
  scratch(async (state) => {
    const before = await snapshot(state.sessionsDir);
    const h = harness();
    const malformed = [
      "diagnose",
      "diagnose unknown",
      "diagnose cancel",
      "diagnose capacity extra",
      "diagnose clear foo",
      "diagnose clear --delete foo",
      "diagnose clear --delete --delete",
      "diagnose cleanup junk",
      "diagnose cleanup --delete junk",
      "diagnose cleanup --delete -1",
      "diagnose cleanup --delete 1.5",
      "diagnose cleanup --delete 0 0 extra",
      "diagnose cleanup --delete --delete",
      "diagnose cleanup 0 --delete",
      "diagnose cleanup --delete 9999999999999999999999",
      "diagnose cleanup --delete 9007199254740991",
      "diagnose cleanup --delete 0 9007199254740992",
      "diagnose observer open",
      "diagnose observer status extra",
      "--name",
    ];
    for (const args of malformed) {
      await routeSubagentCommand(h.pi, state, h.ctx, args);
      assert.match(h.notices.at(-1).message, /Usage:/, args);
      assert.equal(h.notices.at(-1).level, "warning", args);
      assert.deepEqual(await snapshot(state.sessionsDir), before, args);
    }
    assert.equal(h.events.length, 0);
  }));

for (const args of ["diagnose clear --delete", "diagnose cleanup --delete 0 0"]) {
  test(`${args} deletes only test-owned scratch artifacts`, async () =>
    scratch(async (state) => {
      const h = harness();
      await routeSubagentCommand(h.pi, state, { ...h.ctx, hasUI: false }, args);
      assert.deepEqual(await readdir(state.sessionsDir), []);
      assert.equal(h.events.length, 0);
    }));
}

test("cleanup --delete default thresholds preserve recent test artifacts", async () =>
  scratch(async (state) => {
    const before = await snapshot(state.sessionsDir);
    const h = harness();
    await routeSubagentCommand(h.pi, state, h.ctx, "diagnose cleanup --delete");
    assert.match(h.notices[0].message, /Deleted 0 sessions/);
    assert.deepEqual(await snapshot(state.sessionsDir), before);
  }));

test("observer refuses non-TUI/no-UI before any emit", async () => {
  const h = harness();
  for (const ctx of [
    { ...h.ctx, mode: "rpc" },
    { ...h.ctx, mode: "json", hasUI: false },
    { ...h.ctx, mode: "tui", hasUI: false },
  ]) {
    await routeSubagentCommand(h.pi, {}, ctx, "diagnose observer");
    await routeSubagentCommand(h.pi, {}, ctx, "diagnose observer status");
  }
  assert.equal(h.events.length, 0);
  assert.ok(h.notices.every((n) => n.level === "warning" && /require interactive/.test(n.message)));
});

test("observer exact content-free synchronous request, action selection, sanitized single reply", async () => {
  const requests = [];
  const h = harness(undefined, (request, ctx, event) => {
    assert.equal(event, OBSERVER_EVENT);
    assert.deepEqual(
      Object.keys(request).sort(),
      ["schema", "requestId", "cwd", "parentSessionKey", "action", "reply"].sort(),
    );
    assert.equal(request.schema, "asc.subagent-observer.diagnose.v1");
    assert.match(request.requestId, /^[0-9a-f-]{36}$/);
    assert.equal(request.cwd, resolve(ctx.cwd));
    assert.equal(request.parentSessionKey, ctx.sessionKey);
    requests.push(request);
    request.reply(
      observerReply(request, {
        message: "\u001b[31mObserver\u001b[0m\nready\u202e\u0007",
        level: "warning",
      }),
    );
    request.reply(observerReply(request, { message: "duplicate" }));
  });
  for (const args of ["diagnose observer", "diagnose observer status"]) {
    const pending = routeSubagentCommand(h.pi, {}, h.ctx, args);
    assert.equal(requests.length, h.notices.length); // emit and reply already happened, no awaited emit.
    await pending;
  }
  assert.deepEqual(
    requests.map((r) => r.action),
    ["open", "status"],
  );
  assert.notEqual(requests[0].requestId, requests[1].requestId);
  assert.deepEqual(h.notices, [
    { message: "Observer ready", level: "warning" },
    { message: "Observer ready", level: "warning" },
  ]);
});

test("observer ignores malformed, unknown-key, over-bound and miscorrelated replies", async () => {
  const h = harness(undefined, (request) => {
    for (const invalid of [
      null,
      Object.defineProperties(
        {},
        {
          requestId: { value: request.requestId, enumerable: true },
          message: {
            get() {
              throw new Error("Do not evaluate reply getters");
            },
            enumerable: true,
          },
          level: { value: "info", enumerable: true },
        },
      ),
      new Proxy(
        {},
        {
          ownKeys() {
            throw new Error("Malformed reply");
          },
        },
      ),
      [],
      {},
      observerReply(request, { requestId: "stale" }),
      observerReply(request, { level: "error" }),
      observerReply(request, { message: 42 }),
      observerReply(request, { message: "x".repeat(4097) }),
      observerReply(request, { message: "\u001b[31m\u001b[0m" }),
      observerReply(request, { extra: "not allowed" }),
      observerReply(request, { [Symbol("extra")]: "not allowed" }),
    ]) {
      request.reply(invalid);
      assert.equal(h.notices.length, 0);
    }
    request.reply(observerReply(request, { message: "x".repeat(4096) }));
  });
  await routeSubagentCommand(h.pi, {}, h.ctx, "diagnose observer status");
  assert.equal(h.notices.length, 1);
  assert.equal(h.notices[0].message.length, 500);
});

test("observer ignores a revoked Proxy reply and then accepts a valid reply", async (t) => {
  const timers = fakeDeadline(t);
  const h = harness();
  const pending = routeSubagentCommand(h.pi, {}, h.ctx, "diagnose observer status");
  const request = h.events[0].request;
  const { proxy, revoke } = Proxy.revocable({}, {});
  revoke();
  try {
    assert.doesNotThrow(() => request.reply(proxy));
    assert.deepEqual(h.notices, []);
    request.reply(observerReply(request));
    await pending;
    assert.deepEqual(h.notices, [{ message: "Observer available", level: "info" }]);
    assert.equal(timers[0].cleared, true);
    assert.equal(h.events.length, 1);
  } finally {
    timers[0].callback();
    await pending;
  }
});

test("observer ignores changed parent/cwd/mode and stale duplicate callbacks", async (t) => {
  const timers = fakeDeadline(t);
  const h = harness();
  for (const field of ["sessionKey", "cwd", "mode"]) {
    const pending = routeSubagentCommand(h.pi, {}, h.ctx, "diagnose observer");
    const request = h.events.at(-1).request;
    const old = h.ctx[field];
    h.ctx[field] = field === "mode" ? "rpc" : "changed";
    request.reply(observerReply(request));
    assert.equal(h.notices.length, 0);
    assert.equal(timers.at(-1).ms, 7000);
    timers.at(-1).callback();
    await pending;
    h.ctx[field] = old;
    request.reply(observerReply(request));
    assert.equal(h.notices.length, 0);
  }
  assert.equal(h.events.length, 3);
});

test("absent LH observer listener times out once, explains unavailable, no fallback/retry", async (t) => {
  const timers = fakeDeadline(t);
  const h = harness();
  const pending = routeSubagentCommand(h.pi, {}, h.ctx, "diagnose observer status");
  assert.equal(h.events.length, 1);
  assert.equal(timers.length, 1);
  assert.equal(timers[0].ms, 7000);
  timers[0].callback();
  await pending;
  assert.equal(timers[0].cleared, true);
  assert.equal(h.notices.length, 1);
  assert.match(
    h.notices[0].message,
    /unavailable.*LH.*Load pi-little-helpers.*no fallback or retry/,
  );
  assert.equal(h.notices[0].level, "warning");
  h.events[0].request.reply(observerReply(h.events[0].request));
  timers[0].callback();
  assert.equal(h.notices.length, 1);
  assert.equal(h.events.length, 1);
});

test("synchronous observer emit failure is bounded and not retried", async () => {
  const h = harness(undefined, () => {
    throw new Error("listener failed");
  });
  await routeSubagentCommand(h.pi, {}, h.ctx, "diagnose observer");
  assert.equal(h.events.length, 1);
  assert.equal(h.notices.length, 1);
  assert.match(h.notices[0].message, /unavailable/);
});

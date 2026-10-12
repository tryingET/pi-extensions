import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { EventEmitter, once } from "node:events";
import { writeFileSync } from "node:fs";
import { join } from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";
import { requestSubagentTabs } from "../extensions/self/subagent-attachment-commands.ts";
import { ATTACHMENT_EVENT, viewerArgv } from "../extensions/self/subagent-attachment-registry.ts";
import { fixture } from "./subagent-cockpit-harness.mjs";

function setup(f) {
  const bus = new EventEmitter(),
    lifecycle = new Map(),
    notices = [];
  const ctx = {
    cwd: f.root,
    mode: "tui",
    hasUI: true,
    sessionManager: { getSessionId: () => f.binding.parentSessionKey },
    ui: {
      notify: (...args) => notices.push(args),
      custom() {
        throw new Error("No overlay");
      },
    },
  };
  const pi = {
    events: {
      emit: (name, value) => bus.emit(name, value),
      on(name, handler) {
        bus.on(name, handler);
        return () => bus.off(name, handler);
      },
    },
    on(name, handler) {
      const list = lifecycle.get(name) ?? [];
      list.push(handler);
      lifecycle.set(name, list);
    },
  };
  return { pi, ctx, bus, notices, lifecycle };
}
async function withGhosttyFixture(action) {
  const original = {
    TERM_PROGRAM: process.env.TERM_PROGRAM,
    GHOSTTY_SURFACE_ID: process.env.GHOSTTY_SURFACE_ID,
  };
  process.env.TERM_PROGRAM = "ghostty";
  process.env.GHOSTTY_SURFACE_ID = "123";
  try {
    await action();
  } finally {
    for (const [key, value] of Object.entries(original)) {
      if (value === undefined) delete process.env[key];
      else process.env[key] = value;
    }
  }
}
async function ackFixture(f, item) {
  const registry = fileURLToPath(
    new URL("../extensions/self/subagent-attachment-registry.ts", import.meta.url),
  );
  const script = join(f.root, "producer-ack-fixture.mjs");
  writeFileSync(
    script,
    `import { acknowledgeAttachmentWithRetry } from ${JSON.stringify(registry)};
    await acknowledgeAttachmentWithRetry(process.argv.at(-1));
    console.log('ready'); setInterval(() => {}, 1000);`,
  );
  const child = spawn(
    process.execPath,
    [script, ...viewerArgv(item.viewerExtensionPath, item.ticketPath)],
    { cwd: f.root, stdio: ["ignore", "pipe", "pipe"] },
  );
  let err = "";
  child.stderr.on("data", (d) => {
    err += d;
  });
  try {
    await Promise.race([
      once(child.stdout, "data"),
      once(child, "exit").then(() => {
        throw new Error(err || "ACK fixture exited");
      }),
      new Promise((_, reject) =>
        setTimeout(() => reject(new Error("ACK fixture timeout")), 5000).unref(),
      ),
    ]);
    return child;
  } catch (error) {
    if (child.exitCode === null) {
      child.kill();
      await once(child, "exit");
    }
    throw error;
  }
}
async function stop(child) {
  if (child && child.exitCode === null) {
    child.kill();
    await once(child, "exit");
  }
}

test("actual ASC producer/shared event bus ignores duplicate blocked mirror while admitted launch owns claim; ready outcome wins", async () =>
  withGhosttyFixture(async () => {
    const f = fixture();
    const h = setup(f);
    let request,
      child,
      pending,
      completed = false,
      launches = 0;
    try {
      h.bus.on(ATTACHMENT_EVENT, (r) => {
        request = r;
        assert.equal(r.claim(r.items[0].key).action, "launch");
        launches++;
      });
      h.bus.on(ATTACHMENT_EVENT, (r) => {
        assert.equal(r.claim(r.items[0].key).action, "blocked");
        r.reply({
          requestId: r.requestId,
          items: r.items.map((i) => ({
            key: i.key,
            status: "blocked",
            detail: "duplicate listener mirror",
          })),
        });
      });
      pending = requestSubagentTabs(h.pi, f.state, h.ctx).then(() => {
        completed = true;
      });
      await new Promise((resolve) => setImmediate(resolve));
      assert.equal(completed, false);
      assert.equal(h.notices.length, 0);
      request.settle(request.items[0].key, { ok: true, effectDisposition: "settled" });
      assert.equal(request.read(request.items[0].key).status, "awaiting_ready");
      child = await ackFixture(f, request.items[0]);
      await pending; // Owner readiness polling can recover even if the winning listener reply is delayed.
      assert.equal(launches, 1);
      assert.equal(h.notices.length, 1);
      assert.match(h.notices[0][0], /child: ready/);
      assert.equal(h.notices[0][1], "info");
      assert.doesNotMatch(h.notices[0][0], /duplicate listener/);
    } finally {
      if (request && !completed)
        request.reply({
          requestId: request.requestId,
          items: request.items.map((i) => ({ key: i.key, status: "unconfirmed" })),
        });
      await pending;
      await stop(child);
      f.cleanup();
    }
  }));

test("actual ASC producer plus two actual LH consumers on one bus admits one fixed transport and reports registered ready", async () =>
  withGhosttyFixture(async () => {
    // Source integration only; no LH runtime dependency or mutation. Transport is a registry fixture, NOT Ghostty/Pi.
    const { registerSubagentTabHost } = await import(
      "../../pi-little-helpers/extensions/sidequestSubagentTabs.ts"
    );
    const f = fixture();
    const h = setup(f);
    let child,
      launches = 0;
    try {
      const options = {
        env: { ...process.env },
        currentGhosttyAncestor: { pid: process.pid },
        exec() {
          throw new Error("No real external transport allowed");
        },
        subagentTabsLaunch: async (params) => {
          launches++;
          assert.equal(await params.beforeDispatch(), true);
          const args = params.command.args;
          child = await ackFixture(f, {
            viewerExtensionPath: args[args.indexOf("-e") + 1],
            ticketPath: args.at(-1),
          });
          return { ok: true };
        },
      };
      registerSubagentTabHost(h.pi, options, "pi");
      registerSubagentTabHost(h.pi, options, "pi");
      for (const start of h.lifecycle.get("session_start")) await start({}, h.ctx);
      await requestSubagentTabs(h.pi, f.state, h.ctx);
      assert.equal(launches, 1);
      assert.equal(h.notices.length, 1);
      assert.match(h.notices[0][0], /child: ready/);
      assert.equal(h.notices[0][1], "info");
    } finally {
      for (const shutdown of h.lifecycle.get("session_shutdown") ?? []) await shutdown({}, h.ctx);
      await stop(child);
      f.cleanup();
    }
  }));

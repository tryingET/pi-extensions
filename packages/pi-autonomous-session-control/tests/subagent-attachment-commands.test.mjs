import assert from "node:assert/strict";
import test from "node:test";
import { requestSubagentTabs } from "../extensions/self/subagent-attachment-commands.ts";
import {
  ATTACHMENT_EVENT,
  readAttachmentTicket,
} from "../extensions/self/subagent-attachment-registry.ts";
import { writeSessionStatus } from "../extensions/self/subagent-session.ts";
import { fixture } from "./subagent-cockpit-harness.mjs";

function harness(f, consumer) {
  const notices = [],
    events = [];
  const ctx = {
    cwd: f.root,
    mode: "tui",
    hasUI: true,
    sessionKey: f.binding.parentSessionKey,
    ui: {
      notify: (...n) => notices.push(n),
      custom() {
        throw new Error("Must not overlay");
      },
      setEditorText() {
        throw new Error("Must not mutate controller editor");
      },
    },
  };
  const pi = {
    events: {
      emit(name, request) {
        events.push([name, request]);
        consumer?.(request, ctx);
      },
    },
  };
  return { pi, ctx, notices, events };
}
function reply(request, status = "blocked") {
  request.reply({
    requestId: request.requestId,
    items: request.items.map((i) => ({ key: i.key, status })),
  });
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

test("fixed callback event defaults running/current only; inspect explicitly opens one terminal", async () =>
  ghostty(async () => {
    const f = fixture();
    try {
      writeSessionStatus(f.state.sessionsDir, "terminal", {
        ...f.fields,
        status: "done",
        dispatchId: "terminal-dispatch",
        attemptId: "terminal-attempt",
      });
      writeSessionStatus(f.state.sessionsDir, "foreign", {
        ...f.fields,
        parentRepoRoot: "/foreign",
        dispatchId: "foreign",
      });
      const h = harness(f, (r) => {
        assert.equal(r.schema, "asc.subagent-tabs.request.v1");
        assert.equal(r.parentSessionKey, f.binding.parentSessionKey);
        assert.equal(r.parentRepoRoot, f.root);
        assert.deepEqual(
          Object.keys(r).sort(),
          [
            "schema",
            "requestId",
            "cwd",
            "parentSessionKey",
            "parentRepoRoot",
            "items",
            "claim",
            "settle",
            "read",
            "reply",
          ].sort(),
        );
        for (const item of r.items) {
          assert.deepEqual(
            Object.keys(item).sort(),
            [
              "key",
              "sessionName",
              "dispatchId",
              "attemptId",
              "ticketPath",
              "viewerExtensionPath",
            ].sort(),
          );
          assert.ok(!JSON.stringify(item).includes(readAttachmentTicket(item.ticketPath).nonce));
          assert.equal(r.claim(item.key).action, "launch");
          r.settle(item.key, { ok: true, effectDisposition: "settled" });
          assert.equal(r.read(item.key).status, "awaiting_ready");
        }
        assert.equal(r.claim("foreign-key").action, "blocked");
        reply(r, "unconfirmed");
      });
      await requestSubagentTabs(h.pi, f.state, h.ctx);
      assert.equal(h.events[0][0], ATTACHMENT_EVENT);
      assert.deepEqual(
        h.events[0][1].items.map((i) => i.sessionName),
        ["child"],
      );
      await requestSubagentTabs(h.pi, f.state, h.ctx, "all", "terminal");
      assert.deepEqual(
        h.events[1][1].items.map((i) => i.sessionName),
        ["terminal"],
      );
      await requestSubagentTabs(h.pi, f.state, h.ctx, "all", "foreign");
      assert.equal(h.events.length, 2);
    } finally {
      f.cleanup();
    }
  }));

test("request bound ≤16, no headless/non-Ghostty fallback, changed context blocks claim", async () =>
  ghostty(async () => {
    const f = fixture();
    try {
      for (let i = 0; i < 20; i++)
        writeSessionStatus(f.state.sessionsDir, `child-${i}`, {
          ...f.fields,
          dispatchId: `dispatch-${i + 2}`,
          attemptId: `attempt-${i + 2}`,
        });
      const h = harness(f, (r, ctx) => {
        assert.equal(r.items.length, 16);
        ctx.sessionKey = "changed";
        assert.equal(r.claim(r.items[0].key).action, "blocked");
        reply(r);
      });
      await requestSubagentTabs(h.pi, f.state, h.ctx);
      assert.equal(h.events.length, 1);
      await requestSubagentTabs(h.pi, f.state, { ...h.ctx, mode: "rpc" });
      await requestSubagentTabs(h.pi, f.state, { ...h.ctx, mode: "json", hasUI: false });
      const old = process.env.GHOSTTY_SURFACE_ID;
      delete process.env.GHOSTTY_SURFACE_ID;
      process.env.TERM_PROGRAM = "other";
      await requestSubagentTabs(h.pi, f.state, h.ctx);
      if (old !== undefined) process.env.GHOSTTY_SURFACE_ID = old;
      assert.equal(h.events.length, 1);
    } finally {
      f.cleanup();
    }
  }));

test("missing helper visible; serial admitted work gets per-item minute budget, no delta/launch retries", async () =>
  ghostty(async () => {
    const f = fixture();
    const oldSet = globalThis.setTimeout,
      oldClear = globalThis.clearTimeout;
    const timers = [];
    globalThis.setTimeout = (callback, ms) => {
      const t = { callback, ms };
      timers.push(t);
      return t;
    };
    globalThis.clearTimeout = () => {};
    try {
      const absent = harness(f);
      const pending = requestSubagentTabs(absent.pi, f.state, absent.ctx);
      assert.equal(timers[0].ms, 1000);
      assert.equal(timers[1].ms, 65_000);
      timers[0].callback();
      await pending;
      assert.match(absent.notices.at(-1)[0], /No native-tab helper/);
      const slow = harness(f, (r) => {
        r.claim(r.items[0].key);
      });
      const wait = requestSubagentTabs(slow.pi, f.state, slow.ctx);
      const count = slow.notices.length;
      timers[2].callback();
      assert.equal(slow.notices.length, count);
      timers[3].callback();
      await wait;
      assert.match(slow.notices.at(-1)[0], /No automatic launch retry/);
      assert.equal(slow.events.length, 1);
    } finally {
      globalThis.setTimeout = oldSet;
      globalThis.clearTimeout = oldClear;
      f.cleanup();
    }
  }));

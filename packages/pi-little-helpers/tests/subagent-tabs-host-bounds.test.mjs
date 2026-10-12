// Bounded queue, shutdown and callback-failure checks without GUI or native viewer execution.
import assert from "node:assert/strict";
import { createHash, randomUUID } from "node:crypto";
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import test from "node:test";
import { setTimeout as delay } from "node:timers/promises";
import { registerSubagentTabHost } from "../extensions/sidequestSubagentTabs.ts";
import {
  ASC_SUBAGENT_TABS_EVENT,
  nativeViewerArgs,
} from "../extensions/sidequestSubagentTabsProtocol.ts";
import {
  createContext,
  LOCAL_GHOSTTY_ORIGIN_MAIN_BIN,
  registerExtension,
} from "./sidequest-harness.mjs";

function fixture(t, { launch, hostOptions = {} } = {}) {
  const root = mkdtempSync(join(resolve(tmpdir()), "ak7039-tabs-bounds-"));
  const cwd = join(root, "repo");
  mkdirSync(join(cwd, ".git"), { recursive: true });
  const owner = join(root, "asc");
  mkdirSync(join(owner, "extensions", "self"), { recursive: true });
  writeFileSync(
    join(owner, "package.json"),
    JSON.stringify({ name: "@tryinget/pi-autonomous-session-control" }),
  );
  const viewerExtensionPath = join(owner, "extensions", "self", "subagent-attachment-viewer.ts");
  writeFileSync(viewerExtensionPath, "export default function () {}");
  const sessionsDir = join(root, "sessions");
  mkdirSync(join(sessionsDir, ".asc-attachments"), { recursive: true, mode: 0o700 });
  const { ctx } = createContext({ cwd, sessionId: "parent" });
  const claims = [],
    settlements = [],
    replies = [],
    calls = [],
    reads = [];
  const harness = registerExtension((pi) =>
    registerSubagentTabHost(
      pi,
      {
        env: { TERM_PROGRAM: "ghostty", GHOSTTY_SURFACE_ID: "4660" },
        subagentTabsLaunch: async (r) => {
          calls.push(r);
          return launch(r);
        },
        ...hostOptions,
      },
      "pi",
    ),
  );
  const lifecycle = async (name) => {
    for (const handler of harness.events.get(name) ?? []) await handler({}, ctx);
  };
  let serial = 0;
  const request = (count = 1) => {
    const items = Array.from({ length: count }, () => {
      const key = createHash("sha256").update(String(serial++)).digest("hex");
      const generation = randomUUID();
      const dir = join(sessionsDir, ".asc-attachments", key);
      mkdirSync(dir, { mode: 0o700 });
      const item = {
        key,
        sessionName: key,
        dispatchId: key,
        attemptId: key,
        ticketPath: join(dir, `ticket-${generation}.json`),
        viewerExtensionPath,
      };
      writeFileSync(
        item.ticketPath,
        JSON.stringify({
          ...item,
          schema: "asc.subagent-attachment.ticket.v1",
          cwd,
          sessionsDir,
          parentSessionKey: "parent",
          parentRepoRoot: cwd,
          ownerPid: process.pid,
          ownerStartedAt: 1,
          nonce: randomUUID(),
          generation,
          argv: nativeViewerArgs(item),
        }),
        { mode: 0o600 },
      );
      return item;
    });
    return {
      schema: "asc.subagent-tabs.request.v1",
      requestId: randomUUID(),
      cwd,
      parentRepoRoot: cwd,
      parentSessionKey: "parent",
      items,
      claim: (key) => {
        claims.push(key);
        return { action: "launch", status: "claimed" };
      },
      settle: (key, result) => {
        settlements.push({ key, ...result });
      },
      read: (key) => {
        reads.push(key);
        return { status: "blocked" };
      },
      reply: (result) => {
        replies.push(result);
      },
    };
  };
  const emit = (r) => {
    for (const fn of harness.busEvents.get(ASC_SUBAGENT_TABS_EVENT) ?? []) fn(r);
  };
  t.after(async () => {
    await lifecycle("session_shutdown");
    rmSync(root, { recursive: true, force: true });
  });
  return { root, cwd, ctx, calls, claims, settlements, replies, reads, lifecycle, request, emit };
}
async function until(predicate, timeout = 2000) {
  const deadline = Date.now() + timeout;
  while (!predicate()) {
    if (Date.now() >= deadline) assert.fail("condition timeout");
    await delay(10);
  }
}

test("16 queued launches bound admission; disposal releases callbacks but dispatches no queued work", async (t) => {
  const f = fixture(t, { launch: async () => new Promise(() => {}) });
  await f.lifecycle("session_start");
  f.emit(f.request(16));
  assert.equal(f.claims.length, 16);
  const excess = f.request();
  f.emit(excess);
  assert.equal(f.claims.length, 16);
  await until(() => f.replies.length === 1);
  assert.equal(f.replies[0].requestId, excess.requestId);
  assert.match(f.replies[0].items[0].detail, /queue full/);
  await until(() => f.calls.length === 1);
  await f.lifecycle("session_shutdown");
  assert.equal(f.settlements.length, 16);
  assert.ok(f.settlements.every((r) => r.effectDisposition === "confirmed_no_effects"));
  await delay(20);
  assert.equal(f.calls.length, 1);
  assert.equal(f.replies.length, 2);
});

test("full first consumer defers refusal so an available consumer can own completion", async (t) => {
  const f = fixture(t, { launch: async () => new Promise(() => {}) });
  await f.lifecycle("session_start");
  f.emit(f.request(16));
  const second = registerExtension((pi) =>
    registerSubagentTabHost(
      pi,
      {
        env: { TERM_PROGRAM: "ghostty", GHOSTTY_SURFACE_ID: "4660" },
        subagentTabsLaunch: async () => ({
          ok: false,
          effectDisposition: "confirmed_no_effects",
          launchMode: "tab",
        }),
      },
      "pi",
    ),
  );
  for (const handler of second.events.get("session_start")) await handler({}, f.ctx);
  t.after(async () => {
    for (const handler of second.events.get("session_shutdown")) await handler();
  });
  const request = f.request();
  f.emit(request); // First listener cannot admit; its blocked fallback must not win.
  for (const handler of second.busEvents.get(ASC_SUBAGENT_TABS_EVENT)) handler(request);
  await until(() => f.replies.length === 1);
  assert.equal(f.replies[0].requestId, request.requestId);
  assert.equal(f.replies[0].items[0].status, "failed");
  assert.equal(f.claims.length, 17);
  assert.equal(f.settlements.length, 1);
});

test("hung transport has absolute deadline, indeterminate settlement and no late dispatch admission", async (t) => {
  const f = fixture(t, { launch: async () => new Promise(() => {}) });
  await f.lifecycle("session_start");
  f.emit(f.request());
  await until(() => f.replies.length === 1, 21500);
  assert.equal(f.calls.length, 1);
  assert.equal(f.settlements[0].effectDisposition, "effect_indeterminate");
  assert.equal(f.calls[0].signal.aborted, true);
  assert.equal(await f.calls[0].beforeDispatch(), false);
  assert.notEqual(f.replies[0].items[0].status, "ready");
});

for (const callback of ["claim", "settle", "read", "reply"]) {
  test(`throwing ${callback} is bounded and does not retry or leak diagnostics`, async (t) => {
    const f = fixture(t, {
      launch: async () => ({ ok: true, effectDisposition: "settled", launchMode: "tab" }),
    });
    await f.lifecycle("session_start");
    const r = f.request();
    let attempts = 0;
    r[callback] = () => {
      attempts++;
      throw new Error("SECRET".repeat(10000));
    };
    f.emit(r);
    await until(() => (callback === "reply" ? attempts > 0 : f.replies.length === 1), 5000);
    assert.ok(f.calls.length <= 1);
    assert.doesNotMatch(JSON.stringify(f.replies), /SECRET/);
    if (callback !== "read") assert.equal(attempts, 1);
    else assert.ok(attempts <= 42, "4s bounded polling, not a runaway read loop");
  });
}

test("native-ready poll observes late owner ACK without second transport", async (t) => {
  const f = fixture(t, {
    launch: async () => ({ ok: true, effectDisposition: "settled", launchMode: "tab" }),
  });
  await f.lifecycle("session_start");
  const r = f.request();
  let ready = false;
  r.read = () => ({ status: ready ? "ready" : "awaiting_ready" });
  f.emit(r);
  await until(() => f.settlements.length === 1);
  assert.equal(f.replies.length, 0, "transport accepted is not native-ready ACK");
  ready = true;
  await until(() => f.replies.length === 1);
  assert.equal(f.replies[0].items[0].status, "ready");
  assert.equal(f.calls.length, 1);
});

test("shutdown during real launcher inspection prevents every late external call and Activate", async (t) => {
  const bin = LOCAL_GHOSTTY_ORIGIN_MAIN_BIN;
  const external = [];
  let release;
  const f = fixture(t, {
    hostOptions: {
      subagentTabsLaunch: undefined,
      currentGhosttyAncestor: { pid: 111, exe: bin },
      pathExists: (path) => path === bin,
      exec: async (cmd, args) => {
        external.push({ cmd, args });
        return new Promise((done) => {
          release = done;
        });
      },
    },
  });
  await f.lifecycle("session_start");
  f.emit(f.request());
  await until(() => external.length === 1);
  await f.lifecycle("session_shutdown");
  assert.equal(f.settlements[0].effectDisposition, "confirmed_no_effects");
  release({ code: 0, stdout: "+new-tab" });
  await delay(30);
  assert.equal(external.length, 1);
  assert.equal(f.settlements.length, 1);
  assert.equal(f.replies.length, 1);
  assert.equal(f.reads.length, 0);
});

// Source host/transport proof only: no GUI, model, ASC private import or child session resume.
import assert from "node:assert/strict";
import { createHash, randomUUID } from "node:crypto";
import {
  chmodSync,
  linkSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  symlinkSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import test from "node:test";
import { setTimeout as delay } from "node:timers/promises";
import { createSidequestExtension } from "../extensions/sidequest.ts";
import { registerSubagentTabHost } from "../extensions/sidequestSubagentTabs.ts";
import {
  ASC_SUBAGENT_TABS_EVENT,
  nativeViewerArgs,
  parseTabRequest,
  safeTabPaths,
} from "../extensions/sidequestSubagentTabsProtocol.ts";
import {
  createContext,
  LOCAL_GHOSTTY_ORIGIN_MAIN_BIN,
  registerExtension,
} from "./sidequest-harness.mjs";

function fixture(t, options = {}) {
  const root = mkdtempSync(join(resolve(tmpdir()), "ak7039-tabs-host-"));
  const cwd = join(root, "repo");
  const sessionsDir = join(root, "sessions");
  const owner = join(root, "pi-autonomous-session-control");
  const extension = join(owner, "extensions", "self", "subagent-attachment-viewer.ts");
  mkdirSync(join(cwd, ".git"), { recursive: true });
  mkdirSync(join(owner, "extensions", "self"), { recursive: true });
  writeFileSync(
    join(owner, "package.json"),
    JSON.stringify({ name: "@tryinget/pi-autonomous-session-control" }),
    { mode: 0o644 },
  );
  writeFileSync(extension, "export default function () {}", { mode: 0o644 });
  mkdirSync(join(sessionsDir, ".asc-attachments"), { recursive: true, mode: 0o700 });
  const calls = [],
    claims = [],
    settlements = [],
    replies = [],
    reads = [],
    states = new Map();
  const { ctx } = createContext({ cwd, sessionId: "parent-session", mode: options.mode ?? "tui" });
  ctx.hasUI = options.hasUI ?? true;
  const env = { TERM_PROGRAM: "ghostty", GHOSTTY_SURFACE_ID: "0x1234", ...options.env };
  const launch = async (request) => {
    calls.push(request);
    if (options.launch) return options.launch(request, f);
    assert.equal(await request.beforeDispatch(), true);
    return { ok: true, effectDisposition: "settled", launchMode: "tab" };
  };
  const hostOptions = { env, subagentTabsLaunch: launch, ...options.hostOptions };
  const harness = registerExtension(
    options.full
      ? createSidequestExtension({ ...hostOptions, registerTools: false })
      : (pi) => registerSubagentTabHost(pi, hostOptions, "pi"),
  );
  const emit = (request) => {
    for (const handler of harness.busEvents.get(ASC_SUBAGENT_TABS_EVENT) ?? []) handler(request);
  };
  const lifecycle = async (name) => {
    for (const handler of harness.events.get(name) ?? []) await handler({}, ctx);
  };
  function request(count = 1) {
    const items = Array.from({ length: count }, (_, i) => {
      const key = createHash("sha256").update(`attempt-${i}`).digest("hex");
      const dir = join(sessionsDir, ".asc-attachments", key);
      mkdirSync(dir, { recursive: true, mode: 0o700 });
      const generation = randomUUID();
      const item = {
        key,
        sessionName: `child-${i}`,
        dispatchId: `dispatch-${i}`,
        attemptId: `attempt-${i}`,
        ticketPath: join(dir, `ticket-${generation}.json`),
        viewerExtensionPath: extension,
      };
      writeFileSync(
        item.ticketPath,
        JSON.stringify({
          schema: "asc.subagent-attachment.ticket.v1",
          ...item,
          cwd,
          sessionsDir,
          parentSessionKey: "parent-session",
          parentRepoRoot: cwd,
          ownerPid: process.pid,
          ownerStartedAt: 1,
          generation,
          nonce: randomUUID(),
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
      parentSessionKey: "parent-session",
      items,
      claim(key) {
        claims.push(key);
        if (states.has(key))
          return {
            action: states.get(key) === "ready" ? "reuse" : "blocked",
            status: states.get(key),
          };
        states.set(key, "claimed");
        return { action: "launch", status: "claimed" };
      },
      settle(key, result) {
        settlements.push({ key, ...result });
        states.set(key, options.stateAfterSettle ?? (result.ok ? "ready" : "failed"));
      },
      read(key) {
        reads.push(key);
        return { status: states.get(key) ?? "blocked" };
      },
      reply(result) {
        replies.push(result);
      },
    };
  }
  const f = {
    root,
    cwd,
    sessionsDir,
    owner,
    extension,
    ctx,
    env,
    harness,
    calls,
    claims,
    settlements,
    replies,
    reads,
    states,
    emit,
    lifecycle,
    request,
  };
  t.after(async () => {
    await lifecycle("session_shutdown");
    rmSync(root, { recursive: true, force: true });
  });
  return f;
}
async function until(predicate, ms = 2500) {
  const deadline = Date.now() + ms;
  while (!predicate()) {
    if (Date.now() >= deadline) assert.fail("bounded condition timeout");
    await delay(10);
  }
}

// Fails if standard sidequest does not wire the host, or if registration has startup effects.
test("standard sidequest wires fixed view-only argv; all durable claims precede await; serial launch, exact ready and reuse", async (t) => {
  let active = 0;
  const f = fixture(t, {
    full: true,
    launch: async (request, host) => {
      assert.equal(host.claims.length, 2);
      assert.equal(++active, 1);
      assert.equal(await request.beforeDispatch(), true);
      await delay(10);
      active--;
      return { ok: true, effectDisposition: "settled", launchMode: "tab" };
    },
  });
  assert.equal(f.calls.length, 0);
  assert.equal(f.harness.busEvents.get(ASC_SUBAGENT_TABS_EVENT), undefined);
  await f.lifecycle("session_start");
  const request = f.request(2);
  f.emit(request);
  assert.equal(f.claims.length, 2);
  assert.equal(f.calls.length, 0, "claims must be durable before queued transport begins");
  // Mutating producer data after admission cannot turn into arbitrary argv/identity.
  request.items[0].viewerExtensionPath = "/untrusted.ts";
  await until(() => f.replies.length === 1);
  assert.equal(f.calls.length, 2);
  assert.deepEqual(
    f.replies[0].items.map((r) => r.status),
    ["ready", "ready"],
  );
  for (const call of f.calls) {
    const item = call.command.args.at(-1);
    assert.deepEqual(call.command.args, [
      "--no-session",
      "--no-extensions",
      "--no-tools",
      "--no-mcp",
      "--no-skills",
      "--no-prompt-templates",
      "--no-context-files",
      "--offline",
      "-e",
      f.extension,
      "--asc-subagent-view-ticket",
      item,
    ]);
    assert.equal(call.command.command, "pi");
    assert.equal(call.sourceSessionFile, undefined);
    assert.equal(call.extraPiArgs, undefined);
    assert.equal(call.childProvenanceEnv, undefined);
    assert.equal(call.placementPolicy, "controller-tab-only");
    assert.equal(call.shellExitPolicy, "fail-closed");
    assert.equal(call.prompt, "");
    assert.equal(call.options.env.PI_SIDEQUEST_LAUNCH_STAGGER_MS, "1000");
  }
  assert.deepEqual(
    f.settlements.map((r) => r.effectDisposition),
    ["settled", "settled"],
  );
  request.items[0].viewerExtensionPath = f.extension;
  f.emit({ ...request, requestId: randomUUID() }); // A new operator event, not duplicate delivery.
  await until(() => f.replies.length === 2);
  assert.equal(f.calls.length, 2);
  assert.deepEqual(
    f.replies[1].items.map((r) => r.status),
    ["reuse", "reuse"],
  );
});

test("duplicate consumers and extension reload rely on ASC atomic claim, never a second launch", async (t) => {
  let release;
  const f = fixture(t, {
    launch: async () =>
      new Promise((done) => {
        release = done;
      }),
  });
  await f.lifecycle("session_start");
  // A separately evaluated module simulates a second package copy/reloaded registration.
  const { registerSubagentTabHost: registerCopy } = await import(
    "../extensions/sidequestSubagentTabs.ts?duplicate-runtime"
  );
  const second = registerExtension((pi) =>
    registerCopy(
      pi,
      { env: f.env, subagentTabsLaunch: async () => assert.fail("duplicate listener launched") },
      "pi",
    ),
  );
  for (const handler of second.events.get("session_start")) await handler({}, f.ctx);
  t.after(async () => {
    for (const handler of second.events.get("session_shutdown")) await handler();
  });
  const request = f.request();
  f.emit(request);
  for (const handler of second.busEvents.get(ASC_SUBAGENT_TABS_EVENT)) handler(request);
  await until(() => f.calls.length === 1);
  assert.equal(f.replies.length, 0, "duplicate listener must not win completion with blocked");
  assert.equal(f.claims.length, 1, "same original payload elects one completion owner");
  release({ ok: true, effectDisposition: "settled", launchMode: "tab" });
  await until(() => f.replies.length === 1);
  assert.equal(f.replies[0].items[0].status, "ready");
  await f.lifecycle("session_shutdown");
  assert.equal(f.harness.busEvents.get(ASC_SUBAGENT_TABS_EVENT).length, 0);
  await f.lifecycle("session_start");
  f.emit(request);
  await delay(20);
  assert.equal(f.replies.length, 1, "old payload remains a duplicate across reload");
  f.emit({ ...request, requestId: randomUUID() });
  await until(() => f.replies.length === 2);
  assert.equal(f.calls.length, 1);
  assert.equal(f.replies.at(-1).items[0].status, "reuse");
});

for (const settings of [
  { mode: "rpc" },
  { mode: "print" },
  { mode: "json" },
  { hasUI: false },
  { env: { TERM_PROGRAM: "xterm" } },
  { env: { GHOSTTY_SURFACE_ID: "" } },
  { env: { GHOSTTY_SURFACE_ID: "0x0" } },
  { env: { GHOSTTY_SURFACE_ID: "18446744073709551616" } },
]) {
  test(`non-native host has zero claims/launches ${JSON.stringify(settings)}`, async (t) => {
    const f = fixture(t, settings);
    await f.lifecycle("session_start");
    f.emit(f.request());
    assert.equal(f.claims.length, 0);
    assert.equal(f.calls.length, 0);
    assert.equal(f.replies.length, 0, "ineligible listeners cannot win the producer reply");
  });
}
for (const field of ["cwd", "parentRepoRoot", "parentSessionKey"]) {
  test(`foreign ${field} rejected before claim`, async (t) => {
    const f = fixture(t);
    await f.lifecycle("session_start");
    const request = f.request();
    request[field] = field === "parentSessionKey" ? "foreign" : f.root;
    f.emit(request);
    assert.equal(f.claims.length, 0);
    assert.equal(f.calls.length, 0);
  });
}

test("bounded strict descriptors reject arbitrary argv, duplicates, excess, getters and unsafe identities", async (t) => {
  const f = fixture(t);
  await f.lifecycle("session_start");
  for (const mutate of [
    (r) => {
      r.argv = ["bash"];
    },
    (r) => {
      r.items[0].command = "bash";
    },
    (r) => {
      r.items.push(r.items[0]);
    },
    (r) => {
      r.items = Array(17).fill(r.items[0]);
    },
    (r) => {
      r.items[0].key = "x".repeat(257);
    },
    (r) => {
      r.items[0].ticketPath = "relative.json";
    },
    (r) => {
      r.items[0].sessionName = "child\u001b[H";
    },
    (r) => {
      Object.defineProperty(r, "cwd", {
        get() {
          assert.fail("getter accessed");
        },
      });
    },
  ]) {
    const request = f.request();
    mutate(request);
    assert.equal(parseTabRequest(request), undefined);
    f.emit(request);
  }
  assert.equal(f.claims.length, 0);
  assert.equal(f.calls.length, 0);
  assert.equal(f.replies.length, 0);
});

for (const kind of [
  "symlink",
  "hardlink",
  "public-file",
  "public-dir",
  "wrong-ticket",
  "wrong-owner",
  "wrong-extension",
  "wrong-dir",
  "oversized",
]) {
  test(`reject unsafe ${kind} before callback or transport`, async (t) => {
    const f = fixture(t);
    await f.lifecycle("session_start");
    const request = f.request();
    const item = request.items[0];
    const path = item.ticketPath;
    if (kind === "symlink") {
      const other = `${path}.copy`;
      writeFileSync(other, readFileSync(path));
      rmSync(path);
      symlinkSync(other, path);
    }
    if (kind === "hardlink") linkSync(path, `${path}.link`);
    if (kind === "public-file") chmodSync(path, 0o644);
    if (kind === "public-dir") chmodSync(join(f.sessionsDir, ".asc-attachments", item.key), 0o755);
    if (kind === "wrong-ticket") {
      const ticket = JSON.parse(readFileSync(path));
      ticket.attemptId = "foreign";
      writeFileSync(path, JSON.stringify(ticket));
    }
    if (kind === "wrong-owner")
      writeFileSync(join(f.owner, "package.json"), JSON.stringify({ name: "other" }));
    if (kind === "wrong-extension")
      item.viewerExtensionPath = join(f.owner, "extensions", "self", "execute.ts");
    if (kind === "wrong-dir") item.ticketPath = join(f.root, "ticket.json");
    if (kind === "oversized") writeFileSync(path, " ".repeat(16385));
    assert.equal(safeTabPaths(item, request), false);
    f.emit(request);
    assert.equal(f.claims.length, 0);
    assert.equal(f.calls.length, 0);
    await until(() => f.replies.length === 1);
    assert.equal(f.replies[0].items[0].status, "blocked");
  });
}

for (const kind of ["refused", "throw", "indeterminate", "false-settled", "accepted-no-ack"]) {
  test(`${kind}: truthful disposition, no ready claim, repeat/reload never retry`, async (t) => {
    const f = fixture(t, {
      stateAfterSettle: "awaiting_ready",
      launch: async (r) => {
        assert.equal(await r.beforeDispatch(), true);
        if (kind === "throw") throw new Error("private unbounded diagnostics".repeat(500));
        return kind === "accepted-no-ack"
          ? { ok: true, effectDisposition: "settled", launchMode: "tab" }
          : {
              ok: false,
              effectDisposition:
                kind === "refused"
                  ? "confirmed_no_effects"
                  : kind === "false-settled"
                    ? "settled"
                    : "effect_indeterminate",
              launchMode: "tab",
              failure: "private",
            };
      },
    });
    await f.lifecycle("session_start");
    const request = f.request();
    f.emit(request);
    await until(() => f.replies.length === 1, 5000);
    assert.equal(
      f.settlements[0].effectDisposition,
      kind === "refused"
        ? "confirmed_no_effects"
        : kind === "accepted-no-ack"
          ? "settled"
          : "effect_indeterminate",
    );
    assert.equal(f.replies[0].items[0].status, kind === "refused" ? "failed" : "unconfirmed");
    assert.match(f.replies[0].items[0].detail, /no retry/i);
    assert.doesNotMatch(JSON.stringify(f.replies), /private/);
    f.emit({ ...request, requestId: randomUUID() });
    await until(() => f.replies.length === 2);
    await f.lifecycle("session_shutdown");
    await f.lifecycle("session_start");
    f.emit({ ...request, requestId: randomUUID() });
    await until(() => f.replies.length === 3);
    assert.equal(f.calls.length, 1);
  });
}

test("indeterminate transport can be confirmed only by same owner native ready ACK, never transport acceptance", async (t) => {
  const f = fixture(t, {
    stateAfterSettle: "ready",
    launch: async (r) => {
      await r.beforeDispatch();
      return { ok: false, effectDisposition: "effect_indeterminate", launchMode: "tab" };
    },
  });
  await f.lifecycle("session_start");
  f.emit(f.request());
  await until(() => f.replies.length === 1);
  assert.equal(f.settlements[0].effectDisposition, "effect_indeterminate");
  assert.equal(f.replies[0].items[0].status, "ready");
  assert.match(f.replies[0].items[0].detail, /native-ready ACK.*placement.*not proven/);
});

test("shutdown fences queued launches, late transport/read/reply, and old generation after restart", async (t) => {
  let release;
  const f = fixture(t, {
    launch: async (r) => {
      assert.equal(await r.beforeDispatch(), true);
      return new Promise((done) => {
        release = done;
      });
    },
  });
  await f.lifecycle("session_start");
  const request = f.request(2);
  f.emit(request);
  await until(() => f.calls.length === 1);
  await f.lifecycle("session_shutdown");
  assert.equal(f.settlements.length, 2);
  assert.deepEqual(
    f.settlements.map((r) => r.effectDisposition),
    ["effect_indeterminate", "confirmed_no_effects"],
  );
  assert.equal(f.replies.length, 1);
  await f.lifecycle("session_start");
  release({ ok: true, effectDisposition: "settled", launchMode: "tab" });
  await delay(30);
  assert.equal(f.calls.length, 1);
  assert.equal(f.settlements.length, 2);
  assert.equal(f.replies.length, 1);
  assert.equal(f.reads.length, 0);
  assert.equal(await f.calls[0].beforeDispatch(), false);
});

test("context/ticket drift during inspection fails final dispatch guard with no launch effects", async (t) => {
  const f = fixture(t, {
    launch: async (r, host) => {
      host.ctx.sessionManager.getSessionId = () => "replacement-session";
      assert.equal(await r.beforeDispatch(), false);
      return { ok: false, effectDisposition: "confirmed_no_effects", launchMode: "tab" };
    },
  });
  await f.lifecycle("session_start");
  f.emit(f.request());
  await until(() => f.replies.length === 1);
  assert.equal(f.settlements[0].effectDisposition, "confirmed_no_effects");
});

test("real existing launcher correlates the controller receiver and sends fixed native argv once; no fallback on rejection", async (t) => {
  const transport = [];
  const bin = LOCAL_GHOSTTY_ORIGIN_MAIN_BIN;
  const f = fixture(t, {
    hostOptions: {
      subagentTabsLaunch: undefined,
      currentGhosttyAncestor: { pid: 111, exe: bin },
      currentSessionGhosttyBin: bin,
      readProcessExecutable: (pid) => ([111, 222].includes(pid) ? bin : undefined),
      pathExists: (path) => path === bin,
      exec: async (command, args) => {
        transport.push({ command, args });
        if (command === bin && args[0] === "+help") return { code: 0, stdout: "+new-tab\n" };
        if (command === "busctl" && args[1] === "list")
          return {
            code: 0,
            stdout:
              ":1.99 111 ghostty user :1.99 unit - -\n:1.43 222 ghostty user :1.43 unit - -\ncom.mitchellh.ghostty 222 ghostty user :1.43 unit - -\n",
          };
        if (args.includes("Describe")) return { code: 0, stdout: '(bgav) true "(tas)" 0' };
        if (args.includes("Activate")) return { code: 1, stderr: "rejected", killed: false };
        assert.fail(`unexpected transport ${command}`);
      },
    },
  });
  await f.lifecycle("session_start");
  const request = f.request();
  f.emit(request);
  await until(() => f.replies.length === 1, 6000);
  const activations = transport.filter((r) => r.args.includes("Activate"));
  assert.equal(activations.length, 1);
  assert.equal(activations[0].args[3], ":1.99");
  assert.ok(activations[0].args.includes("4660"));
  const argv = activations[0].args;
  const scaffold = argv[argv.indexOf("-lc") + 1];
  assert.match(scaffold, /exec "\$cmd" "\$@"/);
  assert.match(scaffold, /exit "\$status"/);
  assert.doesNotMatch(scaffold, /SHELL|interactive shell/);
  assert.equal(argv.at(-1), "0", "D-Bus empty platform-data count is not part of Pi argv");
  assert.deepEqual(
    argv.slice(argv.indexOf("--no-session"), -1),
    nativeViewerArgs(request.items[0]),
  );
  assert.ok(!transport.some((r) => r.args.includes("+new-window") || r.args.includes("+new-tab")));
  assert.equal(
    f.settlements[0].effectDisposition,
    "effect_indeterminate",
    "nonzero activation without explicit no-effects proof cannot authorize retry",
  );
});

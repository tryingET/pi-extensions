import assert from "node:assert/strict";
import test from "node:test";
import { SessionManager } from "@earendil-works/pi-coding-agent";
import extension, {
  createFastStartupContextPacket,
  renderStartupContextPacket,
  type StartupContextPacket,
} from "../extensions/society-context.ts";
import { snapshotConfig } from "../src/config.ts";
import {
  MAX_STARTUP_MESSAGE_BYTES,
  STARTUP_CONTEXT_TYPE,
  startupContextMessage,
  WITHDRAWAL_MESSAGE,
} from "../src/context-message.ts";

const initial = () =>
  snapshotConfig("/virtual/ai-society/repo", {
    HOME: "/virtual",
    PI_SOCIETY_CONTEXT_FULL_WAIT_MS: "0",
  });
const full = (): StartupContextPacket => ({
  ...createFastStartupContextPacket(initial().cwd, "/virtual", "pending", [], initial()),
  capturedAt: "2026-10-09T00:00:00Z",
  packetTier: "full",
  sourceHealth: "healthy",
  fullRefreshStatus: "complete",
  freshness: "fresh",
  refreshState: "idle",
});
const tick = () => new Promise<void>((resolve) => setImmediate(resolve));

test("last active custom MESSAGE only; semantic evidence includes timestamps/config/cwd/freshness and exact diagnostics", () => {
  const manager = SessionManager.inMemory();
  const ctx = { sessionManager: manager };
  const packet = full();
  const emit = (value = packet) =>
    startupContextMessage(ctx, value, renderStartupContextPacket, true);
  const first = emit();
  assert.ok(first);
  manager.appendCustomMessageEntry(STARTUP_CONTEXT_TYPE, first.message.content, false);
  manager.appendCustomEntry(STARTUP_CONTEXT_TYPE, { content: "not a message" });
  manager.appendCustomMessageEntry("another-extension", "unrelated", false);
  assert.equal(emit(), undefined);
  assert.equal(
    emit({ ...packet, collectionGeneration: 999, collectionStartedMonoMs: 42 }),
    undefined,
  );
  for (const change of [
    { capturedAt: "2026-10-09T00:00:01Z" },
    { configFingerprint: "new-config" },
    { cwd: "/virtual/ai-society/other" },
    { freshness: "stale" as const },
    { collectionElapsedMs: 0.01 },
    { commandDiagnostics: [{ label: "ak", elapsedMs: 0.01, cleanup: "settled" }] },
  ])
    assert.ok(emit({ ...packet, ...change }), JSON.stringify(change));
  manager.appendCustomMessageEntry(STARTUP_CONTEXT_TYPE, "newer differing advice", false);
  assert.ok(emit(), "an older matching snapshot does not supersede the latest different message");
});

test("sub-millisecond diagnostic evidence changes emit even when rendered markdown is identical", () => {
  const manager = SessionManager.inMemory();
  const ctx = { sessionManager: manager };
  const packet = {
    ...full(),
    collectionElapsedMs: 1.01,
    commandDiagnostics: [{ label: "ak", elapsedMs: 1.01, cleanup: "settled" }],
  };
  const changed = {
    ...packet,
    collectionElapsedMs: 1.02,
    commandDiagnostics: [{ label: "ak", elapsedMs: 1.02, cleanup: "settled" }],
  };
  assert.equal(renderStartupContextPacket(packet), renderStartupContextPacket(changed));
  const first = startupContextMessage(ctx, packet, renderStartupContextPacket, true);
  assert.ok(first);
  manager.appendCustomMessageEntry(STARTUP_CONTEXT_TYPE, first.message.content, false);
  assert.ok(startupContextMessage(ctx, changed, renderStartupContextPacket, true));
});

test("context-edited retained advice is compared as model-visible content, not unedited raw history", () => {
  const manager = SessionManager.inMemory();
  const ctx = { sessionManager: manager };
  const packet = full();
  const emit = () => startupContextMessage(ctx, packet, renderStartupContextPacket, true);
  const first = emit();
  assert.ok(first);
  const id = manager.appendCustomMessageEntry(STARTUP_CONTEXT_TYPE, first.message.content, false);
  manager.appendContextEdit(id, null);
  assert.ok(emit(), "omitted message must not suppress emission");
  manager.appendContextEdit(id, { content: "edited historical advice" });
  assert.ok(emit(), "replacement content is not the current snapshot");
  manager.appendContextEdit(id, { content: first.message.content });
  assert.equal(emit(), undefined);
});

test("bounded UTF-8 injection rejects whole oversized body, preserves diagnostics, compares omitted evidence, leaves manual render intact", () => {
  const manager = SessionManager.inMemory();
  const ctx = { sessionManager: manager };
  const packet = {
    ...full(),
    readyTasks: [{ id: 1, title: "Ω".repeat(MAX_STARTUP_MESSAGE_BYTES) }],
    commandDiagnostics: [
      { label: "ak startup snapshot", elapsedMs: 2, reason: "output_limit", cleanup: "settled" },
    ],
    warningCount: 9,
  };
  const message = startupContextMessage(ctx, packet, renderStartupContextPacket, true);
  assert.ok(message);
  assert.ok(Buffer.byteLength(message.message.content) <= MAX_STARTUP_MESSAGE_BYTES);
  assert.match(message.message.content, /body withheld/);
  assert.match(message.message.content, /output_limit.*settled/);
  assert.match(message.message.content, /warning count.*9/);
  assert.doesNotMatch(message.message.content, /#1.*Ω/);
  assert.match(renderStartupContextPacket(packet), /#1.*Ω/);
  manager.appendCustomMessageEntry(STARTUP_CONTEXT_TYPE, message.message.content, false);
  assert.equal(startupContextMessage(ctx, packet, renderStartupContextPacket, true), undefined);
  assert.ok(
    startupContextMessage(
      ctx,
      { ...packet, capturedAt: "new capture" },
      renderStartupContextPacket,
      true,
    ),
  );
  const hugeDiagnostics = startupContextMessage(
    ctx,
    { ...packet, cwd: "Ω".repeat(MAX_STARTUP_MESSAGE_BYTES) },
    renderStartupContextPacket,
    true,
  );
  assert.ok(
    hugeDiagnostics &&
      Buffer.byteLength(hugeDiagnostics.message.content) <= MAX_STARTUP_MESSAGE_BYTES,
  );
  assert.match(hugeDiagnostics.message.content, /oversized source diagnostics withheld/);
});

test("minimal adapters without sessionManager append safely; withdrawal needs replay evidence", () => {
  const ctx = {} as Parameters<typeof startupContextMessage>[0];
  assert.ok(startupContextMessage(ctx, full(), renderStartupContextPacket, true));
  assert.ok(startupContextMessage(ctx, full(), renderStartupContextPacket, true));
  assert.equal(startupContextMessage(ctx, full(), renderStartupContextPacket, false), undefined);
});

// Mock only extension registration; the production branch-derived host manager is real.
test("registered replay path dedups branch/reload/resume, reemits after compaction/abandonment; TTL, withdrawal and reenable", async () => {
  const manager = SessionManager.inMemory(initial().cwd);
  let config = initial();
  let now = 0;
  let calls = 0;
  let packet = full();
  const handlers = new Map<
    string,
    (event: never, ctx: never) => Promise<{ message: { content: string } } | undefined>
  >();
  const ctx = { cwd: config.cwd, hasUI: false, sessionManager: manager };
  const load = () =>
    extension(
      {
        on: (name: string, handler: never) => handlers.set(name, handler),
        registerCommand: () => {},
      } as never,
      {
        config: () => config,
        now: () => now,
        collect: async () => {
          calls++;
          return packet;
        },
      },
    );
  const event = async (name = "before_agent_start") => {
    const result = await handlers.get(name)?.({ systemPrompt: "original" } as never, ctx as never);
    if (result)
      manager.appendCustomMessageEntry(STARTUP_CONTEXT_TYPE, result.message.content, false);
    return result;
  };
  const start = async () => {
    load();
    await event("session_start");
    await tick();
  };
  await start();
  const root = manager.appendCustomEntry("branch-root", {});
  assert.ok(await event());
  const injectedLeaf = manager.getLeafId();
  assert.ok(injectedLeaf);
  assert.equal(await event(), undefined);
  await event("session_shutdown");
  await start(); // reload/resume-style factory replacement, same captured evidence.
  assert.equal(await event(), undefined);
  manager.branch(root);
  assert.ok(await event(), "matching packet only on abandoned branch must be reemitted");
  manager.branch(injectedLeaf);
  assert.equal(await event(), undefined, "returning to branch with matching active packet dedups");
  const keep = manager.appendCustomEntry("kept-metadata", {});
  manager.appendCompaction("Historical snapshot, no authority", keep, 0);
  assert.ok(await event(), "same packet only before compaction must be reemitted");
  now = config.ttlMs;
  const stale = await event();
  assert.match(stale?.message.content || "", /freshness: stale/);
  await tick();
  packet = { ...packet, capturedAt: "new snapshot" };
  now += config.ttlMs;
  await event();
  await tick();
  assert.match((await event())?.message.content || "", /captured_at: new snapshot/);
  const priorCalls = calls;
  config = snapshotConfig(ctx.cwd, { HOME: "/virtual", PI_SOCIETY_STARTUP_CONTEXT: "0" });
  assert.equal((await event())?.message.content, WITHDRAWAL_MESSAGE);
  for (let i = 0; i < 205; i++) assert.equal(await event(), undefined);
  assert.equal(calls, priorCalls, "disabled prompts launch no reads");
  config = initial();
  await event();
  await tick();
  assert.ok(await event(), "reenabled full packet supersedes withdrawal/fast advice");
  ctx.cwd = "/outside";
  config = snapshotConfig(ctx.cwd, { HOME: "/virtual" });
  const beforeOutside = calls;
  assert.equal((await event())?.message.content, WITHDRAWAL_MESSAGE);
  assert.equal(await event(), undefined);
  ctx.cwd = "/another-outside";
  config = snapshotConfig(ctx.cwd, { HOME: "/virtual" });
  assert.equal(await event(), undefined, "cwd change while withdrawn adds no marker");
  assert.equal(calls, beforeOutside, "outside/cwd-change withdrawal launches no reads");
  ctx.cwd = initial().cwd;
  config = initial();
  await event();
  await tick();
  assert.ok(await event());
  await event("session_shutdown");
});

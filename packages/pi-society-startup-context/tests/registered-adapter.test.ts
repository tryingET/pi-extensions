import assert from "node:assert/strict";
import test from "node:test";
import extension, {
  createFastStartupContextPacket,
  type SocietyContextDependencies,
  type StartupContextPacket,
} from "../extensions/society-context.ts";
import { type ContextConfig, snapshotConfig } from "../src/config.ts";

const tick = () => new Promise<void>((resolve) => setImmediate(resolve));
const cfg = (env: NodeJS.ProcessEnv = {}, cwd = "/virtual/ai-society/repo") =>
  snapshotConfig(cwd, { HOME: "/virtual", ...env });
const full = (
  config: ContextConfig,
  label: string,
  health: "healthy" | "degraded" = "healthy",
): StartupContextPacket => ({
  ...createFastStartupContextPacket(config.cwd, config.home, "pending", [], config),
  packetTier: "full",
  fullRefreshStatus: "complete",
  sourceHealth: health,
  capturedAt: label,
  warnings: [],
  warningCount: health === "healthy" ? 0 : 4,
});
function harness(dependencies: SocietyContextDependencies) {
  const events = new Map<
    string,
    (event: never, ctx: never) => Promise<{ systemPrompt: string } | undefined>
  >();
  let command: { handler: (args: string, ctx: never) => Promise<void> };
  const statuses: string[] = [];
  const rendered: string[] = [];
  const notifications: string[] = [];
  const ctx = {
    cwd: "/virtual/ai-society/repo",
    hasUI: true,
    ui: {
      setStatus: (_key: string, status?: string) => statuses.push(status || ""),
      notify: (text: string) => notifications.push(text),
      editor: async (_title: string, text: string) => {
        rendered.push(text);
      },
    },
  };
  extension(
    {
      on: (name: string, handler: never) => events.set(name, handler),
      registerCommand: (_name: string, entry: typeof command) => {
        command = entry;
      },
    } as never,
    dependencies,
  );
  return {
    ctx,
    statuses,
    rendered,
    notifications,
    event: (name: string) => events.get(name)?.({ systemPrompt: "base" } as never, ctx as never),
    command: (args: string) => command.handler(args, ctx as never),
  };
}

test("registered startup/prompt/manual paths coalesce, remain bounded, and only healthy fresh full packets show ready", async () => {
  let now = 0;
  let current = cfg({ PI_SOCIETY_CONTEXT_FULL_WAIT_MS: "0" });
  let finish: (packet: StartupContextPacket) => void = () => {};
  let calls = 0;
  const h = harness({
    config: () => current,
    now: () => now,
    random: () => 0,
    collect: async () => {
      calls++;
      return new Promise((resolve) => {
        finish = resolve;
      });
    },
  });
  await h.event("session_start");
  await tick();
  const prompt = await h.event("before_agent_start");
  assert.match(prompt?.systemPrompt || "", /source_health: not_checked/);
  assert.match(prompt?.systemPrompt || "", /refresh_state: refreshing/);
  const manual1 = h.command("refresh");
  const manual2 = h.command("refresh");
  await tick();
  assert.equal(calls, 1);
  finish(full(current, "first", "degraded"));
  await Promise.all([manual1, manual2]);
  assert.equal(h.rendered.length, 2);
  assert.ok(h.statuses.every((value) => !value.includes("✓")));
  assert.match(h.statuses.at(-1) || "", /degraded.*4 warning/);
  assert.match(
    (await h.event("before_agent_start"))?.systemPrompt || "",
    /source_health: degraded/,
  );
  assert.equal(calls, 1, "backoff protects agent activity");
  now = 15_000;
  await h.event("before_agent_start");
  await tick();
  assert.equal(calls, 2);
  finish(full(current, "recovered"));
  await tick();
  assert.match(h.statuses.at(-1) || "", /✓ ready/);
  assert.match((await h.event("before_agent_start"))?.systemPrompt || "", /captured_at: recovered/);
  now = 315_000;
  const stale = await h.event("before_agent_start");
  assert.match(stale?.systemPrompt || "", /freshness: stale/);
  assert.match(stale?.systemPrompt || "", /stale orientation only/);
  assert.match(h.statuses.at(-1) || "", /refreshing/);
  await tick();
  finish(full(current, "renewed"));
  await tick();
  current = cfg({ PI_SOCIETY_STARTUP_CONTEXT: "0" });
  assert.equal(await h.event("before_agent_start"), undefined);
  await h.event("session_shutdown");
});

test("registered bounded wait and manual completion cannot consume an obsolete cwd/config or publish after shutdown", async () => {
  let current = cfg({ PI_SOCIETY_CONTEXT_FULL_WAIT_MS: "1000" });
  const pending: Array<{
    signal?: AbortSignal;
    finish: (packet: StartupContextPacket) => void;
    config: ContextConfig;
  }> = [];
  const h = harness({
    config: () => current,
    collect: async (_cwd, signal, config) =>
      new Promise((resolve) => {
        pending.push({ signal, finish: resolve, config: config || current });
      }),
  });
  await h.event("session_start");
  await tick();
  const oldPrompt = h.event("before_agent_start");
  const oldManual = h.command("refresh");
  current = cfg(
    { PI_SOCIETY_CONTEXT_FULL_WAIT_MS: "0", AK_DB: "different" },
    "/virtual/ai-society/replacement",
  );
  h.ctx.cwd = current.cwd;
  const newPrompt = await h.event("before_agent_start");
  assert.match(newPrompt?.systemPrompt || "", /replacement/);
  assert.equal(pending[0].signal?.aborted, true);
  pending[0].finish(full(pending[0].config, "OBSOLETE"));
  assert.equal(await oldPrompt, undefined);
  await oldManual;
  await tick();
  assert.equal(h.rendered.length, 0);
  assert.ok(!h.notifications.some((item) => /ready/.test(item)));
  assert.equal(pending.length, 2);
  const manual = h.command("refresh");
  const shutdown = h.event("session_shutdown");
  assert.equal(pending[1].signal?.aborted, true);
  pending[1].finish(full(pending[1].config, "AFTER-SHUTDOWN"));
  await Promise.all([manual, shutdown]);
  assert.equal(h.rendered.length, 0);
  assert.equal(await h.event("before_agent_start"), undefined);
});

test("registered real 250ms default prompt wait does not await the 120s refresh budget", async () => {
  const current = cfg();
  let finish: (packet: StartupContextPacket) => void = () => {};
  const h = harness({
    config: () => current,
    collect: async () =>
      new Promise((resolve) => {
        finish = resolve;
      }),
  });
  await h.event("session_start");
  const start = performance.now();
  const prompt = await h.event("before_agent_start");
  const elapsed = performance.now() - start;
  assert.ok(elapsed >= 230 && elapsed < 1500, `prompt wait was ${elapsed}ms`);
  assert.match(prompt?.systemPrompt || "", /fast\/minimal/);
  finish(full(current, "done"));
  await tick();
  await h.event("session_shutdown");
});

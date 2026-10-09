import assert from "node:assert/strict";
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";
import { type Context, createAssistantMessageEventStream } from "@earendil-works/pi-ai";
import { getModel } from "@earendil-works/pi-ai/compat";
import {
  type AgentSession,
  createAgentSession,
  DefaultResourceLoader,
  type ExtensionContext,
  ModelRuntime,
  SessionManager,
  SettingsManager,
} from "@earendil-works/pi-coding-agent";
import extension, {
  createFastStartupContextPacket,
  type SocietyContextDependencies,
  type StartupContextPacket,
} from "../extensions/society-context.ts";
import { type ContextConfig, snapshotConfig } from "../src/config.ts";
import { fixture } from "./fixture.ts";

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
    (event: never, ctx: never) => Promise<{ message: { content: string } } | undefined>
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
    event: async (name: string) => {
      const result = await events.get(name)?.({ systemPrompt: "base" } as never, ctx as never);
      assert.ok(!result || !("systemPrompt" in result), "must not replace the system prefix");
      if (result) assert.equal(typeof result.message.content, "string");
      return result;
    },
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
  assert.match(prompt?.message?.content || "", /source_health: not_checked/);
  assert.match(prompt?.message?.content || "", /refresh_state: refreshing/);
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
    (await h.event("before_agent_start"))?.message?.content || "",
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
  assert.match(
    (await h.event("before_agent_start"))?.message?.content || "",
    /captured_at: recovered/,
  );
  now = 315_000;
  const stale = await h.event("before_agent_start");
  assert.match(stale?.message?.content || "", /freshness: stale/);
  assert.match(stale?.message?.content || "", /stale orientation only/);
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
  assert.match(newPrompt?.message?.content || "", /replacement/);
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
  assert.match(prompt?.message?.content || "", /fast\/minimal/);
  finish(full(current, "done"));
  await tick();
  await h.event("session_shutdown");
});

test("registered prompts append current real git and controlled AK reader observations, never a frozen old packet", async () => {
  const f = fixture();
  let config = f.config();
  const h = harness({ config: () => config });
  h.ctx.cwd = f.repo;
  try {
    await h.event("session_start");
    await h.command("refresh");
    const clean = await h.event("before_agent_start");
    assert.match(clean?.message.content || "", /status: clean/);
    assert.match(clean?.message.content || "", /ready queue: 1/);
    writeFileSync(join(f.repo, "changed.txt"), "new git state\n");
    config = f.config({
      "startup.snapshot": {
        payload: {
          schema_version: 40,
          repo_scope: f.repo,
          task_status_counts: { claimed: 0, pending: 0, blocked: 3 },
          ready_task_count: 0,
          ready_sample: [],
          active_deferral_count: 0,
          expired_lease_count: 0,
          generated_at: "2026-10-02T00:00:00Z",
        },
      },
    });
    await h.command("refresh");
    const changed = await h.event("before_agent_start");
    assert.match(changed?.message.content || "", /status: dirty \(1 changed paths\)/);
    assert.match(changed?.message.content || "", /changed.txt/);
    assert.match(changed?.message.content || "", /ready queue: 0/);
    assert.match(changed?.message.content || "", /blocked tasks: 3/);
    assert.doesNotMatch(changed?.message.content || "", /#42|ready queue: 1/);
    assert.match(changed?.message.content || "", /supersedes all earlier/);
    assert.match(changed?.message.content || "", /grants no authorization, task claim/);
  } finally {
    await h.event("session_shutdown");
    f.dispose();
  }
});

test("registered outside/disabled paths retain opt-in and never launch reads", async () => {
  let config = cfg({}, "/outside");
  let calls = 0;
  const h = harness({
    config: () => config,
    collect: async () => {
      calls++;
      throw new Error("must not collect");
    },
  });
  h.ctx.cwd = config.cwd;
  await h.event("session_start");
  assert.equal(await h.event("before_agent_start"), undefined);
  config = cfg({ PI_SOCIETY_CONTEXT_INJECT_OUTSIDE: "1" }, "/outside");
  assert.match(
    (await h.event("before_agent_start"))?.message.content || "",
    /not applicable outside/,
  );
  config = cfg({ PI_SOCIETY_STARTUP_CONTEXT: "0", PI_SOCIETY_CONTEXT_INJECT_OUTSIDE: "1" });
  assert.equal(await h.event("before_agent_start"), undefined);
  assert.equal(calls, 0);
  await h.event("session_shutdown");
});

// Offline SDK proof: actual registered hooks, ingestion, persistence and provider-facing
// conversion. The stream is replaced before any prompt; no model request or paid inference.
test("Pi host preserves system bytes and history prefix through fast/full/expiry and reload/new/resume/branch/compaction", async () => {
  const root = mkdtempSync(join(tmpdir(), "society-prefix-"));
  const cwd = join(root, "ai-society", "repo");
  const agentDir = join(root, "agent");
  mkdirSync(cwd, { recursive: true });
  mkdirSync(agentDir);
  const config = snapshotConfig(cwd, {
    HOME: root,
    PI_SOCIETY_CONTEXT_FULL_WAIT_MS: "0",
    PI_SOCIETY_CONTEXT_TTL_MS: "100",
  });
  const settingsManager = SettingsManager.inMemory({
    compaction: { enabled: false },
    retry: { enabled: false },
  });
  const requests: Context[] = [];
  // Pi finalizes custom-message timestamps from entry metadata on replay. Compare
  // all prompt-bearing fields separately from that host-owned message metadata.
  const prefixBytes = (request: Context) =>
    request.messages.map(({ timestamp: _timestamp, ...message }) => message);
  let now = 0;
  let calls = 0;
  let finish: (packet: StartupContextPacket) => void = () => {};
  let latestContext: ExtensionContext | undefined;
  let session: AgentSession | undefined;
  const modelRuntime = await ModelRuntime.create({
    authPath: join(agentDir, "auth.json"),
    modelsPath: null,
    modelsStorePath: join(agentDir, "models-cache.json"),
    refreshOnCreate: false,
    allowModelNetwork: false,
  });
  await modelRuntime.setRuntimeApiKey("anthropic", "offline-fixture-not-a-secret");
  const model = getModel("anthropic", "claude-sonnet-4-5");
  assert.ok(model);
  const loader = new DefaultResourceLoader({
    cwd,
    agentDir,
    settingsManager,
    noExtensions: true,
    noSkills: true,
    noPromptTemplates: true,
    noThemes: true,
    noContextFiles: true,
    systemPrompt: "Original system bytes: Ω\r\n  retained whitespace\n",
    extensionFactories: [
      (pi) => {
        extension(pi, {
          config: () => config,
          now: () => now,
          collect: async () => {
            calls++;
            return new Promise((resolve) => {
              finish = resolve;
            });
          },
        });
        pi.on("before_agent_start", (_event, ctx) => {
          latestContext = ctx;
        });
      },
    ],
  });
  const shutdown = async () => {
    if (!session) return;
    const handlers = session.resourceLoader
      .getExtensions()
      .extensions[0].handlers.get("session_shutdown");
    for (const handler of handlers || [])
      await handler({ type: "session_shutdown", reason: "exit" } as never, latestContext as never);
    session.dispose();
    session = undefined;
  };
  const open = async (manager: SessionManager) => {
    await loader.reload();
    const result = await createAgentSession({
      cwd,
      agentDir,
      model,
      modelRuntime,
      resourceLoader: loader,
      sessionManager: manager,
      settingsManager,
      tools: [],
      thinkingLevel: "off",
    });
    assert.deepEqual(result.extensionsResult.errors, []);
    session = result.session;
    session.agent.streamFunction = (selected, context) => {
      requests.push(structuredClone(context));
      const stream = createAssistantMessageEventStream();
      stream.push({
        type: "done",
        reason: "stop",
        message: {
          role: "assistant",
          content: [{ type: "text", text: "offline reply" }],
          api: selected.api,
          provider: selected.provider,
          model: selected.id,
          stopReason: "stop",
          timestamp: Date.now(),
          usage: {
            input: 0,
            output: 0,
            cacheRead: 0,
            cacheWrite: 0,
            totalTokens: 0,
            cost: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0, total: 0 },
          },
        },
      });
      return stream;
    };
    await session.bindExtensions({
      onError: (error) => {
        throw new Error(error.error);
      },
    });
    await tick();
  };
  const prompt = async (pattern: RegExp) => {
    assert.ok(session);
    const systemBytes = session.systemPrompt;
    const history = structuredClone(session.messages);
    const previous = requests.at(-1);
    await session.prompt("fixture turn");
    assert.equal(session.getLastAssistantText(), "offline reply");
    assert.equal(session.systemPrompt, systemBytes);
    assert.doesNotMatch(session.systemPrompt, /AI Society|captured_at|source_health/);
    assert.deepEqual(session.messages.slice(0, history.length), history);
    const customs = session.messages.filter((message) => message.role === "custom");
    const latest = customs.at(-1);
    assert.ok(latest && latest.role === "custom");
    assert.equal(latest.customType, "society-startup-context");
    assert.equal(latest.display, false);
    assert.equal(typeof latest.content, "string");
    assert.match(String(latest.content), pattern);
    assert.match(String(latest.content), /supersedes all earlier/);
    assert.match(String(latest.content), /not continuing authority/);
    const request = requests.at(-1);
    assert.ok(request);
    assert.ok(
      request.messages.some(
        (message) =>
          message.role === "user" &&
          Array.isArray(message.content) &&
          message.content.some((part) => part.type === "text" && part.text === latest.content),
      ),
      "the exact latest active advisory snapshot must reach the provider-facing context",
    );
    return { request, previous, latest, customs };
  };
  try {
    const manager = SessionManager.create(cwd, join(root, "sessions"));
    await open(manager);
    await prompt(/fast\/minimal/);
    const initialSystem = session?.systemPrompt;
    finish({ ...full(config, "FIRST"), readyTaskCount: 8 });
    await tick();
    const first = await prompt(/ready queue: 8/);
    assert.deepEqual(
      prefixBytes(first.request).slice(0, first.previous?.messages.length),
      first.previous && prefixBytes(first.previous),
    );
    const unchanged = await prompt(/captured_at: FIRST/);
    assert.equal(unchanged.latest.content, first.latest.content);
    assert.equal(unchanged.customs.length, first.customs.length, "active-context dedup");
    const packetBytes = JSON.stringify(
      manager.getEntries().filter((entry) => entry.type === "custom_message"),
    );
    for (let i = 0; i < 205; i++) await prompt(/captured_at: FIRST/);
    assert.equal(
      JSON.stringify(manager.getEntries().filter((entry) => entry.type === "custom_message")),
      packetBytes,
      "205 unchanged production-host prompts add no packets or packet bytes",
    );
    assert.deepEqual(
      prefixBytes(unchanged.request).slice(0, unchanged.previous?.messages.length),
      unchanged.previous && prefixBytes(unchanged.previous),
    );
    assert.equal(calls, 1);
    now = 100;
    const stale = await prompt(/freshness: stale/);
    assert.match(String(stale.latest.content), /stale orientation only/);
    assert.match(String(stale.latest.content), /refresh_state: refreshing/);
    assert.equal(calls, 2);
    finish({ ...full(config, "CHANGED"), readyTaskCount: 0 });
    await tick();
    const changed = await prompt(/ready queue: 0/);
    assert.doesNotMatch(String(changed.latest.content), /ready queue: 8/);
    assert.equal(session?.systemPrompt, initialSystem);
    const branchPoint = manager.getLeafId();
    assert.ok(branchPoint);
    // Real host reload replaces the factory but retains historical messages.
    await session?.reload();
    await tick();
    finish({ ...full(config, "CHANGED"), readyTaskCount: 0 });
    await tick();
    const reloaded = await prompt(/captured_at: CHANGED/);
    assert.equal(
      reloaded.customs.length,
      changed.customs.length,
      "reload dedups identical active evidence",
    );
    assert.equal(session?.systemPrompt, initialSystem);
    const file = manager.getSessionFile();
    assert.ok(file);
    await shutdown();
    // Reopen saved JSONL: identical current full evidence is already active.
    const resumed = SessionManager.open(file);
    await open(resumed);
    finish({ ...full(config, "CHANGED"), readyTaskCount: 0 });
    await tick();
    const replayed = await prompt(/captured_at: CHANGED/);
    assert.equal(
      replayed.customs.length,
      changed.customs.length,
      "resume dedups identical active evidence",
    );
    await shutdown();
    // Branch and compaction rebuild active context, not a remembered last injection.
    resumed.branch(branchPoint);
    const keep = resumed.getLeafId();
    assert.ok(keep);
    resumed.appendCompaction("Historical advisory snapshots; no authority granted.", keep, 0);
    await open(resumed);
    finish({ ...full(config, "CHANGED"), readyTaskCount: 0 });
    await tick();
    const compacted = await prompt(/captured_at: CHANGED/);
    assert.equal(
      compacted.customs.length,
      1,
      "identical pre-compaction snapshot must be reemitted",
    );
    await shutdown();
    // Same host manager, new session, identical cwd/config: no packet reuse.
    resumed.newSession();
    await open(resumed);
    const fresh = await prompt(/fast\/minimal/);
    assert.equal(fresh.customs.length, 1);
    assert.doesNotMatch(JSON.stringify(fresh.request), /FIRST|CHANGED/);
    finish(full(config, "NEW"));
    await tick();
    await prompt(/captured_at: NEW/);
  } finally {
    // Settle any controlled pending read before shutdown, including assertion failures.
    finish(full(config, "cleanup"));
    await tick();
    await shutdown();
    rmSync(root, { recursive: true, force: true });
  }
});

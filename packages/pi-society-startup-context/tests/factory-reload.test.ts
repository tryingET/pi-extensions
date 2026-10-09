import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import extension, {
  createFastStartupContextPacket,
  type SocietyContextDependencies,
} from "../extensions/society-context.ts";
import { atomicGroupExists, reloadStableReaders, runCommand } from "../src/command-runner.ts";
import { snapshotConfig } from "../src/config.ts";

const tick = () => new Promise<void>((resolve) => setImmediate(resolve));
// Independent physical-process oracle, not the transport's scanner.
function identity(pid: number) {
  try {
    const value = readFileSync(`/proc/${pid}/stat`, "utf8");
    const fields = value.slice(value.lastIndexOf(")") + 2).split(" ");
    return { start: fields[19], state: fields[0] };
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") return undefined;
    throw error;
  }
}
function harness(
  factory: typeof extension,
  owner: object,
  dependencies: SocietyContextDependencies,
) {
  const handlers = new Map<
    string,
    (event: never, ctx: never) => Promise<{ message: { content: string } } | undefined>
  >();
  let command: { handler: (args: string, ctx: never) => Promise<unknown> } | undefined;
  const statuses: string[] = [];
  const editors: string[] = [];
  const ctx = {
    cwd: "/virtual/ai-society/repo",
    sessionManager: owner,
    hasUI: true,
    ui: {
      setStatus: (_key: string, value?: string) => statuses.push(value || ""),
      notify() {},
      editor: async (_title: string, value: string) => {
        editors.push(value);
      },
    },
  } as never;
  factory(
    {
      on: (name: string, handler: never) => handlers.set(name, handler),
      registerCommand: (_name: string, value: NonNullable<typeof command>) => {
        command = value;
      },
    } as never,
    dependencies,
  );
  return {
    statuses,
    editors,
    event: (name: string, event = {}) => handlers.get(name)?.(event as never, ctx),
    manual: async () => {
      assert.ok(command);
      await command.handler("refresh", ctx);
    },
  };
}

test(
  "new factory and re-evaluated module keep failed native receipt after shutdown; no unrelated-session mutex or stale authority",
  { skip: process.platform !== "linux" },
  async () => {
    // Identical session-id/cwd strings must NOT join independent host controllers.
    const owner = { getSessionId: () => "same-session-id" };
    const unrelatedOwner = { getSessionId: () => "same-session-id" };
    let config = snapshotConfig("/virtual/ai-society/repo", {
      HOME: "/virtual",
      PI_SOCIETY_CONTEXT_FULL_WAIT_MS: "0",
      PI_SOCIETY_CONTEXT_MAX_WARNINGS: "0",
    });
    let now = 0;
    let calls = 0;
    let proofAvailable = false;
    const collect: NonNullable<SocietyContextDependencies["collect"]> = async (
      _cwd,
      _signal,
      _config,
      resources,
    ) => {
      calls++;
      if (calls === 1) {
        const receipt = await runCommand(
          process.execPath,
          ["-e", "process.on('SIGTERM',()=>{});setInterval(()=>{},1000)"],
          {
            resources,
            timeoutMs: 300,
            probeGroup: (group) => {
              const value = identity(group);
              if (!proofAvailable && (!value || ["Z", "X"].includes(value.state)))
                throw new Error("settlement proof unavailable");
              return atomicGroupExists(group);
            },
          },
        );
        assert.equal(receipt.reason, "cleanup_failure");
        assert.ok(receipt.unresolvedResource);
      }
      return {
        ...createFastStartupContextPacket(config.cwd, config.home, "pending", [], config),
        packetTier: "full",
        fullRefreshStatus: "complete",
        sourceHealth: calls === 1 ? "degraded" : "healthy",
        readyTaskCount: calls === 1 ? 77 : 2,
      };
    };
    const dependencies = { config: () => config, now: () => now, collect };
    const first = harness(extension, owner, dependencies);
    await first.event("session_start");
    await first.manual(); // Coalesces with startup and awaits the actual failed receipt.
    assert.match(first.statuses.at(-1) || "", /blocked cleanup/);
    await first.event("session_shutdown", { reason: "reload" });

    // Force source-module re-evaluation as well as factory reconstruction. A module-local map fails this.
    const freshRunner = await import(
      new URL("../src/command-runner.ts?reload=owned-readers", import.meta.url).href
    );
    assert.notEqual(freshRunner.reloadStableReaders, reloadStableReaders);
    assert.equal(freshRunner.reloadStableReaders(owner), reloadStableReaders(owner));
    assert.equal(freshRunner.reloadStableReaders(owner).blocked(), true);
    const freshFactory = (
      await import(
        new URL("../extensions/society-context.ts?reload=new-factory", import.meta.url).href
      )
    ).default as typeof extension;
    assert.notEqual(freshFactory, extension);
    const second = harness(freshFactory, owner, dependencies);
    await second.event("session_start", { reason: "reload" });
    await tick();
    await second.manual();
    now = 1_000_000; // Demand is due, not just within backoff.
    config = { ...config, fingerprint: "changed-cwd/db/executable-config" };
    const blocked = await second.event("before_agent_start", { systemPrompt: "base" });
    assert.match(blocked?.message?.content || "", /source_health: degraded/);
    assert.match(blocked?.message?.content || "", /refresh_state: blocked_cleanup/);
    assert.doesNotMatch(blocked?.message?.content || "", /ready queue: (77|2)/);
    await second.manual();
    assert.equal(calls, 1);
    assert.ok(second.editors.every((value) => !/ready queue: (77|2)/.test(value)));

    let unrelatedCalls = 0;
    const unrelated = harness(freshFactory, unrelatedOwner, {
      config: () => config,
      collect: async () => {
        unrelatedCalls++;
        return {
          ...createFastStartupContextPacket(config.cwd, config.home, "pending", [], config),
          packetTier: "full",
          fullRefreshStatus: "complete",
          sourceHealth: "healthy",
        };
      },
    });
    await unrelated.event("session_start");
    await unrelated.manual();
    assert.equal(unrelatedCalls, 1);
    assert.match(unrelated.statuses.at(-1) || "", /✓ ready/);
    assert.equal(reloadStableReaders(owner).blocked(), true);
    await unrelated.event("session_shutdown");

    proofAvailable = true;
    await second.manual();
    assert.equal(calls, 2);
    assert.equal(reloadStableReaders(owner).blocked(), false);
    assert.match(second.statuses.at(-1) || "", /✓ ready/);
    assert.match(second.editors.at(-1) || "", /ready queue: 2/);
    assert.doesNotMatch(second.editors.at(-1) || "", /ready queue: 77/);
    await second.event("session_shutdown");
  },
);

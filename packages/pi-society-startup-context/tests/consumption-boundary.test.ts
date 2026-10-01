import assert from "node:assert/strict";
import test from "node:test";
import extension, { createFastStartupContextPacket } from "../extensions/society-context.ts";
import { snapshotConfig } from "../src/config.ts";
import { type CollectionPacket, RefreshLifecycle } from "../src/refresh-lifecycle.ts";

const config = () => snapshotConfig("/virtual/ai-society/repo", { HOME: "/virtual" });
const tick = () => new Promise<void>((resolve) => setImmediate(resolve));

test("final consumption rechecks monotonic TTL, config identity, same-identity restart and shutdown", async () => {
  let current = config();
  let now = 0;
  const lifecycle = new RefreshLifecycle<CollectionPacket>({
    now: () => now,
    fast: () => ({ applicable: true, packetTier: "fast", fullRefreshStatus: "pending" }),
    collect: async () => ({
      applicable: true,
      packetTier: "full",
      fullRefreshStatus: "complete",
      sourceHealth: "healthy",
    }),
  });
  const ready = await lifecycle.request(() => current, true);
  now = 300_000;
  assert.equal(lifecycle.consume(ready, () => current)?.freshness, "stale");
  current = { ...current, fingerprint: "changed" };
  assert.equal(
    lifecycle.consume(ready, () => current),
    undefined,
  );
  current = config();
  lifecycle.restart();
  await lifecycle.request(() => current, true);
  assert.equal(
    lifecycle.consume(ready, () => current),
    undefined,
  );
  const latest = lifecycle.view();
  await lifecycle.shutdown();
  assert.equal(
    lifecycle.consume(latest, () => current),
    undefined,
  );
});

test("registered startup observes an immediately completed refresh without starting a redundant manual generation", async () => {
  let calls = 0;
  const handlers = new Map<string, (event: never, ctx: never) => Promise<unknown>>();
  const current = config();
  extension(
    {
      on: (name: string, handler: never) => handlers.set(name, handler),
      registerCommand() {},
    } as never,
    {
      config: () => current,
      collect: async () => {
        calls++;
        return {
          ...createFastStartupContextPacket(current.cwd, current.home, "pending", [], current),
          packetTier: "full",
          fullRefreshStatus: "complete",
          sourceHealth: "healthy",
        };
      },
    },
  );
  const ctx = { cwd: current.cwd, hasUI: false } as never;
  await handlers.get("session_start")?.({} as never, ctx);
  await tick();
  assert.equal(calls, 1);
  await handlers.get("before_agent_start")?.({ systemPrompt: "base" } as never, ctx);
  assert.equal(calls, 1);
  await handlers.get("session_shutdown")?.({} as never, ctx);
});

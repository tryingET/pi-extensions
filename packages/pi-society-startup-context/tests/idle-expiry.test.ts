import assert from "node:assert/strict";
import test from "node:test";
import extension, { createFastStartupContextPacket } from "../extensions/society-context.ts";
import { snapshotConfig } from "../src/config.ts";

const pause = (ms: number) => new Promise<void>((resolve) => setTimeout(resolve, ms));
const tick = () => new Promise<void>((resolve) => setImmediate(resolve));

test("registered idle footer expires once without new prompts/probes; replacement and shutdown cancel expiry callbacks", async () => {
  const cwd = "/virtual/ai-society/repo";
  let config = snapshotConfig(cwd, { HOME: "/virtual", PI_SOCIETY_CONTEXT_TTL_MS: "60" });
  let calls = 0;
  const handlers = new Map<string, (event: never, ctx: never) => Promise<unknown>>();
  let command: { handler: (args: string, ctx: never) => Promise<unknown> } | undefined;
  const statuses: string[] = [];
  const ctx = {
    cwd,
    hasUI: true,
    ui: {
      setStatus: (_key: string, value?: string) => statuses.push(value || ""),
      notify() {},
      editor: async () => {},
    },
  } as never;
  extension(
    {
      on: (name: string, handler: never) => handlers.set(name, handler),
      registerCommand: (_name: string, value: NonNullable<typeof command>) => {
        command = value;
      },
    } as never,
    {
      config: () => config,
      collect: async () => {
        calls++;
        return {
          ...createFastStartupContextPacket(config.cwd, config.home, "pending", [], config),
          packetTier: "full",
          fullRefreshStatus: "complete",
          sourceHealth: "healthy",
          warnings: [],
          warningCount: 0,
        };
      },
    },
  );
  await handlers.get("session_start")?.({} as never, ctx);
  await tick();
  assert.match(statuses.at(-1) || "", /✓ ready/);
  await pause(100); // No before_agent_start or manual command.
  assert.doesNotMatch(statuses.at(-1) || "", /✓|ready/);
  assert.match(statuses.at(-1) || "", /stale/);
  assert.equal(calls, 1);
  const expiredUpdates = statuses.length;
  await pause(80);
  assert.equal(statuses.length, expiredUpdates, "expiry is one-shot, not polling");
  assert.ok(command);
  await command.handler("refresh", ctx);
  assert.match(statuses.at(-1) || "", /✓ ready/);
  config = snapshotConfig(cwd, {
    HOME: "/virtual",
    AK_DB: "replacement",
    PI_SOCIETY_CONTEXT_TTL_MS: "1000",
  });
  await command.handler("refresh", ctx);
  const replacedUpdates = statuses.length;
  await pause(100);
  assert.equal(statuses.length, replacedUpdates, "old generation expiry must be canceled");
  assert.match(statuses.at(-1) || "", /✓ ready/);
  config = snapshotConfig(cwd, { HOME: "/virtual", PI_SOCIETY_CONTEXT_TTL_MS: "60" });
  await command.handler("refresh", ctx);
  await handlers.get("session_shutdown")?.({} as never, ctx);
  const shutdownUpdates = statuses.length;
  assert.equal(statuses.at(-1), "");
  await pause(100);
  assert.equal(statuses.length, shutdownUpdates);
  assert.equal(calls, 4, "expiry events must never collect or retry");
});

import assert from "node:assert/strict";
import test from "node:test";
import extension, { createFastStartupContextPacket } from "../extensions/society-context.ts";
import { snapshotConfig } from "../src/config.ts";

const tick = () => new Promise<void>((resolve) => setImmediate(resolve));

test("registered adapters keep cleanup failures unknown/degraded across manual refresh and config replacement, even with warnings hidden", async () => {
  const cwd = "/virtual/ai-society/repo";
  let config = snapshotConfig(cwd, {
    HOME: "/virtual",
    PI_SOCIETY_CONTEXT_MAX_WARNINGS: "0",
    PI_SOCIETY_CONTEXT_FULL_WAIT_MS: "0",
  });
  let calls = 0;
  let settled = false;
  const handlers = new Map<
    string,
    (event: never, ctx: never) => Promise<{ message: { content: string } } | undefined>
  >();
  let command: { handler: (args: string, ctx: never) => Promise<unknown> } | undefined;
  const statuses: string[] = [];
  const editors: string[] = [];
  const ctx = {
    cwd,
    hasUI: true,
    ui: {
      setStatus: (_key: string, value?: string) => statuses.push(value || ""),
      notify() {},
      editor: async (_title: string, value: string) => {
        editors.push(value);
      },
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
      collect: async (_cwd, _signal, _config, resources) => {
        calls++;
        resources?.retain({ description: "unresolved receipt", isSettled: () => settled });
        return {
          ...createFastStartupContextPacket(config.cwd, config.home, "pending", [], config),
          packetTier: "full",
          fullRefreshStatus: "complete",
          sourceHealth: "healthy",
          readyTaskCount: 7,
        };
      },
    },
  );
  await handlers.get("session_start")?.({} as never, ctx);
  await tick();
  assert.match(statuses.at(-1) || "", /blocked cleanup/);
  assert.ok(command);
  await command.handler("refresh", ctx);
  config = snapshotConfig(cwd, {
    HOME: "/virtual",
    AK_DB: "different",
    PI_SOCIETY_CONTEXT_MAX_WARNINGS: "0",
    PI_SOCIETY_CONTEXT_FULL_WAIT_MS: "0",
  });
  await command.handler("refresh", ctx);
  const prompt = await handlers.get("before_agent_start")?.({ systemPrompt: "base" } as never, ctx);
  assert.match(prompt?.message?.content || "", /source_health: degraded/);
  assert.match(prompt?.message?.content || "", /refresh_state: blocked_cleanup/);
  assert.match(prompt?.message?.content || "", /warning count \(before truncation\): [1-9]/);
  assert.doesNotMatch(prompt?.message?.content || "", /ready queue: 7|### Bounded warnings/);
  assert.ok(editors.every((value) => !value.includes("ready queue: 7")));
  assert.equal(calls, 1);
  settled = true;
  await command.handler("refresh", ctx);
  assert.equal(calls, 2);
  await handlers.get("session_shutdown")?.({} as never, ctx);
});

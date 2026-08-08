import assert from "node:assert/strict";
import test from "node:test";
import { createCodeModeExtension } from "../src/extension.ts";
import type { PiCodeModeApi, PiExtensionContext, PiToolDefinition } from "../src/pi-api.ts";
import type { CodeModeRuntime, EvalToolResult } from "../src/types.ts";

type ToolDefinition = PiToolDefinition;
type EventHandler = (...args: unknown[]) => unknown;

function createFakePi() {
  const tools = new Map<string, ToolDefinition>();
  const commands = new Map<string, unknown>();
  const events = new Map<string, EventHandler[]>();
  const pi = {
    registerTool(tool: ToolDefinition) {
      tools.set(tool.name, tool);
    },
    registerCommand(name: string, command: unknown) {
      commands.set(name, command);
    },
    on(name: string, handler: EventHandler) {
      events.set(name, [...(events.get(name) ?? []), handler]);
    },
  } as unknown as PiCodeModeApi;
  return { pi, tools, commands, events };
}

function fakeContext(hasUI = false): PiExtensionContext {
  return {
    cwd: process.cwd(),
    hasUI,
    ui: {
      confirm: async () => true,
      notify: () => undefined,
    },
  } as unknown as PiExtensionContext;
}

function fakeRuntime(): CodeModeRuntime & {
  runCount: number;
  resetCount: number;
  closeCount: number;
} {
  return {
    runCount: 0,
    resetCount: 0,
    closeCount: 0,
    async run(language) {
      this.runCount += 1;
      return {
        language,
        value: { ok: true },
        stdout: "",
        stderr: "",
        elapsedMs: 4,
        capabilityInvocations: [],
        kernelReused: false,
      };
    },
    async reset() {
      this.resetCount += 1;
    },
    async close() {
      this.closeCount += 1;
    },
  };
}

async function executeEval(
  tool: ToolDefinition,
  params: { language: "python" | "javascript"; code: string },
  ctx: PiExtensionContext,
): Promise<EvalToolResult> {
  const execute = tool.execute as unknown as (
    toolCallId: string,
    input: typeof params,
    signal: AbortSignal | undefined,
    onUpdate: undefined,
    context: PiExtensionContext,
  ) => Promise<EvalToolResult>;
  return execute("test-call", params, undefined, undefined, ctx);
}

test("extension registers eval without replacing bash", () => {
  const fake = createFakePi();
  createCodeModeExtension({ runtime: fakeRuntime() })(fake.pi);
  assert.equal(fake.tools.has("eval"), true);
  assert.equal(fake.tools.has("bash"), false);
  const parameters = fake.tools.get("eval")?.parameters as {
    properties?: { language?: { enum?: unknown } };
  };
  assert.deepEqual(parameters.properties?.language?.enum, ["python", "javascript"]);
  assert.equal(fake.commands.has("code-mode"), true);
  assert.equal(fake.commands.has("eval-reset"), true);
});

test("non-interactive eval fails closed when confirmation is required", async () => {
  const fake = createFakePi();
  const runtime = fakeRuntime();
  createCodeModeExtension({ runtime })(fake.pi);
  const tool = fake.tools.get("eval");
  assert.ok(tool);

  await assert.rejects(
    executeEval(tool, { language: "python", code: "1 + 1" }, fakeContext(false)),
    /approval was not available or was denied/,
  );
  assert.equal(runtime.runCount, 0);
});

test("runtime failures reject so Pi can mark the tool result as an error", async () => {
  const fake = createFakePi();
  const runtime = fakeRuntime();
  runtime.run = async () => {
    throw new Error("runtime failed");
  };
  createCodeModeExtension({ runtime, requireConfirmation: false })(fake.pi);
  const tool = fake.tools.get("eval");
  assert.ok(tool);
  await assert.rejects(
    executeEval(tool, { language: "javascript", code: "return 2" }, fakeContext(false)),
    /runtime failed/,
  );
});

test("runtime error text is bounded before Pi turns it into a tool result", async () => {
  const fake = createFakePi();
  const runtime = fakeRuntime();
  runtime.run = async () => {
    throw new Error("x".repeat(300_000));
  };
  createCodeModeExtension({ runtime, requireConfirmation: false, maxOutputBytes: 256 })(fake.pi);
  const tool = fake.tools.get("eval");
  assert.ok(tool);
  await assert.rejects(
    executeEval(tool, { language: "javascript", code: "return 2" }, fakeContext(false)),
    (error: unknown) => {
      assert.ok(error instanceof Error);
      assert.ok(Buffer.byteLength(error.message, "utf8") <= 256);
      return true;
    },
  );
});

test("configured eval delegates to runtime and lifecycle closes kernels", async () => {
  const fake = createFakePi();
  const runtime = fakeRuntime();
  createCodeModeExtension({ runtime, requireConfirmation: false })(fake.pi);
  const tool = fake.tools.get("eval");
  assert.ok(tool);

  const result = await executeEval(
    tool,
    { language: "javascript", code: "return 2" },
    fakeContext(false),
  );
  assert.equal(result.details?.ok, true);
  assert.equal(runtime.runCount, 1);

  await fake.events.get("session_start")?.[0]?.();
  await fake.events.get("session_shutdown")?.[0]?.();
  assert.equal(runtime.resetCount, 1);
  assert.equal(runtime.closeCount, 1);
});

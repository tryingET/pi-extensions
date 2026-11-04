/**
 * summary: "checks prompt override fallback without replaying output, tools, or unrelated user work."
 * read_when:
 *   - "changing prompt model failure recovery or its lifecycle ownership guards."
 */
import assert from "node:assert/strict";
import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { afterEach, test } from "node:test";
import extension from "../extensions/prompt-template-execution.js";
import { executePromptTemplateCommand } from "../src/command-runner.js";

const current = { provider: "openai-codex-2", id: "gpt-6.1-sol" };
const target = { provider: "opencode-go", id: "deepseek-v4.1-flash" };
const originalHome = process.env.HOME;
const dirs = [];
afterEach(async () => {
  process.env.HOME = originalHome;
  await Promise.all(dirs.splice(0).map((dir) => rm(dir, { recursive: true, force: true })));
});
const ref = (model) => `${model.provider}/${model.id}`;
const errorMessage = () => ({
  role: "assistant",
  provider: target.provider,
  model: target.id,
  content: [],
  stopReason: "error",
  errorMessage: '429: {"type":"GoUsageLimitError","message":"Go usage limit exceeded"}',
});

async function harness(body = "Commit $ARGUMENTS", frontmatter = "") {
  const home = await mkdtemp(path.join(os.tmpdir(), "ptx-fallback-"));
  dirs.push(home);
  process.env.HOME = home;
  const promptDir = path.join(home, ".pi", "agent", "prompts");
  await mkdir(promptDir, { recursive: true });
  await writeFile(
    path.join(promptDir, "commit.md"),
    `---\nmodel: ${ref(target)}\n${frontmatter}---\n${body}`,
  );
  const events = new Map();
  const commands = new Map();
  const calls = [];
  const branch = [];
  let stateId = 0;
  let thinking = "high";
  let holdThinking = false;
  const thinkingEvents = [];
  function changeThinking(value) {
    const previousLevel = thinking;
    thinking = value;
    if (value === previousLevel) return;
    branch.push({ type: "thinking_level_change", id: `state-${++stateId}`, thinkingLevel: value });
    const event = { previousLevel, level: value };
    if (holdThinking) thinkingEvents.push(event);
    else void emit("thinking_level_select", event);
  }
  const ctx = {
    cwd: home,
    model: current,
    isIdle: () => true,
    sessionManager: { getBranch: () => branch },
    modelRegistry: { getAll: () => [current, target], getAvailable: () => [current, target] },
    ui: { notify: (message, level) => calls.push({ notify: message, level }) },
  };
  async function emit(name, event = {}) {
    let result;
    for (const fn of events.get(name) ?? []) {
      const next = await fn({ type: name, ...event }, ctx);
      if (next) result = next;
    }
    return result;
  }
  const pi = {
    on(name, handler) {
      events.set(name, [...(events.get(name) ?? []), handler]);
    },
    getCommands: () => [],
    registerCommand(name, options) {
      commands.set(name, options.handler);
    },
    getThinkingLevel: () => thinking,
    setThinkingLevel(value) {
      changeThinking(value);
      calls.push({ thinking: value });
    },
    async setModel(model) {
      const previousModel = ctx.model;
      ctx.model = model;
      branch.push({
        type: "model_change",
        id: `state-${++stateId}`,
        provider: model.provider,
        modelId: model.id,
      });
      changeThinking("medium"); // Emit the host's actual default-change event too.
      calls.push({ model: ref(model) });
      await emit("model_select", { model, previousModel, source: "setModel" });
      return true;
    },
    sendUserMessage(content) {
      calls.push({ send: content });
      branch.push({
        type: "message",
        id: "user-1",
        message: { role: "user", content: [{ type: "text", text: content }] },
      });
    },
  };
  extension(pi);
  await emit("session_start");
  async function invoke() {
    const result = await commands.get("commit")("these paths", ctx);
    await emit("before_agent_start", { prompt: calls.find((call) => call.send)?.send });
    return result;
  }
  async function fail(message = errorMessage()) {
    branch.push({ type: "message", id: "error-1", message });
    await emit("message_end", { message });
    await emit("turn_end", { message, messageEntryId: "error-1", toolResults: [] });
    return emit("agent_before_settle", {
      outcome: "error",
      entries: [],
      continue: false,
      context: {
        pendingMessages: [],
        contextEntries: branch.map((entry) => ({
          sourceEntry: entry,
          messages: entry.message ? [entry.message] : [],
        })),
        contextMessages: branch.flatMap((entry) => (entry.message ? [entry.message] : [])),
      },
    });
  }
  return {
    pi,
    ctx,
    calls,
    branch,
    emit,
    invoke,
    fail,
    thinking: () => thinking,
    delayThinking() {
      holdThinking = true;
    },
    async flushThinking() {
      for (const event of thinkingEvents.splice(0)) await emit("thinking_level_select", event);
    },
  };
}

test("Given an empty initial opencode-go quota error, continue once on invocation model without resending /commit", async () => {
  const h = await harness();
  await h.invoke();
  const result = await h.fail();
  assert.equal(result?.continue, true);
  assert.deepEqual(result.entries, [
    { type: "context_edit", targetId: "error-1", replacement: null },
  ]);
  assert.equal(h.ctx.model, current);
  assert.equal(h.thinking(), "high");
  assert.equal(h.calls.filter((call) => call.send).length, 1);
  assert.ok(h.calls.some((call) => call.level === "warning" && /fall.*back/i.test(call.notify)));
  const again = await h.emit("agent_before_settle", {
    outcome: "error",
    entries: [],
    continue: false,
  });
  assert.equal(again, undefined);
  await h.emit("agent_settled");
  assert.equal(h.ctx.model, current);
});

for (const [label, before] of [
  [
    "text",
    (h) =>
      h.emit("message_update", {
        message: { role: "assistant", content: [{ type: "text", text: "Starting" }] },
      }),
  ],
  [
    "thinking",
    (h) =>
      h.emit("message_update", {
        message: { role: "assistant", content: [{ type: "thinking", thinking: "Plan" }] },
      }),
  ],
  [
    "nested tool execution",
    (h) => h.emit("tool_execution_start", { toolCallId: "outer/1", parentToolCallId: "outer" }),
  ],
  [
    "manual model selection away and back",
    async (h) => {
      await h.pi.setModel(current);
      await h.pi.setModel(target);
    },
  ],
  ["another input", (h) => h.emit("input", { text: "other", source: "interactive" })],
]) {
  test(`Given ${label} before a later empty error, do not replay the invocation`, async () => {
    const h = await harness();
    await h.invoke();
    await before(h);
    assert.equal(await h.fail(), undefined);
    assert.equal(h.calls.filter((call) => call.send).length, 1);
  });
}

for (const [label, change] of [
  [
    "partial terminal response",
    (event) => {
      event.message.content = [{ type: "text", text: "Partial" }];
    },
  ],
  [
    "aborted",
    (event) => {
      event.message.stopReason = "aborted";
    },
  ],
  [
    "different provider",
    (event) => {
      event.message.provider = "other";
    },
  ],
]) {
  test(`Given ${label}, do not fall back`, async () => {
    const h = await harness();
    await h.invoke();
    const event = { message: errorMessage() };
    change(event);
    assert.equal(await h.fail(event.message), undefined);
  });
}

test("Given changed model-conditional content, do not continue a prompt rendered for the failed model", async () => {
  const h = await harness('<if-model is="opencode-go/*">Target<else>Current</if-model>');
  await h.invoke();
  assert.equal(await h.fail(), undefined);
});

test("Given competing boundary work, leave it untouched", async () => {
  const h = await harness();
  await h.invoke();
  const message = errorMessage();
  h.branch.push({ type: "message", id: "error-1", message });
  await h.emit("turn_end", { message, messageEntryId: "error-1", toolResults: [] });
  const entries = [{ type: "custom", customType: "other", data: {} }];
  const result = await h.emit("agent_before_settle", {
    outcome: "error",
    entries,
    continue: true,
    context: { pendingMessages: [] },
  });
  assert.equal(result, undefined);
  assert.equal(h.ctx.model, target);
});

test("Given an unavailable override, render against current model before exactly one dispatch", async () => {
  const h = await harness('<if-model is="opencode-go/*">Target<else>Current $ARGUMENTS</if-model>');
  h.ctx.modelRegistry.getAvailable = () => [current];
  const result = await h.invoke();
  assert.equal(result.ok, true);
  assert.equal(result.plan.selectedModel.model, current);
  assert.equal(h.calls.find((call) => call.send)?.send, "Current these paths");
  assert.equal(h.calls.filter((call) => call.model).length, 0);
});

test("Given a refused override switch, render fallback before dispatch rather than send target-only instructions", async () => {
  const calls = [];
  const prompt = {
    name: "commit",
    models: [ref(target)],
    restore: true,
    content: '<if-model is="opencode-go/*">Target<else>Current $1</if-model>',
  };
  const result = await executePromptTemplateCommand(
    prompt,
    "paths",
    {
      model: current,
      modelRegistry: { getAll: () => [current, target], getAvailable: () => [current, target] },
    },
    {
      setModel: async (model) => {
        calls.push({ model });
        return false;
      },
      sendUserMessage: (content) => calls.push({ send: content }),
    },
    { fallbackToCurrentModel: true },
  );
  assert.equal(result.ok, true);
  assert.deepEqual(calls, [{ model: target }, { send: "Current paths" }]);
});

function pauseNextSwitch(h) {
  const original = h.pi.setModel;
  let release;
  let entered;
  const waiting = new Promise((resolve) => {
    entered = resolve;
  });
  const gate = new Promise((resolve) => {
    release = resolve;
  });
  h.pi.setModel = async (model) => {
    h.pi.setModel = original;
    entered();
    await gate;
    return original(model);
  };
  return { waiting, release };
}

test("Manual selection during initial preparation wins and no prompt is dispatched", async () => {
  const h = await harness();
  const pause = pauseNextSwitch(h);
  const invoking = h.invoke();
  await pause.waiting;
  const manual = { provider: "manual", id: "choice" };
  h.ctx.model = manual;
  await h.emit("model_select", { model: manual, source: "set" });
  pause.release();
  const result = await invoking;
  assert.equal(result.ok, false);
  assert.equal(h.ctx.model, manual);
  assert.equal(h.calls.filter((call) => call.send).length, 0);
});

test("Input arriving during awaited fallback cancels continuation", async () => {
  const h = await harness();
  await h.invoke();
  const pause = pauseNextSwitch(h);
  const failing = h.fail();
  await pause.waiting;
  await h.emit("input", { text: "new work", source: "interactive" });
  pause.release();
  assert.equal(await failing, undefined);
});

test("A delayed owned thinking event does not discard restoration", async () => {
  const h = await harness("Commit", "thinking: low\n");
  h.delayThinking();
  await h.invoke();
  await h.flushThinking();
  await h.emit("agent_settled");
  assert.equal(h.ctx.model, current);
  assert.equal(h.thinking(), "high");
});

test("A manual thinking event is preserved rather than restored over", async () => {
  const h = await harness();
  await h.invoke();
  await h.emit("thinking_level_select", { previousLevel: "medium", level: "low" });
  await h.emit("agent_settled");
  assert.equal(h.ctx.model, target);
});

test("A refused switch after a silent current-model change never sends stale conditional content", async () => {
  const ctx = {
    model: current,
    modelRegistry: { getAll: () => [current, target], getAvailable: () => [current, target] },
  };
  const calls = [];
  const result = await executePromptTemplateCommand(
    { name: "commit", models: [ref(target)], restore: true, content: "Commit" },
    "",
    ctx,
    {
      setModel: async () => {
        ctx.model = { provider: "manual", id: "choice" };
        return false;
      },
      sendUserMessage: (content) => calls.push(content),
    },
    { fallbackToCurrentModel: true },
  );
  assert.equal(result.ok, false);
  assert.deepEqual(calls, []);
});

for (const failure of ["refused", "thrown"]) {
  test(`A ${failure} fallback switch is never retried by settlement restoration`, async () => {
    const h = await harness();
    await h.invoke();
    let attempts = 0;
    h.pi.setModel = async () => {
      attempts++;
      if (failure === "thrown") throw new Error("synthetic setter failure");
      return false;
    };
    assert.equal(await h.fail(), undefined);
    await h.emit("agent_settled");
    assert.equal(attempts, 1);
    assert.equal(h.calls.filter((call) => call.send).length, 1);
  });
}

test("Manual thinking during initial switching wins over the switch's default", async () => {
  const h = await harness();
  const pause = pauseNextSwitch(h);
  const invoking = h.invoke();
  await pause.waiting;
  h.pi.setThinkingLevel("low");
  pause.release();
  assert.equal((await invoking).ok, false);
  assert.equal(h.thinking(), "low");
  assert.equal(h.calls.filter((call) => call.send).length, 0);
});

test("A delayed restoration event from the previous invocation does not cancel the next", async () => {
  const h = await harness();
  h.delayThinking();
  await h.invoke();
  await h.emit("agent_settled");
  await h.invoke();
  await h.flushThinking();
  await h.emit("agent_settled");
  assert.equal(h.ctx.model, current);
  assert.equal(h.thinking(), "high");
});

test("Manual thinking after the model default but before switch completion is preserved", async () => {
  const h = await harness();
  const original = h.pi.setModel;
  let release;
  let entered;
  const waiting = new Promise((resolve) => {
    entered = resolve;
  });
  const gate = new Promise((resolve) => {
    release = resolve;
  });
  h.pi.setModel = async (model) => {
    h.pi.setModel = original;
    const result = await original(model);
    entered();
    await gate;
    return result;
  };
  const invoking = h.invoke();
  await waiting;
  h.pi.setThinkingLevel("low");
  release();
  assert.equal((await invoking).ok, false);
  assert.equal(h.thinking(), "low");
  assert.equal(h.calls.filter((call) => call.send).length, 0);
});

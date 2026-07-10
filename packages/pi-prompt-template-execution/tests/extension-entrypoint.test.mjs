import assert from "node:assert/strict";
import { mkdir, mkdtemp, rm, unlink, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { afterEach, describe, it } from "node:test";

import promptTemplateExecutionExtension from "../extensions/prompt-template-execution.js";

const tempDirs = [];
const originalHome = process.env.HOME;

async function tempHome() {
  const dir = await mkdtemp(path.join(os.tmpdir(), "ptx-exec-live-"));
  tempDirs.push(dir);
  process.env.HOME = dir;
  return dir;
}

afterEach(async () => {
  process.env.HOME = originalHome;
  await Promise.all(tempDirs.splice(0).map((dir) => rm(dir, { recursive: true, force: true })));
});

async function writePrompt(home, name, content) {
  const filePath = path.join(home, ".pi", "agent", "prompts", `${name}.md`);
  await mkdir(path.dirname(filePath), { recursive: true });
  await writeFile(filePath, content, "utf8");
  return filePath;
}

function createModel(overrides = {}) {
  return {
    id: "gpt-5.4",
    provider: "openai-codex",
    name: "GPT",
    reasoning: true,
    ...overrides,
  };
}

function createRegistry(models, available = models) {
  return {
    getAll() {
      return models;
    },
    getAvailable() {
      return available;
    },
    isUsingOAuth() {
      return false;
    },
    async getApiKeyAndHeaders(model) {
      return { ok: true, apiKey: `key:${model.provider}` };
    },
  };
}

function createPi(existingCommands = [], overrides = {}) {
  const commands = [...existingCommands];
  const handlers = new Map();
  const notifications = [];
  return {
    commands,
    handlers,
    notifications,
    pi: {
      getCommands() {
        return commands;
      },
      registerCommand(name, options) {
        commands.push({ name, source: "extension", description: options.description });
        handlers.set(name, options.handler);
      },
      on(event, handler) {
        const current = handlers.get(`event:${event}`) ?? [];
        current.push(handler);
        handlers.set(`event:${event}`, current);
      },
      getThinkingLevel() {
        return "low";
      },
      ...overrides,
    },
    async emit(event, payload, ctx) {
      for (const handler of handlers.get(`event:${event}`) ?? []) {
        await handler(payload ?? { type: event }, ctx);
      }
    },
  };
}

function commandPrompt(content = "Commit $ARGUMENTS") {
  return `---\ndescription: Commit prompt\nmodel: zai/glm-5.1\n---\n${content}`;
}

describe("live prompt-template execution extension entrypoint", () => {
  it("filters Pi core prompt commands out of collision checks before registering", async () => {
    const home = await tempHome();
    const promptPath = await writePrompt(home, "commit", commandPrompt());
    const { pi, commands, emit } = createPi([
      {
        name: "commit",
        source: "prompt",
        sourceInfo: { path: promptPath, source: "auto" },
      },
    ]);

    promptTemplateExecutionExtension(pi);
    await emit("session_start", { type: "session_start" }, { cwd: "/repo", ui: {} });

    const extensionCommits = commands.filter(
      (command) => command.name === "commit" && command.source === "extension",
    );
    assert.equal(extensionCommits.length, 1);
    assert.match(extensionCommits[0].description, /\[glm-5\.1\] \(user\)/);
  });

  it("does not register over an existing extension command owner", async () => {
    const home = await tempHome();
    await writePrompt(home, "commit", commandPrompt());
    const { pi, commands, emit } = createPi([
      {
        name: "commit",
        source: "extension",
        sourceInfo: { source: "other-extension" },
      },
    ]);

    promptTemplateExecutionExtension(pi);
    await emit("session_start", { type: "session_start" }, { cwd: "/repo", ui: {} });

    assert.equal(commands.filter((command) => command.name === "commit").length, 1);
  });

  it("refreshes an edited prompt from disk at invocation time", async () => {
    const home = await tempHome();
    const promptPath = await writePrompt(home, "commit", commandPrompt("Original $ARGUMENTS"));
    const current = createModel({ provider: "zai", id: "glm-5.1" });
    const calls = [];
    const { pi, handlers, emit } = createPi([], {
      sendUserMessage(content) {
        calls.push(content);
      },
    });

    promptTemplateExecutionExtension(pi);
    const ctx = {
      cwd: "/repo",
      model: current,
      modelRegistry: createRegistry([current]),
      ui: {},
    };
    await emit("session_start", { type: "session_start" }, ctx);
    await writeFile(promptPath, commandPrompt("Edited $ARGUMENTS"), "utf8");

    await handlers.get("commit")("now", ctx);
    assert.deepEqual(calls, ["Edited now"]);
  });

  it("fails truthfully instead of executing stale content after prompt deletion", async () => {
    const home = await tempHome();
    const promptPath = await writePrompt(home, "commit", commandPrompt("Stale $ARGUMENTS"));
    const current = createModel({ provider: "zai", id: "glm-5.1" });
    const calls = [];
    const { pi, handlers, emit } = createPi([], {
      sendUserMessage(content) {
        calls.push({ type: "sendUserMessage", content });
      },
    });
    const ctx = {
      cwd: "/repo",
      model: current,
      modelRegistry: createRegistry([current]),
      ui: { notify: (message, level) => calls.push({ type: "notify", message, level }) },
    };

    promptTemplateExecutionExtension(pi);
    await emit("session_start", { type: "session_start" }, ctx);
    await unlink(promptPath);

    const result = await handlers.get("commit")("now", ctx);
    assert.equal(result.reason, "prompt_no_longer_available");
    assert.equal(
      calls.some((call) => call.type === "sendUserMessage"),
      false,
    );
    assert.ok(
      calls.some(
        (call) =>
          call.type === "notify" &&
          /no longer available on disk/.test(call.message) &&
          call.level === "error",
      ),
    );
  });

  it("defers restore until agent_end for live command execution", async () => {
    const home = await tempHome();
    await writePrompt(home, "commit", commandPrompt("Commit $ARGUMENTS"));
    const current = createModel({ provider: "openai-codex", id: "gpt-5.4" });
    const target = createModel({ provider: "zai", id: "glm-5.1" });
    const calls = [];
    const { pi, handlers, emit } = createPi([], {
      async setModel(model) {
        calls.push({ type: "setModel", model: `${model.provider}/${model.id}` });
        return true;
      },
      setThinkingLevel(thinking) {
        calls.push({ type: "setThinkingLevel", thinking });
      },
      sendUserMessage(content) {
        calls.push({ type: "sendUserMessage", content });
      },
    });

    promptTemplateExecutionExtension(pi);
    const ctx = {
      cwd: "/repo",
      model: current,
      modelRegistry: createRegistry([current, target]),
      ui: {},
    };
    await emit("session_start", { type: "session_start" }, ctx);

    await handlers.get("commit")("live args", ctx);
    assert.deepEqual(calls, [
      { type: "setModel", model: "zai/glm-5.1" },
      { type: "sendUserMessage", content: "Commit live args" },
    ]);

    await emit("agent_end", { type: "agent_end" }, { ...ctx, model: target });
    assert.deepEqual(calls.slice(2), [{ type: "setModel", model: "openai-codex/gpt-5.4" }]);
  });

  it("handles thinking frontmatter and restores thinking on agent_end", async () => {
    const home = await tempHome();
    await writePrompt(
      home,
      "think",
      "---\ndescription: Thinking prompt\nmodel: zai/glm-5.1\nthinking: high\n---\nThink $ARGUMENTS",
    );
    const current = createModel({ provider: "openai-codex", id: "gpt-5.4" });
    const target = createModel({ provider: "zai", id: "glm-5.1" });
    const calls = [];
    const { pi, handlers, emit } = createPi([], {
      getThinkingLevel() {
        calls.push({ type: "getThinkingLevel" });
        return "low";
      },
      async setModel(model) {
        calls.push({ type: "setModel", model: `${model.provider}/${model.id}` });
        return true;
      },
      setThinkingLevel(thinking) {
        calls.push({ type: "setThinkingLevel", thinking });
      },
      sendUserMessage(content) {
        calls.push({ type: "sendUserMessage", content });
      },
    });

    promptTemplateExecutionExtension(pi);
    const ctx = {
      cwd: "/repo",
      model: current,
      modelRegistry: createRegistry([current, target]),
      ui: {},
    };
    await emit("session_start", { type: "session_start" }, ctx);

    await handlers.get("think")("hard", ctx);
    assert.deepEqual(calls, [
      { type: "getThinkingLevel" },
      { type: "setModel", model: "zai/glm-5.1" },
      { type: "setThinkingLevel", thinking: "high" },
      { type: "sendUserMessage", content: "Think hard" },
    ]);

    await emit("agent_end", { type: "agent_end" }, { ...ctx, model: target });
    assert.deepEqual(calls.slice(4), [
      { type: "setThinkingLevel", thinking: "low" },
      { type: "setModel", model: "openai-codex/gpt-5.4" },
    ]);
  });

  it("honors restore false by leaving model and thinking active after agent_end", async () => {
    const home = await tempHome();
    await writePrompt(
      home,
      "stay",
      "---\ndescription: Sticky prompt\nmodel: zai/glm-5.1\nthinking: high\nrestore: false\n---\nStay $ARGUMENTS",
    );
    const current = createModel({ provider: "openai-codex", id: "gpt-5.4" });
    const target = createModel({ provider: "zai", id: "glm-5.1" });
    const calls = [];
    const { pi, handlers, emit } = createPi([], {
      getThinkingLevel() {
        calls.push({ type: "getThinkingLevel" });
        return "low";
      },
      async setModel(model) {
        calls.push({ type: "setModel", model: `${model.provider}/${model.id}` });
        return true;
      },
      setThinkingLevel(thinking) {
        calls.push({ type: "setThinkingLevel", thinking });
      },
      sendUserMessage(content) {
        calls.push({ type: "sendUserMessage", content });
      },
    });

    promptTemplateExecutionExtension(pi);
    const ctx = {
      cwd: "/repo",
      model: current,
      modelRegistry: createRegistry([current, target]),
      ui: {},
    };
    await emit("session_start", { type: "session_start" }, ctx);

    await handlers.get("stay")("active", ctx);
    await emit("agent_end", { type: "agent_end" }, { ...ctx, model: target });

    assert.deepEqual(calls, [
      { type: "getThinkingLevel" },
      { type: "setModel", model: "zai/glm-5.1" },
      { type: "setThinkingLevel", thinking: "high" },
      { type: "sendUserMessage", content: "Stay active" },
    ]);
  });

  it("queues skill frontmatter before sending the rendered prompt", async () => {
    const home = await tempHome();
    await writePrompt(
      home,
      "review",
      "---\ndescription: Review prompt\nmodel: zai/glm-5.1\nskill: reviewer\n---\nReview $ARGUMENTS",
    );
    const skillPath = path.join(home, "reviewer-skill.md");
    await writeFile(skillPath, "---\nname: reviewer\n---\nReview guidance", "utf8");
    const current = createModel({ provider: "zai", id: "glm-5.1" });
    const calls = [];
    const { pi, handlers, emit } = createPi(
      [
        {
          name: "reviewer",
          source: "skill",
          sourceInfo: { path: skillPath },
        },
      ],
      {
        queueSkillMessage(message) {
          calls.push({ type: "queueSkillMessage", message });
          return message;
        },
        sendUserMessage(content) {
          calls.push({ type: "sendUserMessage", content });
        },
      },
    );

    promptTemplateExecutionExtension(pi);
    const ctx = {
      cwd: "/repo",
      model: current,
      modelRegistry: createRegistry([current]),
      ui: {},
    };
    await emit("session_start", { type: "session_start" }, ctx);

    await handlers.get("review")("changes", ctx);
    assert.deepEqual(
      calls.map((call) => call.type),
      ["queueSkillMessage", "sendUserMessage"],
    );
    assert.equal(calls[0].message.customType, "skill-loaded");
    assert.equal(calls[0].message.details.skillName, "reviewer");
    assert.equal(calls[1].content, "Review changes");
  });

  it("fails safely when no model candidate has usable auth", async () => {
    const home = await tempHome();
    await writePrompt(home, "commit", commandPrompt("Commit $ARGUMENTS"));
    const current = createModel({ provider: "openai-codex", id: "gpt-5.4" });
    const target = createModel({ provider: "zai", id: "glm-5.1" });
    const calls = [];
    const { pi, handlers, emit } = createPi([], {
      async setModel(model) {
        calls.push({ type: "setModel", model: `${model.provider}/${model.id}` });
        return true;
      },
      sendUserMessage(content) {
        calls.push({ type: "sendUserMessage", content });
      },
    });

    promptTemplateExecutionExtension(pi);
    const ctx = {
      cwd: "/repo",
      model: current,
      modelRegistry: createRegistry([current, target], []),
      ui: { notify: (message, level) => calls.push({ type: "notify", message, level }) },
    };
    await emit("session_start", { type: "session_start" }, ctx);

    const result = await handlers.get("commit")("blocked", ctx);
    assert.equal(result.ok, false);
    assert.equal(result.reason, "no_available_model");
    assert.equal(
      calls.some((call) => call.type === "setModel"),
      false,
    );
    assert.equal(
      calls.some((call) => call.type === "sendUserMessage"),
      false,
    );
    assert.ok(
      calls.some(
        (call) =>
          call.type === "notify" &&
          call.message === "No available model from: zai/glm-5.1" &&
          call.level === "error",
      ),
    );
  });

  it("does not register loop, chain, or subagent prompt templates", async () => {
    const home = await tempHome();
    await writePrompt(
      home,
      "looping",
      "---\ndescription: Loop\nmodel: zai/glm-5.1\nloop: true\n---\nLoop",
    );
    await writePrompt(
      home,
      "chained",
      "---\ndescription: Chain\nmodel: zai/glm-5.1\nchain: next\n---\nChain",
    );
    await writePrompt(
      home,
      "delegated",
      "---\ndescription: Delegate\nmodel: zai/glm-5.1\nsubagent: reviewer\n---\nDelegate",
    );
    const { pi, commands, emit } = createPi([]);

    promptTemplateExecutionExtension(pi);
    await emit("session_start", { type: "session_start" }, { cwd: "/repo", ui: {} });

    assert.deepEqual(
      commands.filter((command) => command.source === "extension").map((command) => command.name),
      [],
    );
  });
});

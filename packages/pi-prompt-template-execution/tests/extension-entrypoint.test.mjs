import assert from "node:assert/strict";
import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
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
});

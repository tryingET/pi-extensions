/**
 * summary: "tests command execution, host adaptation, skill queuing, failures, and immediate or deferred restoration."
 * read_when:
 *   - "changing command-runner effects, error paths, refreshed prompts, or Pi host integration."
 */
import assert from "node:assert/strict";
import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { afterEach, describe, it } from "node:test";

import {
  createPromptCommandHandler,
  createPromptTemplateExecutionHandler,
  executePromptTemplateCommand,
  restorePromptTemplateSessionState,
} from "../src/command-runner.js";
import { createPiPromptTemplateHostAdapter } from "../src/host-adapter.js";

const tempDirs = [];

afterEach(async () => {
  await Promise.all(tempDirs.splice(0).map((dir) => rm(dir, { recursive: true, force: true })));
});

async function tempDir() {
  const dir = await mkdtemp(path.join(os.tmpdir(), "ptx-exec-runner-"));
  tempDirs.push(dir);
  return dir;
}

async function writeFileEnsured(filePath, content) {
  await mkdir(path.dirname(filePath), { recursive: true });
  await writeFile(filePath, content, "utf8");
  return filePath;
}

function createModel(overrides = {}) {
  return {
    id: "claude-sonnet-4",
    provider: "anthropic",
    name: "Claude Sonnet",
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

function createHost(overrides = {}) {
  const calls = [];
  return {
    calls,
    host: {
      thinking: "low",
      async setModel(model) {
        calls.push({ type: "setModel", model });
        return true;
      },
      async setThinking(thinking) {
        calls.push({ type: "setThinking", thinking });
      },
      async sendUserMessage(content) {
        calls.push({ type: "sendUserMessage", content });
      },
      ...overrides,
    },
  };
}

function createContext(current, models = [current]) {
  const notifications = [];
  return {
    notifications,
    ctx: {
      cwd: "/repo",
      model: current,
      modelRegistry: createRegistry(models),
      ui: {
        notify(message, level) {
          notifications.push({ message, level });
        },
      },
    },
  };
}

describe("prompt-template command runner", () => {
  it("switches model, sets thinking, sends rendered prompt, then restores", async () => {
    const current = createModel({ provider: "openai", id: "gpt-5" });
    const target = createModel({ provider: "zai", id: "glm-5.1" });
    const { ctx } = createContext(current, [current, target]);
    const { host, calls } = createHost();

    const result = await executePromptTemplateCommand(
      {
        name: "commit",
        content: "Commit $ARGUMENTS",
        models: ["zai/glm-5.1"],
        restore: true,
        thinking: "medium",
      },
      "all changes",
      ctx,
      host,
    );

    assert.equal(result.ok, true);
    assert.deepEqual(calls, [
      { type: "setModel", model: target },
      { type: "setThinking", thinking: "medium" },
      { type: "sendUserMessage", content: "Commit all changes" },
      { type: "setThinking", thinking: "low" },
      { type: "setModel", model: current },
    ]);
  });

  it("does not switch when current model already matches and restore false leaves selected state active", async () => {
    const current = createModel({ provider: "zai", id: "glm-5.1" });
    const { ctx } = createContext(current, [current]);
    const { host, calls } = createHost();

    const result = await executePromptTemplateCommand(
      {
        name: "commit",
        content: "Commit",
        models: ["zai/glm-5.1"],
        restore: false,
        thinking: "medium",
      },
      "",
      ctx,
      host,
    );

    assert.equal(result.ok, true);
    assert.deepEqual(calls, [
      { type: "setThinking", thinking: "medium" },
      { type: "sendUserMessage", content: "Commit" },
    ]);
  });

  it("supports deferred agent-settled style restore without live hook registration", async () => {
    const current = createModel({ provider: "openai", id: "gpt-5" });
    const target = createModel({ provider: "zai", id: "glm-5.1" });
    const { ctx } = createContext(current, [current, target]);
    const { host, calls } = createHost();

    const result = await executePromptTemplateCommand(
      {
        name: "commit",
        content: "Commit",
        models: ["zai/glm-5.1"],
        restore: true,
        thinking: "medium",
      },
      "",
      ctx,
      host,
      { restoreTiming: "agent_settled" },
    );

    assert.equal(result.ok, true);
    assert.deepEqual(calls, [
      { type: "setModel", model: target },
      { type: "setThinking", thinking: "medium" },
      { type: "sendUserMessage", content: "Commit" },
    ]);
    assert.deepEqual(result.deferredRestore, { model: current, thinking: "low" });

    const restoreResult = await restorePromptTemplateSessionState(
      result.deferredRestore,
      ctx,
      host,
    );
    assert.deepEqual(restoreResult, { ok: true, restored: ["thinking", "model"] });
    assert.deepEqual(calls.slice(3), [
      { type: "setThinking", thinking: "low" },
      { type: "setModel", model: current },
    ]);
  });

  it("restores model immediately when sendUserMessage fails even with deferred restore", async () => {
    const current = createModel({ provider: "openai", id: "gpt-5" });
    const target = createModel({ provider: "zai", id: "glm-5.1" });
    const { ctx } = createContext(current, [current, target]);
    const { host, calls } = createHost({
      async sendUserMessage() {
        calls.push({ type: "sendUserMessage" });
        throw new Error("send failed");
      },
    });

    await assert.rejects(
      executePromptTemplateCommand(
        {
          name: "commit",
          content: "Commit",
          models: ["zai/glm-5.1"],
          restore: true,
        },
        "",
        ctx,
        host,
        { restoreTiming: "agent_settled" },
      ),
      /send failed/,
    );

    assert.deepEqual(calls, [
      { type: "setModel", model: target },
      { type: "sendUserMessage" },
      { type: "setModel", model: current },
    ]);
  });

  it("restores model when sendUserMessage fails", async () => {
    const current = createModel({ provider: "openai", id: "gpt-5" });
    const target = createModel({ provider: "zai", id: "glm-5.1" });
    const { ctx } = createContext(current, [current, target]);
    const { host, calls } = createHost({
      async sendUserMessage() {
        calls.push({ type: "sendUserMessage" });
        throw new Error("send failed");
      },
    });

    await assert.rejects(
      executePromptTemplateCommand(
        {
          name: "commit",
          content: "Commit",
          models: ["zai/glm-5.1"],
          restore: true,
        },
        "",
        ctx,
        host,
      ),
      /send failed/,
    );

    assert.deepEqual(calls, [
      { type: "setModel", model: target },
      { type: "sendUserMessage" },
      { type: "setModel", model: current },
    ]);
  });

  it("fails safely and notifies when no model candidate is available", async () => {
    const current = createModel({ provider: "openai", id: "gpt-5" });
    const { ctx, notifications } = createContext(current, [current]);
    const { host } = createHost();

    const result = await executePromptTemplateCommand(
      {
        name: "commit",
        content: "Commit",
        models: ["zai/glm-5.1"],
        restore: true,
      },
      "",
      ctx,
      host,
    );

    assert.equal(result.ok, false);
    assert.equal(result.reason, "no_available_model");
    assert.match(notifications[0].message, /No available model from/);
    assert.equal(notifications[0].level, "error");
  });

  it("refreshes prompt templates at invocation time", async () => {
    const current = createModel({ provider: "zai", id: "glm-5.1" });
    const { ctx } = createContext(current, [current]);
    const calls = [];
    let body = "First $1";
    const handler = createPromptCommandHandler({
      loadPromptTemplates: () => ({
        prompts: new Map([
          [
            "commit",
            {
              name: "commit",
              description: "Commit",
              content: body,
              models: ["zai/glm-5.1"],
              restore: true,
              source: "project",
              filePath: "/repo/.pi/prompts/commit.md",
            },
          ],
        ]),
        diagnostics: [],
      }),
      executePromptTemplateCommand: async (prompt, args) => {
        calls.push({ content: prompt.content, args });
        return { ok: true };
      },
    });

    await handler("commit", "one", ctx);
    body = "Second $1";
    await handler("commit", "two", ctx);

    assert.deepEqual(calls, [
      { content: "First $1", args: "one" },
      { content: "Second $1", args: "two" },
    ]);
  });

  it("notifies when refreshed prompt is missing", async () => {
    const current = createModel({ provider: "zai", id: "glm-5.1" });
    const { ctx, notifications } = createContext(current, [current]);
    const handler = createPromptCommandHandler({
      loadPromptTemplates: () => ({ prompts: new Map(), diagnostics: [{ code: "none" }] }),
    });

    const result = await handler("commit", "", ctx);
    assert.equal(result.ok, false);
    assert.equal(result.reason, "prompt_not_found");
    assert.deepEqual(result.diagnostics, [{ code: "none" }]);
    assert.match(notifications[0].message, /Prompt template \/commit was not found/);
  });

  it("adapts Pi host model, thinking, user-message, and notification APIs", async () => {
    const calls = [];
    const pi = {
      getThinkingLevel() {
        calls.push({ type: "getThinkingLevel" });
        return "minimal";
      },
      async setModel(model) {
        calls.push({ type: "setModel", model });
        return true;
      },
      setThinkingLevel(thinking) {
        calls.push({ type: "setThinkingLevel", thinking });
      },
      sendUserMessage(content) {
        calls.push({ type: "sendUserMessage", content });
      },
    };
    const notifications = [];
    const host = createPiPromptTemplateHostAdapter(pi, {
      hasUI: true,
      ui: { notify: (message, level) => notifications.push({ message, level }) },
    });
    const model = createModel({ provider: "zai", id: "glm-5.1" });

    assert.equal(host.thinking, "minimal");
    assert.equal(await host.setModel(model), true);
    host.setThinking("medium");
    host.sendUserMessage("hello");
    host.notify("heads up", "info");

    assert.deepEqual(calls, [
      { type: "getThinkingLevel" },
      { type: "setModel", model },
      { type: "setThinkingLevel", thinking: "medium" },
      { type: "sendUserMessage", content: "hello" },
    ]);
    assert.deepEqual(notifications, [{ message: "heads up", level: "info" }]);
  });

  it("queues resolved skill messages before sending the rendered prompt", async () => {
    const cwd = await tempDir();
    const skillPath = await writeFileEnsured(
      path.join(cwd, ".pi", "skills", "reviewer", "SKILL.md"),
      "Review guidance",
    );
    const current = createModel({ provider: "zai", id: "glm-5.1" });
    const { ctx } = createContext(current, [current]);
    ctx.cwd = cwd;
    const { host, calls } = createHost({
      queueSkillMessage(message) {
        calls.push({ type: "queueSkillMessage", message });
      },
    });

    const result = await executePromptTemplateCommand(
      {
        name: "review",
        content: "Review $ARGUMENTS",
        models: ["zai/glm-5.1"],
        restore: true,
        skill: "reviewer",
      },
      "changes",
      ctx,
      host,
    );

    assert.equal(result.ok, true);
    assert.deepEqual(calls, [
      {
        type: "queueSkillMessage",
        message: {
          customType: "skill-loaded",
          content: '<skill name="reviewer">\nReview guidance\n</skill>',
          display: true,
          details: { skillName: "reviewer", skillContent: "Review guidance", skillPath },
        },
      },
      { type: "sendUserMessage", content: "Review changes" },
    ]);
  });

  it("fails closed when skill frontmatter cannot be resolved", async () => {
    const cwd = await tempDir();
    const current = createModel({ provider: "zai", id: "glm-5.1" });
    const { ctx, notifications } = createContext(current, [current]);
    ctx.cwd = cwd;
    const { host, calls } = createHost();

    const result = await executePromptTemplateCommand(
      {
        name: "review",
        content: "Review",
        models: ["zai/glm-5.1"],
        restore: true,
        skill: "missing",
      },
      "",
      ctx,
      host,
    );

    assert.equal(result.ok, false);
    assert.equal(result.reason, "skill_not_found");
    assert.deepEqual(calls, []);
    assert.match(notifications[0].message, /Skill "missing" not found/);
  });

  it("creates a guarded-entrypoint handler that runs through Pi host APIs", async () => {
    const current = createModel({ provider: "openai-codex", id: "gpt-5.4" });
    const target = createModel({ provider: "zai", id: "glm-5.1" });
    const calls = [];
    const pi = {
      getThinkingLevel() {
        return "low";
      },
      async setModel(model) {
        calls.push({ type: "setModel", model });
        return true;
      },
      setThinkingLevel(thinking) {
        calls.push({ type: "setThinkingLevel", thinking });
      },
      sendUserMessage(content) {
        calls.push({ type: "sendUserMessage", content });
      },
    };
    const { ctx } = createContext(current, [current, target]);
    const handler = createPromptTemplateExecutionHandler(pi);

    const result = await handler(
      {
        name: "commit",
        content: "Commit $ARGUMENTS",
        models: ["zai/glm-5.1"],
        restore: true,
        thinking: "medium",
      },
      "all changes",
      ctx,
    );

    assert.equal(result.ok, true);
    assert.deepEqual(calls, [
      { type: "setModel", model: target },
      { type: "setThinkingLevel", thinking: "medium" },
      { type: "sendUserMessage", content: "Commit all changes" },
      { type: "setThinkingLevel", thinking: "low" },
      { type: "setModel", model: current },
    ]);
  });
});

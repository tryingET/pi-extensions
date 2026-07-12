/**
 * summary: "tests guarded prompt command registration, collision checks, one-time state, and runner wiring."
 * read_when:
 *   - "changing registration preconditions, command plans, duplicate protection, or extension factories."
 */
import assert from "node:assert/strict";
import { describe, it } from "node:test";

import {
  buildPromptCommandRegistrationPlan,
  createPromptTemplateExecutionExtension,
  createPromptTemplateRegistrationState,
  evaluatePromptTemplateRegistration,
  findPromptCommandCollisions,
  registerPromptTemplateCommands,
} from "../src/registration.js";

function prompt(name, overrides = {}) {
  return {
    name,
    description: `${name} description`,
    content: "Body",
    models: ["anthropic/claude-haiku"],
    restore: true,
    source: "project",
    filePath: `/repo/.pi/prompts/${name}.md`,
    ...overrides,
  };
}

function promptMap(...prompts) {
  return new Map(prompts.map((item) => [item.name, item]));
}

function createPiRecorder(existingCommands = [], overrides = {}) {
  const registered = [];
  return {
    registered,
    pi: {
      getCommands() {
        return existingCommands;
      },
      registerCommand(name, options) {
        registered.push({ name, options });
      },
      ...overrides,
    },
  };
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

describe("prompt-template registration guard", () => {
  it("detects command collisions by name or invocationName", () => {
    const prompts = promptMap(prompt("commit"), prompt("review"));
    assert.deepEqual(
      findPromptCommandCollisions(prompts, [{ name: "commit" }, { invocationName: "/x" }]),
      ["commit"],
    );
    assert.deepEqual(findPromptCommandCollisions(prompts, [{ invocationName: "/review" }]), [
      "review",
    ]);
  });

  it("fails closed unless explicitly enabled with tests and no-double-registration proof", () => {
    const prompts = promptMap(prompt("commit"));
    assert.equal(
      evaluatePromptTemplateRegistration({ prompts, existingCommands: [] }).reason,
      "disabled",
    );
    assert.equal(
      evaluatePromptTemplateRegistration({
        enablePromptTemplateExecution: true,
        prompts,
        existingCommands: [],
      }).reason,
      "loader_tests_not_confirmed",
    );
    assert.equal(
      evaluatePromptTemplateRegistration({
        enablePromptTemplateExecution: true,
        loaderTestsPassed: true,
        prompts,
        existingCommands: [],
      }).reason,
      "missing_no_double_registration_preflight",
    );
    assert.equal(
      evaluatePromptTemplateRegistration({
        enablePromptTemplateExecution: true,
        loaderTestsPassed: true,
        noDoubleRegistrationPreflight: true,
        prompts,
      }).reason,
      "unknown_existing_commands",
    );
  });

  it("blocks duplicate existing commands and duplicate package registration", () => {
    const prompts = promptMap(prompt("commit"));
    assert.deepEqual(
      evaluatePromptTemplateRegistration({
        enablePromptTemplateExecution: true,
        loaderTestsPassed: true,
        noDoubleRegistrationPreflight: true,
        prompts,
        existingCommands: [{ name: "commit" }],
      }),
      {
        ok: false,
        reason: "existing_command_collision",
        collisions: ["commit"],
        message: "refusing to register prompt command(s) already present: commit",
      },
    );

    assert.equal(
      evaluatePromptTemplateRegistration(
        {
          enablePromptTemplateExecution: true,
          loaderTestsPassed: true,
          noDoubleRegistrationPreflight: true,
          prompts,
          existingCommands: [],
        },
        { promptCommandsRegistered: true },
      ).reason,
      "already_registered_by_this_package",
    );
  });

  it("builds a command registration plan only after a clean command snapshot", () => {
    const prompts = promptMap(prompt("commit"), prompt("review", { source: "user" }));
    const plan = buildPromptCommandRegistrationPlan(
      { prompts, diagnostics: [{ code: "note" }] },
      [{ name: "model" }],
      {
        enablePromptTemplateExecution: true,
        loaderTestsPassed: true,
        noDoubleRegistrationPreflight: true,
      },
    );

    assert.equal(plan.ok, true);
    assert.deepEqual(
      plan.commands.map((command) => command.name),
      ["commit", "review"],
    );
    assert.match(plan.commands[0].description, /commit description/);
    assert.deepEqual(plan.diagnostics, [{ code: "note" }]);
  });

  it("registers commands exactly once through an explicit guarded path", async () => {
    const prompts = promptMap(prompt("commit"));
    const { pi, registered } = createPiRecorder([{ name: "model" }]);
    const state = createPromptTemplateRegistrationState();
    const calls = [];

    const result = registerPromptTemplateCommands(
      pi,
      {
        enablePromptTemplateExecution: true,
        loaderTestsPassed: true,
        noDoubleRegistrationPreflight: true,
        loadResult: { prompts, diagnostics: [] },
        handler: async (selectedPrompt, args, ctx) => {
          calls.push({ selectedPrompt, args, ctx });
        },
      },
      state,
    );

    assert.equal(result.ok, true);
    assert.equal(registered.length, 1);
    assert.equal(registered[0].name, "commit");
    assert.equal(state.promptCommandsRegistered, true);

    await registered[0].options.handler("--all", { cwd: "/repo" });
    assert.equal(calls[0].selectedPrompt.name, "commit");
    assert.equal(calls[0].args, "--all");

    const duplicate = registerPromptTemplateCommands(
      pi,
      {
        enablePromptTemplateExecution: true,
        loaderTestsPassed: true,
        noDoubleRegistrationPreflight: true,
        loadResult: { prompts, diagnostics: [] },
        existingCommands: [],
      },
      state,
    );
    assert.equal(duplicate.reason, "already_registered_by_this_package");
    assert.equal(registered.length, 1);
  });

  it("wires guarded registration to the non-live command runner when no custom handler is supplied", async () => {
    const current = createModel({ provider: "openai-codex", id: "gpt-5.4" });
    const target = createModel({ provider: "zai", id: "glm-5.1" });
    const prompts = promptMap(
      prompt("commit", {
        content: "Commit $ARGUMENTS",
        models: ["zai/glm-5.1"],
        thinking: "medium",
      }),
    );
    const calls = [];
    const { pi, registered } = createPiRecorder([{ name: "model" }], {
      getThinkingLevel: () => "low",
      setModel: async (model) => {
        calls.push({ type: "setModel", model });
        return true;
      },
      setThinkingLevel: (thinking) => calls.push({ type: "setThinkingLevel", thinking }),
      sendUserMessage: (content) => calls.push({ type: "sendUserMessage", content }),
    });

    const result = registerPromptTemplateCommands(pi, {
      enablePromptTemplateExecution: true,
      loaderTestsPassed: true,
      noDoubleRegistrationPreflight: true,
      loadResult: { prompts, diagnostics: [] },
    });

    assert.equal(result.ok, true);
    assert.equal(registered.length, 1);
    const runResult = await registered[0].options.handler("all changes", {
      cwd: "/repo",
      model: current,
      modelRegistry: createRegistry([current, target]),
    });

    assert.equal(runResult.ok, true);
    assert.deepEqual(calls, [
      { type: "setModel", model: target },
      { type: "setThinkingLevel", thinking: "medium" },
      { type: "sendUserMessage", content: "Commit all changes" },
      { type: "setThinkingLevel", thinking: "low" },
      { type: "setModel", model: current },
    ]);
  });

  it("creates a non-live extension factory that remains disabled by default", () => {
    const prompts = promptMap(prompt("commit"));
    const { pi, registered } = createPiRecorder([]);
    const extension = createPromptTemplateExecutionExtension({
      loadResult: { prompts, diagnostics: [] },
    });
    const result = extension(pi);

    assert.equal(result.reason, "disabled");
    assert.deepEqual(registered, []);
  });
});

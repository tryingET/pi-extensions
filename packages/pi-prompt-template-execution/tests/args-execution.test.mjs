import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { parsePromptArgs, substituteArgs } from "../src/args.js";
import {
  preparePromptExecutionPlan,
  renderModelConditionals,
  renderPromptForResolvedModel,
} from "../src/execution-plan.js";

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

describe("prompt argument substitution", () => {
  it("supports positional, all-args, and slice substitutions", () => {
    assert.deepEqual(parsePromptArgs('one "two words" three'), ["one", "two words", "three"]);
    assert.equal(
      substituteArgs(
        ["$1", "$2", "$3", "$@", "$ARGUMENTS", "$" + "{@:2}", "$" + "{@:2:1}"].join("|"),
        'one "two words" three',
      ),
      "one|two words|three|one two words three|one two words three|two words three|two words",
    );
  });

  it("replaces missing positional args with empty strings", () => {
    assert.equal(substituteArgs("before $4 after", "one two"), "before  after");
  });
});

describe("prompt rendering", () => {
  it("renders model conditionals for exact and provider wildcard matches", () => {
    const model = createModel({ provider: "openrouter", id: "deepseek-chat" });
    assert.equal(
      renderModelConditionals('<if-model is="openrouter/*">router<else>other</if-model>', model)
        .content,
      "router",
    );
    assert.equal(
      renderModelConditionals('<if-model is="anthropic/claude">a<else>b</if-model>', model).content,
      "b",
    );
  });

  it("returns an empty prompt abort when rendering produces no content", () => {
    assert.deepEqual(
      renderPromptForResolvedModel(
        { name: "empty", content: '<if-model is="missing/model">x</if-model>' },
        [],
        createModel(),
      ),
      { empty: "Prompt `empty` rendered to an empty message.", warning: undefined },
    );
  });
});

describe("prompt execution planning", () => {
  it("selects a prompt model, renders args, and plans switch/restore actions", async () => {
    const current = createModel({ provider: "openai", id: "gpt-5" });
    const target = createModel({ provider: "zai", id: "glm-5.1" });
    const plan = await preparePromptExecutionPlan(
      {
        name: "commit",
        content: "Commit $ARGUMENTS",
        models: ["zai/glm-5.1"],
        restore: true,
        thinking: "medium",
      },
      "all changes",
      current,
      createRegistry([current, target]),
    );

    assert.equal(plan.promptName, "commit");
    assert.equal(plan.selectedModel.model, target);
    assert.equal(plan.content, "Commit all changes");
    assert.equal(plan.actions.switchModel.to, target);
    assert.equal(plan.actions.restoreModel, current);
    assert.equal(plan.actions.setThinking, "medium");
    assert.equal(plan.actions.restoreThinking, true);
  });

  it("keeps the current matching model active and respects restore false", async () => {
    const current = createModel({ provider: "zai", id: "glm-5.1" });
    const fallback = createModel({ provider: "anthropic", id: "claude-sonnet-4" });
    const plan = await preparePromptExecutionPlan(
      {
        name: "commit",
        content: "Commit",
        models: ["anthropic/claude-sonnet-4", "zai/glm-5.1"],
        restore: false,
      },
      "",
      current,
      createRegistry([fallback, current]),
    );

    assert.equal(plan.selectedModel.model, current);
    assert.equal(plan.actions.switchModel, undefined);
    assert.equal(plan.actions.restoreModel, undefined);
    assert.equal(plan.restore, false);
  });

  it("inherits current model for model-less conditional prompts", async () => {
    const current = createModel();
    const plan = await preparePromptExecutionPlan(
      {
        name: "conditional",
        content: '<if-model is="anthropic/claude-sonnet-4">Hello $1<else>No</if-model>',
        models: [],
        restore: true,
      },
      "world",
      current,
      createRegistry([current]),
    );

    assert.equal(plan.selectedModel.model, current);
    assert.equal(plan.content, "Hello world");
    assert.equal(plan.actions.switchModel, undefined);
  });

  it("fails closed when no candidate has auth", async () => {
    const current = createModel({ provider: "openai", id: "gpt-5" });
    const target = createModel({ provider: "zai", id: "glm-5.1" });
    const registry = createRegistry([current, target], []);
    registry.getApiKeyAndHeaders = async () => ({ ok: false, error: "missing auth" });

    const plan = await preparePromptExecutionPlan(
      { name: "commit", content: "Commit", models: ["zai/glm-5.1"], restore: true },
      "",
      current,
      registry,
    );

    assert.equal(plan, undefined);
  });
});

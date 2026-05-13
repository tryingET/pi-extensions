import assert from "node:assert/strict";
import { describe, it } from "node:test";

import {
  PREFERRED_PROVIDERS,
  parseModelSpecList,
  parseProviderModel,
  resolveModelAuth,
  resolveModelReference,
  selectModelCandidate,
} from "../index.js";

function createModel(overrides = {}) {
  return {
    id: "claude-sonnet-4",
    provider: "anthropic",
    headers: { "x-model-header": "from-model" },
    ...overrides,
  };
}

function createContext({ models, currentModel = models[0], registryOverrides = {} }) {
  return {
    model: currentModel,
    modelRegistry: {
      getAll() {
        return models;
      },
      getAvailable() {
        return models;
      },
      isUsingOAuth() {
        return false;
      },
      async getApiKeyAndHeaders(model) {
        return { ok: true, apiKey: `key:${model.provider}`, headers: { "x-registry": "new" } };
      },
      ...registryOverrides,
    },
  };
}

describe("model spec parsing", () => {
  it("exposes the prompt-template-model provider priority", () => {
    assert.deepEqual(PREFERRED_PROVIDERS, [
      "openai-codex",
      "anthropic",
      "github-copilot",
      "openrouter",
    ]);
  });

  it("parses provider/model references", () => {
    assert.deepEqual(parseProviderModel("openai/gpt-5"), { provider: "openai", modelId: "gpt-5" });
    assert.throws(() => parseProviderModel("gpt-5"), /Expected provider\/modelId/);
  });

  it("parses fallback lists and rejects malformed specs", () => {
    assert.deepEqual(parseModelSpecList("anthropic/claude-haiku, claude-sonnet"), [
      "anthropic/claude-haiku",
      "claude-sonnet",
    ]);
    assert.throws(() => parseModelSpecList("anthropic/*"), /Invalid model spec/);
    assert.throws(() => parseModelSpecList("anthropic /claude"), /Invalid model spec/);
    assert.throws(() => parseModelSpecList("anthropic/claude/extra"), /Invalid model spec/);
  });
});

describe("model selection", () => {
  it("resolves exact provider/model and exact bare model IDs", () => {
    const sonnet = createModel();
    const haiku = createModel({ id: "claude-haiku-4" });
    const ctx = createContext({ models: [sonnet, haiku] });

    assert.equal(resolveModelReference(ctx, "anthropic/claude-sonnet-4"), sonnet);
    assert.equal(resolveModelReference(ctx, "claude-haiku-4"), haiku);
  });

  it("preserves the current model when it matches any fallback candidate", async () => {
    const current = createModel({ id: "glm-5.1", provider: "zai" });
    const preferred = createModel({ id: "claude-sonnet-4", provider: "anthropic" });
    const ctx = createContext({ models: [preferred, current], currentModel: current });

    const selected = await selectModelCandidate("claude-sonnet-4, zai/glm-5.1", current, ctx);
    assert.equal(selected.model, current);
    assert.equal(selected.alreadyActive, true);
  });

  it("orders ambiguous bare IDs by provider priority", async () => {
    const openrouter = createModel({ id: "shared-model", provider: "openrouter" });
    const anthropic = createModel({ id: "shared-model", provider: "anthropic" });
    const codex = createModel({ id: "shared-model", provider: "openai-codex" });
    const ctx = createContext({ models: [openrouter, anthropic, codex] });

    const selected = await selectModelCandidate(["shared-model"], undefined, ctx);
    assert.equal(selected.model, codex);
  });

  it("tries comma fallbacks and skips unavailable candidates", async () => {
    const unavailable = createModel({ id: "claude-haiku-4" });
    const available = createModel({ id: "claude-sonnet-4" });
    const ctx = createContext({
      models: [unavailable, available],
      registryOverrides: {
        getAvailable() {
          return [available];
        },
      },
    });

    const selected = await selectModelCandidate(
      "anthropic/claude-haiku-4, anthropic/claude-sonnet-4",
      undefined,
      ctx,
    );
    assert.equal(selected.model, available);
    assert.equal(selected.alreadyActive, false);
  });

  it("uses OAuth and legacy API keys when getAvailable does not already include the model", async () => {
    const model = createModel({ id: "legacy-auth" });
    const ctx = createContext({
      models: [model],
      registryOverrides: {
        getAvailable() {
          return [];
        },
        isUsingOAuth() {
          return true;
        },
        getApiKeyAndHeaders: undefined,
        async getApiKey() {
          return "legacy-key";
        },
      },
    });

    const selected = await selectModelCandidate("legacy-auth", undefined, ctx);
    assert.equal(selected.model, model);
  });

  it("rejects candidates without usable auth", async () => {
    const model = createModel({ id: "locked" });
    const ctx = createContext({
      models: [model],
      registryOverrides: {
        getAvailable() {
          return [];
        },
        isUsingOAuth() {
          return false;
        },
      },
    });

    assert.equal(await selectModelCandidate("locked", undefined, ctx), undefined);
  });
});

describe("model auth compatibility", () => {
  it("uses getApiKeyAndHeaders and preserves model headers as fallback", async () => {
    const model = createModel();
    const ctx = createContext({
      models: [model],
      registryOverrides: {
        async getApiKeyAndHeaders() {
          return { ok: true, apiKey: "new-key" };
        },
      },
    });

    assert.deepEqual(await resolveModelAuth(ctx, model), {
      ok: true,
      apiKey: "new-key",
      headers: { "x-model-header": "from-model" },
    });
  });

  it("uses getApiKeyAndHeaders headers when present", async () => {
    const model = createModel();
    const ctx = createContext({ models: [model] });

    assert.deepEqual(await resolveModelAuth(ctx, model), {
      ok: true,
      apiKey: "key:anthropic",
      headers: { "x-registry": "new" },
    });
  });

  it("uses legacy getApiKey and preserves model headers", async () => {
    const model = createModel({ headers: { authorization: "model-header" } });
    const ctx = createContext({
      models: [model],
      registryOverrides: {
        getApiKeyAndHeaders: undefined,
        async getApiKey() {
          return "legacy-key";
        },
      },
    });

    assert.deepEqual(await resolveModelAuth(ctx, model), {
      ok: true,
      apiKey: "legacy-key",
      headers: { authorization: "model-header" },
    });
  });
});

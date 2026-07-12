/**
summary: "Tests thinking-level normalization, preset matching, model references, auth compatibility, and summarizer selection."
read_when:
  - "Changing model-resolution primitives, provider preference, preset fallbacks, reasoning support, or auth APIs."
*/
import assert from "node:assert/strict";
import { describe, it } from "node:test";

import {
  getEffectiveThinkingLevel,
  normalizeThinkingLevel,
  parseModelSpecList,
  parseProviderModel,
  resolveModelAuth,
  resolveModelReference,
  resolvePresetMatch,
  resolveSummarizerModel,
  selectModelCandidate,
  toReasoningLevel,
} from "../extensions/session-compaction/model-resolver.js";

function createModel(overrides = {}) {
  return {
    id: "claude-sonnet-4",
    name: "Claude Sonnet 4",
    label: "Claude Sonnet",
    provider: "anthropic",
    reasoning: true,
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

describe("model resolver primitives", () => {
  it("normalizes supported thinking levels and rejects unknown levels", () => {
    assert.equal(normalizeThinkingLevel(" HIGH "), "high");
    assert.equal(normalizeThinkingLevel("xhigh"), "xhigh");
    assert.equal(normalizeThinkingLevel("none"), undefined);
    assert.equal(toReasoningLevel("off"), undefined);
    assert.equal(toReasoningLevel("minimal"), "minimal");
  });

  it("tracks the latest thinking_level_change entry", () => {
    assert.equal(
      getEffectiveThinkingLevel([
        { type: "thinking_level_change", thinkingLevel: "low" },
        { type: "message" },
        { type: "thinking_level_change", thinkingLevel: "high" },
      ]),
      "high",
    );
  });

  it("parses provider/model references", () => {
    assert.deepEqual(parseProviderModel("openai/gpt-5"), { provider: "openai", modelId: "gpt-5" });
    assert.throws(() => parseProviderModel("gpt-5"), /Expected provider\/modelId/);
  });

  it("parses prompt-template-model style fallback model specs", () => {
    assert.deepEqual(parseModelSpecList("anthropic/claude-haiku, claude-sonnet"), [
      "anthropic/claude-haiku",
      "claude-sonnet",
    ]);
    assert.throws(() => parseModelSpecList("anthropic/*"), /Invalid model spec/);
    assert.throws(() => parseModelSpecList("anthropic /claude"), /Invalid model spec/);
  });

  it("resolves preset names deterministically", () => {
    const presets = {
      cheap: { model: "anthropic/claude-haiku" },
      expensive: { model: "anthropic/claude-opus" },
      "fast-debug": { model: "openai/gpt-5-mini" },
    };

    assert.equal(resolvePresetMatch(presets, "cheap").name, "cheap");
    assert.equal(resolvePresetMatch(presets, "EXPENSIVE").name, "expensive");
    assert.equal(resolvePresetMatch(presets, "fast").name, "fast-debug");
    assert.equal(resolvePresetMatch(presets, "debug").name, "fast-debug");
    assert.equal(resolvePresetMatch({ alpha: {}, alpine: {} }, "alp").kind, "ambiguous");
    assert.equal(resolvePresetMatch(presets, "missing").kind, "unmatched");
  });
});

describe("model auth compatibility", () => {
  it("uses getApiKeyAndHeaders when available and preserves model headers as fallback", async () => {
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

  it("uses legacy getApiKey and preserves model headers", async () => {
    const model = createModel({ headers: { authorization: "model-header" } });
    const ctx = {
      model,
      modelRegistry: {
        getAll() {
          return [model];
        },
        getAvailable() {
          return [model];
        },
        isUsingOAuth() {
          return false;
        },
        async getApiKey() {
          return "legacy-key";
        },
      },
    };

    assert.deepEqual(await resolveModelAuth(ctx, model), {
      ok: true,
      apiKey: "legacy-key",
      headers: { authorization: "model-header" },
    });
  });

  it("returns a clear failure for unsupported registry APIs", async () => {
    const model = createModel();
    const auth = await resolveModelAuth({ modelRegistry: {} }, model);
    assert.equal(auth.ok, false);
    assert.match(auth.error, /getApiKeyAndHeaders or getApiKey/);
  });
});

describe("model reference resolution", () => {
  it("resolves exact provider/model and bare exact ids", () => {
    const sonnet = createModel();
    const haiku = createModel({ id: "claude-haiku-4", name: "Claude Haiku", label: "Haiku" });
    const ctx = createContext({ models: [sonnet, haiku] });

    assert.equal(resolveModelReference(ctx, "anthropic/claude-sonnet-4"), sonnet);
    assert.equal(resolveModelReference(ctx, "claude-haiku-4"), haiku);
  });

  it("orders ambiguous bare ids by prompt-template-model provider preference", async () => {
    const anthropic = createModel({ id: "claude-opus-4-6", provider: "anthropic" });
    const openrouter = createModel({ id: "claude-opus-4-6", provider: "openrouter" });
    const ctx = createContext({ models: [openrouter, anthropic] });

    const selected = await selectModelCandidate(["claude-opus-4-6"], undefined, ctx);
    assert.equal(selected.model, anthropic);
  });
});

describe("resolveSummarizerModel", () => {
  it("resolves the current session model with legacy host auth and latest thinking level", async () => {
    const model = createModel();
    const ctx = createContext({
      models: [model],
      registryOverrides: {
        getApiKeyAndHeaders: undefined,
        async getApiKey() {
          return "legacy-key";
        },
      },
    });

    const result = await resolveSummarizerModel(ctx, {
      config: { defaultPreset: "current", presets: {} },
      branchEntries: [
        { type: "thinking_level_change", thinkingLevel: "low" },
        { type: "thinking_level_change", thinkingLevel: "high" },
      ],
    });

    assert.equal(result.source, "current");
    assert.equal(result.model, model);
    assert.equal(result.apiKey, "legacy-key");
    assert.deepEqual(result.headers, { "x-model-header": "from-model" });
    assert.equal(result.reasoningLevel, "high");
  });

  it("resolves a configured default preset using prompt-template-model exact spec semantics", async () => {
    const sonnet = createModel();
    const haiku = createModel({ id: "claude-haiku-4", name: "Claude Haiku", label: "Haiku" });
    const ctx = createContext({ models: [sonnet, haiku] });

    const result = await resolveSummarizerModel(ctx, {
      config: {
        defaultPreset: "cheap",
        presets: {
          cheap: { model: "claude-haiku-4", thinkingLevel: "off" },
        },
      },
    });

    assert.equal(result.source, "preset");
    assert.equal(result.presetName, "cheap");
    assert.equal(result.model, haiku);
    assert.equal(result.reasoningLevel, undefined);
  });

  it("uses an explicit preset query over defaultPreset", async () => {
    const sonnet = createModel();
    const opus = createModel({ id: "claude-opus-4", name: "Claude Opus", label: "Opus" });
    const ctx = createContext({ models: [sonnet, opus] });

    const result = await resolveSummarizerModel(ctx, {
      presetQuery: "deep",
      config: {
        defaultPreset: "current",
        presets: {
          deep: { model: "anthropic/claude-opus-4", thinkingLevel: "medium" },
        },
      },
    });

    assert.equal(result.presetName, "deep");
    assert.equal(result.model, opus);
    assert.equal(result.reasoningLevel, "medium");
  });

  it("tries comma-separated preset model fallbacks in order and skips unavailable candidates", async () => {
    const unavailable = createModel({ id: "claude-haiku-4", name: "Claude Haiku" });
    const available = createModel({ id: "claude-sonnet-4", name: "Claude Sonnet" });
    const current = createModel({ id: "current-driver", name: "Current Driver" });
    const ctx = createContext({
      models: [unavailable, available, current],
      currentModel: current,
      registryOverrides: {
        getAvailable() {
          return [available];
        },
      },
    });

    const result = await resolveSummarizerModel(ctx, {
      presetQuery: "cheap",
      config: {
        presets: {
          cheap: { model: "anthropic/claude-haiku-4, anthropic/claude-sonnet-4" },
        },
      },
    });

    assert.equal(result.model, available);
  });

  it("rejects reasoning presets for models without reasoning support", async () => {
    const plain = createModel({ id: "gpt-plain", provider: "openai", reasoning: false });
    const ctx = createContext({ models: [plain], currentModel: plain });

    await assert.rejects(
      resolveSummarizerModel(ctx, {
        presetQuery: "fast",
        config: { presets: { fast: { model: "openai/gpt-plain", thinkingLevel: "high" } } },
      }),
      /does not support reasoning/,
    );
  });

  it("fails clearly when no current model exists", async () => {
    const ctx = createContext({ models: [createModel()] });
    ctx.model = undefined;

    await assert.rejects(
      resolveSummarizerModel(ctx, { config: { defaultPreset: "current", presets: {} } }),
      /No active session model/,
    );
  });
});

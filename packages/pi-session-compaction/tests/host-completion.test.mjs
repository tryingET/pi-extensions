import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { ModelRegistry } from "@earendil-works/pi-coding-agent";
import {
  completeWithHostModelRegistry,
  toHostCompletionOptions,
} from "../extensions/session-compaction/host-completion.js";

describe("host-owned completion adapter", () => {
  it("delegates through the real extension-facing ModelRegistry.complete contract", async () => {
    const model = { provider: "openai", id: "summary", api: "openai-responses", reasoning: true };
    const context = { messages: [] };
    const options = { reasoning: "high", maxTokens: 123 };
    const expected = { role: "assistant", content: [], stopReason: "stop" };
    let observed;
    const runtime = {
      async complete(actualModel, actualContext, actualOptions) {
        observed = { receiver: this, actualModel, actualContext, actualOptions };
        return expected;
      },
    };
    const registry = new ModelRegistry(runtime);

    assert.equal(typeof registry.complete, "function");
    assert.equal("completeSimple" in registry, false);

    const result = await completeWithHostModelRegistry(
      { modelRegistry: registry },
      model,
      context,
      options,
    );

    assert.equal(result, expected);
    assert.deepEqual(observed, {
      receiver: runtime,
      actualModel: model,
      actualContext: context,
      actualOptions: { reasoningEffort: "high", maxTokens: 123 },
    });
  });

  it("does not forward caller-owned authentication overrides", async () => {
    const model = { provider: "openai", id: "summary", api: "openai-responses", reasoning: true };
    const context = { messages: [] };
    const expected = { role: "assistant", content: [], stopReason: "stop" };
    let observed;
    const registry = {
      async complete(actualModel, actualContext, actualOptions) {
        observed = { receiver: this, actualModel, actualContext, actualOptions };
        return expected;
      },
    };

    const result = await completeWithHostModelRegistry(
      { modelRegistry: registry },
      model,
      context,
      {
        reasoning: "low",
        maxTokens: 123,
        apiKey: "caller-secret",
        headers: { authorization: "caller" },
        env: { TOKEN: "caller" },
        transformHeaders: () => ({ authorization: "transformed" }),
        fetch: () => {
          throw new Error("caller transport must not run");
        },
        transport: { name: "caller-transport" },
        onPayload: () => {},
      },
    );

    assert.equal(result, expected);
    assert.deepEqual(observed, {
      receiver: registry,
      actualModel: model,
      actualContext: context,
      actualOptions: { reasoningEffort: "low", maxTokens: 123 },
    });
  });

  it("maps normalized thinking to API-specific public completion options", () => {
    assert.throws(
      () =>
        toHostCompletionOptions(
          { api: "anthropic-messages", maxTokens: 32000, reasoning: true },
          { reasoning: "medium", maxTokens: 4096 },
        ),
      /context-aware thinking-budget translation/,
    );
    assert.deepEqual(
      toHostCompletionOptions(
        {
          api: "anthropic-messages",
          reasoning: true,
          compat: { forceAdaptiveThinking: true },
          thinkingLevelMap: { xhigh: "xhigh" },
        },
        { reasoning: "xhigh" },
      ),
      { thinkingEnabled: true, effort: "xhigh" },
    );
    assert.deepEqual(
      toHostCompletionOptions(
        { api: "google-generative-ai", id: "gemini-2.5-flash", reasoning: true },
        { reasoning: "low", maxTokens: 1000 },
      ),
      { maxTokens: 1000, thinking: { enabled: true, budgetTokens: 2048 } },
    );
    assert.deepEqual(
      toHostCompletionOptions(
        { api: "google-vertex", id: "gemini-2.5-flash-lite", reasoning: true },
        { reasoning: "minimal" },
      ),
      { thinking: { enabled: true, budgetTokens: 128 } },
    );
    assert.deepEqual(
      toHostCompletionOptions(
        { api: "google-generative-ai", id: "gemini-3.1-pro-preview", reasoning: true },
        { reasoning: "medium" },
      ),
      { thinking: { enabled: true, level: "HIGH" } },
    );
    assert.deepEqual(
      toHostCompletionOptions(
        {
          api: "openai-responses",
          reasoning: true,
          thinkingLevelMap: { minimal: null, low: null, medium: null },
        },
        { reasoning: "low" },
      ),
      { reasoningEffort: "high" },
    );
    assert.deepEqual(
      toHostCompletionOptions(
        {
          api: "bedrock-converse-stream",
          id: "anthropic.claude-sonnet-4-6-v1:0",
          reasoning: true,
        },
        { reasoning: "high", signal: undefined },
      ),
      { reasoning: "high" },
    );
    assert.throws(
      () =>
        toHostCompletionOptions(
          {
            api: "bedrock-converse-stream",
            id: "anthropic.claude-sonnet-4-5-v1:0",
            reasoning: true,
          },
          { reasoning: "high", maxTokens: 4096 },
        ),
      /context-aware thinking-budget translation for non-adaptive Claude models/,
    );
    assert.throws(
      () =>
        toHostCompletionOptions(
          { provider: "openai", id: "plain", api: "openai-responses", reasoning: false },
          { reasoning: "high", maxTokens: 1000 },
        ),
      /does not support requested thinking level/,
    );
    assert.deepEqual(
      toHostCompletionOptions(
        { api: "mistral-conversations", id: "prefix-mistral-small-2603", reasoning: true },
        { reasoning: "low" },
      ),
      { promptMode: "reasoning" },
    );
  });

  it("fails closed instead of silently ignoring unsupported thinking requests", () => {
    assert.throws(
      () => toHostCompletionOptions({ api: "custom-api", reasoning: true }, { reasoning: "low" }),
      /no verified normalized-thinking mapping/,
    );
    assert.throws(
      () =>
        toHostCompletionOptions(
          { api: "openai-responses", reasoning: true },
          { reasoning: "turbo" },
        ),
      /Unsupported normalized thinking level/,
    );
  });

  it("fails clearly when the host predates the public completion surface", async () => {
    await assert.rejects(
      completeWithHostModelRegistry({ modelRegistry: {} }, {}, { messages: [] }),
      /requires Pi >= 0\.84\.0/,
    );
  });
});

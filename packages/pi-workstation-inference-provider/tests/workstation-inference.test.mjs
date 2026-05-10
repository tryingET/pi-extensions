import assert from "node:assert/strict";
import test from "node:test";

import extension, {
  providerModel,
  resolveContractStatus,
  streamWorkstationInference,
} from "../extensions/workstation-inference.ts";

const CONTRACT_ENV = "PI_WORKSTATION_INFERENCE_CONTRACT";
const CONTRACT_JSON_ENV = "PI_WORKSTATION_INFERENCE_CONTRACT_JSON";

function withInlineContract(contract, fn) {
  const oldPath = process.env[CONTRACT_ENV];
  const oldJson = process.env[CONTRACT_JSON_ENV];
  delete process.env[CONTRACT_ENV];
  process.env[CONTRACT_JSON_ENV] = JSON.stringify(contract);
  return Promise.resolve()
    .then(fn)
    .finally(() => {
      if (oldPath === undefined) delete process.env[CONTRACT_ENV];
      else process.env[CONTRACT_ENV] = oldPath;
      if (oldJson === undefined) delete process.env[CONTRACT_JSON_ENV];
      else process.env[CONTRACT_JSON_ENV] = oldJson;
    });
}

function contract(overrides = {}) {
  return {
    schema_version: 1,
    authority: "workstation/lane-op",
    family: "baseline-text",
    surface: "canonical",
    generated_at: "2000-01-01T00:00:00Z",
    refresh_after_seconds: 1,
    provider_id: "workstation-inference",
    provider_name: "Workstation Inference",
    base_url: "http://127.0.0.1:1234/v1",
    health_url: "http://127.0.0.1:9/health",
    models: [
      {
        pi_model_id: "baseline-text-visible",
        name: "Visible",
        context_window: 32768,
        max_tokens: 16384,
        reasoning: false,
        thinking_format: "qwen-chat-template",
        thinking_level_map: { high: "enabled" },
        input: ["text"],
      },
    ],
    ...overrides,
  };
}

test("stale contracts warn but remain loadable so committed defaults do not disappear", async () => {
  await withInlineContract(contract({ health_url: undefined }), async () => {
    const status = await resolveContractStatus();
    assert.equal(status.status, "ok");
    assert.match(status.detail, /refresh_after_seconds=1/);
  });
});

test("providerModel strips thinking controls from visible non-reasoning aliases", () => {
  const model = providerModel(contract().models[0]);
  assert.equal(model.reasoning, false);
  assert.equal(model.thinkingLevelMap, undefined);
  assert.equal(model.compat, undefined);
});

test("status command registers provider after contract appears post-load", async () => {
  const oldPath = process.env[CONTRACT_ENV];
  const oldJson = process.env[CONTRACT_JSON_ENV];
  const oldFetch = globalThis.fetch;
  const oldEmptyKey = process.env.EMPTY_WORKSTATION_TEST_KEY;
  const commands = new Map();
  const providers = [];
  process.env[CONTRACT_ENV] = "/tmp/workstation-inference-provider-test-missing.json";
  delete process.env[CONTRACT_JSON_ENV];
  globalThis.fetch = async () => ({ ok: true, status: 200 });
  try {
    await extension({
      registerCommand(name, command) {
        commands.set(name, command);
      },
      registerProvider(name, config) {
        providers.push({ name, config });
      },
    });
    assert.equal(providers.length, 0);
    process.env.EMPTY_WORKSTATION_TEST_KEY = "";
    process.env[CONTRACT_JSON_ENV] = JSON.stringify(
      contract({
        generated_at: new Date().toISOString(),
        api_key_env: "EMPTY_WORKSTATION_TEST_KEY",
      }),
    );
    await commands.get("workstation-inference").handler("status", {
      hasUI: true,
      ui: { notify() {} },
    });
    assert.equal(providers.length, 1);
    assert.equal(providers[0].name, "workstation-inference");
    assert.equal(providers[0].config.apiKey, "workstation-local");
  } finally {
    globalThis.fetch = oldFetch;
    if (oldPath === undefined) delete process.env[CONTRACT_ENV];
    else process.env[CONTRACT_ENV] = oldPath;
    if (oldJson === undefined) delete process.env[CONTRACT_JSON_ENV];
    else process.env[CONTRACT_JSON_ENV] = oldJson;
    if (oldEmptyKey === undefined) delete process.env.EMPTY_WORKSTATION_TEST_KEY;
    else process.env.EMPTY_WORKSTATION_TEST_KEY = oldEmptyKey;
  }
});

test("streamWorkstationInference returns an error event when health is bad", async () => {
  await withInlineContract(contract(), async () => {
    const events = [];
    const stream = streamWorkstationInference(
      {
        id: "baseline-text-visible",
        name: "Visible",
        provider: "workstation-inference",
        api: "openai-completions",
        baseUrl: "http://127.0.0.1:1234/v1",
        reasoning: false,
        input: ["text"],
        contextWindow: 32768,
        maxTokens: 16384,
        cost: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0 },
      },
      { messages: [] },
      { apiKey: "workstation-local" },
    );
    for await (const event of stream) {
      events.push(event);
      break;
    }
    assert.equal(events[0].type, "error");
    assert.match(events[0].error.errorMessage, /not healthy|fetch failed|ECONNREFUSED/);
  });
});

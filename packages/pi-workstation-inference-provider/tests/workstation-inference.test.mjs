import assert from "node:assert/strict";
import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
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

test("default provider registration includes canary-only MTP models without env override", async () => {
  const oldPath = process.env[CONTRACT_ENV];
  const oldJson = process.env[CONTRACT_JSON_ENV];
  const oldRoot = process.env.PI_WORKSTATION_ROOT;
  const root = await mkdtemp(join(tmpdir(), "workstation-provider-"));
  const stateDir = join(root, "phasee", "state");
  const providers = [];
  try {
    await mkdir(stateDir, { recursive: true });
    await writeFile(
      join(stateDir, "workstation-inference-provider.json"),
      JSON.stringify(contract({ generated_at: new Date().toISOString() })),
    );
    await writeFile(
      join(stateDir, "workstation-inference-provider.canary.json"),
      JSON.stringify(
        contract({
          surface: "canary",
          base_url: "http://127.0.0.1:1334/v1",
          health_url: "http://127.0.0.1:1334/health",
          models: [
            ...contract().models,
            {
              pi_model_id: "baseline-text-mtp-visible",
              name: "MTP visible",
              context_window: 153600,
              max_tokens: 65536,
              reasoning: false,
              input: ["text"],
            },
          ],
        }),
      ),
    );
    delete process.env[CONTRACT_ENV];
    delete process.env[CONTRACT_JSON_ENV];
    process.env.PI_WORKSTATION_ROOT = root;

    await extension({
      registerCommand() {},
      registerProvider(name, config) {
        providers.push({ name, config });
      },
    });

    assert.equal(providers.length, 1);
    assert.equal(providers[0].config.api, "workstation-inference");
    assert.ok(providers[0].config.models.some((model) => model.id === "baseline-text-mtp-visible"));
  } finally {
    await rm(root, { recursive: true, force: true });
    if (oldPath === undefined) delete process.env[CONTRACT_ENV];
    else process.env[CONTRACT_ENV] = oldPath;
    if (oldJson === undefined) delete process.env[CONTRACT_JSON_ENV];
    else process.env[CONTRACT_JSON_ENV] = oldJson;
    if (oldRoot === undefined) delete process.env.PI_WORKSTATION_ROOT;
    else process.env.PI_WORKSTATION_ROOT = oldRoot;
  }
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

test("refresh command asks lane-op to rewrite canonical contract and registers provider", async () => {
  const oldPath = process.env[CONTRACT_ENV];
  const oldJson = process.env[CONTRACT_JSON_ENV];
  const oldRoot = process.env.PI_WORKSTATION_ROOT;
  const oldFetch = globalThis.fetch;
  const commands = new Map();
  const providers = [];
  const execCalls = [];
  process.env[CONTRACT_ENV] = "/tmp/workstation-inference-provider-test-missing.json";
  process.env.PI_WORKSTATION_ROOT = "/workstation";
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
      async exec(command, args, options) {
        execCalls.push({ command, args, options });
        process.env[CONTRACT_JSON_ENV] = JSON.stringify(
          contract({ generated_at: new Date().toISOString() }),
        );
        return { code: 0, stdout: '{"result":"ok"}', stderr: "", killed: false };
      },
    });

    await commands.get("workstation-inference").handler("refresh", {
      hasUI: true,
      ui: { notify() {} },
    });

    assert.equal(execCalls.length, 2);
    assert.equal(execCalls[0].command, "python3");
    assert.deepEqual(execCalls[0].args, [
      "scripts/phasee/lane-op.py",
      "provider-contract",
      "baseline-text",
      "--surface",
      "canonical",
      "--write",
    ]);
    assert.deepEqual(execCalls[1].args, [
      "scripts/phasee/lane-op.py",
      "provider-contract",
      "baseline-text",
      "--surface",
      "canary",
      "--write",
    ]);
    assert.equal(execCalls[0].options.cwd, "/workstation");
    assert.equal(execCalls[1].options.cwd, "/workstation");
    assert.equal(providers.length, 1);
  } finally {
    globalThis.fetch = oldFetch;
    if (oldPath === undefined) delete process.env[CONTRACT_ENV];
    else process.env[CONTRACT_ENV] = oldPath;
    if (oldJson === undefined) delete process.env[CONTRACT_JSON_ENV];
    else process.env[CONTRACT_JSON_ENV] = oldJson;
    if (oldRoot === undefined) delete process.env.PI_WORKSTATION_ROOT;
    else process.env.PI_WORKSTATION_ROOT = oldRoot;
  }
});

test("lane-status command delegates to lane-op read-only status", async () => {
  const commands = new Map();
  const execCalls = [];
  let notice = "";
  await extension({
    registerCommand(name, command) {
      commands.set(name, command);
    },
    registerProvider() {},
    async exec(command, args, options) {
      execCalls.push({ command, args, options });
      return { code: 0, stdout: '{"status":"ok"}', stderr: "", killed: false };
    },
  });

  await commands.get("workstation-inference").handler("lane-status", {
    hasUI: true,
    ui: {
      notify(message) {
        notice = message;
      },
    },
  });

  assert.equal(execCalls.length, 1);
  assert.deepEqual(execCalls[0].args, [
    "scripts/phasee/lane-op.py",
    "status",
    "baseline-text",
    "--surface",
    "canonical",
  ]);
  assert.equal(notice, '{"status":"ok"}');
});

test("streamWorkstationInference returns an error event when health is bad", async () => {
  await withInlineContract(contract(), async () => {
    const events = [];
    const stream = streamWorkstationInference(
      {
        id: "baseline-text-visible",
        name: "Visible",
        provider: "workstation-inference",
        api: "workstation-inference",
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

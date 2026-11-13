import assert from "node:assert/strict";
import test from "node:test";
import { normalizeContext } from "@earendil-works/pi-ai";
import installed from "../extensions/workstation-inference.ts";
import {
  clearWorkstationHealthCache,
  primeWorkstationHealth,
  __resetWorkstationInferenceCachesForTests as reset,
  workstationContractGenerationStatus,
} from "../extensions/workstation-inference-contract.ts";
import providerOnly from "../extensions/workstation-inference-provider-only.ts";

function legacy(port, route) {
  return {
    schema_version: 1,
    authority: "workstation/lane-op",
    provider_id: "workstation-inference",
    family: "legacy-text",
    surface: "canary",
    base_url: `http://127.0.0.1:${port}/v1`,
    health_url: `http://127.0.0.1:${port}/health`,
    models: [
      {
        pi_model_id: "legacy-coherent-canary",
        upstream_model: route,
        input: ["text"],
        reasoning: false,
        context_window: 8192,
        max_tokens: 512,
      },
    ],
  };
}
async function isolated(run) {
  const keys = [
    "PI_WORKSTATION_INFERENCE_CONTRACT_JSON",
    "PI_WORKSTATION_INFERENCE_CONTRACT",
    "PI_WORKSTATION_INFERENCE_CANARY_CONTRACT",
    "PI_WORKSTATION_INFERENCE_INKLING_CONTRACT",
  ];
  const oldEnv = Object.fromEntries(keys.map((key) => [key, process.env[key]]));
  const oldFetch = globalThis.fetch;
  const registrations = [],
    sends = [],
    commands = new Map();
  let healthEffect = () => {};
  const api = {
    on() {},
    unregisterProvider() {},
    registerProvider: (id, config) => registrations.push({ id, config }),
    registerCommand: (name, command) => commands.set(name, command),
  };
  const set = (c) => {
    process.env[keys[0]] = JSON.stringify(c);
  };
  globalThis.fetch = async (url, init) => {
    if (!init?.body) {
      await healthEffect();
      return Response.json({ status: "ok" });
    }
    sends.push({ url: String(url), body: JSON.parse(init.body) });
    return new Response(
      'data: {"id":"fixture","choices":[{"index":0,"delta":{"content":"ok"},"finish_reason":"stop"}]}\n\ndata: [DONE]\n\n',
      { headers: { "Content-Type": "text/event-stream" } },
    );
  };
  const invoke = (config) =>
    config
      .streamSimple(
        {
          ...config.models[0],
          api: config.api,
          provider: "workstation-inference",
          baseUrl: config.baseUrl,
        },
        normalizeContext({
          messages: [{ role: "user", content: "offline coherence", timestamp: 1 }],
        }),
        { maxRetries: 0 },
      )
      .result();
  for (const key of keys) delete process.env[key];
  reset();
  try {
    await run({
      api,
      set,
      registrations,
      sends,
      commands,
      invoke,
      onHealth: (callback) => {
        healthEffect = callback;
      },
    });
  } finally {
    reset();
    globalThis.fetch = oldFetch;
    for (const [key, value] of Object.entries(oldEnv)) {
      if (value === undefined) delete process.env[key];
      else process.env[key] = value;
    }
  }
}

test("installed status publishes one legacy registration/dispatch snapshot after health changes A to B", async () => {
  await isolated(async ({ api, set, registrations, sends, commands, invoke, onHealth }) => {
    set(legacy(1334, "route-A"));
    await installed(api);
    await primeWorkstationHealth();
    clearWorkstationHealthCache();
    onHealth(async () => {
      await Promise.resolve();
      set(legacy(1444, "route-B"));
    });
    await commands
      .get("workstation-inference")
      .handler("status", { hasUI: true, ui: { notify() {} } });
    const config = registrations.at(-1).config;
    assert.equal(config.baseUrl, "http://127.0.0.1:1444/v1");
    const result = await invoke(config);
    assert.equal(result.stopReason, "stop", result.errorMessage);
    assert.equal(sends.length, 1);
    assert.equal(sends[0].url, "http://127.0.0.1:1444/v1/chat/completions");
    assert.equal(sends[0].body.model, "route-B");
  });
});

test("provider-only final legacy snapshot is immediately usable when it differs from the initial cached read", async () => {
  await isolated(async ({ api, set, registrations, sends, invoke }) => {
    set(legacy(1334, "route-A"));
    const boot = providerOnly(api);
    // Observe completion of the real initial source load, not a mocked status result.
    for (let i = 0; i < 100 && !workstationContractGenerationStatus().initialized; i++)
      await Promise.resolve();
    assert.equal(workstationContractGenerationStatus().initialized, true);
    set(legacy(1444, "route-B"));
    await boot;
    assert.equal(registrations.length, 1);
    const config = registrations[0].config;
    assert.equal(config.baseUrl, "http://127.0.0.1:1444/v1");
    const result = await invoke(config);
    assert.equal(result.stopReason, "stop", result.errorMessage);
    assert.equal(sends.length, 1);
    assert.equal(sends[0].url, "http://127.0.0.1:1444/v1/chat/completions");
    assert.equal(sends[0].body.model, "route-B");
  });
});

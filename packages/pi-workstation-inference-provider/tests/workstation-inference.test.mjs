/**
summary: "Tests workstation contract loading, health caching and cancellation, provider registration, commands, and stream failures."
read_when:
  - "Changing workstation inference contracts, health behavior, provider models, lane-op integration, or stream error handling."
*/
import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { mkdir, mkdtemp, readFile, rm, symlink, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";
import {
  armAudio,
  clearArmedAudio,
  parseAudioSendArgs,
  readBoundedAudio,
  transformAudioPayload,
} from "../extensions/workstation-audio.ts";
import extension, {
  clearWorkstationHealthCache,
  providerModel,
  resolveContractStatus,
  streamWorkstationInference,
} from "../extensions/workstation-inference.ts";
import {
  clearSchedulerHandoff,
  completeSchedulerHandoff,
  consumeSchedulerHandoff,
  parseGovernedAudioSendArgs,
  quarantineSchedulerHandoff,
  readSchedulerHandoff,
} from "../extensions/workstation-scheduler.ts";

const CONTRACT_ENV = "PI_WORKSTATION_INFERENCE_CONTRACT";
const CONTRACT_JSON_ENV = "PI_WORKSTATION_INFERENCE_CONTRACT_JSON";

function withInlineContract(contract, fn) {
  const oldPath = process.env[CONTRACT_ENV];
  const oldJson = process.env[CONTRACT_JSON_ENV];
  delete process.env[CONTRACT_ENV];
  process.env[CONTRACT_JSON_ENV] = JSON.stringify(contract);
  clearWorkstationHealthCache();
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

function inklingContract(overrides = {}) {
  return contract({
    authority: "workstation/runtime-ownership-scheduler",
    family: "native-multimodal",
    surface: "canary",
    generated_at: new Date().toISOString(),
    base_url: "http://127.0.0.1:1364/v1",
    health_url: "http://127.0.0.1:1364/health",
    models: [
      {
        pi_model_id: "inkling-small-iq2m-canary",
        name: "Inkling",
        upstream_model: "thinkingmachines/Inkling-Small",
        context_window: 2048,
        max_tokens: 512,
        reasoning: false,
        input: ["text", "image"],
        native_input_modalities: ["text", "image", "audio"],
        audio_input: {
          request_format: "openai-chat-input-audio",
          formats: ["wav", "mp3", "flac"],
          max_bytes: 1024,
          max_encoded_bytes: 2048,
          transport: "inline-base64",
          authorization_mode: "external-scheduler-claim-required",
        },
      },
    ],
    ...overrides,
  });
}

function inklingModel() {
  return {
    id: "inkling-small-iq2m-canary",
    name: "Inkling",
    provider: "workstation-inference",
    api: "workstation-inference",
    baseUrl: "http://127.0.0.1:1364/v1",
    reasoning: false,
    input: ["text", "image"],
    contextWindow: 2048,
    maxTokens: 512,
    cost: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0 },
  };
}

function canonicalJson(value) {
  if (Array.isArray(value)) return `[${value.map(canonicalJson).join(",")}]`;
  if (value && typeof value === "object") {
    return `{${Object.keys(value)
      .sort()
      .map((key) => `${JSON.stringify(key)}:${canonicalJson(value[key])}`)
      .join(",")}}`;
  }
  return JSON.stringify(value);
}

function schedulerHandoffPayload(overrides = {}) {
  const payload = {
    schema_version: 1,
    kind: "ai-control-external-effect-claim-handoff",
    reservation_token: {
      reservation_id: "reservation-audio-test",
      generation: 1,
      plan_digest: "a".repeat(64),
      expires_at: new Date(Date.now() + 120_000).toISOString(),
      physical_store_id: "scheduler-store",
      deployment_id: "workstation-capability-graph",
      profile_id: "inkling-tts-canary",
      resource_request_digest: "b".repeat(64),
      graph_observation_digest: "c".repeat(64),
      claim_envelope_digest: "d".repeat(64),
      graph_step_ids: ["inkling-small:0"],
      ...overrides.reservation_token,
    },
    claim: {
      claim_generation: 1,
      consumer_id: "pi:audio-turn",
      attempt_nonce: "attempt-audio-test",
      operation_key: "pi:inkling-audio",
      effect_kind: "graph",
      graph_step_id: "inkling-small:0",
      provider_id: "workstation-inference",
      model_id: "inkling-small-iq2m-canary",
      claim_expires_at: new Date(Date.now() + 60_000).toISOString(),
      ...overrides.claim,
    },
    owner_authority: {
      profile_policy_store_id: "workstation-policy",
      profile_policy_revision: 1,
      lifecycle_store_id: "workstation-lifecycle",
      lifecycle_revision: 1,
      profile_config_digest: "e".repeat(64),
      lifecycle_profile_config_digest: "f".repeat(64),
    },
  };
  return {
    ...payload,
    handoff_digest: createHash("sha256").update(canonicalJson(payload)).digest("hex"),
  };
}

function schedulerConsumerResponse(handoff, action, phase) {
  if (action === "consume") {
    return {
      status:
        phase === "pre-effect" ? "external-effect-authorized" : "external-effect-postvalidated",
      phase,
      handoff_digest: handoff.handoff_digest,
      claim_generation: handoff.claim.claim_generation,
    };
  }
  if (action === "complete") {
    const knownResult = {
      schema_version: 1,
      kind: "pi-inkling-external-effect-result",
      handoff_digest: handoff.handoff_digest,
      provider_id: handoff.claim.provider_id,
      model_id: handoff.claim.model_id,
      attempt_nonce: handoff.claim.attempt_nonce,
      dispatch_count: 1,
      outcome: "known",
      stream_completed: true,
    };
    const resultDigest = createHash("sha256").update(canonicalJson(knownResult)).digest("hex");
    const completion = {
      reservation_id: handoff.reservation_token.reservation_id,
      reservation_generation: handoff.reservation_token.generation,
      claim_generation: handoff.claim.claim_generation,
      operation_key: handoff.claim.operation_key,
      graph_step_id: handoff.claim.graph_step_id,
      observation_id: `pi-inkling-result:${resultDigest.slice(0, 32)}`,
      result_digest: resultDigest,
    };
    return {
      status: "external-effect-completed",
      completion_token: {
        ...completion,
        token_digest: createHash("sha256").update(canonicalJson(completion)).digest("hex"),
      },
    };
  }
  return {
    status: "outcome-unknown",
    handoff_digest: handoff.handoff_digest,
    claim_generation: handoff.claim.claim_generation,
    automatic_retry_authorized: false,
    automatic_release_authorized: false,
    automatic_reconcile_authorized: false,
  };
}

test("stale contracts warn but remain loadable so committed defaults do not disappear", async () => {
  await withInlineContract(contract({ health_url: undefined }), async () => {
    const status = await resolveContractStatus();
    assert.equal(status.status, "ok");
    assert.match(status.detail, /refresh_after_seconds=1/);
  });
});

test("contracts fail closed on non-loopback endpoints or unknown authority", async () => {
  await withInlineContract(contract({ base_url: "https://example.com/v1" }), async () => {
    const status = await resolveContractStatus();
    assert.equal(status.status, "invalid");
    assert.match(status.detail, /loopback/);
  });
  await withInlineContract(contract({ authority: "caller-authored" }), async () => {
    const status = await resolveContractStatus();
    assert.equal(status.status, "invalid");
    assert.match(status.detail, /trusted workstation owner/);
  });
});

test("health checks use a bounded TTL cache and refresh after expiry", async () => {
  const oldFetch = globalThis.fetch;
  const oldTtl = process.env.PI_WORKSTATION_INFERENCE_HEALTH_CACHE_TTL_MS;
  let calls = 0;
  process.env.PI_WORKSTATION_INFERENCE_HEALTH_CACHE_TTL_MS = "50";
  globalThis.fetch = async () => {
    calls += 1;
    return { ok: true, status: 200 };
  };
  try {
    await withInlineContract(contract(), async () => {
      await resolveContractStatus({ checkHealth: true });
      await resolveContractStatus({ checkHealth: true });
      assert.equal(calls, 1);
      await new Promise((resolve) => setTimeout(resolve, 70));
      await resolveContractStatus({ checkHealth: true });
      assert.equal(calls, 2);
    });
  } finally {
    globalThis.fetch = oldFetch;
    if (oldTtl === undefined) delete process.env.PI_WORKSTATION_INFERENCE_HEALTH_CACHE_TTL_MS;
    else process.env.PI_WORKSTATION_INFERENCE_HEALTH_CACHE_TTL_MS = oldTtl;
  }
});

test("caller cancellation aborts an in-flight health check before its timeout", async () => {
  const oldFetch = globalThis.fetch;
  globalThis.fetch = (_url, init) =>
    new Promise((_resolve, reject) => {
      if (init.signal.aborted) {
        reject(init.signal.reason);
        return;
      }
      init.signal.addEventListener("abort", () => reject(init.signal.reason), { once: true });
    });
  try {
    await withInlineContract(contract(), async () => {
      const controller = new AbortController();
      const pending = resolveContractStatus({ checkHealth: true, signal: controller.signal });
      controller.abort(new Error("operator cancelled"));
      const status = await pending;
      assert.equal(status.status, "unhealthy");
      assert.match(status.detail, /cancelled by caller/);
    });
  } finally {
    globalThis.fetch = oldFetch;
  }
});

test("providerModel strips thinking controls from visible non-reasoning aliases", () => {
  const model = providerModel(contract().models[0]);
  assert.equal(model.reasoning, false);
  assert.equal(model.thinkingLevelMap, undefined);
  assert.equal(model.compat, undefined);
});

test("default provider registration merges baseline and distinct Inkling canary models", async () => {
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
    await writeFile(
      join(stateDir, "workstation-inference-provider.inkling-canary.json"),
      JSON.stringify(inklingContract()),
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
    assert.ok(providers[0].config.models.some((model) => model.id === "inkling-small-iq2m-canary"));
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

test("refresh keeps baseline usable when optional Inkling export is unavailable", async () => {
  const oldPath = process.env[CONTRACT_ENV];
  const oldJson = process.env[CONTRACT_JSON_ENV];
  const oldRoot = process.env.PI_WORKSTATION_ROOT;
  const oldFetch = globalThis.fetch;
  const commands = new Map();
  const providers = [];
  const execCalls = [];
  let notice = "";
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
        return args.includes("inkling")
          ? { code: 1, stdout: "", stderr: "Inkling exporter unavailable", killed: false }
          : { code: 0, stdout: '{"result":"ok"}', stderr: "", killed: false };
      },
    });

    await commands.get("workstation-inference").handler("refresh", {
      hasUI: true,
      ui: {
        notify(message) {
          notice = message;
        },
      },
    });

    assert.equal(execCalls.length, 3);
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
    assert.deepEqual(execCalls[2].args, [
      "scripts/phasee/lane-op.py",
      "provider-contract",
      "inkling",
      "--surface",
      "canary",
      "--write",
    ]);
    assert.equal(execCalls[0].options.cwd, "/workstation");
    assert.equal(execCalls[1].options.cwd, "/workstation");
    assert.equal(execCalls[2].options.cwd, "/workstation");
    assert.equal(providers.length, 1);
    assert.match(notice, /optional Inkling refresh unavailable/);
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

test("governed audio args and handoff bind one exact Inkling claim", async () => {
  const root = await mkdtemp(join(tmpdir(), "workstation-handoff-"));
  const handoffPath = join(root, "handoff.json");
  const schedulerDb = join(root, "scheduler.sqlite3");
  const linked = join(root, "linked.json");
  let handoff;
  try {
    const parsed = parseGovernedAudioSendArgs(
      `--handoff ${handoffPath} --scheduler-db=${schedulerDb} "/audio/class question.wav" -- Explain this`,
      root,
    );
    assert.equal(parsed.path, "/audio/class question.wav");
    assert.equal(parsed.prompt, "Explain this");
    assert.equal(parsed.handoffPath, handoffPath);
    assert.equal(parsed.schedulerDb, schedulerDb);

    const payload = schedulerHandoffPayload();
    await writeFile(handoffPath, JSON.stringify(payload));
    handoff = await readSchedulerHandoff(
      handoffPath,
      schedulerDb,
      "workstation-inference",
      "inkling-small-iq2m-canary",
    );
    assert.equal(handoff.handoffDigest, payload.handoff_digest);
    assert.equal(handoff.attemptNonce, "attempt-audio-test");
    assert.notEqual(handoff.handoffPath, handoffPath);
    assert.equal(
      JSON.parse(await readFile(handoff.handoffPath, "utf8")).handoff_digest,
      payload.handoff_digest,
    );
    await symlink(handoffPath, linked);
    await assert.rejects(
      readSchedulerHandoff(
        linked,
        schedulerDb,
        "workstation-inference",
        "inkling-small-iq2m-canary",
      ),
      /ELOOP|symbolic link/i,
    );
    await writeFile(handoffPath, JSON.stringify({ ...payload, handoff_digest: "0".repeat(64) }));
    await assert.rejects(
      readSchedulerHandoff(
        handoffPath,
        schedulerDb,
        "workstation-inference",
        "inkling-small-iq2m-canary",
      ),
      /digest is invalid/,
    );
    await writeFile(
      handoffPath,
      JSON.stringify(schedulerHandoffPayload({ claim: { consumer_id: "another-consumer" } })),
    );
    await assert.rejects(
      readSchedulerHandoff(
        handoffPath,
        schedulerDb,
        "workstation-inference",
        "inkling-small-iq2m-canary",
      ),
      /selected Inkling model/,
    );
  } finally {
    if (handoff) await clearSchedulerHandoff(handoff);
    await rm(root, { recursive: true, force: true });
  }
});

test("scheduler consumer invokes only pre/post/complete/quarantine surfaces", async () => {
  const root = await mkdtemp(join(tmpdir(), "workstation-scheduler-consumer-"));
  const handoffPath = join(root, "handoff.json");
  const schedulerDb = join(root, "scheduler.sqlite3");
  const payload = schedulerHandoffPayload();
  const calls = [];
  try {
    await writeFile(handoffPath, JSON.stringify(payload));
    const handoff = await readSchedulerHandoff(
      handoffPath,
      schedulerDb,
      "workstation-inference",
      "inkling-small-iq2m-canary",
    );
    const pi = {
      async exec(command, args) {
        calls.push({ command, args });
        const action = args[args.indexOf("external-effect") + 1];
        if (action === "consume") {
          const phase = args[args.indexOf("--phase") + 1];
          return {
            code: 0,
            stdout: JSON.stringify(schedulerConsumerResponse(payload, action, phase)),
            stderr: "",
            killed: false,
          };
        }
        if (action === "complete") {
          const resultPath = args[args.indexOf("--result") + 1];
          const result = JSON.parse(await readFile(resultPath, "utf8"));
          assert.deepEqual(result, {
            schema_version: 1,
            kind: "pi-inkling-external-effect-result",
            handoff_digest: payload.handoff_digest,
            provider_id: "workstation-inference",
            model_id: "inkling-small-iq2m-canary",
            attempt_nonce: "attempt-audio-test",
            dispatch_count: 1,
            outcome: "known",
            stream_completed: true,
          });
          return {
            code: 0,
            stdout: JSON.stringify(schedulerConsumerResponse(payload, action)),
            stderr: "",
            killed: false,
          };
        }
        return {
          code: 3,
          stdout: JSON.stringify(schedulerConsumerResponse(payload, action)),
          stderr: "",
          killed: false,
        };
      },
    };
    await consumeSchedulerHandoff(pi, handoff, "pre-effect");
    await consumeSchedulerHandoff(pi, handoff, "post-effect");
    await completeSchedulerHandoff(pi, handoff);
    await quarantineSchedulerHandoff(pi, handoff, "test-unknown");
    await clearSchedulerHandoff(handoff);
    assert.equal(calls.length, 4);
    assert.ok(calls.every((call) => call.command === "uv"));
    assert.ok(calls.every((call) => call.args.includes("external-effect")));
    assert.ok(
      calls.every((call) => {
        const index = call.args.indexOf("--handoff");
        return index >= 0 && call.args[index + 1] === handoff.handoffPath;
      }),
    );
    assert.notEqual(handoff.handoffPath, handoffPath);
    assert.ok(
      calls.every(
        (call) =>
          !call.args.includes("external-claim") &&
          !call.args.includes("release") &&
          !call.args.includes("reconcile"),
      ),
    );
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test("audio file guard rejects symlinks, bad magic, and encoded oversize", async () => {
  const root = await mkdtemp(join(tmpdir(), "workstation-audio-"));
  const valid = join(root, "valid.wav");
  const linked = join(root, "linked.wav");
  const bad = join(root, "bad.wav");
  const bytes = Buffer.from("RIFF0000WAVE", "ascii");
  const policy = inklingContract().models[0].audio_input;
  try {
    await writeFile(valid, bytes);
    await symlink(valid, linked);
    await writeFile(bad, Buffer.from("not audio"));
    await assert.rejects(readBoundedAudio(linked, root, policy), /ELOOP|symbolic link/i);
    await assert.rejects(readBoundedAudio(bad, root, policy), /do not match/);
    await assert.rejects(
      readBoundedAudio(valid, root, { ...policy, max_encoded_bytes: 8 }),
      /max_encoded_bytes=8/,
    );
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test("audio payload transformation is exact and rejects model or marker drift", () => {
  const parsed = parseAudioSendArgs('"/tmp/class question.wav" -- What is the pupil asking?');
  assert.equal(parsed.path, "/tmp/class question.wav");
  assert.equal(parsed.prompt, "What is the pupil asking?");
  const attachment = armAudio({
    providerId: "workstation-inference",
    modelId: "inkling-small-iq2m-canary",
    payloadModel: "thinkingmachines/Inkling-Small",
    format: "wav",
    data: Buffer.from("RIFF0000WAVE", "ascii"),
  });
  try {
    const transformed = transformAudioPayload(
      {
        model: "thinkingmachines/Inkling-Small",
        messages: [{ role: "user", content: `${attachment.marker}\nExplain this.` }],
        inherited_hook: true,
      },
      attachment,
    );
    assert.equal(transformed.inherited_hook, true);
    assert.equal(transformed.messages[0].content[0].text, "Explain this.");
    assert.equal(transformed.messages[0].content[1].type, "input_audio");
    assert.equal(transformed.messages[0].content[1].input_audio.format, "wav");
    assert.throws(
      () => transformAudioPayload({ model: "wrong", messages: [] }, attachment),
      /model drifted/,
    );
    assert.throws(
      () =>
        transformAudioPayload(
          {
            model: "thinkingmachines/Inkling-Small",
            messages: [{ role: "user", content: attachment.marker }],
            tools: [{ type: "function" }],
          },
          attachment,
        ),
      /must not contain tools/,
    );
    assert.throws(
      () =>
        transformAudioPayload(
          {
            model: "thinkingmachines/Inkling-Small",
            messages: [
              {
                role: "user",
                content: [
                  { type: "text", text: attachment.marker },
                  { type: "input_audio", input_audio: { data: "extra", format: "wav" } },
                ],
              },
            ],
          },
          attachment,
        ),
      /already contains input_audio/,
    );
    attachment.expiresAt = Date.now() - 1;
    assert.throws(
      () =>
        transformAudioPayload(
          {
            model: "thinkingmachines/Inkling-Small",
            messages: [{ role: "user", content: attachment.marker }],
          },
          attachment,
        ),
      /expired before dispatch/,
    );
  } finally {
    clearArmedAudio(attachment);
  }
});

test("audio-send consumes one external claim and completes one streamed dispatch", async () => {
  const oldFetch = globalThis.fetch;
  const root = await mkdtemp(join(tmpdir(), "workstation-audio-e2e-"));
  const audioPath = join(root, "question.wav");
  const handoffPath = join(root, "handoff.json");
  const schedulerDb = join(root, "scheduler.sqlite3");
  const commands = new Map();
  const providers = [];
  const schedulerActions = [];
  const handoffPayload = schedulerHandoffPayload();
  let sent = "";
  let notice = "";
  let providerPosts = 0;
  globalThis.fetch = async (_url, init = {}) => {
    if (init.method === "POST") {
      providerPosts += 1;
      const body = [
        'data: {"id":"audio-1","object":"chat.completion.chunk","created":1,"model":"thinkingmachines/Inkling-Small","choices":[{"index":0,"delta":{"role":"assistant","content":"heard"},"finish_reason":null}]}',
        'data: {"id":"audio-1","object":"chat.completion.chunk","created":1,"model":"thinkingmachines/Inkling-Small","choices":[{"index":0,"delta":{},"finish_reason":"stop"}],"usage":{"prompt_tokens":1,"completion_tokens":1,"total_tokens":2}}',
        "data: [DONE]",
        "",
      ].join("\n\n");
      return new Response(body, {
        status: 200,
        headers: { "content-type": "text/event-stream" },
      });
    }
    return { ok: true, status: 200 };
  };
  try {
    await writeFile(audioPath, Buffer.from("RIFF0000WAVE", "ascii"));
    await writeFile(handoffPath, JSON.stringify(handoffPayload));
    clearWorkstationHealthCache();
    await withInlineContract(inklingContract(), async () => {
      const pi = {
        on() {},
        registerCommand(name, command) {
          commands.set(name, command);
        },
        registerProvider(name, config) {
          providers.push({ name, config });
        },
        sendUserMessage(message) {
          sent = message;
        },
        async exec(_command, args) {
          const action = args[args.indexOf("external-effect") + 1];
          schedulerActions.push(action === "consume" ? args[args.indexOf("--phase") + 1] : action);
          const phase = action === "consume" ? args[args.indexOf("--phase") + 1] : undefined;
          return {
            code: 0,
            stdout: JSON.stringify(schedulerConsumerResponse(handoffPayload, action, phase)),
            stderr: "",
            killed: false,
          };
        },
      };
      await extension(pi);
      await commands
        .get("workstation-inference")
        .handler(
          `audio-send --handoff ${handoffPath} --scheduler-db ${schedulerDb} ${audioPath} -- Explain`,
          {
            cwd: root,
            model: inklingModel(),
            signal: undefined,
            isIdle: () => true,
            hasUI: true,
            ui: {
              notify(message) {
                notice = message;
              },
            },
          },
        );
      assert.match(sent, /\[pi-workstation-audio:v1:/);
      assert.match(notice, /one provider dispatch/);
      assert.deepEqual(schedulerActions, ["pre-effect"]);
      const stream = providers[0].config.streamSimple(
        inklingModel(),
        { messages: [{ role: "user", content: sent }] },
        { apiKey: "workstation-local" },
      );
      const events = [];
      for await (const event of stream) events.push(event);
      assert.ok(events.some((event) => event.type === "text_delta"));
      assert.equal(providerPosts, 1);
      assert.deepEqual(schedulerActions, ["pre-effect", "post-effect", "complete"]);
    });
  } finally {
    globalThis.fetch = oldFetch;
    await rm(root, { recursive: true, force: true });
  }
});

test("retryable audio provider failure dispatches once and quarantines without retry", async () => {
  const oldFetch = globalThis.fetch;
  const root = await mkdtemp(join(tmpdir(), "workstation-audio-error-"));
  const audioPath = join(root, "question.wav");
  const handoffPath = join(root, "handoff.json");
  const schedulerDb = join(root, "scheduler.sqlite3");
  const commands = new Map();
  const providers = [];
  const schedulerActions = [];
  const handoffPayload = schedulerHandoffPayload();
  let sent = "";
  let providerPosts = 0;
  globalThis.fetch = async (_url, init = {}) => {
    if (init.method === "POST") {
      providerPosts += 1;
      return new Response("retryable provider failure", { status: 503 });
    }
    return { ok: true, status: 200 };
  };
  try {
    await writeFile(audioPath, Buffer.from("RIFF0000WAVE", "ascii"));
    await writeFile(handoffPath, JSON.stringify(handoffPayload));
    clearWorkstationHealthCache();
    await withInlineContract(inklingContract(), async () => {
      const pi = {
        on() {},
        registerCommand(name, command) {
          commands.set(name, command);
        },
        registerProvider(name, config) {
          providers.push({ name, config });
        },
        sendUserMessage(message) {
          sent = message;
        },
        async exec(_command, args) {
          const action = args[args.indexOf("external-effect") + 1];
          schedulerActions.push(action === "consume" ? args[args.indexOf("--phase") + 1] : action);
          const phase = action === "consume" ? args[args.indexOf("--phase") + 1] : undefined;
          return {
            code: action === "quarantine" ? 3 : 0,
            stdout: JSON.stringify(schedulerConsumerResponse(handoffPayload, action, phase)),
            stderr: "",
            killed: false,
          };
        },
      };
      await extension(pi);
      await commands
        .get("workstation-inference")
        .handler(
          `audio-send --handoff ${handoffPath} --scheduler-db ${schedulerDb} ${audioPath} -- Explain`,
          {
            cwd: root,
            model: inklingModel(),
            signal: undefined,
            isIdle: () => true,
            hasUI: false,
          },
        );
      const stream = providers[0].config.streamSimple(
        inklingModel(),
        { messages: [{ role: "user", content: sent }] },
        { apiKey: "workstation-local" },
      );
      const events = [];
      for await (const event of stream) events.push(event);
      assert.equal(providerPosts, 1);
      assert.deepEqual(schedulerActions, ["pre-effect", "quarantine"]);
      assert.ok(events.some((event) => event.type === "error"));
      assert.ok(
        events.some(
          (event) =>
            event.type === "error" && /Automatic retry is disabled/.test(event.error.errorMessage),
        ),
      );
    });
  } finally {
    globalThis.fetch = oldFetch;
    await rm(root, { recursive: true, force: true });
  }
});

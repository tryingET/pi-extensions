import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";
import {
  armAudio,
  clearArmedAudio,
  transformAudioPayload,
} from "../extensions/workstation-audio.ts";
import extension, { clearWorkstationHealthCache } from "../extensions/workstation-inference.ts";

test("audio payload binds the latest user marker and base64-encodes once", () => {
  const data = Buffer.from("RIFF0000WAVE", "ascii");
  const originalToString = data.toString.bind(data);
  let base64Encodes = 0;
  Object.defineProperty(data, "toString", {
    value(encoding, ...args) {
      if (encoding === "base64") base64Encodes += 1;
      return originalToString(encoding, ...args);
    },
  });
  const attachment = armAudio({
    providerId: "workstation-inference",
    modelId: "inkling-small-iq2m-canary",
    payloadModel: "thinkingmachines/Inkling-Small",
    format: "wav",
    data,
  });
  try {
    const transformed = transformAudioPayload(
      {
        model: attachment.payloadModel,
        messages: [
          { role: "user", content: "Earlier context." },
          { role: "assistant", content: "Earlier response." },
          { role: "user", content: `${attachment.marker}\nExplain this.` },
        ],
      },
      attachment,
    );
    assert.equal(transformed.messages[0].content, "Earlier context.");
    assert.equal(transformed.messages[2].content[1].type, "input_audio");
    assert.equal(base64Encodes, 1);

    assert.throws(
      () =>
        transformAudioPayload(
          {
            model: attachment.payloadModel,
            messages: [
              { role: "user", content: `${attachment.marker}\nOlder marked turn.` },
              { role: "assistant", content: "Intervening response." },
              { role: "user", content: "Newer markerless turn." },
            ],
          },
          attachment,
        ),
      /latest user message/,
    );
    assert.equal(base64Encodes, 1);
  } finally {
    clearArmedAudio(attachment);
  }
});

test("ordinary Inkling requests are denied before health or provider network effects", async () => {
  const originalFetch = globalThis.fetch;
  const oldInline = process.env.PI_WORKSTATION_INFERENCE_CONTRACT_JSON;
  const oldPath = process.env.PI_WORKSTATION_INFERENCE_CONTRACT;
  const providers = [];
  let fetchCalls = 0;
  globalThis.fetch = async () => {
    fetchCalls += 1;
    throw new Error("network should not be reached");
  };
  try {
    delete process.env.PI_WORKSTATION_INFERENCE_CONTRACT;
    process.env.PI_WORKSTATION_INFERENCE_CONTRACT_JSON = JSON.stringify(contract());
    clearWorkstationHealthCache();
    await extension({
      on() {},
      registerCommand() {},
      registerProvider(_name, provider) {
        providers.push(provider);
      },
    });
    const events = [];
    const stream = providers[0].streamSimple(
      model(),
      { messages: [] },
      { apiKey: "workstation-local" },
    );
    for await (const event of stream) events.push(event);
    assert.equal(events.length, 1);
    assert.equal(events[0].type, "error");
    assert.match(events[0].error.errorMessage, /exact external scheduler claim/);
    assert.equal(fetchCalls, 0);
  } finally {
    globalThis.fetch = originalFetch;
    if (oldInline === undefined) delete process.env.PI_WORKSTATION_INFERENCE_CONTRACT_JSON;
    else process.env.PI_WORKSTATION_INFERENCE_CONTRACT_JSON = oldInline;
    if (oldPath === undefined) delete process.env.PI_WORKSTATION_INFERENCE_CONTRACT;
    else process.env.PI_WORKSTATION_INFERENCE_CONTRACT = oldPath;
  }
});

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

function handoffPayload(expiresInMs = 60_000) {
  const payload = {
    schema_version: 1,
    kind: "ai-control-external-effect-claim-handoff",
    reservation_token: {
      reservation_id: "reservation-adversarial",
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
    },
    claim: {
      claim_generation: 1,
      consumer_id: "pi:audio-turn",
      attempt_nonce: "attempt-adversarial",
      operation_key: "pi:inkling-audio",
      effect_kind: "graph",
      graph_step_id: "inkling-small:0",
      provider_id: "workstation-inference",
      model_id: "inkling-small-iq2m-canary",
      claim_expires_at: new Date(Date.now() + expiresInMs).toISOString(),
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

function contract() {
  return {
    schema_version: 1,
    authority: "workstation/runtime-ownership-scheduler",
    family: "native-multimodal",
    surface: "canary",
    generated_at: new Date().toISOString(),
    refresh_after_seconds: 300,
    provider_id: "workstation-inference",
    provider_name: "Workstation Inference",
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
          formats: ["wav"],
          max_bytes: 1024,
          max_encoded_bytes: 2048,
          transport: "inline-base64",
          authorization_mode: "external-scheduler-claim-required",
        },
      },
    ],
  };
}

function model() {
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

function schedulerResponse(handoff, action, phase) {
  if (action === "consume") {
    return {
      status:
        phase === "pre-effect" ? "external-effect-authorized" : "external-effect-postvalidated",
      phase,
      handoff_digest: handoff.handoff_digest,
      claim_generation: 1,
    };
  }
  if (action === "complete") {
    const knownResult = {
      schema_version: 1,
      kind: "pi-inkling-external-effect-result",
      handoff_digest: handoff.handoff_digest,
      provider_id: "workstation-inference",
      model_id: "inkling-small-iq2m-canary",
      attempt_nonce: "attempt-adversarial",
      dispatch_count: 1,
      outcome: "known",
      stream_completed: true,
    };
    const resultDigest = createHash("sha256").update(canonicalJson(knownResult)).digest("hex");
    const completion = {
      reservation_id: handoff.reservation_token.reservation_id,
      reservation_generation: 1,
      claim_generation: 1,
      operation_key: "pi:inkling-audio",
      graph_step_id: "inkling-small:0",
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
    claim_generation: 1,
    automatic_retry_authorized: false,
    automatic_release_authorized: false,
    automatic_reconcile_authorized: false,
  };
}

async function runCase({
  markerRemoved = false,
  latestMarkerless = false,
  lifecycleEvent,
  preEffectResponseLost = false,
  completionResponseLost = false,
}) {
  const oldFetch = globalThis.fetch;
  const oldInline = process.env.PI_WORKSTATION_INFERENCE_CONTRACT_JSON;
  const oldPath = process.env.PI_WORKSTATION_INFERENCE_CONTRACT;
  const root = await mkdtemp(join(tmpdir(), "workstation-audio-adversarial-"));
  const audioPath = join(root, "question.wav");
  const handoffPath = join(root, "handoff.json");
  const schedulerDb = join(root, "scheduler.sqlite3");
  const handoff = handoffPayload();
  const commands = new Map();
  const providers = [];
  const handlers = new Map();
  const actions = [];
  let sent = "";
  let providerPosts = 0;
  try {
    await writeFile(audioPath, Buffer.from("RIFF0000WAVE", "ascii"));
    await writeFile(handoffPath, JSON.stringify(handoff));
    delete process.env.PI_WORKSTATION_INFERENCE_CONTRACT;
    process.env.PI_WORKSTATION_INFERENCE_CONTRACT_JSON = JSON.stringify(contract());
    clearWorkstationHealthCache();
    globalThis.fetch = async (_url, init = {}) => {
      if (init.method === "POST") {
        providerPosts += 1;
        const body = [
          'data: {"id":"audio","object":"chat.completion.chunk","created":1,"model":"thinkingmachines/Inkling-Small","choices":[{"index":0,"delta":{"role":"assistant","content":"ok"},"finish_reason":null}]}',
          'data: {"id":"audio","object":"chat.completion.chunk","created":1,"model":"thinkingmachines/Inkling-Small","choices":[{"index":0,"delta":{},"finish_reason":"stop"}]}',
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
    const pi = {
      on(name, handler) {
        handlers.set(name, handler);
      },
      registerCommand(name, command) {
        commands.set(name, command);
      },
      registerProvider(_name, provider) {
        providers.push(provider);
      },
      sendUserMessage(message) {
        sent = message;
      },
      async exec(_command, args) {
        const action = args[args.indexOf("external-effect") + 1];
        const phase = action === "consume" ? args[args.indexOf("--phase") + 1] : undefined;
        actions.push(action === "consume" ? phase : action);
        if (preEffectResponseLost && phase === "pre-effect") {
          return { code: 1, stdout: "", stderr: "503 timeout terminated", killed: true };
        }
        if (completionResponseLost && action === "complete") {
          return { code: 1, stdout: "", stderr: "503 timeout terminated", killed: true };
        }
        return {
          code: action === "quarantine" ? 3 : 0,
          stdout: JSON.stringify(schedulerResponse(handoff, action, phase)),
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
        { cwd: root, model: model(), isIdle: () => true, hasUI: false },
      );
    if (lifecycleEvent) await handlers.get(lifecycleEvent)();
    if (!sent) return { actions, events: [], providerPosts };
    const content = markerRemoved
      ? "[pi-workstation-audio:v1:00000000-0000-0000-0000-000000000000]\nsubstituted"
      : sent;
    const events = [];
    const messages = latestMarkerless
      ? [
          { role: "user", content },
          { role: "assistant", content: "Intervening response." },
          { role: "user", content: "Newer markerless turn." },
        ]
      : [{ role: "user", content }];
    const stream = providers[0].streamSimple(
      model(),
      { messages },
      { apiKey: "workstation-local" },
    );
    for await (const event of stream) events.push(event);
    return { actions, events, providerPosts };
  } finally {
    globalThis.fetch = oldFetch;
    if (oldInline === undefined) delete process.env.PI_WORKSTATION_INFERENCE_CONTRACT_JSON;
    else process.env.PI_WORKSTATION_INFERENCE_CONTRACT_JSON = oldInline;
    if (oldPath === undefined) delete process.env.PI_WORKSTATION_INFERENCE_CONTRACT;
    else process.env.PI_WORKSTATION_INFERENCE_CONTRACT = oldPath;
    await rm(root, { recursive: true, force: true });
  }
}

test("pre-effect response loss quarantines the possibly consumed claim without dispatch", async () => {
  const result = await runCase({ preEffectResponseLost: true });
  assert.equal(result.providerPosts, 0);
  assert.deepEqual(result.actions, ["pre-effect", "quarantine"]);
});

test("substituted audio marker quarantines the pending claim before any provider POST", async () => {
  const result = await runCase({ markerRemoved: true });
  assert.equal(result.providerPosts, 0);
  assert.deepEqual(result.actions, ["pre-effect", "quarantine"]);
  assert.ok(result.events.some((event) => event.type === "error"));
});

test("newer markerless user turn quarantines instead of attaching audio to older context", async () => {
  const result = await runCase({ latestMarkerless: true });
  assert.equal(result.providerPosts, 0);
  assert.deepEqual(result.actions, ["pre-effect", "quarantine"]);
  assert.ok(result.events.some((event) => event.type === "error"));
});

test("session shutdown quarantines a pre-consumed attachment and blocks later POST", async () => {
  const result = await runCase({ lifecycleEvent: "session_shutdown" });
  assert.equal(result.providerPosts, 0);
  assert.deepEqual(result.actions, ["pre-effect", "quarantine"]);
});

test("completion response loss is terminal, sanitized, and never quarantined or retried", async () => {
  const result = await runCase({ completionResponseLost: true });
  assert.equal(result.providerPosts, 1);
  assert.deepEqual(result.actions, ["pre-effect", "post-effect", "complete"]);
  const error = result.events.find((event) => event.type === "error");
  assert.ok(error);
  assert.equal(
    error.error.errorMessage,
    "Inkling audio dispatch outcome is unknown. Automatic retry is disabled; explicit workstation owner/scheduler disposition is required.",
  );
  assert.doesNotMatch(error.error.errorMessage, /503|timeout|terminated|service.?unavailable/i);
});

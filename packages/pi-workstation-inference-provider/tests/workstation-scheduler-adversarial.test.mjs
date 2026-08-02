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
import {
  DISPATCH_PERMIT_MAX_AGE_MS,
  decodeWorkbenchAuthorityPacket,
  deriveDispatchPermitId,
  verifyWorkbenchAuthoritySchemaDigest,
  WORKBENCH_AUTHORITY_SCHEMA,
  WORKBENCH_AUTHORITY_SCHEMA_DIGEST,
  WORKBENCH_BROKER_SCHEMA_DIGEST,
  WorkbenchInheritedAuthorityChannel,
} from "../extensions/workstation-authority-channel.ts";
import extension, { clearWorkstationHealthCache } from "../extensions/workstation-inference.ts";
import { readSchedulerHandoff } from "../extensions/workstation-scheduler.ts";

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

function handoffPayload(expiresInMs = 60_000, profileId = "inkling-tts-canary") {
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
      profile_id: profileId,
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

test("legacy scheduler handoff rejects the Workbench profile before old completion authority", async () => {
  const root = await mkdtemp(join(tmpdir(), "workbench-handoff-profile-"));
  const path = join(root, "handoff.json");
  try {
    await writeFile(path, JSON.stringify(handoffPayload(60_000, "workbench-inkling-canary")));
    await assert.rejects(
      readSchedulerHandoff(
        path,
        join(root, "scheduler.sqlite3"),
        "workstation-inference",
        "inkling-small-iq2m-canary",
      ),
      /does not bind the selected Inkling model/,
    );
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

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
    "Inkling audio dispatch outcome is unknown. Automatic retry is disabled; explicit broker/owner disposition is required.",
  );
  assert.doesNotMatch(error.error.errorMessage, /503|timeout|terminated|service.?unavailable/i);
});

function channelBinding() {
  return {
    protocol: "workbench-inkling-broker/v1",
    session_id: "1".repeat(32),
    turn_id: "2".repeat(32),
    attempt_nonce: "3".repeat(32),
    claim_generation: 7,
    profile_digest: "4".repeat(64),
    audio_sha256: "5".repeat(64),
  };
}

function dispatchPermit(binding = channelBinding(), options = {}) {
  const issuedAtMs = options.issuedAtMs ?? Date.now() - 100;
  const expiresAtMs = options.expiresAtMs ?? issuedAtMs + DISPATCH_PERMIT_MAX_AGE_MS;
  const permit = {
    ...binding,
    kind: "dispatch_permit",
    provider_id: "workstation-inference",
    model_id: "inkling-small-iq2m-canary",
    issued_at: new Date(issuedAtMs).toISOString(),
    expires_at: new Date(expiresAtMs).toISOString(),
    permit_max_age_ms: DISPATCH_PERMIT_MAX_AGE_MS,
    dispatch_intent_digest: "6".repeat(64),
    reservation_lease_identity_digest: "7".repeat(64),
  };
  permit.permit_id = deriveDispatchPermitId(permit);
  return options.mutate ? options.mutate(permit) : permit;
}

function exactPermitTimes(issuedAt, expiresAt) {
  return {
    mutate(permit) {
      const updated = { ...permit, issued_at: issuedAt, expires_at: expiresAt };
      updated.permit_id = deriveDispatchPermitId(updated);
      return updated;
    },
  };
}

function authorityTransport({
  loseArm = false,
  loseAuthorization = false,
  withholdAuthorization = false,
  mismatch = false,
  arm,
  permitOptions,
} = {}) {
  const messages = [];
  const binding = arm ?? channelBinding();
  const armMessage = { ...binding, kind: "arm_turn" };
  return {
    messages,
    async receiveArm() {
      messages.push(armMessage);
      if (loseArm) throw new Error("lost arm acknowledgement");
      return armMessage;
    },
    async exchange(message) {
      messages.push(message);
      if (message.kind === "authorize_dispatch" && loseAuthorization) {
        throw new Error("lost acknowledgement");
      }
      if (message.kind === "authorize_dispatch" && withholdAuthorization) {
        return new Promise(() => undefined);
      }
      if (message.kind === "authorize_dispatch") {
        return dispatchPermit(
          mismatch ? { ...binding, turn_id: "0".repeat(32) } : binding,
          permitOptions,
        );
      }
      return message;
    },
  };
}

test("authority request schema and latest broker digest matches canonical LACP contract", () => {
  assert.equal(
    WORKBENCH_AUTHORITY_SCHEMA_DIGEST,
    "b78278b0ae541b25274f930adf5c977b5a4df9742a7ebe38f129129966247421",
  );
  assert.equal(
    WORKBENCH_BROKER_SCHEMA_DIGEST,
    "b1b50956002df6ed65fd7891ab4a218eedcc80970a678c3bbf1059ba87139fc5",
  );
  verifyWorkbenchAuthoritySchemaDigest();
  assert.equal(WORKBENCH_AUTHORITY_SCHEMA.protocol, "workbench-inkling-broker/v1");
  assert.deepEqual(Object.keys(WORKBENCH_AUTHORITY_SCHEMA.messages), [
    "arm_turn",
    "authorize_dispatch",
    "dispatch_permit",
    "report_disposition",
  ]);
  assert.deepEqual(WORKBENCH_AUTHORITY_SCHEMA.messages.arm_turn.fields, [
    "protocol",
    "kind",
    "session_id",
    "turn_id",
    "attempt_nonce",
    "claim_generation",
    "profile_digest",
    "audio_sha256",
  ]);
});

test("inherited authority channel authorizes exactly one Workbench dispatch", async () => {
  const transport = authorityTransport();
  const channel = new WorkbenchInheritedAuthorityChannel(transport);
  await channel.arm();
  await channel.authorizeDispatch();
  channel.consumeDispatchPermitAtProviderWrite();
  assert.throws(() => channel.consumeDispatchPermitAtProviderWrite(), /not consumable/);
  await channel.reportDisposition("stream_completed", "stop");
  assert.equal(channel.state, "reported");
  assert.deepEqual(
    transport.messages.map((message) => message.kind),
    ["arm_turn", "authorize_dispatch", "report_disposition"],
  );
  assert.deepEqual(Object.keys(transport.messages[1]).sort(), [
    "attempt_nonce",
    "audio_sha256",
    "claim_generation",
    "kind",
    "profile_digest",
    "protocol",
    "session_id",
    "turn_id",
  ]);
  assert.equal(
    transport.messages.some((message) => "schedulerDb" in message || "schema_version" in message),
    false,
  );
});

test("lost dispatch acknowledgement blocks provider dispatch and cannot be retried", async () => {
  const transport = authorityTransport({ loseAuthorization: true });
  const channel = new WorkbenchInheritedAuthorityChannel(transport);
  await channel.arm();
  await assert.rejects(channel.authorizeDispatch(), /indeterminate; dispatch is forbidden/);
  assert.throws(() => channel.consumeDispatchPermitAtProviderWrite(), /not consumable/);
  await assert.rejects(channel.authorizeDispatch(), /not armed/);
  assert.equal(
    transport.messages.filter((message) => message.kind === "authorize_dispatch").length,
    1,
  );
});

test("withheld dispatch acknowledgement expires and permanently blocks dispatch", async () => {
  const transport = authorityTransport({ withholdAuthorization: true });
  const channel = new WorkbenchInheritedAuthorityChannel(transport, {
    acknowledgementTimeoutMs: 10,
  });
  await channel.arm();
  await assert.rejects(channel.authorizeDispatch(), /indeterminate; dispatch is forbidden/);
  assert.throws(() => channel.consumeDispatchPermitAtProviderWrite(), /not consumable/);
  await assert.rejects(channel.authorizeDispatch(), /not armed/);
});

test("wire decoder rejects duplicate JSON keys before semantic acknowledgement", () => {
  const canonical = JSON.stringify({ ...channelBinding(), kind: "arm_turn" });
  const duplicate = canonical.replace(
    '{"protocol":',
    '{"protocol":"workbench-inkling-broker/v1","protocol":',
  );
  assert.throws(() => decodeWorkbenchAuthorityPacket(duplicate), /duplicate key/);
});

test("lost arm acknowledgement blocks re-arm and all provider dispatch", async () => {
  const transport = authorityTransport({ loseArm: true });
  const channel = new WorkbenchInheritedAuthorityChannel(transport);
  await assert.rejects(channel.arm(), /retry is forbidden/);
  await assert.rejects(channel.arm(), /not armable/);
  assert.throws(() => channel.consumeDispatchPermitAtProviderWrite(), /not consumable/);
  assert.equal(transport.messages.filter((message) => message.kind === "arm_turn").length, 1);
});

test("mismatched owner dispatch permit fails closed before dispatch", async () => {
  const channel = new WorkbenchInheritedAuthorityChannel(authorityTransport({ mismatch: true }));
  await channel.arm();
  await assert.rejects(channel.authorizeDispatch(), /mismatched/);
  assert.throws(() => channel.consumeDispatchPermitAtProviderWrite(), /not consumable/);
});

test("expired or malformed permits fail closed without provider dispatch", async () => {
  const expired = new WorkbenchInheritedAuthorityChannel(
    authorityTransport({
      permitOptions: { issuedAtMs: Date.now() - 2_000, expiresAtMs: Date.now() - 1_000 },
    }),
  );
  await expired.arm();
  await assert.rejects(expired.authorizeDispatch(), /stale or future-dated/);
  assert.equal(expired.dispatchCount, 0);

  const malformed = new WorkbenchInheritedAuthorityChannel(
    authorityTransport({
      permitOptions: { mutate: (permit) => ({ ...permit, permit_id: "0".repeat(32) }) },
    }),
  );
  await malformed.arm();
  await assert.rejects(malformed.authorizeDispatch(), /identity is invalid/);
  assert.equal(malformed.dispatchCount, 0);
});

test("permit timestamps preserve canonical calendar and microsecond semantics", async () => {
  const invalidCalendar = new WorkbenchInheritedAuthorityChannel(
    authorityTransport({
      permitOptions: exactPermitTimes("2026-02-30T00:00:00Z", "2026-02-30T00:00:01Z"),
    }),
  );
  await invalidCalendar.arm();
  await assert.rejects(invalidCalendar.authorizeDispatch(), /must be RFC3339 UTC/);

  const overAge = new WorkbenchInheritedAuthorityChannel(
    authorityTransport({
      permitOptions: exactPermitTimes("2026-08-02T08:00:00.000001Z", "2026-08-02T08:00:01.000999Z"),
    }),
  );
  await overAge.arm();
  await assert.rejects(overAge.authorizeDispatch(), /expiry is invalid/);

  const base = Date.parse("2026-08-02T08:00:00Z");
  const validSubMillisecond = new WorkbenchInheritedAuthorityChannel(
    authorityTransport({
      permitOptions: exactPermitTimes("2026-08-02T08:00:00.000001Z", "2026-08-02T08:00:00.000999Z"),
    }),
    { wallNowMs: () => base + 0.5, monotonicNowMs: () => 1 },
  );
  await validSubMillisecond.arm();
  await validSubMillisecond.authorizeDispatch();
  validSubMillisecond.consumeDispatchPermitAtProviderWrite();
  assert.equal(validSubMillisecond.dispatchCount, 1);

  const canonicalEndOfDay = new WorkbenchInheritedAuthorityChannel(
    authorityTransport({
      permitOptions: exactPermitTimes("2026-08-02T24:00:00.000000Z", "2026-08-03T00:00:01Z"),
    }),
    {
      wallNowMs: () => Date.parse("2026-08-03T00:00:00.500Z"),
      monotonicNowMs: () => 1,
    },
  );
  await canonicalEndOfDay.arm();
  await canonicalEndOfDay.authorizeDispatch();
  canonicalEndOfDay.consumeDispatchPermitAtProviderWrite();
  assert.equal(canonicalEndOfDay.dispatchCount, 1);

  const futureSubMillisecond = new WorkbenchInheritedAuthorityChannel(
    authorityTransport({
      permitOptions: exactPermitTimes("2026-08-02T08:00:00.000999Z", "2026-08-02T08:00:00.001999Z"),
    }),
    { wallNowMs: () => base + 0.5, monotonicNowMs: () => 1 },
  );
  await futureSubMillisecond.arm();
  await assert.rejects(futureSubMillisecond.authorizeDispatch(), /future-dated/);
});

test("permit crossing expiry at the provider boundary remains zero-dispatch and reportable", async () => {
  const base = Date.now();
  let wallNowMs = base + 100;
  let monotonicNowMs = 10;
  const channel = new WorkbenchInheritedAuthorityChannel(
    authorityTransport({ permitOptions: { issuedAtMs: base, expiresAtMs: base + 1_000 } }),
    { wallNowMs: () => wallNowMs, monotonicNowMs: () => monotonicNowMs },
  );
  await channel.arm();
  await channel.authorizeDispatch();
  wallNowMs = base + 1_000;
  monotonicNowMs = 910;
  assert.throws(
    () => channel.consumeDispatchPermitAtProviderWrite(),
    /expired at the provider write boundary/,
  );
  assert.equal(channel.dispatchCount, 0);
  await channel.reportDisposition("not_dispatched", "none");
  assert.equal(channel.state, "reported");
});

test("monotonic permit deadline prevents wall-clock rollback from extending authority", async () => {
  const base = Date.now();
  let wallNowMs = base + 100;
  let monotonicNowMs = 10;
  const channel = new WorkbenchInheritedAuthorityChannel(
    authorityTransport({ permitOptions: { issuedAtMs: base, expiresAtMs: base + 1_000 } }),
    { wallNowMs: () => wallNowMs, monotonicNowMs: () => monotonicNowMs },
  );
  await channel.arm();
  await channel.authorizeDispatch();
  wallNowMs = base + 100;
  monotonicNowMs = 910;
  assert.throws(
    () => channel.consumeDispatchPermitAtProviderWrite(),
    /expired at the provider write boundary/,
  );
  assert.equal(channel.dispatchCount, 0);
});

test("authority channel rejects non-canonical extras and contradictory disposition", async () => {
  const extra = new WorkbenchInheritedAuthorityChannel(
    authorityTransport({ arm: { ...channelBinding(), profile_id: "inkling-tts-canary" } }),
  );
  await assert.rejects(extra.arm(), /fields are not exact/);

  const valid = new WorkbenchInheritedAuthorityChannel(authorityTransport());
  await valid.arm();
  await valid.authorizeDispatch();
  await assert.rejects(
    valid.reportDisposition("stream_completed", "stop"),
    /contradicts dispatch count/,
  );

  const runtimeInvalid = new WorkbenchInheritedAuthorityChannel(authorityTransport());
  await runtimeInvalid.arm();
  await runtimeInvalid.authorizeDispatch();
  runtimeInvalid.consumeDispatchPermitAtProviderWrite();
  await assert.rejects(
    runtimeInvalid.reportDisposition("release", "none"),
    /disposition is invalid/,
  );
});

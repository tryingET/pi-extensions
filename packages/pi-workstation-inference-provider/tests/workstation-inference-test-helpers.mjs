import { createHash } from "node:crypto";
import { clearWorkstationHealthCache } from "../extensions/workstation-inference.ts";

export const CONTRACT_ENV = "PI_WORKSTATION_INFERENCE_CONTRACT";
export const CONTRACT_JSON_ENV = "PI_WORKSTATION_INFERENCE_CONTRACT_JSON";

export function withInlineContract(contract, fn) {
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

export function contract(overrides = {}) {
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

export function inklingContract(overrides = {}) {
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
        context_window: 32768,
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

export function inklingModel() {
  return {
    id: "inkling-small-iq2m-canary",
    name: "Inkling",
    provider: "workstation-inference",
    api: "workstation-inference",
    baseUrl: "http://127.0.0.1:1364/v1",
    reasoning: false,
    input: ["text", "image"],
    contextWindow: 32768,
    maxTokens: 512,
    cost: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0 },
  };
}

export function canonicalJson(value) {
  if (Array.isArray(value)) return `[${value.map(canonicalJson).join(",")}]`;
  if (value && typeof value === "object") {
    return `{${Object.keys(value)
      .sort()
      .map((key) => `${JSON.stringify(key)}:${canonicalJson(value[key])}`)
      .join(",")}}`;
  }
  return JSON.stringify(value);
}

export function schedulerHandoffPayload(overrides = {}) {
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

export function schedulerConsumerResponse(handoff, action, phase) {
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

import { type Static, Type } from "typebox";
import { Value } from "typebox/value";
import { SOMA_ALIASES } from "./workstation-capacity.ts";

const OptionalString = Type.Optional(Type.String());
const OptionalPositiveNumber = Type.Optional(Type.Number({ exclusiveMinimum: 0 }));
const ThinkingLevelMapSchema = Type.Object(
  {
    minimal: Type.Optional(Type.Union([Type.String(), Type.Null()])),
    low: Type.Optional(Type.Union([Type.String(), Type.Null()])),
    medium: Type.Optional(Type.Union([Type.String(), Type.Null()])),
    high: Type.Optional(Type.Union([Type.String(), Type.Null()])),
    xhigh: Type.Optional(Type.Union([Type.String(), Type.Null()])),
  },
  { additionalProperties: false },
);
const InputKindSchema = Type.Union([Type.Literal("text"), Type.Literal("image")]);
const NativeInputKindSchema = Type.Union([
  Type.Literal("text"),
  Type.Literal("image"),
  Type.Literal("audio"),
]);
const AudioInputSchema = Type.Object(
  {
    request_format: Type.Literal("openai-chat-input-audio"),
    formats: Type.Array(
      Type.Union([Type.Literal("wav"), Type.Literal("mp3"), Type.Literal("flac")]),
      { minItems: 1 },
    ),
    max_bytes: Type.Number({ minimum: 1 }),
    max_encoded_bytes: Type.Number({ minimum: 1 }),
    transport: Type.Literal("inline-base64"),
    authorization_mode: Type.Literal("external-scheduler-claim-required"),
  },
  { additionalProperties: false },
);
const ContractModelSchema = Type.Object(
  {
    id: OptionalString,
    pi_model_id: OptionalString,
    name: OptionalString,
    upstream_model: OptionalString,
    // Schema2 never interprets these compatibility hints, including null or malformed values.
    context_window: Type.Optional(Type.Unknown()),
    max_tokens: Type.Optional(Type.Unknown()),
    capacity: Type.Optional(Type.Unknown()),
    reasoning: Type.Optional(Type.Boolean()),
    thinking_level_map: Type.Optional(ThinkingLevelMapSchema),
    thinking_format: Type.Optional(
      Type.Union([Type.Literal("qwen"), Type.Literal("qwen-chat-template")]),
    ),
    input: Type.Optional(Type.Array(InputKindSchema, { minItems: 1 })),
    native_input_modalities: Type.Optional(Type.Array(NativeInputKindSchema, { minItems: 1 })),
    audio_input: Type.Optional(AudioInputSchema),
  },
  { additionalProperties: true },
);
const Schema = Type.Object(
  {
    schema_version: Type.Union([Type.Literal(1), Type.Literal(2)]),
    authority: OptionalString,
    family: OptionalString,
    surface: OptionalString,
    generated_at: OptionalString,
    stale_after_seconds: OptionalPositiveNumber,
    refresh_after_seconds: OptionalPositiveNumber,
    provider_id: OptionalString,
    provider_name: OptionalString,
    runtime_profile_id: OptionalString,
    base_url: Type.String({ minLength: 1 }),
    health_url: OptionalString,
    api_key_env: OptionalString,
    api_key: OptionalString,
    recovery_hint: OptionalString,
    models: Type.Array(ContractModelSchema, { minItems: 1 }),
  },
  { additionalProperties: true },
);
export type ContractModel = Omit<
  Static<typeof ContractModelSchema>,
  "context_window" | "max_tokens"
> & {
  context_window?: number;
  max_tokens?: number;
};
export type WorkstationInferenceContract = Omit<Static<typeof Schema>, "models"> & {
  models: ContractModel[];
};

export function stringValue(value: unknown): string | undefined {
  return typeof value === "string" && value.trim() ? value.trim() : undefined;
}
const TRUSTED_AUTHORITIES = new Set([
  "workstation/lane-op",
  "workstation/runtime-ownership-scheduler",
]);
function loopbackUrl(value: string, label: string): string {
  let parsed: URL;
  try {
    parsed = new URL(value);
  } catch {
    throw new Error(`${label} must be an absolute loopback URL`);
  }
  if (
    parsed.protocol !== "http:" ||
    !["127.0.0.1", "localhost", "[::1]"].includes(parsed.hostname) ||
    parsed.username ||
    parsed.password ||
    parsed.search ||
    parsed.hash
  )
    throw new Error(`${label} must be credential-free loopback HTTP without query or fragment`);
  return parsed.toString().replace(/\/$/, "");
}
export function parseContract(payload: unknown): WorkstationInferenceContract {
  if (!Value.Check(Schema, payload)) {
    const detail = [...Value.Errors(Schema, payload)]
      .slice(0, 5)
      .map((e) => `${e.instancePath || "/"} ${e.message}`)
      .join("; ");
    throw new Error(`contract schema validation failed: ${detail}`);
  }
  const c = payload as WorkstationInferenceContract;
  const authority = stringValue(c.authority);
  if (!authority || !TRUSTED_AUTHORITIES.has(authority))
    throw new Error("contract authority is not a trusted workstation owner");
  if (c.schema_version === 2) {
    if (
      authority !== "workstation/lane-op" ||
      c.family !== "baseline-text" ||
      c.surface !== "canonical" ||
      c.provider_id !== "workstation-inference" ||
      c.runtime_profile_id
    )
      throw new Error("schema2 requires the exact canonical Soma consumer identity");
  } else if (c.surface !== "canary" || !stringValue(c.family)) {
    throw new Error(
      "schema1 canonical Soma capacity is unverified; only identified unrelated canaries may use schema1",
    );
  }
  const seen = new Set<string>();
  const models = c.models.map((m, index) => {
    if (m.id !== undefined && m.pi_model_id !== undefined && m.id !== m.pi_model_id)
      throw new Error(`models[${index}] has contradictory id and pi_model_id`);
    const id = stringValue(m.id) ?? stringValue(m.pi_model_id);
    if (!id || seen.has(id)) throw new Error(`models[${index}] needs a unique id or pi_model_id`);
    seen.add(id);
    if (c.schema_version === 1) {
      for (const key of ["context_window", "max_tokens"] as const) {
        if (
          m[key] !== undefined &&
          (typeof m[key] !== "number" || !Number.isFinite(m[key]) || m[key] <= 0)
        )
          throw new Error(`legacy model ${key} must be positive`);
      }
    }
    const model = {
      ...m,
      id,
      pi_model_id: id,
      name: stringValue(m.name) ?? id,
      upstream_model: stringValue(m.upstream_model),
    };
    if (c.schema_version === 2) {
      if (!SOMA_ALIASES.has(id))
        throw new Error("schema2 alias is not an identified canonical Soma alias");
      model.capacity = m.capacity ?? null;
      delete model.context_window;
      delete model.max_tokens;
    } else {
      delete model.capacity;
      // Reserve disabled canonical identities even if the primary file is absent/invalid.
      if (SOMA_ALIASES.has(id)) model.capacity = null;
    }
    return model;
  });
  const baseUrl = stringValue(c.base_url);
  if (!baseUrl) throw new Error("base_url is required");
  const health = stringValue(c.health_url);
  return {
    ...c,
    authority,
    models,
    family: stringValue(c.family),
    surface: stringValue(c.surface),
    generated_at: stringValue(c.generated_at),
    provider_id: stringValue(c.provider_id),
    provider_name: stringValue(c.provider_name),
    base_url: loopbackUrl(baseUrl, "base_url"),
    health_url: health ? loopbackUrl(health, "health_url") : undefined,
    api_key_env: stringValue(c.api_key_env),
    api_key: stringValue(c.api_key),
    recovery_hint: stringValue(c.recovery_hint),
  };
}

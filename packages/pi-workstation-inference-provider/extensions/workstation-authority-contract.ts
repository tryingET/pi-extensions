import { createHash } from "node:crypto";

export const WORKBENCH_BROKER_PROTOCOL = "workbench-inkling-broker/v1";
export const WORKBENCH_AUTHORITY_SCHEMA_ID = "workbench-inkling-authority/v2";
// Canonical owner source: local-ai-control-plane commits af506f0 + 45b12cf.
export const WORKBENCH_AUTHORITY_SCHEMA_DIGEST =
  "b78278b0ae541b25274f930adf5c977b5a4df9742a7ebe38f129129966247421";
export const WORKBENCH_BROKER_SCHEMA_DIGEST =
  "b1b50956002df6ed65fd7891ab4a218eedcc80970a678c3bbf1059ba87139fc5";
export const WORKBENCH_PROFILE_ID = "workbench-inkling-canary";
export const WORKBENCH_MODEL_ID = "inkling-small-iq2m-canary";
export const WORKBENCH_STEP_ID = "inkling-small:0";
export const WORKBENCH_PROVIDER_ID = "workstation-inference";
export const WORKBENCH_AUTHORITY_FD_ENV = "PI_WORKSTATION_INFERENCE_AUTHORITY_FD";
export const DISPATCH_PERMIT_MAX_AGE_MS = 1_000;

const HEX64 = /^[0-9a-f]{64}$/;
const ID = /^[0-9a-f]{32}$/;
const RFC3339_UTC =
  /^([0-9]{4})-([0-9]{2})-([0-9]{2})T([0-9]{2}):([0-9]{2}):([0-9]{2})(?:\.([0-9]{1,6}))?Z$/;

export type JsonRecord = Record<string, unknown>;

const BINDING_FIELDS = [
  "protocol",
  "kind",
  "session_id",
  "turn_id",
  "attempt_nonce",
  "claim_generation",
  "profile_digest",
  "audio_sha256",
] as const;
const PERMIT_FIELDS = [
  ...BINDING_FIELDS,
  "provider_id",
  "model_id",
  "permit_id",
  "issued_at",
  "expires_at",
  "permit_max_age_ms",
  "dispatch_intent_digest",
  "reservation_lease_identity_digest",
] as const;
const PERMIT_DERIVATION_FIELDS = PERMIT_FIELDS.filter(
  (field) => field !== "kind" && field !== "permit_id",
);

export const WORKBENCH_AUTHORITY_SCHEMA = {
  schema_id: WORKBENCH_AUTHORITY_SCHEMA_ID,
  consumer: "pi-workstation-inference-provider",
  transport: "AF_UNIX/SOCK_SEQPACKET inherited descriptor",
  protocol: WORKBENCH_BROKER_PROTOCOL,
  messages: {
    arm_turn: { fields: [...BINDING_FIELDS] },
    authorize_dispatch: { fields: [...BINDING_FIELDS] },
    dispatch_permit: {
      fields: [...PERMIT_FIELDS],
      provider_id: WORKBENCH_PROVIDER_ID,
      model_id: WORKBENCH_MODEL_ID,
      permit_max_age_ms: DISPATCH_PERMIT_MAX_AGE_MS,
      permit_id_derivation: "sha256(domain+schema+exact-fields)[:32]",
    },
    report_disposition: {
      fields: [...BINDING_FIELDS, "disposition", "dispatch_count", "terminal_provider_class"],
      dispositions: ["not_dispatched", "stream_completed", "dispatch_ambiguous"],
      dispatch_count: [0, 1],
      terminal_provider_classes: ["none", "stop", "length", "error", "aborted", "ambiguous"],
    },
  },
  dispatch_permit: {
    issue_after: [
      "broker_intent_cas",
      "scheduler_intent_durable_readback",
      "claim_dispatch_once",
      "fresh_post_io_scheduler_fence",
    ],
    expiry_rule: "min(all_authority_expiries,issued_at+1s)",
    post_delegation_uncertainty: "quarantine_no_retry",
  },
  content_fields_permitted: false,
} as const;

export type WorkbenchTurnBinding = {
  protocol: typeof WORKBENCH_BROKER_PROTOCOL;
  session_id: string;
  turn_id: string;
  attempt_nonce: string;
  claim_generation: number;
  profile_digest: string;
  audio_sha256: string;
};

export type DispatchPermit = WorkbenchTurnBinding & {
  kind: "dispatch_permit";
  provider_id: typeof WORKBENCH_PROVIDER_ID;
  model_id: typeof WORKBENCH_MODEL_ID;
  permit_id: string;
  issued_at: string;
  expires_at: string;
  permit_max_age_ms: typeof DISPATCH_PERMIT_MAX_AGE_MS;
  dispatch_intent_digest: string;
  reservation_lease_identity_digest: string;
};

export type AuthorityDisposition = "not_dispatched" | "stream_completed" | "dispatch_ambiguous";
export type TerminalProviderClass = "none" | "stop" | "length" | "error" | "aborted" | "ambiguous";

export function canonicalAuthorityJson(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map(canonicalAuthorityJson).join(",")}]`;
  if (value !== null && typeof value === "object") {
    const record = value as JsonRecord;
    return `{${Object.keys(record)
      .sort()
      .map((key) => `${JSON.stringify(key)}:${canonicalAuthorityJson(record[key])}`)
      .join(",")}}`;
  }
  return JSON.stringify(value);
}

export function verifyWorkbenchAuthoritySchemaDigest(
  expected = WORKBENCH_AUTHORITY_SCHEMA_DIGEST,
): void {
  const actual = createHash("sha256")
    .update(canonicalAuthorityJson(WORKBENCH_AUTHORITY_SCHEMA))
    .digest("hex");
  if (actual !== expected) throw new Error("Workbench authority schema digest is mismatched");
}

export function exactAuthorityKeys(value: JsonRecord, expected: readonly string[]): void {
  const actual = Object.keys(value).sort();
  const wanted = [...expected].sort();
  if (actual.length !== wanted.length || actual.some((key, index) => key !== wanted[index])) {
    throw new Error("inherited authority message fields are not exact");
  }
}

function validBinding(binding: WorkbenchTurnBinding): boolean {
  return (
    binding.protocol === WORKBENCH_BROKER_PROTOCOL &&
    ID.test(binding.session_id) &&
    ID.test(binding.turn_id) &&
    ID.test(binding.attempt_nonce) &&
    Number.isSafeInteger(binding.claim_generation) &&
    binding.claim_generation > 0 &&
    HEX64.test(binding.profile_digest) &&
    HEX64.test(binding.audio_sha256)
  );
}

export function parseArmBinding(message: Readonly<JsonRecord>): WorkbenchTurnBinding {
  exactAuthorityKeys(message as JsonRecord, BINDING_FIELDS);
  if (message.kind !== "arm_turn") throw new Error("inherited authority message kind is invalid");
  const binding = {
    protocol: message.protocol,
    session_id: message.session_id,
    turn_id: message.turn_id,
    attempt_nonce: message.attempt_nonce,
    claim_generation: message.claim_generation,
    profile_digest: message.profile_digest,
    audio_sha256: message.audio_sha256,
  } as WorkbenchTurnBinding;
  if (!validBinding(binding)) throw new Error("inherited authority turn binding is invalid");
  return binding;
}

export function authorityMessage(
  binding: WorkbenchTurnBinding,
  kind: "arm_turn" | "authorize_dispatch",
): Readonly<JsonRecord> {
  return { ...binding, kind };
}

function sameBinding(message: Readonly<JsonRecord>, binding: WorkbenchTurnBinding): boolean {
  return (
    message.protocol === binding.protocol &&
    message.session_id === binding.session_id &&
    message.turn_id === binding.turn_id &&
    message.attempt_nonce === binding.attempt_nonce &&
    message.claim_generation === binding.claim_generation &&
    message.profile_digest === binding.profile_digest &&
    message.audio_sha256 === binding.audio_sha256
  );
}

export function deriveDispatchPermitId(message: Readonly<JsonRecord>): string {
  const fields = Object.fromEntries(
    PERMIT_DERIVATION_FIELDS.map((field) => [field, message[field]]),
  );
  return createHash("sha256")
    .update(
      canonicalAuthorityJson({
        domain: "workbench-inkling-dispatch-permit/v1",
        schema_id: WORKBENCH_AUTHORITY_SCHEMA_ID,
        ...fields,
      }),
    )
    .digest("hex")
    .slice(0, 32);
}

function parseUtc(
  value: unknown,
  field: string,
): {
  epochMs: number;
  epochMicroseconds: bigint;
} {
  const match = typeof value === "string" ? RFC3339_UTC.exec(value) : null;
  if (!match) throw new Error(`${field} must be RFC3339 UTC`);
  const [year, month, day, hour, minute, second] = match.slice(1, 7).map((item) => Number(item));
  const microseconds = Number((match[7] ?? "").padEnd(6, "0"));
  const endOfDay = hour === 24;
  if (year < 1 || (endOfDay && (minute !== 0 || second !== 0 || microseconds !== 0))) {
    throw new Error(`${field} must be RFC3339 UTC`);
  }
  const normalizedHour = endOfDay ? 0 : hour;
  const date = new Date(0);
  date.setUTCFullYear(year, month - 1, day);
  date.setUTCHours(normalizedHour, minute, second, 0);
  if (
    date.getUTCFullYear() !== year ||
    date.getUTCMonth() !== month - 1 ||
    date.getUTCDate() !== day ||
    date.getUTCHours() !== normalizedHour ||
    date.getUTCMinutes() !== minute ||
    date.getUTCSeconds() !== second
  ) {
    throw new Error(`${field} must be RFC3339 UTC`);
  }
  if (endOfDay) date.setUTCDate(date.getUTCDate() + 1);
  return {
    epochMs: date.getTime() + microseconds / 1_000,
    epochMicroseconds: BigInt(date.getTime()) * 1_000n + BigInt(microseconds),
  };
}

export function parseDispatchPermit(
  message: Readonly<JsonRecord>,
  binding: WorkbenchTurnBinding,
): { permit: DispatchPermit; issuedAtMs: number; expiresAtMs: number } {
  exactAuthorityKeys(message as JsonRecord, PERMIT_FIELDS);
  if (message.kind !== "dispatch_permit" || !sameBinding(message, binding)) {
    throw new Error("dispatch permit binding is mismatched");
  }
  if (
    message.provider_id !== WORKBENCH_PROVIDER_ID ||
    message.model_id !== WORKBENCH_MODEL_ID ||
    message.permit_max_age_ms !== DISPATCH_PERMIT_MAX_AGE_MS
  ) {
    throw new Error("dispatch permit target or age is invalid");
  }
  if (
    typeof message.dispatch_intent_digest !== "string" ||
    !HEX64.test(message.dispatch_intent_digest) ||
    typeof message.reservation_lease_identity_digest !== "string" ||
    !HEX64.test(message.reservation_lease_identity_digest)
  ) {
    throw new Error("dispatch permit durable identity is invalid");
  }
  const issued = parseUtc(message.issued_at, "issued_at");
  const expires = parseUtc(message.expires_at, "expires_at");
  const lifetimeMicroseconds = expires.epochMicroseconds - issued.epochMicroseconds;
  if (
    lifetimeMicroseconds <= 0n ||
    lifetimeMicroseconds > BigInt(DISPATCH_PERMIT_MAX_AGE_MS) * 1_000n
  ) {
    throw new Error("dispatch permit expiry is invalid");
  }
  if (message.permit_id !== deriveDispatchPermitId(message)) {
    throw new Error("dispatch permit identity is invalid");
  }
  return {
    permit: message as DispatchPermit,
    issuedAtMs: issued.epochMs,
    expiresAtMs: expires.epochMs,
  };
}

export function exactCanonicalAuthorityEcho(
  response: Readonly<JsonRecord>,
  request: Readonly<JsonRecord>,
): void {
  exactAuthorityKeys(response as JsonRecord, Object.keys(request));
  if (canonicalAuthorityJson(response) !== canonicalAuthorityJson(request)) {
    throw new Error("inherited authority acknowledgement is mismatched");
  }
}

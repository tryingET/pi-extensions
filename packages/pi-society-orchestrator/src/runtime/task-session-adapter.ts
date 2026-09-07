import schema from "./task-session-protocol-v1.json" with { type: "json" };

export const taskSessionAdapterIdentity = Object.freeze({
  interface: "pi.ak-task-session-adapter.v1",
  protocol: "ak.task-session.v1",
  producerSchemaDigest: "a111fac365993fa6af6c3db4f08ac42f2f354ef55c0d9a99137ad910d780e2be",
  producerFixtureDigest: "ddbfdcc349f4a1f080711e84146c0e278bea06cd5e993c5a4c2a0738217ec8c3",
  status: schema["x-status"],
  integrationReady: false,
});
interface Rule {
  maxItems?: number;
  items?: Rule;
  $ref?: string;
  oneOf?: Rule[];
  const?: unknown;
  enum?: unknown[];
  type?: string;
  minimum?: number;
  maximum?: number;
  minLength?: number;
  maxLength?: number;
  pattern?: string;
  properties?: Record<string, Rule>;
  required?: string[];
  additionalProperties?: boolean | Rule;
  allOf?: Rule[];
  if?: Rule;
  then?: Rule;
}
// Bounded schema interpretation, not native claimability or a second authority snapshot algorithm.
function validate(s: Rule, v: unknown): boolean {
  if (s.$ref) {
    const key = s.$ref.split("/").at(-1);
    const rule = key ? (schema.$defs as Record<string, Rule>)[key] : undefined;
    return !!rule && validate(rule, v);
  }
  if (s.oneOf) return s.oneOf.filter((x) => validate(x, v)).length === 1;
  if ("const" in s && v !== s.const) return false;
  if (s.enum && !s.enum.includes(v)) return false;
  if (s.type === "boolean" && typeof v !== "boolean") return false;
  if (s.type === "null" && v !== null) return false;
  if (
    s.type === "integer" &&
    (typeof v !== "number" ||
      !Number.isSafeInteger(v) ||
      v < (s.minimum ?? 0) ||
      v > (s.maximum ?? Number.MAX_SAFE_INTEGER))
  )
    return false;
  if (
    s.type === "string" &&
    (typeof v !== "string" ||
      [...v].some(
        (c) => c.length === 1 && c.charCodeAt(0) >= 0xd800 && c.charCodeAt(0) <= 0xdfff,
      ) ||
      v.length < (s.minLength ?? 0) ||
      v.length > (s.maxLength ?? 65536) ||
      (s.pattern && !new RegExp(s.pattern).test(v)))
  )
    return false;
  if (
    s.type === "array" &&
    (!Array.isArray(v) ||
      v.length > (s.maxItems ?? 4096) ||
      (!!s.items && !v.every((item) => validate(s.items as Rule, item))))
  )
    return false;
  if (s.type === "object" || s.properties) {
    if (!v || typeof v !== "object" || Array.isArray(v)) return false;
    const object = v as Record<string, unknown>;
    if (s.required?.some((k) => !Object.hasOwn(object, k))) return false;
    if (
      s.additionalProperties === false &&
      Object.keys(object).some((k) => !Object.hasOwn(s.properties ?? {}, k))
    )
      return false;
    if (
      typeof s.additionalProperties === "object" &&
      Object.entries(object).some(
        ([k, value]) =>
          !Object.hasOwn(s.properties ?? {}, k) && !validate(s.additionalProperties as Rule, value),
      )
    )
      return false;
    if (
      Object.entries(s.properties ?? {}).some(
        ([k, sub]) => Object.hasOwn(object, k) && !validate(sub, object[k]),
      )
    )
      return false;
  }
  if (
    s.allOf &&
    !s.allOf.every((x) =>
      x.if ? !validate(x.if, v) || (!!x.then && validate(x.then, v)) : validate(x, v),
    )
  )
    return false;
  return true;
}
export function interpretTaskSessionMessage(data: unknown) {
  if (!validate(schema, data)) throw new Error("ak_protocol_shape_invalid");
  return structuredClone(data) as {
    protocol: string;
    kind: string;
    binding: Record<string, string>;
    body: Record<string, unknown>;
  };
}
export function requireTaskSessionProducer(): never {
  throw new Error("ak_producer_verification_pending");
}

/** Actual producer startup_request shape. Encoding is data-only, not activation authority. */
export function encodeTaskSessionStartup(input: {
  request: { requestId: string; taskId: number; cwd: string; profile: string };
  attempt: { attempt: string; incarnation: string; semanticDigest: string };
  repo: string;
  reservationDigest: string;
  intentDigest: string;
  baselineDigest: string;
  leaseSeconds: number;
  startupDeadline: number;
}) {
  const r = input.request,
    a = input.attempt;
  const result = {
    schema: "ak.task-session.startup.v1",
    request: r.requestId,
    attempt: a.attempt,
    incarnation: a.incarnation,
    actor: `pi-task-${a.incarnation}`,
    semantic_digest: a.semanticDigest,
    reservation: input.reservationDigest,
    profile_digest: r.profile,
    raw_envelope_digest: input.intentDigest,
    baseline_digest: input.baselineDigest,
    task_id: r.taskId,
    repo: input.repo,
    lease_seconds: input.leaseSeconds,
    startup_deadline_ms: input.startupDeadline,
  };
  if (!validate(schema.$defs.startup_request, result)) throw new Error("ak_startup_shape_invalid");
  return result;
}

export function interpretTaskSessionPlan(data: unknown) {
  if (!validate(schema.$defs.plan_result, data)) throw new Error("ak_plan_shape_invalid");
  return structuredClone(data);
}

export function interpretTaskSessionDefinition(
  name: "startup_request" | "recovery_request" | "host_closure" | "effect_disposition",
  data: unknown,
) {
  if (
    !["startup_request", "recovery_request", "host_closure", "effect_disposition"].includes(name) ||
    !validate(schema.$defs[name], data)
  )
    throw new Error("ak_definition_shape_invalid");
  return structuredClone(data);
}

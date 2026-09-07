import { posix } from "node:path";
import { isDeepStrictEqual } from "node:util";
import deployment from "./task-session-deployment-v1.json" with { type: "json" };
import schema from "./task-session-protocol-v1.json" with { type: "json" };

export const taskSessionAdapterIdentity = Object.freeze({
  interface: "pi.ak-task-session-adapter.v1",
  protocol: "ak.task-session.v1",
  producerSchemaDigest: "c10e1fb35e04371345791aeb2eb7b5e88656e584f53473f41db6151029e095a2",
  producerFixtureDigest: "ddbfdcc349f4a1f080711e84146c0e278bea06cd5e993c5a4c2a0738217ec8c3",
  status: schema["x-status"],
  configurationRequired: true,
  descriptor: "ak.task-session.descriptor.v1",
  deploymentSchemaDigest: "0c9eb6ddc3fe7774d418cc8b1284c2503f734f1fee05a034401a2624cf433e09",
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
function validate(
  s: Rule,
  v: unknown,
  definitions: Record<string, Rule> = schema.$defs as unknown as Record<string, Rule>,
): boolean {
  const check = (rule: Rule, value: unknown): boolean => validate(rule, value, definitions);
  if (s.$ref) {
    const key = s.$ref.split("/").at(-1);
    const rule = key ? definitions[key] : undefined;
    return !!rule && check(rule, v);
  }
  if (s.oneOf) return s.oneOf.filter((x) => check(x, v)).length === 1;
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
      (!!s.items && !v.every((item) => check(s.items as Rule, item))))
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
          !Object.hasOwn(s.properties ?? {}, k) && !check(s.additionalProperties as Rule, value),
      )
    )
      return false;
    if (
      Object.entries(s.properties ?? {}).some(
        ([k, sub]) => Object.hasOwn(object, k) && !check(sub, object[k]),
      )
    )
      return false;
  }
  if (
    s.allOf &&
    !s.allOf.every((x) => (x.if ? !check(x.if, v) || (!!x.then && check(x.then, v)) : check(x, v)))
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
export interface ProducerBindings {
  policy_path: string;
  policy_sha256: string;
  policy_generation: string;
  ordinary_binary: { path: string; sha256: string; commit: string };
  worker: {
    path: string;
    sha256: string;
    commit: string;
    abi: string;
    manifest_path: string;
    manifest_sha256: string;
  };
  gate_path: string;
  gate_sha256: string;
  binding_sha256: string;
  deployment_schema_sha256: string;
  protocol_sha256: string;
  supervisor_sha256: string;
  host_sha256: string;
  host_build_digest: string;
  database_selector_digest: string;
}
export interface ProducerDescriptor {
  schema: string;
  platform: string;
  state: string;
  reason: string;
  operations: string[];
  authority: false;
  database_opened: false;
  database_locked: false;
  bindings: ProducerBindings | null;
  worker_test_support: boolean | null;
}
export function interpretTaskSessionBindings(data: unknown): ProducerBindings {
  if (!validate(deployment.$defs.bindings, data, deployment.$defs))
    throw new Error("ak_binding_shape_invalid");
  const b = data as ProducerBindings;
  if (
    [
      b.policy_path,
      b.gate_path,
      b.worker.path,
      b.worker.manifest_path,
      b.ordinary_binary.path,
    ].some(
      (p) =>
        !p.startsWith("/") ||
        [...p].some((c) => c.charCodeAt(0) < 32 || c.charCodeAt(0) === 127) ||
        posix.normalize(p) !== p,
    )
  )
    throw new Error("ak_binding_shape_invalid");
  const hashes = [
    b.policy_sha256,
    b.gate_sha256,
    b.binding_sha256,
    b.deployment_schema_sha256,
    b.protocol_sha256,
    b.supervisor_sha256,
    b.host_sha256,
    b.host_build_digest,
    b.database_selector_digest,
    b.ordinary_binary.sha256,
    b.worker.sha256,
    b.worker.manifest_sha256,
  ];
  if (
    hashes.some((h) => !/^[a-f0-9]{64}$/.test(h)) ||
    [b.ordinary_binary.commit, b.worker.commit].some((h) => !/^[a-f0-9]{40}$/.test(h))
  )
    throw new Error("ak_binding_shape_invalid");
  return structuredClone(b);
}
export function interpretTaskSessionDescriptor(data: unknown): ProducerDescriptor {
  if (!validate(deployment, data, deployment.$defs)) throw new Error("ak_descriptor_shape_invalid");
  const d = data as ProducerDescriptor;
  if (new Set(d.operations).size !== d.operations.length)
    throw new Error("ak_descriptor_shape_invalid");
  if (d.bindings) interpretTaskSessionBindings(d.bindings);
  return structuredClone(d);
}
/** Owner facts + independently provisioned expected bindings, never a source-status permit. */
export function requireTaskSessionProducer(data?: unknown, expected?: unknown): ProducerBindings {
  if (data === undefined || expected === undefined)
    throw new Error("ak_producer_configuration_required");
  const d = interpretTaskSessionDescriptor(data),
    b = interpretTaskSessionBindings(expected);
  if (
    d.state !== "enabled" ||
    d.worker_test_support !== false ||
    !["plan", "supervise"].every((op) => d.operations.includes(op))
  )
    throw new Error("ak_producer_unavailable");
  if (!isDeepStrictEqual(d.bindings, b)) throw new Error("ak_producer_binding_mismatch");
  if (
    b.protocol_sha256 !== taskSessionAdapterIdentity.producerSchemaDigest ||
    b.deployment_schema_sha256 !== taskSessionAdapterIdentity.deploymentSchemaDigest
  )
    throw new Error("ak_producer_protocol_incompatible");
  return b;
}
/** Extended readonly owner plan; baseline meaning remains entirely native-owned. */
export function interpretTaskSessionOwnerPlan(data: unknown, expected: ProducerBindings) {
  if (
    !validate(
      deployment.$defs.plan_result as Rule,
      data,
      deployment.$defs as unknown as Record<string, Rule>,
    )
  )
    throw new Error("ak_plan_shape_invalid");
  if (!data || typeof data !== "object" || Array.isArray(data))
    throw new Error("ak_plan_shape_invalid");
  const { authority, owner, ...baseline } = data as Record<string, unknown>;
  if (authority !== false || !owner || typeof owner !== "object" || Array.isArray(owner))
    throw new Error("ak_plan_shape_invalid");
  const { database_identity, ...bindings } = owner as Record<string, unknown>;
  if (
    typeof database_identity !== "string" ||
    !/^[a-f0-9]{64}$/.test(database_identity) ||
    !isDeepStrictEqual(interpretTaskSessionBindings(bindings), expected)
  )
    throw new Error("ak_plan_binding_mismatch");
  return { baseline: interpretTaskSessionPlan(baseline), databaseIdentity: database_identity };
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

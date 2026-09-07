import schema from "./task-session-protocol-v1.json" with { type: "json" };

export const taskSessionAdapterIdentity = Object.freeze({
  interface: "pi.ak-task-session-adapter.v1",
  protocol: "ak.task-session.v1",
  producerSchemaDigest: "249caa943fc46e7335166f6162abab6caeb617a7710440ef8e0b1711c730d41c",
  producerFixtureDigest: "b4601779c1c5ea41d6cf893e7d7c96e9311a1b63c614b8865eb2891154e850ab",
  status: schema["x-status"],
  integrationReady: false,
});
interface Rule {
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
  additionalProperties?: boolean;
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
      !v.isWellFormed() ||
      v.length < (s.minLength ?? 0) ||
      v.length > (s.maxLength ?? 65536) ||
      (s.pattern && !new RegExp(s.pattern).test(v)))
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
  throw new Error("ak_producer_blocked_draft_not_integration_ready");
}

import { createHash } from "node:crypto";
import type { ExtensionAPI } from "@earendil-works/pi-coding-agent";
export const TOOL_NAME = "agent_interaction_canary";
export const COMMAND_NAME = "agent-interaction-canary";
export const TRANSIENT_AUTHORITY_NOTICE =
  "Pi is a transient consumer only; owner sources retain task, evidence, product, and semantic authority.";
const INPUT_BYTE_CAP = 64 * 1024;
const OUTPUT_BYTE_CAP = 48 * 1024;
const SOURCE_LEAF_CAP = 1_024;
const SOURCE_DEPTH_CAP = 32;
const COMPACT_LEAF_CAP = 32;
const DIGEST = /^(?:sha256:)?[a-f0-9]{64}$/u;
const CONTROL = /[\u0000-\u001f\u007f]/gu;
const CONTROL_TEST = /[\u0000-\u001f\u007f]/u;
const HOME_PATH = /\/(?:home|Users)\/[^/\s]+/gu;
const HOME_PATH_TEST = /\/(?:home|Users)\/[^/\s]+/u;
const SECRET_TOKEN = /\b(?:sk|pk)_(?:live|test)_[A-Za-z0-9_-]+\b/gu;
const SECRET_TOKEN_TEST = /\b(?:sk|pk)_(?:live|test)_[A-Za-z0-9_-]+\b/u;
const SENSITIVE_KEY = /(?:secret|token|password|private.?key|api.?key|credential|authorization|cookie|effects?|source.?command|operation.?effect)/iu;
export type Provider =
  | "ts_quality_p1_retention"
  | "agent_kernel_p2_task_projection"
  | "rocs_owner_packet";
export type CanaryRequest = {
  provider: Provider;
  source_identity: string;
  receipt_json: string;
  view?: "compact" | "expand";
  expected_source_identity?: string;
  expected_generation?: string;
  expected_source_digest?: string;
  expected_policy_digest?: string;
};
type Json = null | boolean | number | string | Json[] | { [key: string]: Json };
type OwnerBinding = {
  owner: string;
  sourceIdentity: string;
  ownerGeneration: string;
  ownerSourceDigest: string;
  ownerPolicyDigest: string;
  payload: Json;
};
type ProjectedLeaf = { pointer: string; value: Json; redactions: string[] };
type Omission = { pointer: string; reason: "policy-withheld" | "compact-leaf-cap" };
// This entire object is hashed. Every enforced cap, accepted adapter coordinate,
// redaction rule, withholding behavior, and expansion binding is therefore bound.
export const CANARY_POLICY = deepFreeze({
  id: "pi-agent-interaction-canary.consumer-policy.v2",
  version: 2,
  policy_target: "pi-agent-interaction-canary",
  execution_provenance: {
    extension: "@tryinget/pi-agent-interaction-canary/extensions/agent-interaction-canary.ts",
    tool: TOOL_NAME,
    command: `/${COMMAND_NAME}`,
    observed_invocations: ["pi_tool", "pi_command", "direct_function_not_pi_observed"],
    observation_scope: "registered_handler_entry_only",
    cryptographic_caller_authentication: false,
    owner_identity_fields_are_declared_policy_targets_only: true,
  },
  providers: {
    ts_quality_p1_retention: {
      owner: "ts-quality",
      pilot_surface: "ts-quality.agent-interaction.retention-projection-pilot",
      pilot_schema_version: 4,
      owner_policy_id: "ts-quality.agent-interaction.retention-projection-canary",
      owner_policy_version: 1,
      owner_policy_digest_sha256: "d7ec868f732e0e361c2c1b6290ec4f9e4d3b505050dc36c51cb40d8e2ef41e00",
      owner_surface: "ts-quality.artifact-retention",
      owner_schema_version: 1,
      compact_protocol: "TSQ_RETENTION_PLAN_V1",
      allowed_source_pointers: ["/surface", "/schemaVersion", "/rootDir", "/config", "/keep", "/ignore", "/warnings"],
      compact_omissions: ["/schemaVersion", "/surface"],
      redactions: ["control-characters", "authorized-root-path", "secret-token-patterns"],
      validity_context: { mode: "read-only-retention-projection-pilot", config_path: "ts-quality.config.json", fixture_root_coordinate: "fixtures/minimal-external-adoption", observable_read_boundaries: ["fixture-root", "in-memory-owner-policy"] },
      authentication: "deferred to the enclosing registered Pi tool receipt",
      generation_digest_basis: "authorized-view-after-redaction",
      mandatory_checks_true: ["views_share_plan_generation", "authorized_view_plan_generation_digest_bound", "raw_plan_digest_unemitted", "owner_authored_policy_bound", "declared_policy_target_matched", "caller_authentication_deferred_to_pi_tool_receipt", "authorized_source_subset", "redaction_monotonic", "compact_claims_subset_of_source_plan", "omissions_explicit", "every_omission_recoverable_in_authorized_view", "derivations_explicit", "expansion_available", "deterministic_content_addressing", "owner_machine_renderer_match", "no_mutation_requested"],
    },
    agent_kernel_p2_task_projection: {
      owner: "Agent Kernel",
      pilot_surface: "agent-kernel.agent-interaction.task-inspection-projection-pilot",
      pilot_schema_version: 3,
      owner_policy_id: "agent-kernel.task-inspection-projection.pi-canary",
      owner_policy_version: 2,
      owner_policy_digest_sha256: "7572b417e81e9f8626bc4c3be7b19e2be8716a050dcb14b7a51411e07bb00be2",
      owner_surface: "task.show",
      owner_schema_version: 1,
      policy_path: "production_cli",
      declared_policy_target: "pi-agent-interaction-canary",
      resource: "task:4666",
      compact_protocol: "AK_TASK_COMPACT_PILOT_V1",
      policy_withheld_task_fields: ["description", "evidence", "result"],
      granted_envelope_fields: ["surface", "schema_version", "emitted_at", "payload_kind", "schema_locator", "ok", "payload", "error"],
      granted_task_fields: ["id", "repo", "title", "status", "priority", "claimed_by", "claimed_at", "lease_expires_at", "depends_on", "created_at", "completed_at", "scope", "entity_version"],
      validity_context: { experimental: true, operation: "read_only_projection", payload_kind: "task_detail", projection_protocol: "AK_TASK_COMPACT_PILOT_V1", schema_locator: "ak machine schema task-show", schema_version: 1 },
      compact_selected_task_fields: ["id", "repo", "title", "status", "priority", "claimed_by", "lease_expires_at", "depends_on", "scope", "entity_version"],
      mandatory_checks: { single_owner_snapshot: true, task_identity_preserved: true, entity_version_preserved: true, compact_claims_subset_of_source: true, selected_fields_within_owner_policy_grants: true, all_emitted_owner_values_within_policy_grants: true, policy_withheld_fields_absent: true, compact_omissions_distinguished_from_policy_withholding: true, control_content_json_encoded: true, freshness_generation_bound: true, same_generation_authorized_expansion_embedded: true, policy_resource_exact: true, production_resource_binding: "task:4666", caller_authentication_deferred_to_pi_receipt: true, mutation_command_requested: false },
    },
    rocs_owner_packet: {
      owner: "ROCS",
      packet_schema: "rocs.owner-packet.v1",
      payload_schema: "semantic-pack-result.v0",
      owner_policy_id: "rocs.semantic-pack.pi-canary",
      owner_policy_version: 1,
      digest_domain: "rocs.pack.v0",
    },
  },
  acquisition: { injected_owner_receipts_only: true, process_execution: false },
  limits: {
    input_bytes: INPUT_BYTE_CAP,
    output_bytes: OUTPUT_BYTE_CAP,
    source_leaves: SOURCE_LEAF_CAP,
    source_depth: SOURCE_DEPTH_CAP,
    compact_emitted_leaves: COMPACT_LEAF_CAP,
  },
  pointer_policy: {
    encoding: "RFC6901",
    sensitive_key_pattern: SENSITIVE_KEY.source,
    sensitive_key_flags: "iu",
    control_key_withholds_subtree: true,
    redacted_key_withholds_descendants: true,
    withheld_content_never_expandable: true,
    replacement_segment: "<redacted-key>",
  },
  value_redactions: {
    control_pattern: CONTROL.source,
    absolute_home_pattern: HOME_PATH.source,
    secret_token_pattern: SECRET_TOKEN.source,
    replacements: ["control-character", "absolute-home-prefix", "secret-token-pattern"],
    monotonic_across_views: true,
  },
  expansion_binding: {
    required: ["source_identity", "generation", "source_digest", "policy_digest"],
    exact_match: true,
    stateless_reinjection: true,
  },
  omissions: { exhaustive: true, policy_withheld_distinct_from_compact_cap: true },
}) as Json;
export const CANARY_POLICY_DIGEST = sha256(canonical(CANARY_POLICY));
const toolParameters = {
  type: "object", additionalProperties: false,
  required: ["provider", "source_identity", "receipt_json"],
  properties: {
    provider: { type: "string", enum: ["ts_quality_p1_retention", "agent_kernel_p2_task_projection", "rocs_owner_packet"] },
    source_identity: { type: "string", minLength: 1, maxLength: 512 },
    receipt_json: { type: "string", maxLength: INPUT_BYTE_CAP },
    view: { type: "string", enum: ["compact", "expand"], default: "compact" },
    expected_source_identity: { type: "string", maxLength: 512 },
    expected_generation: { type: "string", pattern: "^sha256:[a-f0-9]{64}$" },
    expected_source_digest: { type: "string", pattern: "^sha256:[a-f0-9]{64}$" },
    expected_policy_digest: { type: "string", pattern: "^sha256:[a-f0-9]{64}$" },
  },
} as any;
function deepFreeze<T>(value: T): T {
  if (value !== null && typeof value === "object") {
    for (const child of Object.values(value)) deepFreeze(child);
    Object.freeze(value);
  }
  return value;
}
function object(value: unknown, label: string): Record<string, unknown> {
  if (value === null || typeof value !== "object" || Array.isArray(value)) throw new Error(`${label} must be an object`);
  return value as Record<string, unknown>;
}
function exactKeys(value: Record<string, unknown>, keys: string[], label: string): void {
  const actual = Object.keys(value).sort(); const expected = [...keys].sort();
  if (JSON.stringify(actual) !== JSON.stringify(expected)) throw new Error(`${label} shape rejected`);
}
function canonical(value: Json): string {
  if (value === null || typeof value !== "object") return JSON.stringify(value);
  if (Array.isArray(value)) return `[${value.map(canonical).join(",")}]`;
  return `{${Object.keys(value).sort().map((key) => `${JSON.stringify(key)}:${canonical(value[key]!)}`).join(",")}}`;
}
function sha256(value: string): string { return `sha256:${createHash("sha256").update(value).digest("hex")}`; }
function bareDigest(value: unknown, label: string): string {
  if (typeof value !== "string" || !DIGEST.test(value)) throw new Error(`${label} digest rejected`);
  return value.startsWith("sha256:") ? value : `sha256:${value}`;
}
function equal(value: unknown, expected: unknown, label: string): void {
  if (value !== expected) throw new Error(`${label} join rejected`);
}
function parseReceipt(text: string): Record<string, unknown> {
  if (Buffer.byteLength(text) > INPUT_BYTE_CAP) throw new Error("injected owner receipt exceeds input byte cap");
  let value: unknown; try { value = JSON.parse(text); } catch { throw new Error("injected owner receipt is not JSON"); }
  return object(value, "owner receipt");
}
function resolvePointer(value: unknown, pointer: string): unknown {
  return pointer.split("/").slice(1).reduce<unknown>((current, token) => {
    if (current === null || typeof current !== "object") return undefined;
    return (current as Record<string, unknown>)[token.replaceAll("~1", "/").replaceAll("~0", "~")];
  }, value);
}
function exactJson(value: unknown, expected: unknown, label: string): void {
  if (canonical(value as Json) !== canonical(expected as Json)) throw new Error(`${label} equality rejected`);
}
function stringArray(value: unknown, label: string): string[] {
  if (!Array.isArray(value) || !value.every((item) => typeof item === "string")) throw new Error(`${label} shape rejected`);
  return value;
}
function requireExactChecks(checksValue: unknown, expected: Record<string, boolean>, label: string): void {
  const checks = object(checksValue, `${label} checks`); exactKeys(checks, Object.keys(expected), `${label} checks`);
  for (const [key, value] of Object.entries(expected)) equal(checks[key], value, `${label} mandatory check ${key}`);
}
function safeOwnerText(value: unknown): string { return String(value).replace(/[\t\r\n]+/gu, " ").trim(); }
function validateP1Structured(structured: Record<string, unknown>): void {
  exactKeys(structured, ["surface", "schemaVersion", "rootDir", "config", "keep", "ignore", "warnings"], "P1 structured plan");
  const config = object(structured.config, "P1 config");
  if (config.loaded === true) exactKeys(config, ["loaded", "path"], "P1 loaded config");
  else if (config.loaded === false) {
    const keys = Object.keys(config).sort();
    if (JSON.stringify(keys) !== JSON.stringify(["error", "loaded"]) && JSON.stringify(keys) !== JSON.stringify(["loaded"])) throw new Error("P1 failed config shape rejected");
  } else throw new Error("P1 config status rejected");
  for (const collection of ["keep", "ignore"] as const) {
    const entries = structured[collection];
    if (!Array.isArray(entries)) throw new Error(`P1 ${collection} shape rejected`);
    for (const item of entries) {
      const entry = object(item, `P1 ${collection} entry`); exactKeys(entry, ["status", "path", "reason"], `P1 ${collection} entry`);
      if (![entry.status, entry.path, entry.reason].every((value) => typeof value === "string")) throw new Error(`P1 ${collection} value rejected`);
    }
  }
  stringArray(structured.warnings, "P1 warnings");
}
function renderP1Compact(structured: Record<string, unknown>): string {
  const config = object(structured.config, "P1 config");
  const lines = ["TSQ_RETENTION_PLAN_V1", `root\t${safeOwnerText(structured.rootDir)}`,
    config.loaded === true ? `config\tok\tpath=${safeOwnerText(config.path ?? "")}` : `config\terror\tmessage=${safeOwnerText(config.error ?? "missing")}`];
  for (const collection of ["keep", "ignore"] as const) for (const value of structured[collection] as unknown[]) {
    const entry = object(value, `P1 ${collection} entry`); lines.push(`${collection}\t${safeOwnerText(entry.status ?? "pattern")}\t${safeOwnerText(entry.path)}\treason=${safeOwnerText(entry.reason)}`);
  }
  for (const warning of structured.warnings as string[]) lines.push(`warning\t${safeOwnerText(warning)}`);
  return `${lines.join("\n")}\n`;
}
function jsonAscii(value: unknown): string {
  return JSON.stringify(value).replace(/[\u0080-\uffff]/g, (character) => `\\u${character.charCodeAt(0).toString(16).padStart(4, "0")}`);
}
function renderP2Compact(snapshot: Record<string, unknown>, task: Record<string, unknown>, selected: string[], expandable: string[], withheld: string[]): string {
  const scope = task.scope;
  const scopeLines: string[] = [];
  if (scope === null) scopeLines.push("scope\tnull");
  else {
    const shape = object(scope, "P2 task scope"); exactKeys(shape, ["allowed_paths", "required_paths", "forbidden_paths"], "P2 task scope");
    const allowed = stringArray(shape.allowed_paths, "P2 allowed paths"); const required = stringArray(shape.required_paths, "P2 required paths"); const forbidden = stringArray(shape.forbidden_paths, "P2 forbidden paths");
    scopeLines.push(`scope\t${allowed.length}\t${required.length}\t${forbidden.length}`,
      ...allowed.map((value) => `a\t${jsonAscii(value)}`), ...required.map((value) => `r\t${jsonAscii(value)}`), ...forbidden.map((value) => `f\t${jsonAscii(value)}`));
  }
  if (!selected.includes("id")) throw new Error("P2 compact selection rejected");
  return ["AK_TASK_COMPACT_PILOT_V1", `s\t${jsonAscii(snapshot.surface)}\t${jsonAscii(snapshot.schema_version)}`,
    `t\t${jsonAscii(task.id)}\t${jsonAscii(task.entity_version)}\t${jsonAscii(task.status)}\t${jsonAscii(task.priority)}`,
    `repo\t${jsonAscii(task.repo)}`, `title\t${jsonAscii(task.title)}`,
    `claim\t${jsonAscii(task.claimed_by)}\t${jsonAscii(task.lease_expires_at)}`, `deps\t${jsonAscii(task.depends_on)}`,
    ...scopeLines, `omit_expandable\t${jsonAscii(expandable)}`, `withheld_by_policy\t${jsonAscii(withheld)}`,
    "expand_embedded\t/structured_authorized_expansion", ""].join("\n");
}
function adaptP1(receipt: Record<string, unknown>, requestedSource: string): OwnerBinding {
  exactKeys(receipt, ["pilot", "policy", "generation", "structured_owner_plan", "compact_projection", "redaction", "effects", "measurements", "checks"], "P1 receipt");
  const spec = CANARY_POLICY.providers.ts_quality_p1_retention as Record<string, Json>;
  const pilot = object(receipt.pilot, "P1 pilot"); const policy = object(receipt.policy, "P1 policy");
  const generation = object(receipt.generation, "P1 generation"); const compact = object(receipt.compact_projection, "P1 compact projection");
  const structured = object(receipt.structured_owner_plan, "P1 structured owner plan");
  exactKeys(pilot, ["surface", "schema_version", "experimental", "read_only", "authority", "compatibility_promise"], "P1 pilot");
  exactKeys(policy, ["id", "version", "digest_sha256", "owner_surface", "owner_schema_version", "declared_policy_target", "authentication", "allowed_source_pointers", "compact_omissions", "redactions", "validity_context"], "P1 policy");
  exactKeys(generation, ["plan_generation_digest_sha256", "digest_basis", "policy_digest_sha256"], "P1 generation");
  exactKeys(compact, ["protocol", "text", "plan_generation_digest_sha256", "policy_digest_sha256", "digest_sha256", "omissions", "recoverable_omissions", "derivations", "expansion_pointer"], "P1 compact projection");
  validateP1Structured(structured);
  equal(pilot.surface, spec.pilot_surface, "P1 pilot surface"); equal(pilot.schema_version, spec.pilot_schema_version, "P1 pilot schema"); equal(pilot.experimental, true, "P1 experimental"); equal(pilot.read_only, true, "P1 read-only"); equal(pilot.compatibility_promise, false, "P1 compatibility posture");
  equal(policy.id, spec.owner_policy_id, "P1 policy id"); equal(policy.version, spec.owner_policy_version, "P1 policy version");
  equal(policy.digest_sha256, spec.owner_policy_digest_sha256, "P1 policy digest"); equal(policy.owner_surface, spec.owner_surface, "P1 owner surface");
  equal(policy.owner_schema_version, spec.owner_schema_version, "P1 owner schema"); equal(policy.declared_policy_target, CANARY_POLICY.policy_target, "P1 declared policy target"); equal(policy.authentication, spec.authentication, "P1 authentication disclaimer");
  equal(canonical(policy.allowed_source_pointers as Json), canonical(spec.allowed_source_pointers as Json), "P1 allowed pointers");
  equal(canonical(policy.compact_omissions as Json), canonical(spec.compact_omissions as Json), "P1 compact omissions policy");
  equal(canonical(policy.redactions as Json), canonical(spec.redactions as Json), "P1 redactions policy");
  equal(structured.surface, policy.owner_surface, "P1 structured surface"); equal(structured.schemaVersion, policy.owner_schema_version, "P1 structured schema");
  equal(generation.policy_digest_sha256, policy.digest_sha256, "P1 generation policy"); equal(generation.digest_basis, spec.generation_digest_basis, "P1 generation basis");
  equal(bareDigest(generation.plan_generation_digest_sha256, "P1 post-redaction generation"), sha256(JSON.stringify(structured)), "P1 post-redaction generation digest");
  equal(compact.policy_digest_sha256, policy.digest_sha256, "P1 compact policy"); equal(compact.protocol, spec.compact_protocol, "P1 compact protocol");
  equal(compact.plan_generation_digest_sha256, generation.plan_generation_digest_sha256, "P1 generation");
  equal(bareDigest(compact.digest_sha256, "P1 compact"), sha256(String(compact.text)), "P1 compact digest");
  equal(compact.text, renderP1Compact(structured), "P1 compact text");
  const omissions = stringArray(compact.omissions, "P1 compact omissions");
  exactJson(omissions, policy.compact_omissions, "P1 policy/compact omissions");
  const recoverable = compact.recoverable_omissions;
  if (!Array.isArray(recoverable) || recoverable.length !== omissions.length) throw new Error("P1 recoverable omission shape rejected");
  for (let index = 0; index < omissions.length; index += 1) {
    const item = object(recoverable[index], "P1 recoverable omission"); exactKeys(item, ["pointer", "expansion_pointer", "recovered"], "P1 recoverable omission");
    equal(item.pointer, omissions[index], "P1 recoverable pointer"); equal(item.expansion_pointer, `/structured_owner_plan${omissions[index]}`, "P1 nested expansion pointer"); equal(item.recovered, true, "P1 recovered check");
    if (resolvePointer(structured, omissions[index]!) === undefined) throw new Error("P1 omission expansion join rejected");
  }
  equal(compact.expansion_pointer, "/structured_owner_plan", "P1 expansion pointer"); stringArray(compact.derivations, "P1 derivations");
  requireExactChecks(receipt.checks, Object.fromEntries((spec.mandatory_checks_true as string[]).map((key) => [key, true])), "P1");
  const redaction = object(receipt.redaction, "P1 redaction"); exactKeys(redaction, ["policy", "monotonic", "replacements"], "P1 redaction"); equal(redaction.monotonic, true, "P1 redaction monotonic");
  const effects = object(receipt.effects, "P1 effects"); exactKeys(effects, ["classification", "invocation_scope", "observed_api_scope", "reads", "all_observed_reads_within_policy_boundary", "writes_requested_by_pilot", "observation_limit"], "P1 effects");
  equal(effects.classification, "G3-read-effect-observed", "P1 owner effect classification"); equal(effects.all_observed_reads_within_policy_boundary, true, "P1 observed read boundary"); equal(effects.writes_requested_by_pilot, false, "P1 mutation posture");
  const validity = object(policy.validity_context, "P1 validity context");
  const expectedValidity = spec.validity_context as Record<string, Json>;
  exactKeys(validity, [...Object.keys(expectedValidity), "declared_policy_target", "policy_digest_sha256"], "P1 validity context");
  for (const [key, value] of Object.entries(expectedValidity)) equal(canonical(validity[key] as Json), canonical(value), `P1 validity ${key}`);
  equal(validity.policy_digest_sha256, policy.digest_sha256, "P1 validity policy"); equal(validity.declared_policy_target, policy.declared_policy_target, "P1 validity policy target");
  const source = `ts-quality:retention:${validity.fixture_root_coordinate}`;
  equal(requestedSource, source, "P1 source identity");
  return {
    owner: String(spec.owner), sourceIdentity: source,
    ownerGeneration: bareDigest(generation.plan_generation_digest_sha256, "P1 generation"),
    ownerSourceDigest: bareDigest(generation.plan_generation_digest_sha256, "P1 source"),
    ownerPolicyDigest: bareDigest(policy.digest_sha256, "P1 policy"), payload: receipt as Json,
  };
}
function adaptP2(receipt: Record<string, unknown>, requestedSource: string): OwnerBinding {
  exactKeys(receipt, ["applied_policy", "checks", "compact_projection", "measurements", "pilot", "structured_authorized_expansion", "verification"], "P2 receipt");
  const spec = CANARY_POLICY.providers.agent_kernel_p2_task_projection as Record<string, Json>;
  const pilot = object(receipt.pilot, "P2 pilot"); const policy = object(receipt.applied_policy, "P2 policy");
  const expansion = object(receipt.structured_authorized_expansion, "P2 authorized expansion");
  const compact = object(receipt.compact_projection, "P2 compact projection"); const coordinate = object(compact.source_coordinate, "P2 source coordinate");
  exactKeys(pilot, ["surface", "schema_version", "experimental", "read_only", "compatibility_promise", "operation_effect_posture"], "P2 pilot");
  exactKeys(policy, ["policy_path", "owner_surface", "declared_policy_target", "resource", "policy_id", "policy_version", "granted_envelope_fields", "granted_task_fields", "redacted_task_fields", "validity_context", "policy_digest_sha256"], "P2 policy");
  exactKeys(compact, ["protocol", "text", "source_coordinate", "compact_omitted_expandable_fields", "policy_withheld_source_fields", "expansion"], "P2 compact projection");
  exactKeys(coordinate, ["surface", "schema_version", "schema_locator", "emitted_at", "entity_version", "authorized_source_digest_sha256"], "P2 source coordinate");
  equal(pilot.surface, spec.pilot_surface, "P2 pilot surface"); equal(pilot.schema_version, spec.pilot_schema_version, "P2 pilot schema"); equal(pilot.experimental, true, "P2 experimental"); equal(pilot.read_only, true, "P2 read-only"); equal(pilot.compatibility_promise, false, "P2 compatibility posture");
  equal(policy.policy_id, spec.owner_policy_id, "P2 policy id"); equal(policy.policy_version, spec.owner_policy_version, "P2 policy version");
  equal(policy.policy_digest_sha256, spec.owner_policy_digest_sha256, "P2 policy digest"); equal(policy.owner_surface, spec.owner_surface, "P2 owner surface");
  equal(policy.policy_path, spec.policy_path, "P2 policy path"); equal(policy.declared_policy_target, CANARY_POLICY.policy_target, "P2 declared policy target"); equal(policy.resource, spec.resource, "P2 policy resource");
  equal(canonical(policy.granted_envelope_fields as Json), canonical(spec.granted_envelope_fields as Json), "P2 envelope grants");
  equal(canonical(policy.granted_task_fields as Json), canonical(spec.granted_task_fields as Json), "P2 task grants");
  equal(canonical(policy.redacted_task_fields as Json), canonical(spec.policy_withheld_task_fields as Json), "P2 task redactions");
  equal(canonical(policy.validity_context as Json), canonical(spec.validity_context as Json), "P2 validity context");
  const policyPreimage = { policy_path: policy.policy_path, owner_surface: policy.owner_surface, declared_policy_target: policy.declared_policy_target, resource: policy.resource, policy_id: policy.policy_id, policy_version: policy.policy_version, granted_envelope_fields: policy.granted_envelope_fields, granted_task_fields: policy.granted_task_fields, redacted_task_fields: policy.redacted_task_fields, validity_context: policy.validity_context } as Json;
  equal(bareDigest(policy.policy_digest_sha256, "P2 policy"), sha256(canonical(policyPreimage)), "P2 policy content digest");
  equal(compact.protocol, spec.compact_protocol, "P2 compact protocol");
  equal(expansion.surface, coordinate.surface, "P2 expansion surface"); equal(expansion.schema_version, coordinate.schema_version, "P2 expansion schema");
  equal(expansion.schema_locator, coordinate.schema_locator, "P2 schema locator"); equal(expansion.emitted_at, coordinate.emitted_at, "P2 emitted generation");
  exactKeys(expansion, policy.granted_envelope_fields as string[], "P2 authorized envelope grants");
  const payload = object(expansion.payload, "P2 expansion payload"); exactKeys(payload, ["task"], "P2 payload"); const task = object(payload.task, "P2 task");
  exactKeys(task, policy.granted_task_fields as string[], "P2 authorized task grants");
  equal(expansion.ok, true, "P2 owner envelope ok"); equal(expansion.error, null, "P2 owner envelope error"); equal(expansion.payload_kind, (spec.validity_context as Record<string, Json>).payload_kind, "P2 payload kind");
  const taskId = task.id; if (!Number.isInteger(taskId) || (taskId as number) < 1) throw new Error("P2 task id rejected");
  const source = `agent-kernel:task:${taskId}`; equal(requestedSource, source, "P2 task source id");
  equal(coordinate.entity_version, task.entity_version, "P2 entity generation");
  equal(bareDigest(coordinate.authorized_source_digest_sha256, "P2 source"), sha256(canonical(expansion as Json)), "P2 authorized source digest");
  const verification = object(receipt.verification, "P2 verification"); exactKeys(verification, ["selected_source_values", "policy_enforcement", "caller_authentication", "redaction"], "P2 verification");
  const selected = object(verification.selected_source_values, "P2 selected values");
  const selectedFields = spec.compact_selected_task_fields as string[]; exactKeys(selected, selectedFields, "P2 selected values");
  for (const field of selectedFields) exactJson(selected[field], task[field], `P2 selected value ${field}`);
  equal(selected.id, taskId, "P2 compact task source id"); equal(selected.entity_version, task.entity_version, "P2 selected generation");
  const withheld = spec.policy_withheld_task_fields as string[];
  if (withheld.some((field) => field in task)) throw new Error("P2 policy-withheld content present in expansion");
  const expandable = (policy.granted_task_fields as string[]).filter((field) => !selectedFields.includes(field)).sort();
  const expandablePointers = expandable.map((field) => `/payload/task/${field}`);
  exactJson(compact.compact_omitted_expandable_fields, expandablePointers, "P2 expandable omissions");
  const withheldPointers = withheld.map((field) => `/payload/task/${field}`);
  exactJson(compact.policy_withheld_source_fields, withheldPointers, "P2 policy withholding");
  const compactExpansion = object(compact.expansion, "P2 compact expansion"); exactKeys(compactExpansion, ["pointer", "same_generation", "authorization_boundary", "external_owner_expansion_advertised"], "P2 compact expansion");
  equal(compactExpansion.pointer, "/structured_authorized_expansion", "P2 expansion pointer"); equal(compactExpansion.same_generation, true, "P2 same generation"); equal(compactExpansion.authorization_boundary, "owner_pilot_policy", "P2 policy boundary"); equal(compactExpansion.external_owner_expansion_advertised, false, "P2 external expansion posture");
  const enforcement = object(verification.policy_enforcement, "P2 policy enforcement"); exactKeys(enforcement, ["basis", "declared_policy_target", "resource", "selected_fields", "caller_supplied_grants_accepted"], "P2 policy enforcement");
  equal(enforcement.basis, "owner_authored_immutable_pilot_policy", "P2 enforcement basis"); equal(enforcement.declared_policy_target, CANARY_POLICY.policy_target, "P2 enforcement policy target"); equal(enforcement.resource, "task:4666", "P2 enforcement resource"); exactJson(enforcement.selected_fields, selectedFields, "P2 enforcement selected fields"); equal(enforcement.caller_supplied_grants_accepted, false, "P2 caller grant posture");
  const callerAuthentication = object(verification.caller_authentication, "P2 caller authentication disclaimer"); exactKeys(callerAuthentication, ["authenticated_caller_asserted_by_pilot", "status", "authority", "enclosing_registered_pi_tool_execution_receipt", "proof_status", "required_for_live_canary_proof"], "P2 caller authentication disclaimer");
  equal(callerAuthentication.authenticated_caller_asserted_by_pilot, false, "P2 caller authentication assertion"); equal(callerAuthentication.status, "deferred_to_enclosing_registered_pi_tool_execution_receipt", "P2 authentication status"); equal(callerAuthentication.authority, "Pi/runtime", "P2 authentication authority"); equal(callerAuthentication.enclosing_registered_pi_tool_execution_receipt, null, "P2 enclosing receipt"); equal(callerAuthentication.proof_status, "not_present_in_standalone_sidecar_receipt", "P2 authentication proof status"); equal(callerAuthentication.required_for_live_canary_proof, true, "P2 live proof requirement");
  const verificationRedaction = object(verification.redaction, "P2 verification redaction"); exactKeys(verificationRedaction, ["basis", "withheld_fields", "withheld_values_emitted"], "P2 verification redaction"); equal(verificationRedaction.basis, "owner_authored_immutable_pilot_policy", "P2 redaction basis"); exactJson(verificationRedaction.withheld_fields, withheld, "P2 verification withheld fields"); equal(verificationRedaction.withheld_values_emitted, false, "P2 withheld emission");
  requireExactChecks(receipt.checks, spec.mandatory_checks as Record<string, boolean>, "P2");
  equal(compact.text, renderP2Compact(expansion, task, selectedFields, expandable, withheld), "P2 compact text");
  const ownerGeneration = sha256(canonical({ emitted_at: expansion.emitted_at as Json, entity_version: task.entity_version as Json, authorized_source_digest: bareDigest(coordinate.authorized_source_digest_sha256, "P2 source") }));
  return { owner: String(spec.owner), sourceIdentity: source, ownerGeneration, ownerSourceDigest: bareDigest(coordinate.authorized_source_digest_sha256, "P2 source"), ownerPolicyDigest: bareDigest(policy.policy_digest_sha256, "P2 policy"), payload: receipt as Json };
}
function rocsObjectDigest(payload: Record<string, unknown>): string {
  const preimage = { ...payload }; delete preimage.pack_digest;
  return `sha256:${createHash("sha256").update("rocs.pack.v0\0").update(canonical(preimage as Json)).digest("hex")}`;
}
function adaptRocs(packet: Record<string, unknown>, requestedSource: string): OwnerBinding {
  const spec = CANARY_POLICY.providers.rocs_owner_packet as Record<string, Json>;
  exactKeys(packet, ["packet_schema", "owner", "source_identity", "policy", "generation", "payload"], "ROCS owner packet");
  equal(packet.packet_schema, spec.packet_schema, "ROCS packet schema"); equal(packet.owner, spec.owner, "ROCS owner"); equal(packet.source_identity, requestedSource, "ROCS source identity");
  const policy = object(packet.policy, "ROCS policy"); exactKeys(policy, ["id", "version", "owner", "payload_schema", "digest_sha256"], "ROCS policy");
  equal(policy.id, spec.owner_policy_id, "ROCS policy id"); equal(policy.version, spec.owner_policy_version, "ROCS policy version"); equal(policy.owner, spec.owner, "ROCS policy owner"); equal(policy.payload_schema, spec.payload_schema, "ROCS policy schema");
  const policyPreimage = { id: policy.id, version: policy.version, owner: policy.owner, payload_schema: policy.payload_schema } as Json;
  equal(bareDigest(policy.digest_sha256, "ROCS policy"), sha256(canonical(policyPreimage)), "ROCS policy digest");
  const payload = object(packet.payload, "ROCS payload");
  exactKeys(payload, ["schema", "corpus_snapshot_digest", "root_id", "root_document_digest", "config", "documents", "pack_digest"], "ROCS payload");
  equal(payload.schema, spec.payload_schema, "ROCS payload schema");
  bareDigest(payload.corpus_snapshot_digest, "ROCS corpus snapshot"); bareDigest(payload.root_document_digest, "ROCS root document");
  const config = object(payload.config, "ROCS pack config"); exactKeys(config, ["max_depth", "rel_types", "include_relation_defs", "max_docs", "max_bytes"], "ROCS pack config");
  if (!Array.isArray(payload.documents) || payload.documents.length === 0) throw new Error("ROCS documents rejected");
  for (const item of payload.documents) {
    const document = object(item, "ROCS document"); exactKeys(document, ["ont_id", "kind", "logical_path", "document_digest", "text"], "ROCS document");
    bareDigest(document.document_digest, "ROCS document"); if (typeof document.text !== "string" || typeof document.ont_id !== "string") throw new Error("ROCS document rejected");
  }
  const rootId = payload.root_id;
  if (typeof rootId !== "string" || !/^[A-Za-z0-9_-]+(?:\.[A-Za-z0-9_-]+)+$/u.test(rootId) || SECRET_TOKEN_TEST.test(rootId)) throw new Error("ROCS root id rejected");
  equal(requestedSource, `rocs:pack:${rootId}`, "ROCS source coordinate");
  const generation = object(packet.generation, "ROCS generation"); exactKeys(generation, ["corpus_snapshot_digest", "root_document_digest"], "ROCS generation");
  equal(generation.corpus_snapshot_digest, payload.corpus_snapshot_digest, "ROCS corpus generation"); equal(generation.root_document_digest, payload.root_document_digest, "ROCS root generation");
  equal(bareDigest(payload.pack_digest, "ROCS pack"), rocsObjectDigest(payload), "ROCS pack digest");
  return { owner: String(spec.owner), sourceIdentity: requestedSource, ownerGeneration: sha256(canonical(generation as Json)), ownerSourceDigest: bareDigest(payload.pack_digest, "ROCS source"), ownerPolicyDigest: bareDigest(policy.digest_sha256, "ROCS policy"), payload: packet as Json };
}
function adapt(provider: Provider, receipt: Record<string, unknown>, source: string): OwnerBinding {
  if (provider === "ts_quality_p1_retention") return adaptP1(receipt, source);
  if (provider === "agent_kernel_p2_task_projection") return adaptP2(receipt, source);
  if (provider === "rocs_owner_packet") return adaptRocs(receipt, source);
  throw new Error("provider is not allowlisted");
}
function safePointerSegment(key: string): { segment: string; withheld: boolean } {
  const withheld = SENSITIVE_KEY.test(key) || CONTROL_TEST.test(key) || HOME_PATH_TEST.test(key) || SECRET_TOKEN_TEST.test(key);
  return { segment: withheld ? "<redacted-key>" : key.replaceAll("~", "~0").replaceAll("/", "~1"), withheld };
}
function redactValue(value: Json): { value: Json; redactions: string[] } {
  if (typeof value !== "string") return { value, redactions: [] };
  const redactions: string[] = [];
  let output = value.replace(CONTROL, () => { redactions.push("control-character"); return " "; });
  output = output.replace(HOME_PATH, () => { redactions.push("absolute-home-prefix"); return "<home>"; });
  output = output.replace(SECRET_TOKEN, () => { redactions.push("secret-token-pattern"); return "<redacted-secret>"; });
  return { value: output, redactions: [...new Set(redactions)] };
}
function project(payload: Json): { leaves: ProjectedLeaf[]; withheld: Omission[] } {
  const leaves: ProjectedLeaf[] = []; const withheld: Omission[] = []; let sourceLeaves = 0;
  const countHidden = (value: Json, depth: number): void => {
    if (depth > SOURCE_DEPTH_CAP) throw new Error("owner receipt exceeds source depth cap");
    if (value !== null && typeof value === "object") {
      const children = Array.isArray(value) ? value : Object.values(value);
      if (children.length === 0) { sourceLeaves += 1; if (sourceLeaves > SOURCE_LEAF_CAP) throw new Error("owner receipt exceeds source leaf cap"); }
      else for (const child of children) countHidden(child, depth + 1);
    } else { sourceLeaves += 1; if (sourceLeaves > SOURCE_LEAF_CAP) throw new Error("owner receipt exceeds source leaf cap"); }
  };
  const visit = (value: Json, pointer: string, depth: number): void => {
    if (depth > SOURCE_DEPTH_CAP) throw new Error("owner receipt exceeds source depth cap");
    if (value !== null && typeof value === "object") {
      const entries = Array.isArray(value) ? value.map((child, index) => [String(index), child] as const) : Object.entries(value);
      if (entries.length === 0) { sourceLeaves += 1; if (sourceLeaves > SOURCE_LEAF_CAP) throw new Error("owner receipt exceeds source leaf cap"); leaves.push({ pointer: pointer || "/", value, redactions: [] }); return; }
      for (const [key, child] of entries) {
        const safe = safePointerSegment(key); const childPointer = `${pointer}/${safe.segment}`;
        if (safe.withheld) { countHidden(child, depth + 1); withheld.push({ pointer: childPointer, reason: "policy-withheld" }); }
        else visit(child, childPointer, depth + 1);
      }
      return;
    }
    sourceLeaves += 1; if (sourceLeaves > SOURCE_LEAF_CAP) throw new Error("owner receipt exceeds source leaf cap");
    const redacted = redactValue(value); leaves.push({ pointer: pointer || "/", value: redacted.value, redactions: redacted.redactions });
  };
  visit(payload, "", 0); return { leaves, withheld };
}
function requireExpansionBinding(request: CanaryRequest, binding: Record<string, string>): void {
  const required = [request.expected_source_identity, request.expected_generation, request.expected_source_digest, request.expected_policy_digest];
  if (required.some((value) => value === undefined)) throw new Error("expand requires expected source identity, generation, source digest, and policy digest");
  equal(request.expected_source_identity, binding.source_identity, "expected source identity"); equal(request.expected_generation, binding.generation, "expected generation");
  equal(request.expected_source_digest, binding.source_digest, "expected source digest"); equal(request.expected_policy_digest, binding.policy_digest, "expected policy digest");
}
export async function runCanary(request: CanaryRequest, options: { observedPiInvocation?: "pi_tool" | "pi_command" } = {}): Promise<Record<string, unknown>> {
  if (!request || typeof request !== "object") throw new Error("request rejected");
  if (typeof request.source_identity !== "string" || request.source_identity.length === 0 || request.source_identity.length > 512 || CONTROL_TEST.test(request.source_identity)) throw new Error("source identity rejected");
  const receipt = parseReceipt(request.receipt_json); const owner = adapt(request.provider, receipt, request.source_identity);
  const payloadDigest = sha256(canonical(owner.payload));
  const generation = sha256(canonical({ provider: request.provider, owner: owner.owner, source_identity: owner.sourceIdentity, owner_generation: owner.ownerGeneration, owner_source_digest: owner.ownerSourceDigest, owner_policy_digest: owner.ownerPolicyDigest, consumer_policy_digest: CANARY_POLICY_DIGEST, payload_digest: payloadDigest } as Json));
  const sourceDigest = sha256(canonical({ provider: request.provider, owner: owner.owner, source_identity: owner.sourceIdentity, generation, owner_policy_digest: owner.ownerPolicyDigest, consumer_policy_digest: CANARY_POLICY_DIGEST, payload: owner.payload } as Json));
  const binding = { source_identity: owner.sourceIdentity, generation, source_digest: sourceDigest, policy_digest: CANARY_POLICY_DIGEST };
  const projected = project(owner.payload); const isExpand = request.view === "expand";
  if (isExpand) requireExpansionBinding(request, binding);
  const represented = isExpand ? projected.leaves : projected.leaves.slice(0, COMPACT_LEAF_CAP);
  const omissions: Omission[] = [...projected.withheld, ...(isExpand ? [] : projected.leaves.slice(COMPACT_LEAF_CAP).map((leaf) => ({ pointer: leaf.pointer, reason: "compact-leaf-cap" as const })))];
  const result = {
    schema: "agent_interaction_canary.v2", provider: request.provider, owner: owner.owner,
    execution_provenance: {
      extension: CANARY_POLICY.execution_provenance.extension,
      tool: TOOL_NAME,
      command: `/${COMMAND_NAME}`,
      observed_pi_invocation: options.observedPiInvocation ?? "direct_function_not_pi_observed",
      observation_scope: "registered_handler_entry_only",
      cryptographic_caller_authentication: false,
      observed_invocation_does_not_authenticate_caller: true,
      declared_policy_target: CANARY_POLICY.policy_target,
      owner_identity_interpretation: "declared_policy_target_only_not_authenticated_caller",
    },
    authority: `${owner.owner} remains authoritative`, pi_role: TRANSIENT_AUTHORITY_NOTICE, read_only: true,
    binding: { ...binding, owner_generation: owner.ownerGeneration, owner_source_digest: owner.ownerSourceDigest, owner_policy_digest: owner.ownerPolicyDigest, payload_digest: payloadDigest },
    view: isExpand ? "expand" : "compact", represented, omissions, omissions_exhaustive: true,
    ...(isExpand ? { same_generation_expansion: true } : { expansion: { view: "expand", expected_source_identity: binding.source_identity, expected_generation: binding.generation, expected_source_digest: binding.source_digest, expected_policy_digest: binding.policy_digest, reinject_same_owner_receipt: true } }),
  };
  if (Buffer.byteLength(JSON.stringify(result)) > OUTPUT_BYTE_CAP) throw new Error("projected result exceeds output byte cap");
  return result;
}
export default function agentInteractionCanary(pi: ExtensionAPI): void {
  pi.registerTool({
    name: TOOL_NAME, label: "Agent Interaction Canary",
    description: `Consume only injected ts-quality P1 retention receipts, Agent Kernel P2 task-projection receipts, or ROCS owner packets. No process or filesystem acquisition exists. ${TRANSIENT_AUTHORITY_NOTICE}`,
    promptSnippet: "Validate and inspect an injected owner receipt without transferring authority",
    promptGuidelines: [`Use ${TOOL_NAME} only with injected owner receipts; expansion requires all four compact binding values.`],
    parameters: toolParameters,
    async execute(_id, params) { const result = await runCanary(params as CanaryRequest, { observedPiInvocation: "pi_tool" }); return { content: [{ type: "text", text: JSON.stringify(result, null, 2) }], details: result }; },
  });
  pi.registerCommand(COMMAND_NAME, {
    description: "Validate and inspect one injected owner receipt JSON request",
    handler: async (args, ctx) => {
      try {
        if (Buffer.byteLength(args) > INPUT_BYTE_CAP * 2) throw new Error("command request exceeds byte cap");
        ctx.ui.notify(JSON.stringify(await runCanary(JSON.parse(args) as CanaryRequest, { observedPiInvocation: "pi_command" })), "info");
      } catch (error) { ctx.ui.notify(`Agent Interaction canary failed closed: ${error instanceof Error ? error.message : String(error)}`, "error"); }
    },
  });
}

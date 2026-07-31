/**
 * Fail-closed dispatch posture and immutable binding policy for Prompt Vault.
 */
import * as crypto from "node:crypto";
import * as fs from "node:fs";
import * as path from "node:path";

const VALID_CONTROL_MODES = new Set(["one_shot", "router", "loop"]);
const VALID_FORMALIZATION_LEVELS = new Set(["napkin", "bounded", "structured", "workflow"]);
const VALID_EXECUTION_SURFACES = new Set(["loop_execute", "workflow_execute"]);
const SAFE_PROJECTION_NAME = /^[A-Za-z0-9][A-Za-z0-9._-]*$/u;
const VALID_ARTIFACT_KINDS = new Set(["cognitive", "procedure"]);
const VALID_COMPANIES = new Set([
  "core",
  "software",
  "finance",
  "house",
  "health",
  "teaching",
  "holding",
]);
const PROJECTION_VOCABULARY = {
  routing_context: new Set(["analysis_followup", "review_followup", "review_closeout"]),
  activity_phase: new Set(["post_analysis", "post_review", "closeout"]),
  input_artifact: new Set(["analysis_output", "review_findings", "review_summary"]),
  transition_target_type: new Set(["framework_mode"]),
  selection_principles: new Set(["evidence_based", "constraint_preserving", "minimal_change"]),
  output_commitment: new Set(["exact_next_prompt"]),
};
const ownedDispatchPolicies = new WeakSet();
function projectionVocabularyValid(controlMode, value) {
  if (typeof value === "string") {
    try {
      value = JSON.parse(value);
    } catch {
      return false;
    }
  }
  if (value === null) return controlMode !== "router";
  if (!value || typeof value !== "object" || Array.isArray(value)) return false;
  const record = value;
  const dimensions = Object.keys(PROJECTION_VOCABULARY);
  if (Object.keys(record).some((key) => !dimensions.includes(key))) return false;
  if (controlMode === "router" && dimensions.some((key) => !(key in record))) return false;
  return dimensions.every((key) => {
    const candidate = record[key];
    if (candidate === undefined) return true;
    const allowed = PROJECTION_VOCABULARY[key];
    return key === "selection_principles"
      ? Array.isArray(candidate) &&
          candidate.length > 0 &&
          candidate.every((item) => typeof item === "string" && allowed.has(item))
      : typeof candidate === "string" && allowed.has(candidate);
  });
}
function projectionQuarantineReason(template) {
  const malformed =
    !SAFE_PROJECTION_NAME.test(template.name) ||
    typeof template.content !== "string" ||
    !template.content.trim() ||
    !Number.isInteger(template.version) ||
    Number(template.version) <= 0 ||
    typeof template.artifact_kind !== "string" ||
    typeof template.control_mode !== "string" ||
    typeof template.formalization_level !== "string" ||
    typeof template.owner_company !== "string" ||
    !Array.isArray(template.visibility_companies);
  if (malformed) return "malformed";
  const visibility = template.visibility_companies;
  if (
    !VALID_ARTIFACT_KINDS.has(template.artifact_kind) ||
    !VALID_CONTROL_MODES.has(template.control_mode) ||
    !VALID_FORMALIZATION_LEVELS.has(template.formalization_level) ||
    !VALID_COMPANIES.has(template.owner_company) ||
    visibility.length === 0 ||
    !visibility.includes(template.owner_company) ||
    visibility.some((company) => !VALID_COMPANIES.has(company)) ||
    !projectionVocabularyValid(template.control_mode, template.controlled_vocabulary)
  ) {
    return "unknown";
  }
  if (template.control_mode === "loop") return "unbound";
  if (template.formalization_level === "workflow") return "gated";
  return null;
}
function assertJcsCompatible(value, location = "value", seen = new Set()) {
  if (value === null || typeof value === "string" || typeof value === "boolean") return;
  if (typeof value === "number") {
    if (!Number.isFinite(value)) throw new Error(`${location} must contain only finite numbers.`);
    return;
  }
  if (typeof value !== "object") {
    throw new Error(`${location} contains unsupported ${typeof value}.`);
  }
  if (seen.has(value)) throw new Error(`${location} contains a cycle.`);
  seen.add(value);
  try {
    if (Array.isArray(value)) {
      for (let i = 0; i < value.length; i += 1) {
        if (!(i in value)) throw new Error(`${location} contains a sparse array.`);
        assertJcsCompatible(value[i], `${location}[${i}]`, seen);
      }
      return;
    }
    if (Object.getPrototypeOf(value) !== Object.prototype) {
      throw new Error(`${location} must contain only plain objects and arrays.`);
    }
    for (const key of Reflect.ownKeys(value)) {
      if (typeof key !== "string") throw new Error(`${location} contains a symbol key.`);
      const descriptor = Object.getOwnPropertyDescriptor(value, key);
      if (!descriptor || descriptor.get || descriptor.set) {
        throw new Error(`${location}.${key} must not use accessors.`);
      }
      if (descriptor.value === undefined)
        throw new Error(`${location}.${key} must not be undefined.`);
      assertJcsCompatible(descriptor.value, `${location}.${key}`, seen);
    }
  } finally {
    seen.delete(value);
  }
}
function canonicalize(value) {
  assertJcsCompatible(value);
  if (value === null || typeof value !== "object") return JSON.stringify(value);
  if (Array.isArray(value)) return `[${value.map((item) => canonicalize(item)).join(",")}]`;
  const object = value;
  return `{${Object.keys(object)
    .sort()
    .map((key) => `${JSON.stringify(key)}:${canonicalize(object[key])}`)
    .join(",")}}`;
}
export function canonicalJcsBytes(value) {
  return Buffer.from(canonicalize(value), "utf8");
}
export function sha256Hex(content) {
  return crypto.createHash("sha256").update(content).digest("hex");
}
function cloneJcs(value) {
  return JSON.parse(canonicalize(value));
}
function deepFreeze(value) {
  if (value && typeof value === "object" && !Object.isFrozen(value)) {
    for (const nested of Object.values(value)) deepFreeze(nested);
    Object.freeze(value);
  }
  return value;
}
export function createDispatchPolicy(options) {
  const ontologyContractVersion = String(options.ontologyContractVersion || "").trim();
  if (!ontologyContractVersion) throw new Error("ontologyContractVersion is required.");
  if (!options.bindings || Object.getPrototypeOf(options.bindings) !== Object.prototype) {
    throw new Error("bindings must be a plain object.");
  }
  const bindings = {};
  for (const [rawName, rawBinding] of Object.entries(options.bindings)) {
    const name = rawName.trim();
    if (!name || name !== rawName)
      throw new Error(`Invalid binding name: ${JSON.stringify(rawName)}.`);
    assertJcsCompatible(rawBinding, `bindings.${name}`);
    if (
      rawBinding.execution_required !== true ||
      !VALID_EXECUTION_SURFACES.has(rawBinding.execution_surface) ||
      rawBinding.on_missing_binding !== "fail_closed" ||
      !rawBinding.execution_args ||
      Object.getPrototypeOf(rawBinding.execution_args) !== Object.prototype ||
      (rawBinding.compositeCapable !== undefined &&
        typeof rawBinding.compositeCapable !== "boolean")
    ) {
      throw new Error(`Invalid execution binding for ${name}.`);
    }
    bindings[name] = cloneJcs(rawBinding);
  }
  const payload = { ontologyContractVersion, bindings };
  const frozenBindings = deepFreeze(bindings);
  const policy = deepFreeze({
    ontologyContractVersion,
    registryId: sha256Hex(canonicalJcsBytes(payload)),
    bindings: frozenBindings,
  });
  ownedDispatchPolicies.add(policy);
  return policy;
}
/** True only for immutable policies created by this loaded package module. */
export function isOwnedDispatchPolicy(policy) {
  return Boolean(
    policy &&
      typeof policy === "object" &&
      ownedDispatchPolicies.has(policy) &&
      Object.isFrozen(policy) &&
      Object.isFrozen(policy.bindings),
  );
}
export const D2E_WORKFLOW_TEMPLATE_OWNERS = Object.freeze({
  "layer12-040-direction-to-execution-ak-native": "software",
  "repo-direction-to-execution": "holding",
  "execution-memory-transfer": "core",
});
export const D2E_WORKFLOW_TEMPLATE_NAMES = Object.freeze(Object.keys(D2E_WORKFLOW_TEMPLATE_OWNERS));
function d2eWorkflowBinding(ownerCompany) {
  return {
    execution_required: true,
    execution_surface: "workflow_execute",
    execution_args: {
      workflow_gate: "D2E_TRANSFER_COMPLETE_V1",
      template_artifact_kind: "procedure",
      template_control_mode: "one_shot",
      template_formalization_level: "workflow",
      template_owner_company: ownerCompany,
    },
    on_missing_binding: "fail_closed",
    compositeCapable: false,
  };
}
const DEFAULT_BINDINGS = {
  "transcendent-iteration": {
    execution_required: true,
    execution_surface: "loop_execute",
    execution_args: { loop: "transcendent" },
    on_missing_binding: "fail_closed",
    compositeCapable: false,
  },
  ...Object.fromEntries(
    Object.entries(D2E_WORKFLOW_TEMPLATE_OWNERS).map(([name, owner]) => [
      name,
      d2eWorkflowBinding(owner),
    ]),
  ),
  ooda: {
    execution_required: true,
    execution_surface: "loop_execute",
    execution_args: { loop: "ooda" },
    on_missing_binding: "fail_closed",
    compositeCapable: false,
  },
};
export const DEFAULT_DISPATCH_POLICY = createDispatchPolicy({
  ontologyContractVersion: "prompt-vault-v9",
  bindings: DEFAULT_BINDINGS,
});
export function classifyDispatchPosture(template, policy = DEFAULT_DISPATCH_POLICY) {
  const name = String(template.name || "");
  const controlMode = String(template.control_mode || "");
  const formalizationLevel = String(template.formalization_level || "");
  const base = {
    template_name: name,
    control_mode: controlMode,
    formalization_level: formalizationLevel,
    registry_id: policy.registryId,
  };
  if (
    !VALID_CONTROL_MODES.has(controlMode) ||
    !VALID_FORMALIZATION_LEVELS.has(formalizationLevel)
  ) {
    return {
      ...base,
      posture: "invalid_metadata_fail_closed",
      binding: null,
      reason: `Template "${name}" has unknown governed dispatch metadata. Execution must fail closed.`,
    };
  }
  if (controlMode === "loop") {
    const binding = policy.bindings[name] ?? null;
    if (!binding) {
      return {
        ...base,
        posture: "missing_execution_binding_fail_closed",
        binding: null,
        reason: `Template "${name}" has control_mode=loop but no known execution binding. Execution must fail closed until an owner-approved binding exists.`,
      };
    }
    return {
      ...base,
      posture: "orchestrator_loop_required",
      binding,
      reason: `Template "${name}" requires ${binding.execution_surface}(${JSON.stringify(binding.execution_args)}); raw text execution is not lawful.`,
    };
  }
  if (formalizationLevel === "workflow") {
    const binding = policy.bindings[name] ?? null;
    if (binding?.execution_surface === "workflow_execute") {
      return {
        ...base,
        posture: "orchestrator_workflow_required",
        binding,
        reason: `Template "${name}" requires ${binding.execution_surface}(${JSON.stringify(binding.execution_args)}); raw text execution is not lawful.`,
      };
    }
    return {
      ...base,
      posture: "orchestrator_workflow_gate_required",
      binding: null,
      reason: `Template "${name}" has formalization_level=workflow. Orchestrator dispatch gating is required, but no concrete workflow executor binding is verified.`,
    };
  }
  return {
    ...base,
    posture: "text_ok",
    binding: null,
    reason: `Template "${name}" is governed as text-safe. Text-only assistant execution is lawful.`,
  };
}
export function isTextOk(posture) {
  return posture === "text_ok";
}
export function isOrchestratorGateRequired(posture) {
  return posture !== "text_ok";
}
export function formatDispatchPosture(result) {
  const lines = [
    `# Dispatch Posture: ${result.template_name}`,
    "",
    `- posture: **${result.posture}**`,
    `- control_mode: ${result.control_mode}`,
    `- formalization_level: ${result.formalization_level}`,
    `- registry_id: ${result.registry_id}`,
  ];
  if (result.binding) {
    lines.push(
      `- execution_surface: ${result.binding.execution_surface}`,
      `- execution_args: ${JSON.stringify(result.binding.execution_args)}`,
    );
  }
  lines.push("", `> ${result.reason}`);
  return lines.join("\n");
}
const PI_PROMPTS_DIR =
  process.env.PI_PROMPTS_DIR || path.join(process.env.HOME || "/home/user", ".pi/agent/prompts");
export function checkProjectionFreshness(template) {
  const { name, content, version, status } = template;
  if (template.export_to_pi !== true || status !== "active") {
    return {
      template_name: name,
      status: "not_exported",
      db_version: version ?? null,
      db_content_sha256: null,
      local_file_path: null,
      local_content_sha256: null,
      message: `Template "${name}" is not actively exported to Pi prompts.`,
    };
  }
  const localPath = SAFE_PROJECTION_NAME.test(name)
    ? path.join(PI_PROMPTS_DIR, `${name}.md`)
    : null;
  const receiptPath = path.join(PI_PROMPTS_DIR, ".prompt-vault-export-state.json");
  const sourceDigest = sha256Hex(content);
  let receipt = null;
  try {
    receipt = JSON.parse(fs.readFileSync(receiptPath, "utf8"));
  } catch {
    receipt = null;
  }
  if (
    !receipt ||
    receipt.schema !== "prompt-vault/pi-export-receipt/v2" ||
    receipt.policy !== "prompt-vault/raw-pi-projection-policy/v1"
  ) {
    return {
      template_name: name,
      status: "error",
      db_version: version ?? null,
      db_content_sha256: sourceDigest,
      local_file_path: localPath,
      local_content_sha256: null,
      message: `Projection receipt v2 is missing or invalid at ${receiptPath}.`,
    };
  }
  const exportedEntries = receipt.templates ?? [];
  const quarantinedEntries = receipt.quarantined ?? [];
  const exportedNames = exportedEntries.map((item) => item.name);
  const quarantinedNames = quarantinedEntries.map((item) => item.name);
  const allNames = [...exportedNames, ...quarantinedNames];
  if (
    !allNames.every((item) => typeof item === "string" && item.length > 0) ||
    new Set(allNames).size !== allNames.length ||
    receipt.exported_count !== exportedEntries.length ||
    receipt.quarantined_count !== quarantinedEntries.length ||
    receipt.candidate_count !== allNames.length
  ) {
    return {
      template_name: name,
      status: "error",
      db_version: version ?? null,
      db_content_sha256: sourceDigest,
      local_file_path: localPath,
      local_content_sha256: null,
      message: "Projection receipt inventory is duplicated, overlapping, or count-inconsistent.",
    };
  }
  const quarantined = quarantinedEntries.find((item) => item.name === name);
  if (quarantined) {
    const absent = localPath === null || !fs.existsSync(localPath);
    const expectedReason = projectionQuarantineReason(template);
    const expectedFacets = {
      artifact_kind: template.artifact_kind,
      control_mode: template.control_mode,
      formalization_level: template.formalization_level,
      owner_company: template.owner_company,
      visibility_companies: template.visibility_companies,
      controlled_vocabulary: template.controlled_vocabulary ?? null,
    };
    let facetsExact = false;
    try {
      facetsExact = canonicalJcsBytes(quarantined.facets).equals(canonicalJcsBytes(expectedFacets));
    } catch {
      facetsExact = false;
    }
    const exact =
      Number(quarantined.version) === Number(version) &&
      quarantined.content_sha256 === sourceDigest &&
      quarantined.reason === expectedReason &&
      facetsExact;
    return {
      template_name: name,
      status: absent && exact ? "quarantined" : "stale",
      db_version: version ?? null,
      db_content_sha256: sourceDigest,
      local_file_path: localPath,
      local_content_sha256: null,
      message:
        absent && exact
          ? `Raw Pi projection is correctly quarantined (${String(quarantined.reason)}).`
          : "Quarantine receipt or raw-file absence does not match DB truth.",
    };
  }
  const expectedContent = `${content.replace(/\n+$/u, "")}\n`;
  const expectedDigest = sha256Hex(expectedContent);
  const exported = exportedEntries.find((item) => item.name === name);
  if (localPath === null) {
    return {
      template_name: name,
      status: "stale",
      db_version: version ?? null,
      db_content_sha256: sourceDigest,
      local_file_path: null,
      local_content_sha256: null,
      message: "Unsafe template names cannot have raw Pi projections.",
    };
  }
  let localContent;
  try {
    localContent = fs.readFileSync(localPath, "utf8");
  } catch {
    return {
      template_name: name,
      status: "no_local_file",
      db_version: version ?? null,
      db_content_sha256: sourceDigest,
      local_file_path: localPath,
      local_content_sha256: null,
      message: `No exported file or quarantine entry matches ${name}.`,
    };
  }
  const localDigest = sha256Hex(localContent);
  const exact =
    exported?.path === `${name}.md` &&
    exported?.sha256 === expectedDigest &&
    Number(exported?.version) === Number(version) &&
    localDigest === expectedDigest;
  return {
    template_name: name,
    status: exact ? "fresh" : "stale",
    db_version: version ?? null,
    db_content_sha256: sourceDigest,
    local_file_path: localPath,
    local_content_sha256: localDigest,
    message: exact
      ? `Local projection receipt and file are fresh (v${version ?? "?"}).`
      : `Local projection or receipt differs from DB v${version ?? "?"}.`,
  };
}
export function formatProjectionFreshness(result) {
  const statusLabel =
    result.status === "fresh"
      ? "✓ FRESH"
      : result.status === "quarantined"
        ? "✓ QUARANTINED"
        : result.status === "stale"
          ? "✗ STALE"
          : result.status === "no_local_file"
            ? "⚠ NO LOCAL FILE"
            : result.status === "not_exported"
              ? "— NOT EXPORTED"
              : "✗ ERROR";
  return `- ${result.template_name}: ${statusLabel} — ${result.message}`;
}
export function getKnownLoopBindings() {
  return DEFAULT_DISPATCH_POLICY.bindings;
}
/** @deprecated Active dispatch policies are immutable. Construct a new runtime policy instead. */
export function registerLoopBinding(_name, _binding) {
  throw new Error(
    "Dispatch binding policies are immutable; use createDispatchPolicy at runtime construction.",
  );
}

// summary: classify vault templates into lawful text, loop, workflow-gate, or fail-closed dispatch postures.
// read_when:
//   - adding execution bindings or checking projection freshness and orchestration requirements.

/**
 * Fail-closed dispatch posture and immutable binding policy for Prompt Vault.
 */

import * as crypto from "node:crypto";
import * as fs from "node:fs";
import * as path from "node:path";

export type DispatchPosture =
  | "text_ok"
  | "orchestrator_loop_required"
  | "orchestrator_workflow_gate_required"
  | "missing_execution_binding_fail_closed"
  | "invalid_metadata_fail_closed";

export interface ExecutionBinding {
  execution_required: true;
  execution_surface: "loop_execute" | "workflow_execute";
  execution_args: Record<string, unknown>;
  on_missing_binding: "fail_closed";
  compositeCapable?: boolean;
}

export interface DispatchPostureResult {
  posture: DispatchPosture;
  template_name: string;
  control_mode: string;
  formalization_level: string;
  binding: Readonly<ExecutionBinding> | null;
  reason: string;
  registry_id: string;
}

export interface FrozenDispatchPolicy {
  readonly ontologyContractVersion: string;
  readonly registryId: string;
  readonly bindings: Readonly<Record<string, Readonly<ExecutionBinding>>>;
}

export interface ProjectionFreshnessResult {
  template_name: string;
  status: "fresh" | "quarantined" | "stale" | "not_exported" | "no_local_file" | "error";
  db_version: number | null;
  db_content_sha256: string | null;
  local_file_path: string | null;
  local_content_sha256: string | null;
  message: string;
  freshness_scope?: "template";
  global_freshness?: "not_checked";
}

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
} as const;
const ownedDispatchPolicies = new WeakSet<object>();

function projectionVocabularyValid(controlMode: string | undefined, value: unknown): boolean {
  if (typeof value === "string") {
    try {
      value = JSON.parse(value);
    } catch {
      return false;
    }
  }
  if (value === null) return controlMode !== "router";
  if (!value || typeof value !== "object" || Array.isArray(value)) return false;
  const record = value as Record<string, unknown>;
  const dimensions = Object.keys(PROJECTION_VOCABULARY);
  if (Object.keys(record).some((key) => !dimensions.includes(key))) return false;
  if (controlMode === "router" && dimensions.some((key) => !(key in record))) return false;
  return dimensions.every((key) => {
    const candidate = record[key];
    if (candidate === undefined) return true;
    const allowed = PROJECTION_VOCABULARY[key as keyof typeof PROJECTION_VOCABULARY];
    return key === "selection_principles"
      ? Array.isArray(candidate) &&
          candidate.length > 0 &&
          candidate.every((item) => typeof item === "string" && allowed.has(item as never))
      : typeof candidate === "string" && allowed.has(candidate as never);
  });
}

function projectionQuarantineReason(template: {
  name: string;
  content: string;
  version?: number | null;
  artifact_kind?: string;
  control_mode?: string;
  formalization_level?: string;
  owner_company?: string;
  visibility_companies?: string[];
  controlled_vocabulary?: unknown;
}): "malformed" | "unknown" | "unbound" | "gated" | null {
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
  const visibility = template.visibility_companies as string[];
  if (
    !VALID_ARTIFACT_KINDS.has(template.artifact_kind as string) ||
    !VALID_CONTROL_MODES.has(template.control_mode as string) ||
    !VALID_FORMALIZATION_LEVELS.has(template.formalization_level as string) ||
    !VALID_COMPANIES.has(template.owner_company as string) ||
    visibility.length === 0 ||
    !visibility.includes(template.owner_company as string) ||
    visibility.some((company) => !VALID_COMPANIES.has(company)) ||
    !projectionVocabularyValid(template.control_mode, template.controlled_vocabulary)
  ) {
    return "unknown";
  }
  if (template.control_mode === "loop") return "unbound";
  if (template.formalization_level === "workflow") return "gated";
  return null;
}

function assertJcsCompatible(value: unknown, location = "value", seen = new Set<object>()): void {
  if (value === null || typeof value === "string" || typeof value === "boolean") return;
  if (typeof value === "number") {
    if (!Number.isFinite(value)) throw new Error(`${location} must contain only finite numbers.`);
    return;
  }
  if (typeof value !== "object") {
    throw new Error(`${location} contains unsupported ${typeof value}.`);
  }
  if (seen.has(value as object)) throw new Error(`${location} contains a cycle.`);
  seen.add(value as object);
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
    seen.delete(value as object);
  }
}

function canonicalize(value: unknown): string {
  assertJcsCompatible(value);
  if (value === null || typeof value !== "object") return JSON.stringify(value);
  if (Array.isArray(value)) return `[${value.map((item) => canonicalize(item)).join(",")}]`;
  const object = value as Record<string, unknown>;
  return `{${Object.keys(object)
    .sort()
    .map((key) => `${JSON.stringify(key)}:${canonicalize(object[key])}`)
    .join(",")}}`;
}

export function canonicalJcsBytes(value: unknown): Buffer {
  return Buffer.from(canonicalize(value), "utf8");
}

export function sha256Hex(content: string | Buffer): string {
  return crypto.createHash("sha256").update(content).digest("hex");
}

function cloneJcs<T>(value: T): T {
  return JSON.parse(canonicalize(value)) as T;
}

function deepFreeze<T>(value: T): Readonly<T> {
  if (value && typeof value === "object" && !Object.isFrozen(value)) {
    for (const nested of Object.values(value as Record<string, unknown>)) deepFreeze(nested);
    Object.freeze(value);
  }
  return value;
}

export function createDispatchPolicy(options: {
  ontologyContractVersion: string;
  bindings: Record<string, ExecutionBinding>;
}): FrozenDispatchPolicy {
  const ontologyContractVersion = String(options.ontologyContractVersion || "").trim();
  if (!ontologyContractVersion) throw new Error("ontologyContractVersion is required.");
  if (!options.bindings || Object.getPrototypeOf(options.bindings) !== Object.prototype) {
    throw new Error("bindings must be a plain object.");
  }
  const bindings: Record<string, ExecutionBinding> = {};
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
  const frozenBindings = deepFreeze(bindings) as Readonly<
    Record<string, Readonly<ExecutionBinding>>
  >;
  const policy = deepFreeze({
    ontologyContractVersion,
    registryId: sha256Hex(canonicalJcsBytes(payload)),
    bindings: frozenBindings,
  }) as FrozenDispatchPolicy;
  ownedDispatchPolicies.add(policy);
  return policy;
}

/** True only for immutable policies created by this loaded package module. */
export function isOwnedDispatchPolicy(policy: unknown): policy is FrozenDispatchPolicy {
  return Boolean(
    policy &&
      typeof policy === "object" &&
      ownedDispatchPolicies.has(policy as object) &&
      Object.isFrozen(policy) &&
      Object.isFrozen((policy as FrozenDispatchPolicy).bindings),
  );
}

export const D2E_WORKFLOW_TEMPLATE_OWNERS = Object.freeze({
  "layer12-040-direction-to-execution-ak-native": "software",
  "repo-direction-to-execution": "holding",
} as const);
export const D2E_EXECUTION_MEMORY_TEMPLATE_NAME = "execution-memory-transfer" as const;
export const D2E_EXECUTION_MEMORY_TEMPLATE_OWNER = "core" as const;
export const D2E_WORKFLOW_TEMPLATE_NAMES = Object.freeze(
  Object.keys(D2E_WORKFLOW_TEMPLATE_OWNERS) as Array<keyof typeof D2E_WORKFLOW_TEMPLATE_OWNERS>,
);

function d2eWorkflowBinding(ownerCompany: string): ExecutionBinding {
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

function d2eExecutionMemoryBinding(): ExecutionBinding {
  return {
    execution_required: true,
    execution_surface: "workflow_execute",
    execution_args: {
      workflow_gate: "D2E_EXECUTION_MEMORY_V1",
      template_artifact_kind: "procedure",
      template_control_mode: "one_shot",
      template_formalization_level: "workflow",
      template_owner_company: D2E_EXECUTION_MEMORY_TEMPLATE_OWNER,
    },
    on_missing_binding: "fail_closed",
    compositeCapable: false,
  };
}

const DEFAULT_BINDINGS: Record<string, ExecutionBinding> = {
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
  [D2E_EXECUTION_MEMORY_TEMPLATE_NAME]: d2eExecutionMemoryBinding(),
  ooda: {
    execution_required: true,
    execution_surface: "loop_execute",
    execution_args: { loop: "ooda" },
    on_missing_binding: "fail_closed",
    compositeCapable: false,
  },
  "deep-review": {
    execution_required: true,
    execution_surface: "workflow_execute",
    execution_args: {
      workflow_id: "deep-review.v1",
      request: {
        mode: "chain",
        steps: [{ kind: "step", agent: "reviewer", objective: "$OBJECTIVE" }],
      },
    },
    on_missing_binding: "fail_closed",
    compositeCapable: false,
  },
};

export const DEFAULT_DISPATCH_POLICY = createDispatchPolicy({
  ontologyContractVersion: "prompt-vault-v9",
  bindings: DEFAULT_BINDINGS,
});

export function classifyDispatchPosture(
  template: { name: string; control_mode: string; formalization_level: string },
  policy: FrozenDispatchPolicy = DEFAULT_DISPATCH_POLICY,
): DispatchPostureResult {
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
    if (!binding || binding.execution_surface !== "loop_execute") {
      return {
        ...base,
        posture: "missing_execution_binding_fail_closed",
        binding: null,
        reason: `Template "${name}" has control_mode=loop but no verified loop_execute binding. Execution must fail closed until an owner-approved binding exists.`,
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
        posture: "orchestrator_workflow_gate_required",
        binding,
        reason: `Template "${name}" requires the verified workflow_execute binding ${JSON.stringify(binding.execution_args)}; raw text execution is not lawful.`,
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

export function isTextOk(posture: DispatchPosture): boolean {
  return posture === "text_ok";
}

export function isOrchestratorGateRequired(posture: DispatchPosture): boolean {
  return posture !== "text_ok";
}

export function formatDispatchPosture(result: DispatchPostureResult): string {
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

interface ProjectionTemplate {
  id?: number;
  name: string;
  content: string;
  artifact_kind?: string;
  control_mode?: string;
  formalization_level?: string;
  owner_company?: string;
  visibility_companies?: string[];
  controlled_vocabulary?: unknown;
  export_to_pi?: boolean;
  version?: number | null;
  status?: string | null;
}

function readOwnedProjectionFile(filePath: string): string {
  const ancestors: Array<{ path: string; dev: number; ino: number }> = [];
  for (let parent = path.dirname(filePath); ; parent = path.dirname(parent)) {
    const entry = fs.lstatSync(parent);
    if (!entry.isDirectory() || entry.isSymbolicLink()) {
      throw new Error("Projection directory contains a symlink or non-directory.");
    }
    ancestors.push({ path: parent, dev: entry.dev, ino: entry.ino });
    if (parent === path.dirname(parent)) break;
  }
  const descriptor = fs.openSync(
    filePath,
    fs.constants.O_RDONLY | fs.constants.O_NOFOLLOW | fs.constants.O_NONBLOCK,
  );
  try {
    const before = fs.fstatSync(descriptor);
    if (
      !before.isFile() ||
      before.nlink !== 1 ||
      (process.getuid && before.uid !== process.getuid())
    )
      throw new Error("Projection evidence is not an owned regular file with one link.");
    const text = fs.readFileSync(descriptor, "utf8");
    const after = fs.fstatSync(descriptor);
    const current = fs.lstatSync(filePath);
    if (
      current.isSymbolicLink() ||
      current.dev !== before.dev ||
      current.ino !== before.ino ||
      current.nlink !== 1 ||
      after.size !== before.size ||
      after.mtimeMs !== before.mtimeMs ||
      after.ctimeMs !== before.ctimeMs ||
      current.mtimeMs !== after.mtimeMs ||
      current.ctimeMs !== after.ctimeMs
    )
      throw new Error("Projection evidence changed during inspection.");
    for (const ancestor of ancestors) {
      const entry = fs.lstatSync(ancestor.path);
      if (entry.isSymbolicLink() || entry.dev !== ancestor.dev || entry.ino !== ancestor.ino) {
        throw new Error("Projection directory changed during inspection.");
      }
    }
    return text;
  } finally {
    fs.closeSync(descriptor);
  }
}

function checkScopedProjection(
  template: ProjectionTemplate,
  receiptPath: string,
  localPath: string,
  vaultDir: string | undefined,
): ProjectionFreshnessResult {
  const result: ProjectionFreshnessResult = {
    template_name: template.name,
    status: "error",
    db_version: template.version ?? null,
    db_content_sha256: sha256Hex(template.content),
    local_file_path: localPath,
    local_content_sha256: null,
    freshness_scope: "template",
    global_freshness: "not_checked",
    message: "Scoped projection evidence is invalid.",
  };
  try {
    const receipt = JSON.parse(readOwnedProjectionFile(receiptPath));
    if (
      !receipt ||
      receipt.schema !== "prompt-vault/pi-scoped-template-receipt/v1" ||
      receipt.policy !== "prompt-vault/raw-pi-projection-policy/v1" ||
      receipt.state !== "complete"
    )
      throw new Error(
        "Scoped receipt is malformed or incomplete; inspect or recover it before use.",
      );
    if (!vaultDir || !Number.isSafeInteger(template.id) || Number(template.id) <= 0) {
      throw new Error(
        "Scoped freshness requires the current source Vault directory and template ID.",
      );
    }
    if (
      receipt.source?.vault_dir !== fs.realpathSync(vaultDir) ||
      receipt.source?.template_id !== template.id ||
      receipt.target?.templates_dir !== path.resolve(PI_PROMPTS_DIR) ||
      receipt.template?.name !== template.name ||
      receipt.template?.path !== `${template.name}.md`
    )
      throw new Error("Scoped receipt belongs to another Vault, template, or target directory.");
    const supportedLevel =
      template.formalization_level === "bounded" ||
      (template.artifact_kind === "cognitive" &&
        ["napkin", "structured"].includes(template.formalization_level ?? ""));
    if (
      !/^[A-Za-z0-9][A-Za-z0-9._-]{0,63}$/u.test(template.name) ||
      template.name.includes("..") ||
      template.control_mode !== "one_shot" ||
      !supportedLevel ||
      projectionQuarantineReason(template)
    ) {
      throw new Error("Current template policy does not permit a scoped raw projection.");
    }
    const projected = `${template.content.replace(/\n+$/u, "")}\n`;
    const expected = {
      schema: "prompt-vault/pi-scoped-template-receipt/v1",
      state: "complete",
      policy: "prompt-vault/raw-pi-projection-policy/v1",
      source: { vault_dir: fs.realpathSync(vaultDir), template_id: template.id },
      target: { templates_dir: path.resolve(PI_PROMPTS_DIR) },
      template: {
        name: template.name,
        path: `${template.name}.md`,
        version: template.version,
        content_sha256: result.db_content_sha256,
        projected_sha256: sha256Hex(projected),
        facets: {
          artifact_kind: template.artifact_kind,
          control_mode: template.control_mode,
          formalization_level: template.formalization_level,
          owner_company: template.owner_company,
          visibility_companies: template.visibility_companies,
          controlled_vocabulary: template.controlled_vocabulary ?? null,
        },
      },
    };
    const localContent = readOwnedProjectionFile(localPath);
    result.local_content_sha256 = sha256Hex(localContent);
    const exact =
      canonicalJcsBytes(receipt).equals(canonicalJcsBytes(expected)) && localContent === projected;
    result.status = exact ? "fresh" : "stale";
    result.message = exact
      ? `Scoped receipt and file are fresh (v${template.version}); global inventory freshness was not checked.`
      : "Scoped receipt or file differs from current DB content, version, or governance.";
  } catch (error) {
    result.message = error instanceof Error ? error.message : String(error);
  }
  return result;
}

export function checkProjectionFreshness(
  template: ProjectionTemplate,
  options: { vaultDir?: string } = {},
): ProjectionFreshnessResult {
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
  if (localPath !== null) {
    const scopedPath = path.join(PI_PROMPTS_DIR, `.prompt-vault-scoped-${name}.json`);
    try {
      fs.lstatSync(scopedPath);
      return checkScopedProjection(template, scopedPath, localPath, options.vaultDir);
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code !== "ENOENT") {
        return {
          template_name: name,
          status: "error",
          db_version: version ?? null,
          db_content_sha256: sourceDigest,
          local_file_path: localPath,
          local_content_sha256: null,
          message: "Scoped receipt could not be inspected.",
        };
      }
    }
  }
  let receipt: {
    schema?: string;
    policy?: string;
    candidate_count?: number;
    exported_count?: number;
    quarantined_count?: number;
    templates?: Array<Record<string, unknown>>;
    quarantined?: Array<Record<string, unknown>>;
  } | null = null;
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
  let localContent: string;
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

export function formatProjectionFreshness(result: ProjectionFreshnessResult): string {
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

export function getKnownLoopBindings(): Readonly<Record<string, Readonly<ExecutionBinding>>> {
  return DEFAULT_DISPATCH_POLICY.bindings;
}

/** @deprecated Active dispatch policies are immutable. Construct a new runtime policy instead. */
export function registerLoopBinding(_name: string, _binding: ExecutionBinding): never {
  throw new Error(
    "Dispatch binding policies are immutable; use createDispatchPolicy at runtime construction.",
  );
}

import * as crypto from "node:crypto";
import {
  canonicalJcsBytes,
  classifyDispatchPosture,
  createDispatchPolicy,
  DEFAULT_DISPATCH_POLICY,
  isOwnedDispatchPolicy,
  sha256Hex,
} from "./dispatchPosture.js";
import { createVaultRuntime } from "./vaultDb.js";

const DISPATCH_CONTEXT_ERROR =
  "Explicit company context is required for vault dispatch checks. Set PI_COMPANY or run from a company-scoped cwd.";
const VALID_ARTIFACT_KINDS = new Set(["cognitive", "procedure"]);
const VALID_CONTROL_MODES = new Set(["one_shot", "router", "loop"]);
const VALID_FORMALIZATION_LEVELS = new Set(["napkin", "bounded", "structured", "workflow"]);
const VALID_EXECUTION_SURFACES = new Set([
  "vault_command",
  "live_trigger",
  "route",
  "grounding",
  "prompt_plane_selection",
  "prompt_plane_continuation",
  "orchestrator_adapter",
  "projected_prompt",
]);
const VALID_COMPANIES = new Set([
  "core",
  "software",
  "finance",
  "house",
  "health",
  "teaching",
  "holding",
]);
const CONTROLLED_VOCABULARY = {
  routing_context: new Set(["analysis_followup", "review_followup", "review_closeout"]),
  activity_phase: new Set(["post_analysis", "post_review", "closeout"]),
  input_artifact: new Set(["analysis_output", "review_findings", "review_summary"]),
  transition_target_type: new Set(["framework_mode"]),
  selection_principles: new Set(["evidence_based", "constraint_preserving", "minimal_change"]),
  output_commitment: new Set(["exact_next_prompt"]),
};
const CONTROLLED_DIMENSIONS = Object.keys(CONTROLLED_VOCABULARY);
function hasValidControlledVocabulary(controlMode, value) {
  if (value === null) return controlMode !== "router";
  if (
    !value ||
    typeof value !== "object" ||
    Array.isArray(value) ||
    Object.getPrototypeOf(value) !== Object.prototype
  )
    return false;
  const record = value;
  if (Object.keys(record).some((key) => !CONTROLLED_DIMENSIONS.includes(key))) return false;
  if (controlMode === "router" && CONTROLLED_DIMENSIONS.some((key) => !(key in record)))
    return false;
  for (const key of CONTROLLED_DIMENSIONS) {
    const candidate = record[key];
    if (candidate === undefined) continue;
    const allowed = CONTROLLED_VOCABULARY[key];
    if (key === "selection_principles") {
      if (
        !Array.isArray(candidate) ||
        candidate.length === 0 ||
        candidate.some((item) => typeof item !== "string" || !allowed.has(item))
      )
        return false;
    } else if (typeof candidate !== "string" || !allowed.has(candidate)) return false;
  }
  return true;
}
const ownedDispatchRuntimes = new WeakSet();
export function isVaultDispatchRuntime(value) {
  return Boolean(value && typeof value === "object" && ownedDispatchRuntimes.has(value));
}
function normalizeNames(templateNames) {
  return [...new Set(templateNames.map((name) => String(name).trim()).filter(Boolean))];
}
function resolveDispatchCompanyContext(runtime, ctx) {
  const explicitCompany = typeof ctx?.currentCompany === "string" ? ctx.currentCompany.trim() : "";
  const companyContext = runtime.resolveCurrentCompanyContext(ctx?.cwd);
  if (explicitCompany) {
    if (
      companyContext.source !== "contract-default" &&
      companyContext.company !== explicitCompany
    ) {
      return {
        ok: false,
        error: `Explicit currentCompany (${explicitCompany}) conflicts with resolved company context (${companyContext.company} via ${companyContext.source}).`,
      };
    }
    return {
      ok: true,
      currentCompany: explicitCompany,
      companySource:
        companyContext.source !== "contract-default"
          ? companyContext.source
          : "explicit:currentCompany",
    };
  }
  if (companyContext.source === "contract-default")
    return { ok: false, error: DISPATCH_CONTEXT_ERROR };
  return { ok: true, currentCompany: companyContext.company, companySource: companyContext.source };
}
function selectDispatchTemplateColumns() {
  return [
    "id",
    "name",
    "description",
    "content",
    "artifact_kind",
    "control_mode",
    "formalization_level",
    "owner_company",
    "visibility_companies",
    "controlled_vocabulary",
    "status",
    "export_to_pi",
    "version",
  ].join(",\n          ");
}
function parseJsonField(value) {
  if (typeof value !== "string") return value;
  try {
    return JSON.parse(value);
  } catch {
    return Symbol.for("invalid-json");
  }
}
function parseDatabaseBoolean(value) {
  if (typeof value === "boolean") return value;
  if (typeof value === "number" && (value === 0 || value === 1)) return value === 1;
  if (typeof value === "string") {
    const normalized = value.trim().toLowerCase();
    if (normalized === "1" || normalized === "true") return true;
    if (normalized === "0" || normalized === "false") return false;
  }
  return null;
}
function strictTemplate(raw) {
  const id = Number(raw.id);
  const version = Number(raw.version);
  const visibility = parseJsonField(raw.visibility_companies);
  const vocabulary =
    raw.controlled_vocabulary == null ? null : parseJsonField(raw.controlled_vocabulary);
  const exportEligible = parseDatabaseBoolean(raw.export_to_pi);
  if (
    !Number.isInteger(id) ||
    id <= 0 ||
    !Number.isInteger(version) ||
    version <= 0 ||
    typeof raw.name !== "string" ||
    !raw.name.trim() ||
    typeof raw.content !== "string" ||
    raw.status !== "active" ||
    exportEligible !== true ||
    typeof raw.artifact_kind !== "string" ||
    !VALID_ARTIFACT_KINDS.has(raw.artifact_kind) ||
    typeof raw.control_mode !== "string" ||
    !VALID_CONTROL_MODES.has(raw.control_mode) ||
    typeof raw.formalization_level !== "string" ||
    !VALID_FORMALIZATION_LEVELS.has(raw.formalization_level) ||
    typeof raw.owner_company !== "string" ||
    !VALID_COMPANIES.has(raw.owner_company) ||
    !Array.isArray(visibility) ||
    visibility.some((company) => typeof company !== "string" || !VALID_COMPANIES.has(company)) ||
    !hasValidControlledVocabulary(raw.control_mode, vocabulary)
  )
    return null;
  try {
    canonicalJcsBytes(vocabulary);
  } catch {
    return null;
  }
  return {
    id,
    version,
    name: raw.name,
    description: typeof raw.description === "string" ? raw.description : "",
    content: raw.content,
    artifact_kind: raw.artifact_kind,
    control_mode: raw.control_mode,
    formalization_level: raw.formalization_level,
    owner_company: raw.owner_company,
    visibility_companies: [...visibility],
    controlled_vocabulary: vocabulary,
    status: "active",
    export_to_pi: true,
  };
}
function blocked(reason, safeMessage) {
  return {
    schema: "pi.vault.dispatch-authorization.v1",
    disposition: "blocked",
    reason,
    safeMessage,
  };
}
function bindingBytes(binding) {
  return canonicalJcsBytes(binding);
}
function authorizeRequest(request, policy) {
  const company = String(request.currentCompany || "").trim();
  if (!VALID_EXECUTION_SURFACES.has(request.surface))
    return blocked("unsupported_surface", "The requested execution surface is not governed.");
  if (!VALID_COMPANIES.has(company))
    return blocked("company_context_conflict", "A valid explicit company context is required.");
  if (!Array.isArray(request.templates) || request.templates.length === 0)
    return blocked("missing_template", "At least one template is required.");
  const seen = new Set();
  const subjects = [];
  const postures = [];
  for (const template of request.templates) {
    if (seen.has(template.name))
      return blocked("partial_batch", "Each aggregate member must occur exactly once.");
    seen.add(template.name);
    if (
      !Number.isInteger(template.id) ||
      (template.id ?? 0) <= 0 ||
      !Number.isInteger(template.version) ||
      (template.version ?? 0) <= 0
    ) {
      return blocked("invalid_identity", "Executable templates require positive ID and version.");
    }
    if (template.status !== "active")
      return blocked("inactive_template", "An aggregate member is not active.");
    if (template.export_to_pi !== true)
      return blocked("export_ineligible", "An aggregate member is not execution eligible.");
    if (
      !VALID_ARTIFACT_KINDS.has(String(template.artifact_kind)) ||
      !VALID_CONTROL_MODES.has(String(template.control_mode)) ||
      !VALID_FORMALIZATION_LEVELS.has(String(template.formalization_level)) ||
      !VALID_COMPANIES.has(String(template.owner_company)) ||
      !Array.isArray(template.visibility_companies) ||
      !template.visibility_companies.includes(company) ||
      !hasValidControlledVocabulary(String(template.control_mode), template.controlled_vocabulary)
    ) {
      return blocked(
        "unknown_governed_value",
        "An aggregate member has invalid governed metadata.",
      );
    }
    const metadata = {
      artifact_kind: template.artifact_kind,
      control_mode: template.control_mode,
      formalization_level: template.formalization_level,
      owner_company: template.owner_company,
      visibility_companies: template.visibility_companies,
      controlled_vocabulary: template.controlled_vocabulary,
      status: template.status,
      export_to_pi: template.export_to_pi,
      ontology_contract_version: policy.ontologyContractVersion,
    };
    try {
      canonicalJcsBytes(metadata);
    } catch {
      return blocked("unknown_governed_value", "Governed metadata is not canonicalizable.");
    }
    subjects.push({
      templateId: template.id,
      templateName: template.name,
      templateVersion: template.version,
      contentSha256: sha256Hex(template.content),
      governedMetadataSha256: sha256Hex(canonicalJcsBytes(metadata)),
      resolvedCompany: company,
    });
    postures.push(classifyDispatchPosture(template, policy));
  }
  const primaryIndex = request.templates.findIndex(
    (template) => template.name === request.primaryTemplateName,
  );
  if (primaryIndex < 0)
    return blocked("missing_template", "The aggregate primary template is missing.");
  if (postures.some((posture) => posture.posture === "invalid_metadata_fail_closed"))
    return blocked("unknown_governed_value", "Unknown dispatch metadata blocks execution.");
  if (
    postures.some(
      (posture) =>
        posture.posture === "missing_execution_binding_fail_closed" ||
        posture.posture === "orchestrator_workflow_gate_required",
    )
  ) {
    return blocked("missing_binding", "A governed execution binding is missing.");
  }
  const gated = postures.filter((posture) => posture.posture === "orchestrator_loop_required");
  if (gated.length > 0 && gated.length !== postures.length)
    return blocked("mixed_disposition", "Mixed text and dispatch dispositions are not executable.");
  let binding = null;
  if (gated.length > 0) {
    binding = gated[0].binding;
    if (!binding) return blocked("missing_binding", "A governed execution binding is missing.");
    const canonical = bindingBytes(binding);
    if (
      gated.length > 1 &&
      (!binding.compositeCapable ||
        gated.some((item) => !item.binding || !bindingBytes(item.binding).equals(canonical)))
    ) {
      return blocked(
        "incompatible_bindings",
        "Composite dispatch members do not share one composite-capable binding.",
      );
    }
  }
  const preparation = {
    renderer: request.renderer ?? "package-owned",
    rendererVersion: request.rendererVersion ?? "1",
    wrapper: request.wrapper ?? "none",
    contextSha256: sha256Hex(request.context ?? ""),
    argumentsSha256: sha256Hex(canonicalJcsBytes(request.args ?? [])),
  };
  const aggregate = Object.freeze({
    primary: subjects[primaryIndex],
    members: Object.freeze(subjects),
    compositionKind: request.compositionKind ?? "single",
    finalPreparedBytesSha256: sha256Hex(request.finalPreparedText),
    preparation: Object.freeze(preparation),
  });
  const base = {
    schema: "pi.vault.dispatch-authorization.v1",
    authorizationId: crypto.randomUUID(),
    aggregate,
    surface: request.surface,
    registryId: policy.registryId,
  };
  return binding
    ? {
        ...base,
        disposition: "dispatch_required",
        binding,
        revalidateImmediatelyBeforeDispatch: true,
      }
    : { ...base, disposition: "text_ready", revalidateImmediatelyBeforeSend: true };
}
function revalidateIssuedAuthorization(runtime, policy, entry) {
  const names = entry.request.templates.map((template) => template.name);
  const escapedNames = names.map((name) => `'${runtime.escapeSql(name)}'`).join(", ");
  const result = runtime.queryVaultJsonDetailed(`
    SELECT ${selectDispatchTemplateColumns()}
    FROM prompt_templates
    WHERE name IN (${escapedNames})
      AND status = 'active'
      AND export_to_pi = true
      AND ${runtime.buildVisibilityPredicate(entry.request.currentCompany)}
    ORDER BY name
  `);
  if (!result.ok) return false;
  const rows = result.value.rows ?? [];
  const templates = rows.map(strictTemplate);
  if (templates.length !== names.length || templates.some((template) => template === null))
    return false;
  const byName = new Map(templates.map((template) => [template.name, template]));
  const ordered = names.map((name) => byName.get(name)).filter((template) => Boolean(template));
  if (ordered.length !== names.length) return false;
  const current = authorizeRequest({ ...entry.request, templates: ordered }, policy);
  if (current.disposition === "blocked" || current.disposition !== entry.value.disposition)
    return false;
  if (!canonicalJcsBytes(current.aggregate).equals(canonicalJcsBytes(entry.value.aggregate)))
    return false;
  if (
    current.disposition === "dispatch_required" &&
    entry.value.disposition === "dispatch_required"
  ) {
    return bindingBytes(current.binding).equals(bindingBytes(entry.value.binding));
  }
  return true;
}
export function createVaultDispatchRuntime(options = {}) {
  const runtime = options.runtime ?? createVaultRuntime();
  const policy = options.policy ?? DEFAULT_DISPATCH_POLICY;
  if (!isOwnedDispatchPolicy(policy)) {
    throw new Error("Dispatch policy must be an immutable package-created policy.");
  }
  const issued = new Map();
  const dispatchRuntime = {
    policy,
    async checkTemplates(templateNames, ctx = {}) {
      const names = normalizeNames(templateNames);
      if (names.length === 0)
        return {
          ok: false,
          status: "blocked",
          blocking_reason: "At least one template name is required for a dispatch check.",
        };
      const companyContext = resolveDispatchCompanyContext(runtime, ctx);
      if (!companyContext.ok)
        return { ok: false, status: "blocked", blocking_reason: companyContext.error };
      const escapedNames = names.map((name) => `'${runtime.escapeSql(name)}'`).join(", ");
      const result = runtime.queryVaultJsonDetailed(`
        SELECT ${selectDispatchTemplateColumns()}
        FROM prompt_templates
        WHERE name IN (${escapedNames})
          AND status = 'active'
          AND export_to_pi = true
          AND ${runtime.buildVisibilityPredicate(companyContext.currentCompany)}
        ORDER BY name
      `);
      if (!result.ok) return { ok: false, status: "blocked", blocking_reason: result.error };
      const rawRows = result.value.rows ?? [];
      const rawNames = new Set(
        rawRows.map((row) => (typeof row.name === "string" ? row.name : "")),
      );
      const missing = names.filter((name) => !rawNames.has(name));
      if (missing.length > 0) {
        return {
          ok: false,
          status: "blocked",
          missing,
          current_company: companyContext.currentCompany,
          current_company_source: companyContext.companySource,
          blocking_reason:
            "One or more requested templates are missing, invisible, inactive, or export-ineligible.",
        };
      }
      const templates = rawRows.map(strictTemplate);
      if (templates.some((template) => template === null)) {
        return {
          ok: false,
          status: "blocked",
          current_company: companyContext.currentCompany,
          current_company_source: companyContext.companySource,
          blocking_reason:
            "One or more requested templates has invalid governed metadata or identity.",
        };
      }
      const results = templates.map((template) => classifyDispatchPosture(template, policy));
      if (
        results.some(
          (item) =>
            item.posture === "invalid_metadata_fail_closed" ||
            item.posture === "missing_execution_binding_fail_closed" ||
            item.posture === "orchestrator_workflow_gate_required",
        )
      ) {
        return {
          ok: false,
          status: "blocked",
          results,
          missing: [],
          current_company: companyContext.currentCompany,
          current_company_source: companyContext.companySource,
          blocking_reason:
            "One or more requested templates cannot execute through a verified binding.",
        };
      }
      return {
        ok: true,
        status: "ready",
        results,
        missing: [],
        current_company: companyContext.currentCompany,
        current_company_source: companyContext.companySource,
      };
    },
    authorizePreparedExecution(request) {
      const authorization = authorizeRequest(request, policy);
      if (authorization.disposition !== "blocked") {
        issued.set(authorization.authorizationId, {
          state: "issued",
          sealedText: request.finalPreparedText,
          value: authorization,
          request: structuredClone(request),
        });
      }
      return authorization;
    },
    claimPreparedExecution(authorizationId) {
      const entry = issued.get(authorizationId);
      if (!entry || entry.state !== "issued")
        return {
          ok: false,
          reason: "invalid_authorization_state",
          error: "Authorization is unknown, forged, claimed, or terminal.",
        };
      entry.state = "claiming";
      if (!revalidateIssuedAuthorization(runtime, policy, entry)) {
        entry.state = "failed";
        return {
          ok: false,
          reason: "identity_drift",
          error:
            "Authorization identity drifted or could not be revalidated immediately before claim.",
        };
      }
      entry.state = "claimed";
      return {
        ok: true,
        value: {
          authorizationId,
          disposition: entry.value.disposition,
          sealedText: entry.sealedText,
          binding: entry.value.disposition === "dispatch_required" ? entry.value.binding : null,
          aggregate: entry.value.aggregate,
          surface: entry.value.surface,
        },
      };
    },
    settlePreparedExecution(authorizationId, outcome) {
      const entry = issued.get(authorizationId);
      if (!entry || entry.state !== "claimed") return false;
      entry.state = outcome;
      return true;
    },
  };
  ownedDispatchRuntimes.add(dispatchRuntime);
  return dispatchRuntime;
}
export { createDispatchPolicy };

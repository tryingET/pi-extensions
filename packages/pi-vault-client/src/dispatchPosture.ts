/**
 * Dispatch posture classifier for Prompt Vault templates.
 *
 * When an operator asks to use/run/apply/execute/continue/improve with a Prompt
 * Vault template, this module classifies the required dispatch posture so the
 * runtime can enforce it instead of silently degrading to text-only assistant
 * interpretation.
 *
 * Ontological basis:
 * - Prompt template content = information artifact/specification
 * - control_mode = control topology (one_shot / router / loop)
 * - formalization_level = representation grade (napkin / bounded / structured / workflow)
 * - Runtime execution = event/occurrence
 * - execution_binding = the missing middle object between specification and execution
 *
 * Key invariants:
 * - control_mode=loop ALWAYS requires orchestrator_loop_required
 * - formalization_level=workflow ALWAYS requires at least orchestrator_dispatch_gate
 * - text_ok is only returned when neither condition holds
 * - missing_execution_binding_fail_closed is returned when no known loop binding exists
 *   for a control_mode=loop template
 */

import * as crypto from "node:crypto";
import * as fs from "node:fs";
import * as path from "node:path";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export type DispatchPosture =
  | "text_ok"
  | "orchestrator_loop_required"
  | "orchestrator_workflow_gate_required"
  | "missing_execution_binding_fail_closed";

export interface DispatchPostureResult {
  posture: DispatchPosture;
  template_name: string;
  control_mode: string;
  formalization_level: string;
  binding: ExecutionBinding | null;
  reason: string;
}

export interface ExecutionBinding {
  execution_required: true;
  execution_surface: "loop_execute" | "workflow_execute";
  execution_args: Record<string, unknown>;
  on_missing_binding: "fail_closed";
}

export interface ProjectionFreshnessResult {
  template_name: string;
  status: "fresh" | "stale" | "not_exported" | "no_local_file" | "error";
  db_version: number | null;
  db_content_sha256: string | null;
  local_file_path: string | null;
  local_content_sha256: string | null;
  message: string;
}

// ---------------------------------------------------------------------------
// Known loop bindings
// ---------------------------------------------------------------------------

/**
 * Maps Prompt Vault template names to their orchestrator execution bindings.
 *
 * This is the single source of truth for which vault templates map to which
 * orchestrator surfaces. Add new bindings here when new control_mode=loop
 * templates are introduced.
 *
 * Convention: the loop type name in the orchestrator (e.g. "transcendent")
 * is NOT the same as the Prompt Vault template name (e.g. "transcendent-iteration").
 * The binding is explicit, not derived from naming conventions.
 */
const KNOWN_LOOP_BINDINGS: Record<string, ExecutionBinding> = {
  "transcendent-iteration": {
    execution_required: true,
    execution_surface: "loop_execute",
    execution_args: { loop: "transcendent" },
    on_missing_binding: "fail_closed",
  },
  ooda: {
    execution_required: true,
    execution_surface: "loop_execute",
    execution_args: { loop: "ooda" },
    on_missing_binding: "fail_closed",
  },
};

// ---------------------------------------------------------------------------
// Dispatch posture classification
// ---------------------------------------------------------------------------

/**
 * Classify the dispatch posture required for a given template.
 *
 * Rules (applied in order):
 * 1. control_mode=loop with a known binding → orchestrator_loop_required
 * 2. control_mode=loop without a known binding → missing_execution_binding_fail_closed
 * 3. formalization_level=workflow (and not loop) → orchestrator_workflow_gate_required
 * 4. Otherwise → text_ok
 */
export function classifyDispatchPosture(template: {
  name: string;
  control_mode: string;
  formalization_level: string;
}): DispatchPostureResult {
  const { name, control_mode, formalization_level } = template;

  if (control_mode === "loop") {
    const binding = KNOWN_LOOP_BINDINGS[name] ?? null;
    if (binding) {
      return {
        posture: "orchestrator_loop_required",
        template_name: name,
        control_mode,
        formalization_level,
        binding,
        reason: `Template "${name}" has control_mode=loop with a known binding to ${binding.execution_surface}(${JSON.stringify(binding.execution_args)}). Text-only execution is not lawful.`,
      };
    }
    return {
      posture: "missing_execution_binding_fail_closed",
      template_name: name,
      control_mode,
      formalization_level,
      binding: null,
      reason: `Template "${name}" has control_mode=loop but no known execution binding. Execution must fail closed until a binding is added to the dispatch posture registry.`,
    };
  }

  if (formalization_level === "workflow") {
    return {
      posture: "orchestrator_workflow_gate_required",
      template_name: name,
      control_mode,
      formalization_level,
      binding: null,
      reason: `Template "${name}" has formalization_level=workflow. Orchestrator dispatch gating is required before execution; text-only interpretation is not lawful for run/apply/execute actions.`,
    };
  }

  return {
    posture: "text_ok",
    template_name: name,
    control_mode,
    formalization_level,
    binding: null,
    reason: `Template "${name}" does not require orchestrator dispatch gating. Text-only assistant interpretation is lawful for retrieval/inspection.`,
  };
}

/**
 * Check whether a given dispatch posture allows text-only assistant interpretation.
 */
export function isTextOk(posture: DispatchPosture): boolean {
  return posture === "text_ok";
}

/**
 * Check whether a given dispatch posture requires an orchestrator gate.
 */
export function isOrchestratorGateRequired(posture: DispatchPosture): boolean {
  return (
    posture === "orchestrator_loop_required" ||
    posture === "orchestrator_workflow_gate_required" ||
    posture === "missing_execution_binding_fail_closed"
  );
}

/**
 * Format a dispatch posture result as a human-readable string.
 */
export function formatDispatchPosture(result: DispatchPostureResult): string {
  const lines = [
    `# Dispatch Posture: ${result.template_name}`,
    "",
    `- posture: **${result.posture}**`,
    `- control_mode: ${result.control_mode}`,
    `- formalization_level: ${result.formalization_level}`,
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

// ---------------------------------------------------------------------------
// Projection freshness
// ---------------------------------------------------------------------------

const PI_PROMPTS_DIR =
  process.env.PI_PROMPTS_DIR || path.join(process.env.HOME || "/home/user", ".pi/agent/prompts");

/**
 * Compute SHA-256 of a string, returning hex digest.
 */
function sha256Hex(content: string): string {
  return crypto.createHash("sha256").update(content, "utf8").digest("hex");
}

/**
 * Check projection freshness for a single export_to_pi template.
 *
 * Compares the DB template content digest against the local Pi prompt file.
 */
export function checkProjectionFreshness(template: {
  name: string;
  content: string;
  export_to_pi?: boolean;
  version?: number | null;
  status?: string | null;
}): ProjectionFreshnessResult {
  const { name, content, version, status } = template;
  const exportToPi = template.export_to_pi ?? false;

  if (!exportToPi || status !== "active") {
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

  const localPath = path.join(PI_PROMPTS_DIR, `${name}.md`);
  const dbDigest = sha256Hex(content);

  let localContent: string;
  try {
    localContent = fs.readFileSync(localPath, "utf8");
  } catch {
    return {
      template_name: name,
      status: "no_local_file",
      db_version: version ?? null,
      db_content_sha256: dbDigest,
      local_file_path: localPath,
      local_content_sha256: null,
      message: `No local Pi prompt file found at ${localPath}. DB version ${version ?? "?"} has not been materialized.`,
    };
  }

  const localDigest = sha256Hex(localContent);

  if (localDigest === dbDigest) {
    return {
      template_name: name,
      status: "fresh",
      db_version: version ?? null,
      db_content_sha256: dbDigest,
      local_file_path: localPath,
      local_content_sha256: localDigest,
      message: `Local projection is fresh (v${version ?? "?"}).`,
    };
  }

  return {
    template_name: name,
    status: "stale",
    db_version: version ?? null,
    db_content_sha256: dbDigest,
    local_file_path: localPath,
    local_content_sha256: localDigest,
    message: `Local projection is STALE. DB v${version ?? "?"} content differs from ${localPath}. Re-export required.`,
  };
}

/**
 * Format a projection freshness result as a human-readable string.
 */
export function formatProjectionFreshness(result: ProjectionFreshnessResult): string {
  const statusLabel =
    result.status === "fresh"
      ? "✓ FRESH"
      : result.status === "stale"
        ? "✗ STALE"
        : result.status === "no_local_file"
          ? "⚠ NO LOCAL FILE"
          : result.status === "not_exported"
            ? "— NOT EXPORTED"
            : "✗ ERROR";
  return `- ${result.template_name}: ${statusLabel} — ${result.message}`;
}

// ---------------------------------------------------------------------------
// Registry access
// ---------------------------------------------------------------------------

/**
 * Get all known loop bindings. Useful for diagnostics and testing.
 */
export function getKnownLoopBindings(): Readonly<Record<string, ExecutionBinding>> {
  return { ...KNOWN_LOOP_BINDINGS };
}

/**
 * Register or update a loop binding at runtime.
 * This is primarily useful for testing or for dynamically loaded plugins.
 */
export function registerLoopBinding(name: string, binding: ExecutionBinding): void {
  (KNOWN_LOOP_BINDINGS as Record<string, ExecutionBinding>)[name] = binding;
}

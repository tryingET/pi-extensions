/** Closed owner-dimension shape validation for Decision 100 observations. */

import { exactRecord, fail } from "./d2e-execution-memory-request.ts";

export function requireArray(value: unknown, label: string): unknown[] {
  if (!Array.isArray(value)) {
    fail("D2E_EXECUTION_MEMORY_ENVELOPE_INVALID", `${label} must be an array.`);
  }
  return value;
}

function requireBoolean(value: unknown, label: string): boolean {
  if (typeof value !== "boolean") {
    fail("D2E_EXECUTION_MEMORY_ENVELOPE_INVALID", `${label} must be a boolean.`);
  }
  return value;
}

export function validateDecisionLifecycle(value: unknown): void {
  const dimension = exactRecord(
    value,
    [
      "ready",
      "decision",
      "current_implementation_plan",
      "current_validation_rollout_rollback",
      "active_post_adr_task_ids",
      "post_adr_execution_history",
      "missing_codes",
    ],
    "payload.decision_lifecycle",
  );
  requireBoolean(dimension.ready, "decision_lifecycle.ready");
  exactRecord(
    dimension.decision,
    ["id", "repo_scope", "significance_tier", "state", "outcome", "adr_ref"],
    "decision_lifecycle.decision",
  );
  for (const [name, artifact] of [
    ["current_implementation_plan", dimension.current_implementation_plan],
    ["current_validation_rollout_rollback", dimension.current_validation_rollout_rollback],
  ] as const) {
    if (artifact !== null) {
      exactRecord(
        artifact,
        ["artifact_id", "artifact_ref", "artifact_sequence"],
        `decision_lifecycle.${name}`,
      );
    }
  }
  requireArray(dimension.active_post_adr_task_ids, "decision_lifecycle.active_post_adr_task_ids");
  requireArray(dimension.missing_codes, "decision_lifecycle.missing_codes");
  for (const [index, row] of requireArray(
    dimension.post_adr_execution_history,
    "decision_lifecycle.post_adr_execution_history",
  ).entries()) {
    exactRecord(
      row,
      ["task_id", "link_role", "reevaluation_status", "reevaluated_at", "active_for_transfer"],
      `decision_lifecycle.post_adr_execution_history[${index}]`,
    );
  }
}

export function validatePacketIdentity(value: unknown): void {
  const dimension = exactRecord(
    value,
    [
      "ready",
      "packet",
      "source_matches",
      "source_verification",
      "links",
      "relations",
      "graph_issues",
      "missing_codes",
    ],
    "payload.packet_identity",
  );
  requireBoolean(dimension.ready, "packet_identity.ready");
  if (dimension.packet !== null) {
    exactRecord(
      dimension.packet,
      [
        "id",
        "repo_scope",
        "packet_key",
        "packet_kind",
        "lifecycle_state",
        "source_ref",
        "entity_version",
      ],
      "packet_identity.packet",
    );
  }
  if (dimension.source_verification !== null) {
    exactRecord(
      dimension.source_verification,
      [
        "provider",
        "outcome",
        "repository_path",
        "commit",
        "path",
        "blob_id",
        "bytes_sha256",
        "verified",
      ],
      "packet_identity.source_verification",
    );
  }
  for (const [label, keys] of [
    ["links", ["id", "link_kind", "target_ref", "authority_mode"]],
    [
      "relations",
      ["id", "from_packet_id", "to_packet_id", "relation_kind", "domain", "evidence_ref"],
    ],
    [
      "graph_issues",
      ["code", "severity", "link_id", "relation_id", "canonical_identity", "detail"],
    ],
  ] as const) {
    for (const [index, row] of requireArray(
      dimension[label],
      `packet_identity.${label}`,
    ).entries()) {
      exactRecord(row, keys, `packet_identity.${label}[${index}]`);
    }
  }
  requireArray(dimension.missing_codes, "packet_identity.missing_codes");
}

export function validateExecutionTaskMemory(value: unknown): void {
  const dimension = exactRecord(
    value,
    ["ready", "expected_set_matches_active_post_adr_set", "tasks", "missing_codes"],
    "payload.execution_task_memory",
  );
  requireBoolean(dimension.ready, "execution_task_memory.ready");
  requireBoolean(
    dimension.expected_set_matches_active_post_adr_set,
    "execution_task_memory.expected_set_matches_active_post_adr_set",
  );
  requireArray(dimension.missing_codes, "execution_task_memory.missing_codes");
  const rowKeys = [
    "id",
    "present",
    "repo_scope",
    "title",
    "entity_version",
    "scope",
    "done_contract",
    "guardrails",
    "expected_dependencies",
    "dependency_declaration",
    "actual_dependencies",
    "unresolved_dependency_ids",
    "dependencies_match",
    "decision_role",
    "reevaluation_status",
    "reevaluated_at",
    "memory_ready",
    "missing_codes",
  ];
  for (const [index, rowValue] of requireArray(
    dimension.tasks,
    "execution_task_memory.tasks",
  ).entries()) {
    const row = exactRecord(rowValue, rowKeys, `execution_task_memory.tasks[${index}]`);
    requireBoolean(row.present, `execution_task_memory.tasks[${index}].present`);
    requireBoolean(
      row.dependencies_match,
      `execution_task_memory.tasks[${index}].dependencies_match`,
    );
    requireBoolean(row.memory_ready, `execution_task_memory.tasks[${index}].memory_ready`);
    requireArray(
      row.expected_dependencies,
      `execution_task_memory.tasks[${index}].expected_dependencies`,
    );
    requireArray(
      row.unresolved_dependency_ids,
      `execution_task_memory.tasks[${index}].unresolved_dependency_ids`,
    );
    requireArray(row.missing_codes, `execution_task_memory.tasks[${index}].missing_codes`);
    if (row.scope !== null) {
      exactRecord(
        row.scope,
        ["allowed_paths", "required_paths", "forbidden_paths", "non_vacuous"],
        `execution_task_memory.tasks[${index}].scope`,
      );
    }
    if (row.done_contract !== null) {
      exactRecord(
        row.done_contract,
        [
          "id",
          "entity_version",
          "completion_kind",
          "required_outcomes",
          "required_validation",
          "required_evidence_classes",
          "review_questions",
          "non_vacuous",
        ],
        `execution_task_memory.tasks[${index}].done_contract`,
      );
    }
    if (row.guardrails !== null) {
      exactRecord(
        row.guardrails,
        [
          "id",
          "entity_version",
          "invariants",
          "anti_goals",
          "constraints",
          "rollback_boundaries",
          "non_vacuous",
        ],
        `execution_task_memory.tasks[${index}].guardrails`,
      );
    }
  }
}

export function validateAdmission(value: unknown): void {
  const dimension = exactRecord(value, ["state", "tasks"], "payload.task_admission");
  if (!["clear", "blocked", "indeterminate"].includes(String(dimension.state))) {
    fail("D2E_EXECUTION_MEMORY_ENVELOPE_INVALID", "task_admission.state drifted.");
  }
  const rowKeys = [
    "task_id",
    "task_present",
    "status",
    "claimed_by",
    "claimed_at",
    "lease_expires_at",
    "completed_at",
    "claimed_at_error",
    "lease_expiry_error",
    "completed_at_error",
    "claim_tuple_valid",
    "claim_tuple_error",
    "lifecycle_tuple_valid",
    "lifecycle_tuple_error",
    "dependency_blockers",
    "unresolved_dependency_ids",
    "architecture_blockers",
    "foreign_owner_route",
    "deferrals",
    "state",
  ];
  for (const [index, row] of requireArray(dimension.tasks, "task_admission.tasks").entries()) {
    exactRecord(row, rowKeys, `task_admission.tasks[${index}]`);
  }
}

export function validateCloseout(value: unknown): void {
  const dimension = exactRecord(value, ["state", "ready", "tasks"], "payload.closeout");
  if (!["ready", "not_ready", "unavailable"].includes(String(dimension.state))) {
    fail("D2E_EXECUTION_MEMORY_ENVELOPE_INVALID", "closeout.state drifted.");
  }
  requireBoolean(dimension.ready, "closeout.ready");
  for (const [index, row] of requireArray(dimension.tasks, "closeout.tasks").entries()) {
    exactRecord(row, ["task_id", "task_present", "state", "report"], `closeout.tasks[${index}]`);
  }
}

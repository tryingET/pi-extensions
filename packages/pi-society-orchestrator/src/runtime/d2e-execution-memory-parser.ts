/** Strict closed-envelope parser for the Decision 100 producer. */

import {
  AUTHORIZATION_STATES,
  CAPABILITY_IDS,
  D2EExecutionMemoryConsumerError,
  type D2EExecutionMemoryReceipt,
  EXECUTION_MEMORY_PAYLOAD_KIND,
  EXECUTION_MEMORY_PROFILE,
  EXECUTION_MEMORY_SCHEMA_LOCATOR,
  EXECUTION_MEMORY_SURFACE,
  PRODUCER_ERROR_CODES,
  PROFILE_HEALTH_STATES,
  RESULT_STATES,
} from "./d2e-execution-memory-contract.ts";
import {
  exactRecord,
  fail,
  type NormalizedExecutionMemoryRequest,
} from "./d2e-execution-memory-request.ts";

function validateRequestEcho(
  value: unknown,
  request: NormalizedExecutionMemoryRequest,
): Record<string, unknown> {
  const echo = exactRecord(
    value,
    [
      "decision_id",
      "repo_scope",
      "packet_id",
      "packet_key",
      "packet_source",
      "packet_source_sha256",
      "expect_task_ids",
      "expect_dependencies",
      "authorization_block_ref",
    ],
    "payload.request",
  );
  const expectedDependencies = request.dependencies.map(({ task_id, depends_on }) => ({
    task_id,
    depends_on,
  }));
  const expected = {
    decision_id: request.decisionId,
    repo_scope: request.repo,
    packet_id: request.packetId,
    packet_key: request.packetKey,
    packet_source: request.packetSource,
    packet_source_sha256: request.packetSourceSha256,
    expect_task_ids: request.expectedTaskIds,
    expect_dependencies: expectedDependencies,
    authorization_block_ref: request.authorizationBlockRef ?? null,
  };
  if (JSON.stringify(echo) !== JSON.stringify(expected)) {
    fail("D2E_EXECUTION_MEMORY_ENVELOPE_INVALID", "Producer request echo differs from invocation.");
  }
  return echo;
}

function validatePayload(value: unknown, request: NormalizedExecutionMemoryRequest) {
  const payload = exactRecord(
    value,
    [
      "profile",
      "profile_schema_version",
      "read_only",
      "evaluated_at",
      "database",
      "capabilities",
      "request",
      "decision_lifecycle",
      "packet_identity",
      "execution_task_memory",
      "task_admission",
      "authorization",
      "closeout",
      "profile_health",
      "pre_execution_memory_ready",
      "result_state",
      "missing_codes",
      "warnings",
    ],
    "payload",
  );
  if (
    payload.profile !== EXECUTION_MEMORY_PROFILE ||
    payload.profile_schema_version !== 1 ||
    payload.read_only !== true ||
    typeof payload.evaluated_at !== "string" ||
    !Number.isFinite(Date.parse(payload.evaluated_at))
  ) {
    fail("D2E_EXECUTION_MEMORY_ENVELOPE_INVALID", "Producer profile/read-only metadata drifted.");
  }

  const database = exactRecord(
    payload.database,
    [
      "canonical_path",
      "schema_version",
      "supported_schema_min",
      "supported_schema_max",
      "open_mode",
      "transaction_mode",
      "capability_checks",
    ],
    "payload.database",
  );
  if (
    database.schema_version !== 41 ||
    database.supported_schema_min !== 41 ||
    database.supported_schema_max !== 41 ||
    database.open_mode !== "existing_runtime_query_only" ||
    database.transaction_mode !== "deferred_single_snapshot"
  ) {
    fail("D2E_EXECUTION_MEMORY_ENVELOPE_INVALID", "Producer database/query-only contract drifted.");
  }
  if (!Array.isArray(database.capability_checks) || database.capability_checks.length !== 7) {
    fail("D2E_EXECUTION_MEMORY_ENVELOPE_INVALID", "Producer capability checks are incomplete.");
  }
  const capabilityIds = database.capability_checks.map((item, index) => {
    const check = exactRecord(item, ["id", "present"], `capability check ${index}`);
    if (check.present !== true || typeof check.id !== "string") {
      fail("D2E_EXECUTION_MEMORY_ENVELOPE_INVALID", "A required producer capability is absent.");
    }
    return check.id;
  });
  if (JSON.stringify(capabilityIds) !== JSON.stringify(CAPABILITY_IDS)) {
    fail("D2E_EXECUTION_MEMORY_ENVELOPE_INVALID", "Producer capability identity/order drifted.");
  }

  const capabilities = exactRecord(
    payload.capabilities,
    [
      "coherent_read_transaction",
      "packet_identity_check",
      "task_memory_check",
      "negative_authorization_gate_proof",
      "positive_authorization_proof",
      "closeout_projection",
    ],
    "payload.capabilities",
  );
  if (
    capabilities.coherent_read_transaction !== true ||
    capabilities.packet_identity_check !== true ||
    capabilities.task_memory_check !== true ||
    capabilities.negative_authorization_gate_proof !== true ||
    capabilities.positive_authorization_proof !== false ||
    capabilities.closeout_projection !== true
  ) {
    fail("D2E_EXECUTION_MEMORY_ENVELOPE_INVALID", "Producer capability semantics drifted.");
  }

  validateRequestEcho(payload.request, request);
  const authorization = exactRecord(
    payload.authorization,
    [
      "capability",
      "positive_proof_supported",
      "state",
      "block_ref",
      "verified_block",
      "finding_codes",
    ],
    "payload.authorization",
  );
  if (
    authorization.capability !== "negative_gate_only" ||
    authorization.positive_proof_supported !== false ||
    typeof authorization.state !== "string" ||
    !AUTHORIZATION_STATES.has(authorization.state)
  ) {
    fail(
      "D2E_EXECUTION_MEMORY_ENVELOPE_INVALID",
      "Producer emitted unsupported positive or unknown authorization semantics.",
    );
  }

  const health = exactRecord(payload.profile_health, ["state", "issues"], "payload.profile_health");
  if (typeof health.state !== "string" || !PROFILE_HEALTH_STATES.has(health.state)) {
    fail("D2E_EXECUTION_MEMORY_ENVELOPE_INVALID", "Producer profile health state drifted.");
  }
  if (
    typeof payload.result_state !== "string" ||
    !RESULT_STATES.has(payload.result_state) ||
    typeof payload.pre_execution_memory_ready !== "boolean" ||
    !Array.isArray(payload.missing_codes) ||
    !Array.isArray(payload.warnings)
  ) {
    fail("D2E_EXECUTION_MEMORY_ENVELOPE_INVALID", "Producer result state/diagnostics drifted.");
  }
  const resultReady = payload.result_state !== "memory_incomplete";
  if (payload.pre_execution_memory_ready !== resultReady) {
    fail(
      "D2E_EXECUTION_MEMORY_ENVELOPE_INVALID",
      "Producer readiness/result-state invariant drifted.",
    );
  }

  return {
    payload,
    authorization: authorization as {
      capability: "negative_gate_only";
      positive_proof_supported: false;
      state: "blocked_pending_authorization" | "unproven" | "indeterminate";
    },
    health: health as { state: "healthy" | "degraded" },
    resultState: payload.result_state as D2EExecutionMemoryReceipt["result_state"],
    ready: payload.pre_execution_memory_ready,
  };
}

export function parseExecutionMemoryEnvelope(
  stdout: string,
  exitCode: number,
  request: NormalizedExecutionMemoryRequest,
) {
  let decoded: unknown;
  try {
    decoded = JSON.parse(stdout);
  } catch {
    fail("D2E_EXECUTION_MEMORY_ENVELOPE_INVALID", "Producer stdout is not one JSON envelope.");
  }
  const envelope = exactRecord(
    decoded,
    [
      "surface",
      "schema_version",
      "emitted_at",
      "payload_kind",
      "schema_locator",
      "ok",
      "payload",
      "error",
    ],
    "execution-memory envelope",
  );
  if (
    envelope.surface !== EXECUTION_MEMORY_SURFACE ||
    envelope.schema_version !== 1 ||
    envelope.payload_kind !== EXECUTION_MEMORY_PAYLOAD_KIND ||
    envelope.schema_locator !== EXECUTION_MEMORY_SCHEMA_LOCATOR ||
    typeof envelope.emitted_at !== "string" ||
    !Number.isFinite(Date.parse(envelope.emitted_at))
  ) {
    fail("D2E_EXECUTION_MEMORY_ENVELOPE_INVALID", "Producer machine envelope identity drifted.");
  }
  if (exitCode === 0) {
    if (envelope.ok !== true || envelope.error !== null || envelope.payload === null) {
      fail(
        "D2E_EXECUTION_MEMORY_ENVELOPE_INVALID",
        "Successful producer envelope is inconsistent.",
      );
    }
    return { envelope, ...validatePayload(envelope.payload, request) };
  }
  if (envelope.ok !== false || envelope.payload !== null || envelope.error === null) {
    fail("D2E_EXECUTION_MEMORY_ENVELOPE_INVALID", "Failed producer envelope is inconsistent.");
  }
  const producerError = exactRecord(
    envelope.error,
    ["code", "category", "summary", "detail", "canonical_identity", "anomaly_codes"],
    "producer error",
  );
  if (typeof producerError.code !== "string" || !PRODUCER_ERROR_CODES.has(producerError.code)) {
    fail("D2E_EXECUTION_MEMORY_ENVELOPE_INVALID", "Producer error code drifted.");
  }
  throw new D2EExecutionMemoryConsumerError(
    "D2E_EXECUTION_MEMORY_PRODUCER_REJECTED",
    `Execution-memory producer rejected the observation: ${producerError.code}.`,
    producerError,
  );
}

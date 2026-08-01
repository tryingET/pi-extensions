/** Exact Prompt Vault request and AK identity/authorization readback validation. */

import * as path from "node:path";
import {
  AK_TIMEOUT_MS,
  type AuthorizationReadback,
  D2E_WORKFLOW_TEMPLATE_NAMES,
  D2E_WORKFLOW_TEMPLATE_OWNERS,
  type D2EFailureBoundary,
  D2ETransferError,
  type D2ETransferErrorCode,
  type D2ETransferExec,
  type D2ETransferExecResult,
  type D2ETransferMode,
  type D2ETransferRequest,
  EXPECTED_ARTIFACT_KIND,
  EXPECTED_CONTROL_MODE,
  EXPECTED_FORMALIZATION_LEVEL,
  type IdentityReadback,
  type JsonRecord,
  SHA256,
  type TaskIntentReadback,
  type TaskIntentSemantics,
  type TaskScope,
} from "./d2e-transfer-contract.ts";

import { canonicalize, digest, nonEmpty, record, sha256 } from "./d2e-transfer-json.ts";

const D2E_TEMPLATE_SET = new Set<string>(D2E_WORKFLOW_TEMPLATE_NAMES);

function positiveInteger(value: unknown): number | null {
  return Number.isInteger(value) && Number(value) > 0 ? Number(value) : null;
}
export function sortedUnique(values: string[]): string[] {
  return [...new Set(values)].sort((a, b) => a.localeCompare(b));
}

async function readAkJson(options: {
  exec: D2ETransferExec;
  args: string[];
  cwd: string;
  signal?: AbortSignal;
  code: D2ETransferErrorCode;
  label: string;
  failureBoundary?: D2EFailureBoundary;
}): Promise<JsonRecord> {
  if (options.signal?.aborted) {
    throw new D2ETransferError(options.code, `${options.label} readback was cancelled.`, {
      failureBoundary: options.failureBoundary,
    });
  }
  let result: D2ETransferExecResult;
  try {
    result = await options.exec("ak", options.args, {
      cwd: options.cwd,
      signal: options.signal,
      timeout: AK_TIMEOUT_MS,
    });
  } catch (error) {
    throw new D2ETransferError(
      options.code,
      `${options.label} readback failed: ${error instanceof Error ? error.message : String(error)}`,
      { failureBoundary: options.failureBoundary },
    );
  }
  if (options.signal?.aborted || result.killed) {
    throw new D2ETransferError(options.code, `${options.label} readback was cancelled.`, {
      failureBoundary: options.failureBoundary,
    });
  }
  if (result.code !== 0) {
    const detail = (result.stderr || result.stdout || "unknown error").trim().slice(0, 500);
    throw new D2ETransferError(
      options.code,
      `${options.label} readback failed (${result.code}): ${detail}`,
      { failureBoundary: options.failureBoundary },
    );
  }
  try {
    return record(JSON.parse(result.stdout), options.code, options.label, options.failureBoundary);
  } catch (error) {
    if (error instanceof D2ETransferError) throw error;
    throw new D2ETransferError(options.code, `${options.label} readback did not emit JSON.`, {
      failureBoundary: options.failureBoundary,
    });
  }
}

function validateTemplateIdentity(request: D2ETransferRequest): void {
  const identity = request.templateIdentity;
  if (
    !D2E_TEMPLATE_SET.has(request.templateName) ||
    identity.templateName !== request.templateName ||
    !positiveInteger(identity.templateId) ||
    identity.artifactKind !== EXPECTED_ARTIFACT_KIND ||
    identity.controlMode !== EXPECTED_CONTROL_MODE ||
    identity.formalizationLevel !== EXPECTED_FORMALIZATION_LEVEL ||
    identity.ownerCompany !==
      D2E_WORKFLOW_TEMPLATE_OWNERS[
        request.templateName as keyof typeof D2E_WORKFLOW_TEMPLATE_OWNERS
      ] ||
    !positiveInteger(identity.templateVersion) ||
    !SHA256.test(identity.contentSha256)
  ) {
    throw new D2ETransferError(
      "D2E_TRANSFER_TEMPLATE_IDENTITY_MISMATCH",
      "D2E template identity must exactly bind name, id, procedure/one_shot/workflow metadata, per-template owner, version, and content digest.",
    );
  }
  if (
    request.mode === "applied" &&
    (request.expectedTemplateVersion !== identity.templateVersion ||
      request.expectedTemplateContentSha256 !== identity.contentSha256)
  ) {
    throw new D2ETransferError(
      "D2E_TRANSFER_TEMPLATE_IDENTITY_MISMATCH",
      "Applied D2E transfer template identity differs from the proposal-bound version/content digest.",
    );
  }
}

export function validateRequest(
  request: D2ETransferRequest,
): D2ETransferRequest & { mode: D2ETransferMode } {
  const normalized = {
    ...request,
    mode: request.mode ?? "proposal",
    templateName: request.templateName.trim(),
    repo: path.resolve(request.repo),
    packetKey: request.packetKey.trim(),
    objective: request.objective.trim(),
    invokingActor: request.invokingActor.trim(),
    invokingSessionId: request.invokingSessionId.trim(),
  };
  if (!D2E_TEMPLATE_SET.has(normalized.templateName)) {
    throw new D2ETransferError(
      "D2E_TRANSFER_TEMPLATE_UNBOUND",
      `Template ${normalized.templateName || "(empty)"} is not bound to the D2E workflow.`,
    );
  }
  if (
    (normalized.mode !== "proposal" && normalized.mode !== "applied") ||
    !normalized.packetKey ||
    !normalized.objective ||
    !normalized.invokingActor ||
    !normalized.invokingSessionId ||
    !positiveInteger(normalized.taskId) ||
    !positiveInteger(normalized.decisionId) ||
    (normalized.mode === "applied" &&
      (!SHA256.test(normalized.expectedTaskScopeSha256 ?? "") ||
        !SHA256.test(normalized.expectedTaskIntentSha256 ?? "")))
  ) {
    throw new D2ETransferError(
      "D2E_TRANSFER_INPUT_INVALID",
      "D2E transfer requires exact mode/repo/packet/task/decision/objective, invoking actor/session, and applied proposal scope/intent digests.",
    );
  }
  validateTemplateIdentity(normalized);
  return normalized;
}

function parseTaskScope(value: unknown): TaskScope {
  const scope = record(value, "D2E_TRANSFER_TASK_SCOPE_MISMATCH", "task.scope");
  const keys = Object.keys(scope).sort();
  if (keys.join(",") !== "allowed_paths,forbidden_paths,required_paths") {
    throw new D2ETransferError("D2E_TRANSFER_TASK_SCOPE_MISMATCH", "Task scope schema drifted.");
  }
  const read = (key: keyof TaskScope): string[] => {
    const values = scope[key];
    if (!Array.isArray(values) || values.some((item) => typeof item !== "string" || !item)) {
      throw new D2ETransferError(
        "D2E_TRANSFER_TASK_SCOPE_MISMATCH",
        `Task scope ${key} is malformed.`,
      );
    }
    return [...values];
  };
  return {
    allowed_paths: read("allowed_paths"),
    required_paths: read("required_paths"),
    forbidden_paths: read("forbidden_paths"),
  };
}

function exactStringArray(value: unknown, label: string): string[] {
  if (!Array.isArray(value) || value.some((item) => typeof item !== "string" || !item.trim())) {
    throw new D2ETransferError(
      "D2E_TRANSFER_TASK_INTENT_MISMATCH",
      `Task-native ${label} is malformed.`,
    );
  }
  return [...value];
}

function taskIntentReadback(
  task: JsonRecord,
  contractEnvelope: JsonRecord,
  request: D2ETransferRequest,
): TaskIntentReadback {
  const title = typeof task.title === "string" && task.title.trim() ? task.title : null;
  const description =
    task.description === null
      ? null
      : typeof task.description === "string" && task.description.trim()
        ? task.description
        : null;
  const done = record(
    contractEnvelope.done_contract,
    "D2E_TRANSFER_TASK_INTENT_MISMATCH",
    "task.done_contract",
  );
  const contract = record(
    done.contract,
    "D2E_TRANSFER_TASK_INTENT_MISMATCH",
    "task.done_contract.contract",
  );
  const guardrailEnvelope = record(
    contractEnvelope.guardrails,
    "D2E_TRANSFER_TASK_INTENT_MISMATCH",
    "task.guardrails",
  );
  const guardrails = record(
    guardrailEnvelope.guardrails,
    "D2E_TRANSFER_TASK_INTENT_MISMATCH",
    "task.guardrails.guardrails",
  );
  if (
    !title ||
    (task.description !== null && description === null) ||
    contractEnvelope.task_id !== request.taskId ||
    contractEnvelope.repo !== task.repo ||
    contractEnvelope.title !== title ||
    contractEnvelope.status !== task.status ||
    !positiveInteger(done.entity_version) ||
    !positiveInteger(guardrailEnvelope.entity_version)
  ) {
    throw new D2ETransferError(
      "D2E_TRANSFER_TASK_INTENT_MISMATCH",
      "Task title, description, done-contract, or guardrail identity is malformed or inconsistent.",
    );
  }
  exactStringArray(contract.required_outcomes, "done-contract required_outcomes");
  exactStringArray(contract.required_validation, "done-contract required_validation");
  exactStringArray(contract.review_questions, "done-contract review_questions");
  exactStringArray(guardrails.invariants, "guardrail invariants");
  exactStringArray(guardrails.anti_goals, "guardrail anti_goals");
  exactStringArray(guardrails.constraints, "guardrail constraints");
  exactStringArray(guardrails.rollback_boundaries, "guardrail rollback_boundaries");
  const semantics: TaskIntentSemantics = {
    schema: "D2E_TASK_INTENT_V1",
    title,
    description,
    done_contract: { entity_version: done.entity_version as number, contract },
    guardrails: {
      entity_version: guardrailEnvelope.entity_version as number,
      guardrails,
    },
  };
  const canonicalIntent = canonicalize(semantics);
  const callerObjective = request.objective.trim();
  const lawfulAliases = new Set([title.trim(), ...(description ? [description.trim()] : [])]);
  if (!lawfulAliases.has(callerObjective)) {
    throw new D2ETransferError(
      "D2E_TRANSFER_TASK_INTENT_MISMATCH",
      "Caller objective is not the exact live task title or description; task-native intent controls dispatch.",
    );
  }
  return { semantics, sha256: sha256(canonicalIntent), canonicalIntent };
}

function exactPacketCanonicalLinks(links: unknown, taskId: number, decisionId: number): boolean {
  if (!Array.isArray(links)) return false;
  const actual = links
    .filter(
      (item) =>
        item &&
        typeof item === "object" &&
        !Array.isArray(item) &&
        (item as JsonRecord).authority_mode === "canonical" &&
        ((item as JsonRecord).link_kind === "task" ||
          (item as JsonRecord).link_kind === "decision"),
    )
    .map((item) => `${(item as JsonRecord).link_kind}:${(item as JsonRecord).target_ref}`)
    .sort();
  return (
    new Set(actual).size === actual.length &&
    actual.join(",") === `decision:decision:${decisionId},task:task:${taskId}`
  );
}

function authorizationReadback(
  task: JsonRecord,
  request: D2ETransferRequest,
  nowMs: number,
): AuthorizationReadback {
  const claimedBy = nonEmpty(task.claimed_by);
  const leaseExpiresAt = nonEmpty(task.lease_expires_at);
  let blocker: string | null = null;
  if (task.active_deferral && typeof task.active_deferral === "object") {
    blocker = "active_task_deferral";
  } else if (task.status !== "claimed") {
    blocker = "task_not_claimed";
  } else if (!claimedBy) {
    blocker = "claimed_by_missing";
  } else if (claimedBy !== request.invokingActor) {
    blocker = "claimed_by_other_actor";
  } else if (claimedBy !== request.invokingSessionId) {
    blocker = "claimed_by_other_session";
  } else if (!leaseExpiresAt || !Number.isFinite(Date.parse(leaseExpiresAt))) {
    blocker = "lease_missing_or_invalid";
  } else if (Date.parse(leaseExpiresAt) <= nowMs) {
    blocker = "lease_expired";
  }
  return {
    granted: blocker === null,
    basis: blocker ? "not_authorized" : "actor_session_live_lease_without_active_deferral",
    claimedBy,
    invokingActor: request.invokingActor,
    invokingSessionId: request.invokingSessionId,
    leaseExpiresAt,
    blocker,
  };
}

export async function readAndValidateIdentities(options: {
  request: D2ETransferRequest;
  exec: D2ETransferExec;
  signal?: AbortSignal;
  nowMs: number;
}): Promise<IdentityReadback> {
  const { request } = options;
  const [packetEnvelope, task, contractEnvelope, decisionEnvelope] = await Promise.all([
    readAkJson({
      exec: options.exec,
      args: ["packet", "show", request.packetKey, "--repo", request.repo, "-F", "json"],
      cwd: request.repo,
      signal: options.signal,
      code: "D2E_TRANSFER_PACKET_READBACK_FAILED",
      label: "packet",
      failureBoundary: "required_packet",
    }),
    readAkJson({
      exec: options.exec,
      args: ["task", "show", String(request.taskId), "-F", "json"],
      cwd: request.repo,
      signal: options.signal,
      code: "D2E_TRANSFER_TASK_READBACK_FAILED",
      label: "task",
    }),
    readAkJson({
      exec: options.exec,
      args: ["task", "contract", "show", String(request.taskId), "-F", "json"],
      cwd: request.repo,
      signal: options.signal,
      code: "D2E_TRANSFER_TASK_READBACK_FAILED",
      label: "task contract",
    }),
    readAkJson({
      exec: options.exec,
      args: ["decision", "show", String(request.decisionId), "-F", "json"],
      cwd: request.repo,
      signal: options.signal,
      code: "D2E_TRANSFER_DECISION_READBACK_FAILED",
      label: "decision",
    }),
  ]);
  const packet = record(
    packetEnvelope.packet,
    "D2E_TRANSFER_PACKET_MISMATCH",
    "packet.packet",
    "required_packet",
  );
  const decision = record(
    decisionEnvelope.decision,
    "D2E_TRANSFER_DECISION_MISMATCH",
    "decision.decision",
  );
  if (
    packet.packet_key !== request.packetKey ||
    !nonEmpty(packet.repo_scope) ||
    path.resolve(packet.repo_scope as string) !== request.repo ||
    packet.lifecycle_state !== "assessed" ||
    !positiveInteger(packet.id) ||
    !positiveInteger(packet.entity_version) ||
    !nonEmpty(packet.source_ref) ||
    !exactPacketCanonicalLinks(packetEnvelope.links, request.taskId, request.decisionId)
  ) {
    throw new D2ETransferError(
      "D2E_TRANSFER_PACKET_MISMATCH",
      "Packet must have exactly the requested canonical task/decision link set.",
      { failureBoundary: "required_packet" },
    );
  }
  const scope = parseTaskScope(task.scope);
  const scopeSha256 = digest(scope);
  const taskIntent = taskIntentReadback(task, contractEnvelope, request);
  if (
    task.id !== request.taskId ||
    !nonEmpty(task.repo) ||
    path.resolve(task.repo as string) !== request.repo ||
    !positiveInteger(task.entity_version)
  ) {
    throw new D2ETransferError(
      "D2E_TRANSFER_TASK_MISMATCH",
      "Task identity differs from the requested transfer.",
    );
  }
  if (request.mode === "applied" && scopeSha256 !== request.expectedTaskScopeSha256) {
    throw new D2ETransferError(
      "D2E_TRANSFER_TASK_SCOPE_MISMATCH",
      "Task scope differs from the proposal-bound digest.",
    );
  }
  if (request.mode === "applied" && taskIntent.sha256 !== request.expectedTaskIntentSha256) {
    throw new D2ETransferError(
      "D2E_TRANSFER_TASK_INTENT_MISMATCH",
      "Task title, description, done-contract, or guardrails differ from the proposal-bound digest.",
    );
  }
  const postAdrLinks = Array.isArray(decisionEnvelope.linked_tasks)
    ? decisionEnvelope.linked_tasks.filter(
        (item) =>
          item &&
          typeof item === "object" &&
          !Array.isArray(item) &&
          (item as JsonRecord).link_role === "post_adr_execution",
      )
    : [];
  if (
    decision.id !== request.decisionId ||
    !nonEmpty(decision.repo_scope) ||
    path.resolve(decision.repo_scope as string) !== request.repo ||
    decision.state !== "unblocked" ||
    decision.outcome !== "accepted" ||
    !nonEmpty(decision.updated_at) ||
    postAdrLinks.length !== 1 ||
    (postAdrLinks[0] as JsonRecord).decision_id !== request.decisionId ||
    (postAdrLinks[0] as JsonRecord).task_id !== request.taskId
  ) {
    throw new D2ETransferError(
      "D2E_TRANSFER_DECISION_MISMATCH",
      "Decision does not exactly bind one accepted post-ADR execution task.",
    );
  }
  const authorization = authorizationReadback(task, request, options.nowMs);
  const snapshot = {
    packet: packetEnvelope,
    task,
    task_contract: contractEnvelope,
    task_intent_sha256: taskIntent.sha256,
    decision: decisionEnvelope,
    scope_sha256: scopeSha256,
    actor: request.invokingActor,
    session: request.invokingSessionId,
  };
  return {
    packet,
    task,
    decision,
    packetEnvelope,
    decisionEnvelope,
    scope,
    scopeSha256,
    taskIntent,
    authorization,
    snapshotSha256: digest(snapshot),
  };
}

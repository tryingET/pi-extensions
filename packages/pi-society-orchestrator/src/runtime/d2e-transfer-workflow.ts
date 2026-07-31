/** Deterministic gate for Prompt Vault direction-to-execution workflow transfers. */

import * as path from "node:path";
import type { WorkflowResult } from "./workflow.ts";
import type { WorkflowExecutor } from "./workflow-execution.ts";

export const D2E_TRANSFER_COMPLETE_SCHEMA = "D2E_TRANSFER_COMPLETE_V1" as const;
export const D2E_TRANSFER_PROPOSAL_SCHEMA = "D2E_TRANSFER_PROPOSAL_V1" as const;
export const D2E_WORKFLOW_TEMPLATE_NAMES = Object.freeze([
  "direction-to-execution",
  "repo-direction-to-execution",
  "layer12-040-direction-to-execution-ak-native",
] as const);

const D2E_TEMPLATE_SET = new Set<string>(D2E_WORKFLOW_TEMPLATE_NAMES);
const AK_TIMEOUT_MS = 30_000;

type JsonRecord = Record<string, unknown>;

export type D2ETransferMode = "proposal" | "applied";

export type D2ETransferErrorCode =
  | "D2E_TRANSFER_TEMPLATE_UNBOUND"
  | "D2E_TRANSFER_INPUT_INVALID"
  | "D2E_TRANSFER_PACKET_READBACK_FAILED"
  | "D2E_TRANSFER_TASK_READBACK_FAILED"
  | "D2E_TRANSFER_DECISION_READBACK_FAILED"
  | "D2E_TRANSFER_PACKET_MISMATCH"
  | "D2E_TRANSFER_TASK_MISMATCH"
  | "D2E_TRANSFER_DECISION_MISMATCH"
  | "D2E_TRANSFER_AUTHORIZATION_REQUIRED"
  | "D2E_TRANSFER_WORKFLOW_INCOMPLETE";

export class D2ETransferError extends Error {
  readonly code: D2ETransferErrorCode;

  constructor(code: D2ETransferErrorCode, message: string) {
    super(message);
    this.name = "D2ETransferError";
    this.code = code;
  }
}

export interface D2ETransferExecResult {
  stdout: string;
  stderr: string;
  code: number;
  killed?: boolean;
}

export type D2ETransferExec = (
  command: string,
  args: string[],
  options: { cwd: string; signal?: AbortSignal; timeout: number },
) => Promise<D2ETransferExecResult>;

export interface D2ETransferRequest {
  templateName: string;
  mode: D2ETransferMode;
  repo: string;
  packetKey: string;
  taskId: number;
  decisionId: number;
  objective: string;
}

interface D2ETransferIdentityReadback {
  packet: JsonRecord;
  task: JsonRecord;
  decision: JsonRecord;
  authorization: {
    granted: boolean;
    basis: "claimed_live_lease_without_active_deferral" | "not_authorized";
    claimedBy: string | null;
    leaseExpiresAt: string | null;
    blocker: string | null;
  };
}

export interface D2ETransferProposalReceipt {
  schema: typeof D2E_TRANSFER_PROPOSAL_SCHEMA;
  read_only: true;
  mode: "proposal";
  applied: false;
  template_name: string;
  repo: string;
  packet_key: string;
  task_id: number;
  decision_id: number;
  applied_ready: boolean;
  authorization: D2ETransferIdentityReadback["authorization"];
}

export interface D2ETransferCompleteReceipt {
  schema: typeof D2E_TRANSFER_COMPLETE_SCHEMA;
  read_only: false;
  mode: "applied";
  applied: true;
  template_name: string;
  repo: string;
  packet: {
    key: string;
    id: number;
    source_ref: string;
    entity_version: number;
  };
  task: {
    id: number;
    status: "claimed";
    entity_version: number;
  };
  decision: {
    id: number;
    state: "unblocked";
    outcome: "accepted";
    updated_at: string;
  };
  authorization: {
    granted: true;
    basis: "claimed_live_lease_without_active_deferral";
    claimedBy: string;
    leaseExpiresAt: string;
    blocker: null;
  };
  workflow: {
    mode: string;
    status: "done";
    step_count: number;
  };
}

export type D2ETransferGateResult =
  | { kind: "proposal"; receipt: D2ETransferProposalReceipt }
  | { kind: "complete"; receipt: D2ETransferCompleteReceipt; workflow: WorkflowResult };

function record(value: unknown, code: D2ETransferErrorCode, label: string): JsonRecord {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    throw new D2ETransferError(code, `${label} readback is not a JSON object.`);
  }
  return value as JsonRecord;
}

function nonEmpty(value: unknown): string | null {
  return typeof value === "string" && value.trim() ? value : null;
}

function positiveInteger(value: unknown): number | null {
  return Number.isInteger(value) && Number(value) > 0 ? Number(value) : null;
}

async function readAkJson(options: {
  exec: D2ETransferExec;
  args: string[];
  cwd: string;
  signal?: AbortSignal;
  code: D2ETransferErrorCode;
  label: string;
}): Promise<JsonRecord> {
  if (options.signal?.aborted) {
    throw new D2ETransferError(options.code, `${options.label} readback was cancelled.`);
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
    );
  }
  if (options.signal?.aborted || result.killed) {
    throw new D2ETransferError(options.code, `${options.label} readback was cancelled.`);
  }
  if (result.code !== 0) {
    const detail = (result.stderr || result.stdout || "unknown error").trim().slice(0, 500);
    throw new D2ETransferError(
      options.code,
      `${options.label} readback failed (${result.code}): ${detail}`,
    );
  }
  try {
    return record(JSON.parse(result.stdout), options.code, options.label);
  } catch (error) {
    if (error instanceof D2ETransferError) throw error;
    throw new D2ETransferError(options.code, `${options.label} readback did not emit JSON.`);
  }
}

function validateRequest(request: D2ETransferRequest): D2ETransferRequest {
  const templateName = request.templateName.trim();
  if (!D2E_TEMPLATE_SET.has(templateName)) {
    throw new D2ETransferError(
      "D2E_TRANSFER_TEMPLATE_UNBOUND",
      `Template ${templateName || "(empty)"} is not bound to the D2E transfer workflow.`,
    );
  }
  const repo = path.resolve(request.repo);
  const packetKey = request.packetKey.trim();
  const objective = request.objective.trim();
  if (
    (request.mode !== "proposal" && request.mode !== "applied") ||
    !packetKey ||
    !objective ||
    !Number.isInteger(request.taskId) ||
    request.taskId <= 0 ||
    !Number.isInteger(request.decisionId) ||
    request.decisionId <= 0
  ) {
    throw new D2ETransferError(
      "D2E_TRANSFER_INPUT_INVALID",
      "D2E transfer requires an exact mode, repo, packet_key, positive task_id, positive decision_id, and objective.",
    );
  }
  return { ...request, templateName, repo, packetKey, objective };
}

function exactCanonicalLink(links: unknown, kind: "task" | "decision", targetRef: string): boolean {
  if (!Array.isArray(links)) return false;
  const matching = links.filter(
    (item) =>
      item &&
      typeof item === "object" &&
      !Array.isArray(item) &&
      (item as JsonRecord).link_kind === kind &&
      (item as JsonRecord).target_ref === targetRef &&
      (item as JsonRecord).authority_mode === "canonical",
  );
  return matching.length === 1;
}

function authorizationReadback(
  task: JsonRecord,
  nowMs: number,
): D2ETransferIdentityReadback["authorization"] {
  const claimedBy = nonEmpty(task.claimed_by);
  const leaseExpiresAt = nonEmpty(task.lease_expires_at);
  let blocker: string | null = null;
  if (task.active_deferral && typeof task.active_deferral === "object") {
    blocker = "active_task_deferral";
  } else if (task.status !== "claimed") {
    blocker = "task_not_claimed";
  } else if (!claimedBy) {
    blocker = "claimed_by_missing";
  } else if (!leaseExpiresAt || !Number.isFinite(Date.parse(leaseExpiresAt))) {
    blocker = "lease_missing_or_invalid";
  } else if (Date.parse(leaseExpiresAt) <= nowMs) {
    blocker = "lease_expired";
  }
  return blocker
    ? {
        granted: false,
        basis: "not_authorized",
        claimedBy,
        leaseExpiresAt,
        blocker,
      }
    : {
        granted: true,
        basis: "claimed_live_lease_without_active_deferral",
        claimedBy,
        leaseExpiresAt,
        blocker: null,
      };
}

async function readAndValidateIdentities(options: {
  request: D2ETransferRequest;
  exec: D2ETransferExec;
  signal?: AbortSignal;
  nowMs: number;
}): Promise<D2ETransferIdentityReadback> {
  const { request } = options;
  const [packetEnvelope, task, decisionEnvelope] = await Promise.all([
    readAkJson({
      exec: options.exec,
      args: ["packet", "show", request.packetKey, "--repo", request.repo, "-F", "json"],
      cwd: request.repo,
      signal: options.signal,
      code: "D2E_TRANSFER_PACKET_READBACK_FAILED",
      label: "packet",
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
      args: ["decision", "show", String(request.decisionId), "-F", "json"],
      cwd: request.repo,
      signal: options.signal,
      code: "D2E_TRANSFER_DECISION_READBACK_FAILED",
      label: "decision",
    }),
  ]);
  const packet = record(packetEnvelope.packet, "D2E_TRANSFER_PACKET_MISMATCH", "packet.packet");
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
    !exactCanonicalLink(packetEnvelope.links, "task", `task:${request.taskId}`) ||
    !exactCanonicalLink(packetEnvelope.links, "decision", `decision:${request.decisionId}`)
  ) {
    throw new D2ETransferError(
      "D2E_TRANSFER_PACKET_MISMATCH",
      "Packet readback does not exactly bind the requested repo, packet, task, and decision.",
    );
  }
  if (
    task.id !== request.taskId ||
    !nonEmpty(task.repo) ||
    path.resolve(task.repo as string) !== request.repo ||
    !positiveInteger(task.entity_version)
  ) {
    throw new D2ETransferError(
      "D2E_TRANSFER_TASK_MISMATCH",
      "Task readback does not exactly bind the requested task and repo.",
    );
  }
  const linkedTasks = Array.isArray(decisionEnvelope.linked_tasks)
    ? decisionEnvelope.linked_tasks
    : [];
  const exactDecisionTaskLinks = linkedTasks.filter(
    (item) =>
      item &&
      typeof item === "object" &&
      !Array.isArray(item) &&
      (item as JsonRecord).decision_id === request.decisionId &&
      (item as JsonRecord).task_id === request.taskId &&
      (item as JsonRecord).link_role === "post_adr_execution",
  );
  if (
    decision.id !== request.decisionId ||
    !nonEmpty(decision.repo_scope) ||
    path.resolve(decision.repo_scope as string) !== request.repo ||
    decision.state !== "unblocked" ||
    decision.outcome !== "accepted" ||
    !nonEmpty(decision.updated_at) ||
    exactDecisionTaskLinks.length !== 1
  ) {
    throw new D2ETransferError(
      "D2E_TRANSFER_DECISION_MISMATCH",
      "Decision readback does not exactly authorize the requested accepted post-ADR task lineage.",
    );
  }
  return {
    packet,
    task,
    decision,
    authorization: authorizationReadback(task, options.nowMs),
  };
}

export async function executeD2ETransferWorkflow(options: {
  request: D2ETransferRequest;
  exec: D2ETransferExec;
  workflowExecutor?: WorkflowExecutor;
  workflowExecution?: {
    activeTeam: string;
    model: string;
    cwd: string;
    cognitiveToolContent: string;
  };
  prepareWorkflow?: () => Promise<{
    workflowExecutor: WorkflowExecutor;
    workflowExecution: {
      activeTeam: string;
      model: string;
      cwd: string;
      cognitiveToolContent: string;
    };
  }>;
  signal?: AbortSignal;
  now?: () => number;
}): Promise<D2ETransferGateResult> {
  const request = validateRequest(options.request);
  const readback = await readAndValidateIdentities({
    request,
    exec: options.exec,
    signal: options.signal,
    nowMs: (options.now ?? Date.now)(),
  });

  if (request.mode === "proposal") {
    return {
      kind: "proposal",
      receipt: {
        schema: D2E_TRANSFER_PROPOSAL_SCHEMA,
        read_only: true,
        mode: "proposal",
        applied: false,
        template_name: request.templateName,
        repo: request.repo,
        packet_key: request.packetKey,
        task_id: request.taskId,
        decision_id: request.decisionId,
        applied_ready: readback.authorization.granted,
        authorization: readback.authorization,
      },
    };
  }

  if (!readback.authorization.granted) {
    throw new D2ETransferError(
      "D2E_TRANSFER_AUTHORIZATION_REQUIRED",
      `Applied D2E transfer requires an exact claimed-task authorization readback; blocker=${readback.authorization.blocker}.`,
    );
  }
  let workflowExecutor = options.workflowExecutor;
  let workflowExecution = options.workflowExecution;
  if ((!workflowExecutor || !workflowExecution) && options.prepareWorkflow) {
    const prepared = await options.prepareWorkflow();
    workflowExecutor = prepared.workflowExecutor;
    workflowExecution = prepared.workflowExecution;
  }
  if (!workflowExecutor || !workflowExecution) {
    throw new D2ETransferError(
      "D2E_TRANSFER_WORKFLOW_INCOMPLETE",
      "Applied D2E transfer has no workflow executor context.",
    );
  }

  const workflow = await workflowExecutor.execute({
    request: {
      mode: "chain",
      cwd: request.repo,
      steps: [
        {
          kind: "step",
          agent: "builder",
          objective: [
            "D2E_TRANSFER_COMPLETE_V1 applied workflow.",
            `Exact repo: ${request.repo}`,
            `Exact packet: ${request.packetKey}`,
            `Exact AK task: ${request.taskId}`,
            `Exact AK decision: ${request.decisionId}`,
            "Operate only within the exact AK task scope and preserve all owner/non-authorization boundaries.",
            `Operator objective: ${request.objective}`,
          ].join("\n"),
        },
      ],
    },
    ...workflowExecution,
    cwd: request.repo,
    signal: options.signal,
  });
  if (
    workflow.status !== "done" ||
    workflow.steps.length !== 1 ||
    workflow.steps[0]?.status !== "done"
  ) {
    throw new D2ETransferError(
      "D2E_TRANSFER_WORKFLOW_INCOMPLETE",
      `Applied D2E workflow did not complete exactly one successful step; status=${workflow.status}.`,
    );
  }

  return {
    kind: "complete",
    workflow,
    receipt: {
      schema: D2E_TRANSFER_COMPLETE_SCHEMA,
      read_only: false,
      mode: "applied",
      applied: true,
      template_name: request.templateName,
      repo: request.repo,
      packet: {
        key: request.packetKey,
        id: readback.packet.id as number,
        source_ref: readback.packet.source_ref as string,
        entity_version: readback.packet.entity_version as number,
      },
      task: {
        id: request.taskId,
        status: "claimed",
        entity_version: readback.task.entity_version as number,
      },
      decision: {
        id: request.decisionId,
        state: "unblocked",
        outcome: "accepted",
        updated_at: readback.decision.updated_at as string,
      },
      authorization: {
        granted: true,
        basis: "claimed_live_lease_without_active_deferral",
        claimedBy: readback.authorization.claimedBy as string,
        leaseExpiresAt: readback.authorization.leaseExpiresAt as string,
        blocker: null,
      },
      workflow: {
        mode: workflow.mode,
        status: "done",
        step_count: workflow.steps.length,
      },
    },
  };
}

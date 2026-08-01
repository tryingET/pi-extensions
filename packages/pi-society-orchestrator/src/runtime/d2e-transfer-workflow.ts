/** Fail-closed D2E transfer execution sequencer. */

import {
  type AuthorizationReadback,
  D2E_TRANSFER_COMPLETE_SCHEMA,
  D2E_TRANSFER_PROPOSAL_SCHEMA,
  D2E_WORKFLOW_RESULT_SCHEMA,
  D2E_WORKFLOW_TEMPLATE_OWNERS,
  type D2EEffectDisposition,
  type D2EExecutionPhase,
  type D2EOriginalFailureCause,
  type D2EPreparedTemplateClaim,
  type D2ERepositoryState,
  D2ETransferError,
  type D2ETransferExec,
  type D2ETransferGateResult,
  type D2ETransferRequest,
  EXPECTED_ARTIFACT_KIND,
  EXPECTED_CONTROL_MODE,
  EXPECTED_FORMALIZATION_LEVEL,
  SHA256,
} from "./d2e-transfer-contract.ts";
import {
  buildWorkflowRequest,
  validateChangedPaths,
  verifyWorkflowOutput,
} from "./d2e-transfer-effects.ts";
import { canonicalize, nonEmpty } from "./d2e-transfer-json.ts";
import { readAndValidateIdentities, validateRequest } from "./d2e-transfer-readback.ts";
import type { WorkflowResult } from "./workflow.ts";
import type { WorkflowExecutor } from "./workflow-execution.ts";

export * from "./d2e-transfer-contract.ts";

interface D2EExecutionTracker {
  callerMode: "proposal" | "applied";
  phase: D2EExecutionPhase;
  requiredPacket: "ready" | "blocked" | "unknown";
  transferAuthorization: "authorized" | "not_authorized";
  transferAuthorizationReadback?: AuthorizationReadback;
  existedAtDispatch: boolean;
  effect: D2EEffectDisposition;
}

function preserveFailureBoundary(error: unknown, tracker: D2EExecutionTracker): void {
  if (error instanceof D2ETransferError && error.failureBoundary === "required_packet") {
    tracker.requiredPacket = "blocked";
  }
}

function originalFailureCause(error: unknown): D2EOriginalFailureCause {
  if (error instanceof D2ETransferError) {
    return {
      code: error.code,
      message: error.message,
      ...(error.failureBoundary ? { failure_boundary: error.failureBoundary } : {}),
    };
  }
  return {
    code: "D2E_TRANSFER_WORKFLOW_INCOMPLETE",
    message: error instanceof Error ? error.message : String(error),
  };
}

function attachTrustedFailure(error: unknown, tracker: D2EExecutionTracker): D2ETransferError {
  const typed =
    error instanceof D2ETransferError
      ? error
      : new D2ETransferError(
          "D2E_TRANSFER_WORKFLOW_INCOMPLETE",
          error instanceof Error ? error.message : String(error),
        );
  preserveFailureBoundary(typed, tracker);
  return typed.attachFailure({
    schema: "D2E_TRANSFER_FAILURE_V1",
    status: "not_ready",
    caller_mode: tracker.callerMode,
    execution_phase: tracker.phase,
    required_packet: { disposition: tracker.requiredPacket },
    transfer_materialization_authorization: {
      disposition: tracker.transferAuthorization,
      existed_at_dispatch: tracker.existedAtDispatch,
      ...(tracker.transferAuthorizationReadback
        ? { readback: tracker.transferAuthorizationReadback }
        : {}),
    },
    downstream_implementation_authorization: {
      disposition: "not_authorized",
      granted: false,
      basis: "separate_downstream_owner_authorization_required",
    },
    effect: { disposition: tracker.effect },
    error: { code: typed.code, message: typed.message },
    ...(typed.originalCause ? { original_cause: typed.originalCause } : {}),
  });
}

export async function executeD2ETransferWorkflow(options: {
  request: D2ETransferRequest;
  exec: D2ETransferExec;
  activation?: "enabled" | "disabled";
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
  inspectRepository?: (baselineHead?: string) => Promise<D2ERepositoryState>;
  claimPreparedTemplate?: (sealedText: string) => D2EPreparedTemplateClaim;
  signal?: AbortSignal;
  now?: () => number;
}): Promise<D2ETransferGateResult> {
  const tracker: D2EExecutionTracker = {
    callerMode: options.request.mode === "applied" ? "applied" : "proposal",
    phase: "input_validation",
    requiredPacket: "unknown",
    transferAuthorization: "not_authorized",
    existedAtDispatch: false,
    effect: "not_materialized",
  };
  try {
    const request = validateRequest(options.request);
    tracker.callerMode = request.mode;
    const activation = options.activation ?? "disabled";
    const now = options.now ?? Date.now;
    tracker.phase = "activation_check";
    if (request.mode === "applied" && activation !== "enabled") {
      throw new D2ETransferError(
        "D2E_TRANSFER_DISABLED",
        "Applied D2E dispatch is disabled; proposal readback remains available.",
      );
    }
    tracker.phase = "initial_readback";
    const initial = await readAndValidateIdentities({
      request,
      exec: options.exec,
      signal: options.signal,
      nowMs: now(),
    });
    tracker.requiredPacket = "ready";

    if (request.mode === "proposal") {
      const appliedReady = activation === "enabled" && initial.authorization.granted;
      return {
        kind: "proposal",
        receipt: {
          schema: D2E_TRANSFER_PROPOSAL_SCHEMA,
          lawful_success: true,
          read_only: true,
          execution_performed: false,
          mode: "proposal",
          caller_mode: "proposal",
          status: appliedReady ? "ready" : "not_ready",
          applied: false,
          activation,
          template: request.templateIdentity,
          repo: request.repo,
          packet_key: request.packetKey,
          task_id: request.taskId,
          task_scope_sha256: initial.scopeSha256,
          task_intent_sha256: initial.taskIntent.sha256,
          decision_id: request.decisionId,
          applied_ready: appliedReady,
          required_packet: { disposition: "ready" },
          transfer_materialization_authorization: {
            disposition: initial.authorization.granted ? "authorized" : "not_authorized",
            readback: initial.authorization,
          },
          downstream_implementation_authorization: {
            disposition: "not_authorized",
            granted: false,
            basis: "separate_downstream_owner_authorization_required",
          },
          effect: { disposition: "not_materialized" },
          schema_boundary: {
            inner_workflow_output: D2E_WORKFLOW_RESULT_SCHEMA,
            outer_transfer_receipt: D2E_TRANSFER_COMPLETE_SCHEMA,
          },
          authorization: initial.authorization,
        },
      };
    }
    tracker.phase = "authorization_check";
    if (!initial.authorization.granted) {
      throw new D2ETransferError(
        "D2E_TRANSFER_AUTHORIZATION_REQUIRED",
        `Exact invoking actor/session task authorization is absent; blocker=${initial.authorization.blocker}.`,
      );
    }

    tracker.phase = "preparation";
    let workflowExecutor = options.workflowExecutor;
    let workflowExecution = options.workflowExecution;
    if ((!workflowExecutor || !workflowExecution) && options.prepareWorkflow) {
      const prepared = await options.prepareWorkflow();
      workflowExecutor = prepared.workflowExecutor;
      workflowExecution = prepared.workflowExecution;
    }
    if (
      !workflowExecutor ||
      !workflowExecution ||
      !options.inspectRepository ||
      !options.claimPreparedTemplate
    ) {
      throw new D2ETransferError(
        "D2E_TRANSFER_WORKFLOW_INCOMPLETE",
        "Applied transfer lacks workflow, repository inspection, or Vault claim context.",
      );
    }

    const workflowRequest = buildWorkflowRequest(request, initial.scopeSha256, initial.taskIntent);
    const sealedText = canonicalize({
      schema: "D2E_PREPARED_EXECUTION_V1",
      request: workflowRequest,
      actor: request.invokingActor,
      session: request.invokingSessionId,
      packet: request.packetKey,
      task: request.taskId,
      decision: request.decisionId,
      task_scope_sha256: initial.scopeSha256,
      task_intent_sha256: initial.taskIntent.sha256,
      template: request.templateIdentity,
    });
    const before = await options.inspectRepository();
    if (!before.worktreeClean || before.changedPaths.length > 0 || !nonEmpty(before.head)) {
      throw new D2ETransferError(
        "D2E_TRANSFER_REPOSITORY_PRESTATE_INVALID",
        "Applied D2E dispatch requires an exact clean repository pre-state.",
      );
    }

    // Preparation is complete. Re-read AK identity/authorization, then claim Vault bytes immediately
    // before the executor call. Any actor, lease, deferral, scope, packet, or decision drift refuses.
    tracker.phase = "pre_dispatch_readback";
    const immediate = await readAndValidateIdentities({
      request,
      exec: options.exec,
      signal: options.signal,
      nowMs: now(),
    });
    if (!immediate.authorization.granted || immediate.snapshotSha256 !== initial.snapshotSha256) {
      throw new D2ETransferError(
        "D2E_TRANSFER_AUTHORIZATION_DRIFT",
        "AK authorization or identity drifted after preparation and before dispatch.",
      );
    }
    tracker.phase = "vault_claim";
    const claim = options.claimPreparedTemplate(sealedText);
    if (
      claim.sealedText !== sealedText ||
      claim.templateIdentity.templateId !== request.templateIdentity.templateId ||
      claim.templateIdentity.templateName !== request.templateIdentity.templateName ||
      claim.templateIdentity.templateVersion !== request.templateIdentity.templateVersion ||
      claim.templateIdentity.contentSha256 !== request.templateIdentity.contentSha256 ||
      claim.templateIdentity.artifactKind !== EXPECTED_ARTIFACT_KIND ||
      claim.templateIdentity.controlMode !== EXPECTED_CONTROL_MODE ||
      claim.templateIdentity.formalizationLevel !== EXPECTED_FORMALIZATION_LEVEL ||
      claim.templateIdentity.ownerCompany !==
        D2E_WORKFLOW_TEMPLATE_OWNERS[
          request.templateName as keyof typeof D2E_WORKFLOW_TEMPLATE_OWNERS
        ] ||
      !SHA256.test(claim.templateIdentity.governedMetadataSha256)
    ) {
      claim.settle("failed");
      throw new D2ETransferError(
        "D2E_TRANSFER_VAULT_AUTHORIZATION_FAILED",
        "Claimed Prompt Vault authorization does not match exact prepared/template identity.",
      );
    }

    tracker.transferAuthorization = "authorized";
    tracker.transferAuthorizationReadback = immediate.authorization;
    tracker.existedAtDispatch = true;
    tracker.effect = "indeterminate";
    tracker.phase = "dispatch";
    let workflow: WorkflowResult;
    try {
      workflow = await workflowExecutor.execute({
        request: workflowRequest,
        ...workflowExecution,
        cwd: request.repo,
        signal: options.signal,
      });
    } catch (error) {
      const failurePhase = tracker.phase;
      preserveFailureBoundary(error, tracker);
      tracker.phase = "vault_settlement";
      try {
        claim.settle("failed");
      } catch (settlementError) {
        throw new D2ETransferError(
          "D2E_TRANSFER_VAULT_AUTHORIZATION_FAILED",
          `Post-dispatch Vault failure settlement failed: ${
            settlementError instanceof Error ? settlementError.message : String(settlementError)
          }`,
          { originalCause: originalFailureCause(error) },
        );
      }
      tracker.phase = failurePhase;
      throw error;
    }
    tracker.phase = "post_effect_verification";
    let after: D2ERepositoryState;
    let changedPaths: string[];
    let output: { outputSha256: string; objectiveSha256: string };
    try {
      after = await options.inspectRepository(before.head);
      if (!after.worktreeClean || after.head === before.head) {
        throw new D2ETransferError(
          "D2E_TRANSFER_POSTSTATE_INVALID",
          "Applied workflow must produce a new committed HEAD and leave the worktree clean.",
        );
      }
      changedPaths = validateChangedPaths(after.changedPaths, initial.scope);
      output = verifyWorkflowOutput({
        workflow,
        request,
        scopeSha256: initial.scopeSha256,
        taskIntentSha256: initial.taskIntent.sha256,
        before,
        after,
        changedPaths,
      });
      tracker.phase = "final_readback";
      const post = await readAndValidateIdentities({
        request,
        exec: options.exec,
        signal: options.signal,
        nowMs: now(),
      });
      if (!post.authorization.granted || post.snapshotSha256 !== initial.snapshotSha256) {
        throw new D2ETransferError(
          "D2E_TRANSFER_POSTSTATE_INVALID",
          "AK packet/task/decision/actor/lease/scope post-state drifted during workflow execution.",
        );
      }
    } catch (error) {
      const failurePhase = tracker.phase;
      preserveFailureBoundary(error, tracker);
      tracker.phase = "vault_settlement";
      try {
        claim.settle("failed");
      } catch (settlementError) {
        throw new D2ETransferError(
          "D2E_TRANSFER_VAULT_AUTHORIZATION_FAILED",
          `Post-effect Vault failure settlement failed: ${
            settlementError instanceof Error ? settlementError.message : String(settlementError)
          }`,
          { originalCause: originalFailureCause(error) },
        );
      }
      tracker.phase = failurePhase;
      throw error;
    }
    tracker.phase = "vault_settlement";
    try {
      claim.settle("handed_off");
    } catch (error) {
      throw new D2ETransferError(
        "D2E_TRANSFER_VAULT_AUTHORIZATION_FAILED",
        `Post-effect Vault handoff settlement failed: ${
          error instanceof Error ? error.message : String(error)
        }`,
      );
    }

    return {
      kind: "complete",
      workflow,
      receipt: {
        schema: D2E_TRANSFER_COMPLETE_SCHEMA,
        lawful_success: true,
        read_only: false,
        execution_performed: true,
        mode: "applied",
        caller_mode: "applied",
        status: "complete",
        applied: true,
        activation: "enabled",
        template: claim.templateIdentity,
        transfer_materialization_authorization: {
          disposition: "authorized",
          readback: { ...initial.authorization, granted: true, blocker: null },
        },
        downstream_implementation_authorization: {
          disposition: "not_authorized",
          granted: false,
          basis: "separate_downstream_owner_authorization_required",
        },
        schema_boundary: {
          inner_workflow_output: D2E_WORKFLOW_RESULT_SCHEMA,
          outer_transfer_receipt: D2E_TRANSFER_COMPLETE_SCHEMA,
        },
        repo: request.repo,
        packet: {
          key: request.packetKey,
          id: initial.packet.id as number,
          source_ref: initial.packet.source_ref as string,
          entity_version: initial.packet.entity_version as number,
        },
        task: {
          id: request.taskId,
          status: "claimed",
          entity_version: initial.task.entity_version as number,
          scope_sha256: initial.scopeSha256,
          intent_sha256: initial.taskIntent.sha256,
        },
        decision: {
          id: request.decisionId,
          state: "unblocked",
          outcome: "accepted",
          updated_at: initial.decision.updated_at as string,
        },
        authorization: { ...initial.authorization, granted: true, blocker: null },
        effect: {
          disposition: "materialized",
          outcome: "applied",
          objective_sha256: output.objectiveSha256,
          task_intent_sha256: initial.taskIntent.sha256,
          head_before: before.head,
          head_after: after.head,
          changed_paths: changedPaths,
          output_sha256: output.outputSha256,
        },
        workflow: {
          mode: workflow.mode,
          status: "done",
          step_count: 1,
          output_schema: D2E_WORKFLOW_RESULT_SCHEMA,
        },
      },
    };
  } catch (error) {
    throw attachTrustedFailure(error, tracker);
  }
}

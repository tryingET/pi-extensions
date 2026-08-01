import path from "node:path";

import {
  canCampaignMachineStartBoundedRun,
  isCampaignMachineAwaitingOperatorChoice,
  isCampaignMachineTerminalState,
} from "../machine/campaign.ts";
import {
  AUTORESEARCH_OPERATOR_ACTIONS,
  type AutoresearchControlStateV1,
  type AutoresearchOperatorAction,
  formatAutoresearchRuntimeSnapshotReuse,
  persistAutoresearchRuntimeSnapshot,
} from "./resume.ts";
import { AUTORESEARCH_CONTROL_TOOL_NAME } from "./runtime-constants.ts";
import { formatTimestamp } from "./runtime-format.ts";
import type {
  AutoresearchRuntimeStatus,
  InspectAutoresearchRuntimeControlResult,
  SetAutoresearchRuntimeControlInput,
  SetAutoresearchRuntimeControlResult,
} from "./runtime-model.ts";
import { loadReceiptLog } from "./runtime-receipts.ts";
import {
  buildAutoresearchResumeApplyPlan,
  buildAutoresearchResumePlanFromStatus,
  formatAutoresearchResumeApplyPlanSummaryLines,
  formatAutoresearchResumePlanSummaryLines,
} from "./runtime-resume-plan.ts";
import {
  buildAutoresearchRuntimeStatus,
  createRuntimeSnapshotInput,
  ensureEventLedgerInitializedFromReceipts,
} from "./runtime-status.ts";
import { normalizeInlineReason } from "./runtime-status-format.ts";

export function inspectAutoresearchRuntimeControl(
  cwd: string,
  signal?: AbortSignal,
): InspectAutoresearchRuntimeControlResult {
  signal?.throwIfAborted();
  const resolvedCwd = path.resolve(cwd);
  const loadResult = loadReceiptLog(resolvedCwd);
  signal?.throwIfAborted();
  ensureEventLedgerInitializedFromReceipts(resolvedCwd, [...loadResult.entries]);
  signal?.throwIfAborted();
  const status = buildAutoresearchRuntimeStatus(resolvedCwd, { persistSnapshot: false });
  return {
    cwd: resolvedCwd,
    status,
    nextStep: describeAutoresearchControlNextStep(status),
  };
}

export function setAutoresearchRuntimeControl(
  input: SetAutoresearchRuntimeControlInput,
): SetAutoresearchRuntimeControlResult {
  input.signal?.throwIfAborted();
  const cwd = path.resolve(input.cwd);
  if (!isAutoresearchOperatorAction(input.decision)) {
    throw new Error(`Unsupported autoresearch control decision: ${String(input.decision)}`);
  }

  const current = inspectAutoresearchRuntimeControl(cwd, input.signal);
  input.signal?.throwIfAborted();
  assertAutoresearchControlActionAllowed(current.status, input.decision);

  const selectedAt = input.selectedAt ?? Date.now();
  const control = createExplicitAutoresearchControlState({
    status: current.status,
    decision: input.decision,
    reason: input.reason,
    selectedAt,
  });

  input.signal?.throwIfAborted();
  persistAutoresearchRuntimeSnapshot({
    cwd,
    current: createRuntimeSnapshotInput(
      cwd,
      current.status.currentSegment,
      current.status.runtimeProjection,
      current.status.promptVaultDecisions,
    ),
    control,
    updatedAt: selectedAt,
  });

  input.signal?.throwIfAborted();
  const next = inspectAutoresearchRuntimeControl(cwd, input.signal);
  return {
    cwd,
    decision: input.decision,
    previousControl: cloneAutoresearchControlState(current.status.control),
    status: next.status,
    nextStep: next.nextStep,
  };
}

export function formatAutoresearchControlResult(
  result: InspectAutoresearchRuntimeControlResult | SetAutoresearchRuntimeControlResult,
): string {
  const actionLine = "decision" in result ? `- action: set ${result.decision}` : "- action: status";
  const resumePlan = buildAutoresearchResumePlanFromStatus(result.cwd, result.status);
  const resumeApplyPlan = buildAutoresearchResumeApplyPlan(result.cwd);

  return [
    "# PI-AUTORESEARCH CONTROL",
    "",
    `- cwd: ${result.cwd}`,
    actionLine,
    ...("decision" in result ? [`- previous control: ${result.previousControl.kind}`] : []),
    `- machine state: ${result.status.runtimeProjection.state}`,
    `- machine projection source: ${result.status.runtimeProjection.source}`,
    `- snapshot reuse: ${formatAutoresearchRuntimeSnapshotReuse(result.status.runtimeSnapshot.reuse)}`,
    `- snapshot discard reason: ${result.status.runtimeSnapshot.discardedReason ?? "(none)"}`,
    `- control state: ${result.status.control.kind}`,
    `- allowed actions: ${formatAllowedActions(result.status.control.allowedActions)}`,
    `- control reason: ${result.status.control.reason ?? "(none)"}`,
    `- control selected at: ${formatTimestamp(result.status.control.selectedAt)}`,
    `- next step: ${result.nextStep}`,
    "",
    "## Resume plan",
    ...formatAutoresearchResumePlanSummaryLines(resumePlan),
    "",
    "## Resume apply plan-only proposal",
    ...formatAutoresearchResumeApplyPlanSummaryLines(resumeApplyPlan),
  ].join("\n");
}

export function formatAllowedActions(actions: readonly string[]): string {
  return actions.length > 0 ? actions.join(", ") : "(none)";
}

function isAutoresearchOperatorAction(value: string): value is AutoresearchOperatorAction {
  return AUTORESEARCH_OPERATOR_ACTIONS.includes(value as AutoresearchOperatorAction);
}

function assertAutoresearchControlActionAllowed(
  status: AutoresearchRuntimeStatus,
  decision: AutoresearchOperatorAction,
): void {
  if (status.control.allowedActions.includes(decision)) {
    return;
  }

  throw new Error(
    `Cannot set autoresearch control to ${decision} while the machine is in state ${status.runtimeProjection.state}; allowed actions: ${formatAllowedActions(status.control.allowedActions)}`,
  );
}

function createExplicitAutoresearchControlState(input: {
  status: AutoresearchRuntimeStatus;
  decision: AutoresearchOperatorAction;
  reason?: string;
  selectedAt: number;
}): AutoresearchControlStateV1 {
  return {
    kind: input.decision,
    allowedActions: [...input.status.control.allowedActions],
    reason:
      normalizeInlineReason(input.reason ?? null) ??
      defaultAutoresearchControlReason(input.decision, input.status),
    selectedAt: input.selectedAt,
  };
}

function defaultAutoresearchControlReason(
  decision: AutoresearchOperatorAction,
  status: AutoresearchRuntimeStatus,
): string {
  switch (decision) {
    case "continue":
      return canCampaignMachineStartBoundedRun(status.runtimeProjection.state)
        ? "operator approved another bounded runtime iteration"
        : "operator approved continuing from a control-gated runtime posture";
    case "rebaseline":
      return "operator requested rebaseline work before another ordinary bounded run";
    case "finalize":
      return "operator selected finalization as the next bounded control-plane phase";
    case "stop":
      return "operator halted package-local autoresearch progression";
  }
}

function describeAutoresearchControlNextStep(status: AutoresearchRuntimeStatus): string {
  switch (status.control.kind) {
    case "continue":
      if (status.runtimeProjection.state === "finalize_candidate") {
        return "Run autoresearch_runtime_run to consume continue, reject finalization for now, and start another bounded iteration.";
      }
      if (status.runtimeProjection.state === "awaiting_decision") {
        return "Run autoresearch_runtime_run to consume continue and advance the machine back into a runnable bounded posture.";
      }
      return "Run autoresearch_runtime_run to start the next bounded iteration; continue will be consumed once the run starts.";
    case "rebaseline":
      return "Use autoresearch_runtime_run with reconfigure=true (plus name + metricName when required) before another ordinary bounded run.";
    case "finalize":
      return "Use autoresearch_runtime_status with action=finalize for the governed packet or wait for the later finalization slice; ordinary bounded runs stay blocked.";
    case "stop":
      return "No further bounded runs will start until autoresearch_runtime_control changes the control state.";
    case "awaiting_operator":
      return `Use ${AUTORESEARCH_CONTROL_TOOL_NAME} with action=set to choose one of: ${formatAllowedActions(status.control.allowedActions)}.`;
    case "none":
      if (canCampaignMachineStartBoundedRun(status.runtimeProjection.state)) {
        return "Run autoresearch_runtime_run for the next bounded iteration, or set stop to hold the package-local runtime.";
      }
      if (status.runtimeProjection.state === "segment_unconfigured") {
        return "Bootstrap the bounded runtime with autoresearch_runtime_run using name + metricName, or set stop to hold it idle.";
      }
      if (isCampaignMachineTerminalState(status.runtimeProjection.state)) {
        return "The bounded runtime is complete; no further control action is required in this workstream.";
      }
      if (isCampaignMachineAwaitingOperatorChoice(status.runtimeProjection.state)) {
        return `Choose a lawful control action with ${AUTORESEARCH_CONTROL_TOOL_NAME}: ${formatAllowedActions(status.control.allowedActions)}.`;
      }
      return "Wait for the current bounded runtime transition to settle before issuing another operator control change.";
  }
}

function cloneAutoresearchControlState(
  control: AutoresearchControlStateV1,
): AutoresearchControlStateV1 {
  return {
    kind: control.kind,
    allowedActions: [...control.allowedActions],
    reason: control.reason,
    selectedAt: control.selectedAt,
  };
}

import { domainSeparatedDigest } from "./canonical-cbor.js";
import { BoundaryError } from "./errors.js";
import { deepFreeze } from "./util.js";

function finalize(value) {
  const body = {
    1: value.kind,
    2: value.processExit,
    3: value.workspaceMutation,
    4: value.networkDispatch,
    5: value.externalOutcome,
    6: value.outputCompleteness,
    7: value.descendants,
    8: value.journal,
    9: value.retrySafety,
    10: value.workspaceGenerationBefore ?? null,
    11: value.workspaceGenerationAfter ?? null,
    12: value.reasons ?? [],
  };
  return deepFreeze({
    schema: "pi-tool-boundary-effect-disposition/v1",
    ...value,
    dispositionDigest: domainSeparatedDigest(
      "pi-tool-boundary/effect-disposition/v1",
      body,
    ),
  });
}

export function completedReadDisposition({
  outputCompleteness = "complete",
  workspaceGeneration,
  reasons = [],
} = {}) {
  if (!Number.isSafeInteger(workspaceGeneration) || workspaceGeneration < 1) {
    throw new BoundaryError("INVALID_WORKSPACE_GENERATION", "workspaceGeneration is required");
  }
  if (!new Set(["complete", "partial"]).has(outputCompleteness)) {
    throw new BoundaryError("INVALID_OUTPUT_COMPLETENESS", "Read output completeness is invalid");
  }
  return finalize({
    kind: "completed-read",
    processExit: "not-started",
    workspaceMutation: "none",
    networkDispatch: "none",
    externalOutcome: "none",
    outputCompleteness,
    descendants: "empty",
    journal: "not-required",
    retrySafety: "safe",
    workspaceGenerationBefore: workspaceGeneration,
    workspaceGenerationAfter: workspaceGeneration,
    reasons,
  });
}

export function completedMutationDisposition({
  processExit = "not-started",
  outputCompleteness = "complete",
  workspaceGenerationBefore,
  workspaceGenerationAfter,
  success = true,
  reasons = [],
} = {}) {
  if (
    !Number.isSafeInteger(workspaceGenerationBefore) ||
    !Number.isSafeInteger(workspaceGenerationAfter) ||
    workspaceGenerationBefore < 1 ||
    workspaceGenerationAfter !== workspaceGenerationBefore + 1
  ) {
    throw new BoundaryError(
      "INVALID_GENERATION_TRANSITION",
      "Known mutation must advance the workspace generation by exactly one",
    );
  }
  if (!new Set(["not-started", "known"]).has(processExit)) {
    throw new BoundaryError("INVALID_PROCESS_EXIT", "Known mutation processExit is invalid");
  }
  return finalize({
    kind: "completed-mutation",
    success: Boolean(success),
    processExit,
    workspaceMutation: "known",
    networkDispatch: "none",
    externalOutcome: "none",
    outputCompleteness,
    descendants: "empty",
    journal: "durable",
    retrySafety: "unsafe",
    workspaceGenerationBefore,
    workspaceGenerationAfter,
    reasons,
  });
}

export function unknownMutationDisposition({
  workspaceGenerationBefore,
  reason,
  outputCompleteness = "unknown",
} = {}) {
  if (!Number.isSafeInteger(workspaceGenerationBefore) || workspaceGenerationBefore < 1) {
    throw new BoundaryError("INVALID_WORKSPACE_GENERATION", "workspaceGenerationBefore is required");
  }
  return finalize({
    kind: "unknown-mutation",
    processExit: "unknown",
    workspaceMutation: "unknown",
    networkDispatch: "none",
    externalOutcome: "none",
    outputCompleteness,
    descendants: "unknown",
    journal: "durable",
    retrySafety: "operator-decision",
    workspaceGenerationBefore,
    reasons: [String(reason ?? "unknown-mutation")],
  });
}

export function cancelledPreEffectDisposition({
  workspaceGeneration,
  reason = "cancelled-pre-effect",
} = {}) {
  if (!Number.isSafeInteger(workspaceGeneration) || workspaceGeneration < 1) {
    throw new BoundaryError("INVALID_WORKSPACE_GENERATION", "workspaceGeneration is required");
  }
  return finalize({
    kind: "cancelled-pre-effect",
    processExit: "not-started",
    workspaceMutation: "none",
    networkDispatch: "none",
    externalOutcome: "none",
    outputCompleteness: "complete",
    descendants: "empty",
    journal: "durable",
    retrySafety: "safe",
    workspaceGenerationBefore: workspaceGeneration,
    workspaceGenerationAfter: workspaceGeneration,
    reasons: [String(reason)],
  });
}

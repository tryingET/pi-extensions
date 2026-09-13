// v1 completion preserved. Opt-in v2 requires the private plan + PID1/graph receipts.
import { errorMessage } from "./integrity.mjs";
import { isSdkExecution } from "./sdk-execution.mjs";
import { reconcileSdkCompletion, publishSdkCompletion } from "./sdk-barrier.mjs";
import { verifyAlignedTargetState } from "./host-state.mjs";
import { verifyWithCompletionHold } from "./mutation-completion.mjs";

export function finishScenarioCommand(execution, entries, host, session, verify = verifyAlignedTargetState, sdkExecution) {
  let error;
  let sdkProof;
  try {
    if (execution.integrityFailure || execution.effectMayBeActive) {
      throw new Error(execution.error ?? "command completion is unverified");
    }
    const reconciled = sdkExecution ? reconcileSdkCompletion(execution, sdkExecution, session) : null;
    // Required on BOTH ordinary success and ordinary nonzero command completion,
    // before dropping the child identity or allowing any restorative effects.
    for (const entry of entries) {
      verify(entry, host);
      session.validateEntryMetadata(entry);
    }
    // Settlement already observed; receipts reconciled; now full source/SDK
    // recheck and durable evidence must succeed BEFORE existing exact-child clearance.
    if (reconciled) sdkProof = publishSdkCompletion(reconciled, execution);
  } catch (caught) { error = errorMessage(caught); }
  if (error) {
    // Persistence failure propagates: no clearance/restoration may follow it.
    session.holdCompletion("command-completion-unverified", execution.effectMayBeActive === true || Boolean(sdkExecution));
    return { ...execution, ok: false, integrityFailure: true, error };
  }
  // Publication can replace the session payload and then fail while releasing
  // its state gate. Normalize that failure before the runner considers restore.
  verifyWithCompletionHold(() => session.clearChild(),
    (...args) => session.holdCompletion(...args), "command-completion-unverified");
  if (sdkExecution) verifyWithCompletionHold(() => execution.deferredCleanup(),
    (...args) => session.holdCompletion(...args), "command-completion-unverified");
  if (sdkProof) execution.sdkProof = sdkProof;
  return execution;
}

export function requireUpgradeCompletionIntegration(profile, dryRun, sdkExecution) {
  if (profile === "upgrade" && !dryRun && !isSdkExecution(sdkExecution)) {
    throw new Error("Effectful upgrade refused: required approved consumption + outer completion integration is unavailable. " +
      "This defensive guard is not completed qualification or approval revocation; replace it only with real integration.");
  }
}

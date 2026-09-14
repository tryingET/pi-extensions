// Verify ordinary command completion before exact-child clearance or restoration.
import { errorMessage } from "./integrity.mjs";
import { verifyAlignedTargetState } from "./host-state.mjs";
import { verifyWithCompletionHold } from "./mutation-completion.mjs";

export function finishScenarioCommand(execution, entries, host, session, verify = verifyAlignedTargetState) {
  let error;
  try {
    if (execution.integrityFailure || execution.effectMayBeActive) {
      throw new Error(execution.error ?? "command completion is unverified");
    }
    // Required on BOTH ordinary success and ordinary nonzero command completion,
    // before dropping the child identity or allowing any restorative effects.
    for (const entry of entries) {
      verify(entry, host);
      session.validateEntryMetadata(entry);
    }
  } catch (caught) { error = errorMessage(caught); }
  if (error) {
    // Persistence failure propagates: no clearance/restoration may follow it.
    session.holdCompletion("command-completion-unverified", execution.effectMayBeActive === true);
    return { ...execution, ok: false, integrityFailure: true, error };
  }
  // Publication can replace the session payload and then fail while releasing
  // its state gate. Normalize that failure before the runner considers restore.
  verifyWithCompletionHold(() => session.clearChild(),
    (...args) => session.holdCompletion(...args), "command-completion-unverified");
  return execution;
}

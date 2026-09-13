// Pure ordering policy: callbacks supply I/O. No executor, process or filesystem imports.
function integrityFailure(error) {
  return Object.assign(new Error(error instanceof Error ? error.message : String(error), { cause: error }),
    { code: "PI_HOST_COMPAT_INTEGRITY" });
}

export function verifyWithCompletionHold(verify, hold, reason, effectMayBeActive = false) {
  try { return verify(); }
  catch (error) {
    // Persist the hold with the previous child still attached. Even publication
    // failure must escape as integrity failure, never as an ordinary command exit.
    try { hold(reason, effectMayBeActive); }
    catch (persistenceError) { throw integrityFailure(persistenceError); }
    throw integrityFailure(error);
  }
}

export function finishMutationCommand(result, { verify, hold, clear, reason }) {
  const known = result && typeof result.ok === "boolean" && Number.isInteger(result.exitCode) &&
    result.exitCode >= 0 && result.exitCode <= 255 &&
    (result.signal === null || (typeof result.signal === "string" && /^SIG[A-Z0-9]+$/.test(result.signal))) &&
    (result.ok ? result.exitCode === 0 && result.signal === null && !result.error : result.exitCode !== 0) && !result.cleanupError;
  verifyWithCompletionHold(() => {
    // Identity/metadata only: a nonzero install need not achieve aligned versions.
    verify();
    if (!known || result.integrityFailure || result.effectMayBeActive) {
      throw new Error(result?.error ?? "mutating command completion is unverified");
    }
  }, hold, reason, !known || Boolean(result?.effectMayBeActive || result?.integrityFailure));
  // Clearance publication failure is also a terminal integrity failure.
  verifyWithCompletionHold(clear, hold, reason);
  return result;
}

export { clearRecordedChild } from "./child-clearance.mjs";

// Strict wrapper receipts + a group-only liveness observation, NOT descendant containment.
// No signalling/cleanup of unknown or escaped processes. Inherited pipes can still
// delay close indefinitely; the wrapper still cleans its sandbox before reporting.
export function receiptCollector() {
  return { count: 0, result: undefined, add(result) {
    this.count = Math.min(2, this.count + 1);
    if (this.count === 1) this.result = result;
  } };
}

function validReceipt(value) {
  if (!value || typeof value !== "object" || Array.isArray(value)) return false;
  const allowed = new Set(["ok", "exitCode", "signal", "error", "cleanupError"]);
  if (Object.keys(value).some(key => !allowed.has(key))) return false;
  if (typeof value.ok !== "boolean" || !Number.isInteger(value.exitCode) ||
      value.exitCode < 0 || value.exitCode > 255 ||
      !(value.signal === null || (typeof value.signal === "string" && /^SIG[A-Z0-9]+$/.test(value.signal)))) return false;
  for (const key of ["error", "cleanupError"]) {
    if (key in value && (typeof value[key] !== "string" || value[key].length === 0)) return false;
  }
  if (!value.ok && value.exitCode === 0 && !value.cleanupError) return false;
  return !value.ok || (value.exitCode === 0 && value.signal === null && !value.error && !value.cleanupError);
}

export function processGroupState(id, platform = process.platform, probe = process.kill) {
  if (platform === "win32" || !Number.isSafeInteger(id) || id <= 0) return "unknown";
  try { probe(-id, 0); return "active"; }
  catch (error) { return error?.code === "ESRCH" ? "inactive" : "unknown"; }
}

export function wrapperCompletion(receipts, code, signal, groupState) {
  const receiptValid = receipts.count === 1 && validReceipt(receipts.result);
  const receipt = receiptValid ? receipts.result : null;
  const wrapperValid = receiptValid && signal === null && code === (receipt.ok ? 0 : receipt.exitCode);
  const integrityFailure = !wrapperValid || Boolean(receipt?.cleanupError) || groupState !== "inactive";
  // A missing/malformed/duplicate receipt leaves completion unknown even if the
  // observed group is gone. Conservatively retain child evidence in all callers.
  const effectMayBeActive = !wrapperValid || groupState !== "inactive" || Boolean(receipt?.cleanupError);
  return {
    ...(receipt ?? { exitCode: code ?? 1, signal: signal ?? null }),
    ok: !integrityFailure && receipt.ok,
    ...(integrityFailure ? { integrityFailure: true,
      error: [receipt?.error, !wrapperValid ? "missing, malformed, duplicate or inconsistent command wrapper receipt" : null,
        groupState !== "inactive" ? "command process group is active or unknown (not descendant containment)" : null,
        receipt?.cleanupError ? `wrapper cleanup failed: ${receipt.cleanupError}` : null].filter(Boolean).join("; ") } : {}),
    ...(effectMayBeActive ? { effectMayBeActive: true } : {}),
  };
}

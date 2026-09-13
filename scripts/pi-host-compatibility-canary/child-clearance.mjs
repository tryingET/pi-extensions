// Pure publication policy. A thrown persist is NOT evidence that disk stayed unchanged.
export const MAX_CHILD_CLEARANCE_ATTEMPTS = 128;
const fail = message => { throw Object.assign(new Error(message), { code: "PI_HOST_COMPAT_INTEGRITY" }); };
const exact = (left, right) => JSON.stringify(left) === JSON.stringify(right);

export function childClearanceRequiresReconciliation(payload) {
  // Conservatively includes historical dead children: before-publication failure
  // must not permit a later recovery to auto-clear the only remaining evidence.
  return Boolean(payload?.child || payload?.childClearanceAttempts?.length);
}

export function assertRecoveryChildReconciled(payload, refusal = message => new Error(message)) {
  if (childClearanceRequiresReconciliation(payload)) {
    throw refusal("child clearance requires owner reconciliation; automatic and explicit recovery refused");
  }
}

export function assertChildVacant(payload) {
  if (payload.child) fail("prior child requires verified clearance before rebinding");
}

export function assertClearancePublication(previous, next) {
  const before = previous.childClearanceAttempts ?? [];
  const after = next.childClearanceAttempts ?? [];
  if (after.length < before.length || after.length > MAX_CHILD_CLEARANCE_ATTEMPTS ||
      before.some((entry, index) => !exact(entry, after[index]))) {
    fail("child clearance history cannot be removed, changed or overflowed");
  }
  if (previous.child && !exact(previous.child, next.child)) {
    if (next.child !== null || !after.slice(before.length).some(entry => exact(entry, previous.child))) {
      fail("child clearance publication must retain the exact prior child");
    }
  }
}

export function clearRecordedChild(payload, persist) {
  if (!payload.child) return;
  const before = payload.childClearanceAttempts ?? [];
  if (!Array.isArray(before) || before.length >= MAX_CHILD_CLEARANCE_ATTEMPTS) {
    fail("child clearance history capacity exhausted; prior child retained");
  }
  const child = payload.child;
  // SAME publication as child:null: whichever old/new record survives has the
  // exact child, either active or copied here. History lasts until normal finalization.
  payload.childClearanceAttempts = [...before, structuredClone(child)];
  payload.child = null;
  try { persist(); }
  catch (error) {
    payload.child = child; // memory only; the visible journal may already contain the marker
    throw error;
  }
}

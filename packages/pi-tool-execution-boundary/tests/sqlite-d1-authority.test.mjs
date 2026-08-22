import test from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, rmSync } from "node:fs";
import os from "node:os";
import path from "node:path";
import { SqliteD1Authority, SQLITE_APPLICATION_ID } from "../src/sqlite-d1-authority.js";
import { normalizePolicy } from "../src/policy.js";
import { admitOperation } from "../src/operations.js";

const digest = (char) => char.repeat(64);
function withStore(fn) {
  const dir = mkdtempSync(path.join(os.tmpdir(), "ptb-sqlite-"));
  const databasePath = path.join(dir, "state.sqlite");
  const store = new SqliteD1Authority(databasePath);
  try { return fn(store, databasePath); }
  finally { store.close(); rmSync(dir, { recursive: true, force: true }); }
}
function lease() {
  return {
    leaseId: "lease-1",
    attestationDigest: digest("a"),
    semanticPlanDigest: digest("b"),
    effectivePolicyDigest: digest("c"),
    tcbGenerationDigest: digest("d"),
    workspaceGeneration: 1,
  };
}
function admitted(callId = "call-1") {
  return admitOperation({
    callId,
    leaseId: "lease-1",
    clientSessionId: "session-1",
    clientEpoch: "epoch-1",
    operation: { kind: "write", path: "a.txt", content: "x" },
    effectivePolicy: normalizePolicy(),
    workspaceGeneration: 1,
  });
}

test("SQLite D1 authority asserts its effective durability configuration", () => withStore((store) => {
  const status = store.status;
  assert.equal(status.applicationId, SQLITE_APPLICATION_ID);
  assert.equal(status.journalMode.toLowerCase(), "wal");
  assert.equal(status.synchronous, 2);
  assert.equal(status.foreignKeys, true);
  assert.equal(status.trustedSchema, false);
}));

test("D1 admission is idempotent and digest mismatches fail", () => withStore((store) => {
  store.registerLease(lease());
  const call = admitted();
  assert.equal(store.admitD1(call).state, "ADMITTED");
  assert.equal(store.admitD1(call).state, "ADMITTED");
  assert.throws(() => store.admitD1({ ...call, requestDigest: digest("f") }), /different request digest/);
}));

test("known completion advances durable lease generation", () => withStore((store) => {
  store.registerLease(lease());
  store.admitD1(admitted());
  store.markQueued("call-1");
  store.markStarted("call-1");
  store.finishKnown("call-1", { generationAfter: 2, disposition: { workspaceMutation: "known" } });
  assert.equal(store.getCall("call-1").state, "TERMINAL_KNOWN");
  assert.equal(store.getLease("lease-1").workspaceGeneration, 2);
}));

test("pre-effect cancellation does not quarantine the lease", () => withStore((store) => {
  store.registerLease(lease());
  store.admitD1(admitted());
  store.cancelPreEffect("call-1", { workspaceMutation: "none" });
  assert.equal(store.getCall("call-1").state, "CANCELLED_PRE_EFFECT");
  assert.equal(store.getLease("lease-1").state, "READY");
}));

test("started nonterminal recovery becomes unknown and quarantines", () => withStore((store) => {
  store.registerLease(lease());
  store.admitD1(admitted());
  store.markStarted("call-1");
  const recovered = store.recoverNonTerminal();
  assert.deepEqual(recovered, [{ callId: "call-1", previousState: "STARTED", terminalState: "TERMINAL_UNKNOWN" }]);
  assert.equal(store.getLease("lease-1").state, "QUARANTINED");
  assert.equal(store.getCall("call-1").disposition.retrySafety, "operator-decision");
}));

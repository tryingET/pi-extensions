import { mkdirSync } from "node:fs";
import path from "node:path";
import { DatabaseSync } from "node:sqlite";
import { BoundaryError } from "./errors.js";
export const SQLITE_APPLICATION_ID = 0x50544231; // PTB1
export const SQLITE_SCHEMA_VERSION = 1;
function nowMs() { return Date.now(); }
function json(value) { return value === undefined ? null : JSON.stringify(value); }
function parseJson(value) { return value === null || value === undefined ? undefined : JSON.parse(value); }
function assertPositiveInteger(value, label) {
  if (!Number.isSafeInteger(value) || value < 1) {
    throw new BoundaryError("INVALID_DATABASE_VALUE", `${label} must be a positive safe integer`);
  }
  return value;
}
export class SqliteD1Authority {
  #db;
  #closed = false;
  constructor(databasePath) {
    if (typeof databasePath !== "string" || databasePath.length === 0) {
      throw new BoundaryError("INVALID_DATABASE_PATH", "databasePath is required");
    }
    if (databasePath !== ":memory:") {
      mkdirSync(path.dirname(path.resolve(databasePath)), { recursive: true, mode: 0o700 });
    }
    this.#db = new DatabaseSync(databasePath);
    this.#configure();
    this.#migrate();
    this.#verifyConfiguration();
  }
  #configure() {
    this.#db.enableLoadExtension(false);
    this.#db.exec(`
      PRAGMA journal_mode=WAL;
      PRAGMA synchronous=FULL;
      PRAGMA foreign_keys=ON;
      PRAGMA trusted_schema=OFF;
      PRAGMA busy_timeout=5000;
      PRAGMA wal_autocheckpoint=1000;
      PRAGMA temp_store=MEMORY;
      PRAGMA application_id=${SQLITE_APPLICATION_ID};
    `);
  }
  #migrate() {
    const current = Number(this.#db.prepare("PRAGMA user_version").get().user_version);
    if (current > SQLITE_SCHEMA_VERSION) {
      throw new BoundaryError("DATABASE_SCHEMA_TOO_NEW", `Database schema ${current} is newer than supported ${SQLITE_SCHEMA_VERSION}`);
    }
    if (current !== 0) return;
    this.#db.exec("BEGIN IMMEDIATE");
    try {
      this.#db.exec(`
        CREATE TABLE IF NOT EXISTS leases (
          lease_id TEXT PRIMARY KEY,
          state TEXT NOT NULL,
          attestation_digest TEXT NOT NULL,
          semantic_plan_digest TEXT NOT NULL,
          effective_policy_digest TEXT NOT NULL,
          tcb_generation_digest TEXT NOT NULL,
          workspace_generation INTEGER NOT NULL CHECK (workspace_generation >= 1),
          created_at_ms INTEGER NOT NULL,
          updated_at_ms INTEGER NOT NULL
        ) STRICT;
        CREATE TABLE IF NOT EXISTS calls (
          call_id TEXT PRIMARY KEY,
          request_digest TEXT NOT NULL,
          lease_id TEXT NOT NULL REFERENCES leases(lease_id) ON DELETE RESTRICT,
          client_session_id TEXT NOT NULL,
          client_epoch TEXT NOT NULL,
          operation_kind TEXT NOT NULL,
          effect TEXT NOT NULL,
          durability TEXT NOT NULL CHECK (durability = 'D1-workspace-effect'),
          state TEXT NOT NULL,
          generation_before INTEGER NOT NULL CHECK (generation_before >= 1),
          generation_after INTEGER,
          disposition_json TEXT,
          created_at_ms INTEGER NOT NULL,
          updated_at_ms INTEGER NOT NULL
        ) STRICT;
        CREATE TABLE IF NOT EXISTS critical_events (
          event_id INTEGER PRIMARY KEY AUTOINCREMENT,
          lease_id TEXT,
          call_id TEXT,
          event_kind TEXT NOT NULL,
          payload_json TEXT,
          created_at_ms INTEGER NOT NULL,
          FOREIGN KEY (lease_id) REFERENCES leases(lease_id) ON DELETE RESTRICT,
          FOREIGN KEY (call_id) REFERENCES calls(call_id) ON DELETE RESTRICT
        ) STRICT;
        CREATE INDEX IF NOT EXISTS calls_lease_state_idx ON calls(lease_id, state);
        CREATE INDEX IF NOT EXISTS critical_events_lease_idx ON critical_events(lease_id, event_id);
        PRAGMA user_version=${SQLITE_SCHEMA_VERSION};
      `);
      this.#db.exec("COMMIT");
    } catch (error) {
      this.#db.exec("ROLLBACK");
      throw error;
    }
  }
  #verifyConfiguration() {
    const expected = {
      journal_mode: "wal",
      synchronous: 2,
      foreign_keys: 1,
      trusted_schema: 0,
      application_id: SQLITE_APPLICATION_ID,
      user_version: SQLITE_SCHEMA_VERSION,
    };
    const observed = {
      journal_mode: String(this.#db.prepare("PRAGMA journal_mode").get().journal_mode).toLowerCase(),
      synchronous: Number(this.#db.prepare("PRAGMA synchronous").get().synchronous),
      foreign_keys: Number(this.#db.prepare("PRAGMA foreign_keys").get().foreign_keys),
      trusted_schema: Number(this.#db.prepare("PRAGMA trusted_schema").get().trusted_schema),
      application_id: Number(this.#db.prepare("PRAGMA application_id").get().application_id),
      user_version: Number(this.#db.prepare("PRAGMA user_version").get().user_version),
    };
    for (const [key, wanted] of Object.entries(expected)) {
      if (observed[key] !== wanted) {
        throw new BoundaryError("SQLITE_CONFIGURATION_MISMATCH", `SQLite ${key} is ${observed[key]}, expected ${wanted}`, { key, observed: observed[key], expected: wanted });
      }
    }
  }
  get status() {
    this.#assertOpen();
    return Object.freeze({
      schema: "pi-tool-boundary-sqlite-status/v1",
      applicationId: Number(this.#db.prepare("PRAGMA application_id").get().application_id),
      schemaVersion: Number(this.#db.prepare("PRAGMA user_version").get().user_version),
      journalMode: String(this.#db.prepare("PRAGMA journal_mode").get().journal_mode),
      synchronous: Number(this.#db.prepare("PRAGMA synchronous").get().synchronous),
      foreignKeys: Number(this.#db.prepare("PRAGMA foreign_keys").get().foreign_keys) === 1,
      trustedSchema: Number(this.#db.prepare("PRAGMA trusted_schema").get().trusted_schema) === 1,
      walAutocheckpoint: Number(this.#db.prepare("PRAGMA wal_autocheckpoint").get().wal_autocheckpoint),
    });
  }
  registerLease(lease) {
    this.#assertOpen();
    assertPositiveInteger(lease.workspaceGeneration, "lease.workspaceGeneration");
    return this.#transaction(() => {
      const existing = this.#db.prepare("SELECT * FROM leases WHERE lease_id = ?").get(lease.leaseId);
      if (existing) {
        for (const [column, expected] of [
          ["attestation_digest", lease.attestationDigest],
          ["semantic_plan_digest", lease.semanticPlanDigest],
          ["effective_policy_digest", lease.effectivePolicyDigest],
          ["tcb_generation_digest", lease.tcbGenerationDigest],
        ]) {
          if (existing[column] !== expected) {
            throw new BoundaryError("LEASE_IDENTITY_MISMATCH", `Existing lease ${lease.leaseId} has a different ${column}`);
          }
        }
        return this.#rowToLease(existing);
      }
      const timestamp = nowMs();
      this.#db.prepare(`
        INSERT INTO leases (
          lease_id, state, attestation_digest, semantic_plan_digest,
          effective_policy_digest, tcb_generation_digest, workspace_generation,
          created_at_ms, updated_at_ms
        ) VALUES (?, 'READY', ?, ?, ?, ?, ?, ?, ?)
      `).run(
        lease.leaseId,
        lease.attestationDigest,
        lease.semanticPlanDigest,
        lease.effectivePolicyDigest,
        lease.tcbGenerationDigest,
        lease.workspaceGeneration,
        timestamp,
        timestamp,
      );
      return this.getLease(lease.leaseId);
    });
  }
  admitD1(admitted) {
    this.#assertOpen();
    return this.#transaction(() => {
      const existing = this.#db.prepare("SELECT * FROM calls WHERE call_id = ?").get(admitted.callId);
      if (existing) {
        if (existing.request_digest !== admitted.requestDigest) {
          throw new BoundaryError("CALL_DUPLICATE_MISMATCH", `Call ${admitted.callId} already exists with a different request digest`);
        }
        return Object.freeze({ ...this.#rowToCall(existing), created: false });
      }
      const lease = this.#requireLease(admitted.leaseId);
      if (lease.state !== "READY") {
        throw new BoundaryError("LEASE_NOT_READY", `Lease ${admitted.leaseId} is ${lease.state}`);
      }
      if (Number(lease.workspace_generation) !== admitted.workspaceGeneration) {
        throw new BoundaryError("WORKSPACE_STALE", "Durable admission generation does not match the lease", {
          admitted: admitted.workspaceGeneration,
          persisted: Number(lease.workspace_generation),
        });
      }
      const timestamp = nowMs();
      this.#db.prepare(`
        INSERT INTO calls (
          call_id, request_digest, lease_id, client_session_id, client_epoch,
          operation_kind, effect, durability, state, generation_before,
          created_at_ms, updated_at_ms
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, 'ADMITTED', ?, ?, ?)
      `).run(
        admitted.callId,
        admitted.requestDigest,
        admitted.leaseId,
        admitted.clientSessionId,
        admitted.clientEpoch,
        admitted.operation.kind,
        admitted.effect,
        admitted.durability,
        admitted.workspaceGeneration,
        timestamp,
        timestamp,
      );
      this.#criticalEvent(admitted.leaseId, admitted.callId, "D1_ADMITTED", {
        requestDigest: admitted.requestDigest,
        generationBefore: admitted.workspaceGeneration,
      });
      return Object.freeze({ ...this.getCall(admitted.callId), created: true });
    });
  }
  markQueued(callId) { return this.#transition(callId, ["ADMITTED"], "QUEUED", "D1_QUEUED"); }
  markStarted(callId) { return this.#transition(callId, ["ADMITTED", "QUEUED"], "STARTED", "D1_STARTED"); }
  markCancelRequested(callId) { return this.#transition(callId, ["STARTED"], "CANCEL_REQUESTED", "D1_CANCEL_REQUESTED"); }
  finishKnown(callId, { generationAfter, disposition }) {
    this.#assertOpen();
    return this.#transaction(() => {
      const current = this.#requireCall(callId);
      if (current.state === "TERMINAL_KNOWN") return this.#rowToCall(current);
      if (current.state !== "STARTED") {
        throw new BoundaryError("INVALID_CALL_TRANSITION", `Cannot finish ${callId} from ${current.state}`);
      }
      const lease = this.#requireLease(current.lease_id);
      const expectedGeneration = Number(lease.workspace_generation) + 1;
      if (generationAfter !== expectedGeneration) {
        throw new BoundaryError("INVALID_GENERATION_TRANSITION", `Known D1 completion must advance generation to ${expectedGeneration}`);
      }
      if (Number(current.generation_before) !== Number(lease.workspace_generation)) {
        throw new BoundaryError("WORKSPACE_STALE", "Call generation no longer matches the lease generation");
      }
      return this.#commitKnownTerminal({ current, state: "TERMINAL_KNOWN", generationAfter, disposition, eventKind: "D1_TERMINAL_KNOWN" });
    });
  }
  finishCancelledKnown(callId, { generationAfter, disposition }) {
    this.#assertOpen();
    return this.#transaction(() => {
      const current = this.#requireCall(callId);
      if (current.state === "TERMINAL_CANCELLED_KNOWN") return this.#rowToCall(current);
      if (current.state !== "CANCEL_REQUESTED") {
        throw new BoundaryError("INVALID_CALL_TRANSITION", `Cannot finish cancellation for ${callId} from ${current.state}`);
      }
      const lease = this.#requireLease(current.lease_id);
      const mutation = disposition?.workspaceMutation;
      const expectedGeneration = mutation === "known"
        ? Number(lease.workspace_generation) + 1
        : Number(lease.workspace_generation);
      if (mutation !== "known" && mutation !== "none") {
        throw new BoundaryError("INVALID_WORKSPACE_MUTATION_DISPOSITION", "Known cancellation requires workspaceMutation none or known");
      }
      if (generationAfter !== expectedGeneration) {
        throw new BoundaryError("INVALID_GENERATION_TRANSITION", `Cancellation disposition requires generation ${expectedGeneration}`);
      }
      return this.#commitKnownTerminal({ current, state: "TERMINAL_CANCELLED_KNOWN", generationAfter, disposition, eventKind: "D1_TERMINAL_CANCELLED_KNOWN" });
    });
  }
  cancelPreEffect(callId, disposition) {
    this.#assertOpen();
    return this.#transaction(() => {
      const current = this.#requireCall(callId);
      if (current.state === "CANCELLED_PRE_EFFECT") return this.#rowToCall(current);
      if (current.state !== "ADMITTED" && current.state !== "QUEUED") {
        throw new BoundaryError("INVALID_CALL_TRANSITION", `Cannot cancel ${callId} pre-effect from ${current.state}`);
      }
      const timestamp = nowMs();
      this.#db.prepare(`
        UPDATE calls
        SET state = 'CANCELLED_PRE_EFFECT', disposition_json = ?, updated_at_ms = ?
        WHERE call_id = ?
      `).run(json(disposition), timestamp, callId);
      this.#criticalEvent(current.lease_id, callId, "D1_CANCELLED_PRE_EFFECT", disposition);
      return this.getCall(callId);
    });
  }
  finishUnknown(callId, disposition) {
    this.#assertOpen();
    return this.#transaction(() => {
      const current = this.#requireCall(callId);
      if (current.state === "TERMINAL_UNKNOWN") return this.#rowToCall(current);
      if (current.state !== "STARTED" && current.state !== "CANCEL_REQUESTED") {
        throw new BoundaryError("INVALID_CALL_TRANSITION", `Cannot mark ${callId} unknown from ${current.state}`);
      }
      const timestamp = nowMs();
      this.#db.prepare(`
        UPDATE calls
        SET state = 'TERMINAL_UNKNOWN', disposition_json = ?, updated_at_ms = ?
        WHERE call_id = ?
      `).run(json(disposition), timestamp, callId);
      this.#db.prepare("UPDATE leases SET state = 'QUARANTINED', updated_at_ms = ? WHERE lease_id = ?")
        .run(timestamp, current.lease_id);
      this.#criticalEvent(current.lease_id, callId, "D1_TERMINAL_UNKNOWN", disposition);
      return this.getCall(callId);
    });
  }
  getCall(callId) {
    this.#assertOpen();
    const row = this.#db.prepare("SELECT * FROM calls WHERE call_id = ?").get(callId);
    return row ? this.#rowToCall(row) : undefined;
  }
  getLease(leaseId) {
    this.#assertOpen();
    const row = this.#db.prepare("SELECT * FROM leases WHERE lease_id = ?").get(leaseId);
    return row ? this.#rowToLease(row) : undefined;
  }
  recoverNonTerminal({ leaseId } = {}) {
    this.#assertOpen();
    return this.#transaction(() => {
      const sql = leaseId
        ? "SELECT * FROM calls WHERE lease_id = ? AND state IN ('ADMITTED', 'QUEUED', 'STARTED', 'CANCEL_REQUESTED') ORDER BY created_at_ms"
        : "SELECT * FROM calls WHERE state IN ('ADMITTED', 'QUEUED', 'STARTED', 'CANCEL_REQUESTED') ORDER BY created_at_ms";
      const rows = leaseId ? this.#db.prepare(sql).all(leaseId) : this.#db.prepare(sql).all();
      const recovered = [];
      for (const row of rows) {
        const started = row.state === "STARTED" || row.state === "CANCEL_REQUESTED";
        const disposition = {
          processExit: started ? "unknown" : "not-started",
          workspaceMutation: started ? "unknown" : "none",
          networkDispatch: "none",
          externalOutcome: "none",
          outputCompleteness: "unknown",
          descendants: started ? "unknown" : "empty",
          journal: "durable",
          retrySafety: started ? "operator-decision" : "safe",
          reasons: ["daemon-recovery-nonterminal-d1"],
        };
        const timestamp = nowMs();
        const terminalState = started ? "TERMINAL_UNKNOWN" : "CANCELLED_PRE_EFFECT";
        this.#db.prepare("UPDATE calls SET state = ?, disposition_json = ?, updated_at_ms = ? WHERE call_id = ?")
          .run(terminalState, json(disposition), timestamp, row.call_id);
        if (started) {
          this.#db.prepare("UPDATE leases SET state = 'QUARANTINED', updated_at_ms = ? WHERE lease_id = ?")
            .run(timestamp, row.lease_id);
        }
        this.#criticalEvent(row.lease_id, row.call_id, "D1_RECOVERED_NONTERMINAL", {
          previousState: row.state,
          terminalState,
        });
        recovered.push({ callId: row.call_id, previousState: row.state, terminalState });
      }
      return Object.freeze(recovered);
    });
  }
  close() {
    if (this.#closed) return;
    this.#db.close();
    this.#closed = true;
  }
  #commitKnownTerminal({ current, state, generationAfter, disposition, eventKind }) {
    assertPositiveInteger(generationAfter, "generationAfter");
    const timestamp = nowMs();
    this.#db.prepare(`
      UPDATE calls
      SET state = ?, generation_after = ?, disposition_json = ?, updated_at_ms = ?
      WHERE call_id = ?
    `).run(state, generationAfter, json(disposition), timestamp, current.call_id);
    this.#db.prepare(`
      UPDATE leases
      SET workspace_generation = ?, updated_at_ms = ?
      WHERE lease_id = ?
    `).run(generationAfter, timestamp, current.lease_id);
    this.#criticalEvent(current.lease_id, current.call_id, eventKind, disposition);
    return this.getCall(current.call_id);
  }
  #transition(callId, allowed, next, eventKind) {
    this.#assertOpen();
    return this.#transaction(() => {
      const current = this.#requireCall(callId);
      if (current.state === next) return this.#rowToCall(current);
      if (!allowed.includes(current.state)) {
        throw new BoundaryError("INVALID_CALL_TRANSITION", `Cannot transition ${callId} from ${current.state} to ${next}`);
      }
      const timestamp = nowMs();
      this.#db.prepare("UPDATE calls SET state = ?, updated_at_ms = ? WHERE call_id = ?")
        .run(next, timestamp, callId);
      this.#criticalEvent(current.lease_id, callId, eventKind, { previousState: current.state });
      return this.getCall(callId);
    });
  }
  #criticalEvent(leaseId, callId, eventKind, payload) {
    this.#db.prepare(`
      INSERT INTO critical_events (lease_id, call_id, event_kind, payload_json, created_at_ms)
      VALUES (?, ?, ?, ?, ?)
    `).run(leaseId ?? null, callId ?? null, eventKind, json(payload), nowMs());
  }
  #requireCall(callId) {
    const row = this.#db.prepare("SELECT * FROM calls WHERE call_id = ?").get(callId);
    if (!row) throw new BoundaryError("CALL_NOT_FOUND", `Call not found: ${callId}`);
    return row;
  }
  #requireLease(leaseId) {
    const row = this.#db.prepare("SELECT * FROM leases WHERE lease_id = ?").get(leaseId);
    if (!row) throw new BoundaryError("LEASE_NOT_FOUND", `Lease not found: ${leaseId}`);
    return row;
  }
  #rowToCall(row) {
    return Object.freeze({
      callId: row.call_id,
      requestDigest: row.request_digest,
      leaseId: row.lease_id,
      clientSessionId: row.client_session_id,
      clientEpoch: row.client_epoch,
      operationKind: row.operation_kind,
      effect: row.effect,
      durability: row.durability,
      state: row.state,
      generationBefore: Number(row.generation_before),
      generationAfter: row.generation_after === null ? undefined : Number(row.generation_after),
      disposition: parseJson(row.disposition_json),
    });
  }
  #rowToLease(row) {
    return Object.freeze({
      leaseId: row.lease_id,
      state: row.state,
      attestationDigest: row.attestation_digest,
      semanticPlanDigest: row.semantic_plan_digest,
      effectivePolicyDigest: row.effective_policy_digest,
      tcbGenerationDigest: row.tcb_generation_digest,
      workspaceGeneration: Number(row.workspace_generation),
    });
  }
  #transaction(fn) {
    this.#db.exec("BEGIN IMMEDIATE");
    try {
      const result = fn();
      this.#db.exec("COMMIT");
      return result;
    } catch (error) {
      try { this.#db.exec("ROLLBACK"); } catch {}
      throw error;
    }
  }
  #assertOpen() {
    if (this.#closed) throw new BoundaryError("DATABASE_CLOSED", "SQLite authority is closed");
  }
}

// ---
// summary: Fleet Phase-2 exact-task read-only standing-agent dispatch contract constants and types.
// read_when:
//   - changing the dispatch_agent Phase-2 gate, eligibility rules, or receipt/evidence semantics.
// ---

/**
 * Fleet Phase 2 enables exactly one bounded execution shape:
 * one registered standing agent, bound to one exact claimed AK task,
 * read-only, executed through the ASC-owned runtime, recorded as one
 * immutable receipt plus one AK evidence row. Everything else stays
 * fail-closed exactly as in Phase 0/1.
 */
export const DISPATCH_PHASE = "fleet_phase_2" as const;

export const DISPATCH_RECEIPT_SCHEMA = "pi-agent-registry.dispatch-receipt/1" as const;

export const DISPATCH_EVIDENCE_CHECK_TYPE = "standing-agent-dispatch" as const;

/**
 * Tool allowlist for Phase-2 read-only dispatch. `bash` is admitted only as
 * the fleet's established read-only exploration instrument (profile parity
 * with ASC explorer/reviewer/tester/researcher); mutation tools are excluded
 * and the child task contract plus parent-side observation bound the posture.
 */
export const READ_ONLY_DISPATCH_TOOLS: readonly string[] = ["read", "bash"];

/**
 * Provenance marker injected into every dispatched standing-agent child.
 * `dispatch_agent` refuses to run inside a session that already carries it,
 * keeping standing-agent dispatch one level deep.
 */
export const DISPATCH_CHILD_PROVENANCE_ENV = "PI_PROVENANCE_STANDING_AGENT_DISPATCH" as const;

/** Default bounded child execution timeout (seconds) for Phase-2 dispatch. */
export const DISPATCH_EXECUTION_TIMEOUT_SECONDS = 900;

/** Default bounded child startup timeout (seconds) for Phase-2 dispatch. */
export const DISPATCH_STARTUP_TIMEOUT_SECONDS = 120;

/** Bounded retry posture: a failed attempt never burns the pair, but at most
 * this many receipts may exist per (agent, exact task) pair, and only ONE may
 * be settled. */
export const MAX_DISPATCH_ATTEMPTS_PER_PAIR = 3;

export type DispatchFailureReason =
  | "invalid_request"
  | "recursive_dispatch"
  | "unknown_agent"
  | "agent_not_read_only"
  | "agent_repo_dirty"
  | "agent_repo_drift"
  | "agent_resolution_failed"
  | "dispatch_already_recorded"
  | "dispatch_attempts_exhausted"
  | "ak_unavailable"
  | "asc_execution_unavailable"
  | "task_not_found"
  | "task_repo_mismatch"
  | "task_not_claimed"
  | "task_lease_expired"
  | "parent_repo_unobservable"
  | "dispatch_failed"
  | "read_only_violation_observed"
  | "receipt_write_failed"
  | "evidence_record_failed";

export interface AkTaskSnapshot {
  id: number;
  repo: string;
  title: string;
  status: string;
  claimed_by: string | null;
  lease_expires_at: string | null;
}

export interface DispatchAgentRequest {
  /** Registered standing-agent name (agent.json `name`). */
  agent: string;
  /** Exact AK task id that authorizes this one read-only dispatch. */
  task: number;
  /** Bounded read-only objective for the dispatched agent. */
  objective: string;
}

export interface DispatchEffectFact {
  spawnAttempted: boolean;
  effectDisposition: "confirmed_no_effects" | "settled" | "effect_indeterminate";
}

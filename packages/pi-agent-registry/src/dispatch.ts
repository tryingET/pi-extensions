// ---
// summary: fail-closed Fleet Phase-0 standing-agent dispatch gate pending exact-task read-only authorization.
// read_when:
//   - changing the dispatch_agent Phase-0 gate or preparing the AK 5132 read-only dispatch contract.
// ---

export const STANDING_AGENT_PHASE0_GATE = Object.freeze({
  code: "fleet_phase0_dispatch_disabled",
  phase: "fleet_phase_0",
  nextTaskId: 5132,
  effectDisposition: "confirmed_no_effects",
  spawnAttempted: false,
  capacityReserved: false,
  worktreeCreated: false,
  authorityGranted: false,
} as const);

export class AgentDispatchError extends Error {
  readonly reason = STANDING_AGENT_PHASE0_GATE.code;
  readonly details: typeof STANDING_AGENT_PHASE0_GATE;

  constructor() {
    super(
      "standing-agent dispatch is disabled in Fleet Phase 0; AK task 5132 must land an exact-task read-only launch contract before dispatch is enabled",
    );
    this.name = "AgentDispatchError";
    this.details = STANDING_AGENT_PHASE0_GATE;
  }
}

export interface AgentDispatchRequest {
  agent: string;
  objective: string;
}

/**
 * This adapter deliberately has no executable dependency on ASC in Phase 0.
 * Keep the broad positional shape so internal callers fail closed while the
 * Phase-2 contract replaces it intentionally rather than reviving old logic.
 */
export async function dispatchAgent(
  _options?: unknown,
  _request?: AgentDispatchRequest,
  _ctx?: unknown,
  _onUpdate?: unknown,
  _signal?: AbortSignal,
): Promise<never> {
  throw new AgentDispatchError();
}

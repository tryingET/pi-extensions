// ---
// summary: Fleet Phase-3 clean visible standing-agent launch contract constants and types.
// read_when:
//   - changing the standing_agent_spawn Phase-3 gates, ACK instrument policy, or receipt/evidence semantics.
// ---

import type { AkAuthorizationFailureCode } from "./dispatch-authorization.ts";
import type { AgentRegistry } from "./registry.ts";
import type { TrustedVisibleLaunchBootstrapResolver } from "./visible-launch-bootstrap.ts";
import type {
  VisibleLaunchReceipt,
  writeImmutableVisibleLaunchReceipt,
} from "./visible-launch-receipt.ts";

/**
 * Fleet Phase 3 adds exactly one bounded surface: launching one registered
 * standing agent as a CLEAN VISIBLE Pi TUI session in a Ghostty tab/window,
 * composed from the fleet manifest, ACKing the controller through intercom,
 * and recorded as one write-once launch receipt. It is an operator-surface
 * capability, not ASC execution and not task authority: dispatch_agent keeps
 * owning exact-task read-only dispatch, and AK keeps owning task/evidence
 * truth. The launch does not authenticate the caller as any AK claimant.
 */
export const VISIBLE_LAUNCH_PHASE = "fleet_phase_3" as const;

export const VISIBLE_LAUNCH_RECEIPT_SCHEMA = "pi-agent-registry.visible-launch-receipt/1" as const;

export const VISIBLE_LAUNCH_EVIDENCE_CHECK_TYPE = "standing-agent-visible-launch" as const;

/**
 * Declared-tool gate for a visible standing-agent launch. Mirrors Phase-2
 * read-only posture: `bash` is admitted only as the fleet's established
 * read-only exploration instrument; a visible standing agent with mutation
 * tools is a later fleet phase, not this contract.
 */
export const READ_ONLY_VISIBLE_LAUNCH_TOOLS: readonly string[] = ["read", "bash"];

/**
 * Report-back instrument added by the launch envelope. It is not part of the
 * agent's declared manifest toolset (which stays the agent's own authority
 * surface); the receipt records declared and effective tools separately so
 * the ACK instrument never silently widens agent authority.
 */
export const VISIBLE_LAUNCH_ACK_TOOL = "intercom" as const;

/**
 * Provenance marker exported into every visibly launched standing-agent
 * child. `standing_agent_spawn` refuses to run inside a session that already
 * carries it, keeping visible standing-agent launches one level deep.
 */
export const VISIBLE_LAUNCH_CHILD_PROVENANCE_ENV =
  "PI_PROVENANCE_STANDING_AGENT_VISIBLE_LAUNCH" as const;

/**
 * Linux MAX_ARG_STRLEN (32 pages) bounds one argv entry; a composed system
 * prompt at or above this bound cannot be passed as `--system-prompt` argv
 * and fails closed instead of silently truncating the agent persona.
 */
export const VISIBLE_LAUNCH_SYSTEM_PROMPT_ARGV_LIMIT = 131_072;

export type VisibleLaunchReportBack = "intercom" | "manual" | "none";

export type VisibleLaunchFailureReason =
  | AkAuthorizationFailureCode
  | "parent_repo_unobservable"
  | "bootstrap_unavailable"
  | "manifest_extensions_unapproved"
  | "launch_already_reserved"
  | "reservation_failed"
  | "cancelled"
  | "invalid_argv"
  | "invalid_request"
  | "invalid_parent_peer_target"
  | "recursive_launch"
  | "visible_transport_unavailable"
  | "unknown_agent"
  | "agent_not_read_only"
  | "agent_repo_dirty"
  | "agent_repo_drift"
  | "agent_resolution_failed"
  | "system_prompt_too_large"
  | "launch_failed"
  | "launch_indeterminate"
  | "receipt_write_failed";

export interface StandingAgentSpawnRequest {
  /** Registered standing-agent name (agent.json `name`). */
  agent: string;
  /** Exact claimed AK task in the origin repository. */
  task: number;
  /** Nonblank bounded read-only objective; never a standby session. */
  objective: string;
  /** Report-back mode; intercom (default) requires an exact parent session id. */
  reportBack?: VisibleLaunchReportBack;
  /** Exact controller session id receiving PEER_ACK/PEER_FINAL. */
  parentPeerTarget?: string;
  /** Working directory for the child (default: the origin repository). */
  cwd?: string;
}

/** Structural shape of the little-helpers visible transport seam. */
export interface VisibleLaunchTransport {
  launchPiQuestSession: (request: {
    pi: unknown;
    ctx: { model?: unknown; cwd?: string };
    options?: Record<string, unknown>;
    defaultPiBin: string;
    prompt: string;
    titlePrompt: string;
    cwd: string;
    titlePrefix?: string;
    modelArgs?: string[];
    extraPiArgs?: string[];
    childProvenanceEnv?: Record<string, string>;
    signal?: AbortSignal;
  }) => Promise<{
    ok: boolean;
    effectDisposition: string;
    launchMode: string;
    sessionMode: string;
    cwd: string;
    titleBase: string;
    promptSummary: string;
    launchNote?: string;
    failure?: string;
  }>;
}

export interface StandingAgentSpawnDeps {
  registry: AgentRegistry;
  pi: unknown;
  /** Test-only transport substitution; null forces unavailable. Never a tool parameter. */
  transport?: VisibleLaunchTransport | null;
  receiptsDir?: string;
  akBinary?: string;
  /** Trusted runtime dependency, not caller-supplied extension paths. */
  resolveTrustedBootstrap?: TrustedVisibleLaunchBootstrapResolver;
  /** Test seam for publication failures after transport admission. */
  writeReceipt?: typeof writeImmutableVisibleLaunchReceipt;
}
export interface VisibleLaunchCtx {
  cwd: string;
  model?: { provider?: string; id?: string };
}
export interface StandingAgentSpawnSuccess {
  ok: true;
  phase: typeof VISIBLE_LAUNCH_PHASE;
  admission: "transport_admitted";
  receipt: VisibleLaunchReceipt;
  receiptPath: string;
  runId: string;
  launchMode: string;
}
export interface StandingAgentSpawnFailure {
  ok: false;
  phase: typeof VISIBLE_LAUNCH_PHASE;
  reason: VisibleLaunchFailureReason;
  message: string;
  effectDisposition: "confirmed_no_effects" | "settled" | "effect_indeterminate";
  spawnAttempted: boolean;
  runId?: string;
  receipt?: VisibleLaunchReceipt;
  receiptPath?: string;
}
export type StandingAgentSpawnOutcome = StandingAgentSpawnSuccess | StandingAgentSpawnFailure;

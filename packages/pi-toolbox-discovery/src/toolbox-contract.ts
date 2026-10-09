/**
summary: "Defines toolbox actions, risks, bundles, activation leases, always-active tools, and operator-facing activation contracts."
read_when:
  - "Changing toolbox type contracts, TTL limits, foundational tools, cache guidance, or continuation messaging."
*/
export type ToolboxAction =
  | "search"
  | "activate"
  | "deactivate"
  | "status"
  | "doctor"
  | "plan"
  | "explain"
  | "recommend";
export type ToolboxRisk =
  | "safe"
  | "read"
  | "diagnostic"
  | "mutating"
  | "external-mutation"
  | "orchestrator-gated";

export interface ToolboxProfile {
  id: string;
  description: string;
  tools: string[];
  risk: ToolboxRisk;
  defaultTtlTurns: number;
  requiresExplicitUserIntent: boolean;
}

export interface ToolboxBundle {
  id: string;
  title: string;
  description: string;
  ownerPackage: string;
  ownerSemantics: string;
  keywords: string[];
  profiles: ToolboxProfile[];
}

export interface ActivationLease {
  tool: string;
  bundle?: string;
  profile?: string;
  pinned: boolean;
  expiresAtTurn?: number;
  riskJustification?: string;
}

export interface ToolboxState {
  turn: number;
  leases: Map<string, ActivationLease>;
}

export interface ToolboxParams {
  action?: ToolboxAction;
  query?: string;
  bundle?: string;
  profile?: string;
  tools?: string[];
  ttlTurns?: number;
  pin?: boolean;
  autoContinue?: boolean;
  riskAcknowledged?: boolean;
  riskJustification?: string;
}

export interface ToolCatalogMatch {
  bundle: ToolboxBundle;
  profile: ToolboxProfile;
}

export interface ActivationPlan {
  bundle?: ToolboxBundle;
  profile?: ToolboxProfile;
  source: "bundle-profile" | "explicit-tools";
  requestedTools: string[];
  risks: ToolboxRisk[];
  requiresAcknowledgement: boolean;
  errors: string[];
}

export const ALWAYS_ACTIVE_TOOLS = [
  "read",
  "bash",
  "edit",
  "write",
  "self",
  "interview",
  "dispatch_subagent",
  "session_closeout",
  "intercom",
  "vault_query",
  "vault_retrieve",
  "vault_vocabulary",
  "vault_dispatch_check",
  "fork_peer_spawn",
  "scout_peer_spawn",
  "candidate_peer_spawn",
  "fresh_handoff_spawn",
  "visible_loop_child_complete",
  "context_plan",
  "loop_execute",
  "explore_symbol_impact",
  "locate_confirm_definition",
  "toolbox",
];

export const DEFAULT_TTL_TURNS = 4;
export const MAX_TTL_TURNS = 12;
export const ACTIVATION_VISIBILITY_CONTRACT = [
  "Activation visibility: active set updated now; registered tools are exposed to Pi on the next provider/model request after this toolbox result.",
  "Already-issued provider requests and external API/client schema snapshots cannot be changed retroactively; if a client still cannot call a successfully activated tool, refresh that client or /reload/start a fresh Pi session after confirming it is connected to this runtime.",
].join(" ");
export const ACTIVATION_CONTINUATION_MESSAGE = [
  "Toolbox activated additional registered tools and updated Pi's active tool set.",
  "Continue the previous objective using the newly active tools if they are needed.",
  "Do not call toolbox again unless another required tool bundle is still missing.",
].join(" ");
export const CACHE_IMPACT_CONTRACT = [
  "Cache impact: native deferred or in-transcript tool changes can preserve the initial schema prefix; fallback serialization or active-only system guidance may change that prefix and cause a cache miss or write. Behavior depends on the actual provider/model and host capabilities.",
  "Later requests with the same active-tool combination may reuse cached prefixes, depending on provider support, transcript/prompt stability, cache retention, and checkpoint behavior; cache reuse is not guaranteed. Avoid repeated activate/deactivate oscillation if prompt-cache stability matters.",
].join(" ");
export const MISSING_REGISTRATION_CONTRACT = [
  "Toolbox cannot register missing owner tools or make them callable by importing owner packages.",
  "Enable/install the owning extension package and /reload or start a fresh session so Pi can register the tool schema before activation.",
].join(" ");

export type ToolboxAction =
  | "search"
  | "activate"
  | "deactivate"
  | "status"
  | "doctor"
  | "plan"
  | "explain";
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
  "intercom",
  "vault_query",
  "vault_retrieve",
  "vault_vocabulary",
  "vault_dispatch_check",
  "fork_peer_spawn",
  "scout_peer_spawn",
  "candidate_peer_spawn",
  "visible_loop_child_complete",
  "context_plan",
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
  "Cache impact: changing active tools changes the provider tool-schema prefix, so the first follow-up provider request for a new active-tool combination may miss or write a new cache entry.",
  "Caching resumes for later requests with the same active-tool combination; avoid repeated activate/deactivate oscillation if prompt-cache stability matters.",
].join(" ");
export const MISSING_REGISTRATION_CONTRACT = [
  "Toolbox cannot register missing owner tools or make them callable by importing owner packages.",
  "Enable/install the owning extension package and /reload or start a fresh session so Pi can register the tool schema before activation.",
].join(" ");

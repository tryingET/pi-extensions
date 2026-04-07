import {
  AGENT_TEAMS,
  type AgentTeam,
  DEFAULT_AGENT_TEAM,
  getAgentTeamDisplayLabel,
} from "./agent-routing.ts";

export interface RuntimeTruthDescriptor {
  packageName: string;
  extensionTitle: string;
  coordinationOwner: string;
  coordinationRole: string;
  executionOwner: string;
  executionRole: string;
  executionSeamLabel: string;
  routingLabel: string;
  routingSelectorCommand: string;
  runtimeStatusCommand: string;
}

export interface RuntimeTruthSnapshot {
  descriptor: RuntimeTruthDescriptor;
  cwd: string;
  model: string;
  routing: {
    activeTeam: AgentTeam;
    defaultTeam: AgentTeam;
    allowedAgents: string[];
  };
  societyDb: {
    path: string;
    available: boolean;
  };
  vault: {
    available: boolean;
    summary: string;
  };
}

export const RUNTIME_TRUTH_DESCRIPTOR: RuntimeTruthDescriptor = Object.freeze({
  packageName: "pi-society-orchestrator",
  extensionTitle: "Society Orchestrator",
  coordinationOwner: "pi-society-orchestrator",
  coordinationRole: "coordination/control plane",
  executionOwner: "pi-autonomous-session-control",
  executionRole: "execution/runtime plane",
  executionSeamLabel: "orchestrator→ASC",
  routingLabel: "Routing",
  routingSelectorCommand: "/agents-team",
  runtimeStatusCommand: "/runtime-status",
});

export function createRuntimeTruthSnapshot(params: {
  cwd: string;
  model?: string;
  activeTeam?: AgentTeam;
  defaultTeam?: AgentTeam;
  societyDbPath: string;
  societyDbAvailable: boolean;
  vaultAvailable: boolean;
  vaultSummary: string;
}): RuntimeTruthSnapshot {
  const activeTeam = params.activeTeam ?? DEFAULT_AGENT_TEAM;
  const defaultTeam = params.defaultTeam ?? DEFAULT_AGENT_TEAM;

  return {
    descriptor: RUNTIME_TRUTH_DESCRIPTOR,
    cwd: params.cwd,
    model: params.model || "no-model",
    routing: {
      activeTeam,
      defaultTeam,
      allowedAgents: [...AGENT_TEAMS[activeTeam]],
    },
    societyDb: {
      path: params.societyDbPath,
      available: params.societyDbAvailable,
    },
    vault: {
      available: params.vaultAvailable,
      summary: params.vaultSummary,
    },
  };
}

export function formatRuntimeRoutingStatus(snapshot: RuntimeTruthSnapshot): string {
  return `${snapshot.descriptor.routingLabel}: ${getAgentTeamDisplayLabel(snapshot.routing.activeTeam)}`;
}

export function formatRuntimeFooterLeft(snapshot: RuntimeTruthSnapshot): string {
  return `${snapshot.model} · ${snapshot.descriptor.executionSeamLabel}`;
}

export function formatRuntimeStatusReport(snapshot: RuntimeTruthSnapshot): string {
  const descriptor = snapshot.descriptor;
  const routing = formatRuntimeRoutingStatus(snapshot);
  const routingAgents = snapshot.routing.allowedAgents.join(", ");
  const dbStatus = snapshot.societyDb.available ? "available" : "missing";
  const activeRoutingDisplay = getAgentTeamDisplayLabel(snapshot.routing.activeTeam);
  const defaultRoutingDisplay = getAgentTeamDisplayLabel(snapshot.routing.defaultTeam);
  const activeRoutingInternalNote =
    activeRoutingDisplay === snapshot.routing.activeTeam
      ? ""
      : ` [internal: \`${snapshot.routing.activeTeam}\`]`;
  const defaultRoutingInternalNote =
    defaultRoutingDisplay === snapshot.routing.defaultTeam
      ? ""
      : ` [internal: \`${snapshot.routing.defaultTeam}\`]`;

  return [
    `# ${descriptor.extensionTitle} Runtime Status`,
    "",
    "## Runtime truth",
    `- coordination owner: \`${descriptor.coordinationOwner}\` (${descriptor.coordinationRole})`,
    `- execution owner: \`${descriptor.executionOwner}\` (${descriptor.executionRole})`,
    `- seam label: \`${descriptor.executionSeamLabel}\``,
    `- routing label: \`${descriptor.routingLabel}\``,
    `- routing selector: \`${descriptor.routingSelectorCommand}\``,
    `- inspector: \`${descriptor.runtimeStatusCommand}\``,
    "",
    "## Live status",
    `- cwd: \`${snapshot.cwd}\``,
    `- model: \`${snapshot.model}\``,
    `- routing: \`${activeRoutingDisplay}\`${activeRoutingInternalNote} (${routingAgents})`,
    `- default routing: \`${defaultRoutingDisplay}\`${defaultRoutingInternalNote}`,
    `- society db: ${dbStatus} — \`${snapshot.societyDb.path}\``,
    `- vault: ${snapshot.vault.summary}`,
    "",
    "## Surface contracts",
    `- footer left: \`${formatRuntimeFooterLeft(snapshot)}\``,
    "- footer optional slots: `DB✓|DB✗ · Vault✓|Vault✗` when width allows",
    `- footer right: \`${routing}\``,
    `- operator-visible status should present orchestrator as the coordination plane while ASC owns execution/runtime behavior`,
  ].join("\n");
}

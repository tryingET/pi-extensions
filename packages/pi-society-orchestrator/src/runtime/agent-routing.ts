import { AGENT_PROFILES } from "./agent-profiles.ts";

export type AgentTeam = "full" | "explore" | "implement" | "quality";

export const DEFAULT_AGENT_TEAM: AgentTeam = "full";

export interface AgentResolutionSuccess {
  ok: true;
  agent: string;
  team: AgentTeam;
  allowedAgents: string[];
}

export interface AgentResolutionFailure {
  ok: false;
  error: string;
  team: string;
  allowedAgents: string[];
}

export type AgentResolution = AgentResolutionSuccess | AgentResolutionFailure;

const ALL_AGENT_NAMES = Object.freeze(Object.keys(AGENT_PROFILES).sort());
const ALL_TEAM_NAMES = Object.freeze<AgentTeam[]>([
  DEFAULT_AGENT_TEAM,
  "explore",
  "implement",
  "quality",
]);

export const AGENT_TEAMS: Record<AgentTeam, string[]> = {
  full: [...ALL_AGENT_NAMES],
  explore: ["scout", "researcher"],
  implement: ["builder", "reviewer"],
  quality: ["reviewer", "researcher"],
};

export const AGENT_TEAM_DISPLAY_LABELS: Record<AgentTeam, string> = {
  full: "all agents",
  explore: "explore",
  implement: "implement",
  quality: "quality",
};

export function isAgentTeam(value: string): value is AgentTeam {
  return Object.hasOwn(AGENT_TEAMS, value);
}

export function resolveConfiguredDefaultAgentTeam(value: string | undefined): AgentTeam {
  return typeof value === "string" && isAgentTeam(value) ? value : DEFAULT_AGENT_TEAM;
}

export function getAgentTeamDisplayLabel(activeTeam: string): string {
  return isAgentTeam(activeTeam) ? AGENT_TEAM_DISPLAY_LABELS[activeTeam] : activeTeam;
}

export function autoSelectAgent(context: string): string {
  const ctxLower = context.toLowerCase();
  if (ctxLower.includes("implement") || ctxLower.includes("build") || ctxLower.includes("fix")) {
    return "builder";
  }
  if (ctxLower.includes("review") || ctxLower.includes("check")) {
    return "reviewer";
  }
  if (ctxLower.includes("find") || ctxLower.includes("explore") || ctxLower.includes("search")) {
    return "scout";
  }
  return "scout";
}

export function resolveAgentForTeam(agent: string, activeTeam: string): AgentResolution {
  const allowedAgents = getAllowedAgentsForTeam(activeTeam);
  if (!allowedAgents) {
    return {
      ok: false,
      error: `Unknown agent team: ${activeTeam}. Available: ${ALL_TEAM_NAMES.join(", ")}`,
      team: activeTeam,
      allowedAgents: [],
    };
  }

  if (!AGENT_PROFILES[agent]) {
    return {
      ok: false,
      error: `Unknown agent: ${agent}. Available: ${ALL_AGENT_NAMES.join(", ")}`,
      team: activeTeam,
      allowedAgents,
    };
  }

  if (!allowedAgents.includes(agent)) {
    return {
      ok: false,
      error: `Active team '${activeTeam}' does not allow agent '${agent}'. Allowed: ${allowedAgents.join(", ")}`,
      team: activeTeam,
      allowedAgents,
    };
  }

  return {
    ok: true,
    agent,
    team: activeTeam as AgentTeam,
    allowedAgents,
  };
}

export function validateLoopAgentsForTeam(params: {
  phases: string[];
  agents: Record<string, string>;
  activeTeam: string;
}): Array<{ phase: string; agent: string; error: string }> {
  const failures: Array<{ phase: string; agent: string; error: string }> = [];

  for (const phase of params.phases) {
    const requestedAgent = params.agents[phase] || "scout";
    const resolution = resolveAgentForTeam(requestedAgent, params.activeTeam);
    if (!resolution.ok) {
      failures.push({
        phase,
        agent: requestedAgent,
        error: resolution.error,
      });
    }
  }

  return failures;
}

function getAllowedAgentsForTeam(activeTeam: string): string[] | null {
  if (!isAgentTeam(activeTeam)) {
    return null;
  }

  return AGENT_TEAMS[activeTeam];
}

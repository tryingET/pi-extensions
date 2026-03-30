import { type AgentTeam, resolveConfiguredDefaultAgentTeam } from "./agent-routing.ts";

export interface TeamScopedContext {
  sessionManager?: unknown;
  sessionKey?: unknown;
  sessionId?: unknown;
}

export interface SessionTeamStore {
  getTeam(ctx: TeamScopedContext | undefined): AgentTeam;
  setTeam(ctx: TeamScopedContext | undefined, team: AgentTeam): boolean;
}

export interface SessionTeamStoreOptions {
  maxSessionKeys?: number;
}

const CONFIGURED_DEFAULT_AGENT_TEAM = resolveConfiguredDefaultAgentTeam(
  process.env.PI_ORCH_DEFAULT_AGENT_TEAM,
);
const DEFAULT_MAX_SESSION_KEYS =
  Number.parseInt(process.env.PI_ORCH_MAX_SESSION_KEYS || "", 10) || 256;

export function createSessionTeamStore(
  defaultTeam: AgentTeam = CONFIGURED_DEFAULT_AGENT_TEAM,
  options: SessionTeamStoreOptions = {},
): SessionTeamStore {
  const teamsBySessionManager = new WeakMap<object, AgentTeam>();
  const teamsBySessionKey = new Map<string, AgentTeam>();
  const maxSessionKeys = Math.max(1, options.maxSessionKeys ?? DEFAULT_MAX_SESSION_KEYS);

  return {
    getTeam(ctx) {
      const sessionKey = getSessionKey(ctx);
      if (sessionKey) {
        const team = teamsBySessionKey.get(sessionKey);
        if (team) {
          refreshSessionKey(teamsBySessionKey, sessionKey, team);
          return team;
        }

        const carrier = getSessionCarrier(ctx);
        const carrierTeam = carrier ? teamsBySessionManager.get(carrier) : undefined;
        if (carrierTeam) {
          refreshSessionKey(teamsBySessionKey, sessionKey, carrierTeam);
          evictOverflowSessionKeys(teamsBySessionKey, maxSessionKeys);
          return carrierTeam;
        }

        return defaultTeam;
      }

      const carrier = getSessionCarrier(ctx);
      if (!carrier) {
        return defaultTeam;
      }
      return teamsBySessionManager.get(carrier) || defaultTeam;
    },
    setTeam(ctx, team) {
      const sessionKey = getSessionKey(ctx);
      const carrier = getSessionCarrier(ctx);

      if (sessionKey) {
        refreshSessionKey(teamsBySessionKey, sessionKey, team);
        evictOverflowSessionKeys(teamsBySessionKey, maxSessionKeys);
      }
      if (carrier) {
        teamsBySessionManager.set(carrier, team);
      }

      return Boolean(sessionKey || carrier);
    },
  };
}

function getSessionCarrier(ctx: TeamScopedContext | undefined): object | null {
  if (!ctx || typeof ctx.sessionManager !== "object" || ctx.sessionManager === null) {
    return null;
  }

  return ctx.sessionManager;
}

function getSessionKey(ctx: TeamScopedContext | undefined): string | null {
  const candidates = [
    ctx?.sessionKey,
    ctx?.sessionId,
    getSessionManagerField(ctx, "sessionKey"),
    getSessionManagerField(ctx, "sessionId"),
    getSessionManagerField(ctx, "id"),
  ];

  for (const candidate of candidates) {
    if (typeof candidate === "string") {
      const normalized = candidate.trim();
      if (normalized.length > 0) {
        return normalized;
      }
    }
  }

  return null;
}

function getSessionManagerField(
  ctx: TeamScopedContext | undefined,
  field: "sessionKey" | "sessionId" | "id",
): unknown {
  if (!ctx || typeof ctx.sessionManager !== "object" || ctx.sessionManager === null) {
    return undefined;
  }

  const value = (ctx.sessionManager as Record<string, unknown>)[field];
  return typeof value === "string" ? value : undefined;
}

function refreshSessionKey(
  teamsBySessionKey: Map<string, AgentTeam>,
  sessionKey: string,
  team: AgentTeam,
): void {
  teamsBySessionKey.delete(sessionKey);
  teamsBySessionKey.set(sessionKey, team);
}

function evictOverflowSessionKeys(
  teamsBySessionKey: Map<string, AgentTeam>,
  maxSessionKeys: number,
): void {
  while (teamsBySessionKey.size > maxSessionKeys) {
    const oldestKey = teamsBySessionKey.keys().next().value;
    if (!oldestKey) {
      return;
    }
    teamsBySessionKey.delete(oldestKey);
  }
}

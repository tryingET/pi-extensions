import type { PeerPresence } from "./contracts.ts";

export const DEFAULT_RUNTIME_ALIAS_PREFIX = "peer-session";

export interface PeerRegistration {
  id?: string;
  name?: string;
  cwd: string;
  model: string;
  pid: number;
  startedAt: number;
  lastActivity?: number;
  status?: string;
}

export interface PeerPresenceUpdate {
  name?: string;
  status?: string;
  model?: string;
  lastActivity?: number;
}

function normalizeOptionalString(value: string | undefined): string | undefined {
  const trimmed = value?.trim();
  return trimmed ? trimmed : undefined;
}

export function createRuntimeFallbackAddressLabel(
  sessionId: string,
  prefix: string = DEFAULT_RUNTIME_ALIAS_PREFIX,
): string {
  const normalizedSessionId = sessionId.startsWith("session-")
    ? sessionId.slice("session-".length)
    : sessionId;

  return `${prefix}-${normalizedSessionId.slice(0, 8)}`;
}

export function resolvePeerAddressLabel(sessionId: string, name: string | undefined): string {
  const normalizedName = normalizeOptionalString(name);
  return normalizedName ?? createRuntimeFallbackAddressLabel(sessionId);
}

export function buildPeerPresence(
  sessionId: string,
  registration: PeerRegistration,
  now: number = Date.now(),
): PeerPresence {
  const normalizedName = normalizeOptionalString(registration.name);

  return {
    id: sessionId,
    name: normalizedName,
    addressLabel: resolvePeerAddressLabel(sessionId, normalizedName),
    cwd: registration.cwd,
    model: registration.model,
    pid: registration.pid,
    startedAt: registration.startedAt,
    lastActivity: registration.lastActivity ?? now,
    status: normalizeOptionalString(registration.status),
  };
}

export function applyPresenceUpdate(
  presence: PeerPresence,
  updates: PeerPresenceUpdate,
  now: number = Date.now(),
): PeerPresence {
  const nextName =
    updates.name === undefined ? presence.name : normalizeOptionalString(updates.name);

  return {
    ...presence,
    name: nextName,
    addressLabel: resolvePeerAddressLabel(presence.id, nextName),
    model: updates.model ?? presence.model,
    status:
      updates.status === undefined ? presence.status : normalizeOptionalString(updates.status),
    lastActivity: updates.lastActivity ?? now,
  };
}

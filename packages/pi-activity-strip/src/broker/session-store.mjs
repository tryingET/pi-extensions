import { ACTIVITY_STRIP_STALE_AFTER_MS } from "../common/constants.mjs";
import { normalizeSessionSnapshot, sortSessions } from "../common/protocol.mjs";

export class SessionStore {
  constructor(options = {}) {
    this.staleAfterMs = options.staleAfterMs ?? ACTIVITY_STRIP_STALE_AFTER_MS;
    this.sessions = new Map();
  }

  upsert(session) {
    const normalized = normalizeSessionSnapshot(session);
    if (!normalized.sessionId) return false;
    this.sessions.set(normalized.sessionId, normalized);
    return true;
  }

  remove(sessionId) {
    return this.sessions.delete(String(sessionId ?? ""));
  }

  purge(now = Date.now()) {
    let changed = false;
    for (const [sessionId, session] of this.sessions.entries()) {
      if (now - session.updatedAt > this.staleAfterMs) {
        this.sessions.delete(sessionId);
        changed = true;
      }
    }
    return changed;
  }

  snapshot(now = Date.now()) {
    this.purge(now);
    return {
      generatedAt: now,
      sessions: sortSessions([...this.sessions.values()]),
    };
  }
}

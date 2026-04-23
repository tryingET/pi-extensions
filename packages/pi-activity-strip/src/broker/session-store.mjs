import { ACTIVITY_STRIP_STALE_AFTER_MS } from "../common/constants.mjs";
import { normalizeSessionSnapshot, sortSessions } from "../common/protocol.mjs";

/** @typedef {import("../common/contracts.ts").SessionSnapshot} SessionSnapshot */
/** @typedef {import("../common/contracts.ts").SessionStoreOptions} SessionStoreOptions */
/** @typedef {import("../common/contracts.ts").BrokerSnapshot} BrokerSnapshot */

export class SessionStore {
  /** @param {SessionStoreOptions} [options] */
  constructor(options = {}) {
    this.staleAfterMs = options.staleAfterMs ?? ACTIVITY_STRIP_STALE_AFTER_MS;
    /** @type {Map<string, SessionSnapshot>} */
    this.sessions = new Map();
  }

  /** @param {Partial<SessionSnapshot> | Record<string, unknown>} session */
  upsert(session) {
    const normalized = normalizeSessionSnapshot(session);
    if (!normalized.sessionId) return false;
    this.sessions.set(normalized.sessionId, normalized);
    return true;
  }

  /** @param {string} sessionId */
  remove(sessionId) {
    return this.sessions.delete(String(sessionId ?? ""));
  }

  /** @param {number} [now] */
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

  /** @param {number} [now] @returns {BrokerSnapshot} */
  snapshot(now = Date.now()) {
    this.purge(now);
    return {
      generatedAt: now,
      sessions: sortSessions([...this.sessions.values()]),
    };
  }
}

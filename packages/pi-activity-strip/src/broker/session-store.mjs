// ---
// summary: "stores normalized session snapshots, expires stale entries, and returns display-ready ordering"
// read_when:
//   - "changing session retention, upsert semantics, or broker snapshot ordering"
// ---

import { ACTIVITY_STRIP_STALE_AFTER_MS } from "../common/constants.mjs";
import { normalizeSessionSnapshot, sortSessions } from "../common/protocol.mjs";

/** @typedef {import("../common/contracts.ts").SessionSnapshot} SessionSnapshot */
/** @typedef {import("../common/contracts.ts").SessionStoreOptions} SessionStoreOptions */
/** @typedef {import("../common/contracts.ts").BrokerSnapshot} BrokerSnapshot */

/**
 * Stable store key. Sessions resumed into a second process keep publishing under
 * their own publisherId so two live processes never fight over one card; legacy
 * publishers without a publisherId keep the bare sessionId key.
 * @param {SessionSnapshot} session
 */
function sessionKey(session) {
  return session.publisherId ? `${session.sessionId}|${session.publisherId}` : session.sessionId;
}

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
    this.sessions.set(sessionKey(normalized), normalized);
    return true;
  }

  /** @param {string} sessionId @param {string} [publisherId] */
  remove(sessionId, publisherId) {
    const id = String(sessionId ?? "");
    if (!id) return false;
    return publisherId
      ? this.sessions.delete(`${id}|${String(publisherId)}`)
      : this.sessions.delete(id);
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

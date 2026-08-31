// ---
// summary: "stores normalized session snapshots, expires stale entries, and returns display-ready ordering"
// read_when:
//   - "changing session retention, upsert semantics, or broker snapshot ordering"
// ---

import {
  ACTIVITY_STRIP_MAX_SESSIONS,
  ACTIVITY_STRIP_STALE_AFTER_MS,
} from "../common/constants.mjs";
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
    this.maxSessions = options.maxSessions ?? ACTIVITY_STRIP_MAX_SESSIONS;
    /** @type {Map<string, {session: SessionSnapshot; receivedAt: number}>} */
    this.sessions = new Map();
    /** @type {Map<string, number>} */
    this.tombstones = new Map();
  }

  /** @param {Partial<SessionSnapshot> | Record<string, unknown>} session @param {number} [receivedAt] */
  upsert(session, receivedAt = Date.now()) {
    if (!session || typeof session !== "object") return false;
    this.purge(receivedAt);
    const normalized = normalizeSessionSnapshot(session);
    if (!normalized.sessionId) return false;
    const key = sessionKey(normalized);
    if (this.tombstones.has(key)) return false;
    const current = this.sessions.get(key);
    if (
      current &&
      current.session.publisherSequence > 0 &&
      (normalized.publisherSequence === 0 ||
        normalized.publisherSequence <= current.session.publisherSequence)
    ) {
      return false;
    }
    if (!current && this.sessions.size >= this.maxSessions) return false;
    this.sessions.set(key, { session: normalized, receivedAt });
    return true;
  }

  /** @param {string} sessionId @param {string} [publisherId] @param {number} [removedAt] */
  remove(sessionId, publisherId, removedAt = Date.now()) {
    const id = String(sessionId ?? "");
    if (!id) return false;
    if (!publisherId) return this.sessions.delete(id);
    const key = `${id}|${String(publisherId)}`;
    this.purge(removedAt);
    if (!this.sessions.has(key)) return false;
    if (!this.tombstones.has(key) && this.tombstones.size >= this.maxSessions) return false;
    this.sessions.delete(key);
    this.tombstones.set(key, removedAt);
    return true;
  }

  /** @param {number} [now] */
  purge(now = Date.now()) {
    let changed = false;
    for (const [sessionId, entry] of this.sessions.entries()) {
      if (now - entry.receivedAt > this.staleAfterMs) {
        this.sessions.delete(sessionId);
        changed = true;
      }
    }
    for (const [sessionId, removedAt] of this.tombstones.entries()) {
      if (now - removedAt > this.staleAfterMs) this.tombstones.delete(sessionId);
    }
    return changed;
  }

  /** @param {number} [now] @returns {BrokerSnapshot} */
  snapshot(now = Date.now()) {
    this.purge(now);
    return {
      generatedAt: now,
      sessions: sortSessions([...this.sessions.values()].map((entry) => entry.session)),
    };
  }
}

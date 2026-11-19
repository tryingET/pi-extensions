// ---
// summary: "parses read-only AK task output and joins live session-bound claims onto terminal cards"
// read_when:
//   - "changing AK claim parsing, lease/vacant-custody rules, or task chip join semantics"
// ---

/**
 * AK is a read-only projection for the strip: these helpers only parse CLI output and derive
 * display facts. They never write, never touch the society database directly, and fail closed
 * (malformed input yields no chips rather than invented state).
 */

/** Chip states rendered by the native panel. */
export const AK_TASK_CHIP_ACTIVE = "active";
export const AK_TASK_CHIP_DEFERRED = "deferred";
export const AK_TASK_CHIP_ORPHANED = "orphaned";

/** AK5700 claim semantics: only `session-<uuid>` claims can belong to a live Pi terminal. */
const SESSION_CLAIM_PATTERN =
  /^session-([0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12})$/i;
/** Bound the title carried into the panel protocol. */
const MAX_TITLE_LENGTH = 96;
/** A card shows at most two live-claim buttons and two state badges; the rest fold into overflow. */
const MAX_ACTIVE_CHIPS = 2;
const MAX_BADGE_CHIPS = 2;
/** Directory search carries more joined tasks per window so overflow items stay searchable. */
export const DIRECTORY_MAX_ACTIVE_TASKS = 16;
export const DIRECTORY_MAX_BADGE_TASKS = 16;

/**
 * @param {unknown} value
 * @returns {value is string}
 */
function isString(value) {
  return typeof value === "string";
}

/**
 * AK timestamps are RFC 3339 with offset. Unparseable or non-positive values are rejected so an
 * unprovable lease can never be presented as live custody.
 * @param {unknown} value
 * @returns {number | null}
 */
export function parseAkTimestampMs(value) {
  if (!isString(value) || !value.trim()) return null;
  const parsed = Date.parse(value.trim());
  return Number.isFinite(parsed) && parsed > 0 ? parsed : null;
}

/**
 * @param {unknown} value
 * @returns {number | null} positive safe integer task id, or null
 */
function parseTaskId(value) {
  const id = Number(value);
  return Number.isSafeInteger(id) && id > 0 ? id : null;
}

/**
 * @param {unknown} value
 * @returns {string} bounded title
 */
function boundTitle(value) {
  return isString(value) ? value.trim().slice(0, MAX_TITLE_LENGTH) : "";
}

/**
 * Normalize a repo path for prefix matching. Only absolute paths can join; anything else would
 * invent a relationship between a card and a task.
 * @param {unknown} value
 * @returns {string | null}
 */
function normalizeRepoPath(value) {
  if (!isString(value)) return null;
  const trimmed = value.trim().replace(/\/+$/, "");
  return trimmed.startsWith("/") ? trimmed : null;
}

/**
 * True when a session working directory sits inside the task's registered repo.
 * @param {unknown} cardCwd
 * @param {string} taskRepo
 */
export function cwdIsInsideRepo(cardCwd, taskRepo) {
  if (!isString(cardCwd)) return false;
  return normalizedCwdIsInsideRepo(cardCwd.trim().replace(/\/+$/, ""), taskRepo);
}

/**
 * @param {string} cwd already trimmed and stripped of trailing slashes
 * @param {string} taskRepo
 */
function normalizedCwdIsInsideRepo(cwd, taskRepo) {
  return cwd.length > 0 && (cwd === taskRepo || cwd.startsWith(`${taskRepo}/`));
}

/**
 * Parse `ak task list --format json --verbose` output into raw claim rows. Rows without a
 * session-bound claim or a parseable lease are skipped; anything malformed at the envelope level
 * fails the whole parse so callers can drop chips entirely.
 * @param {string} raw
 * @returns {{ok: true; claims: import("./contracts.ts").AkTaskClaim[]} | {ok: false; error: string}}
 */
export function parseAkClaimList(raw) {
  let parsed;
  try {
    parsed = JSON.parse(String(raw ?? ""));
  } catch (error) {
    return {
      ok: false,
      error: `AK task list is not JSON: ${error instanceof Error ? error.message : String(error)}`,
    };
  }
  if (!Array.isArray(parsed)) {
    return { ok: false, error: "AK task list did not return a JSON array." };
  }
  /** @type {import("./contracts.ts").AkTaskClaim[]} */
  const claims = [];
  for (const entry of parsed) {
    if (!entry || typeof entry !== "object") continue;
    const record = /** @type {Record<string, unknown>} */ (entry);
    const id = parseTaskId(record.id);
    const claimedBy = isString(record.claimed_by) ? record.claimed_by.trim() : "";
    const match = SESSION_CLAIM_PATTERN.exec(claimedBy);
    const leaseExpiresAt = parseAkTimestampMs(record.lease_expires_at);
    const claimedAt = parseAkTimestampMs(record.claimed_at);
    const repo = normalizeRepoPath(record.repo);
    const title = boundTitle(record.title);
    if (id === null || !match || leaseExpiresAt === null || !repo || !title) continue;
    if (record.status !== "claimed") continue;
    claims.push({
      id,
      title,
      repo,
      sessionId: match[1].toLowerCase(),
      leaseExpiresAt,
      claimedAt: claimedAt ?? 0,
    });
  }
  return { ok: true, claims };
}

/**
 * Parse `ak task deferred --format json` output. Only rows whose deferral is still active join.
 * @param {string} raw
 * @returns {{ok: true; deferred: import("./contracts.ts").AkTaskDeferred[]} | {ok: false; error: string}}
 */
export function parseAkDeferredList(raw) {
  let parsed;
  try {
    parsed = JSON.parse(String(raw ?? ""));
  } catch (error) {
    return {
      ok: false,
      error: `AK deferred list is not JSON: ${error instanceof Error ? error.message : String(error)}`,
    };
  }
  if (!Array.isArray(parsed)) {
    return { ok: false, error: "AK deferred list did not return a JSON array." };
  }
  /** @type {import("./contracts.ts").AkTaskDeferred[]} */
  const deferred = [];
  for (const entry of parsed) {
    if (!entry || typeof entry !== "object") continue;
    const record = /** @type {Record<string, unknown>} */ (entry);
    const task = record.task;
    const deferral = record.deferral;
    if (!task || typeof task !== "object" || !deferral || typeof deferral !== "object") continue;
    const taskRecord = /** @type {Record<string, unknown>} */ (task);
    const deferralRecord = /** @type {Record<string, unknown>} */ (deferral);
    const id = parseTaskId(taskRecord.id);
    const repo = normalizeRepoPath(taskRecord.repo);
    const title = boundTitle(taskRecord.title);
    if (id === null || !repo || !title) continue;
    if (deferralRecord.state !== "active") continue;
    deferred.push({ id, title, repo });
  }
  return { ok: true, deferred };
}

/**
 * AK5700: an expired lease is vacant custody, so the claim no longer names an active owner.
 * @param {{leaseExpiresAt: number}} claim
 * @param {number} nowMs
 */
export function claimIsLive(claim, nowMs) {
  return claim.leaseExpiresAt > nowMs;
}

/**
 * Cards whose session holds a live claim get clickable task references. A claim is ambiguous when
 * the claiming session id backs more than one card (one logical session resumed into two
 * terminals); ambiguous claims bind nothing. A task that also carries an active deferral never
 * becomes a button: the deferred badge state wins.
 * @param {Array<Record<string, unknown>>} cards
 * @param {import("./contracts.ts").AkTaskClaim[]} claims
 * @param {Set<number>} deferredIds
 * @param {number} nowMs
 * @returns {Map<string, import("./contracts.ts").AkTaskClaim[]>} active claims per cardId
 */
function activeClaimsByCardId(cards, claims, deferredIds, nowMs) {
  /** @type {Map<string, Set<string>>} */
  const sessionIdToCardIds = new Map();
  for (const card of cards) {
    const cardId = String(card.cardId ?? "");
    for (const sessionId of cardSessionIds(card)) {
      const cardIds = sessionIdToCardIds.get(sessionId) ?? new Set();
      cardIds.add(cardId);
      sessionIdToCardIds.set(sessionId, cardIds);
    }
  }
  /** @type {Map<string, import("./contracts.ts").AkTaskClaim[]>} */
  const byCardId = new Map();
  for (const claim of claims) {
    if (!claimIsLive(claim, nowMs) || deferredIds.has(claim.id)) continue;
    const cardIds = sessionIdToCardIds.get(claim.sessionId);
    if (cardIds?.size !== 1) continue;
    const [cardId] = cardIds;
    const list = byCardId.get(cardId);
    if (list) list.push(claim);
    else byCardId.set(cardId, [claim]);
  }
  for (const list of byCardId.values()) {
    if (list.length > 1) list.sort(compareClaimsNewestFirst);
  }
  return byCardId;
}

/**
 * @param {Record<string, unknown>} card
 * @returns {string[]}
 */
function cardSessionIds(card) {
  const ids = Array.isArray(card.publisherSessionIds) ? card.publisherSessionIds : [];
  return [...new Set(ids.map((value) => String(value ?? "").trim()).filter(Boolean))];
}

/** @param {import("./contracts.ts").AkTaskClaim} left @param {import("./contracts.ts").AkTaskClaim} right */
function compareClaimsNewestFirst(left, right) {
  if (left.claimedAt !== right.claimedAt) return right.claimedAt - left.claimedAt;
  if (left.leaseExpiresAt !== right.leaseExpiresAt)
    return right.leaseExpiresAt - left.leaseExpiresAt;
  return left.id - right.id;
}

/** @param {import("./contracts.ts").AkTaskClaim} left @param {import("./contracts.ts").AkTaskClaim} right */
function compareOrphansSoonestVacantFirst(left, right) {
  if (left.leaseExpiresAt !== right.leaseExpiresAt)
    return left.leaseExpiresAt - right.leaseExpiresAt;
  return left.id - right.id;
}

/**
 * Join AK task references onto projected cards.
 *
 * - `active` chips: the card's own session holds a live claim (exact session-id join, unique).
 * - `orphaned` badges: a live-lease claim by a session with no live card, joined by repo. Custody
 *   has not lapsed yet, but the owner is gone, so the fact is a badge rather than a button.
 * - `deferred` badges: tasks with an active deferral, joined by repo.
 *
 * @param {{
 *   cards: Array<Record<string, unknown>>;
 *   claims?: import("./contracts.ts").AkTaskClaim[];
 *   deferred?: import("./contracts.ts").AkTaskDeferred[];
 *   liveSessionIds?: Set<string> | string[];
 *   nowMs: number;
 *   maxActiveChips?: number;
 *   maxBadgeChips?: number;
 * }} options
 * @returns {{cards: Array<Record<string, unknown>>; orphanedClaimCount: number; renderedCounts: {active: number; orphaned: number; deferred: number}}}
 */
export function joinAkTaskChips({
  cards,
  claims = [],
  deferred = [],
  liveSessionIds = new Set(),
  nowMs,
  maxActiveChips = MAX_ACTIVE_CHIPS,
  maxBadgeChips = MAX_BADGE_CHIPS,
}) {
  const liveIds =
    liveSessionIds instanceof Set ? liveSessionIds : new Set([...liveSessionIds].map(String));
  const deferredIds = new Set(deferred.map((task) => task.id));
  const byCardId = activeClaimsByCardId(cards, claims, deferredIds, nowMs);

  const liveClaims = claims.filter((claim) => claimIsLive(claim, nowMs));
  const orphanedClaims = liveClaims
    .filter((claim) => !liveIds.has(claim.sessionId))
    .sort(compareOrphansSoonestVacantFirst);
  const orphanedIds = new Set(orphanedClaims.map((claim) => claim.id));
  const sortedDeferred = deferred
    .filter((task) => !orphanedIds.has(task.id))
    .sort((left, right) => left.id - right.id);
  /** Memoize repo-matched lists per unique normalized cwd (many tabs share one repo). @type {Map<string, {orphaned: import("./contracts.ts").AkTaskClaim[]; deferred: import("./contracts.ts").AkTaskDeferred[]}>} */
  const repoMatchesByCwd = new Map();

  /** @type {number} */
  let renderedActive = 0;
  /** @type {number} */
  let renderedOrphaned = 0;
  /** @type {number} */
  let renderedDeferred = 0;

  const joined = cards.map((card) => {
    const cardActive = byCardId.get(String(card.cardId ?? "")) ?? [];
    const active = cardActive.slice(0, maxActiveChips);
    const activeOverflow = Math.max(0, cardActive.length - active.length);
    const activeIds = cardActive.length > 0 ? new Set(cardActive.map((claim) => claim.id)) : null;
    const normalizedCwd = isString(card.cwd) ? card.cwd.trim().replace(/\/+$/, "") : "";

    let repoMatches = repoMatchesByCwd.get(normalizedCwd);
    if (!repoMatches) {
      repoMatches = normalizedCwd
        ? {
            orphaned: orphanedClaims.filter((claim) =>
              normalizedCwdIsInsideRepo(normalizedCwd, claim.repo),
            ),
            deferred: sortedDeferred.filter((task) =>
              normalizedCwdIsInsideRepo(normalizedCwd, task.repo),
            ),
          }
        : { orphaned: [], deferred: [] };
      repoMatchesByCwd.set(normalizedCwd, repoMatches);
    }
    const { orphaned } = repoMatches;
    const deferredForCard = activeIds
      ? repoMatches.deferred.filter((task) => !activeIds.has(task.id))
      : repoMatches.deferred;
    const badges = [...orphaned, ...deferredForCard].slice(0, maxBadgeChips);
    const badgeOverflow = Math.max(0, orphaned.length + deferredForCard.length - badges.length);

    const chips = [
      ...active.map((claim) => ({ id: claim.id, title: claim.title, state: AK_TASK_CHIP_ACTIVE })),
      ...badges.map((task) => ({
        id: task.id,
        title: task.title,
        state: orphanedIds.has(task.id) ? AK_TASK_CHIP_ORPHANED : AK_TASK_CHIP_DEFERRED,
      })),
    ];
    renderedActive += active.length;
    renderedOrphaned += badges.filter((task) => orphanedIds.has(task.id)).length;
    renderedDeferred += badges.filter((task) => !orphanedIds.has(task.id)).length;

    const next = { ...card };
    if (chips.length > 0) next.akTasks = chips;
    if (activeOverflow + badgeOverflow > 0) next.akTaskOverflow = activeOverflow + badgeOverflow;
    return next;
  });

  return {
    cards: joined,
    orphanedClaimCount: orphanedClaims.length,
    renderedCounts: {
      active: renderedActive,
      orphaned: renderedOrphaned,
      deferred: renderedDeferred,
    },
  };
}

/**
 * Convenience summary for the status surface.
 * @param {{
 *   claims?: import("./contracts.ts").AkTaskClaim[];
 *   deferred?: import("./contracts.ts").AkTaskDeferred[];
 *   liveSessionIds?: Set<string> | string[];
 *   nowMs: number;
 * }} options
 */
export function summarizeAkTasks({
  claims = [],
  deferred = [],
  liveSessionIds = new Set(),
  nowMs,
}) {
  const liveIds =
    liveSessionIds instanceof Set ? liveSessionIds : new Set([...liveSessionIds].map(String));
  const liveClaims = claims.filter((claim) => claimIsLive(claim, nowMs));
  return {
    liveClaimCount: liveClaims.length,
    orphanedClaimCount: liveClaims.filter((claim) => !liveIds.has(claim.sessionId)).length,
    deferredCount: deferred.length,
  };
}

/**
 * Enrich cross-workspace directory entries with their cards' joined AK tasks under the exact
 * AK5700 join semantics, using generous search bounds so overflow references remain searchable.
 * Returns `entries` unchanged when AK data has not been read yet (`akTasks === null`).
 * @param {{
 *   entries: import("./workspace-view.mjs").WindowDirectoryEntry[];
 *   cards: Map<string, Record<string, unknown>>;
 *   akTasks: {claims?: import("./contracts.ts").AkTaskClaim[]; deferred?: import("./contracts.ts").AkTaskDeferred[]} | null;
 *   rawSessions?: Array<Record<string, unknown>>;
 *   liveSessionIds?: Set<string> | string[];
 *   nowMs?: number;
 * }} options
 * @returns {import("./workspace-view.mjs").WindowDirectoryEntry[]}
 */
export function enrichDirectoryAkTasks({
  entries,
  cards,
  akTasks,
  rawSessions = [],
  liveSessionIds,
  nowMs = Date.now(),
}) {
  if (!akTasks || entries.length === 0) return entries;
  const liveIds =
    liveSessionIds ??
    new Set(rawSessions.map((session) => String(session.sessionId ?? "")).filter(Boolean));
  const joinedCards = joinAkTaskChips({
    cards: [...cards.values()],
    claims: akTasks.claims ?? [],
    deferred: akTasks.deferred ?? [],
    liveSessionIds: liveIds,
    nowMs,
    maxActiveChips: DIRECTORY_MAX_ACTIVE_TASKS,
    maxBadgeChips: DIRECTORY_MAX_BADGE_TASKS,
  }).cards;
  /** @type {Map<string, import("./contracts.ts").AkTaskChip[]>} */
  const tasksByCardId = new Map();
  for (const card of joinedCards) {
    if (Array.isArray(card.akTasks) && card.akTasks.length > 0) {
      tasksByCardId.set(
        String(card.cardId ?? ""),
        /** @type {import("./contracts.ts").AkTaskChip[]} */ (card.akTasks),
      );
    }
  }
  return entries.map((entry) => {
    const akTasksForEntry = tasksByCardId.get(entry.cardId);
    return akTasksForEntry && akTasksForEntry.length > 0
      ? { ...entry, akTasks: akTasksForEntry }
      : entry;
  });
}

/**
 * Memoizes `enrichDirectoryAkTasks` across high-frequency broker telemetry ticks when neither the
 * directory, the AK poll snapshot, nor the set of live session ids changed — while still evicting
 * on time as soon as any live claim lease expires (`nowMs >= nextLeaseExpiryMs`).
 */
export function createDirectoryAkEnricher() {
  /** @type {{entries: unknown; cards: unknown; akTasks: unknown; liveKey: string; nextExpiryMs: number; result: import("./workspace-view.mjs").WindowDirectoryEntry[]} | null} */
  let cache = null;
  /** @param {Parameters<typeof enrichDirectoryAkTasks>[0]} options */
  return function enrich(options) {
    const {
      entries,
      cards,
      akTasks,
      rawSessions = [],
      liveSessionIds,
      nowMs = Date.now(),
    } = options;
    if (!akTasks || entries.length === 0) {
      cache = null;
      return entries;
    }
    const liveIds =
      liveSessionIds instanceof Set
        ? liveSessionIds
        : liveSessionIds
          ? new Set([...liveSessionIds].map(String))
          : new Set(rawSessions.map((session) => String(session.sessionId ?? "")).filter(Boolean));
    const liveKey = [...liveIds].sort().join("\u001f");
    if (
      cache &&
      cache.entries === entries &&
      cache.cards === cards &&
      cache.akTasks === akTasks &&
      cache.liveKey === liveKey &&
      nowMs < cache.nextExpiryMs
    ) {
      return cache.result;
    }
    let nextExpiryMs = Number.POSITIVE_INFINITY;
    for (const claim of akTasks.claims ?? []) {
      if (claim.leaseExpiresAt > nowMs && claim.leaseExpiresAt < nextExpiryMs) {
        nextExpiryMs = claim.leaseExpiresAt;
      }
    }
    const result = enrichDirectoryAkTasks({
      entries,
      cards,
      akTasks,
      liveSessionIds: liveIds,
      nowMs,
    });
    cache = { entries, cards, akTasks, liveKey, nextExpiryMs, result };
    return result;
  };
}

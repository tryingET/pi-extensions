// ---
// summary: "Builds the multi-session corpus index over strata.json artifacts: discovery, classification, and per-session derived facts."
// read_when:
//   - "Changing the corpus index schema, strata.json classification, or any derived-fact sourcing."
// ---

import { existsSync, readdirSync, readFileSync } from "node:fs";
import { basename, dirname, join, relative, sep } from "node:path";

export const STRATA_FILE = "strata.json";
export const SESSION_HTML_FILE = "context-strata.html";

// IR contract (owner: pi-context-overlay, RFC §9): consumers fail closed on a newer schema
// major — the session is listed as "unsupported" (identity + error, no facts), never
// dropped; unknown additive fields are ignored; an absent schemaVersion means a
// pre-versioning (legacy) artifact, which stays readable.
export const IR_MAJOR_SUPPORTED = 1;

/**
 * Discover strata.json artifacts under corpusDir (recursive).
 * `node_modules` and the generated `corpus` output dir are skipped.
 */
export function findStrataFiles(corpusDir) {
  const found = [];
  const walk = (dir) => {
    for (const ent of readdirSync(dir, { withFileTypes: true })) {
      if (ent.name === "node_modules" || ent.name === "corpus") continue;
      const p = join(dir, ent.name);
      if (ent.isDirectory()) walk(p);
      else if (ent.isFile() && ent.name === STRATA_FILE) found.push(p);
    }
  };
  walk(corpusDir);
  return found.sort();
}

/**
 * Read and classify one strata.json artifact.
 * - "failed": unreadable, invalid JSON, not a strata document, or malformed schemaVersion
 * - "unsupported": valid strata document whose schemaVersion major exceeds IR_MAJOR_SUPPORTED
 * - "empty": valid strata ledger with zero measured requests
 * - "ok": valid strata ledger with at least one measured request
 */
export function readStrata(filePath) {
  let text;
  try {
    text = readFileSync(filePath, "utf8");
  } catch (err) {
    return { status: "failed", error: `unreadable: ${err.message}` };
  }
  let parsed;
  try {
    parsed = JSON.parse(text);
  } catch (err) {
    return { status: "failed", error: `invalid JSON: ${err.message}` };
  }
  if (typeof parsed !== "object" || parsed === null || Array.isArray(parsed)) {
    return { status: "failed", error: "not a strata object" };
  }
  const meta = parsed.meta;
  if (typeof meta !== "object" || meta === null || !Array.isArray(parsed.requests)) {
    return { status: "failed", error: "missing meta object or requests array" };
  }
  const schemaVersion = meta.schemaVersion;
  if (schemaVersion !== undefined) {
    if (typeof schemaVersion !== "number" || !Number.isFinite(schemaVersion)) {
      return {
        status: "failed",
        error: `invalid schemaVersion: ${JSON.stringify(schemaVersion)}`,
      };
    }
    if (schemaVersion > IR_MAJOR_SUPPORTED) {
      return {
        status: "unsupported",
        error: `schemaVersion ${schemaVersion} > supported ${IR_MAJOR_SUPPORTED}; upgrade the corpus package, do not re-replay`,
      };
    }
  }
  const requestCount = Number(meta.requests ?? parsed.requests.length);
  if (!Number.isFinite(requestCount) || requestCount <= 0) {
    return { status: "empty", strata: parsed };
  }
  return { status: "ok", strata: parsed };
}

const stem = (name) => name.replace(/\.[^.]*$/, "");
// Only real numbers pass through; null ("no measurable burn") must never be coerced to 0.
const num = (value, fallback = null) =>
  typeof value === "number" && Number.isFinite(value) ? value : fallback;

/** Session id: overlay-recorded session file stem when present, else directory/file identity. */
function sessionId({ strata, strataDir, strataFile, corpusDir }) {
  const file = strata?.meta?.file;
  if (typeof file === "string" && file.endsWith(".jsonl")) return stem(file);
  if (strataDir !== corpusDir) return basename(strataDir);
  return stem(basename(strataFile));
}

/**
 * Top ≤5 categories by share of token-turns (sum of items[].tt over all items).
 * Shares are derived from the allocator ledger; they inherit the estimated epistemic class.
 */
export function topCategories(strata) {
  const items = Array.isArray(strata?.items) ? strata.items : [];
  const byCat = new Map();
  let total = 0;
  for (const item of items) {
    const tokenTurns = Number(item?.tt ?? 0);
    if (!Number.isFinite(tokenTurns) || tokenTurns <= 0) continue;
    const cat = item.c;
    byCat.set(cat, (byCat.get(cat) ?? 0) + tokenTurns);
    total += tokenTurns;
  }
  if (total <= 0) return [];
  return [...byCat.entries()]
    .map(([id, tokenTurns]) => ({ id, share: tokenTurns / total }))
    .sort((a, b) => b.share - a.share || (a.id < b.id ? -1 : 1))
    .slice(0, 5);
}

/** Build one index entry from a strata.json artifact path. Failed reads are listed, never dropped. */
export function buildEntry(strataFile, corpusDir, htmlDir, { sourceSession = null } = {}) {
  const strataDir = dirname(strataFile);
  const source = relative(corpusDir, strataFile).split(sep).join("/");
  const htmlPath = join(strataDir, SESSION_HTML_FILE);
  const html = existsSync(htmlPath) ? relative(htmlDir, htmlPath).split(sep).join("/") : null;

  const { status, strata, error } = readStrata(strataFile);
  const id = sessionId({ strata, strataDir, strataFile, corpusDir });
  if (status === "failed" || status === "unsupported") {
    // Listed, never dropped; no facts. Distinct states: failed = read/producer problem
    // (remedy: fix/re-replay); unsupported = consumer lacks semantics (remedy: upgrade).
    return { id, source, sourceSession, replayStatus: status, html, error };
  }

  const meta = strata.meta;
  const faults = Array.isArray(meta.faults) ? meta.faults : [];
  const models = [];
  for (const change of Array.isArray(meta.modelChanges) ? meta.modelChanges : []) {
    const model = change?.model;
    if (typeof model === "string" && !models.includes(model)) models.push(model);
  }

  return {
    id,
    source,
    sourceSession,
    // measured provenance from strata meta (overlay reads it from the session header);
    // absent when the artifact predates the field — never inferred from directory names
    cwd: typeof strata.meta.cwd === "string" && strata.meta.cwd ? strata.meta.cwd : null,
    replayStatus: status,
    html,
    models,
    requests: num(meta.requests, 0),
    turns: num(meta.turns),
    faults: faults.length,
    lastFaultR: faults.length > 0 ? num(faults[faults.length - 1].r) : null,
    onChainCostUsd: num(meta.costTotal, 0),
    cacheHitShare: num(meta.cacheHit, 0),
    warmthAgreementMae: num(meta.warmthAgreement?.mae),
    forks: num(meta.forks?.count, 0),
    lastResidentEst: num(meta.runway?.residentLast),
    contextWindow: num(meta.runway?.contextWindow),
    runwayRequestsRemaining: num(meta.runway?.requestsRemaining),
    ghostShareOfToolTokenTurns: num(meta.wasteRatio, 0),
    topCategories: topCategories(strata),
  };
}

/**
 * Assemble the full corpus index for corpusDir.
 * `failedSessions` ({id, source, sourceSession, error} from batch replays that produced no
 * strata.json) are merged in so failed sessions stay listed. `sessionSources` maps session
 * id -> operator-given session .jsonl path (measured provenance from batch mode).
 *
 * Row ordering is chosen here, at build time, in tested deterministic code — never in the
 * HTML: descending on-chain $ (sum-of-reported), failed sessions last (terminal position,
 * still listed), ties broken by id so output is stable.
 */
export function buildIndex(corpusDir, { failedSessions = [], sessionSources = {} } = {}) {
  const htmlDir = join(corpusDir, "corpus");
  const entries = findStrataFiles(corpusDir).map((file) => {
    const entry = buildEntry(file, corpusDir, htmlDir);
    const session = sessionSources[entry.id];
    if (typeof session === "string") entry.sourceSession = session;
    return entry;
  });
  for (const failed of failedSessions) {
    if (entries.some((entry) => entry.id === failed.id)) continue;
    entries.push({
      id: failed.id,
      source: failed.source ?? null,
      sourceSession: failed.sourceSession ?? null,
      cwd: null,
      replayStatus: "failed",
      html: null,
      error: failed.error ?? "replay produced no strata.json",
    });
  }
  entries.sort((a, b) => {
    const terminal = (s) => s === "failed" || s === "unsupported";
    if (terminal(a.replayStatus) !== terminal(b.replayStatus))
      return terminal(a.replayStatus) ? 1 : -1;
    if (!terminal(a.replayStatus) && !terminal(b.replayStatus)) {
      const byCost = (b.onChainCostUsd ?? 0) - (a.onChainCostUsd ?? 0);
      if (byCost !== 0) return byCost;
    }
    return a.id < b.id ? -1 : a.id > b.id ? 1 : 0;
  });
  return { generatedAt: Date.now(), corpusDir, sessions: entries };
}

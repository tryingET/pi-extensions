/**
 * Core candidate parsing/ranking primitives shared by InteractionHelper flows.
 */

import { spawnSync } from "node:child_process";

/**
 * @typedef {{
 *   id: string,
 *   label: string,
 *   detail: string,
 *   preview?: string,
 *   source?: string,
 *   [key: string]: unknown,
 * }} PickerCandidate
 */

/**
 * @typedef {{ ranked: PickerCandidate[]|null, reason?: string }} RankResult
 */

export const DEFAULT_TIMEOUT_MS = 2500;

/**
 * @param {unknown} value
 * @returns {string}
 */
export function normalize(value) {
  return String(value ?? "")
    .replace(/\s+/g, " ")
    .trim();
}

/**
 * @param {unknown} value
 * @returns {string}
 */
export function lower(value) {
  return normalize(value).toLowerCase();
}

/**
 * @param {unknown} error
 * @returns {string}
 */
export function toMessage(error) {
  return error instanceof Error ? error.message : String(error);
}

/**
 * @param {unknown} raw
 * @param {string} [separator]
 * @returns {{ query: string, context: string }}
 */
export function splitQueryAndContext(raw, separator = "::") {
  const trimmed = normalize(raw);
  if (!trimmed) return { query: "", context: "" };

  const separatorIndex = trimmed.indexOf(separator);
  if (separatorIndex < 0) {
    return { query: trimmed, context: "" };
  }

  return {
    query: trimmed.slice(0, separatorIndex).trim(),
    context: trimmed.slice(separatorIndex + separator.length).trim(),
  };
}

/**
 * @param {string} haystack
 * @param {string} needle
 * @returns {number}
 */
function subsequenceScore(haystack, needle) {
  if (!needle) return 0;

  let score = 0;
  let previousIndex = -1;

  for (const char of needle) {
    const index = haystack.indexOf(char, previousIndex + 1);
    if (index === -1) return -1;

    if (previousIndex === -1) {
      score += 6;
    } else {
      const gap = index - previousIndex - 1;
      score += Math.max(1, 6 - Math.min(gap, 5));
    }

    previousIndex = index;
  }

  return score;
}

/**
 * @param {PickerCandidate} candidate
 * @param {string} query
 * @returns {number}
 */
function fallbackScore(candidate, query) {
  if (!query) return 1;

  const id = lower(candidate.id);
  const label = lower(candidate.label).replace(/^\//, "");
  const detail = lower(candidate.detail);
  const haystack = `${id} ${label} ${detail}`;

  if (id === query || label === query) return 200;
  if (id.startsWith(query) || label.startsWith(query)) {
    const prefixLengths = [];
    if (id.startsWith(query)) prefixLengths.push(id.length);
    if (label.startsWith(query)) prefixLengths.push(label.length);
    const bestPrefixLength = prefixLengths.length > 0 ? Math.min(...prefixLengths) : query.length;
    const extraChars = Math.max(0, bestPrefixLength - query.length);
    return 140 - Math.min(extraChars, 20);
  }

  const containsIndex = haystack.indexOf(query);
  if (containsIndex >= 0) return 100 - Math.min(containsIndex, 50);

  const subsequence = subsequenceScore(haystack, query);
  if (subsequence > 0) return 40 + subsequence;

  return 0;
}

/**
 * @param {PickerCandidate[]} candidates
 * @param {string} [query]
 * @returns {PickerCandidate[]}
 */
export function rankCandidatesFallback(candidates, query = "") {
  const normalizedQuery = lower(query);

  return [...candidates]
    .map((candidate) => ({
      candidate,
      score: fallbackScore(candidate, normalizedQuery),
      labelKey: lower(candidate.label),
      idKey: lower(candidate.id),
    }))
    .filter((entry) => normalizedQuery.length === 0 || entry.score > 0)
    .sort((a, b) => {
      if (b.score !== a.score) return b.score - a.score;
      if (a.labelKey !== b.labelKey) return a.labelKey.localeCompare(b.labelKey);
      return a.idKey.localeCompare(b.idKey);
    })
    .map((entry) => entry.candidate);
}

/**
 * @param {string} output
 * @param {Map<string, PickerCandidate>} byId
 * @returns {PickerCandidate[]}
 */
function parseFzfOutput(output, byId) {
  const ranked = [];
  const seen = new Set();

  for (const line of output.split(/\r?\n/)) {
    if (!line) continue;

    const [id] = line.split("\t");
    if (!id || seen.has(id)) continue;

    const candidate = byId.get(id);
    if (!candidate) continue;

    seen.add(id);
    ranked.push(candidate);
  }

  return ranked;
}

/**
 * @param {PickerCandidate[]} candidates
 * @param {string} [query]
 * @param {number} [timeoutMs]
 * @returns {RankResult}
 */
export function rankCandidatesWithFzf(candidates, query = "", timeoutMs = DEFAULT_TIMEOUT_MS) {
  const lines = candidates.map((candidate) => {
    const safeDetail = normalize(candidate.detail);
    return `${candidate.id}\t${candidate.label}\t${safeDetail}`;
  });

  const byId = new Map(candidates.map((candidate) => [candidate.id, candidate]));
  const result = spawnSync("fzf", ["--filter", query, "--delimiter", "\t", "--with-nth", "2,3"], {
    input: lines.join("\n"),
    encoding: "utf8",
    timeout: timeoutMs,
  });

  /** @type {(Error & { code?: string })|undefined} */
  const spawnError = result.error ?? undefined;
  if (spawnError) {
    if (spawnError.code === "ENOENT") {
      return { ranked: null, reason: "fzf-not-installed" };
    }
    return { ranked: null, reason: `fzf-error:${toMessage(spawnError)}` };
  }

  if (result.status === 0) {
    return { ranked: parseFzfOutput(String(result.stdout ?? ""), byId), reason: undefined };
  }

  if (result.status === 1) {
    return { ranked: [], reason: "fzf-no-match" };
  }

  return {
    ranked: null,
    reason: `fzf-exit-${result.status}${result.stderr ? `:${normalize(result.stderr)}` : ""}`,
  };
}

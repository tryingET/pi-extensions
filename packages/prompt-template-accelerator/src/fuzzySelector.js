import { spawnSync } from "node:child_process";

const DEFAULT_TIMEOUT_MS = 2500;

function normalize(value) {
  return String(value ?? "").replace(/\s+/g, " ").trim();
}

function lower(value) {
  return normalize(value).toLowerCase();
}

function buildSearchText(candidate) {
  return lower(`${candidate.id} ${candidate.label} ${candidate.detail ?? ""}`);
}

function subsequenceScore(haystack, needle) {
  if (!needle) return 0;

  let score = 0;
  let prev = -1;

  for (const char of needle) {
    const index = haystack.indexOf(char, prev + 1);
    if (index === -1) return -1;

    if (prev === -1) {
      score += 6;
    } else {
      const gap = index - prev - 1;
      score += Math.max(1, 6 - Math.min(gap, 5));
    }

    prev = index;
  }

  return score;
}

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

  const seq = subsequenceScore(haystack, query);
  if (seq > 0) return 40 + seq;

  return 0;
}

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

function runFzfFilter(candidates, query = "", timeoutMs = DEFAULT_TIMEOUT_MS) {
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

  if (result.error) {
    if (result.error.code === "ENOENT") {
      return { ranked: null, reason: "fzf-not-installed" };
    }
    return { ranked: null, reason: `fzf-error:${result.error.message}` };
  }

  if (result.status === 0) {
    return { ranked: parseFzfOutput(result.stdout || "", byId), reason: undefined };
  }

  if (result.status === 1) {
    return { ranked: [], reason: "fzf-no-match" };
  }

  return {
    ranked: null,
    reason: `fzf-exit-${result.status}${result.stderr ? `:${normalize(result.stderr)}` : ""}`,
  };
}

export function rankCandidatesWithFzf(candidates, query = "") {
  return runFzfFilter(candidates, query);
}

function buildOptionLabels(candidates) {
  const labels = [];
  const byLabel = new Map();

  for (const candidate of candidates) {
    const baseLabel = candidate.detail ? `${candidate.label} — ${candidate.detail}` : candidate.label;
    const count = byLabel.get(baseLabel) ?? 0;
    byLabel.set(baseLabel, count + 1);

    const label = count === 0 ? baseLabel : `${baseLabel} (${candidate.id})`;
    labels.push({ label, candidate });
  }

  return labels;
}

export async function selectFuzzyCandidate(candidates, options = {}) {
  if (!Array.isArray(candidates) || candidates.length === 0) {
    return { selected: null, mode: "fallback", reason: "empty-candidates" };
  }

  const query = normalize(options.query);
  const ui = options.ui;
  const title = options.title ?? "Select template";
  const maxOptions = Number.isFinite(options.maxOptions) ? Math.max(1, options.maxOptions) : 30;

  const fzfAttempt = rankCandidatesWithFzf(candidates, query);
  const mode = Array.isArray(fzfAttempt.ranked) ? "fzf" : "fallback";

  let ranked = Array.isArray(fzfAttempt.ranked)
    ? fzfAttempt.ranked
    : rankCandidatesFallback(candidates, query);

  if (ranked.length === 0) {
    return {
      selected: null,
      mode,
      reason: fzfAttempt.reason ?? "no-match",
    };
  }

  if (!ui || typeof ui.select !== "function") {
    return {
      selected: ranked[0],
      mode,
      reason: fzfAttempt.reason ?? "no-ui-auto-selected",
    };
  }

  ranked = ranked.slice(0, maxOptions);
  const optionEntries = buildOptionLabels(ranked);
  const picked = await ui.select(
    title,
    optionEntries.map((entry) => entry.label),
  );

  if (!picked) {
    return {
      selected: null,
      mode,
      reason: fzfAttempt.reason ?? "cancelled",
    };
  }

  const selected = optionEntries.find((entry) => entry.label === picked)?.candidate ?? null;
  return {
    selected,
    mode,
    reason: fzfAttempt.reason,
  };
}

function trimOutput(value) {
  const text = normalize(value);
  if (!text) return "(empty)";
  return text.length > 200 ? `${text.slice(0, 197)}...` : text;
}

export function runFzfProbe() {
  const probeInput = "alpha\nbeta\ngamma\n";

  const interactive = spawnSync("fzf", [], {
    input: probeInput,
    encoding: "utf8",
    timeout: 1500,
  });

  const filtered = spawnSync("fzf", ["--filter", "be"], {
    input: probeInput,
    encoding: "utf8",
    timeout: 1500,
  });

  return {
    interactive: {
      status: interactive.status,
      signal: interactive.signal,
      stdout: trimOutput(interactive.stdout),
      stderr: trimOutput(interactive.stderr),
      error: interactive.error ? trimOutput(interactive.error.message) : undefined,
    },
    filter: {
      status: filtered.status,
      signal: filtered.signal,
      stdout: trimOutput(filtered.stdout),
      stderr: trimOutput(filtered.stderr),
      error: filtered.error ? trimOutput(filtered.error.message) : undefined,
    },
  };
}

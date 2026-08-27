// ---
// summary: "Child-arena fork rollup: attribute direct-child session costs to a parent replay without opening their arenas in the parent model."
// read_when:
//   - "Changing --children glob handling, parentSession linkage, or child aggregate emission."
// ---
// Attribution, not modeling (RFC §2): each session is its own arena. A child's tokens/cost
// are NEVER added to the parent's window; only bounded aggregates from the child's own
// measured usage are reported under meta.forks. Direct children only (depth 1) —
// grandchildren link to children, not to this session, and are not rolled up.
//
// Linkage is measured: the runtime records the parent session's absolute JSONL path in each
// child header's parentSession. Matching is exact on the resolved path; no inference.
// Children candidates come from an operator-provided glob (no bulk session inventory).

import { readFileSync } from "node:fs";
import { basename } from "node:path";
import { buildStrataModel } from "./context-strata-lib.mjs";

/** First JSON line of a session file text, or null when absent/unparseable. */
export function parseHeaderLine(text) {
  const first = text.split("\n", 1)[0];
  if (!first) return null;
  try {
    const parsed = JSON.parse(first);
    return typeof parsed === "object" && parsed !== null ? parsed : null;
  } catch {
    return null;
  }
}

/** True when a child header's parentSession link points at the parent session path. */
export function childLinkMatches(header, parentAbsPath) {
  const link = header?.parentSession;
  return typeof link === "string" && link.length > 0 && link === parentAbsPath;
}

/** Bounded measured aggregates from one child session's own replay (content-free). */
export function aggregateChild(sessionText) {
  const { strata } = buildStrataModel(sessionText);
  const m = strata.meta;
  return {
    requests: m.requests,
    turns: m.turns,
    faults: m.faults.length,
    costTotal: m.costTotal,
    cacheHit: m.cacheHit,
    inputTokens: m.inputTokens,
    cacheReadTokens: m.cacheReadTokens,
  };
}

/**
 * Roll up direct children for a parent replay.
 * `files` are candidate .jsonl paths (already expanded from the operator glob);
 * `matchesParent(header)` decides linkage (exact, caller-canonicalized).
 * Returns additive meta.forks children data plus scan accounting. Unmatched candidates are
 * reported by count only — never listed by path (they are other sessions' children).
 */
export function rollupChildren({ files, matchesParent }) {
  const children = [];
  let scanned = 0;
  let matched = 0;
  let unreadable = 0;
  for (const file of files) {
    scanned += 1;
    let text;
    try {
      text = readFileSync(file, "utf8");
    } catch {
      unreadable += 1;
      continue;
    }
    const header = parseHeaderLine(text);
    if (!matchesParent(header)) continue;
    matched += 1;
    let agg;
    try {
      agg = aggregateChild(text);
    } catch {
      unreadable += 1;
      continue;
    }
    children.push({
      id: typeof header.id === "string" ? header.id : basename(file, ".jsonl"),
      file: basename(file),
      cwd: typeof header.cwd === "string" ? header.cwd : null,
      ...agg,
    });
  }
  return {
    children,
    childrenOnChainCostUsd: children.reduce((a, c) => a + (c.costTotal ?? 0), 0),
    scan: { scanned, matched, unreadable, unmatched: scanned - matched - unreadable },
    depth: 1,
  };
}

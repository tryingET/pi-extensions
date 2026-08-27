// ---
// summary: "Pure context-strata model: replays Pi session JSONL records into an allocation ledger (lifetimes, warmth, token-turns, liveness, dedup) plus CSV/speedscope projections."
// read_when:
//   - "Changing allocation/lifetime modeling, branch-chain walking, warmth estimation, or strata.json assembly."
// ---
// Conventions (review-fixed):
// - Residency interval is INCLUSIVE: an item is resident during requests [birthR .. freedR].
//   A fault occurring after request r sets freedR = r; end-of-session items get freedR = lastR.
// - tokenTurns = tokens * (freedR - birthR + 1).
// - Per-category series applies free deltas at index freedR + 1 so series[r] always equals
//   the window snapshot billed at request r (conservation: sum(series[c][r]) == residentEst[r]).
// - The replay walks the ACTIVE parentId chain from the session tail, not raw file order;
//   off-chain (abandoned-branch) records are accounted in meta.excludedBranches, never modeled.
// - Liveness reference mining counts mentions at r >= birthR (the creating toolCall sits at
//   birthR - 1 and is still excluded); deadness claims are limited to pathed tool allocations.

const est = (text) => Math.ceil(String(text ?? "").length / 4);

const contentToText = (content) => {
  if (typeof content === "string") return content;
  if (!Array.isArray(content)) return "";
  return content
    .map((b) => {
      if (!b || typeof b !== "object") return "";
      if (b.type === "text") return b.text ?? "";
      if (b.type === "thinking") return b.thinking ?? "";
      if (b.type === "toolCall") return `${b.name ?? "tool"} ${JSON.stringify(b.arguments ?? {})}`;
      return "";
    })
    .join("\n");
};

import { assembleStrata } from "./context-strata-projections.mjs";

export const parseJsonl = (text) => {
  const records = [];
  for (const line of String(text).split("\n")) {
    if (!line.trim()) continue;
    try {
      records.push(JSON.parse(line));
    } catch {
      // tolerate torn tail lines
    }
  }
  return records;
};

// Walk the active parent chain from the last message/compaction record back to the root.
// Returns null when no chain can be established; callers then fall back to file order.
export const buildActiveChain = (records) => {
  const byId = new Map();
  for (const rec of records) {
    if (rec && typeof rec.id === "string") byId.set(rec.id, rec);
  }
  let tail = null;
  for (const rec of records) {
    if (
      rec &&
      (rec.type === "message" || rec.type === "compaction") &&
      typeof rec.id === "string"
    ) {
      tail = rec;
    }
  }
  if (!tail) return null;
  const chain = [];
  const seen = new Set(); // cycle guard against malformed graphs
  let cur = tail;
  while (cur && !seen.has(cur.id)) {
    seen.add(cur.id);
    chain.push(cur);
    cur = cur.parentId ? byId.get(cur.parentId) : undefined;
  }
  if (chain.length === 0) return null;
  return chain.reverse();
};

const pathFromArgs = (args) => {
  if (!args || typeof args !== "object") return undefined;
  for (const k of [
    "path",
    "file",
    "filePath",
    "target",
    "targetPath",
    "oldPath",
    "newPath",
    "directory",
    "dir",
  ]) {
    const v = args[k];
    if (typeof v === "string" && v.trim()) return v.trim();
  }
  for (const k of ["paths", "files"]) {
    const v = args[k];
    if (Array.isArray(v)) {
      const first = v.find((x) => typeof x === "string" && x.trim());
      if (first) return first.trim();
    }
  }
  return undefined;
};

// Path-qualified reference mining: extension must be 2-8 ASCII letters so version
// strings ("v1.2.3") do not count; abbreviation false positives are stopped explicitly.
// Mentions are indexed under both the full match and its basename. Basename hits only
// revive an allocation when that basename is unique among pathed items in the session.
const REF_STOP = new Set(["e.g", "i.e", "etc"]);
const pathKey = (p) =>
  String(p ?? "")
    .replaceAll("\\", "/")
    .replace(/\/+/g, "/");
const baseOf = (p) => pathKey(p).split("/").filter(Boolean).pop() ?? "";
const noteRefMatches = (text, sink, r) => {
  for (const m of String(text ?? "").matchAll(/[A-Za-z0-9_\-./]+\.[A-Za-z][A-Za-z0-9]{0,7}/g)) {
    const raw = pathKey(m[0]);
    const base = baseOf(raw);
    if (base.length < 4 || REF_STOP.has(base.toLowerCase())) continue;
    const add = (key) => {
      const arr = sink.get(key) ?? [];
      arr.push(r);
      sink.set(key, arr);
    };
    add(base);
    add(raw);
    if (raw.startsWith("/")) add(raw.slice(1));
    else add(`/${raw}`);
  }
};

export function buildStrataModel(sessionText, opts = {}) {
  const CONTEXT_WINDOW = Number(opts.contextWindow ?? 200000);
  const allRecords = parseJsonl(sessionText);
  const chain = buildActiveChain(allRecords);
  const ordered =
    chain ?? allRecords.filter((r) => r.type === "message" || r.type === "compaction");

  // Off-chain accounting: abandoned branches were really executed and really billed,
  // but they never entered the live arena, so they are reported, not modeled.
  const chainIds = new Set(ordered.map((r) => r.id));
  const excludedBranches = { records: 0, requests: 0, costTotal: 0 };
  for (const rec of allRecords) {
    if (rec?.type !== "message" || !rec.message || chainIds.has(rec.id)) continue;
    excludedBranches.records += 1;
    const usage = rec.message.usage;
    if (usage && typeof usage.input === "number") {
      excludedBranches.requests += 1;
      excludedBranches.costTotal += Number(usage.cost?.total ?? 0);
    }
  }

  // ---------- pass 2: replay the active chain ----------
  let windowItems = [];
  const items = [];
  let requestIdx = -1;
  let turnIdx = 0;
  const requests = [];
  const faults = [];
  const intents = [];
  let prevIds = null;
  let bedrockTokens = null;

  const push = (item) => {
    windowItems.push(item);
    items.push(item);
  };

  for (const rec of ordered) {
    if (rec.type === "compaction") {
      const before = windowItems.reduce((a, x) => a + x.tokens, 0) + (bedrockTokens ?? 0);
      const summary = String(rec.summary ?? "");
      faults.push({
        r: requestIdx,
        ts: rec.timestamp ?? "",
        tokensBefore: before,
        summaryTokens: est(summary),
      });
      // free(): everything collapses into one summary allocation; resident through request r
      for (const it of windowItems) it.freedR = requestIdx;
      windowItems = [];
      if (summary.trim()) {
        push({
          key: `summary:${rec.id}`,
          cat: "summary",
          label: "compaction summary",
          tokens: est(summary),
          birthR: requestIdx + 1,
          turn: turnIdx,
        });
      }
      prevIds = null; // full cache invalidation
      continue;
    }

    if (rec.type !== "message" || !rec.message) continue;
    const msg = rec.message;
    const role = msg.role;

    if (role === "user") {
      turnIdx += 1;
      const full = contentToText(msg.content).replace(/\s+/g, " ").trim();
      intents.push({
        turn: turnIdx,
        label: full.slice(0, 60) || "(empty user msg)",
        birthR: requestIdx + 1,
      });
      push({
        key: `m:${rec.id}`,
        cat: "user",
        label: full.slice(0, 48) || "user",
        tokens: est(full),
        birthR: requestIdx + 1,
        turn: turnIdx,
      });
      continue;
    }

    if (role === "assistant") {
      const usage = msg.usage;
      if (usage && typeof usage.input === "number") {
        requestIdx += 1;
        const convoTokens = windowItems.reduce((a, x) => a + x.tokens, 0);
        if (bedrockTokens === null) {
          bedrockTokens = Math.max(0, usage.input - convoTokens);
          if (bedrockTokens > 0) {
            const b = {
              key: "system:bedrock",
              cat: "system",
              label: "system prompt + harness (residual-calibrated)",
              tokens: bedrockTokens,
              birthR: 0,
              turn: 0,
            };
            items.push(b);
            windowItems.unshift(b);
          }
        }
        // warmth model: longest identical item-key prefix vs previous request's window
        let warmTokens = 0;
        if (prevIds) {
          const ids = windowItems.map((x) => x.key);
          let i = 0;
          while (i < ids.length && i < prevIds.length && ids[i] === prevIds[i]) i += 1;
          for (let j = 0; j < i; j++) warmTokens += windowItems[j].tokens;
        }
        const cost = usage.cost ?? {};
        requests.push({
          r: requestIdx,
          turn: turnIdx,
          ts: rec.timestamp ?? "",
          model: String(msg.model ?? ""),
          input: usage.input,
          cacheRead: usage.cacheRead ?? 0,
          cacheWrite: usage.cacheWrite ?? 0,
          output: usage.output ?? 0,
          costInput: cost.input ?? 0,
          costOutput: cost.output ?? 0,
          costCacheRead: cost.cacheRead ?? 0,
          costCacheWrite: cost.cacheWrite ?? 0,
          costTotal: cost.total ?? 0,
          residentEst: windowItems.reduce((a, x) => a + x.tokens, 0),
          warmModelTokens: warmTokens,
        });
        prevIds = windowItems.map((x) => x.key);
      }
      // the assistant's own output becomes new allocations (born for the NEXT request)
      const content = Array.isArray(msg.content) ? msg.content : [];
      let bi = 0;
      for (const block of content) {
        if (!block || typeof block !== "object") continue;
        if (block.type === "text") {
          push({
            key: `m:${rec.id}#${bi}`,
            cat: "assistantText",
            label: (block.text ?? "").slice(0, 48).replace(/\s+/g, " ") || "assistant text",
            tokens: est(block.text ?? ""),
            birthR: requestIdx + 1,
            turn: turnIdx,
          });
        } else if (block.type === "thinking") {
          push({
            key: `m:${rec.id}#${bi}`,
            cat: "thinking",
            label: "thinking",
            tokens: est(block.thinking ?? ""),
            birthR: requestIdx + 1,
            turn: turnIdx,
          });
        } else if (block.type === "toolCall") {
          const path = pathFromArgs(block.arguments);
          push({
            key: `m:${rec.id}#${bi}`,
            cat: "toolCall",
            label: String(block.name ?? "tool"),
            tokens: est(`${block.name ?? "tool"} ${JSON.stringify(block.arguments ?? {})}`),
            birthR: requestIdx + 1,
            turn: turnIdx,
            path,
            toolName: String(block.name ?? "tool"),
          });
        }
        bi += 1;
      }
      continue;
    }

    if (role === "toolResult") {
      push({
        key: `m:${rec.id}`,
        cat: "toolResult",
        label: String(msg.toolName ?? "tool"),
        tokens: est(contentToText(msg.content)),
        birthR: requestIdx + 1,
        turn: turnIdx,
        toolName: String(msg.toolName ?? "tool"),
        isError: msg.isError === true,
      });
      continue;
    }

    push({
      key: `m:${rec.id}`,
      cat: "other",
      label: String(role),
      tokens: est(contentToText(msg.content)),
      birthR: requestIdx + 1,
      turn: turnIdx,
    });
  }

  const lastR = requestIdx; // may be -1 for sessions without any measured request
  for (const it of windowItems) it.freedR = Math.max(it.freedR ?? lastR, lastR);

  // ---------- liveness ----------
  {
    const refIndex = new Map();
    let r = -1;
    for (const rec of ordered) {
      if (rec.type !== "message" || !rec.message) continue;
      const msg = rec.message;
      if (msg.role === "assistant") {
        if (msg.usage && typeof msg.usage.input === "number") r += 1;
        for (const block of Array.isArray(msg.content) ? msg.content : []) {
          if (block?.type === "text") noteRefMatches(block.text, refIndex, r);
          else if (block?.type === "thinking") noteRefMatches(block.thinking, refIndex, r);
          else if (block?.type === "toolCall")
            noteRefMatches(JSON.stringify(block.arguments ?? {}), refIndex, r);
        }
      }
    }
    const basenameOwners = new Map();
    for (const it of items) {
      if (!it.path) continue;
      const base = baseOf(it.path);
      const set = basenameOwners.get(base) ?? new Set();
      set.add(pathKey(it.path));
      basenameOwners.set(base, set);
    }
    for (const it of items) {
      if (!it.path) continue;
      const full = pathKey(it.path);
      const base = baseOf(it.path);
      const unique = (basenameOwners.get(base)?.size ?? 0) === 1;
      const stripped = full.replace(/^\//, "");
      const fromFull = [
        ...(refIndex.get(full) ?? []),
        ...(refIndex.get(stripped) ?? []),
        ...(refIndex.get(`/${stripped}`) ?? []),
      ];
      const fromBase = unique ? (refIndex.get(base) ?? []) : [];
      it.refsAfter = [...fromFull, ...fromBase].filter((x) => x >= (it.birthR ?? 0)).length;
      it.basenameAmbiguous = !unique;
    }
  }
  // deadness is only claimed where reference mining can decide it (pathed tool allocations)
  for (const it of items) {
    if ((it.cat === "toolResult" || it.cat === "toolCall") && it.path) {
      it.dead = (it.refsAfter ?? 0) === 0;
    }
    const alive = Math.max(0, (it.freedR ?? lastR) - (it.birthR ?? 0) + 1);
    it.tokenTurns = (it.tokens ?? 0) * alive;
  }

  const forkItems = items.filter((it) => it.toolName === "dispatch_subagent");
  const forks = {
    count: forkItems.filter((it) => it.cat === "toolCall").length,
    tokenTurns: forkItems.reduce((a, x) => a + (x.tokenTurns ?? 0), 0),
    tokens: forkItems.reduce((a, x) => a + (x.tokens ?? 0), 0),
  };

  // ---------- dedup ----------
  const byPath = new Map();
  for (const it of items) {
    if (!it.path) continue;
    const k = `${it.toolName ?? it.cat}:${it.path}`;
    const e = byPath.get(k) ?? {
      path: it.path,
      toolName: it.toolName,
      count: 0,
      tokens: 0,
      tokenTurns: 0,
    };
    e.count += 1;
    e.tokens += it.tokens ?? 0;
    e.tokenTurns += it.tokenTurns ?? 0;
    byPath.set(k, e);
  }
  const dedup = [...byPath.values()]
    .filter((e) => e.count >= 2)
    .sort((a, b) => b.tokenTurns - a.tokenTurns)
    .slice(0, 25);

  // ---------- downstream projections ----------
  return assembleStrata(
    {
      items,
      requests,
      faults,
      intents,
      lastR,
      bedrockTokens,
      turnIdx,
      dedup,
      excludedBranches,
      forks,
      // measured provenance from the session header (IR contract: may cross; absent stays absent)
      cwd:
        allRecords.find((r) => r?.type === "session" && typeof r.cwd === "string" && r.cwd)?.cwd ??
        null,
    },
    { contextWindow: CONTEXT_WINDOW, generatedAt: opts.generatedAt, sourceFile: opts.sourceFile },
  );
}

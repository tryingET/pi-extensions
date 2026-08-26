// ---
// summary: "Replays a Pi session JSONL into context-window allocation data: per-request ledger, strata series, liveness, dedup, sankey, speedscope interop, and a generated visual artifact."
// read_when:
//   - "Changing session JSONL replay, allocation/lifetime modeling, warmth estimation, or context-strata artifact generation."
// ---
// Prototype replayer for the "context core" profiler RFC.
// Model: the context window is an arena allocator. Every message/block is an
// allocation (birth request, size in est-tokens, free at compaction/branch/end).
// Per-request provider usage (input/cacheRead/cacheWrite/output/cost) is measured
// ground truth from the session JSONL; per-item splits are calibrated estimates.
//
// Usage:
//   node context-strata-replay.mjs <session.jsonl> [--out DIR] [--html-out FILE] [--window N]
//
// Outputs (in --out, default: $TMPDIR/context-strata):
//   strata.json        - data for the visual artifact
//   requests.csv       - per-request measured + modeled ledger
//   speedscope.json    - interop: sampled-format flamegraph over the request axis
//   context-strata.html - self-contained visual artifact (if --html-out omitted,
//                         written into --out)

import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { basename, dirname, join, resolve } from "node:path";

const argv = process.argv.slice(2);
const file = argv[0];
if (!file || file.startsWith("--")) {
  console.error(
    "usage: node context-strata-replay.mjs <session.jsonl> [--out DIR] [--html-out FILE] [--window N]",
  );
  process.exit(1);
}
const argOf = (name, fallback) => {
  const i = argv.indexOf(name);
  return i >= 0 && argv[i + 1] ? argv[i + 1] : fallback;
};
const OUT_DIR = resolve(argOf("--out", join(tmpdir(), "context-strata")));
const HTML_OUT = argOf("--html-out", join(OUT_DIR, "context-strata.html"));
const CONTEXT_WINDOW = Number(argOf("--window", "200000"));

mkdirSync(OUT_DIR, { recursive: true });

// ---------- estimation (consistent with pi-context-overlay src/token-estimator) ----------
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

// ---------- categories ----------
const CATS = [
  { id: "system", label: "system + overhead", color: "#5b6478" },
  { id: "agents", label: "AGENTS/CLAUDE files", color: "#b8a06a" },
  { id: "user", label: "user messages", color: "#4fd1c5" },
  { id: "assistantText", label: "assistant text", color: "#b794f6" },
  { id: "thinking", label: "assistant thinking", color: "#6b6fd6" },
  { id: "toolCall", label: "tool calls", color: "#e0a458" },
  { id: "toolResult", label: "tool results", color: "#c96f4a" },
  { id: "summary", label: "compaction summary", color: "#6fbf8f" },
  { id: "other", label: "other", color: "#7a8296" },
];
const CAT_IDS = CATS.map((c) => c.id);

// ---------- pass 1: records ----------
const lines = readFileSync(resolve(file), "utf8")
  .split("\n")
  .filter((l) => l.trim());
const records = [];
for (const line of lines) {
  try {
    records.push(JSON.parse(line));
  } catch {
    // tolerate torn tail lines
  }
}

// ---------- pass 2: walk the chain ----------
// Active window = ordered list of allocations currently resident in the request context.
let windowItems = []; // {key, cat, label, path, tokens, birthR}
let requestIdx = -1;
let turnIdx = 0;
const requests = []; // measured ledger rows
const windowAtRequest = []; // snapshot: {ids:[keys], cum:[cumulative tokens before idx]}
const items = []; // all allocations ever born
const faults = []; // compaction events
const intents = []; // {turn, label, birthR}
let prevWindow = null;

// First request residual -> system prompt + harness overhead item (bedrock).
let bedrockTokens = null;

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

const push = (item) => {
  windowItems.push(item);
  items.push(item);
};

for (const rec of records) {
  if (rec.type === "compaction") {
    const before = windowItems.reduce((a, x) => a + x.tokens, 0) + (bedrockTokens ?? 0);
    const summary = String(rec.summary ?? "");
    faults.push({
      r: requestIdx,
      ts: rec.timestamp,
      tokensBefore: before,
      summaryTokens: est(summary),
    });
    // free(): everything collapses into one summary allocation
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
    prevWindow = null; // full cache invalidation
    continue;
  }

  if (rec.type !== "message" || !rec.message) continue;
  const msg = rec.message;
  const role = msg.role;

  if (role === "user") {
    turnIdx += 1;
    const text = contentToText(msg.content).slice(0, 200).replace(/\s+/g, " ").trim();
    intents.push({
      turn: turnIdx,
      label: text.slice(0, 60) || "(empty user msg)",
      birthR: requestIdx + 1,
    });
    push({
      key: `m:${rec.id}`,
      cat: "user",
      label: text.slice(0, 48) || "user",
      tokens: est(contentToText(msg.content)),
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
        // calibrate bedrock from the first measured request
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
      // warmth model: longest identical prefix vs previous request window
      let warmTokens = 0;
      if (prevWindow) {
        const ids = windowItems.map((x) => x.key);
        let i = 0;
        while (i < ids.length && i < prevWindow.ids.length && ids[i] === prevWindow.ids[i]) i += 1;
        // everything before index i was already present last request
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
      windowAtRequest.push(windowItems.map((x) => x.key));
      prevWindow = { ids: windowItems.map((x) => x.key) };
    }
    // then the assistant's own output becomes new allocations
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

  // any other role still occupies the window
  push({
    key: `m:${rec.id}`,
    cat: "other",
    label: String(role),
    tokens: est(contentToText(msg.content)),
    birthR: requestIdx + 1,
    turn: turnIdx,
  });
}

const lastR = requestIdx; // last observed request index
for (const it of windowItems) if (it.freedR === undefined) it.freedR = lastR + 1; // still resident at end

// ---------- liveness: reference mining ----------
// basename -> sorted request indices where mentioned later (assistant text/thinking/toolCall args)
const refIndex = new Map(); // path basename -> [requestIdx...]
const noteRef = (text, r) => {
  for (const m of String(text ?? "").matchAll(/[A-Za-z0-9_\-./]+\.[A-Za-z0-9]{1,8}/g)) {
    const base = basename(m[0]).replace(/[).,;:'"]+$/, "");
    if (base.length < 3) continue;
    const arr = refIndex.get(base) ?? [];
    arr.push(r);
    refIndex.set(base, arr);
  }
};
{
  let r = -1;
  for (const rec of records) {
    if (rec.type !== "message" || !rec.message) continue;
    const msg = rec.message;
    if (msg.role === "assistant") {
      if (msg.usage && typeof msg.usage.input === "number") r += 1;
      for (const block of Array.isArray(msg.content) ? msg.content : []) {
        if (block?.type === "text") noteRef(block.text, r);
        else if (block?.type === "thinking") noteRef(block.thinking, r);
        else if (block?.type === "toolCall") noteRef(JSON.stringify(block.arguments ?? {}), r);
      }
    }
  }
}
for (const it of items) {
  if (!it.path) continue;
  const base = basename(it.path);
  const refs = (refIndex.get(base) ?? []).filter((r) => r > (it.birthR ?? 0));
  it.refsAfter = refs.length;
}
// deadness is only claimed where reference mining can actually decide it (pathed tool
// allocations); pathless allocations (e.g. bash output) stay "unknown liveness"
for (const it of items) {
  if ((it.cat === "toolResult" || it.cat === "toolCall") && it.path) {
    it.dead = (it.refsAfter ?? 0) === 0;
  }
  const alive = Math.max(0, (it.freedR ?? lastR + 1) - (it.birthR ?? 0));
  it.tokenTurns = (it.tokens ?? 0) * alive;
}

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

// ---------- per-category resident series over requests ----------
const series = Object.fromEntries(CAT_IDS.map((c) => [c, new Array(requests.length).fill(0)]));
// replay birth/freed intervals incrementally
{
  const delta = new Map(); // r -> {cat: deltaTokens}
  const add = (r, cat, d) => {
    const row = delta.get(r) ?? {};
    row[cat] = (row[cat] ?? 0) + d;
    delta.set(r, row);
  };
  for (const it of items) add(it.birthR ?? 0, it.cat, +(it.tokens ?? 0));
  for (const it of items) add(it.freedR ?? lastR + 1, it.cat, -(it.tokens ?? 0));
  const cur = Object.fromEntries(CAT_IDS.map((c) => [c, 0]));
  for (let r = 0; r < requests.length; r++) {
    const row = delta.get(r);
    if (row) for (const [cat, d] of Object.entries(row)) cur[cat] = (cur[cat] ?? 0) + d;
    for (const cat of CAT_IDS) series[cat][r] = cur[cat];
  }
}

// ---------- sankey: intent -> category (token-turns) ----------
const catTokenTurns = Object.fromEntries(CAT_IDS.map((c) => [c, 0]));
for (const it of items) catTokenTurns[it.cat] = (catTokenTurns[it.cat] ?? 0) + (it.tokenTurns ?? 0);
const sankeyLinks = [];
for (const it of items) {
  if (it.cat === "system" || it.cat === "agents") {
    sankeyLinks.push({ source: "bedrock", target: it.cat, value: it.tokenTurns ?? 0 });
  } else {
    const intent = intents.find((x) => x.turn === it.turn) ?? null;
    sankeyLinks.push({
      source: intent ? `T${intent.turn}: ${intent.label}` : "pre-session",
      target: it.cat,
      value: it.tokenTurns ?? 0,
    });
  }
}
const mergeLinks = (links) => {
  const m = new Map();
  for (const l of links) {
    const k = `${l.source}\u0000${l.target}`;
    m.set(k, { source: l.source, target: l.target, value: (m.get(k)?.value ?? 0) + l.value });
  }
  return [...m.values()].filter((l) => l.value > 0).sort((a, b) => b.value - a.value);
};

// ---------- speedscope (sampled) interop ----------
const frames = ["window"];
const frameIdx = new Map([["window", 0]]);
const getFrame = (name) => {
  if (!frameIdx.has(name)) {
    frameIdx.set(name, frames.length);
    frames.push(name);
  }
  return frameIdx.get(name);
};
const samples = [];
const stacks = [];
for (let r = 0; r < requests.length; r++) {
  const cats = CAT_IDS.filter((c) => series[c][r] > 0).sort((a, b) => series[b][r] - series[a][r]);
  const stack = [
    0,
    ...cats
      .slice(0, 7)
      .map((c) =>
        getFrame(`${CATS.find((x) => x.id === c).label} ~${Math.round(series[c][r] / 1000)}k`),
      ),
  ];
  stacks.push(stack);
  samples.push(stack.map((_, i) => stack.slice(0, i + 1)));
}
const speedscope = {
  $schema: "https://www.speedscope.app/schema.json",
  shared: { frames: frames.map((name) => ({ name })) },
  profiles: [
    {
      type: "sampled",
      name: `${basename(file)} — window composition per request`,
      unit: "milliseconds",
      startValue: 0,
      endValue: requests.length,
      samples,
      weights: new Array(requests.length).fill(1),
    },
  ],
};

// ---------- totals + runway ----------
const totals = {
  requests: requests.length,
  turns: Math.max(1, turnIdx),
  costTotal: requests.reduce((a, x) => a + x.costTotal, 0),
  costCacheRead: requests.reduce((a, x) => a + x.costCacheRead, 0),
  costInput: requests.reduce((a, x) => a + x.costInput, 0),
  costOutput: requests.reduce((a, x) => a + x.costOutput, 0),
  inputTokens: requests.reduce((a, x) => a + x.input, 0),
  cacheReadTokens: requests.reduce((a, x) => a + x.cacheRead, 0),
  cacheWriteTokens: requests.reduce((a, x) => a + x.cacheWrite, 0),
  outputTokens: requests.reduce((a, x) => a + x.output, 0),
  bedrockTokens: bedrockTokens ?? 0,
};
const cacheHit =
  totals.inputTokens + totals.cacheReadTokens > 0
    ? totals.cacheReadTokens / (totals.inputTokens + totals.cacheReadTokens)
    : 0;
const n = requests.length;
const burnPerRequest =
  n >= 10 ? (requests[n - 1].residentEst - requests[Math.max(0, n - 11)].residentEst) / 10 : 0;
const lastMeasured = n ? requests[n - 1].input + requests[n - 1].cacheRead : 0;
const lastResident = n ? requests[n - 1].residentEst : 0;
const calibrationFactor = lastResident > 0 ? lastMeasured / lastResident : 1;

const runway = {
  residentLast: n ? requests[n - 1].residentEst : 0,
  burnPerRequest,
  contextWindow: CONTEXT_WINDOW,
  requestsRemaining:
    burnPerRequest > 0
      ? Math.max(
          0,
          Math.floor((CONTEXT_WINDOW - (n ? requests[n - 1].residentEst : 0)) / burnPerRequest),
        )
      : null,
};

// ---------- ghosts ----------
const ghosts = items
  .filter((x) => x.dead && (x.tokenTurns ?? 0) > 0)
  .sort((a, b) => b.tokenTurns - a.tokenTurns)
  .slice(0, 12)
  .map((x) => ({
    label: x.path ? `${basename(x.path)} (${x.toolName ?? x.cat})` : `${x.label}`,
    tokens: x.tokens,
    born: x.birthR,
    freed: x.freedR,
    tokenTurns: x.tokenTurns,
  }));
const wastedTokenTurns = items.filter((x) => x.dead).reduce((a, x) => a + (x.tokenTurns ?? 0), 0);
const allTokenTurns = items.reduce((a, x) => a + (x.tokenTurns ?? 0), 0);
// waste is only decidable within the pathed (minable) tool heap
const pathedTokenTurns = items
  .filter((x) => x.path && (x.cat === "toolResult" || x.cat === "toolCall"))
  .reduce((a, x) => a + (x.tokenTurns ?? 0), 0);

// ---------- assemble strata.json ----------
const strata = {
  meta: {
    file: basename(file),
    generatedAt: new Date().toISOString(),
    ...totals,
    cacheHit,
    tokenTurns: allTokenTurns,
    wastedTokenTurns,
    wasteRatio: pathedTokenTurns > 0 ? wastedTokenTurns / pathedTokenTurns : 0,
    pathedTokenTurns,
    // est-vs-measured drift: multiply est tokens by this to match the last measured request
    calibrationFactor,
    faults,
    runway,
  },
  cats: CATS,
  requests,
  series,
  items: items
    .filter((x) => (x.tokens ?? 0) > 0)
    .map((x) => ({
      c: x.cat,
      l: x.label,
      p: x.path,
      t: x.tokens,
      b: x.birthR,
      f: x.freedR,
      tt: x.tokenTurns,
      d: x.dead === true ? 1 : 0,
      r: x.refsAfter ?? 0,
    })),
  sankey: { links: mergeLinks(sankeyLinks).slice(0, 200) },
  dedup,
  ghosts,
};

writeFileSync(join(OUT_DIR, "strata.json"), JSON.stringify(strata));
writeFileSync(
  join(OUT_DIR, "requests.csv"),
  [
    "r,turn,ts,model,input,cacheRead,cacheWrite,output,residentEst,warmModelTokens,costInput,costCacheRead,costOutput,costTotal",
    ...requests.map((x) =>
      [
        x.r,
        x.turn,
        x.ts,
        x.model,
        x.input,
        x.cacheRead,
        x.cacheWrite,
        x.output,
        x.residentEst,
        x.warmModelTokens,
        x.costInput.toFixed(6),
        x.costCacheRead.toFixed(6),
        x.costOutput.toFixed(6),
        x.costTotal.toFixed(6),
      ].join(","),
    ),
  ].join("\n"),
);
writeFileSync(join(OUT_DIR, "speedscope.json"), JSON.stringify(speedscope));

// ---------- generate the visual artifact ----------
const templatePath = join(
  dirname(new URL(import.meta.url).pathname),
  "context-strata.template.html",
);
let html = readFileSync(templatePath, "utf8");
html = html.replace("__STRATA_JSON__", JSON.stringify(strata));
writeFileSync(HTML_OUT, html);

console.log(`session: ${basename(file)}`);
console.log(`requests=${requests.length} turns=${turnIdx} faults=${faults.length}`);
console.log(
  `cache hit: ${(cacheHit * 100).toFixed(1)}%  total $${totals.costTotal.toFixed(2)} (warm $${totals.costCacheRead.toFixed(2)})`,
);
console.log(
  `waste: ${(strata.meta.wasteRatio * 100).toFixed(1)}% of pathed tool token-turns are mined-dead`,
);
console.log(
  `calibration: est tokens x ${calibrationFactor.toFixed(3)} = last measured request (${lastMeasured} measured / ${lastResident} est)`,
);
console.log(`out: ${OUT_DIR}`);
console.log(`html: ${HTML_OUT}`);

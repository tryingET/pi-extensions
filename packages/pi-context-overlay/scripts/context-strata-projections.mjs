// ---
// summary: "Downstream context-strata projections: conservation series, sankey, speedscope interop, runway/ghost accounting, strata.json and CSV assembly."
// read_when:
//   - "Changing strata.json shape, per-request series assembly, sankey/speedscope output, or runway/waste accounting."
// ---

// strata.json is a declared cross-package IR (consumed by packages/pi-context-corpus).
// Contract: additive-only changes; consumers ignore unknown fields and tolerate absent ones
// (pre-versioning artifacts stay readable); a breaking change bumps IR_SCHEMA_VERSION with a
// migration note. IR_ESTIMATOR is self-identity provenance: it binds every derived figure
// (wasteRatio, ghosts) to the miner that produced it.
export const IR_SCHEMA_VERSION = 1;
export const IR_ESTIMATOR = "context-strata:path-qualified-liveness-v2";

export const CATS = [
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

const csvField = (v) => {
  const s = String(v ?? "");
  return /[\n",]/.test(s) ? `"${s.replaceAll('"', '""')}"` : s;
};

export function assembleStrata(
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
    cwd,
  },
  opts = {},
) {
  const CONTEXT_WINDOW = Number(opts.contextWindow ?? 200000);

  const series = Object.fromEntries(CAT_IDS.map((c) => [c, new Array(requests.length).fill(0)]));
  {
    const delta = new Map();
    const add = (r, cat, d) => {
      const row = delta.get(r) ?? {};
      row[cat] = (row[cat] ?? 0) + d;
      delta.set(r, row);
    };
    for (const it of items) add(Math.max(0, it.birthR ?? 0), it.cat, +(it.tokens ?? 0));
    // free deltas land one past the inclusive residency end
    for (const it of items) add((it.freedR ?? lastR) + 1, it.cat, -(it.tokens ?? 0));
    const cur = Object.fromEntries(CAT_IDS.map((c) => [c, 0]));
    for (let r = 0; r < requests.length; r++) {
      const row = delta.get(r);
      if (row) for (const [cat, d] of Object.entries(row)) cur[cat] += d;
      for (const cat of CAT_IDS) series[cat][r] = cur[cat];
    }
  }

  // ---------- sankey ----------
  const sankeyLinksRaw = [];
  for (const it of items) {
    if (it.cat === "system" || it.cat === "agents") {
      sankeyLinksRaw.push({ source: "bedrock", target: it.cat, value: it.tokenTurns ?? 0 });
    } else {
      const intent = intents.find((x) => x.turn === it.turn) ?? null;
      sankeyLinksRaw.push({
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

  // ---------- speedscope interop ----------
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
  for (let r = 0; r < requests.length; r++) {
    const cats = CAT_IDS.filter((c) => series[c][r] > 0).sort(
      (a, b) => series[b][r] - series[a][r],
    );
    const stack = [
      0,
      ...cats
        .slice(0, 7)
        .map((c) =>
          getFrame(`${CATS.find((x) => x.id === c).label} ~${Math.round(series[c][r] / 1000)}k`),
        ),
    ];
    samples.push(stack.map((_, i) => stack.slice(0, i + 1)));
  }
  const speedscope = {
    $schema: "https://www.speedscope.app/schema.json",
    shared: { frames: frames.map((name) => ({ name })) },
    profiles: [
      {
        type: "sampled",
        name: "window composition per provider request",
        unit: "none",
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
  const billed = totals.inputTokens + totals.cacheReadTokens;
  const cacheHit = billed > 0 ? totals.cacheReadTokens / billed : 0;
  const n = requests.length;
  const lastFaultR = faults.length ? faults[faults.length - 1].r : -1;
  const slopeFrom = Math.max(lastFaultR + 1, n >= 2 ? n - 11 : 0, 0);
  const slopeSpan = n > 0 ? n - 1 - slopeFrom : 0;
  const burnPerRequest =
    slopeSpan >= 1
      ? (requests[n - 1].residentEst - requests[slopeFrom].residentEst) / slopeSpan
      : 0;
  const runway = {
    residentLast: n ? requests[n - 1].residentEst : 0,
    burnPerRequest,
    contextWindow: CONTEXT_WINDOW,
    slopeFrom,
    rebaselinedAfterFault: lastFaultR >= 0 && slopeFrom === lastFaultR + 1,
    requestsRemaining:
      burnPerRequest > 0
        ? Math.max(
            0,
            Math.floor((CONTEXT_WINDOW - (n ? requests[n - 1].residentEst : 0)) / burnPerRequest),
          )
        : null,
  };

  let warmthMae = 0;
  let warmthN = 0;
  for (const q of requests) {
    const billedR = q.input + q.cacheRead;
    if (billedR <= 0 || q.residentEst <= 0) continue;
    warmthMae += Math.abs(q.cacheRead / billedR - q.warmModelTokens / q.residentEst);
    warmthN += 1;
  }
  const warmthAgreement = { n: warmthN, mae: warmthN > 0 ? warmthMae / warmthN : 0 };

  const modelChanges = [];
  for (let i = 0; i < requests.length; i++) {
    if (i === 0 || requests[i].model !== requests[i - 1].model) {
      modelChanges.push({ r: i, model: requests[i].model });
    }
  }

  // ---------- ghosts / waste ----------
  const ghosts = items
    .filter((x) => x.dead && (x.tokenTurns ?? 0) > 0)
    .sort((a, b) => b.tokenTurns - a.tokenTurns)
    .slice(0, 12)
    .map((x) => ({
      label: x.path ? `${x.path.split("/").pop()} (${x.toolName ?? x.cat})` : `${x.label}`,
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

  const lastMeasured = n ? requests[n - 1].input + requests[n - 1].cacheRead : 0;
  const lastResident = n ? requests[n - 1].residentEst : 0;

  const strata = {
    meta: {
      schemaVersion: IR_SCHEMA_VERSION,
      estimator: IR_ESTIMATOR,
      // measured provenance from the session header; absent (not null) when the header
      // carried no cwd, so legacy/artifact shapes stay additive-clean
      ...(cwd ? { cwd } : {}),
      generatedAt: opts.generatedAt ?? new Date().toISOString(),
      ...totals,
      cacheHit,
      tokenTurns: allTokenTurns,
      wastedTokenTurns,
      wasteRatio: pathedTokenTurns > 0 ? wastedTokenTurns / pathedTokenTurns : 0,
      pathedTokenTurns,
      calibrationFactor: lastResident > 0 ? lastMeasured / lastResident : 1,
      faults,
      runway,
      excludedBranches,
      forks: forks ?? { count: 0, tokenTurns: 0, tokens: 0 },
      warmthAgreement,
      modelChanges,
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
    sankey: { links: mergeLinks(sankeyLinksRaw).slice(0, 200) },
    dedup,
    ghosts,
  };

  const requestsCsv = [
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
      ]
        .map(csvField)
        .join(","),
    ),
  ].join("\n");

  return { strata, speedscope, requestsCsv };
}

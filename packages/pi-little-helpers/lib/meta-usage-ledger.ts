// summary: append-only local Muse usage ledger: Pi-side token/cost totals and run-out markers for /limits.
// read_when: changing Meta Muse usage accounting, the ledger format, or run-out detection.
import { appendFileSync, mkdirSync, readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { getAgentDir } from "@earendil-works/pi-coding-agent";
import { limitsText } from "./codex-limits.ts";

/**
 * Meta publishes no Muse subscription usage endpoint, so the only truthful
 * accounting is local: Pi already reports exact per-message usage, and this
 * ledger accumulates it (one JSON line per Muse assistant message) in the
 * agent dir. It counts only Muse traffic through Pi on this machine; Muse
 * use in other apps or on other devices is invisible to it, and API-key
 * (`META_API_KEY`) traffic never reaches it because only messages served by
 * the base `meta` provider in a Pi session are recorded.
 *
 * When a Muse message fails with a quota-like error, a `run-out` marker line
 * is appended (never the raw provider error text). The cycle totals at that
 * moment — usage since the previous marker, or since the ledger start — are
 * the empirical subscription budget, derived at read time.
 */
export const META_LEDGER_FILENAME = "meta-usage-ledger.jsonl";
const QUOTA_LIKE =
  /\b429\b|quota|rate[\s_-]?limit|too many requests|insufficient|exhaust|out of credits?|credits? (?:exhausted|depleted|used up)/i;

export interface MetaUsageTotals {
  requests: number;
  input: number;
  output: number;
  cacheRead: number;
  cacheWrite: number;
  reasoning: number;
  totalTokens: number;
  costUsd: number;
}
export interface MetaUsageSummary {
  totals: MetaUsageTotals;
  perModel: Array<{ model: string; totals: MetaUsageTotals }>;
  firstTs?: number;
  lastTs?: number;
  runOuts: number;
  lastRunOut?: { ts: number; cycle: MetaUsageTotals; since: MetaUsageTotals };
}
export interface MetaLedgerEntry {
  ts: number;
  kind: "usage" | "run-out";
  model: string;
  totals?: MetaUsageTotals;
}
const emptyTotals = (): MetaUsageTotals => ({
  requests: 0,
  input: 0,
  output: 0,
  cacheRead: 0,
  cacheWrite: 0,
  reasoning: 0,
  totalTokens: 0,
  costUsd: 0,
});
const finite = (value: unknown): number =>
  typeof value === "number" && Number.isFinite(value) && value > 0 ? value : 0;
function record(value: unknown): Record<string, unknown> | undefined {
  return value !== null && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : undefined;
}
export function metaLedgerPath(agentDir = getAgentDir()): string {
  return join(agentDir, META_LEDGER_FILENAME);
}
function appendEntry(path: string, entry: MetaLedgerEntry): void {
  mkdirSync(dirname(path), { recursive: true });
  appendFileSync(path, `${JSON.stringify({ v: 1, ...entry })}\n`, "utf8");
}

/** Structural view of a finalized Pi message; only `meta` assistant messages count. */
export interface MetaMessageLike {
  role?: unknown;
  provider?: unknown;
  model?: unknown;
  stopReason?: unknown;
  errorMessage?: unknown;
  timestamp?: unknown;
  usage?: {
    input?: unknown;
    output?: unknown;
    cacheRead?: unknown;
    cacheWrite?: unknown;
    reasoning?: unknown;
    totalTokens?: unknown;
    cost?: { total?: unknown } | null;
  } | null;
}

/**
 * Record one finalized message. Returns true when a line was appended.
 * Zero-usage non-error messages (aborted before any token flowed) are skipped
 * so the ledger only ever counts spend that actually happened.
 */
export function recordMetaAssistantMessage(
  message: MetaMessageLike,
  path = metaLedgerPath(),
): boolean {
  if (!message || message.role !== "assistant" || message.provider !== "meta") return false;
  const model = limitsText(typeof message.model === "string" ? message.model : "") || "unknown";
  const ts = finite(message.timestamp) || Date.now();
  const usage = record(message.usage) ?? {};
  const cost = record(usage.cost) ?? {};
  const totals: MetaUsageTotals = {
    requests: 1,
    input: finite(usage.input),
    output: finite(usage.output),
    cacheRead: finite(usage.cacheRead),
    cacheWrite: finite(usage.cacheWrite),
    reasoning: finite(usage.reasoning),
    totalTokens: finite(usage.totalTokens),
    costUsd: finite(cost.total),
  };
  let appended = false;
  if (totals.totalTokens > 0 || totals.costUsd > 0) {
    appendEntry(path, { ts, kind: "usage", model, totals });
    appended = true;
  }
  if (
    message.stopReason === "error" &&
    typeof message.errorMessage === "string" &&
    QUOTA_LIKE.test(message.errorMessage)
  ) {
    appendEntry(path, { ts, kind: "run-out", model });
    appended = true;
  }
  return appended;
}

function parseEntry(line: string): MetaLedgerEntry | undefined {
  try {
    const raw = record(JSON.parse(line) as unknown);
    if (!raw || raw.v !== 1 || (raw.kind !== "usage" && raw.kind !== "run-out")) return undefined;
    const ts = finite(raw.ts);
    if (!ts) return undefined;
    const model = limitsText(typeof raw.model === "string" ? raw.model : "") || "unknown";
    if (raw.kind === "run-out") return { ts, kind: "run-out", model };
    const t = record(raw.totals) ?? {};
    return {
      ts,
      kind: "usage",
      model,
      totals: {
        requests: 1,
        input: finite(t.input),
        output: finite(t.output),
        cacheRead: finite(t.cacheRead),
        cacheWrite: finite(t.cacheWrite),
        reasoning: finite(t.reasoning),
        totalTokens: finite(t.totalTokens),
        costUsd: finite(t.costUsd),
      },
    };
  } catch {
    return undefined;
  }
}
function add(target: MetaUsageTotals, source: MetaUsageTotals): void {
  target.requests += source.requests;
  target.input += source.input;
  target.output += source.output;
  target.cacheRead += source.cacheRead;
  target.cacheWrite += source.cacheWrite;
  target.reasoning += source.reasoning;
  target.totalTokens += source.totalTokens;
  target.costUsd += source.costUsd;
}
const clone = (totals: MetaUsageTotals): MetaUsageTotals => ({ ...totals });

/**
 * Pure aggregation over parsed ledger entries, in append order: lifetime and
 * per-model totals, plus run-out cycles. A cycle is the usage accumulated
 * since the previous run-out marker (or the ledger start); `since` on the
 * last run-out is what the current cycle has used so far. Kept free of IO so
 * the cycle math is testable without a filesystem and reusable by a future
 * ledger compaction.
 */
export function summarizeMetaEntries(entries: Iterable<MetaLedgerEntry>): MetaUsageSummary {
  const totals = emptyTotals();
  const perModel = new Map<string, MetaUsageTotals>();
  let firstTs: number | undefined;
  let lastTs: number | undefined;
  let cycle = emptyTotals();
  let sinceLastRunOut = emptyTotals();
  let lastRunOut: MetaUsageSummary["lastRunOut"];
  let runOuts = 0;
  for (const entry of entries) {
    firstTs = firstTs === undefined ? entry.ts : Math.min(firstTs, entry.ts);
    lastTs = lastTs === undefined ? entry.ts : Math.max(lastTs, entry.ts);
    if (entry.kind === "run-out") {
      runOuts++;
      lastRunOut = { ts: entry.ts, cycle: clone(cycle), since: emptyTotals() };
      cycle = emptyTotals();
      sinceLastRunOut = emptyTotals();
      continue;
    }
    if (!entry.totals) continue;
    add(totals, entry.totals);
    add(cycle, entry.totals);
    add(sinceLastRunOut, entry.totals);
    const modelTotals = perModel.get(entry.model) ?? emptyTotals();
    add(modelTotals, entry.totals);
    perModel.set(entry.model, modelTotals);
  }
  if (lastRunOut) lastRunOut.since = clone(sinceLastRunOut);
  return {
    totals,
    perModel: [...perModel.entries()]
      .map(([model, modelTotals]) => ({ model, totals: modelTotals }))
      .sort((a, b) => b.totals.totalTokens - a.totals.totalTokens),
    firstTs,
    lastTs,
    runOuts,
    lastRunOut,
  };
}

/** Aggregate the ledger. A missing or malformed ledger reads as an empty summary, never an error. */
export function readMetaUsageSummary(path = metaLedgerPath()): MetaUsageSummary {
  let text = "";
  try {
    text = readFileSync(path, "utf8");
  } catch {
    text = "";
  }
  const entries: MetaLedgerEntry[] = [];
  for (const line of text.split("\n")) {
    if (!line.trim()) continue;
    const entry = parseEntry(line);
    if (entry) entries.push(entry);
  }
  return summarizeMetaEntries(entries);
}

export function formatTokens(value: number): string {
  if (value < 1_000) return `${Math.round(value)}`;
  if (value < 1_000_000) return `${(value / 1_000).toFixed(1)}K`;
  return `${(value / 1_000_000).toFixed(2)}M`;
}
const usd = (value: number): string =>
  value > 0 && value < 0.01
    ? `$${value.toFixed(4)}`
    : `$${value.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
const day = (ts: number): string => new Date(ts).toISOString().slice(0, 10);
const spend = (totals: MetaUsageTotals): string =>
  `${formatTokens(totals.totalTokens)} tokens · ≈ ${usd(totals.costUsd)} API-equivalent`;

/** Display facts for the /limits Meta detail view. Empty ledger stays explicit, never silent. */
export function metaUsageFacts(summary: MetaUsageSummary): string[] {
  if (!summary.firstTs || summary.totals.requests === 0)
    return ["Muse usage via Pi on this machine: none recorded yet (local ledger)."];
  const { totals } = summary;
  const facts = [
    `Muse via Pi here since ${day(summary.firstTs)}: ${totals.requests} request${totals.requests === 1 ? "" : "s"} · ${formatTokens(totals.input)} in / ${formatTokens(totals.output)} out · ${formatTokens(totals.cacheRead)} cached · ≈ ${usd(totals.costUsd)} API-equivalent`,
  ];
  if (summary.perModel.length > 1)
    for (const { model, totals: modelTotals } of summary.perModel.slice(0, 3))
      facts.push(`  ${model}: ${spend(modelTotals)}`);
  if (summary.lastRunOut) {
    facts.push(
      `Ran out ${day(summary.lastRunOut.ts)}: that cycle used ${spend(summary.lastRunOut.cycle)} via Pi here`,
    );
    facts.push(`Since then: ${spend(summary.lastRunOut.since)}`);
  }
  return facts;
}

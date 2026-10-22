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
 * Observed subscription-exhaustion errors append `run-out` markers with the
 * provider's reset timestamp, never raw error text. Repeated failures for the
 * same model/reset window close only one cycle. Totals are locally observed
 * spend, not proof of the subscription budget or its credit conversion.
 */
export const META_LEDGER_FILENAME = "meta-usage-ledger.jsonl";
const META_QUOTA_PREFIX = "meta API error (429): ";

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
  unresolvedRunOuts: number;
  lastRunOut?: { ts: number; resetsAt?: number; cycle: MetaUsageTotals; since: MetaUsageTotals };
}
export interface MetaLedgerEntry {
  ts: number;
  kind: "usage" | "run-out" | "run-out-reset";
  model: string;
  totals?: MetaUsageTotals;
  /** Provider-reported reset time in epoch milliseconds; absent on legacy markers. */
  resetsAt?: number;
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
const validTimestamp = (value: unknown): number | undefined =>
  typeof value === "number" && Number.isSafeInteger(value) && value > 0 && value <= 8.64e15
    ? value
    : undefined;

/** Exact observed Meta envelope (AK7405 evidence 16643), not a generic 429 guess. */
function subscriptionExhaustion(error: unknown): { resetsAt?: number } | undefined {
  if (typeof error !== "string" || !error.startsWith(META_QUOTA_PREFIX)) return undefined;
  try {
    const body = record(JSON.parse(error.slice(META_QUOTA_PREFIX.length)));
    if (
      body?.code !== "rate_limit_exceeded" ||
      body.type !== "rate_limit_error" ||
      typeof body.message !== "string" ||
      !body.message.startsWith("Subscription quota exhausted.")
    )
      return undefined;
    const seconds = validTimestamp(body.resets_at);
    return { resetsAt: seconds === undefined ? undefined : validTimestamp(seconds * 1000) };
  } catch {
    return undefined;
  }
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
  const ts = validTimestamp(message.timestamp) ?? Date.now();
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
  const exhaustion =
    message.stopReason === "error" ? subscriptionExhaustion(message.errorMessage) : undefined;
  if (exhaustion) {
    appendEntry(path, { ts, kind: "run-out", model, ...exhaustion });
    appended = true;
  }
  return appended;
}

function parseEntry(line: string): MetaLedgerEntry | undefined {
  try {
    const raw = record(JSON.parse(line) as unknown);
    if (
      !raw ||
      raw.v !== 1 ||
      (raw.kind !== "usage" && raw.kind !== "run-out" && raw.kind !== "run-out-reset")
    )
      return undefined;
    const ts = validTimestamp(raw.ts);
    if (!ts) return undefined;
    const model = limitsText(typeof raw.model === "string" ? raw.model : "") || "unknown";
    if (raw.kind === "run-out" || raw.kind === "run-out-reset") {
      const resetsAt = validTimestamp(raw.resetsAt);
      if (raw.kind === "run-out-reset" && resetsAt === undefined) return undefined;
      return { ts, kind: raw.kind, model, resetsAt };
    }
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
/**
 * Explicit maintenance only: caller supplies an evidence-linked source message.
 * Append metadata for an existing exact marker; never rewrite history or replay
 * usage. Duplicate annotations are harmless; conflicting annotations fail closed
 * on read even if concurrent maintenance callers raced this preflight.
 */
export function recordMetaRunOutReset(message: MetaMessageLike, path: string): boolean {
  const ts = validTimestamp(message.timestamp);
  const model = typeof message.model === "string" ? message.model : "";
  const resetsAt = subscriptionExhaustion(message.errorMessage)?.resetsAt;
  if (
    message.role !== "assistant" ||
    message.provider !== "meta" ||
    message.stopReason !== "error" ||
    ts === undefined ||
    !model ||
    limitsText(model) !== model ||
    resetsAt === undefined
  )
    throw new Error("Reset correction requires an exact observed Meta exhaustion message");
  const text = readFileSync(path, "utf8");
  if (!text.endsWith("\n"))
    throw new Error("Ledger must end with a complete line before correction");
  const entries = text
    .split("\n")
    .filter((line) => line.trim())
    .map((line) => {
      const entry = parseEntry(line);
      if (!entry) throw new Error("Cannot annotate a malformed ledger");
      return entry;
    });
  const matching = entries.filter(
    (entry) => entry.ts === ts && entry.model === model && entry.kind !== "usage",
  );
  if (!matching.some((entry) => entry.kind === "run-out"))
    throw new Error("No exact run-out marker for source message");
  if (matching.some((entry) => entry.resetsAt !== undefined && entry.resetsAt !== resetsAt))
    throw new Error("Reset correction conflicts with existing metadata");
  if (matching.some((entry) => entry.resetsAt === resetsAt)) return false;
  appendEntry(path, { ts, model, kind: "run-out-reset", resetsAt });
  return true;
}

const markerKey = (entry: MetaLedgerEntry): string => JSON.stringify([entry.ts, entry.model]);
function resetCorrections(entries: MetaLedgerEntry[]): Map<string, number | null> {
  const result = new Map<string, number | null>();
  for (const entry of entries) {
    if (entry.kind !== "run-out-reset") continue;
    const reset = validTimestamp(entry.resetsAt);
    if (reset === undefined) continue;
    const key = markerKey(entry);
    result.set(key, result.has(key) && result.get(key) !== reset ? null : reset);
  }
  return result;
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
 * since the previous distinct run-out window (or the ledger start); `since` on the
 * last run-out is what the current cycle has used so far. Kept free of IO so
 * the cycle math is testable without a filesystem and reusable by a future
 * ledger compaction. Legacy markers without reset metadata retain their old
 * boundaries unless exact source-bound reset annotations exist. Conflicting
 * annotations leave those boundaries unknown rather than choosing a winner.
 */
export function summarizeMetaEntries(entries: Iterable<MetaLedgerEntry>): MetaUsageSummary {
  const history = [...entries];
  const corrections = resetCorrections(history);
  const totals = emptyTotals();
  const perModel = new Map<string, MetaUsageTotals>();
  let firstTs: number | undefined;
  let lastTs: number | undefined;
  let cycle = emptyTotals();
  let sinceLastRunOut = emptyTotals();
  let lastRunOut: MetaUsageSummary["lastRunOut"];
  let runOuts = 0;
  let unresolvedRunOuts = 0;
  const seenWindows = new Set<string>();
  for (const entry of history) {
    if (entry.kind === "run-out-reset") continue;
    firstTs = firstTs === undefined ? entry.ts : Math.min(firstTs, entry.ts);
    lastTs = lastTs === undefined ? entry.ts : Math.max(lastTs, entry.ts);
    if (entry.kind === "run-out") {
      const resetsAt =
        validTimestamp(entry.resetsAt) ?? corrections.get(markerKey(entry)) ?? undefined;
      if (resetsAt === undefined) unresolvedRunOuts++;
      if (resetsAt !== undefined) {
        const key = JSON.stringify([entry.model, resetsAt]);
        if (seenWindows.has(key)) continue;
        seenWindows.add(key);
      }
      runOuts++;
      lastRunOut = { ts: entry.ts, resetsAt, cycle: clone(cycle), since: emptyTotals() };
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
    unresolvedRunOuts,
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
  const { totals } = summary;
  const facts = [
    !summary.firstTs || totals.requests === 0
      ? "Muse usage via Pi on this machine: none recorded yet (local ledger)."
      : `Muse via Pi here since ${day(summary.firstTs)}: ${totals.requests} request${totals.requests === 1 ? "" : "s"} · ${formatTokens(totals.input)} in / ${formatTokens(totals.output)} out · ${formatTokens(totals.cacheRead)} cached · ≈ ${usd(totals.costUsd)} API-equivalent`,
  ];
  if (summary.perModel.length > 1)
    for (const { model, totals: modelTotals } of summary.perModel.slice(0, 3))
      facts.push(`  ${model}: ${spend(modelTotals)}`);
  if (summary.unresolvedRunOuts > 0)
    facts.push(
      `Legacy run-out markers without verified reset metadata: ${summary.unresolvedRunOuts}; cycle boundaries are uncertain.`,
    );
  if (summary.lastRunOut) {
    facts.push(
      `Ran out ${day(summary.lastRunOut.ts)}: that cycle used ${spend(summary.lastRunOut.cycle)} via Pi here`,
    );
    facts.push(`Since then: ${spend(summary.lastRunOut.since)}`);
    if (summary.lastRunOut.resetsAt !== undefined)
      facts.push(
        `Provider-reported reset: ${new Date(summary.lastRunOut.resetsAt).toISOString()} (not a live availability check)`,
      );
  }
  return facts;
}

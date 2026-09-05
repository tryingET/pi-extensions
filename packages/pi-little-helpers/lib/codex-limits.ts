// summary: read-only, account-bound Codex usage and banked-reset snapshots for /limits.
// read_when: changing subscription limits, reset-credit expiry display, or account selection.
import type { ExtensionContext } from "@earendil-works/pi-coding-agent";
import {
  buildCodexHeaders,
  type CodexResetCredits,
  type CodexResetFetch,
  codexResetCreditsUrl,
  formatCodexResetCredits,
  parseCodexResetCredits,
} from "./codex-reset.ts";

export interface CodexUsageWindow {
  label: string;
  remainingPercent?: number;
  resetAt?: string;
  primary: boolean;
}
export interface CodexUsage {
  plan?: string;
  windows: CodexUsageWindow[];
}
export interface CodexLimitsSnapshot {
  provider: string;
  fetchedAt: number;
  usage?: CodexUsage;
  credits?: CodexResetCredits;
  usageError?: string;
  creditsError?: string;
}

export function limitsText(value: string): string {
  return value.replace(/[\p{Cc}\p{Cf}]/gu, "").slice(0, 160);
}
function record(value: unknown): Record<string, unknown> | undefined {
  return typeof value === "object" && value !== null && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : undefined;
}
export function limitsDate(iso?: string): string {
  return iso ? iso.replace("T", " ").replace(/\.\d{3}Z$/, " UTC") : "unknown";
}
export function parseCodexUsage(payload: unknown): CodexUsage {
  const root = record(payload);
  if (!root) throw new Error("Usage check returned an unrecognized response.");
  const windows: CodexUsageWindow[] = [];
  const append = (value: unknown, prefix = "", primary = true) => {
    const limit = record(value);
    for (const [key, fallback] of [
      ["primary_window", "Primary"],
      ["secondary_window", "Secondary"],
    ]) {
      const window = record(limit?.[key]);
      if (!window) continue;
      const seconds = window.limit_window_seconds;
      const label =
        typeof seconds === "number" && seconds > 0 && Number.isFinite(seconds)
          ? seconds % 86400 === 0
            ? `${seconds / 86400}d`
            : `${seconds / 3600}h`
          : fallback;
      const used = window.used_percent;
      const reset =
        typeof window.reset_at === "number" ? new Date(window.reset_at * 1000) : undefined;
      windows.push({
        label: `${prefix}${label}`,
        primary,
        remainingPercent:
          typeof used === "number" && Number.isFinite(used) && used >= 0
            ? Math.round(Math.max(0, Math.min(100, 100 - used)) * 10) / 10
            : undefined,
        resetAt: reset && Number.isFinite(reset.getTime()) ? reset.toISOString() : undefined,
      });
    }
  };
  append(root.rate_limit);
  if (Array.isArray(root.additional_rate_limits)) {
    for (const value of root.additional_rate_limits) {
      const extra = record(value);
      if (!extra) continue;
      const name =
        typeof extra.limit_name === "string"
          ? extra.limit_name
          : typeof extra.metered_feature === "string"
            ? extra.metered_feature
            : "Additional";
      append(extra.rate_limit, `${limitsText(name)} · `, false);
    }
  }
  if (!record(root.rate_limit) && !Array.isArray(root.additional_rate_limits)) {
    throw new Error("Usage check returned no rate-limit data.");
  }
  return {
    plan: typeof root.plan_type === "string" ? limitsText(root.plan_type) : undefined,
    windows,
  };
}
export function formatUsage(usage: CodexUsage): string {
  return [
    ...(usage.plan ? [`Plan: ${usage.plan}`] : []),
    ...usage.windows.map(
      (window) =>
        `${window.label}: ${
          window.remainingPercent === undefined
            ? "remaining unknown"
            : `${window.remainingPercent}% left`
        } — resets ${limitsDate(window.resetAt)}`,
    ),
    ...(usage.windows.length ? [] : ["No usage windows reported."]),
  ].join("\n");
}
export function formatCodexUsage(payload: unknown): string {
  return formatUsage(parseCodexUsage(payload));
}
async function getJson(
  url: string,
  headers: Headers,
  signal: AbortSignal,
  fetchImpl: CodexResetFetch,
): Promise<unknown> {
  let response: Response;
  try {
    response = await fetchImpl(url, { method: "GET", headers, signal });
  } catch {
    throw new Error(signal.aborted ? "Request cancelled or timed out" : "Network request failed");
  }
  if (!response.ok) throw new Error(`HTTP ${response.status}`);
  try {
    return await response.json();
  } catch {
    throw new Error("Unrecognized JSON response");
  }
}
// Bound caller waiting even when a host auth refresh does not accept AbortSignal.
// The losing promise remains observed; underlying host-owned auth may still finish.
function withAbort<T>(operation: Promise<T>, signal: AbortSignal): Promise<T> {
  return new Promise((resolve, reject) => {
    const abort = () => reject(signal.reason);
    signal.addEventListener("abort", abort, { once: true });
    if (signal.aborted) abort();
    operation.then(resolve, reject).finally(() => signal.removeEventListener("abort", abort));
  });
}
export async function fetchCodexLimitsSnapshot(
  ctx: ExtensionContext,
  fetchImpl: CodexResetFetch = globalThis.fetch,
): Promise<CodexLimitsSnapshot> {
  // Bind once, before any await: reading other accounts must never switch the session.
  const model = ctx.model;
  if (!model) throw new Error("Select an OpenAI Codex subscription model first.");
  const bound = { model, modelRegistry: ctx.modelRegistry } as ExtensionContext;
  const timeout = AbortSignal.timeout(15_000);
  const signal = ctx.signal ? AbortSignal.any([ctx.signal, timeout]) : timeout;
  signal.throwIfAborted();
  const headers = await withAbort(buildCodexHeaders(bound, true), signal);
  signal.throwIfAborted();
  const [usage, credits] = await Promise.allSettled([
    getJson("https://chatgpt.com/backend-api/wham/usage", headers, signal, fetchImpl).then(
      parseCodexUsage,
    ),
    getJson(codexResetCreditsUrl(), headers, signal, fetchImpl).then((payload) => {
      const parsed = parseCodexResetCredits(payload);
      if (!parsed) throw new Error("Unrecognized reset-credit response");
      return parsed;
    }),
  ]);
  const errorText = (reason: unknown) =>
    reason instanceof Error ? limitsText(reason.message) : "Request failed";
  return {
    provider: model.provider,
    fetchedAt: Date.now(),
    ...(usage.status === "fulfilled"
      ? { usage: usage.value }
      : { usageError: errorText(usage.reason) }),
    ...(credits.status === "fulfilled"
      ? { credits: credits.value }
      : { creditsError: errorText(credits.reason) }),
  };
}
export function formatCodexLimitsSnapshot(snapshot: CodexLimitsSnapshot, current = false): string {
  return [
    `Limits — ${snapshot.provider}${current ? " (current subscription)" : ""}`,
    snapshot.usage ? formatUsage(snapshot.usage) : `Usage unavailable: ${snapshot.usageError}`,
    snapshot.credits
      ? formatCodexResetCredits(snapshot.credits)
      : `Banked resets unavailable: ${snapshot.creditsError}`,
  ].join("\n\n");
}
export async function fetchCodexLimits(
  ctx: ExtensionContext,
  fetchImpl: CodexResetFetch = globalThis.fetch,
): Promise<string> {
  return formatCodexLimitsSnapshot(await fetchCodexLimitsSnapshot(ctx, fetchImpl), true);
}

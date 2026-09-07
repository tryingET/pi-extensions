// summary: optional, exact-provider read-only sub-core bus consumer and defensive snapshot normalization.
// read_when: changing /limits provider bridge, cancellation, money semantics, or untrusted display data.
import type { ExtensionAPI } from "@earendil-works/pi-coding-agent";
import { limitsText } from "./codex-limits.ts";
import { providerDefinition } from "./limits-providers.ts";
import type { LimitsSnapshot } from "./limits-types.ts";

export const LIMITS_USAGE_EVENT = "sub-core:usage-request:v1";
const ERROR_TEXT: Record<string, string> = {
  NO_CREDENTIALS:
    "No subscription credentials found. Sign in using this provider's supported login.",
  NOT_LOGGED_IN: "Subscription sign-in is required.",
  NO_CLI: "The provider's subscription CLI is unavailable.",
  DISABLED: "This provider is disabled in sub-core settings.",
  PROVIDER_DISABLED: "This provider is disabled in sub-core settings.",
  UNSUPPORTED: "This provider identity has no supported usage contract.",
  UNSUPPORTED_PROVIDER: "This provider identity has no supported usage contract.",
  TIMEOUT: "The subscription check timed out. Press r to retry.",
  CANCELLED: "Subscription check cancelled.",
};
const safeError = (code: unknown) =>
  typeof code === "string" && Object.hasOwn(ERROR_TEXT, code)
    ? ERROR_TEXT[code]
    : "Provider check failed. Check subscription sign-in and network, then press r.";
function record(value: unknown): Record<string, unknown> | undefined {
  return value !== null && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : undefined;
}
const finite = (value: unknown): number | undefined =>
  typeof value === "number" && Number.isFinite(value) && value >= 0 ? value : undefined;
function resetDate(value: unknown): string | undefined {
  if (typeof value !== "string" || !/^\d{4}-\d{2}-\d{2}T/.test(value)) return undefined;
  const time = Date.parse(value);
  return Number.isFinite(time) ? new Date(time).toISOString() : undefined;
}
export function normalizeProviderUsage(
  provider: string,
  value: unknown,
  now = Date.now(),
): LimitsSnapshot {
  const definition = providerDefinition(provider);
  const raw = record(value);
  if (!definition || !raw || raw.provider !== definition.core || !Array.isArray(raw.windows)) {
    throw new Error("Provider response identity or shape mismatch");
  }
  const error = record(raw.error);
  const snapshot: LimitsSnapshot = { provider, fetchedAt: now, source: "sub-core" };
  if (error) {
    snapshot.usageError = safeError(error.code);
    return snapshot;
  }
  const windows = raw.windows.slice(0, 100).flatMap((value) => {
    const window = record(value);
    if (!window) return [];
    const used = finite(window.usedPercent);
    return [
      {
        label: typeof window.label === "string" ? limitsText(window.label) : "Usage window",
        primary: !(
          provider === "anthropic" &&
          typeof window.label === "string" &&
          window.label.startsWith("Extra")
        ),
        remainingPercent:
          used === undefined
            ? undefined
            : Math.round(Math.max(0, Math.min(100, 100 - used)) * 10) / 10,
        resetAt: resetDate(window.resetAt),
      },
    ];
  });
  // OpenRouter adapter's percentages include wallet depletion. Dollars are shown independently,
  // not reclassified as subscription quota or included in cross-provider headroom ordering.
  snapshot.usage = { windows: provider === "openrouter" ? [] : windows };
  snapshot.notes = [];
  if (provider === "openrouter") {
    snapshot.money = {
      currency: "USD",
      keyLimit: raw.keyLimit === null ? null : finite(raw.keyLimit),
      keyRemaining: finite(raw.keyRemaining),
      keyUsage: finite(raw.keyUsage),
      walletTotal: raw.creditUnavailable === true ? undefined : finite(raw.creditTotal),
      walletUsage: raw.creditUnavailable === true ? undefined : finite(raw.creditUsage),
      walletRemaining: raw.creditUnavailable === true ? undefined : finite(raw.creditRemaining),
      walletUnavailable: raw.creditUnavailable === true,
    };
    snapshot.notes.push(
      "Key allowance and account wallet are different balances. Neither is a subscription quota.",
    );
    if (raw.creditUnavailable === true)
      snapshot.notes.push("Account wallet unavailable; key information is still valid.");
  }
  const remaining = finite(raw.requestsRemaining),
    entitlement = finite(raw.requestsEntitlement);
  snapshot.facts = [];
  if (remaining !== undefined || entitlement !== undefined)
    snapshot.facts.push(
      `Requests: ${remaining ?? "unknown"} left / ${entitlement ?? "unknown"} included`,
    );
  if (typeof raw.extraUsageEnabled === "boolean")
    snapshot.facts.push(`Extra usage: ${raw.extraUsageEnabled ? "enabled" : "disabled"}`);
  if (provider === "xai")
    snapshot.notes.push(
      "Grok subscription OAuth quota, not developer API credit. Endpoint is undocumented.",
    );
  if (provider === "opencode-go")
    snapshot.notes.push(
      "OpenCode Go subscription windows, not the Zen wallet. Endpoint is undocumented.",
    );
  if (!windows.length && !snapshot.money)
    snapshot.notes.push("No quota windows reported. Unknown is not unlimited.");
  return snapshot;
}

export function fetchSubCoreLimits(
  events: Pick<ExtensionAPI["events"], "emit"> | undefined,
  provider: string,
  signal: AbortSignal,
  timeoutMs = 20_000,
): Promise<LimitsSnapshot> {
  return new Promise((resolve, reject) => {
    if (!providerDefinition(provider)) {
      reject(new Error("Unsupported exact provider identity"));
      return;
    }
    if (signal.aborted) {
      reject(signal.reason);
      return;
    }
    if (!events) {
      resolve({
        provider,
        fetchedAt: Date.now(),
        source: "sub-core",
        usageError:
          "Compatible sub-core is unavailable. Install it and /reload; Codex still works independently.",
      });
      return;
    }
    let settled = false;
    const controller = new AbortController();
    const finish = (value?: LimitsSnapshot, error?: unknown) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      signal.removeEventListener("abort", abort);
      controller.abort();
      if (value) resolve(value);
      else reject(error);
    };
    const abort = () => finish(undefined, signal.reason);
    const timer = setTimeout(
      () =>
        finish({
          provider,
          fetchedAt: Date.now(),
          source: "sub-core",
          usageError:
            "Sub-core did not respond. Install a compatible sub-core and /reload, or retry after checking the network.",
        }),
      timeoutMs,
    );
    signal.addEventListener("abort", abort, { once: true });
    const reply = (value: unknown) => {
      if (settled) return;
      try {
        const response = record(value);
        if (!response || response.version !== 1 || response.provider !== provider)
          throw new Error("Sub-core response identity mismatch");
        const error = record(response.error);
        if (error)
          finish({
            provider,
            fetchedAt: Date.now(),
            source: "sub-core",
            usageError: safeError(error.code),
          });
        else finish(normalizeProviderUsage(provider, response.usage));
      } catch (error) {
        finish(undefined, error);
      }
    };
    try {
      events.emit(LIMITS_USAGE_EVENT, { provider, signal: controller.signal, reply });
    } catch (error) {
      finish(undefined, error);
    }
  });
}

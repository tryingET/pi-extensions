// summary: optional read-only sub-core reset query and strict provider-neutral inventory validation.
// read_when: changing reset transport, machine output, or provider inventory rendering.
import type { ExtensionAPI, ExtensionContext } from "@earendil-works/pi-coding-agent";
import { accountModel, isCodexProvider } from "./codex-accounts.ts";
import { limitsText } from "./codex-limits.ts";
import { fetchCodexResetCredits, resolveCodexResetTarget } from "./codex-reset.ts";
import { collectLimitsAccounts } from "./limits-providers.ts";

export interface ResetWindow {
  scope: "five_hour" | "weekly" | "codex";
  availableCount: number;
  resets: Array<{ expiresAt?: string; validFrom?: string }>;
}
export interface ResetInventory {
  provider: string;
  checkedAt: number;
  windows?: ResetWindow[];
  error?: string;
  code?: string;
}
export const RESET_INVENTORY_EVENT = "sub-core:reset-inventory-request:v1";
const ERRORS: Record<string, string> = {
  NOT_ALLOWED: "This subscription is not available or is excluded by project configuration.",
  NO_CREDENTIALS:
    "Subscription OAuth sign-in is required; API keys are not reset-inventory credentials.",
  AUTH_REQUIRED: "App/subscription sign-in is required for reset inventory.",
  DISABLED: "This provider is disabled in sub-core settings.",
  UNSUPPORTED_PROVIDER: "This exact provider identity has no reset-inventory adapter.",
  FETCH_FAILED: "The reset-inventory request failed. Retry after checking sign-in and network.",
  INVALID_RESPONSE: "The provider reset-inventory response was invalid; no count inferred.",
  TIMEOUT: "The reset-inventory request timed out.",
  CANCELLED: "Reset-inventory request cancelled.",
  CORE_UNAVAILABLE: "Compatible sub-core reset inventory is unavailable. Install it and /reload.",
};
const record = (value: unknown): Record<string, unknown> | undefined =>
  value !== null && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : undefined;
const fail = (provider: string, code: string): ResetInventory => ({
  provider: limitsText(provider),
  checkedAt: Date.now(),
  code,
  error: ERRORS[code] ?? ERRORS.INVALID_RESPONSE,
});
const validDate = (value: unknown): value is string =>
  typeof value === "string" &&
  /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/.test(value) &&
  Number.isFinite(Date.parse(value)) &&
  new Date(value).toISOString() === value;

export function normalizeResetInventory(provider: string, value: unknown): ResetInventory {
  const raw = record(value);
  if (
    !raw ||
    raw.version !== 1 ||
    raw.provider !== provider ||
    typeof raw.checkedAt !== "number" ||
    !Number.isSafeInteger(raw.checkedAt) ||
    raw.checkedAt < 0
  )
    return fail(provider, "INVALID_RESPONSE");
  const error = record(raw.error);
  if (raw.error !== undefined && (!error || raw.inventory !== undefined))
    return fail(provider, "INVALID_RESPONSE");
  if (error)
    return fail(
      provider,
      typeof error.code === "string" && Object.hasOwn(ERRORS, error.code)
        ? error.code
        : "INVALID_RESPONSE",
    );
  const windows = record(raw.inventory)?.windows;
  const scopes =
    provider === "xai" ? ["weekly"] : provider === "zai" ? ["five_hour", "weekly"] : [];
  if (!scopes.length || !Array.isArray(windows) || windows.length !== scopes.length)
    return fail(provider, "INVALID_RESPONSE");
  const seen = new Set<string>();
  const normalized: ResetWindow[] = [];
  for (const item of windows) {
    const window = record(item),
      resets = window?.resets;
    if (
      !window ||
      typeof window.scope !== "string" ||
      !scopes.includes(window.scope) ||
      seen.has(window.scope) ||
      !Number.isSafeInteger(window.availableCount) ||
      !Array.isArray(resets) ||
      resets.length > 100 ||
      window.availableCount !== resets.length
    )
      return fail(provider, "INVALID_RESPONSE");
    seen.add(window.scope);
    const cards: ResetWindow["resets"] = [];
    for (const value of resets) {
      const card = record(value);
      if (
        !card ||
        !validDate(card.expiresAt) ||
        (card.validFrom !== undefined &&
          (!validDate(card.validFrom) || card.validFrom > card.expiresAt))
      )
        return fail(provider, "INVALID_RESPONSE");
      cards.push({
        expiresAt: new Date(card.expiresAt).toISOString(),
        ...(card.validFrom ? { validFrom: new Date(card.validFrom as string).toISOString() } : {}),
      });
    }
    normalized.push({
      scope: window.scope as ResetWindow["scope"],
      availableCount: cards.length,
      resets: cards,
    });
  }
  return { provider, checkedAt: raw.checkedAt, windows: normalized };
}

export function fetchResetInventory(
  events: Pick<ExtensionAPI["events"], "emit"> | undefined,
  provider: string,
  signal: AbortSignal,
  timeoutMs = 20_000,
): Promise<ResetInventory> {
  if (provider !== "xai" && provider !== "zai")
    return Promise.resolve(fail(provider, "UNSUPPORTED_PROVIDER"));
  if (!events) return Promise.resolve(fail(provider, "CORE_UNAVAILABLE"));
  return new Promise((resolve) => {
    let settled = false;
    const controller = new AbortController();
    const finish = (result: ResetInventory) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      signal.removeEventListener("abort", abort);
      controller.abort();
      resolve(result);
    };
    const abort = () => finish(fail(provider, "CANCELLED"));
    const timer = setTimeout(() => finish(fail(provider, "CORE_UNAVAILABLE")), timeoutMs);
    signal.addEventListener("abort", abort, { once: true });
    if (signal.aborted) {
      abort();
      return;
    }
    try {
      events.emit(RESET_INVENTORY_EVENT, {
        provider,
        signal: controller.signal,
        reply: (value: unknown) => finish(normalizeResetInventory(provider, value)),
      });
    } catch {
      finish(fail(provider, "FETCH_FAILED"));
    }
  });
}

/** Exact selected identity checked before reads; no switching, auth borrowing or POST redemption. */
export async function queryResetInventory(
  ctx: ExtensionContext,
  events: ExtensionAPI["events"] | undefined,
  provider = ctx.model?.provider,
  signal = ctx.signal ?? new AbortController().signal,
  accounts = collectLimitsAccounts,
): Promise<ResetInventory> {
  if (!provider) return fail("none", "UNSUPPORTED_PROVIDER");
  if (signal.aborted) return fail(provider, "CANCELLED");
  const account = accounts(ctx).find((a) => a.provider === provider);
  if (!account) return fail(provider, "NOT_ALLOWED");
  if (account.unsupportedReason) return fail(provider, "UNSUPPORTED_PROVIDER");
  if (!isCodexProvider(provider)) return fetchResetInventory(events, provider, signal);
  const model = accountModel(account, ctx.model?.id);
  if (!model || !account.authenticated) return fail(provider, "NO_CREDENTIALS");
  try {
    const readContext = { model, modelRegistry: ctx.modelRegistry, signal } as ExtensionContext;
    const target = await resolveCodexResetTarget(readContext);
    target.assertAllowed = () => {
      signal.throwIfAborted();
      if (
        !accounts(ctx).some(
          (a) => a.provider === provider && a.authenticated && !a.unsupportedReason,
        )
      )
        throw new Error("Subscription no longer allowed");
    };
    const credits = await fetchCodexResetCredits(readContext, undefined, target);
    return {
      provider,
      checkedAt: Date.now(),
      windows: [
        {
          scope: "codex",
          availableCount: credits.availableCount,
          resets: credits.credits
            .filter((c) => !c.status || c.status === "available")
            .map((c) => ({ expiresAt: c.expiresAt })),
        },
      ],
    };
  } catch {
    return fail(provider, "FETCH_FAILED");
  }
}

export function resetInventoryLines(result: ResetInventory): string[] {
  if (result.error)
    return [
      result.error,
      ...(result.provider === "zai" && result.code === "AUTH_REQUIRED"
        ? [
            "ZCode PERSONAL sign-in needs explicitly provisioned SUB_CORE_ZCODE_JWT and SUB_CORE_ZAI_BUSINESS_TOKEN. A ZAI_API_KEY alone is insufficient; browser/app stores are not scanned.",
          ]
        : []),
    ];
  return (result.windows ?? [])
    .flatMap((window) => [
      `${window.scope === "five_hour" ? "5-hour" : window.scope === "weekly" ? "Weekly" : "Codex"} resets: ${window.availableCount}`,
      ...window.resets.map((card, i) => `  ${i + 1}. expires ${card.expiresAt ?? "unknown"}`),
    ])
    .concat(
      (result.windows?.length ?? 0) > 1
        ? ["Counts are per quota window, not a summed inventory of distinct cards."]
        : [],
    );
}

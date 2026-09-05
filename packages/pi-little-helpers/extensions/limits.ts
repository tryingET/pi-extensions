// summary: /limits all-subscription cockpit, safe switching, and headless/current snapshots.
// read_when: changing dashboard lifecycle, account actions, command dispatch, or non-TUI output.
import type {
  ExtensionAPI,
  ExtensionCommandContext,
  ExtensionContext,
} from "@earendil-works/pi-coding-agent";
import { accountModel, isCodexProvider } from "../lib/codex-accounts.ts";
import {
  fetchCodexLimits,
  fetchCodexLimitsSnapshot,
  formatCodexLimitsSnapshot,
} from "../lib/codex-limits.ts";
import { LimitsDashboard } from "../lib/limits-dashboard.ts";
import { LimitsDashboardStore } from "../lib/limits-dashboard-store.ts";
import { collectLimitsAccounts } from "../lib/limits-providers.ts";
import { formatLimitsSnapshot } from "../lib/limits-runway.ts";
import { fetchSubCoreLimits } from "../lib/limits-sub-core.ts";
import type { LimitsAccount, LimitsSnapshot } from "../lib/limits-types.ts";

interface LimitsDependencies {
  fetchCurrent: typeof fetchCodexLimits;
  fetchSnapshot: typeof fetchCodexLimitsSnapshot;
  accounts: typeof collectLimitsAccounts;
  fetchProvider: typeof fetchSubCoreLimits;
}
const defaults: LimitsDependencies = {
  fetchCurrent: fetchCodexLimits,
  fetchSnapshot: fetchCodexLimitsSnapshot,
  accounts: collectLimitsAccounts,
  fetchProvider: fetchSubCoreLimits,
};
const USAGE =
  "Usage: /limits [all|current]\n/limits opens the subscription cockpit: quota, wallet and reset timelines. /limits current prints the active subscription. Non-TUI mode prints all allowed subscriptions.";

export async function switchLimitsAccount(
  pi: Pick<ExtensionAPI, "setModel">,
  ctx: ExtensionCommandContext,
  provider: string,
  accounts = collectLimitsAccounts,
  isAlive = () => true,
): Promise<string> {
  if (!isAlive()) return "Switch cancelled: dashboard closed.";
  if (!ctx.isIdle()) return "Wait for the current turn to finish before switching subscriptions.";
  const account = accounts(ctx).find((candidate) => candidate.provider === provider);
  if (!account) return "This account is no longer allowed by the current project configuration.";
  if (!account.authenticated) return "Sign in to this account with /subs login before switching.";
  const currentId = ctx.model?.id;
  const target = accountModel(account, currentId);
  if (!target) return "This subscription has no loaded models. Run /reload first.";
  if (ctx.model?.provider === provider && currentId === target.id)
    return `Already using ${account.label}.`;
  if (currentId && currentId !== target.id) {
    const confirmed = await ctx.ui.confirm(
      "Switch account and model?",
      `${account.label} does not offer ${currentId}. Switch to ${target.id} instead?`,
    );
    if (!confirmed) return "Switch cancelled. Your active subscription is unchanged.";
  }
  // A nested confirmation can outlive a config/model change. Recheck the selected target, not the cursor.
  if (!isAlive()) return "Switch cancelled: dashboard closed.";
  if (
    !ctx.isIdle() ||
    !accounts(ctx).some(
      (candidate) =>
        candidate.provider === provider &&
        candidate.authenticated &&
        candidate.models.some((model) => model.id === target.id),
    )
  ) {
    return "Account availability changed. Refresh the dashboard before switching.";
  }
  if (!(await pi.setModel(target))) return "Switch failed. Check sign-in for this subscription.";
  return `Now using ${account.label} · ${target.id}`;
}

export function createLimitsExtension(
  options: Partial<LimitsDependencies> | typeof fetchCodexLimits = {},
): (pi: ExtensionAPI) => void {
  const dependencies = {
    ...defaults,
    ...(typeof options === "function" ? { fetchCurrent: options } : options),
  };
  return (pi) => {
    let running = false;
    let disposed = false;
    let operationAbort: AbortController | undefined;
    const snapshotFor = async (
      account: LimitsAccount,
      ctx: ExtensionContext,
      signal: AbortSignal,
    ): Promise<LimitsSnapshot> => {
      signal.throwIfAborted();
      const allowed = dependencies
        .accounts(ctx)
        .find((candidate) => candidate.provider === account.provider);
      const model = allowed && accountModel(allowed, ctx.model?.id);
      if (!model || !allowed?.authenticated || allowed.unsupportedReason)
        throw new Error("Account is no longer available");
      if (!isCodexProvider(account.provider))
        return dependencies.fetchProvider(pi.events, account.provider, signal);
      return dependencies.fetchSnapshot({
        model,
        modelRegistry: ctx.modelRegistry,
        signal,
      } as ExtensionContext);
    };
    const formatSnapshot = (snapshot: LimitsSnapshot, current = false) =>
      isCodexProvider(snapshot.provider)
        ? formatCodexLimitsSnapshot(snapshot, current)
        : formatLimitsSnapshot(snapshot, current);
    let activeStore: LimitsDashboardStore | undefined;
    let requestRender: (() => void) | undefined;
    const present = (ctx: ExtensionContext, text: string, type: "info" | "error" = "info") => {
      if (disposed) return;
      if (ctx.hasUI) ctx.ui.notify(text, type);
      else console.log(text);
    };
    pi.on("session_shutdown", () => {
      disposed = true;
      operationAbort?.abort();
      activeStore?.dispose();
      requestRender = undefined;
    });
    pi.on("model_select", (_event, ctx) => {
      if (disposed || !activeStore) return;
      activeStore.activeProvider = ctx.model?.provider;
      requestRender?.();
    });
    pi.registerCommand("limits", {
      description:
        "Subscription cockpit: compare quota, balances and reset timelines; inspect or explicitly switch",
      getArgumentCompletions: (prefix) =>
        ["all", "current"]
          .filter((value) => value.startsWith(prefix))
          .map((value) => ({ value, label: value })),
      handler: async (args, ctx) => {
        const action = args.trim().toLowerCase();
        if (!["", "all", "current"].includes(action)) {
          present(ctx, USAGE);
          return;
        }
        if (running) {
          present(ctx, "A limits dashboard or check is already open.");
          return;
        }
        if (disposed) return;
        running = true;
        operationAbort = new AbortController();
        const signal = ctx.signal
          ? AbortSignal.any([ctx.signal, operationAbort.signal])
          : operationAbort.signal;
        try {
          if (action === "current") {
            const model = ctx.model;
            const account = dependencies
              .accounts(ctx)
              .find((candidate) => candidate.provider === model?.provider);
            if (!account) {
              present(
                ctx,
                "The active provider is unsupported or excluded by this project's multi-pass configuration. Use /limits to browse allowed subscriptions.",
              );
              return;
            }
            if (account.unsupportedReason) {
              present(ctx, account.unsupportedReason);
              return;
            }
            if (!account.authenticated) {
              present(ctx, "Sign in with /login before reading this subscription.");
              return;
            }
            if (ctx.hasUI) ctx.ui.setStatus("limits", "checking limits…");
            if (!isCodexProvider(account.provider)) {
              present(ctx, formatSnapshot(await snapshotFor(account, ctx, signal), true));
              return;
            }
            present(
              ctx,
              await dependencies.fetchCurrent({
                model,
                modelRegistry: ctx.modelRegistry,
                signal,
              } as ExtensionContext),
            );
            return;
          }
          const accounts = dependencies.accounts(ctx);
          if (!accounts.length) {
            present(
              ctx,
              "No supported subscriptions are available in this project. Sign in with /login or /subs login, or check multi-pass allowedSubs.",
            );
            return;
          }
          const store = new LimitsDashboardStore(
            accounts,
            (account, storeSignal) =>
              snapshotFor(account, ctx, AbortSignal.any([signal, storeSignal])),
            () => requestRender?.(),
          );
          activeStore = store;
          store.activeProvider = ctx.model?.provider;
          if (ctx.mode !== "tui") {
            store.refresh();
            await store.waitForIdle();
            present(
              ctx,
              store.rows
                .map((row) =>
                  row.snapshot
                    ? formatSnapshot(row.snapshot, row.account.provider === store.activeProvider)
                    : `${row.account.label} (${row.account.provider})\n${row.error ?? "No data available"}`,
                )
                .join("\n\n────────────────────\n\n"),
            );
            return;
          }
          await ctx.ui.custom<void>(
            (tui, theme, keys, done) => {
              requestRender = () => {
                if (!store.disposed) tui.requestRender();
              };
              const timer = setInterval(() => requestRender?.(), 10_000);
              timer.unref?.();
              const dashboard = new LimitsDashboard(store, theme, keys, {
                close: () => {
                  store.dispose();
                  done();
                },
                switchAccount: async (provider) => {
                  const message = await switchLimitsAccount(
                    pi,
                    ctx,
                    provider,
                    dependencies.accounts,
                    () => !disposed && !store.disposed,
                  );
                  if (!store.disposed) store.activeProvider = ctx.model?.provider;
                  return message;
                },
                render: () => requestRender?.(),
                rows: () => tui.terminal.rows,
              });
              queueMicrotask(() => store.refresh());
              return Object.assign(dashboard, {
                dispose: () => {
                  clearInterval(timer);
                  store.dispose();
                  requestRender = undefined;
                },
              });
            },
            { overlay: true, overlayOptions: { width: "94%", maxHeight: "90%", margin: 1 } },
          );
        } catch (error) {
          present(
            ctx,
            action === "current"
              ? "Unable to read limits for the selected subscription. Check /login and try again."
              : error instanceof Error
                ? error.message
                : "Unable to open the limits dashboard.",
            "error",
          );
        } finally {
          operationAbort?.abort();
          operationAbort = undefined;
          activeStore?.dispose();
          activeStore = undefined;
          requestRender = undefined;
          running = false;
          if (!disposed && ctx.hasUI) ctx.ui.setStatus("limits", undefined);
        }
      },
    });
  };
}
export default createLimitsExtension();

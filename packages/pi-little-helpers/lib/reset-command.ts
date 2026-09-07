// summary: capability-routed /resets command; shares the Codex handler, never guesses provider actions.
// read_when: changing reset command routing, provider management, or confirmation boundaries.
import type { ExtensionAPI, ExtensionContext } from "@earendil-works/pi-coding-agent";
import { type LimitsAccountConfig, loadLimitsAccountConfig } from "./codex-accounts.ts";
import { limitsText } from "./codex-limits.ts";
import { resetCapability, resetGuidance } from "./reset-capabilities.ts";
import { fetchResetInventory, resetInventoryLines } from "./reset-inventory.ts";

type CommandHandler = Parameters<ExtensionAPI["registerCommand"]>[1]["handler"];
const USAGE = "Usage: /resets [status|use|manage] (active subscription; default: status)";
const present = (ctx: ExtensionContext, text: string) => {
  if (ctx.hasUI) ctx.ui.notify(text, "info");
  else console.log(text);
};

/** A static allowlisted URL only; never shell interpolation or a credential-bearing URL. */
export function managementOpenCommand(provider: string, platform = process.platform) {
  const url = resetCapability(provider).management?.url;
  if (!url) throw new Error("No verified management URL for this provider.");
  if (platform === "darwin") return { command: "open", args: [url] };
  if (platform === "win32")
    return { command: "rundll32.exe", args: ["url.dll,FileProtocolHandler", url] };
  return { command: "xdg-open", args: [url] };
}

export function registerSubscriptionResets(
  pi: ExtensionAPI,
  nativeHandler: CommandHandler,
  loadConfig: (cwd: string) => LimitsAccountConfig = loadLimitsAccountConfig,
): void {
  let disposed = false;
  const lifecycle = new AbortController();
  let managing = false;
  pi.on("session_shutdown", () => {
    disposed = true;
    lifecycle.abort();
  });
  pi.registerCommand("resets", {
    description:
      "Inspect reset capability, confirm native redemption, or manage the active subscription",
    getArgumentCompletions: (prefix) =>
      ["status", "use", "manage"]
        .filter((action) => action.startsWith(prefix.trim().toLowerCase()))
        .map((value) => ({ value, label: value })),
    handler: async (args, ctx) => {
      if (disposed) return;
      const action = args.trim().toLowerCase() || "status";
      if (!["status", "use", "manage"].includes(action)) {
        present(ctx, USAGE);
        return;
      }
      const provider = ctx.model?.provider;
      if (!provider) {
        present(ctx, "Select a subscription model first.");
        return;
      }
      const checkAllowed = () => {
        if (disposed || ctx.signal?.aborted || ctx.model?.provider !== provider) return false;
        const config = loadConfig(ctx.cwd);
        return !config.allowed || config.allowed.has(provider);
      };
      try {
        if (!checkAllowed()) {
          present(ctx, "Subscription changed or excluded by allowedSubs; no action taken.");
          return;
        }
        const capability = resetCapability(provider);
        if (
          action !== "manage" &&
          capability.inventory === "native" &&
          capability.redemption === "native"
        ) {
          // Same handler instance => same in-flight lock, persisted state and idempotency IDs as /codex-reset.
          await nativeHandler(action, ctx);
          return;
        }
        const heading = `Resets — ${limitsText(provider)} (active subscription)`;
        if (action === "status" && capability.inventory === "sub-core") {
          const result = await fetchResetInventory(
            pi.events,
            provider,
            AbortSignal.any([lifecycle.signal, ...(ctx.signal ? [ctx.signal] : [])]),
          );
          if (checkAllowed())
            present(
              ctx,
              [
                heading,
                ...resetInventoryLines(result),
                "Provider-native sign-in, not proof of identity with a model-specific credential override. No reset redeemed.",
              ].join("\n"),
            );
          return;
        }
        const guidance = [heading, ...resetGuidance(provider)].join("\n");
        if (action !== "manage") {
          present(
            ctx,
            `${guidance}${action === "use" ? "\nNative redemption is unsupported here; no reset request was sent." : ""}`,
          );
          return;
        }
        const management = capability.management;
        if (!management) {
          present(ctx, `${guidance}\nNo verified external management link is configured.`);
          return;
        }
        if (!ctx.hasUI) {
          present(ctx, guidance);
          return;
        }
        if (managing) {
          present(ctx, "A subscription management confirmation is already open.");
          return;
        }
        managing = true;
        try {
          const confirmed = await ctx.ui.confirm(
            "Open subscription management?",
            `${guidance}\n\nOpen this website only? Pi will not redeem a reset or purchase credit. Browser sign-in is not bound to the Pi account.`,
          );
          if (!confirmed || !checkAllowed()) return;
          const open = managementOpenCommand(provider);
          const result = await pi.exec(open.command, open.args, { timeout: 10_000 });
          if (!disposed)
            present(
              ctx,
              result.code === 0
                ? "Browser open requested. Verify the signed-in account; no reset was redeemed by Pi."
                : `Could not open the browser. Open ${management.url} manually.`,
            );
        } finally {
          managing = false;
        }
      } catch {
        if (!disposed)
          present(
            ctx,
            "Reset command unavailable. Check project configuration and subscription sign-in; no automatic retry was attempted.",
          );
      }
    },
  });
}

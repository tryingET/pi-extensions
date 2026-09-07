// summary: account-bound Codex reset inspection, confirmation, and idempotent retry handling.
// read_when: changing multi-pass reset targeting, persisted requests, or credit spending.

import { closeSync, fstatSync, openSync, readSync } from "node:fs";
import type { ExtensionAPI, ExtensionContext } from "@earendil-works/pi-coding-agent";
import {
  isCodexProvider,
  type LimitsAccountConfig,
  loadLimitsAccountConfig,
} from "../lib/codex-accounts.ts";
import { limitsText } from "../lib/codex-limits.ts";
import {
  CodexResetApiError,
  type CodexResetCredits,
  type CodexResetResult,
  type CodexResetTarget,
  consumeCodexResetCredit,
  createCodexResetRequestId,
  fetchCodexResetCredits,
  formatCodexResetCredits,
  formatCodexResetResult,
  isAmbiguousCodexResetError,
  resolveCodexResetTarget,
} from "../lib/codex-reset.ts";

import { registerSubscriptionResets } from "../lib/reset-command.ts";

const COMMAND = "codex-reset";
const STATUS_KEY = "codex-reset";
const STATE_ENTRY = "pi-little-helpers.codex-reset-state";
const USAGE = "Usage: /codex-reset [status|use]";
interface PendingReset {
  provider: string;
  accountId: string;
  requestId: string;
}

// appendEntry may be memory-only before the first assistant turn. Refuse to POST
// unless the recovery record can actually be read back from the session file.
export function requirePersistedReset(ctx: ExtensionContext, pending: PendingReset): void {
  const path = ctx.sessionManager.getSessionFile();
  let found = false;
  if (path) {
    let fd: number | undefined;
    try {
      fd = openSync(path, "r");
      const size = fstatSync(fd).size;
      const buffer = Buffer.alloc(Math.min(size, 65_536));
      const length = readSync(fd, buffer, 0, buffer.length, size - buffer.length);
      for (const line of buffer.subarray(0, length).toString("utf8").split("\n")) {
        try {
          const entry = JSON.parse(line);
          if (entry.type !== "custom" || entry.customType !== STATE_ENTRY) continue;
          const data = entry.data;
          if (data?.version === 2 && data.provider === pending.provider) {
            found = data.accountId === pending.accountId && data.requestId === pending.requestId;
          }
        } catch {
          /* A bounded tail may begin inside an earlier entry. */
        }
      }
    } catch {
      /* Missing/unreadable persistence is not permission to spend. */
    } finally {
      if (fd !== undefined) closeSync(fd);
    }
  }
  if (!found) {
    throw new CodexResetApiError(
      "Reset recovery state is not saved; no reset request was sent. Use a saved session with at least one completed assistant turn, then retry.",
      false,
    );
  }
}

export interface CodexResetExtensionDependencies {
  resolveTarget: (ctx: ExtensionContext) => Promise<CodexResetTarget>;
  loadAccountConfig: (cwd: string) => LimitsAccountConfig;
  requirePersisted: (ctx: ExtensionContext, pending: PendingReset) => void;
  fetchCredits: (ctx: ExtensionContext, target: CodexResetTarget) => Promise<CodexResetCredits>;
  consumeCredit: (
    ctx: ExtensionContext,
    requestId: string,
    target: CodexResetTarget,
  ) => Promise<CodexResetResult>;
  createRequestId: () => string;
}
const DEFAULT_DEPENDENCIES: CodexResetExtensionDependencies = {
  resolveTarget: resolveCodexResetTarget,
  loadAccountConfig: loadLimitsAccountConfig,
  requirePersisted: requirePersistedReset,
  fetchCredits: (ctx, target) => fetchCodexResetCredits(ctx, undefined, target),
  consumeCredit: (ctx, requestId, target) =>
    consumeCodexResetCredit(ctx, requestId, undefined, target),
  createRequestId: createCodexResetRequestId,
};
function present(ctx: ExtensionContext, message: string, type: "info" | "warning" | "error"): void {
  if (ctx.hasUI) ctx.ui.notify(message, type);
  else console.log(message);
}
function isAbortError(error: unknown): boolean {
  return error instanceof Error && error.name === "AbortError";
}
function accountText(target: CodexResetTarget, label: string): string {
  return `Subscription: ${limitsText(label)} (${target.provider}) · account ${limitsText(target.accountId)}`;
}

export function createCodexResetExtension(
  overrides: Partial<CodexResetExtensionDependencies> = {},
): (pi: ExtensionAPI) => void {
  const dependencies = { ...DEFAULT_DEPENDENCIES, ...overrides };
  let commandRunning = false;
  const pendingByProvider = new Map<string, PendingReset>();
  let legacyUnresolved = false;

  return (pi: ExtensionAPI): void => {
    const savePending = (pending: PendingReset, resolved = false): void => {
      pi.appendEntry(STATE_ENTRY, {
        version: 2,
        ...pending,
        requestId: resolved ? undefined : pending.requestId,
      });
      if (resolved) pendingByProvider.delete(pending.provider);
      else pendingByProvider.set(pending.provider, pending);
    };
    pi.on("session_start", (_event, ctx) => {
      pendingByProvider.clear();
      legacyUnresolved = false;
      // External spending cannot be undone by navigating to an earlier branch.
      for (const entry of ctx.sessionManager.getEntries()) {
        if (entry.type !== "custom" || entry.customType !== STATE_ENTRY) continue;
        const data = entry.data as (Partial<PendingReset> & { version?: number }) | undefined;
        if (data?.version !== 2) {
          legacyUnresolved = typeof data?.requestId === "string";
        } else if (
          typeof data.provider === "string" &&
          isCodexProvider(data.provider) &&
          typeof data.accountId === "string" &&
          data.accountId
        ) {
          if (typeof data.requestId === "string" && data.requestId)
            pendingByProvider.set(data.provider, data as PendingReset);
          else if (data.requestId === undefined) pendingByProvider.delete(data.provider);
          else legacyUnresolved = true;
        } else legacyUnresolved = true;
      }
    });
    const command: Parameters<ExtensionAPI["registerCommand"]>[1] = {
      description: "Inspect or safely spend a banked reset on the active Codex subscription",
      getArgumentCompletions: (prefix) =>
        ["status", "use"]
          .filter((value) => value.startsWith(prefix.trim().toLowerCase()))
          .map((value) => ({ label: value, value })),
      handler: async (args, ctx) => {
        const action = args.trim().toLowerCase() || "use";
        if (action !== "status" && action !== "use") {
          present(ctx, USAGE, "warning");
          return;
        }
        if (commandRunning) {
          present(ctx, "A Codex reset check is already running.", "warning");
          return;
        }
        commandRunning = true;
        let target: CodexResetTarget | undefined;
        if (ctx.hasUI) ctx.ui.setStatus(STATUS_KEY, "checking resets…");
        const checkAllowed = (provider = ctx.model?.provider): string => {
          if (!provider || !isCodexProvider(provider))
            throw new Error("Select an OpenAI Codex subscription model first.");
          if (ctx.model?.provider !== provider)
            throw new Error("Active subscription changed; no reset request was sent.");
          const config = dependencies.loadAccountConfig(ctx.cwd);
          if (config.allowed && !config.allowed.has(provider))
            throw new Error(
              `Subscription ${provider} is excluded by multi-pass allowedSubs; no reset request was sent.`,
            );
          return config.labels.get(provider) ?? provider;
        };
        try {
          const provider = ctx.model?.provider;
          const label = checkAllowed();
          target = await dependencies.resolveTarget(ctx);
          if (target.provider !== provider)
            throw new Error("Active subscription changed; run /codex-reset again.");
          const bound = target;
          bound.assertAllowed = () => {
            checkAllowed(bound.provider);
          };
          bound.assertAllowed();
          const heading = accountText(bound, label);
          const previous = pendingByProvider.get(bound.provider);
          const aliasPending = [...pendingByProvider.values()].find(
            (pending) =>
              pending.provider !== bound.provider && pending.accountId === bound.accountId,
          );
          const mismatch = previous && previous.accountId !== bound.accountId;
          const notice = legacyUnresolved
            ? "\nAn older reset request has no recorded account identity. Spending is blocked; reconcile it on the original account before starting a new reset."
            : aliasPending
              ? `\nThis account has an unresolved reset under ${limitsText(aliasPending.provider)}. Restore that subscription alias and retry its recorded request; no new reset can be started here.`
              : mismatch
                ? "\nAn unresolved reset belongs to a different account previously using this provider. Restore that account before retrying."
                : previous
                  ? "\nA previous reset request for this subscription is unresolved; /codex-reset use will retry the same request ID."
                  : "";
          const credits = await dependencies.fetchCredits(ctx, bound);
          const summary = `${heading}\n${formatCodexResetCredits(credits)}`;
          if (action === "status" || !ctx.hasUI || legacyUnresolved || mismatch || aliasPending) {
            present(ctx, `${summary}${notice}`, notice ? "warning" : "info");
            if (action === "use" && !ctx.hasUI)
              console.log("Run /codex-reset use interactively to confirm spending a credit.");
            return;
          }
          if (credits.availableCount < 1 && !previous) {
            present(ctx, summary, "info");
            return;
          }
          const after = Math.max(0, credits.availableCount - 1);
          const confirmed = await ctx.ui.confirm(
            previous ? "Retry unresolved Codex reset?" : "Use a banked Codex reset?",
            previous
              ? `${summary}\n\nRetry the previous idempotent request on this subscription to learn whether it was applied? This does not intentionally spend a second credit.`
              : `${summary}\n\nSpend one credit to reset this subscription's active Codex rate-limit windows? ${after} credit${after === 1 ? "" : "s"} would remain.`,
          );
          if (!confirmed) {
            present(
              ctx,
              previous
                ? "Retry cancelled. The reset request remains unresolved; the next use will keep the same request ID."
                : "Codex reset cancelled; no credit was spent.",
              previous ? "warning" : "info",
            );
            return;
          }
          bound.assertAllowed();
          ctx.ui.setStatus(STATUS_KEY, "resetting Codex…");
          const pending = previous ?? {
            provider: bound.provider,
            accountId: bound.accountId,
            requestId: dependencies.createRequestId(),
          };
          savePending(pending);
          // Track uncertainty across attempts. A rejected retry cannot disprove an earlier spend.
          let uncertain = Boolean(previous);
          const consume = async (): Promise<CodexResetResult> => {
            bound.assertAllowed?.();
            dependencies.requirePersisted(ctx, pending);
            return dependencies.consumeCredit(ctx, pending.requestId, bound);
          };
          let result: CodexResetResult;
          try {
            try {
              result = await consume();
            } catch (error) {
              uncertain ||= isAmbiguousCodexResetError(error);
              if (isAbortError(error) || !isAmbiguousCodexResetError(error)) throw error;
              const reason = error instanceof Error ? error.message : String(error);
              const retry = await ctx.ui.confirm(
                "Reset result is uncertain",
                `${heading}\n${reason}\n\nRetry the same idempotent request on this subscription? This will not intentionally spend a second credit.`,
              );
              if (!retry) throw error;
              result = await consume();
            }
          } catch (error) {
            if (!uncertain && !isAmbiguousCodexResetError(error)) savePending(pending, true);
            throw error;
          }
          const conclusive = result.outcome !== "unknown";
          if (conclusive) savePending(pending, true);
          let refreshed = "";
          try {
            refreshed = `\n${formatCodexResetCredits(await dependencies.fetchCredits(ctx, bound))}`;
          } catch {
            /* Do not replace the redemption result with a refresh failure. */
          }
          present(
            ctx,
            `${heading}\n${formatCodexResetResult(result)}${refreshed}${conclusive ? "" : "\nThe request remains unresolved; the next /codex-reset use on this subscription will retry the same request ID."}`,
            conclusive ? "info" : "warning",
          );
        } catch (error) {
          const unresolved = target && pendingByProvider.has(target.provider);
          const reason = error instanceof Error ? error.message : String(error);
          if (isAbortError(error))
            present(
              ctx,
              unresolved
                ? "Codex reset cancelled. The request may have reached the server; the next /codex-reset use on this subscription will retry the same request ID."
                : "Codex reset check cancelled.",
              unresolved ? "warning" : "info",
            );
          else
            present(
              ctx,
              `${reason}${unresolved ? " The reset request remains unresolved; restore the original subscription and retry with /codex-reset use." : ""}`,
              "error",
            );
        } finally {
          commandRunning = false;
          if (ctx.hasUI) ctx.ui.setStatus(STATUS_KEY, undefined);
        }
      },
    };
    pi.registerCommand(COMMAND, command);
    registerSubscriptionResets(pi, command.handler, dependencies.loadAccountConfig);
  };
}

export default createCodexResetExtension();

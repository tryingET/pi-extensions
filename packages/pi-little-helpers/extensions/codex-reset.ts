import type { ExtensionAPI, ExtensionContext } from "@earendil-works/pi-coding-agent";
import {
  type CodexResetCredits,
  type CodexResetResult,
  consumeCodexResetCredit,
  createCodexResetRequestId,
  fetchCodexResetCredits,
  formatCodexResetCredits,
  formatCodexResetResult,
  isAmbiguousCodexResetError,
} from "../lib/codex-reset.ts";

const COMMAND = "codex-reset";
const STATUS_KEY = "codex-reset";
const STATE_ENTRY = "pi-little-helpers.codex-reset-state";
const USAGE = "Usage: /codex-reset [status|use]";

export interface CodexResetExtensionDependencies {
  fetchCredits: (ctx: ExtensionContext) => Promise<CodexResetCredits>;
  consumeCredit: (ctx: ExtensionContext, requestId: string) => Promise<CodexResetResult>;
  createRequestId: () => string;
}

const DEFAULT_DEPENDENCIES: CodexResetExtensionDependencies = {
  fetchCredits: fetchCodexResetCredits,
  consumeCredit: consumeCodexResetCredit,
  createRequestId: createCodexResetRequestId,
};

function present(ctx: ExtensionContext, message: string, type: "info" | "warning" | "error"): void {
  if (ctx.hasUI) ctx.ui.notify(message, type);
  else console.log(message);
}

function isAbortError(error: unknown): boolean {
  return error instanceof Error && error.name === "AbortError";
}

function confirmationText(credits: CodexResetCredits): string {
  const after = Math.max(0, credits.availableCount - 1);
  return `${formatCodexResetCredits(credits)}\n\nSpend one credit to reset the active Codex rate-limit windows? ${after} credit${after === 1 ? "" : "s"} would remain.`;
}

async function refreshAfterAttempt(
  ctx: ExtensionContext,
  dependencies: CodexResetExtensionDependencies,
): Promise<string | undefined> {
  try {
    return formatCodexResetCredits(await dependencies.fetchCredits(ctx));
  } catch {
    return undefined;
  }
}

async function consumeWithSafeRetry(
  ctx: ExtensionContext,
  requestId: string,
  dependencies: CodexResetExtensionDependencies,
): Promise<CodexResetResult> {
  try {
    return await dependencies.consumeCredit(ctx, requestId);
  } catch (error) {
    const reason = error instanceof Error ? error.message : String(error);
    if (isAbortError(error) || !ctx.hasUI || !isAmbiguousCodexResetError(error)) throw error;
    const retry = await ctx.ui.confirm(
      "Reset result is uncertain",
      `${reason}\n\nRetry the same idempotent request? This will not intentionally spend a second credit.`,
    );
    if (!retry) {
      throw new Error(`${reason} Check /codex-reset status before trying a new reset.`);
    }
    return dependencies.consumeCredit(ctx, requestId);
  }
}

export function createCodexResetExtension(
  overrides: Partial<CodexResetExtensionDependencies> = {},
): (pi: ExtensionAPI) => void {
  const dependencies = { ...DEFAULT_DEPENDENCIES, ...overrides };
  let commandRunning = false;
  let unresolvedRequestId: string | undefined;

  return (pi: ExtensionAPI): void => {
    const setUnresolvedRequestId = (requestId: string | undefined): void => {
      unresolvedRequestId = requestId;
      pi.appendEntry(STATE_ENTRY, { requestId });
    };

    pi.on("session_start", (_event, ctx) => {
      unresolvedRequestId = undefined;
      for (const entry of ctx.sessionManager.getBranch()) {
        if (entry.type !== "custom" || entry.customType !== STATE_ENTRY) continue;
        const data = entry.data;
        unresolvedRequestId =
          typeof data === "object" && data !== null && "requestId" in data
            ? typeof data.requestId === "string"
              ? data.requestId
              : undefined
            : undefined;
      }
    });

    pi.registerCommand(COMMAND, {
      description: "Inspect or safely spend a banked Codex rate-limit reset",
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
        if (ctx.hasUI) ctx.ui.setStatus(STATUS_KEY, "checking resets…");
        try {
          const credits = await dependencies.fetchCredits(ctx);
          const summary = formatCodexResetCredits(credits);

          if (action === "status" || !ctx.hasUI) {
            present(
              ctx,
              `${summary}${unresolvedRequestId ? "\nA previous reset request is unresolved; /codex-reset use will retry it safely." : ""}`,
              unresolvedRequestId ? "warning" : "info",
            );
            if (action === "use" && !ctx.hasUI) {
              console.log("Run /codex-reset use interactively to confirm spending a credit.");
            }
            return;
          }

          if (credits.availableCount < 1 && !unresolvedRequestId) {
            present(ctx, summary, "info");
            return;
          }

          const retryingUnresolved = Boolean(unresolvedRequestId);
          const confirmed = await ctx.ui.confirm(
            retryingUnresolved ? "Retry unresolved Codex reset?" : "Use a banked Codex reset?",
            retryingUnresolved
              ? `${summary}\n\nRetry the previous idempotent request to learn whether it was applied? This does not intentionally spend a second credit.`
              : confirmationText(credits),
          );
          if (!confirmed) {
            present(
              ctx,
              retryingUnresolved
                ? "Retry cancelled. The reset request remains unresolved; the next use will keep the same request ID."
                : "Codex reset cancelled; no credit was spent.",
              retryingUnresolved ? "warning" : "info",
            );
            return;
          }

          ctx.ui.setStatus(STATUS_KEY, "resetting Codex…");
          const requestId = unresolvedRequestId ?? dependencies.createRequestId();
          setUnresolvedRequestId(requestId);
          let result: CodexResetResult;
          try {
            result = await consumeWithSafeRetry(ctx, requestId, dependencies);
          } catch (error) {
            if (!isAmbiguousCodexResetError(error)) setUnresolvedRequestId(undefined);
            throw error;
          }
          const conclusive = result.outcome !== "unknown";
          if (conclusive) setUnresolvedRequestId(undefined);
          const refreshed = await refreshAfterAttempt(ctx, dependencies);
          const unresolvedNotice = conclusive
            ? ""
            : "\nThe request remains unresolved; the next /codex-reset use will retry the same request ID.";
          const message = `${formatCodexResetResult(result)}${refreshed ? `\n${refreshed}` : ""}${unresolvedNotice}`;
          const type =
            result.outcome === "reset" || result.outcome === "already_redeemed"
              ? "info"
              : result.outcome === "unknown"
                ? "warning"
                : "info";
          present(ctx, message, type);
        } catch (error) {
          const reason = error instanceof Error ? error.message : String(error);
          if (isAbortError(error)) {
            present(
              ctx,
              unresolvedRequestId
                ? "Codex reset cancelled. The request may have reached the server; the next /codex-reset use will retry the same request ID."
                : "Codex reset check cancelled.",
              unresolvedRequestId ? "warning" : "info",
            );
          } else {
            present(
              ctx,
              `${reason}${unresolvedRequestId ? " The reset request remains unresolved; the next /codex-reset use will retry the same request ID." : ""}`,
              "error",
            );
          }
        } finally {
          commandRunning = false;
          if (ctx.hasUI) ctx.ui.setStatus(STATUS_KEY, undefined);
        }
      },
    });
  };
}

export default createCodexResetExtension();

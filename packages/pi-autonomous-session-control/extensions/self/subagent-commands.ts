/**
 * Subagent commands registration.
 */

import type { ExtensionAPI, RegisteredCommand } from "@earendil-works/pi-coding-agent";
import { getContextRepoRoot } from "./session-context.ts";
import {
  formatSharedSubagentCapacityHolders,
  inspectSharedSubagentCapacity,
} from "./subagent-capacity.ts";
import { cancelSubagentDispatch } from "./subagent-control.ts";
import {
  cleanupOldSessions,
  clearSubagentSessions,
  getSubagentStats,
  type SubagentState,
} from "./subagent-session.ts";

const ONE_DAY_MS = 24 * 60 * 60 * 1000;
const DEFAULT_MAX_SESSION_AGE_DAYS = 7;
const DEFAULT_MAX_SESSION_COUNT = 100;

function parseCommandArgs(args: string): string[] {
  return args.trim().split(/\s+/).filter(Boolean);
}

function hasDeleteFlag(tokens: string[]): boolean {
  return tokens.includes("--delete");
}

function notifyPreserved(ctx: Parameters<RegisteredCommand["handler"]>[1], command: string): void {
  if (ctx.hasUI) {
    ctx.ui.notify(
      `${command} preserved subagent sessions. Pass --delete for explicit destructive pruning.`,
      "info",
    );
  }
}

export function registerSubagentCommands(pi: ExtensionAPI, state: SubagentState): void {
  pi.registerCommand("subagent-cancel", {
    description: "Cancel one exact live ASC subagent dispatch id",
    handler: async (args, ctx) => {
      const [dispatchId, ...reasonParts] = parseCommandArgs(args);
      if (!dispatchId) {
        if (ctx.hasUI) ctx.ui.notify("Usage: /subagent-cancel <dispatchId> [reason]", "warning");
        return;
      }
      const result = cancelSubagentDispatch({
        state,
        dispatchId,
        requestedBy: `operator:${ctx.sessionManager.getSessionId()}`,
        reason: reasonParts.join(" "),
        parentRepoRoot: getContextRepoRoot(ctx),
      });
      if (ctx.hasUI) {
        ctx.ui.notify(
          result.ok
            ? `Subagent ${result.dispatchId}: ${result.status}`
            : `Subagent cancellation failed: ${result.error}`,
          result.ok ? "info" : "error",
        );
      }
    },
  });

  pi.registerCommand("subagent-clear", {
    description: "Preserve subagent sessions by default; pass --delete to remove ASC artifacts",
    handler: async (args, ctx) => {
      const tokens = parseCommandArgs(args);
      if (!hasDeleteFlag(tokens)) {
        notifyPreserved(ctx, "subagent-clear");
        return;
      }

      clearSubagentSessions(state);
      if (ctx.hasUI) {
        ctx.ui.notify("Subagent sessions deleted after explicit --delete", "info");
      }
    },
  });

  pi.registerCommand("subagent-status", {
    description: "Show subagent statistics and shared-capacity holders",
    handler: async (_args, ctx) => {
      const stats = getSubagentStats(state);
      const capacityHolders = inspectSharedSubagentCapacity(state.sessionsDir, state.maxConcurrent);
      const oldestAge = stats.oldestSessionAge
        ? `${Math.round(stats.oldestSessionAge / ONE_DAY_MS)}d old`
        : "none";

      if (ctx.hasUI) {
        const statusSummary = [
          `running=${stats.statusCounts.running}`,
          `done=${stats.statusCounts.done}`,
          `error=${stats.statusCounts.error}`,
          `timeout=${stats.statusCounts.timeout}`,
          `aborted=${stats.statusCounts.aborted}`,
          `abandoned=${stats.statusCounts.abandoned}`,
        ].join(", ");
        ctx.ui.notify(
          `Subagents: ${stats.active}/${stats.maxConcurrent} process-local active, shared holders=${capacityHolders.length}/${stats.maxConcurrent}, ${stats.completed} completed, ${stats.sessionFiles} sessions (${oldestAge}); ${statusSummary}${capacityHolders.length > 0 ? `; ${formatSharedSubagentCapacityHolders(capacityHolders)}` : ""}`,
          "info",
        );
      }
    },
  });

  pi.registerCommand("subagent-cleanup", {
    description:
      "Preserve subagent sessions by default; pass --delete [maxAgeDays] [maxCount] to prune",
    handler: async (args, ctx) => {
      const tokens = parseCommandArgs(args);
      if (!hasDeleteFlag(tokens)) {
        notifyPreserved(ctx, "subagent-cleanup");
        return;
      }

      const parsed = tokens.filter((token) => token !== "--delete");
      const maxAgeDays =
        parsed[0] !== undefined && /^\d+$/.test(parsed[0])
          ? parseInt(parsed[0], 10)
          : DEFAULT_MAX_SESSION_AGE_DAYS;
      const maxCount =
        parsed[1] !== undefined && /^\d+$/.test(parsed[1])
          ? parseInt(parsed[1], 10)
          : DEFAULT_MAX_SESSION_COUNT;

      const result = cleanupOldSessions(state, {
        maxAgeMs: maxAgeDays * ONE_DAY_MS,
        maxCount,
      });

      if (ctx.hasUI) {
        ctx.ui.notify(
          `Deleted ${result.removedSessions} sessions (${result.removedFiles} files), ${result.kept} remaining after explicit --delete`,
          "info",
        );
      }
    },
  });
}

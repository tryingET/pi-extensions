/**
 * Subagent commands registration.
 */

import type { ExtensionAPI } from "@mariozechner/pi-coding-agent";
import {
  cleanupOldSessions,
  clearSubagentSessions,
  getSubagentStats,
  type SubagentState,
} from "./subagent-session.ts";

const ONE_DAY_MS = 24 * 60 * 60 * 1000;
const DEFAULT_MAX_SESSION_AGE_DAYS = 7;
const DEFAULT_MAX_SESSION_COUNT = 100;

export function registerSubagentCommands(pi: ExtensionAPI, state: SubagentState): void {
  pi.registerCommand("subagent-clear", {
    description: "Clear all subagent session files (start fresh)",
    handler: async (_args, ctx) => {
      clearSubagentSessions(state);
      if (ctx.hasUI) {
        ctx.ui.notify("Subagent sessions cleared", "info");
      }
    },
  });

  pi.registerCommand("subagent-status", {
    description: "Show subagent statistics",
    handler: async (_args, ctx) => {
      const stats = getSubagentStats(state);
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
          `Subagents: ${stats.active}/${stats.maxConcurrent} active, ${stats.completed} completed, ${stats.sessionFiles} sessions (${oldestAge}); ${statusSummary}`,
          "info",
        );
      }
    },
  });

  pi.registerCommand("subagent-cleanup", {
    description: "Remove old subagent session files (default: older than 7 days or excess of 100)",
    handler: async (args, ctx) => {
      const parsed = args.trim().split(/\s+/).filter(Boolean);
      const maxAgeDays =
        parsed[0] && /^\d+$/.test(parsed[0])
          ? parseInt(parsed[0], 10)
          : DEFAULT_MAX_SESSION_AGE_DAYS;
      const maxCount =
        parsed[1] && /^\d+$/.test(parsed[1]) ? parseInt(parsed[1], 10) : DEFAULT_MAX_SESSION_COUNT;

      const result = cleanupOldSessions(state, {
        maxAgeMs: maxAgeDays * ONE_DAY_MS,
        maxCount,
      });

      if (ctx.hasUI) {
        ctx.ui.notify(
          `Cleaned ${result.removedSessions} sessions (${result.removedFiles} files), ${result.kept} remaining`,
          "info",
        );
      }
    },
  });
}

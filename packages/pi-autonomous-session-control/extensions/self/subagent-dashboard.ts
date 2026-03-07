import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import type {
  ExtensionAPI,
  ExtensionContext,
  Theme,
  ThemeColor,
} from "@mariozechner/pi-coding-agent";
import type { Component } from "@mariozechner/pi-tui";
import { createSubagentDashboardSnapshot } from "./subagent-dashboard-data.ts";
import type { SubagentState } from "./subagent-session.ts";

const DASHBOARD_WIDGET_KEY = "subagent-ops-dashboard";
const DASHBOARD_REFRESH_MS = 2_000;
const DASHBOARD_ROW_LIMIT = 4;

type DashboardTheme = Pick<Theme, "fg">;

function truncate(text: string, maxLength: number): string {
  if (text.length <= maxLength) return text;
  if (maxLength <= 1) return "…";
  return `${text.slice(0, maxLength - 1)}…`;
}

function renderStatus(status: string): { icon: string; color: ThemeColor } {
  switch (status) {
    case "running":
      return { icon: "●", color: "accent" };
    case "done":
      return { icon: "✓", color: "success" };
    case "error":
      return { icon: "✗", color: "error" };
    case "timeout":
      return { icon: "◷", color: "warning" };
    case "abandoned":
      return { icon: "◌", color: "warning" };
    default:
      return { icon: "?", color: "dim" };
  }
}

function buildDashboardLines(width: number, theme: DashboardTheme, sessionsDir: string): string[] {
  const snapshot = createSubagentDashboardSnapshot(sessionsDir, {
    limit: DASHBOARD_ROW_LIMIT,
  });

  const header = [
    theme.fg("accent", "Subagent ops"),
    theme.fg("dim", ` total=${snapshot.total}`),
    theme.fg("dim", ` running=${snapshot.counts.running}`),
    theme.fg("dim", ` done=${snapshot.counts.done}`),
    theme.fg("dim", ` error=${snapshot.counts.error}`),
    theme.fg("dim", ` timeout=${snapshot.counts.timeout}`),
    theme.fg("dim", ` abandoned=${snapshot.counts.abandoned}`),
  ].join("");

  if (snapshot.rows.length === 0) {
    return [header, theme.fg("dim", "  No subagent sessions yet.")];
  }

  const lines = [header];
  const availableWidth = Math.max(24, width - 18);

  for (const row of snapshot.rows) {
    const { icon, color } = renderStatus(row.status);
    const lead = `${icon} ${row.sessionName}`;
    const status = theme.fg(color, lead);
    const age = theme.fg("dim", ` · ${row.ageLabel}`);
    lines.push(`${status}${age}`);
    lines.push(`  ${theme.fg("muted", truncate(row.objectivePreview, availableWidth))}`);
    lines.push(`  ${theme.fg("dim", truncate(row.recommendedActionHint, availableWidth))}`);
  }

  return lines;
}

function sessionArtifactSummary(sessionsDir: string, sessionName: string): string {
  const statusPath = join(sessionsDir, `${sessionName}.status.json`);
  const sessionPath = join(sessionsDir, `${sessionName}.json`);
  const sections: string[] = [`# Subagent Session: ${sessionName}`, ""];

  if (existsSync(statusPath)) {
    sections.push("## Status sidecar");
    sections.push("```json");
    sections.push(readFileSync(statusPath, "utf-8").trim() || "{}");
    sections.push("```");
    sections.push("");
  } else {
    sections.push(`- Missing status sidecar: ${statusPath}`);
    sections.push("");
  }

  if (existsSync(sessionPath)) {
    sections.push("## Session file");
    sections.push(`- Path: ${sessionPath}`);
    sections.push(`- Bytes: ${readFileSync(sessionPath, "utf-8").length}`);
    sections.push("");
  } else {
    sections.push(`- Missing session file: ${sessionPath}`);
    sections.push("");
  }

  return sections.join("\n");
}

export function registerSubagentDashboard(pi: ExtensionAPI, state: SubagentState): void {
  let refreshTimer: ReturnType<typeof setInterval> | null = null;

  const stopRefresh = () => {
    if (refreshTimer) {
      clearInterval(refreshTimer);
      refreshTimer = null;
    }
  };

  const startRefresh = (ctx: ExtensionContext) => {
    stopRefresh();
    if (!ctx.hasUI) return;

    const refresh = () => {
      ctx.ui.setWidget(
        DASHBOARD_WIDGET_KEY,
        (tui: unknown, theme: DashboardTheme): Component => ({
          render: (width: number) => buildDashboardLines(width, theme, state.sessionsDir),
          invalidate: () => {
            void tui;
          },
        }),
      );
    };

    refresh();
    refreshTimer = setInterval(refresh, DASHBOARD_REFRESH_MS);
    refreshTimer.unref?.();
  };

  pi.on("session_start", (_event, ctx) => {
    startRefresh(ctx);
  });

  pi.registerCommand("subagent-dashboard", {
    description: "Open a read-only summary of recent subagent sessions",
    handler: async (_args, ctx) => {
      const snapshot = createSubagentDashboardSnapshot(state.sessionsDir, { limit: 25 });
      const lines = [
        "# Subagent Operations Dashboard",
        "",
        `- Sessions dir: ${state.sessionsDir}`,
        `- Total sessions: ${snapshot.total}`,
        `- Running: ${snapshot.counts.running}`,
        `- Done: ${snapshot.counts.done}`,
        `- Error: ${snapshot.counts.error}`,
        `- Timeout: ${snapshot.counts.timeout}`,
        `- Abandoned: ${snapshot.counts.abandoned}`,
        "",
        "## Recent sessions",
        "",
      ];

      if (snapshot.rows.length === 0) {
        lines.push("No subagent sessions recorded yet.");
      } else {
        for (const row of snapshot.rows) {
          lines.push(`### ${row.sessionName}`);
          lines.push(`- Status: ${row.status}`);
          lines.push(`- Updated: ${row.updatedAt} (${row.ageLabel})`);
          lines.push(`- Objective: ${row.objectivePreview}`);
          lines.push(`- Recommended action: ${row.recommendedActionHint}`);
          lines.push("");
        }
      }

      if (ctx.hasUI) {
        await ctx.ui.editor("Subagent Operations Dashboard", lines.join("\n"));
      }
    },
  });

  pi.registerCommand("subagent-inspect", {
    description: "Open raw artifacts for a specific subagent session",
    handler: async (args, ctx) => {
      const sessionName = args.trim();
      if (!sessionName) {
        if (ctx.hasUI) {
          ctx.ui.notify("Usage: /subagent-inspect <session-name>", "warning");
        }
        return;
      }

      if (ctx.hasUI) {
        await ctx.ui.editor(
          `Subagent Session ${sessionName}`,
          sessionArtifactSummary(state.sessionsDir, sessionName),
        );
      }
    },
  });
}

import type {
  ExtensionAPI,
  ExtensionContext,
  Theme,
  ThemeColor,
} from "@mariozechner/pi-coding-agent";
import type { Component } from "@mariozechner/pi-tui";
import { getContextSessionKey } from "./session-context.ts";
import {
  createSubagentDashboardSnapshot,
  createSubagentSessionInspection,
} from "./subagent-dashboard-data.ts";
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
    case "aborted":
      return { icon: "⊘", color: "warning" };
    case "abandoned":
      return { icon: "◌", color: "warning" };
    default:
      return { icon: "?", color: "dim" };
  }
}

function buildDashboardLines(
  width: number,
  theme: DashboardTheme,
  sessionsDir: string,
  currentSessionKey?: string,
): string[] {
  const snapshot = createSubagentDashboardSnapshot(sessionsDir, {
    limit: DASHBOARD_ROW_LIMIT,
    currentSessionKey,
  });

  const header = [
    theme.fg("accent", "Subagent ops"),
    currentSessionKey ? theme.fg("dim", ` live=${truncate(currentSessionKey, 18)}`) : "",
    theme.fg("dim", ` total=${snapshot.total}`),
    theme.fg("dim", ` running=${snapshot.counts.running}`),
    theme.fg("dim", ` done=${snapshot.counts.done}`),
    theme.fg("dim", ` error=${snapshot.counts.error}`),
    theme.fg("dim", ` timeout=${snapshot.counts.timeout}`),
    theme.fg("dim", ` aborted=${snapshot.counts.aborted}`),
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
    const scope = row.sessionScopeBadge ? theme.fg("dim", ` · ${row.sessionScopeBadge}`) : "";
    lines.push(`${status}${age}${scope}`);
    lines.push(`  ${theme.fg("muted", truncate(row.objectivePreview, availableWidth))}`);
    lines.push(`  ${theme.fg("dim", truncate(row.recommendedActionHint, availableWidth))}`);
  }

  return lines;
}

function sessionArtifactSummary(
  sessionsDir: string,
  sessionName: string,
  currentSessionKey?: string,
): string {
  const inspection = createSubagentSessionInspection(sessionsDir, sessionName, {
    currentSessionKey,
  });
  const sections: string[] = [`# Subagent Session: ${sessionName}`, ""];

  if (!inspection.found) {
    sections.push("No matching session artifacts were found.");
    sections.push("");
    sections.push("## Lookup");
    sections.push(`- Sessions dir: ${sessionsDir}`);
    sections.push(`- Expected status sidecar: ${inspection.statusArtifact.path}`);
    sections.push(`- Expected session file: ${inspection.sessionArtifact.path}`);
    sections.push("");

    if (inspection.recentSessionSuggestions.length > 0) {
      sections.push("## Recent sessions");
      for (const suggestion of inspection.recentSessionSuggestions) {
        sections.push(`- ${suggestion}`);
      }
      sections.push("");
    }

    sections.push("Try an exact session name from `/subagent-dashboard` before retrying.");
    return sections.join("\n");
  }

  sections.push("## History boundary");
  sections.push(`- ${inspection.historyBoundaryNote}`);
  sections.push(`- Current live session: ${inspection.currentSessionKey ?? "(unavailable)"}`);
  sections.push("");

  sections.push("## Summary");
  sections.push(`- Status: ${inspection.status ?? "unknown"}`);
  sections.push(`- Session scope: ${inspection.sessionScopeLabel}`);
  if (inspection.parentSessionKey) {
    sections.push(`- Recorded under live session: ${inspection.parentSessionKey}`);
  }
  if (inspection.updatedAt) {
    sections.push(
      `- Updated: ${inspection.updatedAt}${inspection.ageLabel ? ` (${inspection.ageLabel})` : ""}`,
    );
  }
  if (inspection.createdAt) {
    sections.push(`- Created: ${inspection.createdAt}`);
  }
  if (inspection.objective) {
    sections.push(`- Objective: ${inspection.objective}`);
  }
  if (inspection.resultPreview) {
    sections.push(`- Result preview: ${inspection.resultPreview}`);
  }
  sections.push(`- Recommended action: ${inspection.recommendedActionHint}`);
  if (typeof inspection.pid === "number") {
    const pidDetails =
      inspection.pidState === "alive" || inspection.pidState === "dead"
        ? ` (pid state: ${inspection.pidState})`
        : inspection.pidState === "not-applicable"
          ? " (pid state: not applicable)"
          : "";
    sections.push(`- PID: ${inspection.pid}${pidDetails}`);
  }
  if (typeof inspection.ppid === "number") {
    sections.push(`- Parent PID: ${inspection.ppid}`);
  }
  if (inspection.elapsedLabel) {
    sections.push(`- Elapsed: ${inspection.elapsedLabel}`);
  }
  if (typeof inspection.exitCode === "number") {
    sections.push(`- Exit code: ${inspection.exitCode}`);
  }
  sections.push("");

  sections.push("## Artifact paths");
  sections.push(
    `- Status sidecar: ${inspection.statusArtifact.path}${inspection.statusArtifact.exists ? "" : " (missing)"}`,
  );
  sections.push(
    `- Session file: ${inspection.sessionArtifact.path}${inspection.sessionArtifact.exists ? "" : " (missing)"}`,
  );
  if (typeof inspection.sessionArtifact.bytes === "number") {
    sections.push(`- Session bytes: ${inspection.sessionArtifact.bytes}`);
  }
  if (inspection.sessionArtifact.modifiedAt) {
    sections.push(`- Session modified: ${inspection.sessionArtifact.modifiedAt}`);
  }
  sections.push("");

  if (inspection.warnings.length > 0) {
    sections.push("## Safety notes");
    for (const warning of inspection.warnings) {
      sections.push(`- ${warning}`);
    }
    sections.push("");
  }

  if (inspection.rawStatusJson) {
    sections.push("## Raw status sidecar");
    sections.push("```json");
    sections.push(inspection.rawStatusJson || "{}");
    sections.push("```");
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
      const currentSessionKey = getContextSessionKey(ctx);
      ctx.ui.setWidget(
        DASHBOARD_WIDGET_KEY,
        (tui: unknown, theme: DashboardTheme): Component => ({
          render: (width: number) =>
            buildDashboardLines(width, theme, state.sessionsDir, currentSessionKey),
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
      const currentSessionKey = getContextSessionKey(ctx);
      const snapshot = createSubagentDashboardSnapshot(state.sessionsDir, {
        limit: 25,
        currentSessionKey,
      });
      const lines = [
        "# Subagent Operations Dashboard",
        "",
        `- Sessions dir: ${state.sessionsDir}`,
        `- Current live session: ${currentSessionKey ?? "(unavailable)"}`,
        `- Total sessions: ${snapshot.total}`,
        `- Running: ${snapshot.counts.running}`,
        `- Done: ${snapshot.counts.done}`,
        `- Error: ${snapshot.counts.error}`,
        `- Timeout: ${snapshot.counts.timeout}`,
        `- Aborted: ${snapshot.counts.aborted}`,
        `- Abandoned: ${snapshot.counts.abandoned}`,
        "",
        "## History boundary",
        "",
        "- This dashboard summarizes bounded local subagent history only.",
        "- Use Pi's native session tree for the live session authority.",
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
          lines.push(`- Session scope: ${row.sessionScopeLabel}`);
          lines.push(`- Objective: ${row.objectivePreview}`);
          if (row.resultPreview) {
            lines.push(`- Result preview: ${row.resultPreview}`);
          }
          lines.push(`- Recommended action: ${row.recommendedActionHint}`);
          lines.push(`- Inspect: /subagent-inspect ${row.sessionName}`);
          lines.push("");
        }
      }

      if (ctx.hasUI) {
        await ctx.ui.editor("Subagent Operations Dashboard", lines.join("\n"));
      }
    },
  });

  pi.registerCommand("subagent-inspect", {
    description: "Open a derived inspection summary for a specific subagent session",
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
          sessionArtifactSummary(state.sessionsDir, sessionName, getContextSessionKey(ctx)),
        );
      }
    },
  });
}

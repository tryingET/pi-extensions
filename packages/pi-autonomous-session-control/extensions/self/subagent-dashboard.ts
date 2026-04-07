import type {
  ExtensionAPI,
  ExtensionContext,
  Theme,
  ThemeColor,
} from "@mariozechner/pi-coding-agent";
import { type Component, truncateToWidth, visibleWidth } from "@mariozechner/pi-tui";
import { getContextRepoRoot, getContextSessionKey } from "./session-context.ts";
import {
  createSubagentDashboardSnapshot,
  createSubagentSessionInspection,
  type SubagentDashboardSnapshot,
} from "./subagent-dashboard-data.ts";
import type { SubagentState } from "./subagent-session.ts";

const DASHBOARD_WIDGET_KEY = "subagent-ops-dashboard";
const DASHBOARD_REFRESH_MS = 2_000;
const DASHBOARD_HIDE_GRACE_MS = 10_000;
const DASHBOARD_ROW_LIMIT = 4;
const DASHBOARD_WIDGET_MAX_AGE_MS = 60 * 60 * 1000;

type DashboardTheme = Pick<Theme, "fg">;
type RenderRequester = { requestRender(): void };

function truncate(text: string, maxLength: number): string {
  if (text.length <= maxLength) return text;
  if (maxLength <= 1) return "…";
  return `${text.slice(0, maxLength - 1)}…`;
}

function fitLine(line: string, width: number): string {
  if (!Number.isFinite(width) || width <= 0) return "";
  return visibleWidth(line) > width ? truncateToWidth(line, width, "…") : line;
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

function createWidgetSnapshot(
  sessionsDir: string,
  currentSessionKey?: string,
  currentRepoRoot?: string,
) {
  return createSubagentDashboardSnapshot(sessionsDir, {
    limit: DASHBOARD_ROW_LIMIT,
    currentSessionKey,
    currentRepoRoot,
    sessionScope: "current",
    maxAgeMs: DASHBOARD_WIDGET_MAX_AGE_MS,
  });
}

function createEmptyDashboardSnapshot(): SubagentDashboardSnapshot {
  return {
    rows: [],
    total: 0,
    counts: {
      running: 0,
      done: 0,
      error: 0,
      timeout: 0,
      aborted: 0,
      abandoned: 0,
    },
  };
}

function normalizeSessionKey(value: string | undefined): string | undefined {
  const normalized = value?.trim();
  return normalized ? normalized : undefined;
}

function buildDashboardLinesFromSnapshot(
  width: number,
  theme: DashboardTheme,
  snapshot: SubagentDashboardSnapshot,
  currentSessionKey?: string,
): string[] {
  const normalizedSessionKey = normalizeSessionKey(currentSessionKey);
  if (
    !Number.isFinite(width) ||
    width <= 0 ||
    !normalizedSessionKey ||
    snapshot.rows.length === 0
  ) {
    return [];
  }

  const header = fitLine(
    [
      theme.fg("accent", "Subagent ops"),
      theme.fg("dim", ` live=${truncate(normalizedSessionKey, 18)}`),
      theme.fg("dim", ` total=${snapshot.total}`),
      theme.fg("dim", ` running=${snapshot.counts.running}`),
      theme.fg("dim", ` done=${snapshot.counts.done}`),
      theme.fg("dim", ` error=${snapshot.counts.error}`),
      theme.fg("dim", ` timeout=${snapshot.counts.timeout}`),
      theme.fg("dim", ` aborted=${snapshot.counts.aborted}`),
      theme.fg("dim", ` abandoned=${snapshot.counts.abandoned}`),
    ].join(""),
    width,
  );

  const lines = [header];

  for (const row of snapshot.rows) {
    const { icon, color } = renderStatus(row.status);
    const lead = `${icon} ${row.sessionName}`;
    const status = theme.fg(color, lead);
    const age = theme.fg("dim", ` · ${row.ageLabel}`);
    const scope = row.sessionScopeBadge ? theme.fg("dim", ` · ${row.sessionScopeBadge}`) : "";
    lines.push(fitLine(`${status}${age}${scope}`, width));
    lines.push(fitLine(`  ${theme.fg("muted", row.objectivePreview)}`, width));
    lines.push(fitLine(`  ${theme.fg("dim", row.recommendedActionHint)}`, width));
  }

  return lines;
}

export function buildDashboardLines(
  width: number,
  theme: DashboardTheme,
  sessionsDir: string,
  currentSessionKey?: string,
  currentRepoRoot?: string,
): string[] {
  return buildDashboardLinesFromSnapshot(
    width,
    theme,
    createWidgetSnapshot(sessionsDir, currentSessionKey, currentRepoRoot),
    currentSessionKey,
  );
}

function sessionArtifactSummary(
  sessionsDir: string,
  sessionName: string,
  currentSessionKey?: string,
  currentRepoRoot?: string,
): string {
  const inspection = createSubagentSessionInspection(sessionsDir, sessionName, {
    currentSessionKey,
    currentRepoRoot,
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
  sections.push(`- Current repo root: ${inspection.currentRepoRoot ?? "(unavailable)"}`);
  sections.push("");

  sections.push("## Summary");
  sections.push(`- Status: ${inspection.status ?? "unknown"}`);
  sections.push(`- Session scope: ${inspection.sessionScopeLabel}`);
  if (inspection.parentSessionKey) {
    sections.push(`- Recorded under live session: ${inspection.parentSessionKey}`);
  }
  if (inspection.parentRepoRoot) {
    sections.push(`- Recorded under repo root: ${inspection.parentRepoRoot}`);
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
  let mountedTui: RenderRequester | null = null;
  let visibleSnapshot = createEmptyDashboardSnapshot();
  let visibleSessionKey: string | undefined;
  let visibleRepoRoot: string | undefined;
  let lastVisibleAt: number | undefined;

  const stopRefresh = () => {
    if (refreshTimer) {
      clearInterval(refreshTimer);
      refreshTimer = null;
    }
  };

  const clearVisibleSnapshot = (currentSessionKey?: string, currentRepoRoot?: string) => {
    visibleSnapshot = createEmptyDashboardSnapshot();
    visibleSessionKey = normalizeSessionKey(currentSessionKey);
    visibleRepoRoot = normalizeSessionKey(currentRepoRoot);
    lastVisibleAt = undefined;
  };

  const refreshVisibleSnapshot = (ctx: ExtensionContext) => {
    const now = Date.now();
    const currentSessionKey = normalizeSessionKey(getContextSessionKey(ctx));
    const currentRepoRoot = normalizeSessionKey(getContextRepoRoot(ctx));
    const snapshot = createWidgetSnapshot(state.sessionsDir, currentSessionKey, currentRepoRoot);

    if (snapshot.rows.length > 0 && currentSessionKey) {
      visibleSnapshot = snapshot;
      visibleSessionKey = currentSessionKey;
      visibleRepoRoot = currentRepoRoot;
      lastVisibleAt = now;
      return;
    }

    const sessionChanged =
      currentSessionKey !== undefined &&
      visibleSessionKey !== undefined &&
      currentSessionKey !== visibleSessionKey;
    const repoChanged =
      currentRepoRoot !== undefined &&
      visibleRepoRoot !== undefined &&
      currentRepoRoot !== visibleRepoRoot;
    const withinHideGrace =
      visibleSnapshot.rows.length > 0 &&
      typeof lastVisibleAt === "number" &&
      now - lastVisibleAt < DASHBOARD_HIDE_GRACE_MS;

    if (!sessionChanged && !repoChanged && withinHideGrace) {
      return;
    }

    clearVisibleSnapshot(currentSessionKey, currentRepoRoot);
  };

  const startRefresh = (ctx: ExtensionContext) => {
    stopRefresh();
    mountedTui = null;
    clearVisibleSnapshot();
    if (!ctx.hasUI) return;

    ctx.ui.setWidget(
      DASHBOARD_WIDGET_KEY,
      (tui: unknown, theme: DashboardTheme): Component & { dispose(): void } => {
        mountedTui = tui as RenderRequester;
        return {
          render: (width: number) =>
            buildDashboardLinesFromSnapshot(width, theme, visibleSnapshot, visibleSessionKey),
          invalidate: () => {},
          dispose: () => {
            if (mountedTui === tui) {
              mountedTui = null;
            }
          },
        };
      },
    );

    const refresh = () => {
      refreshVisibleSnapshot(ctx);
      mountedTui?.requestRender();
    };

    refresh();
    refreshTimer = setInterval(refresh, DASHBOARD_REFRESH_MS);
    refreshTimer.unref?.();
  };

  pi.on("session_start", (_event, ctx) => {
    startRefresh(ctx);
  });

  pi.on("session_shutdown", async (_event, ctx) => {
    stopRefresh();
    mountedTui = null;
    clearVisibleSnapshot();
    if (ctx.hasUI) {
      ctx.ui.setWidget(DASHBOARD_WIDGET_KEY, undefined);
    }
  });

  pi.registerCommand("subagent-dashboard", {
    description: "Open a read-only summary of recent subagent sessions",
    handler: async (_args, ctx) => {
      const currentSessionKey = getContextSessionKey(ctx);
      const currentRepoRoot = getContextRepoRoot(ctx);
      const snapshot = createSubagentDashboardSnapshot(state.sessionsDir, {
        limit: 25,
        currentSessionKey,
        currentRepoRoot,
      });
      const lines = [
        "# Subagent Operations Dashboard",
        "",
        `- Sessions dir: ${state.sessionsDir}`,
        `- Current live session: ${currentSessionKey ?? "(unavailable)"}`,
        `- Current repo root: ${currentRepoRoot ?? "(unavailable)"}`,
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
          sessionArtifactSummary(
            state.sessionsDir,
            sessionName,
            getContextSessionKey(ctx),
            getContextRepoRoot(ctx),
          ),
        );
      }
    },
  });
}

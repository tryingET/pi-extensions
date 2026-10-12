import type { ExtensionAPI, ExtensionContext, Theme } from "@earendil-works/pi-coding-agent";
import { type Component, type KeyId, truncateToWidth } from "@earendil-works/pi-tui";
import { getContextRepoRoot, getContextSessionKey } from "./session-context.ts";
import { readSubagentCockpit } from "./subagent-cockpit-data.ts";
import { COCKPIT_FILTERS, cockpitText } from "./subagent-cockpit-ui-control.ts";
import { routeSubagentCommand } from "./subagent-commands.ts";
import {
  createSubagentDashboardSnapshot,
  formatAgeLabel,
  type SubagentDashboardRow,
  type SubagentDashboardSnapshot,
} from "./subagent-dashboard-data.ts";
import type { SubagentState } from "./subagent-session.ts";

const DASHBOARD_WIDGET_KEY = "subagent-ops-dashboard";
type DashboardTheme = Pick<Theme, "fg">;
const WIDGET_RUNNING_LIMIT = 4;
interface DashboardWidgetRow extends SubagentDashboardRow {
  elapsedLabel?: string;
  latestTool?: string;
  activityLabel?: string;
  quiet?: boolean;
}
type DashboardWidgetSnapshot = Omit<SubagentDashboardSnapshot, "rows"> & {
  rows: DashboardWidgetRow[];
};

function elapsedLabel(ms: number): string {
  const seconds = Math.floor(ms / 1000);
  if (seconds < 60) return `${seconds}s`;
  if (seconds < 3600) return `${Math.floor(seconds / 60)}m ${seconds % 60}s`;
  return `${Math.floor(seconds / 3600)}h ${Math.floor((seconds % 3600) / 60)}m`;
}

export function createWidgetSnapshot(
  sessionsDir: string,
  currentSessionKey?: string,
  currentRepoRoot?: string,
  now = Date.now(),
): DashboardWidgetSnapshot {
  const snapshot = createSubagentDashboardSnapshot(sessionsDir, {
    limit: Number.MAX_SAFE_INTEGER,
    currentSessionKey,
    currentRepoRoot,
    now,
    sessionScope: "current",
    // Runtime-owned running children do not expire because their sidecar is quiet.
  });
  const rows = snapshot.rows
    .filter((row) => row.status === "running")
    .slice(0, WIDGET_RUNNING_LIMIT)
    .map((row): DashboardWidgetRow => {
      try {
        const telemetry = readSubagentCockpit(sessionsDir, row.sessionName, {
          currentSessionKey,
          currentRepoRoot,
        });
        // Copy only approved observer metadata from cockpit, not conversation, IDs or objectives.
        const activityAt = telemetry.lastActivityAt;
        const activityAge =
          typeof activityAt === "number" &&
          Number.isFinite(activityAt) &&
          activityAt > 0 &&
          activityAt <= now
            ? now - activityAt
            : undefined;
        return {
          ...row,
          elapsedLabel:
            typeof telemetry.elapsedMs === "number" &&
            Number.isFinite(telemetry.elapsedMs) &&
            telemetry.elapsedMs >= 0
              ? elapsedLabel(telemetry.elapsedMs)
              : undefined,
          latestTool: telemetry.latestTool
            ? cockpitText(telemetry.latestTool, 80).replace(/\s+/g, " ").trim()
            : undefined,
          activityLabel: activityAge === undefined ? undefined : formatAgeLabel(activityAge),
          quiet: activityAge === undefined ? undefined : activityAge >= 60_000,
        };
      } catch {
        return row;
      } // Legacy/unavailable readers do not imply quiet or stopped children.
    });
  return { ...snapshot, rows };
}

export function buildDashboardLinesFromSnapshot(
  width: number,
  theme: DashboardTheme,
  snapshot: DashboardWidgetSnapshot,
  currentSessionKey?: string,
): string[] {
  if (!Number.isFinite(width) || width <= 0 || !currentSessionKey?.trim() || !snapshot.total)
    return [];
  const fit = (line: string) => truncateToWidth(line, width, "…");
  const counts = COCKPIT_FILTERS.filter((status) => status !== "all")
    .filter((status) => status !== "running" || snapshot.counts.running > 0)
    .map((status) => `${status}=${snapshot.counts[status]}`)
    .join(" ");
  const lines = [
    fit(
      `${theme.fg("accent", "Subagents")}${snapshot.counts.running ? "" : theme.fg("muted", " · /subagents")} ${theme.fg("dim", counts)}`,
    ),
  ];
  if (!snapshot.counts.running) return lines;
  const running = snapshot.rows
    .filter((row) => row.status === "running")
    .slice(0, WIDGET_RUNNING_LIMIT);
  for (const row of running) {
    const metadata = [
      row.elapsedLabel ? `elapsed ${row.elapsedLabel}` : undefined,
      row.latestTool,
      row.activityLabel
        ? `${row.quiet ? "quiet" : "activity"} ${row.activityLabel}`
        : `updated ${row.ageLabel} · activity unavailable`,
    ]
      .filter(Boolean)
      .join(" · ");
    lines.push(
      fit(
        `${theme.fg("accent", "●")} ${cockpitText(row.sessionName, 160).replace(/\s+/g, " ")} ${theme.fg("dim", `· ${metadata}`)}`,
      ),
    );
  }
  const overflow = snapshot.counts.running - running.length;
  if (overflow > 0) lines.push(fit(theme.fg("dim", `+${overflow} more running · /subagents`)));
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

// Restrict configuration to non-default chords; never hijack Ctrl+O/S or editor input.
// Pi also diagnoses conflicts with registered app/extension shortcuts at load time.
export function cockpitShortcut(value = process.env.PI_ASC_COCKPIT_SHORTCUT): KeyId | undefined {
  if (value === "off") return undefined;
  if (value && !/^ctrl\+alt\+shift\+[a-z]$/.test(value)) return undefined;
  return (value ?? "ctrl+alt+shift+s") as KeyId;
}

export function registerSubagentDashboard(pi: ExtensionAPI, state: SubagentState): void {
  let widgetCleanup: (() => void) | undefined;

  const start = (ctx: ExtensionContext) => {
    widgetCleanup?.();
    if (ctx.mode !== "tui" || !ctx.hasUI) return;
    let snapshot = createWidgetSnapshot(
      state.sessionsDir,
      getContextSessionKey(ctx),
      getContextRepoRoot(ctx),
    );
    let sessionKey = getContextSessionKey(ctx);
    let disposed = false;
    let timer: ReturnType<typeof setInterval> | undefined;
    const cleanup = () => {
      disposed = true;
      if (timer) clearInterval(timer);
      timer = undefined;
    };
    widgetCleanup = cleanup;
    ctx.ui.setWidget(DASHBOARD_WIDGET_KEY, (tui, theme): Component & { dispose(): void } => {
      const refresh = () => {
        if (disposed) return;
        sessionKey = getContextSessionKey(ctx);
        snapshot = createWidgetSnapshot(state.sessionsDir, sessionKey, getContextRepoRoot(ctx));
        tui.requestRender();
      };
      if (!disposed) {
        timer = setInterval(refresh, 2000);
        timer.unref?.();
      }
      return {
        render: (width) => buildDashboardLinesFromSnapshot(width, theme, snapshot, sessionKey),
        invalidate: () => {},
        dispose: cleanup,
      };
    });
  };

  pi.on("session_start", (_event, ctx) => start(ctx));
  pi.on("session_shutdown", (_event, ctx) => {
    widgetCleanup?.();
    widgetCleanup = undefined;
    if (ctx.mode === "tui" && ctx.hasUI) ctx.ui.setWidget(DASHBOARD_WIDGET_KEY, undefined);
  });
  const shortcut = cockpitShortcut();
  if (shortcut)
    pi.registerShortcut(shortcut, {
      description: "Open native subagent tabs (PI_ASC_COCKPIT_SHORTCUT; off disables)",
      handler: (ctx) => routeSubagentCommand(pi, state, ctx),
    });
}

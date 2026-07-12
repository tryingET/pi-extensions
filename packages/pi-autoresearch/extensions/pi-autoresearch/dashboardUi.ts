// ---
// summary: "Renders autoresearch status widgets and overlays, exports refreshing HTML dashboards, and opens them in the host browser."
// read_when:
//   - "Changing live dashboard presentation, browser export refresh, overlay controls, or candidate and metric summaries."
// ---
import { spawn } from "node:child_process";
import {
  AUTORESEARCH_CANDIDATE_DECISION_TOOL_NAME,
  buildAutoresearchCandidateDecisionWorkbench,
  buildAutoresearchRuntimeStatus,
  buildAutoresearchSegmentCloseout,
  exportAutoresearchDashboardHtml,
  formatAutoresearchDashboard,
} from "../../src/core/runtime.ts";
import type {
  AutoresearchOverlayComponent,
  AutoresearchWidgetContext,
  AutoresearchWidgetTui,
} from "./extensionUiTypes.ts";
import {
  borderedLine,
  borderLine,
  formatAutoresearchTuiImprovement,
  formatAutoresearchTuiMetric,
  truncatePlainLine,
} from "./tuiFormat.ts";

type AutoresearchBrowserOpenCommand = {
  command: string;
  args: string[];
};

const AUTORESEARCH_WIDGET_ID = "pi-autoresearch-status-widget";

export function registerAutoresearchWidget(ctx: AutoresearchWidgetContext): void {
  if (!ctx.hasUI || typeof ctx.ui.setWidget !== "function") return;

  ctx.ui.setWidget(AUTORESEARCH_WIDGET_ID, (tui: AutoresearchWidgetTui) => {
    const interval = setInterval(() => tui.requestRender?.(), 2000);
    interval.unref?.();
    return {
      render(width: number): string[] {
        return formatAutoresearchWidgetLines(ctx.cwd, width);
      },
      invalidate() {},
      dispose() {
        clearInterval(interval);
      },
    };
  });
}

export function clearAutoresearchWidget(ctx: AutoresearchWidgetContext): void {
  if (typeof ctx.ui.setWidget !== "function") return;
  ctx.ui.setWidget(AUTORESEARCH_WIDGET_ID, undefined);
}

function formatAutoresearchWidgetLines(cwd: string, width: number): string[] {
  const status = buildAutoresearchRuntimeStatus(cwd);
  const closeout = buildAutoresearchSegmentCloseout(cwd);
  const segment = status.currentSegment;
  const metricName = segment.metricName ?? "metric";
  const unit = segment.metricUnit ?? "";
  const best = formatAutoresearchTuiMetric(segment.bestMetric, unit);
  const kept = closeout.runs.filter((run) => run.status === "keep").length;
  const candidates = closeout.runs.filter((run) => run.status === "candidate").length;
  const failed = closeout.runs.filter(
    (run) => run.status === "crash" || run.status === "checks_failed",
  ).length;
  const confidence =
    segment.confidence === null ? "conf —" : `conf ${segment.confidence.toFixed(1)}×`;
  const improvement = formatAutoresearchTuiImprovement(
    segment.baselineMetric,
    segment.bestMetric,
    segment.direction,
  );
  const readiness = status.empiricalPosture.promotionReady ? "ready" : "not-ready";
  const essential = [
    "🔬 autoresearch",
    `${segment.runCount} runs/${segment.successfulRunCount} ok`,
    candidates > 0 ? `${candidates} candidate${candidates === 1 ? "" : "s"}` : "",
    kept > 0 ? `${kept} kept(final)` : candidates > 0 ? "0 kept(final)" : "",
    failed > 0 ? `${failed} checks-failed` : "",
    `★ ${metricName}: ${best}`,
    improvement !== "—" ? improvement : "",
    confidence,
    `${status.empiricalPosture.classification}/${readiness}`,
  ].filter(Boolean);
  const hint =
    width >= 96
      ? "ctrl+shift+t expand • ctrl+shift+f fullscreen"
      : "overlay: /autoresearch overlay";
  return [truncatePlainLine(joinAutoresearchTuiParts(essential, hint, width), Math.max(20, width))];
}

function joinAutoresearchTuiParts(leftParts: string[], rightHint: string, width: number): string {
  const left = leftParts.join(" │ ");
  if (width < 80) return left;
  const gap = width - left.length - rightHint.length;
  if (gap < 3) return left;
  return `${left}${" ".repeat(gap)}${rightHint}`;
}

export async function exportAutoresearchDashboardToBrowser(
  ctx: AutoresearchWidgetContext,
  dashboardExportIntervals: Map<string, ReturnType<typeof setInterval>>,
): Promise<void> {
  const result = exportAutoresearchDashboardHtml({ cwd: ctx.cwd });
  startAutoresearchDashboardBrowserRefresh(ctx.cwd, dashboardExportIntervals);
  try {
    await openAutoresearchFileUrl(result.fileUrl);
    ctx.ui.notify?.(
      `Opened pi-autoresearch measured packet inventory dashboard: ${result.path}`,
      "info",
    );
  } catch (error) {
    ctx.ui.notify?.(
      `Browser dashboard exported to ${result.path}, but auto-open failed: ${error instanceof Error ? error.message : String(error)}`,
      "warning",
    );
  }
}

function startAutoresearchDashboardBrowserRefresh(
  cwd: string,
  dashboardExportIntervals: Map<string, ReturnType<typeof setInterval>>,
): void {
  const existing = dashboardExportIntervals.get(cwd);
  if (existing) clearInterval(existing);
  const interval = setInterval(() => {
    try {
      exportAutoresearchDashboardHtml({ cwd });
    } catch {
      // Browser export is best-effort read-only UI; status/tool surfaces remain authoritative.
    }
  }, 2000);
  interval.unref?.();
  dashboardExportIntervals.set(cwd, interval);
}

export function stopAutoresearchDashboardBrowserExport(
  cwd: string,
  dashboardExportIntervals: Map<string, ReturnType<typeof setInterval>>,
): void {
  const existing = dashboardExportIntervals.get(cwd);
  if (existing) clearInterval(existing);
  dashboardExportIntervals.delete(cwd);
}

async function openAutoresearchFileUrl(fileUrl: string): Promise<void> {
  const { command, args } = getAutoresearchBrowserOpenCommand(fileUrl);
  await new Promise<void>((resolvePromise, rejectPromise) => {
    try {
      const child = spawn(command, args, { detached: true, stdio: "ignore" });
      let settled = false;
      const settle = (callback: (value?: unknown) => void) => (value?: unknown) => {
        if (settled) return;
        settled = true;
        callback(value);
      };
      child.once(
        "error",
        settle((error) => rejectPromise(error instanceof Error ? error : new Error(String(error)))),
      );
      child.once(
        "spawn",
        settle(() => {
          child.unref();
          resolvePromise();
        }),
      );
    } catch (error) {
      rejectPromise(error instanceof Error ? error : new Error(String(error)));
    }
  });
}

function getAutoresearchBrowserOpenCommand(fileUrl: string): AutoresearchBrowserOpenCommand {
  if (process.platform === "darwin") return { command: "open", args: [fileUrl] };
  if (process.platform === "win32") return { command: "cmd", args: ["/c", "start", "", fileUrl] };
  return { command: "xdg-open", args: [fileUrl] };
}

export async function openAutoresearchDashboardOverlay(
  ctx: AutoresearchWidgetContext,
): Promise<void> {
  if (!ctx.hasUI) return;
  if (typeof ctx.ui.custom !== "function") {
    await ctx.ui.editor?.(
      "Pi-autoresearch dashboard",
      formatAutoresearchDashboard(buildAutoresearchRuntimeStatus(ctx.cwd)),
    );
    ctx.ui.notify?.(
      "TUI overlay unavailable; opened read-only dashboard in the editor.",
      "warning",
    );
    return;
  }

  await ctx.ui.custom<void>(
    (tui, _theme, _keybindings, done) => createAutoresearchDashboardOverlay(ctx.cwd, tui, done),
    {
      overlay: true,
      overlayOptions: {
        anchor: "center",
        width: "92%",
        maxHeight: "85%",
        margin: 1,
        visible: (termWidth: number, termHeight: number) => termWidth >= 70 && termHeight >= 18,
      },
    },
  );
}

function createAutoresearchDashboardOverlay(
  cwd: string,
  tui: AutoresearchWidgetTui,
  done: () => void,
): AutoresearchOverlayComponent {
  let offset = 0;
  let closed = false;
  const interval = setInterval(() => tui.requestRender?.(), 2000);
  interval.unref?.();

  const close = () => {
    if (closed) return;
    closed = true;
    clearInterval(interval);
    done();
  };

  return {
    render(width: number): string[] {
      return formatAutoresearchOverlayLines(cwd, Math.max(40, width), offset);
    },
    handleInput(data: string): void {
      if (data === "q" || data === "Q" || data === "\u001b" || data === "\u0003") {
        close();
        return;
      }
      if (data === "j" || data === "\u001b[B") offset += 1;
      if (data === "k" || data === "\u001b[A") offset = Math.max(0, offset - 1);
      if (data === "d" || data === "\u001b[6~") offset += 10;
      if (data === "u" || data === "\u001b[5~") offset = Math.max(0, offset - 10);
      tui.requestRender?.();
    },
    invalidate() {},
    dispose() {
      clearInterval(interval);
    },
  };
}

function formatAutoresearchOverlayLines(cwd: string, width: number, offset: number): string[] {
  const innerWidth = Math.max(20, width - 2);
  const body = buildAutoresearchOverlayBody(cwd, innerWidth);
  const visibleBody = body.slice(offset, offset + 22);

  const lines = [
    borderLine("┌", "─", "┐", innerWidth),
    borderedLine("🔬 pi-autoresearch live dashboard", innerWidth),
    borderedLine("q/Esc close • j/k scroll • ctrl+shift+t widget • read-only", innerWidth),
    borderLine("├", "─", "┤", innerWidth),
    ...visibleBody.map((line) => borderedLine(line, innerWidth)),
    borderLine("└", "─", "┘", innerWidth),
  ];
  return lines.map((line) => truncatePlainLine(line, width));
}

function buildAutoresearchOverlayBody(cwd: string, width: number): string[] {
  const status = buildAutoresearchRuntimeStatus(cwd);
  const closeout = buildAutoresearchSegmentCloseout(cwd);
  const segment = status.currentSegment;
  const candidateDecision = buildAutoresearchCandidateDecisionWorkbench({ cwd });
  const metricName = segment.metricName ?? "metric";
  const unit = segment.metricUnit ?? "";
  const baseline = formatAutoresearchTuiMetric(segment.baselineMetric, unit);
  const best = formatAutoresearchTuiMetric(segment.bestMetric, unit);
  const improvement = formatAutoresearchTuiImprovement(
    segment.baselineMetric,
    segment.bestMetric,
    segment.direction,
  );
  const confidence = segment.confidence === null ? "—" : `${segment.confidence.toFixed(1)}×`;
  const recentRuns = closeout.runs.slice(-10).reverse();
  const tableRows =
    recentRuns.length > 0
      ? recentRuns.map((run) => formatAutoresearchOverlayRunRow(run, metricName, unit, width))
      : ["  (no runs recorded yet)"];

  return [
    `cwd: ${cwd}`,
    `machine: ${status.runtimeProjection.state}  control: ${status.control.kind}  posture: ${status.empiricalPosture.classification}`,
    `promotion: ${status.empiricalPosture.promotionReady ? "ready" : "not ready"}  next: ${status.empiricalPosture.recommendedNextAction}`,
    "",
    `Baseline → Best: ${baseline} → ${best}`,
    `Improvement: ${improvement}  Runs: ${segment.runCount} total / ${segment.successfulRunCount} ok  Confidence: ${confidence}`,
    `Metric: ★ ${metricName} ${segment.direction ?? ""} ${unit ? `(${unit})` : ""}`,
    `Success threshold: ${formatAutoresearchOverlayThreshold(segment.metricThreshold, unit)}`,
    `Benchmark: ${segment.benchmarkCommand ?? "(unset)"}`,
    `Checks: ${segment.checksCommand ?? "(none)"}`,
    "",
    "Metric trajectory / recent runs",
    formatAutoresearchOverlayRunHeader(metricName, width),
    `  ${"─".repeat(Math.max(0, Math.min(width - 4, 96)))}`,
    ...tableRows,
    "",
    "Candidate decision",
    `candidate: ${candidateDecision.candidate?.label ?? "no candidate bound yet"}`,
    `decision: ${candidateDecision.recommendedDecision}  checks=${candidateDecision.empirical.checksStatus}`,
    `next surface: ${candidateDecision.exactNextCalls[0] ?? `${AUTORESEARCH_CANDIDATE_DECISION_TOOL_NAME}({ cwd: ${JSON.stringify(cwd)}, action: "status" })`}`,
    "",
    "Candidate policy",
    "mode=worktree • keep=preserve_branch • discard=suggest_cleanup • rewind=reset_worktree_to_base",
    "Replay Fabric observes history; ASC rewind is live session recovery; durable promotion remains external.",
    "Browser export has the upstream-style card/chart/table view: /autoresearch export",
  ];
}

function formatAutoresearchOverlayThreshold(value: number | null, unit: string): string {
  return value === null ? "not set; zero-target inference may apply" : `${value}${unit}`;
}

function formatAutoresearchOverlayRunHeader(metricName: string, width: number): string {
  const metric = truncatePlainLine(`★ ${metricName}`, width >= 100 ? 22 : 14);
  return `  ${"#".padEnd(4)}${"status".padEnd(17)}${metric.padEnd(width >= 100 ? 24 : 16)}${"decision".padEnd(24)}description`;
}

function formatAutoresearchOverlayRunRow(
  run: {
    iteration: number | null;
    status: string;
    runKind: string;
    metric: number;
    empiricalDecisionClass: string;
    description: string;
  },
  _metricName: string,
  unit: string,
  width: number,
): string {
  const metricWidth = width >= 100 ? 24 : 16;
  const idx = String(run.iteration ?? "-").padEnd(4);
  const status = truncatePlainLine(`${run.status}/${run.runKind}`, 16).padEnd(17);
  const metric = formatAutoresearchTuiMetric(run.metric, unit).padEnd(metricWidth);
  const decision = truncatePlainLine(run.empiricalDecisionClass, 23).padEnd(24);
  return truncatePlainLine(
    `  ${idx}${status}${metric}${decision}${run.description}`,
    Math.max(20, width - 2),
  );
}

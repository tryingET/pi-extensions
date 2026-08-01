// ---
// summary: "Renders autoresearch status widgets and overlays, exports refreshing HTML dashboards, and opens them in the host browser."
// read_when:
//   - "Changing live dashboard presentation, browser export refresh, overlay controls, or candidate and metric summaries."
// ---
import { spawn } from "node:child_process";
import { AUTORESEARCH_CANDIDATE_DECISION_TOOL_NAME } from "./eagerContract.ts";
import type {
  AutoresearchOverlayComponent,
  AutoresearchWidgetContext,
  AutoresearchWidgetTui,
} from "./extensionUiTypes.ts";
import type { AutoresearchLazyModules, AutoresearchRuntimeModule } from "./lazyModules.ts";
import type { AutoresearchSessionEffects } from "./sessionEffects.ts";
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

export async function registerAutoresearchWidget(
  ctx: AutoresearchWidgetContext,
  modules: AutoresearchLazyModules,
  effects: AutoresearchSessionEffects,
): Promise<void> {
  if (!ctx.hasUI || typeof ctx.ui.setWidget !== "function" || !effects.isActive()) return;
  const runtimeModule = await modules.runtime();
  if (!effects.isActive()) return;

  effects.commit(() =>
    ctx.ui.setWidget?.(AUTORESEARCH_WIDGET_ID, (tui: AutoresearchWidgetTui) => {
      if (!effects.isActive()) {
        return { render: () => [], invalidate() {}, dispose() {} };
      }
      const interval = setInterval(
        effects.guard(() => tui.requestRender?.()),
        2000,
      );
      interval.unref?.();
      return {
        render(width: number): string[] {
          return effects.isActive()
            ? formatAutoresearchWidgetLines(ctx.cwd, width, runtimeModule)
            : [];
        },
        invalidate() {},
        dispose() {
          clearInterval(interval);
        },
      };
    }),
  );
}

export function clearAutoresearchWidget(
  ctx: AutoresearchWidgetContext,
  effects: AutoresearchSessionEffects,
): void {
  if (typeof ctx.ui.setWidget !== "function") return;
  effects.commit(() => ctx.ui.setWidget?.(AUTORESEARCH_WIDGET_ID, undefined));
}

function formatAutoresearchWidgetLines(
  cwd: string,
  width: number,
  runtimeModule: AutoresearchRuntimeModule,
): string[] {
  const status = runtimeModule.buildAutoresearchRuntimeStatus(cwd);
  const closeout = runtimeModule.buildAutoresearchSegmentCloseout(cwd);
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
  modules: AutoresearchLazyModules,
  effects: AutoresearchSessionEffects,
  openFileUrl: (fileUrl: string, signal: AbortSignal) => Promise<void> = openAutoresearchFileUrl,
): Promise<void> {
  if (!effects.isActive()) return;
  const runtimeModule = await modules.runtime();
  if (!effects.isActive()) return;
  const exportResult = effects.commit(() =>
    runtimeModule.exportAutoresearchDashboardHtml({ cwd: ctx.cwd }),
  );
  if (!exportResult.committed) return;
  const result = exportResult.value;
  startAutoresearchDashboardBrowserRefresh(
    ctx.cwd,
    dashboardExportIntervals,
    runtimeModule,
    effects,
  );
  try {
    const opened = await effects.commitAsync(() => openFileUrl(result.fileUrl, effects.signal));
    if (!opened.committed) return;
    effects.commit(() =>
      ctx.ui.notify?.(
        `Opened pi-autoresearch measured packet inventory dashboard: ${result.path}`,
        "info",
      ),
    );
  } catch (error) {
    effects.commit(() =>
      ctx.ui.notify?.(
        `Browser dashboard exported to ${result.path}, but auto-open failed: ${error instanceof Error ? error.message : String(error)}`,
        "warning",
      ),
    );
  }
}

function startAutoresearchDashboardBrowserRefresh(
  cwd: string,
  dashboardExportIntervals: Map<string, ReturnType<typeof setInterval>>,
  runtimeModule: AutoresearchRuntimeModule,
  effects: AutoresearchSessionEffects,
): void {
  const existing = dashboardExportIntervals.get(cwd);
  if (existing) clearInterval(existing);
  const interval = setInterval(() => {
    if (!effects.isActive()) return;
    try {
      effects.commit(() => runtimeModule.exportAutoresearchDashboardHtml({ cwd }));
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

async function openAutoresearchFileUrl(fileUrl: string, signal: AbortSignal): Promise<void> {
  const { command, args } = getAutoresearchBrowserOpenCommand(fileUrl);
  await new Promise<void>((resolvePromise, rejectPromise) => {
    try {
      const child = spawn(command, args, { detached: true, stdio: "ignore" });
      let settled = false;
      let abort = () => {};
      const settle = (callback: (value?: unknown) => void) => (value?: unknown) => {
        if (settled) return;
        settled = true;
        signal.removeEventListener("abort", abort);
        callback(value);
      };
      abort = settle(() => {
        child.kill();
        rejectPromise(new Error("Browser open canceled because the autoresearch session ended."));
      });
      signal.addEventListener("abort", abort, { once: true });
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
  modules: AutoresearchLazyModules,
  effects: AutoresearchSessionEffects,
): Promise<void> {
  if (!ctx.hasUI || !effects.isActive()) return;
  const runtimeModule = await modules.runtime();
  if (!effects.isActive()) return;
  if (typeof ctx.ui.custom !== "function") {
    const editor = await effects.commitAsync(() =>
      ctx.ui.editor?.(
        "Pi-autoresearch dashboard",
        runtimeModule.formatAutoresearchDashboard(
          runtimeModule.buildAutoresearchRuntimeStatus(ctx.cwd),
        ),
      ),
    );
    if (!editor.committed) return;
    effects.commit(() =>
      ctx.ui.notify?.(
        "TUI overlay unavailable; opened read-only dashboard in the editor.",
        "warning",
      ),
    );
    return;
  }

  await effects.commitAsync(() =>
    ctx.ui.custom?.<void>(
      (tui, _theme, _keybindings, done) =>
        createAutoresearchDashboardOverlay(ctx.cwd, tui, done, runtimeModule, effects),
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
    ),
  );
}

function createAutoresearchDashboardOverlay(
  cwd: string,
  tui: AutoresearchWidgetTui,
  done: () => void,
  runtimeModule: AutoresearchRuntimeModule,
  effects: AutoresearchSessionEffects,
): AutoresearchOverlayComponent {
  if (!effects.isActive()) {
    return { render: () => [], handleInput() {}, invalidate() {}, dispose() {} };
  }
  let offset = 0;
  let closed = false;
  const interval = setInterval(
    effects.guard(() => tui.requestRender?.()),
    2000,
  );
  interval.unref?.();

  const close = () => {
    if (closed) return;
    closed = true;
    clearInterval(interval);
    effects.signal.removeEventListener("abort", close);
    done();
  };
  effects.signal.addEventListener("abort", close, { once: true });

  return {
    render(width: number): string[] {
      return effects.isActive()
        ? formatAutoresearchOverlayLines(cwd, Math.max(40, width), offset, runtimeModule)
        : [];
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
      effects.commit(() => tui.requestRender?.());
    },
    invalidate() {},
    dispose() {
      clearInterval(interval);
      effects.signal.removeEventListener("abort", close);
    },
  };
}

function formatAutoresearchOverlayLines(
  cwd: string,
  width: number,
  offset: number,
  runtimeModule: AutoresearchRuntimeModule,
): string[] {
  const innerWidth = Math.max(20, width - 2);
  const body = buildAutoresearchOverlayBody(cwd, innerWidth, runtimeModule);
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

function buildAutoresearchOverlayBody(
  cwd: string,
  width: number,
  runtimeModule: AutoresearchRuntimeModule,
): string[] {
  const status = runtimeModule.buildAutoresearchRuntimeStatus(cwd);
  const closeout = runtimeModule.buildAutoresearchSegmentCloseout(cwd);
  const segment = status.currentSegment;
  const candidateDecision = runtimeModule.buildAutoresearchCandidateDecisionWorkbench({ cwd });
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

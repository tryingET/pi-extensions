import {
  AUTORESEARCH_LOOP_TOOL_NAME,
  type AutoresearchLoopProgressEvent,
  buildAutoresearchRuntimeStatus,
  formatAutoresearchDashboard,
} from "../../src/core/runtime.ts";

export function emitAutoresearchLoopUpdate(
  onUpdate: unknown,
  event: AutoresearchLoopProgressEvent,
): void {
  if (typeof onUpdate !== "function") {
    return;
  }

  const status = buildAutoresearchRuntimeStatus(event.cwd);
  const progressCard = [
    `# PI-AUTORESEARCH LIVE UPDATE — ${event.phase}`,
    "",
    event.message,
    "",
    `- elapsed: ${event.elapsedSeconds.toFixed(2)}s`,
    `- iteration: ${event.iteration ?? "-"}/${event.maxIterations}`,
    `- machine state: ${status.runtimeProjection.state}`,
    `- empirical posture: ${status.empiricalPosture.classification}`,
    `- promotion ready: ${status.empiricalPosture.promotionReady ? "yes" : "no"}`,
    `- best metric: ${status.currentSegment.bestMetric ?? "n/a"}${status.currentSegment.metricUnit}`,
    `- confidence: ${status.currentSegment.confidence ?? "n/a"}`,
    `- next: ${status.empiricalPosture.recommendedNextAction}`,
  ].join("\n");

  (
    onUpdate as (update: {
      content: Array<{ type: "text"; text: string }>;
      details: Record<string, unknown>;
    }) => void
  )({
    content: [{ type: "text", text: progressCard }],
    details: {
      tool: AUTORESEARCH_LOOP_TOOL_NAME,
      dashboard: formatAutoresearchDashboard(status),
      ...event,
    },
  });
}

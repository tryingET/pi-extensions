// ---
// summary: "Emits structured live loop progress cards with current runtime posture, metrics, and dashboard details."
// read_when:
//   - "Changing bounded-loop update payloads, progress-card fields, or dashboard details sent through onUpdate."
// ---
import type { AutoresearchLoopProgressEvent } from "../../src/core/runtime-model-loop.ts";
import { AUTORESEARCH_LOOP_TOOL_NAME } from "./eagerContract.ts";
import type { AutoresearchRuntimeModule } from "./lazyModules.ts";
import type { AutoresearchSessionEffects } from "./sessionEffects.ts";

export function emitAutoresearchLoopUpdate(
  onUpdate: unknown,
  event: AutoresearchLoopProgressEvent,
  runtimeModule: AutoresearchRuntimeModule,
  effects: AutoresearchSessionEffects,
): void {
  if (!effects.isActive() || typeof onUpdate !== "function") {
    return;
  }

  const { buildAutoresearchRuntimeStatus, formatAutoresearchDashboard } = runtimeModule;
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

  effects.commit(() =>
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
    }),
  );
}

// ---
// summary: shared external emitter for package-owned telemetry events (schema-stable, best-effort, never throws).
// read_when:
//   - emitting telemetry from another package (e.g. pi-session-compaction failure chain) or changing the emit contract.
// ---

import {
  type CompactionFailureTelemetryEvent,
  deriveErrorSignature,
  TELEMETRY_SCHEMA_VERSION,
  type TelemetryEvent,
} from "./events.ts";
import { appendTelemetryEvent, resolveTelemetryDir } from "./store.ts";

export interface CompactionFailureInput {
  stage: CompactionFailureTelemetryEvent["stage"];
  error: unknown;
  sessionId?: string;
  cwd?: string;
  ts?: number;
}

/**
 * Record a compaction failure/fallback from the owning component.
 * Best-effort: telemetry failures are swallowed so they can never break compaction.
 */
export async function recordCompactionFailureTelemetry(
  input: CompactionFailureInput,
  options: { dir?: string; env?: NodeJS.ProcessEnv } = {},
): Promise<void> {
  const errorSignature = deriveErrorSignature(
    input.error instanceof Error ? input.error.message : String(input.error ?? "unknown error"),
  );
  const event: CompactionFailureTelemetryEvent = {
    v: TELEMETRY_SCHEMA_VERSION,
    kind: "compaction_failure",
    ts: input.ts ?? Date.now(),
    stage: input.stage,
    errorSignature: errorSignature ?? "unknown error",
    source: "live",
    ...(input.sessionId ? { sessionId: input.sessionId } : {}),
    ...(input.cwd ? { cwd: input.cwd } : {}),
  };
  await appendTelemetryEvent(options.dir ?? resolveTelemetryDir(options.env), event);
}

export async function recordTelemetryEvent(
  event: TelemetryEvent,
  options: { dir?: string; env?: NodeJS.ProcessEnv } = {},
): Promise<void> {
  await appendTelemetryEvent(options.dir ?? resolveTelemetryDir(options.env), event);
}

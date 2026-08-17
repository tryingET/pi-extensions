// ---
// summary: shared external emitter for package-owned telemetry events (schema-stable, best-effort, never throws).
// read_when:
//   - emitting telemetry from another package or changing the emit contract.
// ---

import {
  type CompactionFailureTelemetryEvent,
  deriveErrorSignature,
  TELEMETRY_SCHEMA_VERSION,
  type TelemetryEvent,
} from "./events.ts";
import {
  type CompactionQualityInput,
  type CompactionRecallInput,
  createCompactionQualityTelemetryEvent,
  createCompactionRecallTelemetryEvent,
} from "./quality.ts";
import { appendTelemetryEvent, resolveTelemetryDir } from "./store.ts";

export interface CompactionFailureInput {
  stage: CompactionFailureTelemetryEvent["stage"];
  error: unknown;
  sessionId?: string;
  cwd?: string;
  ts?: number;
}

export interface TelemetryEmitOptions {
  dir?: string;
  env?: NodeJS.ProcessEnv;
  append?: typeof appendTelemetryEvent;
}

async function appendBestEffort(
  event: TelemetryEvent,
  options: TelemetryEmitOptions,
): Promise<void> {
  try {
    const append = options.append ?? appendTelemetryEvent;
    await append(options.dir ?? resolveTelemetryDir(options.env), event);
  } catch {
    // Telemetry must never break the owning package.
  }
}

/**
 * Record a compaction failure/fallback from the owning component.
 * Best-effort: telemetry failures are swallowed so they can never break compaction.
 */
export async function recordCompactionFailureTelemetry(
  input: CompactionFailureInput,
  options: TelemetryEmitOptions = {},
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
  await appendBestEffort(event, options);
}

export async function recordCompactionQualityTelemetry(
  input: CompactionQualityInput,
  options: TelemetryEmitOptions = {},
): Promise<void> {
  await appendBestEffort(createCompactionQualityTelemetryEvent(input), options);
}

export async function recordCompactionRecallTelemetry(
  input: CompactionRecallInput,
  options: TelemetryEmitOptions = {},
): Promise<void> {
  await appendBestEffort(createCompactionRecallTelemetryEvent(input), options);
}

export async function recordTelemetryEvent(
  event: TelemetryEvent,
  options: TelemetryEmitOptions = {},
): Promise<void> {
  await appendBestEffort(event, options);
}

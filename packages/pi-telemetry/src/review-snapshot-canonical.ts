// ---
// summary: "Canonicalization, digest, label, and package-version helpers for telemetry snapshots."
// read_when:
//   - "Changing telemetry snapshot hashing or bounded label semantics."
// ---

import { createHash } from "node:crypto";
import { createRequire } from "node:module";
import type { TelemetryEvent } from "./events.ts";
import { TELEMETRY_REVIEW_MAX_LABEL_CHARS } from "./review-snapshot-types.ts";

export function canonicalTelemetryReviewJson(value: unknown): string {
  if (value === null || typeof value === "boolean" || typeof value === "string") {
    return JSON.stringify(value);
  }
  if (typeof value === "number") {
    if (!Number.isFinite(value)) throw new Error("non-finite value in telemetry snapshot");
    return JSON.stringify(value);
  }
  if (Array.isArray(value)) {
    return `[${value.map(canonicalTelemetryReviewJson).join(",")}]`;
  }
  if (isTelemetryReviewRecord(value)) {
    return `{${Object.keys(value)
      .sort()
      .filter((key) => value[key] !== undefined)
      .map((key) => `${JSON.stringify(key)}:${canonicalTelemetryReviewJson(value[key])}`)
      .join(",")}}`;
  }
  throw new Error("unsupported value in telemetry snapshot");
}

export function telemetryReviewSha256(value: string | Buffer): string {
  return createHash("sha256").update(value).digest("hex");
}

export function boundedTelemetryReviewLabel(value: unknown): string {
  if (typeof value !== "string") return "unknown";
  const normalized = value
    .replace(/[\u0000-\u001f\u007f]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
  return (normalized || "unknown").slice(0, TELEMETRY_REVIEW_MAX_LABEL_CHARS);
}

export function telemetryEventForReviewDigest(event: TelemetryEvent): Record<string, unknown> {
  const { sessionId: _sessionId, cwd: _cwd, ...boundedEvent } = event;
  return boundedEvent;
}

export function compareTelemetryReviewEvents(
  left: TelemetryEvent,
  right: TelemetryEvent,
): number {
  return (
    left.ts - right.ts ||
    left.kind.localeCompare(right.kind) ||
    canonicalTelemetryReviewJson(telemetryEventForReviewDigest(left)).localeCompare(
      canonicalTelemetryReviewJson(telemetryEventForReviewDigest(right)),
    )
  );
}

export function readTelemetryPackageVersion(): string {
  try {
    const packageJson = createRequire(import.meta.url)("../package.json") as { version?: unknown };
    return typeof packageJson.version === "string" && packageJson.version.trim()
      ? packageJson.version.trim().slice(0, 64)
      : "unknown";
  } catch {
    return "unknown";
  }
}

export function isTelemetryReviewRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

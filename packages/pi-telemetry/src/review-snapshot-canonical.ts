// ---
// summary: "Canonicalization, digest, label, and package-version helpers for telemetry snapshots."
// read_when:
//   - "Changing telemetry snapshot hashing, privacy exclusions, or bounded label semantics."
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
    // biome-ignore lint/suspicious/noControlCharactersInRegex: rejecting/stripping control characters is this code's purpose
    .replace(/[\u0000-\u001f\u007f]/g, " ")
    .replace(/[\u061c\u200e\u200f\u202a-\u202e\u2066-\u2069]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
  return (normalized || "unknown").slice(0, TELEMETRY_REVIEW_MAX_LABEL_CHARS);
}

/**
 * Return only review-relevant metadata for source-set hashing.
 *
 * Private origin fields and bounded error prose are deliberately excluded so
 * changes to session identity, workspace location, or an error's text cannot be
 * inferred by comparing snapshot digests. Aggregate failure counts remain bound
 * through the snapshot metrics and breakdowns.
 */
export function telemetryEventForReviewDigest(event: TelemetryEvent): Record<string, unknown> {
  const boundedEvent: Record<string, unknown> = { ...event };
  delete boundedEvent.sessionId;
  delete boundedEvent.cwd;
  delete boundedEvent.errorSignature;
  return boundedEvent;
}

export function compareTelemetryReviewEvents(left: TelemetryEvent, right: TelemetryEvent): number {
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

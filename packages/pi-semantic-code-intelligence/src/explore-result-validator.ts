import { validExploreDetails, validLocation } from "./explore-detail-validator.ts";
import { validEditRisk } from "./explore-risk-validator.ts";

export type ExploreMode = "compact" | "standard" | "debug";

export function validExplorePayload(
  value: unknown,
  expectedMode: ExploreMode,
): value is Record<string, unknown> {
  const packet = record(value);
  if (
    !packet ||
    packet.schemaVersion !== 1 ||
    packet.workflow !== "explore_symbol_impact" ||
    typeof packet.symbol !== "string" ||
    packet.symbol.length > 256 ||
    typeof packet.degraded !== "boolean" ||
    !Array.isArray(packet.nextReads) ||
    packet.nextReads.length > 10 ||
    !stringArray(packet.limitations, 10)
  ) {
    return false;
  }
  const confirmed = packet.ok === true && packet.status === "confirmed";
  const failClosed =
    packet.ok === false && (packet.status === "unconfirmed" || packet.status === "indeterminate");
  if (!confirmed && !failClosed) return false;

  const allowed = confirmed
    ? [
        "schemaVersion",
        "workflow",
        "ok",
        "symbol",
        "status",
        "degraded",
        "definition",
        "definitions",
        "impact",
        "editRisk",
        "nextReads",
        "limitations",
        "details",
      ]
    : [
        "schemaVersion",
        "workflow",
        "ok",
        "symbol",
        "status",
        "degraded",
        "message",
        "evidence",
        "nextReads",
        "limitations",
        "details",
        "truncation",
      ];
  if (!onlyKeys(packet, allowed) || !packet.nextReads.every(validNextRead)) return false;

  if (confirmed) {
    if (
      !validLocation(packet.definition) ||
      !exactNumberRecord(packet.definitions, ["count"]) ||
      !validImpact(packet.impact) ||
      !validEditRisk(packet.editRisk, Number(record(packet.impact)?.totalFiles), packet.degraded)
    ) {
      return false;
    }
  } else if (
    typeof packet.message !== "string" ||
    !validEvidence(packet.evidence) ||
    (packet.truncation !== undefined && !validPacketTruncation(packet.truncation))
  ) {
    return false;
  }

  if (expectedMode === "compact") {
    return confirmed ? packet.details === "mode: standard" : !Object.hasOwn(packet, "details");
  }
  return validExploreDetails(packet.details, expectedMode);
}

function validImpact(value: unknown): boolean {
  const impact = record(value);
  return !!(
    impact &&
    onlyKeys(impact, ["files", "totalFiles", "truncated"]) &&
    Array.isArray(impact.files) &&
    impact.files.length <= 25 &&
    impact.files.every(validRankedFile) &&
    nonnegativeInteger(impact.totalFiles) &&
    typeof impact.truncated === "boolean"
  );
}

function validRankedFile(value: unknown): boolean {
  const item = record(value);
  return !!(
    item &&
    onlyKeys(item, ["path", "score", "reasons", "signals", "line"]) &&
    typeof item.path === "string" &&
    item.path.length <= 1_024 &&
    Number.isFinite(item.score) &&
    stringArray(item.reasons, 8) &&
    stringArray(item.signals, 4) &&
    optionalNumber(item.line)
  );
}

function validNextRead(value: unknown): boolean {
  const next = record(value);
  if (!next || typeof next.reason !== "string") return false;
  if (typeof next.path === "string") {
    return (
      onlyKeys(next, ["path", "line", "reason"]) &&
      next.path.length <= 1_024 &&
      optionalNumber(next.line)
    );
  }
  return next.action === "locate_confirm_definition" && onlyKeys(next, ["action", "reason"]);
}

function validEvidence(value: unknown): boolean {
  const evidence = record(value);
  return !!(
    evidence &&
    onlyKeys(evidence, ["references", "graphImpact", "partial"]) &&
    nonnegativeInteger(evidence.references) &&
    typeof evidence.graphImpact === "boolean" &&
    typeof evidence.partial === "boolean"
  );
}

function validPacketTruncation(value: unknown): boolean {
  const truncation = record(value);
  return !!(
    truncation &&
    onlyKeys(truncation, ["applied", "byteBudget", "omissions"]) &&
    truncation.applied === true &&
    truncation.byteBudget === 49_152 &&
    (truncation.omissions === undefined || validPacketOmissions(truncation.omissions))
  );
}

function validPacketOmissions(value: unknown): boolean {
  return exactNumberRecord(value, ["impactFiles", "nextReads", "limitations"]);
}

function exactNumberRecord(value: unknown, keys: string[]): boolean {
  const entry = record(value);
  return !!entry && onlyKeys(entry, keys) && keys.every((key) => nonnegativeInteger(entry[key]));
}

function record(value: unknown): Record<string, unknown> | undefined {
  return value && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : undefined;
}

function onlyKeys(value: Record<string, unknown>, allowed: readonly string[]): boolean {
  const allowedSet = new Set(allowed);
  return Object.keys(value).every((key) => allowedSet.has(key));
}

function stringArray(value: unknown, max: number): boolean {
  return (
    Array.isArray(value) && value.length <= max && value.every((item) => typeof item === "string")
  );
}

function nonnegativeInteger(value: unknown): boolean {
  return Number.isInteger(value) && Number(value) >= 0;
}

function optionalNumber(value: unknown): boolean {
  return value === undefined || Number.isFinite(value);
}

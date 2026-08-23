export const SECTION_NAMES = [
  "definitions",
  "declarations",
  "references",
  "graph.exports",
  "graph.callers",
  "graph.imports",
  "graph.callees",
] as const;
export const EDGE_NAMES = ["exports", "callers", "imports", "callees"] as const;

const OMISSION_REASONS = [
  "item_budget",
  "invalid_shape",
  "outside_workspace",
  "byte_budget",
] as const;
const VALID_OMISSION_SECTIONS = new Set<string>([...SECTION_NAMES, "details"]);

export function validLocation(value: unknown): boolean {
  const item = record(value);
  return !!(
    item &&
    onlyKeys(item, [
      "path",
      "line",
      "character",
      "kind",
      "confidence",
      "source",
      "symbol",
      "caller",
    ]) &&
    typeof item.path === "string" &&
    item.path.length <= 1_024 &&
    optionalNumber(item.line) &&
    optionalNumber(item.character) &&
    optionalNumber(item.confidence) &&
    ["kind", "source", "symbol", "caller"].every((key) => optionalString(item[key], 80))
  );
}

export function validProvenanceSummary(value: unknown, mustBePresent: boolean): boolean {
  const summary = record(value);
  if (
    !summary ||
    !onlyKeys(summary, [
      "present",
      "backend",
      "sources",
      "fields",
      "fieldCount",
      "fieldCountExact",
      "fieldsTruncated",
    ]) ||
    typeof summary.present !== "boolean" ||
    (mustBePresent && summary.present !== true) ||
    !optionalString(summary.backend, 80) ||
    !stringArray(summary.sources, 8) ||
    !stringArray(summary.fields, 8) ||
    !nonnegativeInteger(summary.fieldCount) ||
    Number(summary.fieldCount) < summary.fields.length ||
    typeof summary.fieldCountExact !== "boolean" ||
    typeof summary.fieldsTruncated !== "boolean"
  ) {
    return false;
  }
  const emergencyEmptySummary =
    !mustBePresent &&
    summary.present === false &&
    summary.backend === undefined &&
    summary.sources.length === 0 &&
    summary.fields.length === 0 &&
    summary.fieldCount === 0 &&
    summary.fieldCountExact === true &&
    summary.fieldsTruncated === true;
  return (
    emergencyEmptySummary ||
    summary.fieldsTruncated ===
      (!summary.fieldCountExact || Number(summary.fieldCount) > summary.fields.length)
  );
}

export function validOmissions(
  value: unknown,
  omittedBySection: Record<string, number>,
  byteTruncated: boolean,
  allowEmpty: boolean,
  expectedReasonReceipts?: Record<string, number>,
): boolean {
  if (!Array.isArray(value) || value.length > 24 || (!allowEmpty && value.length === 0)) {
    return false;
  }
  const receipts: Record<string, number> = {};
  const reasonReceipts: Record<string, number> = {};
  const seen = new Set<string>();
  let detailByteReceipt = false;
  for (const entry of value) {
    const omission = record(entry);
    if (
      !omission ||
      !onlyKeys(omission, ["section", "reason", "count"]) ||
      typeof omission.section !== "string" ||
      !VALID_OMISSION_SECTIONS.has(omission.section) ||
      !OMISSION_REASONS.includes(omission.reason as (typeof OMISSION_REASONS)[number]) ||
      !positiveInteger(omission.count)
    ) {
      return false;
    }
    const receiptKey = `${omission.section}:${String(omission.reason)}`;
    if (seen.has(receiptKey)) return false;
    seen.add(receiptKey);
    reasonReceipts[receiptKey] = Number(omission.count);

    if (omission.section === "details") {
      if (omission.reason !== "byte_budget" || omission.count !== 1 || detailByteReceipt) {
        return false;
      }
      detailByteReceipt = true;
    } else {
      if (omission.reason === "byte_budget") return false;
      receipts[omission.section] = (receipts[omission.section] ?? 0) + Number(omission.count);
    }
  }
  return (
    SECTION_NAMES.every((name) => (receipts[name] ?? 0) === (omittedBySection[name] ?? 0)) &&
    detailByteReceipt === byteTruncated &&
    (expectedReasonReceipts === undefined ||
      exactPositiveNumberRecord(reasonReceipts, expectedReasonReceipts))
  );
}

export function validOptionalPacketOmissions(value: unknown): boolean {
  return value === undefined || (validPacketOmissions(value) && packetOmissionCount(value) > 0);
}

export function validPacketOmissions(value: unknown): boolean {
  return exactNumberRecord(value, ["impactFiles", "nextReads", "limitations"]);
}

export function packetOmissionCount(value: unknown): number {
  const omissions = record(value);
  return omissions
    ? Number(omissions.impactFiles) + Number(omissions.nextReads) + Number(omissions.limitations)
    : 0;
}

export function boundedByteBudget(value: unknown, max: number): boolean {
  return nonnegativeInteger(value) && Number(value) >= 2_048 && Number(value) <= max;
}

function exactPositiveNumberRecord(
  observed: Record<string, number>,
  expected: Record<string, number>,
): boolean {
  const expectedEntries = Object.entries(expected).filter(([, count]) => count > 0);
  return (
    Object.keys(observed).length === expectedEntries.length &&
    expectedEntries.every(([key, count]) => observed[key] === count)
  );
}

export function exactNumberRecord(value: unknown, keys: readonly string[]): boolean {
  const entry = record(value);
  return !!entry && onlyKeys(entry, keys) && keys.every((key) => nonnegativeInteger(entry[key]));
}

export function record(value: unknown): Record<string, unknown> | undefined {
  return value && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : undefined;
}

export function onlyKeys(value: Record<string, unknown>, allowed: readonly string[]): boolean {
  const allowedSet = new Set(allowed);
  return Object.keys(value).every((key) => allowedSet.has(key));
}

export function exactKeys(value: Record<string, unknown>, expected: readonly string[]): boolean {
  return Object.keys(value).length === expected.length && onlyKeys(value, expected);
}

export function stringArray(value: unknown, max: number): value is string[] {
  return (
    Array.isArray(value) && value.length <= max && value.every((item) => typeof item === "string")
  );
}

export function nonnegativeInteger(value: unknown): boolean {
  return Number.isSafeInteger(value) && Number(value) >= 0;
}

export function positiveInteger(value: unknown): boolean {
  return nonnegativeInteger(value) && Number(value) > 0;
}

export function optionalNumber(value: unknown): boolean {
  return value === undefined || Number.isFinite(value);
}

export function optionalString(value: unknown, max: number): boolean {
  return value === undefined || (typeof value === "string" && value.length <= max);
}

export function sumValues(value: Record<string, number>): number {
  return Object.values(value).reduce((sum, count) => sum + count, 0);
}

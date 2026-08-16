import type { ExploreMode } from "./explore-result-validator.ts";

const SECTION_NAMES = [
  "definitions",
  "declarations",
  "references",
  "graph.exports",
  "graph.callers",
  "graph.imports",
  "graph.callees",
] as const;

export function validExploreDetails(
  value: unknown,
  mode: Exclude<ExploreMode, "compact">,
): boolean {
  const details = record(value);
  const disclosure = record(details?.disclosure);
  const detailBytes = details ? Buffer.byteLength(JSON.stringify(details), "utf8") : 0;
  const detailBudget = mode === "standard" ? 24_576 : 36_864;
  if (
    !details ||
    details.schemaVersion !== 1 ||
    details.mode !== mode ||
    !validSection(details.definitions) ||
    !validSection(details.declarations) ||
    !validSection(details.references) ||
    !validGraph(details.graph) ||
    !validProvenance(details.provenance) ||
    !validCounts(details.counts) ||
    !validOmissions(details.omissions) ||
    !stringArray(details.limitations, 8) ||
    !validDisclosure(disclosure, detailBytes, detailBudget)
  ) {
    return false;
  }
  const allowed = [
    "schemaVersion",
    "mode",
    "definitions",
    "declarations",
    "references",
    "graph",
    "provenance",
    "counts",
    "omissions",
    "limitations",
    "disclosure",
    ...(mode === "debug" ? ["diagnostics"] : []),
  ];
  return (
    onlyKeys(details, allowed) && (mode === "standard" || validDiagnostics(details.diagnostics))
  );
}

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

function validSection(value: unknown): boolean {
  const section = record(value);
  const failures = record(section?.shapeFailures);
  return !!(
    section &&
    onlyKeys(section, ["count", "emitted", "omitted", "truncated", "items", "shapeFailures"]) &&
    nonnegativeInteger(section.count) &&
    nonnegativeInteger(section.emitted) &&
    nonnegativeInteger(section.omitted) &&
    typeof section.truncated === "boolean" &&
    Array.isArray(section.items) &&
    section.items.length <= 12 &&
    section.items.every(validLocation) &&
    failures &&
    onlyKeys(failures, ["invalid", "outsideWorkspace"]) &&
    nonnegativeInteger(failures.invalid) &&
    nonnegativeInteger(failures.outsideWorkspace)
  );
}

function validGraph(value: unknown): boolean {
  const graph = record(value);
  const edges = record(graph?.edges);
  return !!(
    graph &&
    onlyKeys(graph, ["hasImpactEvidence", "edges"]) &&
    typeof graph.hasImpactEvidence === "boolean" &&
    edges &&
    onlyKeys(edges, ["exports", "callers", "imports", "callees"]) &&
    ["exports", "callers", "imports", "callees"].every((key) => validSection(edges[key]))
  );
}

function validProvenance(value: unknown): boolean {
  const provenance = record(value);
  return !!(
    provenance &&
    onlyKeys(provenance, ["definitionLookup", "symbolMap", "graph"]) &&
    ["definitionLookup", "symbolMap", "graph"].every((key) =>
      validProvenanceSummary(provenance[key]),
    )
  );
}

function validProvenanceSummary(value: unknown): boolean {
  const summary = record(value);
  return !!(
    summary &&
    onlyKeys(summary, [
      "present",
      "backend",
      "sources",
      "fields",
      "fieldCount",
      "fieldCountExact",
      "fieldsTruncated",
    ]) &&
    typeof summary.present === "boolean" &&
    optionalString(summary.backend, 80) &&
    stringArray(summary.sources, 8) &&
    stringArray(summary.fields, 8) &&
    nonnegativeInteger(summary.fieldCount) &&
    typeof summary.fieldCountExact === "boolean" &&
    typeof summary.fieldsTruncated === "boolean"
  );
}

function validCounts(value: unknown): boolean {
  const counts = record(value);
  return !!(
    counts &&
    onlyKeys(counts, [...SECTION_NAMES]) &&
    Object.values(counts).every((entry) => exactNumberRecord(entry, ["observed", "emitted"]))
  );
}

function validOmissions(value: unknown): boolean {
  return (
    Array.isArray(value) &&
    value.length <= 24 &&
    value.every((entry) => {
      const omission = record(entry);
      return !!(
        omission &&
        onlyKeys(omission, ["section", "reason", "count"]) &&
        typeof omission.section === "string" &&
        ["item_budget", "invalid_shape", "outside_workspace", "byte_budget"].includes(
          String(omission.reason),
        ) &&
        nonnegativeInteger(omission.count)
      );
    })
  );
}

function validDisclosure(
  disclosure: Record<string, unknown> | undefined,
  actualBytes: number,
  maxBytes: number,
): boolean {
  if (!disclosure) return false;
  const allowed = [
    "packetByteBudget",
    "byteBudget",
    "emittedBytes",
    "itemBudgetPerSection",
    "analyzedItemBudgetPerSection",
    "textCharacterBudget",
    "truncated",
    "byteTruncated",
    "omittedItems",
    "omittedRawFragments",
    "truncatedRawFragments",
    "packetOmissions",
    "packetFallback",
  ];
  return (
    onlyKeys(disclosure, allowed) &&
    disclosure.packetByteBudget === 49_152 &&
    Number.isFinite(disclosure.byteBudget) &&
    Number(disclosure.byteBudget) <= maxBytes &&
    Number(disclosure.byteBudget) >= 2_048 &&
    disclosure.emittedBytes === actualBytes &&
    actualBytes <= Number(disclosure.byteBudget) &&
    disclosure.itemBudgetPerSection === 12 &&
    disclosure.analyzedItemBudgetPerSection === 4_096 &&
    disclosure.textCharacterBudget === 200 &&
    typeof disclosure.truncated === "boolean" &&
    typeof disclosure.byteTruncated === "boolean" &&
    nonnegativeInteger(disclosure.omittedItems) &&
    nonnegativeInteger(disclosure.omittedRawFragments) &&
    nonnegativeInteger(disclosure.truncatedRawFragments) &&
    exactNumberRecord(disclosure.packetOmissions, ["impactFiles", "nextReads", "limitations"]) &&
    (disclosure.packetFallback === undefined || typeof disclosure.packetFallback === "boolean")
  );
}

function validDiagnostics(value: unknown): boolean {
  const diagnostics = record(value);
  const timings = record(diagnostics?.timingsMs);
  const redaction = record(diagnostics?.redaction);
  return !!(
    diagnostics &&
    onlyKeys(diagnostics, ["timingsMs", "subcalls", "redaction", "rawFragmentBudgetBytes"]) &&
    timings &&
    onlyKeys(timings, ["total", "ontologySeed"]) &&
    Object.values(timings).every(Number.isFinite) &&
    Array.isArray(diagnostics.subcalls) &&
    diagnostics.subcalls.length <= 3 &&
    diagnostics.subcalls.every(validSubcall) &&
    redaction &&
    onlyKeys(redaction, [
      "policy",
      "absolutePaths",
      "secrets",
      "environment",
      "stackTraces",
      "connectionCredentials",
    ]) &&
    Object.values(redaction).every((entry) => typeof entry === "string") &&
    diagnostics.rawFragmentBudgetBytes === 768
  );
}

function validSubcall(value: unknown): boolean {
  const subcall = record(value);
  return !!(
    subcall &&
    onlyKeys(subcall, [
      "name",
      "status",
      "input",
      "elapsedMs",
      "backendDiagnostics",
      "shapeValidationFailures",
      "rawFragments",
    ]) &&
    ["find_definition", "build_symbol_map", "graph_expand"].includes(String(subcall.name)) &&
    ["ok", "error_result", "unstructured_result", "threw"].includes(String(subcall.status)) &&
    validSubcallInput(subcall.input) &&
    optionalNumber(subcall.elapsedMs) &&
    validBackendDiagnostics(subcall.backendDiagnostics) &&
    Array.isArray(subcall.shapeValidationFailures) &&
    subcall.shapeValidationFailures.length <= 8 &&
    subcall.shapeValidationFailures.every(validShapeFailure) &&
    Array.isArray(subcall.rawFragments) &&
    subcall.rawFragments.length <= 1 &&
    subcall.rawFragments.every(validRawFragment)
  );
}

function validSubcallInput(value: unknown): boolean {
  const input = record(value);
  return !!(
    input &&
    onlyKeys(input, [
      "symbol",
      "file",
      "precise",
      "maxResults",
      "maxFiles",
      "astOnly",
      "edges",
      "depth",
      "limit",
    ]) &&
    Object.values(input).every(
      (entry) =>
        typeof entry === "string" ||
        typeof entry === "number" ||
        typeof entry === "boolean" ||
        stringArray(entry, 8),
    )
  );
}

function validBackendDiagnostics(value: unknown): boolean {
  const diagnostics = record(value);
  return !!(
    diagnostics &&
    onlyKeys(diagnostics, [
      "backend",
      "fallback",
      "partial",
      "degraded",
      "count",
      "hasImpactEvidence",
    ]) &&
    optionalString(diagnostics.backend, 80) &&
    ["fallback", "partial", "degraded", "hasImpactEvidence"].every(
      (key) => diagnostics[key] === undefined || typeof diagnostics[key] === "boolean",
    ) &&
    optionalNumber(diagnostics.count)
  );
}

function validShapeFailure(value: unknown): boolean {
  const failure = record(value);
  return !!(
    failure &&
    onlyKeys(failure, ["code", "section", "count"]) &&
    (failure.code === "invalid_item_shape" || failure.code === "outside_workspace_path") &&
    typeof failure.section === "string" &&
    nonnegativeInteger(failure.count)
  );
}

function validRawFragment(value: unknown): boolean {
  const fragment = record(value);
  const omissions = record(fragment?.omissions);
  return !!(
    fragment &&
    onlyKeys(fragment, [
      "sourcePath",
      "encoding",
      "text",
      "sampledSourceBytes",
      "sourceMeasurementTruncated",
      "emittedBytes",
      "truncated",
      "omissions",
      "redactedValues",
    ]) &&
    fragment.sourcePath === "$" &&
    fragment.encoding === "json" &&
    typeof fragment.text === "string" &&
    Buffer.byteLength(fragment.text, "utf8") <= 768 &&
    fragment.emittedBytes === Buffer.byteLength(fragment.text, "utf8") &&
    nonnegativeInteger(fragment.sampledSourceBytes) &&
    typeof fragment.sourceMeasurementTruncated === "boolean" &&
    typeof fragment.truncated === "boolean" &&
    omissions &&
    exactNumberRecord(omissions, [
      "arrayItems",
      "objectFields",
      "depthNodes",
      "nodeBudget",
      "textValues",
    ]) &&
    nonnegativeInteger(fragment.redactedValues)
  );
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

function optionalString(value: unknown, max: number): boolean {
  return value === undefined || (typeof value === "string" && value.length <= max);
}

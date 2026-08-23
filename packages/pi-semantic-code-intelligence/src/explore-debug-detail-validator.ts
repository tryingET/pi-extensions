import {
  boundedByteBudget,
  EDGE_NAMES,
  exactKeys,
  exactNumberRecord,
  nonnegativeInteger,
  onlyKeys,
  optionalString,
  packetOmissionCount,
  positiveInteger,
  record,
  SECTION_NAMES,
  stringArray,
  sumValues,
  validLocation,
  validOmissions,
  validPacketOmissions,
  validProvenanceSummary,
} from "./explore-detail-shared.ts";

export function validDebugExploreDetails(value: unknown): boolean {
  const details = record(value);
  const disclosure = record(details?.disclosure);
  const detailBytes = details ? Buffer.byteLength(JSON.stringify(details), "utf8") : 0;
  if (
    !details ||
    !onlyKeys(details, [
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
      "diagnostics",
    ]) ||
    details.schemaVersion !== 1 ||
    details.mode !== "debug" ||
    !validSection(details.definitions) ||
    !validSection(details.declarations) ||
    !validSection(details.references) ||
    !validDebugGraph(details.graph) ||
    !validDebugProvenance(details.provenance) ||
    !validCounts(details.counts, details) ||
    !stringArray(details.limitations, 8) ||
    !validDebugDisclosure(disclosure, detailBytes) ||
    !validDiagnostics(details.diagnostics)
  ) {
    return false;
  }
  const omittedBySection = debugOmittedBySection(details);
  if (sumValues(omittedBySection) !== Number(disclosure?.omittedItems)) return false;
  return validOmissions(
    details.omissions,
    omittedBySection,
    disclosure?.byteTruncated === true,
    true,
    debugOmittedByReason(details, disclosure?.byteTruncated === true),
  );
}

function validSection(value: unknown): boolean {
  const section = record(value);
  const failures = record(section?.shapeFailures);
  if (
    !section ||
    !onlyKeys(section, ["count", "emitted", "omitted", "truncated", "items", "shapeFailures"]) ||
    !nonnegativeInteger(section.count) ||
    !nonnegativeInteger(section.emitted) ||
    !nonnegativeInteger(section.omitted) ||
    Number(section.count) !== Number(section.emitted) + Number(section.omitted) ||
    typeof section.truncated !== "boolean" ||
    section.truncated !== Number(section.omitted) > 0 ||
    !Array.isArray(section.items) ||
    section.items.length !== Number(section.emitted) ||
    section.items.length > 12 ||
    !section.items.every(validLocation) ||
    !failures ||
    !exactKeys(failures, ["invalid", "outsideWorkspace"]) ||
    !nonnegativeInteger(failures.invalid) ||
    !nonnegativeInteger(failures.outsideWorkspace)
  ) {
    return false;
  }
  return Number(failures.invalid) + Number(failures.outsideWorkspace) <= Number(section.omitted);
}

function validDebugGraph(value: unknown): boolean {
  const graph = record(value);
  const edges = record(graph?.edges);
  if (
    !graph ||
    !onlyKeys(graph, [
      "hasImpactEvidence",
      "observedImpact",
      "usableImpact",
      "observedItems",
      "usableItems",
      "edges",
    ]) ||
    typeof graph.hasImpactEvidence !== "boolean" ||
    typeof graph.observedImpact !== "boolean" ||
    typeof graph.usableImpact !== "boolean" ||
    graph.hasImpactEvidence !== graph.usableImpact ||
    (graph.usableImpact === true && graph.observedImpact !== true) ||
    !edges ||
    !exactKeys(edges, EDGE_NAMES) ||
    !EDGE_NAMES.every((key) => validSection(edges[key]))
  ) {
    return false;
  }
  const hasObservedItems = Object.hasOwn(graph, "observedItems");
  const hasUsableItems = Object.hasOwn(graph, "usableItems");
  if (hasObservedItems !== hasUsableItems) return false;
  if (!hasObservedItems) return true;
  if (
    !nonnegativeInteger(graph.observedItems) ||
    !nonnegativeInteger(graph.usableItems) ||
    Number(graph.usableItems) > Number(graph.observedItems)
  ) {
    return false;
  }
  const observed = EDGE_NAMES.reduce((sum, edge) => sum + Number(record(edges[edge])?.count), 0);
  const usable = EDGE_NAMES.reduce((sum, edge) => sum + Number(record(edges[edge])?.emitted), 0);
  return (
    observed === Number(graph.observedItems) &&
    usable === Number(graph.usableItems) &&
    graph.usableImpact === usable > 0 &&
    (observed === 0 || graph.observedImpact === true)
  );
}

function validDebugProvenance(value: unknown): boolean {
  const provenance = record(value);
  return !!(
    provenance &&
    exactKeys(provenance, ["definitionLookup", "symbolMap", "graph"]) &&
    ["definitionLookup", "symbolMap", "graph"].every((key) =>
      validProvenanceSummary(provenance[key], false),
    )
  );
}

function validCounts(value: unknown, details: Record<string, unknown>): boolean {
  const counts = record(value);
  if (!counts || !exactKeys(counts, SECTION_NAMES)) return false;
  const sections = debugSections(details);
  return Object.entries(counts).every(([name, entry]) => {
    if (!exactNumberRecord(entry, ["observed", "emitted"])) return false;
    const section = sections[name];
    const count = record(entry);
    return count?.observed === section?.count && count?.emitted === section?.emitted;
  });
}

function validDebugDisclosure(
  disclosure: Record<string, unknown> | undefined,
  actualBytes: number,
): boolean {
  if (
    !disclosure ||
    !onlyKeys(disclosure, [
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
    ]) ||
    disclosure.packetByteBudget !== 49_152 ||
    !boundedByteBudget(disclosure.byteBudget, 36_864) ||
    !nonnegativeInteger(disclosure.emittedBytes) ||
    disclosure.emittedBytes !== actualBytes ||
    actualBytes > Number(disclosure.byteBudget) ||
    disclosure.itemBudgetPerSection !== 12 ||
    disclosure.analyzedItemBudgetPerSection !== 4_096 ||
    disclosure.textCharacterBudget !== 200 ||
    typeof disclosure.truncated !== "boolean" ||
    typeof disclosure.byteTruncated !== "boolean" ||
    !nonnegativeInteger(disclosure.omittedItems) ||
    !nonnegativeInteger(disclosure.omittedRawFragments) ||
    !nonnegativeInteger(disclosure.truncatedRawFragments) ||
    !validPacketOmissions(disclosure.packetOmissions) ||
    (disclosure.packetFallback !== undefined && disclosure.packetFallback !== true)
  ) {
    return false;
  }
  const truncated =
    disclosure.byteTruncated === true ||
    Number(disclosure.omittedItems) > 0 ||
    Number(disclosure.omittedRawFragments) > 0 ||
    Number(disclosure.truncatedRawFragments) > 0 ||
    disclosure.packetFallback === true ||
    packetOmissionCount(disclosure.packetOmissions) > 0;
  return disclosure.truncated === truncated;
}

function validDiagnostics(value: unknown): boolean {
  const diagnostics = record(value);
  const timings = record(diagnostics?.timingsMs);
  const redaction = record(diagnostics?.redaction);
  if (
    !diagnostics ||
    !onlyKeys(diagnostics, ["timingsMs", "subcalls", "redaction", "rawFragmentBudgetBytes"]) ||
    !timings ||
    !onlyKeys(timings, ["total", "ontologySeed"]) ||
    !Object.values(timings).every((entry) => Number.isFinite(entry) && Number(entry) >= 0) ||
    !Array.isArray(diagnostics.subcalls) ||
    diagnostics.subcalls.length > 3 ||
    !diagnostics.subcalls.every(validSubcall) ||
    new Set(diagnostics.subcalls.map((subcall) => record(subcall)?.name)).size !==
      diagnostics.subcalls.length ||
    !redaction ||
    !exactKeys(redaction, [
      "policy",
      "absolutePaths",
      "secrets",
      "environment",
      "stackTraces",
      "connectionCredentials",
    ]) ||
    redaction.policy !== "bounded-allowlisted-shape-and-sensitive-value-redaction" ||
    redaction.absolutePaths !== "workspace-relative-or-redacted" ||
    redaction.secrets !== "redacted" ||
    redaction.environment !== "redacted-or-not-collected" ||
    redaction.stackTraces !== "redacted" ||
    redaction.connectionCredentials !== "redacted" ||
    diagnostics.rawFragmentBudgetBytes !== 768
  ) {
    return false;
  }
  return true;
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
    (subcall.elapsedMs === undefined ||
      (Number.isFinite(subcall.elapsedMs) && Number(subcall.elapsedMs) >= 0)) &&
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
        typeof entry === "boolean" ||
        nonnegativeInteger(entry) ||
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
    (diagnostics.count === undefined || nonnegativeInteger(diagnostics.count))
  );
}

function validShapeFailure(value: unknown): boolean {
  const failure = record(value);
  return !!(
    failure &&
    onlyKeys(failure, ["code", "section", "count"]) &&
    (failure.code === "invalid_item_shape" || failure.code === "outside_workspace_path") &&
    typeof failure.section === "string" &&
    SECTION_NAMES.includes(failure.section as (typeof SECTION_NAMES)[number]) &&
    positiveInteger(failure.count)
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
    nonnegativeInteger(fragment.emittedBytes) &&
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

function debugOmittedBySection(details: Record<string, unknown>): Record<string, number> {
  return Object.fromEntries(
    Object.entries(debugSections(details)).map(([name, section]) => [
      name,
      Number(section?.omitted),
    ]),
  );
}

function debugOmittedByReason(
  details: Record<string, unknown>,
  byteTruncated: boolean,
): Record<string, number> {
  const receipts: Record<string, number> = {};
  for (const [name, section] of Object.entries(debugSections(details))) {
    const failures = record(section.shapeFailures);
    const invalid = Number(failures?.invalid);
    const outsideWorkspace = Number(failures?.outsideWorkspace);
    const itemBudget = Number(section.omitted) - invalid - outsideWorkspace;
    if (itemBudget > 0) receipts[`${name}:item_budget`] = itemBudget;
    if (invalid > 0) receipts[`${name}:invalid_shape`] = invalid;
    if (outsideWorkspace > 0) receipts[`${name}:outside_workspace`] = outsideWorkspace;
  }
  if (byteTruncated) receipts["details:byte_budget"] = 1;
  return receipts;
}

function debugSections(details: Record<string, unknown>): Record<string, Record<string, unknown>> {
  const edges = record(record(details.graph)?.edges);
  return {
    definitions: record(details.definitions) ?? {},
    declarations: record(details.declarations) ?? {},
    references: record(details.references) ?? {},
    "graph.exports": record(edges?.exports) ?? {},
    "graph.callers": record(edges?.callers) ?? {},
    "graph.imports": record(edges?.imports) ?? {},
    "graph.callees": record(edges?.callees) ?? {},
  };
}

import {
  boundedByteBudget,
  EDGE_NAMES,
  nonnegativeInteger,
  onlyKeys,
  packetOmissionCount,
  record,
  SECTION_NAMES,
  sumValues,
  validLocation,
  validOmissions,
  validOptionalPacketOmissions,
  validProvenanceSummary,
} from "./explore-detail-shared.ts";

export function validStandardExploreDetails(value: unknown): boolean {
  const details = record(value);
  const evidence = record(details?.evidence);
  const disclosure = record(details?.disclosure);
  const detailBytes = details ? Buffer.byteLength(JSON.stringify(details), "utf8") : 0;
  if (
    !details ||
    !evidence ||
    !onlyKeys(details, [
      "schemaVersion",
      "mode",
      "evidence",
      "provenance",
      "omissions",
      "disclosure",
    ]) ||
    details.schemaVersion !== 2 ||
    details.mode !== "standard" ||
    !validStandardEvidence(
      evidence,
      disclosure?.byteTruncated === true || disclosure?.packetFallback === true,
    ) ||
    !validSparseProvenance(details.provenance) ||
    !validStandardDisclosure(disclosure, detailBytes)
  ) {
    return false;
  }

  const omittedBySection = standardOmittedBySection(evidence);
  if (Number(disclosure?.omittedItems) !== sumValues(omittedBySection)) return false;
  const total = sumValues(omittedBySection);
  if (details.omissions === undefined) {
    return total === 0 && disclosure?.byteTruncated !== true;
  }
  return validOmissions(
    details.omissions,
    omittedBySection,
    disclosure?.byteTruncated === true,
    false,
  );
}

function validStandardEvidence(
  evidence: Record<string, unknown> | undefined,
  allowEmergencyImpact: boolean,
): boolean {
  if (!evidence || !onlyKeys(evidence, ["definitions", "declarations", "references", "graph"])) {
    return false;
  }
  for (const name of ["definitions", "declarations", "references"] as const) {
    if (evidence[name] !== undefined && !validSparseSection(evidence[name])) return false;
  }
  return evidence.graph === undefined || validSparseGraph(evidence.graph, allowEmergencyImpact);
}

function validSparseSection(value: unknown): boolean {
  const section = record(value);
  if (
    !section ||
    !onlyKeys(section, ["observed", "usable", "omitted", "items"]) ||
    !nonnegativeInteger(section.observed) ||
    !nonnegativeInteger(section.usable) ||
    Number(section.observed) < 1 ||
    Number(section.usable) > Number(section.observed) ||
    Number(section.usable) > 12
  ) {
    return false;
  }
  const omitted = Number(section.observed) - Number(section.usable);
  if (
    (omitted > 0 && section.omitted !== omitted) ||
    (omitted === 0 && section.omitted !== undefined)
  ) {
    return false;
  }
  if (Number(section.usable) === 0) return section.items === undefined;
  return (
    Array.isArray(section.items) &&
    section.items.length === Number(section.usable) &&
    section.items.every(validLocation)
  );
}

function validSparseGraph(value: unknown, allowEmergencyImpact: boolean): boolean {
  const graph = record(value);
  const edges = record(graph?.edges);
  if (
    !graph ||
    !onlyKeys(graph, ["observedImpact", "usableImpact", "observedItems", "usableItems", "edges"]) ||
    graph.observedImpact !== true ||
    typeof graph.usableImpact !== "boolean" ||
    !nonnegativeInteger(graph.observedItems) ||
    !nonnegativeInteger(graph.usableItems) ||
    Number(graph.usableItems) > Number(graph.observedItems)
  ) {
    return false;
  }
  if (edges) {
    if (!onlyKeys(edges, EDGE_NAMES) || Object.keys(edges).length === 0) return false;
    if (!Object.values(edges).every(validSparseSection)) return false;
  } else if (graph.edges !== undefined) {
    return false;
  }
  const edgeValues = edges ? Object.values(edges) : [];
  const observed = edgeValues.reduce<number>(
    (sum, edge) => sum + Number(record(edge)?.observed),
    0,
  );
  const usable = edgeValues.reduce<number>((sum, edge) => sum + Number(record(edge)?.usable), 0);
  if (
    observed !== Number(graph.observedItems) ||
    usable !== Number(graph.usableItems) ||
    (usable > 0 && graph.usableImpact !== true)
  ) {
    return false;
  }
  return usable > 0 || graph.usableImpact === false || allowEmergencyImpact;
}

function validSparseProvenance(value: unknown): boolean {
  if (value === undefined) return true;
  const provenance = record(value);
  return !!(
    provenance &&
    Object.keys(provenance).length > 0 &&
    onlyKeys(provenance, ["definitionLookup", "symbolMap", "graph"]) &&
    Object.values(provenance).every((summary) => validProvenanceSummary(summary, true))
  );
}

function validStandardDisclosure(
  disclosure: Record<string, unknown> | undefined,
  actualBytes: number,
): boolean {
  if (
    !disclosure ||
    !onlyKeys(disclosure, [
      "packetByteBudget",
      "byteBudget",
      "emittedBytes",
      "truncated",
      "byteTruncated",
      "omittedItems",
      "packetFallback",
      "packetOmissions",
    ]) ||
    disclosure.packetByteBudget !== 49_152 ||
    !boundedByteBudget(disclosure.byteBudget, 24_576) ||
    !nonnegativeInteger(disclosure.emittedBytes) ||
    disclosure.emittedBytes !== actualBytes ||
    actualBytes > Number(disclosure.byteBudget) ||
    typeof disclosure.truncated !== "boolean" ||
    typeof disclosure.byteTruncated !== "boolean" ||
    !nonnegativeInteger(disclosure.omittedItems) ||
    (disclosure.packetFallback !== undefined && disclosure.packetFallback !== true) ||
    !validOptionalPacketOmissions(disclosure.packetOmissions)
  ) {
    return false;
  }
  const truncated =
    disclosure.byteTruncated === true ||
    Number(disclosure.omittedItems) > 0 ||
    disclosure.packetFallback === true ||
    packetOmissionCount(disclosure.packetOmissions) > 0;
  return disclosure.truncated === truncated;
}

function standardOmittedBySection(evidence: Record<string, unknown>): Record<string, number> {
  const omitted: Record<string, number> = {};
  for (const name of ["definitions", "declarations", "references"] as const) {
    omitted[name] = Number(record(evidence[name])?.omitted ?? 0);
  }
  const edges = record(record(evidence.graph)?.edges);
  for (const edge of EDGE_NAMES) {
    omitted[`graph.${edge}`] = Number(record(edges?.[edge])?.omitted ?? 0);
  }
  for (const name of SECTION_NAMES) omitted[name] ??= 0;
  return omitted;
}

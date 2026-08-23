import type { ExploreMode } from "./explore-result-validator.ts";

const RISK_SIGNAL_NAMES = ["publicApi", "state", "registry", "tests"] as const;
const SECTION_NAMES = ["definitions", "declarations", "references"] as const;
const GRAPH_EDGE_NAMES = ["exports", "callers", "imports", "callees"] as const;

export interface ProjectedEvidence {
  value: Record<string, unknown>;
  itemCount: number;
  selectedItemCount: number;
}

export interface ProjectedDiagnostics {
  value: Record<string, unknown>;
  rawFragmentCount: number;
}

export function projectNormalizedEvidence(
  details: Record<string, unknown> | undefined,
  mode: ExploreMode,
): ProjectedEvidence | undefined {
  if (mode === "compact" || !details) return undefined;
  const source = mode === "standard" ? record(details.evidence) : details;
  if (!source) return undefined;
  const sections: Record<string, unknown> = {};
  const highlights: unknown[] = [];
  let itemCount = 0;
  for (const name of SECTION_NAMES) {
    const section = record(source[name]);
    if (!section) continue;
    const counts = sectionCounts(section, mode);
    if (Object.values(counts).some((count) => count > 0)) sections[name] = counts;
    itemCount += collectHighlights(highlights, array(section.items), name);
  }

  const graph = record(source.graph);
  const edges = record(graph?.edges);
  const graphEdges: Record<string, unknown> = {};
  for (const edge of GRAPH_EDGE_NAMES) {
    const section = record(edges?.[edge]);
    if (!section) continue;
    const counts = sectionCounts(section, mode);
    if (Object.values(counts).some((count) => count > 0)) graphEdges[edge] = counts;
    itemCount += collectHighlights(highlights, array(section.items), `graph.${edge}`);
  }
  return {
    value: {
      schemaVersion: mode === "standard" ? 2 : 1,
      sections,
      ...(graph
        ? {
            graph: {
              observedImpact: graph.observedImpact === true,
              usableImpact: graph.usableImpact === true,
              observedItems:
                mode === "standard"
                  ? safeCount(graph.observedItems)
                  : graphObserved(edges, "count"),
              usableItems:
                mode === "standard"
                  ? safeCount(graph.usableItems)
                  : graphObserved(edges, "emitted"),
              edges: graphEdges,
            },
          }
        : {}),
      highlights,
      omissions: array(details.omissions).map((entry) => {
        const omission = record(entry);
        return {
          section: boundedText(omission?.section, 40),
          reason: boundedText(omission?.reason, 40),
          count: safeCount(omission?.count),
        };
      }),
    },
    itemCount,
    selectedItemCount: highlights.length,
  };
}

export function projectDebugDiagnostics(
  details: Record<string, unknown> | undefined,
): ProjectedDiagnostics | undefined {
  const diagnostics = record(details?.diagnostics);
  if (!diagnostics) return undefined;
  const subcalls = array(diagnostics.subcalls).map((entry) => {
    const subcall = record(entry);
    return {
      name: boundedText(subcall?.name, 40),
      status: boundedText(subcall?.status, 40),
      ...(Number.isFinite(subcall?.elapsedMs) ? { elapsedMs: Number(subcall?.elapsedMs) } : {}),
      shapeValidationFailures: array(subcall?.shapeValidationFailures).map((failure) => {
        const receipt = record(failure);
        return {
          code: boundedText(receipt?.code, 40),
          section: boundedText(receipt?.section, 40),
          count: safeCount(receipt?.count),
        };
      }),
      rawFragmentsOmittedFromModel: array(subcall?.rawFragments).length,
    };
  });
  return {
    value: {
      label: "bounded debug diagnostics",
      timingsMs: record(diagnostics.timingsMs) ?? {},
      subcalls,
      disclosure: {
        omittedRawFragments: safeCount(record(details?.disclosure)?.omittedRawFragments),
        truncatedRawFragments: safeCount(record(details?.disclosure)?.truncatedRawFragments),
      },
    },
    rawFragmentCount: subcalls.reduce(
      (sum, subcall) => sum + subcall.rawFragmentsOmittedFromModel,
      0,
    ),
  };
}

export function projectRiskSignals(value: unknown): Record<string, unknown> {
  const signals = record(value);
  return Object.fromEntries(
    RISK_SIGNAL_NAMES.map((name) => {
      const signal = record(signals?.[name]);
      return [
        name,
        {
          detected: signal?.detected === true,
          status: boundedText(signal?.status, 24),
          confidence: boundedText(signal?.confidence, 24),
          files: boundedStrings(signal?.files, 4, 1_024),
          hiddenFiles: safeCount(signal?.hiddenFiles),
          provenance: boundedStrings(signal?.provenance, 4, 80),
        },
      ];
    }),
  );
}

function collectHighlights(target: unknown[], items: unknown[], section: string): number {
  for (const item of items) {
    if (target.length >= 8) break;
    target.push({ section, ...projectLocation(item) });
  }
  return items.length;
}

function projectLocation(value: unknown): Record<string, unknown> {
  const item = record(value);
  return {
    path: boundedText(item?.path, 1_024),
    ...(Number.isFinite(item?.line) ? { line: Number(item?.line) } : {}),
    ...(Number.isFinite(item?.character) ? { character: Number(item?.character) } : {}),
    ...(typeof item?.kind === "string" ? { kind: boundedText(item.kind, 80) } : {}),
    ...(typeof item?.symbol === "string" ? { symbol: boundedText(item.symbol, 80) } : {}),
    ...(typeof item?.caller === "string" ? { caller: boundedText(item.caller, 80) } : {}),
  };
}

function sectionCounts(
  section: Record<string, unknown>,
  mode: Exclude<ExploreMode, "compact">,
): Record<string, number> {
  return {
    observed: safeCount(mode === "standard" ? section.observed : section.count),
    usable: safeCount(mode === "standard" ? section.usable : section.emitted),
    omitted: safeCount(section.omitted),
  };
}

function graphObserved(edges: Record<string, unknown> | undefined, field: string): number {
  return GRAPH_EDGE_NAMES.reduce((sum, edge) => sum + safeCount(record(edges?.[edge])?.[field]), 0);
}

function boundedStrings(value: unknown, maxItems: number, maxLength: number): string[] {
  return array(value)
    .filter((item): item is string => typeof item === "string")
    .slice(0, maxItems)
    .map((item) => boundedText(item, maxLength));
}

function boundedText(value: unknown, maxCodePoints: number): string {
  if (typeof value !== "string") return "";
  const points = Array.from(value);
  return points.length <= maxCodePoints ? value : `${points.slice(0, maxCodePoints - 1).join("")}…`;
}

function safeCount(value: unknown): number {
  return Number.isSafeInteger(value) && Number(value) >= 0 ? Number(value) : 0;
}

function array(value: unknown): unknown[] {
  return Array.isArray(value) ? value : [];
}

function record(value: unknown): Record<string, unknown> | undefined {
  return value && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : undefined;
}

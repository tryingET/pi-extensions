import { DEFAULT_MAX_BYTES } from "@earendil-works/pi-coding-agent";

import {
  projectDebugDiagnostics,
  projectNormalizedEvidence,
  projectRiskSignals,
} from "./explore-model-evidence.ts";

import { type ExploreMode, validExplorePayload } from "./explore-result-validator.ts";
import { sanitizeProducerDisclosure } from "./producer-disclosure.ts";

export const EXPLORE_OPERATOR_ENTRY_TYPE = "pi-sci-explore-operator-v1";
export const EXPLORE_MODEL_BUDGET_BYTES = 12_288;
export const EXPLORE_RESTORE_VISIT_LIMIT = 512;

const RISK_SIGNAL_NAMES = ["publicApi", "state", "registry", "tests"] as const;

export interface ExploreOperatorEntry {
  schema: "pi.sci_explore_operator.v1";
  toolCallId: string;
  requestedMode: ExploreMode;
  producerBytes: number;
  packet: Record<string, unknown>;
}

export interface ExploreResultSummary {
  requestedMode: ExploreMode;
  status: string;
  symbol: string;
  degraded: boolean;
  riskLevel?: string;
  totalFiles?: number;
  emittedFiles?: number;
  graphObserved: boolean;
  graphUsable: boolean;
  graphObservedItems: number;
  graphUsableItems: number;
  nextAction?: string;
}

export interface ExplorePresentation {
  modelText: string;
  modelBytes: number;
  operatorEntry: ExploreOperatorEntry;
  summary: ExploreResultSummary;
}

export function createExplorePresentation(
  packet: Record<string, unknown>,
  requestedMode: ExploreMode,
  toolCallId: string,
): ExplorePresentation | undefined {
  if (!validExplorePayload(packet, requestedMode)) return undefined;
  const producerBytes = Buffer.byteLength(JSON.stringify(packet), "utf8");
  if (producerBytes > DEFAULT_MAX_BYTES || toolCallId.length === 0 || toolCallId.length > 256) {
    return undefined;
  }
  const operatorEntry: ExploreOperatorEntry = {
    schema: "pi.sci_explore_operator.v1",
    toolCallId,
    requestedMode,
    producerBytes,
    packet: structuredClone(packet),
  };
  const modelText = buildModelProjection(packet, requestedMode);
  return {
    modelText,
    modelBytes: Buffer.byteLength(modelText, "utf8"),
    operatorEntry,
    summary: summarizeExplorePacket(packet, requestedMode),
  };
}

export function restoreExploreOperatorEntry(
  value: unknown,
  workspace: string,
): ExploreOperatorEntry | undefined {
  try {
    return restoreExploreOperatorEntryUnchecked(value, workspace);
  } catch {
    return undefined;
  }
}

export function restoreExploreOperatorEntries(
  branch: readonly unknown[],
  workspace: string,
): ExploreOperatorEntry[] {
  const restored: ExploreOperatorEntry[] = [];
  let visited = 0;
  for (
    let index = branch.length - 1;
    index >= 0 && visited < EXPLORE_RESTORE_VISIT_LIMIT && restored.length < 128;
    index -= 1
  ) {
    visited += 1;
    try {
      const entry = record(branch[index]);
      if (entry?.type !== "custom" || entry.customType !== EXPLORE_OPERATOR_ENTRY_TYPE) continue;
      const operatorEntry = restoreExploreOperatorEntry(entry.data, workspace);
      if (operatorEntry) restored.push(operatorEntry);
    } catch {
      // Malformed historical entries are omitted fail-closed.
    }
  }
  return restored.reverse();
}

function restoreExploreOperatorEntryUnchecked(
  value: unknown,
  workspace: string,
): ExploreOperatorEntry | undefined {
  const entry = record(value);
  const packet = record(entry?.packet);
  if (
    !entry ||
    !onlyKeys(entry, ["schema", "toolCallId", "requestedMode", "producerBytes", "packet"]) ||
    entry.schema !== "pi.sci_explore_operator.v1" ||
    typeof entry.toolCallId !== "string" ||
    entry.toolCallId.length === 0 ||
    entry.toolCallId.length > 256 ||
    !validMode(entry.requestedMode) ||
    !Number.isSafeInteger(entry.producerBytes) ||
    Number(entry.producerBytes) < 0 ||
    Number(entry.producerBytes) > DEFAULT_MAX_BYTES ||
    !packet ||
    !validExplorePayload(packet, entry.requestedMode)
  ) {
    return undefined;
  }
  const safePacket = structuredClone(packet);
  const disclosure = sanitizeProducerDisclosure(safePacket, "explore_symbol_impact", workspace);
  if (
    !disclosure.ok ||
    disclosure.changed ||
    !validExplorePayload(safePacket, entry.requestedMode)
  ) {
    return undefined;
  }
  const serialized = JSON.stringify(safePacket);
  if (typeof serialized !== "string") return undefined;
  const producerBytes = Buffer.byteLength(serialized, "utf8");
  if (producerBytes !== entry.producerBytes || producerBytes > DEFAULT_MAX_BYTES) return undefined;
  return {
    schema: "pi.sci_explore_operator.v1",
    toolCallId: entry.toolCallId,
    requestedMode: entry.requestedMode,
    producerBytes,
    packet: safePacket,
  };
}

export function summarizeExplorePacket(
  packet: Record<string, unknown>,
  requestedMode: ExploreMode,
): ExploreResultSummary {
  const impact = record(packet.impact);
  const risk = record(packet.editRisk);
  const detail = record(packet.details);
  const evidence = record(detail?.evidence);
  const detailGraph = record(
    requestedMode === "standard"
      ? evidence?.graph
      : requestedMode === "debug"
        ? detail?.graph
        : undefined,
  );
  const compactEvidence = record(packet.evidence);
  const next = record(array(packet.nextReads)[0]);
  const graphObservedItems = graphCount(detailGraph, "observedItems", "count");
  const graphUsableItems = graphCount(detailGraph, "usableItems", "emitted");
  return {
    requestedMode,
    status: typeof packet.status === "string" ? packet.status : "indeterminate",
    symbol: typeof packet.symbol === "string" ? packet.symbol : "",
    degraded: packet.degraded === true,
    ...(typeof risk?.level === "string" ? { riskLevel: risk.level } : {}),
    ...(Number.isSafeInteger(impact?.totalFiles) ? { totalFiles: Number(impact?.totalFiles) } : {}),
    ...(Array.isArray(impact?.files) ? { emittedFiles: impact.files.length } : {}),
    graphObserved: detailGraph?.observedImpact === true || compactEvidence?.graphImpact === true,
    graphUsable: detailGraph?.usableImpact === true || compactEvidence?.graphImpact === true,
    graphObservedItems,
    graphUsableItems,
    ...(typeof next?.action === "string"
      ? { nextAction: next.action }
      : typeof next?.path === "string"
        ? { nextAction: "read" }
        : {}),
  };
}

function buildModelProjection(packet: Record<string, unknown>, requestedMode: ExploreMode): string {
  const status = String(packet.status);
  const confirmed = packet.ok === true && status === "confirmed";
  const impact = record(packet.impact);
  const impactFiles = array(impact?.files).slice(0, 8).map(projectImpactFile);
  const impactTotal = safeCount(impact?.totalFiles);
  const risk = record(packet.editRisk);
  const riskReasons = boundedStrings(risk?.reasons, 4, 200);
  const projectedRiskSignals = projectRiskSignals(risk?.signals);
  const sourceRiskSignals = record(risk?.signals);
  const omittedRiskSignalFiles = RISK_SIGNAL_NAMES.reduce(
    (sum, name) =>
      sum +
      Math.max(
        0,
        array(record(sourceRiskSignals?.[name])?.files).length -
          array(record(projectedRiskSignals[name])?.files).length,
      ),
    0,
  );
  const nextReads = array(packet.nextReads);
  const nextAction = projectNextAction(nextReads[0]);
  const detail = record(packet.details);
  const normalizedEvidence = projectNormalizedEvidence(detail, requestedMode);
  const debugDiagnostics = requestedMode === "debug" ? projectDebugDiagnostics(detail) : undefined;
  const evidenceItems = normalizedEvidence?.itemCount ?? 0;
  const selectedEvidenceItems = normalizedEvidence?.selectedItemCount ?? 0;
  const diagnosticRawFragments = debugDiagnostics?.rawFragmentCount ?? 0;
  const limitationCandidates = [
    ...array(packet.limitations),
    ...(requestedMode === "debug" ? array(detail?.limitations) : []),
  ];
  const semanticLimitations = uniqueBoundedStrings(limitationCandidates, 10, 240);
  const uniqueLimitationCount = new Set(
    limitationCandidates.filter((item): item is string => typeof item === "string"),
  ).size;
  const omissions: Record<string, number> = {
    impactFiles: Math.max(0, impactTotal - impactFiles.length),
    nextActions: Math.max(0, nextReads.length - (nextAction ? 1 : 0)),
    evidenceItems: Math.max(0, evidenceItems - selectedEvidenceItems),
    riskSignalFiles: omittedRiskSignalFiles,
    semanticLimitations: Math.max(0, uniqueLimitationCount - semanticLimitations.length),
    editRiskReasons: Math.max(0, array(risk?.reasons).length - riskReasons.length),
    diagnosticRawFragments,
  };
  const projection: Record<string, unknown> = {
    schema: "pi.sci_explore_model.v1",
    requestedMode,
    status,
    symbol: boundedText(packet.symbol, 256),
    ...(record(packet.workspace) ? { workspace: packet.workspace } : {}),
    ...(record(packet.state) ? { state: packet.state } : {}),
    decision: {
      definitionConfirmed: confirmed,
      editPlanning: confirmed ? "review_producer_edit_risk" : "blocked_until_definition_confirmed",
      degraded: packet.degraded === true,
    },
    ...(confirmed ? { definition: projectLocation(packet.definition) } : {}),
    ...(confirmed && impact
      ? {
          impact: {
            totalFiles: impactTotal,
            truncated: impact.truncated === true,
            files: impactFiles,
          },
        }
      : {}),
    ...(confirmed && risk
      ? {
          editRisk: {
            level: boundedText(risk.level, 24),
            reasons: riskReasons,
            signals: projectedRiskSignals,
          },
        }
      : {
          unconfirmedEvidence: projectUnconfirmedEvidence(packet.evidence),
          message: boundedText(packet.message, 400),
        }),
    ...(normalizedEvidence ? { normalizedEvidence: normalizedEvidence.value } : {}),
    ...(debugDiagnostics ? { debugDiagnostics: debugDiagnostics.value } : {}),
    semanticLimitations,
    nextAction,
    ...(Object.values(omissions).some((count) => count > 0)
      ? { projectionOmissions: omissions }
      : {}),
  };

  fitProjection(projection, omissions);
  if (
    Object.values(omissions).some((count) => count > 0) &&
    !Object.hasOwn(projection, "projectionOmissions")
  ) {
    projection.projectionOmissions = omissions;
    fitProjection(projection, omissions);
  }
  let text = JSON.stringify(projection);
  if (Buffer.byteLength(text, "utf8") <= EXPLORE_MODEL_BUDGET_BYTES) return text;

  const fallback = {
    schema: "pi.sci_explore_model.v1",
    workflow: "explore_symbol_impact",
    requestedMode,
    sourceStatus: status,
    symbol: boundedText(packet.symbol, 256),
    ...(record(packet.workspace) ? { workspace: packet.workspace } : {}),
    ...(record(packet.state) ? { state: packet.state } : {}),
    decision: {
      definitionConfirmed: confirmed,
      editPlanning: "blocked_by_model_projection_budget",
      degraded: true,
    },
    message:
      "Validated SCI evidence exceeded Pi's model projection budget; omitted evidence must not be used to plan edits.",
    nextAction,
    semanticLimitations: semanticLimitations.slice(0, 1),
    projection: {
      byteBudget: EXPLORE_MODEL_BUDGET_BYTES,
      fallback: true,
    },
  };
  text = JSON.stringify(fallback);
  return text;
}

function fitProjection(
  projection: Record<string, unknown>,
  omissions: Record<string, number>,
): void {
  const overBudget = () =>
    Buffer.byteLength(JSON.stringify(projection), "utf8") > EXPLORE_MODEL_BUDGET_BYTES;
  const evidence = record(projection.normalizedEvidence);
  const highlights = array(evidence?.highlights);
  while (overBudget() && highlights.length > 0) {
    highlights.pop();
    omissions.evidenceItems += 1;
  }
  const impactFiles = array(record(projection.impact)?.files);
  while (overBudget() && impactFiles.length > 1) {
    impactFiles.pop();
    omissions.impactFiles += 1;
  }
  const signals = record(record(projection.editRisk)?.signals);
  for (const name of RISK_SIGNAL_NAMES) {
    const files = array(record(signals?.[name])?.files);
    while (overBudget() && files.length > 1) {
      files.pop();
      omissions.riskSignalFiles += 1;
    }
  }
  const limitations = array(projection.semanticLimitations);
  while (overBudget() && limitations.length > 1) {
    limitations.pop();
    omissions.semanticLimitations += 1;
  }
  const reasons = array(record(projection.editRisk)?.reasons);
  while (overBudget() && reasons.length > 1) {
    reasons.pop();
    omissions.editRiskReasons += 1;
  }
}

function projectImpactFile(value: unknown): Record<string, unknown> {
  const item = record(value);
  return {
    path: boundedText(item?.path, 1_024),
    ...(record(item?.pathRef) ? { pathRef: item?.pathRef } : {}),
    ...(Number.isFinite(item?.line) ? { line: Number(item?.line) } : {}),
    ...(Number.isFinite(item?.score) ? { score: Number(item?.score) } : {}),
    reasons: boundedStrings(item?.reasons, 4, 120),
    signals: boundedStrings(item?.signals, 4, 80),
  };
}

function projectLocation(value: unknown): Record<string, unknown> {
  const item = record(value);
  return {
    path: boundedText(item?.path, 1_024),
    ...(record(item?.pathRef) ? { pathRef: item?.pathRef } : {}),
    ...(Number.isFinite(item?.line) ? { line: Number(item?.line) } : {}),
    ...(Number.isFinite(item?.character) ? { character: Number(item?.character) } : {}),
    ...(typeof item?.kind === "string" ? { kind: boundedText(item.kind, 80) } : {}),
    ...(typeof item?.symbol === "string" ? { symbol: boundedText(item.symbol, 80) } : {}),
    ...(typeof item?.caller === "string" ? { caller: boundedText(item.caller, 80) } : {}),
  };
}

function projectNextAction(value: unknown): Record<string, unknown> | null {
  const next = record(value);
  if (!next) return null;
  if (next.action === "locate_confirm_definition") {
    const args = record(next.arguments);
    return {
      action: "locate_confirm_definition",
      arguments: {
        symbol: boundedText(args?.symbol, 256),
        precise: true,
        ...(record(args?.workspace) ? { workspace: args?.workspace } : {}),
        ...(record(args?.state) ? { state: args?.state } : {}),
      },
      reason: boundedText(next.reason, 240),
    };
  }
  if (typeof next.path === "string") {
    return {
      action: "read",
      arguments: {
        path: boundedText(next.path, 1_024),
        ...(record(next.pathRef) ? { pathRef: next.pathRef } : {}),
        ...(Number.isFinite(next.line) ? { offset: Number(next.line) } : {}),
      },
      reason: boundedText(next.reason, 240),
    };
  }
  return null;
}

function projectUnconfirmedEvidence(value: unknown): Record<string, unknown> {
  const evidence = record(value);
  return {
    references: safeCount(evidence?.references),
    graphImpact: evidence?.graphImpact === true,
    partial: evidence?.partial === true,
  };
}

function validMode(value: unknown): value is ExploreMode {
  return value === "compact" || value === "standard" || value === "debug";
}

function boundedStrings(value: unknown, maxItems: number, maxLength: number): string[] {
  return array(value)
    .filter((item): item is string => typeof item === "string")
    .slice(0, maxItems)
    .map((item) => boundedText(item, maxLength));
}

function uniqueBoundedStrings(value: unknown[], maxItems: number, maxLength: number): string[] {
  return [...new Set(value.filter((item): item is string => typeof item === "string"))]
    .slice(0, maxItems)
    .map((item) => boundedText(item, maxLength));
}

function boundedText(value: unknown, maxCodePoints: number): string {
  if (typeof value !== "string") return "";
  const points = Array.from(value);
  return points.length <= maxCodePoints ? value : `${points.slice(0, maxCodePoints - 1).join("")}…`;
}

function graphCount(
  graph: Record<string, unknown> | undefined,
  directField: string,
  sectionField: string,
): number {
  if (Number.isSafeInteger(graph?.[directField])) return safeCount(graph?.[directField]);
  const edges = record(graph?.edges);
  return ["exports", "callers", "imports", "callees"].reduce(
    (sum, edge) => sum + safeCount(record(edges?.[edge])?.[sectionField]),
    0,
  );
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

function onlyKeys(value: Record<string, unknown>, allowed: readonly string[]): boolean {
  const expected = new Set(allowed);
  return (
    Object.keys(value).length === expected.size &&
    Object.keys(value).every((key) => expected.has(key))
  );
}

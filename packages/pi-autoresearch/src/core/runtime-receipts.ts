import { appendFileSync, existsSync, mkdirSync, readFileSync } from "node:fs";
import path from "node:path";

import { isCampaignDecision } from "../machine/events.ts";
import {
  AUTORESEARCH_NEXT_HYPOTHESIS_TEMPLATE_NAME,
  type AutoresearchDecisionFailureStage,
  type NextHypothesisDecisionStatus,
} from "./decisions.ts";
import type {
  AutoresearchConfigReceipt,
  AutoresearchEmpiricalDecisionClass,
  AutoresearchExperimentLineageInput,
  AutoresearchReceipt,
  AutoresearchRunDecisionSummary,
  AutoresearchRunKind,
  AutoresearchRunReceipt,
  MetricDirection,
  MetricMap,
  RunStatus,
} from "./runtime.ts";
import { coerceNumber, isRecord, parseStringArray } from "./runtime-common.ts";
import { normalizeExperimentLineage, parseExperimentLineage } from "./runtime-lineage.ts";

const DENIED_METRIC_NAMES = new Set(["__proto__", "constructor", "prototype"]);

export interface ReceiptLoadResult {
  entries: AutoresearchReceipt[];
  invalidLineCount: number;
}

export interface AutoresearchPaths {
  jsonlPath: string;
  benchmarkScriptPath: string;
  checksScriptPath: string;
}

export function parseMetricLines(output: string): MetricMap {
  const metrics: MetricMap = {};

  for (const rawLine of output.split(/\r?\n/)) {
    const line = rawLine.trim();
    const match = /^METRIC\s+([\w.µ:-]+)=(-?\d+(?:\.\d+)?)$/.exec(line);
    if (!match) continue;
    const metricName = match[1];
    if (DENIED_METRIC_NAMES.has(metricName)) continue;
    metrics[metricName] = Number(match[2]);
  }

  return metrics;
}

export function createConfigReceipt(input: {
  name: string;
  objectiveDigest?: string;
  metricName: string;
  metricUnit?: string;
  direction: MetricDirection;
  createdAt?: number;
  metricThreshold?: number;
  benchmarkCommand?: string;
  checksCommand?: string | null;
}): AutoresearchConfigReceipt {
  const metricThreshold = normalizeMetricThreshold(input.metricThreshold);
  return {
    type: "config",
    version: 1,
    name: input.name,
    ...(input.objectiveDigest
      ? { objectiveDigest: normalizeObjectiveDigest(input.objectiveDigest) }
      : {}),
    metricName: input.metricName,
    metricUnit: input.metricUnit ?? "",
    direction: input.direction,
    ...(metricThreshold === undefined ? {} : { metricThreshold }),
    createdAt: input.createdAt ?? Date.now(),
    benchmarkCommand: input.benchmarkCommand,
    checksCommand: input.checksCommand ?? undefined,
  };
}

export function createRunReceipt(input: {
  status: RunStatus;
  runKind?: AutoresearchRunKind;
  experiment?: AutoresearchExperimentLineageInput;
  empiricalDecisionClass?: AutoresearchEmpiricalDecisionClass;
  metric: number;
  metrics?: MetricMap;
  description: string;
  timestamp?: number;
  commit?: string;
  iteration?: number;
  confidence?: number | null;
  durationSeconds?: number;
  exitCode?: number | null;
  timedOut?: boolean;
  benchmarkCommand?: string;
  checksCommand?: string | null;
  checksPassed?: boolean | null;
  checksDurationSeconds?: number | null;
  decision?: AutoresearchRunDecisionSummary | null;
}): AutoresearchRunReceipt {
  return {
    type: "run",
    version: 1,
    status: input.status,
    runKind: input.runKind,
    experiment: normalizeExperimentLineage(input.experiment),
    empiricalDecisionClass: input.empiricalDecisionClass,
    metric: input.metric,
    metrics: { ...(input.metrics ?? {}) },
    description: input.description,
    timestamp: input.timestamp ?? Date.now(),
    commit: input.commit,
    iteration: input.iteration,
    confidence: input.confidence ?? null,
    durationSeconds: input.durationSeconds,
    exitCode: input.exitCode,
    timedOut: input.timedOut,
    benchmarkCommand: input.benchmarkCommand,
    checksCommand: input.checksCommand,
    checksPassed: input.checksPassed,
    checksDurationSeconds: input.checksDurationSeconds,
    decision: input.decision ?? undefined,
  };
}

export function serializeReceipt(entry: AutoresearchReceipt): string {
  return JSON.stringify(entry);
}

export function parseReceiptLine(line: string): AutoresearchReceipt {
  const parsed = JSON.parse(line) as unknown;
  if (!isRecord(parsed)) {
    throw new Error("Receipt line must decode to an object");
  }
  if (parsed.type === "config") {
    return parseConfigReceipt(parsed);
  }
  if (parsed.type === "run") {
    return parseRunReceipt(parsed);
  }
  throw new Error(`Unsupported receipt type: ${String(parsed.type)}`);
}

export function resolveAutoresearchPaths(cwd: string): AutoresearchPaths {
  return {
    jsonlPath: path.join(cwd, "autoresearch.jsonl"),
    benchmarkScriptPath: path.join(cwd, "autoresearch.sh"),
    checksScriptPath: path.join(cwd, "autoresearch.checks.sh"),
  };
}

export function loadReceiptLog(cwd: string): ReceiptLoadResult {
  const { jsonlPath } = resolveAutoresearchPaths(cwd);
  if (!existsSync(jsonlPath)) {
    return { entries: [], invalidLineCount: 0 };
  }

  const contents = readFileSync(jsonlPath, "utf8");
  if (contents.trim().length === 0) {
    return { entries: [], invalidLineCount: 0 };
  }

  const entries: AutoresearchReceipt[] = [];
  let invalidLineCount = 0;

  for (const rawLine of contents.split(/\r?\n/)) {
    const line = rawLine.trim();
    if (!line) continue;
    try {
      entries.push(parseReceiptLine(line));
    } catch {
      invalidLineCount += 1;
    }
  }

  return { entries, invalidLineCount };
}

export function appendReceipt(cwd: string, entry: AutoresearchReceipt): void {
  const { jsonlPath } = resolveAutoresearchPaths(cwd);
  mkdirSync(path.dirname(jsonlPath), { recursive: true });
  appendFileSync(jsonlPath, `${serializeReceipt(entry)}\n`, "utf8");
}

function normalizeMetricThreshold(value: unknown): number | undefined {
  if (value === undefined) return undefined;
  if (typeof value === "number" && Number.isFinite(value)) return value;
  throw new Error("metricThreshold must be a finite number when present");
}

function normalizeObjectiveDigest(value: unknown): string {
  if (typeof value !== "string" || !/^sha256:[0-9a-f]{64}$/u.test(value)) {
    throw new Error("objectiveDigest must be a lowercase sha256 digest when present");
  }
  return value;
}

function parseConfigReceipt(value: Record<string, unknown>): AutoresearchConfigReceipt {
  if (value.version !== 1) {
    throw new Error(`Unsupported config receipt version: ${String(value.version)}`);
  }
  if (value.direction !== "lower" && value.direction !== "higher") {
    throw new Error(`Invalid metric direction: ${String(value.direction)}`);
  }
  if (typeof value.name !== "string" || typeof value.metricName !== "string") {
    throw new Error("Config receipt requires string name and metricName fields");
  }
  const metricThreshold = normalizeMetricThreshold(value.metricThreshold);
  return {
    type: "config",
    version: 1,
    name: value.name,
    ...(value.objectiveDigest === undefined
      ? {}
      : { objectiveDigest: normalizeObjectiveDigest(value.objectiveDigest) }),
    metricName: value.metricName,
    metricUnit: typeof value.metricUnit === "string" ? value.metricUnit : "",
    direction: value.direction,
    ...(metricThreshold === undefined ? {} : { metricThreshold }),
    createdAt: coerceNumber(value.createdAt, "createdAt"),
    benchmarkCommand:
      typeof value.benchmarkCommand === "string" ? value.benchmarkCommand : undefined,
    checksCommand:
      typeof value.checksCommand === "string"
        ? value.checksCommand
        : value.checksCommand === null
          ? null
          : undefined,
  };
}

function parseRunReceipt(value: Record<string, unknown>): AutoresearchRunReceipt {
  if (value.version !== 1) {
    throw new Error(`Unsupported run receipt version: ${String(value.version)}`);
  }
  if (!isRunStatus(value.status)) {
    throw new Error(`Invalid run status: ${String(value.status)}`);
  }
  if (typeof value.description !== "string") {
    throw new Error("Run receipt requires a string description field");
  }
  return {
    type: "run",
    version: 1,
    status: value.status,
    runKind: isAutoresearchRunKind(value.runKind) ? value.runKind : undefined,
    experiment: parseExperimentLineage(value.experiment),
    empiricalDecisionClass: isAutoresearchEmpiricalDecisionClass(value.empiricalDecisionClass)
      ? value.empiricalDecisionClass
      : undefined,
    metric: coerceNumber(value.metric, "metric"),
    metrics: parseMetricMap(value.metrics),
    description: value.description,
    timestamp: coerceNumber(value.timestamp, "timestamp"),
    commit: typeof value.commit === "string" ? value.commit : undefined,
    iteration: typeof value.iteration === "number" ? value.iteration : undefined,
    confidence:
      typeof value.confidence === "number" && Number.isFinite(value.confidence)
        ? value.confidence
        : value.confidence === null
          ? null
          : null,
    durationSeconds:
      typeof value.durationSeconds === "number" && Number.isFinite(value.durationSeconds)
        ? value.durationSeconds
        : undefined,
    exitCode:
      typeof value.exitCode === "number" && Number.isFinite(value.exitCode)
        ? value.exitCode
        : value.exitCode === null
          ? null
          : undefined,
    timedOut: typeof value.timedOut === "boolean" ? value.timedOut : undefined,
    benchmarkCommand:
      typeof value.benchmarkCommand === "string" ? value.benchmarkCommand : undefined,
    checksCommand:
      typeof value.checksCommand === "string"
        ? value.checksCommand
        : value.checksCommand === null
          ? null
          : undefined,
    checksPassed:
      typeof value.checksPassed === "boolean"
        ? value.checksPassed
        : value.checksPassed === null
          ? null
          : undefined,
    checksDurationSeconds:
      typeof value.checksDurationSeconds === "number" &&
      Number.isFinite(value.checksDurationSeconds)
        ? value.checksDurationSeconds
        : value.checksDurationSeconds === null
          ? null
          : undefined,
    decision: parseRunDecisionSummary(value.decision),
  };
}

function parseRunDecisionSummary(value: unknown): AutoresearchRunDecisionSummary | undefined {
  if (value === undefined || value === null) {
    return undefined;
  }
  if (!isRecord(value)) {
    throw new Error("Run receipt decision summary must be an object.");
  }
  if (value.kind !== "next_hypothesis") {
    throw new Error(`Unsupported run receipt decision kind: ${String(value.kind)}`);
  }
  if (value.templateName !== AUTORESEARCH_NEXT_HYPOTHESIS_TEMPLATE_NAME) {
    throw new Error(`Unexpected run receipt decision template: ${String(value.templateName)}`);
  }
  if (!isNextHypothesisDecisionStatus(value.status)) {
    throw new Error(`Invalid run receipt decision status: ${String(value.status)}`);
  }
  if (typeof value.mappedDecision !== "string" || !isCampaignDecision(value.mappedDecision)) {
    throw new Error(`Invalid run receipt mapped decision: ${String(value.mappedDecision)}`);
  }
  if (
    value.failureStage !== undefined &&
    value.failureStage !== null &&
    !isDecisionFailureStage(value.failureStage)
  ) {
    throw new Error(`Invalid run receipt decision failure stage: ${String(value.failureStage)}`);
  }

  return {
    kind: "next_hypothesis",
    templateName: AUTORESEARCH_NEXT_HYPOTHESIS_TEMPLATE_NAME,
    status: value.status,
    mappedDecision: value.mappedDecision,
    blockingReason:
      typeof value.blockingReason === "string"
        ? value.blockingReason
        : value.blockingReason === null
          ? null
          : null,
    failureStage:
      value.failureStage === null || value.failureStage === undefined ? null : value.failureStage,
    stateRead: typeof value.stateRead === "string" ? value.stateRead : null,
    nextHypothesis: typeof value.nextHypothesis === "string" ? value.nextHypothesis : null,
    targetFiles: parseStringArray(value.targetFiles),
    expectedPrimaryEffect:
      typeof value.expectedPrimaryEffect === "string" ? value.expectedPrimaryEffect : null,
    timestamp: coerceNumber(value.timestamp, "decision.timestamp"),
  };
}

function isNextHypothesisDecisionStatus(value: unknown): value is NextHypothesisDecisionStatus {
  return (
    value === "ready" ||
    value === "rebaseline_needed" ||
    value === "finalize_candidate" ||
    value === "blocked"
  );
}

function isDecisionFailureStage(value: unknown): value is AutoresearchDecisionFailureStage {
  return value === "prompt_plane" || value === "executor" || value === "parse";
}

function parseMetricMap(value: unknown): MetricMap {
  if (!isRecord(value)) return {};
  const metrics: MetricMap = {};
  for (const [key, entry] of Object.entries(value)) {
    if (DENIED_METRIC_NAMES.has(key)) continue;
    if (typeof entry === "number" && Number.isFinite(entry)) {
      metrics[key] = entry;
    }
  }
  return metrics;
}

function isRunStatus(value: unknown): value is RunStatus {
  return (
    value === "baseline" ||
    value === "candidate" ||
    value === "keep" ||
    value === "discard" ||
    value === "crash" ||
    value === "checks_failed"
  );
}

function isAutoresearchRunKind(value: unknown): value is AutoresearchRunKind {
  return value === "ordinary" || value === "calibration";
}

function isAutoresearchEmpiricalDecisionClass(
  value: unknown,
): value is AutoresearchEmpiricalDecisionClass {
  return (
    value === "not_evaluated" ||
    value === "measurement_invalid" ||
    value === "checks_failed" ||
    value === "baseline" ||
    value === "insufficient_samples" ||
    value === "possible_noise" ||
    value === "calibration_signal" ||
    value === "candidate_improvement" ||
    value === "candidate_regression" ||
    value === "candidate_neutral" ||
    value === "threshold_satisfied" ||
    value === "threshold_preserved" ||
    value === "threshold_regressed" ||
    value === "threshold_not_met" ||
    value === "baseline_drift"
  );
}

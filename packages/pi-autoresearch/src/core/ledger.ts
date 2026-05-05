import { appendFileSync, existsSync, mkdirSync, readFileSync } from "node:fs";
import path from "node:path";

import { createActor, getNextTransitions } from "xstate";

import {
  type CampaignMachineContext,
  type CampaignMachineInput,
  type CampaignMachineStateValue,
  campaignMachine,
} from "../machine/campaign.ts";
import {
  CAMPAIGN_DECISIONS,
  type CampaignDecision,
  type CampaignEvent,
  type CampaignSegmentConfig,
} from "../machine/events.ts";
import type { MetricDirection, RunStatus } from "./runtime.ts";

export const AUTORESEARCH_EVENT_LEDGER_FILE = "autoresearch.events.jsonl" as const;

export interface AutoresearchLedgerEventEntry {
  type: "event";
  version: 1;
  recordedAt: number;
  event: CampaignEvent;
}

export interface AutoresearchLedgerLoadResult {
  entries: AutoresearchLedgerEventEntry[];
  invalidLineCount: number;
}

export interface AutoresearchLedgerReplayIssue {
  index: number;
  event: CampaignEvent;
  reason: string;
}

export interface AutoresearchLedgerProjection {
  state: CampaignMachineStateValue;
  context: CampaignMachineContext;
  eventCount: number;
  replayedEventCount: number;
  rejectedEvents: AutoresearchLedgerReplayIssue[];
}

export interface AutoresearchLedgerStatus extends AutoresearchLedgerProjection {
  ledgerPath: string;
  hasLedger: boolean;
  invalidLineCount: number;
}

export function createLedgerEventEntry(
  event: CampaignEvent,
  recordedAt = Date.now(),
): AutoresearchLedgerEventEntry {
  return {
    type: "event",
    version: 1,
    recordedAt,
    event,
  };
}

export function serializeLedgerEntry(entry: AutoresearchLedgerEventEntry): string {
  return JSON.stringify(entry);
}

export function parseLedgerLine(line: string): AutoresearchLedgerEventEntry {
  const parsed = JSON.parse(line) as unknown;
  if (!isRecord(parsed)) {
    throw new Error("Ledger line must decode to an object");
  }
  if (parsed.type !== "event") {
    throw new Error(`Unsupported ledger entry type: ${String(parsed.type)}`);
  }
  if (parsed.version !== 1) {
    throw new Error(`Unsupported ledger entry version: ${String(parsed.version)}`);
  }

  return {
    type: "event",
    version: 1,
    recordedAt: coerceNumber(parsed.recordedAt, "recordedAt"),
    event: parseCampaignEvent(parsed.event),
  };
}

export function resolveAutoresearchLedgerPath(cwd: string): string {
  return path.join(cwd, AUTORESEARCH_EVENT_LEDGER_FILE);
}

export function loadAutoresearchLedger(cwd: string): AutoresearchLedgerLoadResult {
  const ledgerPath = resolveAutoresearchLedgerPath(cwd);
  if (!existsSync(ledgerPath)) {
    return { entries: [], invalidLineCount: 0 };
  }

  const contents = readFileSync(ledgerPath, "utf8");
  if (contents.trim().length === 0) {
    return { entries: [], invalidLineCount: 0 };
  }

  const entries: AutoresearchLedgerEventEntry[] = [];
  let invalidLineCount = 0;

  for (const rawLine of contents.split(/\r?\n/)) {
    const line = rawLine.trim();
    if (!line) continue;

    try {
      entries.push(parseLedgerLine(line));
    } catch {
      invalidLineCount += 1;
    }
  }

  return { entries, invalidLineCount };
}

export function appendLedgerEvent(cwd: string, entry: AutoresearchLedgerEventEntry): void {
  const ledgerPath = resolveAutoresearchLedgerPath(cwd);
  mkdirSync(path.dirname(ledgerPath), { recursive: true });
  appendFileSync(ledgerPath, `${serializeLedgerEntry(entry)}\n`, "utf8");
}

export function projectAutoresearchLedgerEntries(
  entries: AutoresearchLedgerEventEntry[],
  input?: CampaignMachineInput,
): AutoresearchLedgerProjection {
  const actor = createActor(campaignMachine, { input }).start();
  const rejectedEvents: AutoresearchLedgerReplayIssue[] = [];
  let replayedEventCount = 0;

  entries.forEach((entry, index) => {
    const snapshot = actor.getSnapshot();
    const canReplay = getNextTransitions(snapshot).some(
      (transition) => transition.eventType === entry.event.type,
    );

    if (!canReplay) {
      rejectedEvents.push({
        index,
        event: entry.event,
        reason: `Event ${entry.event.type} is not valid from state ${String(snapshot.value)}`,
      });
      return;
    }

    actor.send(entry.event);
    replayedEventCount += 1;
  });

  const snapshot = actor.getSnapshot();
  return {
    state: snapshot.value as CampaignMachineStateValue,
    context: snapshot.context,
    eventCount: entries.length,
    replayedEventCount,
    rejectedEvents,
  };
}

export function projectAutoresearchLedger(
  cwd: string,
  input?: CampaignMachineInput,
): AutoresearchLedgerStatus {
  const loadResult = loadAutoresearchLedger(cwd);
  const projection = projectAutoresearchLedgerEntries(loadResult.entries, input);

  return {
    ...projection,
    ledgerPath: resolveAutoresearchLedgerPath(cwd),
    hasLedger: existsSync(resolveAutoresearchLedgerPath(cwd)),
    invalidLineCount: loadResult.invalidLineCount,
  };
}

function parseCampaignEvent(value: unknown): CampaignEvent {
  if (!isRecord(value) || typeof value.type !== "string") {
    throw new Error("Ledger event must be an object with a string type");
  }

  switch (value.type) {
    case "CONFIGURE_SEGMENT":
      return {
        type: "CONFIGURE_SEGMENT",
        segment: parseCampaignSegmentConfig(value.segment),
      };
    case "START_RUN":
      return {
        type: "START_RUN",
        description: coerceString(value.description, "description"),
        benchmarkCommand: parseOptionalString(value.benchmarkCommand, "benchmarkCommand"),
        checksCommand: parseOptionalNullableString(value.checksCommand, "checksCommand"),
      };
    case "BENCHMARK_SUCCEEDED":
      return {
        type: "BENCHMARK_SUCCEEDED",
        metric: coerceNumber(value.metric, "metric"),
        requiresChecks: coerceBoolean(value.requiresChecks, "requiresChecks"),
      };
    case "BENCHMARK_FAILED":
      return {
        type: "BENCHMARK_FAILED",
        reason: coerceString(value.reason, "reason"),
      };
    case "CHECKS_SUCCEEDED":
      return {
        type: "CHECKS_SUCCEEDED",
      };
    case "CHECKS_FAILED":
      return {
        type: "CHECKS_FAILED",
        reason: coerceString(value.reason, "reason"),
      };
    case "RECEIPT_RECORDED":
      return {
        type: "RECEIPT_RECORDED",
        status: parseRunStatus(value.status),
        metric: parseNullableNumber(value.metric, "metric"),
      };
    case "DECIDE_NEXT_ACTION":
      return {
        type: "DECIDE_NEXT_ACTION",
        decision: parseCampaignDecision(value.decision),
        reason: parseOptionalString(value.reason, "reason"),
      };
    case "ACCEPT_REBASELINE":
      return {
        type: "ACCEPT_REBASELINE",
        baselineMetric: parseOptionalNullableNumber(value.baselineMetric, "baselineMetric"),
      };
    case "ACCEPT_FINALIZE":
      return {
        type: "ACCEPT_FINALIZE",
        reason: parseOptionalString(value.reason, "reason"),
      };
    case "REJECT_FINALIZE":
      return {
        type: "REJECT_FINALIZE",
      };
    case "BLOCK":
      return {
        type: "BLOCK",
        reason: coerceString(value.reason, "reason"),
      };
    case "UNBLOCK":
      return {
        type: "UNBLOCK",
      };
    case "COMPLETE":
      return {
        type: "COMPLETE",
        reason: parseOptionalString(value.reason, "reason"),
      };
    case "RESET":
      return {
        type: "RESET",
      };
    default:
      throw new Error(`Unsupported campaign event type: ${value.type}`);
  }
}

function parseCampaignSegmentConfig(value: unknown): CampaignSegmentConfig {
  if (!isRecord(value)) {
    throw new Error("segment must be an object");
  }

  const metricThreshold = parseOptionalNullableNumber(
    value.metricThreshold,
    "segment.metricThreshold",
  );
  return {
    name: coerceString(value.name, "segment.name"),
    metricName: coerceString(value.metricName, "segment.metricName"),
    metricUnit: coerceString(value.metricUnit, "segment.metricUnit"),
    direction: parseMetricDirection(value.direction),
    ...(metricThreshold === undefined ? {} : { metricThreshold }),
    benchmarkCommand: coerceString(value.benchmarkCommand, "segment.benchmarkCommand"),
    checksCommand: parseNullableString(value.checksCommand, "segment.checksCommand"),
  };
}

function parseCampaignDecision(value: unknown): CampaignDecision {
  if (typeof value !== "string" || !CAMPAIGN_DECISIONS.includes(value as CampaignDecision)) {
    throw new Error(`Invalid campaign decision: ${String(value)}`);
  }
  return value as CampaignDecision;
}

function parseMetricDirection(value: unknown): MetricDirection {
  if (value !== "lower" && value !== "higher") {
    throw new Error(`Invalid metric direction: ${String(value)}`);
  }
  return value;
}

function parseRunStatus(value: unknown): RunStatus {
  if (
    value !== "baseline" &&
    value !== "candidate" &&
    value !== "keep" &&
    value !== "discard" &&
    value !== "crash" &&
    value !== "checks_failed"
  ) {
    throw new Error(`Invalid run status: ${String(value)}`);
  }
  return value;
}

function parseOptionalString(value: unknown, field: string): string | undefined {
  if (value === undefined) {
    return undefined;
  }
  return coerceString(value, field);
}

function parseNullableString(value: unknown, field: string): string | null {
  if (value === null) {
    return null;
  }
  return coerceString(value, field);
}

function parseOptionalNullableString(value: unknown, field: string): string | null | undefined {
  if (value === undefined) {
    return undefined;
  }
  if (value === null) {
    return null;
  }
  return coerceString(value, field);
}

function parseNullableNumber(value: unknown, field: string): number | null {
  if (value === null || value === undefined) {
    return null;
  }
  return coerceNumber(value, field);
}

function parseOptionalNullableNumber(value: unknown, field: string): number | null | undefined {
  if (value === undefined) {
    return undefined;
  }
  if (value === null) {
    return null;
  }
  return coerceNumber(value, field);
}

function coerceString(value: unknown, field: string): string {
  if (typeof value === "string") {
    return value;
  }
  throw new Error(`Ledger field ${field} must be a string`);
}

function coerceNumber(value: unknown, field: string): number {
  if (typeof value === "number" && Number.isFinite(value)) {
    return value;
  }
  throw new Error(`Ledger field ${field} must be a finite number`);
}

function coerceBoolean(value: unknown, field: string): boolean {
  if (typeof value === "boolean") {
    return value;
  }
  throw new Error(`Ledger field ${field} must be a boolean`);
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

import { chmodSync, existsSync, mkdirSync, writeFileSync } from "node:fs";
import path from "node:path";

import type {
  AutoresearchCampaignStartRunMode,
  AutoresearchCampaignStartSetupMode,
  AutoresearchCandidateLifecyclePolicy,
  AutoresearchConfigReceipt,
  AutoresearchLoopPeerMode,
  AutoresearchSegmentSummary,
  AutoresearchSetupAction,
} from "./runtime-model.ts";

export function maybeWriteAutoresearchScript(input: {
  path: string;
  content?: string | null;
  allowOverwrite: boolean;
}): boolean {
  const content = input.content?.trim();
  if (!content) return false;
  if (existsSync(input.path) && !input.allowOverwrite) {
    throw new Error(
      `${path.basename(input.path)} already exists; pass allowOverwriteScripts=true to overwrite it`,
    );
  }
  mkdirSync(path.dirname(input.path), { recursive: true });
  writeFileSync(input.path, content.endsWith("\n") ? content : `${content}\n`, "utf8");
  chmodSync(input.path, 0o755);
  return true;
}

export function formatSetupNextToolCall(
  cwd: string,
  config: AutoresearchConfigReceipt,
  action: AutoresearchSetupAction,
): string {
  const thresholdField =
    config.metricThreshold === undefined
      ? ""
      : `, metricThreshold: ${JSON.stringify(config.metricThreshold)}`;
  return `autoresearch_runtime_setup({ action: ${JSON.stringify(action)}, cwd: ${JSON.stringify(cwd)}, name: ${JSON.stringify(config.name)}, metricName: ${JSON.stringify(config.metricName)}, metricUnit: ${JSON.stringify(config.metricUnit)}, direction: ${JSON.stringify(config.direction)}${thresholdField}, benchmarkCommand: ${JSON.stringify(config.benchmarkCommand ?? "bash autoresearch.sh")}, checksCommand: ${config.checksCommand === undefined ? "undefined" : JSON.stringify(config.checksCommand)} })`;
}

export function formatCampaignStartNextToolCall(input: {
  cwd: string;
  objective: string;
  runMode: AutoresearchCampaignStartRunMode;
  maxIterations: number;
  setupMode: AutoresearchCampaignStartSetupMode;
  canExecute: boolean;
  candidatePolicy: AutoresearchCandidateLifecyclePolicy;
  config: AutoresearchConfigReceipt;
  benchmarkCommand: string | null;
  checksCommand: string | null;
  filesInScope: string[];
  offLimits: string[];
  constraints: string[];
  peerMode?: AutoresearchLoopPeerMode;
  maxWallClockMinutes?: number;
  reconfigure?: boolean;
}): string {
  const candidatePolicy = JSON.stringify({
    mode: input.candidatePolicy.mode,
    keep: input.candidatePolicy.keep,
    discard: input.candidatePolicy.discard,
    rewind: input.candidatePolicy.rewind,
  });
  const thresholdField =
    input.config.metricThreshold === undefined
      ? ""
      : `, metricThreshold: ${JSON.stringify(input.config.metricThreshold)}`;
  const benchmarkField =
    input.benchmarkCommand === null
      ? ""
      : `, benchmarkCommand: ${JSON.stringify(input.benchmarkCommand)}`;
  const peerModeField = input.peerMode ? `, peerMode: ${JSON.stringify(input.peerMode)}` : "";
  const wallClockField =
    input.maxWallClockMinutes === undefined
      ? ""
      : `, maxWallClockMinutes: ${JSON.stringify(input.maxWallClockMinutes)}`;
  const contractFields = `, name: ${JSON.stringify(input.config.name)}, metricName: ${JSON.stringify(input.config.metricName)}, metricUnit: ${JSON.stringify(input.config.metricUnit)}, direction: ${JSON.stringify(input.config.direction)}${thresholdField}${benchmarkField}, checksCommand: ${JSON.stringify(input.checksCommand)}, filesInScope: ${JSON.stringify(input.filesInScope)}, offLimits: ${JSON.stringify(input.offLimits)}, constraints: ${JSON.stringify(input.constraints)}${peerModeField}${wallClockField}`;
  if (input.runMode === "plan_only") {
    const nextRunMode = input.canExecute ? "baseline" : "plan_only";
    const reconfigureField =
      input.reconfigure && nextRunMode === "baseline" ? ", reconfigure: true" : "";
    return `autoresearch_campaign_start({ cwd: ${JSON.stringify(input.cwd)}, objective: ${JSON.stringify(input.objective)}, setupMode: ${JSON.stringify(input.setupMode)}, runMode: ${JSON.stringify(nextRunMode)}, maxIterations: ${input.maxIterations}${contractFields}${reconfigureField}, candidatePolicy: ${candidatePolicy} })`;
  }
  if (input.runMode === "baseline") {
    return `autoresearch_campaign_start({ cwd: ${JSON.stringify(input.cwd)}, objective: ${JSON.stringify(input.objective)}, setupMode: ${JSON.stringify(input.setupMode)}, runMode: "bounded_loop", maxIterations: ${input.maxIterations}${contractFields}, candidatePolicy: ${candidatePolicy} })`;
  }
  return `autoresearch_runtime_status({ cwd: ${JSON.stringify(input.cwd)}, action: "closeout" })`;
}

interface AutoresearchCampaignStartActiveSegmentMismatch {
  field: string;
  current: string;
  requested: string;
}

export function assertCampaignStartWillNotUseStaleActiveSegment(input: {
  cwd: string;
  objective: string;
  runMode: AutoresearchCampaignStartRunMode;
  setupMode: AutoresearchCampaignStartSetupMode;
  maxIterations: number;
  currentSegment: AutoresearchSegmentSummary;
  requestedConfig: AutoresearchConfigReceipt;
  benchmarkCommand: string | null | undefined;
  checksCommand: string | null | undefined;
}): void {
  const mismatches = collectCampaignStartActiveSegmentMismatches(input);
  if (mismatches.length === 0) return;

  const mismatchLines = mismatches.map(
    (mismatch) =>
      `- ${mismatch.field}: active=${mismatch.current}; requested=${mismatch.requested}`,
  );
  throw new Error(
    [
      "autoresearch_campaign_start refused to execute against a stale active segment.",
      `runMode=${input.runMode} would reuse the currently configured segment unless reconfigure=true is supplied.`,
      "The requested objective/config differs from the active segment:",
      ...mismatchLines,
      "Retry the same autoresearch_campaign_start call with reconfigure=true to start a fresh segment, or use autoresearch_runtime_loop/autoresearch_runtime_run to continue the active segment intentionally.",
      `requested call shape: autoresearch_campaign_start({ cwd: ${JSON.stringify(input.cwd)}, objective: ${JSON.stringify(input.objective)}, setupMode: ${JSON.stringify(input.setupMode)}, runMode: ${JSON.stringify(input.runMode)}, maxIterations: ${input.maxIterations}, reconfigure: true, ... })`,
    ].join("\n"),
  );
}

function collectCampaignStartActiveSegmentMismatches(input: {
  currentSegment: AutoresearchSegmentSummary;
  requestedConfig: AutoresearchConfigReceipt;
  benchmarkCommand: string | null | undefined;
  checksCommand: string | null | undefined;
}): AutoresearchCampaignStartActiveSegmentMismatch[] {
  const segment = input.currentSegment;
  if (!segment.configured) return [];

  const requestedBenchmarkCommand =
    input.benchmarkCommand ?? input.requestedConfig.benchmarkCommand ?? null;
  const requestedChecksCommand = input.checksCommand ?? input.requestedConfig.checksCommand ?? null;
  const requestedMetricThreshold = input.requestedConfig.metricThreshold ?? null;
  const checks: Array<[string, unknown, unknown]> = [
    ["name", segment.name, input.requestedConfig.name],
    [
      "objectiveDigest",
      segment.objectiveDigest ?? "legacy_missing",
      input.requestedConfig.objectiveDigest ?? "requested_missing",
    ],
    ["metricName", segment.metricName, input.requestedConfig.metricName],
    ["metricUnit", segment.metricUnit, input.requestedConfig.metricUnit],
    ["direction", segment.direction, input.requestedConfig.direction],
    ["metricThreshold", segment.metricThreshold, requestedMetricThreshold],
    ["benchmarkCommand", segment.benchmarkCommand, requestedBenchmarkCommand],
    ["checksCommand", segment.checksCommand, requestedChecksCommand],
  ];

  return checks.flatMap(([field, current, requested]) =>
    current === requested
      ? []
      : [
          {
            field,
            current: formatCampaignStartSegmentValue(current),
            requested: formatCampaignStartSegmentValue(requested),
          },
        ],
  );
}

function formatCampaignStartSegmentValue(value: unknown): string {
  return value === undefined ? "null" : JSON.stringify(value);
}

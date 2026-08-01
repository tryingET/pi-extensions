import path from "node:path";
import { campaignEvents } from "../machine/events.ts";
import { appendLedgerEvent, createLedgerEventEntry } from "./ledger.ts";
import { formatSetupNextToolCall, maybeWriteAutoresearchScript } from "./runtime-autoplan.ts";
import type {
  ExecuteAutoresearchSetupInput,
  ExecuteAutoresearchSetupResult,
} from "./runtime-model.ts";
import {
  appendReceipt,
  createConfigReceipt,
  loadReceiptLog,
  resolveAutoresearchPaths,
} from "./runtime-receipts.ts";
import { executeAutoresearchRun } from "./runtime-run.ts";
import {
  buildAutoresearchRuntimeStatus,
  createCampaignSegmentConfigFromReceipt,
  ensureEventLedgerInitializedFromReceipts,
} from "./runtime-status.ts";

export async function executeAutoresearchSetup(
  input: ExecuteAutoresearchSetupInput,
): Promise<ExecuteAutoresearchSetupResult> {
  const cwd = path.resolve(input.cwd);
  const action = input.action ?? "plan";
  const paths = resolveAutoresearchPaths(cwd);
  const plannedConfig = createConfigReceipt(input);
  input.signal?.throwIfAborted();
  let wroteBenchmarkScript = false;
  let wroteChecksScript = false;

  if (action === "plan") {
    return {
      cwd,
      action,
      plannedConfig,
      appliedConfig: false,
      wroteBenchmarkScript: false,
      wroteChecksScript: false,
      run: null,
      status: buildAutoresearchRuntimeStatus(cwd, { persistSnapshot: false }),
      nextToolCall: formatSetupNextToolCall(cwd, plannedConfig, "apply"),
    };
  }

  input.signal?.throwIfAborted();
  wroteBenchmarkScript = maybeWriteAutoresearchScript({
    path: paths.benchmarkScriptPath,
    content: input.benchmarkScript,
    allowOverwrite: input.allowOverwriteScripts === true,
  });
  input.signal?.throwIfAborted();
  wroteChecksScript = maybeWriteAutoresearchScript({
    path: paths.checksScriptPath,
    content: input.checksScript ?? undefined,
    allowOverwrite: input.allowOverwriteScripts === true,
  });

  if (action === "baseline") {
    const run = await executeAutoresearchRun({
      cwd,
      description: input.description?.trim() || `baseline for ${plannedConfig.name}`,
      name: plannedConfig.name,
      metricName: plannedConfig.metricName,
      metricUnit: plannedConfig.metricUnit,
      direction: plannedConfig.direction,
      metricThreshold: plannedConfig.metricThreshold,
      benchmarkCommand: plannedConfig.benchmarkCommand,
      checksCommand: plannedConfig.checksCommand,
      reconfigure: input.reconfigure,
      postureCommand: input.postureCommand,
      postureTimeoutSeconds: input.postureTimeoutSeconds,
      timeoutSeconds: input.timeoutSeconds,
      checksTimeoutSeconds: input.checksTimeoutSeconds,
      signal: input.signal,
    });
    input.signal?.throwIfAborted();
    return {
      cwd,
      action,
      plannedConfig,
      appliedConfig: run.createdConfig,
      wroteBenchmarkScript,
      wroteChecksScript,
      run,
      status: run.status,
      nextToolCall: `autoresearch_runtime_loop({ cwd: ${JSON.stringify(cwd)}, goal: ${JSON.stringify(input.description ?? plannedConfig.name)}, maxIterations: 3 })`,
    };
  }

  const currentStatus = buildAutoresearchRuntimeStatus(cwd, { persistSnapshot: false });
  if (currentStatus.currentSegment.configured && input.reconfigure !== true) {
    throw new Error(
      "runtime already has a configured segment; pass reconfigure=true to append a new config receipt",
    );
  }
  const entries = loadReceiptLog(cwd).entries;
  input.signal?.throwIfAborted();
  ensureEventLedgerInitializedFromReceipts(cwd, entries);
  input.signal?.throwIfAborted();
  appendReceipt(cwd, plannedConfig);
  input.signal?.throwIfAborted();
  appendLedgerEvent(
    cwd,
    createLedgerEventEntry(
      campaignEvents.configureSegment(createCampaignSegmentConfigFromReceipt(plannedConfig)),
      plannedConfig.createdAt,
    ),
  );

  input.signal?.throwIfAborted();
  const status = buildAutoresearchRuntimeStatus(cwd, { persistSnapshot: true });

  return {
    cwd,
    action,
    plannedConfig,
    appliedConfig: true,
    wroteBenchmarkScript,
    wroteChecksScript,
    run: null,
    status,
    nextToolCall: formatSetupNextToolCall(cwd, plannedConfig, "baseline"),
  };
}

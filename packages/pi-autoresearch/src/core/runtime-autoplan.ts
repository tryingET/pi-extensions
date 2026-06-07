import { existsSync } from "node:fs";
import path from "node:path";

import { buildDspxProgramGenPlan, readDspxAutoplanAdvisory } from "./runtime-autoplan-dspx.ts";
import {
  buildAutoplanMeasurementContract,
  buildAutoplanRisks,
  buildBenchmarkMetricContractWarning,
  buildDuplicateChecksReason,
  buildMeasurementContractRisk,
  buildMetricBenchmarkScriptProposal,
  canBenchmarkScriptProposalDriveBaseline,
  formatAutoplanSetupToolCall,
  inferBenchmarkCommand,
  inferChecksCommand,
  inferFilesInScope,
  inferMetricConfig,
  normalizeOptionalString,
  readJustRecipes,
  readPackageName,
  readPackageScripts,
  slugAutoresearchName,
} from "./runtime-autoplan-helpers.ts";
import { normalizeArray } from "./runtime-common.ts";
import { formatMetricThresholdValue } from "./runtime-format.ts";
import type {
  AutoresearchAutoplanResult,
  AutoresearchSetupAction,
  BuildAutoresearchAutoplanInput,
} from "./runtime-model.ts";
import { createConfigReceipt, resolveAutoresearchPaths } from "./runtime-receipts.ts";
import { buildAutoresearchRuntimeStatus } from "./runtime-status.ts";
import { formatTargetFiles } from "./runtime-status-format.ts";

export { resolveDspxRepoPath } from "./runtime-autoplan-dspx.ts";
export {
  canBenchmarkScriptProposalDriveBaseline,
  shellSingleQuote,
  slugAutoresearchName,
} from "./runtime-autoplan-helpers.ts";

export {
  assertCampaignStartWillNotUseStaleActiveSegment,
  formatCampaignStartNextToolCall,
  formatSetupNextToolCall,
  maybeWriteAutoresearchScript,
} from "./runtime-autoplan-setup.ts";

export function buildAutoresearchAutoplan(
  input: BuildAutoresearchAutoplanInput,
): AutoresearchAutoplanResult {
  const cwd = path.resolve(input.cwd);
  const objective = input.objective.trim();
  if (objective.length === 0) throw new Error("objective is required");

  const status = buildAutoresearchRuntimeStatus(cwd, { persistSnapshot: false });
  const paths = resolveAutoresearchPaths(cwd);
  const packageScripts = readPackageScripts(cwd);
  const justRecipes = readJustRecipes(cwd);
  const metric = inferMetricConfig(input, objective);
  const benchmarkCommand =
    normalizeOptionalString(input.benchmarkCommand) ??
    inferBenchmarkCommand(paths, packageScripts, justRecipes);
  const requestedChecksCommand =
    input.checksCommand !== undefined
      ? normalizeOptionalString(input.checksCommand)
      : inferChecksCommand(paths, packageScripts, justRecipes);
  const duplicateChecksReason = buildDuplicateChecksReason(
    cwd,
    benchmarkCommand,
    requestedChecksCommand,
    packageScripts,
  );
  const checksCommand =
    input.checksCommand === undefined && duplicateChecksReason ? null : requestedChecksCommand;
  const name = slugAutoresearchName(objective, readPackageName(cwd));
  const filesInScope = inferFilesInScope(cwd, input.filesInScope);
  const offLimits = normalizeArray(input.offLimits);
  const constraints = normalizeArray(input.constraints);
  const benchmarkMetricWarning = buildBenchmarkMetricContractWarning(
    benchmarkCommand,
    metric.metricName,
  );
  const config = createConfigReceipt({
    name,
    metricName: metric.metricName,
    metricUnit: metric.metricUnit,
    direction: metric.direction,
    metricThreshold: input.metricThreshold,
    benchmarkCommand: benchmarkCommand ?? undefined,
    checksCommand: checksCommand ?? undefined,
  });
  const dspxProgramGen =
    input.planner === "dspx_program"
      ? buildDspxProgramGenPlan({
          cwd,
          objective,
          filesInScope,
          offLimits,
          constraints,
          config,
          benchmarkCommand,
          checksCommand,
          materialize: input.materializeDspxIntent === true,
          intentPath: input.dspxIntentPath,
          outdir: input.dspxOutdir,
        })
      : null;
  const dspxAdvisory =
    input.planner === "dspx_program" && dspxProgramGen
      ? readDspxAutoplanAdvisory({
          cwd,
          objective,
          behaviorPath: input.dspxBehaviorPath,
          outdir: dspxProgramGen.outdir,
        })
      : null;
  const benchmarkScriptProposal = buildMetricBenchmarkScriptProposal({
    cwd,
    benchmarkCommand,
    metricName: metric.metricName,
    direction: metric.direction,
    benchmarkMetricWarning,
    benchmarkScriptPresent: existsSync(paths.benchmarkScriptPath),
    dspxBehaviorPath: dspxAdvisory?.available ? dspxAdvisory.behaviorPath : null,
    dspxTotal: dspxAdvisory?.total ?? 0,
  });
  const scriptProposalCanDriveBaseline =
    canBenchmarkScriptProposalDriveBaseline(benchmarkScriptProposal);
  const measurementContract = buildAutoplanMeasurementContract({
    benchmarkCommand,
    metricName: metric.metricName,
    benchmarkMetricWarning,
    benchmarkScriptProposal,
  });
  const risks = buildAutoplanRisks({
    benchmarkCommand,
    checksCommand,
    metricName: metric.metricName,
    status,
    benchmarkMetricWarning: scriptProposalCanDriveBaseline ? null : benchmarkMetricWarning,
    measurementContractRisk: buildMeasurementContractRisk(benchmarkScriptProposal),
    duplicateChecksReason,
    duplicateChecksOmitted: Boolean(duplicateChecksReason && input.checksCommand === undefined),
  });
  const nextAction: AutoresearchSetupAction =
    benchmarkMetricWarning && !scriptProposalCanDriveBaseline ? "plan" : "baseline";
  const nextToolCall = formatAutoplanSetupToolCall({
    cwd,
    config,
    action: nextAction,
    benchmarkCommand:
      scriptProposalCanDriveBaseline && benchmarkScriptProposal
        ? benchmarkScriptProposal.benchmarkCommand
        : (benchmarkCommand ?? "<benchmark command required>"),
    checksCommand,
    benchmarkScriptProposal: scriptProposalCanDriveBaseline ? benchmarkScriptProposal : null,
  });

  return {
    cwd,
    objective,
    planner: input.planner ?? "heuristic",
    config,
    benchmarkCommand,
    checksCommand,
    benchmarkScriptPresent: existsSync(paths.benchmarkScriptPath),
    checksScriptPresent: existsSync(paths.checksScriptPath),
    measurementContract,
    benchmarkScriptProposal,
    packageScripts,
    justRecipes,
    filesInScope,
    offLimits,
    constraints,
    confidence: benchmarkCommand ? 0.74 : 0.42,
    risks,
    nextToolCall,
    dspxProgramGen,
    dspxAdvisory,
    status,
  };
}

export function assertUsableFreshDspxProgramGenPlan(result: AutoresearchAutoplanResult): void {
  const advisory = result.dspxAdvisory;
  const proposal = advisory?.proposal;
  if (!advisory?.available) {
    throw new Error("DSPx program-gen completed but behavior_results.json is missing.");
  }
  if (advisory.status !== "passed") {
    throw new Error(
      `DSPx program-gen behavior status must be passed, received: ${advisory.status ?? "unknown"}.`,
    );
  }
  if (!advisory.matchedObjective) {
    throw new Error("DSPx program-gen behavior evidence did not contain an exact objective match.");
  }
  if (advisory.selectedExampleStatus !== "passed") {
    throw new Error(
      `DSPx program-gen selected example status must be passed, received: ${advisory.selectedExampleStatus ?? "unknown"}.`,
    );
  }
  if (
    advisory.total <= 0 ||
    advisory.failed > 0 ||
    advisory.error > 0 ||
    advisory.passed !== advisory.total
  ) {
    throw new Error(
      "DSPx program-gen summary counts must show all examples passed with no failures or errors.",
    );
  }
  if (!proposal) {
    throw new Error("DSPx program-gen behavior evidence did not include a setup proposal.");
  }
  if (
    !proposal.campaignName ||
    !proposal.metricName ||
    !proposal.direction ||
    !proposal.benchmarkCommand
  ) {
    throw new Error(
      "DSPx program-gen setup proposal must include campaign_name, metric_name, direction, and benchmark_command.",
    );
  }
  const blockingWarnings = advisory.warnings.filter((warning) =>
    /does not contain an exact objective match|status is|summary counts|selected example status|no observable setup proposal|may not print|required METRIC|cannot drive a baseline|could not parse/u.test(
      warning,
    ),
  );
  if (blockingWarnings.length > 0) {
    throw new Error(`DSPx program-gen setup proposal is blocked: ${blockingWarnings.join("; ")}`);
  }
}

export function applyDspxAdvisoryPlan(
  result: AutoresearchAutoplanResult,
): AutoresearchAutoplanResult {
  const proposal = result.dspxAdvisory?.proposal;
  if (!proposal) return result;

  const metricName = proposal.metricName ?? result.config.metricName;
  const metricUnit = proposal.metricUnit || result.config.metricUnit;
  const direction = proposal.direction ?? result.config.direction;
  const benchmarkCommand = proposal.benchmarkCommand ?? result.benchmarkCommand;
  const checksCommand = proposal.checksCommand ?? result.checksCommand;
  const config = createConfigReceipt({
    name: proposal.campaignName ?? result.config.name,
    metricName,
    metricUnit,
    direction,
    metricThreshold: proposal.metricThreshold ?? result.config.metricThreshold,
    benchmarkCommand: benchmarkCommand ?? undefined,
    checksCommand: checksCommand ?? undefined,
  });
  const benchmarkMetricWarning = buildBenchmarkMetricContractWarning(benchmarkCommand, metricName);
  const benchmarkScriptProposal =
    result.dspxAdvisory?.benchmarkScriptProposal ??
    buildMetricBenchmarkScriptProposal({
      cwd: result.cwd,
      benchmarkCommand,
      metricName,
      direction,
      benchmarkMetricWarning,
      benchmarkScriptPresent: result.benchmarkScriptPresent,
      dspxBehaviorPath: result.dspxAdvisory?.behaviorPath ?? null,
      dspxTotal: result.dspxAdvisory?.total ?? 0,
    });
  const measurementContract = buildAutoplanMeasurementContract({
    benchmarkCommand,
    metricName,
    benchmarkMetricWarning,
    benchmarkScriptProposal,
  });
  const scriptProposalCanDriveBaseline =
    canBenchmarkScriptProposalDriveBaseline(benchmarkScriptProposal);
  const nextAction: AutoresearchSetupAction =
    benchmarkMetricWarning && !scriptProposalCanDriveBaseline ? "plan" : "baseline";
  const nextToolCall = formatAutoplanSetupToolCall({
    cwd: result.cwd,
    config,
    action: nextAction,
    benchmarkCommand:
      scriptProposalCanDriveBaseline && benchmarkScriptProposal
        ? benchmarkScriptProposal.benchmarkCommand
        : (benchmarkCommand ?? "<benchmark command required>"),
    checksCommand,
    benchmarkScriptProposal: scriptProposalCanDriveBaseline ? benchmarkScriptProposal : null,
  });

  return {
    ...result,
    config,
    benchmarkCommand,
    checksCommand,
    measurementContract,
    benchmarkScriptProposal,
    confidence: Math.max(result.confidence, result.dspxAdvisory?.matchedObjective ? 0.86 : 0.62),
    risks: result.dspxAdvisory?.warnings ?? result.risks,
    nextToolCall,
    dspxAdvisory: result.dspxAdvisory
      ? { ...result.dspxAdvisory, authority: "validated_generated_dspy_planner_output" }
      : result.dspxAdvisory,
  };
}

export function formatAutoresearchAutoplanResult(result: AutoresearchAutoplanResult): string {
  return [
    "# PI-AUTORESEARCH AUTOPLAN",
    "",
    `- cwd: ${result.cwd}`,
    `- planner: ${result.planner}`,
    `- objective: ${result.objective}`,
    `- confidence: ${result.confidence.toFixed(2)}`,
    `- campaign: ${result.config.name}`,
    `- metric: ${result.config.metricName} (${result.config.metricUnit || "unitless"}, ${result.config.direction} is better)`,
    `- success threshold: ${formatMetricThresholdValue(result.config.metricThreshold ?? null, result.config.metricUnit)}`,
    `- benchmark command: ${result.benchmarkCommand ?? "(missing)"}`,
    `- checks command: ${result.checksCommand ?? "(none)"}`,
    `- current machine state: ${result.status.runtimeProjection.state}`,
    "",
    "## Scope",
    `- files in scope: ${formatTargetFiles(result.filesInScope)}`,
    `- off limits: ${formatTargetFiles(result.offLimits)}`,
    "",
    "## Risks",
    ...(result.risks.length > 0 ? result.risks.map((risk) => `- ${risk}`) : ["- none detected"]),
    ...(result.measurementContract
      ? [
          "",
          "## Measurement contract",
          `- metric: ${result.measurementContract.metricName}`,
          `- authority: ${result.measurementContract.optimizationAuthority}`,
          `- freshness: ${result.measurementContract.freshness}`,
          `- causal link: ${result.measurementContract.causalLink}`,
          `- generated by: ${result.measurementContract.generatedBy}`,
          `- reason: ${result.measurementContract.reason}`,
        ]
      : []),
    ...(result.benchmarkScriptProposal
      ? [
          "",
          canBenchmarkScriptProposalDriveBaseline(result.benchmarkScriptProposal)
            ? "## Benchmark script proposal"
            : "## Advisory metric summary (not baseline authority)",
          `- source: ${result.benchmarkScriptProposal.source}`,
          `- reason: ${result.benchmarkScriptProposal.reason}`,
          `- measurement authority: ${result.benchmarkScriptProposal.measurementContract.optimizationAuthority}`,
          `- freshness: ${result.benchmarkScriptProposal.measurementContract.freshness}`,
          `- causal link: ${result.benchmarkScriptProposal.measurementContract.causalLink}`,
          "```bash",
          result.benchmarkScriptProposal.benchmarkScript.trimEnd(),
          "```",
        ]
      : []),
    "",
    "## Next exact tool call",
    `\`${result.nextToolCall}\``,
    ...(result.dspxProgramGen
      ? [
          "",
          "## DSPx generated DSPy planner assembly",
          `- intent: ${result.dspxProgramGen.intentPath}`,
          `- outdir: ${result.dspxProgramGen.outdir}`,
          `- materialized: ${result.dspxProgramGen.materialized ? "yes" : "no"}`,
          `- command: \`${result.dspxProgramGen.command}\``,
          `- note: ${result.dspxProgramGen.note}`,
        ]
      : []),
    ...(result.dspxAdvisory
      ? [
          "",
          result.dspxAdvisory.authority === "validated_generated_dspy_planner_output"
            ? "## Generated DSPy planner output (validated)"
            : "## DSPx advisory evidence",
          `- authority: ${
            result.dspxAdvisory.authority === "validated_generated_dspy_planner_output"
              ? "validated generated DSPy planner output from a fresh bounded DSPx program-gen run"
              : "evidence-only non-authoritative DSPx behavior artifact"
          }`,
          `- behavior: ${result.dspxAdvisory.behaviorPath}`,
          `- available: ${result.dspxAdvisory.available ? "yes" : "no"}`,
          `- status: ${result.dspxAdvisory.status ?? "unknown"} (${result.dspxAdvisory.passed}/${result.dspxAdvisory.total} passed, failed=${result.dspxAdvisory.failed}, error=${result.dspxAdvisory.error})`,
          `- objective match: ${result.dspxAdvisory.matchedObjective ? "yes" : "no"}`,
          ...(result.dspxAdvisory.proposal
            ? [
                `- generated campaign plan: ${result.dspxAdvisory.proposal.campaignName ?? "(missing)"}`,
                `- generated metric plan: ${result.dspxAdvisory.proposal.metricName ?? "(missing)"} (${result.dspxAdvisory.proposal.metricUnit || "unitless"}, ${result.dspxAdvisory.proposal.direction ?? "unknown"} is better)`,
                `- generated benchmark plan: ${result.dspxAdvisory.proposal.benchmarkCommand ?? "(missing)"}`,
                `- generated checks plan: ${result.dspxAdvisory.proposal.checksCommand ?? "(none)"}`,
                `- generated next action: ${result.dspxAdvisory.proposal.nextAction ?? "(missing)"}`,
              ]
            : ["- proposal: (none)"]),
          ...(result.dspxAdvisory.benchmarkScriptProposal
            ? [
                "",
                canBenchmarkScriptProposalDriveBaseline(result.dspxAdvisory.benchmarkScriptProposal)
                  ? "### Generated DSPy planner benchmark script proposal"
                  : "### DSPx advisory metric summary (not baseline authority)",
                `- source: ${result.dspxAdvisory.benchmarkScriptProposal.source}`,
                `- reason: ${result.dspxAdvisory.benchmarkScriptProposal.reason}`,
                `- measurement authority: ${result.dspxAdvisory.benchmarkScriptProposal.measurementContract.optimizationAuthority}`,
                `- freshness: ${result.dspxAdvisory.benchmarkScriptProposal.measurementContract.freshness}`,
                `- causal link: ${result.dspxAdvisory.benchmarkScriptProposal.measurementContract.causalLink}`,
                "```bash",
                result.dspxAdvisory.benchmarkScriptProposal.benchmarkScript.trimEnd(),
                "```",
              ]
            : []),
          ...(result.dspxAdvisory.nextToolCall
            ? [
                "",
                result.dspxAdvisory.authority === "validated_generated_dspy_planner_output"
                  ? "### Generated DSPy planner setup call"
                  : "### DSPx advisory setup call",
                `\`${result.dspxAdvisory.nextToolCall}\``,
              ]
            : []),
          ...(result.dspxAdvisory.warnings.length > 0
            ? [
                "",
                "### DSPx advisory warnings",
                ...result.dspxAdvisory.warnings.map((warning) => `- ${warning}`),
              ]
            : []),
          "",
          result.dspxAdvisory.authority === "validated_generated_dspy_planner_output"
            ? "Generated DSPy planner output was validated and may drive this local campaign setup; pi-autoresearch still owns setup application, receipts, bounded runs, and stop gates."
            : "DSPx advisory output is evidence only; use autoresearch_runtime_setup to apply any setup.",
        ]
      : []),
  ].join("\n");
}

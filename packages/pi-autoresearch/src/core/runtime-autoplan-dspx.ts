import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import path from "node:path";
import {
  buildBenchmarkMetricContractWarning,
  buildMeasurementContractRisk,
  buildMetricBenchmarkScriptProposal,
  canBenchmarkScriptProposalDriveBaseline,
  formatAutoplanSetupToolCall,
} from "./runtime-autoplan-helpers.ts";
import { isRecord, stringOrNull } from "./runtime-common.ts";
import type {
  AutoresearchBenchmarkScriptProposal,
  AutoresearchConfigReceipt,
  AutoresearchDspxAdvisory,
  AutoresearchDspxAdvisoryProposal,
  AutoresearchDspxProgramGenPlan,
  AutoresearchSetupAction,
} from "./runtime-model.ts";
import { createConfigReceipt, resolveAutoresearchPaths } from "./runtime-receipts.ts";

export function buildDspxProgramGenPlan(input: {
  cwd: string;
  objective: string;
  filesInScope: readonly string[];
  offLimits: readonly string[];
  constraints: readonly string[];
  config: AutoresearchConfigReceipt;
  benchmarkCommand: string | null;
  checksCommand: string | null;
  materialize: boolean;
  intentPath?: string;
  outdir?: string;
}): AutoresearchDspxProgramGenPlan {
  const intentPath = path.resolve(
    input.cwd,
    input.intentPath ?? ".autoresearch/dspx/autosetup-intent.yaml",
  );
  const outdir = path.resolve(
    input.cwd,
    input.outdir ?? ".autoresearch/dspx/generated/autosetup-planner",
  );
  if (input.materialize) {
    mkdirSync(path.dirname(intentPath), { recursive: true });
    writeFileSync(intentPath, renderDspxAutoresearchIntent(input), "utf8");
  }
  return {
    enabled: true,
    intentPath,
    outdir,
    command: `just dspx program-gen --intent ${JSON.stringify(intentPath)} --outdir ${JSON.stringify(outdir)}`,
    argv: ["just", "dspx", "program-gen", "--intent", intentPath, "--outdir", outdir],
    materialized: input.materialize,
    note: "DSPx program-gen materializes a DSPy planner assembly; when runDspxProgramGen is enabled, pi-autoresearch validates the generated DSPy planner output before using it for local campaign setup, while retaining ownership of setup application, bounded runs, receipts, and stop gates.",
  };
}

export function readDspxAutoplanAdvisory(input: {
  cwd: string;
  objective: string;
  outdir: string;
  behaviorPath?: string;
}): AutoresearchDspxAdvisory {
  const behaviorPath = path.resolve(
    input.cwd,
    input.behaviorPath ?? path.join(input.outdir, "behavior_results.json"),
  );
  const missing: AutoresearchDspxAdvisory = {
    authority: "evidence_only_non_authoritative",
    behaviorPath,
    available: false,
    status: null,
    total: 0,
    passed: 0,
    failed: 0,
    error: 0,
    matchedObjective: false,
    selectedExampleIndex: null,
    selectedExampleStatus: null,
    proposal: null,
    benchmarkScriptProposal: null,
    warnings: ["DSPx behavior_results.json is not present yet; run the program-gen handoff first"],
    nextToolCall: null,
  };
  if (!existsSync(behaviorPath)) return missing;

  try {
    const payload = JSON.parse(readFileSync(behaviorPath, "utf8")) as unknown;
    if (!isRecord(payload)) {
      return {
        ...missing,
        available: true,
        warnings: ["DSPx behavior_results.json is not an object"],
      };
    }
    const summary = isRecord(payload.summary) ? payload.summary : {};
    const examples = Array.isArray(payload.examples) ? payload.examples : [];
    const records = examples.filter(isRecord);
    const exact = records.find((record) => {
      const inputs = isRecord(record.inputs) ? record.inputs : {};
      return stringOrNull(inputs.objective) === input.objective;
    });
    const selected = exact ?? records.find((record) => isRecord(record.observed_outputs)) ?? null;
    const observed =
      selected && isRecord(selected.observed_outputs) ? selected.observed_outputs : null;
    const selectedStatus = selected ? stringOrNull(selected.status) : null;
    const proposal = observed ? parseDspxAdvisoryProposal(observed) : null;
    const status = stringOrNull(summary.status) ?? stringOrNull(payload.behavior_status);
    const total = numberOrZero(summary.total);
    const passed = numberOrZero(summary.passed);
    const failed = numberOrZero(summary.failed);
    const error = numberOrZero(summary.error);
    const metricWarning = buildBenchmarkMetricContractWarning(
      proposal?.benchmarkCommand ?? null,
      proposal?.metricName ?? null,
    );
    const benchmarkScriptProposal = proposal?.metricName
      ? buildMetricBenchmarkScriptProposal({
          cwd: input.cwd,
          benchmarkCommand: proposal.benchmarkCommand,
          metricName: proposal.metricName,
          direction: proposal.direction ?? "lower",
          benchmarkMetricWarning: metricWarning,
          benchmarkScriptPresent: existsSync(
            resolveAutoresearchPaths(input.cwd).benchmarkScriptPath,
          ),
          dspxBehaviorPath: behaviorPath,
          dspxTotal: total,
        })
      : null;
    const scriptProposalCanDriveBaseline =
      canBenchmarkScriptProposalDriveBaseline(benchmarkScriptProposal);
    const warnings: string[] = [];
    if (!exact)
      warnings.push(
        "DSPx behavior evidence does not contain an exact objective match; treat proposal as stale or generic",
      );
    if (status && status !== "passed") warnings.push(`DSPx behavior evidence status is ${status}`);
    if (status === "passed" && (total <= 0 || failed > 0 || error > 0 || passed !== total)) {
      warnings.push("DSPx behavior evidence summary counts are inconsistent with passed status");
    }
    if (selectedStatus && selectedStatus !== "passed") {
      warnings.push(`DSPx selected example status is ${selectedStatus}`);
    }
    if (!proposal) warnings.push("DSPx behavior evidence has no observable setup proposal");
    if (metricWarning && !scriptProposalCanDriveBaseline) warnings.push(metricWarning);
    const measurementContractRisk = buildMeasurementContractRisk(benchmarkScriptProposal);
    if (measurementContractRisk) warnings.push(measurementContractRisk);
    const nextToolCall = proposalToSetupToolCall(input.cwd, proposal, benchmarkScriptProposal);
    return {
      authority: "evidence_only_non_authoritative",
      behaviorPath,
      available: true,
      status,
      total,
      passed,
      failed,
      error,
      matchedObjective: Boolean(exact),
      selectedExampleIndex: selected ? numberOrNull(selected.index) : null,
      selectedExampleStatus: selectedStatus,
      proposal,
      benchmarkScriptProposal,
      warnings,
      nextToolCall,
    };
  } catch (error) {
    return {
      ...missing,
      available: true,
      warnings: [`could not parse DSPx behavior evidence: ${formatErrorMessage(error)}`],
    };
  }
}

function parseDspxAdvisoryProposal(
  observed: Record<string, unknown>,
): AutoresearchDspxAdvisoryProposal {
  const direction = stringOrNull(observed.direction);
  return {
    campaignName: stringOrNull(observed.campaign_name),
    metricName: stringOrNull(observed.metric_name),
    metricUnit: stringOrNull(observed.metric_unit) ?? "",
    direction: direction === "lower" || direction === "higher" ? direction : null,
    metricThreshold: numberOrNull(observed.metric_threshold),
    benchmarkCommand: stringOrNull(observed.benchmark_command),
    checksCommand: stringOrNull(observed.checks_command),
    risks: stringOrNull(observed.risks),
    nextAction: stringOrNull(observed.next_action),
  };
}

function proposalToSetupToolCall(
  cwd: string,
  proposal: AutoresearchDspxAdvisoryProposal | null,
  benchmarkScriptProposal: AutoresearchBenchmarkScriptProposal | null = null,
): string | null {
  if (
    !proposal?.campaignName ||
    !proposal.metricName ||
    !proposal.direction ||
    !proposal.benchmarkCommand
  ) {
    return null;
  }
  const metricWarning = buildBenchmarkMetricContractWarning(
    proposal.benchmarkCommand,
    proposal.metricName,
  );
  const scriptProposalCanDriveBaseline =
    canBenchmarkScriptProposalDriveBaseline(benchmarkScriptProposal);
  const action: AutoresearchSetupAction =
    metricWarning && !scriptProposalCanDriveBaseline ? "plan" : "baseline";
  return formatAutoplanSetupToolCall({
    cwd,
    config: createConfigReceipt({
      name: proposal.campaignName,
      metricName: proposal.metricName,
      metricUnit: proposal.metricUnit,
      direction: proposal.direction,
      metricThreshold: proposal.metricThreshold ?? undefined,
    }),
    action,
    benchmarkCommand:
      scriptProposalCanDriveBaseline && benchmarkScriptProposal
        ? benchmarkScriptProposal.benchmarkCommand
        : proposal.benchmarkCommand,
    checksCommand: proposal.checksCommand,
    benchmarkScriptProposal: scriptProposalCanDriveBaseline ? benchmarkScriptProposal : null,
  });
}

function numberOrZero(value: unknown): number {
  return typeof value === "number" && Number.isFinite(value) ? value : 0;
}

function numberOrNull(value: unknown): number | null {
  return typeof value === "number" && Number.isFinite(value) ? value : null;
}

function renderDspxAutoresearchIntent(input: {
  objective: string;
  filesInScope: readonly string[];
  offLimits: readonly string[];
  constraints: readonly string[];
  config: AutoresearchConfigReceipt;
  benchmarkCommand: string | null;
  checksCommand: string | null;
}): string {
  const inputFields = [
    ["runtime_status", "current pi-autoresearch state summary"],
    ["repo_summary", "concise repository and script summary"],
    ["objective", "optimization objective"],
    ["constraints", "bounded execution and safety constraints"],
  ] as const;
  const outputFields = [
    ["campaign_name", "proposed campaign or segment name"],
    ["metric_name", "primary metric name"],
    ["metric_unit", "primary metric unit"],
    ["direction", "lower or higher"],
    ["metric_threshold", "optional explicit success threshold for threshold-style metrics"],
    ["benchmark_command", "local command that prints METRIC name=value"],
    ["checks_command", "optional local safety command"],
    ["risks", "bounded setup risks"],
    ["next_action", "exact pi-autoresearch setup or run recommendation"],
  ] as const;
  return [
    "schema_version: program-intent-v2",
    "name: autoresearch_autosetup_planner",
    `objective: ${yamlQuote("Plan a bounded pi-autoresearch campaign setup from repo/runtime context.")}`,
    "task_type: single_module",
    `metric: ${yamlQuote(input.config.metricName)}`,
    "inputs:",
    ...inputFields.map(([name]) => `  - ${name}`),
    "outputs:",
    ...outputFields.map(([name]) => `  - ${name}`),
    "input_fields:",
    ...inputFields.flatMap(([name, desc]) => [`  - name: ${name}`, `    desc: ${yamlQuote(desc)}`]),
    "output_fields:",
    ...outputFields.flatMap(([name, desc]) => [
      `  - name: ${name}`,
      `    desc: ${yamlQuote(desc)}`,
    ]),
    "description: DSPy planner candidate for bounded pi-autoresearch campaign setup.",
    "constraints:",
    "  - bounded local runtime only",
    ...input.constraints.map((constraint) => `  - ${yamlQuote(constraint)}`),
    "topology:",
    "  kind: single_module",
    "signature:",
    "  name: AutoresearchSetupPlanner",
    "  inputs:",
    ...inputFields.map(([name, desc]) => `    - ${yamlQuote(`${name}: ${desc}`)}`),
    "  outputs:",
    ...outputFields.map(([name, desc]) => `    - ${yamlQuote(`${name}: ${desc}`)}`),
    "examples:",
    ...renderDspxAutoresearchExamples(input),
    "metadata:",
    "  authority: evidence_only",
    "  outer_controller: pi-autoresearch",
    "  program_gen_automation: false",
  ].join("\n");
}

function renderDspxAutoresearchExamples(input: {
  objective: string;
  filesInScope: readonly string[];
  offLimits: readonly string[];
  constraints: readonly string[];
  config: AutoresearchConfigReceipt;
  benchmarkCommand: string | null;
  checksCommand: string | null;
}): string[] {
  const examples = [
    {
      inputs: {
        objective: input.objective,
        constraints: ["bounded local runtime only", ...input.constraints].join("; "),
        repo_summary: `files=${input.filesInScope.join(", ")}; off_limits=${input.offLimits.join(", ")}`,
        runtime_status:
          "segment_unconfigured; no prior receipt log; benchmark/check commands inferred from package scripts or operator overrides",
      },
      outputs: {
        campaign_name: input.config.name,
        metric_name: input.config.metricName,
        metric_unit: input.config.metricUnit,
        direction: input.config.direction,
        metric_threshold: input.config.metricThreshold ?? "",
        benchmark_command: input.benchmarkCommand ?? "<benchmark command required>",
        checks_command: input.checksCommand ?? "",
        risks: "keep setup bounded; do not mutate authority or launch hidden loops",
        next_action: "apply setup through autoresearch_runtime_setup, then run bounded loop",
      },
    },
    {
      inputs: {
        objective: "reduce package test runtime without reducing correctness",
        constraints:
          "bounded local runtime only; no network; do not edit lockfiles; stop on checks_failed or crash",
        repo_summary:
          "package.json scripts: test=vitest run, check=npm run lint && npm run test; files=src, tests, package.json; off_limits=.env,node_modules,dist",
        runtime_status: "segment_unconfigured; autoresearch.sh missing; checks script missing",
      },
      outputs: {
        campaign_name: "package-test-runtime",
        metric_name: "total_ms",
        metric_unit: "ms",
        direction: "lower",
        metric_threshold: "",
        benchmark_command: "npm test",
        checks_command: "npm run check",
        risks:
          "benchmark may include noisy test startup cost; require repeated bounded runs before interpreting small deltas",
        next_action:
          "call autoresearch_runtime_setup action=baseline with benchmarkCommand npm test and checksCommand npm run check",
      },
    },
    {
      inputs: {
        objective: "improve answer quality score for a local evaluation harness",
        constraints:
          "bounded local runtime only; generated DSPx artifacts are evidence only; Pi remains outer controller",
        repo_summary:
          "autoresearch.sh exists and prints METRIC quality_score=value; package.json scripts: check=npm run quality:ci; files=src/evaluator.ts,evals,autoresearch.sh",
        runtime_status: "ready; existing segment quality-eval has baseline 72; higher is better",
      },
      outputs: {
        campaign_name: "quality-eval-improvement",
        metric_name: "quality_score",
        metric_unit: "",
        direction: "higher",
        metric_threshold: "",
        benchmark_command: "bash autoresearch.sh",
        checks_command: "npm run quality:ci",
        risks:
          "quality score can overfit local examples; preserve held-out checks and off-limits eval fixtures",
        next_action:
          "if rebaselining, call autoresearch_runtime_setup action=baseline reconfigure=true; otherwise call autoresearch_runtime_loop maxIterations=3",
      },
    },
  ];
  return examples.flatMap((example) => [
    "  - inputs:",
    `      objective: ${yamlQuote(example.inputs.objective)}`,
    `      constraints: ${yamlQuote(example.inputs.constraints)}`,
    `      repo_summary: ${yamlQuote(example.inputs.repo_summary)}`,
    `      runtime_status: ${yamlQuote(example.inputs.runtime_status)}`,
    "    outputs:",
    `      campaign_name: ${yamlQuote(example.outputs.campaign_name)}`,
    `      metric_name: ${yamlQuote(example.outputs.metric_name)}`,
    `      metric_unit: ${yamlQuote(example.outputs.metric_unit)}`,
    `      direction: ${yamlQuote(example.outputs.direction)}`,
    `      metric_threshold: ${yamlQuote(String(example.outputs.metric_threshold))}`,
    `      benchmark_command: ${yamlQuote(example.outputs.benchmark_command)}`,
    `      checks_command: ${yamlQuote(example.outputs.checks_command)}`,
    `      risks: ${yamlQuote(example.outputs.risks)}`,
    `      next_action: ${yamlQuote(example.outputs.next_action)}`,
  ]);
}

function formatErrorMessage(error: unknown): string {
  if (error instanceof Error) return error.message;
  return String(error);
}

export function resolveDspxRepoPath(): string {
  return process.env.DSPX_HOME ?? "/home/tryinget/ai-society/softwareco/owned/dspx";
}

function yamlQuote(value: string): string {
  return JSON.stringify(value);
}

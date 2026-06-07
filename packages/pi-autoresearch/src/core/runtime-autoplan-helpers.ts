import { existsSync, readFileSync } from "node:fs";
import path from "node:path";

import { isRecord, normalizeArray } from "./runtime-common.ts";
import type {
  AutoresearchBenchmarkScriptProposal,
  AutoresearchConfigReceipt,
  AutoresearchMeasurementContract,
  AutoresearchRuntimeStatus,
  AutoresearchSetupAction,
  BuildAutoresearchAutoplanInput,
  MetricDirection,
} from "./runtime-model.ts";
import { type AutoresearchPaths, resolveAutoresearchPaths } from "./runtime-receipts.ts";

const DENIED_METRIC_NAMES = new Set(["__proto__", "constructor", "prototype"]);

export function readPackageScripts(cwd: string): Record<string, string> {
  const packageJsonPath = path.join(cwd, "package.json");
  if (!existsSync(packageJsonPath)) return {};
  try {
    const parsed = JSON.parse(readFileSync(packageJsonPath, "utf8")) as unknown;
    if (!isRecord(parsed) || !isRecord(parsed.scripts)) return {};
    return Object.fromEntries(
      Object.entries(parsed.scripts).filter((entry): entry is [string, string] => {
        return typeof entry[1] === "string";
      }),
    );
  } catch {
    return {};
  }
}

export function readPackageName(cwd: string): string | null {
  const packageJsonPath = path.join(cwd, "package.json");
  if (!existsSync(packageJsonPath)) return null;
  try {
    const parsed = JSON.parse(readFileSync(packageJsonPath, "utf8")) as unknown;
    if (!isRecord(parsed) || typeof parsed.name !== "string") return null;
    return parsed.name;
  } catch {
    return null;
  }
}

export function readJustRecipes(cwd: string): string[] {
  const justfilePath = path.join(cwd, "Justfile");
  if (!existsSync(justfilePath)) return [];
  try {
    return readFileSync(justfilePath, "utf8")
      .split(/\r?\n/)
      .map((line) => /^(?!\s)([A-Za-z0-9_.-]+)\s*:/.exec(line)?.[1])
      .filter((entry): entry is string => Boolean(entry));
  } catch {
    return [];
  }
}

export function inferMetricConfig(
  input: Pick<BuildAutoresearchAutoplanInput, "metricName" | "metricUnit" | "direction">,
  objective: string,
): { metricName: string; metricUnit: string; direction: MetricDirection } {
  const lowered = objective.toLowerCase();
  if (input.metricName?.trim()) {
    return {
      metricName: input.metricName.trim(),
      metricUnit: input.metricUnit ?? "",
      direction: input.direction ?? "lower",
    };
  }
  if (/accur|quality|score|pass rate|coverage/.test(lowered)) {
    return { metricName: "score", metricUnit: "", direction: input.direction ?? "higher" };
  }
  return {
    metricName: "total_ms",
    metricUnit: input.metricUnit ?? "ms",
    direction: input.direction ?? "lower",
  };
}

export function inferBenchmarkCommand(
  paths: AutoresearchPaths,
  packageScripts: Record<string, string>,
  justRecipes: readonly string[],
): string | null {
  if (existsSync(paths.benchmarkScriptPath)) return "bash autoresearch.sh";
  for (const name of ["bench", "benchmark", "perf", "test:perf", "test:benchmark"]) {
    if (packageScripts[name]) return `npm run ${name}`;
  }
  for (const name of ["bench", "benchmark", "perf"]) {
    if (justRecipes.includes(name)) return `just ${name}`;
  }
  if (packageScripts.test) return "npm test";
  return null;
}

export function inferChecksCommand(
  paths: AutoresearchPaths,
  packageScripts: Record<string, string>,
  justRecipes: readonly string[],
): string | null {
  if (existsSync(paths.checksScriptPath)) return "bash autoresearch.checks.sh";
  for (const name of ["check", "quality:ci", "ci", "test"]) {
    if (packageScripts[name]) return `npm run ${name}`;
  }
  for (const name of ["check", "ci", "test"]) {
    if (justRecipes.includes(name)) return `just ${name}`;
  }
  return null;
}

export function slugAutoresearchName(objective: string, packageName: string | null): string {
  const source = `${packageName ?? "campaign"}-${objective}`;
  const slug = source
    .toLowerCase()
    .replace(/^@/, "")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 64)
    .replace(/-+$/g, "");
  return slug || "autoresearch-campaign";
}

export function inferFilesInScope(cwd: string, requested: readonly string[] | undefined): string[] {
  const normalized = normalizeArray(requested);
  if (normalized.length > 0) return normalized;
  return ["src", "tests", "package.json", "Justfile", "autoresearch.sh"].filter((entry) =>
    existsSync(path.join(cwd, entry)),
  );
}

export function buildDuplicateChecksReason(
  cwd: string,
  benchmarkCommand: string | null,
  checksCommand: string | null,
  packageScripts: Record<string, string>,
): string | null {
  if (!benchmarkCommand || !checksCommand) return null;
  const benchmark = resolveCommandEquivalenceKey(benchmarkCommand, packageScripts, cwd);
  const checks = resolveCommandEquivalenceKey(checksCommand, packageScripts, cwd);
  if (!benchmark || !checks || benchmark !== checks) return null;
  return `${JSON.stringify(benchmarkCommand)} and ${JSON.stringify(checksCommand)} both resolve to ${benchmark}`;
}

function resolveCommandEquivalenceKey(
  command: string,
  packageScripts: Record<string, string>,
  cwd: string,
  seen: Set<string> = new Set(),
): string | null {
  const normalized = command.trim().toLowerCase().replace(/\s+/g, " ");
  const wrappedCommand = parseAutoresearchWrappedCommand(cwd, normalized);
  if (wrappedCommand)
    return resolveCommandEquivalenceKey(wrappedCommand, packageScripts, cwd, seen);
  const scriptName = parseNpmScriptName(normalized);
  if (!scriptName) return normalized;
  if (seen.has(scriptName)) return `npm-script:${scriptName}`;
  seen.add(scriptName);
  const scriptBody = packageScripts[scriptName]?.trim();
  if (!scriptBody) return `npm-script:${scriptName}`;
  const nestedScriptName = parseNpmScriptName(scriptBody.toLowerCase().replace(/\s+/g, " "));
  if (nestedScriptName) return resolveCommandEquivalenceKey(scriptBody, packageScripts, cwd, seen);
  return `npm-script-body:${scriptBody}`;
}

function parseNpmScriptName(normalizedCommand: string): string | null {
  if (normalizedCommand === "npm test" || normalizedCommand === "npm run test") return "test";
  const match = /^npm run(?:-script)? ([a-z0-9:_-]+)$/u.exec(normalizedCommand);
  return match?.[1] ?? null;
}

function parseAutoresearchWrappedCommand(cwd: string, normalizedCommand: string): string | null {
  if (!/^(?:bash\s+)?(?:\.\/)?autoresearch\.sh$/u.test(normalizedCommand)) return null;
  const scriptPath = resolveAutoresearchPaths(cwd).benchmarkScriptPath;
  if (!existsSync(scriptPath)) return null;
  try {
    for (const rawLine of readFileSync(scriptPath, "utf8").split(/\r?\n/)) {
      const line = rawLine.trim();
      if (line.startsWith("# autoresearch-wrapped-command-json: ")) {
        try {
          const command = JSON.parse(line.slice("# autoresearch-wrapped-command-json: ".length));
          return typeof command === "string" ? command : null;
        } catch {
          return null;
        }
      }
      if (!line || line.startsWith("#") || line === "set -euo pipefail") continue;
      if (/^(?:start_ms|end_ms)=/u.test(line)) continue;
      if (/^echo\s+["']?METRIC\b/u.test(line)) continue;
      if (/^(?:npm\s+(?:test|run|run-script)\b|just\s+)/u.test(line)) return line;
    }
  } catch {
    return null;
  }
  return null;
}

export function buildAutoplanRisks(input: {
  benchmarkCommand: string | null;
  checksCommand: string | null;
  metricName: string;
  status: AutoresearchRuntimeStatus;
  benchmarkMetricWarning?: string | null;
  measurementContractRisk?: string | null;
  duplicateChecksReason?: string | null;
  duplicateChecksOmitted?: boolean;
}): string[] {
  const risks: string[] = [];
  if (!input.benchmarkCommand) {
    risks.push(
      "no benchmark command was detected; provide one or allow a benchmark script to be created",
    );
  }
  if (!input.checksCommand) {
    risks.push(
      input.duplicateChecksOmitted && input.duplicateChecksReason
        ? `checks command omitted because ${input.duplicateChecksReason}`
        : "no checks command was detected; loop safety will rely on benchmark exit status only",
    );
  } else if (input.duplicateChecksReason) {
    risks.push(
      `benchmark and checks commands appear equivalent; setup will run the same gate twice because checksCommand was provided explicitly (${input.duplicateChecksReason})`,
    );
  }
  const metricWarning =
    input.benchmarkMetricWarning === undefined
      ? buildBenchmarkMetricContractWarning(input.benchmarkCommand, input.metricName)
      : input.benchmarkMetricWarning;
  if (metricWarning) risks.push(metricWarning);
  if (input.measurementContractRisk) risks.push(input.measurementContractRisk);
  if (input.status.currentSegment.configured) {
    risks.push(
      "runtime is already configured; setup apply requires reconfigure=true for a new segment",
    );
  }
  return risks;
}

export function buildBenchmarkMetricContractWarning(
  benchmarkCommand: string | null,
  metricName: string | null,
): string | null {
  if (!benchmarkCommand || !metricName) return null;
  const command = benchmarkCommand.trim();
  const normalized = command.toLowerCase().replace(/\s+/g, " ");
  const metric = metricName.trim();
  if (!metric) return null;
  if (command.includes("METRIC") || command.includes(metric)) return null;
  if (/\bautoresearch(\.sh|\b)/.test(normalized)) return null;
  if (/\b(bench|benchmark|perf)\b/.test(normalized)) return null;
  const genericCommands = new Set([
    "npm test",
    "npm run test",
    "npm run check",
    "npm run ci",
    "npm run quality:ci",
    "just test",
    "just check",
    "just ci",
  ]);
  if (!genericCommands.has(normalized)) return null;
  return `benchmark command ${JSON.stringify(command)} may not print required METRIC ${metric}=value; provide a benchmark script or explicit benchmarkCommand that emits the metric`;
}

export function buildMetricBenchmarkScriptProposal(input: {
  cwd: string;
  benchmarkCommand: string | null;
  metricName: string;
  direction: MetricDirection;
  benchmarkMetricWarning: string | null;
  benchmarkScriptPresent: boolean;
  dspxBehaviorPath?: string | null;
  dspxTotal?: number;
}): AutoresearchBenchmarkScriptProposal | null {
  if (!input.benchmarkMetricWarning || !input.benchmarkCommand) return null;
  if (input.benchmarkScriptPresent) return null;
  if (!isMetricNameScriptSafe(input.metricName)) return null;

  if (isScoreLikeMetricName(input.metricName)) {
    if (!input.dspxBehaviorPath || !input.dspxTotal || input.dspxTotal <= 0) return null;
    return {
      benchmarkCommand: "bash autoresearch.sh",
      benchmarkScript: buildDspxBehaviorScoreBenchmarkScript({
        cwd: input.cwd,
        behaviorPath: input.dspxBehaviorPath,
        metricName: input.metricName,
      }),
      allowOverwriteScripts: false,
      reason:
        "generic benchmark command does not emit the requested score metric; existing DSPx behavior_results.json can be summarized as advisory evidence but cannot drive a baseline unless regenerated during the benchmark",
      source: "dspx_behavior_score",
      measurementContract: {
        metricName: input.metricName,
        generatedBy: "existing DSPx behavior_results.json summary",
        freshness: "static_existing_artifact",
        causalLink: "reads_prior_advisory_artifact",
        optimizationAuthority: "advisory_only",
        reason:
          "the script reads a pre-existing advisory artifact rather than generating fresh evidence during the current benchmark run",
      },
    };
  }

  if (input.direction !== "lower") return null;
  return {
    benchmarkCommand: "bash autoresearch.sh",
    benchmarkScript: buildDurationBenchmarkScript(input.benchmarkCommand, input.metricName),
    allowOverwriteScripts: false,
    reason:
      "generic benchmark command does not emit METRIC output; wrap it with a bounded local duration measurement",
    source: "duration_wrapper",
    measurementContract: {
      metricName: input.metricName,
      generatedBy: `duration wrapper around ${input.benchmarkCommand.trim()}`,
      freshness: "run_generated",
      causalLink: "wraps_current_benchmark_command",
      optimizationAuthority: "baseline_allowed",
      reason:
        "the metric is generated during the current benchmark run by measuring elapsed wall-clock time around the benchmark command",
    },
  };
}

export function canBenchmarkScriptProposalDriveBaseline(
  proposal: AutoresearchBenchmarkScriptProposal | null,
): boolean {
  return proposal?.measurementContract.optimizationAuthority === "baseline_allowed";
}

export function buildAutoplanMeasurementContract(input: {
  benchmarkCommand: string | null;
  metricName: string;
  benchmarkMetricWarning: string | null;
  benchmarkScriptProposal: AutoresearchBenchmarkScriptProposal | null;
}): AutoresearchMeasurementContract | null {
  if (input.benchmarkScriptProposal) return input.benchmarkScriptProposal.measurementContract;
  if (!input.benchmarkCommand || input.benchmarkMetricWarning) return null;
  return {
    metricName: input.metricName,
    generatedBy: input.benchmarkCommand,
    freshness: "run_generated",
    causalLink: "benchmark_command_declares_metric",
    optimizationAuthority: "baseline_allowed",
    reason:
      "the benchmark command is not classified as a generic non-metric command and is treated as the metric-emitting source for this bounded run",
  };
}

export function buildMeasurementContractRisk(
  proposal: AutoresearchBenchmarkScriptProposal | null,
): string | null {
  if (!proposal || canBenchmarkScriptProposalDriveBaseline(proposal)) return null;
  return `measurement contract is ${proposal.measurementContract.optimizationAuthority}: ${proposal.measurementContract.reason}`;
}

function buildDurationBenchmarkScript(benchmarkCommand: string, metricName: string): string {
  const command = benchmarkCommand.trim();
  return [
    "#!/usr/bin/env bash",
    "set -euo pipefail",
    `# autoresearch-wrapped-command-json: ${JSON.stringify(command)}`,
    "",
    `AUTORESEARCH_BENCHMARK_COMMAND=${shellSingleQuote(command)} node <<'NODE'`,
    'const { spawnSync } = require("node:child_process");',
    "const command = process.env.AUTORESEARCH_BENCHMARK_COMMAND;",
    "if (!command) throw new Error('AUTORESEARCH_BENCHMARK_COMMAND is required');",
    "const startedAt = Date.now();",
    "const result = spawnSync(command, { shell: true, stdio: 'inherit' });",
    "const durationMs = Date.now() - startedAt;",
    "if (result.error) throw result.error;",
    "if (result.signal) process.exit(1);",
    "if (typeof result.status === 'number' && result.status !== 0) process.exit(result.status);",
    `console.log(\`METRIC ${metricName}=\${durationMs}\`);`,
    "NODE",
    "",
  ].join("\n");
}

function buildDspxBehaviorScoreBenchmarkScript(input: {
  cwd: string;
  behaviorPath: string;
  metricName: string;
}): string {
  const behaviorPathForScript = formatLocalScriptPath(input.cwd, input.behaviorPath);
  return [
    "#!/usr/bin/env bash",
    "set -euo pipefail",
    "",
    `DSPX_BEHAVIOR_PATH=${shellSingleQuote(behaviorPathForScript)} node <<'NODE'`,
    'const fs = require("node:fs");',
    "const behaviorPath = process.env.DSPX_BEHAVIOR_PATH;",
    "if (!behaviorPath) throw new Error('DSPX_BEHAVIOR_PATH is required');",
    "const payload = JSON.parse(fs.readFileSync(behaviorPath, 'utf8'));",
    "const summary = payload && typeof payload.summary === 'object' && payload.summary ? payload.summary : {};",
    "const examples = Array.isArray(payload?.examples) ? payload.examples : [];",
    "const numeric = (value) => (typeof value === 'number' && Number.isFinite(value) ? value : null);",
    "let total = numeric(summary.total);",
    "let passed = numeric(summary.passed);",
    "if (total === null || total <= 0) total = examples.length;",
    "if (passed === null) passed = examples.filter((example) => example?.status === 'passed').length;",
    "if (!Number.isFinite(total) || total <= 0) throw new Error('DSPx behavior evidence has no examples to score');",
    "const score = (passed / total) * 100;",
    `console.log(\`METRIC ${input.metricName}=\${score}\`);`,
    "NODE",
    "",
  ].join("\n");
}

function isScoreLikeMetricName(metricName: string): boolean {
  return /(?:score|quality|accuracy|coverage|success|pass(?:ed)?(?:_|-)?rate|percent|pct)/iu.test(
    metricName,
  );
}

function isMetricNameScriptSafe(metricName: string): boolean {
  return /^[\w.µ:-]+$/u.test(metricName) && !DENIED_METRIC_NAMES.has(metricName);
}

export function formatLocalScriptPath(cwd: string, targetPath: string): string {
  const absoluteTarget = path.isAbsolute(targetPath) ? targetPath : path.resolve(cwd, targetPath);
  const relative = path.relative(cwd, absoluteTarget);
  if (relative && !relative.startsWith("..") && !path.isAbsolute(relative)) return relative;
  return absoluteTarget;
}

export function shellSingleQuote(value: string): string {
  return `'${value.replaceAll("'", "'\\''")}'`;
}

export function formatAutoplanSetupToolCall(input: {
  cwd: string;
  config: AutoresearchConfigReceipt;
  action: AutoresearchSetupAction;
  benchmarkCommand: string;
  checksCommand: string | null;
  benchmarkScriptProposal?: AutoresearchBenchmarkScriptProposal | null;
}): string {
  const scriptFields = input.benchmarkScriptProposal
    ? `, benchmarkScript: ${JSON.stringify(input.benchmarkScriptProposal.benchmarkScript)}, allowOverwriteScripts: false`
    : "";
  const thresholdField =
    input.config.metricThreshold === undefined
      ? ""
      : `, metricThreshold: ${JSON.stringify(input.config.metricThreshold)}`;
  return `autoresearch_runtime_setup({ action: ${JSON.stringify(input.action)}, cwd: ${JSON.stringify(input.cwd)}, name: ${JSON.stringify(input.config.name)}, metricName: ${JSON.stringify(input.config.metricName)}, metricUnit: ${JSON.stringify(input.config.metricUnit)}, direction: ${JSON.stringify(input.config.direction)}${thresholdField}, benchmarkCommand: ${JSON.stringify(input.benchmarkCommand)}, checksCommand: ${input.checksCommand === null ? "null" : JSON.stringify(input.checksCommand)}${scriptFields} })`;
}

export function normalizeOptionalString(value: string | null | undefined): string | null {
  if (value === null) return null;
  const trimmed = value?.trim();
  return trimmed ? trimmed : null;
}

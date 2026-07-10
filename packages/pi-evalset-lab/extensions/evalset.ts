import { createHash, randomUUID } from "node:crypto";
import { link, mkdir, readFile, rm, writeFile } from "node:fs/promises";
import { dirname, isAbsolute, resolve } from "node:path";
import {
  type Api,
  type AssistantMessage,
  type Context,
  complete,
  type Model,
  type Usage,
} from "@earendil-works/pi-ai";
import type { ExtensionAPI, ExtensionCommandContext } from "@earendil-works/pi-coding-agent";

const COMMAND_NAME = "evalset";
const CUSTOM_MESSAGE_TYPE = "evalset";

const HELP_TEXT = [
  "evalset command",
  "",
  "Usage:",
  `  /${COMMAND_NAME} help`,
  `  /${COMMAND_NAME} run <dataset.json> [--system-file <path>] [--system-text <text>] [--variant <name>] [--max-cases <n>] [--temperature <n>] [--out <report.json>]`,
  `  /${COMMAND_NAME} compare <dataset.json> <baseline-system.txt> <candidate-system.txt> [--baseline-name <name>] [--candidate-name <name>] [--max-cases <n>] [--temperature <n>] [--out <report.json>]`,
  `  /${COMMAND_NAME} init [dataset-path] [--force]`,
  "",
  "Notes:",
  `  /${COMMAND_NAME} is a pi slash command (not a shell executable).`,
  "  Non-interactive shell usage:",
  `    pi -e ./extensions/${COMMAND_NAME}.ts -p "/${COMMAND_NAME} compare <dataset.json> <baseline-system.txt> <candidate-system.txt>"`,
  "",
  "Dataset shape:",
  "  {",
  '    "name": "optional-name",',
  '    "systemPrompt": "optional base system prompt",',
  '    "cases": [',
  "      {",
  '        "id": "case-id",',
  '        "input": "user prompt",',
  '        "expectContains": ["term-a", "term-b"],',
  '        "expectNotContains": ["forbidden-term"],',
  '        "expectRegex": "^optional-regex$"',
  "      }",
  "    ]",
  "  }",
].join("\n");

interface EvalCaseDefinition {
  id?: string;
  input: string;
  expectContains?: string[];
  expectNotContains?: string[];
  expectRegex?: string;
}

interface EvalDataset {
  name?: string;
  systemPrompt?: string;
  cases: EvalCaseDefinition[];
}

interface RunCommandConfig {
  datasetPath: string;
  systemFilePath?: string;
  systemText?: string;
  outPath?: string;
  variantName: string;
  maxCases?: number;
  temperature?: number;
}

interface CompareCommandConfig {
  datasetPath: string;
  baselineSystemPath: string;
  candidateSystemPath: string;
  outPath?: string;
  baselineName: string;
  candidateName: string;
  maxCases?: number;
  temperature?: number;
}

interface VariantDefinition {
  name: string;
  systemPrompt: string;
  source: string;
}

interface CaseCheckResult {
  check: string;
  pass: boolean;
  details: string;
}

interface EvalCaseResult {
  id: string;
  input: string;
  scored: boolean;
  pass: boolean;
  checks: CaseCheckResult[];
  failedChecks: string[];
  output: string;
  outputPreview: string;
  latencyMs: number;
  stopReason: string;
  usage: Usage;
  error?: string;
}

interface EvalRunTotals {
  cases: number;
  scoredCases: number;
  passedCases: number;
  failedCases: number;
  passRate: number | null;
  totalLatencyMs: number;
  avgLatencyMs: number;
  usage: Usage;
}

interface EvalRunIdentity {
  runId: string;
  startedAt: string;
  finishedAt: string;
  modelKey: string;
  temperature: number | null;
  datasetHash: string;
  casesHash: string;
  variantHash: string;
}

interface EvalRunReport {
  kind: "evalset-run";
  createdAt: string;
  run: EvalRunIdentity;
  dataset: {
    name: string;
    path: string;
  };
  model: {
    provider: string;
    id: string;
    api: string;
  };
  variant: VariantDefinition;
  totals: EvalRunTotals;
  cases: EvalCaseResult[];
}

interface EvalCompareIdentity {
  runId: string;
  startedAt: string;
  finishedAt: string;
  modelKey: string;
  temperature: number | null;
  datasetHash: string;
  casesHash: string;
  baselineRunId: string;
  candidateRunId: string;
  baselineVariantHash: string;
  candidateVariantHash: string;
}

interface EvalCompareReport {
  kind: "evalset-compare";
  createdAt: string;
  run: EvalCompareIdentity;
  dataset: {
    name: string;
    path: string;
  };
  model: {
    provider: string;
    id: string;
    api: string;
  };
  baseline: EvalRunReport;
  candidate: EvalRunReport;
  delta: {
    passRate: number | null;
    avgLatencyMs: number;
    totalCost: number;
  };
}

function parseArgs(input: string): string[] {
  const tokens: string[] = [];
  const regex = /"((?:\\.|[^"\\])*)"|'((?:\\.|[^'\\])*)'|(\S+)/g;

  for (const match of input.matchAll(regex)) {
    const value = match[1] ?? match[2] ?? match[3] ?? "";
    tokens.push(value.replace(/\\(["'\\])/g, "$1").replace(/\\n/g, "\n"));
  }

  return tokens;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function canonicalize(value: unknown): unknown {
  if (Array.isArray(value)) {
    return value.map((entry) => canonicalize(entry));
  }

  if (isRecord(value)) {
    const sortedEntries = Object.entries(value)
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([key, entry]) => [key, canonicalize(entry)] as const);
    return Object.fromEntries(sortedEntries);
  }

  return value;
}

function hashString(value: string): string {
  return createHash("sha256").update(value).digest("hex");
}

function hashObject(value: unknown): string {
  return hashString(JSON.stringify(canonicalize(value)));
}

function shortHash(value: string, length = 12): string {
  return value.slice(0, length);
}

function parseStringArray(value: unknown, fieldName: string): string[] | undefined {
  if (value === undefined) {
    return undefined;
  }
  if (!Array.isArray(value) || !value.every((entry) => typeof entry === "string")) {
    throw new Error(`Field '${fieldName}' must be an array of strings when provided.`);
  }
  return value;
}

function parseCase(value: unknown, index: number): EvalCaseDefinition {
  if (!isRecord(value)) {
    throw new Error(`Case at index ${index} must be an object.`);
  }

  const input = value.input;
  if (typeof input !== "string" || input.trim().length === 0) {
    throw new Error(`Case at index ${index} must include a non-empty 'input' string.`);
  }

  const id = value.id;
  if (id !== undefined && typeof id !== "string") {
    throw new Error(`Case at index ${index}: 'id' must be a string when provided.`);
  }

  const expectContains = parseStringArray(value.expectContains, `cases[${index}].expectContains`);
  const expectNotContains = parseStringArray(
    value.expectNotContains,
    `cases[${index}].expectNotContains`,
  );

  const expectRegex = value.expectRegex;
  if (expectRegex !== undefined && typeof expectRegex !== "string") {
    throw new Error(`Case at index ${index}: 'expectRegex' must be a string when provided.`);
  }

  return {
    id,
    input,
    expectContains,
    expectNotContains,
    expectRegex,
  };
}

function parseDataset(raw: string): EvalDataset {
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    throw new Error(`Invalid JSON dataset: ${message}`);
  }

  if (!isRecord(parsed)) {
    throw new Error("Dataset must be an object.");
  }

  const cases = parsed.cases;
  if (!Array.isArray(cases) || cases.length === 0) {
    throw new Error("Dataset must include a non-empty 'cases' array.");
  }

  const name = parsed.name;
  if (name !== undefined && typeof name !== "string") {
    throw new Error("Dataset field 'name' must be a string when provided.");
  }

  const systemPrompt = parsed.systemPrompt;
  if (systemPrompt !== undefined && typeof systemPrompt !== "string") {
    throw new Error("Dataset field 'systemPrompt' must be a string when provided.");
  }

  const parsedCases = cases.map((entry, index) => parseCase(entry, index));
  const ids = new Set<string>();
  for (let index = 0; index < parsedCases.length; index += 1) {
    const id = parsedCases[index].id;
    if (id !== undefined && !id.trim()) {
      throw new Error(`Case at index ${index}: 'id' must not be empty.`);
    }
    const normalized = id?.trim() || `case-${index + 1}`;
    if (ids.has(normalized)) throw new Error(`Duplicate case id: ${normalized}`);
    ids.add(normalized);
    parsedCases[index].id = normalized;
  }

  return { name, systemPrompt, cases: parsedCases };
}

function toAbsolutePath(cwd: string, inputPath: string): string {
  return isAbsolute(inputPath) ? inputPath : resolve(cwd, inputPath);
}

interface LoadedDataset {
  absolutePath: string;
  raw: string;
  hash: string;
  dataset: EvalDataset;
}

async function loadDataset(cwd: string, datasetPath: string): Promise<LoadedDataset> {
  const absolutePath = toAbsolutePath(cwd, datasetPath);
  const raw = await readFile(absolutePath, "utf8");
  return {
    absolutePath,
    raw,
    hash: hashString(raw),
    dataset: parseDataset(raw),
  };
}

async function loadTextFile(
  cwd: string,
  filePath: string,
): Promise<{ absolutePath: string; text: string }> {
  const absolutePath = toAbsolutePath(cwd, filePath);
  return {
    absolutePath,
    text: await readFile(absolutePath, "utf8"),
  };
}

function requireValue(tokens: string[], index: number, flag: string): string {
  const value = tokens[index + 1];
  if (!value || value.startsWith("--")) {
    throw new Error(`Missing value for ${flag}.`);
  }
  return value;
}

function parsePositiveInteger(raw: string, field: string): number {
  if (!/^[1-9]\d*$/.test(raw)) throw new Error(`${field} must be a positive integer.`);
  const parsed = Number(raw);
  if (!Number.isSafeInteger(parsed)) throw new Error(`${field} must be a positive integer.`);
  return parsed;
}

function parseTemperature(raw: string): number {
  if (!/^(?:\d+(?:\.\d*)?|\.\d+)$/.test(raw)) {
    throw new Error("--temperature must be a number between 0 and 2.");
  }
  const parsed = Number(raw);
  if (!Number.isFinite(parsed) || parsed < 0 || parsed > 2) {
    throw new Error("--temperature must be a number between 0 and 2.");
  }
  return parsed;
}

function parseRunCommand(tokens: string[]): RunCommandConfig {
  if (tokens.length < 2) {
    throw new Error(`Usage: /${COMMAND_NAME} run <dataset.json> [options]`);
  }

  const config: RunCommandConfig = {
    datasetPath: tokens[1],
    variantName: "candidate",
  };

  for (let i = 2; i < tokens.length; i++) {
    const token = tokens[i];
    switch (token) {
      case "--system-file": {
        config.systemFilePath = requireValue(tokens, i, token);
        i += 1;
        break;
      }
      case "--system-text": {
        config.systemText = requireValue(tokens, i, token);
        i += 1;
        break;
      }
      case "--variant": {
        config.variantName = requireValue(tokens, i, token);
        i += 1;
        break;
      }
      case "--out": {
        config.outPath = requireValue(tokens, i, token);
        i += 1;
        break;
      }
      case "--max-cases": {
        config.maxCases = parsePositiveInteger(requireValue(tokens, i, token), token);
        i += 1;
        break;
      }
      case "--temperature": {
        config.temperature = parseTemperature(requireValue(tokens, i, token));
        i += 1;
        break;
      }
      default:
        throw new Error(`Unknown option for run: ${token}`);
    }
  }

  if (config.systemFilePath && config.systemText) {
    throw new Error("Use either --system-file or --system-text, not both.");
  }

  return config;
}

function parseCompareCommand(tokens: string[]): CompareCommandConfig {
  if (tokens.length < 4) {
    throw new Error(
      `Usage: /${COMMAND_NAME} compare <dataset.json> <baseline-system.txt> <candidate-system.txt> [options]`,
    );
  }

  const config: CompareCommandConfig = {
    datasetPath: tokens[1],
    baselineSystemPath: tokens[2],
    candidateSystemPath: tokens[3],
    baselineName: "baseline",
    candidateName: "candidate",
  };

  for (let i = 4; i < tokens.length; i++) {
    const token = tokens[i];
    switch (token) {
      case "--baseline-name": {
        config.baselineName = requireValue(tokens, i, token);
        i += 1;
        break;
      }
      case "--candidate-name": {
        config.candidateName = requireValue(tokens, i, token);
        i += 1;
        break;
      }
      case "--out": {
        config.outPath = requireValue(tokens, i, token);
        i += 1;
        break;
      }
      case "--max-cases": {
        config.maxCases = parsePositiveInteger(requireValue(tokens, i, token), token);
        i += 1;
        break;
      }
      case "--temperature": {
        config.temperature = parseTemperature(requireValue(tokens, i, token));
        i += 1;
        break;
      }
      default:
        throw new Error(`Unknown option for compare: ${token}`);
    }
  }

  return config;
}

function extractAssistantText(message: AssistantMessage): string {
  return message.content
    .filter(
      (block): block is Extract<AssistantMessage["content"][number], { type: "text" }> =>
        block.type === "text",
    )
    .map((block) => block.text)
    .join("\n")
    .trim();
}

function clip(text: string, maxChars = 280): string {
  if (text.length <= maxChars) {
    return text;
  }
  return `${text.slice(0, maxChars)}...`;
}

function createEmptyUsage(): Usage {
  return {
    input: 0,
    output: 0,
    cacheRead: 0,
    cacheWrite: 0,
    totalTokens: 0,
    cost: {
      input: 0,
      output: 0,
      cacheRead: 0,
      cacheWrite: 0,
      total: 0,
    },
  };
}

function evaluateCase(
  expected: EvalCaseDefinition,
  output: string,
): {
  scored: boolean;
  pass: boolean;
  checks: CaseCheckResult[];
} {
  const checks: CaseCheckResult[] = [];
  const outputLower = output.toLowerCase();

  for (const term of expected.expectContains ?? []) {
    const pass = outputLower.includes(term.toLowerCase());
    checks.push({
      check: "expectContains",
      pass,
      details: `contains ${JSON.stringify(term)}`,
    });
  }

  for (const term of expected.expectNotContains ?? []) {
    const pass = !outputLower.includes(term.toLowerCase());
    checks.push({
      check: "expectNotContains",
      pass,
      details: `does not contain ${JSON.stringify(term)}`,
    });
  }

  if (expected.expectRegex) {
    try {
      const regex = new RegExp(expected.expectRegex, "m");
      const pass = regex.test(output);
      checks.push({
        check: "expectRegex",
        pass,
        details: `matches /${expected.expectRegex}/m`,
      });
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      checks.push({
        check: "expectRegex",
        pass: false,
        details: `invalid regex ${JSON.stringify(expected.expectRegex)}: ${message}`,
      });
    }
  }

  const scored = checks.length > 0;
  const pass = scored ? checks.every((check) => check.pass) : true;

  return { scored, pass, checks };
}

function mergeSystemPrompt(base: string | undefined, variant: string | undefined): string {
  const parts = [base?.trim(), variant?.trim()].filter((part): part is string =>
    Boolean(part && part.length > 0),
  );
  return parts.join("\n\n");
}

function formatPercent(value: number | null): string {
  return value === null ? "n/a" : `${(value * 100).toFixed(1)}%`;
}

function formatCurrency(value: number): string {
  return `$${value.toFixed(4)}`;
}

function summarizeRun(report: EvalRunReport, reportPath: string): string {
  const failed = report.cases
    .filter((entry) => entry.scored && !entry.pass)
    .map((entry) => entry.id);

  const lines = [
    "evalset run completed",
    "",
    `dataset: ${report.dataset.name}`,
    `dataset path: ${report.dataset.path}`,
    `model: ${report.model.provider}/${report.model.id}`,
    `variant: ${report.variant.name}`,
    `run: ${report.run.runId} (dataset ${shortHash(report.run.datasetHash)}, variant ${shortHash(report.run.variantHash)})`,
    `cases: ${report.totals.cases} total, ${report.totals.scoredCases} scored`,
    `pass: ${report.totals.passedCases}/${report.totals.scoredCases} (${formatPercent(report.totals.passRate)})`,
    `latency: ${report.totals.avgLatencyMs.toFixed(0)}ms avg, ${(report.totals.totalLatencyMs / 1000).toFixed(2)}s total`,
    `tokens: in=${report.totals.usage.input}, out=${report.totals.usage.output}, total=${report.totals.usage.totalTokens}`,
    `cost: ${formatCurrency(report.totals.usage.cost.total)}`,
    `report: ${reportPath}`,
  ];

  if (failed.length > 0) {
    lines.push(`failed cases: ${failed.join(", ")}`);
  }

  return lines.join("\n");
}

function summarizeCompare(report: EvalCompareReport, reportPath: string): string {
  return [
    "evalset compare completed",
    "",
    `dataset: ${report.dataset.name}`,
    `model: ${report.model.provider}/${report.model.id}`,
    `run: ${report.run.runId} (dataset ${shortHash(report.run.datasetHash)})`,
    `baseline: ${report.baseline.variant.name} -> ${formatPercent(report.baseline.totals.passRate)} (run ${report.run.baselineRunId})`,
    `candidate: ${report.candidate.variant.name} -> ${formatPercent(report.candidate.totals.passRate)} (run ${report.run.candidateRunId})`,
    `delta pass rate: ${formatPercent(report.delta.passRate)}`,
    `delta avg latency: ${report.delta.avgLatencyMs.toFixed(0)}ms`,
    `delta total cost: ${formatCurrency(report.delta.totalCost)}`,
    `report: ${reportPath}`,
  ].join("\n");
}

function sanitizeSlug(value: string): string {
  const slug = value
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
  return slug.length > 0 ? slug : "evalset";
}

function timestampSlug(): string {
  const now = new Date();
  const pad = (v: number): string => v.toString().padStart(2, "0");
  return `${now.getFullYear()}${pad(now.getMonth() + 1)}${pad(now.getDate())}T${pad(now.getHours())}${pad(now.getMinutes())}${pad(now.getSeconds())}`;
}

function defaultRunReportPath(cwd: string, datasetName: string, variantName: string): string {
  return resolve(
    cwd,
    ".evalset",
    "reports",
    `run-${sanitizeSlug(datasetName)}-${sanitizeSlug(variantName)}-${timestampSlug()}-${randomUUID().slice(0, 8)}.json`,
  );
}

function defaultCompareReportPath(cwd: string, datasetName: string): string {
  return resolve(
    cwd,
    ".evalset",
    "reports",
    `compare-${sanitizeSlug(datasetName)}-${timestampSlug()}-${randomUUID().slice(0, 8)}.json`,
  );
}

async function writeReportFile(path: string, data: unknown): Promise<string> {
  await mkdir(dirname(path), { recursive: true });
  const tempPath = `${path}.tmp-${process.pid}-${randomUUID()}`;
  try {
    await writeFile(tempPath, `${JSON.stringify(data, null, 2)}\n`, {
      encoding: "utf8",
      flag: "wx",
    });
    await link(tempPath, path);
  } finally {
    await rm(tempPath, { force: true }).catch(() => undefined);
  }
  return path;
}

async function evaluateVariant(args: {
  ctx: ExtensionCommandContext;
  model: Model<Api>;
  datasetPath: string;
  datasetName: string;
  datasetHash: string;
  casesHash: string;
  cases: EvalCaseDefinition[];
  variant: VariantDefinition;
  apiKey?: string;
  headers?: Record<string, string>;
  temperature?: number;
}): Promise<EvalRunReport> {
  const {
    ctx,
    model,
    datasetPath,
    datasetName,
    datasetHash,
    casesHash,
    cases,
    variant,
    apiKey,
    headers,
    temperature,
  } = args;
  const runId = randomUUID();
  const startedAt = new Date().toISOString();
  const variantHash = hashObject(variant);
  const modelKey = `${model.provider}/${model.id}`;
  const results: EvalCaseResult[] = [];

  try {
    for (let index = 0; index < cases.length; index += 1) {
      const entry = cases[index];
      const id = entry.id?.trim() || `case-${index + 1}`;

      if (ctx.hasUI) {
        ctx.ui.setStatus(
          COMMAND_NAME,
          `${COMMAND_NAME}: ${variant.name} ${index + 1}/${cases.length}`,
        );
      }

      const context: Context = {
        systemPrompt: variant.systemPrompt,
        messages: [
          {
            role: "user",
            content: entry.input,
            timestamp: Date.now(),
          },
        ],
      };

      const startedAt = Date.now();
      try {
        const response = await complete(model, context, {
          apiKey,
          headers,
          temperature,
        });

        const outputText = extractAssistantText(response);
        const evaluation = evaluateCase(entry, outputText);

        results.push({
          id,
          input: entry.input,
          scored: evaluation.scored,
          pass: evaluation.pass,
          checks: evaluation.checks,
          failedChecks: evaluation.checks
            .filter((check) => !check.pass)
            .map((check) => check.details),
          output: outputText,
          outputPreview: clip(outputText),
          latencyMs: Date.now() - startedAt,
          stopReason: response.stopReason,
          usage: response.usage,
        });
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        results.push({
          id,
          input: entry.input,
          scored: true,
          pass: false,
          checks: [
            {
              check: "request",
              pass: false,
              details: message,
            },
          ],
          failedChecks: [message],
          output: "",
          outputPreview: "",
          latencyMs: Date.now() - startedAt,
          stopReason: "error",
          usage: createEmptyUsage(),
          error: message,
        });
      }
    }
  } finally {
    if (ctx.hasUI) {
      ctx.ui.setStatus(COMMAND_NAME, undefined);
    }
  }

  const scoredCases = results.filter((result) => result.scored);
  const passedCases = scoredCases.filter((result) => result.pass);

  const totalLatencyMs = results.reduce((sum, result) => sum + result.latencyMs, 0);
  const usage = results.reduce<Usage>((sum, result) => {
    sum.input += result.usage.input;
    sum.output += result.usage.output;
    sum.cacheRead += result.usage.cacheRead;
    sum.cacheWrite += result.usage.cacheWrite;
    sum.totalTokens += result.usage.totalTokens;
    sum.cost.input += result.usage.cost.input;
    sum.cost.output += result.usage.cost.output;
    sum.cost.cacheRead += result.usage.cost.cacheRead;
    sum.cost.cacheWrite += result.usage.cost.cacheWrite;
    sum.cost.total += result.usage.cost.total;
    return sum;
  }, createEmptyUsage());

  const passRate = scoredCases.length > 0 ? passedCases.length / scoredCases.length : null;

  const finishedAt = new Date().toISOString();

  return {
    kind: "evalset-run",
    createdAt: finishedAt,
    run: {
      runId,
      startedAt,
      finishedAt,
      modelKey,
      temperature: temperature ?? null,
      datasetHash,
      casesHash,
      variantHash,
    },
    dataset: {
      name: datasetName,
      path: datasetPath,
    },
    model: {
      provider: model.provider,
      id: model.id,
      api: model.api,
    },
    variant,
    totals: {
      cases: results.length,
      scoredCases: scoredCases.length,
      passedCases: passedCases.length,
      failedCases: scoredCases.length - passedCases.length,
      passRate,
      totalLatencyMs,
      avgLatencyMs: results.length > 0 ? totalLatencyMs / results.length : 0,
      usage,
    },
    cases: results,
  };
}

function postMessage(pi: ExtensionAPI, message: string, details?: unknown): void {
  pi.sendMessage({
    customType: CUSTOM_MESSAGE_TYPE,
    content: message,
    display: true,
    details,
  });
}

function ensureActiveModel(ctx: ExtensionCommandContext): Model<Api> {
  if (!ctx.model) {
    throw new Error("No active model. Select one first via /model.");
  }
  return ctx.model;
}

async function resolveRequestAuth(
  ctx: ExtensionCommandContext,
  model: Model<Api>,
): Promise<{ apiKey?: string; headers?: Record<string, string> }> {
  const auth = await ctx.modelRegistry.getApiKeyAndHeaders(model);
  if (!auth.ok) throw new Error(auth.error);
  return { apiKey: auth.apiKey, headers: auth.headers };
}

async function handleInit(
  pi: ExtensionAPI,
  ctx: ExtensionCommandContext,
  tokens: string[],
): Promise<void> {
  let targetPath = "examples/fixed-task-set.json";
  let force = false;

  for (let i = 1; i < tokens.length; i += 1) {
    const token = tokens[i];
    if (token === "--force") {
      force = true;
      continue;
    }

    if (token.startsWith("--")) {
      throw new Error(`Unknown option for init: ${token}`);
    }

    if (targetPath !== "examples/fixed-task-set.json") {
      throw new Error("init accepts at most one dataset path argument.");
    }

    targetPath = token;
  }

  const absolutePath = toAbsolutePath(ctx.cwd, targetPath);
  const sample = {
    name: "maintainer-clarity-smoke",
    systemPrompt: "Answer concisely and explicitly.",
    cases: [
      {
        id: "fixed-task-set-definition",
        input: "In one sentence: what does fixed task set mean for evals?",
        expectContains: ["same tasks"],
      },
      {
        id: "extension-gaps",
        input: "List two things an extension may still need for reproducible eval workflows.",
        expectContains: ["trace", "reproducibility"],
      },
    ],
  };

  await mkdir(dirname(absolutePath), { recursive: true });
  await writeFile(absolutePath, `${JSON.stringify(sample, null, 2)}\n`, {
    encoding: "utf8",
    flag: force ? "w" : "wx",
  });

  const message = `Created evalset dataset template: ${absolutePath}`;
  if (ctx.hasUI) {
    ctx.ui.notify(message, "info");
  }
  postMessage(pi, message, { path: absolutePath });
}

async function handleRun(
  pi: ExtensionAPI,
  ctx: ExtensionCommandContext,
  tokens: string[],
): Promise<void> {
  const config = parseRunCommand(tokens);
  const model = ensureActiveModel(ctx);
  const requestAuth = await resolveRequestAuth(ctx, model);

  const loaded = await loadDataset(ctx.cwd, config.datasetPath);
  const datasetName = loaded.dataset.name?.trim() || sanitizeSlug(config.datasetPath);

  const datasetCases =
    config.maxCases && config.maxCases < loaded.dataset.cases.length
      ? loaded.dataset.cases.slice(0, config.maxCases)
      : loaded.dataset.cases;
  const casesHash = hashObject(datasetCases);

  let variantPrompt = loaded.dataset.systemPrompt;
  let variantSource = "dataset.systemPrompt";

  if (config.systemFilePath) {
    const system = await loadTextFile(ctx.cwd, config.systemFilePath);
    variantPrompt = mergeSystemPrompt(loaded.dataset.systemPrompt, system.text);
    variantSource = `dataset.systemPrompt + file:${system.absolutePath}`;
  } else if (config.systemText) {
    variantPrompt = mergeSystemPrompt(loaded.dataset.systemPrompt, config.systemText);
    variantSource = "dataset.systemPrompt + --system-text";
  }

  const variant: VariantDefinition = {
    name: config.variantName,
    systemPrompt: variantPrompt ?? "",
    source: variantSource,
  };

  const runReport = await evaluateVariant({
    ctx,
    model,
    datasetPath: loaded.absolutePath,
    datasetName,
    datasetHash: loaded.hash,
    casesHash,
    cases: datasetCases,
    variant,
    ...requestAuth,
    temperature: config.temperature,
  });

  const outputPath = config.outPath
    ? toAbsolutePath(ctx.cwd, config.outPath)
    : defaultRunReportPath(ctx.cwd, datasetName, config.variantName);
  const reportPath = await writeReportFile(outputPath, runReport);

  const summary = summarizeRun(runReport, reportPath);
  if (ctx.hasUI) {
    ctx.ui.notify(`evalset run finished: ${formatPercent(runReport.totals.passRate)}`, "info");
  }
  postMessage(pi, summary, {
    reportPath,
    run: {
      runId: runReport.run.runId,
      datasetHash: runReport.run.datasetHash,
      casesHash: runReport.run.casesHash,
      variantHash: runReport.run.variantHash,
      modelKey: runReport.run.modelKey,
    },
    totals: {
      passRate: runReport.totals.passRate,
      avgLatencyMs: runReport.totals.avgLatencyMs,
      totalCost: runReport.totals.usage.cost.total,
      scoredCases: runReport.totals.scoredCases,
      passedCases: runReport.totals.passedCases,
    },
  });
}

async function handleCompare(
  pi: ExtensionAPI,
  ctx: ExtensionCommandContext,
  tokens: string[],
): Promise<void> {
  const config = parseCompareCommand(tokens);
  const model = ensureActiveModel(ctx);
  const requestAuth = await resolveRequestAuth(ctx, model);

  const loaded = await loadDataset(ctx.cwd, config.datasetPath);
  const datasetName = loaded.dataset.name?.trim() || sanitizeSlug(config.datasetPath);

  const datasetCases =
    config.maxCases && config.maxCases < loaded.dataset.cases.length
      ? loaded.dataset.cases.slice(0, config.maxCases)
      : loaded.dataset.cases;
  const casesHash = hashObject(datasetCases);

  const baselineSystem = await loadTextFile(ctx.cwd, config.baselineSystemPath);
  const candidateSystem = await loadTextFile(ctx.cwd, config.candidateSystemPath);

  const baselineVariant: VariantDefinition = {
    name: config.baselineName,
    systemPrompt: mergeSystemPrompt(loaded.dataset.systemPrompt, baselineSystem.text),
    source: `dataset.systemPrompt + file:${baselineSystem.absolutePath}`,
  };

  const candidateVariant: VariantDefinition = {
    name: config.candidateName,
    systemPrompt: mergeSystemPrompt(loaded.dataset.systemPrompt, candidateSystem.text),
    source: `dataset.systemPrompt + file:${candidateSystem.absolutePath}`,
  };

  const compareRunId = randomUUID();
  const compareStartedAt = new Date().toISOString();

  const baseline = await evaluateVariant({
    ctx,
    model,
    datasetPath: loaded.absolutePath,
    datasetName,
    datasetHash: loaded.hash,
    casesHash,
    cases: datasetCases,
    variant: baselineVariant,
    ...requestAuth,
    temperature: config.temperature,
  });

  const candidate = await evaluateVariant({
    ctx,
    model,
    datasetPath: loaded.absolutePath,
    datasetName,
    datasetHash: loaded.hash,
    casesHash,
    cases: datasetCases,
    variant: candidateVariant,
    ...requestAuth,
    temperature: config.temperature,
  });

  const deltaPassRate =
    baseline.totals.passRate !== null && candidate.totals.passRate !== null
      ? candidate.totals.passRate - baseline.totals.passRate
      : null;

  const compareFinishedAt = new Date().toISOString();

  const compareReport: EvalCompareReport = {
    kind: "evalset-compare",
    createdAt: compareFinishedAt,
    run: {
      runId: compareRunId,
      startedAt: compareStartedAt,
      finishedAt: compareFinishedAt,
      modelKey: `${model.provider}/${model.id}`,
      temperature: config.temperature ?? null,
      datasetHash: loaded.hash,
      casesHash,
      baselineRunId: baseline.run.runId,
      candidateRunId: candidate.run.runId,
      baselineVariantHash: baseline.run.variantHash,
      candidateVariantHash: candidate.run.variantHash,
    },
    dataset: {
      name: datasetName,
      path: loaded.absolutePath,
    },
    model: {
      provider: model.provider,
      id: model.id,
      api: model.api,
    },
    baseline,
    candidate,
    delta: {
      passRate: deltaPassRate,
      avgLatencyMs: candidate.totals.avgLatencyMs - baseline.totals.avgLatencyMs,
      totalCost: candidate.totals.usage.cost.total - baseline.totals.usage.cost.total,
    },
  };

  const outputPath = config.outPath
    ? toAbsolutePath(ctx.cwd, config.outPath)
    : defaultCompareReportPath(ctx.cwd, datasetName);
  const reportPath = await writeReportFile(outputPath, compareReport);

  const summary = summarizeCompare(compareReport, reportPath);
  if (ctx.hasUI) {
    ctx.ui.notify("evalset compare finished", "info");
  }
  postMessage(pi, summary, {
    reportPath,
    run: {
      runId: compareReport.run.runId,
      datasetHash: compareReport.run.datasetHash,
      casesHash: compareReport.run.casesHash,
      baselineRunId: compareReport.run.baselineRunId,
      candidateRunId: compareReport.run.candidateRunId,
    },
    delta: compareReport.delta,
    baseline: {
      passRate: compareReport.baseline.totals.passRate,
      totalCost: compareReport.baseline.totals.usage.cost.total,
    },
    candidate: {
      passRate: compareReport.candidate.totals.passRate,
      totalCost: compareReport.candidate.totals.usage.cost.total,
    },
  });
}

function formatError(error: unknown): string {
  if (error instanceof Error) {
    return error.message;
  }
  return String(error);
}

export const _test = {
  parseDataset,
  parsePositiveInteger,
  parseTemperature,
  parseRunCommand,
  writeReportFile,
};

export default function (pi: ExtensionAPI): void {
  pi.registerCommand(COMMAND_NAME, {
    description: "Run fixed-task-set evals and compare prompt/system variants",
    handler: async (args, ctx) => {
      const tokens = parseArgs(args);
      const subcommand = tokens[0] ?? "help";

      try {
        if (subcommand === "help" || subcommand === "--help" || subcommand === "-h") {
          postMessage(pi, HELP_TEXT);
          return;
        }

        if (subcommand === "init") {
          await handleInit(pi, ctx, [subcommand, ...tokens.slice(1)]);
          return;
        }

        if (subcommand === "run") {
          await handleRun(pi, ctx, [subcommand, ...tokens.slice(1)]);
          return;
        }

        if (subcommand === "compare") {
          await handleCompare(pi, ctx, [subcommand, ...tokens.slice(1)]);
          return;
        }

        throw new Error(`Unknown subcommand: ${subcommand}`);
      } catch (error) {
        const message = `${COMMAND_NAME} error: ${formatError(error)}`;
        if (ctx.hasUI) {
          ctx.ui.notify(message, "error");
        }
        postMessage(pi, `${message}\n\n${HELP_TEXT}`);
      }
    },
  });
}

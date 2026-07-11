#!/usr/bin/env node
import { randomInt } from "node:crypto";
import { mkdir, writeFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { aggregateResults, runPi, scorePiOutput } from "./model-screen-core.mjs";
import { buildScreenPrompt, PROTOCOLS, WORKLOADS } from "./model-screen-fixtures.mjs";

export const ALLOWED_MODELS = Object.freeze(["zai/glm-5.2", "openai-codex/gpt-5.6-sol"]);
const packageRoot = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const outputPath = resolve(packageRoot, ".autoresearch/model-screen-aggregate.json");

export function parseArgs(argv) {
  const options = { models: [], execute: false, maxCalls: 30, timeoutSeconds: 180 };
  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];
    if (arg === "--execute") options.execute = true;
    else if (arg === "--model") {
      const value = argv[++index];
      if (!value || value.startsWith("--")) throw new Error("--model requires provider/model");
      options.models.push(value);
    } else if (arg === "--max-calls") {
      const value = Number(argv[++index]);
      if (!Number.isSafeInteger(value) || value < 1)
        throw new Error("--max-calls requires an integer");
      options.maxCalls = value;
    } else if (arg === "--timeout-seconds") {
      const value = Number(argv[++index]);
      if (!Number.isSafeInteger(value) || value < 1 || value > 3600)
        throw new Error("--timeout-seconds requires an integer from 1 to 3600");
      options.timeoutSeconds = value;
    } else throw new Error(`unknown argument: ${arg}`);
  }
  if (options.models.length !== 2 || new Set(options.models).size !== 2)
    throw new Error("exactly two distinct repeated --model values are required");
  if (
    options.models.some((model) => !ALLOWED_MODELS.includes(model)) ||
    ALLOWED_MODELS.some((model) => !options.models.includes(model))
  )
    throw new Error(`models must be exactly: ${ALLOWED_MODELS.join(", ")}`);
  if (options.maxCalls !== 30) throw new Error("this bounded screen requires --max-calls 30");
  return options;
}

export function buildPlan(models) {
  return models.flatMap((model) =>
    PROTOCOLS.flatMap((protocol) => WORKLOADS.map((workload) => ({ model, protocol, workload }))),
  );
}

function shuffled(values) {
  const copy = [...values];
  for (let index = copy.length - 1; index > 0; index -= 1) {
    const swap = randomInt(index + 1);
    [copy[index], copy[swap]] = [copy[swap], copy[index]];
  }
  return copy;
}

export async function executePlan(plan, executor = runPi, { timeoutMs = 180_000 } = {}) {
  const results = [];
  for (const cell of shuffled(plan)) {
    try {
      const raw = await executor({
        model: cell.model,
        prompt: buildScreenPrompt(cell.protocol, cell.workload),
        cwd: packageRoot,
        timeoutMs,
      });
      results.push({ ...cell, ...scorePiOutput({ raw, selectedModel: cell.model, ...cell }) });
    } catch (error) {
      results.push({
        ...cell,
        validJson: false,
        correct: false,
        error: error.category ?? "process_error",
      });
    }
  }
  return results;
}

async function main() {
  const options = parseArgs(process.argv.slice(2));
  const plan = buildPlan(options.models);
  if (plan.length !== options.maxCalls) throw new Error("planned call count does not match cap");
  if (!options.execute) {
    process.stdout.write(
      `${JSON.stringify({ mode: "plan", externalCalls: 0, callCount: plan.length, cells: plan }, null, 2)}\n`,
    );
    return;
  }
  const results = await executePlan(plan, runPi, { timeoutMs: options.timeoutSeconds * 1_000 });
  const aggregate = aggregateResults(results);
  await mkdir(dirname(outputPath), { recursive: true });
  await writeFile(outputPath, `${JSON.stringify(aggregate, null, 2)}\n`, { mode: 0o600 });
  const failedClosed = results.some(
    (result) =>
      !result.usage || ["parse_ambiguity", "usage_error", "simulator_error"].includes(result.error),
  );
  process.stdout.write(
    `${JSON.stringify({ mode: "execute", calls: results.length, aggregate: ".autoresearch/model-screen-aggregate.json", failedClosed })}\n`,
  );
  if (failedClosed) process.exitCode = 1;
}

const isMain = process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url);
if (isMain)
  main().catch((error) => {
    process.stderr.write(`model screen error: ${error.message}\n`);
    process.exitCode = 1;
  });

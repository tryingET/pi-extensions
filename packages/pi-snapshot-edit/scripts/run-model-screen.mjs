#!/usr/bin/env node
// ---
// summary: "plans and executes claimed blinded model-screen suites with atomic results"
// read_when:
//   - "operating screening or crossover model evaluations"
// ---
import { randomInt, randomUUID } from "node:crypto";
import { chmod, link, lstat, mkdir, open, rename, rm } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { aggregateResults, runPi, scorePiOutput } from "./model-screen-core.mjs";
import {
  buildScreenPrompt,
  CROSSOVER_PROTOCOLS,
  CROSSOVER_SIZES,
  crossoverWorkload,
  PROTOCOLS,
  WORKLOADS,
} from "./model-screen-fixtures.mjs";

export const ALLOWED_MODELS = Object.freeze(["zai/glm-5.2", "openai-codex/gpt-5.6-sol"]);
export const SUITES = Object.freeze(["screening", "crossover"]);
const packageRoot = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const outputPaths = {
  screening: resolve(packageRoot, ".autoresearch/model-screen-aggregate.json"),
  crossover: resolve(packageRoot, ".autoresearch/model-screen-crossover-aggregate.json"),
};
const claimPaths = {
  screening: resolve(packageRoot, ".autoresearch/model-screen-claim.json"),
  crossover: resolve(packageRoot, ".autoresearch/model-screen-crossover-claim.json"),
};

function cellKey(cell) {
  return JSON.stringify([cell.model, cell.protocol, cell.workload]);
}

async function assertAbsent(path, label) {
  try {
    await lstat(path);
  } catch (error) {
    if (error?.code === "ENOENT") return;
    throw error;
  }
  throw new Error(`${label} already exists; refusing execution`);
}

async function createClaim(path, claim) {
  await mkdir(dirname(path), { recursive: true });
  let handle;
  try {
    handle = await open(path, "wx", 0o600);
    await handle.writeFile(`${JSON.stringify(claim, null, 2)}\n`);
    await handle.sync();
  } catch (error) {
    if (error?.code === "EEXIST") throw new Error("suite claim already exists; refusing execution");
    throw error;
  } finally {
    await handle?.close();
  }
  await chmod(path, 0o600);
}

export async function writeAtomicJson(path, value, { replace = false, linker = link } = {}) {
  await mkdir(dirname(path), { recursive: true });
  const temporary = resolve(dirname(path), `model-screen-temp-${randomUUID()}`);
  let handle;
  try {
    handle = await open(temporary, "wx", 0o600);
    await handle.writeFile(`${JSON.stringify(value, null, 2)}\n`);
    await handle.sync();
    await handle.close();
    handle = undefined;
    await chmod(temporary, 0o600);
    if (replace) await rename(temporary, path);
    else await linker(temporary, path);
  } catch (error) {
    if (!replace && error?.code === "EEXIST")
      throw new Error("destination already exists; refusing publication", { cause: error });
    throw error;
  } finally {
    await handle?.close();
    await rm(temporary, { force: true });
  }
}

export async function runClaimedSuite({
  suite,
  models,
  plan,
  executor = runPi,
  execute = executePlan,
  atomicWriter = writeAtomicJson,
  timeoutMs = 180_000,
  outputPath = outputPaths[suite],
  claimPath = claimPaths[suite],
}) {
  await assertAbsent(outputPath, "suite output aggregate");
  const claim = {
    suite,
    models,
    expectedCellKeys: plan.map(cellKey),
    expectedCellCount: plan.length,
    state: "running",
  };
  await createClaim(claimPath, claim);
  // The claim serializes lawful runners; this second check closes the pre-claim race.
  await assertAbsent(outputPath, "suite output aggregate");
  const results = await execute(plan, executor, { timeoutMs });
  const aggregate = aggregateResults(results, plan);
  await assertAbsent(outputPath, "suite output aggregate");
  await atomicWriter(outputPath, aggregate);
  await atomicWriter(claimPath, { ...claim, state: "completed" }, { replace: true });
  return { aggregate, results };
}

export function parseArgs(argv) {
  const options = {
    models: [],
    execute: false,
    suite: "screening",
    maxCalls: undefined,
    timeoutSeconds: 180,
  };
  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];
    if (arg === "--execute") options.execute = true;
    else if (arg === "--suite") {
      const value = argv[++index];
      if (!SUITES.includes(value)) throw new Error(`--suite must be one of: ${SUITES.join(", ")}`);
      options.suite = value;
    } else if (arg === "--model") {
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
  const requiredCalls = options.suite === "crossover" ? 12 : 30;
  if (options.maxCalls === undefined) options.maxCalls = requiredCalls;
  if (options.maxCalls !== requiredCalls)
    throw new Error(`the ${options.suite} suite requires --max-calls ${requiredCalls}`);
  return options;
}

export function buildPlan(models, suite = "screening") {
  if (suite === "crossover")
    return models.flatMap((model) =>
      CROSSOVER_PROTOCOLS.flatMap((protocol) =>
        CROSSOVER_SIZES.map((size) => ({ model, protocol, workload: crossoverWorkload(size) })),
      ),
    );
  if (suite !== "screening") throw new Error(`unknown suite: ${suite}`);
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
  const plan = buildPlan(options.models, options.suite);
  if (plan.length !== options.maxCalls) throw new Error("planned call count does not match cap");
  if (!options.execute) {
    process.stdout.write(
      `${JSON.stringify({ mode: "plan", suite: options.suite, externalCalls: 0, callCount: plan.length, cells: plan }, null, 2)}\n`,
    );
    return;
  }
  const { aggregate, results } = await runClaimedSuite({
    suite: options.suite,
    models: options.models,
    plan,
    timeoutMs: options.timeoutSeconds * 1_000,
  });
  const aggregateName =
    options.suite === "crossover"
      ? ".autoresearch/model-screen-crossover-aggregate.json"
      : ".autoresearch/model-screen-aggregate.json";
  process.stdout.write(
    `${JSON.stringify({ mode: "execute", suite: options.suite, calls: results.length, aggregate: aggregateName, failedClosed: aggregate.failedClosed })}\n`,
  );
  if (aggregate.failedClosed) process.exitCode = 1;
}

const isMain = process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url);
if (isMain)
  main().catch((error) => {
    process.stderr.write(`model screen error: ${error.message}\n`);
    process.exitCode = 1;
  });

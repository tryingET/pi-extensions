#!/usr/bin/env node

import { existsSync, readdirSync, readFileSync, statSync, writeFileSync } from "node:fs";
import { dirname, relative, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const scriptDir = dirname(fileURLToPath(import.meta.url));
const repoRoot = resolve(scriptDir, "../..");

function usage() {
  console.log(`Usage: node scripts/startup-latency/summarize-timings.mjs [options] <run-dir|timings-file>...

Options:
  --output PATH   write the JSON summary to PATH
  --owned-only    print only repo-owned extension entrypoints
  -h, --help      show this help

Run directories are scanned for trial-*.timings.txt. The summary combines each
entrypoint's module-import and factory timings per trial before reporting the
median, mean, minimum, and maximum. Repo checkouts, Pi live worktrees, and
installed @tryinget packages are classified as owned; the shutdown probe is
classified as harness overhead.`);
}

let outputPath = null;
let ownedOnly = false;
const inputs = [];
const args = process.argv.slice(2);
for (let index = 0; index < args.length; index += 1) {
  const arg = args[index];
  if (arg === "-h" || arg === "--help") {
    usage();
    process.exit(0);
  }
  if (arg === "--output") {
    outputPath = args[++index] ?? "";
    if (!outputPath) throw new Error("--output requires a path");
    continue;
  }
  if (arg === "--owned-only") {
    ownedOnly = true;
    continue;
  }
  if (arg.startsWith("-")) throw new Error(`Unknown option: ${arg}`);
  inputs.push(arg);
}
if (inputs.length === 0) {
  usage();
  process.exitCode = 2;
} else {
  main();
}

function collectFiles(input) {
  const absolute = resolve(input);
  if (!existsSync(absolute)) throw new Error(`Input does not exist: ${input}`);
  if (!statSync(absolute).isDirectory()) return [absolute];
  return readdirSync(absolute)
    .filter((name) => /^trial-\d+\.timings\.txt$/u.test(name))
    .sort((left, right) => left.localeCompare(right, undefined, { numeric: true }))
    .map((name) => resolve(absolute, name));
}

function classify(rawPath) {
  const normalized = rawPath.replaceAll("\\", "/");
  if (normalized.endsWith("/scripts/startup-latency/shutdown-probe.ts")) {
    return {
      ownership: "harness",
      packageName: "startup-latency-probe",
      entrypoint: "scripts/startup-latency/shutdown-probe.ts",
    };
  }

  const packagesMarker = normalized.lastIndexOf("/packages/");
  const packageRelative = packagesMarker >= 0 ? normalized.slice(packagesMarker + 10) : null;
  const ownedCheckout = normalized.startsWith(`${repoRoot.replaceAll("\\", "/")}/packages/`);
  const ownedLiveWorktree = /\/pi-extensions(?:-[^/]+)?\/packages\//u.test(normalized);
  const installedTryinget = normalized.includes("/node_modules/@tryinget/");
  const ownership = ownedCheckout || ownedLiveWorktree || installedTryinget ? "owned" : "third_party";

  if (packageRelative) {
    const segments = packageRelative.split("/");
    return {
      ownership,
      packageName: segments[0] === "pi-interaction" ? "pi-interaction" : segments[0],
      entrypoint: `packages/${packageRelative}`,
    };
  }

  const tryingetMatch = normalized.match(/\/node_modules\/(@tryinget\/[^/]+)\/(.*)$/u);
  if (tryingetMatch) {
    return {
      ownership,
      packageName: tryingetMatch[1],
      entrypoint: `npm:${tryingetMatch[1]}/${tryingetMatch[2]}`,
    };
  }

  const nodeModulesMatch = normalized.match(/\/node_modules\/((?:@[^/]+\/)?[^/]+)\/(.*)$/u);
  if (nodeModulesMatch) {
    return {
      ownership,
      packageName: nodeModulesMatch[1],
      entrypoint: `npm:${nodeModulesMatch[1]}/${nodeModulesMatch[2]}`,
    };
  }

  return { ownership, packageName: "external", entrypoint: normalized };
}

function median(values) {
  const sorted = [...values].sort((left, right) => left - right);
  const midpoint = Math.floor(sorted.length / 2);
  return sorted.length % 2 === 1
    ? sorted[midpoint]
    : (sorted[midpoint - 1] + sorted[midpoint]) / 2;
}

function rounded(value) {
  return Math.round(value * 10) / 10;
}

function main() {
  const files = [...new Set(inputs.flatMap(collectFiles))];
  if (files.length === 0) throw new Error("No trial-*.timings.txt files found");

  const trials = files.map((file) => {
    const entries = new Map();
    for (const line of readFileSync(file, "utf8").split("\n")) {
      const match = line.match(/^\s+(.+?) (module import|factory): (\d+)ms$/u);
      if (!match) continue;
      const [, rawPath, phase, rawMs] = match;
      const identity = classify(rawPath);
      const key = `${identity.ownership}\u0000${identity.packageName}\u0000${identity.entrypoint}`;
      const entry = entries.get(key) ?? { ...identity, importMs: 0, factoryMs: 0 };
      if (phase === "module import") entry.importMs += Number(rawMs);
      else entry.factoryMs += Number(rawMs);
      entries.set(key, entry);
    }
    return { file: relative(repoRoot, file), entries };
  });

  const aggregates = new Map();
  for (const trial of trials) {
    for (const [key, entry] of trial.entries) {
      const aggregate = aggregates.get(key) ?? { ...entry, samples: [] };
      aggregate.samples.push({
        trial: trial.file,
        importMs: entry.importMs,
        factoryMs: entry.factoryMs,
        totalMs: entry.importMs + entry.factoryMs,
      });
      aggregates.set(key, aggregate);
    }
  }

  const entries = [...aggregates.values()]
    .map((entry) => {
      const totals = entry.samples.map((sample) => sample.totalMs);
      const imports = entry.samples.map((sample) => sample.importMs);
      const factories = entry.samples.map((sample) => sample.factoryMs);
      return {
        ownership: entry.ownership,
        packageName: entry.packageName,
        entrypoint: entry.entrypoint,
        sampleCount: entry.samples.length,
        medianTotalMs: median(totals),
        meanTotalMs: rounded(totals.reduce((sum, value) => sum + value, 0) / totals.length),
        minTotalMs: Math.min(...totals),
        maxTotalMs: Math.max(...totals),
        meanImportMs: rounded(imports.reduce((sum, value) => sum + value, 0) / imports.length),
        meanFactoryMs: rounded(factories.reduce((sum, value) => sum + value, 0) / factories.length),
        samples: entry.samples,
      };
    })
    .sort((left, right) => right.meanTotalMs - left.meanTotalMs);

  const summary = {
    kind: "pi.startup_timing_portfolio.v1",
    capturedAt: new Date().toISOString(),
    repoRoot,
    inputs: inputs.map((input) => relative(repoRoot, resolve(input))),
    trialFiles: files.map((file) => relative(repoRoot, file)),
    trialCount: trials.length,
    entries,
  };

  if (outputPath) {
    writeFileSync(resolve(outputPath), `${JSON.stringify(summary, null, 2)}\n`);
  }

  console.log("mean\tmedian\tmin\tmax\timport\tfactory\towner\tpackage\tentrypoint");
  for (const entry of entries) {
    if (ownedOnly && entry.ownership !== "owned") continue;
    console.log(
      [
        entry.meanTotalMs.toFixed(1),
        entry.medianTotalMs.toFixed(1),
        entry.minTotalMs,
        entry.maxTotalMs,
        entry.meanImportMs.toFixed(1),
        entry.meanFactoryMs.toFixed(1),
        entry.ownership,
        entry.packageName,
        entry.entrypoint,
      ].join("\t"),
    );
  }
  if (outputPath) console.log(`JSON ${resolve(outputPath)}`);
}

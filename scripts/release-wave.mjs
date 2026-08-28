#!/usr/bin/env node
/**
summary: "Creates and verifies one immutable, dependency-ordered portfolio release wave."
read_when:
  - "Changing combined Release Please candidates, publication dispatch, or partial-wave recovery."
*/
import crypto from "node:crypto";
import { spawnSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { buildReleasePlan } from "./release-plan.mjs";
import { loadManagedComponents } from "./release-components.mjs";

const SCRIPT_PATH = fileURLToPath(import.meta.url);
const ROOT = path.resolve(path.dirname(SCRIPT_PATH), "..");

function canonical(value) {
  if (Array.isArray(value)) return value.map(canonical);
  if (value && typeof value === "object") {
    return Object.fromEntries(Object.keys(value).sort().map((key) => [key, canonical(value[key])]));
  }
  return value;
}

function stable(value) {
  return JSON.stringify(canonical(value));
}

function digest(value) {
  return crypto.createHash("sha256").update(stable(value)).digest("hex");
}

function selectedPlanProjection(plan) {
  return {
    schema: plan.schema,
    source: plan.source,
    changedComponents: plan.changedComponents,
    propagationRequiredComponents: plan.propagationRequiredComponents,
    releaseOrder: plan.releaseOrder,
    components: plan.releaseOrder.map((id) => {
      const entry = plan.components.find((component) => component.component === id);
      return {
        component: entry.component,
        packageName: entry.packageName,
        packagePath: entry.packagePath,
        intendedVersion: entry.intendedVersion,
        currentVersion: entry.currentVersion,
        selection: entry.selection,
        dependencies: entry.dependencies,
      };
    }),
  };
}

function buildReleaseWave(plan, releasedPaths) {
  if (plan.status !== "ready") throw new Error("Release plan is not ready");
  if (!plan.source.baseCommit) throw new Error("Release wave requires an immutable base commit");
  if (plan.source.dirtyPaths.length > 0) throw new Error("Release wave source tree is dirty");
  if (plan.releaseOrder.length === 0) throw new Error("Release wave contains no components");
  const expectedPaths = plan.releaseOrder
    .map((id) => plan.components.find((entry) => entry.component === id).packagePath)
    .sort();
  const actualPaths = [...new Set(releasedPaths)].sort();
  if (stable(actualPaths) !== stable(expectedPaths)) {
    throw new Error(`Incomplete or extraneous release wave: expected ${expectedPaths.join(", ")}; received ${actualPaths.join(", ")}`);
  }
  const projection = selectedPlanProjection(plan);
  const payload = {
    schema: "pi.portfolio-release-wave.v1",
    source: { commit: plan.source.commit, baseCommit: plan.source.baseCommit },
    planDigest: digest(projection),
    changedComponents: plan.changedComponents,
    propagationRequiredComponents: plan.propagationRequiredComponents,
    releaseOrder: plan.releaseOrder,
    components: projection.components.map((entry) => ({
      component: entry.component,
      packageName: entry.packageName,
      packagePath: entry.packagePath,
      version: entry.intendedVersion,
      tag: `${entry.component}-v${entry.intendedVersion}`,
    })),
  };
  return { ...payload, waveId: digest(payload) };
}

function validateReleaseWave(wave, plan) {
  const releasedPaths = Array.isArray(wave?.components)
    ? wave.components.map((entry) => entry.packagePath)
    : [];
  const expected = buildReleaseWave(plan, releasedPaths);
  if (stable(wave) !== stable(expected)) throw new Error("Release wave is stale or has been tampered with");
  return expected;
}

function predecessorEntries(wave, tag) {
  const index = wave.components.findIndex((entry) => entry.tag === tag);
  if (index < 0) throw new Error(`Release tag is not in wave: ${tag}`);
  return wave.components.slice(0, index);
}

function predecessorSpecs(wave, tag) {
  return predecessorEntries(wave, tag).map((entry) => `${entry.packageName}@${entry.version}`);
}

function registryPrerequisiteSpecs(wave, plan, tag) {
  const target = wave.components.find((entry) => entry.tag === tag);
  if (!target) throw new Error(`Release tag is not in wave: ${tag}`);
  const byComponent = new Map(plan.components.map((entry) => [entry.component, entry]));
  const visited = new Set();
  const ordered = [];
  function visit(component) {
    for (const edge of byComponent.get(component)?.dependencies ?? []) {
      if (visited.has(edge.component)) continue;
      visit(edge.component);
      visited.add(edge.component);
      ordered.push(edge.component);
    }
  }
  visit(target.component);
  return ordered.map((component) => {
    const entry = byComponent.get(component);
    return `${entry.packageName}@${entry.intendedVersion}`;
  });
}

function git(...args) {
  const result = spawnSync("git", args, { cwd: ROOT, encoding: "utf8" });
  if (result.status !== 0) throw new Error(`git ${args.join(" ")} failed: ${result.stderr.trim()}`);
  return result.stdout.trim();
}

function parseArgs(args) {
  const options = {};
  for (let index = 1; index < args.length; index += 1) {
    const key = args[index];
    const value = args[index + 1];
    if (!["--base", "--released-paths", "--output", "--wave", "--tag"].includes(key) || !value) {
      throw new Error(`Unknown or incomplete argument: ${key}`);
    }
    options[key.slice(2)] = value;
    index += 1;
  }
  return options;
}

function advancedComponents(components, baseManifest, sourceManifest) {
  return components
    .filter((entry) => sourceManifest[entry.packagePath] !== baseManifest[entry.packagePath])
    .map((entry) => entry.component);
}

function planForCommits(base, source) {
  if (!/^[0-9a-f]{40}$/u.test(base) || !/^[0-9a-f]{40}$/u.test(source)) {
    throw new Error("Base and source must be full commit hashes");
  }
  if (git("rev-parse", "HEAD^{commit}") !== source) throw new Error("Release wave source is stale");
  const baseManifest = JSON.parse(git("show", `${base}:.release-please-manifest.json`));
  const sourceManifest = JSON.parse(fs.readFileSync(path.join(ROOT, ".release-please-manifest.json"), "utf8"));
  const components = loadManagedComponents();
  const changed = advancedComponents(components, baseManifest, sourceManifest);
  return buildReleasePlan(components, {
    base,
    changed,
    sourceCommit: source,
    dirtyPaths: [],
    paths: [],
    manifest: baseManifest,
  });
}

function main() {
  const args = process.argv.slice(2);
  const command = args[0];
  const options = parseArgs(args);
  if (command === "create") {
    const source = git("rev-parse", "HEAD^{commit}");
    const paths = JSON.parse(options["released-paths"] ?? "[]");
    const wave = buildReleaseWave(planForCommits(options.base, source), paths);
    if (!options.output) throw new Error("--output is required");
    fs.writeFileSync(options.output, `${JSON.stringify(wave, null, 2)}\n`, "utf8");
    process.stdout.write(`${JSON.stringify(wave)}\n`);
    return;
  }
  if (["verify", "tags", "predecessors", "predecessor-records", "registry-prerequisites"].includes(command)) {
    if (!options.wave) throw new Error("--wave is required");
    const wave = JSON.parse(fs.readFileSync(options.wave, "utf8"));
    const plan = planForCommits(wave.source?.baseCommit, wave.source?.commit);
    validateReleaseWave(wave, plan);
    if (command === "tags") {
      for (const component of wave.components) process.stdout.write(`${component.tag}\n`);
    } else if (command === "predecessors") {
      for (const spec of predecessorSpecs(wave, options.tag)) process.stdout.write(`${spec}\n`);
    } else if (command === "predecessor-records") {
      for (const entry of predecessorEntries(wave, options.tag)) {
        process.stdout.write(`${entry.tag}\t${entry.packageName}@${entry.version}\n`);
      }
    } else if (command === "registry-prerequisites") {
      for (const spec of registryPrerequisiteSpecs(wave, plan, options.tag)) {
        process.stdout.write(`${spec}\n`);
      }
    } else process.stdout.write(`${wave.waveId}\n`);
    return;
  }
  throw new Error("Usage: release-wave.mjs create --base <commit> --released-paths <json> --output <file> | verify|tags --wave <file> | predecessors|predecessor-records|registry-prerequisites --wave <file> --tag <tag>");
}

if (process.argv[1] && path.resolve(process.argv[1]) === SCRIPT_PATH) {
  try { main(); } catch (error) {
    console.error(error instanceof Error ? error.message : String(error));
    process.exitCode = 1;
  }
}

export { advancedComponents, buildReleaseWave, predecessorEntries, predecessorSpecs, registryPrerequisiteSpecs, validateReleaseWave };

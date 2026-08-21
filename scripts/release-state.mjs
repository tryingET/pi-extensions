#!/usr/bin/env node
/**
summary: "Classifies npm/GitHub release observations into deterministic recovery states without mutating release surfaces."
read_when:
  - "Diagnosing a partial release, evidence mismatch, immutable version incident, or suspected compromise."
*/

import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const SCRIPT_PATH = fileURLToPath(import.meta.url);
const ROOT = path.resolve(path.dirname(SCRIPT_PATH), "..");
const POLICY_PATH = path.join(ROOT, "policy", "release-recovery.json");

function fail(message) {
  throw new Error(message);
}

function loadPolicy() {
  const policy = JSON.parse(fs.readFileSync(POLICY_PATH, "utf8"));
  if (policy.schemaVersion !== 1) fail(`Unsupported recovery policy version: ${policy.schemaVersion}`);
  return policy;
}

function requireObject(value, label) {
  if (!value || typeof value !== "object" || Array.isArray(value)) fail(`${label} must be an object`);
  return value;
}

function requireString(value, label) {
  if (typeof value !== "string" || !value.trim()) fail(`${label} must be a non-empty string`);
  return value;
}

function validateEnum(policy, group, value, label) {
  if (!policy.statuses[group]?.includes(value)) {
    fail(`${label} must be one of: ${(policy.statuses[group] ?? []).join(", ")}`);
  }
  return value;
}

function validateObservation(input, policy = loadPolicy()) {
  const observation = requireObject(input, "observation");
  if (observation.schema !== policy.observationSchema) {
    fail(`Unsupported observation schema: ${observation.schema}`);
  }
  const allowedTopLevel = new Set([
    "schema",
    "component",
    "packageName",
    "version",
    "tag",
    "githubRelease",
    "npm",
    "durableEvidence",
    "attestations",
    "trust",
    "wave",
  ]);
  for (const key of Object.keys(observation)) {
    if (!allowedTopLevel.has(key)) fail(`Unknown observation field: ${key}`);
  }
  requireString(observation.component, "component");
  requireString(observation.packageName, "packageName");
  requireString(observation.version, "version");
  const normalized = {
    schema: policy.observationSchema,
    component: observation.component,
    packageName: observation.packageName,
    version: observation.version,
    tag: validateEnum(policy, "tag", observation.tag, "tag"),
    githubRelease: validateEnum(policy, "githubRelease", observation.githubRelease, "githubRelease"),
    npm: validateEnum(policy, "npm", observation.npm, "npm"),
    durableEvidence: validateEnum(policy, "durableEvidence", observation.durableEvidence, "durableEvidence"),
    attestations: validateEnum(policy, "attestations", observation.attestations, "attestations"),
    trust: validateEnum(policy, "trust", observation.trust, "trust"),
    wave: { expectedComponents: 1, completedComponents: 1 },
  };
  if (observation.wave !== undefined) {
    const wave = requireObject(observation.wave, "wave");
    const expected = wave.expectedComponents;
    const completed = wave.completedComponents;
    if (!Number.isSafeInteger(expected) || expected < 1) fail("wave.expectedComponents must be a positive integer");
    if (!Number.isSafeInteger(completed) || completed < 0 || completed > expected) {
      fail("wave.completedComponents must be between zero and expectedComponents");
    }
    normalized.wave = { expectedComponents: expected, completedComponents: completed };
  }
  return normalized;
}

function determineState(observation) {
  if (observation.trust === "confirmed-compromise") return "compromise-confirmed";
  if (observation.trust === "suspected-compromise") return "compromise-suspected";
  if (observation.tag === "mismatch") return "source-tag-mismatch";
  if (observation.npm === "mismatch") return "npm-artifact-mismatch";
  if (observation.durableEvidence === "mismatch" || observation.attestations === "mismatch") {
    return "release-evidence-mismatch";
  }
  if (observation.tag === "absent") return "candidate-no-tag";
  if (observation.githubRelease === "absent" || observation.githubRelease === "draft") {
    return "tag-awaiting-github-release";
  }
  if (observation.npm === "absent") return "github-release-awaiting-npm";
  if (
    observation.durableEvidence === "absent" ||
    observation.durableEvidence === "partial" ||
    observation.attestations === "absent" ||
    observation.attestations === "partial"
  ) {
    return "npm-published-evidence-pending";
  }
  if (observation.wave.completedComponents < observation.wave.expectedComponents) {
    return "component-complete-wave-partial";
  }
  return "complete";
}

function classifyRelease(input, policy = loadPolicy()) {
  const observation = validateObservation(input, policy);
  const state = determineState(observation);
  const statePolicy = policy.states[state];
  if (!statePolicy) fail(`Recovery policy does not define state: ${state}`);
  const immutableFacts = [];
  if (observation.tag !== "absent") immutableFacts.push("release-tag-exists");
  if (observation.githubRelease === "published") immutableFacts.push("github-release-is-public");
  if (observation.npm !== "absent") immutableFacts.push("npm-version-is-immutable");
  if (observation.durableEvidence !== "absent") immutableFacts.push("release-evidence-assets-exist");
  return {
    schema: policy.decisionSchema,
    subject: {
      component: observation.component,
      packageName: observation.packageName,
      version: observation.version,
    },
    state,
    severity: statePolicy.severity,
    resumable: statePolicy.resumable,
    summary: statePolicy.summary,
    allowedActions: [...statePolicy.allowedActions],
    prohibitedActions: [...policy.globalProhibitions],
    immutableFacts,
    observation,
  };
}

function parseArgs(argv) {
  const args = [...argv];
  const command = args.shift();
  const options = {};
  while (args.length > 0) {
    const flag = args.shift();
    if (!flag?.startsWith("--")) fail(`Unexpected argument: ${String(flag)}`);
    const value = args.shift();
    if (value === undefined || value.startsWith("--")) fail(`Missing value for ${flag}`);
    options[flag.slice(2)] = value;
  }
  return { command, options };
}

function main() {
  const { command, options } = parseArgs(process.argv.slice(2));
  if (command !== "classify") fail("Usage: release-state.mjs classify --input observation.json");
  const inputPath = options.input;
  if (typeof inputPath !== "string" || !inputPath) fail("Missing --input");
  const input = JSON.parse(fs.readFileSync(path.resolve(inputPath), "utf8"));
  process.stdout.write(`${JSON.stringify(classifyRelease(input), null, 2)}\n`);
}

if (process.argv[1] && path.resolve(process.argv[1]) === SCRIPT_PATH) {
  try {
    main();
  } catch (error) {
    console.error(error instanceof Error ? error.message : String(error));
    process.exit(1);
  }
}

export { classifyRelease, determineState, loadPolicy, validateObservation };

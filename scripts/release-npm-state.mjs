#!/usr/bin/env node
/**
summary: "Inspects an immutable npm version and classifies it against the exact retained release artifact."
read_when:
  - "Publishing or resuming an npm release after a partial workflow failure."
  - "Diagnosing whether an existing npm version is absent, exact, or mismatched."
*/

import { spawnSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const SCRIPT_PATH = fileURLToPath(import.meta.url);
const ARTIFACT_SCHEMA = "pi.release-artifact.v1";
const STATE_SCHEMA = "pi.npm-publication-state.v1";
const SHASUM_RE = /^[0-9a-f]{40}$/u;

function fail(message) {
  throw new Error(message);
}

function requireString(value, label) {
  if (typeof value !== "string" || !value.trim()) fail(`${label} must be a non-empty string`);
  return value;
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

function requireOption(options, name) {
  return requireString(options[name], `--${name}`);
}

function expectedPublication(artifact) {
  if (!artifact || typeof artifact !== "object" || Array.isArray(artifact)) {
    fail("release artifact manifest must be an object");
  }
  if (artifact.schema !== ARTIFACT_SCHEMA) {
    fail(`Unsupported release artifact schema: ${String(artifact.schema)}`);
  }
  const name = requireString(artifact.package?.name, "artifact package name");
  const version = requireString(artifact.package?.version, "artifact package version");
  const integrity = requireString(artifact.artifact?.npmIntegrity, "artifact npm integrity");
  const shasum = requireString(artifact.artifact?.npmShasum, "artifact npm shasum").toLowerCase();
  if (!SHASUM_RE.test(shasum)) fail("artifact npm shasum must be a lowercase SHA-1 value");
  return { name, version, integrity, shasum };
}

function normalizeObservedPublication(value) {
  if (value === null || value === undefined) return null;
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    fail("npm view result must be an object");
  }
  return {
    name: requireString(value.name, "npm package name"),
    version: requireString(value.version, "npm package version"),
    integrity: requireString(value.integrity ?? value.dist?.integrity, "npm dist.integrity"),
    shasum: requireString(value.shasum ?? value.dist?.shasum, "npm dist.shasum").toLowerCase(),
  };
}

function classifyNpmPublication(expected, observed) {
  const normalizedExpected = {
    name: requireString(expected?.name, "expected package name"),
    version: requireString(expected?.version, "expected package version"),
    integrity: requireString(expected?.integrity, "expected npm integrity"),
    shasum: requireString(expected?.shasum, "expected npm shasum").toLowerCase(),
  };
  const normalizedObserved = normalizeObservedPublication(observed);
  if (normalizedObserved === null) {
    return {
      schema: STATE_SCHEMA,
      state: "absent",
      expected: normalizedExpected,
      observed: null,
      mismatches: [],
    };
  }

  const mismatches = [];
  for (const field of ["name", "version", "integrity", "shasum"]) {
    if (normalizedExpected[field] !== normalizedObserved[field]) mismatches.push(field);
  }
  return {
    schema: STATE_SCHEMA,
    state: mismatches.length === 0 ? "exact" : "mismatch",
    expected: normalizedExpected,
    observed: normalizedObserved,
    mismatches,
  };
}

function isNpmNotFound(output) {
  const text = String(output ?? "");
  return /(?:^|\s)E404(?:\s|$)/iu.test(text) || /\b404\b[^\n]*\bNot Found\b/iu.test(text);
}

function queryNpmPublication(expected, options = {}) {
  const executable = options.executable ?? process.env.NPM_EXECUTABLE ?? "npm";
  const result = spawnSync(
    executable,
    [
      "view",
      `${expected.name}@${expected.version}`,
      "name",
      "version",
      "dist.integrity",
      "dist.shasum",
      "--json",
    ],
    {
      cwd: options.cwd ?? process.cwd(),
      encoding: "utf8",
      env: {
        ...process.env,
        npm_config_audit: "false",
        npm_config_fund: "false",
        npm_config_update_notifier: "false",
        ...(options.env ?? {}),
      },
      stdio: ["ignore", "pipe", "pipe"],
    },
  );
  if (result.error) throw result.error;
  if (result.status !== 0) {
    const diagnostic = `${result.stdout ?? ""}\n${result.stderr ?? ""}`;
    if (isNpmNotFound(diagnostic)) return null;
    fail(`npm view failed with exit ${result.status}: ${diagnostic.trim()}`);
  }
  let parsed;
  try {
    parsed = JSON.parse(result.stdout ?? "");
  } catch (error) {
    fail(`npm view returned invalid JSON: ${error instanceof Error ? error.message : String(error)}`);
  }
  return normalizeObservedPublication(parsed);
}

function writeEnv(envFile, state) {
  if (!envFile) return;
  fs.appendFileSync(path.resolve(envFile), `RELEASE_NPM_PUBLICATION_STATE=${state}\n`, "utf8");
}

function inspect(options) {
  const manifestPath = path.resolve(requireOption(options, "manifest"));
  const artifact = JSON.parse(fs.readFileSync(manifestPath, "utf8"));
  const expected = expectedPublication(artifact);
  const observed = queryNpmPublication(expected);
  const classification = classifyNpmPublication(expected, observed);
  writeEnv(options["output-env-file"], classification.state);
  process.stdout.write(`${JSON.stringify(classification, null, 2)}\n`);

  if (options.require !== undefined) {
    const required = requireString(options.require, "--require");
    if (!["absent", "exact", "mismatch"].includes(required)) {
      fail("--require must be absent, exact, or mismatch");
    }
    if (classification.state !== required) {
      fail(`npm publication state is ${classification.state}; required ${required}`);
    }
  }
  return classification;
}

function main() {
  const { command, options } = parseArgs(process.argv.slice(2));
  if (command !== "inspect") {
    fail("Usage: release-npm-state.mjs inspect --manifest FILE [--output-env-file FILE] [--require STATE]");
  }
  inspect(options);
}

if (process.argv[1] && path.resolve(process.argv[1]) === SCRIPT_PATH) {
  try {
    main();
  } catch (error) {
    console.error(error instanceof Error ? error.message : String(error));
    process.exit(1);
  }
}

export {
  classifyNpmPublication,
  expectedPublication,
  isNpmNotFound,
  normalizeObservedPublication,
  queryNpmPublication,
};

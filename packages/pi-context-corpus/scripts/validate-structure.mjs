#!/usr/bin/env node
// summary: "Validates the deliberate non-live, private pi-context-corpus package contract."
// read_when:
//   - "Changing package resources, CLI paths, release posture, or template exception boundaries."

import fs from "node:fs";

const errors = [];
const fail = (message) => errors.push(message);

function readJson(path) {
  try {
    return JSON.parse(fs.readFileSync(path, "utf8"));
  } catch (error) {
    fail(`failed to parse ${path}: ${error.message}`);
    return {};
  }
}

function readText(path) {
  try {
    return fs.readFileSync(path, "utf8");
  } catch (error) {
    fail(`failed to read ${path}: ${error.message}`);
    return "";
  }
}

function requireFile(path) {
  if (!fs.existsSync(path) || !fs.statSync(path).isFile()) fail(`required file missing: ${path}`);
}

function requireAbsent(path) {
  if (fs.existsSync(path)) fail(`forbidden live-resource path exists: ${path}`);
}

const pkg = readJson("package.json");
const policy = readJson("policy/engineering-lane.json");
const answers = readText(".copier-answers.yml");

for (const path of [
  "bin/corpus.mjs",
  "lib/corpus-index.mjs",
  "lib/corpus-html.mjs",
  "lib/batch.mjs",
  "projections/corpus.jq",
  "tests/corpus.test.mjs",
  "docs/project/foundation.md",
]) {
  requireFile(path);
}

if (pkg.name !== "@tryinget/pi-context-corpus")
  fail("package name must be @tryinget/pi-context-corpus");
if (pkg.private !== true) fail("non-live corpus slice must remain private/non-published");
if (!pkg.keywords?.includes("pi-package") || !pkg.keywords?.includes("context-corpus")) {
  fail("package keywords must include pi-package and context-corpus");
}
if (pkg.pi !== undefined) {
  fail("deliberately non-live package must not expose a package.json#pi manifest at all");
}
if (pkg.peerDependencies !== undefined) {
  fail("corpus package has no Pi runtime surface and must not declare peer dependencies");
}
if (pkg.bin?.["pi-context-corpus"] !== "./bin/corpus.mjs") {
  fail("package bin must expose ./bin/corpus.mjs");
}
if (pkg["x-pi-template"]?.releaseConfigMode !== "none") {
  fail("x-pi-template.releaseConfigMode must remain none");
}
if (!/^release_config_mode:\s*none\s*$/m.test(answers)) {
  fail(".copier-answers.yml must retain generated release_config_mode: none");
}
if (pkg.engines?.node !== ">=22") fail("engines.node must be >=22");

for (const expected of [
  "bin/corpus.mjs",
  "lib/corpus-index.mjs",
  "lib/corpus-html.mjs",
  "lib/batch.mjs",
  "projections/corpus.jq",
  "policy/security-policy.json",
  "policy/engineering-lane.json",
]) {
  if (!pkg.files?.includes(expected)) fail(`package files must include ${expected}`);
}

const expectedScripts = {
  fix: "bash ./scripts/quality-gate.sh fix",
  lint: "bash ./scripts/quality-gate.sh lint",
  typecheck: "bash ./scripts/quality-gate.sh typecheck",
  "fixtures:test": "node --test tests/corpus.test.mjs",
  "quality:pre-commit": "bash ./scripts/quality-gate.sh pre-commit",
  "quality:pre-push": "bash ./scripts/quality-gate.sh pre-push",
  "quality:ci": "bash ./scripts/quality-gate.sh ci",
  check: "npm run quality:ci",
  test: "npm run quality:ci",
  "docs:list": "node ~/ai-society/core/agent-scripts/scripts/docs-list.mjs",
  "docs:list:workspace":
    "node ~/ai-society/core/agent-scripts/scripts/docs-list.mjs --workspace --discover",
  "docs:list:json": "node ~/ai-society/core/agent-scripts/scripts/docs-list.mjs --json",
};
for (const [name, expected] of Object.entries(expectedScripts)) {
  if (pkg.scripts?.[name] !== expected) fail(`scripts.${name} must be '${expected}'`);
}
if (
  pkg.scripts?.["release:check"] !== undefined ||
  pkg.scripts?.["release:check:quick"] !== undefined
) {
  fail("private releaseConfigMode=none slice must not expose release scripts");
}

if (policy.lane !== "ts" || policy.engineering_core?.lane !== "pi-ts") {
  fail("engineering policy must retain ts/pi-ts template lineage");
}

requireAbsent("extensions");
requireAbsent("prompts");
requireAbsent(".pi");
requireAbsent(".github");
requireAbsent("skills");

const mode = fs.statSync("bin/corpus.mjs").mode & 0o111;
if (mode === 0) fail("bin/corpus.mjs must be executable");

if (errors.length > 0) {
  for (const error of errors) console.error(error);
  console.error(`Validation failed with ${errors.length} issue(s).`);
  process.exit(1);
}
console.log("pi-context-corpus structure validation passed.");

#!/usr/bin/env node

import fs from "node:fs";
import { loadCurrentHostVersion } from "../../../scripts/pi-host-compatibility-canary/host-contract.mjs";

let failed = false;
const errors = [];

function fail(msg) {
  errors.push(msg);
  failed = true;
}

function readJsonSafe(filePath) {
  try {
    return JSON.parse(fs.readFileSync(filePath, "utf8"));
  } catch {
    return undefined;
  }
}

function readTextSafe(filePath) {
  try {
    return fs.readFileSync(filePath, "utf8");
  } catch {
    return undefined;
  }
}

function readCopierAnswer(key) {
  const answers = readTextSafe(".copier-answers.yml");
  if (!answers) return undefined;
  const escaped = key.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const match = new RegExp(`^${escaped}:\\s*['"]?([^'"\\r\\n]+)['"]?\\s*$`, "m").exec(answers);
  return match?.[1]?.trim();
}

function expectedReleaseConfigMode() {
  return readCopierAnswer("release_config_mode") ?? "component";
}

function validateScopedPackageName(p) {
  const npmOrg = readCopierAnswer("npm_org");
  const repoName = readCopierAnswer("repo_name");
  if (!npmOrg || !repoName) {
    fail(".copier-answers.yml must include npm_org and repo_name for package name validation");
    return;
  }

  const expectedName = `@${npmOrg.replace(/^@/, "")}/${repoName}`;
  if (p.name !== expectedName) {
    fail(`package.json name must be scoped npm identity '${expectedName}' (got '${p.name}')`);
  }
}

const PI_HOST_BASELINE = "0.84.3";
const PI_DEV_TEST_FLOOR = loadCurrentHostVersion();
const PI_TEMPLATE_SOURCE = "@tryinget/pi-extensions-package-template";
const PI_HOST_PACKAGES = ["@earendil-works/pi-coding-agent", "@earendil-works/pi-ai"];
const PI_DEPENDENCY_SECTIONS = [
  "dependencies",
  "devDependencies",
  "optionalDependencies",
  "peerDependencies",
];

function validatePiHostContract(p) {
  const templateMeta = p["x-pi-template"];
  const contract = templateMeta?.piHostContract;

  if (!templateMeta || typeof templateMeta !== "object") {
    fail("package.json must include x-pi-template provenance metadata");
    return;
  }
  if (!contract || typeof contract !== "object") {
    fail("package.json x-pi-template.piHostContract must be an object");
    return;
  }
  if (contract.schemaVersion !== 1) {
    fail("package.json x-pi-template.piHostContract.schemaVersion must be 1");
  }
  if (contract.source !== PI_TEMPLATE_SOURCE) {
    fail(`package.json Pi host contract source must be '${PI_TEMPLATE_SOURCE}'`);
  }
  if (contract.packageVersionSource !== "package.json#version") {
    fail(
      "package.json Pi host contract must identify package.json#version as the independent package version source",
    );
  }
  if (contract.hostBaseline !== PI_HOST_BASELINE) {
    fail(`package.json Pi host baseline must be '${PI_HOST_BASELINE}'`);
  }
  if (contract.devTestFloor !== PI_DEV_TEST_FLOOR) {
    fail(`package.json Pi development test floor must be '${PI_DEV_TEST_FLOOR}'`);
  }

  const governed = new Set(PI_HOST_PACKAGES);
  for (const packageName of PI_HOST_PACKAGES) {
    if (p.devDependencies?.[packageName] !== PI_DEV_TEST_FLOOR) {
      fail(
        `package.json devDependencies.${packageName} must equal Pi development test floor '${PI_DEV_TEST_FLOOR}'`,
      );
    }
    if (contract.peerCompatibility?.[packageName] !== "*") {
      fail(`package.json Pi peer compatibility for ${packageName} must be '*'`);
    }
    if (p.peerDependencies?.[packageName] !== contract.peerCompatibility?.[packageName]) {
      fail(
        `package.json peerDependencies.${packageName} must match x-pi-template.piHostContract.peerCompatibility`,
      );
    }
  }

  for (const section of PI_DEPENDENCY_SECTIONS) {
    for (const [name, specifier] of Object.entries(p[section] ?? {})) {
      if (/^@mariozechner\/pi-/.test(name) || /^npm:@mariozechner\/pi-/.test(String(specifier))) {
        fail(`package.json ${section}.${name} must not use or alias the legacy Pi namespace`);
      }
      if (/^@earendil-works\/pi-/.test(name)) {
        if (!governed.has(name)) {
          fail(`package.json ${section}.${name} is outside x-pi-template.piHostContract`);
        } else if (section !== "devDependencies" && section !== "peerDependencies") {
          fail(
            `package.json ${section}.${name} must be a governed development pin or compatibility peer`,
          );
        }
      }
    }
  }

  if (p.dependencies?.typescript !== "6.0.3") {
    fail("package.json dependencies.typescript must be pinned to 6.0.3 for generated typechecks");
  }
  if (!fs.existsSync("tsconfig.json")) {
    fail("Generated package must include tsconfig.json");
  }
  if (!fs.existsSync("tests/pi-host-contract.test.mjs")) {
    fail("Generated package must include tests/pi-host-contract.test.mjs");
  }
}

function validatePackageJson() {
  const p = readJsonSafe("package.json");
  if (!p) {
    fail("Failed to parse package.json");
    return;
  }

  if (p.private !== true || p["x-pi-template"]?.releaseConfigMode !== "none") {
    fail(
      "This package must remain private with releaseConfigMode none; publication needs separate authority",
    );
  }
  if (p.peerDependencies?.typebox !== "*" || p.devDependencies?.typebox !== "1.3.7") {
    fail("typebox must be host-provided with peer '*' and exact development pin 1.3.7");
  }
  if (
    !p.files?.includes("src") ||
    !p.files?.includes("NOTICE") ||
    !p.files?.includes("external/LICENSE-Apache-2.0.txt")
  ) {
    fail("Pack allowlist must include runtime src, NOTICE and upstream Apache license");
  }
  validateScopedPackageName(p);
  validatePiHostContract(p);

  if (!Array.isArray(p.keywords) || !p.keywords.includes("pi-package")) {
    fail("package.json missing keywords entry: pi-package");
  }
  if (!Array.isArray(p.keywords) || !p.keywords.includes("pi-extension")) {
    fail("package.json missing keywords entry: pi-extension");
  }

  const ext = p.pi?.extensions;
  if (!Array.isArray(ext) || ext.length < 1) {
    fail("package.json missing pi.extensions array");
  } else {
    for (const entry of ext) {
      const normalized = entry.replace(/^\.\//, "");
      if (!fs.existsSync(normalized)) {
        fail(`pi.extensions entry does not exist: ${entry}`);
      }
    }
  }

  const prompts = p.pi?.prompts;
  if (!Array.isArray(prompts) || prompts.length < 1) {
    fail("package.json missing pi.prompts array");
  } else {
    for (const entry of prompts) {
      const normalized = entry.replace(/\/$/, "").replace(/^\.\//, "");
      if (!fs.existsSync(normalized)) {
        fail(`pi.prompts entry does not exist: ${entry}`);
      }
    }
  }

  const requiredPeers = ["@earendil-works/pi-coding-agent", "@earendil-works/pi-ai"];
  for (const peer of requiredPeers) {
    if (typeof p.peerDependencies?.[peer] !== "string") {
      fail(`package.json peerDependencies must include ${peer}`);
    }
  }

  const scriptExpectations = {
    fix: "bash ./scripts/quality-gate.sh fix",
    lint: "bash ./scripts/quality-gate.sh lint",
    typecheck: "bash ./scripts/quality-gate.sh typecheck",
    "quality:pre-commit": "bash ./scripts/quality-gate.sh pre-commit",
    "quality:pre-push": "bash ./scripts/quality-gate.sh pre-push",
    "quality:ci": "bash ./scripts/quality-gate.sh ci",
    check: "npm run quality:ci",
    test: "npm run quality:ci",
    "docs:list": "node ~/ai-society/core/agent-scripts/scripts/docs-list.mjs",
    "docs:list:workspace":
      "node ~/ai-society/core/agent-scripts/scripts/docs-list.mjs --workspace --discover",
    "docs:list:json": "node ~/ai-society/core/agent-scripts/scripts/docs-list.mjs --json",
    "release:check": "bash ./scripts/release-check.sh",
    "release:check:quick": "SKIP_PI_SMOKE=1 bash ./scripts/release-check.sh",
  };

  for (const [scriptName, expected] of Object.entries(scriptExpectations)) {
    if (p.scripts?.[scriptName] !== expected) {
      fail(`package.json scripts.${scriptName} must be '${expected}'`);
    }
  }

  if (p.publishConfig?.registry !== "https://registry.npmjs.org/") {
    fail("package.json publishConfig.registry must be 'https://registry.npmjs.org/'");
  }

  if (p.publishConfig?.access !== "public") {
    fail("package.json publishConfig.access must be 'public'");
  }

  if (p.engines?.node !== ">=22") {
    fail("package.json engines.node must be '>=22'");
  }

  if (typeof p.repository?.directory !== "string" || p.repository.directory.length === 0) {
    fail("package.json repository.directory must be set for monorepo package mode");
  }

  const templateMeta = p["x-pi-template"];
  if (!templateMeta || typeof templateMeta !== "object") {
    fail("package.json must include x-pi-template metadata");
  } else {
    if (!["simple-package", "monorepo-package"].includes(templateMeta.scaffoldMode)) {
      fail(
        "package.json x-pi-template.scaffoldMode must be 'simple-package' or legacy alias 'monorepo-package'",
      );
    }
    if (typeof templateMeta.workspacePath !== "string" || templateMeta.workspacePath.length === 0) {
      fail("package.json x-pi-template.workspacePath must be non-empty");
    }
    if (
      typeof templateMeta.releaseComponent !== "string" ||
      templateMeta.releaseComponent.length === 0
    ) {
      fail("package.json x-pi-template.releaseComponent must be non-empty");
    }
    if (!["component", "none"].includes(templateMeta.releaseConfigMode)) {
      fail("package.json x-pi-template.releaseConfigMode must be 'component' or 'none'");
    }
    const expectedMode = expectedReleaseConfigMode();
    if (templateMeta.releaseConfigMode !== expectedMode) {
      fail(
        `package.json x-pi-template.releaseConfigMode must match .copier-answers.yml release_config_mode '${expectedMode}' (got '${templateMeta.releaseConfigMode}')`,
      );
    }
  }

  const biomeVersion = p.devDependencies?.["@biomejs/biome"];
  if (typeof biomeVersion !== "string") {
    fail("package.json devDependencies must include @biomejs/biome");
  }

  if (!Array.isArray(p.files) || p.files.length < 1) {
    fail("package.json must define a non-empty files array");
  } else {
    if (!p.files.includes("prompts")) {
      fail("package.json files must include 'prompts'");
    }
    if (!p.files.includes("examples")) {
      fail("package.json files must include 'examples'");
    }
    if (!p.files.includes("policy/security-policy.json")) {
      fail("package.json files must include 'policy/security-policy.json'");
    }
    if (!p.files.includes("policy/engineering-lane.json")) {
      fail("package.json files must include 'policy/engineering-lane.json'");
    }

    for (const entry of ext) {
      const normalized = entry.replace(/^\.\//, "");
      if (!p.files.includes(normalized)) {
        fail(`package.json files must include extension artifact: ${normalized}`);
      }
    }
  }
}

function validateEngineeringLane() {
  const stackLane = readJsonSafe("policy/engineering-lane.json");
  if (!stackLane) {
    fail("Failed to parse policy/engineering-lane.json");
    return;
  }

  if (stackLane.lane !== "ts") {
    fail("policy/engineering-lane.json lane must be 'ts'");
  }

  const laneName = stackLane.engineering_core?.lane;
  if (laneName !== "pi-ts") {
    fail("policy/engineering-lane.json engineering_core.lane must be 'pi-ts'");
  }
}

function main() {
  validatePackageJson();
  validateEngineeringLane();

  if (failed) {
    for (const error of errors) {
      console.error(error);
    }
    console.error(`Validation failed with ${errors.length} issue(s).`);
    process.exit(1);
  }

  console.log("Node.js validation passed.");
}

main();

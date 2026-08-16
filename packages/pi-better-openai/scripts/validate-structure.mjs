#!/usr/bin/env node

/**
summary: "Validates Better OpenAI package identity, manifest contracts, publish files, and TypeScript engineering lane."
read_when:
  - "Changing scoped package naming, manifest requirements, copier release mode, or engineering-lane metadata."
*/

import fs from "node:fs";

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

function validatePackageJson() {
  const p = readJsonSafe("package.json");
  if (!p) {
    fail("Failed to parse package.json");
    return;
  }

  validateScopedPackageName(p);

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

  if (p.engines?.node !== ">=22.19.0") {
    fail("package.json engines.node must be '>=22.19.0'");
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

function validateStackLane() {
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
  validateStackLane();

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

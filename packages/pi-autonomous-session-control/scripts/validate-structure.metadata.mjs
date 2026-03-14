#!/usr/bin/env node

import fs from "node:fs";
import path from "node:path";
import { validateTechStackContract } from "../../../scripts/validate-tech-stack-contract.mjs";

let failed = false;
const fail = (msg) => {
  console.error(msg);
  failed = true;
};

const BIOME_IGNORE_TOKEN = "biome" + "-ignore";
const biomeIgnoreWithRationalePattern = new RegExp(`\\b${BIOME_IGNORE_TOKEN}\\b[^:\\n]*:\\s*\\S+`);
const biomeIgnoreTrackingPattern = /(TODO\(#\d+\)|Issue:\s*#\d+)/;
const biomeIgnoreFileExtensions = new Set([
  ".ts",
  ".tsx",
  ".js",
  ".jsx",
  ".mjs",
  ".cjs",
  ".mts",
  ".cts",
  ".jsonc",
]);
const biomeIgnoreSkippedDirs = new Set([
  ".git",
  "node_modules",
  "dist",
  "coverage",
  "external",
  "ontology",
]);

function validateBiomeIgnoreGovernance(rootDir) {
  const walk = (dirPath) => {
    const entries = fs.readdirSync(dirPath, { withFileTypes: true });
    for (const entry of entries) {
      const fullPath = path.join(dirPath, entry.name);
      if (entry.isDirectory()) {
        if (biomeIgnoreSkippedDirs.has(entry.name)) {
          continue;
        }
        walk(fullPath);
        continue;
      }
      if (!entry.isFile()) continue;
      if (!biomeIgnoreFileExtensions.has(path.extname(entry.name))) {
        continue;
      }

      const relPath = path.relative(rootDir, fullPath).replaceAll("\\", "/");
      const lines = fs.readFileSync(fullPath, "utf8").split(/\r?\n/);
      for (let i = 0; i < lines.length; i += 1) {
        const line = lines[i];
        if (!line.includes(BIOME_IGNORE_TOKEN)) continue;

        if (!biomeIgnoreWithRationalePattern.test(line)) {
          fail(
            `${relPath}:${i + 1} ${BIOME_IGNORE_TOKEN} must include a rationale after ':' (example: // ${BIOME_IGNORE_TOKEN} lint/<group>/<rule>: <why>)`,
          );
          continue;
        }

        if (!biomeIgnoreTrackingPattern.test(line)) {
          fail(
            `${relPath}:${i + 1} ${BIOME_IGNORE_TOKEN} must include tracking reference TODO(#123) or Issue: #123`,
          );
        }
      }
    }
  };

  walk(rootDir);
}

try {
  const qPath = "docs/org/project-docs-intake.questions.json";
  const q = JSON.parse(fs.readFileSync(qPath, "utf8"));

  if (typeof q.title !== "string" || q.title.trim().length === 0) {
    fail(`Interview questions file must include a non-empty title: ${qPath}`);
  }

  if (typeof q.description !== "string" || q.description.trim().length === 0) {
    fail(`Interview questions file must include a non-empty description: ${qPath}`);
  }

  if (!Array.isArray(q.questions) || q.questions.length === 0) {
    fail(`Interview questions file must include a non-empty questions array: ${qPath}`);
  }

  const intakeProfile = typeof q.profile === "string" ? q.profile : "guided";
  if (!["guided", "minimal"].includes(intakeProfile)) {
    fail(`Interview questions profile must be 'guided' or 'minimal': ${qPath}`);
  }

  const questionIds = new Set();
  let decisionQuestionCount = 0;
  let recommendedQuestionCount = 0;

  for (const [index, entry] of q.questions.entries()) {
    if (!entry || typeof entry !== "object") {
      fail(`Interview question at index ${index} must be an object: ${qPath}`);
    }

    const id = entry.id;
    const type = entry.type;
    const questionText = entry.question;

    if (typeof id !== "string" || id.trim().length === 0) {
      fail(`Interview question at index ${index} is missing a non-empty id: ${qPath}`);
    }

    if (questionIds.has(id)) {
      fail(`Interview questions must use unique ids (duplicate: ${id}): ${qPath}`);
    }
    questionIds.add(id);

    if (typeof type !== "string" || type.trim().length === 0) {
      fail(`Interview question '${id}' is missing a non-empty type: ${qPath}`);
    }

    if (typeof questionText !== "string" || questionText.trim().length === 0) {
      fail(`Interview question '${id}' is missing a non-empty question field: ${qPath}`);
    }

    if (type === "single" || type === "multi") {
      decisionQuestionCount += 1;
      if (!Array.isArray(entry.options) || entry.options.length === 0) {
        fail(`Interview question '${id}' (${type}) must include non-empty options: ${qPath}`);
      }
    }

    if (entry.recommended !== undefined) {
      recommendedQuestionCount += 1;
    }
  }

  if (intakeProfile === "guided") {
    if (decisionQuestionCount < 1) {
      fail(
        `Guided interview profile must include at least one decision question (single/multi): ${qPath}`,
      );
    }

    if (recommendedQuestionCount < 1) {
      fail(`Guided interview profile must include at least one prefilled recommendation: ${qPath}`);
    }
  }
} catch (error) {
  if (error instanceof Error) {
    fail(`Failed to parse interview questions file: ${error.message}`);
  } else {
    fail("Failed to parse interview questions file: unknown error");
  }
}

try {
  const p = JSON.parse(fs.readFileSync("package.json", "utf8"));
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

  const requiredPeers = ["@mariozechner/pi-coding-agent", "@mariozechner/pi-ai"];
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
    "docs:list": "bash ./scripts/docs-list.sh",
    "docs:list:workspace": "bash ./scripts/docs-list.sh --workspace --discover",
    "docs:list:json": "bash ./scripts/docs-list.sh --json",
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

  const intakeProfile = p.config?.intakeProfile;
  if (intakeProfile !== "guided" && intakeProfile !== "minimal") {
    fail("package.json config.intakeProfile must be 'guided' or 'minimal'");
  }

  const interviewToolVersion = p.config?.interviewToolVersion;
  if (
    typeof interviewToolVersion !== "string" ||
    !/^\d+\.\d+\.\d+([-.][0-9A-Za-z.]+)?$/.test(interviewToolVersion)
  ) {
    fail("package.json config.interviewToolVersion must be a pinned semver string (e.g. 0.5.1)");
  }

  const intakeContextSeed = p.config?.intakeContextSeed;
  if (typeof intakeContextSeed !== "string") {
    fail("package.json config.intakeContextSeed must be a string");
  }

  const qProfileRaw = JSON.parse(
    fs.readFileSync("docs/org/project-docs-intake.questions.json", "utf8"),
  ).profile;
  const qProfile = typeof qProfileRaw === "string" ? qProfileRaw : "guided";
  if (qProfile !== intakeProfile) {
    fail(
      "package.json config.intakeProfile must match docs/org/project-docs-intake.questions.json profile",
    );
  }

  const biomeVersion = p.devDependencies?.["@biomejs/biome"];
  if (typeof biomeVersion !== "string") {
    fail("package.json devDependencies must include @biomejs/biome");
  } else if (!/^\d+\.\d+\.\d+$/.test(biomeVersion)) {
    fail("package.json devDependencies.@biomejs/biome must be pinned to an exact semver (X.Y.Z)");
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
    if (!p.files.includes("policy/stack-lane.json")) {
      fail("package.json files must include 'policy/stack-lane.json'");
    }

    for (const entry of ext) {
      const normalized = entry.replace(/^\.\//, "");
      if (!p.files.includes(normalized)) {
        fail(`package.json files must include extension artifact: ${normalized}`);
      }
    }
  }

  const versionPattern = /^\d+\.\d+\.\d+([-.][0-9A-Za-z.]+)?$/;
  const templateMeta = p["x-pi-template"] || {};
  if (templateMeta.scaffoldMode !== "monorepo-package") {
    fail("package.json x-pi-template.scaffoldMode must be 'monorepo-package'");
  }
  if (templateMeta.workspacePath !== "packages/pi-autonomous-session-control") {
    fail(
      "package.json x-pi-template.workspacePath must match packages/pi-autonomous-session-control",
    );
  }
  if (templateMeta.releaseComponent !== "pi-autonomous-session-control") {
    fail("package.json x-pi-template.releaseComponent must be 'pi-autonomous-session-control'");
  }
  if (templateMeta.releaseConfigMode !== "component") {
    fail("package.json x-pi-template.releaseConfigMode must be 'component'");
  }

  const rootReleaseComponentsPath = "../../scripts/release-components.mjs";
  if (!fs.existsSync(rootReleaseComponentsPath)) {
    fail(`Missing root release component helper: ${rootReleaseComponentsPath}`);
  }

  const rootRpConfigPath = "../../.release-please-config.json";
  const rootRpManifestPath = "../../.release-please-manifest.json";
  if (!fs.existsSync(rootRpConfigPath)) {
    fail(`Missing root release-please config: ${rootRpConfigPath}`);
  }
  if (!fs.existsSync(rootRpManifestPath)) {
    fail(`Missing root release-please manifest: ${rootRpManifestPath}`);
  }

  const rpConfig = JSON.parse(fs.readFileSync(rootRpConfigPath, "utf8"));
  if (rpConfig["include-v-in-tag"] !== true) {
    fail("root .release-please-config.json must set include-v-in-tag=true");
  }
  if (rpConfig["include-component-in-tag"] !== true) {
    fail(
      "root .release-please-config.json must set include-component-in-tag=true for monorepo component tags",
    );
  }
  if (!rpConfig.packages || !rpConfig.packages["packages/pi-autonomous-session-control"]) {
    fail("root .release-please-config.json must include packages/pi-autonomous-session-control");
  }

  const rpManifest = JSON.parse(fs.readFileSync(rootRpManifestPath, "utf8"));
  const manifestVersion = rpManifest["packages/pi-autonomous-session-control"];
  if (!manifestVersion) {
    fail("root .release-please-manifest.json must include packages/pi-autonomous-session-control");
  }
  if (!versionPattern.test(manifestVersion)) {
    fail("root .release-please-manifest.json entry must match X.Y.Z");
  }
  if (manifestVersion !== p.version) {
    fail("root .release-please-manifest.json entry must match package.json version");
  }

  validateTechStackContract({
    policyPath: "policy/stack-lane.json",
    expectedLane: "ts",
    expectedTechStackLane: "pi-ts",
    requirePinnedRef: "sha40",
    smokeMode: process.env.PI_TECH_STACK_SMOKE === "0" ? "off" : "if-available",
    fail,
  });

  validateBiomeIgnoreGovernance(".");
} catch (error) {
  if (error instanceof Error) {
    fail(`Failed to validate package/release metadata: ${error.message}`);
  } else {
    fail("Failed to validate package/release metadata: unknown error");
  }
}

process.exit(failed ? 1 : 0);

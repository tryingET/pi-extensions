#!/usr/bin/env node
/**
summary: "Smoke-test structured docs-list JSON intake and packet dogfood evaluation."
read_when:
  - "You change docs discovery JSON handling, package-root parity, or dogfood smoke expectations."
*/

import assert from "node:assert/strict";
import { execFile } from "node:child_process";
import { existsSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { promisify } from "node:util";
import { buildContextPacket } from "../src/context-pack.js";
import { toolResultFromContextPacketResult } from "../src/context-pack-result.js";
import {
  buildDogfoodObservationEvaluation,
  formatDogfoodObservationEvaluation,
} from "../src/dogfood-observation.js";

const execFileAsync = promisify(execFile);
const scriptDir = dirname(fileURLToPath(import.meta.url));
const packageRoot = resolve(scriptDir, "..");
const repoRoot = resolve(packageRoot, "../..");
const docsRoot = packageRoot;
const objective =
  "Dogfood structured docs-list JSON intake for pi-context-packer production readiness";
const DEFAULT_DOCS_LIST_SCRIPT =
  "/home/tryinget/ai-society/core/agent-scripts/scripts/docs-list.mjs";
const docsListScript = process.env.DOCS_LIST_SCRIPT || DEFAULT_DOCS_LIST_SCRIPT;

const fail = (message) => {
  console.error(`dogfood docs-list JSON smoke failed: ${message}`);
  process.exit(1);
};

if (!docsListScript || !existsSync(docsListScript)) {
  fail(
    `docs-list script unavailable (${docsListScript || "unset"}); set DOCS_LIST_SCRIPT to docs-list.mjs`,
  );
}

const docsListArgs = [
  docsListScript,
  "--docs",
  docsRoot,
  "--task",
  objective,
  "--top",
  "8",
  "--paths-only",
  "--repo-relative",
  "--json",
];

const { stdout } = await execFileAsync(process.execPath, docsListArgs, {
  cwd: docsRoot,
  timeout: 8_000,
  maxBuffer: 512_000,
});

let docsListPayload;
try {
  docsListPayload = JSON.parse(stdout);
} catch (error) {
  fail(`docs-list --json did not return valid JSON: ${error.message}`);
}

assert.equal(docsListPayload.ok, true, "docs-list JSON payload must be ok");
assert.ok(
  Array.isArray(docsListPayload.rankedItems) && docsListPayload.rankedItems.length > 0,
  "docs-list JSON payload must include rankedItems",
);

const rankedRepoPaths = docsListPayload.rankedItems
  .map((item) => item?.repoPath ?? item?.path)
  .filter((value) => typeof value === "string" && value.endsWith(".md"));
assert.ok(rankedRepoPaths.length > 0, "rankedItems must expose repo-relative Markdown paths");
assert.ok(
  rankedRepoPaths.some((value) => value.startsWith("packages/pi-context-packer/")),
  "rankedItems should include package-local repoPath entries for this package objective",
);

const packetInput = {
  objective,
  cwd: packageRoot,
  repoRoot,
  providers: {
    agents: "off",
    docs: "required",
    git: "off",
    sci: "off",
    session: "off",
    prompt_vault: "off",
    ak: "off",
    fcos: "off",
  },
  budget: {
    maxTokens: 80_000,
    reserveTokens: 8_000,
    maxBytes: 400_000,
    perProviderMaxTokens: { docs: 40_000 },
  },
};

const result = await buildContextPacket(packetInput, {
  cwd: packageRoot,
  docsListScript,
});
assert.equal(result.ok, true, "context_pack should assemble a docs packet");

const docsSection = result.packet.sections.find((section) => section.provider === "docs");
assert.ok(docsSection, "context_pack should include a docs section");
assert.ok(docsSection.items.length > 0, "docs section should select ranked docs-list items");

const selectedPaths = docsSection.items.map((item) => item.provenance?.path).filter(Boolean);
assert.ok(selectedPaths.length > 0, "selected docs should carry packet Markdown path metadata");
assert.equal(
  result.packet.omissions.length,
  0,
  `dogfood smoke should not leave omissions hidden behind a matched receipt: ${JSON.stringify(result.packet.omissions)}`,
);
for (const selectedPath of selectedPaths) {
  assert.ok(
    rankedRepoPaths.includes(selectedPath),
    `selected docs path should come from docs-list ranked repoPath output: ${selectedPath}`,
  );
}

const sourceSubdir = join(packageRoot, "src");
const subdirResult = await buildContextPacket(
  { ...packetInput, cwd: sourceSubdir },
  { cwd: packageRoot, docsListScript },
);
assert.equal(subdirResult.ok, true, "context_pack should assemble from a package subdir cwd");
const subdirDocsSection = subdirResult.packet.sections.find(
  (section) => section.provider === "docs",
);
assert.ok(subdirDocsSection, "package subdir packet should include a docs section");
const subdirSelectedPaths = subdirDocsSection.items
  .map((item) => item.provenance?.path)
  .filter(Boolean);
assert.ok(subdirSelectedPaths.length > 0, "package subdir packet should select docs");
assert.deepEqual(
  subdirSelectedPaths,
  selectedPaths,
  "package subdir cwd should discover the same ranked package docs as package root cwd",
);
assert.equal(
  subdirResult.packet.omissions.length,
  0,
  `package subdir dogfood smoke should not leave omissions hidden behind a matched receipt: ${JSON.stringify(subdirResult.packet.omissions)}`,
);
for (const selectedPath of subdirSelectedPaths) {
  assert.ok(
    rankedRepoPaths.includes(selectedPath),
    `package subdir selected docs should come from ranked repoPath output: ${selectedPath}`,
  );
}

const toolResult = toolResultFromContextPacketResult(result);
const serializedDetails = JSON.stringify(toolResult.details);
assert.equal(toolResult.details.redaction.rawSelectedItemPathsOmitted, true);
assert.equal(toolResult.details.redaction.rawItemContentOmitted, true);
assert.doesNotMatch(
  serializedDetails,
  /packages\/pi-context-packer\/docs\/project\/product-posture\.md/,
  "compact details should not expose raw selected docs paths",
);
assert.doesNotMatch(
  serializedDetails,
  /Product posture for @tryinget\/pi-context-packer/,
  "compact details should not expose raw selected docs content",
);

const observation = structuredClone(result.packet.dogfoodObservationTemplate);
observation.observation = {
  ...observation.observation,
  activityType: "validation",
  runtimeContext: "source_local",
  actualLowLevelReadSearchStatusCalls: 0,
  actualLowLevelCallsAvoided: result.packet.measurementReceipt.estimatedToolCallsAvoided,
  validationCommandsRun: 1,
  duplicateReadsObserved: false,
  omissionFollowupsUsed: [],
  recommendationMatchedOutcome: true,
  notes:
    "Executable package-local smoke verified real docs-list JSON rankedItems/repoPath intake from package root and package subdir cwd, compact details redaction, and packet-local dogfood evaluation without owner-surface mutation.",
};

const evaluation = buildDogfoodObservationEvaluation({ observation });
assert.equal(evaluation.ok, true, "dogfood observation evaluation should be valid");
assert.equal(evaluation.status, "matched", "dogfood smoke evaluation should match prediction");
assert.equal(evaluation.activityType, "validation", "dogfood smoke should label activity type");
assert.equal(
  evaluation.runtimeContext,
  "source_local",
  "dogfood smoke should label runtime context",
);
assert.equal(
  evaluation.validationCommandsRun,
  1,
  "dogfood smoke should track validation separately",
);

console.log("== context-packer structured docs-list JSON dogfood smoke");
console.log(`docs-list script: ${docsListScript}`);
console.log(`selected docs: ${selectedPaths.length}`);
console.log(`package subdir selected docs: ${subdirSelectedPaths.length}`);
console.log(`expected low-level calls avoided: ${evaluation.expectedLowLevelCallsAvoided}`);
console.log(formatDogfoodObservationEvaluation(evaluation));
console.log("structured docs-list JSON dogfood smoke OK");

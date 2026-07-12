#!/usr/bin/env node
// summary: Checks package docs, runtime, extension, and tests for required workflow contract fragments.
// read_when:
//   - Verifying core autoresearch product posture, resume guarantees, or read-profile enforcement.
import { existsSync, readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const scriptPath = fileURLToPath(import.meta.url);
const packageRoot = path.resolve(path.dirname(scriptPath), "..");

function readRelative(relativePath) {
  const absolutePath = path.join(packageRoot, relativePath);
  if (!existsSync(absolutePath)) return null;
  return readFileSync(absolutePath, "utf8");
}

function includesAll(text, fragments) {
  return fragments.every((fragment) => text?.includes(fragment));
}

const files = {
  contract: readRelative("docs/project/dogfood-workflow-campaign-contract.md"),
  playbook: readRelative("docs/project/dogfood-playbook.md"),
  posture: readRelative("docs/project/product-posture.md"),
  resumeDesign: readRelative("docs/project/longer-bounded-campaign-resume-interrupt-design.md"),
  runtime: readRelative("src/core/runtime.ts"),
  runtimeAutoplan: readRelative("src/core/runtime-autoplan.ts"),
  runtimeAutoplanSetup: readRelative("src/core/runtime-autoplan-setup.ts"),
  runtimeResumePlan: readRelative("src/core/runtime-resume-plan.ts"),
  runtimeResumeApply: readRelative("src/core/runtime-resume-apply.ts"),
  runtimeTest: readRelative("tests/runtime.test.ts"),
  candidateCampaignTest: readRelative("tests/runtime-candidate-campaign.test.ts"),
  resumeTest: readRelative("tests/runtime-resume.test.ts"),
  toolboxBundle: readRelative("src/toolboxBundle.ts"),
  extension: [
    readRelative("extensions/pi-autoresearch.ts"),
    readRelative("extensions/pi-autoresearch/readProfile.ts"),
    readRelative("extensions/pi-autoresearch/toolPlanning.ts"),
    readRelative("extensions/pi-autoresearch/toolRuntimeExecution.ts"),
    readRelative("extensions/pi-autoresearch/toolLoopResume.ts"),
    readRelative("extensions/pi-autoresearch/toolSelfHosting.ts"),
    readRelative("extensions/pi-autoresearch/toolLlamacpp.ts"),
    readRelative("extensions/pi-autoresearch/toolStatusControl.ts"),
  ]
    .filter(Boolean)
    .join("\n"),
  extensionCampaignSchemas: readRelative("extensions/pi-autoresearch/schemas-campaign-start.ts"),
};

const runtimeAndAutoplan = [files.runtime, files.runtimeAutoplan, files.runtimeAutoplanSetup]
  .filter(Boolean)
  .join("\n");
const runtimeAndResumePlan = [files.runtime, files.runtimeResumePlan, files.runtimeResumeApply]
  .filter(Boolean)
  .join("\n");

const checks = [
  {
    id: "campaign-contract-primary-metric",
    description:
      "workflow dogfood contract declares unresolved_dogfood_blockers as the primary metric",
    ok: includesAll(files.contract, [
      "METRIC unresolved_dogfood_blockers=<number>",
      "The primary metric is unresolved workflow/product blockers, not runtime duration.",
      "node scripts/dogfood-workflow-contract.mjs",
    ]),
  },
  {
    id: "playbook-schema-current",
    description: "dogfood playbook uses the actual setup action vocabulary",
    ok:
      typeof files.playbook === "string" &&
      files.playbook.includes('action: "baseline"') &&
      !files.playbook.includes("apply_and_baseline"),
  },
  {
    id: "posture-prioritizes-operator-clarity",
    description:
      "product posture keeps measurement trust, operator clarity, and metric readiness on the strategic line",
    ok: includesAll(files.posture, ["measurement trust", "operator clarity", "metric readiness"]),
  },
  {
    id: "orchestrator-supervision-handoff",
    description:
      "product posture and dogfood playbook expose the landed orchestrator supervision handoff seams",
    ok:
      includesAll(files.posture, [
        "autoresearch_live_supervision",
        "autoresearch_manifest_campaign_supervision",
        "autoresearch_self_hosting_supervision",
      ]) &&
      includesAll(files.playbook, [
        "autoresearch_live_supervision",
        "autoresearch_manifest_campaign_supervision",
        "autoresearch_self_hosting_supervision",
        "orchestrator/AK/KES/issue adapter promotion happens explicitly outside pi-autoresearch",
      ]),
  },
  {
    id: "plan-next-call-reconfigure",
    description:
      "campaign-start plan-only next call carries reconfigure=true when a configured segment needs a new baseline",
    ok: includesAll(runtimeAndAutoplan, [
      "reconfigure: input.reconfigure === true || autoplan.status.currentSegment.configured",
      "const reconfigureField =",
      'nextRunMode === "baseline"',
      '", reconfigure: true"',
    ]),
  },
  {
    id: "plan-next-call-regression-test",
    description:
      "runtime tests cover the configured-segment plan-only -> baseline reconfigure next call",
    ok: includesAll(files.candidateCampaignTest, [
      "appendReceipt(\n      cwd,",
      "configuredDetails.nextToolCall",
      "reconfigure: true",
      'runMode: "baseline"',
    ]),
  },
  {
    id: "resume-foreground-executor-contract",
    description:
      "resume apply remains an explicit foreground executor with exact keys, budgets, confirmation, and peer launch off",
    ok:
      includesAll(files.resumeDesign, [
        "autoresearch_runtime_resume_apply",
        'operatorConfirmation: "RUN FOREGROUND RESUME"',
        'peerMode="off"',
        "runs only inside the foreground tool call",
        "candidate lifecycle mutation",
        "package-local promotion",
        "external evidence/learning writes",
      ]) &&
      includesAll(runtimeAndResumePlan, [
        "AUTORESEARCH_RESUME_APPLY_TOOL_NAME",
        "operatorConfirmation=RUN FOREGROUND RESUME",
        'input.operatorConfirmation !== "RUN FOREGROUND RESUME"',
        "!Number.isInteger(input.maxIterations)",
        "maxIterations must be a positive integer",
        "!Number.isFinite(input.maxWallClockMinutes)",
        "maxWallClockMinutes must be a positive number",
        'peerMode: "off"',
        "candidate lifecycle mutation",
        "package-local promotion",
        "external evidence/learning write",
      ]) &&
      includesAll([files.extension, files.extensionCampaignSchemas].filter(Boolean).join("\n"), [
        "Run an explicit foreground pi-autoresearch resume",
        "Exact segmentKey from resume_apply_plan.",
        "Exact runtimeKey from resume_apply_plan.",
        'Must exactly equal "RUN FOREGROUND RESUME".',
      ]) &&
      includesAll(files.resumeTest, [
        'operatorConfirmation: "RUN FOREGROUND RESUME"',
        "maxIterations must be a positive integer",
        "maxWallClockMinutes must be a positive number",
        'assert.equal(result.loopResult.peerMode, "off")',
      ]),
  },
  {
    id: "read-profile-effect-boundary",
    description: "toolbox read profile is mechanically bound to the extension read effect profile",
    ok: includesAll(files.toolboxBundle, [
      "registerPiAutoresearchExtension",
      'effectProfile: profile === "read" ? "read" : "unrestricted"',
    ]),
  },
  {
    id: "read-profile-mutating-rejection",
    description: "extension contains read-profile rejection hooks for mutating actions/tools",
    ok: includesAll(files.extension, [
      "assertReadProfileAllowsAction",
      "assertReadProfileRejectsTool",
      "effectProfile",
    ]),
  },
];

const failures = checks.filter((check) => !check.ok);
for (const check of checks) {
  const status = check.ok ? "ok" : "fail";
  console.log(`CONTRACT ${status} ${check.id}: ${check.description}`);
}

console.log(`METRIC unresolved_dogfood_blockers=${failures.length}`);

if (failures.length > 0) {
  console.log(`DOGFOOD_BLOCKERS ${failures.map((failure) => failure.id).join(",")}`);
}

if (process.env.DOGFOOD_CONTRACT_STRICT === "1" && failures.length > 0) {
  process.exitCode = 1;
}

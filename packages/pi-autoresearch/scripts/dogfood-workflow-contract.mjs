#!/usr/bin/env node
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
  runtime: readRelative("src/core/runtime.ts"),
  runtimeTest: readRelative("tests/runtime.test.ts"),
  toolboxBundle: readRelative("src/toolboxBundle.ts"),
  extension: readRelative("extensions/pi-autoresearch.ts"),
};

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
      "product posture keeps operator clarity and metric readiness on the strategic line",
    ok: includesAll(files.posture, ["measurement trust and operator clarity", "metric readiness"]),
  },
  {
    id: "plan-next-call-reconfigure",
    description:
      "campaign-start plan-only next call carries reconfigure=true when a configured segment needs a new baseline",
    ok: includesAll(files.runtime, [
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
    ok: includesAll(files.runtimeTest, [
      "appendReceipt(\n      cwd,",
      "configuredDetails.nextToolCall",
      "reconfigure: true",
      'runMode: "baseline"',
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

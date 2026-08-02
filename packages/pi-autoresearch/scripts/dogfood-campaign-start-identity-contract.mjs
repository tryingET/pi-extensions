#!/usr/bin/env node
// summary: Dogfoods exact campaign identity, continuation contract round-trip, and peer-goal fidelity.
// read_when:
//   - Validating campaign-start stale-segment enforcement or generated continuation calls.
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { runInNewContext } from "node:vm";

const packageRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const runtimeUrl = pathToFileURL(path.join(packageRoot, "src/runtime.ts")).href;
const tempRoot = process.env.PI_AUTORESEARCH_CAMPAIGN_IDENTITY_DOGFOOD_ROOT
  ? path.resolve(process.env.PI_AUTORESEARCH_CAMPAIGN_IDENTITY_DOGFOOD_ROOT)
  : mkdtempSync(path.join(os.tmpdir(), "autoresearch-campaign-identity-"));
const shouldCleanup = !process.env.PI_AUTORESEARCH_CAMPAIGN_IDENTITY_DOGFOOD_ROOT;

const {
  appendReceipt,
  buildAutoresearchAutoplan,
  createConfigReceipt,
  executeAutoresearchCampaignStart,
  loadReceiptLog,
} = await import(runtimeUrl);

const blockers = [];
const metricName = "campaign_identity_blockers";
const sharedPrefix = "preserve this exact long dogfood objective identity ".repeat(3);
const objectiveA = `${sharedPrefix}alpha`;
const objectiveB = `${sharedPrefix}beta`;
const contract = {
  metricName,
  metricUnit: "blocker(s)",
  direction: "lower",
  metricThreshold: 0,
  benchmarkCommand: "node bench.mjs",
  checksCommand: "node check.mjs",
};

function addBlocker(id, details = undefined) {
  blockers.push(details === undefined ? id : `${id}:${JSON.stringify(details)}`);
}

function readCounter(cwd) {
  const counterPath = path.join(cwd, "benchmark-count.txt");
  return existsSync(counterPath) ? Number(readFileSync(counterPath, "utf8")) : 0;
}

function parseGeneratedCampaignStartCall(call) {
  return runInNewContext(call, {
    autoresearch_campaign_start: (input) => input,
  });
}

function prepareFixture(cwd) {
  writeFileSync(path.join(cwd, "package.json"), JSON.stringify({ name: "identity-dogfood" }));
  writeFileSync(
    path.join(cwd, "bench.mjs"),
    [
      "import { existsSync, readFileSync, writeFileSync } from 'node:fs';",
      "const p = 'benchmark-count.txt';",
      "const count = existsSync(p) ? Number(readFileSync(p, 'utf8')) : 0;",
      "writeFileSync(p, String(count + 1));",
      `console.log('METRIC ${metricName}=0');`,
    ].join("\n"),
  );
  writeFileSync(path.join(cwd, "check.mjs"), "process.exit(0);\n");
}

try {
  prepareFixture(tempRoot);
  const baseline = await executeAutoresearchCampaignStart({
    cwd: tempRoot,
    objective: objectiveA,
    runMode: "baseline",
    maxIterations: 1,
    peerMode: "plan",
    filesInScope: ["src/runtime.ts"],
    ...contract,
  });
  for (const expected of [
    `metricName: ${JSON.stringify(metricName)}`,
    'metricUnit: "blocker(s)"',
    'direction: "lower"',
    "metricThreshold: 0",
    'benchmarkCommand: "node bench.mjs"',
    'checksCommand: "node check.mjs"',
    'filesInScope: ["src/runtime.ts"]',
  ]) {
    if (!baseline.nextToolCall.includes(expected)) {
      addBlocker("continuation_missing_effective_contract", {
        expected,
        call: baseline.nextToolCall,
      });
    }
  }

  const receiptCountAfterBaseline = loadReceiptLog(tempRoot).entries.length;
  const exactContinuationInput = parseGeneratedCampaignStartCall(baseline.nextToolCall);
  const continuation = await executeAutoresearchCampaignStart(exactContinuationInput);
  if (continuation.loopResult?.completedIterations !== 1) {
    addBlocker("generated_contract_did_not_continue", {
      completedIterations: continuation.loopResult?.completedIterations ?? null,
    });
  }
  if (loadReceiptLog(tempRoot).entries.length !== receiptCountAfterBaseline + 1) {
    addBlocker("continuation_created_duplicate_segment");
  }
  const peerObjective = continuation.loopResult?.peerAssist.objective ?? "";
  if (!peerObjective.includes(objectiveA)) addBlocker("peer_objective_lost_full_goal");
  if (
    !peerObjective.includes("bounded candidate patch") ||
    !peerObjective.includes("isolated worktree")
  ) {
    addBlocker("peer_objective_lost_candidate_lane_contract", { peerObjective });
  }

  const counterBeforeMismatch = readCounter(tempRoot);
  const receiptsBeforeMismatch = loadReceiptLog(tempRoot).entries.length;
  let mismatchMessage = "";
  try {
    await executeAutoresearchCampaignStart({
      cwd: tempRoot,
      objective: objectiveB,
      runMode: "bounded_loop",
      maxIterations: 1,
      peerMode: "off",
      ...contract,
    });
    addBlocker("colliding_objective_was_not_rejected");
  } catch (error) {
    mismatchMessage = error instanceof Error ? error.message : String(error);
  }
  if (
    !mismatchMessage.includes("objectiveDigest") ||
    !mismatchMessage.includes("reconfigure=true")
  ) {
    addBlocker("objective_mismatch_lacked_explicit_boundary", { mismatchMessage });
  }
  if (readCounter(tempRoot) !== counterBeforeMismatch) addBlocker("mismatch_ran_benchmark");
  if (loadReceiptLog(tempRoot).entries.length !== receiptsBeforeMismatch) {
    addBlocker("mismatch_mutated_receipts");
  }

  const legacyRoot = path.join(tempRoot, "legacy");
  rmSync(legacyRoot, { recursive: true, force: true });
  mkdirSync(legacyRoot, { recursive: true });
  prepareFixture(legacyRoot);
  const legacyPlan = buildAutoresearchAutoplan({
    cwd: legacyRoot,
    objective: objectiveA,
    ...contract,
  });
  appendReceipt(
    legacyRoot,
    createConfigReceipt({
      name: legacyPlan.config.name,
      metricName,
      metricUnit: "blocker(s)",
      direction: "lower",
      metricThreshold: 0,
      benchmarkCommand: "node bench.mjs",
      checksCommand: "node check.mjs",
    }),
  );
  try {
    await executeAutoresearchCampaignStart({
      cwd: legacyRoot,
      objective: objectiveA,
      runMode: "baseline",
      maxIterations: 1,
      peerMode: "off",
      ...contract,
    });
    addBlocker("legacy_identity_was_not_fail_closed");
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    if (!message.includes("legacy_missing") || !message.includes("objectiveDigest")) {
      addBlocker("legacy_identity_rejection_was_ambiguous", { message });
    }
  }
  if (readCounter(legacyRoot) !== 0) addBlocker("legacy_rejection_ran_benchmark");
  if (loadReceiptLog(legacyRoot).entries.length !== 1)
    addBlocker("legacy_rejection_mutated_receipts");

  console.log("CAMPAIGN START IDENTITY CHECKPOINTS");
  console.log("1. baseline generated a continuation with the full effective measurement contract");
  console.log("2. exact continuation reused one segment and preserved the full peer objective");
  console.log(
    "3. colliding long objective slugs were separated by objective digest before effects",
  );
  console.log(
    "4. legacy identity-free segments failed closed before benchmark or receipt mutation",
  );
  console.log(`METRIC unresolved_campaign_start_identity_blockers=${blockers.length}`);
  if (blockers.length > 0) {
    console.log(`BLOCKERS ${JSON.stringify(blockers, null, 2)}`);
    process.exitCode = 1;
  }
} catch (error) {
  console.log("CAMPAIGN START IDENTITY CHECKPOINTS");
  console.log(`dogfood threw: ${error instanceof Error ? error.stack : String(error)}`);
  console.log("METRIC unresolved_campaign_start_identity_blockers=1");
  process.exitCode = 1;
} finally {
  if (shouldCleanup) rmSync(tempRoot, { recursive: true, force: true });
}

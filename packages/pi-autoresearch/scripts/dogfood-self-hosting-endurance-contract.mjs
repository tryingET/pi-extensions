#!/usr/bin/env node
// Supervised self-hosting endurance dogfood contract.
// Runs one isolated start_and_watch-shaped wave against the package core and verifies progress,
// evaluator snapshot safety, record-only promotion/rollback truth, and no AK/KES/orchestrator writes.
import { execFileSync } from "node:child_process";
import { createHash } from "node:crypto";
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import os from "node:os";
import path from "node:path";

import {
  AUTORESEARCH_SELF_HOSTING_PROMOTION_RECORD_FILE,
  classifyAutoresearchSelfHostingApplicability,
  executeAutoresearchSelfHostingCandidateSubprocess,
  executeAutoresearchSelfHostingEvaluatorSuite,
  loadAutoresearchSelfHostingPromotionRecord,
  prepareAutoresearchSelfHostingCandidateWorktree,
  prepareAutoresearchSelfHostingPromotionRecord,
  recordAutoresearchSelfHostingRollback,
  resolveAutoresearchSelfHostingEvaluatorLockPath,
} from "../src/core/selfHosting.ts";

const strictDefault = process.env.DOGFOOD_CONTRACT_STRICT ?? "1";
const tempRoot = process.env.PI_AUTORESEARCH_SELF_HOSTING_DOGFOOD_ROOT
  ? path.resolve(process.env.PI_AUTORESEARCH_SELF_HOSTING_DOGFOOD_ROOT)
  : mkdtempSync(path.join(os.tmpdir(), "autoresearch-self-hosting-endurance-"));
const shouldCleanup = !process.env.PI_AUTORESEARCH_SELF_HOSTING_DOGFOOD_ROOT;
const controller = path.join(tempRoot, "controller");
const blockers = [];

function addBlocker(id, details = undefined) {
  blockers.push(details === undefined ? id : `${id}:${JSON.stringify(details)}`);
}

function git(cwd, args) {
  return execFileSync("git", args, {
    cwd,
    encoding: "utf8",
    stdio: ["ignore", "pipe", "pipe"],
  }).trim();
}

function sha256(value) {
  return createHash("sha256").update(value).digest("hex");
}

function fileSha256(target) {
  return sha256(readFileSync(target));
}

function writeFile(target, content) {
  mkdirSync(path.dirname(target), { recursive: true });
  writeFileSync(target, content, "utf8");
}

function writeJson(target, payload) {
  writeFile(target, `${JSON.stringify(payload, null, 2)}\n`);
}

function createSnapshotSuiteScript(source) {
  return [
    "const args = process.argv.slice(2);",
    "const candidateIndex = args.indexOf('--candidate');",
    "const candidate = candidateIndex >= 0 ? args[candidateIndex + 1] : null;",
    "process.stdout.write(JSON.stringify({",
    `  source: ${JSON.stringify(source)},`,
    "  cwd: process.cwd(),",
    "  candidate,",
    "}));",
    "",
  ].join("\n");
}

function snapshotForbiddenOwnerSurfaces() {
  const entries = [
    ".ak",
    ".kes",
    ".beads",
    ".autoresearch",
    "AK",
    "KES",
    "docs/learnings",
    "docs/kes",
    "orchestrator-evidence.json",
    "autoresearch.ak_evidence.json",
    "autoresearch.learning.json",
  ];
  return Object.fromEntries(
    entries.map((entry) => [entry, existsSync(path.join(controller, entry))]),
  );
}

function initRepo() {
  mkdirSync(controller, { recursive: true });
  git(controller, ["init", "-b", "main"]);
  git(controller, ["config", "user.name", "Pi Autoresearch Dogfood"]);
  git(controller, ["config", "user.email", "pi-autoresearch@example.invalid"]);
  writeFile(path.join(controller, "README.md"), "# self-hosting endurance dogfood\n");
  writeFile(
    path.join(controller, "packages/pi-autoresearch/package.json"),
    `${JSON.stringify(
      {
        name: "self-hosting-endurance-fixture",
        private: true,
        type: "module",
        scripts: { check: "node packages/pi-autoresearch/tests/package-script-marker.mjs" },
      },
      null,
      2,
    )}\n`,
  );
  writeFile(
    path.join(controller, "packages/pi-autoresearch/src/runtime.ts"),
    "export const runtime = 'base';\n",
  );
  writeFile(
    path.join(controller, "packages/pi-autoresearch/tests/emit-pid.mjs"),
    [
      "const payload = {",
      "  pid: process.pid,",
      "  cwd: process.cwd(),",
      "  controllerCwd: process.env.PI_AUTORESEARCH_SELF_HOSTING_CONTROLLER_CWD ?? null,",
      "  candidateCwd: process.env.PI_AUTORESEARCH_SELF_HOSTING_CANDIDATE_CWD ?? null,",
      "  campaignId: process.env.PI_AUTORESEARCH_SELF_HOSTING_CAMPAIGN_ID ?? null,",
      "};",
      "process.stdout.write(JSON.stringify(payload));",
      "",
    ].join("\n"),
  );
  writeFile(
    path.join(controller, "packages/pi-autoresearch/tests/package-script-marker.mjs"),
    [
      "import { writeFileSync } from 'node:fs';",
      "writeFileSync('package-script-ran.flag', 'candidate package-manager script executed\\n', 'utf8');",
      "process.exitCode = 99;",
      "",
    ].join("\n"),
  );
  writeFile(
    path.join(controller, "evaluator-snapshot/manifest.json"),
    `${JSON.stringify(
      {
        kind: "fixture_manifest",
        suites: ["dev-smoke", "holdout-operator", "transfer-package", "transfer-operator"],
      },
      null,
      2,
    )}\n`,
  );
  for (const [suiteId, source] of [
    ["dev-smoke", "snapshot-dev-smoke"],
    ["holdout-operator", "snapshot-holdout-operator"],
    ["transfer-package", "snapshot-transfer-package"],
    ["transfer-operator", "snapshot-transfer-operator"],
  ]) {
    writeFile(
      path.join(controller, "evaluator-snapshot/suites", `${suiteId}.mjs`),
      createSnapshotSuiteScript(source),
    );
  }
  git(controller, ["add", "."]);
  git(controller, ["commit", "-m", "baseline self-hosting endurance fixture"]);
}

function createContract() {
  return {
    type: "self_hosting_contract",
    version: 1,
    campaignId: "self-hosting-endurance-wave-001",
    controller: {
      mode: "stable_installed",
      ref: "pi-autoresearch@stable",
      controllerCwd: controller,
      executionModel: "controller_subprocess_against_candidate",
    },
    candidate: {
      worktreePath: path.join(tempRoot, "candidate-worktree"),
      baseRef: "main",
      branchName: "autoresearch/self-hosting-endurance-wave-001",
      allowedPaths: [
        "packages/pi-autoresearch/src/**",
        "packages/pi-autoresearch/tests/**",
        "packages/pi-autoresearch/docs/project/**",
      ],
      offLimits: [
        "autoresearch.self-hosting.json",
        "autoresearch.self-hosting.evaluator.lock.json",
        "autoresearch.self-hosting.promotion.json",
        "evaluator-snapshot/**",
      ],
      onFailureDisposition: "preserve_for_review",
    },
    evaluator: {
      lockPath: path.join("artifacts", "autoresearch.self-hosting.evaluator.lock.json"),
      manifestPath: "evaluator-snapshot/manifest.json",
      manifestHash: fileSha256(path.join(controller, "evaluator-snapshot/manifest.json")),
      snapshotRootPath: "evaluator-snapshot",
      criticalSuites: ["dev-smoke", "holdout-operator", "transfer-package", "transfer-operator"],
      devSuites: ["dev-smoke"],
      holdoutSuites: ["holdout-operator"],
      transferSuites: ["transfer-package", "transfer-operator"],
      candidateMayEditEvaluator: false,
    },
    applicability: {
      primaryMetric: {
        name: "median_latency_ms",
        direction: "lower",
        minImprovementForDefaultPromotionPercent: 5,
      },
      variantTargetProfile: null,
      maxCriticalSuiteFailures: 0,
      maxHoldoutCriticalFailures: 0,
      maxTransferCriticalFailures: 0,
      maxNonCriticalTransferRegressionPercent: 2,
      minimumDefaultPromotionTransferScope: {
        minimumSuites: 2,
        requiredCoverageKinds: ["package_non_self_hosting", "operator_consumer"],
      },
    },
    promotion: {
      packageMaySelfPromote: false,
      requiredApprovals: ["operator_review"],
      promotionRecordPath: AUTORESEARCH_SELF_HOSTING_PROMOTION_RECORD_FILE,
      rollbackControllerRef: "pi-autoresearch@stable",
    },
  };
}

function createEvaluatorLock(contract) {
  const suite = (suiteId, suiteClass, coverageKind, kind, argv = ["--candidate", "$CANDIDATE"]) => {
    const entrypoint = `suites/${suiteId}.mjs`;
    return {
      id: suiteId,
      class: suiteClass,
      critical: true,
      coverageKind,
      entrypoint: {
        kind,
        path: entrypoint,
        sha256: fileSha256(path.join(controller, "evaluator-snapshot", entrypoint)),
      },
      subjectCwdMode: "candidate",
      argv,
    };
  };
  const suites = [
    suite("dev-smoke", "dev", "self_hosting_internal", "snapshot_node_module"),
    suite("holdout-operator", "holdout", "operator_consumer", "snapshot_node_module"),
    suite("transfer-package", "transfer", "package_non_self_hosting", "snapshot_script", [
      "--candidate",
      "$CANDIDATE",
      "--mode",
      "package",
    ]),
    suite("transfer-operator", "transfer", "operator_consumer", "snapshot_script", [
      "--candidate",
      "$CANDIDATE",
      "--mode",
      "operator",
    ]),
  ];
  return {
    type: "self_hosting_evaluator_lock",
    version: 1,
    campaignId: contract.campaignId,
    snapshotRootPath: contract.evaluator.snapshotRootPath,
    manifestPath: contract.evaluator.manifestPath,
    manifestHash: contract.evaluator.manifestHash,
    executionModel: contract.controller.executionModel,
    evaluatorFiles: suites.map((entry) => ({
      path: entry.entrypoint.path,
      sha256: entry.entrypoint.sha256,
    })),
    suites,
  };
}

function writeArtifacts() {
  const contract = createContract();
  const evaluatorLock = createEvaluatorLock(contract);
  writeJson(path.join(controller, "autoresearch.self-hosting.json"), contract);
  writeJson(
    resolveAutoresearchSelfHostingEvaluatorLockPath(controller, contract.evaluator.lockPath),
    evaluatorLock,
  );
  git(controller, ["add", "autoresearch.self-hosting.json", contract.evaluator.lockPath]);
  git(controller, ["commit", "-m", "add self-hosting endurance artifacts"]);
  return { contract, evaluatorLock };
}

function emit(updates, phase, details = {}) {
  updates.push({ details: { phase, ...details } });
}

function runStartAndWatchWave({ contract, evaluatorLock }) {
  const updates = [];
  emit(updates, "loading_artifacts", { cwd: controller });
  emit(updates, "prepare_candidate", {
    cwd: controller,
    candidateWorktree: contract.candidate.worktreePath,
  });
  const prepareCandidate = prepareAutoresearchSelfHostingCandidateWorktree({
    cwd: controller,
    apply: true,
  });
  emit(updates, "prepare_candidate_complete", {
    cwd: controller,
    registered: prepareCandidate.candidate.registered,
    candidateWorktree: prepareCandidate.candidate.worktreePath,
  });

  const candidateCommand = ["node", "packages/pi-autoresearch/tests/emit-pid.mjs"];
  emit(updates, "candidate_subprocess_start", { cwd: controller, command: candidateCommand });
  const candidateRun = executeAutoresearchSelfHostingCandidateSubprocess({
    cwd: controller,
    command: candidateCommand,
    timeoutMs: 120000,
  });
  emit(updates, "candidate_subprocess_complete", {
    cwd: controller,
    command: candidateRun.command.command,
    exitCode: candidateRun.command.exitCode,
  });

  const suiteResults = evaluatorLock.suites.map((suiteEntry) => {
    emit(updates, "locked_suite_start", { cwd: controller, suiteId: suiteEntry.id });
    const result = executeAutoresearchSelfHostingEvaluatorSuite({
      cwd: controller,
      suiteId: suiteEntry.id,
      timeoutMs: 120000,
    });
    emit(updates, "locked_suite_complete", {
      cwd: controller,
      suiteId: suiteEntry.id,
      exitCode: result.command.exitCode,
    });
    return result;
  });

  emit(updates, "classify_applicability", { cwd: controller });
  const classification = classifyAutoresearchSelfHostingApplicability({
    cwd: controller,
    suiteOutcomes: suiteResults.map((result) => ({
      suiteId: result.resolvedSuite.suiteId,
      passed: result.command.exitCode === 0,
    })),
    primaryMetric: { baseline: 100, candidate: 90 },
  });
  emit(updates, "classification_complete", { cwd: controller, outcome: classification.outcome });

  emit(updates, "promotion_record_start", { cwd: controller });
  const promotion = prepareAutoresearchSelfHostingPromotionRecord({
    cwd: controller,
    classification,
    approvedBy: ["operator_review"],
    approvedAt: 1,
    evidenceRefs: ["dogfood:self-hosting-endurance-wave"],
    status: "rotated",
    apply: true,
  });
  emit(updates, "promotion_record_complete", { cwd: controller, status: promotion.record.status });
  emit(updates, "wave_complete", { cwd: controller, nextStep: promotion.nextStep });

  return { updates, prepareCandidate, candidateRun, suiteResults, classification, promotion };
}

try {
  initRepo();
  const { contract, evaluatorLock } = writeArtifacts();
  const controllerHeadBefore = git(controller, ["rev-parse", "HEAD"]);
  const controllerBranchBefore = git(controller, ["branch", "--show-current"]);
  const forbiddenBefore = snapshotForbiddenOwnerSurfaces();
  const lockedHashesBefore = Object.fromEntries(
    evaluatorLock.evaluatorFiles.map((entry) => [
      entry.path,
      fileSha256(path.join(controller, "evaluator-snapshot", entry.path)),
    ]),
  );

  const wave = runStartAndWatchWave({ contract, evaluatorLock });
  const candidate = contract.candidate.worktreePath;
  const requiredPhases = [
    "loading_artifacts",
    "prepare_candidate",
    "prepare_candidate_complete",
    "candidate_subprocess_start",
    "candidate_subprocess_complete",
    "locked_suite_start",
    "locked_suite_complete",
    "classify_applicability",
    "classification_complete",
    "promotion_record_start",
    "promotion_record_complete",
    "wave_complete",
  ];
  for (const phase of requiredPhases) {
    if (!wave.updates.some((update) => update.details.phase === phase))
      addBlocker("missing_start_and_watch_phase", phase);
  }
  if (wave.updates.at(-1)?.details.phase !== "wave_complete") {
    addBlocker("last_update_not_wave_complete", wave.updates.at(-1)?.details.phase);
  }
  const suiteStartCount = wave.updates.filter(
    (update) => update.details.phase === "locked_suite_start",
  ).length;
  const suiteCompleteCount = wave.updates.filter(
    (update) => update.details.phase === "locked_suite_complete",
  ).length;
  if (
    suiteStartCount !== evaluatorLock.suites.length ||
    suiteCompleteCount !== evaluatorLock.suites.length
  ) {
    addBlocker("locked_suite_progress_count_mismatch", { suiteStartCount, suiteCompleteCount });
  }

  if (wave.classification.outcome !== "default_promotion_candidate") {
    addBlocker("classification_not_default_promotion_candidate", wave.classification.outcome);
  }
  if (wave.promotion.record.status !== "rotated")
    addBlocker("promotion_record_not_rotated", wave.promotion.record.status);
  if (wave.promotion.record.approvedAt !== 1)
    addBlocker("promotion_record_approved_at_not_deterministic", wave.promotion.record.approvedAt);
  if (wave.promotion.record.rollbackControllerRef !== "pi-autoresearch@stable") {
    addBlocker(
      "promotion_record_wrong_rollback_controller",
      wave.promotion.record.rollbackControllerRef,
    );
  }
  if (contract.promotion.packageMaySelfPromote !== false)
    addBlocker("contract_allows_package_self_promotion");

  const candidateHead = git(candidate, ["rev-parse", "HEAD"]);
  if (wave.promotion.record.promotedCandidateRef !== candidateHead) {
    addBlocker("promotion_record_not_bound_to_candidate_head", {
      record: wave.promotion.record.promotedCandidateRef,
      candidateHead,
    });
  }
  const controllerHeadAfterWave = git(controller, ["rev-parse", "HEAD"]);
  const controllerBranchAfterWave = git(controller, ["branch", "--show-current"]);
  if (
    controllerHeadAfterWave !== controllerHeadBefore ||
    controllerBranchAfterWave !== controllerBranchBefore
  ) {
    addBlocker("controller_branch_or_head_mutated_by_wave", {
      before: { controllerHeadBefore, controllerBranchBefore },
      after: { controllerHeadAfterWave, controllerBranchAfterWave },
    });
  }

  const candidateRunPayload = JSON.parse(wave.candidateRun.command.stdout || "{}");
  if (candidateRunPayload.cwd !== candidate || candidateRunPayload.controllerCwd !== controller) {
    addBlocker("candidate_subprocess_not_isolated", candidateRunPayload);
  }

  for (const suiteResult of wave.suiteResults) {
    const suiteId = suiteResult.resolvedSuite.suiteId;
    const entrypointPath = suiteResult.resolvedSuite.entrypointPath;
    const command = suiteResult.command.command;
    if (!entrypointPath.startsWith(`${path.join(controller, "evaluator-snapshot")}${path.sep}`)) {
      addBlocker("suite_entrypoint_not_controller_snapshot", { suiteId, entrypointPath });
    }
    if (suiteResult.command.cwd !== candidate)
      addBlocker("suite_cwd_not_candidate", { suiteId, cwd: suiteResult.command.cwd });
    if (command[0] !== process.execPath)
      addBlocker("suite_command_not_node_execpath", { suiteId, command });
    if (command.some((part) => ["npm", "pnpm", "yarn"].includes(part))) {
      addBlocker("suite_command_used_package_manager", { suiteId, command });
    }
    const payload = JSON.parse(suiteResult.command.stdout || "{}");
    if (!String(payload.source ?? "").startsWith("snapshot-"))
      addBlocker("suite_stdout_not_snapshot_owned", { suiteId, payload });
    if (payload.cwd !== candidate || payload.candidate !== candidate)
      addBlocker("suite_payload_not_candidate_scoped", { suiteId, payload });
    if (suiteResult.scope.ok !== true || suiteResult.postCommandScope.ok !== true) {
      addBlocker("suite_scope_not_clean", {
        suiteId,
        scope: suiteResult.scope,
        postCommandScope: suiteResult.postCommandScope,
      });
    }
  }
  if (existsSync(path.join(candidate, "package-script-ran.flag")))
    addBlocker("candidate_package_manager_script_was_executed");

  const lockedHashesAfterWave = Object.fromEntries(
    evaluatorLock.evaluatorFiles.map((entry) => [
      entry.path,
      fileSha256(path.join(controller, "evaluator-snapshot", entry.path)),
    ]),
  );
  if (JSON.stringify(lockedHashesBefore) !== JSON.stringify(lockedHashesAfterWave)) {
    addBlocker("locked_evaluator_hashes_drifted", { lockedHashesBefore, lockedHashesAfterWave });
  }

  const loadedRotated = loadAutoresearchSelfHostingPromotionRecord(controller);
  if (loadedRotated.status !== "rotated")
    addBlocker("loaded_promotion_record_not_rotated", loadedRotated.status);

  const rollback = recordAutoresearchSelfHostingRollback({
    cwd: controller,
    rollbackReason: "dogfood post-rotation verification requested rollback truth",
    rolledBackAt: 2,
    evidenceRefs: ["dogfood:self-hosting-endurance-rollback"],
    apply: true,
  });
  if (rollback.previousRecord.status !== "rotated" || rollback.record.status !== "rolled_back") {
    addBlocker("rollback_state_transition_not_truthful", {
      previous: rollback.previousRecord.status,
      next: rollback.record.status,
    });
  }
  if (
    rollback.record.rollbackReason !== "dogfood post-rotation verification requested rollback truth"
  ) {
    addBlocker("rollback_reason_not_recorded", rollback.record.rollbackReason);
  }
  if (rollback.record.rolledBackAt !== 2)
    addBlocker("rollback_timestamp_not_deterministic", rollback.record.rolledBackAt);
  if (
    !rollback.record.evidenceRefs.includes("dogfood:self-hosting-endurance-wave") ||
    !rollback.record.evidenceRefs.includes("dogfood:self-hosting-endurance-rollback")
  ) {
    addBlocker("rollback_evidence_refs_not_accumulated", rollback.record.evidenceRefs);
  }
  if (!rollback.nextStep.includes("restore controller")) {
    addBlocker("rollback_next_step_missing_external_restore_boundary", rollback.nextStep);
  }
  const loadedRollback = loadAutoresearchSelfHostingPromotionRecord(controller);
  if (loadedRollback.status !== "rolled_back")
    addBlocker("loaded_rollback_record_not_rolled_back", loadedRollback.status);

  const controllerHeadAfterRollback = git(controller, ["rev-parse", "HEAD"]);
  const controllerBranchAfterRollback = git(controller, ["branch", "--show-current"]);
  if (
    controllerHeadAfterRollback !== controllerHeadBefore ||
    controllerBranchAfterRollback !== controllerBranchBefore
  ) {
    addBlocker("controller_branch_or_head_mutated_by_rollback", {
      before: { controllerHeadBefore, controllerBranchBefore },
      after: { controllerHeadAfterRollback, controllerBranchAfterRollback },
    });
  }
  const forbiddenAfter = snapshotForbiddenOwnerSurfaces();
  if (JSON.stringify(forbiddenBefore) !== JSON.stringify(forbiddenAfter)) {
    addBlocker("orchestrator_ak_kes_surface_mutated", { forbiddenBefore, forbiddenAfter });
  }

  const ok = blockers.length === 0;
  console.log("SELF-HOSTING ENDURANCE CHECKPOINTS");
  console.log(
    `1. start_and_watch progress phases: ${wave.updates.map((update) => update.details.phase).join(" -> ")}`,
  );
  console.log(
    `2. evaluator safety: ${
      JSON.stringify(lockedHashesBefore) === JSON.stringify(lockedHashesAfterWave)
        ? "locked snapshot hashes stable"
        : "locked snapshot hash drift"
    }`,
  );
  console.log(
    `3. promotion boundary: record status ${wave.promotion.record.status}, controller branch/head unchanged by package`,
  );
  console.log(`4. rollback truth: ${rollback.previousRecord.status} -> ${rollback.record.status}`);
  console.log("5. owner surfaces: AK/KES/orchestrator markers unchanged");
  console.log(
    `CONTRACT ${ok ? "ok" : "fail"} self-hosting-endurance: one bounded start_and_watch wave plus record-only rollback stayed inside the isolated fixture`,
  );
  console.log(`METRIC unresolved_self_hosting_safety_blockers=${blockers.length}`);
  console.log(
    JSON.stringify(
      {
        blockers,
        progressPhases: wave.updates.map((update) => update.details.phase),
        classification: wave.classification.outcome,
        promotionStatus: wave.promotion.record.status,
        rollbackStatus: rollback.record.status,
        suiteCount: wave.suiteResults.length,
        controllerHeadUnchanged:
          controllerHeadAfterWave === controllerHeadBefore &&
          controllerHeadAfterRollback === controllerHeadBefore,
        forbiddenOwnerSurfacesUnchanged:
          JSON.stringify(forbiddenBefore) === JSON.stringify(forbiddenAfter),
      },
      null,
      2,
    ),
  );
} catch (error) {
  addBlocker("exception", error instanceof Error ? error.message : String(error));
  console.log(`CONTRACT fail self-hosting-endurance-exception: ${blockers.at(-1)}`);
  console.log(`METRIC unresolved_self_hosting_safety_blockers=${blockers.length}`);
  console.log(JSON.stringify({ blockers }, null, 2));
  process.exitCode = 1;
} finally {
  if (shouldCleanup) rmSync(tempRoot, { recursive: true, force: true });
}

if (strictDefault !== "0" && blockers.length > 0) process.exitCode = 1;

#!/usr/bin/env node
// summary: Verifies one isolated self-hosting wave, locked evaluator safety, and record-only rollback truth.
// read_when:
//   - Testing supervised self-hosting progress, promotion records, rollback, or owner-surface isolation.
// Supervised self-hosting endurance dogfood contract.
// Runs one isolated start_and_watch-shaped wave against the package core and verifies progress,
// evaluator snapshot safety, record-only promotion/rollback truth, and no AK/KES/orchestrator writes.
import { execFileSync } from "node:child_process";
import { existsSync, mkdtempSync, rmSync } from "node:fs";
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
import {
  createSelfHostingEnduranceArtifacts,
  fileSha256,
  initSelfHostingEnduranceRepo,
} from "./dogfood-self-hosting-endurance-fixture.mjs";

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
  initSelfHostingEnduranceRepo({ controller, git });
  const { contract, evaluatorLock } = createSelfHostingEnduranceArtifacts({
    controller,
    tempRoot,
    git,
    promotionRecordFile: AUTORESEARCH_SELF_HOSTING_PROMOTION_RECORD_FILE,
    resolveEvaluatorLockPath: resolveAutoresearchSelfHostingEvaluatorLockPath,
  });
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

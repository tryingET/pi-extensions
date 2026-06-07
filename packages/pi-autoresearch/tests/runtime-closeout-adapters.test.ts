import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import os from "node:os";
import path from "node:path";
import test from "node:test";

import {
  AUTORESEARCH_CANDIDATE_RESULT_EXPORT_FILE,
  AUTORESEARCH_CANDIDATE_WAVE_RESULT_EXPORT_DIR,
  AUTORESEARCH_LEARNING_EXPORT_FILE,
  AUTORESEARCH_ORACLE_EVIDENCE_EXPORT_FILE,
  appendReceipt,
  buildAutoresearchAdapterContractCatalog,
  buildAutoresearchAkEvidencePacket,
  buildAutoresearchCandidateDecisionWorkbench,
  buildAutoresearchCandidateResultPacket,
  buildAutoresearchKnowledgeExportPacket,
  buildAutoresearchOracleEvidencePacket,
  buildAutoresearchRuntimeStatus,
  buildAutoresearchSegmentCloseout,
  createConfigReceipt,
  createRunReceipt,
  formatAutoresearchAdapterContractCatalog,
  formatAutoresearchAdapterPacketValidationResult,
  formatAutoresearchAkEvidencePacket,
  formatAutoresearchCandidateDecisionDashboardSummary,
  formatAutoresearchCandidateDecisionWorkbench,
  formatAutoresearchCandidateResultExportResult,
  formatAutoresearchCandidateResultPacket,
  formatAutoresearchKnowledgeExportPacket,
  formatAutoresearchLearningExportResult,
  formatAutoresearchOracleEvidenceExportResult,
  formatAutoresearchOracleEvidencePacket,
  formatAutoresearchSegmentCloseout,
  formatAutoresearchStatusText,
  validateAutoresearchAdapterPacket,
  writeAutoresearchCandidateResultPacket,
  writeAutoresearchKnowledgeExportPacket,
  writeAutoresearchOracleEvidencePacket,
} from "../src/core/runtime.ts";

async function withTempDir(fn: (cwd: string) => Promise<void> | void): Promise<void> {
  const cwd = mkdtempSync(path.join(os.tmpdir(), "pi-autoresearch-runtime-"));
  try {
    await fn(cwd);
  } finally {
    rmSync(cwd, { recursive: true, force: true });
  }
}

test("segment closeout summarizes empirical decisions and candidate bindings", () =>
  withTempDir((cwd) => {
    appendReceipt(
      cwd,
      createConfigReceipt({
        name: "widget-speed-closeout",
        metricName: "total_ms",
        metricUnit: "ms",
        direction: "lower",
        createdAt: 1,
        benchmarkCommand: "bash autoresearch.sh",
      }),
    );
    appendReceipt(
      cwd,
      createRunReceipt({
        status: "baseline",
        metric: 100,
        description: "baseline",
        timestamp: 2,
      }),
    );
    appendReceipt(
      cwd,
      createRunReceipt({
        status: "candidate",
        empiricalDecisionClass: "candidate_improvement",
        metric: 80,
        description: "candidate peer patch",
        timestamp: 3,
        experiment: {
          hypothesisId: "H-closeout-001",
          hypothesis: "A visible candidate peer patch reduces runtime.",
          interventionSummary: "evaluate candidate peer patch",
          expectedPrimaryEffect: "lower total_ms",
          targetFiles: ["src/core/runtime.ts"],
          risk: "timing benchmark may be noisy",
          candidate: {
            source: "candidate_peer_spawn",
            worktreePath: "/tmp/candidate-closeout",
            branch: "candidate/closeout",
            baseRef: "main",
            diffSummary: "reduce runtime overhead",
            filesChanged: ["src/core/runtime.ts"],
          },
        },
      }),
    );

    const closeout = buildAutoresearchSegmentCloseout(cwd);
    assert.equal(closeout.packetKind, "autoresearch.closeout.v1");
    assert.equal(closeout.adapterContractVersion, 1);
    assert.ok(closeout.targetKinds.includes("evidence"));
    assert.equal(closeout.campaign, "widget-speed-closeout");
    assert.equal(closeout.runCount, 2);
    assert.equal(closeout.candidateBindings.length, 1);
    assert.equal(closeout.oracleReadyEvidence.recordCount, 2);
    assert.equal(closeout.oracleReadyEvidence.preflightStatus, "ready_for_dspx_owner_review");
    assert.equal(closeout.oracleReadyEvidence.target, "dspx_oracle_postgres_pgvector");
    assert.equal(closeout.empiricalPosture.classification, "under_sampled");
    assert.equal(closeout.empiricalPosture.promotionReady, false);
    assert.equal(closeout.candidateBindings[0]?.branch, "candidate/closeout");
    assert.equal(closeout.runs.at(-1)?.empiricalDecisionClass, "candidate_improvement");
    assert.match(formatAutoresearchSegmentCloseout(closeout), /SEGMENT CLOSEOUT/);
    assert.match(
      formatAutoresearchSegmentCloseout(closeout),
      /candidate branch: candidate\/closeout/,
    );
    assert.match(
      formatAutoresearchSegmentCloseout(closeout),
      /packet kind: autoresearch\.closeout\.v1/,
    );
    assert.match(formatAutoresearchSegmentCloseout(closeout), /adapter boundary:/);
    assert.match(formatAutoresearchSegmentCloseout(closeout), /empirical posture: under_sampled/);
    assert.match(formatAutoresearchSegmentCloseout(closeout), /Oracle-ready evidence records: 2/);

    const oracleEvidence = buildAutoresearchOracleEvidencePacket(cwd);
    assert.equal(oracleEvidence.packetKind, "autoresearch.oracle_evidence.v1");
    assert.equal(oracleEvidence.adapterContractVersion, 1);
    assert.ok(oracleEvidence.targetKinds.includes("dspx_oracle"));
    assert.equal(oracleEvidence.records.length, 2);
    assert.equal(oracleEvidence.records[1]?.hypothesisId, "H-closeout-001");
    assert.equal(oracleEvidence.records[1]?.candidate?.branch, "candidate/closeout");
    assert.equal(oracleEvidence.records[1]?.nonAuthority, true);
    assert.equal(oracleEvidence.publicationPreflight.sharedOracleMutated, false);
    assert.equal(oracleEvidence.publicationPreflight.localCoordinatesDbMigrated, false);
    assert.equal(oracleEvidence.publicationPreflight.canonicalAuthorityMutated, false);
    assert.match(formatAutoresearchOracleEvidencePacket(oracleEvidence), /ORACLE-READY EVIDENCE/);
    assert.match(
      formatAutoresearchOracleEvidencePacket(oracleEvidence),
      /shared Oracle mutated: no/,
    );
    assert.match(
      oracleEvidence.publicationPreflight.suggestedDspxPreflightCommandTemplate,
      /'dspx' 'oracle' 'autoresearch-evidence' 'publish-preflight'/u,
    );

    const exportedOracleEvidence = writeAutoresearchOracleEvidencePacket({ cwd });
    assert.equal(exportedOracleEvidence.exportKind, "autoresearch.oracle_evidence_export.v1");
    assert.equal(exportedOracleEvidence.packet.records.length, 2);
    assert.ok(exportedOracleEvidence.path.endsWith(AUTORESEARCH_ORACLE_EVIDENCE_EXPORT_FILE));
    assert.equal(
      exportedOracleEvidence.path,
      path.join(cwd, AUTORESEARCH_ORACLE_EVIDENCE_EXPORT_FILE),
    );
    assert.equal(exportedOracleEvidence.effect.sharedOracleMutated, false);
    assert.equal(exportedOracleEvidence.effect.localCoordinatesDbMigrated, false);
    assert.equal(exportedOracleEvidence.effect.canonicalAuthorityMutated, false);
    assert.match(
      exportedOracleEvidence.suggestedDspxPreflightCommand,
      /'dspx' 'oracle' 'autoresearch-evidence' 'publish-preflight'/u,
    );
    assert.ok(
      exportedOracleEvidence.suggestedDspxPreflightArgv.includes(exportedOracleEvidence.path),
    );
    assert.match(
      formatAutoresearchOracleEvidenceExportResult(exportedOracleEvidence),
      /ORACLE EVIDENCE EXPORT/u,
    );
    const exportedPayload = JSON.parse(readFileSync(exportedOracleEvidence.path, "utf8"));
    assert.equal(exportedPayload.packetKind, "autoresearch.oracle_evidence.v1");
    assert.equal(exportedPayload.records.length, 2);
    assert.throws(
      () => writeAutoresearchOracleEvidencePacket({ cwd }),
      /already exists; pass overwrite=true/u,
    );
    assert.doesNotThrow(() => writeAutoresearchOracleEvidencePacket({ cwd, overwrite: true }));
    assert.throws(
      () => writeAutoresearchOracleEvidencePacket({ cwd, outPath: "/tmp/oracle.json" }),
      /must be relative/u,
    );
    assert.throws(
      () => writeAutoresearchOracleEvidencePacket({ cwd, outPath: "../oracle.json" }),
      /must stay inside/u,
    );
    const weirdExport = writeAutoresearchOracleEvidencePacket({
      cwd,
      outPath: "safe-$(not-executed).json",
    });
    assert.match(weirdExport.suggestedDspxPreflightCommand, /'[^']*\$\(not-executed\)\.json'/u);

    const evidence = buildAutoresearchAkEvidencePacket({ cwd, taskId: 1234 });
    assert.equal(evidence.packetKind, "autoresearch.ak_evidence.v1");
    assert.equal(evidence.adapterContractVersion, 1);
    assert.ok(evidence.targetKinds.includes("ak"));
    assert.equal(evidence.taskId, 1234);
    assert.equal(evidence.checkType, "autoresearch:segment_closeout");
    assert.match(evidence.result, /empirical_decision=insufficient_samples/);
    assert.match(evidence.suggestedToolCall, /evidence_record/);
    assert.match(formatAutoresearchAkEvidencePacket(evidence), /AK EVIDENCE PACKET/);
    assert.match(
      formatAutoresearchAkEvidencePacket(evidence),
      /packet kind: autoresearch\.ak_evidence\.v1/,
    );
    assert.match(formatAutoresearchAkEvidencePacket(evidence), /task id: 1234/);

    const candidateResult = buildAutoresearchCandidateResultPacket(cwd);
    assert.equal(candidateResult.packetKind, "autoresearch.candidate_result.v1");
    assert.equal(candidateResult.candidate?.branch, "candidate/closeout");
    assert.equal(candidateResult.candidateRun?.empiricalDecisionClass, "candidate_improvement");
    assert.match(
      formatAutoresearchCandidateResultPacket(candidateResult),
      /CANDIDATE RESULT PACKET/,
    );

    const candidateResultExport = writeAutoresearchCandidateResultPacket({ cwd });
    assert.equal(candidateResultExport.exportKind, "autoresearch.candidate_result_export.v1");
    assert.equal(candidateResultExport.packet.packetKind, "autoresearch.candidate_result.v1");
    assert.equal(
      candidateResultExport.path,
      path.join(cwd, AUTORESEARCH_CANDIDATE_RESULT_EXPORT_FILE),
    );
    assert.equal(candidateResultExport.effect.candidateLifecycleMutated, false);
    assert.equal(candidateResultExport.effect.worktreeMutated, false);
    assert.equal(candidateResultExport.effect.akCalled, false);
    assert.equal(candidateResultExport.effect.kesWritten, false);
    assert.equal(candidateResultExport.effect.promotionStateChanged, false);
    assert.match(candidateResultExport.suggestedReviewCall, /review_candidate_wave/);
    assert.equal(candidateResultExport.suggestedAggregateReviewCall, null);
    assert.match(
      formatAutoresearchCandidateResultExportResult(candidateResultExport),
      /CANDIDATE RESULT EXPORT/,
    );
    const candidateWaveExport = writeAutoresearchCandidateResultPacket({
      cwd,
      outPath: `${AUTORESEARCH_CANDIDATE_WAVE_RESULT_EXPORT_DIR}/candidate-01.candidate-result.json`,
    });
    assert.equal(
      candidateWaveExport.path,
      path.join(
        cwd,
        AUTORESEARCH_CANDIDATE_WAVE_RESULT_EXPORT_DIR,
        "candidate-01.candidate-result.json",
      ),
    );
    assert.match(candidateWaveExport.suggestedAggregateReviewCall ?? "", /review_candidate_wave/);
    assert.doesNotMatch(
      candidateWaveExport.suggestedAggregateReviewCall ?? "",
      /candidateResultPacketPaths/,
    );
    assert.match(
      formatAutoresearchCandidateResultExportResult(candidateWaveExport),
      /default-discovery aggregate review call/,
    );
    const candidateResultPayload = JSON.parse(readFileSync(candidateResultExport.path, "utf8"));
    assert.equal(candidateResultPayload.packetKind, "autoresearch.candidate_result.v1");
    assert.throws(
      () => writeAutoresearchCandidateResultPacket({ cwd }),
      /already exists; pass overwrite=true/u,
    );
    assert.doesNotThrow(() => writeAutoresearchCandidateResultPacket({ cwd, overwrite: true }));
    assert.throws(
      () => writeAutoresearchCandidateResultPacket({ cwd, outPath: "/tmp/candidate-result.json" }),
      /must be relative/u,
    );
    assert.throws(
      () => writeAutoresearchCandidateResultPacket({ cwd, outPath: "../candidate-result.json" }),
      /must stay inside/u,
    );

    const candidateDecision = buildAutoresearchCandidateDecisionWorkbench({
      cwd,
      action: "status",
    });
    assert.equal(candidateDecision.candidate?.branch, "candidate/closeout");
    assert.equal(candidateDecision.recommendedDecision, "collect_more_samples");
    assert.equal(candidateDecision.empirical.checksStatus, "not run");
    assert.equal(candidateDecision.confirmation.required, false);
    assert.match(candidateDecision.exactNextCalls.join("\n"), /candidate_result/);
    assert.match(
      formatAutoresearchCandidateDecisionWorkbench(candidateDecision),
      /CANDIDATE DECISION WORKBENCH/,
    );

    const discardPlan = buildAutoresearchCandidateDecisionWorkbench({
      cwd,
      action: "plan_discard",
      candidatePolicy: { discard: "delete_worktree_after_confirm" },
    });
    assert.equal(discardPlan.recommendedDecision, "discard");
    assert.equal(discardPlan.confirmation.required, true);
    assert.equal(discardPlan.confirmation.riskLevel, "destructive_external");
    assert.match(discardPlan.confirmation.exactConfirmationPhrase, /confirm autoresearch discard/);
    assert.match(
      formatAutoresearchCandidateDecisionWorkbench(discardPlan),
      /Confirmation checklist/,
    );
    assert.match(discardPlan.plannedCommands.join("\n"), /worktree remove/);
    assert.match(discardPlan.plannedCommands.join("\n"), /plan only/);

    const rewindPlan = buildAutoresearchCandidateDecisionWorkbench({ cwd, action: "plan_rewind" });
    assert.equal(rewindPlan.recommendedDecision, "rewind");
    assert.match(rewindPlan.plannedCommands.join("\n"), /reset --hard/);

    const learning = buildAutoresearchKnowledgeExportPacket(cwd);
    assert.equal(learning.packetKind, "autoresearch.learning.v1");
    assert.ok(learning.targetKinds.includes("kms"));
    assert.match(learning.markdown, /## What was learned/);
    assert.match(formatAutoresearchKnowledgeExportPacket(learning), /KNOWLEDGE EXPORT PACKET/);

    const learningExport = writeAutoresearchKnowledgeExportPacket({ cwd });
    assert.equal(learningExport.exportKind, "autoresearch.learning_export.v1");
    assert.equal(learningExport.packet.packetKind, "autoresearch.learning.v1");
    assert.equal(learningExport.path, path.join(cwd, AUTORESEARCH_LEARNING_EXPORT_FILE));
    assert.equal(learningExport.effect.akCalled, false);
    assert.equal(learningExport.effect.kesWritten, false);
    assert.equal(learningExport.effect.externalAuthorityMutated, false);
    assert.equal(learningExport.effect.promotionStateChanged, false);
    assert.match(learningExport.suggestedKesAdapterCall, /autoresearch_learning_kes_adapter/);
    assert.match(formatAutoresearchLearningExportResult(learningExport), /LEARNING EXPORT/);
    const learningExportPayload = JSON.parse(readFileSync(learningExport.path, "utf8"));
    assert.equal(learningExportPayload.packetKind, "autoresearch.learning.v1");
    assert.throws(
      () => writeAutoresearchKnowledgeExportPacket({ cwd }),
      /already exists; pass overwrite=true/u,
    );
    assert.doesNotThrow(() => writeAutoresearchKnowledgeExportPacket({ cwd, overwrite: true }));
    assert.throws(
      () => writeAutoresearchKnowledgeExportPacket({ cwd, outPath: "/tmp/learning.json" }),
      /must be relative/u,
    );
    assert.throws(
      () => writeAutoresearchKnowledgeExportPacket({ cwd, outPath: "../learning.json" }),
      /must stay inside/u,
    );

    const packetPath = path.join(cwd, "learning-packet.json");
    writeFileSync(packetPath, `${JSON.stringify(learning)}\n`, "utf8");
    const notesAdapterOutput = execFileSync(
      process.execPath,
      ["examples/learning-notes-adapter-consumer.mjs", "--packet", packetPath],
      { cwd: path.resolve(import.meta.dirname, ".."), encoding: "utf8" },
    );
    const notesAdapterReceipt = JSON.parse(notesAdapterOutput) as {
      kind: string;
      status: string;
      apply: boolean;
      target: string;
      destinationPath: string;
    };
    assert.equal(notesAdapterReceipt.kind, "autoresearch.notes_adapter_dry_run.v1");
    assert.equal(notesAdapterReceipt.status, "planned");
    assert.equal(notesAdapterReceipt.apply, false);
    assert.equal(notesAdapterReceipt.target, "repo_notes");
    assert.match(notesAdapterReceipt.destinationPath, /^docs\/learnings\//);

    const catalog = buildAutoresearchAdapterContractCatalog();
    assert.equal(catalog.packetKind, "autoresearch.adapter_contracts.v1");
    assert.equal(catalog.adapterContractVersion, 1);
    assert.deepEqual(
      catalog.entries.map((entry) => entry.packetKind),
      [
        "autoresearch.closeout.v1",
        "autoresearch.oracle_evidence.v1",
        "autoresearch.ak_evidence.v1",
        "autoresearch.candidate_result.v1",
        "autoresearch.learning.v1",
      ],
    );
    assert.match(formatAutoresearchAdapterContractCatalog(catalog), /ADAPTER CONTRACT CATALOG/);

    const validCloseout = validateAutoresearchAdapterPacket(closeout);
    assert.equal(validCloseout.valid, true);
    assert.equal(validCloseout.validatedPacketKind, "autoresearch.closeout.v1");
    assert.match(formatAutoresearchAdapterPacketValidationResult(validCloseout), /valid: yes/);

    const validCandidateResult = validateAutoresearchAdapterPacket(candidateResult);
    assert.equal(validCandidateResult.valid, true);

    const invalidCandidateResult = validateAutoresearchAdapterPacket({
      ...candidateResult,
      candidate: { ...candidateResult.candidate, filesChanged: "src/runtime.ts" },
      candidateRun: { ...candidateResult.candidateRun, metric: "fast" },
    });
    assert.equal(invalidCandidateResult.valid, false);
    assert.match(
      formatAutoresearchAdapterPacketValidationResult(invalidCandidateResult),
      /candidate\.filesChanged/,
    );
    assert.match(
      formatAutoresearchAdapterPacketValidationResult(invalidCandidateResult),
      /candidateRun\.metric/,
    );

    const validOracleEvidence = validateAutoresearchAdapterPacket(oracleEvidence);
    assert.equal(validOracleEvidence.valid, true);

    const invalidOracleEvidence = validateAutoresearchAdapterPacket({
      ...oracleEvidence,
      publicationPreflight: { ...oracleEvidence.publicationPreflight, sharedOracleMutated: true },
    });
    assert.equal(invalidOracleEvidence.valid, false);
    assert.match(
      formatAutoresearchAdapterPacketValidationResult(invalidOracleEvidence),
      /sharedOracleMutated/,
    );

    const invalidEvidence = validateAutoresearchAdapterPacket({ ...evidence, taskId: 0 });
    assert.equal(invalidEvidence.valid, false);
    assert.match(formatAutoresearchAdapterPacketValidationResult(invalidEvidence), /taskId/);
  }));

test("calibration runs inform timing noise without competing as best candidate", () =>
  withTempDir((cwd) => {
    appendReceipt(
      cwd,
      createConfigReceipt({
        name: "widget-speed-calibration",
        metricName: "total_ms",
        metricUnit: "ms",
        direction: "lower",
        createdAt: 1,
        benchmarkCommand: "bash autoresearch.sh",
      }),
    );
    appendReceipt(
      cwd,
      createRunReceipt({
        status: "baseline",
        metric: 100,
        description: "baseline",
        timestamp: 2,
      }),
    );
    appendReceipt(
      cwd,
      createRunReceipt({
        status: "candidate",
        runKind: "calibration",
        metric: 90,
        description: "calibration sample 1",
        timestamp: 3,
      }),
    );
    appendReceipt(
      cwd,
      createRunReceipt({
        status: "candidate",
        runKind: "calibration",
        metric: 91,
        description: "calibration sample 2",
        timestamp: 4,
      }),
    );

    const status = buildAutoresearchRuntimeStatus(cwd);
    assert.equal(status.currentSegment.successfulRunCount, 3);
    assert.equal(status.currentSegment.bestMetric, 100);
    assert.equal(status.currentSegment.confidence, null);
    assert.equal(status.currentSegment.empiricalDecisionClass, "calibration_signal");
    assert.equal(status.empiricalPosture.classification, "calibration_only");
    assert.equal(status.empiricalPosture.promotionReady, false);
    assert.equal(status.currentSegment.lastRunKind, "calibration");
    assert.equal(status.currentSegment.metricInterpretation?.sampleCount, 3);
    assert.equal(status.currentSegment.metricInterpretation?.bestMetric, 90);
    assert.equal(status.currentSegment.metricInterpretation?.verdict, "calibration_signal");
    assert.match(formatAutoresearchStatusText(status), /empirical decision: calibration_signal/);
    assert.match(formatAutoresearchStatusText(status), /timing interpretation: calibration_signal/);
    assert.match(
      formatAutoresearchStatusText(status),
      /last run: candidate \(calibration\) @ 91ms/,
    );

    const candidateDecision = buildAutoresearchCandidateDecisionWorkbench({ cwd });
    assert.equal(candidateDecision.metricReadiness?.classification, "duration_review_ready");
  }));

test("duration candidates are baseline_drift when calibration explains the baseline gap", () =>
  withTempDir((cwd) => {
    appendReceipt(
      cwd,
      createConfigReceipt({
        name: "widget-speed-baseline-drift",
        metricName: "total_ms",
        metricUnit: "ms",
        direction: "lower",
        metricThreshold: 0,
        createdAt: 1,
        benchmarkCommand: "bash autoresearch.sh",
        checksCommand: "npm run check",
      }),
    );
    appendReceipt(
      cwd,
      createRunReceipt({
        status: "baseline",
        metric: 16699,
        description: "high baseline",
        timestamp: 2,
      }),
    );
    appendReceipt(
      cwd,
      createRunReceipt({
        status: "candidate",
        runKind: "calibration",
        metric: 9462,
        description: "calibration sample 1",
        timestamp: 3,
      }),
    );
    appendReceipt(
      cwd,
      createRunReceipt({
        status: "candidate",
        runKind: "calibration",
        metric: 9022,
        description: "calibration sample 2",
        timestamp: 4,
      }),
    );
    appendReceipt(
      cwd,
      createRunReceipt({
        status: "candidate",
        metric: 8665,
        description: "ordinary candidate near calibration band",
        timestamp: 5,
        experiment: {
          hypothesisId: "H-drift-001",
          hypothesis: "candidate should not overclaim a high baseline",
          interventionSummary: "candidate close to calibration samples",
          expectedPrimaryEffect: "lower total_ms",
          targetFiles: ["src/core/runtime.ts"],
          risk: "baseline may be a high outlier",
          candidate: {
            source: "candidate_peer_spawn",
            worktreePath: "/tmp/candidate-drift",
            branch: "candidate/drift",
            baseRef: "main",
            diffSummary: "candidate near calibration band",
            filesChanged: ["src/core/runtime.ts"],
          },
        },
      }),
    );

    const status = buildAutoresearchRuntimeStatus(cwd);
    assert.equal(status.currentSegment.empiricalDecisionClass, "baseline_drift");
    assert.equal(status.empiricalPosture.classification, "baseline_drift_suspected");
    assert.equal(status.empiricalPosture.promotionReady, false);
    assert.equal(status.currentSegment.metricInterpretation?.verdict, "baseline_drift");
    assert.match(formatAutoresearchStatusText(status), /timing interpretation: baseline_drift/);

    const closeout = buildAutoresearchSegmentCloseout(cwd);
    assert.equal(closeout.empiricalDecisionClass, "baseline_drift");
    assert.match(formatAutoresearchSegmentCloseout(closeout), /baseline drift/);

    const candidateResult = buildAutoresearchCandidateResultPacket(cwd);
    assert.equal(candidateResult.empiricalDecisionClass, "baseline_drift");
    assert.equal(candidateResult.candidate?.branch, "candidate/drift");

    const candidateDecision = buildAutoresearchCandidateDecisionWorkbench({ cwd });
    assert.equal(candidateDecision.metricReadiness?.classification, "duration_baseline_drift");
    assert.match(
      formatAutoresearchCandidateDecisionWorkbench(candidateDecision),
      /Metric readiness blockers/,
    );
    assert.match(
      formatAutoresearchCandidateDecisionDashboardSummary(candidateDecision),
      /metric readiness: duration_baseline_drift/,
    );
    const rebaselineCall = candidateDecision.exactNextCalls.find((call) =>
      call.includes("Rebaseline before candidate decision"),
    );
    assert.ok(rebaselineCall);
    assert.match(rebaselineCall, /name: "widget-speed-baseline-drift"/);
    assert.match(rebaselineCall, /metricName: "total_ms"/);
    assert.match(rebaselineCall, /metricUnit: "ms"/);
    assert.match(rebaselineCall, /direction: "lower"/);
    assert.match(rebaselineCall, /metricThreshold: 0/);
    assert.match(rebaselineCall, /benchmarkCommand: "bash autoresearch\.sh"/);
    assert.match(rebaselineCall, /checksCommand: "npm run check"/);
  }));

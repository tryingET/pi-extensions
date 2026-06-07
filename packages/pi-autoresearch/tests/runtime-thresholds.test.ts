import assert from "node:assert/strict";
import { mkdtempSync, rmSync } from "node:fs";
import os from "node:os";
import path from "node:path";
import test from "node:test";

import {
  appendReceipt,
  buildAutoresearchCandidateDecisionWorkbench,
  buildAutoresearchRuntimeStatus,
  buildAutoresearchSegmentCloseout,
  createConfigReceipt,
  createRunReceipt,
  formatAutoresearchCandidateDecisionDashboardSummary,
  formatAutoresearchCandidateDecisionWorkbench,
  formatAutoresearchDashboard,
  formatAutoresearchSegmentCloseout,
  formatAutoresearchStatusText,
} from "../src/core/runtime.ts";

async function withTempDir(fn: (cwd: string) => Promise<void> | void): Promise<void> {
  const cwd = mkdtempSync(path.join(os.tmpdir(), "pi-autoresearch-runtime-"));
  try {
    await fn(cwd);
  } finally {
    rmSync(cwd, { recursive: true, force: true });
  }
}

test("status builder summarizes best metric and confidence from appended receipts", () =>
  withTempDir((cwd) => {
    appendReceipt(
      cwd,
      createConfigReceipt({
        name: "widget-speed",
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
        metric: 90,
        description: "candidate 1",
        timestamp: 3,
      }),
    );
    appendReceipt(
      cwd,
      createRunReceipt({
        status: "candidate",
        metric: 92,
        description: "candidate 2",
        timestamp: 4,
      }),
    );

    const status = buildAutoresearchRuntimeStatus(cwd);
    assert.equal(status.currentSegment.configured, true);
    assert.equal(status.currentSegment.runCount, 3);
    assert.equal(status.currentSegment.successfulRunCount, 3);
    assert.equal(status.currentSegment.baselineMetric, 100);
    assert.equal(status.currentSegment.bestMetric, 90);
    assert.equal(status.currentSegment.empiricalDecisionClass, "candidate_improvement");
    assert.equal(status.empiricalPosture.classification, "candidate_review_ready");
    assert.equal(status.empiricalPosture.promotionReady, true);
    assert.equal(status.currentSegment.metricInterpretation?.verdict, "meaningful_improvement");
    assert.equal(status.currentSegment.metricInterpretation?.sampleCount, 3);
    assert.equal(status.currentSegment.metricInterpretation?.bestDelta, 10);
    assert.match(
      formatAutoresearchStatusText(status),
      /timing interpretation: meaningful_improvement/,
    );
    assert.match(formatAutoresearchStatusText(status), /empirical decision: candidate_improvement/);
    assert.match(formatAutoresearchStatusText(status), /empirical posture: candidate_review_ready/);
    assert.equal(status.runtimeProjection.state, "ready");
    assert.equal(status.runtimeProjection.source, "receipt_fallback");
    assert.equal(status.runtimeProjection.hasLedger, false);
    assert.equal(status.promptVaultDecisions.availability, "available_not_yet_used");
    assert.ok((status.currentSegment.confidence ?? 0) > 0);
  }));

test("status builder treats zero-blocker threshold metrics as first-class success", () =>
  withTempDir((cwd) => {
    appendReceipt(
      cwd,
      createConfigReceipt({
        name: "self-hosting-threshold",
        metricName: "unresolved_dogfood_blockers",
        metricUnit: "count",
        direction: "lower",
        createdAt: 1,
        benchmarkCommand: "bash autoresearch.sh",
      }),
    );
    appendReceipt(
      cwd,
      createRunReceipt({
        status: "baseline",
        metric: 1,
        description: "baseline with one blocker",
        timestamp: 2,
      }),
    );
    appendReceipt(
      cwd,
      createRunReceipt({
        status: "candidate",
        metric: 0,
        description: "candidate clears the blocker threshold",
        timestamp: 3,
        experiment: {
          hypothesisId: "H-threshold-001",
          hypothesis: "A bounded self-hosting candidate clears unresolved blockers.",
          interventionSummary: "evaluate threshold-style success",
          expectedPrimaryEffect: "unresolved_dogfood_blockers reaches zero",
          targetFiles: ["src/core/runtime.ts"],
          risk: "threshold success is not an improvement-style duration metric",
          candidate: {
            source: "manual",
            worktreePath: "/tmp/candidate-threshold",
            branch: "candidate/threshold",
            baseRef: "main",
            diffSummary: "clear unresolved dogfood blocker",
            filesChanged: ["src/core/runtime.ts"],
          },
        },
      }),
    );

    const status = buildAutoresearchRuntimeStatus(cwd);
    assert.equal(status.currentSegment.empiricalDecisionClass, "threshold_satisfied");
    assert.equal(status.empiricalPosture.classification, "threshold_satisfied");
    assert.equal(status.empiricalPosture.promotionReady, true);
    assert.match(formatAutoresearchStatusText(status), /empirical posture: threshold_satisfied/);

    const closeout = buildAutoresearchSegmentCloseout(cwd);
    assert.equal(closeout.empiricalDecisionClass, "threshold_satisfied");
    assert.equal(closeout.empiricalPosture.promotionReady, true);
    assert.match(formatAutoresearchSegmentCloseout(closeout), /threshold-satisfied evidence/);

    const candidateDecision = buildAutoresearchCandidateDecisionWorkbench({
      cwd,
      action: "status",
    });
    assert.equal(candidateDecision.recommendedDecision, "keep");
  }));

test("status builder uses explicit non-zero threshold targets", () =>
  withTempDir((cwd) => {
    appendReceipt(
      cwd,
      createConfigReceipt({
        name: "explicit-threshold",
        metricName: "review_findings",
        metricUnit: "count",
        direction: "lower",
        metricThreshold: 2,
        createdAt: 1,
        benchmarkCommand: "bash autoresearch.sh",
      }),
    );
    appendReceipt(
      cwd,
      createRunReceipt({
        status: "baseline",
        metric: 5,
        description: "baseline has too many findings",
        timestamp: 2,
      }),
    );
    appendReceipt(
      cwd,
      createRunReceipt({
        status: "candidate",
        metric: 2,
        description: "candidate reaches explicit threshold",
        timestamp: 3,
        experiment: {
          candidate: {
            source: "manual",
            worktreePath: cwd,
            branch: "candidate/explicit-threshold",
            baseRef: "main",
            diffSummary: "reduce review findings to the explicit threshold",
            filesChanged: ["src/core/runtime.ts"],
          },
        },
      }),
    );

    const status = buildAutoresearchRuntimeStatus(cwd);
    assert.equal(status.currentSegment.metricThreshold, 2);
    assert.equal(status.currentSegment.empiricalDecisionClass, "threshold_satisfied");
    assert.equal(status.empiricalPosture.classification, "threshold_satisfied");
    assert.match(formatAutoresearchStatusText(status), /success threshold: 2count/);

    const candidateDecision = buildAutoresearchCandidateDecisionWorkbench({
      cwd,
      action: "plan_keep",
    });
    assert.equal(candidateDecision.recommendedDecision, "keep");
    assert.equal(candidateDecision.metricReadiness?.classification, "threshold_ready");
    assert.match(
      formatAutoresearchCandidateDecisionWorkbench(candidateDecision),
      /Metric readiness review/,
    );
    assert.match(
      formatAutoresearchCandidateDecisionWorkbench(candidateDecision),
      /threshold metric target <=2count/,
    );
    assert.ok(
      candidateDecision.confirmation.checklist.some((item) =>
        item.includes("explicit success threshold <=2count"),
      ),
    );
    assert.ok(
      candidateDecision.confirmation.checklist.some((item) =>
        item.includes("metric readiness reviewed: threshold_ready"),
      ),
    );
  }));

test("status builder blocks explicit threshold misses from generic promotion-ready improvement", () =>
  withTempDir((cwd) => {
    appendReceipt(
      cwd,
      createConfigReceipt({
        name: "explicit-threshold-not-met",
        metricName: "review_findings",
        metricUnit: "count",
        direction: "lower",
        metricThreshold: 2,
        createdAt: 1,
        benchmarkCommand: "bash autoresearch.sh",
      }),
    );
    appendReceipt(
      cwd,
      createRunReceipt({
        status: "baseline",
        metric: 10,
        description: "baseline misses explicit threshold",
        timestamp: 2,
      }),
    );
    appendReceipt(
      cwd,
      createRunReceipt({
        status: "candidate",
        metric: 5,
        description: "candidate improves but still misses explicit threshold",
        timestamp: 3,
        experiment: {
          candidate: {
            source: "manual",
            worktreePath: cwd,
            branch: "candidate/partial-threshold",
            baseRef: "main",
            diffSummary: "reduce findings without reaching target",
            filesChanged: ["src/core/runtime.ts"],
          },
        },
      }),
    );

    const status = buildAutoresearchRuntimeStatus(cwd);
    assert.equal(status.currentSegment.empiricalDecisionClass, "threshold_not_met");
    assert.equal(status.empiricalPosture.classification, "threshold_not_met");
    assert.equal(status.empiricalPosture.promotionReady, false);
    assert.match(formatAutoresearchStatusText(status), /empirical decision: threshold_not_met/);

    const candidateDecision = buildAutoresearchCandidateDecisionWorkbench({ cwd });
    assert.equal(candidateDecision.recommendedDecision, "collect_more_samples");
  }));

test("explicit threshold misses still discard directional regressions", async () => {
  for (const scenario of [
    { direction: "lower" as const, threshold: 2, baseline: 5, candidate: 8 },
    { direction: "higher" as const, threshold: 90, baseline: 80, candidate: 70 },
  ]) {
    await withTempDir((cwd) => {
      appendReceipt(
        cwd,
        createConfigReceipt({
          name: `explicit-threshold-regression-${scenario.direction}`,
          metricName: "review_score",
          metricUnit: "count",
          direction: scenario.direction,
          metricThreshold: scenario.threshold,
          createdAt: 1,
          benchmarkCommand: "bash autoresearch.sh",
        }),
      );
      appendReceipt(
        cwd,
        createRunReceipt({
          status: "baseline",
          metric: scenario.baseline,
          description: "baseline misses explicit threshold",
          timestamp: 2,
        }),
      );
      appendReceipt(
        cwd,
        createRunReceipt({
          status: "candidate",
          metric: scenario.candidate,
          description: "candidate regresses while still missing explicit threshold",
          timestamp: 3,
          experiment: {
            candidate: {
              source: "manual",
              worktreePath: cwd,
              branch: `candidate/threshold-regression-${scenario.direction}`,
              baseRef: "main",
              diffSummary: "regress threshold metric",
              filesChanged: ["src/core/runtime.ts"],
            },
          },
        }),
      );

      const status = buildAutoresearchRuntimeStatus(cwd);
      assert.equal(status.currentSegment.empiricalDecisionClass, "candidate_regression");
      assert.equal(status.empiricalPosture.classification, "candidate_regression");
      assert.equal(status.empiricalPosture.promotionReady, false);

      const candidateDecision = buildAutoresearchCandidateDecisionWorkbench({ cwd });
      assert.equal(candidateDecision.recommendedDecision, "discard");
    });
  }
});

test("status builder treats explicit higher-threshold targets as success", () =>
  withTempDir((cwd) => {
    appendReceipt(
      cwd,
      createConfigReceipt({
        name: "explicit-higher-threshold",
        metricName: "setup_quality_score",
        metricUnit: "pts",
        direction: "higher",
        metricThreshold: 90,
        createdAt: 1,
        benchmarkCommand: "bash autoresearch.sh",
      }),
    );
    appendReceipt(
      cwd,
      createRunReceipt({
        status: "baseline",
        metric: 80,
        description: "baseline below explicit score threshold",
        timestamp: 2,
      }),
    );
    appendReceipt(
      cwd,
      createRunReceipt({
        status: "candidate",
        metric: 91,
        description: "candidate reaches explicit score threshold",
        timestamp: 3,
      }),
    );

    const status = buildAutoresearchRuntimeStatus(cwd);
    assert.equal(status.currentSegment.empiricalDecisionClass, "threshold_satisfied");
    assert.equal(status.empiricalPosture.classification, "threshold_satisfied");
    assert.match(formatAutoresearchDashboard(status), /success threshold: 90pts/);

    const candidateDecision = buildAutoresearchCandidateDecisionWorkbench({ cwd });
    assert.equal(candidateDecision.metricReadiness?.classification, "threshold_ready");
    assert.match(
      formatAutoresearchCandidateDecisionDashboardSummary(candidateDecision),
      /metric readiness: threshold_ready/,
    );
  }));

test("duration explicit threshold misses stay non-promotion-ready after noise gates pass", () =>
  withTempDir((cwd) => {
    appendReceipt(
      cwd,
      createConfigReceipt({
        name: "duration-threshold-not-met",
        metricName: "total_ms",
        metricUnit: "ms",
        direction: "lower",
        metricThreshold: 80,
        createdAt: 1,
        benchmarkCommand: "bash autoresearch.sh",
      }),
    );
    appendReceipt(
      cwd,
      createRunReceipt({
        status: "baseline",
        metric: 100,
        description: "baseline misses duration threshold",
        timestamp: 2,
      }),
    );
    appendReceipt(
      cwd,
      createRunReceipt({
        status: "candidate",
        metric: 97,
        description: "candidate sample inside timing noise",
        timestamp: 3,
      }),
    );
    appendReceipt(
      cwd,
      createRunReceipt({
        status: "candidate",
        metric: 85,
        description: "candidate improves beyond noise but misses explicit threshold",
        timestamp: 4,
        experiment: {
          candidate: {
            source: "manual",
            worktreePath: cwd,
            branch: "candidate/duration-partial-threshold",
            baseRef: "main",
            diffSummary: "reduce total_ms without reaching target",
            filesChanged: ["src/core/runtime.ts"],
          },
        },
      }),
    );

    const status = buildAutoresearchRuntimeStatus(cwd);
    assert.equal(status.currentSegment.metricInterpretation?.verdict, "meaningful_improvement");
    assert.equal(status.currentSegment.empiricalDecisionClass, "threshold_not_met");
    assert.equal(status.empiricalPosture.classification, "threshold_not_met");
    assert.equal(status.empiricalPosture.promotionReady, false);

    const candidateDecision = buildAutoresearchCandidateDecisionWorkbench({ cwd });
    assert.equal(candidateDecision.recommendedDecision, "collect_more_samples");
    assert.equal(candidateDecision.metricReadiness?.classification, "duration_review_ready");
  }));

test("candidate metric readiness reports unconfigured segments", () =>
  withTempDir((cwd) => {
    const candidateDecision = buildAutoresearchCandidateDecisionWorkbench({ cwd });
    assert.equal(candidateDecision.metricReadiness?.classification, "unconfigured");
    assert.match(
      formatAutoresearchCandidateDecisionWorkbench(candidateDecision),
      /no metric contract is configured yet/,
    );
  }));

test("candidate metric readiness keeps duration thresholds behind duration gates", () =>
  withTempDir((cwd) => {
    appendReceipt(
      cwd,
      createConfigReceipt({
        name: "duration-explicit-threshold",
        metricName: "total_ms",
        metricUnit: "ms",
        direction: "lower",
        metricThreshold: 80,
        createdAt: 1,
        benchmarkCommand: "bash autoresearch.sh",
      }),
    );
    appendReceipt(
      cwd,
      createRunReceipt({
        status: "baseline",
        metric: 100,
        description: "baseline duration",
        timestamp: 2,
      }),
    );
    appendReceipt(
      cwd,
      createRunReceipt({
        status: "candidate",
        metric: 75,
        description: "candidate reaches threshold but is under-sampled",
        timestamp: 3,
        experiment: {
          candidate: {
            source: "manual",
            worktreePath: cwd,
            branch: "candidate/duration-threshold",
            baseRef: "main",
            diffSummary: "reduce total_ms",
            filesChanged: ["src/core/runtime.ts"],
          },
        },
      }),
    );

    const status = buildAutoresearchRuntimeStatus(cwd);
    assert.equal(status.currentSegment.empiricalDecisionClass, "insufficient_samples");
    const candidateDecision = buildAutoresearchCandidateDecisionWorkbench({
      cwd,
      action: "plan_keep",
    });
    assert.equal(candidateDecision.metricReadiness?.classification, "duration_under_sampled");
    assert.ok(
      candidateDecision.confirmation.blockedReasons.some((reason) =>
        reason.includes("metric readiness: duration metric is under-sampled"),
      ),
    );
    assert.match(
      formatAutoresearchCandidateDecisionWorkbench(candidateDecision),
      /threshold target <=80ms reviewed after duration\/noise gates/,
    );
  }));

test("candidate metric readiness reports generic non-threshold metrics", () =>
  withTempDir((cwd) => {
    appendReceipt(
      cwd,
      createConfigReceipt({
        name: "generic-review-metric",
        metricName: "review_quality_delta",
        metricUnit: "score",
        direction: "higher",
        createdAt: 1,
        benchmarkCommand: "bash autoresearch.sh",
      }),
    );
    appendReceipt(
      cwd,
      createRunReceipt({
        status: "baseline",
        metric: 3,
        description: "baseline quality",
        timestamp: 2,
      }),
    );
    appendReceipt(
      cwd,
      createRunReceipt({
        status: "candidate",
        metric: 4,
        description: "candidate raises quality",
        timestamp: 3,
      }),
    );

    const candidateDecision = buildAutoresearchCandidateDecisionWorkbench({ cwd });
    assert.equal(candidateDecision.metricReadiness?.classification, "generic_review");
  }));

test("status builder treats preserved zero-blocker thresholds as review-ready evidence", () =>
  withTempDir((cwd) => {
    appendReceipt(
      cwd,
      createConfigReceipt({
        name: "self-hosting-threshold-preserved",
        metricName: "unresolved_dogfood_blockers",
        metricUnit: "count",
        direction: "lower",
        createdAt: 1,
        benchmarkCommand: "bash autoresearch.sh",
      }),
    );
    appendReceipt(
      cwd,
      createRunReceipt({
        status: "baseline",
        metric: 0,
        description: "baseline already satisfies threshold",
        timestamp: 2,
      }),
    );
    appendReceipt(
      cwd,
      createRunReceipt({
        status: "candidate",
        metric: 0,
        description: "candidate preserves the zero-blocker threshold",
        timestamp: 3,
      }),
    );

    const status = buildAutoresearchRuntimeStatus(cwd);
    assert.equal(status.currentSegment.empiricalDecisionClass, "threshold_preserved");
    assert.equal(status.empiricalPosture.classification, "threshold_preserved");
    assert.equal(status.empiricalPosture.promotionReady, true);

    const candidateDecision = buildAutoresearchCandidateDecisionWorkbench({ cwd });
    assert.equal(candidateDecision.metricReadiness?.classification, "threshold_ready");
  }));

test("candidate decision blocks keep/finalize guidance for stale missing artifacts", () =>
  withTempDir((cwd) => {
    const missingWorktree = path.join(cwd, "missing-candidate-worktree");
    appendReceipt(
      cwd,
      createConfigReceipt({
        name: "stale-candidate-artifacts",
        metricName: "self_evolutionary_ux_blockers",
        metricUnit: "blocker(s)",
        direction: "lower",
        metricThreshold: 0,
        createdAt: 1,
        benchmarkCommand: "bash autoresearch.sh",
      }),
    );
    appendReceipt(
      cwd,
      createRunReceipt({ status: "baseline", metric: 0, description: "baseline", timestamp: 2 }),
    );
    appendReceipt(
      cwd,
      createRunReceipt({
        status: "candidate",
        empiricalDecisionClass: "threshold_preserved",
        metric: 0,
        description: "candidate packet whose worktree was later removed",
        timestamp: 3,
        experiment: {
          candidate: {
            source: "candidate_peer_spawn",
            worktreePath: missingWorktree,
            branch: "candidatepeer/missing-artifact",
            baseRef: "main",
            diffSummary: "stale candidate packet",
            filesChanged: ["packages/pi-autoresearch/src/core/runtime.ts"],
          },
        },
      }),
    );

    const decision = buildAutoresearchCandidateDecisionWorkbench({ cwd, action: "status" });
    assert.equal(decision.candidate?.artifactStatus, "missing_worktree_and_branch");
    assert.equal(decision.recommendedDecision, "rebind_candidate");
    assert.match(decision.recommendationReason, /re-bind or re-measure/u);
    assert.match(decision.exactNextCalls.join("\n"), /autoresearch_candidate_bind/u);

    const keepPlan = buildAutoresearchCandidateDecisionWorkbench({ cwd, action: "plan_keep" });
    assert.equal(keepPlan.recommendedDecision, "rebind_candidate");
    assert.match(keepPlan.confirmation.blockedReasons.join("\n"), /candidate artifact status/u);
    assert.match(
      formatAutoresearchCandidateDecisionWorkbench(keepPlan),
      /missing_worktree_and_branch/u,
    );
  }));

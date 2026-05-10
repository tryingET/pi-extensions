#!/usr/bin/env node
// Integrated supervised-campaign UX dogfood benchmark.
//
// This is intentionally a product-journey contract, not a package quality gate. It creates an
// isolated temporary autoresearch runtime, exercises the public runtime/dashboard/packet surfaces,
// and counts operator-journey blockers against the integrated product posture:
// objective -> measurement contract -> bounded run -> visible dashboard -> candidate/result/review
// guidance -> external handoff. The emitted METRIC is intended for real autoresearch campaigns.
import { mkdtempSync, rmSync } from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const packageRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const runtimeUrl = pathToFileURL(path.join(packageRoot, "src/runtime.ts")).href;

const {
  buildAutoresearchAkEvidencePacket,
  buildAutoresearchCandidateDecisionWorkbench,
  buildAutoresearchCandidateResultPacket,
  buildAutoresearchKnowledgeExportPacket,
  buildAutoresearchResumePlan,
  buildAutoresearchSegmentCloseout,
  executeAutoresearchLoop,
  exportAutoresearchDashboardHtml,
  formatAutoresearchDashboard,
} = await import(runtimeUrl);

const strict = process.env.DOGFOOD_CONTRACT_STRICT ?? "1";
const root = process.env.PI_AUTORESEARCH_INTEGRATED_UX_DOGFOOD_ROOT
  ? path.resolve(process.env.PI_AUTORESEARCH_INTEGRATED_UX_DOGFOOD_ROOT)
  : mkdtempSync(path.join(os.tmpdir(), "autoresearch-integrated-ux-"));
const shouldCleanup = !process.env.PI_AUTORESEARCH_INTEGRATED_UX_DOGFOOD_ROOT;

function hasAll(text, fragments) {
  return fragments.every((fragment) => text.includes(fragment));
}

function addBlocker(blockers, id, details = {}) {
  blockers.push({ id, ...details });
}

async function runJourney() {
  const blockers = [];
  const emptyDashboard = exportAutoresearchDashboardHtml({
    cwd: root,
    outputPath: ".autoresearch/empty-dashboard.html",
  });
  const emptyHtml = String(
    await import("node:fs").then(({ readFileSync }) => readFileSync(emptyDashboard.path, "utf8")),
  );
  if (
    !hasAll(emptyHtml, ["segment_unconfigured", "Recommended next", "configure a bounded segment"])
  ) {
    addBlocker(blockers, "empty_dashboard_missing_setup_guidance");
  }
  if (
    !emptyHtml.includes("autoresearch_campaign_start") &&
    !emptyHtml.includes("autoresearch_runtime_setup")
  ) {
    addBlocker(blockers, "empty_dashboard_missing_exact_setup_surface");
  }

  const goal =
    "Make supervised autoresearch feel like one coherent campaign product without collapsing owner seams";
  const run = await executeAutoresearchLoop({
    cwd: root,
    goal,
    name: "integrated-supervised-campaign-ux-dogfood",
    description:
      "Integrated UX contract probe: bounded run should create dashboard and packet context for one coherent campaign journey.",
    metricName: "integrated_campaign_probe_blockers",
    metricUnit: "blocker(s)",
    direction: "lower",
    metricThreshold: 0,
    benchmarkCommand: `node -e "console.log('METRIC integrated_campaign_probe_blockers=0')"`,
    checksCommand: `node -e "process.exit(0)"`,
    maxIterations: 1,
    maxWallClockMinutes: 1,
    timeoutSeconds: 20,
    checksTimeoutSeconds: 20,
    reconfigure: true,
    peerMode: "plan",
    stopOn: ["crash", "checks_failed", "blocked"],
  });

  const dashboard = exportAutoresearchDashboardHtml({ cwd: root });
  const fs = await import("node:fs");
  const html = fs.readFileSync(dashboard.path, "utf8");
  const dashboardText = formatAutoresearchDashboard(run.status);
  const closeout = buildAutoresearchSegmentCloseout(root);
  const resume = buildAutoresearchResumePlan(root);
  const candidateResult = buildAutoresearchCandidateResultPacket(root);
  const candidateDecision = buildAutoresearchCandidateDecisionWorkbench({ cwd: root });
  const learning = buildAutoresearchKnowledgeExportPacket(root);
  const akEvidence = buildAutoresearchAkEvidencePacket({ cwd: root, taskId: 2749 });

  if (run.completedIterations !== 1 || run.runs[0]?.primaryMetric !== 0) {
    addBlocker(blockers, "bounded_loop_probe_did_not_complete", {
      completedIterations: run.completedIterations,
      metric: run.runs[0]?.primaryMetric ?? null,
    });
  }
  if (
    !hasAll(html, [
      "integrated-supervised-campaign-ux-dogfood",
      "integrated_campaign_probe_blockers",
      "Runs",
    ])
  ) {
    addBlocker(blockers, "dashboard_missing_campaign_metric_or_runs");
  }
  if (!html.includes(goal)) {
    addBlocker(blockers, "dashboard_missing_operator_objective", { expected: goal });
  }
  if (!html.match(/budget|maxIterations|maxWallClock|stop/i)) {
    addBlocker(blockers, "dashboard_missing_budget_or_stop_rule_context");
  }
  if (!hasAll(html, ["Candidate decision", "Learning handoff", "Boundary"])) {
    addBlocker(blockers, "dashboard_missing_core_handoff_sections");
  }
  if (
    !hasAll(html, [
      "autoresearch_candidate_bind",
      "autoresearch_runtime_run",
      "candidate_result_export",
    ])
  ) {
    addBlocker(blockers, "dashboard_missing_bind_measure_export_guided_journey");
  }
  if (!html.includes("autoresearch_live_supervision") && !html.includes("taskId")) {
    addBlocker(blockers, "dashboard_missing_orchestrator_witness_handoff");
  }
  if (!dashboardText.includes("empirical posture") && !dashboardText.includes("promotion")) {
    addBlocker(blockers, "text_dashboard_missing_empirical_posture_language");
  }
  if (closeout.packetKind !== "autoresearch.closeout.v1" || closeout.runs.length < 1) {
    addBlocker(blockers, "closeout_packet_not_reviewable");
  }
  if (learning.packetKind !== "autoresearch.learning.v1") {
    addBlocker(blockers, "learning_packet_unavailable");
  }
  if (akEvidence.packetKind !== "autoresearch.ak_evidence.v1") {
    addBlocker(blockers, "ak_evidence_packet_unavailable");
  }
  if (candidateResult.packetKind !== "autoresearch.candidate_result.v1") {
    addBlocker(blockers, "candidate_result_packet_unavailable");
  }
  if (candidateDecision.recommendedDecision === "no_candidate_bound_yet") {
    // This is expected for a baseline-only journey, but a coherent integrated product should show the
    // exact next candidate intake and measurement route rather than leaving the operator to know tool names.
    if (!candidateDecision.exactNextCalls.join("\n").includes("autoresearch_candidate_bind")) {
      addBlocker(blockers, "candidate_decision_missing_bind_next_call");
    }
  }
  if (resume.packetKind !== "autoresearch.resume_plan.v1") {
    addBlocker(blockers, "resume_plan_unavailable");
  }

  return {
    root,
    blockers,
    unresolved: blockers.length,
    run: {
      completedIterations: run.completedIterations,
      stopReason: run.stopReason,
      metric: run.runs[0]?.primaryMetric ?? null,
      empiricalDecisionClass: run.status.currentSegment.empiricalDecisionClass,
    },
    dashboard: {
      emptyPath: emptyDashboard.path,
      path: dashboard.path,
      fileUrl: dashboard.fileUrl,
    },
    packets: {
      closeout: closeout.packetKind,
      learning: learning.packetKind,
      akEvidence: akEvidence.packetKind,
      candidateResult: candidateResult.packetKind,
      resume: resume.packetKind,
    },
  };
}

try {
  const result = await runJourney();
  for (const blocker of result.blockers) {
    console.log(`BLOCKER ${blocker.id}`);
  }
  console.log(`METRIC unresolved_integrated_campaign_ux_blockers=${result.unresolved}`);
  console.log(JSON.stringify(result, null, 2));
  if (strict !== "0" && result.unresolved > 0) process.exitCode = 1;
} finally {
  if (shouldCleanup) rmSync(root, { recursive: true, force: true });
}

import assert from "node:assert/strict";
import { existsSync, readdirSync, readFileSync } from "node:fs";
import test from "node:test";
import {
  buildAutoresearchRuntimeStatus,
  discoverAutoresearchMatrixCampaignArtifacts,
  exportAutoresearchDashboardHtml,
  formatAutoresearchDashboard,
} from "../src/core/runtime.ts";
import { validateAutoresearchAdapterPacket } from "../src/core/runtime-adapter.ts";
import {
  measuredPacket,
  OBJECTIVE,
  PACKET,
  withDashboardDir,
  writeDashboardPlan,
  writeDashboardSource,
} from "./runtime-dashboard-fixtures.ts";

const discover = discoverAutoresearchMatrixCampaignArtifacts;
test("existing export entrypoint writes one offline HTML document without owner mutations", () =>
  withDashboardDir((cwd) => {
    const before = readdirSync(cwd);
    const result = exportAutoresearchDashboardHtml({ cwd });
    const html = readFileSync(result.path, "utf8");
    assert.equal(result.cwd, cwd);
    assert.match(result.fileUrl, /^file:/);
    assert.match(html, /Research Observatory/);
    assert.match(html, /No measurements yet/);
    assert.doesNotMatch(html, /http-equiv="refresh"|https:\/\//i);
    assert.equal(existsSync(`${cwd}/autoresearch.jsonl`), false);
    assert.equal(existsSync(`${cwd}/autoresearch.events.jsonl`), false);
    assert.deepEqual(before, []);
    assert.deepEqual(readdirSync(cwd), [".autoresearch"]);
  }));

test("owner-built packet: all lane attempts survive, regression + keep is regression, no newest winner", () =>
  withDashboardDir((cwd) => {
    const packet = measuredPacket(cwd);
    assert.equal(validateAutoresearchAdapterPacket(packet).valid, true);
    writeDashboardPlan(cwd);
    writeDashboardSource(cwd, PACKET, packet);
    const model = discover(cwd);
    assert.equal(model.observedMeasurementCount, 2);
    assert.equal(model.exportedPacketCount, 1);
    assert.equal(model.coverageGapLaneCount, 0);
    const attempts = model.cells[0].lanes[0].attempts;
    assert.deepEqual(
      attempts.map((a) => a.metric),
      [100, 110],
    );
    assert.ok(
      attempts.every(
        (a) =>
          a.outcome === "regression" && a.disposition === "keep" && a.lineageValid && a.schemaValid,
      ),
    );
    assert.equal(model.cells[0].latestMetric, null);
    assert.equal(model.comparisonGroups.length, 0);
    assert.ok(
      attempts.every(
        (a) =>
          a.identity.metricUnit === "ms" &&
          a.identity.evaluator === null &&
          a.comparisonKey === null,
      ),
    );
    assert.equal(model.chart.points.length, 0);
    const html = readFileSync(exportAutoresearchDashboardHtml({ cwd }).path, "utf8");
    assert.match(html, /attempt 1/);
    assert.match(html, /attempt 2/);
    assert.match(html, /Rejection criteria<\/dt><dd>not specified/);
    assert.match(html, /lifecycle disposition: <b>keep/);
    assert.match(html, /protocol provenance gap/);
    assert.doesNotMatch(html, /confidence x|improvement percentage|global best:/i);
  }));

test("metric/unit/subject/base/evaluator/scenario identities never concatenate workflow counts", () =>
  withDashboardDir((cwd) => {
    const packet = measuredPacket(cwd);
    const other = structuredClone(packet);
    for (const run of other.closeout.runs) run.timestamp += 10000;
    other.closeout.metricName = "bytes";
    other.closeout.metricUnit = "B";
    other.closeout.status.currentSegment.metricName = "bytes";
    other.closeout.status.currentSegment.metricUnit = "B";
    const second = PACKET.replace("candidate-01", "candidate-02");
    writeDashboardPlan(cwd, [PACKET, second]);
    writeDashboardSource(cwd, PACKET, packet);
    writeDashboardSource(cwd, second, other);
    writeDashboardSource(cwd, ".autoresearch/campaigns/5621/review.json", {
      kind: "autoresearch.matrix_campaign_review.v1",
      taskId: 5621,
      cwd,
      objective: OBJECTIVE,
      closeout: {
        metric: { name: "workflow_blockers", direction: "lower", baseline: 8, final: 0 },
      },
    });
    const model = discover(cwd);
    assert.equal(model.comparisonGroups.length, 0);
    const attempts = model.cells.flatMap((cell) => cell.lanes.flatMap((lane) => lane.attempts));
    assert.deepEqual([...new Set(attempts.map((a) => a.identity.metricName))].sort(), [
      "bytes",
      "total_ms",
    ]);
    assert.ok(attempts.every((a) => a.metric !== 8 && a.metric !== 0 && a.comparisonKey === null));
    other.closeout.status.currentSegment.benchmarkCommand = null;
    writeDashboardSource(cwd, second, other);
    assert.ok(
      discover(cwd).cells[0].lanes[1].attempts.every(
        (a) =>
          a.comparisonKey === null && a.comparisonWithheld.some((s) => s.includes("evaluator")),
      ),
    );
  }));

test("unknown protocol, foreign campaign, stale objective digest and missing lineage fail closed", () =>
  withDashboardDir((cwd) => {
    const packet = measuredPacket(cwd);
    writeDashboardPlan(cwd);
    const variations = [
      (p: typeof packet) => {
        p.campaign = "earlier campaign";
        p.closeout.campaign = "earlier campaign";
      },
      (p: typeof packet) => {
        p.candidate = null;
      },
      (p: typeof packet) => {
        p.closeout.runs = [];
      },
      (p: typeof packet) => {
        p.closeout.status.currentSegment.objectiveDigest = "f".repeat(64);
      },
      (p: typeof packet) => {
        p.candidateRun = null;
      },
      (p: typeof packet) => {
        for (const run of p.closeout.runs) run.checks = "not recorded";
        if (p.candidateRun) p.candidateRun.checks = "not recorded";
      },
    ];
    for (const mutate of variations) {
      const changed = structuredClone(packet);
      mutate(changed);
      writeDashboardSource(cwd, PACKET, changed);
      const model = discover(cwd);
      assert.equal(model.observedMeasurementCount, 0);
      assert.equal(model.coverageGapLaneCount, 1);
    }
  }));

test("duplicate sources and shared packet paths across campaigns never become selectable samples", () =>
  withDashboardDir((cwd) => {
    const packet = measuredPacket(cwd);
    const other = PACKET.replace("candidate-01", "candidate-02");
    writeDashboardPlan(cwd, [PACKET, other]);
    writeDashboardSource(cwd, PACKET, packet);
    writeDashboardSource(cwd, other, packet);
    assert.equal(discover(cwd).observedMeasurementCount, 0);
    writeDashboardPlan(cwd, [PACKET], 5622);
    const model = discover(cwd);
    assert.equal(model.campaignCount, 2);
    assert.equal(model.observedMeasurementCount, 0);
    assert.ok(model.exportVisibilityBlockers.blockers.some((s) => s.includes("multiple campaign")));
  }));

test("failures and explicit resource censors without finite metric are retained but never charted", () =>
  withDashboardDir((cwd) => {
    const packet = measuredPacket(cwd);
    writeDashboardPlan(cwd);
    for (const [status, decision, expected] of [
      ["checks_failed", "checks_failed", "correctness_failure"],
      ["crash", "measurement_invalid", "measurement_invalid"],
      ["resource_censored", "resource_censored", "resource_censored"],
      ["candidate", "possible_noise", "inconclusive"],
    ]) {
      const raw = JSON.parse(JSON.stringify(packet));
      for (const run of raw.closeout.runs) {
        run.metric = null;
        run.status = status;
        run.empiricalDecisionClass = decision;
      }
      raw.candidateRun = raw.closeout.runs.at(-1);
      writeDashboardSource(cwd, PACKET, raw);
      const model = discover(cwd);
      assert.equal(model.observedMeasurementCount, 0);
      assert.equal(model.comparisonGroups.length, 0);
      assert.equal(model.cells[0].lanes[0].attempts.length, 2);
      assert.ok(
        model.cells[0].lanes[0].attempts.every((a) => a.metric === null && a.outcome === expected),
      );
    }
  }));

test("text dashboard identifies controller counts and does not print confidence as uncertainty", () =>
  withDashboardDir((cwd) => {
    writeDashboardPlan(cwd);
    const text = formatAutoresearchDashboard(buildAutoresearchRuntimeStatus(cwd));
    assert.match(text, /controller-reported completed cells/);
    assert.match(text, /Launch unverified|launch unverified/i);
    assert.doesNotMatch(text, /- confidence:|carry the live campaign truth/);
  }));

test("all unambiguously lineage-bound historical exports attach without enlarging expected inventory", () =>
  withDashboardDir((cwd) => {
    const packet = measuredPacket(cwd);
    const earlier = structuredClone(packet);
    earlier.closeout.runs = [earlier.closeout.runs[0]];
    earlier.candidateRun = earlier.closeout.runs[0];
    earlier.closeout.runCount = 1;
    const historical = PACKET.replace(
      "candidate-01.candidate-result",
      "attempt-one.candidate-result",
    );
    writeDashboardPlan(cwd);
    writeDashboardSource(cwd, PACKET, packet);
    writeDashboardSource(cwd, historical, earlier);
    const model = discover(cwd);
    assert.equal(model.cells[0].lanes[0].attempts.length, 2);
    assert.equal(model.cells[0].lanes[0].expectedPacketPaths.length, 1);
    assert.deepEqual(model.cells[0].lanes[0].historyPacketPaths, [historical]);
    assert.equal(model.cells[0].lanes[0].attempts[0].sources.length, 2);
    assert.equal(model.unresolvedPackets.length, 0);
    assert.equal(model.observedMeasurementCount, 2);
    assert.equal(model.coverageGapLaneCount, 0);
  }));

test("subject dimensions stay distinct but missing per-run protocol always withholds comparison", () =>
  withDashboardDir((cwd) => {
    const packet = measuredPacket(cwd);
    writeDashboardPlan(cwd);
    writeDashboardSource(cwd, PACKET, packet);
    const first = discover(cwd).cells[0].lanes[0].attempts[0].identity.subject;
    for (const field of ["worktreePath", "branch", "baseRef", "diffSummary"] as const) {
      const changed = structuredClone(packet);
      const value = field === "baseRef" ? "b".repeat(40) : "different";
      assert.ok(changed.candidate);
      changed.candidate[field] = value;
      for (const run of changed.closeout.runs) {
        assert.ok(run.experiment?.candidate);
        run.experiment.candidate[field] = value;
      }
      assert.ok(changed.candidateRun?.experiment?.candidate);
      changed.candidateRun.experiment.candidate[field] = value;
      writeDashboardSource(cwd, PACKET, changed);
      const changedModel = discover(cwd);
      assert.notEqual(changedModel.cells[0].lanes[0].attempts[0].identity.subject, first, field);
      assert.equal(changedModel.comparisonGroups.length, 0);
    }
    const changed = structuredClone(packet);
    changed.closeout.status.currentSegment.benchmarkCommand = null;
    writeDashboardSource(cwd, PACKET, changed);
    let model = discover(cwd);
    assert.equal(model.comparisonGroups.length, 0);
    assert.ok(
      model.cells[0].lanes[0].attempts.every((a) =>
        a.comparisonWithheld.includes("Unknown evaluator; comparison withheld."),
      ),
    );
    changed.closeout.metricUnit = "seconds"; // Contradictory closeout/config reports cannot be scored.
    writeDashboardSource(cwd, PACKET, changed);
    model = discover(cwd);
    assert.equal(model.observedMeasurementCount, 0);
    assert.ok(
      model.exportVisibilityBlockers.blockers.some((s) => s.includes("metricUnit mismatch")),
    );
  }));

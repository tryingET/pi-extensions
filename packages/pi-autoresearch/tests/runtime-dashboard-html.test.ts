import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import {
  buildAutoresearchRuntimeStatus,
  buildAutoresearchSegmentCloseout,
  discoverAutoresearchMatrixCampaignArtifacts,
  exportAutoresearchDashboardHtml,
} from "../src/core/runtime.ts";
import { buildResearchObservatoryModel } from "../src/core/runtime-dashboard-model.ts";
import {
  measuredPacket,
  PACKET,
  withDashboardDir,
  writeDashboardPlan,
  writeDashboardSource,
} from "./runtime-dashboard-fixtures.ts";

function model(cwd: string) {
  return buildResearchObservatoryModel(
    buildAutoresearchRuntimeStatus(cwd),
    buildAutoresearchSegmentCloseout(cwd),
    discoverAutoresearchMatrixCampaignArtifacts(cwd),
    "2026-09-10T00:00:00.000Z",
  );
}
test("dark performance HTML is offline, navigable with hash-allowed reading-state refresh", () =>
  withDashboardDir((cwd) => {
    const html = readFileSync(exportAutoresearchDashboardHtml({ cwd }).path, "utf8");
    assert.match(html, /color-scheme: dark/);
    assert.match(html, /#0C1015/);
    assert.match(html, /#F07878/);
    assert.match(html, /max-width:1280px/);
    assert.match(html, /max-width:480px/);
    assert.match(html, /grid-template-columns:1fr/);
    assert.match(html, /:focus-visible\{outline:3px/);
    assert.match(html, /Skip to performance/);
    for (const target of ["research", "measurements", "against", "audit"])
      assert.match(html, new RegExp(`id="${target}"`));
    assert.match(html, /Requirements, not permissions/);
    assert.match(html, /Decision 42/);
    assert.match(html, /Decision 44/);
    assert.match(html, /Decision 45/);
    assert.doesNotMatch(html, /http-equiv="refresh"|setInterval|fetch\(/);
    assert.equal((html.match(/<script>/g) ?? []).length, 3);
    assert.match(html, /script-src 'sha256-/);
    assert.match(html, /Pause live view/);
    assert.match(html, /may be stale/);
    assert.equal(model(cwd).lastObservation, null);
    assert.equal(model(cwd).execution.liveVerified, false);
  }));

test("source text including HTML, tokens and commands remains escaped and inert", () =>
  withDashboardDir((cwd) => {
    const packet = measuredPacket(cwd);
    writeDashboardPlan(cwd);
    packet.closeout.runs[0].description = '<img src=x onerror="launch()"><script>bad()</script>';
    writeDashboardSource(cwd, PACKET, packet);
    const html = readFileSync(exportAutoresearchDashboardHtml({ cwd }).path, "utf8");
    assert.doesNotMatch(html, /<img|<script>bad/);
    assert.match(html, /&lt;img src=x onerror=&quot;launch\(\)&quot;&gt;/);
    assert.match(html, /Raw run report/);
    assert.match(html, /No action is executed here/);
    const widths = [...html.matchAll(/<thead>(.*?)<\/thead>/gs)].map(
      (m) => [...m[1].matchAll(/<th\s/g)].length,
    );
    assert.ok(widths.every((width) => width <= 5));
    assert.equal(
      widths.filter((width) => width === 5).length,
      (html.match(/data-perf-scope /g) ?? []).length,
    );
  }));

test("only clean runtime-owner ledger projection can report running, always source/as-of labeled", () =>
  withDashboardDir((cwd) => {
    const status = buildAutoresearchRuntimeStatus(cwd);
    const closeout = buildAutoresearchSegmentCloseout(cwd);
    const matrix = discoverAutoresearchMatrixCampaignArtifacts(cwd);
    status.runtimeProjection.state = "running_benchmark";
    status.runtimeProjection.source = "receipt_fallback";
    let result = buildResearchObservatoryModel(status, closeout, matrix);
    assert.match(result.execution.state, /unverified/);
    assert.doesNotMatch(result.headline, /owner reports running/);
    status.runtimeProjection.source = "ledger";
    status.runtimeProjection.hasLedger = true;
    status.runtimeProjection.syncIssues = [];
    status.runtimeProjection.rejectedEvents = [];
    status.runtimeProjection.ledgerPath = `${cwd}/autoresearch.events.jsonl`;
    result = buildResearchObservatoryModel(status, closeout, matrix, "2026-09-10T00:00:00.000Z");
    assert.match(result.headline, /owner reports running benchmark/);
    assert.equal(result.execution.source, status.runtimeProjection.ledgerPath);
    assert.equal(result.execution.asOf, "2026-09-10T00:00:00.000Z");
    assert.equal(result.execution.liveVerified, false);
    status.runtimeProjection.syncIssues = ["owner mismatch"];
    assert.match(
      buildResearchObservatoryModel(status, closeout, matrix).execution.state,
      /unverified/,
    );
  }));

test("plain Level 1 receipts remain visible, separate from same-cwd matrix observations", () =>
  withDashboardDir((cwd) => {
    measuredPacket(cwd);
    writeDashboardPlan(cwd);
    const result = model(cwd);
    assert.equal(result.runtimeAttempts.length, 2);
    assert.equal(result.matrix.observedMeasurementCount, 0);
    assert.equal(result.matrix.coverageGapLaneCount, 1);
    assert.ok(
      result.runtimeAttempts.every((a) => a.comparisonWithheld.some((s) => s.includes("scenario"))),
    );
    const html = readFileSync(exportAutoresearchDashboardHtml({ cwd }).path, "utf8");
    assert.match(html, /Local runtime \/ Level 1 receipt support/);
    assert.match(html, /same cwd/);
  }));

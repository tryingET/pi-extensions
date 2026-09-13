import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import test from "node:test";
import { renderAutoresearchDashboardHtml } from "../src/core/runtime-dashboard-html.ts";
import { renderPerformanceChart } from "../src/core/runtime-dashboard-performance.ts";
import { buildPerformanceScopes } from "../src/core/runtime-dashboard-performance-model.ts";
import { DASHBOARD_PERFORMANCE_SCRIPT } from "../src/core/runtime-dashboard-performance-script.ts";
import { atlasBrowser } from "./runtime-dashboard-atlas-dom.ts";
import { withDashboardDir } from "./runtime-dashboard-fixtures.ts";
import {
  renderSyntheticPerformanceFixture,
  syntheticPerformanceFixture,
} from "./runtime-dashboard-performance-fixture.ts";

const fixture = syntheticPerformanceFixture;
function render(f: ReturnType<typeof fixture>) {
  return renderAutoresearchDashboardHtml(f.status, f.closeout, f.matrix);
}

test("synthetic comparable path: 12 reports, 9 keep, explicit 19.1→6.68, not a keep frontier", () =>
  withDashboardDir((cwd) => {
    const f = fixture(cwd);
    const [s, raw] = buildPerformanceScopes(f.model);
    assert.equal(s.comparable, true);
    assert.equal(s.order, "timestamp");
    assert.equal(s.rows.length, 12);
    assert.equal(s.kept, 9);
    assert.equal(s.baseline?.attempt.metric, 19.1);
    assert.equal(s.best[0].attempt.metric, 6.68);
    assert.ok(Math.abs((s.improvement ?? 0) - 65.026178) < 0.00001);
    assert.equal(raw.comparable, false);
    assert.equal(raw.best.length, 0);
    const chart = renderPerformanceChart(s, "baseline");
    assert.match(chart, /<polyline/);
    assert.match(chart, /<polygon/);
    assert.equal((chart.match(/class="perf-dot perf-discard"/g) ?? []).length, 3);
    assert.equal((chart.match(/data-perf-select=/g) ?? []).length, 12);
    assert.match(chart, />100<\/text>/);
    assert.match(chart, />67<\/text>/);
    assert.match(chart, />33<\/text>/);
    assert.match(chart, />0<\/text>/);
    assert.doesNotMatch(renderPerformanceChart(raw, "raw"), /<polyline|<polygon/);
    const a = f.matrix.comparisonGroups[0].attempts;
    a[2].metric = 1; // Discard remains an eligible observation, not accepted cumulative state.
    const changed = buildPerformanceScopes(f.model)[0];
    assert.equal(changed.best[0].attempt.disposition, "discard");
    assert.equal(changed.kept, 9);
  }));

test("zero, negative, nonfinite, ambiguous or absent baseline withholds summary and normalization", () =>
  withDashboardDir((cwd) => {
    for (const value of [0, -1, NaN, Infinity, -Infinity]) {
      const f = fixture(cwd);
      f.matrix.cells[0].lanes[0].attempts[0].metric = value;
      for (const s of buildPerformanceScopes(f.model)) {
        assert.equal(s.baseline, null);
        assert.equal(s.improvement, null);
        assert.equal(s.best.length, 0);
        assert.equal(s.normalizable, false);
      }
      assert.doesNotMatch(render(f), /(?:cx|cy|points)="[^"]*(?:NaN|Infinity)/);
    }
    for (const variant of ["absent", "ambiguous"] as const) {
      const f = fixture(cwd);
      const a = f.matrix.cells[0].lanes[0].attempts;
      a[variant === "absent" ? 0 : 1].outcome =
        variant === "absent" ? "improvement" : "baseline_reference";
      const s = buildPerformanceScopes(f.model)[0];
      assert.equal(s.comparable, true);
      assert.equal(s.baseline, null);
      assert.equal(s.best.length, 0);
    }
  }));

test("higher-is-better and ties are direction-aware; arithmetic overflow fails closed", () =>
  withDashboardDir((cwd) => {
    const f = fixture(cwd);
    const a = f.matrix.comparisonGroups[0].attempts;
    for (const attempt of a) attempt.identity.direction = "higher";
    a[10].metric = 38.2;
    a[11].metric = 38.2;
    let s = buildPerformanceScopes(f.model)[0];
    assert.equal(s.best.length, 2);
    assert.equal(s.improvement, 100);
    assert.match(render(f), /2 tied best reports/);
    assert.match(
      atlasBrowser(render(f)).byId(s.id).querySelector(".perf-stats")?.textContent ?? "",
      /100% higher/,
    );
    a[0].metric = Number.MIN_VALUE;
    s = buildPerformanceScopes(f.model)[0];
    assert.equal(s.normalizable, false);
    assert.equal(s.improvement, null);
    assert.equal(s.best.length, 0);
  }));

test("duplicate IDs, quarantine, failed checks and correctness failures cannot enter comparison or best", () =>
  withDashboardDir((cwd) => {
    for (const patch of [
      { id: "synthetic-performance-run-1" },
      { packetBinding: "quarantined" as const },
      { outcome: "correctness_failure" as const },
      { checks: "failed" },
      { schemaValid: false },
      { lineageValid: false },
      { validMeasurement: false },
    ]) {
      const f = fixture(cwd);
      const a = f.matrix.cells[0].lanes[0].attempts;
      Object.assign(a[11], patch, { metric: 0.001 });
      const scopes = buildPerformanceScopes(f.model);
      assert.ok(scopes.every((s) => !s.comparable && !s.best.length));
      assert.equal(scopes[0].rows.length, 12);
      assert.equal(scopes[0].rows.find((r) => r.attempt === a[11])?.measurable, false);
      assert.doesNotMatch(render(f), /<polyline/);
    }
  }));

test("mixed campaign/lane/scenario/unit/subject/base/evaluator groups and unknown identity never join", () =>
  withDashboardDir((cwd) => {
    for (const field of [
      "scenario",
      "metricName",
      "metricUnit",
      "subject",
      "base",
      "evaluator",
      "direction",
    ] as const) {
      const f = fixture(cwd);
      const a = f.matrix.cells[0].lanes[0].attempts[11];
      a.identity = { ...a.identity, [field]: field === "direction" ? "higher" : "different" };
      assert.ok(buildPerformanceScopes(f.model).every((s) => !s.comparable));
    }
    for (const mutation of [
      "campaign",
      "lane",
      "null",
      "missing-key",
      "withheld",
      "identity-unresolved",
    ] as const) {
      const f = fixture(cwd);
      const g = f.matrix.comparisonGroups[0];
      const a = g.attempts[11];
      if (mutation === "campaign") g.campaignKey = "different campaign";
      if (mutation === "lane") {
        f.matrix.cells[0].lanes[0].attempts = g.attempts.slice(0, 11);
      }
      if (mutation === "null") a.identity.evaluator = null;
      if (mutation === "missing-key") a.comparisonKey = null;
      if (mutation === "withheld") a.comparisonWithheld = ["Unknown protocol"];
      if (mutation === "identity-unresolved") f.matrix.campaigns[0].identityResolved = false;
      assert.ok(buildPerformanceScopes(f.model).every((s) => !s.comparable));
    }
  }));

test("chronology uses timestamps then unique iterations; unknown order is labelled and never connected", () =>
  withDashboardDir((cwd) => {
    const f = fixture(cwd);
    const a = f.matrix.cells[0].lanes[0].attempts;
    a.reverse();
    let s = buildPerformanceScopes(f.model)[0];
    assert.equal(s.rows[0].attempt.iteration, 1);
    assert.equal(s.order, "timestamp");
    for (const attempt of a) attempt.timestamp = null;
    s = buildPerformanceScopes(f.model)[0];
    assert.equal(s.order, "iteration");
    assert.equal(s.rows[0].attempt.iteration, 1);
    for (const attempt of a) attempt.iteration = 1;
    s = buildPerformanceScopes(f.model)[0];
    assert.equal(s.order, "unknown");
    assert.match(renderPerformanceChart(s, "raw"), /Order unknown/);
    assert.doesNotMatch(renderPerformanceChart(s, "raw"), /<polyline/);
    const ids = s.rows.map((r) => r.id);
    a.reverse();
    assert.deepEqual(
      buildPerformanceScopes(f.model)[0].rows.map((r) => r.id),
      ids,
    );
  }));

test("dark primary hierarchy, escaped inert source, third CSP hash, secondary atlas and clean empty plan", () =>
  withDashboardDir((cwd) => {
    const html = renderSyntheticPerformanceFixture(cwd);
    assert.match(html, /SYNTHETIC PERFORMANCE FIXTURE/);
    assert.ok(html.indexOf('id="performance"') < html.indexOf('id="atlas"'));
    assert.match(html, /<details id="exploration" class="exploration"><summary>/);
    assert.match(html, /height:320px/);
    assert.match(html, /#0C1015/);
    assert.match(html, /#171D23/);
    assert.equal(
      new Set([...html.matchAll(/\bid="([^"]+)"/g)].map((m) => m[1])).size,
      [...html.matchAll(/\bid="([^"]+)"/g)].length,
    );
    assert.ok(
      html.includes(
        `'sha256-${createHash("sha256").update(DASHBOARD_PERFORMANCE_SCRIPT).digest("base64")}'`,
      ),
    );
    const f = fixture(cwd);
    const injection = '</script><img onerror="evil()">&"';
    f.matrix.cells[0].lanes[0].attempts[0].description = injection;
    const hostile = render(f);
    assert.doesNotMatch(hostile, /<img|<script>evil/);
    assert.match(hostile, /&lt;\/script&gt;&lt;img/);
    assert.ok(!DASHBOARD_PERFORMANCE_SCRIPT.includes(injection));
    assert.doesNotMatch(
      DASHBOARD_PERFORMANCE_SCRIPT,
      /innerHTML|fetch\(|eval\(|new Function|XMLHttpRequest/,
    );
    const empty = fixture(cwd, "empty");
    empty.matrix.campaigns[0].controllerCompletedActionCount = 6;
    empty.matrix.cells[0].laneProgress = "6 / 12 completed";
    const emptyHtml = render(empty);
    assert.match(emptyHtml, /No measurements/);
    assert.match(emptyHtml, /SYNTHETIC hypothesis/);
    assert.doesNotMatch(emptyHtml, /<svg|<polyline|owner reports running|currently measuring/);
    const unsafe = fixture(cwd, "unsafe");
    const scope = buildPerformanceScopes(unsafe.model)[0];
    assert.equal(scope.rows.length, 12);
    assert.equal(scope.best.length, 0);
    assert.equal(scope.rows.filter((r) => r.measurable).length, 10);
    assert.doesNotMatch(render(unsafe), /<polyline|data-perf-chart="baseline"/);
  }));

test("linked points/rows/details, keyboard activation, mode and exact state survive reload; manual reload pauses", () =>
  withDashboardDir((cwd) => {
    const html = renderSyntheticPerformanceFixture(cwd);
    const first = atlasBrowser(html);
    const scopeId = first.byId("performance-scope").value;
    const root = first.byId(scopeId);
    const rows = root.querySelectorAll("[data-perf-row]");
    const run = rows[5].dataset.perfRow;
    assert.equal(first.byId("performance-mode").value, "baseline");
    const link = first.byId(`${run}-baseline-point`);
    first.document.emit("keydown", link);
    link.emit("click");
    assert.equal(rows[5].attrs.get("aria-selected"), "true");
    assert.equal(first.byId(`${run}-detail`).hidden, false);
    assert.equal(first.document.activeElement?.id, `${run}-summary`);
    assert.equal(root.querySelectorAll("[data-perf-detail]").filter((d) => !d.hidden).length, 1);
    first.byId("performance-mode").value = "raw";
    first.byId("performance-mode").emit("change");
    first.window.emit("pagehide");
    first.tick();
    assert.equal(first.reloads(), 0);
    const second = atlasBrowser(html, first.storage);
    assert.equal(second.byId("performance-scope").value, scopeId);
    assert.equal(second.byId("performance-mode").value, "raw");
    assert.equal(second.byId(`${run}-detail`).open, true);
    assert.equal(second.byId(`${run}-raw-point`).attrs.get("aria-current"), "true");
    second.click(second.byId("watch-reload"));
    assert.equal(second.reloads(), 1);
    const scope = second.byId("performance-scope");
    const options = scope.querySelectorAll("option");
    scope.value = options[1].value;
    scope.emit("change");
    assert.equal(second.byId("performance-mode").disabled, true);
    assert.equal(second.byId(options[0].value).hidden, true);
  }));

test("missing selection is not reassigned and selective performance-storage failure disables refresh only", () =>
  withDashboardDir((cwd) => {
    const html = renderSyntheticPerformanceFixture(cwd);
    const first = atlasBrowser(html);
    const key = "autoresearch-performance:/synthetic-atlas.html";
    const saved = JSON.parse(first.storage.get(key) ?? "{}");
    first.storage.set(key, JSON.stringify({ ...saved, run: "removed-run" }));
    let next = atlasBrowser(html, first.storage);
    assert.match(next.byId("performance-notice").textContent, /run is absent/);
    next.tick();
    assert.equal(next.reloads(), 0);
    assert.equal(
      next
        .byId("performance")
        .querySelectorAll("[data-perf-detail]")
        .filter((d) => !d.hidden).length,
      0,
    );
    first.storage.set(key, JSON.stringify({ ...saved, scope: "removed-scope" }));
    next = atlasBrowser(html, first.storage);
    assert.equal(next.byId("performance-scope").value, "");
    next.tick();
    assert.equal(next.reloads(), 0);
    assert.ok(
      next
        .byId("performance")
        .querySelectorAll("[data-perf-scope]")
        .every((s) => s.hidden),
    );
    const blocked = atlasBrowser(html, new Map(), false, (k) =>
      k.startsWith("autoresearch-performance:"),
    );
    blocked.tick();
    assert.equal(blocked.reloads(), 0);
    assert.equal(blocked.byId("watch-toggle").disabled, true);
    assert.match(blocked.byId("watch-notice").textContent, /performance state cannot be stored/);
    assert.equal(blocked.byId("performance-scope").disabled, false);
    blocked.click(blocked.byId("watch-reload"));
    assert.equal(blocked.reloads(), 1);
  }));

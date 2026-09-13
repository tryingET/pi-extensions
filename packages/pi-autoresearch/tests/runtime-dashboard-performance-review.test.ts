import assert from "node:assert/strict";
import test from "node:test";
import { renderAutoresearchDashboardHtml } from "../src/core/runtime-dashboard-html.ts";
import { buildPerformanceScopes } from "../src/core/runtime-dashboard-performance-model.ts";
import { atlasBrowser } from "./runtime-dashboard-atlas-dom.ts";
import { withDashboardDir } from "./runtime-dashboard-fixtures.ts";
import { syntheticPerformanceFixture } from "./runtime-dashboard-performance-fixture.ts";

function render(f: ReturnType<typeof syntheticPerformanceFixture>) {
  return renderAutoresearchDashboardHtml(f.status, f.closeout, f.matrix);
}
test("review: tiny baseline and best remain nonzero beside a truthful percentage", () =>
  withDashboardDir((cwd) => {
    const f = syntheticPerformanceFixture(cwd);
    const attempts = f.matrix.cells[0].lanes[0].attempts;
    for (const a of attempts) a.metric = 0.0005;
    attempts[0].metric = 0.001;
    const b = atlasBrowser(render(f));
    const stats = b.byId(b.byId("performance-scope").value).querySelector(".perf-stats");
    assert.match(stats?.textContent ?? "", /0\.001 s.*→.*0\.0005 s/);
    assert.match(stats?.textContent ?? "", /50% lower/);
    assert.ok(
      stats
        ?.querySelectorAll(".perf-numeric")
        .some((n) => n.attrs.get("title") === "Exact value: 0.0005 s"),
    );
  }));

test("review: signed tiny/subnormal and large finite metrics expose exact values without zero or overflow", () =>
  withDashboardDir((cwd) => {
    for (const value of [
      0.001,
      -0.0005,
      Number.MIN_VALUE,
      -Number.MIN_VALUE,
      1.23456789e100,
      Number.MAX_VALUE,
      -Number.MAX_VALUE,
      -0,
    ]) {
      const f = syntheticPerformanceFixture(cwd);
      const attempt = f.matrix.cells[0].lanes[0].attempts[1];
      attempt.metric = value;
      const scope = buildPerformanceScopes(f.model)[0];
      const row = scope.rows.find((r) => r.attempt === attempt);
      assert.ok(row);
      const html = render(f);
      const b = atlasBrowser(html);
      const raw = b.byId(`${row.id}-row`).querySelectorAll("[data-perf-value]")[0];
      const numeric = raw.querySelector(".perf-numeric");
      assert.ok(numeric);
      const exact = Object.is(value, -0) ? "-0" : String(value);
      assert.equal(numeric.attrs.get("title"), `Exact value: ${exact} s`);
      assert.equal(numeric.attrs.get("aria-label"), `Exact value: ${exact} s`);
      assert.ok(Number.isFinite(Number.parseFloat(numeric.textContent)));
      if (value !== 0) assert.notEqual(Number.parseFloat(numeric.textContent), 0);
      assert.equal(numeric.textContent.startsWith("-"), value < 0 || Object.is(value, -0));
      assert.match(
        b.byId(`${row.id}-raw-point`).attrs.get("aria-label") ?? "",
        new RegExp(exact.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")),
      );
      assert.doesNotMatch(html, /(?:cx|cy|points)="[^"]*(?:NaN|Infinity)/);
    }
  }));

test("review: tiny signed deltas and improvement retain nonzero magnitude and exact accessible values", () =>
  withDashboardDir((cwd) => {
    const f = syntheticPerformanceFixture(cwd);
    const attempts = f.matrix.cells[0].lanes[0].attempts;
    for (const a of attempts) a.metric = 1;
    attempts[1].metric = 1 - 1e-8;
    attempts[2].metric = 1 + 1e-8;
    const s = buildPerformanceScopes(f.model)[0];
    const b = atlasBrowser(render(f));
    for (const index of [1, 2]) {
      const r = s.rows.find((r) => r.attempt === attempts[index]);
      assert.ok(r);
      const delta = b.byId(`${r.id}-row`).querySelectorAll("td")[3].querySelector(".perf-numeric");
      assert.ok(delta);
      const exact = ((attempts[index].metric as number) - 1) * 100;
      assert.equal(delta.attrs.get("title"), `Exact value: ${exact > 0 ? "+" : ""}${exact}%`);
      assert.notEqual(Number.parseFloat(delta.textContent), 0);
      assert.equal(delta.textContent[0], index === 1 ? "-" : "+");
    }
    const improvement = b
      .byId(s.id)
      .querySelector(".perf-stats")
      ?.querySelectorAll(".perf-numeric")[2];
    assert.ok(improvement);
    assert.notEqual(Number.parseFloat(improvement.textContent), 0);
  }));

test("review: kept contrary/uncertain verdicts stay separate and visible in the run table", () =>
  withDashboardDir((cwd) => {
    for (const [outcome, label, color] of [
      ["regression", "Regression", "against"],
      ["inconclusive", "Inconclusive", "uncertain"],
      ["resource_censored", "Resource censored", "uncertain"],
    ] as const) {
      const f = syntheticPerformanceFixture(cwd);
      const a = f.matrix.cells[0].lanes[0].attempts[1];
      a.outcome = outcome;
      const s = buildPerformanceScopes(f.model)[0];
      const r = s.rows.find((r) => r.attempt === a);
      assert.ok(r);
      const b = atlasBrowser(render(f));
      const cell = b.byId(`${r.id}-row`).querySelectorAll("td")[1];
      assert.equal(cell.querySelector(".supported")?.textContent, "keep");
      assert.match(cell.querySelector(`.${color}`)?.textContent ?? "", new RegExp(label));
      assert.equal(cell.attrs.get("class"), undefined); // not an all-green status cell
    }
  }));

test("review: chart/table registered scroll regions restore both axes and legacy state defaults x to zero", () =>
  withDashboardDir((cwd) => {
    const html = render(syntheticPerformanceFixture(cwd));
    const first = atlasBrowser(html);
    const scope = first.byId("performance-scope").value;
    for (const [suffix, x, y] of [
      ["chart", 180, 4],
      ["table", 225, 80],
    ] as const) {
      const el = first.byId(`${scope}-${suffix}`);
      assert.ok(el.hasAttribute("data-reading-scroll"));
      el.scrollLeft = x;
      el.scrollTop = y;
    }
    first.click(first.byId("watch-reload"));
    const next = atlasBrowser(html, first.storage);
    assert.equal(next.byId(`${scope}-chart`).scrollLeft, 180);
    assert.equal(next.byId(`${scope}-chart`).scrollTop, 4);
    assert.equal(next.byId(`${scope}-table`).scrollLeft, 225);
    assert.equal(next.byId(`${scope}-table`).scrollTop, 80);
    const key = "autoresearch-observatory:/synthetic-atlas.html";
    const saved = JSON.parse(first.storage.get(key) ?? "{}");
    for (const port of saved.scrollPorts) delete port.x;
    first.storage.set(key, JSON.stringify(saved));
    const legacy = atlasBrowser(html, first.storage);
    assert.equal(legacy.byId(`${scope}-chart`).scrollLeft, 0);
    assert.equal(legacy.byId(`${scope}-table`).scrollTop, 80);
  }));

test("density: one toolbar owns native controls; long metadata moves to owner disclosure", () =>
  withDashboardDir((cwd) => {
    const f = syntheticPerformanceFixture(cwd);
    const html = render(f);
    const b = atlasBrowser(html);
    const toolbar = b.byId("performance").querySelector(".perf-toolbar");
    assert.ok(toolbar);
    for (const id of [
      "performance-scope",
      "performance-mode",
      "watch-toggle",
      "watch-reload",
      "watch-notice",
    ])
      assert.ok(toolbar.contains(b.byId(id)), id);
    assert.equal(b.byId("watch-notice").attrs.get("aria-live"), "polite");
    assert.equal(b.byId("watch-toggle").attrs.get("aria-label"), "Pause live view");
    assert.ok(b.byId("owner-context").querySelector(".repo"));
    assert.match(b.byId("owner-context").textContent, /reloading does not advance work/);
    assert.equal(b.document.querySelector(".masthead")?.querySelector(".repo"), null);
    const scope = b.byId(b.byId("performance-scope").value);
    assert.equal(
      scope.querySelector(".perf-scope-title")?.textContent,
      scope.attrs.get("aria-label"),
    );
    assert.ok(scope.querySelector(".perf-badge")?.textContent.includes("Comparable group"));
    assert.match(html, /height:320px/);
    assert.match(html, /\.perf-toolbar:has\(\.perf-controls:not\(\[hidden\]\)\)/);
  }));

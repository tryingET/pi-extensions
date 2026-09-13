import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import test from "node:test";
import { buildAtlasNodes, contribution } from "../src/core/runtime-dashboard-atlas-model.ts";
import { DASHBOARD_ATLAS_SCRIPT } from "../src/core/runtime-dashboard-atlas-script.ts";
import { renderAutoresearchDashboardHtml } from "../src/core/runtime-dashboard-html.ts";
import { DASHBOARD_PERFORMANCE_SCRIPT } from "../src/core/runtime-dashboard-performance-script.ts";
import { DASHBOARD_REFRESH_SCRIPT } from "../src/core/runtime-dashboard-refresh.ts";
import { atlasBrowser } from "./runtime-dashboard-atlas-dom.ts";
import {
  renderSyntheticAtlasFixture,
  syntheticAtlasFixture,
} from "./runtime-dashboard-atlas-fixture.ts";
import { withDashboardDir } from "./runtime-dashboard-fixtures.ts";

test("atlas retains campaign/cell/lane/attempt containment, not causality or a newest winner", () =>
  withDashboardDir((cwd) => {
    const fixture = syntheticAtlasFixture(cwd);
    const nodes = buildAtlasNodes(fixture.model);
    assert.equal(nodes.length, 6);
    assert.equal(nodes[0].label, nodes[3].label);
    assert.notEqual(nodes[0].id, nodes[3].id);
    const html = renderSyntheticAtlasFixture(cwd);
    assert.equal((html.match(/data-atlas-cell=/g) ?? []).length, 6);
    assert.equal((html.match(/data-atlas-attempt="/g) ?? []).length, 24);
    assert.equal((html.match(/data-atlas-attempt-detail/g) ?? []).length, 24);
    assert.equal(
      new Set([...html.matchAll(/\bid="([^"]+)"/g)].map((m) => m[1])).size,
      [...html.matchAll(/\bid="([^"]+)"/g)].length,
    );
    assert.match(html, /Lines show containment only, never causality/);
    assert.match(html, /non-comparable/);
    assert.doesNotMatch(html, /<polyline|<canvas|\+\d+%|combined gain|proven compatible/i);
    assert.ok(html.indexOf('id="atlas"') < html.indexOf('id="levels"'));
    assert.match(html, /Raw run report/);
    assert.match(html, /No attempts · untested/);
    assert.equal(html, renderSyntheticAtlasFixture(cwd));
  }));

test("source injection remains inert in every map, fact, attribute and raw audit surface; all three scripts hash pinned", () =>
  withDashboardDir((cwd) => {
    const { status, closeout, matrix } = syntheticAtlasFixture(cwd);
    const payload = '</script><img src=x onerror="evil()"><script>evil()</script>&"\' @';
    matrix.campaigns[0].key = payload;
    matrix.cells[0].hypothesis = payload;
    matrix.cells[0].lanes[0].attempts[0].raw = {
      experiment: { candidate: { filesChanged: [payload] } },
    };
    const html = renderAutoresearchDashboardHtml(status, closeout, matrix);
    assert.doesNotMatch(html, /<img|<script>evil/);
    assert.match(html, /&lt;\/script&gt;&lt;img/);
    const scripts = [...html.matchAll(/<script>([\s\S]*?)<\/script>/g)].map((m) => m[1]);
    assert.deepEqual(scripts, [
      DASHBOARD_ATLAS_SCRIPT,
      DASHBOARD_PERFORMANCE_SCRIPT,
      DASHBOARD_REFRESH_SCRIPT,
    ]);
    for (const script of scripts) {
      assert.ok(html.includes(`'sha256-${createHash("sha256").update(script).digest("base64")}'`));
      assert.doesNotMatch(script, /innerHTML|eval\(|new Function|fetch\(|XMLHttpRequest/);
      assert.ok(!script.includes(payload));
    }
    const browser = atlasBrowser(html);
    browser.pick(0);
    browser.pick(1);
    assert.ok(browser.byId("stack-evidence").textContent.includes(payload));
  }));

test("contributions cannot upgrade quarantined, invalid or unevaluated reports to support", () =>
  withDashboardDir((cwd) => {
    const fixture = syntheticAtlasFixture(cwd);
    const a = fixture.matrix.cells[0].lanes[0].attempts[1];
    assert.equal(contribution(a), "signal");
    for (const patch of [
      { packetBinding: "quarantined" as const },
      { schemaValid: false },
      { lineageValid: false },
      { validMeasurement: false },
      { outcome: "not_evaluated" as const },
    ]) {
      assert.equal(contribution({ ...a, ...patch }), "unknown");
    }
    fixture.matrix.unresolvedPackets.push({ ...a, id: "unresolved", packetBinding: "quarantined" });
    fixture.model.runtimeAttempts.push({ ...a, id: "local" });
    const nodes = buildAtlasNodes(fixture.model);
    assert.equal(nodes.at(-1)?.kind, "unresolved reports");
    assert.equal(nodes.at(-2)?.kind, "local receipts");
    assert.notEqual(nodes.at(-1)?.campaign, nodes[0].campaign);
  }));

test("filter/search, inspector, stack pair selection and restore work without invoking owner actions", () =>
  withDashboardDir((cwd) => {
    // This test exercises complete matching/disjoint facts using only eligible reports.
    // The standard mixed-validity fixture correctly reports incomplete facts instead.
    const { status, closeout, matrix } = syntheticAtlasFixture(cwd);
    for (const cell of matrix.cells)
      for (const lane of cell.lanes)
        lane.attempts = lane.attempts.filter((a) => a.validMeasurement);
    const html = renderAutoresearchDashboardHtml(status, closeout, matrix);
    const first = atlasBrowser(html);
    const cells = first.document.querySelectorAll("[data-atlas-cell]");
    const links = first.document.querySelectorAll(".atlas-node");
    first.click(links[1]);
    assert.equal(
      first.document.querySelectorAll("[data-atlas-panel]").filter((p) => !p.hidden)[0].id,
      cells[1].dataset.atlasCell,
    );
    first.pick(0);
    first.pick(1);
    assert.match(
      first.byId("stack-evidence").textContent,
      /Same reported fields — not compatibility/,
    );
    assert.match(
      first.byId("stack-evidence").textContent,
      /No reported file overlap — interaction untested/,
    );
    assert.doesNotMatch(first.byId("stack-evidence").textContent, /compatible|stackable|\d+%/);
    first.pick(3);
    first.byId("stack-right").value = cells[3].dataset.atlasCell;
    first.byId("stack-right").emit("change");
    assert.match(
      first.byId("stack-evidence").textContent,
      /Different campaigns — isolated evidence/,
    );
    first.input("atlas-search", "smaller invalidation");
    assert.equal(cells.filter((c) => !c.hidden).length, 2);
    first.input("atlas-filter", "signal");
    first.tick();
    assert.equal(first.reloads(), 0);
    first.window.emit("pagehide");
    const second = atlasBrowser(html, first.storage);
    assert.equal(second.byId("atlas-search").value, "smaller invalidation");
    assert.equal(second.byId("atlas-filter").value, "signal");
    assert.equal(
      second.document.querySelectorAll("[data-stack-pick]").filter((p) => p.checked).length,
      3,
    );
    assert.equal(second.byId("stack-right").value, cells[3].dataset.atlasCell);
    assert.match(second.byId("watch-notice").textContent, /Paused/);
    second.input("atlas-search", "nothing matches this");
    assert.equal(second.byId("atlas-no-results").hidden, false);
    second.click(second.byId("atlas-reset"));
    assert.equal(
      second.document.querySelectorAll("[data-atlas-cell]").filter((c) => !c.hidden).length,
      6,
    );
    second.click(second.byId("stack-clear"));
    assert.match(second.byId("stack-evidence").textContent, /Choose two different/);
  }));

test("unknown stack pairs remain explorable; denied storage does not disable exploration", () =>
  withDashboardDir((cwd) => {
    const browser = atlasBrowser(renderSyntheticAtlasFixture(cwd), new Map(), true);
    browser.pick(2);
    browser.pick(5);
    assert.match(browser.byId("stack-evidence").textContent, /Unknown \/ incomplete evidence/);
    assert.match(browser.byId("stack-evidence").textContent, /Different campaigns/);
    assert.equal(browser.byId("watch-toggle").disabled, true);
    browser.tick();
    assert.equal(browser.reloads(), 0);
    assert.ok(browser.document.querySelectorAll("[data-atlas-enhanced]").every((c) => !c.hidden));
  }));

test("empty map draws no fabricated nodes and static source HTML retains accessible controls and evidence", () =>
  withDashboardDir((cwd) => {
    const html = renderSyntheticAtlasFixture(cwd, "empty");
    assert.match(html, /No experiment evidence yet/);
    assert.doesNotMatch(html, /data-atlas-cell=/);
    const browser = atlasBrowser(html);
    assert.match(browser.byId("stack-evidence").textContent, /Choose two different/);
    const rich = renderSyntheticAtlasFixture(cwd);
    assert.match(rich, /<details class="atlas-panel"/);
    assert.match(rich, /<summary id="atlas-/);
    assert.match(rich, /data-atlas-enhanced hidden/);
    assert.match(rich, /min-height:44px/);
    assert.match(rich, /prefers-reduced-motion:reduce/);
  }));

test("keyboard attempt selection restores focus, nested reading scroll and detail without two-second interruption", () =>
  withDashboardDir((cwd) => {
    const html = renderSyntheticAtlasFixture(cwd);
    const first = atlasBrowser(html);
    const link = first.document.querySelectorAll("[data-atlas-attempt]")[8];
    first.document.emit("keydown", link);
    link.emit("click");
    const detailId = link.dataset.atlasAttempt;
    assert.equal(first.byId(detailId).open, true);
    assert.equal(first.document.activeElement?.id, `${detailId}-summary`);
    first.byId("atlas-map").scrollTop = 220;
    first.byId("atlas-inspector").scrollTop = 140;
    first.tick();
    assert.equal(first.reloads(), 0);
    first.window.emit("pagehide");
    const second = atlasBrowser(html, first.storage);
    assert.equal(second.byId(detailId).open, true);
    assert.equal(second.document.activeElement?.id, `${detailId}-summary`);
    assert.equal(second.byId("atlas-map").scrollTop, 220);
    assert.equal(second.byId("atlas-inspector").scrollTop, 140);
    second.click(second.byId("watch-toggle"));
    second.tick();
    assert.equal(second.reloads(), 1);
  }));

test("missing selected identity is not reassigned; changed detail layout pauses unattended refresh", () =>
  withDashboardDir((cwd) => {
    const html = renderSyntheticAtlasFixture(cwd);
    const first = atlasBrowser(html);
    first.tick();
    assert.equal(first.reloads(), 1);
    const key = "autoresearch-atlas:/synthetic-atlas.html";
    const saved = JSON.parse(first.storage.get(key) ?? "{}");
    first.storage.set(key, JSON.stringify({ ...saved, selected: "removed-experiment" }));
    const second = atlasBrowser(
      html.replace("Raw run report", "Changed source report"),
      first.storage,
    );
    assert.ok(second.document.querySelectorAll("[data-atlas-panel]").every((p) => p.hidden));
    assert.match(second.byId("atlas-selection-notice").textContent, /absent/);
    second.tick();
    assert.equal(second.reloads(), 0);
    assert.match(second.byId("watch-notice").textContent, /Paused/);
  }));

test("even duplicate attempt IDs remain separate graph occurrences and source history", () =>
  withDashboardDir((cwd) => {
    const { model } = syntheticAtlasFixture(cwd);
    const lane = model.matrix.cells[0].lanes[0];
    lane.attempts.push({ ...lane.attempts[0], packetBinding: "quarantined" });
    const nodes = buildAtlasNodes(model);
    assert.equal(nodes[0].lanes[0].attempts.length, 4);
    assert.equal(contribution(nodes[0].lanes[0].attempts[3]), "unknown");
  }));

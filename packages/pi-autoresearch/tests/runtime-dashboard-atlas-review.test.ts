import assert from "node:assert/strict";
import test from "node:test";
import { buildAtlasNodes } from "../src/core/runtime-dashboard-atlas-model.ts";
import { renderAutoresearchDashboardHtml } from "../src/core/runtime-dashboard-html.ts";
import type { DashboardAttempt } from "../src/core/runtime-matrix-model.ts";
import { atlasBrowser } from "./runtime-dashboard-atlas-dom.ts";
import {
  renderSyntheticAtlasFixture,
  syntheticAtlasFixture,
} from "./runtime-dashboard-atlas-fixture.ts";
import { withDashboardDir } from "./runtime-dashboard-fixtures.ts";

const fields = ["Subject", "Base", "Changed files"];
function foreign(a: DashboardAttempt): DashboardAttempt {
  return {
    ...a,
    packetBinding: "quarantined",
    identity: { ...a.identity, subject: "foreign subject", base: "b".repeat(40) },
    raw: { experiment: { candidate: { filesChanged: ["foreign.ts"] } } },
  };
}

test("review: quarantined-only history cannot supply experiment stack facts or completeness", () =>
  withDashboardDir((cwd) => {
    const { model, status, closeout, matrix } = syntheticAtlasFixture(cwd);
    const cell = model.matrix.cells[0];
    const a = foreign(cell.lanes[0].attempts[0]);
    cell.lanes = [{ ...cell.lanes[0], attempts: [a] }];
    const node = buildAtlasNodes(model)[0];
    for (const field of fields)
      assert.deepEqual(node.facts[field], { values: [], complete: false });
    assert.equal(node.lanes[0].attempts[0], a, "quarantined report remains inspectable");
    const html = renderAutoresearchDashboardHtml(status, closeout, matrix);
    assert.match(html, /Quarantined source history/);
    assert.match(html, /foreign.ts/, "source audit still retains the quarantined file");
    const browser = atlasBrowser(html);
    browser.pick(0);
    browser.pick(1);
    assert.doesNotMatch(browser.byId("stack-evidence").textContent, /foreign.ts|foreign subject/);
    assert.equal(node.facts.Hypothesis.complete, true, "declared hypothesis remains separate");
  }));

test("review: mixed bound and foreign history excludes foreign values without inventing completeness", () =>
  withDashboardDir((cwd) => {
    const { model } = syntheticAtlasFixture(cwd);
    const cell = model.matrix.cells[0];
    const bound = cell.lanes[0].attempts[0];
    cell.lanes = [{ ...cell.lanes[0], attempts: [bound, foreign(bound)] }];
    const node = buildAtlasNodes(model)[0];
    assert.deepEqual(node.facts.Subject, { values: [bound.identity.subject], complete: false });
    assert.deepEqual(node.facts.Base, { values: [bound.identity.base], complete: false });
    assert.deepEqual(node.facts["Changed files"], { values: ["src/index.ts"], complete: false });
    assert.equal(node.lanes[0].attempts.length, 2);
  }));

test("review: unbound, invalid and structurally unverified reports never supply stack facts", () =>
  withDashboardDir((cwd) => {
    const { model } = syntheticAtlasFixture(cwd);
    const cell = model.matrix.cells[0];
    const valid = cell.lanes[0].attempts[0];
    for (const patch of [
      { packetBinding: "not_required" as const },
      { validMeasurement: false },
      { schemaValid: false },
      { lineageValid: false },
    ]) {
      cell.lanes = [{ ...cell.lanes[0], attempts: [{ ...valid, ...patch }] }];
      const node = buildAtlasNodes(model)[0];
      for (const field of fields)
        assert.deepEqual(node.facts[field], { values: [], complete: false });
    }
    cell.lanes = [{ ...cell.lanes[0], attempts: [] }];
    for (const field of fields)
      assert.equal(buildAtlasNodes(model)[0].facts[field].complete, false);
  }));

test("review: atlas-key-only startup storage denial disables refresh despite working reading key", () =>
  withDashboardDir((cwd) => {
    const browser = atlasBrowser(renderSyntheticAtlasFixture(cwd), new Map(), false, (key) =>
      key.startsWith("autoresearch-atlas:"),
    );
    assert.ok(browser.storage.has("autoresearch-observatory:/synthetic-atlas.html"));
    assert.equal(browser.byId("watch-toggle").disabled, true);
    assert.match(browser.byId("watch-notice").textContent, /atlas.*Reload manually/);
    browser.tick();
    assert.equal(browser.reloads(), 0);
    browser.pick(0);
    browser.pick(1);
    assert.match(browser.byId("stack-evidence").textContent, /Same campaign/);
  }));

test("review: larger atlas-key quota failure latches manual mode even when later writes succeed", () =>
  withDashboardDir((cwd) => {
    let rejectLarge = true;
    const browser = atlasBrowser(
      renderSyntheticAtlasFixture(cwd),
      new Map(),
      false,
      (key, value) => rejectLarge && key.startsWith("autoresearch-atlas:") && value.length > 512,
    );
    assert.equal(browser.byId("watch-toggle").disabled, false);
    browser.input("atlas-search", "x".repeat(2048));
    assert.equal(browser.byId("watch-toggle").disabled, true);
    assert.match(browser.byId("watch-notice").textContent, /atlas.*Reload manually/);
    rejectLarge = false;
    browser.input("atlas-search", "");
    // Even a synthetic click must not reopen an unsafe refresh schedule.
    browser.byId("watch-toggle").emit("click");
    browser.tick();
    assert.equal(browser.reloads(), 0);
    assert.equal(browser.byId("watch-toggle").disabled, true);
  }));

test("review: semantic click-only activation pauses refresh; explicit watch click still resumes", () =>
  withDashboardDir((cwd) => {
    const browser = atlasBrowser(renderSyntheticAtlasFixture(cwd));
    const link = browser.document.querySelectorAll("[data-atlas-attempt]")[1];
    browser.document.emit("click", link);
    link.emit("click");
    assert.equal(browser.byId(link.dataset.atlasAttempt).open, true);
    browser.tick();
    assert.equal(browser.reloads(), 0);
    assert.match(browser.byId("watch-notice").textContent, /Paused/);
    const watch = browser.byId("watch-toggle");
    browser.document.emit("click", watch);
    watch.emit("click");
    browser.tick();
    assert.equal(browser.reloads(), 1);
  }));

test("review: valid-only fields remain available but an untested lane prevents completeness", () =>
  withDashboardDir((cwd) => {
    const { model } = syntheticAtlasFixture(cwd);
    const cell = model.matrix.cells[0];
    const valid = cell.lanes[0].attempts[0];
    cell.lanes = [{ ...cell.lanes[0], attempts: [valid] }];
    for (const field of fields) assert.equal(buildAtlasNodes(model)[0].facts[field].complete, true);
    cell.lanes.push({ ...cell.lanes[0], laneId: "untested", attempts: [] });
    for (const field of fields)
      assert.equal(buildAtlasNodes(model)[0].facts[field].complete, false);
    assert.equal(buildAtlasNodes(model)[0].facts.Base.values[0], valid.identity.base);
  }));

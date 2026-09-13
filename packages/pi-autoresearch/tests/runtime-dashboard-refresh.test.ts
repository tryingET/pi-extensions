import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import test from "node:test";
import { runInNewContext } from "node:vm";
import { exportAutoresearchDashboardHtml } from "../src/core/runtime.ts";
import { DASHBOARD_ATLAS_SCRIPT } from "../src/core/runtime-dashboard-atlas-script.ts";
import { DASHBOARD_REFRESH_SCRIPT } from "../src/core/runtime-dashboard-refresh.ts";
import { withDashboardDir } from "./runtime-dashboard-fixtures.ts";

function browser(saved: string | null = null, denied = false) {
  let stored = saved;
  let tick: (() => void) | undefined;
  let click: (() => void) | undefined;
  let reloads = 0;
  let scroll = 350;
  const summary = { textContent: "Source issues", focus: () => {}, closest: () => null };
  const panel = { open: false, querySelector: () => summary, hasAttribute: () => false };
  const button = {
    textContent: "",
    disabled: false,
    setAttribute: () => {},
    addEventListener: (_: string, fn: () => void) => {
      click = fn;
    },
  };
  const notice = { textContent: "" };
  const document = {
    hidden: false,
    addEventListener: () => {},
    activeElement: summary,
    getElementById: (id: string) =>
      id === "watch-toggle" ? button : id === "watch-notice" ? notice : null,
    querySelectorAll: () => [panel],
  };
  runInNewContext(DASHBOARD_REFRESH_SCRIPT, {
    document,
    window: { addEventListener: () => {} },
    location: {
      pathname: "/dashboard.html",
      reload: () => {
        reloads++;
      },
    },
    sessionStorage: {
      getItem: () => stored,
      setItem: (_: string, value: string) => {
        if (denied) throw Error("blocked");
        stored = value;
      },
    },
    scrollY: scroll,
    scrollTo: (_: number, y: number) => {
      scroll = y;
    },
    requestAnimationFrame: (fn: () => void) => fn(),
    getSelection: () => "",
    setTimeout: (fn: () => void) => {
      tick = fn;
      return 1;
    },
    clearTimeout: () => {
      tick = undefined;
    },
  });
  return {
    button,
    notice,
    panel,
    document,
    tick: () => tick?.(),
    click: () => click?.(),
    stored: () => stored,
    reloads: () => reloads,
    scroll: () => scroll,
  };
}

test("refresh saves open details and scroll, restoring them after reload without dispatch", () => {
  const first = browser();
  first.panel.open = true;
  first.tick();
  assert.equal(first.reloads(), 1);
  const second = browser(first.stored());
  assert.equal(second.panel.open, true);
  assert.equal(second.scroll(), 350);
  assert.match(second.notice.textContent, /Auto-refresh · 2s/);
});

test("pause persists; hidden tabs do not reload; denied storage fails to manual mode", () => {
  const first = browser();
  first.click();
  first.tick();
  assert.equal(first.reloads(), 0);
  assert.match(browser(first.stored()).notice.textContent, /Paused/);
  const hidden = browser();
  hidden.document.hidden = true;
  hidden.tick();
  assert.equal(hidden.reloads(), 0);
  const blocked = browser(null, true);
  blocked.tick();
  assert.equal(blocked.reloads(), 0);
  assert.equal(blocked.button.disabled, true);
  assert.match(blocked.notice.textContent, /Reload manually/);
});

test("CSP allows only the exact refresh script, never interpolated source or network code", () =>
  withDashboardDir((cwd) => {
    const html = readFileSync(exportAutoresearchDashboardHtml({ cwd }).path, "utf8");
    const digest = createHash("sha256").update(DASHBOARD_REFRESH_SCRIPT).digest("base64");
    assert.ok(html.includes(`'sha256-${digest}'`));
    assert.equal(html.match(/<script>/g)?.length, 3);
    assert.ok(html.includes(`<script>${DASHBOARD_REFRESH_SCRIPT}</script>`));
    assert.ok(html.includes(`<script>${DASHBOARD_ATLAS_SCRIPT}</script>`));
    assert.doesNotMatch(DASHBOARD_REFRESH_SCRIPT, /fetch\(|XMLHttpRequest|eval\(|new Function/);
  }));

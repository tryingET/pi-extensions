// summary: "Validates display detection and activity-strip compatibility reports for headless, niri, and multi-display sessions."
// read_when:
//   - "Changing graphical-session detection, compatibility blockers, warnings, or report formatting."

import assert from "node:assert/strict";
import test from "node:test";
import {
  assessActivityStripCompatibility,
  detectDisplayCount,
  detectDisplayServer,
  detectWindowManager,
  formatCompatibilityReport,
} from "../src/common/compatibility.mjs";

test("detectDisplayServer distinguishes wayland, x11, and headless sessions", () => {
  assert.equal(detectDisplayServer({ WAYLAND_DISPLAY: "wayland-1" }), "wayland");
  assert.equal(detectDisplayServer({ DISPLAY: ":1" }), "x11");
  assert.equal(detectDisplayServer({}), "headless");
});

test("detectWindowManager prefers niri and falls back to desktop hints", () => {
  assert.equal(detectWindowManager({ NIRI_SOCKET: "/tmp/niri.sock" }), "niri");
  assert.equal(detectWindowManager({ XDG_CURRENT_DESKTOP: "GNOME" }), "GNOME");
  assert.equal(detectWindowManager({}), null);
});

test("detectDisplayCount parses niri output listings when available", async () => {
  const count = await detectDisplayCount({
    env: { NIRI_SOCKET: "/tmp/niri.sock" },
    async execFileAsyncImpl() {
      return {
        stdout: JSON.stringify([{ name: "HDMI-A-1" }, { name: "DP-1" }]),
        stderr: "",
      };
    },
  });

  assert.equal(count, 2);
});

test("assessActivityStripCompatibility fails closed for headless sessions", async () => {
  const report = await assessActivityStripCompatibility({ env: {} });

  assert.equal(report.ok, false);
  assert.match(report.blockers.join("\n"), /No graphical display session detected/i);
});

test("assessActivityStripCompatibility fails closed when niri has no connected outputs", async () => {
  const report = await assessActivityStripCompatibility({
    env: {
      WAYLAND_DISPLAY: "wayland-1",
      NIRI_SOCKET: "/tmp/niri.sock",
    },
    async execFileAsyncImpl() {
      return { stdout: "{}", stderr: "" };
    },
  });

  assert.equal(report.ok, false);
  assert.equal(report.displayCount, 0);
  assert.match(report.blockers.join("\n"), /no connected display outputs/i);
  assert.match(formatCompatibilityReport(report), /Turn on or reconnect the monitor/i);
});

test("assessActivityStripCompatibility reports multi-display warnings and niri alignment", async () => {
  const report = await assessActivityStripCompatibility({
    env: {
      WAYLAND_DISPLAY: "wayland-1",
      NIRI_SOCKET: "/tmp/niri.sock",
      PI_ACTIVITY_STRIP_CLICK_THROUGH: "0",
    },
    async execFileAsyncImpl() {
      return {
        stdout: JSON.stringify([{ name: "HDMI-A-1" }, { name: "DP-1" }]),
        stderr: "",
      };
    },
  });

  assert.equal(report.ok, true);
  assert.equal(report.displayServer, "wayland");
  assert.equal(report.windowManager, "niri");
  assert.equal(report.alignmentMode, "layer-shell");
  assert.equal(report.displayCount, 2);
  assert.equal(report.clickThroughDefault, false);
  assert.match(report.warnings.join("\n"), /primary display only/i);
  assert.match(formatCompatibilityReport(report), /Compatibility: compatible/);

  const clickThroughReport = await assessActivityStripCompatibility({
    env: {
      WAYLAND_DISPLAY: "wayland-1",
      PI_ACTIVITY_STRIP_CLICK_THROUGH: "1",
    },
  });
  assert.equal(clickThroughReport.clickThroughDefault, true);
  assert.match(formatCompatibilityReport(clickThroughReport), /Click-through mode: enabled/);
});

test("native compatibility reports the layer-shell backend on Niri", async () => {
  const report = await assessActivityStripCompatibility({
    env: { WAYLAND_DISPLAY: "wayland-1", NIRI_SOCKET: "/tmp/niri.sock" },
    async execFileAsyncImpl() {
      return { stdout: JSON.stringify([{ name: "DP-1" }]), stderr: "" };
    },
  });

  assert.equal(report.ok, true);
  assert.equal(report.backend, "native");
  assert.equal(report.alignmentMode, "layer-shell");
  assert.match(formatCompatibilityReport(report), /Backend: native/);
});

test("native compatibility rejects unsupported packaged architectures", async () => {
  const report = await assessActivityStripCompatibility({
    env: { WAYLAND_DISPLAY: "wayland-1" },
    platform: "linux",
    arch: "arm64",
  });
  assert.equal(report.ok, false);
  assert.match(report.blockers.join("\n"), /requires Linux x64/i);
});

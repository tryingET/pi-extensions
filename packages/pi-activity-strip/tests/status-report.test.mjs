import assert from "node:assert/strict";
import test from "node:test";
import {
  formatBrokerRuntimeStatus,
  summarizeBrokerRuntimeStatus,
} from "../src/common/status-report.mjs";

test("formatBrokerRuntimeStatus renders runtime warnings and readiness metadata", () => {
  const text = formatBrokerRuntimeStatus({
    ok: true,
    runtimeStatus: {
      state: "ready",
      displayServer: "wayland",
      windowManager: "niri",
      alignmentMode: "niri",
      displayCount: 2,
      windowVisible: true,
      warnings: ["Detected 2 displays; the strip currently renders on the primary display only."],
    },
  });

  assert.match(text, /^running \(ready\)$/m);
  assert.match(text, /display: wayland/);
  assert.match(text, /window manager: niri/);
  assert.match(text, /displays: 2/);
  assert.match(text, /window visible: yes/);
  assert.match(text, /warnings:/);
});

test("summarizeBrokerRuntimeStatus returns operator headlines", () => {
  assert.deepEqual(summarizeBrokerRuntimeStatus({ ok: false }), {
    headline: "Activity strip is stopped",
    level: "warning",
  });

  assert.deepEqual(summarizeBrokerRuntimeStatus({ ok: true, runtimeStatus: { state: "ready" } }), {
    headline: "Activity strip is running and ready",
    level: "info",
  });

  assert.deepEqual(summarizeBrokerRuntimeStatus({ ok: true, runtimeStatus: { state: "error" } }), {
    headline: "Activity strip reported an error",
    level: "error",
  });
});

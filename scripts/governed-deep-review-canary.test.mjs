import assert from "node:assert/strict";
import { realpathSync } from "node:fs";
import { fileURLToPath } from "node:url";
import test from "node:test";
import { createPiHarness } from "./governed-deep-review-canary.mjs";
import { registerSubagentDashboard } from "../packages/pi-autonomous-session-control/extensions/self/subagent-dashboard.ts";

const ownerPath = fileURLToPath(
  new URL("../packages/pi-autonomous-session-control/extensions/self/subagent-dashboard.ts", import.meta.url),
);

function loadDashboard(value) {
  const previous = process.env.PI_ASC_COCKPIT_SHORTCUT;
  try {
    if (value === undefined) delete process.env.PI_ASC_COCKPIT_SHORTCUT;
    else process.env.PI_ASC_COCKPIT_SHORTCUT = value;
    const harness = createPiHarness();
    // Registration must not read state, create timers, or launch children.
    harness.load(ownerPath, registerSubagentDashboard, {});
    return harness;
  } finally {
    if (previous === undefined) delete process.env.PI_ASC_COCKPIT_SHORTCUT;
    else process.env.PI_ASC_COCKPIT_SHORTCUT = previous;
  }
}

test("harness retains shortcut owner, description, and async handler; re-registration replaces", async () => {
  const harness = createPiHarness();
  const ctx = {};
  let received;
  const handler = async (context) => {
    await Promise.resolve();
    received = context;
  };
  harness.load(ownerPath, (pi) => {
    pi.registerShortcut("ctrl+alt+shift+s", { handler: () => assert.fail("stale handler") });
    pi.registerShortcut("ctrl+alt+shift+s", { description: "test shortcut", handler });
  });
  assert.equal(harness.shortcuts.size, 1);
  const registration = harness.shortcuts.get("ctrl+alt+shift+s");
  assert.deepEqual(registration, {
    shortcut: "ctrl+alt+shift+s",
    extensionPath: realpathSync(ownerPath),
    description: "test shortcut",
    handler,
  });
  await registration.handler(ctx);
  assert.equal(received, ctx);
  assert.equal(harness.userMessages.length, 0);
});

test("ASC registers its default shortcut and preserves non-TUI no-fallback behavior", async () => {
  const harness = loadDashboard();
  assert.equal(harness.shortcuts.size, 1);
  const registration = harness.shortcuts.get("ctrl+alt+shift+s");
  assert.equal(registration.extensionPath, realpathSync(ownerPath));
  assert.match(registration.description, /Open native subagent tabs/);
  assert.equal(typeof registration.handler, "function");
  const notifications = [];
  await registration.handler({
    mode: "rpc",
    hasUI: true,
    ui: { notify: (message, level) => notifications.push({ message, level }) },
  });
  assert.deepEqual(notifications, [{
    message: "Native subagent tabs require interactive Pi in Ghostty; no overlay/window fallback.",
    level: "warning",
  }]);
  await registration.handler({ mode: "print", hasUI: false });
  assert.equal(notifications.length, 1);
  assert.equal(harness.userMessages.length, 0);
});

test("ASC shortcut configuration registers a custom chord but not disabled/unsafe chords", () => {
  assert.deepEqual([...loadDashboard("ctrl+alt+shift+x").shortcuts.keys()], ["ctrl+alt+shift+x"]);
  for (const value of ["off", "ctrl+o", "ctrl+s", "invalid"]) {
    assert.equal(loadDashboard(value).shortcuts.size, 0, value);
  }
});

test("harness does not suppress shortcut factory or handler failures", async () => {
  const harness = createPiHarness();
  const failure = new Error("shortcut failure");
  assert.throws(() => harness.load(ownerPath, (pi) => {
    pi.registerShortcut("ctrl+alt+shift+s", { handler: async () => { throw failure; } });
    throw failure;
  }), (error) => error === failure);
  await assert.rejects(harness.shortcuts.get("ctrl+alt+shift+s").handler({}), (error) => error === failure);
});

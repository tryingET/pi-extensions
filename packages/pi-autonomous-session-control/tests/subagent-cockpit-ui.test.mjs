// Regression for the removed overlay: only the command router owns slash registration.
import "./subagent-cockpit-ui-loader.mjs";
import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";

const { cockpitText } = await import("../extensions/self/subagent-cockpit-ui-control.ts");
const { cockpitShortcut, registerSubagentDashboard } = await import(
  "../extensions/self/subagent-dashboard.ts"
);
const { registerSubagentCommands } = await import("../extensions/self/subagent-commands.ts");

test("Given strip and command router, When registered together, Then only subagents is exposed and no overlay exists", async () => {
  const commands = new Map(),
    shortcuts = new Map();
  const pi = {
    on() {},
    registerCommand(name, def) {
      assert.equal(commands.has(name), false, "duplicate command");
      commands.set(name, def);
    },
    registerShortcut(key, def) {
      shortcuts.set(key, def);
    },
  };
  const state = {
    sessionsDir: join(tmpdir(), "nonexistent-command-surface-test"),
    activeCount: 0,
    completedCount: 0,
    maxConcurrent: 5,
    reservedSessionNames: new Set(),
  };
  registerSubagentCommands(pi, state);
  registerSubagentDashboard(pi, state);
  assert.deepEqual([...commands.keys()], ["subagents"]);
  const ctx = {
    mode: "rpc",
    hasUI: false,
    cwd: process.cwd(),
    ui: {
      custom() {
        throw Error("removed overlay must never open");
      },
      setEditorText() {
        throw Error("controller draft must remain untouched");
      },
    },
  };
  await commands.get("subagents").handler("", ctx);
  await shortcuts.get("ctrl+alt+shift+s").handler(ctx);
  assert.equal(cockpitShortcut("ctrl+o"), undefined);
  assert.equal(cockpitShortcut("off"), undefined);
  assert.equal(cockpitShortcut("ctrl+alt+shift+d"), "ctrl+alt+shift+d");
  const source = readFileSync(
    new URL("../extensions/self/subagent-dashboard.ts", import.meta.url),
    "utf8",
  );
  assert.doesNotMatch(source, /ui\.custom|SubagentCockpitUI|registerCommand/);
  assert.equal(
    existsSync(new URL("../extensions/self/subagent-cockpit-ui.ts", import.meta.url)),
    false,
  );
  assert.equal(
    existsSync(new URL("../extensions/self/subagent-cockpit-ui-timeline.ts", import.meta.url)),
    false,
  );
});
test("shared display sanitization keeps terminal escapes and bidi controls inert", () => {
  for (const file of ["subagent.ts", "subagent-attachment-commands.ts"]) {
    const guidance = readFileSync(new URL(`../extensions/self/${file}`, import.meta.url), "utf8");
    assert.match(guidance, /\/subagents --name/);
    assert.doesNotMatch(guidance, /\/subagent-inspect/);
  }
  assert.equal(cockpitText("\x1b[31mred\x1b[0m\x1b]0;owned\x07\u202eevil\x08"), "redevil");
});

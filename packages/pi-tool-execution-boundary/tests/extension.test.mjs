import test from "node:test";
import assert from "node:assert/strict";
import extension, { toolBoundaryReport } from "../extensions/tool-execution-boundary.js";

test("extension registers diagnostics only and makes no execution claim", async () => {
  let registered;
  extension({ registerCommand(name, command) { registered = { name, command }; } });
  assert.equal(registered.name, "tool-boundary");
  const status = JSON.parse(await registered.command.handler("status", { hasUI: false }));
  assert.equal(status.realExecutionEnabled, false);
  assert.equal(status.backendAttested, false);
  assert.deepEqual(status.standardToolsOverridden, []);
  assert.equal(status.hostFallback, false);
});

test("explain derives effects and rejects unknown command names", () => {
  assert.equal(toolBoundaryReport("explain").effects.exec.durability, "D1-workspace-effect");
  assert.equal(toolBoundaryReport("invented").code, "UNKNOWN_COMMAND");
});

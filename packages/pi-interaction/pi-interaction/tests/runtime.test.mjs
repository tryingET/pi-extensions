import assert from "node:assert/strict";
import test from "node:test";

import {
  createInteractionRuntime,
  getInteractionRuntime,
  resetInteractionRuntime,
} from "../src/runtime.js";

test("createInteractionRuntime exposes composed diagnostics", () => {
  const runtime = createInteractionRuntime();
  const diagnostics = runtime.diagnostics();

  assert.equal(typeof diagnostics.triggerCount, "number");
  assert.equal(typeof diagnostics.registry.ownerId, "string");
});

test("getInteractionRuntime returns singleton instance", () => {
  resetInteractionRuntime();
  const first = getInteractionRuntime();
  const second = getInteractionRuntime();

  assert.equal(first, second);
});

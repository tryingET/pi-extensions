import assert from "node:assert/strict";
import test from "node:test";

import { createEditorRegistry } from "../index.js";

test("createEditorRegistry skips mount when UI is unavailable", () => {
  const registry = createEditorRegistry({ ownerId: "unit-owner" });

  const mounted = registry.mount({
    ctx: { hasUI: false },
    factory: () => {
      // no-op
    },
  });

  assert.equal(mounted, false);
  assert.deepEqual(registry.diagnostics(), {
    ownerId: "unit-owner",
    mounted: false,
    mountCount: 0,
  });
});

test("createEditorRegistry mounts editor factory and records diagnostics", () => {
  const registry = createEditorRegistry({ ownerId: "unit-owner" });
  const calls = [];

  const mounted = registry.mount({
    ctx: {
      hasUI: true,
      ui: {
        setEditorComponent(factory) {
          calls.push(factory);
        },
        notify(message, level) {
          calls.push({ message, level });
        },
      },
    },
    notifyMessage: "Mounted",
    factory: () => {
      // no-op
    },
  });

  assert.equal(mounted, true);
  assert.equal(calls.length, 2);
  assert.equal(typeof calls[0], "function");
  assert.deepEqual(calls[1], { message: "Mounted", level: "info" });

  const diagnostics = registry.diagnostics();
  assert.equal(diagnostics.ownerId, "unit-owner");
  assert.equal(diagnostics.mounted, true);
  assert.equal(diagnostics.mountCount, 1);
  assert.ok(typeof diagnostics.lastMountedAt === "string");
});

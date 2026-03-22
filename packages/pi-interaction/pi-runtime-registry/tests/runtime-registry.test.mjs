import assert from "node:assert/strict";
import { afterEach, beforeEach, describe, it } from "node:test";
import {
  createRuntimeRegistry,
  getGlobalRuntimeRegistry,
  resetGlobalRuntimeRegistry,
} from "../src/runtimeRegistry.js";

describe("createRuntimeRegistry", () => {
  /** @type {ReturnType<typeof createRuntimeRegistry>} */
  let registry;

  beforeEach(() => {
    registry = createRuntimeRegistry({ ownerId: "test-registry" });
  });

  it("creates registry with default owner id", () => {
    const defaultRegistry = createRuntimeRegistry();
    assert.equal(defaultRegistry.diagnostics().ownerId, "pi-runtime-registry");
  });

  it("creates registry with custom owner id", () => {
    assert.equal(registry.diagnostics().ownerId, "test-registry");
  });

  it("starts empty", () => {
    assert.equal(registry.list().length, 0);
    assert.equal(registry.diagnostics().runtimeCount, 0);
  });
});

describe("RuntimeRegistry.register", () => {
  /** @type {ReturnType<typeof createRuntimeRegistry>} */
  let registry;

  beforeEach(() => {
    registry = createRuntimeRegistry();
  });

  it("registers a runtime with minimal params", () => {
    const instance = { name: "test" };
    registry.register("owner-a", "runtime-1", instance);

    const entry = registry.get("owner-a", "runtime-1");
    assert.ok(entry);
    assert.equal(entry.ownerId, "owner-a");
    assert.equal(entry.runtimeId, "runtime-1");
    assert.equal(entry.instance, instance);
    assert.deepEqual(entry.capabilities, []);
    assert.ok(entry.registeredAt instanceof Date);
  });

  it("registers a runtime with capabilities", () => {
    const instance = { name: "test" };
    const capabilities = [
      { id: "picker", description: "Fuzzy picker" },
      { id: "editor", description: "Editor mount" },
    ];

    registry.register("owner-a", "runtime-1", instance, capabilities);

    const entry = registry.get("owner-a", "runtime-1");
    assert.ok(entry);
    assert.equal(entry.capabilities.length, 2);
    assert.equal(entry.capabilities[0].id, "picker");
    assert.equal(entry.capabilities[1].id, "editor");
  });

  it("replaces existing runtime with same owner and runtimeId", () => {
    const instance1 = { version: 1 };
    const instance2 = { version: 2 };

    registry.register("owner-a", "runtime-1", instance1);
    registry.register("owner-a", "runtime-1", instance2);

    assert.equal(registry.list().length, 1);
    const entry = registry.get("owner-a", "runtime-1");
    assert.ok(entry);
    assert.equal(entry.instance, instance2);
  });

  it("allows same runtimeId for different owners", () => {
    registry.register("owner-a", "runtime-1", { owner: "a" });
    registry.register("owner-b", "runtime-1", { owner: "b" });

    assert.equal(registry.list().length, 2);
    const entryA = registry.get("owner-a", "runtime-1");
    const entryB = registry.get("owner-b", "runtime-1");
    assert.ok(entryA);
    assert.ok(entryB);
    assert.notEqual(entryA.instance, entryB.instance);
  });
});

describe("RuntimeRegistry.unregister", () => {
  /** @type {ReturnType<typeof createRuntimeRegistry>} */
  let registry;

  beforeEach(() => {
    registry = createRuntimeRegistry();
    registry.register("owner-a", "runtime-1", {});
    registry.register("owner-a", "runtime-2", {});
  });

  it("removes a registered runtime", () => {
    const result = registry.unregister("owner-a", "runtime-1");
    assert.equal(result, true);
    assert.equal(registry.list().length, 1);
    assert.equal(registry.get("owner-a", "runtime-1"), undefined);
  });

  it("returns false for non-existent runtime", () => {
    const result = registry.unregister("owner-a", "non-existent");
    assert.equal(result, false);
    assert.equal(registry.list().length, 2);
  });

  it("returns false for wrong owner", () => {
    const result = registry.unregister("owner-b", "runtime-1");
    assert.equal(result, false);
    assert.equal(registry.list().length, 2);
  });
});

describe("RuntimeRegistry.get", () => {
  /** @type {ReturnType<typeof createRuntimeRegistry>} */
  let registry;

  beforeEach(() => {
    registry = createRuntimeRegistry();
    registry.register("owner-a", "runtime-1", { data: "test" });
  });

  it("returns runtime entry for matching owner and id", () => {
    const entry = registry.get("owner-a", "runtime-1");
    assert.ok(entry);
    assert.deepEqual(entry.instance, { data: "test" });
  });

  it("returns undefined for non-existent runtime", () => {
    assert.equal(registry.get("owner-a", "non-existent"), undefined);
  });

  it("returns undefined for wrong owner", () => {
    assert.equal(registry.get("owner-b", "runtime-1"), undefined);
  });
});

describe("RuntimeRegistry.getByOwner", () => {
  /** @type {ReturnType<typeof createRuntimeRegistry>} */
  let registry;

  beforeEach(() => {
    registry = createRuntimeRegistry();
    registry.register("owner-a", "runtime-1", {});
    registry.register("owner-a", "runtime-2", {});
    registry.register("owner-b", "runtime-1", {});
  });

  it("returns all runtimes for matching owner", () => {
    const entries = registry.getByOwner("owner-a");
    assert.equal(entries.length, 2);
    assert.ok(entries.every((e) => e.ownerId === "owner-a"));
  });

  it("returns empty array for non-matching owner", () => {
    const entries = registry.getByOwner("owner-c");
    assert.deepEqual(entries, []);
  });
});

describe("RuntimeRegistry.findByCapability", () => {
  /** @type {ReturnType<typeof createRuntimeRegistry>} */
  let registry;

  beforeEach(() => {
    registry = createRuntimeRegistry();
    registry.register("owner-a", "runtime-1", {}, [{ id: "picker" }, { id: "editor" }]);
    registry.register("owner-a", "runtime-2", {}, [{ id: "picker" }]);
    registry.register("owner-b", "runtime-1", {}, [{ id: "editor" }]);
  });

  it("returns runtimes with matching capability", () => {
    const pickerRuntimes = registry.findByCapability("picker");
    assert.equal(pickerRuntimes.length, 2);
    assert.ok(pickerRuntimes.every((r) => r.ownerId === "owner-a"));
  });

  it("returns runtimes from different owners", () => {
    const editorRuntimes = registry.findByCapability("editor");
    assert.equal(editorRuntimes.length, 2);
    const owners = editorRuntimes.map((r) => r.ownerId);
    assert.ok(owners.includes("owner-a"));
    assert.ok(owners.includes("owner-b"));
  });

  it("returns empty array for non-existent capability", () => {
    const results = registry.findByCapability("non-existent");
    assert.deepEqual(results, []);
  });
});

describe("RuntimeRegistry.diagnostics", () => {
  /** @type {ReturnType<typeof createRuntimeRegistry>} */
  let registry;

  beforeEach(() => {
    registry = createRuntimeRegistry({ ownerId: "diag-test" });
    registry.register("owner-a", "runtime-1", {}, [{ id: "picker" }, { id: "editor" }]);
    registry.register("owner-b", "runtime-1", {}, [{ id: "picker" }]);
  });

  it("returns correct summary counts", () => {
    const diag = registry.diagnostics();
    assert.equal(diag.ownerId, "diag-test");
    assert.equal(diag.runtimeCount, 2);
    assert.equal(diag.capabilityCount, 3);
  });

  it("includes runtime summaries", () => {
    const diag = registry.diagnostics();
    assert.equal(diag.runtimes.length, 2);

    const runtimeA = diag.runtimes.find((r) => r.ownerId === "owner-a");
    assert.ok(runtimeA);
    assert.equal(runtimeA.runtimeId, "runtime-1");
    assert.equal(runtimeA.capabilityCount, 2);
    assert.ok(typeof runtimeA.registeredAt === "string");
  });
});

describe("RuntimeRegistry.clear", () => {
  /** @type {ReturnType<typeof createRuntimeRegistry>} */
  let registry;

  beforeEach(() => {
    registry = createRuntimeRegistry();
    registry.register("owner-a", "runtime-1", {});
    registry.register("owner-b", "runtime-1", {});
  });

  it("removes all runtimes", () => {
    registry.clear();
    assert.equal(registry.list().length, 0);
    assert.equal(registry.diagnostics().runtimeCount, 0);
  });
});

describe("getGlobalRuntimeRegistry", () => {
  beforeEach(() => {
    resetGlobalRuntimeRegistry();
  });

  afterEach(() => {
    resetGlobalRuntimeRegistry();
  });

  it("returns a singleton instance", () => {
    const registry1 = getGlobalRuntimeRegistry();
    const registry2 = getGlobalRuntimeRegistry();
    assert.equal(registry1, registry2);
  });

  it("returns registry with global owner id", () => {
    const registry = getGlobalRuntimeRegistry();
    assert.equal(registry.diagnostics().ownerId, "global");
  });

  it("persists registrations across calls", () => {
    const registry1 = getGlobalRuntimeRegistry();
    registry1.register("owner-a", "runtime-1", { test: true });

    const registry2 = getGlobalRuntimeRegistry();
    const entry = registry2.get("owner-a", "runtime-1");
    assert.ok(entry);
    assert.deepEqual(entry.instance, { test: true });
  });
});

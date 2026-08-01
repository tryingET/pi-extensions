import assert from "node:assert/strict";
import test from "node:test";
import defaultExtension, {
  createCodeModeExtension as createExtensionFromDefaultEntrypoint,
  CapabilityRegistry as ExtensionCapabilityRegistry,
} from "@tryinget/pi-code-mode";
import {
  createCodeModeExtension as createExtensionFromRuntimeEntrypoint,
  KernelManager,
  CapabilityRegistry as RuntimeCapabilityRegistry,
} from "@tryinget/pi-code-mode/runtime";

test("declared public package entrypoints load their extension and runtime contracts", () => {
  assert.equal(typeof defaultExtension, "function");
  assert.equal(typeof createExtensionFromDefaultEntrypoint, "function");
  assert.equal(typeof createExtensionFromRuntimeEntrypoint, "function");
  assert.equal(typeof ExtensionCapabilityRegistry, "function");
  assert.equal(RuntimeCapabilityRegistry, ExtensionCapabilityRegistry);
  assert.equal(typeof KernelManager, "function");
});

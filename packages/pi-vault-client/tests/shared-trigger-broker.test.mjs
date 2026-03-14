import assert from "node:assert/strict";
import { readFileSync, rmSync, writeFileSync } from "node:fs";
import path from "node:path";
import test from "node:test";
import { fileURLToPath, pathToFileURL } from "node:url";
import { createPackageTempDir } from "./helpers/transpiled-module-harness.mjs";

const TEST_DIR = path.dirname(fileURLToPath(import.meta.url));
const SOURCE_TRIGGER_BROKER_PATH = path.resolve(
  TEST_DIR,
  "../../pi-interaction/pi-trigger-adapter/src/TriggerBroker.js",
);

function uniqueModuleUrl(filePath, label) {
  const fileUrl = pathToFileURL(filePath);
  fileUrl.searchParams.set("instance", `${label}-${Date.now()}-${Math.random()}`);
  return fileUrl.href;
}

function createCopiedTriggerBrokerModule() {
  const tempDir = createPackageTempDir("shared-trigger-broker-");
  const copiedPath = path.join(tempDir, "TriggerBroker.js");
  writeFileSync(copiedPath, readFileSync(SOURCE_TRIGGER_BROKER_PATH, "utf8"), "utf8");
  return { tempDir, copiedPath };
}

test("separate physical trigger-adapter copies share one process-global broker", async () => {
  const { tempDir, copiedPath } = createCopiedTriggerBrokerModule();
  const sourceModule = await import(uniqueModuleUrl(SOURCE_TRIGGER_BROKER_PATH, "source"));
  const copiedModule = await import(uniqueModuleUrl(copiedPath, "copied"));

  sourceModule.resetBroker();
  copiedModule.resetBroker();

  try {
    const sourceBroker = sourceModule.getBroker();
    const copiedBroker = copiedModule.getBroker();

    assert.strictEqual(sourceBroker, copiedBroker);

    sourceBroker.register({
      id: "vault-live-trigger",
      description: "vault live trigger",
      match: /^\/vault:(.*)$/,
      handler: async () => {},
    });

    assert.ok(copiedModule.getBroker().get("vault-live-trigger"));
  } finally {
    sourceModule.resetBroker();
    rmSync(tempDir, { recursive: true, force: true });
  }
});

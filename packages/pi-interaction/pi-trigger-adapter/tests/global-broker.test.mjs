import assert from "node:assert/strict";
import path from "node:path";
import test from "node:test";
import { fileURLToPath, pathToFileURL } from "node:url";

const TEST_DIR = path.dirname(fileURLToPath(import.meta.url));
const TRIGGER_BROKER_PATH = path.resolve(TEST_DIR, "../src/TriggerBroker.js");

function uniqueModuleUrl(filePath, label) {
  const fileUrl = pathToFileURL(filePath);
  fileUrl.searchParams.set("instance", `${label}-${Date.now()}-${Math.random()}`);
  return fileUrl.href;
}

test("getBroker shares a process-global singleton across isolated module instances", async () => {
  const first = await import(uniqueModuleUrl(TRIGGER_BROKER_PATH, "first"));
  const second = await import(uniqueModuleUrl(TRIGGER_BROKER_PATH, "second"));

  first.resetBroker();
  second.resetBroker();

  try {
    const brokerA = first.getBroker();
    const brokerB = second.getBroker();

    assert.strictEqual(brokerA, brokerB);

    brokerA.register({
      id: "shared-trigger",
      description: "shared trigger",
      match: "/vault:",
      handler: async () => {},
    });

    assert.ok(second.getBroker().get("shared-trigger"));

    second.resetBroker();

    const brokerAfterReset = first.getBroker();
    assert.notStrictEqual(brokerAfterReset, brokerA);
    assert.equal(brokerAfterReset.list().length, 0);
  } finally {
    first.resetBroker();
  }
});

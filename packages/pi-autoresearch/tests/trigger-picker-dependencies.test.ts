import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";

import { loadAutoresearchTriggerSurface } from "../extensions/pi-autoresearch/triggerPicker.ts";

const packageRoot = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const packageManifest = JSON.parse(readFileSync(resolve(packageRoot, "package.json"), "utf8")) as {
  dependencies?: Record<string, string>;
};

test("autoresearch declares the trigger adapter used by its runtime picker fallback", () => {
  assert.equal(
    packageManifest.dependencies?.["@tryinget/pi-trigger-adapter"],
    "file:../pi-interaction/pi-trigger-adapter",
  );
});

test("autoresearch package-root resolution loads a functional trigger surface", async () => {
  const triggerAdapterUrl = import.meta.resolve("@tryinget/pi-trigger-adapter");
  assert.match(triggerAdapterUrl, /pi-trigger-adapter\/index\.js$/);

  const triggerAdapter = (await import("@tryinget/pi-trigger-adapter")) as {
    registerPickerInteraction?: unknown;
  };
  assert.equal(typeof triggerAdapter.registerPickerInteraction, "function");

  const surface = await loadAutoresearchTriggerSurface();
  assert.equal(typeof surface?.registerPickerInteraction, "function");
});

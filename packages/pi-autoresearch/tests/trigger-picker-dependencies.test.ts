import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";

import {
  loadAutoresearchTriggerSurface,
  maybeRegisterAutoresearchLiveTrigger,
} from "../extensions/pi-autoresearch/triggerPicker.ts";

const packageRoot = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const packageManifest = JSON.parse(readFileSync(resolve(packageRoot, "package.json"), "utf8")) as {
  dependencies?: Record<string, string>;
};

test("autoresearch declares the lightweight trigger adapter instead of the interaction umbrella", () => {
  assert.equal(
    packageManifest.dependencies?.["@tryinget/pi-trigger-adapter"],
    "file:../pi-interaction/pi-trigger-adapter",
  );
  assert.equal(packageManifest.dependencies?.["@tryinget/pi-interaction"], undefined);
});

test("autoresearch loader requests only its declared trigger adapter", async () => {
  const requestedModules: string[] = [];
  const expectedSurface = { registerPickerInteraction() {} };
  const surface = await loadAutoresearchTriggerSurface(async (moduleName) => {
    requestedModules.push(moduleName);
    return expectedSurface;
  });

  assert.deepEqual(requestedModules, ["@tryinget/pi-trigger-adapter"]);
  assert.strictEqual(surface, expectedSurface);
});

test("picker registration degrades to a no-op when adapter initialization fails", async () => {
  let loadAttempts = 0;
  const registration = await maybeRegisterAutoresearchLiveTrigger(
    undefined,
    {} as Parameters<typeof maybeRegisterAutoresearchLiveTrigger>[1],
    { isActive: () => true } as Parameters<typeof maybeRegisterAutoresearchLiveTrigger>[2],
    async () => {
      loadAttempts += 1;
      throw new Error("simulated adapter initialization failure");
    },
  );

  assert.equal(loadAttempts, 1);
  assert.equal(typeof registration.unregister, "function");
  assert.doesNotThrow(() => registration.unregister());
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

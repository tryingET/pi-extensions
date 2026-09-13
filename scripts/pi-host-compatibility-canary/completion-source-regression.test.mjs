// Portable SOURCE-REGRESSION entry. Current caller/source are trusted, NOT admitted.
// Same exact finite cases and denied lifecycle executor as the strict entry.
import assert from "node:assert/strict";
import { writeFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { regularBytes } from "./completion-fixture-closure.mjs";
import { observeSourceRegression } from "./source-regression-observation.mjs";
import { createSourceScratch } from "./source-regression-harness.mjs";
import { registerCompletionFixtures } from "./completion-fixture-runner.mjs";
const source = path.dirname(fileURLToPath(import.meta.url));
const OBSERVATION = observeSourceRegression(source);
const pinsBytes = Buffer.from(JSON.stringify(OBSERVATION));
const scratch = createSourceScratch();
const observationFile = path.join(scratch, "source-regression-OBSERVATION.json");
writeFileSync(observationFile, pinsBytes, { flag: "wx", mode: 0o600 });
await registerCompletionFixtures({ source, pins: OBSERVATION, pinsBytes, scratch,
  assertInputUnchanged() {
    assert.deepEqual(regularBytes(observationFile), pinsBytes, "source observation input changed");
  },
});

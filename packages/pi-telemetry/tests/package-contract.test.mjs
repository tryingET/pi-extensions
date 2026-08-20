// ---
// summary: verifies public package metadata for the telemetry extension and review-snapshot API.
// read_when:
//   - changing pi-telemetry exports, runtime peers, or publish files.
// ---

import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";

const packageRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const manifest = JSON.parse(fs.readFileSync(path.join(packageRoot, "package.json"), "utf8"));

test("declares the runtime peers used by the Pi extension entrypoint", () => {
  assert.equal(manifest.peerDependencies?.typebox, "*");
  assert.equal(manifest.peerDependenciesMeta?.typebox, undefined);
});

test("publishes the versioned telemetry review snapshot API as compiled JavaScript", () => {
  assert.deepEqual(manifest.exports?.["./review-snapshot"], {
    types: "./dist/review-snapshot.d.ts",
    import: "./dist/review-snapshot.js",
    default: "./dist/review-snapshot.js",
  });
  assert.equal(manifest.scripts?.prepack, "npm run build:review-runtime");
  assert.ok(manifest.files?.includes("src"));
  assert.ok(manifest.files?.includes("dist"));
  assert.ok(manifest.files?.includes("schemas"));
  assert.ok(manifest.files?.includes("docs"));
});

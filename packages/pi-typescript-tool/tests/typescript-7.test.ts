// The typescript tool runs on TypeScript 7 (engineering-core ts lanes: TypeScript 7 only,
// no fallback; pi-extensions AK5929). TypeScript 7 has no classic compiler API: checking
// uses typescript/unstable/sync over a virtual file system, emit uses TypeScript 7's tsc.
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const manifest = JSON.parse(readFileSync(new URL("../package.json", import.meta.url), "utf8"));
const gate = readFileSync(new URL("../src/typescript-gate.ts", import.meta.url), "utf8");

test("depends on exactly TypeScript 7", () => {
  assert.match(manifest.dependencies.typescript, /^7\.\d+\.\d+$/);
});

test("uses the TypeScript 7 API instead of the classic compiler API", () => {
  // (comments may mention the old import; only import statements count)
  assert.doesNotMatch(gate, /^import ts from "typescript";/m);
  assert.match(gate, /typescript\/unstable\/sync/);
});

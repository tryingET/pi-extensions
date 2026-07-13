import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import {
  createDispatchActivationPolicy,
  createDispatchHandoffStore,
  dispatchAuthorizedExecution,
  guardPreparedText,
} from "@tryinget/pi-vault-client/dispatch-guard";
import packageJson from "../package.json" with { type: "json" };

const declaration = readFileSync(new URL("../src/dispatchGuard.d.ts", import.meta.url), "utf8");

test("package exports the public final guard and durable handoff adapter", () => {
  assert.deepEqual(packageJson.exports["./dispatch-guard"], {
    types: "./src/dispatchGuard.d.ts",
    default: "./src/dispatchGuard.js",
  });
  assert.equal(typeof guardPreparedText, "function");
  assert.equal(typeof dispatchAuthorizedExecution, "function");
  assert.equal(typeof createDispatchHandoffStore, "function");
  assert.equal(typeof createDispatchActivationPolicy, "function");
  assert.match(declaration, /DurableAuthorizationReceipt/);
  assert.match(declaration, /DispatchHandoffStore/);
  assert.doesNotMatch(declaration, /persist\(receipt:/);
});

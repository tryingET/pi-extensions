// Shared existing test CLI helpers; bind both suites to the same checkout/lock.
import assert from "node:assert/strict";
import { execFileSync, spawnSync } from "node:child_process";
import { rmSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

export const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");
export const SCRIPT = path.join(ROOT, "scripts", "pi-host-compatibility-canary.mjs");
const CHECKOUT_LOCK = path.join(ROOT, ".pi-host-compatibility-canary.lock");
export function runJson(args, env = process.env) {
  return JSON.parse(
    execFileSync(process.execPath, [SCRIPT, ...args, "--json"], {
      cwd: ROOT,
      encoding: "utf-8",
      env,
    }),
  );
}
export function runJsonFailure(args, env = process.env, inspect = () => {}) {
  const result = spawnSync(process.execPath, [SCRIPT, ...args, "--json"], {
    cwd: ROOT,
    encoding: "utf-8",
    env,
  });
  assert.equal(result.error, undefined, result.error?.message);
  assert.equal(result.signal, null);
  assert.equal(result.status, 1, `Expected command to fail: ${args.join(" ")}`);
  try {
    const payload = JSON.parse(result.stdout);
    inspect(payload); // Inspect durable holds before test-owned lock teardown.
    return payload;
  } finally { rmSync(CHECKOUT_LOCK, { force: true }); }
}

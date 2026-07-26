import assert from "node:assert/strict";
import { spawn, spawnSync } from "node:child_process";
import { existsSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { resolve } from "node:path";
import test from "node:test";
import { pathToFileURL } from "node:url";
import * as ownerRegistry from "../src/runtime/governed-deep-review-owner-registry.mjs";

const SOURCE_ROOT = resolve(import.meta.dirname, "../../..");
const EXTENSION_PATH = resolve(
  SOURCE_ROOT,
  "packages/pi-society-orchestrator/extensions/society-orchestrator.ts",
);
const OWNER_MODULE_URL = pathToFileURL(
  resolve(
    SOURCE_ROOT,
    "packages/pi-society-orchestrator/src/runtime/governed-deep-review-preflight.ts",
  ),
).href;
const OWNER_REGISTRY_PATH = resolve(
  SOURCE_ROOT,
  "packages/pi-society-orchestrator/src/runtime/governed-deep-review-owner-registry.mjs",
);
const LITTLE_HELPERS_MODULE_URL = pathToFileURL(
  resolve(SOURCE_ROOT, "packages/pi-little-helpers/src/governedDeepReviewPreflight.ts"),
).href;

function runIsolatedModuleScript(source) {
  return spawnSync(process.execPath, ["--input-type=module", "--eval", source], {
    cwd: SOURCE_ROOT,
    encoding: "utf8",
  });
}

test("owner registry refuses to brand a runtime minted outside the owner module", () => {
  const forged = {};
  assert.throws(
    () => ownerRegistry.createOwnedRuntime(() => forged),
    /Only the governed deep-review preflight owner module may mint a runtime/,
  );
  assert.equal(ownerRegistry.isOwnedRuntime(forged), false);
  const previousPrepareStackTrace = Error.prepareStackTrace;
  try {
    Error.prepareStackTrace = () =>
      `${resolve(import.meta.dirname, "../src/runtime/governed-deep-review-preflight.ts")}:1:1`;
    assert.throws(
      () => ownerRegistry.createOwnedRuntime(() => forged),
      /Only the governed deep-review preflight owner module may mint a runtime/,
    );
  } finally {
    Error.prepareStackTrace = previousPrepareStackTrace;
  }
});

test("native ESM owner initialization ignores a forged CommonJS cache entry", () => {
  const result = runIsolatedModuleScript(`
import assert from "node:assert/strict";
import { createRequire } from "node:module";
const require = createRequire(import.meta.url);
const registryPath = ${JSON.stringify(OWNER_REGISTRY_PATH)};
let fakeCalls = 0;
require.cache[registryPath] = {
  id: registryPath,
  filename: registryPath,
  loaded: true,
  exports: {
    createOwnedRuntime(factory) { fakeCalls += 1; return factory(); },
    isOwnedRuntime() { fakeCalls += 1; return true; },
  },
};
const owner = await import(${JSON.stringify(OWNER_MODULE_URL)});
const runtime = owner.createGovernedDeepReviewPreflightRuntime({
  getAllTools: () => [],
  getActiveTools: () => [],
  setActiveTools: () => {},
}, { requireMaterializationManifest: false });
assert.equal(fakeCalls, 0);
assert.equal(owner.isGovernedDeepReviewPreflightRuntimeOwner(runtime), true);
`);
  assert.equal(result.status, 0, result.stderr || result.stdout);
});

test("immutable CommonJS cache preemption plus a forged global cannot bypass ESM ownership", () => {
  const result = runIsolatedModuleScript(`
import assert from "node:assert/strict";
import { createRequire } from "node:module";
const require = createRequire(import.meta.url);
const registryPath = ${JSON.stringify(OWNER_REGISTRY_PATH)};
let fakeCalls = 0;
const fakeModule = {
  exports: Object.freeze({
    createOwnedRuntime(factory) { fakeCalls += 1; return factory(); },
    isOwnedRuntime() { fakeCalls += 1; return true; },
  }),
};
Object.defineProperty(require.cache, registryPath, {
  value: fakeModule,
  writable: false,
  configurable: false,
});
const helpers = await import(${JSON.stringify(LITTLE_HELPERS_MODULE_URL)});
const symbol = Symbol.for("tryinget.pi.governed-deep-review-preflight.v1");
let prepareCalls = 0;
globalThis[symbol] = {
  generation: 999,
  runtime: {
    ownerModuleUrl: ${JSON.stringify(OWNER_MODULE_URL)},
    verifyReceipt: () => true,
    bindToolCall: () => true,
    cancel: () => true,
    async prepare() { prepareCalls += 1; throw new Error("must not run"); },
  },
};
const observed = await helpers.runOwnerVisibleLoopGovernedPreflight({
  nonce: "88888888-8888-4888-8888-888888888888",
  runId: "immutable-cache-plus-forged-global",
  cwd: ${JSON.stringify(SOURCE_ROOT)},
});
assert.equal(observed.ok, false);
assert.equal(observed.failureClass, "preflight_owner_attestation_failed");
assert.equal(fakeCalls, 0);
assert.equal(prepareCalls, 0);
`);
  assert.equal(result.status, 0, result.stderr || result.stdout);
});

test("a forged global runtime is rejected after genuine registry initialization", () => {
  const result = runIsolatedModuleScript(`
import assert from "node:assert/strict";
const owner = await import(${JSON.stringify(OWNER_MODULE_URL)});
owner.createGovernedDeepReviewPreflightRuntime({
  getAllTools: () => [],
  getActiveTools: () => [],
  setActiveTools: () => {},
}, { requireMaterializationManifest: false });
const helpers = await import(${JSON.stringify(LITTLE_HELPERS_MODULE_URL)});
const symbol = Symbol.for("tryinget.pi.governed-deep-review-preflight.v1");
let prepareCalls = 0;
globalThis[symbol] = {
  generation: 999,
  runtime: {
    ownerModuleUrl: ${JSON.stringify(OWNER_MODULE_URL)},
    verifyReceipt: () => true,
    bindToolCall: () => true,
    cancel: () => true,
    async prepare() { prepareCalls += 1; throw new Error("must not run"); },
  },
};
const observed = await helpers.runOwnerVisibleLoopGovernedPreflight({
  nonce: "77777777-7777-4777-8777-777777777777",
  runId: "forged-after-genuine",
  cwd: ${JSON.stringify(SOURCE_ROOT)},
});
assert.equal(observed.ok, false);
assert.equal(observed.failureClass, "preflight_owner_attestation_failed");
assert.equal(prepareCalls, 0);
`);
  assert.equal(result.status, 0, result.stderr || result.stdout);
});

function waitForFile(path, child, stderr) {
  return new Promise((resolvePromise, reject) => {
    const deadline = Date.now() + 15_000;
    const poll = () => {
      if (existsSync(path)) {
        resolvePromise();
        return;
      }
      if (child.exitCode !== null) {
        reject(new Error(`Pi exited before owner probe: ${stderr()}`));
        return;
      }
      if (Date.now() >= deadline) {
        reject(new Error(`Timed out waiting for owner probe: ${stderr()}`));
        return;
      }
      setTimeout(poll, 25);
    };
    poll();
  });
}

test("actual Pi extension loading shares the canonical preflight owner brand", async (t) => {
  if (spawnSync("pi", ["--version"], { stdio: "ignore" }).status !== 0) {
    t.skip("pi executable is unavailable");
    return;
  }
  const scratch = mkdtempSync(`${tmpdir()}/governed-owner-loader-`);
  const outputPath = resolve(scratch, "owner.json");
  const probePath = resolve(scratch, "probe.ts");
  writeFileSync(
    probePath,
    `import { writeFileSync } from "node:fs";
export default function (pi) {
  pi.on("session_start", async () => {
    const slot = globalThis[Symbol.for("tryinget.pi.governed-deep-review-preflight.v1")];
    const helpers = await import(${JSON.stringify(LITTLE_HELPERS_MODULE_URL)});
    const result = await helpers.runOwnerVisibleLoopGovernedPreflight({
      nonce: "invalid",
      runId: "owner-loader-probe",
      cwd: ${JSON.stringify(SOURCE_ROOT)},
    });
    writeFileSync(${JSON.stringify(outputPath)}, JSON.stringify({
      ownerModuleUrl: slot.runtime.ownerModuleUrl,
      ownerCheck: result.ok === false && result.failureClass === "invalid_preflight_request",
      failureClass: result.ok ? null : result.failureClass,
    }));
  });
}
`,
    "utf8",
  );
  let stderr = "";
  const child = spawn(
    "pi",
    [
      "--mode",
      "rpc",
      "--no-session",
      "--no-extensions",
      "--no-skills",
      "--no-prompt-templates",
      "-e",
      EXTENSION_PATH,
      "-e",
      probePath,
    ],
    {
      cwd: SOURCE_ROOT,
      env: { ...process.env, PI_OFFLINE: "1" },
      stdio: ["pipe", "ignore", "pipe"],
    },
  );
  child.stderr.on("data", (chunk) => {
    stderr += chunk.toString("utf8");
  });
  try {
    child.stdin.write(`${JSON.stringify({ id: "state", type: "get_state" })}\n`);
    await waitForFile(outputPath, child, () => stderr);
    const observed = JSON.parse(readFileSync(outputPath, "utf8"));
    assert.equal(observed.ownerCheck, true, JSON.stringify(observed));
    assert.equal(
      observed.ownerModuleUrl,
      new URL(
        "../src/runtime/governed-deep-review-preflight.ts",
        new URL(`file://${EXTENSION_PATH}`),
      ).href,
    );
  } finally {
    child.kill("SIGTERM");
    await new Promise((resolvePromise) => child.once("exit", resolvePromise));
    rmSync(scratch, { recursive: true, force: true });
  }
});

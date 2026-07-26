import assert from "node:assert/strict";
import fs, { mkdirSync, readFileSync, rmSync, symlinkSync, writeFileSync } from "node:fs";
import { syncBuiltinESMExports } from "node:module";
import path from "node:path";
import test from "node:test";
import {
  createDispatchActivationPolicy,
  createDispatchHandoffStore,
  dispatchAuthorizedExecution,
  guardPreparedText,
  probeDispatchHandoffStoreReadiness,
} from "../src/dispatchGuard.js";
import { createVaultDispatchRuntime } from "../src/dispatchRuntime.js";
import { createPackageTempDir } from "./helpers/transpiled-module-harness.mjs";

function template(overrides = {}) {
  return {
    id: 1,
    version: 1,
    name: "safe",
    description: "",
    content: "safe",
    render_engine: "none",
    artifact_kind: "procedure",
    control_mode: "one_shot",
    formalization_level: "structured",
    owner_company: "software",
    visibility_companies: ["software"],
    controlled_vocabulary: null,
    status: "active",
    export_to_pi: true,
    ...overrides,
  };
}

function fakeRuntime(rows = []) {
  return {
    resolveCurrentCompanyContext() {
      return { company: "software", source: "test" };
    },
    escapeSql(value) {
      return String(value);
    },
    buildVisibilityPredicate() {
      return "TRUE";
    },
    queryVaultJsonDetailed() {
      return { ok: true, value: { rows } };
    },
    parseTemplateRows() {
      return [];
    },
  };
}

function authorizeLoop() {
  const subject = template({ name: "ooda", control_mode: "loop", formalization_level: "workflow" });
  const runtime = createVaultDispatchRuntime({ runtime: fakeRuntime([subject]) });
  const authorization = runtime.authorizePreparedExecution({
    templates: [subject],
    primaryTemplateName: "ooda",
    finalPreparedText: "loop bytes",
    surface: "orchestrator_adapter",
    currentCompany: "software",
  });
  return { runtime, authorization };
}

test("guard releases only revalidated claimed text-safe bytes", () => {
  const subject = template();
  const runtime = createVaultDispatchRuntime({ runtime: fakeRuntime([subject]) });
  const result = guardPreparedText(
    {
      templates: [subject],
      primaryTemplateName: "safe",
      preparedText: "sealed",
      surface: "vault_command",
      currentCompany: "software",
    },
    runtime,
  );
  assert.deepEqual({ ok: result.ok, text: result.ok && result.text }, { ok: true, text: "sealed" });
});

test("guard blocks gated templates from raw text release", () => {
  const subject = template({ name: "ooda", control_mode: "loop", formalization_level: "workflow" });
  const runtime = createVaultDispatchRuntime({ runtime: fakeRuntime([subject]) });
  const result = guardPreparedText(
    {
      templates: [subject],
      primaryTemplateName: "ooda",
      preparedText: "loop bytes",
      surface: "live_trigger",
      currentCompany: "software",
    },
    runtime,
  );
  assert.equal(result.ok, false);
  assert.equal(result.authorization.disposition, "dispatch_required");
});

test("disabled activation blocks without consuming authorization", async () => {
  const { runtime, authorization } = authorizeLoop();
  const root = createPackageTempDir("dispatch-disabled-");
  const result = await dispatchAuthorizedExecution({
    runtime,
    authorizationId: authorization.authorizationId,
    intendedExecutor: "loop_execute",
    activation: createDispatchActivationPolicy(false),
    receiptStore: createDispatchHandoffStore({ filePath: path.join(root, "handoffs.jsonl") }),
    execute: async ({ handoffId }) => ({ accepted: true, handoffId }),
  });
  assert.equal(result.ok, false);
  assert.match(result.error, /disabled/);
});

test("durable receipt failure is terminal and executor is not called", async () => {
  const { runtime, authorization } = authorizeLoop();
  const root = createPackageTempDir("dispatch-fail-");
  const parentFile = path.join(root, "not-a-directory");
  writeFileSync(parentFile, "x");
  let executed = 0;
  const result = await dispatchAuthorizedExecution({
    runtime,
    authorizationId: authorization.authorizationId,
    intendedExecutor: "loop_execute",
    activation: createDispatchActivationPolicy(true),
    receiptStore: createDispatchHandoffStore({ filePath: path.join(parentFile, "handoffs.jsonl") }),
    execute: async ({ handoffId }) => {
      executed += 1;
      return { accepted: true, handoffId };
    },
  });
  assert.equal(result.ok, false);
  assert.equal(executed, 0);
});

test(
  "dispatch rejects final-component symlink replacement at open time",
  { skip: process.platform === "win32" },
  async () => {
    const { runtime, authorization } = authorizeLoop();
    const root = createPackageTempDir("dispatch-open-symlink-");
    const filePath = path.join(root, "handoffs.jsonl");
    const sentinelPath = path.join(root, "sentinel.txt");
    writeFileSync(filePath, "", "utf8");
    writeFileSync(sentinelPath, "sentinel\n", "utf8");
    const receiptStore = createDispatchHandoffStore({ filePath });
    assert.equal(probeDispatchHandoffStoreReadiness(receiptStore).ok, true);

    const originalOpenSync = fs.openSync;
    let replaced = false;
    let executed = 0;
    fs.openSync = (...args) => {
      if (!replaced && path.resolve(String(args[0])) === path.resolve(filePath)) {
        replaced = true;
        rmSync(filePath);
        symlinkSync(sentinelPath, filePath);
      }
      return originalOpenSync(...args);
    };
    syncBuiltinESMExports();
    let result;
    try {
      result = await dispatchAuthorizedExecution({
        runtime,
        authorizationId: authorization.authorizationId,
        intendedExecutor: "loop_execute",
        activation: createDispatchActivationPolicy(true),
        receiptStore,
        execute: async ({ handoffId }) => {
          executed += 1;
          return { accepted: true, handoffId };
        },
      });
    } finally {
      fs.openSync = originalOpenSync;
      syncBuiltinESMExports();
    }

    assert.equal(replaced, true);
    assert.equal(result.ok, false);
    assert.equal(executed, 0);
    assert.equal(readFileSync(sentinelPath, "utf8"), "sentinel\n");
  },
);

test("package store persists before executor and exact handoff citation is required", async () => {
  const { runtime, authorization } = authorizeLoop();
  const root = createPackageTempDir("dispatch-ok-");
  const filePath = path.join(root, "state", "handoffs.jsonl");
  let sawReceiptBeforeExecute = false;
  const result = await dispatchAuthorizedExecution({
    runtime,
    authorizationId: authorization.authorizationId,
    intendedExecutor: "loop_execute",
    activation: createDispatchActivationPolicy(true),
    receiptStore: createDispatchHandoffStore({ filePath }),
    execute: async ({ handoffId }) => {
      sawReceiptBeforeExecute = readFileSync(filePath, "utf8").includes(handoffId);
      return { accepted: true, handoffId, runId: "run-1" };
    },
  });
  assert.equal(result.ok, true);
  assert.equal(sawReceiptBeforeExecute, true);
});

test("forged receipt stores and mismatched executor citations fail closed", async () => {
  const first = authorizeLoop();
  const forged = await dispatchAuthorizedExecution({
    runtime: first.runtime,
    authorizationId: first.authorization.authorizationId,
    intendedExecutor: "loop_execute",
    activation: createDispatchActivationPolicy(true),
    receiptStore: { filePath: "/tmp/forged", persist: () => true },
    execute: async ({ handoffId }) => ({ accepted: true, handoffId }),
  });
  assert.equal(forged.ok, false);

  const second = authorizeLoop();
  const root = createPackageTempDir("dispatch-citation-");
  mkdirSync(root, { recursive: true });
  const mismatched = await dispatchAuthorizedExecution({
    runtime: second.runtime,
    authorizationId: second.authorization.authorizationId,
    intendedExecutor: "loop_execute",
    activation: createDispatchActivationPolicy(true),
    receiptStore: createDispatchHandoffStore({ filePath: path.join(root, "handoffs.jsonl") }),
    execute: async () => ({ accepted: true, handoffId: "wrong" }),
  });
  assert.equal(mismatched.ok, false);
  assert.match(mismatched.error, /cite/);
});

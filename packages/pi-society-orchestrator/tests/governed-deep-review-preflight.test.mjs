import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { mkdirSync, mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { resolve } from "node:path";
import test from "node:test";
import { pathToFileURL } from "node:url";

import {
  createGovernedDeepReviewPreflightRuntime,
  isGovernedDeepReviewPreflightRuntimeOwner,
} from "../src/runtime/governed-deep-review-preflight.ts";
import { inspectGovernedRuntimeCleanliness } from "../src/runtime/governed-runtime-materialization.ts";

const SOURCE_ROOT = resolve(import.meta.dirname, "../../..");
const CALLER_URL = pathToFileURL(
  resolve(SOURCE_ROOT, "packages/pi-little-helpers/src/visibleLoop.ts"),
).href;
const TOOL_PATHS = {
  toolbox: resolve(SOURCE_ROOT, "packages/pi-toolbox-discovery/extensions/toolbox.ts"),
  orchestrator: resolve(
    SOURCE_ROOT,
    "packages/pi-society-orchestrator/extensions/society-orchestrator.ts",
  ),
  vault: resolve(SOURCE_ROOT, "packages/pi-vault-client/extensions/vault.js"),
  asc: resolve(SOURCE_ROOT, "packages/pi-autonomous-session-control/extensions/self.ts"),
};

function createVaultFixture(root) {
  execFileSync("dolt", ["init", "-b", "main"], { cwd: root, stdio: "ignore" });
  execFileSync(
    "dolt",
    [
      "sql",
      "-q",
      [
        "CREATE TABLE prompt_templates (",
        "id INT PRIMARY KEY, name VARCHAR(64) NOT NULL, description TEXT, content TEXT,",
        "artifact_kind VARCHAR(32) NOT NULL, control_mode VARCHAR(32) NOT NULL,",
        "formalization_level VARCHAR(32) NOT NULL, owner_company VARCHAR(32) NOT NULL,",
        "visibility_companies JSON NOT NULL, controlled_vocabulary JSON,",
        "status VARCHAR(16) NOT NULL, export_to_pi BOOLEAN NOT NULL, version INT NOT NULL,",
        "UNIQUE KEY prompt_templates_name (name));",
        "INSERT INTO prompt_templates VALUES",
        "(1,'deep-review','Deep review','INERT','cognitive','one_shot','workflow','core','[\"core\",\"software\"]',NULL,'active',true,2);",
      ].join(" "),
    ],
    { cwd: root, stdio: "ignore" },
  );
}

function createPiRuntime(overrides = {}) {
  let activeTools = [...(overrides.activeTools ?? ["read"])];
  const ownerByTool = {
    toolbox: "toolbox",
    workflow_execute: "orchestrator",
    vault_execute_template: "orchestrator",
    vault_dispatch_check: "vault",
    dispatch_subagent: "asc",
  };
  const allTools = Object.entries(ownerByTool).map(([name, owner]) => ({
    name,
    sourceInfo: {
      path: overrides.toolPathOverrides?.[name] ?? TOOL_PATHS[owner],
    },
  }));
  return {
    getAllTools: () => allTools,
    getActiveTools: () => [...activeTools],
    setActiveTools(next) {
      activeTools = [...new Set(next)];
    },
  };
}

async function withFixture(run) {
  const scratch = mkdtempSync(`${tmpdir()}/governed-preflight-owner-`);
  const vaultDir = resolve(scratch, "vault");
  mkdirSync(vaultDir, { recursive: true });
  const previousVaultDir = process.env.VAULT_DIR;
  const previousCompany = process.env.PI_COMPANY;
  try {
    createVaultFixture(vaultDir);
    process.env.VAULT_DIR = vaultDir;
    process.env.PI_COMPANY = "software";
    await run(scratch);
  } finally {
    if (previousVaultDir === undefined) delete process.env.VAULT_DIR;
    else process.env.VAULT_DIR = previousVaultDir;
    if (previousCompany === undefined) delete process.env.PI_COMPANY;
    else process.env.PI_COMPANY = previousCompany;
    rmSync(scratch, { recursive: true, force: true });
  }
}

function prepare(runtime, nonce, runId) {
  return runtime.prepare({
    nonce,
    runId,
    cwd: SOURCE_ROOT,
    callerModuleUrl: CALLER_URL,
  });
}

test("runtime cleanliness rejects source drift but excludes node_modules", () => {
  const root = mkdtempSync(`${tmpdir()}/governed-runtime-cleanliness-`);
  try {
    execFileSync("git", ["init", "-q"], { cwd: root });
    execFileSync("git", ["config", "user.email", "test@example.invalid"], { cwd: root });
    execFileSync("git", ["config", "user.name", "Test"], { cwd: root });
    execFileSync("sh", ["-c", "printf tracked > tracked.txt"], { cwd: root });
    execFileSync("git", ["add", "tracked.txt"], { cwd: root });
    execFileSync("git", ["commit", "-qm", "initial"], { cwd: root });
    assert.equal(inspectGovernedRuntimeCleanliness(root).clean, true);

    execFileSync("sh", ["-c", "printf drift >> tracked.txt"], { cwd: root });
    assert.equal(inspectGovernedRuntimeCleanliness(root).clean, false);
    execFileSync("git", ["checkout", "--", "tracked.txt"], { cwd: root });

    execFileSync("sh", ["-c", "printf source > ordinary-untracked.ts"], { cwd: root });
    const untracked = inspectGovernedRuntimeCleanliness(root);
    assert.equal(untracked.clean, false);
    assert.deepEqual(untracked.untrackedSourcePaths, ["ordinary-untracked.ts"]);
    execFileSync("rm", ["ordinary-untracked.ts"], { cwd: root });

    mkdirSync(resolve(root, "node_modules/example"), { recursive: true });
    execFileSync("sh", ["-c", "printf generated > node_modules/example/index.js"], {
      cwd: root,
    });
    assert.equal(inspectGovernedRuntimeCleanliness(root).clean, true);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test("owner preflight binds the exact tool call and owner-brands its receipt", async () => {
  await withFixture(async (scratch) => {
    const pi = createPiRuntime();
    const runtime = createGovernedDeepReviewPreflightRuntime(pi, {
      requireMaterializationManifest: false,
      dispatchReceiptPath: resolve(scratch, "handoffs.jsonl"),
    });
    assert.equal(isGovernedDeepReviewPreflightRuntimeOwner(runtime), true);

    const result = await prepare(runtime, "11111111-1111-4111-8111-111111111111", "run-1");
    assert.equal(result.ok, true, result.ok ? "" : result.error);
    assert.equal(runtime.verifyReceipt(result.receipt), true);
    assert.equal(runtime.verifyReceipt({ ...result.receipt }), false);
    assert.equal(runtime.bindToolCall(result.receipt.nonce, "tool-call-1"), true);
    assert.deepEqual(
      runtime.claimForExecution({
        templateName: "deep-review",
        cwd: SOURCE_ROOT,
        toolCallId: "wrong-call",
      }),
      {
        ok: false,
        error: "Governed deep-review tool call does not match the pending loop preflight.",
      },
    );
    const claimed = runtime.claimForExecution({
      templateName: "deep-review",
      cwd: SOURCE_ROOT,
      toolCallId: "tool-call-1",
    });
    assert.equal(claimed.ok, true);
    assert.equal(claimed.receipt, result.receipt);
    assert.equal(runtime.settleExecution(result.receipt.nonce, "done"), true);
    assert.equal(runtime.verifyReceipt(result.receipt), false);
    assert.deepEqual(pi.getActiveTools(), ["read"]);
  });
});

test("overlapping preflight leases retain tools until the final owner settles", async () => {
  await withFixture(async (scratch) => {
    const pi = createPiRuntime({ activeTools: ["read", "workflow_execute"] });
    const runtime = createGovernedDeepReviewPreflightRuntime(pi, {
      requireMaterializationManifest: false,
      dispatchReceiptPath: resolve(scratch, "handoffs.jsonl"),
    });
    const first = await prepare(runtime, "22222222-2222-4222-8222-222222222222", "run-a");
    const second = await prepare(runtime, "33333333-3333-4333-8333-333333333333", "run-b");
    assert.equal(first.ok, true, first.ok ? "" : first.error);
    assert.equal(second.ok, true, second.ok ? "" : second.error);
    assert.deepEqual(
      new Set(pi.getActiveTools()),
      new Set(["read", "workflow_execute", "toolbox", "vault_execute_template"]),
    );

    assert.equal(runtime.cancel(first.receipt.nonce), true);
    assert.deepEqual(
      new Set(pi.getActiveTools()),
      new Set(["read", "workflow_execute", "toolbox", "vault_execute_template"]),
    );
    assert.equal(runtime.cancel(second.receipt.nonce), true);
    assert.deepEqual(pi.getActiveTools(), ["read", "workflow_execute"]);
  });
});

test("preflight rejects a registered tool from the wrong exact owner extension", async () => {
  await withFixture(async (scratch) => {
    const pi = createPiRuntime({
      toolPathOverrides: { vault_dispatch_check: TOOL_PATHS.orchestrator },
    });
    const runtime = createGovernedDeepReviewPreflightRuntime(pi, {
      requireMaterializationManifest: false,
      dispatchReceiptPath: resolve(scratch, "handoffs.jsonl"),
    });
    const result = await prepare(runtime, "44444444-4444-4444-8444-444444444444", "run-wrong");
    assert.equal(result.ok, false);
    assert.equal(result.failureClass, "registered_tool_source_path_mismatch");
    assert.match(result.error, /vault_dispatch_check resolves from/);
    assert.deepEqual(pi.getActiveTools(), ["read"]);
  });
});

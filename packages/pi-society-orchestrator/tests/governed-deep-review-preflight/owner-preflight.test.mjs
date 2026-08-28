/**
 * summary: "Governed deep-review preflight coverage (owner preflight); split from governed-deep-review-preflight.test.mjs."
 * read_when:
 *   - "changing owner preflight governed preflight verification."
 */
import assert from "node:assert/strict";
import {
  mkdirSync,
  mkdtempSync,
  readFileSync,
  realpathSync,
  renameSync,
  rmSync,
  symlinkSync,
  writeFileSync,
} from "node:fs";
import { createRequire } from "node:module";
import { tmpdir } from "node:os";
import { dirname, resolve } from "node:path";
import test from "node:test";
import { pathToFileURL } from "node:url";
import {
  createGovernedDeepReviewPreflightRuntime,
  isGovernedDeepReviewPreflightRuntimeOwner,
} from "../../src/runtime/governed-deep-review-preflight.ts";
import { GOVERNED_RUNTIME_ASC_REGISTRY_OWNER } from "../../src/runtime/governed-runtime-materialization.ts";
import {
  createImmutableMaterializationCandidate,
  createPiRuntime,
  INSTALLED_ASC_PACKAGE_ROOT,
  LOCAL_ASC_EXTENSION_PATH,
  materializeProductionCandidate,
  prepare,
  SOURCE_ROOT,
  TOOL_PATHS,
  withFixture,
  withGovernedNpmPolicyFixture,
} from "./helpers.mjs";

test("a newer owner runtime revokes stale same-root runtime attestation", () => {
  const first = createGovernedDeepReviewPreflightRuntime(createPiRuntime(), {
    requireMaterializationManifest: false,
  });
  assert.equal(isGovernedDeepReviewPreflightRuntimeOwner(first), true);
  const second = createGovernedDeepReviewPreflightRuntime(createPiRuntime(), {
    requireMaterializationManifest: false,
  });
  assert.equal(isGovernedDeepReviewPreflightRuntimeOwner(first), false);
  assert.equal(isGovernedDeepReviewPreflightRuntimeOwner(second), true);
});

test(
  "production manifest preflight accepts one exact registry ASC owner and rejects local or duplicate owners",
  { timeout: 12 * 60 * 1000 },
  async () => {
    const materializationScratch = mkdtempSync(`${tmpdir()}/governed-registry-asc-production-`);
    try {
      await withGovernedNpmPolicyFixture(async () => {
        const { candidateRoot, commit } =
          createImmutableMaterializationCandidate(materializationScratch);
        const materialized = materializeProductionCandidate(candidateRoot, commit);
        assert.equal(materialized.ok, true);
        const candidatePreflightModule = await import(
          pathToFileURL(
            resolve(
              candidateRoot,
              "packages/pi-society-orchestrator/src/runtime/governed-deep-review-preflight.ts",
            ),
          ).href
        );
        const candidateMaterializationModule = await import(
          pathToFileURL(
            resolve(
              candidateRoot,
              "packages/pi-society-orchestrator/src/runtime/governed-runtime-materialization.ts",
            ),
          ).href
        );
        const candidateRequire = createRequire(
          resolve(candidateRoot, "packages/pi-society-orchestrator/package.json"),
        );
        const registryAscExtension = realpathSync(
          candidateRequire.resolve("@tryinget/pi-autonomous-session-control"),
        );
        const registryAscExecution = realpathSync(
          candidateRequire.resolve("@tryinget/pi-autonomous-session-control/execution"),
        );
        const registryAscRoot = realpathSync(resolve(dirname(registryAscExtension), ".."));
        const registryAscManifest = JSON.parse(
          readFileSync(resolve(registryAscRoot, "package.json"), "utf8"),
        );
        assert.equal(registryAscManifest.name, GOVERNED_RUNTIME_ASC_REGISTRY_OWNER.name);
        assert.equal(registryAscManifest.version, GOVERNED_RUNTIME_ASC_REGISTRY_OWNER.version);
        assert.equal(registryAscExecution.startsWith(`${registryAscRoot}/`), true);

        const candidateToolPaths = {
          toolbox: resolve(candidateRoot, "packages/pi-toolbox-discovery/extensions/toolbox.ts"),
          orchestrator: resolve(
            candidateRoot,
            "packages/pi-society-orchestrator/extensions/society-orchestrator.ts",
          ),
          vault: resolve(candidateRoot, "packages/pi-vault-client/extensions/vault.js"),
          asc: registryAscExtension,
        };
        const candidateCallerUrl = pathToFileURL(
          resolve(candidateRoot, "packages/pi-little-helpers/src/visibleLoop.ts"),
        ).href;
        const prepareCandidate = (runtime, nonce, runId) =>
          runtime.prepare({
            nonce,
            runId,
            cwd: candidateRoot,
            callerModuleUrl: candidateCallerUrl,
          });

        await withFixture(async (scratch) => {
          const pi = createPiRuntime({ toolPaths: candidateToolPaths });
          const runtime = candidatePreflightModule.createGovernedDeepReviewPreflightRuntime(pi, {
            dispatchReceiptPath: resolve(scratch, "production-handoffs.jsonl"),
          });
          const result = await prepareCandidate(
            runtime,
            "66666666-6666-4666-8666-666666666666",
            "production-registry-owner",
          );
          assert.equal(result.ok, true, result.ok ? "" : result.error);
          assert.equal(result.receipt.materializationManifestPath !== null, true);
          assert.equal(result.receipt.ascModulePath, registryAscExecution);
        });

        const graph = candidateMaterializationModule.resolveGovernedRuntimeGraph(candidateRoot);
        for (const specifier of GOVERNED_RUNTIME_ASC_REGISTRY_OWNER.specifiers) {
          const resolution =
            graph.resolutions[`${GOVERNED_RUNTIME_ASC_REGISTRY_OWNER.consumer} -> ${specifier}`];
          assert.equal(resolution.ownership, "registry_external");
          assert.equal(resolution.ownerName, GOVERNED_RUNTIME_ASC_REGISTRY_OWNER.name);
          assert.equal(resolution.ownerVersion, GOVERNED_RUNTIME_ASC_REGISTRY_OWNER.version);
          assert.equal(resolution.ownerRoot, registryAscRoot);
        }

        await withFixture(async (scratch) => {
          const pi = createPiRuntime({
            toolPaths: candidateToolPaths,
            toolPathOverrides: {
              dispatch_subagent: resolve(
                candidateRoot,
                "packages/pi-autonomous-session-control/extensions/self.ts",
              ),
            },
          });
          const runtime = candidatePreflightModule.createGovernedDeepReviewPreflightRuntime(pi, {
            dispatchReceiptPath: resolve(scratch, "local-owner-handoffs.jsonl"),
          });
          const result = await prepareCandidate(
            runtime,
            "77777777-7777-4777-8777-777777777777",
            "production-local-tool-owner",
          );
          assert.equal(result.ok, false);
          assert.equal(result.failureClass, "registered_tool_source_path_mismatch");
        });

        const duplicateRoot = resolve(
          candidateRoot,
          "packages/pi-vault-client/node_modules",
          GOVERNED_RUNTIME_ASC_REGISTRY_OWNER.name,
        );
        mkdirSync(duplicateRoot, { recursive: true });
        writeFileSync(
          resolve(duplicateRoot, "package.json"),
          `${JSON.stringify({
            name: GOVERNED_RUNTIME_ASC_REGISTRY_OWNER.name,
            version: GOVERNED_RUNTIME_ASC_REGISTRY_OWNER.version,
          })}
`,
        );
        await withFixture(async (scratch) => {
          const pi = createPiRuntime({ toolPaths: candidateToolPaths });
          const runtime = candidatePreflightModule.createGovernedDeepReviewPreflightRuntime(pi, {
            dispatchReceiptPath: resolve(scratch, "duplicate-owner-handoffs.jsonl"),
          });
          const result = await prepareCandidate(
            runtime,
            "88888888-8888-4888-8888-888888888888",
            "production-duplicate-owner",
          );
          assert.equal(result.ok, false);
          assert.equal(result.failureClass, "materialization_registry_owner_multiplicity");
        });
        rmSync(duplicateRoot, { recursive: true, force: true });
        assert.equal(
          candidateMaterializationModule.verifyGovernedRuntimeMaterialization(candidateRoot, commit)
            .sourceCommit,
          commit,
        );

        const lexicalRegistryRoot = resolve(
          candidateRoot,
          "packages/pi-society-orchestrator/node_modules",
          GOVERNED_RUNTIME_ASC_REGISTRY_OWNER.name,
        );
        const retainedRegistryRoot = `${lexicalRegistryRoot}.registry-fixture`;
        renameSync(lexicalRegistryRoot, retainedRegistryRoot);
        symlinkSync(
          resolve(candidateRoot, "packages/pi-autonomous-session-control"),
          lexicalRegistryRoot,
          "dir",
        );
        try {
          assert.throws(
            () => candidateMaterializationModule.resolveGovernedRuntimeGraph(candidateRoot),
            (error) =>
              error?.failureClass === "materialization_registry_owner_mismatch" ||
              error?.failureClass === "materialization_registry_owner_multiplicity",
          );
        } finally {
          rmSync(lexicalRegistryRoot, { force: true });
          renameSync(retainedRegistryRoot, lexicalRegistryRoot);
        }
      });
    } finally {
      rmSync(materializationScratch, { recursive: true, force: true });
    }
  },
);

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
    assert.equal(
      realpathSync(resolve(dirname(result.receipt.ascModulePath), "..")),
      INSTALLED_ASC_PACKAGE_ROOT,
    );
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

test("preflight rejects the local ASC extension when execution uses the registry owner", async () => {
  await withFixture(async (scratch) => {
    const pi = createPiRuntime({
      toolPathOverrides: { dispatch_subagent: LOCAL_ASC_EXTENSION_PATH },
    });
    const runtime = createGovernedDeepReviewPreflightRuntime(pi, {
      requireMaterializationManifest: false,
      dispatchReceiptPath: resolve(scratch, "handoffs.jsonl"),
    });
    const result = await prepare(runtime, "55555555-5555-4555-8555-555555555555", "run-local-asc");
    assert.equal(result.ok, false);
    assert.equal(result.failureClass, "registered_tool_source_path_mismatch");
    assert.match(result.error, /dispatch_subagent resolves from/);
    assert.deepEqual(pi.getActiveTools(), ["read"]);
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

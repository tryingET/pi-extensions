// summary: prove one same-process governed deep-review owner lineage before a visible loop can start.
// read_when:
//   - changing visible/Nexus loop startup provenance or deep-review workflow dispatch.

import { execFileSync } from "node:child_process";
import { createHash } from "node:crypto";
import { existsSync, readFileSync, realpathSync } from "node:fs";
import { createRequire } from "node:module";
import { dirname, isAbsolute, resolve } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import type { ExtensionAPI } from "@earendil-works/pi-coding-agent";
import { createOwnedRuntime, isOwnedRuntime } from "./governed-deep-review-owner-registry.mjs";
import {
  GOVERNED_RUNTIME_ASC_REGISTRY_OWNER,
  GOVERNED_RUNTIME_MANIFEST_RELATIVE_PATH,
  GovernedRuntimeMaterializationError,
  verifyGovernedRuntimeMaterialization,
} from "./governed-runtime-materialization.ts";
import { materializeVaultWorkflowBinding } from "./vault-workflow-binding.ts";

const GLOBAL_PREFLIGHT_SYMBOL = Symbol.for("tryinget.pi.governed-deep-review-preflight.v1");
const PREFLIGHT_SCHEMA = "pi.governed-deep-review-preflight.v1" as const;
const REQUIRED_ACTIVE_TOOLS = ["toolbox", "workflow_execute", "vault_execute_template"] as const;
const REQUIRED_REGISTERED_TOOL_OWNERS = {
  toolbox: "toolbox",
  workflow_execute: "orchestrator",
  vault_execute_template: "orchestrator",
  vault_dispatch_check: "vault",
  dispatch_subagent: "asc",
} as const;
const ORCHESTRATOR_PACKAGE_ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "../..");
const ORCHESTRATOR_SOURCE_ROOT = resolve(ORCHESTRATOR_PACKAGE_ROOT, "../..");
const ASC_PACKAGE_NAME = GOVERNED_RUNTIME_ASC_REGISTRY_OWNER.name;
const ASC_PACKAGE_VERSION = GOVERNED_RUNTIME_ASC_REGISTRY_OWNER.version;
const MATERIALIZATION_MANIFEST_PATH = resolve(
  ORCHESTRATOR_SOURCE_ROOT,
  GOVERNED_RUNTIME_MANIFEST_RELATIVE_PATH,
);
const ownedPreflightReceipts = new WeakSet<object>();

type PiRuntimeTools = Pick<ExtensionAPI, "getAllTools" | "getActiveTools" | "setActiveTools">;

type ToolMetadata = {
  name: string;
  sourceInfo?: { path?: string; source?: string; scope?: string; origin?: string };
};

export interface GovernedDeepReviewPreflightReceipt {
  schema: typeof PREFLIGHT_SCHEMA;
  nonce: string;
  receiptDigest: string;
  runId: string;
  cwd: string;
  processId: number;
  sourceRoot: string;
  sourceCommit: string;
  orchestratorModuleUrl: string;
  vaultModuleUrls: string[];
  ascModulePath: string;
  registryId: string;
  bindingWorkflowId: "deep-review.v1";
  registeredTools: string[];
  activeTools: string[];
  activatedTools: string[];
  receiptStorePath: string;
  materializationManifestPath: string | null;
  issuedAt: string;
}

export type GovernedDeepReviewPreflightResult =
  | { ok: true; receipt: GovernedDeepReviewPreflightReceipt }
  | {
      ok: false;
      error: string;
      failureClass: string;
      rollbackAttempted: boolean;
      rollbackSucceeded: boolean;
    };

export type GovernedDeepReviewPreflightClaimResult =
  | { ok: true; receipt: GovernedDeepReviewPreflightReceipt | null }
  | { ok: false; error: string };

export interface GovernedDeepReviewPreflightRuntime {
  readonly ownerModuleUrl: string;
  verifyReceipt(value: unknown): value is GovernedDeepReviewPreflightReceipt;
  prepare(input: {
    nonce: string;
    runId: string;
    cwd: string;
    callerModuleUrl: string;
  }): Promise<GovernedDeepReviewPreflightResult>;
  bindToolCall(nonce: string, toolCallId: string): boolean;
  claimForExecution(input: {
    templateName: string;
    cwd: string;
    toolCallId: string;
  }): GovernedDeepReviewPreflightClaimResult;
  settleExecution(nonce: string, outcome: "done" | "failed"): boolean;
  cancel(nonce: string): boolean;
}

interface PreflightRuntimeOptions {
  requireMaterializationManifest?: boolean;
  dispatchReceiptPath?: string;
}

type PendingReceipt = {
  receipt: GovernedDeepReviewPreflightReceipt;
  status: "issued" | "bound" | "claimed" | "done" | "failed" | "cancelled";
  toolCallId: string | null;
  leasedTools: string[];
};

type GlobalPreflightSlot = {
  generation: number;
  runtime: GovernedDeepReviewPreflightRuntime;
};

type VaultDispatchRuntimeModule = {
  createVaultDispatchRuntime(): {
    policy: {
      registryId: string;
      bindings: Readonly<
        Record<
          string,
          Readonly<{ execution_surface: string; execution_args: Record<string, unknown> }>
        >
      >;
    };
    checkTemplates(
      templateNames: string[],
      ctx?: { cwd?: string },
    ): Promise<{
      ok: boolean;
      status: "ready" | "blocked";
      results?: Array<{
        template_name: string;
        posture: string;
        registry_id: string;
        binding: Readonly<{
          execution_surface: string;
          execution_args: Record<string, unknown>;
        }> | null;
      }>;
      blocking_reason?: string;
    }>;
  };
};

type VaultDispatchGuardModule = {
  createDispatchHandoffStore(options?: { filePath?: string }): { readonly filePath: string };
  probeDispatchHandoffStoreReadiness(store: { readonly filePath: string }): {
    ok: boolean;
    filePath: string;
    error?: string;
  };
};

function globalSlot(): GlobalPreflightSlot | undefined {
  return (globalThis as Record<PropertyKey, unknown>)[GLOBAL_PREFLIGHT_SYMBOL] as
    | GlobalPreflightSlot
    | undefined;
}

function setGlobalSlot(runtime: GovernedDeepReviewPreflightRuntime): void {
  const previous = globalSlot();
  (globalThis as Record<PropertyKey, unknown>)[GLOBAL_PREFLIGHT_SYMBOL] = Object.freeze({
    generation: (previous?.generation ?? 0) + 1,
    runtime: Object.freeze(runtime),
  } satisfies GlobalPreflightSlot);
}

export function getGovernedDeepReviewPreflightRuntime():
  | GovernedDeepReviewPreflightRuntime
  | undefined {
  return globalSlot()?.runtime;
}

export function isGovernedDeepReviewPreflightRuntimeOwner(
  value: unknown,
): value is GovernedDeepReviewPreflightRuntime {
  return isOwnedRuntime(value);
}

export function createGovernedDeepReviewPreflightRuntime(
  pi: PiRuntimeTools,
  options: PreflightRuntimeOptions = {},
): GovernedDeepReviewPreflightRuntime {
  return createOwnedRuntime(() => createGovernedDeepReviewPreflightRuntimeLocal(pi, options));
}

function createGovernedDeepReviewPreflightRuntimeLocal(
  pi: PiRuntimeTools,
  options: PreflightRuntimeOptions = {},
): GovernedDeepReviewPreflightRuntime {
  const pending = new Map<string, PendingReceipt>();
  const preflightOwnedTools = new Set<string>();
  const activationReferences = new Map<string, Set<string>>();
  const requireManifest = options.requireMaterializationManifest !== false;

  const runtime: GovernedDeepReviewPreflightRuntime = {
    ownerModuleUrl: import.meta.url,
    verifyReceipt(value): value is GovernedDeepReviewPreflightReceipt {
      if (!value || typeof value !== "object" || !ownedPreflightReceipts.has(value)) return false;
      const nonce = (value as Partial<GovernedDeepReviewPreflightReceipt>).nonce;
      const entry = typeof nonce === "string" ? pending.get(nonce) : undefined;
      return Boolean(
        entry &&
          entry.receipt === value &&
          (entry.status === "issued" || entry.status === "bound" || entry.status === "claimed"),
      );
    },
    async prepare(input) {
      const normalized = normalizeInput(input);
      if (!normalized.ok) return failed(normalized.error, "invalid_preflight_request");

      for (const [nonce, entry] of pending) {
        if (
          entry.receipt.runId === normalized.runId &&
          entry.receipt.cwd === normalized.cwd &&
          entry.status !== "claimed"
        ) {
          const released = releasePreflightToolLease(
            pi,
            nonce,
            entry,
            activationReferences,
            preflightOwnedTools,
          );
          if (!released) {
            return failed(
              "A stale same-run preflight tool lease could not be released exactly.",
              "stale_preflight_release_failed",
            );
          }
          entry.status = "cancelled";
          pending.delete(nonce);
        }
      }

      let beforeActive: string[] = [];
      let activeMutated = false;
      try {
        beforeActive = unique(pi.getActiveTools());
        const allTools = pi.getAllTools() as ToolMetadata[];
        const registeredTools = unique(allTools.map((tool) => tool.name));
        const missing = Object.keys(REQUIRED_REGISTERED_TOOL_OWNERS).filter(
          (tool) => !registeredTools.includes(tool),
        );
        if (missing.length > 0) {
          return failed(
            `Required governed-loop tools are not registered: ${missing.join(", ")}.`,
            "missing_registered_tools",
          );
        }

        const callerRoot = sourceRootFromModuleUrl(normalized.callerModuleUrl, "pi-little-helpers");
        if (callerRoot !== realpathSync(ORCHESTRATOR_SOURCE_ROOT)) {
          return failed(
            `Visible-loop caller and orchestrator resolve from different source roots (${callerRoot} != ${realpathSync(ORCHESTRATOR_SOURCE_ROOT)}).`,
            "caller_source_root_mismatch",
          );
        }

        const require = createRequire(import.meta.url);
        const vaultModulePaths = [
          require.resolve("@tryinget/pi-vault-client/dispatch-runtime"),
          require.resolve("@tryinget/pi-vault-client/prompt-plane"),
          require.resolve("@tryinget/pi-vault-client/dispatch-guard"),
        ].map((modulePath) => realpathSync(modulePath));
        const ascModulePath = realpathSync(require.resolve(`${ASC_PACKAGE_NAME}/execution`));
        const ascExtensionPath = realpathSync(require.resolve(ASC_PACKAGE_NAME));
        const vaultRoot = sourceRootFromResolvedPackagePath(vaultModulePaths[0], "pi-vault-client");
        const ascExecutionOwner = packageOwnerFromResolvedPackagePath(
          ascModulePath,
          "pi-autonomous-session-control",
        );
        const ascExtensionOwner = packageOwnerFromResolvedPackagePath(
          ascExtensionPath,
          "pi-autonomous-session-control",
        );
        const sourceRoot = realpathSync(ORCHESTRATOR_SOURCE_ROOT);
        const installedAscPackageRoot = realpathSync(
          resolve(ORCHESTRATOR_PACKAGE_ROOT, "node_modules", ASC_PACKAGE_NAME),
        );
        if (vaultRoot !== sourceRoot) {
          return failed(
            `Deferred Vault owner crosses source roots (orchestrator=${sourceRoot}, vault=${vaultRoot}).`,
            "deferred_owner_source_root_mismatch",
          );
        }
        if (
          ascExecutionOwner.packageRoot !== installedAscPackageRoot ||
          ascExtensionOwner.packageRoot !== installedAscPackageRoot
        ) {
          return failed(
            `ASC execution and root extension must resolve from the exact installed dependency root ${installedAscPackageRoot}; observed execution=${ascExecutionOwner.packageRoot}, extension=${ascExtensionOwner.packageRoot}.`,
            "asc_owner_package_root_mismatch",
          );
        }
        if (
          ascExecutionOwner.packageRoot !== ascExtensionOwner.packageRoot ||
          ascExecutionOwner.version !== ascExtensionOwner.version
        ) {
          return failed(
            `ASC execution and root extension resolve from different package owners (execution=${ascExecutionOwner.packageRoot}@${ascExecutionOwner.version}, extension=${ascExtensionOwner.packageRoot}@${ascExtensionOwner.version}).`,
            "asc_owner_package_mismatch",
          );
        }
        if (ascExecutionOwner.version !== ASC_PACKAGE_VERSION) {
          return failed(
            `ASC deferred owner must be exact ${ASC_PACKAGE_NAME}@${ASC_PACKAGE_VERSION}; observed ${ascExecutionOwner.name}@${ascExecutionOwner.version} at ${ascExecutionOwner.packageRoot}.`,
            "asc_owner_package_version_mismatch",
          );
        }
        for (const modulePath of vaultModulePaths) {
          if (sourceRootFromResolvedPackagePath(modulePath, "pi-vault-client") !== sourceRoot) {
            return failed(
              `Vault deferred imports do not share one source root: ${modulePath}.`,
              "vault_module_source_root_mismatch",
            );
          }
        }

        const toolSourceFailure = verifyToolSourcePaths(allTools, {
          toolbox: realpathSync(
            resolve(sourceRoot, "packages/pi-toolbox-discovery/extensions/toolbox.ts"),
          ),
          orchestrator: realpathSync(
            resolve(
              sourceRoot,
              "packages/pi-society-orchestrator/extensions/society-orchestrator.ts",
            ),
          ),
          vault: realpathSync(resolve(sourceRoot, "packages/pi-vault-client/extensions/vault.js")),
          asc: ascExtensionPath,
        });
        if (toolSourceFailure) {
          return failed(toolSourceFailure, "registered_tool_source_path_mismatch");
        }

        const [dispatchModule, guardModule] = (await Promise.all([
          import(pathToFileURL(vaultModulePaths[0]).href),
          import(pathToFileURL(vaultModulePaths[2]).href),
        ])) as unknown as [VaultDispatchRuntimeModule, VaultDispatchGuardModule];
        const dispatchRuntime = dispatchModule.createVaultDispatchRuntime();
        const dispatchCheck = await dispatchRuntime.checkTemplates(["deep-review"], {
          cwd: normalized.cwd,
        });
        const checkedPosture = dispatchCheck.results?.[0];
        if (
          !dispatchCheck.ok ||
          dispatchCheck.status !== "ready" ||
          checkedPosture?.template_name !== "deep-review" ||
          checkedPosture.posture !== "orchestrator_workflow_gate_required" ||
          checkedPosture.registry_id !== dispatchRuntime.policy.registryId ||
          checkedPosture.binding?.execution_surface !== "workflow_execute"
        ) {
          return failed(
            dispatchCheck.blocking_reason ??
              "The active visible deep-review template does not match the loaded workflow binding.",
            "deep_review_dispatch_check_failed",
          );
        }
        const binding = dispatchRuntime.policy.bindings["deep-review"];
        if (!binding || binding.execution_surface !== "workflow_execute") {
          return failed(
            "The loaded Vault policy does not contain the exact deep-review workflow_execute binding.",
            "deep_review_binding_missing",
          );
        }
        const materialized = materializeVaultWorkflowBinding(
          "deep-review",
          binding.execution_args,
          "governed preflight probe",
        );
        if (!materialized.ok || materialized.workflowId !== "deep-review.v1") {
          return failed(
            materialized.ok
              ? "The materialized deep-review workflow id is not deep-review.v1."
              : materialized.error,
            "deep_review_binding_adapter_mismatch",
          );
        }

        const store = guardModule.createDispatchHandoffStore(
          options.dispatchReceiptPath ? { filePath: options.dispatchReceiptPath } : undefined,
        );
        const storeReadiness = guardModule.probeDispatchHandoffStoreReadiness(store);
        if (!storeReadiness.ok) {
          return failed(
            storeReadiness.error ?? "Vault dispatch handoff store is not ready.",
            "dispatch_receipt_store_unready",
          );
        }

        const sourceCommit = readSourceCommit(sourceRoot);
        let manifest: Record<string, unknown> | null = null;
        if (requireManifest) {
          try {
            manifest = verifyGovernedRuntimeMaterialization(
              sourceRoot,
              sourceCommit,
              MATERIALIZATION_MANIFEST_PATH,
            ) as unknown as Record<string, unknown>;
          } catch (error) {
            if (error instanceof GovernedRuntimeMaterializationError) {
              throw new PreflightFailure(error.failureClass, error.message);
            }
            throw error;
          }
        }

        const desiredActive = unique([...beforeActive, ...REQUIRED_ACTIVE_TOOLS]);
        if (!sameSet(beforeActive, desiredActive)) {
          pi.setActiveTools(desiredActive);
          activeMutated = true;
        }
        const activeTools = unique(pi.getActiveTools());
        if (!sameSet(desiredActive, activeTools)) {
          throw new PreflightFailure(
            "active_tool_readback_mismatch",
            `Pi did not retain the complete governed-loop active set; missing=${desiredActive.filter((tool) => !activeTools.includes(tool)).join(",")}.`,
          );
        }

        const unsigned = {
          schema: PREFLIGHT_SCHEMA,
          nonce: normalized.nonce,
          runId: normalized.runId,
          cwd: normalized.cwd,
          processId: process.pid,
          sourceRoot,
          sourceCommit,
          orchestratorModuleUrl: import.meta.url,
          vaultModuleUrls: vaultModulePaths.map((modulePath) => pathToFileURL(modulePath).href),
          ascModulePath,
          registryId: dispatchRuntime.policy.registryId,
          bindingWorkflowId: "deep-review.v1" as const,
          registeredTools,
          activeTools,
          activatedTools: REQUIRED_ACTIVE_TOOLS.filter((tool) => !beforeActive.includes(tool)),
          receiptStorePath: storeReadiness.filePath,
          materializationManifestPath: manifest ? MATERIALIZATION_MANIFEST_PATH : null,
          issuedAt: new Date().toISOString(),
        };
        const receipt = deepFreeze({
          ...unsigned,
          receiptDigest: digest(unsigned),
        }) as GovernedDeepReviewPreflightReceipt;
        ownedPreflightReceipts.add(receipt);
        const leasedTools = REQUIRED_ACTIVE_TOOLS.filter((tool) => {
          if (receipt.activatedTools.includes(tool)) preflightOwnedTools.add(tool);
          if (!preflightOwnedTools.has(tool)) return false;
          const references = activationReferences.get(tool) ?? new Set<string>();
          references.add(receipt.nonce);
          activationReferences.set(tool, references);
          return true;
        });
        pending.set(receipt.nonce, {
          receipt,
          status: "issued",
          toolCallId: null,
          leasedTools,
        });
        return { ok: true, receipt };
      } catch (error) {
        const failure =
          error instanceof PreflightFailure
            ? error
            : new PreflightFailure(
                "preflight_exception",
                error instanceof Error ? error.message : String(error),
              );
        const rollback = activeMutated
          ? rollbackActiveTools(pi, beforeActive)
          : { attempted: false, succeeded: true };
        return {
          ok: false,
          error: failure.message,
          failureClass: failure.failureClass,
          rollbackAttempted: rollback.attempted,
          rollbackSucceeded: rollback.succeeded,
        };
      }
    },
    bindToolCall(inputNonce, inputToolCallId) {
      const nonce = inputNonce.trim();
      const toolCallId = inputToolCallId.trim();
      const entry = pending.get(nonce);
      if (!entry || entry.status !== "issued" || !toolCallId) return false;
      entry.status = "bound";
      entry.toolCallId = toolCallId;
      return true;
    },
    claimForExecution(input) {
      if (input.templateName !== "deep-review") return { ok: true, receipt: null };
      const cwd = resolve(input.cwd);
      const toolCallId = input.toolCallId.trim();
      const candidates = [...pending.values()].filter(
        (entry) =>
          entry.status === "bound" && entry.receipt.cwd === cwd && entry.toolCallId === toolCallId,
      );
      if (candidates.length === 0) {
        const pendingForCwd = [...pending.values()].some(
          (entry) =>
            (entry.status === "issued" || entry.status === "bound") && entry.receipt.cwd === cwd,
        );
        return pendingForCwd
          ? {
              ok: false,
              error: "Governed deep-review tool call does not match the pending loop preflight.",
            }
          : { ok: true, receipt: null };
      }
      if (candidates.length !== 1) {
        return {
          ok: false,
          error: "Governed deep-review preflight is ambiguous for this tool call.",
        };
      }
      candidates[0].status = "claimed";
      return { ok: true, receipt: candidates[0].receipt };
    },
    settleExecution(nonce, outcome) {
      const entry = pending.get(nonce);
      if (!entry || entry.status !== "claimed") return false;
      const released = releasePreflightToolLease(
        pi,
        nonce,
        entry,
        activationReferences,
        preflightOwnedTools,
      );
      entry.status = released ? outcome : "failed";
      if (released) pending.delete(nonce);
      return released;
    },
    cancel(nonce) {
      const entry = pending.get(nonce);
      if (!entry || entry.status === "claimed" || entry.status === "done") return false;
      const released = releasePreflightToolLease(
        pi,
        nonce,
        entry,
        activationReferences,
        preflightOwnedTools,
      );
      entry.status = released ? "cancelled" : "failed";
      if (released) pending.delete(nonce);
      return released;
    },
  };

  setGlobalSlot(runtime);
  return runtime;
}

class PreflightFailure extends Error {
  readonly failureClass: string;

  constructor(failureClass: string, message: string) {
    super(message);
    this.failureClass = failureClass;
  }
}

function normalizeInput(input: {
  nonce: string;
  runId: string;
  cwd: string;
  callerModuleUrl: string;
}):
  | { ok: true; nonce: string; runId: string; cwd: string; callerModuleUrl: string }
  | { ok: false; error: string } {
  const nonce = input.nonce.trim();
  const runId = input.runId.trim();
  const callerModuleUrl = input.callerModuleUrl.trim();
  if (!/^[a-f0-9-]{16,64}$/iu.test(nonce)) return { ok: false, error: "Invalid preflight nonce." };
  if (!runId || !input.cwd || !isAbsolute(input.cwd) || !callerModuleUrl.startsWith("file:")) {
    return {
      ok: false,
      error: "Preflight runId, absolute cwd, and caller module URL are required.",
    };
  }
  return { ok: true, nonce, runId, cwd: resolve(input.cwd), callerModuleUrl };
}

function failed(error: string, failureClass: string): GovernedDeepReviewPreflightResult {
  return {
    ok: false,
    error,
    failureClass,
    rollbackAttempted: false,
    rollbackSucceeded: true,
  };
}

function unique(values: readonly string[]): string[] {
  return [...new Set(values)];
}

function sameSet(left: readonly string[], right: readonly string[]): boolean {
  const a = unique(left);
  const b = unique(right);
  return a.length === b.length && a.every((value) => b.includes(value));
}

function rollbackActiveTools(
  pi: PiRuntimeTools,
  before: string[],
): { attempted: boolean; succeeded: boolean } {
  try {
    pi.setActiveTools(before);
    return { attempted: true, succeeded: sameSet(before, pi.getActiveTools()) };
  } catch {
    return { attempted: true, succeeded: false };
  }
}

function releasePreflightToolLease(
  pi: PiRuntimeTools,
  nonce: string,
  entry: PendingReceipt,
  activationReferences: Map<string, Set<string>>,
  preflightOwnedTools: Set<string>,
): boolean {
  const nextReferences = new Map<string, Set<string>>();
  const toolsToRelease = new Set<string>();
  for (const tool of entry.leasedTools) {
    const references = new Set(activationReferences.get(tool) ?? []);
    if (!references.delete(nonce)) return false;
    nextReferences.set(tool, references);
    if (references.size === 0 && preflightOwnedTools.has(tool)) toolsToRelease.add(tool);
  }
  try {
    const desired = unique(pi.getActiveTools().filter((tool) => !toolsToRelease.has(tool)));
    if (!sameSet(desired, pi.getActiveTools())) pi.setActiveTools(desired);
    if (!sameSet(desired, pi.getActiveTools())) return false;
    for (const [tool, references] of nextReferences) {
      if (references.size > 0) activationReferences.set(tool, references);
      else {
        activationReferences.delete(tool);
        preflightOwnedTools.delete(tool);
      }
    }
    return true;
  } catch {
    return false;
  }
}

function sourceRootFromModuleUrl(moduleUrl: string, expectedPackage: string): string {
  return sourceRootFromResolvedPackagePath(realpathSync(fileURLToPath(moduleUrl)), expectedPackage);
}

function sourceRootFromResolvedPackagePath(modulePath: string, expectedPackage: string): string {
  const owner = packageOwnerFromResolvedPackagePath(modulePath, expectedPackage);
  const candidate = expectedPackage.startsWith("pi-interaction-")
    ? resolve(owner.packageRoot, "../../..")
    : resolve(owner.packageRoot, "../..");
  return realpathSync(candidate);
}

function packageOwnerFromResolvedPackagePath(
  modulePath: string,
  expectedPackage: string,
): { packageRoot: string; name: string; version: string } {
  const expectedName = `@tryinget/${expectedPackage}`;
  let cursor = dirname(realpathSync(modulePath));
  for (;;) {
    const packagePath = resolve(cursor, "package.json");
    if (existsSync(packagePath)) {
      try {
        const pkg = JSON.parse(readFileSync(packagePath, "utf8")) as {
          name?: unknown;
          version?: unknown;
        };
        if (pkg.name === expectedName) {
          if (typeof pkg.version !== "string" || pkg.version.length === 0) {
            throw new Error(
              `Package owner ${expectedName} has no exact version at ${packagePath}.`,
            );
          }
          return {
            packageRoot: realpathSync(cursor),
            name: expectedName,
            version: pkg.version,
          };
        }
      } catch (error) {
        if (error instanceof Error && error.message.startsWith("Package owner ")) throw error;
        // Continue upward until the exact owning package manifest is found.
      }
    }
    const parent = dirname(cursor);
    if (parent === cursor) throw new Error(`Cannot locate ${expectedName} for ${modulePath}.`);
    cursor = parent;
  }
}

function verifyToolSourcePaths(
  tools: ToolMetadata[],
  expectedPaths: Record<
    (typeof REQUIRED_REGISTERED_TOOL_OWNERS)[keyof typeof REQUIRED_REGISTERED_TOOL_OWNERS],
    string
  >,
): string | null {
  const byName = new Map(tools.map((tool) => [tool.name, tool]));
  for (const [toolName, owner] of Object.entries(REQUIRED_REGISTERED_TOOL_OWNERS)) {
    const rawPath = byName.get(toolName)?.sourceInfo?.path;
    if (!rawPath || rawPath.startsWith("<") || !isAbsolute(rawPath)) {
      return `Registered tool ${toolName} lacks an absolute extension source path.`;
    }
    let observedPath: string;
    try {
      observedPath = realpathSync(rawPath);
    } catch {
      return `Registered tool ${toolName} source path is unreadable: ${rawPath}.`;
    }
    const expectedPath = expectedPaths[owner];
    if (observedPath !== expectedPath) {
      return `Registered tool ${toolName} resolves from ${observedPath}; expected exact owner ${expectedPath}.`;
    }
  }
  return null;
}

function readSourceCommit(sourceRoot: string): string {
  const commit = execFileSync("git", ["-C", sourceRoot, "rev-parse", "HEAD"], {
    encoding: "utf8",
    stdio: ["ignore", "pipe", "pipe"],
  }).trim();
  if (!/^[a-f0-9]{40}$/u.test(commit)) throw new Error("Governed runtime source HEAD is invalid.");
  return commit;
}

function deepFreeze<T>(value: T): T {
  if (!value || typeof value !== "object" || Object.isFrozen(value)) return value;
  for (const child of Object.values(value as Record<string, unknown>)) deepFreeze(child);
  return Object.freeze(value);
}

function digest(value: unknown): string {
  return createHash("sha256").update(JSON.stringify(value)).digest("hex");
}

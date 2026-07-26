// summary: consume the orchestrator-owned same-process deep-review preflight before loop effects.
// read_when:
//   - changing visible/Nexus startup gates or governed receipt correlation.

import { createHash } from "node:crypto";
import { dirname, resolve } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const GLOBAL_PREFLIGHT_SYMBOL = Symbol.for("tryinget.pi.governed-deep-review-preflight.v1");
const PREFLIGHT_SCHEMA = "pi.governed-deep-review-preflight.v1" as const;
const EXPECTED_OWNER_MODULE_URL = pathToFileURL(
  resolve(
    dirname(fileURLToPath(import.meta.url)),
    "../../pi-society-orchestrator/src/runtime/governed-deep-review-preflight.ts",
  ),
).href;
const EXPECTED_OWNER_REGISTRY_URL = pathToFileURL(
  resolve(
    dirname(fileURLToPath(import.meta.url)),
    "../../pi-society-orchestrator/src/runtime/governed-deep-review-owner-registry.mjs",
  ),
).href;

export interface VisibleLoopGovernedPreflightReceipt {
  schema: typeof PREFLIGHT_SCHEMA;
  nonce: string;
  receiptDigest: string;
  runId: string;
  cwd: string;
  processId: number;
  sourceRoot: string;
  sourceCommit: string;
  orchestratorModuleUrl: string;
  registryId: string;
  bindingWorkflowId: "deep-review.v1";
  activeTools: string[];
  activatedTools: string[];
  issuedAt: string;
}

export type VisibleLoopGovernedPreflightResult =
  | { ok: true; receipt: VisibleLoopGovernedPreflightReceipt }
  | {
      ok: false;
      error: string;
      failureClass?: string;
      rollbackAttempted?: boolean;
      rollbackSucceeded?: boolean;
    };

export type RunVisibleLoopGovernedPreflight = ((input: {
  nonce: string;
  runId: string;
  cwd: string;
  callerModuleUrl: string;
}) => Promise<VisibleLoopGovernedPreflightResult>) & {
  bindToolCall?(nonce: string, toolCallId: string): boolean;
  cancel?(nonce: string): boolean;
};

type OwnerRuntime = {
  ownerModuleUrl: string;
  prepare: RunVisibleLoopGovernedPreflight;
  verifyReceipt(value: unknown): value is VisibleLoopGovernedPreflightReceipt;
  bindToolCall(nonce: string, toolCallId: string): boolean;
  cancel(nonce: string): boolean;
};

type OwnerRegistry = {
  isOwnedRuntime(value: unknown): boolean;
};

const attestedReceiptOwners = new Map<string, OwnerRuntime>();

type GlobalSlot = {
  generation: number;
  runtime: OwnerRuntime;
};

export async function runOwnerVisibleLoopGovernedPreflight(input: {
  nonce: string;
  runId: string;
  cwd: string;
  callerModuleUrl?: string;
}): Promise<VisibleLoopGovernedPreflightResult> {
  const slot = (globalThis as Record<PropertyKey, unknown>)[GLOBAL_PREFLIGHT_SYMBOL] as
    | GlobalSlot
    | undefined;
  if (
    !slot ||
    !Number.isInteger(slot.generation) ||
    slot.generation < 1 ||
    !slot.runtime ||
    typeof slot.runtime.prepare !== "function" ||
    typeof slot.runtime.verifyReceipt !== "function" ||
    typeof slot.runtime.bindToolCall !== "function" ||
    typeof slot.runtime.ownerModuleUrl !== "string"
  ) {
    return {
      ok: false,
      error:
        "The pi-society-orchestrator governed deep-review preflight owner is not registered in this Pi process.",
      failureClass: "preflight_owner_unavailable",
      rollbackAttempted: false,
      rollbackSucceeded: true,
    };
  }
  if (slot.runtime.ownerModuleUrl !== EXPECTED_OWNER_MODULE_URL) {
    return invalid(
      `The governed deep-review preflight owner module path is not canonical: ${slot.runtime.ownerModuleUrl}.`,
      "preflight_owner_module_mismatch",
    );
  }
  let ownerRegistry: OwnerRegistry;
  try {
    ownerRegistry = (await import(EXPECTED_OWNER_REGISTRY_URL)) as OwnerRegistry;
  } catch (error) {
    return invalid(
      `The governed deep-review preflight owner registry could not be loaded: ${
        error instanceof Error ? error.message : String(error)
      }`,
      "preflight_owner_module_unavailable",
    );
  }
  if (!ownerRegistry.isOwnedRuntime(slot.runtime)) {
    return invalid(
      "The process-global governed deep-review preflight capability is not branded by its owner module.",
      "preflight_owner_attestation_failed",
    );
  }
  const result = await slot.runtime.prepare({
    ...input,
    callerModuleUrl: input.callerModuleUrl ?? import.meta.url,
  });
  if (!result.ok) return result;
  if (!slot.runtime.verifyReceipt(result.receipt)) {
    return invalid(
      "The governed deep-review preflight receipt is not branded by its owner runtime.",
      "preflight_receipt_owner_attestation_failed",
    );
  }
  const validation = validateVisibleLoopGovernedPreflightReceipt(result.receipt, input);
  if (!validation.ok) {
    slot.runtime.cancel(result.receipt.nonce);
    return validation;
  }
  attestedReceiptOwners.set(result.receipt.nonce, slot.runtime);
  return result;
}

export function bindOwnerVisibleLoopGovernedPreflightToolCall(
  nonce: string,
  toolCallId: string,
): boolean {
  const owner = attestedReceiptOwners.get(nonce);
  return owner?.bindToolCall(nonce, toolCallId) === true;
}

export function cancelOwnerVisibleLoopGovernedPreflight(nonce: string): boolean {
  const owner = attestedReceiptOwners.get(nonce);
  if (!owner) return false;
  const cancelled = owner.cancel(nonce);
  if (cancelled) attestedReceiptOwners.delete(nonce);
  return cancelled;
}

export function forgetOwnerVisibleLoopGovernedPreflight(nonce: string): void {
  attestedReceiptOwners.delete(nonce);
}

export function isOwnerVisibleLoopGovernedPreflightReceiptActive(
  value: unknown,
): value is VisibleLoopGovernedPreflightReceipt {
  if (!value || typeof value !== "object") return false;
  const nonce = (value as Partial<VisibleLoopGovernedPreflightReceipt>).nonce;
  const owner = typeof nonce === "string" ? attestedReceiptOwners.get(nonce) : undefined;
  return owner?.verifyReceipt(value) === true;
}

export function validateVisibleLoopGovernedPreflightReceipt(
  value: unknown,
  expected: { nonce: string; runId: string; cwd: string },
): VisibleLoopGovernedPreflightResult {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return invalid("Governed deep-review preflight returned no receipt.");
  }
  const receipt = value as VisibleLoopGovernedPreflightReceipt;
  if (
    receipt.schema !== PREFLIGHT_SCHEMA ||
    receipt.nonce !== expected.nonce ||
    receipt.runId !== expected.runId ||
    receipt.cwd !== expected.cwd ||
    receipt.processId !== process.pid ||
    receipt.bindingWorkflowId !== "deep-review.v1" ||
    typeof receipt.registryId !== "string" ||
    !receipt.registryId ||
    typeof receipt.sourceRoot !== "string" ||
    !receipt.sourceRoot ||
    !/^[a-f0-9]{40}$/u.test(receipt.sourceCommit) ||
    typeof receipt.orchestratorModuleUrl !== "string" ||
    !receipt.orchestratorModuleUrl.startsWith("file:") ||
    !Array.isArray(receipt.activeTools) ||
    !["toolbox", "workflow_execute", "vault_execute_template"].every((tool) =>
      receipt.activeTools.includes(tool),
    ) ||
    typeof receipt.receiptDigest !== "string"
  ) {
    return invalid("Governed deep-review preflight receipt identity is invalid.");
  }
  const { receiptDigest, ...unsigned } = receipt;
  if (createHash("sha256").update(JSON.stringify(unsigned)).digest("hex") !== receiptDigest) {
    return invalid("Governed deep-review preflight receipt digest is invalid.");
  }
  return { ok: true, receipt };
}

function invalid(
  error: string,
  failureClass = "preflight_receipt_invalid",
): VisibleLoopGovernedPreflightResult {
  return {
    ok: false,
    error,
    failureClass,
    rollbackAttempted: false,
    rollbackSucceeded: true,
  };
}

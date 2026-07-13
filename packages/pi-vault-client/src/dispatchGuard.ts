import * as crypto from "node:crypto";
import {
  closeSync,
  existsSync,
  fsyncSync,
  lstatSync,
  mkdirSync,
  openSync,
  writeSync,
} from "node:fs";
import * as os from "node:os";
import * as path from "node:path";
import { classifyDispatchPosture, type ExecutionBinding } from "./dispatchPosture.js";
import {
  type DispatchAggregateIdentity,
  type DispatchAuthorizationV1,
  type ExecutionSurface,
  isVaultDispatchRuntime,
  type VaultDispatchRuntime,
} from "./dispatchRuntime.js";
import type { Template } from "./vaultTypes.js";

export interface GuardPreparedTextRequest {
  templates: Template[];
  primaryTemplateName: string;
  preparedText: string;
  surface: ExecutionSurface;
  currentCompany: string;
  compositionKind?: "single" | "grounding" | "route" | "batch";
  renderer?: string;
  rendererVersion?: string;
  wrapper?: string;
  context?: string;
  args?: string[];
}

export type GuardPreparedTextResult =
  | { ok: true; text: string; authorizationId: string }
  | { ok: false; error: string; authorization: DispatchAuthorizationV1 };

/** Final package guard before ordinary prompt text is released to Pi. */
export function guardPreparedText(
  request: GuardPreparedTextRequest,
  runtime: VaultDispatchRuntime,
): GuardPreparedTextResult {
  if (!isVaultDispatchRuntime(runtime)) {
    throw new Error("A package-owned VaultDispatchRuntime is required.");
  }
  const authorization = runtime.authorizePreparedExecution({
    templates: request.templates,
    primaryTemplateName: request.primaryTemplateName,
    finalPreparedText: request.preparedText,
    compositionKind: request.compositionKind,
    surface: request.surface,
    currentCompany: request.currentCompany,
    renderer: request.renderer,
    rendererVersion: request.rendererVersion,
    wrapper: request.wrapper,
    context: request.context,
    args: request.args,
  });
  if (authorization.disposition === "blocked") {
    return { ok: false, error: `BLOCKED: ${authorization.safeMessage}`, authorization };
  }
  if (authorization.disposition === "dispatch_required") {
    return {
      ok: false,
      error: `BLOCKED: ${request.primaryTemplateName} requires ${authorization.binding.execution_surface}; raw prompt submission is not lawful. Use the verified dispatch adapter.`,
      authorization,
    };
  }
  const claimed = runtime.claimPreparedExecution(authorization.authorizationId);
  if (!claimed.ok) return { ok: false, error: `BLOCKED: ${claimed.error}`, authorization };
  runtime.settlePreparedExecution(authorization.authorizationId, "handed_off");
  return {
    ok: true,
    text: claimed.value.sealedText,
    authorizationId: authorization.authorizationId,
  };
}

export interface DurableAuthorizationReceipt {
  schema: "pi.vault.dispatch-handoff.v1";
  handoffId: string;
  authorizationId: string;
  aggregate: DispatchAggregateIdentity;
  registryId: string;
  surface: ExecutionSurface;
  intendedExecutor: string;
  persistedAt: string;
}

export interface DispatchHandoffStore {
  readonly filePath: string;
}

const ownedStoreWriters = new WeakMap<object, (receipt: DurableAuthorizationReceipt) => boolean>();

export function createDispatchHandoffStore(
  options: { filePath?: string } = {},
): DispatchHandoffStore {
  const filePath = path.resolve(
    options.filePath ??
      path.join(
        process.env.PI_VAULT_RECEIPTS_DIR ||
          path.join(os.homedir(), ".pi/agent/state/pi-vault-client"),
        "vault-dispatch-handoffs.jsonl",
      ),
  );
  const store: DispatchHandoffStore = Object.freeze({ filePath });
  ownedStoreWriters.set(store, (receipt: DurableAuthorizationReceipt): boolean => {
    const directory = path.dirname(filePath);
    let fd: number | null = null;
    let directoryFd: number | null = null;
    try {
      const directoryExisted = existsSync(directory);
      mkdirSync(directory, { recursive: true, mode: 0o700 });
      if (existsSync(filePath)) {
        const stat = lstatSync(filePath);
        if (!stat.isFile() || stat.isSymbolicLink()) return false;
      }
      fd = openSync(filePath, "a", 0o600);
      const bytes = Buffer.from(`${JSON.stringify(receipt)}\n`, "utf8");
      let offset = 0;
      while (offset < bytes.length) {
        const written = writeSync(fd, bytes, offset, bytes.length - offset);
        if (written <= 0) return false;
        offset += written;
      }
      fsyncSync(fd);
      if (!directoryExisted) {
        directoryFd = openSync(directory, "r");
        fsyncSync(directoryFd);
      }
      return true;
    } catch {
      return false;
    } finally {
      if (directoryFd !== null) closeSync(directoryFd);
      if (fd !== null) closeSync(fd);
    }
  });
  return store;
}

export interface DispatchActivationPolicy {
  readonly mode: "enabled" | "disable_gated_dispatch";
  readonly enabled: boolean;
}
const ownedActivationPolicies = new WeakSet<object>();

export function createDispatchActivationPolicy(enabled: boolean): DispatchActivationPolicy {
  const policy = Object.freeze({
    mode: enabled ? ("enabled" as const) : ("disable_gated_dispatch" as const),
    enabled,
  });
  ownedActivationPolicies.add(policy);
  return policy;
}

export interface DispatchExecutorResult {
  accepted: boolean;
  handoffId: string;
  runId?: string;
  status?: string;
}

/** Claim, durably record, then invoke a gated executor with exact correlation. */
export async function dispatchAuthorizedExecution(options: {
  runtime: VaultDispatchRuntime;
  authorizationId: string;
  intendedExecutor: ExecutionBinding["execution_surface"];
  activation: DispatchActivationPolicy;
  receiptStore: DispatchHandoffStore;
  execute: (input: {
    handoffId: string;
    authorizationId: string;
    sealedText: string;
    binding: Readonly<ExecutionBinding>;
  }) => Promise<DispatchExecutorResult>;
}): Promise<
  | { ok: true; handoffId: string; result: DispatchExecutorResult }
  | { ok: false; error: string; handoffId?: string }
> {
  if (!isVaultDispatchRuntime(options.runtime)) {
    return { ok: false, error: "A package-owned VaultDispatchRuntime is required." };
  }
  if (!ownedActivationPolicies.has(options.activation) || !options.activation.enabled) {
    return { ok: false, error: "Gated dispatch is disabled; candidate remains blocked." };
  }
  const persistReceipt = ownedStoreWriters.get(options.receiptStore);
  if (!persistReceipt) {
    return { ok: false, error: "A package-owned durable handoff store is required." };
  }
  const claimed = options.runtime.claimPreparedExecution(options.authorizationId);
  if (!claimed.ok) return { ok: false, error: claimed.error };
  if (claimed.value.disposition !== "dispatch_required" || !claimed.value.binding) {
    options.runtime.settlePreparedExecution(options.authorizationId, "failed");
    return { ok: false, error: "Authorization does not require a gated executor." };
  }
  if (claimed.value.binding.execution_surface !== options.intendedExecutor) {
    options.runtime.settlePreparedExecution(options.authorizationId, "failed");
    return { ok: false, error: "Intended executor does not match the frozen binding." };
  }
  const handoffId = crypto.randomUUID();
  const receipt: DurableAuthorizationReceipt = {
    schema: "pi.vault.dispatch-handoff.v1",
    handoffId,
    authorizationId: options.authorizationId,
    aggregate: claimed.value.aggregate,
    registryId: options.runtime.policy.registryId,
    surface: claimed.value.surface,
    intendedExecutor: options.intendedExecutor,
    persistedAt: new Date().toISOString(),
  };
  if (!persistReceipt(receipt)) {
    options.runtime.settlePreparedExecution(options.authorizationId, "failed");
    return { ok: false, handoffId, error: "Durable authorization receipt persistence failed." };
  }
  try {
    const result = await options.execute({
      handoffId,
      authorizationId: options.authorizationId,
      sealedText: claimed.value.sealedText,
      binding: claimed.value.binding,
    });
    const accepted = result.accepted && result.handoffId === handoffId;
    options.runtime.settlePreparedExecution(
      options.authorizationId,
      accepted ? "handed_off" : "failed",
    );
    return accepted
      ? { ok: true, handoffId, result }
      : {
          ok: false,
          handoffId,
          error: "Executor rejected or failed to cite the exact handoff identity.",
        };
  } catch (error) {
    options.runtime.settlePreparedExecution(options.authorizationId, "failed");
    return { ok: false, handoffId, error: error instanceof Error ? error.message : String(error) };
  }
}

export { classifyDispatchPosture };

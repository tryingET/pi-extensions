import * as crypto from "node:crypto";
import {
  accessSync,
  closeSync,
  constants,
  existsSync,
  fstatSync,
  fsyncSync,
  lstatSync,
  mkdirSync,
  openSync,
  writeSync,
} from "node:fs";
import * as os from "node:os";
import * as path from "node:path";
import { classifyDispatchPosture } from "./dispatchPosture.js";
import { isVaultDispatchRuntime } from "./dispatchRuntime.js";
/** Final package guard before ordinary prompt text is released to Pi. */
export function guardPreparedText(request, runtime) {
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
const ownedStoreWriters = new WeakMap();
export function createDispatchHandoffStore(options = {}) {
  const filePath = path.resolve(
    options.filePath ??
      path.join(
        process.env.PI_VAULT_RECEIPTS_DIR ||
          path.join(os.homedir(), ".pi/agent/state/pi-vault-client"),
        "vault-dispatch-handoffs.jsonl",
      ),
  );
  const store = Object.freeze({ filePath });
  ownedStoreWriters.set(store, (receipt) => {
    const directory = path.dirname(filePath);
    let fd = null;
    let directoryFd = null;
    try {
      const directoryExisted = existsSync(directory);
      mkdirSync(directory, { recursive: true, mode: 0o700 });
      if (existsSync(filePath)) {
        const stat = lstatSync(filePath);
        if (!stat.isFile() || stat.isSymbolicLink()) return false;
      }
      const noFollow = constants.O_NOFOLLOW;
      if (!Number.isInteger(noFollow) || noFollow === 0) return false;
      fd = openSync(
        filePath,
        constants.O_WRONLY | constants.O_APPEND | constants.O_CREAT | noFollow,
        0o600,
      );
      const opened = fstatSync(fd);
      if (!opened.isFile()) return false;
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
function findSymlinkPathComponent(targetPath) {
  const absolute = path.resolve(targetPath);
  const parsed = path.parse(absolute);
  let cursor = parsed.root;
  for (const component of absolute.slice(parsed.root.length).split(path.sep).filter(Boolean)) {
    cursor = path.join(cursor, component);
    try {
      const stat = lstatSync(cursor);
      if (stat.isSymbolicLink()) return cursor;
    } catch {
      break;
    }
  }
  return null;
}
/**
 * Verify that the exact package-owned handoff store can be materialized later without writing a
 * success-shaped receipt during preflight. The real dispatch remains the only receipt writer.
 */
export function probeDispatchHandoffStoreReadiness(store) {
  if (!ownedStoreWriters.has(store)) {
    return {
      ok: false,
      filePath: "",
      error: "A package-owned durable handoff store is required.",
    };
  }
  const filePath = path.resolve(store.filePath);
  try {
    const symlinkComponent = findSymlinkPathComponent(filePath);
    if (symlinkComponent) {
      return {
        ok: false,
        filePath,
        error: `Dispatch handoff path traverses a symlink component: ${symlinkComponent}.`,
      };
    }
    if (existsSync(filePath)) {
      const stat = lstatSync(filePath);
      if (!stat.isFile() || stat.isSymbolicLink()) {
        return {
          ok: false,
          filePath,
          error: "Dispatch handoff path must be a regular non-symlink file.",
        };
      }
      accessSync(filePath, constants.R_OK | constants.W_OK);
      return { ok: true, filePath };
    }
    let cursor = path.dirname(filePath);
    while (!existsSync(cursor)) {
      const parent = path.dirname(cursor);
      if (parent === cursor) {
        return {
          ok: false,
          filePath,
          error: "Dispatch handoff path has no existing writable ancestor.",
        };
      }
      cursor = parent;
    }
    const ancestor = lstatSync(cursor);
    if (!ancestor.isDirectory() || ancestor.isSymbolicLink()) {
      return {
        ok: false,
        filePath,
        error: "Dispatch handoff path ancestor must be a non-symlink directory.",
      };
    }
    accessSync(cursor, constants.W_OK | constants.X_OK);
    return { ok: true, filePath };
  } catch (error) {
    return {
      ok: false,
      filePath,
      error: error instanceof Error ? error.message : String(error),
    };
  }
}
const ownedActivationPolicies = new WeakSet();
export function createDispatchActivationPolicy(enabled) {
  const policy = Object.freeze({
    mode: enabled ? "enabled" : "disable_gated_dispatch",
    enabled,
  });
  ownedActivationPolicies.add(policy);
  return policy;
}
/** Claim, durably record, then invoke a gated executor with exact correlation. */
export async function dispatchAuthorizedExecution(options) {
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
  const receipt = {
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

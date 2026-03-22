/**
 * Vault runtime registry integration.
 *
 * Registers vault-client receipt and telemetry accessors in the shared global
 * runtime registry for cross-extension discovery without widening /vault ownership.
 */

import { getGlobalRuntimeRegistry } from "@tryinget/pi-runtime-registry";
import type { VaultExecutionReceiptV1, VaultReceiptManager } from "./vaultTypes.js";

/** Capability IDs exposed by the vault runtime registry bridge */
export const VAULT_CAPABILITIES = {
  RECEIPTS: "vault:receipts",
  TELEMETRY: "vault:telemetry",
} as const;

/** Owner ID for vault-client registrations */
export const VAULT_REGISTRY_OWNER = "pi-vault-client";

/** Runtime IDs for vault registry bridge components */
export const VAULT_RUNTIME_IDS = {
  RECEIPTS: "vault-receipts",
  TELEMETRY: "vault-telemetry",
} as const;

export interface VaultTelemetryAccessor {
  summarize(): string;
  getEventCount(): number;
  getStats(): { registrations: number; failures: number; eventCount: number };
}

export interface VaultReceiptsAccessor {
  readLatest(): VaultExecutionReceiptV1 | null;
  readByExecutionId(executionId: number): VaultExecutionReceiptV1 | null;
  listRecent(options?: {
    currentCompany?: string;
    templateName?: string;
    limit?: number;
  }): VaultExecutionReceiptV1[];
}

export function createVaultTelemetryAccessor(options: {
  summarize: () => string;
  getStats: () => { registrations: number; failures: number; eventCount: number };
}): VaultTelemetryAccessor {
  const { summarize, getStats } = options;
  return {
    summarize,
    getEventCount: () => getStats().eventCount,
    getStats,
  };
}

export function createVaultReceiptsAccessor(
  receiptManager: VaultReceiptManager,
): VaultReceiptsAccessor {
  return {
    readLatest: () => receiptManager.readLatestReceipt(),
    readByExecutionId: (executionId) => receiptManager.readReceiptByExecutionId(executionId),
    listRecent: (options) => receiptManager.listRecentReceipts(options),
  };
}

export function registerVaultCapabilityBridges(options: {
  receiptManager: VaultReceiptManager;
  summarizeTelemetry: () => string;
  getTelemetryStats: () => { registrations: number; failures: number; eventCount: number };
}): void {
  const registry = getGlobalRuntimeRegistry();
  const { receiptManager, summarizeTelemetry, getTelemetryStats } = options;

  const receiptsAccessor = createVaultReceiptsAccessor(receiptManager);
  registry.register(VAULT_REGISTRY_OWNER, VAULT_RUNTIME_IDS.RECEIPTS, receiptsAccessor, [
    {
      id: VAULT_CAPABILITIES.RECEIPTS,
      description: "Vault execution receipt inspection and replay access",
      metadata: {
        operations: ["readLatest", "readByExecutionId", "listRecent"],
      },
    },
  ]);

  const telemetryAccessor = createVaultTelemetryAccessor({
    summarize: summarizeTelemetry,
    getStats: getTelemetryStats,
  });
  registry.register(VAULT_REGISTRY_OWNER, VAULT_RUNTIME_IDS.TELEMETRY, telemetryAccessor, [
    {
      id: VAULT_CAPABILITIES.TELEMETRY,
      description: "Vault live trigger telemetry access",
      metadata: {
        operations: ["summarize", "getEventCount", "getStats"],
      },
    },
  ]);
}

export function unregisterVaultCapabilityBridges(): void {
  const registry = getGlobalRuntimeRegistry();
  registry.unregister(VAULT_REGISTRY_OWNER, VAULT_RUNTIME_IDS.RECEIPTS);
  registry.unregister(VAULT_REGISTRY_OWNER, VAULT_RUNTIME_IDS.TELEMETRY);
}

export function getVaultReceiptsAccessor(): VaultReceiptsAccessor | undefined {
  const registry = getGlobalRuntimeRegistry();
  const entry = registry.get(VAULT_REGISTRY_OWNER, VAULT_RUNTIME_IDS.RECEIPTS);
  return entry?.instance as VaultReceiptsAccessor | undefined;
}

export function getVaultTelemetryAccessor(): VaultTelemetryAccessor | undefined {
  const registry = getGlobalRuntimeRegistry();
  const entry = registry.get(VAULT_REGISTRY_OWNER, VAULT_RUNTIME_IDS.TELEMETRY);
  return entry?.instance as VaultTelemetryAccessor | undefined;
}

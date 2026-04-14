/**
 * Vault runtime registry integration.
 *
 * Registers vault-client receipt and telemetry accessors in the shared global
 * runtime registry for cross-extension discovery without widening /vault ownership.
 */
import { getGlobalRuntimeRegistry } from "@tryinget/pi-runtime-registry";
/** Capability IDs exposed by the vault runtime registry bridge */
export const VAULT_CAPABILITIES = {
  RECEIPTS: "vault:receipts",
  TELEMETRY: "vault:telemetry",
};
/** Owner ID for vault-client registrations */
export const VAULT_REGISTRY_OWNER = "pi-vault-client";
/** Runtime IDs for vault registry bridge components */
export const VAULT_RUNTIME_IDS = {
  RECEIPTS: "vault-receipts",
  TELEMETRY: "vault-telemetry",
};
export function createVaultTelemetryAccessor(options) {
  const { summarize, getStats } = options;
  return {
    summarize,
    getEventCount: () => getStats().eventCount,
    getStats,
  };
}
export function createVaultReceiptsAccessor(receiptManager) {
  function requireCurrentCompany(options) {
    const currentCompany = String(options?.currentCompany || "").trim();
    return currentCompany || null;
  }
  return {
    readLatest: (options) => {
      const currentCompany = requireCurrentCompany(options);
      if (!currentCompany) return null;
      return (
        receiptManager.listRecentReceipts({
          currentCompany,
          limit: 1,
          trustedOnly: true,
        })[0] || null
      );
    },
    readByExecutionId: (executionId, options) => {
      const currentCompany = requireCurrentCompany(options);
      if (!currentCompany) return null;
      const receipt = receiptManager.readTrustedReceiptByExecutionId(executionId);
      if (!receipt || !receipt.template.visibility_companies.includes(currentCompany)) return null;
      return receipt;
    },
    listRecent: (options) => {
      const currentCompany = requireCurrentCompany(options);
      if (!currentCompany) return [];
      return receiptManager.listRecentReceipts({
        currentCompany,
        templateName: options.templateName,
        limit: options.limit,
        trustedOnly: true,
      });
    },
  };
}
export function registerVaultCapabilityBridges(options) {
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
export function unregisterVaultCapabilityBridges() {
  const registry = getGlobalRuntimeRegistry();
  registry.unregister(VAULT_REGISTRY_OWNER, VAULT_RUNTIME_IDS.RECEIPTS);
  registry.unregister(VAULT_REGISTRY_OWNER, VAULT_RUNTIME_IDS.TELEMETRY);
}
export function getVaultReceiptsAccessor() {
  const registry = getGlobalRuntimeRegistry();
  const entry = registry.get(VAULT_REGISTRY_OWNER, VAULT_RUNTIME_IDS.RECEIPTS);
  return entry?.instance;
}
export function getVaultTelemetryAccessor() {
  const registry = getGlobalRuntimeRegistry();
  const entry = registry.get(VAULT_REGISTRY_OWNER, VAULT_RUNTIME_IDS.TELEMETRY);
  return entry?.instance;
}

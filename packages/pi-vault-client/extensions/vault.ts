import type { ExtensionAPI } from "@earendil-works/pi-coding-agent";
import { createVaultDispatchRuntime } from "../src/dispatchRuntime.js";
import {
  registerPromptEvaluatorCommands,
  registerPromptEvaluatorTool,
  type VaultOps,
} from "../src/evaluator.js";
import { registerVaultCommands } from "../src/vaultCommands.js";
import { createVaultRuntime } from "../src/vaultDb.js";
import { createGroundingRuntime } from "../src/vaultGrounding.js";
import { createPickerRuntime } from "../src/vaultPicker.js";
import { createVaultReceiptManager } from "../src/vaultReceipts.js";
import {
  registerVaultCapabilityBridges,
  unregisterVaultCapabilityBridges,
} from "../src/vaultRuntimeRegistry.js";
import { registerVaultDiagnosticsTool, registerVaultTools } from "../src/vaultTools.js";
import { VAULT_DIR, VLLM_ENDPOINT, VLLM_MODEL } from "../src/vaultTypes.js";

type RegisteredTool = Parameters<ExtensionAPI["registerTool"]>[0];

function createSchemaGatedToolApi(
  pi: ExtensionAPI,
  runtime: ReturnType<typeof createVaultRuntime>,
): ExtensionAPI {
  return {
    registerTool(tool: RegisteredTool) {
      const execute = tool.execute;
      pi.registerTool({
        ...tool,
        async execute(...args) {
          const report = runtime.checkSchemaCompatibilityDetailed();
          if (!report.ok) {
            const message = `Vault schema mismatch (expected ${report.expectedVersion}, got ${report.actualVersion ?? "unknown"}). Run vault_schema_diagnostics for details.`;
            return {
              content: [{ type: "text", text: message }],
              details: {
                ok: false,
                expectedVersion: report.expectedVersion,
                actualVersion: report.actualVersion,
                missingPromptTemplateColumns: report.missingPromptTemplateColumns,
                missingExecutionColumns: report.missingExecutionColumns,
                missingFeedbackColumns: report.missingFeedbackColumns,
              },
            };
          }
          return execute(...args);
        },
      });
    },
  } as unknown as ExtensionAPI;
}

export default function registerVaultExtension(pi: ExtensionAPI) {
  unregisterVaultCapabilityBridges();

  const vaultRuntime = createVaultRuntime();
  const dispatchRuntime = createVaultDispatchRuntime({ runtime: vaultRuntime });
  const receiptManager = createVaultReceiptManager(vaultRuntime);
  const pickerRuntime = createPickerRuntime(vaultRuntime, receiptManager, dispatchRuntime);
  const groundingRuntime = createGroundingRuntime(vaultRuntime);
  const runtime = {
    ...vaultRuntime,
    ...pickerRuntime,
    ...groundingRuntime,
  };

  // Keep extension startup registration-only. Schema and vault I/O stay lazy in
  // command/tool handlers so loading this package never spawns Dolt.
  registerVaultDiagnosticsTool(pi, vaultRuntime);
  registerVaultCommands(pi, runtime, receiptManager, dispatchRuntime);

  const vaultOps: VaultOps = {
    queryJson: vaultRuntime.queryVaultJson,
    exec: vaultRuntime.execVault,
    commit: vaultRuntime.commitVault,
    escapeSql: vaultRuntime.escapeSql,
  };

  const evalConfig = {
    vaultDir: VAULT_DIR,
    localModelEndpoint: VLLM_ENDPOINT,
    defaultModel: VLLM_MODEL,
  };

  registerPromptEvaluatorTool(pi, evalConfig, vaultOps);
  registerPromptEvaluatorCommands(pi, evalConfig, vaultOps);
  runtime.registerVaultLiveTrigger();
  registerVaultTools(createSchemaGatedToolApi(pi, vaultRuntime), runtime, receiptManager);
  registerVaultCapabilityBridges({
    receiptManager,
    summarizeTelemetry: pickerRuntime.summarizeLiveTriggerTelemetry,
    getTelemetryStats: pickerRuntime.getLiveTriggerTelemetryStats,
  });
}

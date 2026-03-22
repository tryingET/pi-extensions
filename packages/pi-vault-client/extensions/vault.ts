import type { ExtensionAPI } from "@mariozechner/pi-coding-agent";
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
import { registerVaultCapabilityBridges } from "../src/vaultRuntimeRegistry.js";
import { registerVaultDiagnosticsTool, registerVaultTools } from "../src/vaultTools.js";
import { SCHEMA_VERSION, VAULT_DIR, VLLM_ENDPOINT, VLLM_MODEL } from "../src/vaultTypes.js";

function formatMissingColumns(label: string, columns: string[]): string {
  return columns.length > 0 ? `${label} missing [${columns.join(", ")}]` : "";
}

export default function registerVaultExtension(pi: ExtensionAPI) {
  const vaultRuntime = createVaultRuntime();
  const receiptManager = createVaultReceiptManager(vaultRuntime);
  const pickerRuntime = createPickerRuntime(vaultRuntime, receiptManager);
  const groundingRuntime = createGroundingRuntime(vaultRuntime);
  const runtime = {
    ...vaultRuntime,
    ...pickerRuntime,
    ...groundingRuntime,
  };

  registerVaultCapabilityBridges({
    receiptManager,
    summarizeTelemetry: pickerRuntime.summarizeLiveTriggerTelemetry,
    getTelemetryStats: pickerRuntime.getLiveTriggerTelemetryStats,
  });

  const schemaReport = vaultRuntime.checkSchemaCompatibilityDetailed();

  registerVaultDiagnosticsTool(pi, vaultRuntime);
  registerVaultCommands(pi, runtime, receiptManager);

  if (!schemaReport.ok) {
    const details = [
      `expected=${SCHEMA_VERSION}`,
      `actual=${schemaReport.actualVersion ?? "unknown"}`,
      formatMissingColumns("prompt_templates", schemaReport.missingPromptTemplateColumns),
      formatMissingColumns("executions", schemaReport.missingExecutionColumns),
      formatMissingColumns("feedback", schemaReport.missingFeedbackColumns),
    ]
      .filter(Boolean)
      .join("; ");
    console.error(`Vault schema version mismatch. ${details}`);
    return;
  }

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
  registerVaultTools(pi, runtime, receiptManager);
}

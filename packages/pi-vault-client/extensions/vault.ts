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
import { registerVaultTools } from "../src/vaultTools.js";
import { SCHEMA_VERSION, VAULT_DIR, VLLM_ENDPOINT, VLLM_MODEL } from "../src/vaultTypes.js";

export default function registerVaultExtension(pi: ExtensionAPI) {
  const vaultRuntime = createVaultRuntime();
  if (!vaultRuntime.checkSchemaVersion()) {
    console.error(
      `Vault schema version mismatch. Extension requires Prompt Vault schema v${SCHEMA_VERSION} with facet columns artifact_kind/control_mode/formalization_level.`,
    );
    return;
  }

  const pickerRuntime = createPickerRuntime(vaultRuntime);
  const groundingRuntime = createGroundingRuntime(vaultRuntime);
  const runtime = {
    ...vaultRuntime,
    ...pickerRuntime,
    ...groundingRuntime,
  };

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
  registerVaultTools(pi, runtime);
  registerVaultCommands(pi, runtime);
}

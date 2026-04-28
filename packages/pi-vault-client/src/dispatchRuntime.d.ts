import type { DispatchPostureResult } from "./dispatchPosture.js";

export interface VaultDispatchExecutionContext {
  cwd?: string;
  currentCompany?: string;
}

export interface VaultDispatchCheckResult {
  ok: boolean;
  status: "ready" | "blocked";
  results?: DispatchPostureResult[];
  missing?: string[];
  current_company?: string;
  current_company_source?: string;
  blocking_reason?: string;
}

export interface VaultDispatchRuntime {
  checkTemplates(
    templateNames: string[],
    ctx?: VaultDispatchExecutionContext,
  ): Promise<VaultDispatchCheckResult>;
}

export interface VaultDispatchRuntimeOptions {
  runtime?: unknown;
}

export declare function createVaultDispatchRuntime(
  options?: VaultDispatchRuntimeOptions,
): VaultDispatchRuntime;

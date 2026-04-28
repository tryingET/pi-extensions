import { classifyDispatchPosture, type DispatchPostureResult } from "./dispatchPosture.js";
import { createVaultRuntime } from "./vaultDb.js";
import type { Template, VaultRuntime } from "./vaultTypes.js";

const DISPATCH_CONTEXT_ERROR =
  "Explicit company context is required for vault dispatch checks. Set PI_COMPANY or run from a company-scoped cwd.";

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

interface DispatchRuntimeDeps {
  resolveCurrentCompanyContext: VaultRuntime["resolveCurrentCompanyContext"];
  queryVaultJsonDetailed: VaultRuntime["queryVaultJsonDetailed"];
  buildVisibilityPredicate: VaultRuntime["buildVisibilityPredicate"];
  escapeSql: VaultRuntime["escapeSql"];
  parseTemplateRows: VaultRuntime["parseTemplateRows"];
}

export interface VaultDispatchRuntimeOptions {
  runtime?: DispatchRuntimeDeps;
}

function normalizeNames(templateNames: string[]): string[] {
  return [...new Set(templateNames.map((name) => String(name).trim()).filter(Boolean))];
}

function resolveDispatchCompanyContext(
  runtime: DispatchRuntimeDeps,
  ctx: VaultDispatchExecutionContext | undefined,
): { ok: true; currentCompany: string; companySource: string } | { ok: false; error: string } {
  const explicitCompany = typeof ctx?.currentCompany === "string" ? ctx.currentCompany.trim() : "";
  const companyContext = runtime.resolveCurrentCompanyContext(ctx?.cwd);

  if (explicitCompany) {
    if (
      companyContext.source !== "contract-default" &&
      companyContext.company !== explicitCompany
    ) {
      return {
        ok: false,
        error: `Explicit currentCompany (${explicitCompany}) conflicts with resolved company context (${companyContext.company} via ${companyContext.source}).`,
      };
    }
    return {
      ok: true,
      currentCompany: explicitCompany,
      companySource:
        companyContext.source !== "contract-default"
          ? companyContext.source
          : "explicit:currentCompany",
    };
  }

  if (companyContext.source === "contract-default") {
    return { ok: false, error: DISPATCH_CONTEXT_ERROR };
  }

  return {
    ok: true,
    currentCompany: companyContext.company,
    companySource: companyContext.source,
  };
}

function selectDispatchTemplateColumns(): string {
  return [
    "id",
    "name",
    "description",
    "'' AS content",
    "artifact_kind",
    "control_mode",
    "formalization_level",
    "owner_company",
    "visibility_companies",
    "controlled_vocabulary",
    "status",
    "export_to_pi",
    "version",
  ].join(",\n          ");
}

export function createVaultDispatchRuntime(
  options: VaultDispatchRuntimeOptions = {},
): VaultDispatchRuntime {
  const runtime = options.runtime ?? createVaultRuntime();

  return {
    async checkTemplates(templateNames, ctx = {}) {
      const names = normalizeNames(templateNames);
      if (names.length === 0) {
        return {
          ok: false,
          status: "blocked",
          blocking_reason: "At least one template name is required for a dispatch check.",
        };
      }

      const companyContext = resolveDispatchCompanyContext(runtime, ctx);
      if (!companyContext.ok) {
        return { ok: false, status: "blocked", blocking_reason: companyContext.error };
      }

      const escapedNames = names.map((name) => `'${runtime.escapeSql(name)}'`).join(", ");
      const result = runtime.queryVaultJsonDetailed(`
        SELECT
          ${selectDispatchTemplateColumns()}
        FROM prompt_templates
        WHERE name IN (${escapedNames})
          AND status = 'active'
          AND ${runtime.buildVisibilityPredicate(companyContext.currentCompany)}
        ORDER BY name
      `);

      if (!result.ok) {
        return { ok: false, status: "blocked", blocking_reason: result.error };
      }

      const templates: Template[] = runtime.parseTemplateRows(result.value);
      const found = new Set(templates.map((template) => template.name));
      const missing = names.filter((name) => !found.has(name));

      return {
        ok: true,
        status: "ready",
        results: templates.map((template) => classifyDispatchPosture(template)),
        missing,
        current_company: companyContext.currentCompany,
        current_company_source: companyContext.companySource,
      };
    },
  };
}

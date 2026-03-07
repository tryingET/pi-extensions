import { execFileSync } from "node:child_process";
import { existsSync, readFileSync } from "node:fs";
import {
  ARTIFACT_KINDS,
  COMPANIES,
  CONTROL_MODES,
  CONTROLLED_VOCABULARY_DIMENSIONS,
  DEFAULT_VAULT_QUERY_LIMIT,
  type DoltJsonResult,
  FORMALIZATION_LEVELS,
  type GovernedContracts,
  type InsertResult,
  MAX_VAULT_QUERY_LIMIT,
  PROMPT_VAULT_ROOT,
  type RouterControlledVocabulary,
  SCHEMA_VERSION,
  type Template,
  VAULT_DIR,
  type VaultQueryControlledVocabulary,
  type VaultQueryFilters,
  type VaultRuntime,
} from "./vaultTypes.js";

let lastVaultQueryError: string | null = null;
let cachedContracts: GovernedContracts | null = null;

function runDolt(args: string[], maxBuffer = 10 * 1024 * 1024): string {
  return execFileSync("dolt", args, {
    cwd: VAULT_DIR,
    encoding: "utf-8",
    maxBuffer,
  });
}

function queryVaultJson(sql: string): DoltJsonResult | null {
  try {
    const result = runDolt(["sql", "-r", "json", "-q", sql]);
    clearVaultQueryError();
    return JSON.parse(result);
  } catch (e) {
    setVaultQueryError(e);
    console.error("Vault query error:", e);
    return null;
  }
}

function execVault(sql: string): boolean {
  try {
    runDolt(["sql", "-q", sql]);
    return true;
  } catch (e) {
    console.error("Vault exec error:", e);
    return false;
  }
}

function commitVault(message: string): void {
  try {
    runDolt(["add", "-A"], 1024 * 1024);
    runDolt(["commit", "-m", message], 1024 * 1024);
  } catch (_e) {
    // Ignore commit errors (commonly: nothing to commit)
  }
}

function clearVaultQueryError(): void {
  lastVaultQueryError = null;
}

function setVaultQueryError(error: unknown): void {
  lastVaultQueryError = error instanceof Error ? error.message : String(error);
}

function getVaultQueryError(): string | null {
  return lastVaultQueryError;
}

function escapeSql(str: string): string {
  return str.replace(/\\/g, "\\\\").replace(/'/g, "''").split("\0").join("");
}

function escapeLikePattern(str: string): string {
  return escapeSql(str).replace(/!/g, "!!").replace(/%/g, "!%").replace(/_/g, "!_");
}

function parseJsonArray(value: unknown): string[] {
  if (Array.isArray(value)) return value.map(String);
  if (typeof value === "string") {
    const trimmed = value.trim();
    if (!trimmed) return [];
    try {
      const parsed = JSON.parse(trimmed);
      return Array.isArray(parsed) ? parsed.map(String) : [];
    } catch {
      return [];
    }
  }
  return [];
}

function parseControlledVocabulary(value: unknown): RouterControlledVocabulary | null {
  const raw =
    value && typeof value === "object"
      ? value
      : typeof value === "string" && value.trim()
        ? (() => {
            try {
              return JSON.parse(value);
            } catch {
              return null;
            }
          })()
        : null;

  if (!raw || typeof raw !== "object") return null;
  const record = raw as Record<string, unknown>;
  const parsed: RouterControlledVocabulary = {};

  if (record.routing_context) parsed.routing_context = String(record.routing_context);
  if (record.activity_phase) parsed.activity_phase = String(record.activity_phase);
  if (record.input_artifact) parsed.input_artifact = String(record.input_artifact);
  if (record.transition_target_type)
    parsed.transition_target_type = String(record.transition_target_type);
  if (record.output_commitment) parsed.output_commitment = String(record.output_commitment);
  if (Array.isArray(record.selection_principles))
    parsed.selection_principles = record.selection_principles.map(String);

  return Object.keys(parsed).length > 0 ? parsed : null;
}

function parseTemplateRows(result: DoltJsonResult | null): Template[] {
  if (!result || !result.rows || result.rows.length === 0) return [];

  return result.rows.map((row) => ({
    id: typeof row.id === "number" ? row.id : undefined,
    name: String(row.name || ""),
    description: String(row.description || ""),
    content: String(row.content || ""),
    artifact_kind: String(row.artifact_kind || "procedure"),
    control_mode: String(row.control_mode || "one_shot"),
    formalization_level: String(row.formalization_level || "structured"),
    owner_company: String(row.owner_company || "core"),
    visibility_companies: parseJsonArray(row.visibility_companies),
    controlled_vocabulary: parseControlledVocabulary(row.controlled_vocabulary),
    status: row.status ? String(row.status) : undefined,
    export_to_pi:
      typeof row.export_to_pi === "boolean"
        ? row.export_to_pi
        : row.export_to_pi == null
          ? undefined
          : String(row.export_to_pi).toLowerCase() === "true",
    version: typeof row.version === "number" ? row.version : undefined,
  }));
}

function facetLabel(
  template: Pick<Template, "artifact_kind" | "control_mode" | "formalization_level">,
): string {
  return `${template.artifact_kind}/${template.control_mode}/${template.formalization_level}`;
}

function governanceLabel(
  template: Pick<Template, "owner_company" | "visibility_companies">,
): string {
  const visibleTo =
    template.visibility_companies.length > 0 ? template.visibility_companies.join(", ") : "(none)";
  return `owner=${template.owner_company}; visible_to=[${visibleTo}]`;
}

function controlledVocabularyLabel(template: Pick<Template, "controlled_vocabulary">): string {
  const cv = template.controlled_vocabulary;
  if (!cv) return "none";
  const parts = [
    cv.routing_context ? `routing_context=${cv.routing_context}` : "",
    cv.activity_phase ? `activity_phase=${cv.activity_phase}` : "",
    cv.input_artifact ? `input_artifact=${cv.input_artifact}` : "",
    cv.transition_target_type ? `transition_target_type=${cv.transition_target_type}` : "",
    cv.selection_principles?.length
      ? `selection_principles=${cv.selection_principles.join("|")}`
      : "",
    cv.output_commitment ? `output_commitment=${cv.output_commitment}` : "",
  ].filter(Boolean);
  return parts.length > 0 ? parts.join("; ") : "none";
}

function formatTemplateDetails(template: Template, includeContent = false): string {
  const lines = [
    `## ${template.name}`,
    template.description ? `${template.description}` : "",
    "",
    "### Core classification",
    `- artifact_kind: ${template.artifact_kind}`,
    `- control_mode: ${template.control_mode}`,
    `- formalization_level: ${template.formalization_level}`,
    "",
    "### Governed semantics",
  ];

  const cv = template.controlled_vocabulary;
  if (cv) {
    lines.push(`- routing_context: ${cv.routing_context || "(unset)"}`);
    lines.push(`- activity_phase: ${cv.activity_phase || "(unset)"}`);
    lines.push(`- input_artifact: ${cv.input_artifact || "(unset)"}`);
    lines.push(`- transition_target_type: ${cv.transition_target_type || "(unset)"}`);
    lines.push(
      `- selection_principles: ${cv.selection_principles?.length ? cv.selection_principles.join(", ") : "(unset)"}`,
    );
    lines.push(`- output_commitment: ${cv.output_commitment || "(unset)"}`);
  } else {
    lines.push("- controlled_vocabulary: none");
  }

  lines.push("", "### Governance");
  lines.push(`- owner_company: ${template.owner_company}`);
  lines.push(
    `- visibility_companies: ${template.visibility_companies.length > 0 ? template.visibility_companies.join(", ") : "(none)"}`,
  );

  if (includeContent && template.content) lines.push("", "---", template.content);
  return lines.filter((line, index, arr) => !(line === "" && arr[index - 1] === "")).join("\n");
}

function readJsonContract<T>(path: string, fallback: T): T {
  if (!existsSync(path)) return fallback;
  try {
    return JSON.parse(readFileSync(path, "utf8")) as T;
  } catch {
    return fallback;
  }
}

function getContracts(): GovernedContracts {
  if (cachedContracts) return cachedContracts;

  const ontologyFallback = {
    facets: {
      artifact_kind: [...ARTIFACT_KINDS],
      control_mode: [...CONTROL_MODES],
      formalization_level: [...FORMALIZATION_LEVELS],
    },
  };
  const controlledVocabularyFallback = {
    dimensions: {
      routing_context: ["analysis_followup", "review_followup", "review_closeout"],
      activity_phase: ["post_analysis", "post_review", "closeout"],
      input_artifact: ["analysis_output", "review_findings", "review_summary"],
      transition_target_type: ["framework_mode"],
      selection_principles: ["evidence_based", "constraint_preserving", "minimal_change"],
      output_commitment: ["exact_next_prompt"],
    },
    router_required_dimensions: [...CONTROLLED_VOCABULARY_DIMENSIONS],
  };
  const companyVisibilityFallback = {
    companies: [...COMPANIES],
    defaults: {
      owner_company: "core",
      visibility_companies: [...COMPANIES],
    },
  };

  cachedContracts = {
    ontology: readJsonContract(`${PROMPT_VAULT_ROOT}/ontology/v2-contract.json`, ontologyFallback),
    controlledVocabulary: readJsonContract(
      `${PROMPT_VAULT_ROOT}/ontology/controlled-vocabulary-contract.json`,
      controlledVocabularyFallback,
    ),
    companyVisibility: readJsonContract(
      `${PROMPT_VAULT_ROOT}/ontology/company-visibility-contract.json`,
      companyVisibilityFallback,
    ),
  };
  return cachedContracts;
}

function getCurrentCompany(): string {
  const explicit = process.env.PI_COMPANY || process.env.VAULT_CURRENT_COMPANY;
  if (explicit) return explicit;

  const cwd = process.cwd().toLowerCase();
  if (cwd.includes("/softwareco/")) return "software";
  if (cwd.includes("/finance/")) return "finance";
  if (cwd.includes("/house/")) return "house";
  if (cwd.includes("/health/")) return "health";
  if (cwd.includes("/teaching/")) return "teaching";
  if (cwd.includes("/holding/")) return "holding";
  return getContracts().companyVisibility.defaults?.owner_company || "core";
}

function buildVisibilityPredicate(company = getCurrentCompany()): string {
  return `JSON_SEARCH(visibility_companies, 'one', '${escapeSql(company)}') IS NOT NULL`;
}

function buildSelectColumns(includeContent: boolean, includeId = false): string {
  const columns = [
    includeId ? "id" : "",
    "name",
    "description",
    includeContent ? "content" : "",
    "artifact_kind",
    "control_mode",
    "formalization_level",
    "owner_company",
    "visibility_companies",
    "controlled_vocabulary",
    "status",
    "export_to_pi",
    "version",
  ].filter(Boolean);
  return columns.join(", ");
}

function getTemplate(name: string): Template | null {
  const escapedName = escapeSql(name);
  const result = queryVaultJson(
    `SELECT ${buildSelectColumns(true, true)} FROM prompt_templates WHERE name = '${escapedName}' AND status = 'active' AND ${buildVisibilityPredicate()}`,
  );
  return parseTemplateRows(result)[0] || null;
}

function listTemplates(
  filters?: Partial<Pick<Template, "artifact_kind" | "control_mode" | "formalization_level">>,
): Template[] {
  const whereClauses = ["status = 'active'", buildVisibilityPredicate()];
  if (filters?.artifact_kind)
    whereClauses.push(`artifact_kind = '${escapeSql(filters.artifact_kind)}'`);
  if (filters?.control_mode)
    whereClauses.push(`control_mode = '${escapeSql(filters.control_mode)}'`);
  if (filters?.formalization_level)
    whereClauses.push(`formalization_level = '${escapeSql(filters.formalization_level)}'`);

  const result = queryVaultJson(
    `SELECT ${buildSelectColumns(true)} FROM prompt_templates WHERE ${whereClauses.join(" AND ")} ORDER BY artifact_kind, control_mode, formalization_level, owner_company, name`,
  );
  return parseTemplateRows(result);
}

function searchTemplates(query: string): Template[] {
  const normalizedQuery = query.trim().toLowerCase();
  if (!normalizedQuery) return [];

  const escapedQuery = escapeLikePattern(normalizedQuery);
  const result = queryVaultJson(
    `SELECT ${buildSelectColumns(true)} FROM prompt_templates WHERE status = 'active' AND ${buildVisibilityPredicate()} AND (` +
      `LOWER(name) LIKE '%${escapedQuery}%' ESCAPE '!' OR ` +
      `LOWER(description) LIKE '%${escapedQuery}%' ESCAPE '!' OR ` +
      `LOWER(content) LIKE '%${escapedQuery}%' ESCAPE '!'` +
      `) ORDER BY artifact_kind, control_mode, formalization_level, owner_company, name LIMIT 20`,
  );
  return parseTemplateRows(result);
}

function buildControlledVocabularyClauses(
  controlledVocabulary?: VaultQueryControlledVocabulary,
): string[] {
  if (!controlledVocabulary) return [];
  const clauses: string[] = [];

  for (const [dimension, values] of Object.entries(controlledVocabulary)) {
    const normalizedValues = (values || [])
      .map(String)
      .map((v) => v.trim())
      .filter(Boolean);
    if (normalizedValues.length === 0) continue;

    if (dimension === "selection_principles") {
      clauses.push(
        `(${normalizedValues
          .map(
            (value) =>
              `JSON_SEARCH(JSON_EXTRACT(controlled_vocabulary, '$.${dimension}'), 'one', '${escapeSql(value)}') IS NOT NULL`,
          )
          .join(" OR ")})`,
      );
      continue;
    }

    clauses.push(
      `JSON_UNQUOTE(JSON_EXTRACT(controlled_vocabulary, '$.${escapeSql(dimension)}')) IN (${normalizedValues.map((value) => `'${escapeSql(value)}'`).join(", ")})`,
    );
  }

  return clauses;
}

function queryTemplates(
  filters: VaultQueryFilters,
  limit: number,
  includeContent: boolean,
): Template[] {
  const cols = buildSelectColumns(includeContent);
  const whereClauses = ["status = 'active'", buildVisibilityPredicate(filters.visibility_company)];

  if (filters.artifact_kind?.length)
    whereClauses.push(
      `artifact_kind IN (${filters.artifact_kind.map((value) => `'${escapeSql(value)}'`).join(", ")})`,
    );
  if (filters.control_mode?.length)
    whereClauses.push(
      `control_mode IN (${filters.control_mode.map((value) => `'${escapeSql(value)}'`).join(", ")})`,
    );
  if (filters.formalization_level?.length)
    whereClauses.push(
      `formalization_level IN (${filters.formalization_level.map((value) => `'${escapeSql(value)}'`).join(", ")})`,
    );
  if (filters.owner_company?.length)
    whereClauses.push(
      `owner_company IN (${filters.owner_company.map((value) => `'${escapeSql(value)}'`).join(", ")})`,
    );

  whereClauses.push(...buildControlledVocabularyClauses(filters.controlled_vocabulary));

  const effectiveLimit = Number.isFinite(limit)
    ? Math.min(MAX_VAULT_QUERY_LIMIT, Math.max(1, Math.floor(limit)))
    : DEFAULT_VAULT_QUERY_LIMIT;
  const result = queryVaultJson(
    `SELECT ${cols} FROM prompt_templates WHERE ${whereClauses.join(" AND ")} ORDER BY artifact_kind, control_mode, formalization_level, owner_company, name LIMIT ${effectiveLimit}`,
  );
  return parseTemplateRows(result);
}

function retrieveByNames(names: string[], includeContent: boolean): Template[] {
  if (names.length === 0) return [];
  const escapedNames = names.map((n) => `'${escapeSql(n)}'`).join(", ");
  return parseTemplateRows(
    queryVaultJson(
      `SELECT ${buildSelectColumns(includeContent, true)} FROM prompt_templates WHERE name IN (${escapedNames}) AND status = 'active' AND ${buildVisibilityPredicate()}`,
    ),
  );
}

function getVocabulary(): Record<string, string[]> {
  const contracts = getContracts();
  const vocab: Record<string, string[]> = {
    artifact_kind: [...contracts.ontology.facets.artifact_kind],
    control_mode: [...contracts.ontology.facets.control_mode],
    formalization_level: [...contracts.ontology.facets.formalization_level],
    owner_company: [...contracts.companyVisibility.companies],
    visibility_companies: [...contracts.companyVisibility.companies],
  };

  for (const [dimension, values] of Object.entries(contracts.controlledVocabulary.dimensions))
    vocab[`controlled_vocabulary.${dimension}`] = [...values];

  return vocab;
}

function validateCompanyList(companies: string[]): string | null {
  const governedCompanies = new Set(getContracts().companyVisibility.companies);
  if (companies.length === 0) return "visibility_companies must be non-empty";
  const invalid = companies.filter((company) => !governedCompanies.has(company));
  if (invalid.length > 0) return `Unknown visibility company value(s): ${invalid.join(", ")}`;
  return null;
}

function validateControlledVocabulary(
  controlMode: string,
  controlledVocabulary: RouterControlledVocabulary | null,
): string | null {
  const contract = getContracts().controlledVocabulary;
  if (controlMode !== "router") return null;
  if (!controlledVocabulary) return "controlled_vocabulary is required when control_mode=router";

  for (const dimension of contract.router_required_dimensions) {
    if (dimension === "selection_principles") {
      const values = controlledVocabulary.selection_principles || [];
      if (values.length < 1)
        return "controlled_vocabulary.selection_principles must contain at least one value for routers";
      const allowed = new Set(contract.dimensions.selection_principles || []);
      const invalid = values.filter((value) => !allowed.has(value));
      if (invalid.length > 0)
        return `Unknown controlled_vocabulary.selection_principles value(s): ${invalid.join(", ")}`;
      continue;
    }

    const value = controlledVocabulary[dimension as keyof RouterControlledVocabulary];
    if (!value || (typeof value === "string" && !value.trim()))
      return `controlled_vocabulary.${dimension} is required when control_mode=router`;
    const allowed = new Set(contract.dimensions[dimension] || []);
    if (typeof value === "string" && !allowed.has(value))
      return `Unknown controlled_vocabulary.${dimension} value: ${value}`;
  }

  return null;
}

function insertTemplate(
  name: string,
  content: string,
  description: string,
  artifactKind: string,
  controlMode: string,
  formalizationLevel: string,
  ownerCompany: string,
  visibilityCompanies: string[],
  controlledVocabulary: RouterControlledVocabulary | null,
): InsertResult {
  const contracts = getContracts();

  if (!contracts.ontology.facets.artifact_kind.includes(artifactKind)) {
    return { status: "error", message: `Unknown artifact_kind: ${artifactKind}` };
  }
  if (!contracts.ontology.facets.control_mode.includes(controlMode)) {
    return { status: "error", message: `Unknown control_mode: ${controlMode}` };
  }
  if (!contracts.ontology.facets.formalization_level.includes(formalizationLevel)) {
    return { status: "error", message: `Unknown formalization_level: ${formalizationLevel}` };
  }
  if (!contracts.companyVisibility.companies.includes(ownerCompany)) {
    return { status: "error", message: `Unknown owner_company: ${ownerCompany}` };
  }

  const visibilityError = validateCompanyList(visibilityCompanies);
  if (visibilityError) return { status: "error", message: visibilityError };
  if (!visibilityCompanies.includes(ownerCompany)) {
    return {
      status: "error",
      message: "visibility_companies must include owner_company",
    };
  }

  const controlledVocabularyError = validateControlledVocabulary(controlMode, controlledVocabulary);
  if (controlledVocabularyError) return { status: "error", message: controlledVocabularyError };

  const escapedName = escapeSql(name);
  const escapedContent = escapeSql(content);
  const escapedDesc = escapeSql(description);
  const visibilityCompaniesJson = escapeSql(JSON.stringify(visibilityCompanies));
  const controlledVocabularyJson = controlledVocabulary
    ? `'${escapeSql(JSON.stringify(controlledVocabulary))}'`
    : "NULL";
  const sql = `
    INSERT INTO prompt_templates (
      name,
      description,
      content,
      artifact_kind,
      control_mode,
      formalization_level,
      owner_company,
      visibility_companies,
      controlled_vocabulary,
      status,
      export_to_pi,
      version
    )
    VALUES (
      '${escapedName}',
      '${escapedDesc}',
      '${escapedContent}',
      '${escapeSql(artifactKind)}',
      '${escapeSql(controlMode)}',
      '${escapeSql(formalizationLevel)}',
      '${escapeSql(ownerCompany)}',
      '${visibilityCompaniesJson}',
      ${controlledVocabularyJson},
      'active',
      true,
      1
    )
    ON DUPLICATE KEY UPDATE
      description = '${escapedDesc}',
      content = '${escapedContent}',
      artifact_kind = '${escapeSql(artifactKind)}',
      control_mode = '${escapeSql(controlMode)}',
      formalization_level = '${escapeSql(formalizationLevel)}',
      owner_company = '${escapeSql(ownerCompany)}',
      visibility_companies = '${visibilityCompaniesJson}',
      controlled_vocabulary = ${controlledVocabularyJson},
      export_to_pi = true,
      updated_at = NOW()
  `;
  if (!execVault(sql)) return { status: "error", message: "Failed to insert template" };
  commitVault(`Add/update template: ${name}`);
  const templateId = queryVaultJson(`SELECT id FROM prompt_templates WHERE name = '${escapedName}'`)
    ?.rows?.[0]?.id as number | undefined;
  return {
    status: "ok",
    message: `Template '${name}' saved as ${artifactKind}/${controlMode}/${formalizationLevel} for owner=${ownerCompany}`,
    templateId,
  };
}

function rateTemplate(
  templateName: string,
  variant: string,
  rating: number,
  success: boolean,
  notes: string,
): { ok: boolean; message: string } {
  const template = getTemplate(templateName);
  if (!template) return { ok: false, message: `Template not found: ${templateName}` };

  const escapedNotes = escapeSql(notes);
  const issuesJson = escapeSql(
    JSON.stringify(success ? [] : ["needs-improvement", `variant:${variant}`]),
  );
  const sql = `
    INSERT INTO feedback (execution_id, rating, notes, issues)
    SELECT id, ${rating}, '${escapedNotes}', '${issuesJson}'
    FROM executions
    WHERE entity_type = 'template' AND entity_id = ${template.id}
    ORDER BY created_at DESC LIMIT 1
  `;
  const ok = execVault(sql);
  if (!ok) return { ok: false, message: "Failed to record feedback; no execution available" };
  commitVault(`Rate template: ${templateName} (${rating}/5)`);
  return { ok: true, message: `Recorded rating ${rating}/5 for ${templateName}` };
}

function logExecution(
  templateId: number,
  _templateName: string,
  model: string,
  inputContext?: string,
): void {
  const escapedContext = escapeSql((inputContext || "").slice(0, 1000));
  const escapedModel = escapeSql(model);
  execVault(`
    INSERT INTO executions (entity_type, entity_id, entity_version, input_context, model, success, created_at)
    VALUES ('template', ${templateId}, 1, '${escapedContext}', '${escapedModel}', true, NOW())
  `);
}

function checkSchemaVersion(): boolean {
  const result = queryVaultJson("SELECT MAX(version) AS version FROM schema_version");
  if (!result || !result.rows || result.rows.length === 0) return false;
  const dbVersion = Number(result.rows[0].version) || 0;
  if (dbVersion !== SCHEMA_VERSION) return false;
  const columns = queryVaultJson("SHOW COLUMNS FROM prompt_templates");
  const present = new Set((columns?.rows || []).map((row) => String(row.Field || "")));
  return [
    "artifact_kind",
    "control_mode",
    "formalization_level",
    "owner_company",
    "visibility_companies",
    "controlled_vocabulary",
    "export_to_pi",
  ].every((column) => present.has(column));
}

export function createVaultRuntime(): VaultRuntime {
  return {
    queryVaultJson,
    execVault,
    commitVault,
    escapeSql,
    escapeLikePattern,
    clearVaultQueryError,
    setVaultQueryError,
    getVaultQueryError,
    parseTemplateRows,
    facetLabel,
    governanceLabel,
    controlledVocabularyLabel,
    formatTemplateDetails,
    getCurrentCompany,
    buildVisibilityPredicate,
    getContracts,
    getTemplate,
    listTemplates,
    searchTemplates,
    queryTemplates,
    retrieveByNames,
    getVocabulary,
    insertTemplate,
    rateTemplate,
    logExecution,
    checkSchemaVersion,
  };
}

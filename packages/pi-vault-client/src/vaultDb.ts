import { execFileSync } from "node:child_process";
import { existsSync, readFileSync } from "node:fs";
import { detectTemplateRenderEngine, stripFrontmatter } from "./templateRenderer.js";
import {
  ARTIFACT_KINDS,
  COMPANIES,
  CONTROL_MODES,
  CONTROLLED_VOCABULARY_DIMENSIONS,
  DEFAULT_VAULT_QUERY_LIMIT,
  type DoltJsonResult,
  FORMALIZATION_LEVELS,
  type GovernedContracts,
  INTENT_RANKING_CANDIDATE_POOL_LIMIT,
  type InsertResult,
  MAX_VAULT_QUERY_LIMIT,
  PROMPT_VAULT_ROOT,
  type RouterControlledVocabulary,
  SCHEMA_VERSION,
  type SchemaCompatibilityReport,
  type Template,
  type TemplateUpdatePatch,
  type UpdateResult,
  VAULT_DIR,
  type VaultExecutionContext,
  type VaultMutationContext,
  type VaultQueryControlledVocabulary,
  type VaultQueryFilters,
  type VaultResult,
  type VaultRuntime,
} from "./vaultTypes.js";

const DEFAULT_DOLT_MAX_BUFFER = 64 * 1024 * 1024;
const REQUIRED_PROMPT_TEMPLATE_COLUMNS = [
  "artifact_kind",
  "control_mode",
  "formalization_level",
  "owner_company",
  "visibility_companies",
  "controlled_vocabulary",
  "export_to_pi",
  "version",
] as const;
const REQUIRED_EXECUTION_COLUMNS = [
  "id",
  "entity_type",
  "entity_id",
  "entity_version",
  "input_context",
  "model",
  "output_capture_mode",
  "output_text",
  "success",
] as const;
const REQUIRED_FEEDBACK_COLUMNS = ["execution_id", "rating", "notes", "issues"] as const;
let cachedContracts: GovernedContracts | null = null;

function formatVaultError(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

function runDolt(args: string[], maxBuffer = DEFAULT_DOLT_MAX_BUFFER): string {
  return execFileSync("dolt", args, {
    cwd: VAULT_DIR,
    encoding: "utf-8",
    maxBuffer,
  });
}

function queryVaultJsonDetailed(
  sql: string,
): { ok: true; value: DoltJsonResult; error: null } | { ok: false; value: null; error: string } {
  try {
    const result = runDolt(["sql", "-r", "json", "-q", sql]);
    return { ok: true, value: JSON.parse(result) as DoltJsonResult, error: null };
  } catch (error) {
    const message = formatVaultError(error);
    console.error("Vault query error:", error);
    return { ok: false, value: null, error: message };
  }
}

function queryVaultJson(sql: string): DoltJsonResult | null {
  const result = queryVaultJsonDetailed(sql);
  return result.ok ? result.value : null;
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

function execVaultWithRowCount(sql: string): number | null {
  try {
    const normalizedSql = sql.trim().replace(/;+\s*$/, "");
    const output = runDolt([
      "sql",
      "-r",
      "json",
      "-q",
      `${normalizedSql}; SELECT ROW_COUNT() AS row_count;`,
    ]);
    const jsonDocuments = output
      .split(/\n(?=\{)/)
      .map((chunk) => chunk.trim())
      .filter(Boolean);
    const lastDocument = jsonDocuments.at(-1);
    if (!lastDocument) return null;
    const parsed = JSON.parse(lastDocument) as DoltJsonResult;
    const rawCount = parsed?.rows?.[0]?.row_count;
    const rowCount = Number(rawCount);
    return Number.isFinite(rowCount) ? rowCount : null;
  } catch (e) {
    console.error("Vault exec error:", e);
    return null;
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

function hasOwn(value: object, key: string): boolean {
  return Object.hasOwn(value, key);
}

function sanitizeControlledVocabularyValue(
  controlledVocabulary: RouterControlledVocabulary | null | undefined,
): RouterControlledVocabulary | null {
  if (!controlledVocabulary || typeof controlledVocabulary !== "object") return null;

  const sanitized: RouterControlledVocabulary = {};
  for (const key of [
    "routing_context",
    "activity_phase",
    "input_artifact",
    "transition_target_type",
    "output_commitment",
  ] as const) {
    const rawValue = controlledVocabulary[key];
    if (rawValue == null) continue;
    const normalizedValue = String(rawValue).trim();
    if (normalizedValue) sanitized[key] = normalizedValue;
  }

  if (Array.isArray(controlledVocabulary.selection_principles)) {
    const selectionPrinciples = controlledVocabulary.selection_principles
      .map((value) => String(value).trim())
      .filter(Boolean);
    if (selectionPrinciples.length > 0) sanitized.selection_principles = selectionPrinciples;
  }

  return Object.keys(sanitized).length > 0 ? sanitized : null;
}

function hasControlledVocabularyPatch(
  controlledVocabulary: TemplateUpdatePatch["controlled_vocabulary"],
): boolean {
  if (!controlledVocabulary || typeof controlledVocabulary !== "object") return false;
  return [
    "routing_context",
    "activity_phase",
    "input_artifact",
    "transition_target_type",
    "selection_principles",
    "output_commitment",
  ].some((key) => hasOwn(controlledVocabulary, key));
}

function hasTemplateUpdateFields(patch: TemplateUpdatePatch): boolean {
  return (
    [
      "content",
      "description",
      "artifact_kind",
      "control_mode",
      "formalization_level",
      "owner_company",
      "visibility_companies",
    ].some((key) => hasOwn(patch, key)) || hasControlledVocabularyPatch(patch.controlled_vocabulary)
  );
}

function mergeTemplateUpdate(existing: Template, patch: TemplateUpdatePatch): Template {
  const mergedControlledVocabulary = hasControlledVocabularyPatch(patch.controlled_vocabulary)
    ? sanitizeControlledVocabularyValue({
        ...(existing.controlled_vocabulary || {}),
        ...(patch.controlled_vocabulary || {}),
      })
    : sanitizeControlledVocabularyValue(existing.controlled_vocabulary);

  return {
    ...existing,
    ...(hasOwn(patch, "content") ? { content: String(patch.content ?? "") } : {}),
    ...(hasOwn(patch, "description") ? { description: String(patch.description ?? "") } : {}),
    ...(hasOwn(patch, "artifact_kind")
      ? { artifact_kind: String(patch.artifact_kind ?? "").trim() }
      : {}),
    ...(hasOwn(patch, "control_mode")
      ? { control_mode: String(patch.control_mode ?? "").trim() }
      : {}),
    ...(hasOwn(patch, "formalization_level")
      ? { formalization_level: String(patch.formalization_level ?? "").trim() }
      : {}),
    ...(hasOwn(patch, "owner_company")
      ? { owner_company: String(patch.owner_company ?? "").trim() }
      : {}),
    ...(hasOwn(patch, "visibility_companies")
      ? {
          visibility_companies: (patch.visibility_companies || [])
            .map((value) => String(value).trim())
            .filter(Boolean),
        }
      : {}),
    controlled_vocabulary: mergedControlledVocabulary,
  };
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

function formatTemplateDetails(
  template: Template,
  includeContent = false,
  options?: { includeGovernance?: boolean },
): string {
  const includeGovernance = options?.includeGovernance ?? false;
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

  if (includeGovernance) {
    lines.push("", "### Governance");
    lines.push(`- owner_company: ${template.owner_company}`);
    lines.push(
      `- visibility_companies: ${template.visibility_companies.length > 0 ? template.visibility_companies.join(", ") : "(none)"}`,
    );
  }

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

function resolveCurrentCompanyContext(cwd?: string): { company: string; source: string } {
  if (process.env.PI_COMPANY) return { company: process.env.PI_COMPANY, source: "env:PI_COMPANY" };
  if (process.env.VAULT_CURRENT_COMPANY)
    return { company: process.env.VAULT_CURRENT_COMPANY, source: "env:VAULT_CURRENT_COMPANY" };

  const effectiveCwd = cwd?.trim() || process.cwd();
  const normalizedCwd = effectiveCwd.toLowerCase();
  if (normalizedCwd.includes("/softwareco/"))
    return { company: "software", source: `cwd:${effectiveCwd}` };
  if (normalizedCwd.includes("/finance/"))
    return { company: "finance", source: `cwd:${effectiveCwd}` };
  if (normalizedCwd.includes("/house/")) return { company: "house", source: `cwd:${effectiveCwd}` };
  if (normalizedCwd.includes("/health/"))
    return { company: "health", source: `cwd:${effectiveCwd}` };
  if (normalizedCwd.includes("/teaching/"))
    return { company: "teaching", source: `cwd:${effectiveCwd}` };
  if (normalizedCwd.includes("/holding/"))
    return { company: "holding", source: `cwd:${effectiveCwd}` };

  return {
    company: getContracts().companyVisibility.defaults?.owner_company || "core",
    source: "contract-default",
  };
}

function getCurrentCompany(cwd?: string): string {
  return resolveCurrentCompanyContext(cwd).company;
}

function resolveCompanyFromContext(context?: VaultExecutionContext): string {
  if (context?.currentCompany?.trim()) return context.currentCompany.trim();
  return getCurrentCompany(context?.cwd);
}

export function resolveMutationActorContext(
  context?: VaultMutationContext,
): { status: "ok"; actorCompany: string; source: string } | { status: "error"; message: string } {
  if (context?.actorCompany?.trim()) {
    return {
      status: "ok",
      actorCompany: context.actorCompany.trim(),
      source: "explicit:actorCompany",
    };
  }

  if (process.env.PI_COMPANY?.trim()) {
    return {
      status: "ok",
      actorCompany: process.env.PI_COMPANY.trim(),
      source: "env:PI_COMPANY",
    };
  }
  if (process.env.VAULT_CURRENT_COMPANY?.trim()) {
    return {
      status: "ok",
      actorCompany: process.env.VAULT_CURRENT_COMPANY.trim(),
      source: "env:VAULT_CURRENT_COMPANY",
    };
  }

  if (context?.cwd?.trim()) {
    const resolved = resolveCurrentCompanyContext(context.cwd);
    if (resolved.source === "contract-default") {
      return {
        status: "error",
        message:
          "Explicit company context is required for vault mutations. Set PI_COMPANY or run from a company-scoped cwd.",
      };
    }

    return {
      status: "ok",
      actorCompany: resolved.company,
      source: resolved.source,
    };
  }

  if (context?.allowAmbientCwdFallback === false) {
    return {
      status: "error",
      message:
        "Explicit company context is required for vault mutations. Set PI_COMPANY or run from a company-scoped cwd.",
    };
  }

  const resolved = resolveCurrentCompanyContext();
  if (resolved.source === "contract-default") {
    return {
      status: "error",
      message:
        "Explicit company context is required for vault mutations. Set PI_COMPANY or run from a company-scoped cwd.",
    };
  }

  return {
    status: "ok",
    actorCompany: resolved.company,
    source: resolved.source,
  };
}

function buildVisibilityPredicate(company = getCurrentCompany()): string {
  return `JSON_SEARCH(visibility_companies, 'one', '${escapeSql(company)}') IS NOT NULL`;
}

function buildSelectColumns(
  includeContent: boolean,
  includeId = false,
  options?: { contentExpression?: string },
): string {
  const contentColumn = includeContent ? options?.contentExpression || "content" : "";
  const columns = [
    includeId ? "id" : "",
    "name",
    "description",
    contentColumn,
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

function getActiveTemplateByName(name: string): Template | null {
  const escapedName = escapeSql(name);
  const result = queryVaultJson(
    `SELECT ${buildSelectColumns(true, true)} FROM prompt_templates WHERE name = '${escapedName}' AND status = 'active'`,
  );
  return parseTemplateRows(result)[0] || null;
}

function getTemplateDetailed(
  name: string,
  context?: VaultExecutionContext,
): VaultResult<Template | null> {
  const escapedName = escapeSql(name);
  const company = resolveCompanyFromContext(context);
  const result = queryVaultJsonDetailed(
    `SELECT ${buildSelectColumns(true, true)} FROM prompt_templates WHERE name = '${escapedName}' AND status = 'active' AND ${buildVisibilityPredicate(company)}`,
  );
  if (!result.ok) return result;
  return { ok: true, value: parseTemplateRows(result.value)[0] || null, error: null };
}

function getTemplate(name: string, context?: VaultExecutionContext): Template | null {
  const result = getTemplateDetailed(name, context);
  return result.ok ? result.value : null;
}

function listTemplatesDetailed(
  filters?: Partial<Pick<Template, "artifact_kind" | "control_mode" | "formalization_level">>,
  context?: VaultExecutionContext,
): VaultResult<Template[]> {
  const company = resolveCompanyFromContext(context);
  const whereClauses = ["status = 'active'", buildVisibilityPredicate(company)];
  if (filters?.artifact_kind)
    whereClauses.push(`artifact_kind = '${escapeSql(filters.artifact_kind)}'`);
  if (filters?.control_mode)
    whereClauses.push(`control_mode = '${escapeSql(filters.control_mode)}'`);
  if (filters?.formalization_level)
    whereClauses.push(`formalization_level = '${escapeSql(filters.formalization_level)}'`);

  const result = queryVaultJsonDetailed(
    `SELECT ${buildSelectColumns(true)} FROM prompt_templates WHERE ${whereClauses.join(" AND ")} ORDER BY artifact_kind, control_mode, formalization_level, owner_company, name`,
  );
  if (!result.ok) return result;
  return { ok: true, value: parseTemplateRows(result.value), error: null };
}

function listTemplates(
  filters?: Partial<Pick<Template, "artifact_kind" | "control_mode" | "formalization_level">>,
  context?: VaultExecutionContext,
): Template[] {
  const result = listTemplatesDetailed(filters, context);
  return result.ok ? result.value : [];
}

function searchTemplatesDetailed(
  query: string,
  context?: VaultExecutionContext,
): VaultResult<Template[]> {
  const normalizedQuery = query.trim().toLowerCase();
  if (!normalizedQuery) return { ok: true, value: [], error: null };

  const company = resolveCompanyFromContext(context);
  const escapedQuery = escapeLikePattern(normalizedQuery);
  const result = queryVaultJsonDetailed(
    `SELECT ${buildSelectColumns(true)} FROM prompt_templates WHERE status = 'active' AND ${buildVisibilityPredicate(company)} AND (` +
      `LOWER(name) LIKE '%${escapedQuery}%' ESCAPE '!' OR ` +
      `LOWER(description) LIKE '%${escapedQuery}%' ESCAPE '!' OR ` +
      `LOWER(content) LIKE '%${escapedQuery}%' ESCAPE '!'` +
      `) ORDER BY artifact_kind, control_mode, formalization_level, owner_company, name LIMIT 20`,
  );
  if (!result.ok) return result;
  return { ok: true, value: parseTemplateRows(result.value), error: null };
}

function searchTemplates(query: string, context?: VaultExecutionContext): Template[] {
  const result = searchTemplatesDetailed(query, context);
  return result.ok ? result.value : [];
}

function tokenizeIntentText(text: string): string[] {
  return text
    .toLowerCase()
    .split(/[^a-z0-9-]+/)
    .map((token) => token.trim())
    .filter((token) => token.length >= 3)
    .filter((token, index, arr) => arr.indexOf(token) === index)
    .slice(0, 24);
}

function buildIntentPhrases(tokens: string[]): string[] {
  const phrases: string[] = [];
  for (let i = 0; i < tokens.length - 1; i++) phrases.push(`${tokens[i]} ${tokens[i + 1]}`);
  return phrases;
}

function normalizeIntentHaystack(text: string): string {
  return text.toLowerCase().replace(/[-_]+/g, " ");
}

function scoreTemplateIntent(template: Template, intentText?: string): number {
  if (!intentText) return 0;
  const tokens = tokenizeIntentText(intentText);
  if (tokens.length === 0) return 0;

  const haystacks = {
    name: normalizeIntentHaystack(template.name),
    description: normalizeIntentHaystack(template.description || ""),
    content: normalizeIntentHaystack(template.content || ""),
    facets: normalizeIntentHaystack(
      [template.artifact_kind, template.control_mode, template.formalization_level].join(" "),
    ),
  };

  const phrases = buildIntentPhrases(tokens);
  const intent = normalizeIntentHaystack(intentText);
  const transformationalTokens = new Set([
    "transcendent",
    "iteration",
    "iterative",
    "rebuild",
    "dissolve",
    "loop",
    "workflow",
    "100x",
    "alien",
  ]);

  let score = 0;
  for (const phrase of phrases) {
    if (haystacks.name.includes(phrase)) score += 30;
    if (haystacks.description.includes(phrase)) score += 22;
    if (haystacks.content.includes(phrase)) score += 16;
  }

  for (const token of tokens) {
    if (haystacks.name === token) score += 20;
    else if (haystacks.name.includes(token)) score += 10;
    if (haystacks.description.includes(token)) score += 8;
    if (haystacks.facets.includes(token)) score += 6;
    if (haystacks.content.includes(token)) score += 5;

    if (transformationalTokens.has(token)) {
      if (template.control_mode === "loop") score += 14;
      if (template.formalization_level === "workflow") score += 12;
      if (template.artifact_kind === "procedure") score += 8;
    }
  }

  if (template.description && intent.length > 0) {
    if (haystacks.description.includes(intent)) score += 18;
    if (haystacks.content.includes(intent)) score += 12;
  }

  if (/(transcendent|rebuild|dissolve|100x|iteration|iterative|alien)/.test(intent)) {
    if (template.control_mode === "loop") score += 20;
    if (template.formalization_level === "workflow") score += 16;
    if (template.artifact_kind === "procedure") score += 8;
  }

  return score;
}

function compareTemplatesForIntent(a: Template, b: Template, intentText?: string): number {
  const scoreDelta = scoreTemplateIntent(b, intentText) - scoreTemplateIntent(a, intentText);
  if (scoreDelta !== 0) return scoreDelta;

  const facetDelta = facetLabel(a).localeCompare(facetLabel(b));
  if (facetDelta !== 0) return facetDelta;

  const ownerDelta = a.owner_company.localeCompare(b.owner_company);
  if (ownerDelta !== 0) return ownerDelta;

  return a.name.localeCompare(b.name);
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

function queryTemplatesDetailed(
  filters: VaultQueryFilters,
  limit: number,
  includeContent: boolean,
  context?: VaultExecutionContext,
): VaultResult<Template[]> {
  const includeScoringContent = includeContent || Boolean(filters.intent_text);
  const cols = buildSelectColumns(includeScoringContent, false, {
    contentExpression:
      filters.intent_text && !includeContent ? "LEFT(content, 4096) AS content" : undefined,
  });
  const visibilityCompany = filters.visibility_company || resolveCompanyFromContext(context);
  const whereClauses = ["status = 'active'", buildVisibilityPredicate(visibilityCompany)];

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
  const candidatePoolLimit = filters.intent_text
    ? INTENT_RANKING_CANDIDATE_POOL_LIMIT
    : effectiveLimit;
  const result = queryVaultJsonDetailed(
    `SELECT ${cols} FROM prompt_templates WHERE ${whereClauses.join(" AND ")} ORDER BY artifact_kind, control_mode, formalization_level, owner_company, name LIMIT ${candidatePoolLimit}`,
  );
  if (!result.ok) return result;
  return {
    ok: true,
    value: parseTemplateRows(result.value)
      .sort((a, b) => compareTemplatesForIntent(a, b, filters.intent_text))
      .slice(0, effectiveLimit),
    error: null,
  };
}

function queryTemplates(
  filters: VaultQueryFilters,
  limit: number,
  includeContent: boolean,
  context?: VaultExecutionContext,
): Template[] {
  const result = queryTemplatesDetailed(filters, limit, includeContent, context);
  return result.ok ? result.value : [];
}

function retrieveByNamesDetailed(
  names: string[],
  includeContent: boolean,
  context?: VaultExecutionContext,
): VaultResult<Template[]> {
  if (names.length === 0) return { ok: true, value: [], error: null };
  const company = resolveCompanyFromContext(context);
  const escapedNames = names.map((n) => `'${escapeSql(n)}'`).join(", ");
  const result = queryVaultJsonDetailed(
    `SELECT ${buildSelectColumns(includeContent, true)} FROM prompt_templates WHERE name IN (${escapedNames}) AND status = 'active' AND ${buildVisibilityPredicate(company)}`,
  );
  if (!result.ok) return result;
  return { ok: true, value: parseTemplateRows(result.value), error: null };
}

function retrieveByNames(
  names: string[],
  includeContent: boolean,
  context?: VaultExecutionContext,
): Template[] {
  const result = retrieveByNamesDetailed(names, includeContent, context);
  return result.ok ? result.value : [];
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

function validateCompanyList(companies: string[], contracts = getContracts()): string | null {
  const governedCompanies = new Set(contracts.companyVisibility.companies);
  if (companies.length === 0) return "visibility_companies must be non-empty";
  const invalid = companies.filter((company) => !governedCompanies.has(company));
  if (invalid.length > 0) return `Unknown visibility company value(s): ${invalid.join(", ")}`;
  return null;
}

function validateControlledVocabulary(
  controlMode: string,
  controlledVocabulary: RouterControlledVocabulary | null,
  contracts = getContracts(),
): string | null {
  const contract = contracts.controlledVocabulary;
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

export function validateTemplateContent(content: string): string | null {
  const rawContent = String(content ?? "");
  if (!rawContent.trim()) return "content must be non-empty";

  const renderContract = detectTemplateRenderEngine(rawContent, {
    allowLegacyPiVarsAutoDetect: false,
  });
  if (renderContract.error) return renderContract.error;

  if (!stripFrontmatter(rawContent).trim()) {
    return "content body must be non-empty after frontmatter";
  }

  return null;
}

function validateTemplateRecord(
  template: Pick<
    Template,
    | "content"
    | "artifact_kind"
    | "control_mode"
    | "formalization_level"
    | "owner_company"
    | "visibility_companies"
    | "controlled_vocabulary"
  >,
  contracts = getContracts(),
): string | null {
  const contentError = validateTemplateContent(template.content);
  if (contentError) return contentError;

  if (!contracts.ontology.facets.artifact_kind.includes(template.artifact_kind)) {
    return `Unknown artifact_kind: ${template.artifact_kind}`;
  }
  if (!contracts.ontology.facets.control_mode.includes(template.control_mode)) {
    return `Unknown control_mode: ${template.control_mode}`;
  }
  if (!contracts.ontology.facets.formalization_level.includes(template.formalization_level)) {
    return `Unknown formalization_level: ${template.formalization_level}`;
  }
  if (!contracts.companyVisibility.companies.includes(template.owner_company)) {
    return `Unknown owner_company: ${template.owner_company}`;
  }

  const visibilityError = validateCompanyList(template.visibility_companies, contracts);
  if (visibilityError) return visibilityError;
  if (!template.visibility_companies.includes(template.owner_company)) {
    return "visibility_companies must include owner_company";
  }

  return validateControlledVocabulary(
    template.control_mode,
    template.controlled_vocabulary,
    contracts,
  );
}

export function prepareTemplateUpdate(
  name: string,
  existing: Template | null,
  patch: TemplateUpdatePatch,
  contracts = getContracts(),
): { status: "ok"; merged: Template } | { status: "error"; message: string } {
  if (!existing) return { status: "error", message: `Template not found: ${name}` };
  if (!hasTemplateUpdateFields(patch)) {
    return {
      status: "error",
      message: "No update fields provided. Supply at least one patch field.",
    };
  }

  const merged = mergeTemplateUpdate(existing, patch);
  const validationError = validateTemplateRecord(merged, contracts);
  if (validationError) return { status: "error", message: validationError };

  return { status: "ok", merged };
}

export function authorizeTemplateInsert(ownerCompany: string, actorCompany: string): string | null {
  if (ownerCompany !== actorCompany) {
    return `owner_company must match the active mutation company (${actorCompany}) for vault_insert`;
  }
  return null;
}

export function authorizeTemplateUpdate(
  existing: Pick<Template, "owner_company">,
  merged: Pick<Template, "owner_company">,
  actorCompany: string,
): string | null {
  if (existing.owner_company !== actorCompany) {
    return `Template is owned by ${existing.owner_company}; active mutation company ${actorCompany} cannot update it.`;
  }
  if (merged.owner_company !== existing.owner_company) {
    return "owner_company cannot be reassigned via vault_update";
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
  context?: VaultMutationContext,
): InsertResult {
  const contracts = getContracts();
  const actorContext = resolveMutationActorContext(context);
  if (actorContext.status === "error") return actorContext;
  const ownerAuthorizationError = authorizeTemplateInsert(ownerCompany, actorContext.actorCompany);
  if (ownerAuthorizationError) return { status: "error", message: ownerAuthorizationError };

  const normalizedControlledVocabulary = sanitizeControlledVocabularyValue(controlledVocabulary);
  const validationError = validateTemplateRecord(
    {
      content,
      artifact_kind: artifactKind,
      control_mode: controlMode,
      formalization_level: formalizationLevel,
      owner_company: ownerCompany,
      visibility_companies: visibilityCompanies,
      controlled_vocabulary: normalizedControlledVocabulary,
    },
    contracts,
  );
  if (validationError) return { status: "error", message: validationError };

  const escapedName = escapeSql(name);
  const existing = queryVaultJson(
    `SELECT id FROM prompt_templates WHERE name = '${escapedName}' AND status = 'active' LIMIT 1`,
  );
  if ((existing?.rows || []).length > 0) {
    return {
      status: "error",
      message: `Template already exists: ${name}. Use vault_update for in-place edits.`,
    };
  }

  const escapedContent = escapeSql(content);
  const escapedDesc = escapeSql(description);
  const visibilityCompaniesJson = escapeSql(JSON.stringify(visibilityCompanies));
  const controlledVocabularyJson = normalizedControlledVocabulary
    ? `'${escapeSql(JSON.stringify(normalizedControlledVocabulary))}'`
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
  `;
  if (!execVault(sql)) return { status: "error", message: "Failed to insert template" };
  commitVault(`Add template: ${name}`);
  const templateId = queryVaultJson(`SELECT id FROM prompt_templates WHERE name = '${escapedName}'`)
    ?.rows?.[0]?.id as number | undefined;
  return {
    status: "ok",
    message: `Template '${name}' saved as ${artifactKind}/${controlMode}/${formalizationLevel} for owner=${ownerCompany}`,
    templateId,
  };
}

function updateTemplate(
  name: string,
  patch: TemplateUpdatePatch,
  context?: VaultMutationContext,
): UpdateResult {
  const actorContext = resolveMutationActorContext(context);
  if (actorContext.status === "error") return actorContext;

  const existing = getActiveTemplateByName(name);
  const prepared = prepareTemplateUpdate(name, existing, patch, getContracts());
  if (prepared.status === "error") return prepared;
  if (!existing) return { status: "error", message: `Template not found: ${name}` };

  const authorizationError = authorizeTemplateUpdate(
    existing,
    prepared.merged,
    actorContext.actorCompany,
  );
  if (authorizationError) return { status: "error", message: authorizationError };

  if (!Number.isFinite(existing?.version)) {
    return {
      status: "error",
      message: `Template '${name}' is missing a numeric version; refusing unsafe update.`,
    };
  }

  const merged = prepared.merged;
  const nextVersion = Number(existing.version) + 1;
  const escapedName = escapeSql(name);
  const escapedContent = escapeSql(merged.content);
  const escapedDesc = escapeSql(merged.description);
  const visibilityCompaniesJson = escapeSql(JSON.stringify(merged.visibility_companies));
  const controlledVocabularyJson = merged.controlled_vocabulary
    ? `'${escapeSql(JSON.stringify(merged.controlled_vocabulary))}'`
    : "NULL";
  const sql = `
    UPDATE prompt_templates
    SET
      description = '${escapedDesc}',
      content = '${escapedContent}',
      artifact_kind = '${escapeSql(merged.artifact_kind)}',
      control_mode = '${escapeSql(merged.control_mode)}',
      formalization_level = '${escapeSql(merged.formalization_level)}',
      owner_company = '${escapeSql(merged.owner_company)}',
      visibility_companies = '${visibilityCompaniesJson}',
      controlled_vocabulary = ${controlledVocabularyJson},
      version = ${nextVersion},
      updated_at = NOW()
    WHERE name = '${escapedName}'
      AND status = 'active'
      AND owner_company = '${escapeSql(actorContext.actorCompany)}'
      AND version = ${Number(existing.version)}
  `;
  const updatedRows = execVaultWithRowCount(sql);
  if (updatedRows == null) return { status: "error", message: "Failed to update template" };
  if (updatedRows !== 1) {
    return {
      status: "error",
      message: `Template '${name}' changed during update. Refresh and retry with the latest version.`,
    };
  }
  commitVault(`Update template: ${name}`);
  return {
    status: "ok",
    message: `Template '${name}' updated as ${merged.artifact_kind}/${merged.control_mode}/${merged.formalization_level} for owner=${merged.owner_company} (v${nextVersion})`,
    templateId: merged.id,
  };
}

function rateTemplate(
  executionId: number,
  rating: number,
  success: boolean,
  notes: string,
  context?: VaultMutationContext,
): { ok: boolean; message: string } {
  const actorContext = resolveMutationActorContext(context);
  if (actorContext.status === "error") {
    return { ok: false, message: actorContext.message };
  }

  if (!Number.isFinite(executionId) || executionId < 1) {
    return { ok: false, message: "execution_id must be a positive integer." };
  }
  if (!Number.isFinite(rating) || rating < 1 || rating > 5) {
    return { ok: false, message: "rating must be between 1 and 5." };
  }

  const execution = queryVaultJson(`
    SELECT e.id, e.entity_version, pt.name
    FROM executions e
    INNER JOIN prompt_templates pt ON pt.id = e.entity_id
    WHERE e.id = ${Math.floor(executionId)}
      AND e.entity_type = 'template'
      AND pt.status = 'active'
      AND ${buildVisibilityPredicate(actorContext.actorCompany)}
    LIMIT 1
  `)?.rows?.[0];
  if (!execution) {
    return {
      ok: false,
      message: `Template execution not found or not visible: ${Math.floor(executionId)}`,
    };
  }

  const existingFeedback = queryVaultJsonDetailed(`
    SELECT id FROM feedback WHERE execution_id = ${Math.floor(executionId)} LIMIT 1
  `);
  if (!existingFeedback.ok) {
    return { ok: false, message: `Failed to inspect existing feedback: ${existingFeedback.error}` };
  }
  if ((existingFeedback.value.rows || []).length > 0) {
    return {
      ok: false,
      message: `Feedback already exists for execution ${Math.floor(executionId)}. Use a future feedback-update path instead of creating duplicates.`,
    };
  }

  const escapedNotes = escapeSql(notes);
  const issuesJson = escapeSql(
    JSON.stringify(success ? [] : ["needs-improvement", `execution:${Math.floor(executionId)}`]),
  );
  const insertedRows = execVaultWithRowCount(`
    INSERT INTO feedback (execution_id, rating, notes, issues)
    SELECT ${Math.floor(executionId)}, ${rating}, '${escapedNotes}', '${issuesJson}'
    FROM DUAL
    WHERE NOT EXISTS (
      SELECT 1 FROM feedback WHERE execution_id = ${Math.floor(executionId)}
    )
  `);
  if (insertedRows == null) return { ok: false, message: "Failed to record feedback" };
  if (insertedRows !== 1) {
    return {
      ok: false,
      message: `Feedback for execution ${Math.floor(executionId)} was not recorded because a duplicate already exists or the execution changed concurrently.`,
    };
  }

  const executionVersion = Number.isFinite(Number(execution.entity_version))
    ? ` v${Number(execution.entity_version)}`
    : "";
  const templateName = String(execution.name || "template");
  commitVault(`Rate execution: ${Math.floor(executionId)} (${rating}/5)`);
  return {
    ok: true,
    message: `Recorded rating ${rating}/5 for execution ${Math.floor(executionId)} (${templateName}${executionVersion})`,
  };
}

function logExecution(
  template: Pick<Template, "id" | "version">,
  model: string,
  inputContext?: string,
): void {
  if (!Number.isFinite(template.id)) return;

  const escapedContext = escapeSql((inputContext || "").slice(0, 1000));
  const escapedModel = escapeSql(model);
  const entityVersion = Number.isFinite(template.version) ? Number(template.version) : "NULL";
  execVault(`
    INSERT INTO executions (entity_type, entity_id, entity_version, input_context, model, success, created_at)
    VALUES ('template', ${Number(template.id)}, ${entityVersion}, '${escapedContext}', '${escapedModel}', true, NOW())
  `);
}

function getPresentColumns(tableName: string): Set<string> {
  const columns = queryVaultJson(`SHOW COLUMNS FROM ${tableName}`);
  return new Set((columns?.rows || []).map((row) => String(row.Field || "")));
}

function getMissingColumns(required: readonly string[], present: Set<string>): string[] {
  return required.filter((column) => !present.has(column));
}

function checkSchemaCompatibilityDetailed(): SchemaCompatibilityReport {
  const versionResult = queryVaultJson("SELECT MAX(version) AS version FROM schema_version");
  const rawVersion = versionResult?.rows?.[0]?.version;
  const actualVersion = Number.isFinite(Number(rawVersion)) ? Number(rawVersion) : null;
  const promptTemplatePresent = getPresentColumns("prompt_templates");
  const executionPresent = getPresentColumns("executions");
  const feedbackPresent = getPresentColumns("feedback");
  const missingPromptTemplateColumns = getMissingColumns(
    REQUIRED_PROMPT_TEMPLATE_COLUMNS,
    promptTemplatePresent,
  );
  const missingExecutionColumns = getMissingColumns(REQUIRED_EXECUTION_COLUMNS, executionPresent);
  const missingFeedbackColumns = getMissingColumns(REQUIRED_FEEDBACK_COLUMNS, feedbackPresent);

  return {
    ok:
      actualVersion === SCHEMA_VERSION &&
      missingPromptTemplateColumns.length === 0 &&
      missingExecutionColumns.length === 0 &&
      missingFeedbackColumns.length === 0,
    expectedVersion: SCHEMA_VERSION,
    actualVersion,
    missingPromptTemplateColumns,
    missingExecutionColumns,
    missingFeedbackColumns,
  };
}

function checkSchemaVersion(): boolean {
  return checkSchemaCompatibilityDetailed().ok;
}

export function createVaultRuntime(): VaultRuntime {
  return {
    queryVaultJson,
    queryVaultJsonDetailed,
    execVault,
    commitVault,
    escapeSql,
    escapeLikePattern,
    parseTemplateRows,
    facetLabel,
    governanceLabel,
    controlledVocabularyLabel,
    formatTemplateDetails,
    getCurrentCompany,
    resolveCurrentCompanyContext,
    buildVisibilityPredicate,
    getContracts,
    getTemplate,
    getTemplateDetailed,
    listTemplates,
    listTemplatesDetailed,
    searchTemplates,
    searchTemplatesDetailed,
    queryTemplates,
    queryTemplatesDetailed,
    retrieveByNames,
    retrieveByNamesDetailed,
    getVocabulary,
    insertTemplate,
    updateTemplate,
    rateTemplate,
    logExecution,
    checkSchemaCompatibilityDetailed,
    checkSchemaVersion,
  };
}

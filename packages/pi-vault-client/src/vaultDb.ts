import { execFileSync } from "node:child_process";
import {
  DEFAULT_VAULT_QUERY_LIMIT,
  type DoltJsonResult,
  type InsertResult,
  MAX_VAULT_QUERY_LIMIT,
  SCHEMA_VERSION,
  type Template,
  VAULT_DIR,
  type VaultRuntime,
} from "./vaultTypes.js";

let lastVaultQueryError: string | null = null;

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
    tags: Array.isArray(row.tags) ? row.tags.map(String) : [],
  }));
}

function facetLabel(
  template: Pick<Template, "artifact_kind" | "control_mode" | "formalization_level">,
): string {
  return `${template.artifact_kind}/${template.control_mode}/${template.formalization_level}`;
}

function getTemplate(name: string): Template | null {
  const escapedName = escapeSql(name);
  const result = queryVaultJson(
    `SELECT id, name, description, content, artifact_kind, control_mode, formalization_level, tags FROM prompt_templates WHERE name = '${escapedName}' AND status = 'active'`,
  );
  return parseTemplateRows(result)[0] || null;
}

function listTemplates(
  filters?: Partial<Pick<Template, "artifact_kind" | "control_mode" | "formalization_level">>,
): Template[] {
  const whereClauses = ["status = 'active'"];
  if (filters?.artifact_kind)
    whereClauses.push(`artifact_kind = '${escapeSql(filters.artifact_kind)}'`);
  if (filters?.control_mode)
    whereClauses.push(`control_mode = '${escapeSql(filters.control_mode)}'`);
  if (filters?.formalization_level)
    whereClauses.push(`formalization_level = '${escapeSql(filters.formalization_level)}'`);

  const result = queryVaultJson(
    `SELECT name, description, content, artifact_kind, control_mode, formalization_level, tags FROM prompt_templates WHERE ${whereClauses.join(" AND ")} ORDER BY artifact_kind, control_mode, formalization_level, name`,
  );
  return parseTemplateRows(result);
}

function searchTemplates(query: string): Template[] {
  const normalizedQuery = query.trim().toLowerCase();
  if (!normalizedQuery) return [];

  const escapedQuery = escapeLikePattern(normalizedQuery);
  const result = queryVaultJson(
    `SELECT name, description, content, artifact_kind, control_mode, formalization_level, tags FROM prompt_templates WHERE status = 'active' AND (` +
      `LOWER(name) LIKE '%${escapedQuery}%' ESCAPE '!' OR ` +
      `LOWER(description) LIKE '%${escapedQuery}%' ESCAPE '!' OR ` +
      `LOWER(content) LIKE '%${escapedQuery}%' ESCAPE '!'` +
      `) ORDER BY artifact_kind, control_mode, formalization_level, name LIMIT 20`,
  );
  return parseTemplateRows(result);
}

function queryTemplates(
  tags: string[],
  keywords: string[],
  limit: number,
  includeContent: boolean,
  artifactKinds: string[],
  controlModes: string[],
  formalizationLevels: string[],
): Template[] {
  const cols = includeContent
    ? "name, description, content, artifact_kind, control_mode, formalization_level, tags"
    : "name, description, artifact_kind, control_mode, formalization_level, tags";
  const whereClauses = ["status = 'active'"];

  if (artifactKinds.length > 0)
    whereClauses.push(
      `artifact_kind IN (${artifactKinds.map((value) => `'${escapeSql(value)}'`).join(", ")})`,
    );
  if (controlModes.length > 0)
    whereClauses.push(
      `control_mode IN (${controlModes.map((value) => `'${escapeSql(value)}'`).join(", ")})`,
    );
  if (formalizationLevels.length > 0)
    whereClauses.push(
      `formalization_level IN (${formalizationLevels.map((value) => `'${escapeSql(value)}'`).join(", ")})`,
    );

  if (tags.length > 0) {
    const tagConditions = tags.map((tag) => `JSON_CONTAINS(tags, JSON_QUOTE('${escapeSql(tag)}'))`);
    whereClauses.push(`(${tagConditions.join(" OR ")})`);
  }

  if (keywords.length > 0) {
    const keywordConditions = keywords.map((keyword) => {
      const escaped = escapeLikePattern(keyword.toLowerCase());
      const fields = [
        `LOWER(name) LIKE '%${escaped}%' ESCAPE '!'`,
        `LOWER(description) LIKE '%${escaped}%' ESCAPE '!'`,
      ];
      if (includeContent) fields.push(`LOWER(content) LIKE '%${escaped}%' ESCAPE '!'`);
      return `(${fields.join(" OR ")})`;
    });
    whereClauses.push(`(${keywordConditions.join(" OR ")})`);
  }

  const effectiveLimit = Number.isFinite(limit)
    ? Math.min(MAX_VAULT_QUERY_LIMIT, Math.max(1, Math.floor(limit)))
    : DEFAULT_VAULT_QUERY_LIMIT;
  const result = queryVaultJson(
    `SELECT ${cols} FROM prompt_templates WHERE ${whereClauses.join(" AND ")} ORDER BY artifact_kind, control_mode, formalization_level, name LIMIT ${effectiveLimit}`,
  );
  return parseTemplateRows(result);
}

function retrieveByNames(names: string[], includeContent: boolean): Template[] {
  if (names.length === 0) return [];
  const escapedNames = names.map((n) => `'${escapeSql(n)}'`).join(", ");
  const cols = includeContent
    ? "id, name, description, content, artifact_kind, control_mode, formalization_level, tags"
    : "name, description, artifact_kind, control_mode, formalization_level, tags";
  return parseTemplateRows(
    queryVaultJson(
      `SELECT ${cols} FROM prompt_templates WHERE name IN (${escapedNames}) AND status = 'active'`,
    ),
  );
}

function getVocabulary(): Record<string, string[]> {
  const result = queryVaultJson(
    "SELECT DISTINCT artifact_kind, control_mode, formalization_level, tags FROM prompt_templates WHERE status = 'active'",
  );
  const vocab: Record<string, string[]> = {
    artifact_kind: [],
    control_mode: [],
    formalization_level: [],
  };
  if (!result || !result.rows) return vocab;

  for (const row of result.rows) {
    for (const facet of ["artifact_kind", "control_mode", "formalization_level"] as const) {
      const value = String(row[facet] || "").trim();
      if (value && !vocab[facet].includes(value)) vocab[facet].push(value);
    }
    const tags = row.tags;
    if (!Array.isArray(tags)) continue;
    for (const tag of tags) {
      const tagStr = String(tag);
      const colonIdx = tagStr.indexOf(":");
      if (colonIdx > 0) {
        const namespace = tagStr.slice(0, colonIdx);
        const value = tagStr.slice(colonIdx + 1);
        if (!vocab[namespace]) vocab[namespace] = [];
        if (!vocab[namespace].includes(value)) vocab[namespace].push(value);
      } else {
        if (!vocab._) vocab._ = [];
        if (!vocab._.includes(tagStr)) vocab._.push(tagStr);
      }
    }
  }

  for (const ns of Object.keys(vocab)) vocab[ns].sort();
  return vocab;
}

function insertTemplate(
  name: string,
  content: string,
  description: string,
  tags: string[],
  artifactKind: string,
  controlMode: string,
  formalizationLevel: string,
  confirmNewTags: boolean,
): InsertResult {
  const vocab = getVocabulary();
  const newTags: string[] = [];
  for (const tag of tags) {
    const colonIdx = tag.indexOf(":");
    if (colonIdx > 0) {
      const ns = tag.slice(0, colonIdx);
      const val = tag.slice(colonIdx + 1);
      if (!vocab[ns] || !vocab[ns].includes(val)) newTags.push(tag);
    } else if (!vocab._ || !vocab._.includes(tag)) {
      newTags.push(tag);
    }
  }

  const unknownFacets = [
    ["artifact_kind", artifactKind],
    ["control_mode", controlMode],
    ["formalization_level", formalizationLevel],
  ].filter(([facet, value]) => !vocab[facet]?.includes(value));
  if (unknownFacets.length > 0) {
    return {
      status: "error",
      message: `Unknown ontology facet value(s): ${unknownFacets.map(([facet, value]) => `${facet}=${value}`).join(", ")}`,
    };
  }
  if (newTags.length > 0 && !confirmNewTags) {
    return {
      status: "confirm",
      message: `New tags detected: ${newTags.join(", ")}. Set confirmNewTags: true to proceed.`,
      newTags,
      existingVocab: vocab,
    };
  }

  const escapedName = escapeSql(name);
  const escapedContent = escapeSql(content);
  const escapedDesc = escapeSql(description);
  const tagsJson = JSON.stringify(tags);
  const sql = `
    INSERT INTO prompt_templates (name, description, content, tags, artifact_kind, control_mode, formalization_level, status, version)
    VALUES ('${escapedName}', '${escapedDesc}', '${escapedContent}', '${tagsJson}', '${escapeSql(artifactKind)}', '${escapeSql(controlMode)}', '${escapeSql(formalizationLevel)}', 'active', 1)
    ON DUPLICATE KEY UPDATE description = '${escapedDesc}', content = '${escapedContent}', tags = '${tagsJson}', artifact_kind = '${escapeSql(artifactKind)}', control_mode = '${escapeSql(controlMode)}', formalization_level = '${escapeSql(formalizationLevel)}', updated_at = NOW()
  `;
  if (!execVault(sql)) return { status: "error", message: "Failed to insert template" };
  commitVault(`Add/update template: ${name}`);
  const templateId = queryVaultJson(`SELECT id FROM prompt_templates WHERE name = '${escapedName}'`)
    ?.rows?.[0]?.id as number | undefined;
  return {
    status: "ok",
    message: `Template '${name}' saved as ${artifactKind}/${controlMode}/${formalizationLevel}`,
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
  const _escapedVariant = escapeSql(variant);
  const issues = success ? "[]" : "['needs-improvement']";
  const sql = `
    INSERT INTO feedback (execution_id, rating, notes, issues)
    SELECT id, ${rating}, '${escapedNotes}', '${issues}'
    FROM executions
    WHERE entity_type = 'template' AND entity_id = ${template.id}
    ORDER BY created_at DESC LIMIT 1
  `;
  const ok = execVault(sql);
  if (!ok) {
    const directSql = `INSERT INTO feedback (execution_id, rating, notes, issues) VALUES (0, ${rating}, '${escapedNotes}', '${issues}')`;
    if (!execVault(directSql)) return { ok: false, message: "Failed to record feedback" };
  }
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
  const result = queryVaultJson(
    "SELECT version FROM schema_version ORDER BY version DESC, id DESC LIMIT 1",
  );
  if (!result || !result.rows || result.rows.length === 0) return false;
  const dbVersion = Number(result.rows[0].version) || 0;
  if (dbVersion !== SCHEMA_VERSION) return false;
  const columns = queryVaultJson("SHOW COLUMNS FROM prompt_templates");
  const present = new Set((columns?.rows || []).map((row) => String(row.Field || "")));
  return ["artifact_kind", "control_mode", "formalization_level"].every((column) =>
    present.has(column),
  );
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

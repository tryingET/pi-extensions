import { execFileSync } from "node:child_process";
import { existsSync, readFileSync, statSync } from "node:fs";
import { resolveCompanyContext } from "./companyContext.js";
import { rateTemplate as executeFeedbackRating } from "./vaultFeedback.js";
import { authorizeTemplateInsert, authorizeTemplateUpdate, insertTemplate as executeTemplateInsert, updateTemplate as executeTemplateUpdate, prepareTemplateUpdate, resolveMutationActorContext, validateTemplateContent, } from "./vaultMutations.js";
import { checkSchemaCompatibilityDetailed as computeSchemaCompatibilityDetailed, checkSchemaVersion as computeSchemaVersion, } from "./vaultSchema.js";
import { ARTIFACT_KINDS, COMPANIES, CONTROL_MODES, CONTROLLED_VOCABULARY_DIMENSIONS, DEFAULT_VAULT_QUERY_LIMIT, FORMALIZATION_LEVELS, INTENT_RANKING_CANDIDATE_POOL_LIMIT, MAX_VAULT_QUERY_LIMIT, PROMPT_VAULT_ROOT, VAULT_DIR, } from "./vaultTypes.js";
export { authorizeTemplateInsert, authorizeTemplateUpdate, prepareTemplateUpdate, resolveMutationActorContext, validateTemplateContent, };
const DEFAULT_DOLT_MAX_BUFFER = 64 * 1024 * 1024;
let cachedContracts = null;
let cachedContractsKey = null;
function formatVaultError(error) {
    return error instanceof Error ? error.message : String(error);
}
function runDolt(args, maxBuffer = DEFAULT_DOLT_MAX_BUFFER) {
    return execFileSync("dolt", args, {
        cwd: VAULT_DIR,
        encoding: "utf-8",
        maxBuffer,
    });
}
function queryVaultJsonDetailed(sql) {
    try {
        const result = runDolt(["sql", "-r", "json", "-q", sql]);
        return { ok: true, value: JSON.parse(result), error: null };
    }
    catch (error) {
        const message = formatVaultError(error);
        console.error("Vault query error:", error);
        return { ok: false, value: null, error: message };
    }
}
function queryVaultJson(sql) {
    const result = queryVaultJsonDetailed(sql);
    return result.ok ? result.value : null;
}
function execVault(sql) {
    try {
        runDolt(["sql", "-q", sql]);
        return true;
    }
    catch (e) {
        console.error("Vault exec error:", e);
        return false;
    }
}
function parseJsonDocuments(output) {
    return output
        .split(/\n(?=\{)/)
        .map((chunk) => chunk.trim())
        .filter(Boolean)
        .map((chunk) => JSON.parse(chunk));
}
function execVaultWithRowCount(sql) {
    try {
        const normalizedSql = sql.trim().replace(/;+\s*$/, "");
        const output = runDolt([
            "sql",
            "-r",
            "json",
            "-q",
            `${normalizedSql}; SELECT ROW_COUNT() AS row_count;`,
        ]);
        const lastDocument = parseJsonDocuments(output).at(-1);
        if (!lastDocument)
            return null;
        const rawCount = lastDocument?.rows?.[0]?.row_count;
        const rowCount = Number(rawCount);
        return Number.isFinite(rowCount) ? rowCount : null;
    }
    catch (e) {
        console.error("Vault exec error:", e);
        return null;
    }
}
function execVaultInsertWithId(sql) {
    try {
        const normalizedSql = sql.trim().replace(/;+\s*$/, "");
        const output = runDolt([
            "sql",
            "-r",
            "json",
            "-q",
            `${normalizedSql}; SELECT ROW_COUNT() AS row_count, LAST_INSERT_ID() AS insert_id;`,
        ]);
        const lastDocument = parseJsonDocuments(output).at(-1);
        if (!lastDocument)
            return null;
        const rowCount = Number(lastDocument?.rows?.[0]?.row_count);
        const insertId = Number(lastDocument?.rows?.[0]?.insert_id);
        return {
            rowCount: Number.isFinite(rowCount) ? rowCount : 0,
            insertId: Number.isFinite(insertId) && insertId > 0 ? insertId : null,
        };
    }
    catch (e) {
        console.error("Vault exec error:", e);
        return null;
    }
}
function commitVault(message, tables) {
    const normalizedTables = Array.isArray(tables)
        ? tables.map((value) => String(value || "").trim()).filter(Boolean)
        : [];
    try {
        runDolt(normalizedTables.length > 0 ? ["add", ...normalizedTables] : ["add", "-A"], 1024 * 1024);
        runDolt(["commit", "-m", message], 1024 * 1024);
    }
    catch (error) {
        const detail = formatVaultError(error);
        if (/nothing to commit|no changes added to commit/i.test(detail))
            return;
        console.warn(`Vault commit warning (${message}): ${detail}`);
    }
}
function escapeSql(str) {
    return str.replace(/\\/g, "\\\\").replace(/'/g, "''").split("\0").join("");
}
function escapeLikePattern(str) {
    return escapeSql(str).replace(/!/g, "!!").replace(/%/g, "!%").replace(/_/g, "!_");
}
function parseJsonArray(value) {
    if (Array.isArray(value))
        return value.map(String);
    if (typeof value === "string") {
        const trimmed = value.trim();
        if (!trimmed)
            return [];
        try {
            const parsed = JSON.parse(trimmed);
            return Array.isArray(parsed) ? parsed.map(String) : [];
        }
        catch {
            return [];
        }
    }
    return [];
}
function parseControlledVocabulary(value) {
    const raw = value && typeof value === "object"
        ? value
        : typeof value === "string" && value.trim()
            ? (() => {
                try {
                    return JSON.parse(value);
                }
                catch {
                    return null;
                }
            })()
            : null;
    if (!raw || typeof raw !== "object")
        return null;
    const record = raw;
    const parsed = {};
    if (record.routing_context)
        parsed.routing_context = String(record.routing_context);
    if (record.activity_phase)
        parsed.activity_phase = String(record.activity_phase);
    if (record.input_artifact)
        parsed.input_artifact = String(record.input_artifact);
    if (record.transition_target_type)
        parsed.transition_target_type = String(record.transition_target_type);
    if (record.output_commitment)
        parsed.output_commitment = String(record.output_commitment);
    if (Array.isArray(record.selection_principles))
        parsed.selection_principles = record.selection_principles.map(String);
    return Object.keys(parsed).length > 0 ? parsed : null;
}
function normalizeBoolean(value) {
    if (typeof value === "boolean")
        return value;
    if (typeof value === "number")
        return value !== 0;
    if (typeof value === "bigint")
        return value !== 0n;
    if (typeof value === "string") {
        const normalized = value.trim().toLowerCase();
        if (!normalized)
            return undefined;
        if (["1", "true", "yes", "y", "on"].includes(normalized))
            return true;
        if (["0", "false", "no", "n", "off"].includes(normalized))
            return false;
    }
    return undefined;
}
function parseTemplateRows(result) {
    if (!result || !result.rows || result.rows.length === 0)
        return [];
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
        export_to_pi: normalizeBoolean(row.export_to_pi),
        version: typeof row.version === "number" ? row.version : undefined,
    }));
}
function facetLabel(template) {
    return `${template.artifact_kind}/${template.control_mode}/${template.formalization_level}`;
}
function governanceLabel(template) {
    const visibleTo = template.visibility_companies.length > 0 ? template.visibility_companies.join(", ") : "(none)";
    return `owner=${template.owner_company}; visible_to=[${visibleTo}]`;
}
function controlledVocabularyLabel(template) {
    const cv = template.controlled_vocabulary;
    if (!cv)
        return "none";
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
function formatTemplateDetails(template, includeContent = false, options) {
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
        lines.push(`- selection_principles: ${cv.selection_principles?.length ? cv.selection_principles.join(", ") : "(unset)"}`);
        lines.push(`- output_commitment: ${cv.output_commitment || "(unset)"}`);
    }
    else {
        lines.push("- controlled_vocabulary: none");
    }
    if (includeGovernance) {
        lines.push("", "### Governance");
        lines.push(`- owner_company: ${template.owner_company}`);
        lines.push(`- visibility_companies: ${template.visibility_companies.length > 0 ? template.visibility_companies.join(", ") : "(none)"}`);
    }
    if (includeContent && template.content)
        lines.push("", "---", template.content);
    return lines.filter((line, index, arr) => !(line === "" && arr[index - 1] === "")).join("\n");
}
function readJsonContract(path, fallback) {
    if (!existsSync(path))
        return fallback;
    try {
        return JSON.parse(readFileSync(path, "utf8"));
    }
    catch {
        return fallback;
    }
}
function buildContractCacheKey(paths) {
    return paths
        .map((path) => {
        if (!existsSync(path))
            return `${path}:missing`;
        const stats = statSync(path);
        return `${path}:${stats.size}:${stats.mtimeMs}`;
    })
        .join("|");
}
function getContracts() {
    const ontologyPath = `${PROMPT_VAULT_ROOT}/ontology/v2-contract.json`;
    const controlledVocabularyPath = `${PROMPT_VAULT_ROOT}/ontology/controlled-vocabulary-contract.json`;
    const companyVisibilityPath = `${PROMPT_VAULT_ROOT}/ontology/company-visibility-contract.json`;
    const contractCacheKey = buildContractCacheKey([
        ontologyPath,
        controlledVocabularyPath,
        companyVisibilityPath,
    ]);
    if (cachedContracts && cachedContractsKey === contractCacheKey)
        return cachedContracts;
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
        ontology: readJsonContract(ontologyPath, ontologyFallback),
        controlledVocabulary: readJsonContract(controlledVocabularyPath, controlledVocabularyFallback),
        companyVisibility: readJsonContract(companyVisibilityPath, companyVisibilityFallback),
    };
    cachedContractsKey = contractCacheKey;
    return cachedContracts;
}
function resolveCurrentCompanyContext(cwd) {
    return resolveCompanyContext({
        cwd,
        defaultCompany: getContracts().companyVisibility.defaults?.owner_company || "core",
    });
}
function getCurrentCompany(cwd) {
    return resolveCurrentCompanyContext(cwd).company;
}
function resolveReadCompanyContext(context) {
    if (context?.currentCompany?.trim()) {
        return {
            ok: true,
            company: context.currentCompany.trim(),
            source: "explicit:currentCompany",
        };
    }
    const resolved = resolveCurrentCompanyContext(context?.cwd);
    if (context?.requireExplicitCompany && resolved.source === "contract-default") {
        return {
            ok: false,
            error: "Explicit company context is required for visibility-sensitive vault reads. Set PI_COMPANY or run from a company-scoped cwd.",
        };
    }
    return { ok: true, company: resolved.company, source: resolved.source };
}
function qualifyTemplateColumn(column, alias) {
    return alias ? `${alias}.${column}` : column;
}
function buildVisibilityPredicate(company = getCurrentCompany(), alias) {
    return `JSON_SEARCH(${qualifyTemplateColumn("visibility_companies", alias)}, 'one', '${escapeSql(company)}') IS NOT NULL`;
}
function buildActiveVisibleTemplatePredicate(company = getCurrentCompany(), alias) {
    return [
        `${qualifyTemplateColumn("status", alias)} = 'active'`,
        buildVisibilityPredicate(company, alias),
    ].join(" AND ");
}
function buildSelectColumns(includeContent, includeId = false, options) {
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
function getActiveTemplateByName(name) {
    const escapedName = escapeSql(name);
    const result = queryVaultJson(`SELECT ${buildSelectColumns(true, true)} FROM prompt_templates WHERE name = '${escapedName}' AND status = 'active'`);
    return parseTemplateRows(result)[0] || null;
}
function getTemplateDetailed(name, context) {
    const companyContext = resolveReadCompanyContext(context);
    if (!companyContext.ok)
        return { ok: false, value: null, error: companyContext.error };
    const escapedName = escapeSql(name);
    const result = queryVaultJsonDetailed(`SELECT ${buildSelectColumns(true, true)} FROM prompt_templates WHERE name = '${escapedName}' AND ${buildActiveVisibleTemplatePredicate(companyContext.company)}`);
    if (!result.ok)
        return result;
    return { ok: true, value: parseTemplateRows(result.value)[0] || null, error: null };
}
function getTemplate(name, context) {
    const result = getTemplateDetailed(name, context);
    return result.ok ? result.value : null;
}
function listTemplatesDetailed(filters, context, options) {
    const companyContext = resolveReadCompanyContext(context);
    if (!companyContext.ok)
        return { ok: false, value: null, error: companyContext.error };
    const whereClauses = [buildActiveVisibleTemplatePredicate(companyContext.company)];
    if (filters?.artifact_kind)
        whereClauses.push(`artifact_kind = '${escapeSql(filters.artifact_kind)}'`);
    if (filters?.control_mode)
        whereClauses.push(`control_mode = '${escapeSql(filters.control_mode)}'`);
    if (filters?.formalization_level)
        whereClauses.push(`formalization_level = '${escapeSql(filters.formalization_level)}'`);
    const result = queryVaultJsonDetailed(`SELECT ${buildSelectColumns(options?.includeContent ?? false)} FROM prompt_templates WHERE ${whereClauses.join(" AND ")} ORDER BY artifact_kind, control_mode, formalization_level, owner_company, name`);
    if (!result.ok)
        return result;
    return { ok: true, value: parseTemplateRows(result.value), error: null };
}
function listTemplates(filters, context, options) {
    const result = listTemplatesDetailed(filters, context, options);
    return result.ok ? result.value : [];
}
function searchTemplatesDetailed(query, context, options) {
    const normalizedQuery = query.trim().toLowerCase();
    if (!normalizedQuery)
        return { ok: true, value: [], error: null };
    const companyContext = resolveReadCompanyContext(context);
    if (!companyContext.ok)
        return { ok: false, value: null, error: companyContext.error };
    const escapedQuery = escapeLikePattern(normalizedQuery);
    const result = queryVaultJsonDetailed(`SELECT ${buildSelectColumns(options?.includeContent ?? false)} FROM prompt_templates WHERE ${buildActiveVisibleTemplatePredicate(companyContext.company)} AND (` +
        `LOWER(name) LIKE '%${escapedQuery}%' ESCAPE '!' OR ` +
        `LOWER(description) LIKE '%${escapedQuery}%' ESCAPE '!' OR ` +
        `LOWER(content) LIKE '%${escapedQuery}%' ESCAPE '!'` +
        `) ORDER BY artifact_kind, control_mode, formalization_level, owner_company, name LIMIT 20`);
    if (!result.ok)
        return result;
    return { ok: true, value: parseTemplateRows(result.value), error: null };
}
function searchTemplates(query, context, options) {
    const result = searchTemplatesDetailed(query, context, options);
    return result.ok ? result.value : [];
}
function tokenizeIntentText(text) {
    return text
        .toLowerCase()
        .split(/[^a-z0-9-]+/)
        .map((token) => token.trim())
        .filter((token) => token.length >= 3)
        .filter((token, index, arr) => arr.indexOf(token) === index)
        .slice(0, 24);
}
function buildIntentPhrases(tokens) {
    const phrases = [];
    for (let i = 0; i < tokens.length - 1; i++)
        phrases.push(`${tokens[i]} ${tokens[i + 1]}`);
    return phrases;
}
function normalizeIntentHaystack(text) {
    return text.toLowerCase().replace(/[-_]+/g, " ");
}
function scoreTemplateIntent(template, intentText) {
    if (!intentText)
        return 0;
    const tokens = tokenizeIntentText(intentText);
    if (tokens.length === 0)
        return 0;
    const haystacks = {
        name: normalizeIntentHaystack(template.name),
        description: normalizeIntentHaystack(template.description || ""),
        content: normalizeIntentHaystack(template.content || ""),
        facets: normalizeIntentHaystack([template.artifact_kind, template.control_mode, template.formalization_level].join(" ")),
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
        if (haystacks.name.includes(phrase))
            score += 30;
        if (haystacks.description.includes(phrase))
            score += 22;
        if (haystacks.content.includes(phrase))
            score += 16;
    }
    for (const token of tokens) {
        if (haystacks.name === token)
            score += 20;
        else if (haystacks.name.includes(token))
            score += 10;
        if (haystacks.description.includes(token))
            score += 8;
        if (haystacks.facets.includes(token))
            score += 6;
        if (haystacks.content.includes(token))
            score += 5;
        if (transformationalTokens.has(token)) {
            if (template.control_mode === "loop")
                score += 14;
            if (template.formalization_level === "workflow")
                score += 12;
            if (template.artifact_kind === "procedure")
                score += 8;
        }
    }
    if (template.description && intent.length > 0) {
        if (haystacks.description.includes(intent))
            score += 18;
        if (haystacks.content.includes(intent))
            score += 12;
    }
    if (/(transcendent|rebuild|dissolve|100x|iteration|iterative|alien)/.test(intent)) {
        if (template.control_mode === "loop")
            score += 20;
        if (template.formalization_level === "workflow")
            score += 16;
        if (template.artifact_kind === "procedure")
            score += 8;
    }
    return score;
}
function compareTemplatesForIntent(a, b, intentText) {
    const scoreDelta = scoreTemplateIntent(b, intentText) - scoreTemplateIntent(a, intentText);
    if (scoreDelta !== 0)
        return scoreDelta;
    const facetDelta = facetLabel(a).localeCompare(facetLabel(b));
    if (facetDelta !== 0)
        return facetDelta;
    const ownerDelta = a.owner_company.localeCompare(b.owner_company);
    if (ownerDelta !== 0)
        return ownerDelta;
    return a.name.localeCompare(b.name);
}
function buildControlledVocabularyClauses(controlledVocabulary) {
    if (!controlledVocabulary)
        return [];
    const clauses = [];
    for (const [dimension, values] of Object.entries(controlledVocabulary)) {
        const normalizedValues = (values || [])
            .map(String)
            .map((v) => v.trim())
            .filter(Boolean);
        if (normalizedValues.length === 0)
            continue;
        if (dimension === "selection_principles") {
            clauses.push(`(${normalizedValues
                .map((value) => `JSON_SEARCH(JSON_EXTRACT(controlled_vocabulary, '$.${dimension}'), 'one', '${escapeSql(value)}') IS NOT NULL`)
                .join(" OR ")})`);
            continue;
        }
        clauses.push(`JSON_UNQUOTE(JSON_EXTRACT(controlled_vocabulary, '$.${escapeSql(dimension)}')) IN (${normalizedValues.map((value) => `'${escapeSql(value)}'`).join(", ")})`);
    }
    return clauses;
}
function queryTemplatesDetailed(filters, limit, includeContent, context) {
    const includeScoringContent = includeContent || Boolean(filters.intent_text);
    const cols = buildSelectColumns(includeScoringContent, false, {
        contentExpression: filters.intent_text && !includeContent ? "LEFT(content, 4096) AS content" : undefined,
    });
    const companyContext = resolveReadCompanyContext(context);
    if (!companyContext.ok)
        return { ok: false, value: null, error: companyContext.error };
    const visibilityCompany = filters.visibility_company || companyContext.company;
    const whereClauses = [buildActiveVisibleTemplatePredicate(visibilityCompany)];
    if (filters.artifact_kind?.length)
        whereClauses.push(`artifact_kind IN (${filters.artifact_kind.map((value) => `'${escapeSql(value)}'`).join(", ")})`);
    if (filters.control_mode?.length)
        whereClauses.push(`control_mode IN (${filters.control_mode.map((value) => `'${escapeSql(value)}'`).join(", ")})`);
    if (filters.formalization_level?.length)
        whereClauses.push(`formalization_level IN (${filters.formalization_level.map((value) => `'${escapeSql(value)}'`).join(", ")})`);
    if (filters.owner_company?.length)
        whereClauses.push(`owner_company IN (${filters.owner_company.map((value) => `'${escapeSql(value)}'`).join(", ")})`);
    whereClauses.push(...buildControlledVocabularyClauses(filters.controlled_vocabulary));
    const effectiveLimit = Number.isFinite(limit)
        ? Math.min(MAX_VAULT_QUERY_LIMIT, Math.max(1, Math.floor(limit)))
        : DEFAULT_VAULT_QUERY_LIMIT;
    const candidatePoolLimit = filters.intent_text
        ? INTENT_RANKING_CANDIDATE_POOL_LIMIT
        : effectiveLimit;
    const result = queryVaultJsonDetailed(`SELECT ${cols} FROM prompt_templates WHERE ${whereClauses.join(" AND ")} ORDER BY artifact_kind, control_mode, formalization_level, owner_company, name LIMIT ${candidatePoolLimit}`);
    if (!result.ok)
        return result;
    return {
        ok: true,
        value: parseTemplateRows(result.value)
            .sort((a, b) => compareTemplatesForIntent(a, b, filters.intent_text))
            .slice(0, effectiveLimit),
        error: null,
    };
}
function queryTemplates(filters, limit, includeContent, context) {
    const result = queryTemplatesDetailed(filters, limit, includeContent, context);
    return result.ok ? result.value : [];
}
function retrieveByNamesDetailed(names, includeContent, context) {
    if (names.length === 0)
        return { ok: true, value: [], error: null };
    const companyContext = resolveReadCompanyContext(context);
    if (!companyContext.ok)
        return { ok: false, value: null, error: companyContext.error };
    const escapedNames = names.map((n) => `'${escapeSql(n)}'`).join(", ");
    const result = queryVaultJsonDetailed(`SELECT ${buildSelectColumns(includeContent, true)} FROM prompt_templates WHERE name IN (${escapedNames}) AND ${buildActiveVisibleTemplatePredicate(companyContext.company)}`);
    if (!result.ok)
        return result;
    return { ok: true, value: parseTemplateRows(result.value), error: null };
}
function retrieveByNames(names, includeContent, context) {
    const result = retrieveByNamesDetailed(names, includeContent, context);
    return result.ok ? result.value : [];
}
function getVocabulary() {
    const contracts = getContracts();
    const vocab = {
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
function insertTemplate(name, content, description, artifactKind, controlMode, formalizationLevel, ownerCompany, visibilityCompanies, controlledVocabulary, context) {
    return executeTemplateInsert(name, content, description, artifactKind, controlMode, formalizationLevel, ownerCompany, visibilityCompanies, controlledVocabulary, context, {
        contracts: getContracts(),
        queryVaultJson,
        execVault,
        execVaultWithRowCount,
        commitVault,
        escapeSql,
        getActiveTemplateByName,
    });
}
function updateTemplate(name, patch, context) {
    return executeTemplateUpdate(name, patch, context, {
        contracts: getContracts(),
        queryVaultJson,
        execVault,
        execVaultWithRowCount,
        commitVault,
        escapeSql,
        getActiveTemplateByName,
    });
}
function rateTemplate(executionId, rating, success, notes, context, options) {
    return executeFeedbackRating(executionId, rating, success, notes, context, options, {
        queryVaultJson,
        queryVaultJsonDetailed,
        execVaultWithRowCount,
        commitVault,
        escapeSql,
        buildVisibilityPredicate,
    });
}
function logExecution(template, model, inputContext) {
    if (!Number.isFinite(template.id)) {
        return { ok: false, message: "Template id is required for execution logging." };
    }
    const escapedContext = escapeSql((inputContext || "").slice(0, 1000));
    const escapedModel = escapeSql(model);
    const entityVersion = Number.isFinite(template.version) ? Number(template.version) : null;
    const createdAt = new Date().toISOString();
    const inserted = execVaultInsertWithId(`
    INSERT INTO executions (entity_type, entity_id, entity_version, input_context, model, success, created_at)
    VALUES (
      'template',
      ${Number(template.id)},
      ${entityVersion == null ? "NULL" : entityVersion},
      '${escapedContext}',
      '${escapedModel}',
      true,
      NOW()
    )
  `);
    if (!inserted || inserted.rowCount !== 1 || !inserted.insertId) {
        return { ok: false, message: "Failed to log template execution." };
    }
    commitVault(`Log template execution: ${Number(template.id)}`, ["executions"]);
    return {
        ok: true,
        executionId: inserted.insertId,
        templateId: Number(template.id),
        entityVersion,
        createdAt,
        model,
        inputContext: String(inputContext || "").slice(0, 1000),
    };
}
function checkSchemaCompatibilityDetailed() {
    return computeSchemaCompatibilityDetailed(queryVaultJson);
}
function checkSchemaVersion() {
    return computeSchemaVersion(queryVaultJson);
}
export function createVaultRuntime() {
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
        buildActiveVisibleTemplatePredicate,
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

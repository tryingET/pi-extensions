import { execFileSync } from "node:child_process";
import { accessSync, appendFileSync, constants, existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, statSync, writeFileSync, } from "node:fs";
import os from "node:os";
import path, { join } from "node:path";
import { resolveCompanyContext } from "./companyContext.js";
import { rateTemplate as executeFeedbackRating } from "./vaultFeedback.js";
import { authorizeTemplateInsert, authorizeTemplateUpdate, insertTemplate as executeTemplateInsert, updateTemplate as executeTemplateUpdate, prepareTemplateUpdate, resolveMutationActorContext, validateTemplateContent, } from "./vaultMutations.js";
import { checkSchemaCompatibilityDetailed as computeSchemaCompatibilityDetailed, checkSchemaVersion as computeSchemaVersion, } from "./vaultSchema.js";
import { ARTIFACT_KINDS, COMPANIES, CONTROL_MODES, CONTROLLED_VOCABULARY_DIMENSIONS, DEFAULT_VAULT_QUERY_LIMIT, DOLT_TELEMETRY_LIMIT, FORMALIZATION_LEVELS, INTENT_RANKING_CANDIDATE_POOL_LIMIT, MAX_VAULT_QUERY_LIMIT, PROMPT_VAULT_ROOT, VAULT_DIR, } from "./vaultTypes.js";
export { authorizeTemplateInsert, authorizeTemplateUpdate, prepareTemplateUpdate, resolveMutationActorContext, validateTemplateContent, };
const DEFAULT_DOLT_MAX_BUFFER = 64 * 1024 * 1024;
const DEFAULT_DOLT_TIMEOUT_MS = 30_000;
const MAX_DOLT_TIMEOUT_MS = 5 * 60_000;
let cachedContracts = null;
let cachedContractsKey = null;
function createDoltTelemetryState() {
    return {
        events: [],
        totalCalls: 0,
        successCount: 0,
        failureCount: 0,
        totalLatencyMs: 0,
        maxLatencyMs: 0,
        commandCounts: {},
        tempSourceCounts: {},
    };
}
const doltTelemetry = createDoltTelemetryState();
function detectSqlVerb(sql) {
    const normalized = sql
        .replace(/^\s*(?:--.*(?:\n|$)|\/\*[\s\S]*?\*\/\s*)*/g, "")
        .trim()
        .toLowerCase();
    const match = normalized.match(/^([a-z_]+)/);
    return match?.[1] || "unknown";
}
function classifyDoltCommand(args) {
    const primary = String(args[0] || "unknown").trim() || "unknown";
    if (primary !== "sql") {
        return {
            command: primary,
            argsPreview: args.map(String).join(" ").slice(0, 240),
        };
    }
    const queryIndex = args.indexOf("-q");
    const sql = queryIndex >= 0 ? String(args[queryIndex + 1] || "") : "";
    const sqlVerb = detectSqlVerb(sql);
    const compactSql = sql.replace(/\s+/g, " ").trim().slice(0, 240);
    return {
        command: `sql:${sqlVerb}`,
        argsPreview: compactSql || args.map(String).join(" ").slice(0, 240),
    };
}
function extractExecExitCode(error) {
    if (typeof error !== "object" || error === null || !("status" in error)) {
        return undefined;
    }
    const status = error.status;
    if (typeof status === "number")
        return status;
    if (status === null)
        return null;
    return undefined;
}
function recordDoltTelemetryEvent(event) {
    const normalized = {
        timestamp: String(event.timestamp || new Date().toISOString()),
        command: String(event.command || "unknown"),
        argsPreview: String(event.argsPreview || ""),
        durationMs: Math.max(0, Number(event.durationMs || 0)),
        success: Boolean(event.success),
        tempSource: String(event.tempSource || "unknown"),
        tempDir: String(event.tempDir || ""),
        ...(event.exitCode !== undefined ? { exitCode: event.exitCode } : {}),
        ...(event.error ? { error: String(event.error) } : {}),
    };
    doltTelemetry.totalCalls += 1;
    doltTelemetry.totalLatencyMs += normalized.durationMs;
    doltTelemetry.maxLatencyMs = Math.max(doltTelemetry.maxLatencyMs, normalized.durationMs);
    if (normalized.success)
        doltTelemetry.successCount += 1;
    else
        doltTelemetry.failureCount += 1;
    doltTelemetry.commandCounts[normalized.command] =
        (doltTelemetry.commandCounts[normalized.command] || 0) + 1;
    doltTelemetry.tempSourceCounts[normalized.tempSource] =
        (doltTelemetry.tempSourceCounts[normalized.tempSource] || 0) + 1;
    doltTelemetry.events.push(normalized);
    if (doltTelemetry.events.length > DOLT_TELEMETRY_LIMIT) {
        doltTelemetry.events.splice(0, doltTelemetry.events.length - DOLT_TELEMETRY_LIMIT);
    }
}
function listRecentDoltTelemetry(limit = 20) {
    const normalizedLimit = Math.max(1, Math.min(Math.floor(Number(limit) || 20), DOLT_TELEMETRY_LIMIT));
    return doltTelemetry.events.slice(-normalizedLimit);
}
function getLatestDoltTelemetryFailure() {
    for (let index = doltTelemetry.events.length - 1; index >= 0; index -= 1) {
        const event = doltTelemetry.events[index];
        if (event && !event.success) {
            return event;
        }
    }
    return null;
}
function getDoltTelemetryStats() {
    return {
        totalCalls: doltTelemetry.totalCalls,
        successCount: doltTelemetry.successCount,
        failureCount: doltTelemetry.failureCount,
        retainedEvents: doltTelemetry.events.length,
        averageLatencyMs: doltTelemetry.totalCalls > 0 ? doltTelemetry.totalLatencyMs / doltTelemetry.totalCalls : 0,
        maxLatencyMs: doltTelemetry.maxLatencyMs,
        commandCounts: { ...doltTelemetry.commandCounts },
        tempSourceCounts: { ...doltTelemetry.tempSourceCounts },
    };
}
function summarizeDoltTelemetry() {
    const stats = getDoltTelemetryStats();
    const recent = listRecentDoltTelemetry(15);
    const commandCounts = Object.entries(stats.commandCounts)
        .sort((left, right) => right[1] - left[1] || left[0].localeCompare(right[0]))
        .map(([command, count]) => `${command}=${count}`)
        .join(", ");
    const tempSourceCounts = Object.entries(stats.tempSourceCounts)
        .sort((left, right) => right[1] - left[1] || left[0].localeCompare(right[0]))
        .map(([source, count]) => `${source}=${count}`)
        .join(", ");
    const latestFailure = getLatestDoltTelemetryFailure();
    const lines = [
        "# Vault Dolt Telemetry",
        "",
        `- total_calls: ${stats.totalCalls}`,
        `- success_count: ${stats.successCount}`,
        `- failure_count: ${stats.failureCount}`,
        `- retained_events: ${stats.retainedEvents}`,
        `- average_latency_ms: ${stats.averageLatencyMs.toFixed(1)}`,
        `- max_latency_ms: ${stats.maxLatencyMs.toFixed(1)}`,
        `- command_mix: ${commandCounts || "none"}`,
        `- temp_source_mix: ${tempSourceCounts || "none"}`,
        `- latest_failure: ${latestFailure ? [latestFailure.timestamp, latestFailure.command, latestFailure.exitCode !== undefined ? `exit=${latestFailure.exitCode}` : undefined, latestFailure.error ? String(latestFailure.error).replace(/\s+/g, " ").trim().slice(0, 160) : undefined].filter(Boolean).join(" | ") : "none recorded"}`,
        "",
        "## Recent events",
    ];
    if (recent.length === 0) {
        lines.push("_No Dolt telemetry recorded yet._");
    }
    else {
        for (const event of recent) {
            const parts = [
                event.timestamp,
                event.success ? "ok" : "error",
                event.command,
                `${event.durationMs.toFixed(1)}ms`,
                `temp=${event.tempSource}`,
            ];
            if (event.exitCode !== undefined)
                parts.push(`exit=${event.exitCode}`);
            if (event.error)
                parts.push(`error=${event.error}`);
            if (event.argsPreview)
                parts.push(`args=${event.argsPreview}`);
            lines.push(`- ${parts.join(" | ")}`);
        }
    }
    return lines.join("\n");
}
function formatVaultError(error) {
    return error instanceof Error ? error.message : String(error);
}
function shouldEmitVaultDiagnosticLogs() {
    const value = process.env.PI_VAULT_LOG_ERRORS?.trim().toLowerCase();
    return value === "1" || value === "true" || value === "yes" || value === "on";
}
function emitVaultDiagnostic(label, error) {
    if (!shouldEmitVaultDiagnosticLogs())
        return;
    console.warn(`${label}: ${formatVaultError(error)}`);
}
function getActiveVaultDir() {
    return process.env.VAULT_DIR?.trim() || VAULT_DIR;
}
function normalizeTempDirPath(tempDir) {
    return path.resolve(String(tempDir || "").trim());
}
function dedupeTempDirCandidates(candidates) {
    const seen = new Set();
    return candidates.filter((candidate) => {
        if (seen.has(candidate.path))
            return false;
        seen.add(candidate.path);
        return true;
    });
}
function buildDoltTempDirCandidates() {
    const explicitTempDir = process.env.PI_VAULT_TMPDIR?.trim();
    return dedupeTempDirCandidates([
        explicitTempDir
            ? {
                source: "env:PI_VAULT_TMPDIR",
                path: normalizeTempDirPath(explicitTempDir),
                create: true,
            }
            : null,
        {
            source: "vault:.dolt/tmp",
            path: normalizeTempDirPath(path.join(getActiveVaultDir(), ".dolt", "tmp")),
            create: false,
        },
        {
            source: "vault:.tmp",
            path: normalizeTempDirPath(path.join(getActiveVaultDir(), ".tmp")),
            create: true,
        },
        {
            source: "os.tmpdir()",
            path: normalizeTempDirPath(os.tmpdir()),
            create: false,
        },
    ].filter((candidate) => Boolean(candidate)));
}
function assertWritableDirectory(dirPath) {
    accessSync(dirPath, constants.R_OK | constants.W_OK | constants.X_OK);
}
function findNearestExistingDirectory(dirPath) {
    let current = normalizeTempDirPath(dirPath);
    while (true) {
        if (existsSync(current)) {
            const stat = statSync(current);
            if (!stat.isDirectory()) {
                throw new Error(`Not a directory: ${current}`);
            }
            return current;
        }
        const parent = path.dirname(current);
        if (parent === current) {
            throw new Error(`No existing ancestor directory for ${dirPath}`);
        }
        current = parent;
    }
}
function probeDoltTempDir(candidate, probeMode) {
    const existedBefore = existsSync(candidate.path);
    if (!existedBefore && !candidate.create) {
        throw new Error(`Directory does not exist: ${candidate.path}`);
    }
    if (probeMode === "inspect") {
        if (existedBefore) {
            assertWritableDirectory(candidate.path);
            return {
                source: candidate.source,
                path: candidate.path,
                ok: true,
            };
        }
        const parentDir = findNearestExistingDirectory(path.dirname(candidate.path));
        assertWritableDirectory(parentDir);
        return {
            source: candidate.source,
            path: candidate.path,
            ok: true,
            wouldCreate: true,
        };
    }
    if (candidate.create && !existedBefore) {
        mkdirSync(candidate.path, { recursive: true });
    }
    assertWritableDirectory(candidate.path);
    const probePath = mkdtempSync(path.join(candidate.path, "pi-vault-dolt-"));
    rmSync(probePath, { recursive: true, force: true });
    return {
        source: candidate.source,
        path: candidate.path,
        ok: true,
        created: candidate.create && !existedBefore,
    };
}
function formatDoltExecutionEnvironmentError(attempts, probeMode) {
    const details = attempts
        .map((attempt) => {
        const status = attempt.ok
            ? attempt.created
                ? "ok-created"
                : attempt.wouldCreate
                    ? "ok-would-create"
                    : "ok"
            : `error=${attempt.error || "unknown"}`;
        return `${attempt.source} (${attempt.path}) -> ${status}`;
    })
        .join("; ");
    return `Failed to resolve writable temp dir for dolt (probeMode=${probeMode}, VAULT_DIR=${getActiveVaultDir()}). Tried: ${details}`;
}
function resolveDoltExecutionEnvironment(options = {}) {
    const probeMode = options.probeMode ?? "prepare";
    const attempts = [];
    for (const candidate of buildDoltTempDirCandidates()) {
        try {
            const probe = probeDoltTempDir(candidate, probeMode);
            attempts.push(probe);
            return {
                tempDir: candidate.path,
                source: candidate.source,
                probeMode,
                attempts,
            };
        }
        catch (error) {
            attempts.push({
                source: candidate.source,
                path: candidate.path,
                ok: false,
                error: formatVaultError(error),
            });
        }
    }
    throw new Error(formatDoltExecutionEnvironmentError(attempts, probeMode));
}
function readHostDoltGlobalConfig() {
    const hostHome = process.env.HOME?.trim() || os.homedir();
    const configPath = path.join(hostHome, ".dolt", "config_global.json");
    if (!existsSync(configPath)) {
        return {};
    }
    try {
        const parsed = JSON.parse(readFileSync(configPath, "utf-8"));
        return Object.fromEntries(Object.entries(parsed).filter((entry) => typeof entry[1] === "string"));
    }
    catch {
        return {};
    }
}
function ensureDoltProcessHome(tempDir) {
    const processHome = path.join(normalizeTempDirPath(tempDir), "pi-vault-dolt-home");
    const processDoltDir = path.join(processHome, ".dolt");
    mkdirSync(processDoltDir, { recursive: true });
    const configPath = path.join(processDoltDir, "config_global.json");
    const nextConfig = {
        ...readHostDoltGlobalConfig(),
        "metrics.disabled": "true",
    };
    const nextConfigJson = `${JSON.stringify(nextConfig)}\n`;
    const currentConfigJson = existsSync(configPath) ? readFileSync(configPath, "utf-8") : null;
    if (currentConfigJson !== nextConfigJson) {
        writeFileSync(configPath, nextConfigJson, "utf-8");
    }
    const hostHome = process.env.HOME?.trim() || os.homedir();
    for (const passthroughFile of ["disable_version_check.txt", "version_check.txt"]) {
        const sourcePath = path.join(hostHome, ".dolt", passthroughFile);
        if (!existsSync(sourcePath))
            continue;
        const destinationPath = path.join(processDoltDir, passthroughFile);
        const sourceContent = readFileSync(sourcePath);
        const destinationContent = existsSync(destinationPath) ? readFileSync(destinationPath) : null;
        if (!destinationContent || !destinationContent.equals(sourceContent)) {
            writeFileSync(destinationPath, sourceContent);
        }
    }
    return processHome;
}
function buildDoltProcessEnv(tempDir) {
    return {
        ...process.env,
        HOME: ensureDoltProcessHome(tempDir),
        TMPDIR: tempDir,
        TMP: tempDir,
        TEMP: tempDir,
    };
}
export function resolveDoltTimeoutMs(value = process.env.PI_VAULT_DOLT_TIMEOUT_MS) {
    if (!value || !/^[1-9]\d*$/.test(value.trim()))
        return DEFAULT_DOLT_TIMEOUT_MS;
    const parsed = Number(value);
    return Number.isSafeInteger(parsed)
        ? Math.min(parsed, MAX_DOLT_TIMEOUT_MS)
        : DEFAULT_DOLT_TIMEOUT_MS;
}
function isDoltTimeoutError(error) {
    if (!error || typeof error !== "object")
        return false;
    const record = error;
    return record.code === "ETIMEDOUT" || record.signal === "SIGTERM" || record.killed === true;
}
function runDolt(args, maxBuffer = DEFAULT_DOLT_MAX_BUFFER) {
    const doltExecutionEnvironment = resolveDoltExecutionEnvironment({ probeMode: "prepare" });
    const startedAt = Date.now();
    const commandShape = classifyDoltCommand(args);
    try {
        const result = execFileSync("dolt", args, {
            cwd: getActiveVaultDir(),
            encoding: "utf-8",
            maxBuffer,
            timeout: resolveDoltTimeoutMs(),
            killSignal: "SIGTERM",
            env: buildDoltProcessEnv(doltExecutionEnvironment.tempDir),
            stdio: ["pipe", "pipe", "pipe"],
        });
        recordDoltTelemetryEvent({
            command: commandShape.command,
            argsPreview: commandShape.argsPreview,
            durationMs: Date.now() - startedAt,
            success: true,
            tempSource: doltExecutionEnvironment.source,
            tempDir: doltExecutionEnvironment.tempDir,
        });
        return result;
    }
    catch (error) {
        recordDoltTelemetryEvent({
            command: commandShape.command,
            argsPreview: commandShape.argsPreview,
            durationMs: Date.now() - startedAt,
            success: false,
            tempSource: doltExecutionEnvironment.source,
            tempDir: doltExecutionEnvironment.tempDir,
            exitCode: extractExecExitCode(error),
            error: formatVaultError(error),
        });
        const timeoutDetail = isDoltTimeoutError(error)
            ? `Dolt command timed out after ${resolveDoltTimeoutMs()}ms (${commandShape.command}).\n`
            : "";
        throw new Error(`${timeoutDetail}${formatVaultError(error)}\nDolt temp dir: ${doltExecutionEnvironment.tempDir} (${doltExecutionEnvironment.source})`, {
            cause: error instanceof Error ? error : undefined,
        });
    }
}
function queryVaultJsonDetailed(sql) {
    try {
        const result = runDolt(["sql", "-r", "json", "-q", sql]);
        return { ok: true, value: JSON.parse(result), error: null };
    }
    catch (error) {
        const message = formatVaultError(error);
        emitVaultDiagnostic("Vault query error", error);
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
        emitVaultDiagnostic("Vault exec error", e);
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
        emitVaultDiagnostic("Vault exec error", e);
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
        emitVaultDiagnostic("Vault exec error", e);
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
        id: typeof row.id === "number"
            ? row.id
            : typeof row.id === "string" && row.id.trim() !== "" && Number.isFinite(Number(row.id))
                ? Number(row.id)
                : undefined,
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
        version: typeof row.version === "number"
            ? row.version
            : typeof row.version === "string" &&
                row.version.trim() !== "" &&
                Number.isFinite(Number(row.version))
                ? Number(row.version)
                : undefined,
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
    catch (error) {
        throw new Error(`Invalid governed contract JSON at ${path}: ${formatVaultError(error) || "parse failure"}`);
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
    let defaultCompany = "core";
    try {
        defaultCompany = getContracts().companyVisibility.defaults?.owner_company || "core";
    }
    catch {
        defaultCompany = "core";
    }
    return resolveCompanyContext({
        cwd,
        defaultCompany,
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
        `${qualifyTemplateColumn("export_to_pi", alias)} = true`,
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
        const rawValues = Array.isArray(values) ? values : [];
        const normalizedValues = rawValues
            .map((value) => String(value).trim())
            .filter((value) => value.length > 0);
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
    const cols = buildSelectColumns(includeScoringContent, true, {
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
function describeRetrievalFailure(error) {
    const message = error instanceof Error ? error.message : String(error);
    return `retrieval-log-failed: ${message.slice(0, 200)}`;
}
function logRetrievalBatch(entries, context) {
    // Retrieval analytics are best-effort by contract: a logging failure must
    // never break the tool call that produced the retrieval. Schema v10+.
    try {
        const valid = entries.filter((entry) => Number.isFinite(entry.templateId));
        if (valid.length === 0)
            return;
        const tool = context.tool === "vault_query" || context.tool === "vault_retrieve" ? context.tool : "other";
        const escapedQueryContext = escapeSql(JSON.stringify(context.queryContext ?? null).slice(0, 1000));
        const resultCount = Number.isFinite(context.resultCount) ? Number(context.resultCount) : null;
        const escapedCompany = escapeSql(String(context.company ?? ""));
        const values = valid
            .map((entry) => {
            const version = Number.isFinite(entry.entityVersion) ? Number(entry.entityVersion) : null;
            const rank = Number.isFinite(entry.rank) ? Number(entry.rank) : null;
            return `('template', ${Number(entry.templateId)}, ${version ?? "NULL"}, '${tool}', '${escapedQueryContext}', ${rank ?? "NULL"}, ${resultCount ?? "NULL"}, ${escapedCompany.length > 0 ? `'${escapedCompany}'` : "NULL"}, NOW())`;
        })
            .join(", ");
        const ok = execVault(`INSERT INTO retrievals (entity_type, entity_id, entity_version, tool, query_context, selected_rank, result_count, company, created_at) VALUES ${values}`);
        if (ok)
            commitVault(`Log ${valid.length} vault retrieval(s): ${tool}`, ["retrievals"]);
    }
    catch (error) {
        // fail-open: retrieval analytics must not perturb the retrieval surface,
        // but failures are recorded locally so systematic loss is detectable.
        try {
            appendFileSync(join(os.homedir(), ".pi/agent/state/pi-vault-client/vault-retrieval-failures.jsonl"), `${new Date().toISOString()} ${describeRetrievalFailure(error)}\n`);
        }
        catch {
            // last-resort: nothing more we can do without perturbing the tool call
        }
    }
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
    INSERT INTO executions (
      entity_type,
      entity_id,
      entity_version,
      input_context,
      model,
      output_capture_mode,
      output_text,
      success,
      created_at
    )
    VALUES (
      'template',
      ${Number(template.id)},
      ${entityVersion == null ? "NULL" : entityVersion},
      '${escapedContext}',
      '${escapedModel}',
      'none',
      NULL,
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
function getDoltExecutionEnvironment(options = {}) {
    return resolveDoltExecutionEnvironment(options);
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
        logRetrievalBatch,
        getDoltExecutionEnvironment,
        listRecentDoltTelemetry,
        getLatestDoltTelemetryFailure,
        summarizeDoltTelemetry,
        getDoltTelemetryStats,
        checkSchemaCompatibilityDetailed,
        checkSchemaVersion,
    };
}

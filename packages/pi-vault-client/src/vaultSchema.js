import { SCHEMA_VERSION, } from "./vaultTypes.js";
export const REQUIRED_PROMPT_TEMPLATE_COLUMNS = [
    "artifact_kind",
    "control_mode",
    "formalization_level",
    "owner_company",
    "visibility_companies",
    "controlled_vocabulary",
    "export_to_pi",
    "version",
];
export const REQUIRED_EXECUTION_COLUMNS = [
    "id",
    "entity_type",
    "entity_id",
    "entity_version",
    "input_context",
    "model",
    "output_capture_mode",
    "output_text",
    "success",
];
export const REQUIRED_FEEDBACK_COLUMNS = ["execution_id", "rating", "notes", "issues"];
function getPresentColumns(queryVaultJson, tableName) {
    const columns = queryVaultJson(`SHOW COLUMNS FROM ${tableName}`);
    return new Set((columns?.rows || []).map((row) => String(row.Field || "")));
}
function getMissingColumns(required, present) {
    return required.filter((column) => !present.has(column));
}
export function checkSchemaCompatibilityDetailed(queryVaultJson) {
    const versionResult = queryVaultJson("SELECT MAX(version) AS version FROM schema_version");
    const rawVersion = versionResult?.rows?.[0]?.version;
    const actualVersion = Number.isFinite(Number(rawVersion)) ? Number(rawVersion) : null;
    const promptTemplatePresent = getPresentColumns(queryVaultJson, "prompt_templates");
    const executionPresent = getPresentColumns(queryVaultJson, "executions");
    const feedbackPresent = getPresentColumns(queryVaultJson, "feedback");
    const missingPromptTemplateColumns = getMissingColumns(REQUIRED_PROMPT_TEMPLATE_COLUMNS, promptTemplatePresent);
    const missingExecutionColumns = getMissingColumns(REQUIRED_EXECUTION_COLUMNS, executionPresent);
    const missingFeedbackColumns = getMissingColumns(REQUIRED_FEEDBACK_COLUMNS, feedbackPresent);
    return {
        ok: actualVersion === SCHEMA_VERSION &&
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
export function checkSchemaVersion(queryVaultJson) {
    return checkSchemaCompatibilityDetailed(queryVaultJson).ok;
}

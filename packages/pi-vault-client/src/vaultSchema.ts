import {
  ANALYTICS_SCHEMA_VERSION,
  COMPATIBILITY_EPOCH_INTRODUCED_SCHEMA_VERSION,
  MAX_TESTED_SCHEMA_VERSION,
  MIN_SUPPORTED_SCHEMA_VERSION,
  REQUIRED_EXECUTION_COLUMNS,
  REQUIRED_FEEDBACK_COLUMNS,
  REQUIRED_PROMPT_TEMPLATE_COLUMNS,
  SUPPORTED_COMPATIBILITY_EPOCH,
} from "./generatedPromptVaultContract.js";
import type { DoltJsonResult, SchemaCompatibilityReport } from "./vaultTypes.js";

export {
  REQUIRED_EXECUTION_COLUMNS,
  REQUIRED_FEEDBACK_COLUMNS,
  REQUIRED_PROMPT_TEMPLATE_COLUMNS,
} from "./generatedPromptVaultContract.js";

function getPresentColumns(
  queryVaultJson: (sql: string) => DoltJsonResult | null,
  tableName: string,
): Set<string> {
  const columns = queryVaultJson(`SHOW COLUMNS FROM ${tableName}`);
  return new Set((columns?.rows || []).map((row) => String(row.Field || "")));
}

function getMissingColumns(required: readonly string[], present: Set<string>): string[] {
  return required.filter((column) => !present.has(column));
}

function numericOrNull(value: unknown): number | null {
  return Number.isFinite(Number(value)) ? Number(value) : null;
}

function readActualContractVersions(
  queryVaultJson: (sql: string) => DoltJsonResult | null,
  actualVersion: number | null,
): { epoch: number | null; analytics: number | null } {
  if (actualVersion === null) return { epoch: null, analytics: null };

  // v9-v12 predate the explicit table but belong to compatibility epoch 1.
  // The migration introducing the table is non-breaking and records that
  // legacy default explicitly for all later versions.
  if (actualVersion < COMPATIBILITY_EPOCH_INTRODUCED_SCHEMA_VERSION) {
    return {
      epoch: SUPPORTED_COMPATIBILITY_EPOCH,
      analytics: ANALYTICS_SCHEMA_VERSION,
    };
  }

  try {
    const result = queryVaultJson(
      "SELECT compatibility_epoch, analytics_schema_version FROM schema_contract WHERE id = 1",
    );
    const row = result?.rows?.[0];
    return {
      epoch: numericOrNull(row?.compatibility_epoch),
      analytics: numericOrNull(row?.analytics_schema_version),
    };
  } catch {
    return { epoch: null, analytics: null };
  }
}

export function checkSchemaCompatibilityDetailed(
  queryVaultJson: (sql: string) => DoltJsonResult | null,
): SchemaCompatibilityReport {
  const versionResult = queryVaultJson("SELECT MAX(version) AS version FROM schema_version");
  const actualVersion = numericOrNull(versionResult?.rows?.[0]?.version);
  const versionStatus =
    actualVersion === null
      ? "unknown"
      : actualVersion < MIN_SUPPORTED_SCHEMA_VERSION
        ? "too_old"
        : actualVersion > MAX_TESTED_SCHEMA_VERSION
          ? "newer_untested"
          : "compatible";

  const promptTemplatePresent = getPresentColumns(queryVaultJson, "prompt_templates");
  const executionPresent = getPresentColumns(queryVaultJson, "executions");
  const feedbackPresent = getPresentColumns(queryVaultJson, "feedback");
  const missingPromptTemplateColumns = getMissingColumns(
    REQUIRED_PROMPT_TEMPLATE_COLUMNS,
    promptTemplatePresent,
  );
  const missingExecutionColumns = getMissingColumns(REQUIRED_EXECUTION_COLUMNS, executionPresent);
  const missingFeedbackColumns = getMissingColumns(REQUIRED_FEEDBACK_COLUMNS, feedbackPresent);

  const actualContract = readActualContractVersions(queryVaultJson, actualVersion);
  const compatibilityEpochStatus =
    actualContract.epoch === null
      ? "unknown"
      : actualContract.epoch === SUPPORTED_COMPATIBILITY_EPOCH
        ? "compatible"
        : "mismatch";
  const analyticsSchemaStatus =
    actualContract.analytics === null
      ? "unknown"
      : actualContract.analytics === ANALYTICS_SCHEMA_VERSION
        ? "compatible"
        : "mismatch";

  const warnings: string[] = [];
  if (versionStatus === "newer_untested") {
    warnings.push(
      `Schema v${actualVersion} is newer than tested v${MAX_TESTED_SCHEMA_VERSION}; required structural contract is present.`,
    );
  }
  if (compatibilityEpochStatus === "unknown") {
    warnings.push("Compatibility epoch could not be determined.");
  }
  if (analyticsSchemaStatus === "unknown") {
    warnings.push("Analytics schema contract version could not be determined.");
  }

  return {
    ok:
      actualVersion !== null &&
      actualVersion >= MIN_SUPPORTED_SCHEMA_VERSION &&
      compatibilityEpochStatus === "compatible" &&
      analyticsSchemaStatus === "compatible" &&
      missingPromptTemplateColumns.length === 0 &&
      missingExecutionColumns.length === 0 &&
      missingFeedbackColumns.length === 0,
    minimumVersion: MIN_SUPPORTED_SCHEMA_VERSION,
    maximumTestedVersion: MAX_TESTED_SCHEMA_VERSION,
    expectedVersion: MIN_SUPPORTED_SCHEMA_VERSION,
    actualVersion,
    versionStatus,
    supportedCompatibilityEpoch: SUPPORTED_COMPATIBILITY_EPOCH,
    actualCompatibilityEpoch: actualContract.epoch,
    compatibilityEpochStatus,
    analyticsSchemaVersion: ANALYTICS_SCHEMA_VERSION,
    actualAnalyticsSchemaVersion: actualContract.analytics,
    analyticsSchemaStatus,
    warnings,
    missingPromptTemplateColumns,
    missingExecutionColumns,
    missingFeedbackColumns,
  };
}

export function checkSchemaVersion(
  queryVaultJson: (sql: string) => DoltJsonResult | null,
): boolean {
  return checkSchemaCompatibilityDetailed(queryVaultJson).ok;
}

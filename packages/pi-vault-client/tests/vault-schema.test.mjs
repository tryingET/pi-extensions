import assert from "node:assert/strict";
import test from "node:test";
import { withTranspiledModuleHarness } from "./helpers/transpiled-module-harness.mjs";

const VAULT_SCHEMA_FILES = [
  "src/generatedPromptVaultContract.ts",
  "src/vaultSchema.ts",
  "src/vaultTypes.ts",
];

const PROMPT_COLUMNS = [
  "artifact_kind",
  "control_mode",
  "formalization_level",
  "owner_company",
  "visibility_companies",
  "controlled_vocabulary",
  "export_to_pi",
  "version",
];
const EXECUTION_COLUMNS = [
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
const FEEDBACK_COLUMNS = ["execution_id", "rating", "notes", "issues"];

function makeColumns(...columns) {
  return { rows: columns.map((column) => ({ Field: column })) };
}

function makeQuery({
  version = 13,
  epoch = 1,
  analytics = 1,
  promptColumns = PROMPT_COLUMNS,
  executionColumns = EXECUTION_COLUMNS,
  feedbackColumns = FEEDBACK_COLUMNS,
} = {}) {
  return (sql) => {
    if (sql === "SELECT MAX(version) AS version FROM schema_version") {
      return { rows: [{ version }] };
    }
    if (
      sql ===
      "SELECT compatibility_epoch, analytics_schema_version FROM schema_contract WHERE id = 1"
    ) {
      return { rows: [{ compatibility_epoch: epoch, analytics_schema_version: analytics }] };
    }
    if (sql === "SHOW COLUMNS FROM prompt_templates") return makeColumns(...promptColumns);
    if (sql === "SHOW COLUMNS FROM executions") return makeColumns(...executionColumns);
    if (sql === "SHOW COLUMNS FROM feedback") return makeColumns(...feedbackColumns);
    throw new Error(`unexpected query: ${sql}`);
  };
}

async function withSchemaModule(callback) {
  return withTranspiledModuleHarness(
    { prefix: "vault-schema-", files: VAULT_SCHEMA_FILES },
    async ({ importModule }) => callback(await importModule("src/vaultSchema.js")),
  );
}

test("schema helper reports compatible for owner schema v13", async () => {
  await withSchemaModule(({ checkSchemaCompatibilityDetailed, checkSchemaVersion }) => {
    const query = makeQuery();
    assert.deepEqual(checkSchemaCompatibilityDetailed(query), {
      ok: true,
      minimumVersion: 9,
      maximumTestedVersion: 13,
      expectedVersion: 9,
      actualVersion: 13,
      versionStatus: "compatible",
      supportedCompatibilityEpoch: 1,
      actualCompatibilityEpoch: 1,
      compatibilityEpochStatus: "compatible",
      analyticsSchemaVersion: 1,
      actualAnalyticsSchemaVersion: 1,
      analyticsSchemaStatus: "compatible",
      warnings: [],
      missingPromptTemplateColumns: [],
      missingExecutionColumns: [],
      missingFeedbackColumns: [],
    });
    assert.equal(checkSchemaVersion(query), true);
  });
});

test("schema helper rejects versions below the minimum and reports missing structure", async () => {
  await withSchemaModule(({ checkSchemaCompatibilityDetailed, checkSchemaVersion }) => {
    const query = makeQuery({
      version: 8,
      promptColumns: ["artifact_kind", "control_mode", "formalization_level", "owner_company"],
      executionColumns: ["id", "entity_type", "entity_id", "model"],
      feedbackColumns: ["rating"],
    });
    const report = checkSchemaCompatibilityDetailed(query);
    assert.equal(report.ok, false);
    assert.equal(report.minimumVersion, 9);
    assert.equal(report.actualVersion, 8);
    assert.equal(report.versionStatus, "too_old");
    assert.equal(report.compatibilityEpochStatus, "compatible");
    assert.deepEqual(report.missingPromptTemplateColumns, [
      "visibility_companies",
      "controlled_vocabulary",
      "export_to_pi",
      "version",
    ]);
    assert.deepEqual(report.missingExecutionColumns, [
      "entity_version",
      "input_context",
      "output_capture_mode",
      "output_text",
      "success",
    ]);
    assert.deepEqual(report.missingFeedbackColumns, ["execution_id", "notes", "issues"]);
    assert.equal(checkSchemaVersion(query), false);
  });
});

test("hypothetical v14 remains usable when epoch and required structure are compatible", async () => {
  await withSchemaModule(({ checkSchemaCompatibilityDetailed }) => {
    const report = checkSchemaCompatibilityDetailed(makeQuery({ version: 14 }));
    assert.equal(report.ok, true);
    assert.equal(report.versionStatus, "newer_untested");
    assert.equal(report.actualCompatibilityEpoch, 1);
    assert.match(report.warnings[0], /newer than tested v13/);
  });
});

test("high migration version still fails closed when required structure is missing", async () => {
  await withSchemaModule(({ checkSchemaCompatibilityDetailed }) => {
    const report = checkSchemaCompatibilityDetailed(
      makeQuery({
        version: 99,
        executionColumns: EXECUTION_COLUMNS.filter((c) => c !== "output_text"),
      }),
    );
    assert.equal(report.ok, false);
    assert.equal(report.versionStatus, "newer_untested");
    assert.deepEqual(report.missingExecutionColumns, ["output_text"]);
  });
});

test("breaking compatibility epoch or analytics version mismatch fails closed", async () => {
  await withSchemaModule(({ checkSchemaCompatibilityDetailed }) => {
    const epochMismatch = checkSchemaCompatibilityDetailed(makeQuery({ epoch: 2 }));
    assert.equal(epochMismatch.ok, false);
    assert.equal(epochMismatch.compatibilityEpochStatus, "mismatch");

    const analyticsMismatch = checkSchemaCompatibilityDetailed(makeQuery({ analytics: 2 }));
    assert.equal(analyticsMismatch.ok, false);
    assert.equal(analyticsMismatch.analyticsSchemaStatus, "mismatch");
  });
});

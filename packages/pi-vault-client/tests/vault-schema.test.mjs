import assert from "node:assert/strict";
import test from "node:test";
import { withTranspiledModuleHarness } from "./helpers/transpiled-module-harness.mjs";

const VAULT_SCHEMA_FILES = ["src/vaultSchema.ts", "src/vaultTypes.ts"];

function makeColumns(...columns) {
  return {
    rows: columns.map((column) => ({ Field: column })),
  };
}

test("schema helper reports ok when version and required columns match", async () => {
  await withTranspiledModuleHarness(
    {
      prefix: "vault-schema-",
      files: VAULT_SCHEMA_FILES,
    },
    async ({ importModule }) => {
      const { checkSchemaCompatibilityDetailed, checkSchemaVersion } =
        await importModule("src/vaultSchema.js");
      const report = checkSchemaCompatibilityDetailed((sql) => {
        if (sql === "SELECT MAX(version) AS version FROM schema_version") {
          return { rows: [{ version: 9 }] };
        }
        if (sql === "SHOW COLUMNS FROM prompt_templates") {
          return makeColumns(
            "artifact_kind",
            "control_mode",
            "formalization_level",
            "owner_company",
            "visibility_companies",
            "controlled_vocabulary",
            "export_to_pi",
            "version",
          );
        }
        if (sql === "SHOW COLUMNS FROM executions") {
          return makeColumns(
            "id",
            "entity_type",
            "entity_id",
            "entity_version",
            "input_context",
            "model",
            "output_capture_mode",
            "output_text",
            "success",
          );
        }
        if (sql === "SHOW COLUMNS FROM feedback") {
          return makeColumns("execution_id", "rating", "notes", "issues");
        }
        throw new Error(`unexpected query: ${sql}`);
      });

      assert.deepEqual(report, {
        ok: true,
        expectedVersion: 9,
        actualVersion: 9,
        missingPromptTemplateColumns: [],
        missingExecutionColumns: [],
        missingFeedbackColumns: [],
      });
      assert.equal(
        checkSchemaVersion((sql) => {
          if (sql === "SELECT MAX(version) AS version FROM schema_version") {
            return { rows: [{ version: 9 }] };
          }
          if (sql === "SHOW COLUMNS FROM prompt_templates") {
            return makeColumns(
              "artifact_kind",
              "control_mode",
              "formalization_level",
              "owner_company",
              "visibility_companies",
              "controlled_vocabulary",
              "export_to_pi",
              "version",
            );
          }
          if (sql === "SHOW COLUMNS FROM executions") {
            return makeColumns(
              "id",
              "entity_type",
              "entity_id",
              "entity_version",
              "input_context",
              "model",
              "output_capture_mode",
              "output_text",
              "success",
            );
          }
          if (sql === "SHOW COLUMNS FROM feedback") {
            return makeColumns("execution_id", "rating", "notes", "issues");
          }
          throw new Error(`unexpected query: ${sql}`);
        }),
        true,
      );
    },
  );
});

test("schema helper reports detailed mismatch reasons when version or columns drift", async () => {
  await withTranspiledModuleHarness(
    {
      prefix: "vault-schema-",
      files: VAULT_SCHEMA_FILES,
    },
    async ({ importModule }) => {
      const { checkSchemaCompatibilityDetailed, checkSchemaVersion } =
        await importModule("src/vaultSchema.js");
      const query = (sql) => {
        if (sql === "SELECT MAX(version) AS version FROM schema_version") {
          return { rows: [{ version: 8 }] };
        }
        if (sql === "SHOW COLUMNS FROM prompt_templates") {
          return makeColumns(
            "artifact_kind",
            "control_mode",
            "formalization_level",
            "owner_company",
          );
        }
        if (sql === "SHOW COLUMNS FROM executions") {
          return makeColumns("id", "entity_type", "entity_id", "model");
        }
        if (sql === "SHOW COLUMNS FROM feedback") {
          return makeColumns("rating");
        }
        throw new Error(`unexpected query: ${sql}`);
      };

      assert.deepEqual(checkSchemaCompatibilityDetailed(query), {
        ok: false,
        expectedVersion: 9,
        actualVersion: 8,
        missingPromptTemplateColumns: [
          "visibility_companies",
          "controlled_vocabulary",
          "export_to_pi",
          "version",
        ],
        missingExecutionColumns: [
          "entity_version",
          "input_context",
          "output_capture_mode",
          "output_text",
          "success",
        ],
        missingFeedbackColumns: ["execution_id", "notes", "issues"],
      });
      assert.equal(checkSchemaVersion(query), false);
    },
  );
});

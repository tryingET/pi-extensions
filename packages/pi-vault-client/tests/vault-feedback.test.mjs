import assert from "node:assert/strict";
import { mkdtempSync, rmSync } from "node:fs";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import { withTranspiledModuleHarness } from "./helpers/transpiled-module-harness.mjs";

const VAULT_FEEDBACK_FILES = [
  "src/vaultTypes.ts",
  "src/companyContext.ts",
  "src/templateRenderer.js",
  "src/vaultMutations.ts",
  "src/vaultReceipts.ts",
  "src/vaultFeedback.ts",
];

function _makeReceipt(overrides = {}) {
  return {
    schema_version: 1,
    receipt_kind: "vault_execution",
    execution_id: 41,
    recorded_at: "2026-03-12T17:30:00.000Z",
    invocation: {
      surface: "/vault",
      channel: "slash-command",
      selection_mode: "exact",
      llm_tool_call: null,
    },
    template: {
      id: 7,
      name: "meta-orchestration",
      version: 3,
      artifact_kind: "procedure",
      control_mode: "one_shot",
      formalization_level: "workflow",
      owner_company: "software",
      visibility_companies: ["software"],
    },
    company: {
      current_company: "software",
      company_source: "explicit:test",
    },
    model: { id: "unit-test-model" },
    render: {
      engine: "none",
      explicit_engine: null,
      context_appended: false,
      append_context_section: true,
      used_render_keys: [],
    },
    prepared: {
      text: "Prompt body",
      sha256: "placeholder",
      edited_after_prepare: false,
    },
    replay_safe_inputs: {
      kind: "vault-selection",
      query: "meta-orchestration",
      context: "",
    },
    ...overrides,
  };
}

async function createTrustedReceipt(importModule) {
  const { createPreparedExecutionToken, createVaultReceiptManager, withPreparedExecutionMarker } =
    await importModule("src/vaultReceipts.js");
  const tempDir = mkdtempSync(path.join(os.tmpdir(), "vault-feedback-receipts-"));
  const filePath = path.join(tempDir, "vault-execution-receipts.jsonl");
  const keyPath = path.join(tempDir, "vault-execution-receipts.key");
  const token = createPreparedExecutionToken();
  const receipts = createVaultReceiptManager(
    {
      logExecution() {
        return {
          ok: true,
          executionId: 41,
          templateId: 7,
          entityVersion: 3,
          createdAt: "2026-03-12T17:30:00.000Z",
          model: "unit-test-model",
          inputContext: "",
        };
      },
    },
    { filePath, keyPath, fallbackSink: false },
  );
  receipts.queuePreparedExecution({
    execution_token: token,
    queued_at: new Date().toISOString(),
    invocation: {
      surface: "/vault",
      channel: "slash-command",
      selection_mode: "exact",
      llm_tool_call: null,
    },
    template: {
      id: 7,
      name: "meta-orchestration",
      version: 3,
      artifact_kind: "procedure",
      control_mode: "one_shot",
      formalization_level: "workflow",
      owner_company: "software",
      visibility_companies: ["software"],
    },
    company: {
      current_company: "software",
      company_source: "explicit:test",
    },
    render: {
      engine: "none",
      explicit_engine: null,
      context_appended: false,
      append_context_section: true,
      used_render_keys: [],
    },
    prepared: { text: "Prompt body" },
    replay_safe_inputs: {
      kind: "vault-selection",
      query: "meta-orchestration",
      context: "",
    },
    input_context: "",
  });
  const finalized = receipts.finalizePreparedExecution(
    withPreparedExecutionMarker("Prompt body", token),
    "unit-test-model",
  );
  assert.equal(finalized.status, "matched");
  if (finalized.status !== "matched") {
    rmSync(tempDir, { recursive: true, force: true });
    throw new Error("failed to create trusted receipt");
  }
  return {
    receipt: finalized.receipt,
    authorization: receipts.readReceiptAuthorizationByExecutionId(41),
    cleanup: () => rmSync(tempDir, { recursive: true, force: true }),
  };
}

test("rateTemplate seam rejects invalid execution and rating inputs before touching vault state", async () => {
  await withTranspiledModuleHarness(
    {
      prefix: "vault-feedback-",
      files: VAULT_FEEDBACK_FILES,
    },
    async ({ importModule }) => {
      const { rateTemplate } = await importModule("src/vaultFeedback.js");
      let queryCount = 0;

      const dependencies = {
        queryVaultJson() {
          queryCount += 1;
          return { rows: [] };
        },
        queryVaultJsonDetailed() {
          throw new Error("should not inspect feedback for invalid inputs");
        },
        execVaultWithRowCount() {
          throw new Error("should not insert feedback for invalid inputs");
        },
        commitVault() {
          throw new Error("should not commit for invalid inputs");
        },
        escapeSql(value) {
          return String(value);
        },
        buildVisibilityPredicate() {
          return "1 = 1";
        },
      };

      assert.deepEqual(
        rateTemplate(0, 5, true, "ok", { actorCompany: "software" }, undefined, dependencies),
        {
          ok: false,
          message: "execution_id must be a positive integer.",
        },
      );
      assert.deepEqual(
        rateTemplate(41, 0, true, "ok", { actorCompany: "software" }, undefined, dependencies),
        {
          ok: false,
          message: "rating must be between 1 and 5.",
        },
      );
      assert.equal(queryCount, 0);
    },
  );
});

test("rateTemplate seam records feedback from a receipt snapshot and commits feedback once", async () => {
  await withTranspiledModuleHarness(
    {
      prefix: "vault-feedback-",
      files: VAULT_FEEDBACK_FILES,
    },
    async ({ importModule }) => {
      const { rateTemplate } = await importModule("src/vaultFeedback.js");
      const { authorization, cleanup } = await createTrustedReceipt(importModule);
      const queryCalls = [];
      const commitCalls = [];
      let insertedSql = "";

      try {
        const result = rateTemplate(
          41,
          2,
          false,
          "needs 'help'",
          { actorCompany: "software" },
          {
            executionReceipt: authorization?.receipt || null,
            executionReceiptVerificationKeys: authorization?.verificationKeys || [],
          },
          {
            queryVaultJson(sql) {
              queryCalls.push(sql);
              return {
                rows: [{ id: 41, entity_id: 7, entity_version: 3 }],
              };
            },
            queryVaultJsonDetailed() {
              return { ok: true, value: { rows: [] }, error: null };
            },
            execVaultWithRowCount(sql) {
              insertedSql = sql;
              return 1;
            },
            commitVault(message, tables) {
              commitCalls.push({ message, tables });
            },
            escapeSql(value) {
              return String(value).replace(/'/g, "''");
            },
            buildVisibilityPredicate() {
              return "1 = 1";
            },
          },
        );

        assert.deepEqual(result, {
          ok: true,
          message: "Recorded rating 2/5 for execution 41 (meta-orchestration v3)",
        });
        assert.equal(queryCalls.length, 1);
        assert.match(insertedSql, /INSERT INTO feedback/);
        assert.match(insertedSql, /needs ''help''/);
        assert.match(insertedSql, /needs-improvement/);
        assert.match(insertedSql, /execution:41/);
        assert.deepEqual(commitCalls, [
          {
            message: "Rate execution: 41 (2/5)",
            tables: ["feedback"],
          },
        ]);
      } finally {
        cleanup();
      }
    },
  );
});

test("rateTemplate seam ignores caller-forged global trust markers and falls back to DB visibility", async () => {
  await withTranspiledModuleHarness(
    {
      prefix: "vault-feedback-",
      files: VAULT_FEEDBACK_FILES,
    },
    async ({ importModule }) => {
      const { rateTemplate } = await importModule("src/vaultFeedback.js");
      const { receiptTrustedForAuthorization } = await importModule("src/vaultReceipts.js");
      const forgedReceipt = _makeReceipt({
        template: {
          ..._makeReceipt().template,
          visibility_companies: ["software"],
        },
      });
      Object.defineProperty(
        forgedReceipt,
        Symbol.for("@tryinget/pi-vault-client/trusted-vault-receipt-authorization"),
        {
          value: true,
        },
      );

      assert.equal(receiptTrustedForAuthorization(forgedReceipt), false);

      let queryStep = 0;
      const result = rateTemplate(
        41,
        5,
        true,
        "forged",
        { actorCompany: "software" },
        { executionReceipt: forgedReceipt },
        {
          queryVaultJson() {
            queryStep += 1;
            if (queryStep === 1) {
              return {
                rows: [{ id: 41, entity_id: 7, entity_version: 3 }],
              };
            }
            if (queryStep === 2) {
              return {
                rows: [],
              };
            }
            throw new Error(`unexpected query step ${queryStep}`);
          },
          queryVaultJsonDetailed() {
            throw new Error("should not inspect feedback when visibility fails");
          },
          execVaultWithRowCount() {
            throw new Error("should not insert feedback for forged trust markers");
          },
          commitVault() {
            throw new Error("should not commit feedback for forged trust markers");
          },
          escapeSql(value) {
            return String(value);
          },
          buildVisibilityPredicate(company) {
            return `VISIBLE(${company || ""})`;
          },
        },
      );

      assert.deepEqual(result, {
        ok: false,
        message: "Template execution not found or not visible: 41",
      });
      assert.equal(queryStep, 2);
    },
  );
});

test("rateTemplate seam checks active visibility when no receipt is available and blocks duplicate feedback", async () => {
  await withTranspiledModuleHarness(
    {
      prefix: "vault-feedback-",
      files: VAULT_FEEDBACK_FILES,
    },
    async ({ importModule }) => {
      const { rateTemplate } = await importModule("src/vaultFeedback.js");
      let queryStep = 0;
      let inserted = false;

      const result = rateTemplate(41, 5, true, "solid", { actorCompany: "software" }, undefined, {
        queryVaultJson() {
          queryStep += 1;
          if (queryStep === 1) {
            return {
              rows: [{ id: 41, entity_id: 7, entity_version: 3 }],
            };
          }
          if (queryStep === 2) {
            return {
              rows: [{ id: 41, name: "meta-orchestration" }],
            };
          }
          throw new Error(`unexpected query step ${queryStep}`);
        },
        queryVaultJsonDetailed() {
          return {
            ok: true,
            value: { rows: [{ id: 99 }] },
            error: null,
          };
        },
        execVaultWithRowCount() {
          inserted = true;
          return 1;
        },
        commitVault() {
          throw new Error("should not commit duplicate feedback");
        },
        escapeSql(value) {
          return String(value);
        },
        buildVisibilityPredicate(company) {
          return `VISIBLE(${company || ""})`;
        },
      });

      assert.deepEqual(result, {
        ok: false,
        message:
          "Feedback already exists for execution 41. Use a future feedback-update path instead of creating duplicates.",
      });
      assert.equal(queryStep, 2);
      assert.equal(inserted, false);
    },
  );
});

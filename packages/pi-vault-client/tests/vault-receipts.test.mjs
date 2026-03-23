import assert from "node:assert/strict";
import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import {
  createPreparedExecutionToken,
  createVaultReceiptManager,
  formatVaultReceipt,
  withPreparedExecutionMarker,
} from "../src/vaultReceipts.js";

test("vault receipt manager ignores malformed receipt lines instead of crashing", () => {
  const tempDir = mkdtempSync(path.join(os.tmpdir(), "vault-receipts-bad-"));

  try {
    const filePath = path.join(tempDir, "vault-execution-receipts.jsonl");
    writeFileSync(
      filePath,
      '{"schema_version":1,"receipt_kind":"vault_execution","execution_id":1}\n',
      "utf8",
    );

    const receipts = createVaultReceiptManager(
      {
        logExecution() {
          return { ok: false, message: "unused" };
        },
      },
      { filePath },
    );

    assert.equal(receipts.readLatestReceipt(), null);
    assert.deepEqual(receipts.listRecentReceipts({ currentCompany: "software", limit: 5 }), []);
  } finally {
    rmSync(tempDir, { recursive: true, force: true });
  }
});

test("vault receipt manager finalizes prepared executions on send and persists local receipts", () => {
  const tempDir = mkdtempSync(path.join(os.tmpdir(), "vault-receipts-"));
  const calls = [];

  try {
    const receipts = createVaultReceiptManager(
      {
        logExecution(template, model, inputContext) {
          calls.push({ template, model, inputContext });
          return {
            ok: true,
            executionId: 91,
            templateId: template.id,
            entityVersion: template.version,
            createdAt: "2026-03-11T18:00:00.000Z",
            model,
            inputContext,
          };
        },
      },
      { filePath: path.join(tempDir, "vault-execution-receipts.jsonl") },
    );

    const executionToken = createPreparedExecutionToken();
    receipts.queuePreparedExecution({
      execution_token: executionToken,
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
        formalization_level: "structured",
        owner_company: "software",
        visibility_companies: ["software"],
      },
      company: {
        current_company: "software",
        company_source: "cwd:/tmp/software/project",
      },
      render: {
        engine: "nunjucks",
        explicit_engine: "nunjucks",
        context_appended: false,
        append_context_section: true,
        used_render_keys: ["current_company", "context"],
      },
      prepared: {
        text: "Company: software\nContext: release drift",
      },
      replay_safe_inputs: {
        kind: "vault-selection",
        query: "meta-orchestration",
        context: "release drift",
      },
      input_context: "release drift",
    });

    const finalized = receipts.finalizePreparedExecution(
      withPreparedExecutionMarker("Company: software\nContext: release drift", executionToken),
      "unit-model",
    );
    assert.equal(finalized.status, "matched");
    if (finalized.status !== "matched") return;

    assert.equal(calls.length, 1);
    assert.equal(calls[0].template.name, "meta-orchestration");
    assert.equal(calls[0].model, "unit-model");

    const latest = receipts.readLatestReceipt();
    assert.ok(latest);
    assert.equal(latest?.execution_id, 91);
    assert.equal(latest?.template.version, 3);
    assert.equal(latest?.model.id, "unit-model");

    const byId = receipts.readReceiptByExecutionId(91);
    assert.ok(byId);
    assert.equal(byId?.company.current_company, "software");

    const visible = receipts.listRecentReceipts({ currentCompany: "software", limit: 5 });
    assert.equal(visible.length, 1);
    const hidden = receipts.listRecentReceipts({ currentCompany: "finance", limit: 5 });
    assert.equal(hidden.length, 0);

    const formatted = formatVaultReceipt(latest);
    assert.match(formatted, /# Vault Execution Receipt/);
    assert.match(formatted, /execution_id: 91/);
    assert.match(formatted, /Prepared Prompt/);
  } finally {
    rmSync(tempDir, { recursive: true, force: true });
  }
});

test("vault receipt manager falls back to an emergency sink when the primary receipt sink fails", () => {
  const appended = [];
  let logged = 0;

  const receipts = createVaultReceiptManager(
    {
      logExecution(template, model, inputContext) {
        logged += 1;
        return {
          ok: true,
          executionId: 123,
          templateId: template.id,
          entityVersion: template.version,
          createdAt: "2026-03-22T18:00:00.000Z",
          model,
          inputContext,
        };
      },
    },
    {
      sink: {
        append() {
          throw new Error("disk full");
        },
      },
      fallbackSink: {
        append(receipt) {
          appended.push(receipt);
        },
      },
    },
  );

  const executionToken = createPreparedExecutionToken();
  receipts.queuePreparedExecution({
    execution_token: executionToken,
    queued_at: new Date().toISOString(),
    invocation: {
      surface: "/vault",
      channel: "slash-command",
      selection_mode: "exact",
      llm_tool_call: null,
    },
    template: {
      id: 7,
      name: "nexus",
      version: 3,
      artifact_kind: "procedure",
      control_mode: "one_shot",
      formalization_level: "structured",
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
    prepared: {
      text: "hello",
    },
    replay_safe_inputs: {
      kind: "vault-selection",
      query: "nexus",
      context: "",
    },
    input_context: "",
  });

  const finalized = receipts.finalizePreparedExecution(
    withPreparedExecutionMarker("hello", executionToken),
    "unit-model",
  );

  assert.equal(finalized.status, "matched");
  assert.equal(logged, 1);
  assert.equal(appended.length, 1);
  assert.equal(appended[0]?.execution_id, 123);
});

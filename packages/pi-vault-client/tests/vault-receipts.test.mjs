import assert from "node:assert/strict";
import { chmodSync, mkdirSync, mkdtempSync, rmSync, statSync, writeFileSync } from "node:fs";
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

test("vault receipt manager does not trust unsigned legacy receipts for mutation-sensitive reads", () => {
  const tempDir = mkdtempSync(path.join(os.tmpdir(), "vault-receipts-legacy-"));

  try {
    const filePath = path.join(tempDir, "vault-execution-receipts.jsonl");
    writeFileSync(
      filePath,
      `${JSON.stringify({
        schema_version: 1,
        receipt_kind: "vault_execution",
        execution_id: 19,
        recorded_at: "2026-03-22T18:00:00.000Z",
        invocation: {
          surface: "/vault",
          channel: "slash-command",
          selection_mode: "exact",
          llm_tool_call: null,
        },
        template: {
          id: 7,
          name: "legacy",
          version: 1,
          artifact_kind: "procedure",
          control_mode: "one_shot",
          formalization_level: "structured",
          owner_company: "software",
          visibility_companies: ["software"],
        },
        company: {
          current_company: "software",
          company_source: "legacy:test",
        },
        model: { id: "unit-model" },
        render: {
          engine: "none",
          explicit_engine: null,
          context_appended: false,
          append_context_section: true,
          used_render_keys: [],
        },
        prepared: {
          text: "legacy body",
          sha256: "legacy",
          edited_after_prepare: false,
        },
        replay_safe_inputs: {
          kind: "vault-selection",
          query: "legacy",
          context: "",
        },
      })}\n`,
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

    assert.equal(receipts.readReceiptByExecutionId(19)?.execution_id, 19);
    assert.equal(receipts.readTrustedReceiptByExecutionId(19), null);
  } finally {
    rmSync(tempDir, { recursive: true, force: true });
  }
});

test("vault receipt manager defers key provisioning until finalize and degrades cleanly when key paths are unwritable", () => {
  const tempDir = mkdtempSync(path.join(os.tmpdir(), "vault-receipts-key-failure-"));
  const lockedDir = path.join(tempDir, "locked");
  mkdirSync(lockedDir, { recursive: true });
  chmodSync(lockedDir, 0o500);

  try {
    const receipts = createVaultReceiptManager(
      {
        logExecution() {
          return {
            ok: true,
            executionId: 33,
            templateId: 7,
            entityVersion: 1,
            createdAt: "2026-03-23T00:00:00.000Z",
            model: "unit-model",
            inputContext: "",
          };
        },
      },
      {
        filePath: path.join(lockedDir, "vault-execution-receipts.jsonl"),
        keyPath: path.join(lockedDir, "vault-execution-receipts.key"),
        fallbackSink: false,
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
        name: "meta-orchestration",
        version: 1,
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
      prepared: { text: "Prompt body" },
      replay_safe_inputs: {
        kind: "vault-selection",
        query: "meta-orchestration",
        context: "",
      },
      input_context: "",
    });

    const finalized = receipts.finalizePreparedExecution(
      withPreparedExecutionMarker("Prompt body", executionToken),
      "unit-model",
    );
    assert.equal(finalized.status, "degraded");
    if (finalized.status === "degraded") {
      assert.match(finalized.message, /Receipt signing key unavailable/);
    }
  } finally {
    chmodSync(lockedDir, 0o700);
    rmSync(tempDir, { recursive: true, force: true });
  }
});

test("vault receipt manager still trusts fallback-signed receipts after primary key recovery", () => {
  const tempDir = mkdtempSync(path.join(os.tmpdir(), "vault-receipts-key-recovery-"));
  const blockedParent = path.join(tempDir, "blocked-parent");
  writeFileSync(blockedParent, "x", "utf8");

  try {
    const filePath = path.join(tempDir, "vault-execution-receipts.jsonl");
    const fallbackFilePath = path.join(tempDir, "vault-execution-receipts.fallback.jsonl");
    const keyPath = path.join(blockedParent, "vault-execution-receipts.key");

    function makeReceipts() {
      return createVaultReceiptManager(
        {
          logExecution() {
            return {
              ok: true,
              executionId: 91,
              templateId: 7,
              entityVersion: 1,
              createdAt: "2026-03-23T00:00:00.000Z",
              model: "unit-model",
              inputContext: "",
            };
          },
        },
        {
          filePath,
          fallbackFilePath,
          keyPath,
          sink: {
            append() {
              throw new Error("primary down");
            },
          },
          fallbackSink: {
            append(receipt) {
              writeFileSync(fallbackFilePath, `${JSON.stringify(receipt)}\n`, "utf8");
            },
          },
        },
      );
    }

    const receipts = makeReceipts();
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
        version: 1,
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
      prepared: { text: "Prompt body" },
      replay_safe_inputs: {
        kind: "vault-selection",
        query: "meta-orchestration",
        context: "",
      },
      input_context: "",
    });

    const finalized = receipts.finalizePreparedExecution(
      withPreparedExecutionMarker("Prompt body", executionToken),
      "unit-model",
    );
    assert.equal(finalized.status, "matched");
    assert.ok(receipts.readTrustedReceiptByExecutionId(91));

    rmSync(blockedParent, { force: true });
    mkdirSync(blockedParent, { recursive: true });
    writeFileSync(keyPath, Buffer.alloc(32, 1), { mode: 0o600 });

    const recoveredReceipts = makeReceipts();
    const trustedAfterRecovery = recoveredReceipts.readTrustedReceiptByExecutionId(91);
    assert.ok(trustedAfterRecovery);
    assert.equal(trustedAfterRecovery?.auth?.mode, "hmac-sha256");
  } finally {
    rmSync(tempDir, { recursive: true, force: true });
  }
});

test("vault receipt manager prefers a signed duplicate over an unsigned primary duplicate", () => {
  const tempDir = mkdtempSync(path.join(os.tmpdir(), "vault-receipts-trusted-duplicate-"));

  try {
    const filePath = path.join(tempDir, "vault-execution-receipts.jsonl");
    const fallbackFilePath = path.join(tempDir, "vault-execution-receipts.fallback.jsonl");
    const keyPath = path.join(tempDir, "vault-execution-receipts.key");
    const receipts = createVaultReceiptManager(
      {
        logExecution() {
          return {
            ok: true,
            executionId: 77,
            templateId: 7,
            entityVersion: 1,
            createdAt: "2026-03-23T00:00:00.000Z",
            model: "unit-model",
            inputContext: "",
          };
        },
      },
      {
        filePath,
        fallbackFilePath,
        keyPath,
        sink: {
          append() {
            throw new Error("primary down");
          },
        },
        fallbackSink: {
          append(receipt) {
            writeFileSync(fallbackFilePath, `${JSON.stringify(receipt)}\n`, "utf8");
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
        name: "meta-orchestration",
        version: 1,
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
      prepared: { text: "Prompt body" },
      replay_safe_inputs: {
        kind: "vault-selection",
        query: "meta-orchestration",
        context: "",
      },
      input_context: "",
    });

    const finalized = receipts.finalizePreparedExecution(
      withPreparedExecutionMarker("Prompt body", executionToken),
      "unit-model",
    );
    assert.equal(finalized.status, "matched");
    if (finalized.status !== "matched") return;

    const unsignedDuplicate = {
      ...finalized.receipt,
      recorded_at: "2026-03-24T00:00:00.000Z",
      company: {
        current_company: "finance",
        company_source: "forged",
      },
      template: {
        ...finalized.receipt.template,
        visibility_companies: ["finance"],
      },
    };
    delete unsignedDuplicate.auth;
    writeFileSync(filePath, `${JSON.stringify(unsignedDuplicate)}\n`, "utf8");

    const preferred = receipts.readReceiptByExecutionId(77);
    const trusted = receipts.readTrustedReceiptByExecutionId(77);
    const softwareRecent = receipts.listRecentReceipts({ currentCompany: "software", limit: 5 });
    const financeRecent = receipts.listRecentReceipts({ currentCompany: "finance", limit: 5 });
    assert.equal(preferred?.company.current_company, "software");
    assert.equal(preferred?.auth?.mode, "hmac-sha256");
    assert.ok(trusted);
    assert.equal(trusted?.auth?.mode, "hmac-sha256");
    assert.equal(softwareRecent.length, 1);
    assert.equal(softwareRecent[0]?.company.current_company, "software");
    assert.equal(softwareRecent[0]?.auth?.mode, "hmac-sha256");
    assert.equal(financeRecent.length, 0);
  } finally {
    rmSync(tempDir, { recursive: true, force: true });
  }
});

test("vault receipt manager returns cloned verification keys in receipt authorization bundles", () => {
  const tempDir = mkdtempSync(path.join(os.tmpdir(), "vault-receipts-auth-bundle-"));

  try {
    const receipts = createVaultReceiptManager(
      {
        logExecution() {
          return {
            ok: true,
            executionId: 88,
            templateId: 7,
            entityVersion: 1,
            createdAt: "2026-03-23T00:00:00.000Z",
            model: "unit-model",
            inputContext: "",
          };
        },
      },
      { filePath: path.join(tempDir, "vault-execution-receipts.jsonl"), fallbackSink: false },
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
        version: 1,
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
      prepared: { text: "Prompt body" },
      replay_safe_inputs: {
        kind: "vault-selection",
        query: "meta-orchestration",
        context: "",
      },
      input_context: "",
    });

    const finalized = receipts.finalizePreparedExecution(
      withPreparedExecutionMarker("Prompt body", executionToken),
      "unit-model",
    );
    assert.equal(finalized.status, "matched");
    if (finalized.status !== "matched") return;

    const authA = receipts.readReceiptAuthorizationByExecutionId(88);
    const authB = receipts.readReceiptAuthorizationByExecutionId(88);
    assert.ok(authA);
    assert.ok(authB);
    assert.notEqual(authA?.verificationKeys[0], authB?.verificationKeys[0]);
    authA?.verificationKeys[0]?.fill(0);

    const trusted = receipts.readTrustedReceiptByExecutionId(88);
    assert.ok(trusted);
    assert.equal(trusted?.auth?.mode, "hmac-sha256");
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
    assert.equal(latest?.auth?.mode, "hmac-sha256");
    assert.match(latest?.auth?.key_id || "", /^[a-f0-9]{16}$/);

    const byId = receipts.readReceiptByExecutionId(91);
    assert.ok(byId);
    assert.equal(byId?.company.current_company, "software");

    const trustedById = receipts.readTrustedReceiptByExecutionId(91);
    assert.ok(trustedById);
    assert.equal(trustedById?.execution_id, 91);

    const keyMode = (
      statSync(path.join(tempDir, "vault-execution-receipts.key")).mode & 0o777
    ).toString(8);
    assert.equal(keyMode, "600");

    const visible = receipts.listRecentReceipts({ currentCompany: "software", limit: 5 });
    assert.equal(visible.length, 1);
    const hidden = receipts.listRecentReceipts({ currentCompany: "finance", limit: 5 });
    assert.equal(hidden.length, 0);

    const formatted = formatVaultReceipt(latest);
    assert.match(formatted, /# Vault Execution Receipt/);
    assert.match(formatted, /execution_id: 91/);
    assert.match(formatted, /auth_mode: hmac-sha256/);
    assert.match(formatted, /Prepared Prompt/);
  } finally {
    rmSync(tempDir, { recursive: true, force: true });
  }
});

test("vault receipt manager rejects edited prepared prompts before execution logging", () => {
  const tempDir = mkdtempSync(path.join(os.tmpdir(), "vault-receipts-edit-"));
  let logged = 0;

  try {
    const receipts = createVaultReceiptManager(
      {
        logExecution() {
          logged += 1;
          return {
            ok: true,
            executionId: 122,
            templateId: 7,
            entityVersion: 3,
            createdAt: "2026-03-22T18:00:00.000Z",
            model: "unit-model",
            inputContext: "",
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
      withPreparedExecutionMarker("HELLO BUT DIFFERENT", executionToken),
      "unit-model",
    );

    assert.equal(finalized.status, "rejected");
    assert.equal(finalized.reason, "prepared-text-mismatch");
    assert.equal(logged, 0);
    assert.equal(receipts.readLatestReceipt(), null);
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

test("vault receipt manager reports degraded state when execution logs but every receipt sink fails", () => {
  const tempDir = mkdtempSync(path.join(os.tmpdir(), "vault-receipts-degraded-"));
  let logged = 0;

  try {
    const receipts = createVaultReceiptManager(
      {
        logExecution(template, model, inputContext) {
          logged += 1;
          return {
            ok: true,
            executionId: 124,
            templateId: template.id,
            entityVersion: template.version,
            createdAt: "2026-03-22T18:00:00.000Z",
            model,
            inputContext,
          };
        },
      },
      {
        filePath: path.join(tempDir, "vault-execution-receipts.jsonl"),
        sink: {
          append() {
            throw new Error("disk full");
          },
        },
        fallbackSink: false,
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

    assert.equal(finalized.status, "degraded");
    assert.equal(finalized.reason, "receipt-persist-failed");
    assert.equal(finalized.execution.executionId, 124);
    assert.equal(logged, 1);
    assert.equal(receipts.readLatestReceipt(), null);
  } finally {
    rmSync(tempDir, { recursive: true, force: true });
  }
});

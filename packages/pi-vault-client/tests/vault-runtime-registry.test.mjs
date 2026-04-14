import assert from "node:assert/strict";
import test from "node:test";
import { getGlobalRuntimeRegistry } from "@tryinget/pi-runtime-registry";
import { resetGlobalRuntimeRegistry } from "../../pi-interaction/pi-runtime-registry/src/runtimeRegistry.js";
import {
  getVaultReceiptsAccessor,
  getVaultTelemetryAccessor,
  registerVaultCapabilityBridges,
  VAULT_CAPABILITIES,
  VAULT_REGISTRY_OWNER,
  VAULT_RUNTIME_IDS,
} from "../src/vaultRuntimeRegistry.js";

test("registerVaultCapabilityBridges registers receipt and telemetry accessors without widening ownership", () => {
  resetGlobalRuntimeRegistry();

  const receipt = {
    schema_version: 1,
    receipt_kind: "vault_execution",
    execution_id: 42,
    recorded_at: "2026-03-22T12:00:00.000Z",
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
      company_source: "cwd:/tmp/software/project",
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
      text: "prepared prompt",
      sha256: "abc123",
      edited_after_prepare: false,
    },
    replay_safe_inputs: {
      kind: "vault-selection",
      query: "nexus",
      context: "",
    },
  };

  const receiptManager = {
    spoolPath: "/tmp/vault-execution-receipts.jsonl",
    queuePreparedExecution() {},
    finalizePreparedExecution() {
      return { status: "no-match" };
    },
    readLatestReceipt() {
      return receipt;
    },
    readReceiptByExecutionId(executionId) {
      return executionId === 42 ? receipt : null;
    },
    readTrustedReceiptByExecutionId(executionId) {
      return executionId === 42 ? receipt : null;
    },
    listRecentReceipts(options) {
      if (options?.currentCompany && options.currentCompany !== "software") return [];
      if (options?.trustedOnly !== true) throw new Error("trustedOnly expected");
      return [receipt];
    },
  };

  registerVaultCapabilityBridges({
    receiptManager,
    summarizeTelemetry: () => "# Vault Live Trigger Telemetry\n\n- retained_events: 1",
    getTelemetryStats: () => ({
      registrations: 2,
      failures: 1,
      eventCount: 1,
    }),
  });

  const registry = getGlobalRuntimeRegistry();

  const receiptEntry = registry.get(VAULT_REGISTRY_OWNER, VAULT_RUNTIME_IDS.RECEIPTS);
  assert.ok(receiptEntry);
  assert.deepEqual(
    receiptEntry?.capabilities.map((capability) => capability.id),
    [VAULT_CAPABILITIES.RECEIPTS],
  );

  const telemetryEntry = registry.get(VAULT_REGISTRY_OWNER, VAULT_RUNTIME_IDS.TELEMETRY);
  assert.ok(telemetryEntry);
  assert.deepEqual(
    telemetryEntry?.capabilities.map((capability) => capability.id),
    [VAULT_CAPABILITIES.TELEMETRY],
  );

  assert.equal(registry.findByCapability(VAULT_CAPABILITIES.RECEIPTS).length, 1);
  assert.equal(registry.findByCapability(VAULT_CAPABILITIES.TELEMETRY).length, 1);
  assert.equal(registry.findByCapability("vault:templates").length, 0);

  const receiptsAccessor = getVaultReceiptsAccessor();
  assert.ok(receiptsAccessor);
  assert.equal(receiptsAccessor?.readLatest({ currentCompany: "software" })?.execution_id, 42);
  assert.equal(
    receiptsAccessor?.readByExecutionId(42, { currentCompany: "software" })?.template.name,
    "nexus",
  );
  assert.equal(receiptsAccessor?.readLatest({}), null);
  assert.equal(receiptsAccessor?.readByExecutionId(42, {}), null);
  assert.equal(receiptsAccessor?.listRecent({ currentCompany: "software" }).length, 1);
  assert.equal(receiptsAccessor?.listRecent({ currentCompany: "finance" }).length, 0);
  assert.equal(receiptsAccessor?.listRecent({}).length, 0);

  const telemetryAccessor = getVaultTelemetryAccessor();
  assert.ok(telemetryAccessor);
  assert.equal(telemetryAccessor?.getEventCount(), 1);
  assert.deepEqual(telemetryAccessor?.getStats(), {
    registrations: 2,
    failures: 1,
    eventCount: 1,
  });
  assert.match(telemetryAccessor?.summarize() ?? "", /Vault Live Trigger Telemetry/);
});

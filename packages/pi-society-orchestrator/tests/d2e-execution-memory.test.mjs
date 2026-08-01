import assert from "node:assert/strict";
import crypto from "node:crypto";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import {
  consumeD2EExecutionMemory,
  D2EExecutionMemoryConsumerError,
} from "../src/runtime/d2e-execution-memory.ts";

const repo = "/repos/frankensqlite";
const packetSource = `https://github.com/tryingET/frankensqlite/blob/${"a".repeat(40)}/docs/packet.md`;
const packetSourceSha256 = "b".repeat(64);
const templateIdentity = {
  templateId: 7,
  templateName: "execution-memory-transfer",
  artifactKind: "procedure",
  controlMode: "one_shot",
  formalizationLevel: "workflow",
  ownerCompany: "core",
  templateVersion: 3,
  contentSha256: "c".repeat(64),
};
const capabilityIds = [
  "repo_registration_v1",
  "decision_post_adr_v1",
  "layer12_packet_identity_v1",
  "task_execution_memory_v1",
  "task_admission_v1",
  "task_closeout_v1",
  "fcos_metadata_boundary_v1",
];

function request(mode = "proposal", overrides = {}) {
  return {
    mode,
    templateIdentity,
    repo,
    decisionId: 100,
    packetId: 74,
    packetKey: "decision-100-packet",
    packetSource,
    packetSourceSha256,
    expectedTaskIds: [4427, 4485],
    expectedDependencies: ["4427:none", "4485:4427"],
    authorizationBlockRef: "task-deferral:195",
    ...overrides,
  };
}

function payload(overrides = {}) {
  return {
    profile: "d2e-transfer-v1",
    profile_schema_version: 1,
    read_only: true,
    evaluated_at: "2026-08-01T22:00:00.000000000Z",
    database: {
      canonical_path: "/disposable/society.db",
      schema_version: 41,
      supported_schema_min: 41,
      supported_schema_max: 41,
      open_mode: "existing_runtime_query_only",
      transaction_mode: "deferred_single_snapshot",
      capability_checks: capabilityIds.map((id) => ({ id, present: true })),
    },
    capabilities: {
      coherent_read_transaction: true,
      packet_identity_check: true,
      task_memory_check: true,
      negative_authorization_gate_proof: true,
      positive_authorization_proof: false,
      closeout_projection: true,
    },
    request: {
      decision_id: 100,
      repo_scope: repo,
      packet_id: 74,
      packet_key: "decision-100-packet",
      packet_source: packetSource,
      packet_source_sha256: packetSourceSha256,
      expect_task_ids: [4427, 4485],
      expect_dependencies: [
        { task_id: 4427, depends_on: [] },
        { task_id: 4485, depends_on: [4427] },
      ],
      authorization_block_ref: "task-deferral:195",
    },
    decision_lifecycle: {
      ready: true,
      decision: {
        id: 100,
        repo_scope: repo,
        significance_tier: "architecture",
        state: "unblocked",
        outcome: "accepted",
        adr_ref: "docs/adr/0032.md",
      },
      current_implementation_plan: null,
      current_validation_rollout_rollback: null,
      active_post_adr_task_ids: [4427, 4485],
      post_adr_execution_history: [],
      missing_codes: [],
    },
    packet_identity: {
      ready: true,
      packet: {
        id: 74,
        repo_scope: repo,
        packet_key: "decision-100-packet",
        packet_kind: "design",
        lifecycle_state: "assessed",
        source_ref: packetSource,
        entity_version: 1,
      },
      source_matches: true,
      source_verification: null,
      links: [],
      relations: [],
      graph_issues: [],
      missing_codes: [],
    },
    execution_task_memory: {
      ready: true,
      expected_set_matches_active_post_adr_set: true,
      tasks: [],
      missing_codes: [],
    },
    task_admission: { state: "clear", tasks: [] },
    authorization: {
      capability: "negative_gate_only",
      positive_proof_supported: false,
      state: "unproven",
      block_ref: null,
      verified_block: null,
      finding_codes: [],
    },
    closeout: { state: "not_ready", ready: false, tasks: [] },
    profile_health: { state: "healthy", issues: [] },
    pre_execution_memory_ready: true,
    result_state: "memory_ready_authorization_unproven",
    missing_codes: [],
    warnings: [],
    ...overrides,
  };
}

function envelope(payloadValue = payload(), overrides = {}) {
  return {
    surface: "decision.execution_memory_check",
    schema_version: 1,
    emitted_at: "2026-08-01T22:00:00.000000000Z",
    payload_kind: "d2e_execution_memory_check",
    schema_locator: "ak machine schema decision-execution-memory-check",
    ok: true,
    payload: payloadValue,
    error: null,
    ...overrides,
  };
}

function fixtureBinary(t) {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "d2e-memory-consumer-"));
  t.after(() => fs.rmSync(root, { recursive: true, force: true }));
  const binaryPath = path.join(root, "ak-bin");
  fs.writeFileSync(binaryPath, "immutable-ak-fixture\n", { mode: 0o555 });
  return {
    binaryPath,
    binarySha256: crypto.createHash("sha256").update(fs.readFileSync(binaryPath)).digest("hex"),
  };
}

function options(t, overrides = {}) {
  const binary = fixtureBinary(t);
  const calls = [];
  return {
    calls,
    value: {
      request: request(),
      activation: "enabled",
      akBinaryPath: binary.binaryPath,
      akBinarySha256: binary.binarySha256,
      exec: async (command, args, execOptions) => {
        calls.push({ command, args, execOptions });
        return { stdout: JSON.stringify(envelope()), stderr: "", code: 0 };
      },
      ...overrides,
    },
  };
}

async function assertCode(promise, code) {
  await assert.rejects(promise, (error) => {
    assert.ok(error instanceof D2EExecutionMemoryConsumerError);
    assert.equal(error.code, code);
    return true;
  });
}

test("consumer is default-disabled before binary inspection or producer spawn", async () => {
  let calls = 0;
  await assertCode(
    consumeD2EExecutionMemory({
      request: request(),
      akBinaryPath: "/missing/ak",
      akBinarySha256: "0".repeat(64),
      exec: async () => {
        calls += 1;
        throw new Error("must not run");
      },
    }),
    "D2E_EXECUTION_MEMORY_DISABLED",
  );
  assert.equal(calls, 0);
});

test("applied mode is structurally unsupported even when controller enables observation", async () => {
  let calls = 0;
  await assertCode(
    consumeD2EExecutionMemory({
      request: request("applied"),
      activation: "enabled",
      akBinaryPath: "/missing/ak",
      akBinarySha256: "0".repeat(64),
      exec: async () => {
        calls += 1;
        throw new Error("must not run");
      },
    }),
    "D2E_EXECUTION_MEMORY_POSITIVE_AUTHORIZATION_UNSUPPORTED",
  );
  assert.equal(calls, 0);
});

test("one exact installed-binary invocation yields only a non-executable observation", async (t) => {
  const fixture = options(t);
  const result = await consumeD2EExecutionMemory(fixture.value);
  assert.equal(fixture.calls.length, 1);
  const call = fixture.calls[0];
  assert.equal(call.command, fs.realpathSync(fixture.value.akBinaryPath));
  assert.equal(call.execOptions.cwd, repo);
  assert.equal(call.execOptions.timeout, 30_000);
  assert.deepEqual(call.args, [
    "decision",
    "execution-memory-check",
    "100",
    "--profile",
    "d2e-transfer-v1",
    "--repo",
    repo,
    "--packet-id",
    "74",
    "--packet-key",
    "decision-100-packet",
    "--packet-source",
    packetSource,
    "--packet-source-sha256",
    packetSourceSha256,
    "--expect-task",
    "4427",
    "--expect-task",
    "4485",
    "--expect-dependency",
    "4427:none",
    "--expect-dependency",
    "4485:4427",
    "--authorization-block-ref",
    "task-deferral:195",
    "--machine",
  ]);
  assert.equal(result.kind, "observation");
  assert.equal(result.receipt.schema, "D2E_EXECUTION_MEMORY_OBSERVATION_V1");
  assert.equal(result.receipt.pre_execution_memory_ready, true);
  assert.equal(result.receipt.result_state, "memory_ready_authorization_unproven");
  assert.equal(result.receipt.applied_ready, false);
  assert.equal(result.receipt.execution_performed, false);
  assert.equal(result.receipt.transfer_materialization_authorization.disposition, "not_authorized");
  assert.equal(result.receipt.downstream_implementation_authorization.granted, false);
  assert.equal(result.receipt.effect.disposition, "not_materialized");
  assert.equal(result.receipt.producer.binary_sha256, fixture.value.akBinarySha256);
});

test("all three memory-ready authorization states remain non-executable", async (t) => {
  for (const [resultState, authorizationState] of [
    ["memory_ready_authorization_blocked", "blocked_pending_authorization"],
    ["memory_ready_authorization_unproven", "unproven"],
    ["memory_ready_authorization_indeterminate", "indeterminate"],
  ]) {
    const fixture = options(t, {
      exec: async () => ({
        stdout: JSON.stringify(
          envelope(
            payload({
              result_state: resultState,
              authorization: {
                ...payload().authorization,
                state: authorizationState,
              },
            }),
          ),
        ),
        stderr: "",
        code: 0,
      }),
    });
    const result = await consumeD2EExecutionMemory(fixture.value);
    assert.equal(result.receipt.pre_execution_memory_ready, true);
    assert.equal(result.receipt.authorization.state, authorizationState);
    assert.equal(result.receipt.applied_ready, false);
    assert.equal(result.receipt.execution_performed, false);
  }
});

test("memory-incomplete and degraded owner projections are preserved without execution", async (t) => {
  const fixture = options(t, {
    exec: async () => ({
      stdout: JSON.stringify(
        envelope(
          payload({
            pre_execution_memory_ready: false,
            result_state: "memory_incomplete",
            missing_codes: ["expected_task_set_mismatch"],
            decision_lifecycle: {
              ...payload().decision_lifecycle,
              post_adr_execution_history: [
                {
                  task_id: 4427,
                  link_role: "post_adr_execution",
                  reevaluation_status: "reframed",
                  reevaluated_at: "2026-08-01T21:00:00Z",
                  active_for_transfer: true,
                },
              ],
            },
            profile_health: {
              state: "degraded",
              issues: [
                {
                  code: "close_check_unavailable",
                  task_id: 4427,
                  canonical_identity: "task:4427",
                  reason: "owner_data_unavailable",
                  owner_input: "evidence",
                },
              ],
            },
          }),
        ),
      ),
      stderr: "",
      code: 0,
    }),
  });
  const result = await consumeD2EExecutionMemory(fixture.value);
  assert.equal(result.receipt.pre_execution_memory_ready, false);
  assert.equal(result.receipt.profile_health.state, "degraded");
  assert.deepEqual(result.receipt.observation.missing_codes, ["expected_task_set_mismatch"]);
  assert.equal(
    result.receipt.observation.decision_lifecycle.post_adr_execution_history[0].reevaluation_status,
    "reframed",
  );
  assert.equal(result.receipt.execution_performed, false);
});

test("unknown shape, positive proof, and request-echo drift fail closed", async (t) => {
  for (const invalid of [
    { ...envelope(), unexpected: true },
    envelope(
      payload({ capabilities: { ...payload().capabilities, positive_authorization_proof: true } }),
    ),
    envelope(
      payload({
        authorization: { ...payload().authorization, state: "authorized" },
      }),
    ),
    envelope(
      payload({
        result_state: "memory_ready_authorization_blocked",
        authorization: { ...payload().authorization, state: "unproven" },
      }),
    ),
    envelope(payload({ decision_lifecycle: { ready: true } })),
    envelope(
      payload({
        request: { ...payload().request, packet_id: 999 },
      }),
    ),
    { ...envelope(), schema_version: 2 },
  ]) {
    const fixture = options(t, {
      exec: async () => ({ stdout: JSON.stringify(invalid), stderr: "", code: 0 }),
    });
    await assertCode(
      consumeD2EExecutionMemory(fixture.value),
      "D2E_EXECUTION_MEMORY_ENVELOPE_INVALID",
    );
  }
});

test("canonical producer errors are preserved but never treated as observations", async (t) => {
  const producerError = {
    code: "incompatible_db_schema",
    category: "compatibility",
    summary: "database schema is outside [41,41]",
    detail: "observed 40",
    canonical_identity: null,
    anomaly_codes: [],
  };
  const fixture = options(t, {
    exec: async () => ({
      stdout: JSON.stringify(envelope(null, { ok: false, error: producerError })),
      stderr: "",
      code: 1,
    }),
  });
  await assert.rejects(consumeD2EExecutionMemory(fixture.value), (error) => {
    assert.ok(error instanceof D2EExecutionMemoryConsumerError);
    assert.equal(error.code, "D2E_EXECUTION_MEMORY_PRODUCER_REJECTED");
    assert.deepEqual(error.producerError, producerError);
    return true;
  });
});

test("binary drift, malformed output, exit inconsistency, kill, and transport fail closed", async (t) => {
  const drift = options(t);
  drift.value.akBinarySha256 = "0".repeat(64);
  await assertCode(
    consumeD2EExecutionMemory(drift.value),
    "D2E_EXECUTION_MEMORY_BINARY_IDENTITY_MISMATCH",
  );

  const replaced = options(t);
  replaced.value.exec = async () => {
    fs.chmodSync(replaced.value.akBinaryPath, 0o755);
    fs.writeFileSync(replaced.value.akBinaryPath, "replacement-bytes\n");
    return { stdout: JSON.stringify(envelope()), stderr: "", code: 0 };
  };
  await assertCode(
    consumeD2EExecutionMemory(replaced.value),
    "D2E_EXECUTION_MEMORY_BINARY_IDENTITY_MISMATCH",
  );

  for (const result of [
    { stdout: "not json", stderr: "", code: 0 },
    { stdout: JSON.stringify(envelope()), stderr: "", code: 1 },
    { stdout: JSON.stringify(envelope()), stderr: "", code: 0, killed: true },
  ]) {
    const fixture = options(t, { exec: async () => result });
    await assert.rejects(consumeD2EExecutionMemory(fixture.value), (error) => {
      assert.ok(error instanceof D2EExecutionMemoryConsumerError);
      assert.ok(
        ["D2E_EXECUTION_MEMORY_ENVELOPE_INVALID", "D2E_EXECUTION_MEMORY_TRANSPORT_FAILED"].includes(
          error.code,
        ),
      );
      return true;
    });
  }

  const transport = options(t, { exec: async () => Promise.reject(new Error("spawn failed")) });
  await assertCode(
    consumeD2EExecutionMemory(transport.value),
    "D2E_EXECUTION_MEMORY_TRANSPORT_FAILED",
  );
});

import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import test from "node:test";
import {
  interpretTaskSessionDescriptor,
  requireTaskSessionProducer,
  taskSessionAdapterIdentity,
} from "../dist/task-session/producer-adapter.js";

function descriptor() {
  return {
    schema: "ak.task-session.descriptor.v1",
    platform: "linux",
    state: "enabled",
    reason: "configured",
    operations: ["plan", "supervise", "recover"],
    authority: false,
    database_opened: false,
    database_locked: false,
    worker_test_support: false,
    bindings: {
      policy_path: "/owned/example/policy/ak-runtime-access.json",
      policy_sha256: "5".repeat(64),
      policy_generation: "example-1",
      ordinary_binary: {
        path: "/owned/example/ordinary/ak-bin",
        sha256: "1".repeat(64),
        commit: "1".repeat(40),
      },
      worker: {
        path: "/owned/example/worker/ak-bin",
        sha256: "2".repeat(64),
        commit: "2".repeat(40),
        abi: "ak.task-session.worker.v2",
        manifest_path: "/owned/example/worker/pin-manifest.json",
        manifest_sha256: "3".repeat(64),
      },
      gate_path: "/owned/example/scripts/ak-runtime-gate.sh",
      gate_sha256: "4".repeat(64),
      binding_sha256: "4".repeat(64),
      deployment_schema_sha256: taskSessionAdapterIdentity.deploymentSchemaDigest,
      protocol_sha256: taskSessionAdapterIdentity.producerSchemaDigest,
      supervisor_sha256: "4".repeat(64),
      host_sha256: "4".repeat(64),
      host_build_digest: "4".repeat(64),
      database_selector_digest: "6".repeat(64),
    },
  };
}
test("descriptor facts require independently supplied expected bindings, never source status", () => {
  assert.throws(() => requireTaskSessionProducer(), /ak_producer_configuration_required/);
  const d = descriptor();
  assert.deepEqual(interpretTaskSessionDescriptor(d), d);
  assert.throws(() => requireTaskSessionProducer(d), /ak_producer_configuration_required/);
  assert.deepEqual(requireTaskSessionProducer(d, d.bindings), d.bindings);
  assert.equal(Object.hasOwn(taskSessionAdapterIdentity, "integrationReady"), false);
});
for (const [name, mutate] of Object.entries({
  disabled: (d) => {
    d.state = "disabled";
    d.operations = [];
  },
  recovery: (d) => {
    d.state = "recovery-only";
    d.operations = ["recover"];
  },
  unavailable: (d) => {
    d.state = "unavailable";
  },
  test_support: (d) => {
    d.worker_test_support = true;
  },
  unknown_support: (d) => {
    d.worker_test_support = null;
  },
  missing_supervise: (d) => {
    d.operations = ["plan"];
  },
  duplicate_operations: (d) => {
    d.operations = ["plan", "plan", "supervise"];
  },
  authority: (d) => {
    d.authority = true;
  },
  db_opened: (d) => {
    d.database_opened = true;
  },
  db_locked: (d) => {
    d.database_locked = true;
  },
  version: (d) => {
    d.schema = "unknown";
  },
  platform: (d) => {
    d.platform = "darwin";
  },
  abi: (d) => {
    d.bindings.worker.abi = "v1";
  },
  extra: (d) => {
    d.exec = "/bin/sh";
  },
  hash_format: (d) => {
    d.bindings.worker.sha256 += "suffix";
  },
  relative_path: (d) => {
    d.bindings.worker.path = "prefix/worker";
  },
  traversal: (d) => {
    d.bindings.worker.path = "/owned/a/../worker";
  },
  control_path: (d) => {
    d.bindings.worker.path = `/owned/worker${String.fromCharCode(10)}`;
  },
}))
  test(`owner descriptor refusal: ${name}`, () => {
    const d = descriptor(),
      expected = structuredClone(d.bindings);
    mutate(d);
    assert.throws(() => requireTaskSessionProducer(d, expected));
  });
for (const field of [
  "policy_sha256",
  "policy_generation",
  "gate_sha256",
  "host_sha256",
  "host_build_digest",
  "database_selector_digest",
])
  test(`owner expected binding mismatch: ${field}`, () => {
    const d = descriptor(),
      expected = structuredClone(d.bindings);
    expected[field] = field === "policy_generation" ? "another-generation" : "a".repeat(64);
    assert.throws(() => requireTaskSessionProducer(d, expected), /ak_producer_binding_mismatch/);
  });
for (const pin of ["ordinary_binary", "worker"])
  test(`separate ${pin} selection is independently bound`, () => {
    const d = descriptor(),
      expected = structuredClone(d.bindings);
    expected[pin].sha256 = "a".repeat(64);
    assert.throws(() => requireTaskSessionProducer(d, expected), /ak_producer_binding_mismatch/);
  });
for (const field of ["protocol_sha256", "deployment_schema_sha256"])
  test(`even matching publications cannot select unsupported ${field}`, () => {
    const d = descriptor();
    d.bindings[field] = "a".repeat(64);
    assert.throws(
      () => requireTaskSessionProducer(d, d.bindings),
      /ak_producer_protocol_incompatible/,
    );
  });

test("consumed owner contract bytes equal published compatibility pins", () => {
  for (const [name, expected] of [
    ["protocol", taskSessionAdapterIdentity.producerSchemaDigest],
    ["deployment", taskSessionAdapterIdentity.deploymentSchemaDigest],
  ])
    assert.equal(
      createHash("sha256")
        .update(
          readFileSync(
            new URL(`../dist/task-session/task-session-${name}-v1.json`, import.meta.url),
          ),
        )
        .digest("hex"),
      expected,
    );
});

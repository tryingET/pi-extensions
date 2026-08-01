import assert from "node:assert/strict";
import test from "node:test";
import {
  buildHandlerObservationRecord,
  HANDLER_OBSERVATION_PROTOCOL_REVISION,
  HANDLER_OBSERVATION_SCHEMA,
  tryBuildRecord,
} from "../src/semantic/handler-observation.ts";
import { jcsBytes } from "../src/semantic/prepared-runtime.ts";

const exactKeys = [
  "schema",
  "protocol_revision",
  "repository_id",
  "component_id",
  "package_name",
  "input_prompt_byte_length",
  "input_prompt_digest",
  "contribution_byte_length",
  "contribution_digest",
  "prepared_return_prompt_byte_length",
  "prepared_return_prompt_digest",
  "contribution_start_byte_offset",
  "contribution_end_byte_offset",
  "observation_outcome",
  "claim_scope",
  "host_acceptance_observed",
  "host_assignment_observed",
  "provider_transmission_observed",
  "model_input_observed",
  "callback_settlement_observed",
  "record_digest",
] as const;

test("known-answer raw and record digests use exact domains, lengths, and JCS omission", () => {
  const record = buildHandlerObservationRecord({
    input: "BASE",
    contribution: "\n\nBLOCK",
    output: "BASE\n\nBLOCK",
  });
  assert.equal(
    record.input_prompt_digest,
    "sha256:91c8f6921a468d0227e2311eaeafa92c70fcf7b708806751acd97dc8a284aba1",
  );
  assert.equal(
    record.contribution_digest,
    "sha256:78b5a34c6bed32775e22b8fc19b1578bae528aa5ba6e1c3a75ea1450dd9b54d9",
  );
  assert.equal(
    record.prepared_return_prompt_digest,
    "sha256:ea4be0180c6d90e2fc41d1d852c5790b13364bdac355890a70217f0bfafdbb79",
  );
  assert.equal(
    record.record_digest,
    "sha256:ef19c9cc232b7b1d23b42208fd4f0d7bff69c10c3d3551727955609be53da2b1",
  );
  for (const digest of [
    record.input_prompt_digest,
    record.contribution_digest,
    record.prepared_return_prompt_digest,
    record.record_digest,
  ])
    assert.match(digest, /^sha256:[0-9a-f]{64}$/);

  const { record_digest: omitted, ...preimage } = record;
  assert.equal(omitted, record.record_digest);
  const canonical = jcsBytes(preimage).toString("utf8");
  assert.equal(canonical.includes("record_digest"), false);
  assert.ok(canonical.startsWith('{"callback_settlement_observed":false'));
  assert.equal(
    jcsBytes({ "\ue000": "line\n\u0001", "\u{10000}": '"\\' }).toString("utf8"),
    '{"𐀀":"\\"\\\\","":"line\\n\\u0001"}',
  );
});

test("record has the exact frozen schema in RFC field order", () => {
  const record = buildHandlerObservationRecord({ input: "", contribution: "é", output: "é" });
  assert.deepEqual(Object.keys(record), exactKeys);
  assert.equal(record.schema, HANDLER_OBSERVATION_SCHEMA);
  assert.equal(record.protocol_revision, HANDLER_OBSERVATION_PROTOCOL_REVISION);
  assert.equal(record.input_prompt_byte_length, 0);
  assert.equal(record.contribution_byte_length, 2);
  assert.equal(record.contribution_start_byte_offset, 0);
  assert.equal(record.contribution_end_byte_offset, 2);
  assert.equal(record.callback_settlement_observed, false);
  assert.equal(Object.isFrozen(record), true);
  assert.throws(() => {
    (record as { repository_id: string }).repository_id = "changed";
  }, TypeError);
});

test("Unicode scalar sequences are preserved without normalization", () => {
  const decomposed = "e\u0301";
  const composed = "é";
  const record = buildHandlerObservationRecord({
    input: decomposed,
    contribution: composed,
    output: decomposed + composed,
  });
  assert.equal(record.input_prompt_byte_length, 3);
  assert.equal(record.contribution_byte_length, 2);
  assert.notEqual(record.input_prompt_digest, record.contribution_digest);
});

test("offset is the append operation boundary when contribution bytes repeat in input", () => {
  const record = buildHandlerObservationRecord({ input: "xx", contribution: "x", output: "xxx" });
  assert.equal(record.contribution_start_byte_offset, 2);
  assert.equal(record.contribution_end_byte_offset, 3);
});

test("empty contribution, wrong output, and lone surrogates are rejected", () => {
  assert.throws(
    () => buildHandlerObservationRecord({ input: "x", contribution: "", output: "x" }),
    /nonempty/,
  );
  assert.throws(
    () => buildHandlerObservationRecord({ input: "x", contribution: "y", output: "xy!" }),
    /exact append/,
  );
  for (const malformed of ["\ud800", "\udc00", "ok\ud800x"])
    assert.throws(
      () =>
        buildHandlerObservationRecord({
          input: malformed,
          contribution: "x",
          output: `${malformed}x`,
        }),
      /Unicode scalar/,
    );
});

test("builder output must exactly match the canonical record for the prepared return", () => {
  const result = { contribution: "x", output: "BASEx" };
  let inputWasFrozen = false;
  const accepted = tryBuildRecord(
    (input) => {
      inputWasFrozen = Object.isFrozen(input);
      return buildHandlerObservationRecord(input);
    },
    "BASE",
    result,
  );
  assert.equal(inputWasFrozen, true);
  assert.deepEqual(
    accepted,
    buildHandlerObservationRecord({ input: "BASE", contribution: "x", output: "BASEx" }),
  );

  const mismatched = buildHandlerObservationRecord({
    input: "OTHER",
    contribution: "x",
    output: "OTHERx",
  });
  for (const candidate of [{}, 1, "record", [], Object.freeze({}), mismatched, { ...accepted }])
    assert.equal(
      tryBuildRecord(() => candidate, "BASE", result),
      undefined,
    );
});

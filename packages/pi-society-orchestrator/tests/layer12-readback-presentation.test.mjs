import assert from "node:assert/strict";
import fs from "node:fs";
import test from "node:test";
import {
  presentLayer12Readback,
  validateLayer12PresentationEvidence,
} from "../src/runtime/layer12-readback-presentation.ts";

const h = (digit) => `sha256:${digit.repeat(64)}`;
const kinds = [
  "replay_closure",
  "currentness",
  "protected_state_equality",
  "authority",
  "provenance",
  "compatibility",
  "receipt_dag",
  "integrity",
  "selected_policy",
];
const checkerIds = {
  replay_closure: "task-c.replay-closure.v1",
  currentness: "task-c.currentness.v1",
  protected_state_equality: "task-c.protected-state-equality.v1",
  authority: "task-b.authority.v1",
  provenance: "task-d.provenance.v1",
  compatibility: "task-d.compatibility.v1",
  receipt_dag: "task-d.receipt-dag.v1",
  integrity: "task-d.integrity.v1",
  selected_policy: "task-d.selected-policy.v1",
};
const nonAuthorizations = [
  "no_activation",
  "no_apply",
  "no_owner_mutation",
  "no_policy_selection",
  "no_publication",
  "no_shadow_dispatch",
];
function receipt(kind, index) {
  return {
    check_result_id: h(String((index % 9) + 1)),
    core: {
      schema_version: 1,
      checker_id: checkerIds[kind],
      kind,
      subject_ids: [h("a")],
      outcome: "pass",
      reasons: [],
      next_action: "none",
    },
  };
}
function readback() {
  return {
    schema_version: 1,
    candidate_id: h("a"),
    eval_receipt_id: h("b"),
    snapshot_id: h("c"),
    observation_id: h("d"),
    check_results: kinds.map(receipt),
    candidate_disposition: "accepted",
    verifier_status: "legal",
    advisory_score: { quality: 1 },
    recommendation: null,
    failed_reasons: [],
    next_action: "await_verified_selected_policy_owner_evidence",
    explicit_non_authorizations: [...nonAuthorizations],
  };
}
function evidence() {
  return {
    schema_version: 1,
    evidence_id: h("1"),
    policy_candidate_id: h("2"),
    campaign_id: h("3"),
    observations: [
      {
        task_case_id: h("4"),
        rendered_variant_id: h("5"),
        comprehension_score: 87,
        observed_at: "2026-07-11T15:00:00Z",
        evaluator_receipt_id: h("6"),
      },
    ],
    selection_status: "not_selected",
    explicit_non_authorizations: [
      "no_activation",
      "no_apply",
      "no_policy_selection",
      "no_publication",
    ],
  };
}

test("deterministically renders complete AK readback as structural-only, never authorized", () => {
  const first = presentLayer12Readback(readback());
  const second = presentLayer12Readback(structuredClone(readback()));
  assert.deepEqual(first, second);
  assert.equal(first.status, "structurally_valid_non_authorizing");
  assert.equal(first.declaredCanonicalNextAction, "await_verified_selected_policy_owner_evidence");
  assert.equal(first.authorizationGranted, false);
  assert.equal(first.policySelected, false);
  assert.match(first.lines.at(-1), /no readiness or lifecycle authorization/i);
});

test("caller-controlled recommendation, missing gate, duplicates, and unknown fields fail closed", () => {
  for (const mutate of [
    (value) => {
      value.recommendation = "continue_current_execution_task";
    },
    (value) => {
      value.check_results.pop();
    },
    (value) => {
      value.check_results[1].core.kind = "replay_closure";
    },
    (value) => {
      value.ready_to_apply = true;
    },
    (value) => {
      value.explicit_non_authorizations.pop();
    },
    (value) => {
      value.next_action = "select_policy";
    },
    (value) => {
      value.advisory_score = "invalid";
    },
    (value) => {
      value.advisory_score = { quality: Number.POSITIVE_INFINITY };
    },
  ]) {
    const value = readback();
    mutate(value);
    const output = presentLayer12Readback(value);
    assert.equal(output.status, "unavailable");
    assert.equal(output.authorizationGranted, false);
    assert.equal(output.policySelected, false);
    assert.equal(output.declaredCanonicalNextAction, null);
  }
});

test("failing or unavailable canonical checks cannot render structural health", () => {
  for (const outcome of ["fail", "unavailable"]) {
    const value = readback();
    value.check_results[1].core.outcome = outcome;
    value.check_results[1].core.reasons = ["stale_observation"];
    value.check_results[1].core.next_action = "recapture_observation";
    value.failed_reasons = ["stale_observation"];
    const output = presentLayer12Readback(value);
    assert.equal(
      output.status,
      outcome === "fail" ? "blocked" : "unavailable",
      JSON.stringify(output),
    );
    assert.equal(output.authorizationGranted, false);
  }
});

test("presentation evidence validates structure but can never select policy or authorize", () => {
  const valid = validateLayer12PresentationEvidence(evidence());
  assert.deepEqual(valid, {
    status: "structurally_valid_not_authorized",
    reasons: [],
    policySelected: false,
    authorizationGranted: false,
  });
  const leapSecond = evidence();
  leapSecond.observations[0].observed_at = "1990-12-31T23:59:60Z";
  assert.equal(
    validateLayer12PresentationEvidence(leapSecond).status,
    "structurally_valid_not_authorized",
  );
  const lowercaseDateTime = evidence();
  lowercaseDateTime.observations[0].observed_at = "2026-07-11t15:00:00z";
  assert.equal(
    validateLayer12PresentationEvidence(lowercaseDateTime).status,
    "structurally_valid_not_authorized",
  );
  for (const mutate of [
    (value) => {
      value.selection_status = "selected";
    },
    (value) => {
      value.authorized = true;
    },
    (value) => {
      value.observations[0].comprehension_score = 101;
    },
    (value) => {
      value.explicit_non_authorizations.pop();
    },
    (value) => {
      value.observations[0].observed_at = "2026-07-11";
    },
    (value) => {
      value.observations[0].observed_at = "2026-02-30T15:00:00Z";
    },
    (value) => {
      value.observations[0].observed_at = "2026-07-11T15:00:60Z";
    },
  ]) {
    const value = evidence();
    mutate(value);
    const result = validateLayer12PresentationEvidence(value);
    assert.equal(result.status, "invalid");
    assert.equal(result.policySelected, false);
    assert.equal(result.authorizationGranted, false);
  }
});

test("checked-in evidence schema remains closed and explicitly non-selecting", () => {
  const schema = JSON.parse(
    fs.readFileSync(
      new URL("../policy/layer12-presentation-evidence.v1.schema.json", import.meta.url),
      "utf8",
    ),
  );
  assert.equal(schema.additionalProperties, false);
  assert.deepEqual(schema.properties.selection_status, { const: "not_selected" });
  assert.equal(schema.$defs.observation.additionalProperties, false);
  assert.match(JSON.stringify(schema), /no_policy_selection/);
});

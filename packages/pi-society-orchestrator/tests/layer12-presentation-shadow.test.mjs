import assert from "node:assert/strict";
import test from "node:test";
import {
  buildCases,
  buildPreregistration,
  executeShadow,
  loadBundle,
  verifyShadowBundle,
} from "../scripts/check-layer12-presentation-shadow.mjs";

test("checked-in IW14-A G3 shadow bundle is reproducible and non-authorizing", () => {
  const summary = verifyShadowBundle(loadBundle());
  assert.equal(summary.status, "pass");
  assert.equal(summary.cases, 3);
});

test("shadow spans healthy, blocked, and unavailable canonical readback postures", () => {
  const cases = buildCases();
  assert.deepEqual(
    cases.cases.map((entry) => entry.expected_answer),
    [
      { display_status: "structurally_valid_non_authorizing", authorization_granted: false },
      { display_status: "blocked", authorization_granted: false },
      { display_status: "unavailable", authorization_granted: false },
    ],
  );
  const preregistration = buildPreregistration(cases);
  const result = executeShadow(cases, preregistration);
  assert.equal(result.aggregate.exact_matches, 3);
  assert.equal(result.aggregate.mean_comprehension_score, 100);
  assert.equal(result.evidence.selection_status, "not_selected");
  assert.equal(result.aggregate.policy_selection, "not_authorized");
});

test("content, preregistration, and evaluator receipt drift fail closed", () => {
  for (const mutate of [
    (bundle) => {
      bundle.casesBundle.cases[0].expected_answer.authorization_granted = true;
    },
    (bundle) => {
      bundle.preregistration.evaluator_spec.scoring = "caller selected";
    },
    (bundle) => {
      bundle.result.evaluator_receipts[0].core.comprehension_score = 99;
    },
    (bundle) => {
      bundle.result.evidence.selection_status = "selected";
    },
  ]) {
    const bundle = structuredClone(loadBundle());
    mutate(bundle);
    assert.throws(() => verifyShadowBundle(bundle));
  }
});

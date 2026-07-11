#!/usr/bin/env node
/** Deterministic IW14-A Pi presentation shadow. Synthetic machine evidence; never policy selection. */
import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import {
  presentLayer12Readback,
  validateLayer12PresentationEvidence,
} from "../src/runtime/layer12-readback-presentation.ts";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const FIXTURES = path.join(ROOT, "policy/fixtures");
const ADAPTER_PATH = path.join(ROOT, "src/runtime/layer12-readback-presentation.ts");
const PATHS = {
  cases: path.join(FIXTURES, "layer12-presentation-shadow-cases.v1.json"),
  preregistration: path.join(FIXTURES, "layer12-presentation-shadow-preregistration.v1.json"),
  result: path.join(FIXTURES, "layer12-presentation-shadow-result.v1.json"),
};
const NON_AUTHORIZATIONS = ["no_activation", "no_apply", "no_policy_selection", "no_publication"];
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

export function canonical(value) {
  if (Array.isArray(value)) return `[${value.map(canonical).join(",")}]`;
  if (value && typeof value === "object")
    return `{${Object.keys(value)
      .sort()
      .map((key) => `${JSON.stringify(key)}:${canonical(value[key])}`)
      .join(",")}}`;
  return JSON.stringify(value);
}
export function cid(domain, value) {
  return `sha256:${createHash("sha256")
    .update(`${domain}\0${canonical(value)}`)
    .digest("hex")}`;
}
function baseReadback() {
  const candidate = cid("pi-synthetic-task-c-shape-candidate-v1", {
    token: "continue_current_execution_task",
  });
  return {
    schema_version: 1,
    candidate_id: candidate,
    eval_receipt_id: cid("pi-synthetic-task-c-shape-eval-receipt-v1", { candidate }),
    snapshot_id: cid("pi-synthetic-task-c-shape-snapshot-v1", { candidate }),
    observation_id: cid("pi-synthetic-task-c-shape-observation-v1", { candidate }),
    check_results: kinds.map((kind) => {
      const core = {
        schema_version: 1,
        checker_id: checkerIds[kind],
        kind,
        subject_ids: [candidate],
        outcome: "pass",
        reasons: [],
        next_action: "none",
      };
      return { check_result_id: cid("pi-synthetic-task-c-shape-check-result-v1", core), core };
    }),
    candidate_disposition: "accepted",
    verifier_status: "legal",
    advisory_score: { structural_quality: 1 },
    recommendation: null,
    failed_reasons: [],
    next_action: "await_verified_selected_policy_owner_evidence",
    explicit_non_authorizations: [
      "no_activation",
      "no_apply",
      "no_owner_mutation",
      "no_policy_selection",
      "no_publication",
      "no_shadow_dispatch",
    ],
  };
}
function caseRecord(label, readback, expectedStatus) {
  const core = {
    schema_version: 1,
    label,
    source_contract: "synthetic-shape/agent-kernel-task-c/layer12-replay-readback.v1",
    readback,
    comprehension_prompt:
      "Identify the Pi display status and whether lifecycle authorization was granted.",
    expected_answer: { display_status: expectedStatus, authorization_granted: false },
  };
  return { case_id: cid("pi-layer12-presentation-shadow-case-v1", core), ...core };
}
export function buildCases() {
  const healthy = baseReadback();
  const blocked = structuredClone(healthy);
  blocked.check_results[1].core.outcome = "fail";
  blocked.check_results[1].core.reasons = ["stale_observation"];
  blocked.check_results[1].core.next_action = "recapture_observation";
  blocked.check_results[1].check_result_id = cid(
    "pi-synthetic-task-c-shape-check-result-v1",
    blocked.check_results[1].core,
  );
  blocked.failed_reasons = ["stale_observation"];
  blocked.candidate_disposition = "rejected";
  blocked.verifier_status = "blocked";
  const unavailable = structuredClone(healthy);
  unavailable.check_results[8].core.outcome = "unavailable";
  unavailable.check_results[8].core.reasons = ["policy_invalid"];
  unavailable.check_results[8].core.next_action = "select_policy";
  unavailable.check_results[8].check_result_id = cid(
    "pi-synthetic-task-c-shape-check-result-v1",
    unavailable.check_results[8].core,
  );
  unavailable.failed_reasons = ["policy_invalid"];
  unavailable.candidate_disposition = "unavailable";
  unavailable.verifier_status = "unavailable";
  const cases = [
    caseRecord(
      "accepted-structural-non-authorizing",
      healthy,
      "structurally_valid_non_authorizing",
    ),
    caseRecord("blocked-stale-observation", blocked, "blocked"),
    caseRecord("unavailable-selected-policy-evidence", unavailable, "unavailable"),
  ];
  const core = {
    schema_version: 1,
    fixture_authority: "pi_synthetic_shape_only",
    source_schema_commit: "581276c",
    source_legality_claimed: false,
    cases,
  };
  return { cases_id: cid("pi-layer12-presentation-shadow-cases-v1", core), ...core };
}
export function buildPreregistration(casesBundle) {
  const campaignId = cid("pi-layer12-presentation-shadow-campaign-v1", {
    wave: "SF14/IW14-A",
    gate: "G3",
    task: 3724,
  });
  const core = {
    schema_version: 1,
    campaign_id: campaignId,
    cases_id: casesBundle.cases_id,
    planned_at: "2026-07-11T16:20:00Z",
    execution_mode: "deterministic_machine_shadow",
    evaluator_spec: {
      evaluator_id: "pi.presentation-status-comprehension.v1",
      scoring:
        "100 iff rendered status and authorizationGranted exactly match preregistered answer; otherwise 0",
      declared_limit:
        "Synthetic machine comprehension only; not human comprehension or global empirical policy evidence.",
    },
    required_case_ids: casesBundle.cases.map((entry) => entry.case_id),
    selection_status: "not_selected",
    explicit_non_authorizations: NON_AUTHORIZATIONS,
  };
  return {
    preregistration_id: cid("pi-layer12-presentation-shadow-preregistration-v1", core),
    ...core,
  };
}
export function executeShadow(casesBundle, preregistration) {
  const observedAt = "2026-07-11T16:21:00Z";
  const evaluatorReceipts = casesBundle.cases.map((entry) => {
    const presentation = presentLayer12Readback(entry.readback);
    const observedAnswer = {
      display_status: presentation.status,
      authorization_granted: presentation.authorizationGranted,
    };
    const score = canonical(observedAnswer) === canonical(entry.expected_answer) ? 100 : 0;
    const core = {
      schema_version: 1,
      evaluator_id: preregistration.evaluator_spec.evaluator_id,
      preregistration_id: preregistration.preregistration_id,
      task_case_id: entry.case_id,
      rendered_variant_id: cid("pi-layer12-rendered-variant-v1", presentation),
      observed_answer: observedAnswer,
      expected_answer: entry.expected_answer,
      comprehension_score: score,
      observed_at: observedAt,
      evaluator_kind: "synthetic_deterministic_machine",
      authorization_granted: false,
      policy_selected: false,
    };
    return {
      evaluator_receipt_id: cid("pi-layer12-presentation-evaluator-receipt-v1", core),
      core,
    };
  });
  const adapterBytesSha256 = `sha256:${createHash("sha256").update(fs.readFileSync(ADAPTER_PATH)).digest("hex")}`;
  const policyCandidateId = cid("pi-layer12-presentation-policy-candidate-v1", {
    implementation_commit: "a008c134",
    adapter: "src/runtime/layer12-readback-presentation.ts",
    adapter_bytes_sha256: adapterBytesSha256,
  });
  const evidenceCore = {
    schema_version: 1,
    policy_candidate_id: policyCandidateId,
    campaign_id: preregistration.campaign_id,
    observations: evaluatorReceipts.map(({ evaluator_receipt_id, core }) => ({
      task_case_id: core.task_case_id,
      rendered_variant_id: core.rendered_variant_id,
      comprehension_score: core.comprehension_score,
      observed_at: core.observed_at,
      evaluator_receipt_id,
    })),
    selection_status: "not_selected",
    explicit_non_authorizations: NON_AUTHORIZATIONS,
  };
  const evidence = {
    schema_version: 1,
    evidence_id: cid("pi-layer12-presentation-evidence-v1", evidenceCore),
    policy_candidate_id: evidenceCore.policy_candidate_id,
    campaign_id: evidenceCore.campaign_id,
    observations: evidenceCore.observations,
    selection_status: evidenceCore.selection_status,
    explicit_non_authorizations: evidenceCore.explicit_non_authorizations,
  };
  const core = {
    schema_version: 1,
    preregistration_id: preregistration.preregistration_id,
    cases_id: casesBundle.cases_id,
    evidence,
    evaluator_receipts: evaluatorReceipts,
    executed_adapter_bytes_sha256: adapterBytesSha256,
    aggregate: {
      cases_run: evaluatorReceipts.length,
      exact_matches: evaluatorReceipts.filter((receipt) => receipt.core.comprehension_score === 100)
        .length,
      mean_comprehension_score:
        evaluatorReceipts.reduce((sum, receipt) => sum + receipt.core.comprehension_score, 0) /
        evaluatorReceipts.length,
      evidence_status: "structurally_valid_not_authorized",
      policy_selection: "not_authorized",
      declared_limit: "Synthetic deterministic presentation-shadow evidence only.",
    },
    explicit_non_authorizations: NON_AUTHORIZATIONS,
  };
  return { result_id: cid("pi-layer12-presentation-shadow-result-v1", core), ...core };
}
function verifyIds(casesBundle, preregistration, result) {
  const rebuiltCases = buildCases();
  assert.deepEqual(casesBundle, rebuiltCases, "case corpus identity/content drift");
  assert.deepEqual(
    preregistration,
    buildPreregistration(casesBundle),
    "preregistration identity/content drift",
  );
  assert.deepEqual(
    result,
    executeShadow(casesBundle, preregistration),
    "result or receipt identity/content drift",
  );
}
export function verifyShadowBundle({ casesBundle, preregistration, result }) {
  verifyIds(casesBundle, preregistration, result);
  assert.deepEqual(
    preregistration.required_case_ids,
    casesBundle.cases.map((entry) => entry.case_id),
  );
  assert.equal(result.aggregate.cases_run, 3);
  assert.equal(result.aggregate.exact_matches, 3);
  assert.equal(result.aggregate.mean_comprehension_score, 100);
  assert.equal(result.aggregate.policy_selection, "not_authorized");
  assert.deepEqual(result.explicit_non_authorizations, NON_AUTHORIZATIONS);
  assert.deepEqual(validateLayer12PresentationEvidence(result.evidence), {
    status: "structurally_valid_not_authorized",
    reasons: [],
    policySelected: false,
    authorizationGranted: false,
  });
  for (const receipt of result.evaluator_receipts) {
    assert.equal(receipt.core.authorization_granted, false);
    assert.equal(receipt.core.policy_selected, false);
    assert.equal(
      receipt.evaluator_receipt_id,
      cid("pi-layer12-presentation-evaluator-receipt-v1", receipt.core),
    );
  }
  return {
    status: "pass",
    result_id: result.result_id,
    evidence_id: result.evidence.evidence_id,
    cases: 3,
  };
}
export function loadBundle() {
  return {
    casesBundle: JSON.parse(fs.readFileSync(PATHS.cases, "utf8")),
    preregistration: JSON.parse(fs.readFileSync(PATHS.preregistration, "utf8")),
    result: JSON.parse(fs.readFileSync(PATHS.result, "utf8")),
  };
}
function writeBundle() {
  fs.mkdirSync(FIXTURES, { recursive: true });
  const casesBundle = buildCases();
  const preregistration = buildPreregistration(casesBundle);
  const result = executeShadow(casesBundle, preregistration);
  for (const [name, value] of Object.entries({ cases: casesBundle, preregistration, result }))
    fs.writeFileSync(PATHS[name], `${JSON.stringify(value, null, 2)}\n`);
}
if (process.argv[1] === fileURLToPath(import.meta.url)) {
  if (process.argv.includes("--write")) writeBundle();
  const summary = verifyShadowBundle(loadBundle());
  console.log(JSON.stringify(summary));
}

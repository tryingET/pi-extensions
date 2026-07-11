/** Pure Pi-owned validation and presentation for AK Layer-12 readback. No I/O or mutation. */

const CHECK_KINDS = [
  "replay_closure",
  "currentness",
  "protected_state_equality",
  "authority",
  "provenance",
  "compatibility",
  "receipt_dag",
  "integrity",
  "selected_policy",
] as const;
const CHECKER_IDS: Record<(typeof CHECK_KINDS)[number], string> = {
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
const FAILURE_CONTRACT: Record<
  (typeof CHECK_KINDS)[number],
  { reasons: readonly string[]; nextAction: string }
> = {
  replay_closure: {
    reasons: ["undeclared_read", "missing_read", "identity_drift"],
    nextAction: "reexecute_instrumented_replay",
  },
  currentness: {
    reasons: ["stale_observation", "identity_drift"],
    nextAction: "recapture_observation",
  },
  protected_state_equality: {
    reasons: ["protected_state_changed", "global_coverage_unavailable"],
    nextAction: "repair_candidate",
  },
  authority: { reasons: ["authority_invalid"], nextAction: "repair_candidate" },
  provenance: { reasons: ["provenance_invalid"], nextAction: "verify_provenance" },
  compatibility: { reasons: ["compatibility_invalid"], nextAction: "repair_candidate" },
  receipt_dag: { reasons: ["receipt_dag_invalid"], nextAction: "inspect_receipt_dag" },
  integrity: { reasons: ["integrity_invalid"], nextAction: "repair_candidate" },
  selected_policy: { reasons: ["policy_invalid"], nextAction: "select_policy" },
};
const NON_AUTHORIZATIONS = [
  "no_activation",
  "no_apply",
  "no_owner_mutation",
  "no_policy_selection",
  "no_publication",
  "no_shadow_dispatch",
] as const;
const NEXT_ACTIONS = new Set([
  "recapture_observation",
  "reexecute_instrumented_replay",
  "repair_candidate",
  "verify_provenance",
  "select_policy",
  "inspect_receipt_dag",
  "await_verified_selected_policy_owner_evidence",
  "none",
]);
const OUTCOMES = new Set(["pass", "fail", "unavailable"]);
const DISPOSITIONS = new Set(["accepted", "rejected", "malformed", "unavailable"]);
const VERIFIER_STATUSES = new Set(["legal", "blocked", "malformed", "unavailable"]);
const HASH = /^sha256:[0-9a-f]{64}$/;

type RecordValue = Record<string, unknown>;

export interface Layer12Presentation {
  status: "structurally_valid_non_authorizing" | "blocked" | "unavailable";
  title: "SF14 Layer-12 generated-program readback";
  candidateId: string | null;
  declaredCanonicalNextAction: string | null;
  lines: string[];
  nonAuthorizations: string[];
  authorizationGranted: false;
  policySelected: false;
}

export interface Layer12PresentationEvidenceResult {
  status: "structurally_valid_not_authorized" | "invalid";
  reasons: string[];
  policySelected: false;
  authorizationGranted: false;
}

function record(value: unknown): value is RecordValue {
  return !!value && typeof value === "object" && !Array.isArray(value);
}

function exactKeys(value: RecordValue, keys: readonly string[]): boolean {
  const actual = Object.keys(value).sort();
  const expected = [...keys].sort();
  return actual.length === expected.length && actual.every((key, index) => key === expected[index]);
}

function uniqueExactStrings(value: unknown, expected: readonly string[]): boolean {
  return (
    Array.isArray(value) &&
    value.length === expected.length &&
    new Set(value).size === value.length &&
    expected.every((item) => value.includes(item))
  );
}

function isStrictRfc3339(value: unknown): value is string {
  if (typeof value !== "string") return false;
  const match =
    /^(\d{4})-(\d{2})-(\d{2})t(\d{2}):(\d{2}):(\d{2})(?:\.\d+)?(?:z|([+-])(\d{2}):(\d{2}))$/i.exec(
      value,
    );
  if (!match) return false;
  const [
    ,
    year,
    month,
    day,
    hour,
    minute,
    second,
    offsetSign,
    offsetHour = "00",
    offsetMinute = "00",
  ] = match;
  const parts = [year, month, day, hour, minute, second, offsetHour, offsetMinute].map(Number);
  const [y, mo, d, h, mi, s, oh, om] = parts;
  if (h > 23 || mi > 59 || s > 60 || oh > 23 || om > 59) return false;
  const calendarSecond = Math.min(s, 59);
  const calendar = new Date(Date.UTC(y, mo - 1, d, h, mi, calendarSecond));
  const validCalendar =
    calendar.getUTCFullYear() === y &&
    calendar.getUTCMonth() === mo - 1 &&
    calendar.getUTCDate() === d &&
    calendar.getUTCHours() === h &&
    calendar.getUTCMinutes() === mi &&
    calendar.getUTCSeconds() === calendarSecond;
  if (!validCalendar) return false;
  if (s !== 60) return !Number.isNaN(Date.parse(value));
  const offsetMinutes = (oh * 60 + om) * (offsetSign === "-" ? -1 : 1);
  const utcLeapPosition = new Date(calendar.getTime() - offsetMinutes * 60_000);
  return (
    utcLeapPosition.getUTCHours() === 23 &&
    utcLeapPosition.getUTCMinutes() === 59 &&
    ((utcLeapPosition.getUTCMonth() === 5 && utcLeapPosition.getUTCDate() === 30) ||
      (utcLeapPosition.getUTCMonth() === 11 && utcLeapPosition.getUTCDate() === 31))
  );
}

function invalidPresentation(
  reason: string,
  candidateId: string | null = null,
): Layer12Presentation {
  return {
    status: "unavailable",
    title: "SF14 Layer-12 generated-program readback",
    candidateId,
    declaredCanonicalNextAction: null,
    lines: [`Readback unavailable: ${reason}.`, "No lifecycle authorization is implied."],
    nonAuthorizations: [...NON_AUTHORIZATIONS],
    authorizationGranted: false,
    policySelected: false,
  };
}

/**
 * Validate the closed AK Task-C readback shape and produce deterministic display data.
 * This adapter deliberately does not recompute AK receipt identities or grant authority.
 */
export function presentLayer12Readback(input: unknown): Layer12Presentation {
  if (!record(input)) return invalidPresentation("input is not an object");
  const keys = [
    "schema_version",
    "candidate_id",
    "eval_receipt_id",
    "snapshot_id",
    "observation_id",
    "check_results",
    "candidate_disposition",
    "verifier_status",
    "advisory_score",
    "recommendation",
    "failed_reasons",
    "next_action",
    "explicit_non_authorizations",
  ];
  const candidateId =
    typeof input.candidate_id === "string" && HASH.test(input.candidate_id)
      ? input.candidate_id
      : null;
  if (!exactKeys(input, keys))
    return invalidPresentation("readback fields are not closed", candidateId);
  if (
    input.schema_version !== 1 ||
    !candidateId ||
    typeof input.eval_receipt_id !== "string" ||
    !HASH.test(input.eval_receipt_id) ||
    typeof input.snapshot_id !== "string" ||
    !HASH.test(input.snapshot_id) ||
    typeof input.observation_id !== "string" ||
    !HASH.test(input.observation_id)
  )
    return invalidPresentation("identity or schema version is invalid", candidateId);
  if (
    !DISPOSITIONS.has(String(input.candidate_disposition)) ||
    !VERIFIER_STATUSES.has(String(input.verifier_status))
  ) {
    return invalidPresentation("candidate or verifier state is unknown", candidateId);
  }
  if (input.next_action !== "await_verified_selected_policy_owner_evidence")
    return invalidPresentation(
      "aggregate next action is not the closed Task-C non-authorizing action",
      candidateId,
    );
  if (input.recommendation !== null)
    return invalidPresentation("recommendation is not AK-suppressed", candidateId);
  if (
    input.advisory_score !== null &&
    (!record(input.advisory_score) ||
      Object.values(input.advisory_score).some(
        (score) => typeof score !== "number" || !Number.isFinite(score),
      ))
  ) {
    return invalidPresentation("advisory score is malformed", candidateId);
  }
  if (
    !Array.isArray(input.failed_reasons) ||
    !input.failed_reasons.every((reason) => typeof reason === "string")
  ) {
    return invalidPresentation("failure reasons are malformed", candidateId);
  }
  if (!uniqueExactStrings(input.explicit_non_authorizations, NON_AUTHORIZATIONS)) {
    return invalidPresentation("non-authorization inventory is incomplete", candidateId);
  }
  if (!Array.isArray(input.check_results) || input.check_results.length !== CHECK_KINDS.length) {
    return invalidPresentation("checker inventory is incomplete", candidateId);
  }
  const seen = new Set<string>();
  const outcomes = new Map<string, string>();
  let hasUnavailable = false;
  let hasFailure = false;
  const derivedReasons: string[] = [];
  for (const receipt of input.check_results) {
    if (
      !record(receipt) ||
      !exactKeys(receipt, ["check_result_id", "core"]) ||
      typeof receipt.check_result_id !== "string" ||
      !HASH.test(receipt.check_result_id) ||
      !record(receipt.core)
    ) {
      return invalidPresentation("checker receipt is malformed", candidateId);
    }
    const core = receipt.core;
    if (
      !exactKeys(core, [
        "schema_version",
        "checker_id",
        "kind",
        "subject_ids",
        "outcome",
        "reasons",
        "next_action",
      ])
    ) {
      return invalidPresentation("checker core fields are not closed", candidateId);
    }
    const kind = String(core.kind);
    if (!CHECK_KINDS.includes(kind as (typeof CHECK_KINDS)[number]) || seen.has(kind)) {
      return invalidPresentation("checker kinds are unknown or duplicated", candidateId);
    }
    seen.add(kind);
    const typedKind = kind as (typeof CHECK_KINDS)[number];
    if (
      core.schema_version !== 1 ||
      core.checker_id !== CHECKER_IDS[typedKind] ||
      !Array.isArray(core.subject_ids) ||
      core.subject_ids.length === 0 ||
      !core.subject_ids.every((subject) => typeof subject === "string" && HASH.test(subject))
    ) {
      return invalidPresentation("checker identity or subjects are malformed", candidateId);
    }
    const outcome = String(core.outcome);
    outcomes.set(kind, outcome);
    if (
      !OUTCOMES.has(outcome) ||
      !NEXT_ACTIONS.has(String(core.next_action)) ||
      !Array.isArray(core.reasons) ||
      !core.reasons.every((reason) => typeof reason === "string")
    ) {
      return invalidPresentation("checker outcome is malformed", candidateId);
    }
    if (outcome === "pass" && (core.reasons.length !== 0 || core.next_action !== "none")) {
      return invalidPresentation("passing checker carries failure remediation", candidateId);
    }
    if (outcome !== "pass") {
      const contract = FAILURE_CONTRACT[typedKind];
      if (
        core.reasons.length === 0 ||
        core.reasons.some((reason) => !contract.reasons.includes(String(reason))) ||
        core.next_action !== contract.nextAction
      ) {
        return invalidPresentation("non-passing checker violates closed remediation", candidateId);
      }
    }
    if (outcome === "unavailable") hasUnavailable = true;
    if (outcome === "fail") hasFailure = true;
    if (outcome !== "pass") derivedReasons.push(...(core.reasons as string[]));
  }
  if (seen.size !== CHECK_KINDS.length)
    return invalidPresentation("checker inventory is not exhaustive", candidateId);
  const declaredReasons = [...(input.failed_reasons as string[])].sort();
  if ([...derivedReasons].sort().join("\u0000") !== declaredReasons.join("\u0000")) {
    return invalidPresentation("declared failures disagree with checker outcomes", candidateId);
  }
  const structurallyValid =
    !hasFailure &&
    !hasUnavailable &&
    input.candidate_disposition === "accepted" &&
    input.verifier_status === "legal";
  const status = structurallyValid
    ? "structurally_valid_non_authorizing"
    : hasUnavailable
      ? "unavailable"
      : "blocked";
  const outcomeLines = CHECK_KINDS.map((kind) => `${kind}: ${outcomes.get(kind)}`);
  return {
    status,
    title: "SF14 Layer-12 generated-program readback",
    candidateId,
    declaredCanonicalNextAction: String(input.next_action),
    lines: [
      `Candidate: ${candidateId}`,
      ...outcomeLines,
      `Declared canonical field (not independently authenticated by Pi): ${String(input.next_action)}`,
      "Pi reports structural conformance only; no readiness or lifecycle authorization is implied.",
    ],
    nonAuthorizations: [...NON_AUTHORIZATIONS],
    authorizationGranted: false,
    policySelected: false,
  };
}

/** Validate Pi-owned evidence shape only. Selection and authorization are always false. */
export function validateLayer12PresentationEvidence(
  input: unknown,
): Layer12PresentationEvidenceResult {
  const reasons: string[] = [];
  if (
    !record(input) ||
    !exactKeys(input, [
      "schema_version",
      "evidence_id",
      "policy_candidate_id",
      "campaign_id",
      "observations",
      "selection_status",
      "explicit_non_authorizations",
    ])
  ) {
    return {
      status: "invalid",
      reasons: ["evidence fields are not closed"],
      policySelected: false,
      authorizationGranted: false,
    };
  }
  if (input.schema_version !== 1) reasons.push("unknown schema version");
  for (const key of ["evidence_id", "policy_candidate_id", "campaign_id"] as const) {
    if (typeof input[key] !== "string" || !HASH.test(input[key] as string))
      reasons.push(`${key} is not a content reference`);
  }
  if (input.selection_status !== "not_selected")
    reasons.push("selection status must remain not_selected");
  const evidenceNonAuth = ["no_activation", "no_apply", "no_policy_selection", "no_publication"];
  if (!uniqueExactStrings(input.explicit_non_authorizations, evidenceNonAuth))
    reasons.push("evidence non-authorizations are incomplete");
  if (!Array.isArray(input.observations) || input.observations.length === 0)
    reasons.push("observations are missing");
  else
    for (const observation of input.observations) {
      if (
        !record(observation) ||
        !exactKeys(observation, [
          "task_case_id",
          "rendered_variant_id",
          "comprehension_score",
          "observed_at",
          "evaluator_receipt_id",
        ])
      ) {
        reasons.push("observation fields are not closed");
        continue;
      }
      if (
        typeof observation.task_case_id !== "string" ||
        !HASH.test(observation.task_case_id) ||
        typeof observation.rendered_variant_id !== "string" ||
        !HASH.test(observation.rendered_variant_id) ||
        typeof observation.evaluator_receipt_id !== "string" ||
        !HASH.test(observation.evaluator_receipt_id)
      )
        reasons.push("observation references are invalid");
      if (
        !Number.isInteger(observation.comprehension_score) ||
        (observation.comprehension_score as number) < 0 ||
        (observation.comprehension_score as number) > 100
      )
        reasons.push("comprehension score is invalid");
      if (!isStrictRfc3339(observation.observed_at)) reasons.push("observation time is invalid");
    }
  return {
    status: reasons.length ? "invalid" : "structurally_valid_not_authorized",
    reasons,
    policySelected: false,
    authorizationGranted: false,
  };
}

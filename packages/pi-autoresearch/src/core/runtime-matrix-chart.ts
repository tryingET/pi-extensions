import { createHash } from "node:crypto";
import path from "node:path";
import { validateAutoresearchAdapterPacket } from "./runtime-adapter.ts";
import {
  getArrayField as arr,
  getNumberField as num,
  getRecordField as rec,
  record,
  getStringField as str,
} from "./runtime-matrix-fields.ts";
import {
  classifyAutoresearchDashboardOutcomeClass,
  type DashboardAttempt,
  type DashboardCampaign,
  type DashboardComparisonGroup,
  type DashboardMeasurementIdentity,
} from "./runtime-matrix-model.ts";
import { parseRunProtocol, parseRunProvenance } from "./runtime-provenance.ts";

export function digest(value: unknown): string {
  return createHash("sha256").update(JSON.stringify(value)).digest("hex");
}
export function bindingIdentity(binding: unknown): string | null {
  const fields = ["source", "worktreePath", "branch", "baseRef", "diffSummary"].map((key) =>
    str(binding, key),
  );
  const files = arr(binding, "filesChanged");
  return fields.every(Boolean) && files.every((v) => typeof v === "string")
    ? JSON.stringify([...fields, [...files].sort()])
    : null;
}

export function comparisonIdentity(
  closeout: unknown,
  run: unknown,
  scenario: string | null,
): DashboardMeasurementIdentity {
  const candidate = rec(rec(run, "experiment"), "candidate");
  const direction = str(closeout, "direction");
  const base = str(candidate, "baseRef");
  let measured = null;
  let execution = null;
  try {
    measured = parseRunProvenance(record(run)?.provenance)?.measurement ?? null;
    execution = parseRunProtocol(run) ?? null;
  } catch {
    /* Malformed source remains unscoreable in projectAttempt/owner validation. */
  }
  const benchmark = str(run, "benchmarkCommand");
  const checks = record(run)?.checksCommand;
  const expectedCwd = str(candidate, "worktreePath");
  const protocolKnown =
    !!execution &&
    !!benchmark &&
    (typeof checks === "string" || checks === null) &&
    (!expectedCwd || path.resolve(str(closeout, "cwd") ?? "", expectedCwd) === execution.cwd) &&
    execution.benchmark.exitCode === 0 &&
    !execution.benchmark.timedOut &&
    !execution.benchmark.aborted &&
    execution.benchmark.outputLimitExceeded === false &&
    ((checks === null && execution.checks.state === "disabled") ||
      (typeof checks === "string" &&
        !!checks &&
        execution.checks.state === "passed" &&
        execution.checks.exitCode === 0 &&
        !execution.checks.timedOut &&
        execution.checks.outputLimitExceeded === false &&
        !execution.checks.aborted));
  return {
    metricName: str(closeout, "metricName"),
    metricUnit:
      typeof record(closeout)?.metricUnit === "string"
        ? (record(closeout)?.metricUnit as string)
        : null,
    direction: direction === "lower" || direction === "higher" ? direction : null,
    // A planned scenario is not observed workload provenance.
    scenario:
      measured && (scenario === null || measured.scenario === scenario)
        ? JSON.stringify([measured.scenario, measured.workloadRevision])
        : null,
    subject:
      measured && bindingIdentity(candidate)
        ? JSON.stringify([bindingIdentity(candidate), measured.subject, measured.subjectRevision])
        : bindingIdentity(candidate),
    // Mutable branch names are not pinned evaluator/base identity.
    base: base && /^(?:[a-f0-9]{40}|[a-f0-9]{64})$/i.test(base) ? base : null,
    // Pinned owner declarations plus actual invocation summaries; still unauthenticated.
    evaluator:
      measured && protocolKnown
        ? JSON.stringify([
            measured.evaluator,
            measured.evaluatorRevision,
            benchmark,
            checks,
            execution?.cwd,
          ])
        : null,
  };
}
export function comparisonReasons(identity: DashboardMeasurementIdentity): string[] {
  return Object.entries(identity)
    .filter(([, value]) => value === null)
    .map(([key]) => `Unknown ${key}; comparison withheld.`);
}

/** Project reports without authenticating them or reimplementing the empirical evaluator. */
export function projectAttempt(input: {
  run: unknown;
  closeout: unknown;
  source: string;
  schemaValid: boolean;
  schemaIssues?: string[];
  scenario: string | null;
  requireCandidate: boolean;
  packetCandidate?: unknown;
  verificationReport?: string;
}): DashboardAttempt {
  const { run, closeout } = input;
  const status = str(run, "status") ?? "unknown";
  const decision = str(run, "empiricalDecisionClass");
  let outcome = classifyAutoresearchDashboardOutcomeClass({ decision, status });
  const candidate = rec(rec(run, "experiment"), "candidate");
  const candidateIdentity = bindingIdentity(candidate);
  const timestamp = num(run, "timestamp");
  const metric = num(run, "metric");
  const checks = str(run, "checks");
  const issues = [...(input.schemaIssues ?? [])];
  const lineageValid =
    timestamp !== null && timestamp > 0 && (!input.requireCandidate || candidateIdentity !== null);
  let packetBinding = !input.requireCandidate
    ? ("not_required" as const)
    : candidateIdentity !== null && candidateIdentity === bindingIdentity(input.packetCandidate)
      ? ("matched" as const)
      : ("quarantined" as const);
  if (packetBinding === "quarantined")
    issues.push(
      "Quarantined: this closeout run is not bound to the packet's selected candidate; retained as source history, not evidence for this lane.",
    );
  if (!lineageValid) issues.push("Missing or mismatched run/candidate lineage.");
  const knownStatus = ["baseline", "candidate", "keep", "discard"].includes(status);
  let sourceValid = true;
  let actualExecution: ReturnType<typeof parseRunProtocol>;
  let measured: NonNullable<ReturnType<typeof parseRunProvenance>>["measurement"];
  try {
    measured = parseRunProvenance(record(run)?.provenance)?.measurement;
    actualExecution = parseRunProtocol(run);
  } catch {
    sourceValid = false;
    issues.push("Malformed per-run provenance/execution; no legacy downgrade.");
  }
  const boundWorktree = str(candidate, "worktreePath");
  if (
    actualExecution &&
    boundWorktree &&
    actualExecution.cwd !== path.resolve(str(closeout, "cwd") ?? "", boundWorktree)
  ) {
    sourceValid = false;
    if (input.requireCandidate) packetBinding = "quarantined";
    issues.push("Quarantined: actual execution cwd conflicts with bound candidate worktree.");
  }
  if (measured && input.scenario !== null && measured.scenario !== input.scenario) {
    sourceValid = false;
    issues.push("Measured scenario conflicts with planned cell; source reconciliation required.");
  }
  if (actualExecution?.benchmark.outputLimitExceeded || actualExecution?.checks.outputLimitExceeded)
    outcome = "resource_censored";
  const checksValid = actualExecution
    ? ((checks === "passed" &&
        actualExecution.checks.state === "passed" &&
        actualExecution.checks.exitCode === 0 &&
        !actualExecution.checks.timedOut &&
        !actualExecution.checks.outputLimitExceeded &&
        !actualExecution.checks.aborted) ||
        (checks === "not run" &&
          record(run)?.checksCommand === null &&
          actualExecution.checks.state === "disabled")) &&
      actualExecution.benchmark.exitCode === 0 &&
      !actualExecution.benchmark.timedOut &&
      !actualExecution.benchmark.aborted &&
      !actualExecution.benchmark.outputLimitExceeded
    : checks === "passed" || (checks === "not run" && record(run)?.checksCommand === null);
  if (!checksValid) issues.push("Checks are failed, absent, or unverified.");
  if (metric === null) issues.push("No finite measurement.");
  const identity = comparisonIdentity(closeout, run, input.scenario);
  const invalidOutcomes = ["correctness_failure", "measurement_invalid", "resource_censored"];
  const validMeasurement =
    input.schemaValid &&
    sourceValid &&
    lineageValid &&
    packetBinding !== "quarantined" &&
    knownStatus &&
    metric !== null &&
    checksValid &&
    !invalidOutcomes.includes(outcome) &&
    !!identity.metricName &&
    identity.metricUnit !== null &&
    identity.direction !== null;
  const comparisonWithheld = comparisonReasons(identity);
  if (!identity.evaluator)
    comparisonWithheld.push(
      "Actual per-run benchmark/check invocation and pinned evaluator/workload/subject provenance are unknown. Per-run overrides can differ from configured defaults; protocol provenance gap, comparison withheld.",
    );
  if (packetBinding === "quarantined")
    comparisonWithheld.push(
      "Quarantined source history: candidate binding differs or is absent; no lane comparison.",
    );
  if (!validMeasurement) comparisonWithheld.push("Not a validated measurement.");
  return {
    id: digest({
      run,
      receiptPath: str(closeout, "receiptPath"),
      campaign: str(closeout, "campaign"),
    }),
    sources: [input.source],
    timestamp,
    iteration: num(run, "iteration"),
    description: str(run, "description") ?? "No attempt description reported.",
    hypothesis: str(rec(run, "experiment"), "hypothesis"),
    prediction: str(rec(run, "experiment"), "expectedPrimaryEffect"),
    disposition: status,
    decision,
    outcome,
    metric,
    checks,
    schemaValid: input.schemaValid,
    lineageValid,
    packetBinding,
    validMeasurement,
    verificationReport: input.verificationReport ?? "No controller verification report.",
    provenance: "local_unauthenticated_projection",
    identity,
    comparisonKey: comparisonWithheld.length ? null : digest(identity),
    comparisonWithheld,
    issues,
    raw: run,
  };
}

export interface DashboardPacketProjection {
  path: string;
  cwd: string | null;
  campaign: string | null;
  objectiveDigest: string | null;
  attempts: DashboardAttempt[];
  valid: boolean;
  issues: string[];
}
export function projectCandidatePacket(
  value: unknown,
  source: string,
  scenario: string | null,
): DashboardPacketProjection {
  const validation = validateAutoresearchAdapterPacket(value);
  const issues = validation.issues.map((issue) => `${issue.path}: ${issue.message}`);
  const closeout = rec(value, "closeout");
  const rejectedHistory = num(rec(closeout, "status"), "invalidReceiptLines");
  if (rejectedHistory === null || rejectedHistory !== 0)
    issues.push(
      "Invalid or unknown receipt history: rejected lines cannot bless surviving measurements.",
    );
  const packetRun = rec(value, "candidateRun");
  const candidate = rec(value, "candidate");
  if (str(value, "cwd") !== str(closeout, "cwd")) issues.push("Packet/closeout cwd mismatch.");
  if (str(value, "campaign") !== str(closeout, "campaign"))
    issues.push("Packet/closeout campaign mismatch.");
  const config = rec(rec(closeout, "status"), "currentSegment");
  for (const field of ["metricName", "metricUnit", "direction", "runCount", "successfulRunCount"]) {
    if (record(closeout)?.[field] !== record(config)?.[field])
      issues.push(`Closeout/config ${field} mismatch.`);
  }
  if (str(rec(closeout, "status"), "cwd") !== str(closeout, "cwd"))
    issues.push("Closeout/status cwd mismatch.");
  const runs = arr(closeout, "runs");
  if (!packetRun || !runs.some((run) => digest(run) === digest(packetRun)))
    issues.push("candidateRun is absent from closeout run lineage.");
  if (
    !candidate ||
    !bindingIdentity(candidate) ||
    bindingIdentity(candidate) !== bindingIdentity(rec(rec(packetRun, "experiment"), "candidate"))
  )
    issues.push("Packet candidate/run binding mismatch or missing lineage.");
  // A packet is a whole-segment closeout, not just its latest candidate's history.
  // Preserve unrelated candidates, unbound baselines, failures and even orphan candidateRun reports.
  const selected = [...runs];
  if (packetRun && !runs.some((run) => digest(run) === digest(packetRun))) selected.push(packetRun);
  if (!selected.length) selected.push(null);
  const valid = validation.valid && issues.length === 0;
  const attempts = selected.map((run) =>
    projectAttempt({
      run,
      closeout,
      source,
      schemaValid: valid,
      schemaIssues: issues,
      scenario,
      requireCandidate: true,
      packetCandidate: candidate,
    }),
  );
  return {
    path: source,
    cwd: str(value, "cwd"),
    campaign: str(value, "campaign"),
    objectiveDigest: str(rec(rec(closeout, "status"), "currentSegment"), "objectiveDigest"),
    attempts,
    valid,
    issues,
  };
}

/** Independent grouping only; no global best, percentage, or workflow-count series. */
export function buildComparisonGroups(campaigns: DashboardCampaign[]): DashboardComparisonGroup[] {
  const groups = new Map<string, DashboardComparisonGroup>();
  for (const campaign of campaigns)
    for (const cell of campaign.cells)
      for (const lane of cell.lanes)
        for (const attempt of lane.attempts) {
          if (!campaign.identityResolved || !attempt.validMeasurement || !attempt.comparisonKey)
            continue;
          const key = `${campaign.key}:${cell.cellId}:${lane.laneId}:${attempt.comparisonKey}`;
          const group = groups.get(key) ?? {
            key,
            campaignKey: campaign.key,
            identity: attempt.identity,
            attempts: [],
          };
          if (!group.attempts.some((a) => a.id === attempt.id)) group.attempts.push(attempt);
          groups.set(key, group);
        }
  return [...groups.values()];
}

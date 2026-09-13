import { validateAutoresearchAdapterPacket } from "./runtime-adapter.ts";
import { projectAttempt } from "./runtime-matrix-chart.ts";
import type {
  AutoresearchMatrixCampaignArtifactSummary,
  DashboardAttempt,
} from "./runtime-matrix-model.ts";
import type { AutoresearchRuntimeStatus, AutoresearchSegmentCloseout } from "./runtime-model.ts";

export interface ResearchObservatoryModel {
  kind: "autoresearch.research_observatory.v1";
  asOf: string;
  cwd: string;
  headline: string;
  nextActor: string;
  nextAction: string;
  execution: { state: string; source: string; asOf: string; liveVerified: false };
  lastObservation: string | null;
  freshnessWarning: string;
  runtimeAttempts: DashboardAttempt[];
  matrix: AutoresearchMatrixCampaignArtifactSummary;
  issues: string[];
}

export function buildResearchObservatoryModel(
  status: AutoresearchRuntimeStatus,
  closeout: AutoresearchSegmentCloseout,
  matrix: AutoresearchMatrixCampaignArtifactSummary,
  asOf = new Date().toISOString(),
): ResearchObservatoryModel {
  const projection = status.runtimeProjection;
  const cleanLedger =
    projection.source === "ledger" &&
    projection.hasLedger &&
    projection.invalidLedgerLines === 0 &&
    projection.rejectedEvents.length === 0 &&
    projection.syncIssues.length === 0;
  const running = ["running_benchmark", "running_checks"].includes(projection.state);
  const execution = {
    state:
      running && !cleanLedger
        ? "unverified (receipt fallback or inconsistent owner projection)"
        : projection.state,
    source:
      projection.source === "ledger"
        ? (projection.ledgerPath ?? "runtime owner ledger projection")
        : "runtime receipt fallback (not execution evidence)",
    asOf,
    liveVerified: false as const,
  };
  const validation = validateAutoresearchAdapterPacket(closeout);
  const runtimeAttempts = closeout.runs.map((run) =>
    projectAttempt({
      run,
      closeout,
      source: closeout.receiptPath,
      schemaValid: validation.valid && status.invalidReceiptLines === 0,
      schemaIssues: validation.issues.map((i) => `${i.path}: ${i.message}`),
      scenario: null,
      requireCandidate: false,
      verificationReport:
        "Local runtime receipt; controller verification not independently authenticated.",
    }),
  );
  const seen = new Map<string, DashboardAttempt>();
  for (const attempt of runtimeAttempts) {
    const previous = seen.get(attempt.id);
    if (previous)
      for (const duplicate of [previous, attempt]) {
        duplicate.validMeasurement = false;
        duplicate.comparisonKey = null;
        duplicate.issues.push("Duplicate runtime attempt; not an independent sample.");
      }
    seen.set(attempt.id, attempt);
  }
  const times = [
    ...runtimeAttempts.map((a) => a.timestamp),
    ...matrix.campaigns.map((c) => (c.observedAt ? Date.parse(c.observedAt) : null)),
  ].filter((n): n is number => n !== null && Number.isFinite(n) && n > 0 && n <= 8.64e15);
  const single = matrix.campaigns.length === 1 ? matrix.campaigns[0] : null;
  const headline =
    matrix.campaigns.length > 1
      ? `${matrix.campaigns.length} isolated campaigns. No shared execution claim.`
      : single?.execution === "not_executed_by_orchestrator"
        ? single.reportedPosture?.startsWith("blocked")
          ? "Blocked at an owner gate."
          : "Awaiting the external controller."
        : single
          ? "Prepared research. Launch unverified."
          : running && cleanLedger
            ? `Runtime owner reports ${projection.state.replaceAll("_", " ")}.`
            : runtimeAttempts.length
              ? "Local observations await interpretation."
              : "The notebook is open. No measurements yet.";
  const issues = [...matrix.exportVisibilityBlockers.blockers, ...projection.syncIssues];
  if (status.invalidReceiptLines)
    issues.push(
      `${status.invalidReceiptLines} invalid runtime receipt line(s); measurements withheld.`,
    );
  if (projection.invalidLedgerLines || projection.rejectedEvents.length)
    issues.push(
      "Runtime owner ledger has rejected or invalid events; execution projection is not trusted as running evidence.",
    );
  return {
    kind: "autoresearch.research_observatory.v1",
    asOf,
    cwd: matrix.cwd,
    headline,
    nextActor: single?.nextActor ?? "Controller / operator",
    nextAction:
      single?.nextAction ??
      (matrix.campaigns.length > 1
        ? "Inspect each exact campaign and its owner gate below; do not combine campaigns."
        : "Review the local runtime status and measurement contract before an explicit owner action."),
    execution,
    lastObservation: times.length ? new Date(Math.max(...times)).toISOString() : null,
    freshnessWarning:
      "Owner observations may be stale; this is not a live heartbeat. Live view reloads the latest exported file while Pi is exporting. Timestamps and page refreshes never establish execution or liveness.",
    runtimeAttempts,
    matrix,
    issues,
  };
}

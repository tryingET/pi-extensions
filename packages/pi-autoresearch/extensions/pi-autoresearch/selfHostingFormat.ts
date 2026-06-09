import type {
  classifyAutoresearchSelfHostingApplicability,
  executeAutoresearchSelfHostingCandidateSubprocess,
  executeAutoresearchSelfHostingEvaluatorSuite,
  inspectAutoresearchSelfHostingCandidateScope,
  loadAutoresearchSelfHostingArtifacts,
  loadAutoresearchSelfHostingPromotionRecord,
  prepareAutoresearchSelfHostingCandidateWorktree,
  prepareAutoresearchSelfHostingPromotionRecord,
  recordAutoresearchSelfHostingRollback,
} from "../../src/core/selfHosting.ts";
import { AUTORESEARCH_SELF_HOSTING_TOOL_NAME } from "../../src/core/selfHosting.ts";

type AutoresearchSelfHostingStatusDetails = {
  cwd: string;
  artifacts: ReturnType<typeof loadAutoresearchSelfHostingArtifacts>;
  prepareCandidate: ReturnType<typeof prepareAutoresearchSelfHostingCandidateWorktree>;
  scope: ReturnType<typeof inspectAutoresearchSelfHostingCandidateScope> | null;
  promotionRecordPath: string;
  promotionRecord: ReturnType<typeof loadAutoresearchSelfHostingPromotionRecord> | null;
};

type AutoresearchSelfHostingWaveDetails = {
  action: "run" | "start_and_watch";
  cwd: string;
  prepareCandidate: ReturnType<typeof prepareAutoresearchSelfHostingCandidateWorktree>;
  candidateRun: ReturnType<typeof executeAutoresearchSelfHostingCandidateSubprocess> | null;
  suiteResults: Array<ReturnType<typeof executeAutoresearchSelfHostingEvaluatorSuite>>;
  classification: ReturnType<typeof classifyAutoresearchSelfHostingApplicability> | null;
  promotion: ReturnType<typeof prepareAutoresearchSelfHostingPromotionRecord> | null;
  promotionError: string | null;
  nextStep: string;
};

export function formatAutoresearchSelfHostingStatusText(
  details: AutoresearchSelfHostingStatusDetails,
): string {
  const candidate = details.prepareCandidate.candidate;
  const scopeLabel = !details.scope
    ? "candidate worktree not prepared"
    : details.scope.ok
      ? "clean"
      : "dirty";
  const nextStep = !candidate.registered
    ? details.prepareCandidate.nextStep
    : details.scope && !details.scope.ok
      ? "Clean the candidate worktree scope before running a bounded self-hosting wave."
      : details.promotionRecord?.status === "rotated"
        ? "Run post-promotion verification or use autoresearch_self_hosting_run with action=rollback if external evidence requires rollback truth."
        : `Use ${AUTORESEARCH_SELF_HOSTING_TOOL_NAME} with action=run to execute one bounded supervised self-hosting wave.`;

  const lines = [
    "Autoresearch self-hosting — status",
    `Campaign: ${details.artifacts.contract.campaignId}`,
    `Controller ref: ${details.artifacts.contract.controller.ref}`,
    `Controller cwd: ${details.artifacts.contract.controller.controllerCwd}`,
    `Contract path: ${details.artifacts.contractPath}`,
    `Evaluator lock path: ${details.artifacts.lockPath}`,
    `Promotion record path: ${details.promotionRecordPath}`,
    `Candidate worktree: ${candidate.worktreePath}`,
    `Candidate registered: ${candidate.registered ? "yes" : "no"}`,
    `Candidate branch: expected ${candidate.branchName}; current ${candidate.branch ?? "(missing)"}`,
    `Candidate head: ${candidate.head ?? "(missing)"}`,
    `Scope: ${scopeLabel}`,
    `Locked suites: ${details.artifacts.evaluatorLock.suites.map((suite) => suite.id).join(", ")}`,
    `Promotion record: ${details.promotionRecord?.status ?? "missing"}`,
  ];

  if (details.scope && details.scope.changedPaths.length > 0) {
    lines.push(`Changed paths: ${details.scope.changedPaths.join(", ")}`);
  }
  if (details.scope && details.scope.offLimitsPaths.length > 0) {
    lines.push(`Off-limits paths: ${details.scope.offLimitsPaths.join(", ")}`);
  }
  if (details.scope && details.scope.outOfScopePaths.length > 0) {
    lines.push(`Out-of-scope paths: ${details.scope.outOfScopePaths.join(", ")}`);
  }
  lines.push(`Next step: ${nextStep}`);

  return lines.join("\n");
}

export function formatAutoresearchSelfHostingPrepareText(
  result: ReturnType<typeof prepareAutoresearchSelfHostingCandidateWorktree>,
): string {
  const command = result.commands[0] ?? null;
  const lines = [
    "Autoresearch self-hosting — prepare candidate",
    `Mode: ${result.mode}`,
    `Campaign: ${result.campaignId}`,
    `Controller cwd: ${result.controllerCwd}`,
    `Controller branch: ${result.controllerBranchBefore ?? "(detached)"} -> ${result.controllerBranchAfter ?? "(detached)"}`,
    `Candidate worktree: ${result.candidate.worktreePath}`,
    `Candidate registered: ${result.candidate.registered ? "yes" : "no"}`,
    `Candidate branch: expected ${result.candidate.branchName}; current ${result.candidate.branch ?? "(missing)"}`,
    `Candidate head: ${result.candidate.head ?? "(missing)"}`,
  ];

  if (command) {
    lines.push(`Command: ${formatAutoresearchSelfHostingCommandInvocation(command.command)}`);
    lines.push(`Command result: ${formatAutoresearchSelfHostingCommandResult(command)}`);
  }
  lines.push(`Next step: ${result.nextStep}`);

  return lines.join("\n");
}

export function formatAutoresearchSelfHostingRollbackText(
  result: ReturnType<typeof recordAutoresearchSelfHostingRollback>,
): string {
  return [
    "Autoresearch self-hosting — rollback",
    `Mode: ${result.mode}`,
    `Campaign: ${result.campaignId}`,
    `Promotion record path: ${result.promotionRecordPath}`,
    `Previous promotion status: ${result.previousRecord.status}`,
    `Current promotion status: ${result.record.status}`,
    `Rollback reason: ${result.record.rollbackReason ?? "(missing)"}`,
    `Next step: ${result.nextStep}`,
  ].join("\n");
}

export function formatAutoresearchSelfHostingWaveText(
  details: AutoresearchSelfHostingWaveDetails,
): string {
  const lines = [
    `Autoresearch self-hosting — ${details.action}`,
    `Controller cwd: ${details.cwd}`,
    `Candidate worktree: ${details.prepareCandidate.candidate.worktreePath}`,
    `Candidate prepare: ${details.prepareCandidate.candidate.registered ? "ready" : "missing"}`,
  ];

  if (details.candidateRun) {
    lines.push(
      `Candidate subprocess: ${formatAutoresearchSelfHostingCommandInvocation(details.candidateRun.command.command)}`,
    );
    lines.push(
      `Candidate subprocess result: ${formatAutoresearchSelfHostingCommandResult(details.candidateRun.command)}`,
    );
  } else {
    lines.push("Candidate subprocess: skipped; using the current candidate worktree state.");
  }

  if (details.suiteResults.length > 0) {
    lines.push("Locked evaluator suites:");
    for (const result of details.suiteResults) {
      lines.push(
        `- ${result.resolvedSuite.suiteId}: ${result.command.exitCode === 0 ? "pass" : "fail"} (${result.resolvedSuite.suiteClass}, ${result.resolvedSuite.critical ? "critical" : "non-critical"}, ${formatAutoresearchSelfHostingCommandResult(result.command)})`,
      );
    }
  } else {
    lines.push("Locked evaluator suites: not run.");
  }

  if (details.classification) {
    lines.push(`Classification: ${details.classification.outcome}`);
    lines.push(
      `Primary metric: ${details.classification.primaryMetric.name} ${details.classification.primaryMetric.baseline} -> ${details.classification.primaryMetric.candidate} (${formatAutoresearchSelfHostingPercent(details.classification.primaryMetric.improvementPercent)})`,
    );
    if (details.classification.blockingReasons.length > 0) {
      lines.push(`Blocking reasons: ${details.classification.blockingReasons.join(" | ")}`);
    }
  } else {
    lines.push(
      "Classification: skipped because the candidate subprocess did not complete successfully.",
    );
  }

  if (details.promotion) {
    lines.push(
      `Promotion record: ${details.promotion.record.status} (${details.promotion.promotionRecordPath})`,
    );
  } else if (details.promotionError) {
    lines.push(`Promotion record: failed — ${details.promotionError}`);
  } else {
    lines.push("Promotion record: not requested.");
  }

  lines.push(`Next step: ${details.nextStep}`);
  return lines.join("\n");
}

export function normalizeAutoresearchSelfHostingCommand(
  command: string[] | undefined,
): [string, ...string[]] | null {
  if (!command || command.length === 0) {
    return null;
  }
  const normalized = command.map((entry, index) => {
    if (typeof entry !== "string" || entry.trim().length === 0) {
      throw new Error(`candidateCommand[${index}] must be a non-empty string`);
    }
    return entry;
  });
  return normalized as [string, ...string[]];
}

export function emitAutoresearchSelfHostingUpdate(
  onUpdate: unknown,
  enabled: boolean,
  phase: string,
  details: Record<string, unknown>,
): void {
  if (!enabled || typeof onUpdate !== "function") {
    return;
  }

  (
    onUpdate as (update: {
      content: Array<{ type: "text"; text: string }>;
      details: Record<string, unknown>;
    }) => void
  )({
    content: [{ type: "text", text: String(details.message ?? phase) }],
    details: {
      tool: AUTORESEARCH_SELF_HOSTING_TOOL_NAME,
      phase,
      ...details,
    },
  });
}

export function normalizeAutoresearchSelfHostingRegressionPercents(
  entries: Array<{ suiteId: string; regressionPercent: number }> | undefined,
): Map<string, number> {
  const map = new Map<string, number>();
  for (const entry of entries ?? []) {
    const suiteId = entry.suiteId.trim();
    if (suiteId.length === 0) {
      throw new Error("suiteRegressionPercents entries require a non-empty suiteId");
    }
    if (map.has(suiteId)) {
      throw new Error(
        `suiteRegressionPercents includes duplicate suite id ${JSON.stringify(suiteId)}`,
      );
    }
    map.set(suiteId, entry.regressionPercent);
  }
  return map;
}

export function formatAutoresearchSelfHostingCommandInvocation(command: readonly string[]): string {
  return command.map((entry) => JSON.stringify(entry)).join(" ");
}

export function formatAutoresearchSelfHostingCommandResult(command: {
  exitCode: number | null;
  timedOut: boolean;
  signal: string | null;
}): string {
  if (command.timedOut) {
    return "timed out";
  }
  if (command.signal) {
    return `signal ${command.signal}`;
  }
  if (command.exitCode === null) {
    return "exit unknown";
  }
  return `exit ${command.exitCode}`;
}

export function formatAutoresearchSelfHostingPercent(value: number): string {
  if (Number.isFinite(value)) {
    return `${value.toFixed(2)}%`;
  }
  return value > 0 ? "+∞%" : value < 0 ? "-∞%" : "0.00%";
}

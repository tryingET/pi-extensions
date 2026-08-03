import { existsSync, readdirSync, readFileSync } from "node:fs";
import { isAbsolute, resolve } from "node:path";
import {
  CANDIDATE_CLOSEOUT_BOUNDARY,
  candidateCleanupAuthorizationBlockers,
} from "./candidatePeerCloseout.ts";
import {
  type CandidateCleanupAuthorization,
  executeAuthorizedCandidateCleanup,
} from "./candidatePeerLifecycleArchive.ts";
import {
  type CandidateLifecycleRecord,
  type CandidateLifecycleState,
  getCandidateLifecycleRecordPath,
  getCandidateLifecycleRoot,
  inventoryCandidatePeerResources,
} from "./candidatePeerLifecycleV2.ts";
import { candidateCurrentInventoryBindingBlockers } from "./candidatePeerLifecycleV2Binding.ts";
import { getCandidatePeerRegistryDir } from "./candidatePeerRegistry.ts";

const TERMINAL_STATES = new Set<CandidateLifecycleState>([
  "reconciled_missing",
  "cleaned",
  "closed_with_retained_effects",
]);
const DEFAULT_OVERDUE_AFTER_MS = 7 * 24 * 60 * 60 * 1000;

type CleanupExecutor = typeof executeAuthorizedCandidateCleanup;
export type CandidatePeerJanitorAction = "status" | "execute_authorized";

export type CandidatePeerJanitorReport = {
  schemaVersion: 2;
  capturedAt: string;
  action: CandidatePeerJanitorAction;
  repoRoot: string;
  overdueAfterMs: number;
  execution: "not_requested" | "blocked_before_execution" | "completed" | "stopped_after_error";
  recordsScanned: number;
  overdue: Array<{
    resourceId: string;
    generationId: string;
    state: CandidateLifecycleState;
    updatedAt: string;
    dueAt: string;
    reason: string;
  }>;
  authorized: Array<{
    resourceId: string;
    generationId: string;
    resourceVersion: number;
    authorizationExpiresAt?: string;
    executionEligible: boolean;
    blockers: string[];
  }>;
  executed: Array<{
    resourceId: string;
    generationId: string;
    state: CandidateLifecycleState;
    resourceVersion: number;
    terminalReceipt?: Record<string, unknown>;
  }>;
  remainingEligible: number;
  blockers: string[];
  boundary: string;
};

function listLifecycleRecords(env: NodeJS.ProcessEnv): CandidateLifecycleRecord[] {
  const root = resolve(getCandidateLifecycleRoot(env), "resources");
  if (!existsSync(root)) return [];
  return readdirSync(root, { withFileTypes: true })
    .filter((entry) => entry.isDirectory() && /^cpr-[a-f0-9]{24}$/.test(entry.name))
    .map((entry) => {
      const path = getCandidateLifecycleRecordPath(entry.name, env);
      const record = JSON.parse(readFileSync(path, "utf8")) as CandidateLifecycleRecord;
      if (record.schemaVersion !== 2 || record.resourceId !== entry.name) {
        throw new Error(`invalid lifecycle record identity: ${path}`);
      }
      return record;
    })
    .sort((left, right) => left.resourceId.localeCompare(right.resourceId));
}

function exactRepoRoot(repoRoot: string): string {
  const normalized = resolve(repoRoot);
  if (!isAbsolute(repoRoot) || normalized !== repoRoot) {
    throw new Error("candidate janitor repoRoot must be absolute and normalized");
  }
  return normalized;
}

function recordDueAt(
  record: CandidateLifecycleRecord,
  overdueAfterMs: number,
): {
  dueAt: string;
  reason: string;
} {
  if (record.state === "deferred" && record.disposition?.nextReviewAt) {
    return { dueAt: record.disposition.nextReviewAt, reason: "deferred owner review is due" };
  }
  const authorization = record.cleanupAuthorization as CandidateCleanupAuthorization | undefined;
  if (record.state === "cleanup_authorized" && authorization?.expiresAt) {
    return {
      dueAt: authorization.expiresAt,
      reason: "cleanup authorization is approaching or past expiry",
    };
  }
  return {
    dueAt: new Date(Date.parse(record.updatedAt) + overdueAfterMs).toISOString(),
    reason: "nonterminal lifecycle record has exceeded the reporting interval",
  };
}

export function runCandidatePeerJanitor({
  action,
  repoRoot,
  overdueAfterMs = DEFAULT_OVERDUE_AFTER_MS,
  env = process.env,
  now = new Date().toISOString(),
  executeCleanup = executeAuthorizedCandidateCleanup,
}: {
  action: CandidatePeerJanitorAction;
  repoRoot: string;
  overdueAfterMs?: number;
  env?: NodeJS.ProcessEnv;
  now?: string;
  executeCleanup?: CleanupExecutor;
}): CandidatePeerJanitorReport {
  const normalizedRepoRoot = exactRepoRoot(repoRoot);
  if (!Number.isSafeInteger(overdueAfterMs) || overdueAfterMs < 1) {
    throw new Error("candidate janitor overdueAfterMs must be a positive safe integer");
  }
  const nowMs = Date.parse(now);
  if (!Number.isFinite(nowMs)) throw new Error("candidate janitor timestamp is invalid");
  const inventory = inventoryCandidatePeerResources({
    registryDir: getCandidatePeerRegistryDir(env),
    now,
  });
  const records = listLifecycleRecords(env).filter(
    (record) =>
      record.repoRoots.length === 1 && resolve(record.repoRoots[0] ?? "") === normalizedRepoRoot,
  );
  const overdue = records
    .filter((record) => !TERMINAL_STATES.has(record.state))
    .map((record) => ({ record, ...recordDueAt(record, overdueAfterMs) }))
    .filter(({ dueAt }) => {
      const dueMs = Date.parse(dueAt);
      return Number.isFinite(dueMs) && dueMs <= nowMs;
    })
    .map(({ record, dueAt, reason }) => ({
      resourceId: record.resourceId,
      generationId: record.generationId,
      state: record.state,
      updatedAt: record.updatedAt,
      dueAt,
      reason,
    }));
  const authorized = records
    .filter((record) => record.state === "cleanup_authorized")
    .map((record) => {
      const blockers = [
        ...candidateCurrentInventoryBindingBlockers(record, inventory),
        ...candidateCleanupAuthorizationBlockers(record, nowMs, false),
      ];
      const authorization = record.cleanupAuthorization as
        | CandidateCleanupAuthorization
        | undefined;
      return {
        resourceId: record.resourceId,
        generationId: record.generationId,
        resourceVersion: record.resourceVersion,
        authorizationExpiresAt: authorization?.expiresAt,
        executionEligible: blockers.length === 0,
        blockers,
      };
    });
  const blockers = authorized.flatMap((resource) =>
    resource.blockers.map((blocker) => `${resource.resourceId}: ${blocker}`),
  );
  const executed: CandidatePeerJanitorReport["executed"] = [];
  let execution: CandidatePeerJanitorReport["execution"] =
    action === "status" ? "not_requested" : "completed";

  if (action === "execute_authorized" && blockers.length > 0) {
    execution = "blocked_before_execution";
  } else if (action === "execute_authorized") {
    for (const candidate of authorized
      .filter((resource) => resource.executionEligible)
      .slice(0, 1)) {
      try {
        const record = executeCleanup({ resourceId: candidate.resourceId, env });
        executed.push({
          resourceId: record.resourceId,
          generationId: record.generationId,
          state: record.state,
          resourceVersion: record.resourceVersion,
          terminalReceipt: record.terminalReceipt,
        });
      } catch (error) {
        blockers.push(
          `${candidate.resourceId}: lifecycle-v2 janitor execution stopped: ${error instanceof Error ? error.message : String(error)}`,
        );
        execution = "stopped_after_error";
        break;
      }
    }
  }

  return {
    schemaVersion: 2,
    capturedAt: now,
    action,
    repoRoot: normalizedRepoRoot,
    overdueAfterMs,
    execution,
    recordsScanned: records.length,
    overdue,
    authorized,
    executed,
    remainingEligible: Math.max(
      0,
      authorized.filter((resource) => resource.executionEligible).length - executed.length,
    ),
    blockers,
    boundary: `${CANDIDATE_CLOSEOUT_BOUNDARY} Janitor age is diagnostic only; each janitor execution attempts at most one current-inventory-matched cleanup_authorized record, never infers disposition or acceptance, and reports remaining eligible records for a later cycle.`,
  };
}

import type { ExtensionContext, SessionEntry } from "@earendil-works/pi-coding-agent";
import { getStoreHead, rewriteStoreToLiveSetDetailed } from "./keepalive-store.ts";
import { planRetentionLiveSet, type RewindLedgerReference } from "./retention.ts";
import {
  type ActiveRewindLeaseHead,
  publishAndCollectActiveRewindLeases,
} from "./retention-leases.ts";
import { notify, type RewindRuntimeState, updateStatus } from "./runtime-state.ts";
import {
  ASC_REWIND_OP_CUSTOM_TYPE,
  ASC_REWIND_TURN_CUSTOM_TYPE,
  getCommitFromRewindOp,
  isAscRewindOpData,
  isAscRewindTurnData,
} from "./session-ledger.ts";
import { type GitRunner, REWIND_STORE_REF } from "./types.ts";

export const DEFAULT_REWIND_MAX_SNAPSHOTS = 128;
export const DEFAULT_REWIND_MAX_AGE_DAYS = 30;
export const REWIND_MAX_SNAPSHOTS_ENV = "PI_ASC_REWIND_MAX_SNAPSHOTS";
export const REWIND_MAX_AGE_DAYS_ENV = "PI_ASC_REWIND_MAX_AGE_DAYS";
export const REWIND_PINNED_COMMITS_ENV = "PI_ASC_REWIND_PINNED_COMMITS";

export interface RewindRuntimeRetentionOptions {
  maxSnapshots?: number;
  maxAgeDays?: number;
  pinnedCommitShas?: string[];
  now?: () => number;
}

export interface ResolvedRewindRetentionConfig {
  maxSnapshots: number;
  maxAgeDays: number;
  pinnedCommitShas: string[];
  now: () => number;
}

export interface RewindRetentionExecution {
  status: "rewritten" | "preserved-empty";
  previousStoreHead?: string;
  storeHead?: string;
  pinnedCommitShas: string[];
  retainedCommitShas: string[];
  liveCommitShas: string[];
}

function parseNonNegativeInteger(
  value: string | undefined,
  name: string,
  fallback: number,
): number {
  if (value === undefined || value.trim() === "") return fallback;
  if (!/^\d+$/.test(value.trim())) throw new Error(`${name} must be a non-negative integer`);
  const parsed = Number(value);
  if (!Number.isSafeInteger(parsed)) throw new Error(`${name} must be a safe integer`);
  return parsed;
}

function validateNonNegativeInteger(
  value: number | undefined,
  name: string,
  fallback: number,
): number {
  if (value === undefined) return fallback;
  if (!Number.isSafeInteger(value) || value < 0) {
    throw new Error(`${name} must be a non-negative safe integer`);
  }
  return value;
}

function normalizePinnedCommitShas(values: string[]): string[] {
  const normalized = values.map((value) => value.trim()).filter(Boolean);
  for (const commitSha of normalized) {
    if (!/^[a-f0-9]{40}$/.test(commitSha)) {
      throw new Error("rewind pinned commits must be full lowercase SHA-1 object ids");
    }
  }
  return [...new Set(normalized)];
}

export function resolveRewindRetentionConfig(
  options: RewindRuntimeRetentionOptions = {},
  env: NodeJS.ProcessEnv = process.env,
): ResolvedRewindRetentionConfig {
  const maxSnapshots =
    options.maxSnapshots === undefined
      ? parseNonNegativeInteger(
          env[REWIND_MAX_SNAPSHOTS_ENV],
          REWIND_MAX_SNAPSHOTS_ENV,
          DEFAULT_REWIND_MAX_SNAPSHOTS,
        )
      : validateNonNegativeInteger(
          options.maxSnapshots,
          "rewind maxSnapshots",
          DEFAULT_REWIND_MAX_SNAPSHOTS,
        );
  const maxAgeDays =
    options.maxAgeDays === undefined
      ? parseNonNegativeInteger(
          env[REWIND_MAX_AGE_DAYS_ENV],
          REWIND_MAX_AGE_DAYS_ENV,
          DEFAULT_REWIND_MAX_AGE_DAYS,
        )
      : validateNonNegativeInteger(
          options.maxAgeDays,
          "rewind maxAgeDays",
          DEFAULT_REWIND_MAX_AGE_DAYS,
        );
  const pinnedCommitShas = normalizePinnedCommitShas(
    options.pinnedCommitShas ?? env[REWIND_PINNED_COMMITS_ENV]?.split(",") ?? [],
  );
  return {
    maxSnapshots,
    maxAgeDays,
    pinnedCommitShas,
    now: options.now ?? Date.now,
  };
}

function entryTimestamp(entry: SessionEntry): number {
  const value = "timestamp" in entry ? entry.timestamp : undefined;
  if (typeof value !== "string") return 0;
  const parsed = Date.parse(value);
  return Number.isFinite(parsed) ? parsed : 0;
}

function appendBindingReferences(
  references: RewindLedgerReference[],
  snapshots: string[],
  bindings: Array<[string, number]>,
  timestamp: number,
): void {
  for (const [, snapshotIndex] of bindings) {
    const commitSha = snapshots[snapshotIndex];
    if (commitSha) references.push({ commitSha, timestamp, kind: "binding" });
  }
}

export function collectRewindRetentionReferences({
  entries,
  currentCommitSha,
  undoCommitSha,
  pinnedCommitShas,
  now,
}: {
  entries: SessionEntry[];
  currentCommitSha?: string;
  undoCommitSha?: string;
  pinnedCommitShas: string[];
  now: number;
}): RewindLedgerReference[] {
  const references: RewindLedgerReference[] = [];
  for (const entry of entries) {
    if (entry.type !== "custom") continue;
    const timestamp = entryTimestamp(entry);
    if (entry.customType === ASC_REWIND_TURN_CUSTOM_TYPE && isAscRewindTurnData(entry.data)) {
      appendBindingReferences(references, entry.data.snapshots, entry.data.bindings, timestamp);
      continue;
    }
    if (entry.customType === ASC_REWIND_OP_CUSTOM_TYPE && isAscRewindOpData(entry.data)) {
      appendBindingReferences(
        references,
        entry.data.snapshots,
        entry.data.bindings ?? [],
        timestamp,
      );
      const current = getCommitFromRewindOp(entry.data, "current");
      const undo = getCommitFromRewindOp(entry.data, "undo");
      if (current) references.push({ commitSha: current, timestamp, kind: "binding" });
      if (undo) references.push({ commitSha: undo, timestamp, kind: "binding" });
    }
  }
  if (currentCommitSha)
    references.push({ commitSha: currentCommitSha, timestamp: now, kind: "current" });
  if (undoCommitSha) references.push({ commitSha: undoCommitSha, timestamp: now, kind: "undo" });
  for (const commitSha of pinnedCommitShas) {
    references.push({ commitSha, timestamp: now, kind: "binding", pinned: true });
  }
  return references;
}

export async function executeRewindStoreRetention({
  git,
  entries,
  currentCommitSha,
  undoCommitSha,
  config,
  activeSessionCommitShas = [],
  expectedActiveLeaseHeads = [],
}: {
  git: GitRunner;
  entries: SessionEntry[];
  currentCommitSha?: string;
  undoCommitSha?: string;
  config: ResolvedRewindRetentionConfig;
  activeSessionCommitShas?: string[];
  expectedActiveLeaseHeads?: ActiveRewindLeaseHead[];
}): Promise<RewindRetentionExecution> {
  const now = config.now();
  const references = collectRewindRetentionReferences({
    entries,
    currentCommitSha,
    undoCommitSha,
    pinnedCommitShas: [...config.pinnedCommitShas, ...activeSessionCommitShas],
    now,
  });
  const plan = planRetentionLiveSet(
    references,
    { maxSnapshots: config.maxSnapshots, maxAgeDays: config.maxAgeDays },
    now,
  );
  const rewrite = await rewriteStoreToLiveSetDetailed(
    git,
    plan.liveCommitShas,
    REWIND_STORE_REF,
    expectedActiveLeaseHeads,
  );
  return {
    status: rewrite.status,
    previousStoreHead: rewrite.previousStoreHead,
    storeHead: rewrite.storeHead,
    pinnedCommitShas: plan.pinnedCommitShas,
    retainedCommitShas: plan.retainedCommitShas,
    liveCommitShas: plan.liveCommitShas,
  };
}

export async function runRuntimeRetentionForState(
  ctx: ExtensionContext,
  state: RewindRuntimeState,
  config: ResolvedRewindRetentionConfig,
): Promise<void> {
  if (!state.isGitRepo || !state.git) return;
  let lastActiveSessionCount = state.retention.activeSessions;
  try {
    const now = config.now();
    let completed:
      | {
          result: RewindRetentionExecution;
          activeSessionCount: number;
        }
      | undefined;
    let lastError: unknown;

    for (let attempt = 0; attempt < 3; attempt += 1) {
      try {
        const leases = await publishAndCollectActiveRewindLeases({
          git: state.git,
          sessionId: ctx.sessionManager.getSessionId(),
          currentCommitSha: state.currentCommitSha,
          undoCommitSha: state.undoCommitSha,
          now,
        });
        state.retentionLeaseRef = leases.ownLeaseRef;
        state.retentionLeaseObjectId = leases.ownLeaseObjectId;
        lastActiveSessionCount = leases.activeSessionCount;
        const result = await executeRewindStoreRetention({
          git: state.git,
          entries: ctx.sessionManager.getEntries(),
          currentCommitSha: state.currentCommitSha,
          undoCommitSha: state.undoCommitSha,
          config,
          activeSessionCommitShas: leases.protectedCommitShas,
          expectedActiveLeaseHeads: leases.expectedRefHeads,
        });
        completed = { result, activeSessionCount: leases.activeSessionCount };
        break;
      } catch (error) {
        lastError = error;
      }
    }

    if (!completed) {
      throw lastError instanceof Error
        ? lastError
        : new Error(`rewind retention failed: ${String(lastError)}`);
    }
    state.retention = {
      status: completed.result.status,
      lastRunAt: new Date(now).toISOString(),
      liveSnapshots: completed.result.liveCommitShas.length,
      pinnedSnapshots: completed.result.pinnedCommitShas.length,
      retainedOrdinarySnapshots: completed.result.retainedCommitShas.length,
      activeSessions: completed.activeSessionCount,
      storeHead: completed.result.storeHead,
    };
  } catch (error) {
    let observedStoreHead = state.retention.storeHead;
    try {
      observedStoreHead = await getStoreHead(state.git);
    } catch {
      // Preserve the previous observation when even the diagnostic ref read fails.
    }
    state.retention = {
      status: "failed",
      lastRunAt: new Date(config.now()).toISOString(),
      liveSnapshots: state.retention.liveSnapshots,
      pinnedSnapshots: state.retention.pinnedSnapshots,
      retainedOrdinarySnapshots: state.retention.retainedOrdinarySnapshots,
      activeSessions: lastActiveSessionCount,
      storeHead: observedStoreHead,
      error: error instanceof Error ? error.message : String(error),
    };
    notify(ctx, `ASC rewind retention failed closed: ${state.retention.error}`, "warning");
  }
  updateStatus(ctx, state);
}

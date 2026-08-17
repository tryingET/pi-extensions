// ---
// summary: bounded aggregations over telemetry events for the agent tool and dashboard.
// read_when:
//   - changing aggregate windows, groupings, failure rankings, or compaction quality metrics.
// ---

import type { TelemetryEvent } from "./events.ts";

export const STALL_THRESHOLD_MS = 10 * 60 * 1000;
export const UNRESOLVED_COMPACTION_MS = 10 * 60 * 1000;
const TOP_N = 10;

export interface TelemetrySummary {
  windowDays: number;
  totalEvents: number;
  perDay: Array<{ day: string; n: number }>;
  perKind: Array<{ kind: string; n: number }>;
  toolCalls: {
    total: number;
    failed: number;
    failureRatePct: number;
    topFailing: Array<{ tool: string; n: number; topError?: string }>;
  };
  compaction: {
    total: number;
    byReason: Array<{ reason: string; n: number }>;
    avgSummaryChars: number | null;
    maxSummaryChars: number | null;
    unresolvedBegins: number;
    stalledAfterCompaction: number;
  };
  compactionQuality: {
    total: number;
    validationFailures: number;
    validationFailureRatePct: number;
    fallbacks: number;
    fallbackRatePct: number;
    repairs: number;
    repairRatePct: number;
    splitTurns: number;
    splitTurnRatePct: number;
    worktreeVerified: number;
    worktreeVerifiedRatePct: number;
    totalCompactedMessages: number;
    avgCompactedMessages: number | null;
    avgSelectedMessages: number | null;
    avgOmittedMessages: number | null;
    messageOmissionRatePct: number;
    avgSummaryChars: number | null;
    avgInputTokenBudget: number | null;
    avgFinalTokenBudget: number | null;
    avgDurationMs: number | null;
    totalOmittedManagedRecords: number;
    totalOmittedManagedBlocks: number;
    totalRedactions: number;
    totalTruncatedRecords: number;
    avgContinuityRecords: number | null;
    avgEvidenceAnchors: number | null;
    byMode: Array<{ mode: string; n: number }>;
  };
  recall: {
    total: number;
    hits: number;
    totalRankedHits: number;
    zeroHit: number;
    zeroHitRatePct: number;
    scopeWidened: number;
    scopeWidenedRatePct: number;
    degraded: number;
    degradedRatePct: number;
    avgSourceEntries: number | null;
    avgSourceEntriesOmitted: number | null;
    sourceOmissionRatePct: number;
    avgCandidates: number | null;
    avgTotalHits: number | null;
    avgHits: number | null;
    avgExpanded: number | null;
    avgDirectRefs: number | null;
    avgDurationMs: number | null;
    byMode: Array<{ mode: string; n: number }>;
    byScope: Array<{ scope: string; n: number }>;
  };
  vault: { total: number; failed: number };
  compactionFailures: Array<{ stage: string; n: number; topError?: string }>;
  sources: Array<{ source: string; n: number }>;
  skills: Array<{ skill: string; n: number }>;
  followUps: {
    total: number;
    sent: number;
    blocked: number;
    byBlockedReason: Array<{ reason: string; n: number }>;
  };
  subagents: {
    total: number;
    failed: number;
    byProfile: Array<{ profile: string; n: number; failed: number }>;
  };
}

function average(sum: number, count: number): number | null {
  return count > 0 ? Math.round((sum / count) * 10) / 10 : null;
}

function percentage(numerator: number, denominator: number): number {
  return denominator > 0 ? Math.round((numerator / denominator) * 1000) / 10 : 0;
}

function eventCounter(value: unknown): number {
  return typeof value === "number" && Number.isFinite(value) ? Math.max(0, value) : 0;
}

function sortedCounts(
  map: Map<string, number>,
  key: string,
): Array<Record<string, string | number>> {
  return [...map.entries()]
    .sort((left, right) => right[1] - left[1] || left[0].localeCompare(right[0]))
    .map(([value, n]) => ({ [key]: value, n }));
}

export function summarizeTelemetryEvents(
  events: TelemetryEvent[],
  windowDays: number,
  now = Date.now(),
): TelemetrySummary {
  const perDayMap = new Map<string, number>();
  const perKindMap = new Map<string, number>();
  const toolTotals = new Map<
    string,
    { total: number; failed: number; errors: Map<string, number> }
  >();
  const skillCounts = new Map<string, number>();
  const compactionReasons = new Map<string, number>();
  let compactionTotal = 0;
  let summaryCharsSum = 0;
  let summaryCharsCount = 0;
  let maxSummaryChars: number | null = null;
  let qualityTotal = 0;
  let qualityValidationFailures = 0;
  let qualityFallbacks = 0;
  let qualityRepairs = 0;
  let qualitySplitTurns = 0;
  let qualityWorktreeVerified = 0;
  let qualityCompactedMessages = 0;
  let qualitySelectedMessages = 0;
  let qualityOmittedMessages = 0;
  let qualitySummaryChars = 0;
  let qualityInputTokenBudget = 0;
  let qualityFinalTokenBudget = 0;
  let qualityDurationSum = 0;
  let qualityDurationCount = 0;
  let qualityOmittedManagedRecords = 0;
  let qualityOmittedManagedBlocks = 0;
  let qualityRedactions = 0;
  let qualityTruncatedRecords = 0;
  let qualityContinuityRecords = 0;
  let qualityEvidenceAnchors = 0;
  const qualityModes = new Map<string, number>();
  let recallTotal = 0;
  let recallHits = 0;
  let recallTotalRankedHits = 0;
  let recallZeroHit = 0;
  let recallScopeWidened = 0;
  let recallDegraded = 0;
  let recallSourceEntries = 0;
  let recallSourceEntriesOmitted = 0;
  let recallCandidates = 0;
  let recallExpanded = 0;
  let recallDirectRefs = 0;
  let recallDurationSum = 0;
  let recallDurationCount = 0;
  const recallModes = new Map<string, number>();
  const recallScopes = new Map<string, number>();
  let vaultTotal = 0;
  let vaultFailed = 0;
  let followUpTotal = 0;
  let followUpSent = 0;
  let followUpBlocked = 0;
  const followUpReasons = new Map<string, number>();
  let subagentTotal = 0;
  let subagentFailed = 0;
  const subagentProfiles = new Map<string, { n: number; failed: number }>();
  const compactionBegins: Array<{ ts: number; sessionId?: string }> = [];
  const failureStages = new Map<string, { n: number; errors: Map<string, number> }>();
  const sourceCounts = new Map<string, number>();
  const compactionEnds: Array<{ ts: number; sessionId?: string }> = [];
  const turnTimes: Array<{ ts: number; sessionId?: string }> = [];

  for (const event of events) {
    const day = new Date(event.ts).toISOString().slice(0, 10);
    perDayMap.set(day, (perDayMap.get(day) ?? 0) + 1);
    perKindMap.set(event.kind, (perKindMap.get(event.kind) ?? 0) + 1);
    const source = event.source ?? "live";
    sourceCounts.set(source, (sourceCounts.get(source) ?? 0) + 1);

    switch (event.kind) {
      case "tool_call": {
        const entry = toolTotals.get(event.tool) ?? { total: 0, failed: 0, errors: new Map() };
        entry.total += 1;
        if (!event.ok) {
          entry.failed += 1;
          if (event.errorSignature) {
            entry.errors.set(
              event.errorSignature,
              (entry.errors.get(event.errorSignature) ?? 0) + 1,
            );
          }
        }
        toolTotals.set(event.tool, entry);
        break;
      }
      case "compaction": {
        compactionTotal += 1;
        compactionReasons.set(event.reason, (compactionReasons.get(event.reason) ?? 0) + 1);
        compactionEnds.push({ ts: event.ts, sessionId: event.sessionId });
        if (typeof event.summaryChars === "number") {
          summaryCharsSum += event.summaryChars;
          summaryCharsCount += 1;
          maxSummaryChars =
            maxSummaryChars === null
              ? event.summaryChars
              : Math.max(maxSummaryChars, event.summaryChars);
        }
        break;
      }
      case "compaction_begin":
        compactionBegins.push({ ts: event.ts, sessionId: event.sessionId });
        break;
      case "compaction_failure": {
        const entry = failureStages.get(event.stage) ?? { n: 0, errors: new Map() };
        entry.n += 1;
        entry.errors.set(event.errorSignature, (entry.errors.get(event.errorSignature) ?? 0) + 1);
        failureStages.set(event.stage, entry);
        break;
      }
      case "compaction_quality":
        qualityTotal += 1;
        qualityValidationFailures += Number(!event.validationOk);
        qualityFallbacks += Number(event.fallback);
        qualityRepairs += Number(event.repaired);
        qualitySplitTurns += Number(event.splitTurn);
        qualityWorktreeVerified += Number(event.worktreeVerified);
        qualityCompactedMessages += eventCounter(event.compactedMessages);
        qualitySelectedMessages += eventCounter(event.selectedMessages);
        qualityOmittedMessages += eventCounter(event.omittedMessages);
        qualitySummaryChars += eventCounter(event.summaryChars);
        qualityInputTokenBudget += eventCounter(event.inputTokenBudget);
        qualityFinalTokenBudget += eventCounter(event.finalTokenBudget);
        qualityOmittedManagedRecords += eventCounter(event.omittedManagedRecords);
        qualityOmittedManagedBlocks += eventCounter(event.omittedManagedBlocks);
        qualityRedactions += eventCounter(event.redactions);
        qualityTruncatedRecords += eventCounter(event.truncatedRecords);
        qualityContinuityRecords += eventCounter(event.continuityRecords);
        qualityEvidenceAnchors += eventCounter(event.evidenceAnchors);
        if (typeof event.durationMs === "number") {
          qualityDurationSum += eventCounter(event.durationMs);
          qualityDurationCount += 1;
        }
        qualityModes.set(event.mode, (qualityModes.get(event.mode) ?? 0) + 1);
        break;
      case "compaction_recall":
        recallTotal += 1;
        recallHits += eventCounter(event.hitCount);
        recallTotalRankedHits += eventCounter(event.totalHits);
        recallZeroHit += Number(event.hitCount === 0);
        recallScopeWidened += Number(event.scopeWidened);
        recallDegraded += Number(event.scope === "degraded");
        recallSourceEntries += eventCounter(event.sourceEntries);
        recallSourceEntriesOmitted += eventCounter(event.sourceEntriesOmitted);
        recallCandidates += eventCounter(event.candidateCount);
        recallExpanded += eventCounter(event.expandedCount);
        recallDirectRefs += eventCounter(event.directRefCount);
        recallModes.set(event.mode, (recallModes.get(event.mode) ?? 0) + 1);
        recallScopes.set(event.scope, (recallScopes.get(event.scope) ?? 0) + 1);
        if (typeof event.durationMs === "number") {
          recallDurationSum += eventCounter(event.durationMs);
          recallDurationCount += 1;
        }
        break;
      case "skill_load":
        skillCounts.set(event.skill, (skillCounts.get(event.skill) ?? 0) + 1);
        break;
      case "vault_query":
        vaultTotal += 1;
        if (!event.ok) vaultFailed += 1;
        break;
      case "follow_up":
        followUpTotal += 1;
        if (event.sent) {
          followUpSent += 1;
        } else {
          followUpBlocked += 1;
          if (event.blockedReason) {
            followUpReasons.set(
              event.blockedReason,
              (followUpReasons.get(event.blockedReason) ?? 0) + 1,
            );
          }
        }
        break;
      case "subagent": {
        subagentTotal += 1;
        if (!event.ok) subagentFailed += 1;
        const profile = subagentProfiles.get(event.profile) ?? { n: 0, failed: 0 };
        profile.n += 1;
        if (!event.ok) profile.failed += 1;
        subagentProfiles.set(event.profile, profile);
        break;
      }
      case "turn":
        turnTimes.push({ ts: event.ts, sessionId: event.sessionId });
        break;
    }
  }

  const toolCallTotal = [...toolTotals.values()].reduce((sum, entry) => sum + entry.total, 0);
  const toolCallFailed = [...toolTotals.values()].reduce((sum, entry) => sum + entry.failed, 0);
  const topFailing = [...toolTotals.entries()]
    .filter(([, entry]) => entry.failed > 0)
    .sort((left, right) => right[1].failed - left[1].failed)
    .slice(0, TOP_N)
    .map(([tool, entry]) => ({
      tool,
      n: entry.failed,
      topError: [...entry.errors.entries()].sort((left, right) => right[1] - left[1])[0]?.[0],
    }));

  return {
    windowDays,
    totalEvents: events.length,
    perDay: [...perDayMap.entries()]
      .sort((left, right) => left[0].localeCompare(right[0]))
      .map(([day, n]) => ({ day, n })),
    perKind: [...perKindMap.entries()]
      .sort((left, right) => right[1] - left[1])
      .map(([kind, n]) => ({ kind, n })),
    toolCalls: {
      total: toolCallTotal,
      failed: toolCallFailed,
      failureRatePct:
        toolCallTotal > 0 ? Math.round((toolCallFailed / toolCallTotal) * 1000) / 10 : 0,
      topFailing,
    },
    compaction: {
      total: compactionTotal,
      byReason: [...compactionReasons.entries()]
        .sort((left, right) => right[1] - left[1])
        .map(([reason, n]) => ({ reason, n })),
      avgSummaryChars:
        summaryCharsCount > 0 ? Math.round(summaryCharsSum / summaryCharsCount) : null,
      maxSummaryChars,
      unresolvedBegins: countUnresolvedBegins(compactionBegins, compactionEnds, now),
      stalledAfterCompaction: countStalledCompactions(compactionEnds, turnTimes),
    },
    compactionQuality: {
      total: qualityTotal,
      validationFailures: qualityValidationFailures,
      validationFailureRatePct: percentage(qualityValidationFailures, qualityTotal),
      fallbacks: qualityFallbacks,
      fallbackRatePct: percentage(qualityFallbacks, qualityTotal),
      repairs: qualityRepairs,
      repairRatePct: percentage(qualityRepairs, qualityTotal),
      splitTurns: qualitySplitTurns,
      splitTurnRatePct: percentage(qualitySplitTurns, qualityTotal),
      worktreeVerified: qualityWorktreeVerified,
      worktreeVerifiedRatePct: percentage(qualityWorktreeVerified, qualityTotal),
      totalCompactedMessages: qualityCompactedMessages,
      avgCompactedMessages: average(qualityCompactedMessages, qualityTotal),
      avgSelectedMessages: average(qualitySelectedMessages, qualityTotal),
      avgOmittedMessages: average(qualityOmittedMessages, qualityTotal),
      messageOmissionRatePct: percentage(qualityOmittedMessages, qualityCompactedMessages),
      avgSummaryChars: average(qualitySummaryChars, qualityTotal),
      avgInputTokenBudget: average(qualityInputTokenBudget, qualityTotal),
      avgFinalTokenBudget: average(qualityFinalTokenBudget, qualityTotal),
      avgDurationMs: average(qualityDurationSum, qualityDurationCount),
      totalOmittedManagedRecords: qualityOmittedManagedRecords,
      totalOmittedManagedBlocks: qualityOmittedManagedBlocks,
      totalRedactions: qualityRedactions,
      totalTruncatedRecords: qualityTruncatedRecords,
      avgContinuityRecords: average(qualityContinuityRecords, qualityTotal),
      avgEvidenceAnchors: average(qualityEvidenceAnchors, qualityTotal),
      byMode: sortedCounts(qualityModes, "mode") as Array<{ mode: string; n: number }>,
    },
    recall: {
      total: recallTotal,
      hits: recallHits,
      totalRankedHits: recallTotalRankedHits,
      zeroHit: recallZeroHit,
      zeroHitRatePct: percentage(recallZeroHit, recallTotal),
      scopeWidened: recallScopeWidened,
      scopeWidenedRatePct: percentage(recallScopeWidened, recallTotal),
      degraded: recallDegraded,
      degradedRatePct: percentage(recallDegraded, recallTotal),
      avgSourceEntries: average(recallSourceEntries, recallTotal),
      avgSourceEntriesOmitted: average(recallSourceEntriesOmitted, recallTotal),
      sourceOmissionRatePct: percentage(recallSourceEntriesOmitted, recallSourceEntries),
      avgCandidates: average(recallCandidates, recallTotal),
      avgTotalHits: average(recallTotalRankedHits, recallTotal),
      avgHits: average(recallHits, recallTotal),
      avgExpanded: average(recallExpanded, recallTotal),
      avgDirectRefs: average(recallDirectRefs, recallTotal),
      avgDurationMs: average(recallDurationSum, recallDurationCount),
      byMode: sortedCounts(recallModes, "mode") as Array<{ mode: string; n: number }>,
      byScope: sortedCounts(recallScopes, "scope") as Array<{ scope: string; n: number }>,
    },
    vault: { total: vaultTotal, failed: vaultFailed },
    compactionFailures: [...failureStages.entries()]
      .sort((left, right) => right[1].n - left[1].n)
      .map(([stage, entry]) => ({
        stage,
        n: entry.n,
        topError: [...entry.errors.entries()].sort((left, right) => right[1] - left[1])[0]?.[0],
      })),
    sources: [...sourceCounts.entries()]
      .sort((left, right) => right[1] - left[1])
      .map(([source, n]) => ({ source, n })),
    skills: [...skillCounts.entries()]
      .sort((left, right) => right[1] - left[1])
      .slice(0, TOP_N)
      .map(([skill, n]) => ({ skill, n })),
    followUps: {
      total: followUpTotal,
      sent: followUpSent,
      blocked: followUpBlocked,
      byBlockedReason: [...followUpReasons.entries()]
        .sort((left, right) => right[1] - left[1])
        .map(([reason, n]) => ({ reason, n })),
    },
    subagents: {
      total: subagentTotal,
      failed: subagentFailed,
      byProfile: [...subagentProfiles.entries()]
        .sort((left, right) => right[1].n - left[1].n)
        .map(([profile, entry]) => ({ profile, n: entry.n, failed: entry.failed })),
    },
  };
}

function countUnresolvedBegins(
  begins: Array<{ ts: number; sessionId?: string }>,
  ends: Array<{ ts: number; sessionId?: string }>,
  now: number,
): number {
  let unresolved = 0;
  for (const begin of begins) {
    const resolved = ends.some(
      (end) =>
        end.ts > begin.ts &&
        end.ts - begin.ts < UNRESOLVED_COMPACTION_MS &&
        sameSession(end, begin),
    );
    if (!resolved && now - begin.ts > UNRESOLVED_COMPACTION_MS) unresolved += 1;
  }
  return unresolved;
}

function countStalledCompactions(
  ends: Array<{ ts: number; sessionId?: string }>,
  turns: Array<{ ts: number; sessionId?: string }>,
): number {
  let stalled = 0;
  for (const end of ends) {
    const resumed = turns.some(
      (turn) => turn.ts > end.ts && turn.ts - end.ts < STALL_THRESHOLD_MS && sameSession(turn, end),
    );
    if (!resumed) stalled += 1;
  }
  return stalled;
}

function sameSession(left: { sessionId?: string }, right: { sessionId?: string }): boolean {
  if (left.sessionId && right.sessionId) return left.sessionId === right.sessionId;
  return true;
}

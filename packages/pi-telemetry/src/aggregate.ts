// ---
// summary: bounded aggregations over telemetry events for the agent tool and dashboard.
// read_when:
//   - changing aggregate windows, groupings, failure rankings, or stall detection.
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
  vault: { total: number; failed: number };
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
  const compactionEnds: Array<{ ts: number; sessionId?: string }> = [];
  const turnTimes: Array<{ ts: number; sessionId?: string }> = [];

  for (const event of events) {
    const day = new Date(event.ts).toISOString().slice(0, 10);
    perDayMap.set(day, (perDayMap.get(day) ?? 0) + 1);
    perKindMap.set(event.kind, (perKindMap.get(event.kind) ?? 0) + 1);

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
    vault: { total: vaultTotal, failed: vaultFailed },
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

/**
 * A compaction_begin with no matching compaction end in the same session
 * within the window means an aborted or failed compaction pass.
 */
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

/**
 * A compaction after which no turn started within the stall threshold
 * in the same session: the classic "compacted then sat idle" signature.
 */
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

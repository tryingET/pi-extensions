import { createHash } from "node:crypto";
import type { ResearchObservatoryModel } from "./runtime-dashboard-model.ts";
import type { DashboardAttempt, DashboardMeasurementIdentity } from "./runtime-matrix-model.ts";

export interface PerformanceRow {
  id: string;
  attempt: DashboardAttempt;
  measurable: boolean;
  duplicate: boolean;
}
export interface PerformanceScope {
  id: string;
  label: string;
  hypothesis: string | null;
  identity: DashboardMeasurementIdentity | null;
  rows: PerformanceRow[];
  comparable: boolean;
  order: "timestamp" | "iteration" | "unknown";
  baseline: PerformanceRow | null;
  best: PerformanceRow[];
  improvement: number | null;
  normalizable: boolean;
  kept: number;
  note: string;
}
const id = (parts: unknown[]) =>
  `performance-${createHash("sha256").update(JSON.stringify(parts)).digest("hex").slice(0, 24)}`;
const identityKey = (i: DashboardMeasurementIdentity) =>
  JSON.stringify([
    i.metricName,
    i.metricUnit,
    i.direction,
    i.scenario,
    i.subject,
    i.base,
    i.evaluator,
  ]);
const eligible = (a: DashboardAttempt) =>
  !!a.identity.metricName &&
  a.identity.metricUnit !== null &&
  ["lower", "higher"].includes(a.identity.direction ?? "") &&
  a.validMeasurement &&
  a.schemaValid &&
  a.lineageValid &&
  a.packetBinding !== "quarantined" &&
  a.metric !== null &&
  Number.isFinite(a.metric) &&
  !["correctness_failure", "measurement_invalid", "resource_censored"].includes(a.outcome) &&
  (a.checks === "passed" || a.checks === "not run");

/** View-only: consumes existing groups, never repairs missing evaluator provenance. */
export function buildPerformanceScopes(model: ResearchObservatoryModel): PerformanceScope[] {
  const scopes: PerformanceScope[] = [];
  const all = [
    ...model.runtimeAttempts,
    ...model.matrix.unresolvedPackets,
    ...model.matrix.campaigns.flatMap((c) =>
      c.cells.flatMap((n) => n.lanes.flatMap((l) => l.attempts)),
    ),
  ];
  const counts = new Map<string, number>();
  for (const a of all) counts.set(a.id, (counts.get(a.id) ?? 0) + 1);
  function add(
    parts: string[],
    label: string,
    hypothesis: string | null,
    attempts: DashboardAttempt[],
    identity: DashboardMeasurementIdentity | null,
    comparable = false,
  ) {
    const scopeId = id(parts);
    const rows = attempts.map((a, occurrence) => ({
      id: id([scopeId, a.id, (counts.get(a.id) ?? 0) > 1 ? [a, occurrence] : null]),
      attempt: a,
      duplicate: (counts.get(a.id) ?? 0) > 1,
      measurable: eligible(a) && counts.get(a.id) === 1,
    }));
    const unique = (values: (number | null)[]) =>
      values.every((n) => n !== null && Number.isFinite(n) && n > 0) &&
      new Set(values).size === values.length;
    const order =
      rows.length &&
      unique(rows.map((r) => r.attempt.timestamp)) &&
      rows.every((r) => (r.attempt.timestamp ?? Infinity) <= 8.64e15)
        ? "timestamp"
        : rows.length &&
            unique(rows.map((r) => r.attempt.iteration)) &&
            rows.every((r) => Number.isInteger(r.attempt.iteration))
          ? "iteration"
          : "unknown";
    rows.sort((a, b) => {
      const field = order === "timestamp" ? "timestamp" : "iteration";
      return (
        (order === "unknown" ? 0 : (a.attempt[field] ?? 0) - (b.attempt[field] ?? 0)) ||
        a.id.localeCompare(b.id)
      );
    });
    comparable = comparable && rows.length > 0 && rows.every((r) => r.measurable);
    const references = rows.filter((r) => r.attempt.outcome === "baseline_reference");
    const baseline =
      comparable && references.length === 1 && (references[0].attempt.metric ?? 0) > 0
        ? references[0]
        : null;
    const metrics = rows.map((r) => r.attempt.metric as number);
    const value = baseline
      ? metrics.reduce((best, n) =>
          identity?.direction === "higher" ? Math.max(best, n) : Math.min(best, n),
        )
      : null;
    const best = value === null ? [] : rows.filter((r) => r.attempt.metric === value);
    const delta =
      baseline && value !== null
        ? (value / (baseline.attempt.metric as number) - 1) *
          (identity?.direction === "higher" ? 100 : -100)
        : null;
    const improvement = delta !== null && Number.isFinite(delta) ? delta : null;
    const normalizable =
      !!baseline &&
      improvement !== null &&
      metrics.every(
        (n) => n >= 0 && Number.isFinite((n / (baseline.attempt.metric as number)) * 100),
      );
    scopes.push({
      id: scopeId,
      label,
      hypothesis,
      identity,
      rows,
      comparable,
      order,
      baseline,
      best: improvement === null ? [] : best,
      improvement,
      normalizable,
      kept: rows.filter((r) => r.attempt.disposition === "keep").length,
      note: !rows.length
        ? "No measurements · planned hypotheses are not execution."
        : comparable
          ? `Comparable group · ${order === "unknown" ? "order unknown; no connected trend" : `ordered by ${order}`} · run path, not accepted cumulative frontier.`
          : "Comparison unverified · isolated raw observations only; no trend, best or percentage.",
    });
  }
  function lane(
    parts: string[],
    label: string,
    hypothesis: string | null,
    attempts: DashboardAttempt[],
    campaign: string | null,
  ) {
    const buckets = new Map<string, DashboardAttempt[]>();
    for (const a of attempts) {
      const key = identityKey(a.identity);
      buckets.set(key, [...(buckets.get(key) ?? []), a]);
    }
    if (!buckets.size) add([...parts, "empty"], label, hypothesis, [], null);
    for (const [key, members] of [...buckets].sort(([a], [b]) => a.localeCompare(b))) {
      const identity = members[0].identity;
      const suffix = `${identity.metricName ?? "metric unknown"} / ${identity.metricUnit ?? "unit unknown"} · identity ${id([key]).slice(-8)}`;
      // A group must belong wholly to this exact lane and identity, with no duplicate IDs.
      const groups = model.matrix.comparisonGroups.filter(
        (g) =>
          campaign !== null &&
          g.campaignKey === campaign &&
          identityKey(g.identity) === key &&
          Object.values(g.identity).every((v) => v !== null) &&
          [
            g.identity.metricName,
            g.identity.scenario,
            g.identity.subject,
            g.identity.base,
            g.identity.evaluator,
          ].every((v) => !!v?.trim()) &&
          g.attempts.length > 0 &&
          new Set(g.attempts.map((a) => a.id)).size === g.attempts.length &&
          g.attempts.every(
            (a) =>
              members.includes(a) &&
              eligible(a) &&
              counts.get(a.id) === 1 &&
              a.comparisonKey !== null &&
              a.comparisonWithheld.length === 0 &&
              identityKey(a.identity) === key,
          ) &&
          new Set(g.attempts.map((a) => a.comparisonKey)).size === 1,
      );
      for (const g of groups.sort((a, b) => a.key.localeCompare(b.key)))
        add(
          [...parts, key, "group", g.key],
          `${label} · ${suffix} · comparable ${g.key}`,
          hypothesis,
          g.attempts,
          identity,
          true,
        );
      add(
        [...parts, key, "raw"],
        `${label} · ${suffix} · source reports`,
        hypothesis,
        members,
        identity,
      );
    }
  }
  for (const c of [...model.matrix.campaigns].sort((a, b) => a.key.localeCompare(b.key)))
    for (const n of [...c.cells].sort((a, b) => a.cellId.localeCompare(b.cellId))) {
      if (!n.lanes.length)
        add([c.key, n.cellId, "empty"], `${c.key} / ${n.cellId}`, n.hypothesis, [], null);
      for (const l of [...n.lanes].sort((a, b) => a.laneId.localeCompare(b.laneId)))
        lane(
          [c.key, n.cellId, l.laneId],
          `${c.taskId ? `AK${c.taskId}` : c.key} · ${c.objective ?? "Objective unknown"} / ${n.cellId} / ${l.laneId}`,
          n.hypothesis,
          l.attempts,
          c.identityResolved ? c.key : null,
        );
    }
  if (model.runtimeAttempts.length)
    lane(
      ["runtime", model.cwd],
      "Local runtime · separate scope",
      null,
      model.runtimeAttempts,
      null,
    );
  if (model.matrix.unresolvedPackets.length)
    lane(
      ["unresolved", model.cwd],
      "Unresolved source reports",
      null,
      model.matrix.unresolvedPackets,
      null,
    );
  if (!scopes.length) add(["empty", model.cwd], "Local runtime", null, [], null);
  return scopes;
}

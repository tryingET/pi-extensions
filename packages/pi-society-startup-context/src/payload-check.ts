// Checked consumer projections; rejected original values never become authority-bearing facts.
export interface RepoIdentity {
  company?: string;
  lane?: string;
  repo?: string;
  relativePath: string;
}
export interface TaskSummary {
  id: number | null;
  title: string;
  status?: string;
  priority?: number | null;
  claimedBy?: string | null;
}
export interface DecisionSummary {
  id: number | null;
  title: string;
  state: string;
  outcome?: string | null;
  repoScope?: string | null;
}
export interface DirectionSummary {
  exportOk?: boolean;
  checkOk?: boolean;
  nodeCount?: number;
  importedNodeCount?: number;
  parsedNodeCount?: number;
  activeNodes: string[];
  issues: string[];
}
export interface AkSummary {
  executable: string;
  machineSurfaces: string[];
  runtimeSchemaVersion?: number;
  canonicalRepoPath?: string;
  repoRegistered: boolean | null;
  repoMetadata: string[];
  snapshotGeneratedAt?: string;
  activeDeferralCount?: number;
  expiredLeaseCount?: number;
}
export interface GitSummary {
  available: boolean;
  dirty: boolean | null;
  changedCount: number;
  sample: string[];
  warning?: string;
}
export type FullRefreshStatus = "not_applicable" | "pending" | "complete" | "failed";
export interface StartupContextPacket {
  sourceHealth?: "healthy" | "degraded" | "not_checked";
  freshness?: "fresh" | "stale";
  refreshState?: "idle" | "refreshing" | "backoff" | "shutdown" | "blocked_cleanup";
  warningCount?: number;
  collectionElapsedMs?: number;
  collectionStartedMonoMs?: number;
  configFingerprint?: string;
  collectionGeneration?: number;
  commandDiagnostics?: Array<{
    label: string;
    elapsedMs: number;
    reason?: string;
    cleanup: string;
  }>;
  applicable: boolean;
  disabled: boolean;
  packetTier: "fast" | "full";
  fullRefreshStatus: FullRefreshStatus;
  capturedAt: string;
  cwd: string;
  aiSocietyRoot: string;
  repoRoot?: string;
  identity?: RepoIdentity;
  authoritativeRuntime: string[];
  git?: GitSummary;
  ak?: AkSummary;
  direction?: DirectionSummary;
  readyTasks: TaskSummary[];
  readyTaskCount?: number;
  activeTasks: TaskSummary[];
  activeTaskCount?: number;
  blockedTasks: TaskSummary[];
  blockedTaskCount?: number;
  activeDecisions: DecisionSummary[];
  decisionSampleChecked?: boolean;
  decisionPassports: string[];
  readFirstHints: string[];
  capabilityHints: string[];
  recommendedNext: string[];
  warnings: string[];
}
type RecordValue = Record<string, unknown>;
const record = (value: unknown): RecordValue | undefined =>
  value !== null && typeof value === "object" && !Array.isArray(value)
    ? (value as RecordValue)
    : undefined;
const text = (value: unknown): boolean => typeof value === "string" && value.trim().length > 0;
const count = (value: unknown): boolean => Number.isSafeInteger(value) && Number(value) >= 0;
const optional = (row: RecordValue, key: string, check: (value: unknown) => boolean): boolean =>
  !(key in row) || check(row[key]);
const nullableString = (value: unknown): boolean => value === null || typeof value === "string";
const rows = (value: unknown, check: (row: RecordValue) => boolean): boolean =>
  Array.isArray(value) &&
  value.every((row) => {
    const item = record(row);
    return !!item && check(item);
  });
const statuses = new Set(["pending", "claimed", "running", "done", "failed", "blocked"]);
const task = (row: RecordValue): boolean =>
  count(row.id) &&
  text(row.title) &&
  Number.isInteger(row.priority) &&
  Number(row.priority) >= 0 &&
  Number(row.priority) <= 4 &&
  optional(row, "status", (value) => typeof value === "string" && statuses.has(value)) &&
  optional(row, "claimed_by", nullableString);
const decision = (row: RecordValue): boolean =>
  count(row.id) &&
  text(row.title) &&
  text(row.state) &&
  optional(row, "repo_scope", nullableString) &&
  optional(row, "outcome", nullableString);

export function payloadProblem(surface: string, payload: RecordValue): string | undefined {
  let valid = true;
  switch (surface) {
    case "direction.export":
      valid = rows(
        payload.nodes,
        (node) =>
          text(node.title) &&
          text(node.state) &&
          (text(node.display_id) || text(node.key)) &&
          optional(node, "display_id", nullableString) &&
          optional(node, "key", text),
      );
      break;
    case "direction.check":
      valid =
        typeof payload.ok === "boolean" &&
        count(payload.imported_node_count) &&
        count(payload.parsed_node_count) &&
        Array.isArray(payload.issues) &&
        payload.issues.every(
          (issue) =>
            typeof issue === "string" ||
            (!!record(issue) &&
              text(record(issue)?.code) &&
              text(record(issue)?.message) &&
              optional(record(issue) || {}, "task_id", (value) => value === null || count(value)) &&
              optional(record(issue) || {}, "direction_key", nullableString) &&
              optional(record(issue) || {}, "source_path", nullableString)),
        );
      for (const field of [
        "imported_task_link_count",
        "parsed_task_link_count",
        "imported_decision_link_count",
        "parsed_decision_link_count",
      ])
        valid &&= optional(payload, field, count);
      valid &&= optional(payload, "repo_scope", text) && optional(payload, "checked_at", text);
      break;
    case "decision.list":
      valid =
        count(payload.count) &&
        rows(payload.decisions, decision) &&
        payload.count === (payload.decisions as unknown[])?.length;
      break;
    case "decision.passport": {
      const item = record(payload.decision);
      valid = !!item && decision(item);
      for (const field of ["linked_tasks", "artifacts", "artifact_statuses", "readiness_checks"])
        valid &&= rows(payload[field], () => true);
      if ("readiness" in payload) {
        const readiness = record(payload.readiness);
        valid &&= !!readiness && optional(readiness, "summary", text);
      }
      for (const field of ["next_step", "status"]) valid &&= optional(payload, field, text);
      break;
    }
    case "startup.snapshot": {
      const counts = record(payload.task_status_counts);
      valid =
        !!counts &&
        Object.entries(counts).every(([status, value]) => statuses.has(status) && count(value)) &&
        count(Number(counts.claimed ?? 0) + Number(counts.running ?? 0));
      for (const field of [
        "schema_version",
        "ready_task_count",
        "active_deferral_count",
        "expired_lease_count",
      ])
        valid &&= count(payload[field]);
      for (const field of ["repo_count", "evidence_count", "decision_count"])
        valid &&= optional(payload, field, count);
      // Array diagnostics stay specific for the existing public projection regression.
      if (!Array.isArray(payload.ready_sample))
        return "startup.snapshot: ready_sample was not an array";
      valid &&=
        rows(payload.ready_sample, task) &&
        payload.ready_sample.length <= Number(payload.ready_task_count);
      break;
    }
    case "repo.resolve": {
      const repo = record(payload.repo);
      if (repo)
        for (const field of ["company", "archetype", "layer", "generated_from"])
          valid &&= optional(repo, field, nullableString);
      break;
    }
  }
  return valid ? undefined : `${surface}: malformed payload (schema/type mismatch)`;
}

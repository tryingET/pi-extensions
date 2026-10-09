// ---
// summary: collects and injects read-only AI Society startup context from bounded git and AK runtime probes.
// read_when:
//   - changing startup packet collection, rendering, refresh lifecycle, or Pi integration.
// ---

import * as fs from "node:fs";
import * as os from "node:os";
import * as path from "node:path";
import { performance } from "node:perf_hooks";
import type { ExtensionAPI, ExtensionContext } from "@earendil-works/pi-coding-agent";
import {
  cancellationReason,
  OwnedReaders,
  reloadStableReaders,
  runCommand,
} from "../src/command-runner.ts";
import { type ContextConfig, snapshotConfig } from "../src/config.ts";
import {
  type DecisionSummary,
  type DirectionSummary,
  type FullRefreshStatus,
  type GitSummary,
  payloadProblem,
  type RepoIdentity,
  type StartupContextPacket,
  type TaskSummary,
} from "../src/payload-check.ts";

export type { StartupContextPacket } from "../src/payload-check.ts";

import { startupContextMessage } from "../src/context-message.ts";
import { RefreshLifecycle } from "../src/refresh-lifecycle.ts";

const DEFAULT_MAX_TASKS = 5;
const ACTIVE_DECISION_STATES = new Set([
  "proposed",
  "review_pending",
  "in_review",
  "decision_pending",
  "adr_required",
  "adr_recorded",
  "tasks_reevaluation_pending",
]);

interface MachineContract {
  surface: string;
  schemaVersion: number;
  payloadKind: string;
}

const REPO_RESOLVE_CONTRACT: MachineContract = {
  surface: "repo.resolve",
  schemaVersion: 1,
  payloadKind: "repo_resolution",
};
const STARTUP_SNAPSHOT_CONTRACT: MachineContract = {
  surface: "startup.snapshot",
  schemaVersion: 1,
  payloadKind: "startup_snapshot",
};
const DIRECTION_EXPORT_CONTRACT: MachineContract = {
  surface: "direction.export",
  schemaVersion: 1,
  payloadKind: "direction_graph",
};
const DIRECTION_CHECK_CONTRACT: MachineContract = {
  surface: "direction.check",
  schemaVersion: 1,
  payloadKind: "direction_check_report",
};
const DECISION_LIST_CONTRACT: MachineContract = {
  surface: "decision.list",
  schemaVersion: 1,
  payloadKind: "decision_collection",
};
const DECISION_PASSPORT_CONTRACT: MachineContract = {
  surface: "decision.passport",
  schemaVersion: 1,
  payloadKind: "decision_passport",
};

type JsonRecord = Record<string, unknown>;

type MachineRead<T = unknown> =
  | {
      ok: true;
      value: T;
    }
  | {
      ok: false;
      warning: string;
      stdout?: string;
      stderr?: string;
    };

function getAiSocietyRoot(homeDir = os.homedir()): string {
  return path.join(homeDir, "ai-society");
}

function normalizeExistingPath(inputPath: string): string {
  try {
    return fs.realpathSync.native(inputPath);
  } catch {
    return path.resolve(inputPath);
  }
}

export function isInsideAiSocietyPath(cwd: string, homeDir = os.homedir()): boolean {
  const root = normalizeExistingPath(getAiSocietyRoot(homeDir));
  const current = normalizeExistingPath(cwd);
  return current === root || current.startsWith(`${root}${path.sep}`);
}

function asRecord(value: unknown): JsonRecord | undefined {
  return value && typeof value === "object" && !Array.isArray(value)
    ? (value as JsonRecord)
    : undefined;
}

function asArray(value: unknown): unknown[] {
  return Array.isArray(value) ? value : [];
}

function asString(value: unknown): string | undefined {
  return typeof value === "string" ? value : undefined;
}

function asNumber(value: unknown): number | null {
  return typeof value === "number" && Number.isFinite(value) ? value : null;
}

function getPathValue(root: unknown, keys: string[]): unknown {
  let current = root;
  for (const key of keys) {
    const record = asRecord(current);
    if (!record) return undefined;
    current = record[key];
  }
  return current;
}

function machineErrorSummary(parsed: JsonRecord): string | undefined {
  const error = asRecord(parsed.error);
  if (!error) return undefined;
  const code = asString(error.code) || "unknown_error";
  const message = asString(error.message) || asString(error.summary) || "machine surface failed";
  return `${code}: ${message}`;
}

function parseJsonMachine(
  stdout: string,
  label: string,
  contract?: MachineContract,
): MachineRead<JsonRecord> {
  const reject = (reason: string): MachineRead<JsonRecord> => ({
    ok: false,
    warning: `${label}: malformed machine envelope: ${reason}`,
  });
  try {
    const record = asRecord(JSON.parse(stdout));
    if (!record) return reject("machine output was not a JSON object");
    if (record.ok !== true)
      return reject(
        machineErrorSummary(record) || `expected ok=true, received ${String(record.ok)}`,
      );
    if (contract) {
      if (record.surface !== contract.surface)
        return reject(`expected surface ${contract.surface}, received ${String(record.surface)}`);
      if (record.schema_version !== contract.schemaVersion)
        return reject(
          `expected envelope schema ${contract.schemaVersion}, received ${String(record.schema_version)}`,
        );
      if (record.payload_kind !== contract.payloadKind)
        return reject(
          `expected payload kind ${contract.payloadKind}, received ${String(record.payload_kind)}`,
        );
      const payload = asRecord(record.payload);
      if (!payload) return reject("machine envelope omitted its payload object");
      const problem = payloadProblem(contract.surface, payload);
      if (problem) return { ok: false, warning: `${label}: ${problem}` };
    }
    return { ok: true, value: record };
  } catch (error) {
    return reject(`failed to parse JSON (${String(error)})`);
  }
}

async function runJsonCommand(
  command: string,
  args: string[],
  label: string,
  options: {
    cwd?: string;
    timeoutMs?: number;
    env?: NodeJS.ProcessEnv;
    signal?: AbortSignal;
    contract?: MachineContract;
    diagnostics?: NonNullable<StartupContextPacket["commandDiagnostics"]>;
    resources?: OwnedReaders;
  } = {},
): Promise<MachineRead<JsonRecord>> {
  const result = await runCommand(command, args, options);
  const parsed = parseJsonMachine(result.stdout, label, options.contract);
  options.diagnostics?.push({
    label,
    elapsedMs: result.elapsedMs,
    reason: result.reason || (!parsed.ok ? "malformed_machine_or_payload" : undefined),
    cleanup: result.cleanup,
  });
  if (!result.ok)
    return {
      ok: false,
      warning: `${label}: ${result.reason}: ${result.error}${parsed.ok ? " despite an ok=true machine envelope" : ""}`,
      stdout: result.stdout.slice(0, 400),
      stderr: result.stderr.slice(0, 400),
    };
  return parsed;
}

async function findGitRepoRoot(
  cwd: string,
  signal?: AbortSignal,
  env?: NodeJS.ProcessEnv,
  onCleanupFailure?: () => void,
  resources?: OwnedReaders,
): Promise<{ repoRoot: string; warning?: string }> {
  const result = await runCommand("git", ["rev-parse", "--show-toplevel"], {
    cwd,
    timeoutMs: 2_000,
    signal,
    env,
    resources,
  });
  if (result.reason === "cleanup_failure") onCleanupFailure?.();
  if (!result.ok) {
    return { repoRoot: cwd, warning: `git repo root unavailable: ${result.error}` };
  }
  const repoRoot = result.stdout.trim();
  return { repoRoot: repoRoot || cwd };
}

async function readGitStatus(
  repoRoot: string,
  signal?: AbortSignal,
  config = snapshotConfig(repoRoot),
  onCleanupFailure?: () => void,
  resources?: OwnedReaders,
): Promise<GitSummary> {
  const result = await runCommand("git", ["status", "--short"], {
    cwd: repoRoot,
    timeoutMs: 3_000,
    signal,
    env: config.env,
    resources,
  });
  if (result.reason === "cleanup_failure") onCleanupFailure?.();
  if (!result.ok) {
    return {
      available: false,
      dirty: null,
      changedCount: 0,
      sample: [],
      warning: `git status unavailable: ${result.timedOut ? "timed out" : result.error}`,
    };
  }

  const lines = result.stdout
    .split("\n")
    .map((line) => line.trimEnd())
    .filter(Boolean);
  return {
    available: true,
    dirty: lines.length > 0,
    changedCount: lines.length,
    sample: lines.slice(0, config.maxGitLines),
  };
}

function deriveRepoIdentityFromRelativePath(relativePath: string): RepoIdentity {
  const parts = relativePath.split(path.sep).filter(Boolean);
  const company = parts[0];
  const maybeLane = parts[1];
  const knownLanes = new Set(["owned", "infra", "contrib", "agents", "fork", "core", "data"]);
  const lane = maybeLane && knownLanes.has(maybeLane) ? maybeLane : undefined;
  const repo = lane ? parts[2] : parts[1];
  return { company, lane, repo, relativePath };
}

function deriveRepoIdentity(aiSocietyRoot: string, repoRoot: string): RepoIdentity {
  return deriveRepoIdentityFromRelativePath(path.relative(aiSocietyRoot, repoRoot) || ".");
}

function inferRepoRootFromAiSocietyPath(aiSocietyRoot: string, cwd: string): string | undefined {
  const relativePath = path.relative(aiSocietyRoot, normalizeExistingPath(cwd));
  const parts = relativePath.split(path.sep).filter(Boolean);
  if (parts.length === 0) return aiSocietyRoot;
  const knownLanes = new Set(["owned", "infra", "contrib", "agents", "fork", "core", "data"]);
  if (parts[0] === "softwareco" && parts[1] && knownLanes.has(parts[1]) && parts[2]) {
    return path.join(aiSocietyRoot, parts[0], parts[1], parts[2]);
  }
  if (parts[0] === "core" && parts[1]) {
    return path.join(aiSocietyRoot, parts[0], parts[1]);
  }
  if (parts.length >= 2) return path.join(aiSocietyRoot, parts[0], parts[1]);
  return path.join(aiSocietyRoot, parts[0]);
}

function formatIdentity(identity?: RepoIdentity): string {
  if (!identity) return "unknown";
  return (
    [identity.company, identity.lane, identity.repo].filter(Boolean).join("/") ||
    identity.relativePath
  );
}

function summarizeRepoResolution(
  read: MachineRead<JsonRecord>,
  expectedInput: string,
): {
  registered: boolean | null;
  canonicalPath?: string;
  metadata: string[];
  warning?: string;
} {
  if (!read.ok) return { registered: null, metadata: [], warning: read.warning };
  const payload = asRecord(read.value.payload);
  if (!payload || typeof payload.registered !== "boolean") {
    return {
      registered: null,
      metadata: [],
      warning: "ak repo resolve: payload.registered missing or invalid",
    };
  }
  if (asString(payload.input) !== expectedInput) {
    return {
      registered: null,
      metadata: [],
      warning: `ak repo resolve: input mismatch for ${expectedInput}`,
    };
  }

  if (!payload.registered) {
    if (payload.canonical_path !== null || payload.repo !== null) {
      return {
        registered: null,
        metadata: [],
        warning: "ak repo resolve: unregistered payload carried canonical repo data",
      };
    }
    return { registered: false, metadata: [] };
  }

  const canonicalPath = asString(payload.canonical_path);
  const repo = asRecord(payload.repo);
  if (!canonicalPath || !repo || asString(repo.path) !== canonicalPath) {
    return {
      registered: null,
      metadata: [],
      warning: "ak repo resolve: registered payload failed canonical path validation",
    };
  }
  const metadata = [
    asString(repo.company) ? `company=${repo.company}` : undefined,
    asString(repo.archetype) ? `archetype=${repo.archetype}` : undefined,
    asString(repo.layer) ? `layer=${repo.layer}` : undefined,
    asString(repo.generated_from) ? `generated_from=${repo.generated_from}` : undefined,
  ].filter((item): item is string => Boolean(item));
  return { registered: true, canonicalPath, metadata };
}

function summarizeDirection(
  exportRead: MachineRead<JsonRecord>,
  checkRead: MachineRead<JsonRecord>,
): { summary: DirectionSummary; warnings: string[] } {
  const warnings: string[] = [];
  const summary: DirectionSummary = { activeNodes: [], issues: [] };

  if (exportRead.ok) {
    summary.exportOk = true;
    const nodes = asArray(getPathValue(exportRead.value, ["payload", "nodes"]));
    summary.nodeCount = nodes.length;
    summary.activeNodes = nodes
      .map(asRecord)
      .filter((node): node is JsonRecord => Boolean(node))
      .filter((node) => ["active", "next", "pending"].includes(asString(node.state) || ""))
      .slice(0, 6)
      .map((node) => {
        const display = asString(node.display_id) || asString(node.key) || "direction-node";
        const title = asString(node.title) || "untitled";
        const state = asString(node.state) || "unknown";
        return `${display} [${state}] ${title}`;
      });
  } else {
    summary.exportOk = false;
    warnings.push(exportRead.warning);
  }

  if (checkRead.ok) {
    const payload = asRecord(checkRead.value.payload) || {};
    summary.checkOk = payload.ok === true;
    summary.importedNodeCount = asNumber(payload.imported_node_count) ?? undefined;
    summary.parsedNodeCount = asNumber(payload.parsed_node_count) ?? undefined;
    summary.issues = asArray(payload.issues)
      .slice(0, 5)
      .map((issue) => (typeof issue === "string" ? issue : JSON.stringify(issue).slice(0, 180)));
  } else {
    // No accepted check report means unknown, never observed drift.
    warnings.push(checkRead.warning);
  }

  return { summary, warnings };
}

function toTaskSummary(task: unknown): TaskSummary | undefined {
  const record = asRecord(task);
  if (!record) return undefined;
  const title = asString(record.title);
  if (!title) return undefined;
  return {
    id: asNumber(record.id),
    title,
    status: asString(record.status),
    priority: asNumber(record.priority),
    claimedBy: asString(record.claimed_by) ?? null,
  };
}

function readSnapshotStatusCount(counts: JsonRecord, status: string): number | undefined {
  if (!(status in counts)) return 0;
  const value = asNumber(counts[status]);
  return value !== null && Number.isSafeInteger(value) && value >= 0 ? value : undefined;
}

function asNonNegativeInteger(value: unknown): number | undefined {
  const number = asNumber(value);
  return number !== null && Number.isSafeInteger(number) && number >= 0 ? number : undefined;
}

function summarizeStartupSnapshot(
  read: MachineRead<JsonRecord>,
  expectedRepoScope: string,
  maxTasks = DEFAULT_MAX_TASKS,
): {
  readyTasks: TaskSummary[];
  readyTaskCount?: number;
  activeTaskCount?: number;
  blockedTaskCount?: number;
  runtimeSchemaVersion?: number;
  generatedAt?: string;
  activeDeferralCount?: number;
  expiredLeaseCount?: number;
  warnings: string[];
} {
  if (!read.ok) return { readyTasks: [], warnings: [read.warning] };
  const payload = asRecord(read.value.payload);
  const counts = asRecord(payload?.task_status_counts);
  if (!payload || !counts || asString(payload.repo_scope) !== expectedRepoScope) {
    return {
      readyTasks: [],
      warnings: ["ak startup snapshot: payload failed canonical repo-scope validation"],
    };
  }

  const readyTaskCount = asNonNegativeInteger(payload.ready_task_count);
  const runtimeSchemaVersion = asNonNegativeInteger(payload.schema_version);
  const activeDeferralCount = asNonNegativeInteger(payload.active_deferral_count);
  const expiredLeaseCount = asNonNegativeInteger(payload.expired_lease_count);
  const claimedCount = readSnapshotStatusCount(counts, "claimed");
  const runningCount = readSnapshotStatusCount(counts, "running");
  const blockedTaskCount = readSnapshotStatusCount(counts, "blocked");
  const generatedAt = asString(payload.generated_at);
  if (
    readyTaskCount === undefined ||
    runtimeSchemaVersion === undefined ||
    runtimeSchemaVersion === 0 ||
    activeDeferralCount === undefined ||
    expiredLeaseCount === undefined ||
    claimedCount === undefined ||
    runningCount === undefined ||
    blockedTaskCount === undefined ||
    !generatedAt
  ) {
    return {
      readyTasks: [],
      warnings: ["ak startup snapshot: count or schema fields failed validation"],
    };
  }

  if (!Array.isArray(payload.ready_sample)) {
    return {
      readyTasks: [],
      warnings: ["ak startup snapshot: ready_sample was not an array"],
    };
  }
  const readyRows = payload.ready_sample;
  const readyTasks = readyRows.map(toTaskSummary).filter(Boolean) as TaskSummary[];
  if (
    readyTasks.length !== readyRows.length ||
    readyTasks.length > readyTaskCount ||
    readyTasks.some(
      (task) =>
        asNonNegativeInteger(task.id) === undefined ||
        task.priority === null ||
        task.priority === undefined,
    )
  ) {
    return {
      readyTasks: [],
      warnings: ["ak startup snapshot: ready sample failed validation"],
    };
  }

  return {
    readyTasks: readyTasks.slice(0, maxTasks),
    readyTaskCount,
    activeTaskCount: claimedCount + runningCount,
    blockedTaskCount,
    runtimeSchemaVersion,
    generatedAt,
    activeDeferralCount,
    expiredLeaseCount,
    warnings: [],
  };
}

function toDecisionSummary(decision: unknown): DecisionSummary | undefined {
  const record = asRecord(decision);
  if (!record) return undefined;
  const title = asString(record.title);
  const state = asString(record.state);
  if (!title || !state) return undefined;
  return {
    id: asNumber(record.id),
    title,
    state,
    outcome: asString(record.outcome) || null,
    repoScope: asString(record.repo_scope) || null,
  };
}

function summarizeDecisions(
  decisionRead: MachineRead<JsonRecord>,
  repoRoot: string,
): { active: DecisionSummary[]; warnings: string[] } {
  if (!decisionRead.ok) return { active: [], warnings: [decisionRead.warning] };
  const decisions = asArray(getPathValue(decisionRead.value, ["payload", "decisions"]));
  const active = decisions
    .map(toDecisionSummary)
    .filter((decision): decision is DecisionSummary => Boolean(decision))
    .filter((decision) => !decision.repoScope || decision.repoScope === repoRoot)
    .filter((decision) => ACTIVE_DECISION_STATES.has(decision.state))
    .slice(0, 3);
  return { active, warnings: [] };
}

function summarizePassport(read: MachineRead<JsonRecord>, decision: DecisionSummary): string {
  if (!read.ok) return `#${decision.id ?? "?"} passport unavailable (${read.warning})`;
  const payload = asRecord(read.value.payload);
  const readiness =
    asString(getPathValue(payload, ["readiness", "summary"])) ||
    asString(payload?.next_step) ||
    asString(payload?.status) ||
    "passport readable";
  return `#${decision.id ?? "?"} ${decision.title}: ${readiness}`;
}

function collectExistingPaths(candidates: string[]): string[] {
  return candidates.filter((candidate) => fs.existsSync(candidate));
}

function collectCapabilityHints(aiSocietyRoot: string, identity?: RepoIdentity): string[] {
  const candidates: string[] = [];
  if (identity?.company === "softwareco" && identity.lane) {
    candidates.push(
      path.join(
        aiSocietyRoot,
        "softwareco",
        identity.lane,
        "docs",
        "project",
        "repo-capability-map.md",
      ),
    );
  }
  if (identity?.company === "core") {
    candidates.push(path.join(aiSocietyRoot, "core", "repo-capability-map.md"));
  }
  return collectExistingPaths(candidates);
}

export function collectReadFirstHints(repoRoot: string, cwd: string): string[] {
  const repoCandidates = [
    "AGENTS.md",
    "README.md",
    "README.terse.md",
    "docs/_core/README.md",
    "docs/org_context/README.md",
    "docs/project/README.md",
    "docs/project/root-capabilities.md",
    "docs/project/database-backend-runtime.md",
    "docs/project/ai-society-convergence-architecture.md",
  ].map((relative) => path.join(repoRoot, relative));

  const packageCandidates: string[] = [];
  let current = normalizeExistingPath(cwd);
  const normalizedRepo = normalizeExistingPath(repoRoot);
  while (current.startsWith(normalizedRepo)) {
    packageCandidates.push(
      path.join(current, "AGENTS.md"),
      path.join(current, "README.md"),
      path.join(current, "docs", "project", "product-posture.md"),
      path.join(current, "docs", "project", "vision.md"),
    );
    if (current === normalizedRepo) break;
    const parent = path.dirname(current);
    if (parent === current) break;
    current = parent;
  }

  return [...new Set(collectExistingPaths([...packageCandidates, ...repoCandidates]))].slice(0, 10);
}

function buildRecommendedNext(packet: Omit<StartupContextPacket, "recommendedNext">): string[] {
  const recommendations = [
    "Treat AK as canonical runtime authority and its configured fsqlite-backed database as substrate; treat docs/capability maps as orientation/projection until promoted through runtime authority.",
  ];

  if (packet.packetTier === "fast") {
    recommendations.push(
      "This is the fast startup tier: AK/git/direction/task/decision surfaces are not yet checked; wait for background refresh or run `/society-context refresh` before relying on those surfaces.",
    );
  }

  if (packet.git?.dirty) {
    recommendations.push(
      "Inspect dirty git state before editing so unrelated operator changes are not overwritten.",
    );
  }

  if (packet.readFirstHints.length > 0) {
    recommendations.push(
      `Read the highest-signal local pointer first: ${packet.readFirstHints[0]}`,
    );
  }

  if ((packet.readyTaskCount || 0) > 0) {
    recommendations.push(
      "If the operator wants task execution, inspect the relevant AK task explicitly before any claim or lifecycle mutation.",
    );
  }

  if (packet.direction?.checkOk === false) {
    recommendations.push(
      "Direction drift is only reported here; repair/rebaseline requires an explicit operator command outside startup.",
    );
  }

  recommendations.push(
    "Use `/society-context refresh` for a read-only packet refresh if cwd/runtime state changed.",
  );
  return recommendations;
}

function createNotApplicablePacket(
  cwd: string,
  aiSocietyRoot: string,
  disabled = false,
): StartupContextPacket {
  return {
    applicable: false,
    disabled,
    packetTier: "fast",
    fullRefreshStatus: "not_applicable",
    sourceHealth: "not_checked",
    freshness: "stale",
    refreshState: "idle",
    warningCount: 0,
    capturedAt: new Date().toISOString(),
    cwd,
    aiSocietyRoot,
    authoritativeRuntime: [],
    readyTasks: [],
    activeTasks: [],
    blockedTasks: [],
    activeDecisions: [],
    decisionPassports: [],
    readFirstHints: [],
    capabilityHints: [],
    recommendedNext: disabled
      ? ["AI Society startup context is disabled by PI_SOCIETY_STARTUP_CONTEXT=0."]
      : ["No AI Society startup context was injected because cwd is outside ~/ai-society."],
    warnings: [],
  };
}

export function createFastStartupContextPacket(
  cwd: string,
  homeDir = os.homedir(),
  fullRefreshStatus: FullRefreshStatus = "pending",
  extraWarnings: string[] = [],
  config = snapshotConfig(cwd),
): StartupContextPacket {
  const aiSocietyRoot = getAiSocietyRoot(homeDir);
  if (!config.enabled) {
    return createNotApplicablePacket(cwd, aiSocietyRoot, true);
  }

  if (!isInsideAiSocietyPath(cwd, homeDir)) {
    return createNotApplicablePacket(cwd, aiSocietyRoot);
  }

  const repoRoot = inferRepoRootFromAiSocietyPath(aiSocietyRoot, cwd);
  const identity = repoRoot
    ? deriveRepoIdentity(aiSocietyRoot, repoRoot)
    : deriveRepoIdentityFromRelativePath(path.relative(aiSocietyRoot, normalizeExistingPath(cwd)));
  const warnings = [
    "fast startup packet: repo root and identity are path-inferred, not verified by git or AK.",
    fullRefreshStatus === "failed"
      ? "fast startup packet: background full refresh failed; AK/git/direction/task/decision surfaces were not checked in this packet."
      : "fast startup packet: background full refresh is pending; AK/git/direction/task/decision surfaces are not checked in this packet.",
    ...extraWarnings,
  ];

  const packetWithoutRecommendations = {
    applicable: true,
    disabled: false,
    packetTier: "fast",
    fullRefreshStatus,
    sourceHealth: fullRefreshStatus === "failed" ? "degraded" : "not_checked",
    freshness: "stale",
    refreshState: "refreshing",
    warningCount: warnings.length,
    configFingerprint: config.fingerprint,
    capturedAt: new Date().toISOString(),
    cwd,
    aiSocietyRoot,
    repoRoot,
    identity,
    authoritativeRuntime: [
      "AK is canonical runtime/lineage/task/evidence/decision authority; its configured fsqlite-backed database is the durable substrate.",
      "ROCS = semantic authority",
      "Prompt Vault = reusable procedures/prompts, not runtime authority",
      "Pi = live execution harness/operator workbench; session registry/JSONL are not canonical authority",
      "DSPx/Oracle = empirical behavior analysis, not normative authority",
      "Docs/capability maps = narrative/projection unless promoted through runtime authority",
    ],
    readyTasks: [],
    activeTasks: [],
    blockedTasks: [],
    activeDecisions: [],
    decisionPassports: [],
    readFirstHints: repoRoot ? collectReadFirstHints(repoRoot, cwd) : [],
    capabilityHints: collectCapabilityHints(aiSocietyRoot, identity),
    warnings: warnings.slice(0, config.maxWarnings),
  } satisfies Omit<StartupContextPacket, "recommendedNext">;

  return {
    ...packetWithoutRecommendations,
    recommendedNext: buildRecommendedNext(packetWithoutRecommendations),
  };
}

export async function buildStartupContextPacket(
  cwd: string,
  signal?: AbortSignal,
  config = snapshotConfig(cwd),
  resources = new OwnedReaders(),
): Promise<StartupContextPacket> {
  const started = performance.now();
  const controller = new AbortController();
  const abort = () => controller.abort(signal?.reason);
  signal?.addEventListener("abort", abort, { once: true });
  if (signal?.aborted) abort();
  if (config.refreshTimeoutMs === 0) controller.abort("refresh_timeout");
  const timer = setTimeout(() => controller.abort("refresh_timeout"), config.refreshTimeoutMs);
  try {
    const packet = await collectPacket(config.cwd, controller, config, started, resources);
    return {
      ...packet,
      collectionElapsedMs: performance.now() - started,
      collectionStartedMonoMs: started,
      configFingerprint: config.fingerprint,
    };
  } finally {
    clearTimeout(timer);
    signal?.removeEventListener("abort", abort);
  }
}

async function collectPacket(
  cwd: string,
  controller: AbortController,
  config: ContextConfig,
  started: number,
  resources: OwnedReaders,
): Promise<StartupContextPacket> {
  const signal = controller.signal;
  const aiSocietyRoot = getAiSocietyRoot(config.home);
  if (!config.enabled) {
    return createNotApplicablePacket(cwd, aiSocietyRoot, true);
  }
  if (!isInsideAiSocietyPath(cwd, config.home)) {
    return createNotApplicablePacket(cwd, aiSocietyRoot);
  }

  const warnings: string[] = [];
  const checkBudget = () => {
    if (performance.now() - started >= config.refreshTimeoutMs && !signal.aborted)
      controller.abort("refresh_timeout");
  };
  const cleanupFailed = () => controller.abort("cleanup_failure");
  checkBudget();
  const { repoRoot, warning: repoRootWarning } = await findGitRepoRoot(
    cwd,
    signal,
    config.env,
    cleanupFailed,
    resources,
  );
  if (repoRootWarning) warnings.push(repoRootWarning);

  const akExecutable = config.executable;
  const diagnostics: NonNullable<StartupContextPacket["commandDiagnostics"]> = [];
  const runAkJson = async (
    args: string[],
    label: string,
    contract?: MachineContract,
  ): Promise<MachineRead<JsonRecord>> => {
    checkBudget();
    if (signal.aborted)
      return {
        ok: false,
        warning: `${label}: ${cancellationReason(signal)} before stage launch (${String(signal.reason)})`,
      };
    const read = await runJsonCommand(akExecutable, args, label, {
      cwd: repoRoot,
      env: config.env,
      timeoutMs: config.commandTimeoutMs,
      signal,
      contract,
      diagnostics,
      resources,
    });
    if (diagnostics.at(-1)?.reason === "cleanup_failure") controller.abort("cleanup_failure");
    return read;
  };

  checkBudget();
  const [git, repoRead] = await Promise.all([
    readGitStatus(repoRoot, signal, config, cleanupFailed, resources),
    runAkJson(["repo", "resolve", cwd, "--machine"], "ak repo resolve", REPO_RESOLVE_CONTRACT),
  ]);
  if (git.warning) warnings.push(git.warning);

  const repo = summarizeRepoResolution(repoRead, cwd);
  if (repo.warning) warnings.push(repo.warning);
  const akScope = repo.registered ? repo.canonicalPath : undefined;
  const identity = deriveRepoIdentity(aiSocietyRoot, akScope || repoRoot);

  let tasks: ReturnType<typeof summarizeStartupSnapshot> = {
    readyTasks: [],
    warnings: [],
  };
  let direction: ReturnType<typeof summarizeDirection> = {
    summary: { exportOk: false, activeNodes: [], issues: [] },
    warnings: [],
  };
  let decisions: ReturnType<typeof summarizeDecisions> = { active: [], warnings: [] };
  let decisionSampleChecked = false;
  let snapshotRead: MachineRead<JsonRecord> | undefined;
  const passportReads: Array<{ decision: DecisionSummary; read: MachineRead<JsonRecord> }> = [];

  if (akScope) {
    const readySample = config.maxTasks;
    const snapshot = await runAkJson(
      [
        "startup",
        "snapshot",
        "--repo",
        akScope,
        "--ready-sample",
        String(readySample),
        "--machine",
      ],
      "ak startup snapshot",
      STARTUP_SNAPSHOT_CONTRACT,
    );
    const directionExportRead = await runAkJson(
      ["direction", "export", "--repo", akScope, "--machine"],
      "ak direction export",
      DIRECTION_EXPORT_CONTRACT,
    );
    let directionCheckRead = await runAkJson(
      ["direction", "check", "--repo", akScope, "--machine"],
      "ak direction check",
      DIRECTION_CHECK_CONTRACT,
    );
    if (directionCheckRead.ok) {
      const scope = getPathValue(directionCheckRead.value, ["payload", "repo_scope"]);
      if (scope !== undefined && scope !== akScope)
        directionCheckRead = { ok: false, warning: "ak direction check: repo scope mismatch" };
    }
    const decisionListRead = await runAkJson(
      ["decision", "list", "--machine", "--limit", "10"],
      "ak decision list",
      DECISION_LIST_CONTRACT,
    );

    snapshotRead = snapshot;
    tasks = summarizeStartupSnapshot(snapshot, akScope, config.maxTasks);
    warnings.push(...tasks.warnings);
    direction = summarizeDirection(directionExportRead, directionCheckRead);
    warnings.push(...direction.warnings);
    decisions = summarizeDecisions(decisionListRead, akScope);
    warnings.push(...decisions.warnings);
    decisionSampleChecked = decisionListRead.ok && decisions.warnings.length === 0;

    for (const decision of decisions.active.filter((item) => item.id !== null).slice(0, 2)) {
      let read = await runAkJson(
        ["decision", "passport", String(decision.id), "--machine"],
        `ak decision passport #${decision.id}`,
        DECISION_PASSPORT_CONTRACT,
      );
      if (read.ok && getPathValue(read.value, ["payload", "decision", "id"]) !== decision.id)
        read = {
          ok: false,
          warning: `ak decision passport #${decision.id}: decision identity mismatch`,
        };
      if (!read.ok) warnings.push(read.warning);
      passportReads.push({ decision, read });
    }
  } else {
    warnings.push(
      repo.registered === false
        ? "AK scoped startup reads were skipped because repo.resolve reported the cwd as unregistered; no bootstrap was attempted."
        : "AK scoped startup reads were skipped because canonical repo resolution was unavailable.",
    );
  }

  checkBudget();
  if (signal.aborted)
    warnings.push(`collection ${cancellationReason(signal)} (${String(signal.reason)})`);
  const machineSurfaces = [
    repoRead.ok && repo.registered !== null ? "repo.resolve v1" : undefined,
    snapshotRead?.ok && tasks.warnings.length === 0 ? "startup.snapshot v1" : undefined,
  ].filter((item): item is string => Boolean(item));

  const packetWithoutRecommendations = {
    applicable: true,
    disabled: false,
    packetTier: "full",
    fullRefreshStatus: signal.aborted ? "failed" : "complete",
    sourceHealth: warnings.length === 0 && repo.registered === true ? "healthy" : "degraded",
    freshness: performance.now() - started < config.ttlMs ? "fresh" : "stale",
    refreshState: "idle",
    warningCount: warnings.length,
    commandDiagnostics: diagnostics,
    capturedAt: new Date().toISOString(),
    cwd,
    aiSocietyRoot,
    repoRoot,
    identity,
    authoritativeRuntime: [
      "AK is canonical runtime/lineage/task/evidence/decision authority; its configured fsqlite-backed database is the durable substrate.",
      "ROCS = semantic authority",
      "Prompt Vault = reusable procedures/prompts, not runtime authority",
      "Pi = live execution harness/operator workbench; session registry/JSONL are not canonical authority",
      "DSPx/Oracle = empirical behavior analysis, not normative authority",
      "Docs/capability maps = narrative/projection unless promoted through runtime authority",
    ],
    git,
    ak: {
      executable: akExecutable,
      machineSurfaces,
      runtimeSchemaVersion: tasks.runtimeSchemaVersion,
      canonicalRepoPath: repo.canonicalPath,
      repoRegistered: repo.registered,
      repoMetadata: repo.metadata,
      snapshotGeneratedAt: tasks.generatedAt,
      activeDeferralCount: tasks.activeDeferralCount,
      expiredLeaseCount: tasks.expiredLeaseCount,
    },
    direction: direction.summary,
    readyTasks: tasks.readyTasks,
    readyTaskCount: tasks.readyTaskCount,
    activeTasks: [],
    activeTaskCount: tasks.activeTaskCount,
    blockedTasks: [],
    blockedTaskCount: tasks.blockedTaskCount,
    activeDecisions: decisions.active,
    decisionSampleChecked,
    decisionPassports: passportReads.map(({ decision, read }) => summarizePassport(read, decision)),
    readFirstHints: collectReadFirstHints(repoRoot, cwd),
    capabilityHints: collectCapabilityHints(aiSocietyRoot, identity),
    warnings: warnings.slice(0, config.maxWarnings),
  } satisfies Omit<StartupContextPacket, "recommendedNext">;

  return {
    ...packetWithoutRecommendations,
    recommendedNext: buildRecommendedNext(packetWithoutRecommendations),
  };
}

function formatTask(task: TaskSummary): string {
  const id = task.id === null ? "?" : `#${task.id}`;
  const priority =
    task.priority === null || task.priority === undefined ? "" : ` P${task.priority}`;
  const claimed = task.claimedBy ? ` claimed:${task.claimedBy}` : "";
  return `${id}${priority}${claimed} — ${task.title}`;
}

function formatDecision(decision: DecisionSummary): string {
  const id = decision.id === null ? "?" : `#${decision.id}`;
  const outcome = decision.outcome ? ` outcome:${decision.outcome}` : "";
  return `${id} [${decision.state}${outcome}] ${decision.title}`;
}

export function renderStartupContextPacket(packet: StartupContextPacket): string {
  if (!packet.applicable) {
    return [
      "## AI Society startup context",
      "",
      `- cwd: \`${packet.cwd}\``,
      `- ai-society root: \`${packet.aiSocietyRoot}\``,
      `- status: ${packet.disabled ? "disabled" : "not applicable outside ~/ai-society"}`,
      `- source_health: ${packet.sourceHealth || "not_checked"}; refresh_state: ${packet.refreshState || "idle"}`,
      "- automatic startup mutation status: no AK, git, docs, task, decision, projection, receipt, evidence, or session-derived canonical-state mutation was performed.",
      "",
      "### Recommended next legal actions",
      ...packet.recommendedNext.map((item) => `- ${item}`),
    ].join("\n");
  }

  const isFastTier = packet.packetTier === "fast";
  const lines = [
    isFastTier
      ? "## AI Society startup context (read-only) — fast/minimal packet"
      : "## AI Society startup context (read-only) — full packet",
    "",
    `- captured_at: ${packet.capturedAt}`,
    `- packet_tier: ${isFastTier ? "fast/minimal" : "full"}`,
    `- full_refresh_status: ${packet.fullRefreshStatus}`,
    `- source_health: ${packet.sourceHealth || "not_checked"}`,
    `- freshness: ${packet.freshness || "stale"}`,
    `- refresh_state: ${packet.refreshState || "idle"}`,
    `- source warning count (before truncation): ${packet.warningCount ?? packet.warnings.length}`,
    ...(packet.collectionElapsedMs === undefined
      ? []
      : [
          `- collection elapsed: ${Math.round(packet.collectionElapsedMs)} ms (external wall time, including admission; not AK internal timing)`,
        ]),
    ...(packet.freshness !== "fresh" && !isFastTier
      ? [
          "- stale orientation only: prior facts below are NOT current authority; read AK explicitly before acting.",
        ]
      : []),
    `- cwd: \`${packet.cwd}\``,
    `- repo_root: \`${packet.repoRoot || "unresolved"}\``,
    `- detected identity: ${formatIdentity(packet.identity)}`,
    "- automatic startup mutation status: no AK, git, docs, task, decision, projection, receipt, evidence, or session-derived canonical-state mutation was performed.",
    ...(isFastTier
      ? [
          "- partial packet warning: AK, git dirty state, direction, task, and decision surfaces were not checked in this fast tier; do not infer clean/healthy/empty posture until the full packet is ready or `/society-context refresh` completes.",
        ]
      : []),
    "",
    "### Authority orientation",
    ...packet.authoritativeRuntime.map((item) => `- ${item}`),
    "",
    "### Git posture",
  ];

  if (packet.git) {
    lines.push(
      `- status: ${packet.git.available ? (packet.git.dirty ? `dirty (${packet.git.changedCount} changed paths)` : "clean") : "unavailable"}`,
    );
    if (packet.git.sample.length > 0) {
      lines.push("- sample:", ...packet.git.sample.map((item) => `  - ${item}`));
      if (packet.git.changedCount > packet.git.sample.length) {
        lines.push(
          `  - … ${packet.git.changedCount - packet.git.sample.length} more path(s) omitted`,
        );
      }
    }
  } else if (isFastTier) {
    lines.push("- status: not checked in fast startup tier; full refresh pending or failed");
  } else {
    lines.push("- status: unavailable");
  }

  lines.push("", "### AK runtime surfaces");
  if (packet.ak) {
    lines.push(
      `- executable: \`${packet.ak.executable}\``,
      `- validated machine surfaces: ${packet.ak.machineSurfaces.join(", ") || "none"}`,
      `- runtime schema: ${packet.ak.runtimeSchemaVersion ?? "unavailable"}`,
      `- repo registration: ${packet.ak.repoRegistered === true ? "registered" : packet.ak.repoRegistered === false ? "not registered" : "unknown"}`,
    );
    if (packet.ak.canonicalRepoPath) {
      lines.push(`- canonical repo: \`${packet.ak.canonicalRepoPath}\``);
    }
    if (packet.ak.repoMetadata.length > 0) {
      lines.push(`- repo metadata: ${packet.ak.repoMetadata.join(", ")}`);
    }
    if (packet.ak.snapshotGeneratedAt) {
      lines.push(`- startup snapshot generated_at: ${packet.ak.snapshotGeneratedAt}`);
    }
    if (packet.ak.activeDeferralCount !== undefined || packet.ak.expiredLeaseCount !== undefined) {
      lines.push(
        `- snapshot posture: active_deferrals=${packet.ak.activeDeferralCount ?? "?"}, expired_leases=${packet.ak.expiredLeaseCount ?? "?"} (informational; no repair or release performed)`,
      );
    }
  } else if (isFastTier) {
    lines.push(
      "- not checked in fast startup tier; no AK availability or repo-registration claim is made",
    );
  } else {
    lines.push("- AK unavailable");
  }

  lines.push("", "### Direction health");
  if (packet.direction) {
    lines.push(
      `- export: ${packet.direction.exportOk ? `ok (${packet.direction.nodeCount ?? "?"} nodes)` : "unavailable"}`,
      `- check: ${packet.direction.checkOk === true ? "ok" : packet.direction.checkOk === false ? "not ok (observed drift)" : "unknown / unavailable"}`,
    );
    if (
      packet.direction.importedNodeCount !== undefined ||
      packet.direction.parsedNodeCount !== undefined
    ) {
      lines.push(
        `- check counts: imported=${packet.direction.importedNodeCount ?? "?"}, parsed=${packet.direction.parsedNodeCount ?? "?"}`,
      );
    }
    if (packet.direction.activeNodes.length > 0) {
      lines.push(
        "- active/next direction nodes:",
        ...packet.direction.activeNodes.map((item) => `  - ${item}`),
      );
    }
    if (packet.direction.issues.length > 0) {
      lines.push(
        "- stale/drift warnings:",
        ...packet.direction.issues.map((item) => `  - ${item}`),
      );
    }
  } else if (isFastTier) {
    lines.push("- not checked in fast startup tier; no direction health claim is made");
  } else {
    lines.push("- unavailable");
  }

  lines.push("", "### Task posture");
  if (isFastTier) {
    lines.push(
      "- not checked in fast startup tier; ready, active, and blocked task posture is pending full refresh",
    );
  } else {
    lines.push(`- ready queue: ${packet.readyTaskCount ?? "unavailable"}`);
    lines.push(`- active execution tasks: ${packet.activeTaskCount ?? "unavailable"}`);
    lines.push(`- blocked tasks: ${packet.blockedTaskCount ?? "unavailable"}`);
  }
  if (packet.readyTasks.length > 0) {
    lines.push("- ready sample:", ...packet.readyTasks.map((task) => `  - ${formatTask(task)}`));
  }
  if (packet.activeTasks.length > 0) {
    lines.push("- active sample:", ...packet.activeTasks.map((task) => `  - ${formatTask(task)}`));
  } else if (!isFastTier && (packet.activeTaskCount ?? 0) > 0) {
    lines.push("- active sample: not emitted by startup.snapshot v1; count only");
  }
  if (packet.blockedTasks.length > 0) {
    lines.push(
      "- blocked sample:",
      ...packet.blockedTasks.map((task) => `  - ${formatTask(task)}`),
    );
  } else if (!isFastTier && (packet.blockedTaskCount ?? 0) > 0) {
    lines.push("- blocked sample: not emitted by startup.snapshot v1; count only");
  }

  lines.push("", "### Decision posture");
  if (isFastTier) {
    lines.push("- not checked in fast startup tier; no absence-of-blockers claim is made");
  } else if (!packet.decisionSampleChecked) {
    lines.push("- bounded decision sample unavailable or skipped; no absence claim is made");
  } else if (packet.activeDecisions.length === 0) {
    lines.push(
      "- no active repo-scoped decisions found in the bounded decision sample; absence is not proven",
    );
  } else {
    lines.push(
      "- active decision warnings:",
      ...packet.activeDecisions.map((decision) => `  - ${formatDecision(decision)}`),
    );
  }
  if (packet.decisionPassports.length > 0) {
    lines.push(
      "- bounded passport summaries:",
      ...packet.decisionPassports.map((item) => `  - ${item}`),
    );
  }

  lines.push("", "### Capability/read-first hints");
  if (packet.capabilityHints.length > 0) {
    lines.push("- capability maps:", ...packet.capabilityHints.map((hint) => `  - ${hint}`));
  }
  if (packet.readFirstHints.length > 0) {
    lines.push("- local pointers:", ...packet.readFirstHints.map((hint) => `  - ${hint}`));
  }
  if (packet.capabilityHints.length === 0 && packet.readFirstHints.length === 0) {
    lines.push("- none found in bounded scan");
  }

  if (packet.warnings.length > 0) {
    lines.push("", "### Bounded warnings", ...packet.warnings.map((warning) => `- ${warning}`));
  }
  if (packet.commandDiagnostics?.length)
    lines.push(
      "",
      "### Collection diagnostics",
      ...packet.commandDiagnostics.map(
        (item) =>
          `- ${item.label}: ${Math.round(item.elapsedMs)} ms; ${item.reason || "read completed"}; cleanup=${item.cleanup}`,
      ),
    );

  lines.push(
    "",
    "### Recommended next legal reads/actions",
    ...packet.recommendedNext.map((item) => `- ${item}`),
  );

  return lines.join("\n");
}

export function summarizeStartupForStatus(packet: StartupContextPacket): string {
  if (packet.refreshState === "blocked_cleanup")
    return "Society ctx blocked cleanup: owned readers unresolved; authority unknown";
  if (!packet.applicable) return packet.disabled ? "Society ctx disabled" : "Society ctx n/a";
  const count = packet.warningCount ?? packet.warnings.length;
  const ready =
    packet.packetTier === "full" &&
    packet.sourceHealth === "healthy" &&
    packet.freshness === "fresh";
  const tier =
    packet.refreshState === "refreshing"
      ? "refreshing"
      : ready
        ? "✓ ready"
        : `${packet.sourceHealth || "not_checked"}/${packet.freshness || "stale"}`;
  return `Society ctx ${tier}: ${formatIdentity(packet.identity)}${count ? `, ${count} warning(s)` : ""}`;
}

export interface SocietyContextDependencies {
  collect?: typeof buildStartupContextPacket;
  config?: typeof snapshotConfig;
  now?: () => number;
  random?: () => number;
}
export default function societyStartupContextExtension(
  pi: ExtensionAPI,
  dependencies: SocietyContextDependencies = {},
) {
  let context: ExtensionContext | undefined;
  const configure = dependencies.config || snapshotConfig;
  const update = (packet: StartupContextPacket | undefined) => {
    if (!context?.hasUI) return;
    context.ui?.setStatus?.(
      "society-context",
      packet && (packet.applicable || packet.refreshState === "blocked_cleanup")
        ? summarizeStartupForStatus(packet)
        : undefined,
    );
  };
  let lifecycle: RefreshLifecycle<StartupContextPacket> | undefined;
  const controller = (ctx: ExtensionContext) => {
    if (lifecycle) return lifecycle;
    lifecycle = new RefreshLifecycle<StartupContextPacket>({
      // The host retains this manager object across reload/new/resume/fork, unlike pi or ctx.
      // Minimal injected adapters without a host manager remain isolated by their API object.
      resources: reloadStableReaders(ctx.sessionManager || pi),
      fast: (config, error) =>
        createFastStartupContextPacket(
          config.cwd,
          config.home,
          error === undefined ? "pending" : "failed",
          error === undefined ? [] : [`background full refresh failed: ${String(error)}`],
          config,
        ),
      collect: (config, signal, resources) =>
        (dependencies.collect || buildStartupContextPacket)(config.cwd, signal, config, resources),
      now: dependencies.now,
      random: dependencies.random,
      changed: update,
    });
    return lifecycle;
  };
  pi.on("session_start", async (_event, ctx) => {
    const lifecycle = controller(ctx);
    lifecycle.restart();
    context = ctx;
    const current = () => configure(ctx.cwd);
    const fast = lifecycle.consume(await lifecycle.request(current, false, 0), current);
    if (!fast) return;
    update(fast);
    if (!fast?.applicable) {
      if (ctx.hasUI && current().notifyOutside && fast)
        ctx.ui?.notify?.(summarizeStartupForStatus(fast), "info");
      return;
    }
    void lifecycle.waitCurrent(current).then((result) => {
      const packet = lifecycle.consume(result, current);
      if (!packet || !ctx.hasUI) return;
      ctx.ui?.notify?.(
        summarizeStartupForStatus(packet),
        packet.sourceHealth === "healthy" ? "info" : "warning",
      );
    });
  });
  pi.on("session_shutdown", async () => {
    const cleanup = lifecycle?.shutdown();
    try {
      update(undefined);
    } finally {
      context = undefined;
      await cleanup;
    }
  });
  pi.on("before_agent_start", async (_event, ctx) => {
    const lifecycle = controller(ctx);
    context = ctx;
    const current = () => configure(ctx.cwd);
    const packet = lifecycle.consume(await lifecycle.request(current), current);
    if (!packet) return undefined;
    update(packet);
    return startupContextMessage(
      ctx,
      packet,
      renderStartupContextPacket,
      !packet.disabled && (packet.applicable || current().injectOutside),
    );
  });
  pi.registerCommand("society-context", {
    description: "Show or refresh the read-only AI Society startup context packet",
    handler: async (args, ctx) => {
      const lifecycle = controller(ctx);
      context = ctx;
      const current = () => configure(ctx.cwd);
      const packet = lifecycle.consume(
        await lifecycle.request(current, args.trim() === "refresh"),
        current,
      );
      if (!packet) return;
      update(packet);
      const rendered = renderStartupContextPacket(packet);
      if (ctx.hasUI && ctx.ui?.editor) await ctx.ui.editor("AI Society Startup Context", rendered);
      else if (ctx.hasUI)
        ctx.ui?.notify?.(
          summarizeStartupForStatus(packet),
          packet.sourceHealth === "healthy" ? "info" : "warning",
        );
      else console.log(rendered);
    },
  });
}

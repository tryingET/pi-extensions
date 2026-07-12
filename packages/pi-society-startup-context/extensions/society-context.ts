// ---
// summary: collects and injects read-only AI Society startup context from bounded git and AK runtime probes.
// read_when:
//   - changing startup packet collection, rendering, refresh lifecycle, or Pi integration.
// ---
import { execFile } from "node:child_process";
import * as fs from "node:fs";
import * as os from "node:os";
import * as path from "node:path";
import type { ExtensionAPI } from "@earendil-works/pi-coding-agent";

const DEFAULT_COMMAND_TIMEOUT_MS = 4_000;
const DEFAULT_FULL_PACKET_WAIT_MS = 250;
const DEFAULT_MAX_TASKS = 5;
const DEFAULT_MAX_GIT_LINES = 12;
const DEFAULT_MAX_WARNINGS = 10;
const ACTIVE_DECISION_STATES = new Set([
  "proposed",
  "review_pending",
  "in_review",
  "decision_pending",
  "adr_required",
  "adr_recorded",
  "tasks_reevaluation_pending",
]);

type JsonRecord = Record<string, unknown>;

type CommandResult =
  | {
      ok: true;
      stdout: string;
      stderr: string;
    }
  | {
      ok: false;
      stdout: string;
      stderr: string;
      error: string;
      timedOut?: boolean;
      code?: number | null;
    };

type MachineRead<T = unknown> =
  | {
      ok: true;
      value: T;
    }
  | {
      ok: false;
      warning: string;
      value?: T;
      stdout?: string;
      stderr?: string;
    };

interface RepoIdentity {
  company?: string;
  lane?: string;
  repo?: string;
  relativePath: string;
}

interface TaskSummary {
  id: number | null;
  title: string;
  status?: string;
  priority?: number | null;
  claimedBy?: string | null;
}

interface DecisionSummary {
  id: number | null;
  title: string;
  state: string;
  outcome?: string | null;
  repoScope?: string | null;
}

interface DirectionSummary {
  exportOk?: boolean;
  checkOk?: boolean;
  nodeCount?: number;
  importedNodeCount?: number;
  parsedNodeCount?: number;
  activeNodes: string[];
  issues: string[];
}

interface AkSummary {
  executable: string;
  doctor: string;
  schema: string;
  repoRegistered: boolean | null;
  repoMetadata: string[];
}

interface GitSummary {
  available: boolean;
  dirty: boolean | null;
  changedCount: number;
  sample: string[];
  warning?: string;
}

type StartupPacketTier = "fast" | "full";
type FullRefreshStatus = "not_applicable" | "pending" | "complete" | "failed";

interface StartupContextPacket {
  applicable: boolean;
  disabled: boolean;
  packetTier: StartupPacketTier;
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
  decisionPassports: string[];
  readFirstHints: string[];
  capabilityHints: string[];
  recommendedNext: string[];
  warnings: string[];
}

interface ExtensionState {
  packet?: StartupContextPacket;
  inFlight?: Promise<StartupContextPacket>;
  inFlightCwd?: string;
  refreshController?: AbortController;
  generation: number;
}

function readBooleanEnv(name: string, defaultValue: boolean): boolean {
  const value = process.env[name]?.trim().toLowerCase();
  if (!value) return defaultValue;
  if (["0", "false", "no", "off", "disabled"].includes(value)) return false;
  if (["1", "true", "yes", "on", "enabled"].includes(value)) return true;
  return defaultValue;
}

function readPositiveIntegerEnv(name: string, defaultValue: number): number {
  const parsed = Number.parseInt(process.env[name] || "", 10);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : defaultValue;
}

function readNonNegativeIntegerEnv(name: string, defaultValue: number): number {
  const parsed = Number.parseInt(process.env[name] || "", 10);
  return Number.isFinite(parsed) && parsed >= 0 ? parsed : defaultValue;
}

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

function parseJsonMachine(stdout: string, surfaceLabel: string): MachineRead<JsonRecord> {
  if (!stdout.trim()) {
    return { ok: false, warning: `${surfaceLabel}: no machine output emitted` };
  }

  try {
    const parsed = JSON.parse(stdout) as unknown;
    const record = asRecord(parsed);
    if (!record) {
      return { ok: false, warning: `${surfaceLabel}: machine output was not a JSON object` };
    }
    if (record.ok === false) {
      return {
        ok: false,
        warning: `${surfaceLabel}: ${machineErrorSummary(record) || "ok=false"}`,
        value: record,
      };
    }
    return { ok: true, value: record };
  } catch (error) {
    return {
      ok: false,
      warning: `${surfaceLabel}: failed to parse JSON (${error instanceof Error ? error.message : String(error)})`,
      stdout: stdout.slice(0, 400),
    };
  }
}

function runCommand(
  command: string,
  args: string[],
  options: { cwd?: string; timeoutMs?: number; env?: NodeJS.ProcessEnv; signal?: AbortSignal } = {},
): Promise<CommandResult> {
  return new Promise((resolve) => {
    execFile(
      command,
      args,
      {
        cwd: options.cwd,
        env: options.env,
        timeout: options.timeoutMs ?? DEFAULT_COMMAND_TIMEOUT_MS,
        maxBuffer: 1024 * 1024,
        signal: options.signal,
      },
      (error, stdout, stderr) => {
        const stdoutText = stdout;
        const stderrText = stderr;
        if (!error) {
          resolve({ ok: true, stdout: stdoutText, stderr: stderrText });
          return;
        }

        const errorRecord = asRecord(error);
        const codeValue = errorRecord ? errorRecord.code : undefined;
        const signalValue = errorRecord ? errorRecord.signal : undefined;
        const timedOut = signalValue === "SIGTERM" || codeValue === "ETIMEDOUT";
        resolve({
          ok: false,
          stdout: stdoutText,
          stderr: stderrText,
          error: error instanceof Error ? error.message : String(error),
          timedOut,
          code: asNumber(errorRecord?.code),
        });
      },
    );
  });
}

async function runJsonCommand(
  command: string,
  args: string[],
  label: string,
  options: { cwd?: string; timeoutMs?: number; env?: NodeJS.ProcessEnv; signal?: AbortSignal } = {},
): Promise<MachineRead<JsonRecord>> {
  const result = await runCommand(command, args, options);
  if (!result.ok) {
    const parsed = parseJsonMachine(result.stdout, label);
    if (parsed.ok || parsed.value) {
      return parsed;
    }

    const reason = result.timedOut ? "timed out" : result.error;
    return {
      ok: false,
      warning: `${label}: ${reason}`,
      stdout: result.stdout.slice(0, 400),
      stderr: result.stderr.slice(0, 400),
    };
  }
  return parseJsonMachine(result.stdout, label);
}

async function findGitRepoRoot(
  cwd: string,
  signal?: AbortSignal,
): Promise<{ repoRoot: string; warning?: string }> {
  const result = await runCommand("git", ["rev-parse", "--show-toplevel"], {
    cwd,
    timeoutMs: 2_000,
    signal,
  });
  if (!result.ok) {
    return { repoRoot: cwd, warning: `git repo root unavailable: ${result.error}` };
  }
  const repoRoot = result.stdout.trim();
  return { repoRoot: repoRoot || cwd };
}

async function readGitStatus(repoRoot: string, signal?: AbortSignal): Promise<GitSummary> {
  const result = await runCommand("git", ["status", "--short"], {
    cwd: repoRoot,
    timeoutMs: 3_000,
    signal,
  });
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
    sample: lines.slice(
      0,
      readPositiveIntegerEnv("PI_SOCIETY_CONTEXT_MAX_GIT_LINES", DEFAULT_MAX_GIT_LINES),
    ),
  };
}

function resolveAkExecutable(): string {
  const explicit = process.env.PI_SOCIETY_CONTEXT_AK || process.env.AGENT_KERNEL;
  if (explicit?.trim()) return explicit.trim();

  const releaseAk = path.join(
    os.homedir(),
    "ai-society",
    "softwareco",
    "owned",
    "agent-kernel",
    "target",
    "release",
    "ak",
  );
  if (fs.existsSync(releaseAk)) return releaseAk;

  return "ak";
}

function buildAkEnv(): NodeJS.ProcessEnv {
  return {
    ...process.env,
    AK_DB: process.env.AK_DB || path.join(os.homedir(), "ai-society", "society.v2.db"),
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

function summarizeRepoShow(read: MachineRead<JsonRecord>): {
  registered: boolean | null;
  metadata: string[];
  warning?: string;
} {
  if (!read.ok) return { registered: null, metadata: [], warning: read.warning };
  const repo = asRecord(getPathValue(read.value, ["payload", "repo"]));
  if (!repo)
    return { registered: null, metadata: [], warning: "ak repo show: payload.repo missing" };
  const metadata = [
    asString(repo.company) ? `company=${repo.company}` : undefined,
    asString(repo.archetype) ? `archetype=${repo.archetype}` : undefined,
    asString(repo.layer) ? `layer=${repo.layer}` : undefined,
    asString(repo.generated_from) ? `generated_from=${repo.generated_from}` : undefined,
  ].filter((item): item is string => Boolean(item));
  return { registered: true, metadata };
}

function summarizeDoctor(read: MachineRead<JsonRecord>): string {
  if (!read.ok) return `unavailable (${read.warning})`;
  const payload = asRecord(read.value.payload);
  const status = asString(payload?.status) || asString(payload?.summary);
  if (status) return status;
  return "machine envelope ok";
}

function summarizeSchema(read: MachineRead<JsonRecord>): string {
  if (!read.ok) return `unavailable (${read.warning})`;
  const surfaces = asArray(read.value.surfaces);
  const firstSurface = asRecord(surfaces[0]);
  if (firstSurface) {
    const name = asString(firstSurface.surface) || "unknown";
    const version = asNumber(firstSurface.schema_version);
    return `${name}${version === null ? "" : ` v${version}`}`;
  }
  const version = asNumber(read.value.schema_discovery_version);
  return version === null ? "schema catalog readable" : `schema catalog v${version}`;
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

  const checkRecord = checkRead.value;
  if (checkRecord) {
    const payload = asRecord(checkRecord.payload) || checkRecord;
    summary.checkOk = checkRead.ok && payload.ok === true;
    summary.importedNodeCount = asNumber(payload.imported_node_count) ?? undefined;
    summary.parsedNodeCount = asNumber(payload.parsed_node_count) ?? undefined;
    summary.issues = asArray(payload.issues)
      .slice(0, 5)
      .map((issue) => (typeof issue === "string" ? issue : JSON.stringify(issue).slice(0, 180)));
    if (!checkRead.ok) {
      warnings.push(checkRead.warning);
    }
  } else {
    summary.checkOk = false;
    warnings.push(!checkRead.ok ? checkRead.warning : "ak direction check: no payload");
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
    claimedBy: asString(record.claimed_by) || null,
  };
}

function summarizeTaskCollection(read: MachineRead<JsonRecord>): {
  tasks: TaskSummary[];
  count?: number;
  warnings: string[];
} {
  if (!read.ok) return { tasks: [], warnings: [read.warning] };
  const payload = asRecord(read.value.payload);
  return {
    count: asNumber(payload?.count) ?? undefined,
    tasks: asArray(payload?.tasks).map(toTaskSummary).filter(Boolean) as TaskSummary[],
    warnings: [],
  };
}

function boundedTaskSample(tasks: TaskSummary[]): TaskSummary[] {
  return tasks.slice(0, readPositiveIntegerEnv("PI_SOCIETY_CONTEXT_MAX_TASKS", DEFAULT_MAX_TASKS));
}

function sumKnownCounts(...counts: Array<number | undefined>): number | undefined {
  if (!counts.every((count) => count !== undefined)) return undefined;
  return counts.reduce((sum, count) => sum + count, 0);
}

function summarizeTasks(
  readyRead: MachineRead<JsonRecord>,
  claimedRead: MachineRead<JsonRecord>,
  runningRead: MachineRead<JsonRecord>,
  blockedRead: MachineRead<JsonRecord>,
): {
  readyTasks: TaskSummary[];
  readyTaskCount?: number;
  activeTasks: TaskSummary[];
  activeTaskCount?: number;
  blockedTasks: TaskSummary[];
  blockedTaskCount?: number;
  warnings: string[];
} {
  const ready = summarizeTaskCollection(readyRead);
  const claimed = summarizeTaskCollection(claimedRead);
  const running = summarizeTaskCollection(runningRead);
  const blocked = summarizeTaskCollection(blockedRead);
  const activeTasks = [...claimed.tasks, ...running.tasks];

  return {
    readyTasks: boundedTaskSample(ready.tasks),
    readyTaskCount: ready.count,
    activeTasks: boundedTaskSample(activeTasks),
    activeTaskCount: sumKnownCounts(claimed.count, running.count),
    blockedTasks: boundedTaskSample(blocked.tasks),
    blockedTaskCount: blocked.count,
    warnings: [...ready.warnings, ...claimed.warnings, ...running.warnings, ...blocked.warnings],
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
    "Treat AK + society.v2.db as canonical runtime authority; treat docs/capability maps as orientation/projection until promoted through runtime authority.",
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
): StartupContextPacket {
  const aiSocietyRoot = getAiSocietyRoot(homeDir);
  if (!readBooleanEnv("PI_SOCIETY_STARTUP_CONTEXT", true)) {
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
    capturedAt: new Date().toISOString(),
    cwd,
    aiSocietyRoot,
    repoRoot,
    identity,
    authoritativeRuntime: [
      "AK + society.v2.db = canonical runtime/lineage/task/evidence/decision authority",
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
    warnings: warnings.slice(
      0,
      readPositiveIntegerEnv("PI_SOCIETY_CONTEXT_MAX_WARNINGS", DEFAULT_MAX_WARNINGS),
    ),
  } satisfies Omit<StartupContextPacket, "recommendedNext">;

  return {
    ...packetWithoutRecommendations,
    recommendedNext: buildRecommendedNext(packetWithoutRecommendations),
  };
}

async function buildStartupContextPacket(
  cwd: string,
  signal?: AbortSignal,
): Promise<StartupContextPacket> {
  const aiSocietyRoot = getAiSocietyRoot();
  if (!readBooleanEnv("PI_SOCIETY_STARTUP_CONTEXT", true)) {
    return createNotApplicablePacket(cwd, aiSocietyRoot, true);
  }

  if (!isInsideAiSocietyPath(cwd)) {
    return createNotApplicablePacket(cwd, aiSocietyRoot);
  }

  const warnings: string[] = [];
  const { repoRoot, warning: repoRootWarning } = await findGitRepoRoot(cwd, signal);
  if (repoRootWarning) warnings.push(repoRootWarning);

  const identity = deriveRepoIdentity(aiSocietyRoot, repoRoot);
  const akExecutable = resolveAkExecutable();
  const akEnv = buildAkEnv();
  const commandTimeoutMs = readPositiveIntegerEnv(
    "PI_SOCIETY_CONTEXT_COMMAND_TIMEOUT_MS",
    DEFAULT_COMMAND_TIMEOUT_MS,
  );
  const runAkJson = (args: string[], label: string) =>
    runJsonCommand(akExecutable, args, label, {
      cwd: repoRoot,
      env: akEnv,
      timeoutMs: commandTimeoutMs,
      signal,
    });

  const [
    git,
    doctorRead,
    schemaRead,
    repoRead,
    directionExportRead,
    directionCheckRead,
    readyRead,
    claimedTaskRead,
    runningTaskRead,
    blockedTaskRead,
    decisionListRead,
  ] = await Promise.all([
    readGitStatus(repoRoot, signal),
    runAkJson(["doctor", "--machine"], "ak doctor"),
    runAkJson(["machine", "schema", "task-ready", "-F", "json"], "ak machine schema"),
    runAkJson(["repo", "show", repoRoot, "--machine"], "ak repo show"),
    runAkJson(["direction", "export", "--repo", repoRoot, "--machine"], "ak direction export"),
    runAkJson(["direction", "check", "--repo", repoRoot, "--machine"], "ak direction check"),
    runAkJson(["task", "ready", "--repo", repoRoot, "--machine"], "ak task ready"),
    runAkJson(
      ["task", "list", "--repo", repoRoot, "--status", "claimed", "--machine"],
      "ak task list --status claimed",
    ),
    runAkJson(
      ["task", "list", "--repo", repoRoot, "--status", "running", "--machine"],
      "ak task list --status running",
    ),
    runAkJson(
      ["task", "list", "--repo", repoRoot, "--status", "blocked", "--machine"],
      "ak task list --status blocked",
    ),
    runAkJson(["decision", "list", "--machine", "--limit", "10"], "ak decision list"),
  ]);

  if (git.warning) warnings.push(git.warning);

  const repo = summarizeRepoShow(repoRead);
  if (repo.warning) warnings.push(repo.warning);

  const direction = summarizeDirection(directionExportRead, directionCheckRead);
  warnings.push(...direction.warnings);

  const tasks = summarizeTasks(readyRead, claimedTaskRead, runningTaskRead, blockedTaskRead);
  warnings.push(...tasks.warnings);

  const decisions = summarizeDecisions(decisionListRead, repoRoot);
  warnings.push(...decisions.warnings);

  const passportReads = await Promise.all(
    decisions.active
      .filter((decision) => decision.id !== null)
      .slice(0, 2)
      .map(async (decision) => ({
        decision,
        read: await runAkJson(
          ["decision", "passport", String(decision.id), "--machine"],
          `ak decision passport #${decision.id}`,
        ),
      })),
  );

  const packetWithoutRecommendations = {
    applicable: true,
    disabled: false,
    packetTier: "full",
    fullRefreshStatus: "complete",
    capturedAt: new Date().toISOString(),
    cwd,
    aiSocietyRoot,
    repoRoot,
    identity,
    authoritativeRuntime: [
      "AK + society.v2.db = canonical runtime/lineage/task/evidence/decision authority",
      "ROCS = semantic authority",
      "Prompt Vault = reusable procedures/prompts, not runtime authority",
      "Pi = live execution harness/operator workbench; session registry/JSONL are not canonical authority",
      "DSPx/Oracle = empirical behavior analysis, not normative authority",
      "Docs/capability maps = narrative/projection unless promoted through runtime authority",
    ],
    git,
    ak: {
      executable: akExecutable,
      doctor: summarizeDoctor(doctorRead),
      schema: summarizeSchema(schemaRead),
      repoRegistered: repo.registered,
      repoMetadata: repo.metadata,
    },
    direction: direction.summary,
    readyTasks: tasks.readyTasks,
    readyTaskCount: tasks.readyTaskCount,
    activeTasks: tasks.activeTasks,
    activeTaskCount: tasks.activeTaskCount,
    blockedTasks: tasks.blockedTasks,
    blockedTaskCount: tasks.blockedTaskCount,
    activeDecisions: decisions.active,
    decisionPassports: passportReads.map(({ decision, read }) => summarizePassport(read, decision)),
    readFirstHints: collectReadFirstHints(repoRoot, cwd),
    capabilityHints: collectCapabilityHints(aiSocietyRoot, identity),
    warnings: warnings.slice(
      0,
      readPositiveIntegerEnv("PI_SOCIETY_CONTEXT_MAX_WARNINGS", DEFAULT_MAX_WARNINGS),
    ),
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
      `- doctor: ${packet.ak.doctor}`,
      `- machine schema discovery: ${packet.ak.schema}`,
      `- repo registration: ${packet.ak.repoRegistered === true ? "registered" : packet.ak.repoRegistered === false ? "not registered" : "unknown"}`,
    );
    if (packet.ak.repoMetadata.length > 0) {
      lines.push(`- repo metadata: ${packet.ak.repoMetadata.join(", ")}`);
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
      `- check: ${packet.direction.checkOk ? "ok" : "not ok or unavailable"}`,
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
  }
  if (packet.blockedTasks.length > 0) {
    lines.push(
      "- blocked sample:",
      ...packet.blockedTasks.map((task) => `  - ${formatTask(task)}`),
    );
  }

  lines.push("", "### Decision posture");
  if (isFastTier) {
    lines.push("- not checked in fast startup tier; no absence-of-blockers claim is made");
  } else if (packet.activeDecisions.length === 0) {
    lines.push("- no active repo-scoped decision blockers found in bounded decision list");
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

  lines.push(
    "",
    "### Recommended next legal reads/actions",
    ...packet.recommendedNext.map((item) => `- ${item}`),
  );

  return lines.join("\n");
}

function summarizeRefreshError(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

function waitForPacket(
  promise: Promise<StartupContextPacket>,
  timeoutMs: number,
): Promise<StartupContextPacket | undefined> {
  if (timeoutMs <= 0) return Promise.resolve(undefined);
  return new Promise((resolve) => {
    const timer = setTimeout(() => resolve(undefined), timeoutMs);
    promise.then((packet) => {
      clearTimeout(timer);
      resolve(packet);
    });
  });
}

function startFullRefresh(state: ExtensionState, cwd: string): Promise<StartupContextPacket> {
  state.refreshController?.abort();
  const controller = new AbortController();
  const generation = state.generation + 1;
  state.generation = generation;
  state.inFlightCwd = cwd;
  state.refreshController = controller;
  let refreshPromise: Promise<StartupContextPacket>;
  refreshPromise = buildStartupContextPacket(cwd, controller.signal)
    .catch((error: unknown) =>
      createFastStartupContextPacket(cwd, os.homedir(), "failed", [
        `background full refresh failed: ${summarizeRefreshError(error)}`,
      ]),
    )
    .then((packet) => {
      if (
        state.generation === generation &&
        state.inFlight === refreshPromise &&
        state.inFlightCwd === cwd
      ) {
        state.packet = packet;
      }
      return packet;
    })
    .finally(() => {
      if (state.generation === generation && state.inFlight === refreshPromise) {
        state.inFlight = undefined;
        state.inFlightCwd = undefined;
        state.refreshController = undefined;
      }
    });
  state.inFlight = refreshPromise;
  return refreshPromise;
}

async function ensurePacket(state: ExtensionState, cwd: string): Promise<StartupContextPacket> {
  if (state.packet?.cwd === cwd && state.packet.packetTier === "full") return state.packet;

  if (!state.packet || state.packet.cwd !== cwd) {
    state.packet = createFastStartupContextPacket(cwd);
  }

  if (state.packet.applicable && (!state.inFlight || state.inFlightCwd !== cwd)) {
    startFullRefresh(state, cwd);
  }

  if (state.inFlight && state.inFlightCwd === cwd) {
    const packet = await waitForPacket(
      state.inFlight,
      readNonNegativeIntegerEnv("PI_SOCIETY_CONTEXT_FULL_WAIT_MS", DEFAULT_FULL_PACKET_WAIT_MS),
    );
    if (packet) return packet;
  }

  return state.packet;
}

function summarizeStartupForStatus(packet: StartupContextPacket): string {
  if (!packet.applicable) return packet.disabled ? "Society ctx disabled" : "Society ctx n/a";
  const warningSuffix = packet.warnings.length > 0 ? `, ${packet.warnings.length} warning(s)` : "";
  const tier = packet.packetTier === "full" ? "ready" : "fast/minimal";
  return `Society ctx ${tier}: ${formatIdentity(packet.identity)}${warningSuffix}`;
}

export default function societyStartupContextExtension(pi: ExtensionAPI) {
  const state: ExtensionState = { generation: 0 };

  pi.on("session_start", async (_event, ctx) => {
    const fastPacket = createFastStartupContextPacket(ctx.cwd);
    state.packet = fastPacket;

    if (ctx.hasUI) {
      ctx.ui?.setStatus?.("society-context", fastPacket.applicable ? "Society ctx…" : undefined);
      if (!fastPacket.applicable && readBooleanEnv("PI_SOCIETY_CONTEXT_NOTIFY_OUTSIDE", false)) {
        ctx.ui?.notify?.(
          summarizeStartupForStatus(fastPacket),
          fastPacket.warnings.length > 0 ? "warning" : "info",
        );
      }
    }

    if (!fastPacket.applicable) return;

    const refresh = startFullRefresh(state, ctx.cwd);
    const refreshGeneration = state.generation;
    void refresh.then((packet) => {
      if (state.generation !== refreshGeneration || packet.cwd !== ctx.cwd) return;
      if (ctx.hasUI) {
        ctx.ui?.setStatus?.("society-context", packet.applicable ? "Society ctx✓" : undefined);
        ctx.ui?.notify?.(
          summarizeStartupForStatus(packet),
          packet.warnings.length > 0 ? "warning" : "info",
        );
      }
    });
  });

  pi.on("session_shutdown", async () => {
    state.generation += 1;
    state.refreshController?.abort();
    state.refreshController = undefined;
    state.inFlight = undefined;
    state.inFlightCwd = undefined;
  });

  pi.on("before_agent_start", async (event, ctx) => {
    const packet = await ensurePacket(state, ctx.cwd);
    if (!packet.applicable && !readBooleanEnv("PI_SOCIETY_CONTEXT_INJECT_OUTSIDE", false)) {
      return undefined;
    }

    return {
      systemPrompt: `${event.systemPrompt}\n\n${renderStartupContextPacket(packet)}`,
    };
  });

  pi.registerCommand("society-context", {
    description: "Show or refresh the read-only AI Society startup context packet",
    handler: async (args, ctx) => {
      if (args.trim() === "refresh") {
        state.packet = await startFullRefresh(state, ctx.cwd);
      }
      const packet = await ensurePacket(state, ctx.cwd);
      const rendered = renderStartupContextPacket(packet);
      if (ctx.hasUI && ctx.ui?.editor) {
        await ctx.ui.editor("AI Society Startup Context", rendered);
      } else if (ctx.hasUI) {
        ctx.ui?.notify?.(
          summarizeStartupForStatus(packet),
          packet.warnings.length > 0 ? "warning" : "info",
        );
      } else {
        console.log(rendered);
      }
    },
  });
}

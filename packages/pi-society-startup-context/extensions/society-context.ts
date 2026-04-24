import { execFile } from "node:child_process";
import * as fs from "node:fs";
import * as os from "node:os";
import * as path from "node:path";
import type { ExtensionAPI } from "@mariozechner/pi-coding-agent";

const DEFAULT_COMMAND_TIMEOUT_MS = 4_000;
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

interface StartupContextPacket {
  applicable: boolean;
  disabled: boolean;
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
  taskStatusCounts: Record<string, number>;
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
  options: { cwd?: string; timeoutMs?: number; env?: NodeJS.ProcessEnv } = {},
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
  options: { cwd?: string; timeoutMs?: number; env?: NodeJS.ProcessEnv } = {},
): Promise<MachineRead<JsonRecord>> {
  const result = await runCommand(command, args, options);
  if (!result.ok) {
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

async function findGitRepoRoot(cwd: string): Promise<{ repoRoot: string; warning?: string }> {
  const result = await runCommand("git", ["rev-parse", "--show-toplevel"], {
    cwd,
    timeoutMs: 2_000,
  });
  if (!result.ok) {
    return { repoRoot: cwd, warning: `git repo root unavailable: ${result.error}` };
  }
  const repoRoot = result.stdout.trim();
  return { repoRoot: repoRoot || cwd };
}

async function readGitStatus(repoRoot: string): Promise<GitSummary> {
  const result = await runCommand("git", ["status", "--short"], {
    cwd: repoRoot,
    timeoutMs: 3_000,
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

function deriveRepoIdentity(aiSocietyRoot: string, repoRoot: string): RepoIdentity {
  const relativePath = path.relative(aiSocietyRoot, repoRoot) || ".";
  const parts = relativePath.split(path.sep).filter(Boolean);
  const company = parts[0];
  const maybeLane = parts[1];
  const knownLanes = new Set(["owned", "infra", "contrib", "agents", "fork", "core", "data"]);
  const lane = maybeLane && knownLanes.has(maybeLane) ? maybeLane : undefined;
  const repo = lane ? parts[2] : parts[1];
  return { company, lane, repo, relativePath };
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

  if (checkRead.ok) {
    const payload = asRecord(checkRead.value.payload) || checkRead.value;
    summary.checkOk = payload.ok === true;
    summary.importedNodeCount = asNumber(payload.imported_node_count) ?? undefined;
    summary.parsedNodeCount = asNumber(payload.parsed_node_count) ?? undefined;
    summary.issues = asArray(payload.issues)
      .slice(0, 5)
      .map((issue) => (typeof issue === "string" ? issue : JSON.stringify(issue).slice(0, 180)));
  } else {
    summary.checkOk = false;
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
    claimedBy: asString(record.claimed_by) || null,
  };
}

function summarizeTasks(
  readyRead: MachineRead<JsonRecord>,
  listRead: MachineRead<JsonRecord>,
): {
  readyTasks: TaskSummary[];
  readyTaskCount?: number;
  statusCounts: Record<string, number>;
  warnings: string[];
} {
  const warnings: string[] = [];
  const limit = readPositiveIntegerEnv("PI_SOCIETY_CONTEXT_MAX_TASKS", DEFAULT_MAX_TASKS);
  let readyTasks: TaskSummary[] = [];
  let readyTaskCount: number | undefined;
  const statusCounts: Record<string, number> = {};

  if (readyRead.ok) {
    const payload = asRecord(readyRead.value.payload);
    readyTaskCount = asNumber(payload?.count) ?? undefined;
    readyTasks = asArray(payload?.tasks)
      .map(toTaskSummary)
      .filter(Boolean)
      .slice(0, limit) as TaskSummary[];
  } else {
    warnings.push(readyRead.warning);
  }

  if (listRead.ok) {
    const tasks = asArray(getPathValue(listRead.value, ["payload", "tasks"]));
    for (const task of tasks) {
      const status = asString(asRecord(task)?.status) || "unknown";
      statusCounts[status] = (statusCounts[status] || 0) + 1;
    }
  } else {
    warnings.push(listRead.warning);
  }

  return { readyTasks, readyTaskCount, statusCounts, warnings };
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

function collectReadFirstHints(repoRoot: string, cwd: string): string[] {
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
    packageCandidates.push(path.join(current, "AGENTS.md"), path.join(current, "README.md"));
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
    capturedAt: new Date().toISOString(),
    cwd,
    aiSocietyRoot,
    authoritativeRuntime: [],
    readyTasks: [],
    taskStatusCounts: {},
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

async function buildStartupContextPacket(cwd: string): Promise<StartupContextPacket> {
  const aiSocietyRoot = getAiSocietyRoot();
  if (!readBooleanEnv("PI_SOCIETY_STARTUP_CONTEXT", true)) {
    return createNotApplicablePacket(cwd, aiSocietyRoot, true);
  }

  if (!isInsideAiSocietyPath(cwd)) {
    return createNotApplicablePacket(cwd, aiSocietyRoot);
  }

  const warnings: string[] = [];
  const { repoRoot, warning: repoRootWarning } = await findGitRepoRoot(cwd);
  if (repoRootWarning) warnings.push(repoRootWarning);

  const identity = deriveRepoIdentity(aiSocietyRoot, repoRoot);
  const akExecutable = resolveAkExecutable();
  const akEnv = buildAkEnv();
  const commandTimeoutMs = readPositiveIntegerEnv(
    "PI_SOCIETY_CONTEXT_COMMAND_TIMEOUT_MS",
    DEFAULT_COMMAND_TIMEOUT_MS,
  );

  const [
    git,
    doctorRead,
    schemaRead,
    repoRead,
    directionExportRead,
    directionCheckRead,
    readyRead,
    taskListRead,
    decisionListRead,
  ] = await Promise.all([
    readGitStatus(repoRoot),
    runJsonCommand(akExecutable, ["doctor", "--machine"], "ak doctor", {
      cwd: repoRoot,
      env: akEnv,
      timeoutMs: commandTimeoutMs,
    }),
    runJsonCommand(
      akExecutable,
      ["machine", "schema", "task-ready", "-F", "json"],
      "ak machine schema",
      {
        cwd: repoRoot,
        env: akEnv,
        timeoutMs: commandTimeoutMs,
      },
    ),
    runJsonCommand(akExecutable, ["repo", "show", repoRoot, "--machine"], "ak repo show", {
      cwd: repoRoot,
      env: akEnv,
      timeoutMs: commandTimeoutMs,
    }),
    runJsonCommand(
      akExecutable,
      ["direction", "export", "--repo", repoRoot, "--machine"],
      "ak direction export",
      { cwd: repoRoot, env: akEnv, timeoutMs: commandTimeoutMs },
    ),
    runJsonCommand(
      akExecutable,
      ["direction", "check", "--repo", repoRoot, "-F", "json"],
      "ak direction check",
      { cwd: repoRoot, env: akEnv, timeoutMs: commandTimeoutMs },
    ),
    runJsonCommand(
      akExecutable,
      ["task", "ready", "--repo", repoRoot, "--machine"],
      "ak task ready",
      {
        cwd: repoRoot,
        env: akEnv,
        timeoutMs: commandTimeoutMs,
      },
    ),
    runJsonCommand(
      akExecutable,
      ["task", "list", "--repo", repoRoot, "--machine"],
      "ak task list",
      {
        cwd: repoRoot,
        env: akEnv,
        timeoutMs: commandTimeoutMs,
      },
    ),
    runJsonCommand(
      akExecutable,
      ["decision", "list", "--machine", "--limit", "10"],
      "ak decision list",
      {
        cwd: repoRoot,
        env: akEnv,
        timeoutMs: commandTimeoutMs,
      },
    ),
  ]);

  if (git.warning) warnings.push(git.warning);

  const repo = summarizeRepoShow(repoRead);
  if (repo.warning) warnings.push(repo.warning);

  const direction = summarizeDirection(directionExportRead, directionCheckRead);
  warnings.push(...direction.warnings);

  const tasks = summarizeTasks(readyRead, taskListRead);
  warnings.push(...tasks.warnings);

  const decisions = summarizeDecisions(decisionListRead, repoRoot);
  warnings.push(...decisions.warnings);

  const passportReads = await Promise.all(
    decisions.active
      .filter((decision) => decision.id !== null)
      .slice(0, 2)
      .map(async (decision) => ({
        decision,
        read: await runJsonCommand(
          akExecutable,
          ["decision", "passport", String(decision.id), "--machine"],
          `ak decision passport #${decision.id}`,
          { cwd: repoRoot, env: akEnv, timeoutMs: commandTimeoutMs },
        ),
      })),
  );

  const packetWithoutRecommendations = {
    applicable: true,
    disabled: false,
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
    taskStatusCounts: tasks.statusCounts,
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

function formatStatusCounts(counts: Record<string, number>): string {
  const entries = Object.entries(counts).sort(
    (left, right) => right[1] - left[1] || left[0].localeCompare(right[0]),
  );
  return entries.length === 0
    ? "unavailable"
    : entries.map(([status, count]) => `${status}:${count}`).join(", ");
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

  const lines = [
    "## AI Society startup context (read-only)",
    "",
    `- captured_at: ${packet.capturedAt}`,
    `- cwd: \`${packet.cwd}\``,
    `- repo_root: \`${packet.repoRoot || "unresolved"}\``,
    `- detected identity: ${formatIdentity(packet.identity)}`,
    "- automatic startup mutation status: no AK, git, docs, task, decision, projection, receipt, evidence, or session-derived canonical-state mutation was performed.",
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
  } else {
    lines.push("- unavailable");
  }

  lines.push("", "### Task posture");
  lines.push(`- ready queue: ${packet.readyTaskCount ?? "unavailable"}`);
  lines.push(`- status counts: ${formatStatusCounts(packet.taskStatusCounts)}`);
  if (packet.readyTasks.length > 0) {
    lines.push("- ready sample:", ...packet.readyTasks.map((task) => `  - ${formatTask(task)}`));
  }

  lines.push("", "### Decision posture");
  if (packet.activeDecisions.length === 0) {
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

async function ensurePacket(state: ExtensionState, cwd: string): Promise<StartupContextPacket> {
  if (state.packet?.cwd === cwd) return state.packet;
  if (!state.inFlight) {
    state.inFlight = buildStartupContextPacket(cwd).finally(() => {
      state.inFlight = undefined;
    });
  }
  state.packet = await state.inFlight;
  return state.packet;
}

function summarizeStartupForStatus(packet: StartupContextPacket): string {
  if (!packet.applicable) return packet.disabled ? "Society ctx disabled" : "Society ctx n/a";
  const warningSuffix = packet.warnings.length > 0 ? `, ${packet.warnings.length} warning(s)` : "";
  return `Society ctx ready: ${formatIdentity(packet.identity)}${warningSuffix}`;
}

export default function societyStartupContextExtension(pi: ExtensionAPI) {
  const state: ExtensionState = {};

  pi.on("session_start", async (_event, ctx) => {
    state.packet = undefined;
    state.inFlight = buildStartupContextPacket(ctx.cwd).finally(() => {
      state.inFlight = undefined;
    });
    const packet = await state.inFlight;
    state.packet = packet;

    if (ctx.hasUI) {
      ctx.ui?.setStatus?.("society-context", packet.applicable ? "Society ctx✓" : undefined);
      if (packet.applicable || readBooleanEnv("PI_SOCIETY_CONTEXT_NOTIFY_OUTSIDE", false)) {
        ctx.ui?.notify?.(
          summarizeStartupForStatus(packet),
          packet.warnings.length > 0 ? "warning" : "info",
        );
      }
    }
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
        state.packet = await buildStartupContextPacket(ctx.cwd);
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
      }
    },
  });
}

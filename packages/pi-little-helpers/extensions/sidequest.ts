import { createHash } from "node:crypto";
import { existsSync, mkdirSync, readFileSync, readlinkSync } from "node:fs";
import { homedir } from "node:os";
import { basename, isAbsolute, join, relative, resolve, sep } from "node:path";
import type { ExtensionAPI } from "@mariozechner/pi-coding-agent";
import { Type } from "typebox";

const DEFAULT_PI_BIN = process.env.PI_SIDEQUEST_PI_BIN || "pi";
const GHOSTTY_PROBE_TIMEOUT_MS = 4000;
const GHOSTTY_LAUNCH_TIMEOUT_MS = 15000;
const TITLE_MAX_LEN = 48;
const GHOSTTY_BIN_NAME = "ghostty";
const LOCAL_GHOSTTY_WRAPPER = join(homedir(), ".local", "bin", "ghostty-sidequest");
const LOCAL_GHOSTTY_BIN = join(homedir(), ".local", "opt", "ghostty-sidequest", "bin", "ghostty");

type PiToolParameters = Parameters<ExtensionAPI["registerTool"]>[0]["parameters"];

type LaunchMode = "tab" | "window";
type SidequestRole = "scout" | "reviewer";
type SidequestReportBack = "intercom" | "manual" | "none";
type ParallelquestReportBack = SidequestReportBack;

type ModelLike = {
  provider: string;
  id: string;
};

type ExecOptions = {
  cwd?: string;
  timeout?: number;
};

type ExecResult = {
  code: number;
  stdout?: string;
  stderr?: string;
  killed?: boolean;
};

type ExecRunner = (command: string, args: string[], options?: ExecOptions) => Promise<ExecResult>;

type LaunchResult = {
  ok: boolean;
  code: number;
  stdout: string;
  stderr: string;
  killed: boolean;
};

type SidequestOptions = {
  env?: NodeJS.ProcessEnv;
  exec?: ExecRunner;
  pathExists?: (path: string) => boolean;
  currentSessionGhosttyBin?: string;
  processId?: number;
};

type SidequestContext = {
  campaignGoal?: string;
  primaryMetric?: string;
  currentBest?: string;
  blocker?: string;
  filesInScope?: string[];
  offLimits?: string[];
  constraints?: string[];
  artifactsToRead?: string[];
  currentFindings?: string[];
};

type SidequestSpawnRequest = {
  role?: SidequestRole;
  objective?: string;
  cwd?: string;
  reportBack?: SidequestReportBack;
  parentPeerTarget?: string;
  context?: SidequestContext;
  dod?: string[];
};

type ParallelquestSpawnRequest = {
  objective?: string;
  cwd?: string;
  baseRef?: string;
  branchName?: string;
  workspaceRoot?: string;
  workspaceName?: string;
  filesInScope?: string[];
  offLimits?: string[];
  constraints?: string[];
  dod?: string[];
  reportBack?: ParallelquestReportBack;
  parentPeerTarget?: string;
  requireCleanParent?: boolean;
  reuseExisting?: boolean;
};

type WorktreePrepareSuccess = {
  ok: true;
  parentCwd: string;
  repoRoot: string;
  worktreePath: string;
  branchName: string;
  baseRef: string;
  parentDirty: boolean;
  parentDirtyWarning?: string;
  reusedExisting: boolean;
};

type WorktreePrepareFailure = {
  ok: false;
  error: string;
  parentCwd: string;
  repoRoot?: string;
  worktreePath?: string;
  branchName?: string;
  baseRef?: string;
  parentDirty?: boolean;
  parentDirtyWarning?: string;
};

type WorktreePrepareResult = WorktreePrepareSuccess | WorktreePrepareFailure;

type SidequestLaunchSuccess = {
  ok: true;
  launchMode: LaunchMode;
  cwd: string;
  sessionFile: string;
  titleBase: string;
  promptSummary: string;
  launchNote?: string;
};

type SidequestLaunchFailure = {
  ok: false;
  failure: string;
  cwd: string;
  sessionFile: string;
  titleBase: string;
  promptSummary: string;
  launchMode: LaunchMode;
  launchNote?: string;
};

type SidequestLaunchOutcome = SidequestLaunchSuccess | SidequestLaunchFailure;

function asPiToolParameters(schema: unknown): PiToolParameters {
  return schema as PiToolParameters;
}

const reportBackParameter = Type.Optional(
  Type.Union([Type.Literal("intercom"), Type.Literal("manual"), Type.Literal("none")], {
    description:
      "Report-back mode. Controller-spawned quest tools default to intercom unless explicitly set to manual or none.",
  }),
);

const sidequestSpawnParameters = asPiToolParameters(
  Type.Object({
    role: Type.Optional(
      Type.Union([Type.Literal("scout"), Type.Literal("reviewer")], {
        description: "Visible sidequest role. Defaults to scout.",
      }),
    ),
    objective: Type.String({ description: "Required non-empty scouting/review objective." }),
    cwd: Type.Optional(
      Type.String({ description: "Workspace cwd for the visible sidequest. Defaults to ctx.cwd." }),
    ),
    reportBack: reportBackParameter,
    parentPeerTarget: Type.Optional(
      Type.String({ description: "Exact parent peer target/session id for intercom report-back." }),
    ),
    context: Type.Optional(
      Type.Object({
        campaignGoal: Type.Optional(Type.String()),
        primaryMetric: Type.Optional(Type.String()),
        currentBest: Type.Optional(Type.String()),
        blocker: Type.Optional(Type.String()),
        filesInScope: Type.Optional(Type.Array(Type.String())),
        offLimits: Type.Optional(Type.Array(Type.String())),
        constraints: Type.Optional(Type.Array(Type.String())),
        artifactsToRead: Type.Optional(Type.Array(Type.String())),
        currentFindings: Type.Optional(Type.Array(Type.String())),
      }),
    ),
    dod: Type.Optional(
      Type.Array(Type.String({ description: "Additional request-specific DoD items." })),
    ),
  }),
);

const parallelquestSpawnParameters = asPiToolParameters(
  Type.Object({
    objective: Type.String({ description: "Required non-empty candidate mutation objective." }),
    cwd: Type.Optional(Type.String({ description: "Parent/controller cwd. Defaults to ctx.cwd." })),
    baseRef: Type.Optional(Type.String({ description: "Git base ref. Defaults to HEAD." })),
    branchName: Type.Optional(
      Type.String({ description: "Candidate branch name. Defaults to parallelquest/<slug>." }),
    ),
    workspaceRoot: Type.Optional(
      Type.String({ description: "Root directory for generated parallelquest worktrees." }),
    ),
    workspaceName: Type.Optional(Type.String({ description: "Worktree directory name." })),
    filesInScope: Type.Optional(Type.Array(Type.String())),
    offLimits: Type.Optional(Type.Array(Type.String())),
    constraints: Type.Optional(Type.Array(Type.String())),
    dod: Type.Optional(Type.Array(Type.String())),
    reportBack: reportBackParameter,
    parentPeerTarget: Type.Optional(
      Type.String({ description: "Exact parent peer target/session id for intercom report-back." }),
    ),
    requireCleanParent: Type.Optional(
      Type.Boolean({ description: "Fail closed if the parent checkout has uncommitted changes." }),
    ),
    reuseExisting: Type.Optional(
      Type.Boolean({ description: "Reuse an existing verified worktree at the requested path." }),
    ),
  }),
);

function getPrompt(args?: string): string | undefined {
  const prompt = args?.trim();
  return prompt ? prompt : undefined;
}

function summarizePrompt(prompt: string): string {
  const singleLine = prompt.replace(/\s+/g, " ").trim();
  if (singleLine.length <= TITLE_MAX_LEN) return singleLine;
  return `${singleLine.slice(0, TITLE_MAX_LEN - 1)}…`;
}

function buildTitle(prompt: string, prefix = "Sidequest"): string {
  return `${prefix}: ${summarizePrompt(prompt)}`;
}

function buildModelArgs(model: ModelLike | undefined, thinkingLevel: string): string[] {
  if (!model?.provider || !model.id) return [];

  const args = ["--model", `${model.provider}/${model.id}`];
  if (thinkingLevel) {
    args.push("--thinking", thinkingLevel);
  }
  return args;
}

function shellSingleQuote(value: string): string {
  return `'${value.replace(/'/g, `'"'"'`)}'`;
}

function buildPiShellCommand(titleBase?: string): string {
  const titleSetup = titleBase
    ? [
        `export PI_SESSION_PRESENCE_TITLE_BASE=${shellSingleQuote(titleBase)}`,
        'printf "\\033]0;%s\\007" "$PI_SESSION_PRESENCE_TITLE_BASE"',
      ]
    : [];

  return [
    ...titleSetup,
    'cmd="$1"',
    "shift",
    '"$cmd" "$@"',
    "status=$?",
    'if [ "$status" -ne 0 ]; then echo; echo "[sidequest] pi exited with status $status"; echo "[sidequest] leaving an interactive shell open for debugging"; exec "$' +
      '{SHELL:-/bin/bash}" -i; fi',
  ].join("; ");
}

function isGhosttySession(env: NodeJS.ProcessEnv = process.env): boolean {
  return env.TERM_PROGRAM?.trim().toLowerCase() === "ghostty";
}

function getCurrentGhosttyBin(
  env: NodeJS.ProcessEnv = process.env,
  pathExists: (path: string) => boolean = existsSync,
): string | undefined {
  if (!isGhosttySession(env)) return undefined;
  const binDir = env.GHOSTTY_BIN_DIR?.trim();
  if (!binDir) return undefined;
  const candidate = join(binDir, GHOSTTY_BIN_NAME);
  return pathExists(candidate) ? candidate : undefined;
}

export function getGhosttySurfaceId(env: NodeJS.ProcessEnv = process.env): string | undefined {
  const value = env.GHOSTTY_SURFACE_ID?.trim();
  if (!value) return undefined;
  return /^\d+$/.test(value) || /^0x[0-9a-f]+$/i.test(value) ? value : undefined;
}

function readProcParentPid(pid: number): number | undefined {
  try {
    const value = readFileSync(join("/proc", String(pid), "stat"), "utf8");
    const lastParenIndex = value.lastIndexOf(")");
    if (lastParenIndex === -1) return undefined;
    const tail = value
      .slice(lastParenIndex + 2)
      .trim()
      .split(/\s+/);
    const ppid = Number.parseInt(tail[1] || "", 10);
    return Number.isInteger(ppid) && ppid > 0 ? ppid : undefined;
  } catch {
    return undefined;
  }
}

function readProcCommand(pid: number): string | undefined {
  try {
    return readFileSync(join("/proc", String(pid), "comm"), "utf8").trim();
  } catch {
    return undefined;
  }
}

export function findGhosttyAncestorBin(processId = process.pid): string | undefined {
  let pid = processId;
  for (let depth = 0; depth < 6; depth += 1) {
    pid = readProcParentPid(pid) ?? 0;
    if (pid <= 0) return undefined;
    const command = readProcCommand(pid)?.toLowerCase();
    if (command === "ghostty") {
      try {
        return readlinkSync(join("/proc", String(pid), "exe"));
      } catch {
        return undefined;
      }
    }
  }
  return undefined;
}

export function resolveGhosttyBin({
  env = process.env,
  pathExists = existsSync,
  currentSessionGhosttyBin,
}: Pick<SidequestOptions, "env" | "pathExists" | "currentSessionGhosttyBin"> = {}): string {
  const override = env.PI_SIDEQUEST_GHOSTTY_BIN?.trim();
  if (override) {
    return override;
  }

  const wrapperExists = pathExists(LOCAL_GHOSTTY_WRAPPER);
  const normalizedCurrentSessionGhosttyBin = currentSessionGhosttyBin?.trim();
  if (normalizedCurrentSessionGhosttyBin && pathExists(normalizedCurrentSessionGhosttyBin)) {
    if (normalizedCurrentSessionGhosttyBin === LOCAL_GHOSTTY_BIN && wrapperExists) {
      return LOCAL_GHOSTTY_WRAPPER;
    }
    return normalizedCurrentSessionGhosttyBin;
  }

  if (wrapperExists) {
    return LOCAL_GHOSTTY_WRAPPER;
  }

  const currentGhosttyBin = getCurrentGhosttyBin(env, pathExists);
  if (currentGhosttyBin) {
    return currentGhosttyBin;
  }

  if (pathExists(LOCAL_GHOSTTY_BIN)) {
    return LOCAL_GHOSTTY_BIN;
  }
  return GHOSTTY_BIN_NAME;
}

async function supportsGhosttyNewTab(execRunner: ExecRunner, ghosttyBin: string): Promise<boolean> {
  try {
    const result = await execRunner(ghosttyBin, ["+help"], {
      timeout: GHOSTTY_PROBE_TIMEOUT_MS,
    });
    return result.code === 0 && String(result.stdout || "").includes("+new-tab");
  } catch {
    return false;
  }
}

function buildGhosttyArgs({
  cwd,
  title,
  launchMode,
  surfaceId,
  piArgs,
}: {
  cwd: string;
  title: string;
  launchMode: LaunchMode;
  surfaceId?: string;
  piArgs: string[];
}): string[] {
  const args = launchMode === "tab" ? ["+new-tab"] : [];
  if (launchMode === "tab" && surfaceId) {
    args.push(`--surface-id=${surfaceId}`);
  }
  args.push(
    `--working-directory=${cwd}`,
    "-e",
    "/bin/sh",
    "-lc",
    buildPiShellCommand(title),
    "sidequest-pi",
    ...piArgs,
  );
  return args;
}

function normalizeExecResult(result: ExecResult): LaunchResult {
  return {
    ok: result.code === 0,
    code: result.code,
    stdout: String(result.stdout || "").trim(),
    stderr: String(result.stderr || "").trim(),
    killed: Boolean(result.killed),
  };
}

async function runGhosttyLaunch(
  execRunner: ExecRunner,
  ghosttyBin: string,
  ghosttyArgs: string[],
  cwd: string,
): Promise<LaunchResult> {
  try {
    const result = await execRunner(ghosttyBin, ghosttyArgs, {
      cwd,
      timeout: GHOSTTY_LAUNCH_TIMEOUT_MS,
    });
    return normalizeExecResult(result);
  } catch (error) {
    return {
      ok: false,
      code: -1,
      stdout: "",
      stderr: error instanceof Error ? error.message : String(error),
      killed: false,
    };
  }
}

function describeWindowFallback({
  supportsNewTab,
  env,
}: {
  supportsNewTab: boolean;
  env: NodeJS.ProcessEnv;
}): string | undefined {
  if (process.platform !== "linux") {
    return "same-window tab launch requires Linux Ghostty support";
  }
  if (!isGhosttySession(env)) {
    return "same-window tab launch only works from an active Ghostty session";
  }
  if (!supportsNewTab) {
    return "current Ghostty binary does not support +new-tab";
  }
  return undefined;
}

function summarizeLaunchFailure(result: LaunchResult): string {
  const detail = result.stderr || result.stdout;
  if (!detail) {
    if (result.killed) return "Ghostty launch timed out";
    if (result.code >= 0) return `exit ${result.code}`;
    return "unknown launch failure";
  }

  const singleLine = detail.replace(/\s+/g, " ").trim();
  if (singleLine.length <= 180) return singleLine;
  return `${singleLine.slice(0, 179)}…`;
}

async function launchSidequestFork({
  pi,
  ctx,
  options,
  prompt,
  titlePrompt,
  cwd,
  sessionFile,
  titlePrefix = "Sidequest",
}: {
  pi: ExtensionAPI;
  ctx: { model?: unknown };
  options: SidequestOptions;
  prompt: string;
  titlePrompt: string;
  cwd: string;
  sessionFile: string;
  titlePrefix?: string;
}): Promise<SidequestLaunchOutcome> {
  const env = options.env ?? process.env;
  const pathExists = options.pathExists ?? existsSync;
  const execRunner: ExecRunner =
    options.exec ?? ((command, execArgs, execOptions) => pi.exec(command, execArgs, execOptions));
  const currentSessionGhosttyBin =
    options.currentSessionGhosttyBin ?? findGhosttyAncestorBin(options.processId ?? process.pid);
  const ghosttyBin = resolveGhosttyBin({ env, pathExists, currentSessionGhosttyBin });
  const piBin = env.PI_SIDEQUEST_PI_BIN?.trim() || DEFAULT_PI_BIN;
  const thinkingLevel = pi.getThinkingLevel();
  const modelArgs = buildModelArgs(ctx.model as ModelLike | undefined, thinkingLevel);
  const title = buildTitle(titlePrompt, titlePrefix);
  const supportsNewTab =
    process.platform === "linux" ? await supportsGhosttyNewTab(execRunner, ghosttyBin) : false;
  const surfaceId = getGhosttySurfaceId(env);
  const windowFallbackReason = describeWindowFallback({
    supportsNewTab,
    env,
  });

  const piArgs = [piBin, "--fork", sessionFile, ...modelArgs, prompt];
  let launchMode: LaunchMode = windowFallbackReason ? "window" : "tab";
  let launchResult = await runGhosttyLaunch(
    execRunner,
    ghosttyBin,
    buildGhosttyArgs({
      cwd,
      title,
      launchMode,
      surfaceId,
      piArgs,
    }),
    cwd,
  );
  let launchNote = windowFallbackReason;

  if (!launchResult.ok && launchMode === "tab") {
    const tabFailure = summarizeLaunchFailure(launchResult);
    const fallbackResult = await runGhosttyLaunch(
      execRunner,
      ghosttyBin,
      buildGhosttyArgs({
        cwd,
        title,
        launchMode: "window",
        piArgs,
      }),
      cwd,
    );
    if (fallbackResult.ok) {
      launchMode = "window";
      launchResult = fallbackResult;
      launchNote = `same-window tab launch failed (${tabFailure}); opened a new window instead`;
    }
  }

  const promptSummary = summarizePrompt(titlePrompt);
  if (!launchResult.ok) {
    return {
      ok: false,
      failure: summarizeLaunchFailure(launchResult),
      cwd,
      sessionFile,
      titleBase: title,
      promptSummary,
      launchMode,
      launchNote,
    };
  }

  return {
    ok: true,
    launchMode,
    cwd,
    sessionFile,
    titleBase: title,
    promptSummary,
    launchNote,
  };
}

function normalizeStringArray(value: string[] | undefined): string[] {
  if (!Array.isArray(value)) return [];
  return value.map((item) => String(item).trim()).filter(Boolean);
}

function markdownList(items: string[] | undefined, emptyText = "None provided."): string {
  const normalized = normalizeStringArray(items);
  if (normalized.length === 0) return emptyText;
  return normalized.map((item) => `- ${item}`).join("\n");
}

function contextLine(label: string, value: string | undefined): string | undefined {
  const normalized = value?.trim();
  return normalized ? `- ${label}: ${normalized}` : undefined;
}

function normalizeSidequestRole(value: unknown): SidequestRole {
  return value === "reviewer" ? "reviewer" : "scout";
}

function normalizeReportBack(request: SidequestSpawnRequest): SidequestReportBack {
  if (
    request.reportBack === "intercom" ||
    request.reportBack === "manual" ||
    request.reportBack === "none"
  ) {
    return request.reportBack;
  }
  return "intercom";
}

function buildReportBackInstructions({
  reportBack,
  parentPeerTarget,
  peerLabel = "sidequest",
}: {
  reportBack: SidequestReportBack;
  parentPeerTarget?: string;
  peerLabel?: string;
}): string {
  const target = parentPeerTarget?.trim();
  if (reportBack === "intercom" && target) {
    return [
      "Use intercom for report-back if the tool is available.",
      `Report to the exact parent target: ${target}`,
      'Use a concise message with `intercom({ action: "send", to: "<target>", message: "..." })`.',
      "Intercom is communication only; it is not durable evidence or completion authority.",
    ].join("\n");
  }

  if (reportBack === "intercom") {
    return [
      "Use intercom for report-back if the tool is available.",
      'No exact parent target was supplied. First run `intercom({ action: "list" })` and choose the exact controller session id before reporting.',
      "Intercom is communication only; it is not durable evidence or completion authority.",
    ].join("\n");
  }

  if (reportBack === "none") {
    return `No automatic report-back is requested. Do not claim that a report was delivered; leave findings visible in this ${peerLabel} session unless the controller gives further instructions.`;
  }

  return `Manual report-back is requested. Do not over-promise delivery; leave a concise visible report in this ${peerLabel} session for the controller/operator to inspect.`;
}

function buildSidequestSpawnPrompt({
  role,
  objective,
  cwd,
  request,
  reportBack,
}: {
  role: SidequestRole;
  objective: string;
  cwd: string;
  request: SidequestSpawnRequest;
  reportBack: SidequestReportBack;
}): string {
  const context = request.context ?? {};
  const contextLines = [
    contextLine("Campaign goal", context.campaignGoal),
    contextLine("Primary metric", context.primaryMetric),
    contextLine("Current best", context.currentBest),
    contextLine("Blocker", context.blocker),
  ].filter((line): line is string => Boolean(line));
  const customDod = normalizeStringArray(request.dod);

  return [
    "# Visible Sidequest Agent Prompt",
    "",
    "You are a visible sidequest agent launched in a forked Pi session. You are not the controller session. You are parallel cognition, not parallel authority.",
    "",
    "## Role",
    role,
    "",
    "## Objective",
    objective,
    "",
    "## Workspace",
    `Controller/shared cwd: ${cwd}`,
    "",
    "## Campaign / Task Context",
    contextLines.length ? contextLines.join("\n") : "None provided.",
    "",
    "## Artifacts to Inspect",
    markdownList(context.artifactsToRead),
    "",
    "## Files in Scope",
    markdownList(context.filesInScope),
    "",
    "## Off-Limits",
    markdownList(context.offLimits),
    "",
    "## Constraints",
    markdownList(context.constraints),
    "",
    "## Current Findings",
    markdownList(context.currentFindings),
    "",
    "## Mutation Policy",
    "You are in the controller’s working tree. This sidequest is read-only for controller-spawned use. Do not edit files, run destructive commands, commit, revert, install dependencies, restart services, or change running model services. If a mutation seems necessary, report the exact proposed mutation back to the controller instead of applying it.",
    "",
    "Enforcement level: prompt_contract. This is not a hard sandbox yet.",
    "",
    "## Allowed Tools",
    "- `read` and bounded `bash` for inspection and non-destructive validation.",
    "- `dispatch_subagent` for one focused helper if it reduces risk.",
    "- `workflow_execute` for a small explicit plan if useful.",
    "- `intercom` for reporting back if available and requested below.",
    "",
    "Do not spawn more quest agents unless explicitly instructed.",
    "",
    "## Report-Back Instructions",
    buildReportBackInstructions({ reportBack, parentPeerTarget: request.parentPeerTarget }),
    "",
    "## Definition of Done",
    "Return a concise report with:",
    "",
    "1. Answer or recommendation",
    "2. Evidence inspected — exact files, artifacts, commands",
    "3. Most likely root cause or key finding",
    "4. One concrete next experiment or controller action",
    "5. Expected impact",
    "6. Risks and rollback notes",
    "7. What not to try again",
    ...(customDod.length
      ? ["", "## Additional Request-Specific DoD", markdownList(customDod)]
      : []),
    "",
    "## Anti-Goals",
    "- Do not claim completion for the controller.",
    "- Do not mutate shared-cwd files; editable shared-cwd work belongs to manual `/sidequest`, not `sidequest_spawn`.",
    "- Do not implement candidate changes here; isolated mutation belongs later in `parallelquest_spawn`.",
    "- Do not mutate AK, orchestration state, intercom state, or autoresearch runtime authority.",
  ].join("\n");
}

function slugify(value: string, fallback: string): string {
  const slug = value
    .toLowerCase()
    .replace(/[^a-z0-9._-]+/g, "-")
    .replace(/^[._-]+|[._-]+$/g, "")
    .replace(/-{2,}/g, "-");
  return slug || fallback;
}

function sanitizeBranchName(value: string | undefined, objective: string): string {
  const raw = value?.trim() || `parallelquest/${slugify(objective, "candidate")}`;
  const segments = raw
    .split(/[\\/]+/)
    .map((segment) => slugify(segment, ""))
    .filter((segment) => segment && segment !== "." && segment !== "..");
  const candidate = segments.join("/");
  return candidate || `parallelquest/${slugify(objective, "candidate")}`;
}

function sanitizeWorkspaceName(value: string | undefined, branchName: string): string {
  return slugify(value?.trim() || branchName.replace(/[\\/]+/g, "-"), "candidate");
}

function isPathInside(parent: string, child: string): boolean {
  const normalizedParent = resolve(parent);
  const normalizedChild = resolve(child);
  const rel = relative(normalizedParent, normalizedChild);
  return Boolean(rel) && !rel.startsWith("..") && !rel.includes(`..${sep}`) && !isAbsolute(rel);
}

function defaultWorkspaceRoot(repoRoot: string, env: NodeJS.ProcessEnv): string {
  const stateHome = env.XDG_STATE_HOME?.trim() || join(homedir(), ".local", "state");
  const repoSlug = slugify(basename(repoRoot), "repo");
  const repoHash = createHash("sha1").update(resolve(repoRoot)).digest("hex").slice(0, 8);
  return join(stateHome, "pi-quests", "worktrees", `${repoSlug}-${repoHash}`);
}

async function runGit(execRunner: ExecRunner, cwd: string, args: string[]): Promise<LaunchResult> {
  return runGhosttyLaunch(execRunner, "git", ["-C", cwd, ...args], cwd);
}

async function prepareParallelquestWorktree({
  execRunner,
  pathExists,
  env,
  request,
  parentCwd,
  objective,
}: {
  execRunner: ExecRunner;
  pathExists: (path: string) => boolean;
  env: NodeJS.ProcessEnv;
  request: ParallelquestSpawnRequest;
  parentCwd: string;
  objective: string;
}): Promise<WorktreePrepareResult> {
  const baseRef = request.baseRef?.trim() || "HEAD";
  const repoResult = await runGit(execRunner, parentCwd, ["rev-parse", "--show-toplevel"]);
  if (!repoResult.ok) {
    return {
      ok: false,
      error: `failed to locate git repo: ${summarizeLaunchFailure(repoResult)}`,
      parentCwd,
      baseRef,
    };
  }

  const repoRoot = resolve(repoResult.stdout.split(/\r?\n/)[0]?.trim() || parentCwd);
  const branchName = sanitizeBranchName(request.branchName, objective);
  const workspaceName = sanitizeWorkspaceName(request.workspaceName, branchName);
  const workspaceRoot = resolve(
    request.workspaceRoot?.trim()
      ? isAbsolute(request.workspaceRoot.trim())
        ? request.workspaceRoot.trim()
        : resolve(parentCwd, request.workspaceRoot.trim())
      : defaultWorkspaceRoot(repoRoot, env),
  );
  const worktreePath = resolve(workspaceRoot, workspaceName);

  if (isPathInside(repoRoot, worktreePath) || worktreePath === repoRoot) {
    return {
      ok: false,
      error: "parallelquest worktree path must not be inside the parent checkout",
      parentCwd,
      repoRoot,
      worktreePath,
      branchName,
      baseRef,
    };
  }

  const gitDir = join(repoRoot, ".git");
  if (isPathInside(gitDir, worktreePath) || worktreePath === gitDir) {
    return {
      ok: false,
      error: "parallelquest worktree path must not be inside .git",
      parentCwd,
      repoRoot,
      worktreePath,
      branchName,
      baseRef,
    };
  }

  if (!isPathInside(workspaceRoot, worktreePath) && worktreePath !== workspaceRoot) {
    return {
      ok: false,
      error: "parallelquest worktree path escaped workspaceRoot",
      parentCwd,
      repoRoot,
      worktreePath,
      branchName,
      baseRef,
    };
  }

  const dirtyResult = await runGit(execRunner, repoRoot, ["status", "--porcelain"]);
  if (!dirtyResult.ok) {
    return {
      ok: false,
      error: `failed to inspect parent dirty state: ${summarizeLaunchFailure(dirtyResult)}`,
      parentCwd,
      repoRoot,
      worktreePath,
      branchName,
      baseRef,
    };
  }

  const parentDirty = Boolean(dirtyResult.stdout.trim());
  const parentDirtyWarning = parentDirty
    ? "Parent checkout has uncommitted changes; this worktree is based on the selected base ref and does not include them."
    : undefined;
  if (parentDirty && request.requireCleanParent) {
    return {
      ok: false,
      error: "parent checkout has uncommitted changes and requireCleanParent is true",
      parentCwd,
      repoRoot,
      worktreePath,
      branchName,
      baseRef,
      parentDirty,
      parentDirtyWarning,
    };
  }

  if (pathExists(worktreePath)) {
    if (!request.reuseExisting) {
      return {
        ok: false,
        error:
          "parallelquest worktree path already exists; pass reuseExisting only for a verified intended worktree",
        parentCwd,
        repoRoot,
        worktreePath,
        branchName,
        baseRef,
        parentDirty,
        parentDirtyWarning,
      };
    }

    const insideResult = await runGit(execRunner, worktreePath, [
      "rev-parse",
      "--is-inside-work-tree",
    ]);
    const topResult = await runGit(execRunner, worktreePath, ["rev-parse", "--show-toplevel"]);
    const branchResult = await runGit(execRunner, worktreePath, [
      "rev-parse",
      "--abbrev-ref",
      "HEAD",
    ]);
    if (
      !insideResult.ok ||
      insideResult.stdout.trim() !== "true" ||
      !topResult.ok ||
      resolve(topResult.stdout.trim()) !== worktreePath ||
      !branchResult.ok ||
      branchResult.stdout.trim() !== branchName
    ) {
      return {
        ok: false,
        error: "existing parallelquest path is not the requested verified git worktree",
        parentCwd,
        repoRoot,
        worktreePath,
        branchName,
        baseRef,
        parentDirty,
        parentDirtyWarning,
      };
    }

    return {
      ok: true,
      parentCwd,
      repoRoot,
      worktreePath,
      branchName,
      baseRef,
      parentDirty,
      parentDirtyWarning,
      reusedExisting: true,
    };
  }

  try {
    mkdirSync(workspaceRoot, { recursive: true });
  } catch (error) {
    return {
      ok: false,
      error: `failed to create workspaceRoot: ${error instanceof Error ? error.message : String(error)}`,
      parentCwd,
      repoRoot,
      worktreePath,
      branchName,
      baseRef,
      parentDirty,
      parentDirtyWarning,
    };
  }

  const addResult = await runGit(execRunner, repoRoot, [
    "worktree",
    "add",
    worktreePath,
    "-b",
    branchName,
    baseRef,
  ]);
  if (!addResult.ok) {
    return {
      ok: false,
      error: `failed to create git worktree: ${summarizeLaunchFailure(addResult)}`,
      parentCwd,
      repoRoot,
      worktreePath,
      branchName,
      baseRef,
      parentDirty,
      parentDirtyWarning,
    };
  }

  return {
    ok: true,
    parentCwd,
    repoRoot,
    worktreePath,
    branchName,
    baseRef,
    parentDirty,
    parentDirtyWarning,
    reusedExisting: false,
  };
}

function normalizeParallelquestReportBack(
  request: ParallelquestSpawnRequest,
): ParallelquestReportBack {
  if (
    request.reportBack === "intercom" ||
    request.reportBack === "manual" ||
    request.reportBack === "none"
  ) {
    return request.reportBack;
  }
  return "intercom";
}

function buildParallelquestSpawnPrompt({
  objective,
  request,
  worktree,
  reportBack,
}: {
  objective: string;
  request: ParallelquestSpawnRequest;
  worktree: WorktreePrepareSuccess;
  reportBack: ParallelquestReportBack;
}): string {
  return [
    "# Visible Parallelquest Agent Prompt",
    "",
    "You are a visible parallelquest agent launched in a forked Pi session. You are not the controller session. You are parallel cognition, not parallel authority.",
    "",
    "## Objective",
    objective,
    "",
    "## Workspace Boundary",
    "You are working in an isolated git worktree.",
    "",
    `- Parent/controller cwd: ${worktree.parentCwd}`,
    `- Your worktree cwd: ${worktree.worktreePath}`,
    `- Branch: ${worktree.branchName}`,
    `- Base: ${worktree.baseRef}`,
    worktree.parentDirtyWarning ? `- Dirty-parent warning: ${worktree.parentDirtyWarning}` : "",
    "",
    "All mutations must stay inside your worktree. Do not modify the parent checkout.",
    "",
    "## Mutation Policy",
    "You may inspect, edit, and validate only inside your isolated worktree. Do not merge, push, open PRs, mutate AK, mutate controller runtime state, or claim promotion. If a required action is outside the worktree boundary, report the exact proposed controller action instead of applying it.",
    "",
    "## Files in Scope",
    markdownList(request.filesInScope),
    "",
    "## Off-Limits",
    markdownList(request.offLimits),
    "",
    "## Constraints",
    markdownList(request.constraints),
    "",
    "## Allowed Tools",
    "- `read`, `edit`, `write`, and bounded `bash` only within the worktree boundary and stated scope.",
    "- `dispatch_subagent` for one focused helper if it reduces risk.",
    "- `workflow_execute` for a small explicit plan if useful.",
    "- `intercom` for reporting back if available and requested below.",
    "",
    "Do not spawn more quest agents unless explicitly instructed.",
    "",
    "## Report-Back Instructions",
    buildReportBackInstructions({
      reportBack,
      parentPeerTarget: request.parentPeerTarget,
      peerLabel: "parallelquest",
    }),
    "",
    "## Definition of Done",
    "Return a concise report with:",
    "",
    "1. Branch name",
    "2. Worktree path",
    "3. Files changed",
    "4. Commands run and results",
    "5. Metric/check result if applicable",
    "6. Patch summary",
    "7. Risks and rollback notes",
    "8. Recommended controller action: ignore, inspect, cherry-pick, or merge after review",
    ...(normalizeStringArray(request.dod).length
      ? ["", "## Additional Request-Specific DoD", markdownList(request.dod)]
      : []),
    "",
    "## Anti-Goals",
    "- Do not mutate the parent checkout.",
    "- Do not merge, push, open PRs, mutate AK, or claim completion/promotion authority.",
    "- Do not treat intercom or visible launch as durable evidence.",
  ].join("\n");
}

function errorToolResult(message: string, details: Record<string, unknown>) {
  return {
    content: [{ type: "text" as const, text: message }],
    details,
    isError: true,
  };
}

function successToolResult(message: string, details: Record<string, unknown>) {
  return {
    content: [{ type: "text" as const, text: message }],
    details,
  };
}

export function createSidequestExtension(options: SidequestOptions = {}) {
  return function sidequestExtension(pi: ExtensionAPI) {
    pi.registerCommand("sidequest", {
      description:
        "Fork the current Pi session into the current Ghostty window when tab attach is available, otherwise open a new Ghostty window",
      handler: async (args, ctx) => {
        const prompt = getPrompt(args);
        if (!prompt) {
          if (ctx.hasUI) {
            ctx.ui.notify('Usage: /sidequest "what you want to explore"', "warning");
          }
          return;
        }

        const sessionFile = ctx.sessionManager.getSessionFile();
        if (!sessionFile) {
          if (ctx.hasUI) {
            ctx.ui.notify(
              "sidequest needs a saved Pi session. Current session looks ephemeral/no-session.",
              "error",
            );
          }
          return;
        }

        const launch = await launchSidequestFork({
          pi,
          ctx,
          options,
          prompt,
          titlePrompt: prompt,
          cwd: ctx.cwd,
          sessionFile,
        });

        if (!launch.ok) {
          if (ctx.hasUI) {
            ctx.ui.notify(`sidequest failed to launch Ghostty: ${launch.failure}`, "error");
          }
          return;
        }

        if (ctx.hasUI) {
          const modeLabel =
            launch.launchMode === "tab" ? "current Ghostty tab" : "new Ghostty window";
          const suffix = launch.launchNote ? ` (${launch.launchNote})` : "";
          ctx.ui.notify(
            `Opened sidequest in ${modeLabel}: ${summarizePrompt(prompt)}${suffix}`,
            "info",
          );
        }
      },
    });

    pi.registerTool({
      name: "sidequest_spawn",
      label: "Sidequest Spawn",
      description:
        "Launch a visible read-only sidequest Pi session for same-workspace scouting or review.",
      promptSnippet:
        "Use to launch a visible sidequest peer for read-only scouting/review in the same workspace. It returns launch facts only; editable shared-cwd work remains manual /sidequest.",
      parameters: sidequestSpawnParameters,
      async execute(_toolCallId, params, _signal, _onUpdate, ctx) {
        const request = params as SidequestSpawnRequest;
        const objective = request.objective?.trim() ?? "";
        const role = normalizeSidequestRole(request.role);
        const reportBack = normalizeReportBack(request);
        const cwd = request.cwd?.trim() || ctx.cwd || process.cwd();

        if (!objective) {
          return errorToolResult("sidequest_spawn requires a non-empty objective.", {
            ok: false,
            tool: "sidequest_spawn",
            role,
            reportBack,
            enforcement: "prompt_contract",
            error: "blank_objective",
          });
        }

        const sessionFile = ctx.sessionManager.getSessionFile();
        if (!sessionFile) {
          return errorToolResult(
            "sidequest_spawn needs a saved Pi session. Current session looks ephemeral/no-session.",
            {
              ok: false,
              tool: "sidequest_spawn",
              role,
              reportBack,
              cwd,
              enforcement: "prompt_contract",
              error: "missing_session_file",
            },
          );
        }

        const prompt = buildSidequestSpawnPrompt({ role, objective, cwd, request, reportBack });
        const launch = await launchSidequestFork({
          pi,
          ctx,
          options,
          prompt,
          titlePrompt: objective,
          cwd,
          sessionFile,
        });

        if (!launch.ok) {
          return errorToolResult(`sidequest_spawn failed to launch Ghostty: ${launch.failure}`, {
            ok: false,
            tool: "sidequest_spawn",
            launchMode: launch.launchMode,
            cwd: launch.cwd,
            sessionFile: launch.sessionFile,
            titleBase: launch.titleBase,
            role,
            enforcement: "prompt_contract",
            promptSummary: launch.promptSummary,
            reportBack,
            launchNote: launch.launchNote,
            error: "launch_failed",
          });
        }

        const details = {
          ok: true,
          tool: "sidequest_spawn",
          launchMode: launch.launchMode,
          cwd: launch.cwd,
          sessionFile: launch.sessionFile,
          titleBase: launch.titleBase,
          role,
          enforcement: "prompt_contract",
          promptSummary: launch.promptSummary,
          reportBack,
          nextStep:
            "Watch the visible sidequest tab/window; if intercom was requested, wait for or inspect the peer report.",
          ...(launch.launchNote ? { launchNote: launch.launchNote } : {}),
        };

        return successToolResult(
          `Launched sidequest_spawn in ${launch.launchMode}: ${launch.promptSummary}`,
          details,
        );
      },
    });

    pi.registerTool({
      name: "parallelquest_spawn",
      label: "Parallelquest Spawn",
      description:
        "Launch a visible parallelquest Pi session in an isolated git worktree for bounded candidate mutation.",
      promptSnippet:
        "Use to create an isolated git worktree and launch a visible parallelquest peer for bounded candidate mutation. It does not merge, push, open PRs, mutate AK, or claim promotion.",
      parameters: parallelquestSpawnParameters,
      async execute(_toolCallId, params, _signal, _onUpdate, ctx) {
        const request = params as ParallelquestSpawnRequest;
        const objective = request.objective?.trim() ?? "";
        const reportBack = normalizeParallelquestReportBack(request);
        const parentCwd = request.cwd?.trim() || ctx.cwd || process.cwd();
        const env = options.env ?? process.env;
        const pathExists = options.pathExists ?? existsSync;
        const execRunner: ExecRunner =
          options.exec ??
          ((command, execArgs, execOptions) => pi.exec(command, execArgs, execOptions));

        if (!objective) {
          return errorToolResult("parallelquest_spawn requires a non-empty objective.", {
            ok: false,
            tool: "parallelquest_spawn",
            reportBack,
            error: "blank_objective",
          });
        }

        const sessionFile = ctx.sessionManager.getSessionFile();
        if (!sessionFile) {
          return errorToolResult(
            "parallelquest_spawn needs a saved Pi session. Current session looks ephemeral/no-session.",
            {
              ok: false,
              tool: "parallelquest_spawn",
              reportBack,
              parentCwd,
              error: "missing_session_file",
            },
          );
        }

        const worktree = await prepareParallelquestWorktree({
          execRunner,
          pathExists,
          env,
          request,
          parentCwd,
          objective,
        });

        if (!worktree.ok) {
          return errorToolResult(`parallelquest_spawn failed: ${worktree.error}`, {
            ok: false,
            tool: "parallelquest_spawn",
            reportBack,
            parentCwd: worktree.parentCwd,
            repoRoot: worktree.repoRoot,
            worktreePath: worktree.worktreePath,
            branchName: worktree.branchName,
            baseRef: worktree.baseRef,
            parentDirty: worktree.parentDirty,
            parentDirtyWarning: worktree.parentDirtyWarning,
            error: "worktree_prepare_failed",
            reason: worktree.error,
          });
        }

        const prompt = buildParallelquestSpawnPrompt({
          objective,
          request,
          worktree,
          reportBack,
        });
        const launch = await launchSidequestFork({
          pi,
          ctx,
          options,
          prompt,
          titlePrompt: objective,
          titlePrefix: "Parallelquest",
          cwd: worktree.worktreePath,
          sessionFile,
        });

        if (!launch.ok) {
          return errorToolResult(
            `parallelquest_spawn failed to launch Ghostty: ${launch.failure}`,
            {
              ok: false,
              tool: "parallelquest_spawn",
              launchMode: launch.launchMode,
              parentCwd: worktree.parentCwd,
              worktreePath: worktree.worktreePath,
              branchName: worktree.branchName,
              baseRef: worktree.baseRef,
              parentDirty: worktree.parentDirty,
              parentDirtyWarning: worktree.parentDirtyWarning,
              sessionFile: launch.sessionFile,
              titleBase: launch.titleBase,
              promptSummary: launch.promptSummary,
              reportBack,
              launchNote: launch.launchNote,
              error: "launch_failed",
            },
          );
        }

        const details = {
          ok: true,
          tool: "parallelquest_spawn",
          launchMode: launch.launchMode,
          parentCwd: worktree.parentCwd,
          worktreePath: worktree.worktreePath,
          branchName: worktree.branchName,
          baseRef: worktree.baseRef,
          parentDirty: worktree.parentDirty,
          ...(worktree.parentDirtyWarning
            ? { parentDirtyWarning: worktree.parentDirtyWarning }
            : {}),
          reusedExisting: worktree.reusedExisting,
          sessionFile: launch.sessionFile,
          titleBase: launch.titleBase,
          promptSummary: launch.promptSummary,
          reportBack,
          nextStep: "Inspect the reported branch/worktree before cherry-pick or merge.",
          ...(launch.launchNote ? { launchNote: launch.launchNote } : {}),
        };

        return successToolResult(
          `Launched parallelquest_spawn in ${launch.launchMode}: ${launch.promptSummary}`,
          details,
        );
      },
    });
  };
}

export default createSidequestExtension();

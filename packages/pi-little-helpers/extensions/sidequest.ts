import { existsSync, readFileSync, readlinkSync } from "node:fs";
import { homedir } from "node:os";
import { join } from "node:path";
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
    reportBack: Type.Optional(
      Type.Union([Type.Literal("intercom"), Type.Literal("manual"), Type.Literal("none")], {
        description:
          "Report-back mode. Defaults to intercom when parentPeerTarget is supplied, otherwise manual.",
      }),
    ),
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

function getPrompt(args?: string): string | undefined {
  const prompt = args?.trim();
  return prompt ? prompt : undefined;
}

function summarizePrompt(prompt: string): string {
  const singleLine = prompt.replace(/\s+/g, " ").trim();
  if (singleLine.length <= TITLE_MAX_LEN) return singleLine;
  return `${singleLine.slice(0, TITLE_MAX_LEN - 1)}…`;
}

function buildTitle(prompt: string): string {
  return `Sidequest: ${summarizePrompt(prompt)}`;
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
}: {
  pi: ExtensionAPI;
  ctx: { model?: unknown };
  options: SidequestOptions;
  prompt: string;
  titlePrompt: string;
  cwd: string;
  sessionFile: string;
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
  const title = buildTitle(titlePrompt);
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
  return request.parentPeerTarget?.trim() ? "intercom" : "manual";
}

function buildReportBackInstructions({
  reportBack,
  parentPeerTarget,
}: {
  reportBack: SidequestReportBack;
  parentPeerTarget?: string;
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
    return "No automatic report-back is requested. Do not claim that a report was delivered; leave findings visible in this sidequest session unless the controller gives further instructions.";
  }

  return "Manual report-back is requested. Do not over-promise delivery; leave a concise visible report in this sidequest session for the controller/operator to inspect.";
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
  };
}

export default createSidequestExtension();

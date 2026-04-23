import { existsSync, readFileSync, readlinkSync } from "node:fs";
import { homedir } from "node:os";
import { join } from "node:path";
import type { ExtensionAPI } from "@mariozechner/pi-coding-agent";

const DEFAULT_PI_BIN = process.env.PI_SIDEQUEST_PI_BIN || "pi";
const GHOSTTY_PROBE_TIMEOUT_MS = 4000;
const GHOSTTY_LAUNCH_TIMEOUT_MS = 15000;
const TITLE_MAX_LEN = 48;
const GHOSTTY_BIN_NAME = "ghostty";
const LOCAL_GHOSTTY_WRAPPER = join(homedir(), ".local", "bin", "ghostty-sidequest");
const LOCAL_GHOSTTY_BIN = join(homedir(), ".local", "opt", "ghostty-sidequest", "bin", "ghostty");

type LaunchMode = "tab" | "window";

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

        const env = options.env ?? process.env;
        const pathExists = options.pathExists ?? existsSync;
        const execRunner: ExecRunner =
          options.exec ??
          ((command, execArgs, execOptions) => pi.exec(command, execArgs, execOptions));
        const currentSessionGhosttyBin =
          options.currentSessionGhosttyBin ??
          findGhosttyAncestorBin(options.processId ?? process.pid);
        const ghosttyBin = resolveGhosttyBin({ env, pathExists, currentSessionGhosttyBin });
        const piBin = env.PI_SIDEQUEST_PI_BIN?.trim() || DEFAULT_PI_BIN;
        const thinkingLevel = pi.getThinkingLevel();
        const modelArgs = buildModelArgs(ctx.model as ModelLike | undefined, thinkingLevel);
        const title = buildTitle(prompt);
        const supportsNewTab =
          process.platform === "linux"
            ? await supportsGhosttyNewTab(execRunner, ghosttyBin)
            : false;
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
            cwd: ctx.cwd,
            title,
            launchMode,
            surfaceId,
            piArgs,
          }),
          ctx.cwd,
        );
        let launchNote = windowFallbackReason;

        if (!launchResult.ok && launchMode === "tab") {
          const tabFailure = summarizeLaunchFailure(launchResult);
          const fallbackResult = await runGhosttyLaunch(
            execRunner,
            ghosttyBin,
            buildGhosttyArgs({
              cwd: ctx.cwd,
              title,
              launchMode: "window",
              piArgs,
            }),
            ctx.cwd,
          );
          if (fallbackResult.ok) {
            launchMode = "window";
            launchResult = fallbackResult;
            launchNote = `same-window tab launch failed (${tabFailure}); opened a new window instead`;
          }
        }

        if (!launchResult.ok) {
          const failure = summarizeLaunchFailure(launchResult);
          if (ctx.hasUI) {
            ctx.ui.notify(`sidequest failed to launch Ghostty: ${failure}`, "error");
          }
          return;
        }

        if (ctx.hasUI) {
          const modeLabel = launchMode === "tab" ? "current Ghostty tab" : "new Ghostty window";
          const suffix = launchNote ? ` (${launchNote})` : "";
          ctx.ui.notify(
            `Opened sidequest in ${modeLabel}: ${summarizePrompt(prompt)}${suffix}`,
            "info",
          );
        }
      },
    });
  };
}

export default createSidequestExtension();

import * as fs from "node:fs";
import * as os from "node:os";
import * as path from "node:path";
import { execFileText } from "./boundaries.ts";
import { superviseProcess } from "./process-supervisor.ts";

export interface RunAkCommandParams {
  akPath: string;
  societyDb: string;
  args: string[];
  signal?: AbortSignal;
  timeoutMs?: number;
}

export interface RunAkCommandResult {
  ok: boolean;
  stdout: string;
  stderr: string;
  aborted?: boolean;
  timedOut?: boolean;
}

const DEFAULT_AK_TIMEOUT_MS =
  Number.parseInt(process.env.PI_ORCH_AK_TIMEOUT_MS || "", 10) || 30_000;
const DEFAULT_AK_PATH = path.join(
  os.homedir(),
  "ai-society",
  "softwareco",
  "owned",
  "agent-kernel",
  "target",
  "release",
  "ak",
);

function resolveExistingDir(startDir: string): string | undefined {
  let current = path.resolve(startDir);

  while (true) {
    if (fs.existsSync(current)) {
      const stat = fs.statSync(current, { throwIfNoEntry: false });
      if (stat?.isDirectory()) {
        return current;
      }
    }

    const parent = path.dirname(current);
    if (parent === current) {
      return undefined;
    }
    current = parent;
  }
}

function findAkWrapper(startDir: string): string | undefined {
  const existingDir = resolveExistingDir(startDir);
  if (!existingDir) {
    return undefined;
  }

  let current = existingDir;
  while (true) {
    const candidate = path.join(current, "scripts", "ak.sh");
    if (fs.existsSync(candidate)) {
      return candidate;
    }

    const parent = path.dirname(current);
    if (parent === current) {
      return undefined;
    }
    current = parent;
  }
}

export function resolveAkPath(options: { cwd?: string; env?: NodeJS.ProcessEnv } = {}): string {
  const env = options.env || process.env;
  const explicitAkPath = env.AGENT_KERNEL?.trim();
  if (explicitAkPath) {
    return explicitAkPath;
  }

  const wrapperPath = findAkWrapper(options.cwd || process.cwd());
  if (wrapperPath) {
    return wrapperPath;
  }

  return fs.existsSync(DEFAULT_AK_PATH) ? DEFAULT_AK_PATH : "ak";
}

function buildAkEnv(societyDb: string): NodeJS.ProcessEnv {
  return {
    ...process.env,
    AK_DB: societyDb,
  };
}

export function runAkCommand(params: RunAkCommandParams): RunAkCommandResult {
  const result = execFileText(params.akPath, params.args, {
    env: buildAkEnv(params.societyDb),
  });

  if (!result.ok) {
    return {
      ok: false,
      stdout: result.stdout || "",
      stderr: result.stderr || result.error,
    };
  }

  return { ok: true, stdout: result.value, stderr: "" };
}

export async function runAkCommandAsync(params: RunAkCommandParams): Promise<RunAkCommandResult> {
  const result = await superviseProcess({
    command: params.akPath,
    args: params.args,
    env: buildAkEnv(params.societyDb),
    signal: params.signal,
    timeoutMs: params.timeoutMs ?? DEFAULT_AK_TIMEOUT_MS,
  });

  if (result.exitCode === 0 && !result.aborted && !result.timedOut) {
    return { ok: true, stdout: result.stdout, stderr: result.stderr };
  }

  return {
    ok: false,
    stdout: result.stdout,
    stderr: result.stderr || result.error || `ak exited with code ${result.exitCode}`,
    aborted: result.aborted,
    timedOut: result.timedOut,
  };
}

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

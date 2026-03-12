import { spawn } from "node:child_process";

export interface SuperviseProcessParams {
  command: string;
  args: string[];
  cwd?: string;
  env?: NodeJS.ProcessEnv;
  signal?: AbortSignal;
  timeoutMs: number;
  maxStdoutBytes?: number;
  maxStderrBytes?: number;
  onStdoutData?: (chunk: string) => void;
  onStderrData?: (chunk: string) => void;
}

export interface SuperviseProcessResult {
  exitCode: number;
  stdout: string;
  stderr: string;
  stdoutTruncated: boolean;
  stderrTruncated: boolean;
  elapsed: number;
  aborted: boolean;
  timedOut: boolean;
  error?: string;
}

const FORCE_KILL_GRACE_MS = 500;
const DEFAULT_CAPTURE_BYTES =
  Number.parseInt(process.env.PI_ORCH_PROCESS_CAPTURE_BYTES || "", 10) || 64 * 1024;

export function superviseProcess(params: SuperviseProcessParams): Promise<SuperviseProcessResult> {
  return new Promise((resolve) => {
    const startTime = Date.now();
    const proc = spawn(params.command, params.args, {
      cwd: params.cwd,
      stdio: ["ignore", "pipe", "pipe"],
      env: params.env,
    });

    const maxStdoutBytes = params.maxStdoutBytes ?? DEFAULT_CAPTURE_BYTES;
    const maxStderrBytes = params.maxStderrBytes ?? DEFAULT_CAPTURE_BYTES;

    let stdout = "";
    let stderr = "";
    let stdoutTruncated = false;
    let stderrTruncated = false;
    let aborted = false;
    let timedOut = false;
    let settled = false;
    let forceKillTimer: NodeJS.Timeout | undefined;
    let timeoutTimer: NodeJS.Timeout | undefined;
    let abortHandler: (() => void) | undefined;

    const cleanup = () => {
      if (timeoutTimer) {
        clearTimeout(timeoutTimer);
      }
      if (forceKillTimer) {
        clearTimeout(forceKillTimer);
      }
      if (params.signal && abortHandler) {
        params.signal.removeEventListener("abort", abortHandler);
      }
    };

    const finalize = (result: Omit<SuperviseProcessResult, "elapsed">) => {
      if (settled) {
        return;
      }
      settled = true;
      cleanup();
      resolve({
        ...result,
        elapsed: Date.now() - startTime,
      });
    };

    const requestStop = (reason: "aborted" | "timed-out") => {
      if (reason === "aborted") {
        aborted = true;
      } else {
        timedOut = true;
      }

      try {
        proc.kill("SIGTERM");
      } catch {}

      forceKillTimer = setTimeout(() => {
        try {
          proc.kill("SIGKILL");
        } catch {}
      }, FORCE_KILL_GRACE_MS);
    };

    proc.stdout?.setEncoding("utf-8");
    proc.stdout?.on("data", (chunk: string) => {
      const capture = appendBoundedText(stdout, chunk, maxStdoutBytes);
      stdout = capture.value;
      stdoutTruncated = stdoutTruncated || capture.truncated;
      params.onStdoutData?.(chunk);
    });

    proc.stderr?.setEncoding("utf-8");
    proc.stderr?.on("data", (chunk: string) => {
      const capture = appendBoundedText(stderr, chunk, maxStderrBytes);
      stderr = capture.value;
      stderrTruncated = stderrTruncated || capture.truncated;
      params.onStderrData?.(chunk);
    });

    timeoutTimer = setTimeout(() => {
      requestStop("timed-out");
    }, params.timeoutMs);

    if (params.signal) {
      abortHandler = () => {
        requestStop("aborted");
      };
      if (params.signal.aborted) {
        abortHandler();
      } else {
        params.signal.addEventListener("abort", abortHandler, { once: true });
      }
    }

    proc.on("close", (code) => {
      const exitCode = code ?? (aborted ? 130 : timedOut ? 124 : 1);
      const fallbackError = aborted
        ? "process aborted"
        : timedOut
          ? `process timed out after ${params.timeoutMs}ms`
          : stderr || `process exited with code ${exitCode}`;

      finalize({
        exitCode,
        stdout,
        stderr: code === 0 && !aborted && !timedOut ? stderr : stderr || fallbackError,
        stdoutTruncated,
        stderrTruncated,
        aborted,
        timedOut,
      });
    });

    proc.on("error", (error) => {
      finalize({
        exitCode: 1,
        stdout,
        stderr: stderr || error.message,
        stdoutTruncated,
        stderrTruncated,
        aborted,
        timedOut,
        error: error.message,
      });
    });
  });
}

function appendBoundedText(
  current: string,
  chunk: string,
  maxBytes: number,
): { value: string; truncated: boolean } {
  if (maxBytes <= 0) {
    return { value: "", truncated: chunk.length > 0 || current.length > 0 };
  }

  const currentBytes = Buffer.byteLength(current, "utf-8");
  if (currentBytes >= maxBytes) {
    return { value: current, truncated: chunk.length > 0 };
  }

  const remainingBytes = maxBytes - currentBytes;
  const chunkBuffer = Buffer.from(chunk, "utf-8");
  if (chunkBuffer.byteLength <= remainingBytes) {
    return { value: current + chunk, truncated: false };
  }

  return {
    value: current + chunkBuffer.subarray(0, remainingBytes).toString("utf-8"),
    truncated: true,
  };
}

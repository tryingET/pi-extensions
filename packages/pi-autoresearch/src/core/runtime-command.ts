import { spawn } from "node:child_process";

import type { CommandExecutionSummary } from "./runtime.ts";

const OUTPUT_TAIL_MAX_LINES = 20;
const OUTPUT_TAIL_MAX_BYTES = 4 * 1024;
const COMMAND_OUTPUT_MAX_BYTES = 16 * 1024 * 1024;

function commandOutputBytes(stdout: string, stderr: string): number {
  return Buffer.byteLength(stdout, "utf8") + Buffer.byteLength(stderr, "utf8");
}

function appendCommandOutputChunk(current: string, chunk: string): string {
  const combined = `${current}${chunk}`;
  if (Buffer.byteLength(combined, "utf8") <= COMMAND_OUTPUT_MAX_BYTES) {
    return combined;
  }
  return combined.slice(-COMMAND_OUTPUT_MAX_BYTES);
}

export async function runProcessCommand(input: {
  command: string;
  executable: string;
  args: string[];
  cwd: string;
  timeoutSeconds: number;
  signal?: AbortSignal;
}): Promise<CommandExecutionSummary> {
  return await runSpawnedCommand({ ...input, shell: false });
}

export async function runShellCommand(input: {
  command: string;
  cwd: string;
  timeoutSeconds: number;
  signal?: AbortSignal;
}): Promise<CommandExecutionSummary> {
  return await runSpawnedCommand({ ...input, executable: input.command, args: [], shell: true });
}

async function runSpawnedCommand(input: {
  command: string;
  executable: string;
  args: string[];
  cwd: string;
  timeoutSeconds: number;
  shell: boolean;
  signal?: AbortSignal;
}): Promise<CommandExecutionSummary> {
  input.signal?.throwIfAborted();
  const startedAt = Date.now();

  return await new Promise<CommandExecutionSummary>((resolve, reject) => {
    const child = spawn(input.executable, input.args, {
      cwd: input.cwd,
      shell: input.shell,
      detached: true,
      stdio: ["ignore", "pipe", "pipe"],
    });

    let stdout = "";
    let stderr = "";
    let timedOut = false;
    let aborted = false;
    let outputLimitExceeded = false;
    let settled = false;
    let killTimer: ReturnType<typeof setTimeout> | null = null;

    const cleanup = () => {
      clearTimeout(timer);
      if (killTimer) {
        clearTimeout(killTimer);
      }
      input.signal?.removeEventListener("abort", onAbort);
    };

    const terminate = (signal: NodeJS.Signals) => {
      killTree(child.pid, signal);
    };

    const requestTermination = (mode: "timeout" | "abort" | "output_limit") => {
      if (mode === "timeout") {
        timedOut = true;
      } else if (mode === "abort") {
        aborted = true;
      } else {
        outputLimitExceeded = true;
      }
      terminate("SIGTERM");
      killTimer = setTimeout(() => {
        terminate("SIGKILL");
      }, 250);
    };

    const finish = (exitCode: number | null) => {
      if (settled) return;
      settled = true;
      cleanup();
      if (aborted) {
        reject(new Error(`Command aborted: ${input.command}`));
        return;
      }
      const boundedStderr = outputLimitExceeded
        ? `${stderr}\nCommand output exceeded ${COMMAND_OUTPUT_MAX_BYTES} bytes and was terminated.`
        : stderr;
      resolve({
        command: input.command,
        exitCode,
        timedOut,
        aborted,
        durationSeconds: (Date.now() - startedAt) / 1000,
        stdout,
        stderr: boundedStderr,
        outputTail: tailText(joinOutput({ stdout, stderr: boundedStderr })),
      });
    };

    const onAbort = () => {
      requestTermination("abort");
    };

    child.stdout?.setEncoding("utf8");
    child.stderr?.setEncoding("utf8");
    child.stdout?.on("data", (chunk: string) => {
      stdout = appendCommandOutputChunk(stdout, chunk);
      if (commandOutputBytes(stdout, stderr) > COMMAND_OUTPUT_MAX_BYTES) {
        requestTermination("output_limit");
      }
    });
    child.stderr?.on("data", (chunk: string) => {
      stderr = appendCommandOutputChunk(stderr, chunk);
      if (commandOutputBytes(stdout, stderr) > COMMAND_OUTPUT_MAX_BYTES) {
        requestTermination("output_limit");
      }
    });

    child.on("error", (error) => {
      stderr += error instanceof Error ? error.message : String(error);
      finish(null);
    });

    child.on("close", (code) => {
      finish(code);
    });

    input.signal?.addEventListener("abort", onAbort, { once: true });

    const timer = setTimeout(() => {
      requestTermination("timeout");
    }, Math.max(1, input.timeoutSeconds) * 1000);
  });
}

function tailText(text: string): string {
  const lines = text.split(/\r?\n/).slice(-OUTPUT_TAIL_MAX_LINES).join("\n");
  const bytes = Buffer.from(lines, "utf8");
  if (bytes.length <= OUTPUT_TAIL_MAX_BYTES) {
    return lines.trim();
  }
  return bytes
    .subarray(bytes.length - OUTPUT_TAIL_MAX_BYTES)
    .toString("utf8")
    .trim();
}

function killTree(pid: number | undefined, signal: NodeJS.Signals = "SIGTERM"): void {
  if (pid === undefined) return;
  try {
    process.kill(-pid, signal);
  } catch {
    try {
      process.kill(pid, signal);
    } catch {
      // Process already exited.
    }
  }
}

export function joinOutput(output: { stdout: string; stderr: string }): string {
  return [output.stdout, output.stderr].filter(Boolean).join("\n").trim();
}

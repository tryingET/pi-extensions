import { type ChildProcess, spawn } from "node:child_process";
import { performance } from "node:perf_hooks";
import { openVerifiedPreparedRuntime, type PreparedRuntimeLocation } from "./prepared-runtime.ts";

const STDOUT_CAP = 131_072;
const STDERR_CAP = 32_768;
const COMBINED_CAP = 163_840;
const TOTAL_MS = 750;
const TERM_MS = 100;
const KILL_AND_REAP_MS = 100;

export type ProcessFailureKind = "unavailable" | "timeout" | "incompatible" | "resource_exhausted";

export class ProcessBoundaryError extends Error {
  constructor(
    readonly kind: ProcessFailureKind,
    message: string,
  ) {
    super(message);
  }
}

export interface BoundedProcessOutput {
  stdout: Buffer;
  stderr: Buffer;
  exitCode: number;
  readonly finalDeadline: number;
}

export interface PreparedInvocation {
  location: PreparedRuntimeLocation;
  executable: string;
  cwd: string;
  fixedArguments: readonly string[];
  manifestDigest: string;
  rocsCommit: string;
  pythonVersion: string;
  descriptorFds?: { interpreter: number; root: number };
}

export async function invokePrepared(
  runtime: PreparedInvocation,
  args: string[],
  stdin: Buffer | undefined,
  env: NodeJS.ProcessEnv,
): Promise<BoundedProcessOutput> {
  const finalDeadline = performance.now() + TOTAL_MS;
  const executionDeadline = finalDeadline - TERM_MS - KILL_AND_REAP_MS;
  const verified = await openVerifiedPreparedRuntime(runtime.location, finalDeadline).catch(
    (error) => {
      if (performance.now() >= finalDeadline || /deadline/i.test(errorMessage(error)))
        throw new ProcessBoundaryError("timeout", "ROCS deadline exceeded during reverification");
      throw error;
    },
  );
  try {
    const manifest = verified.manifest;
    if (
      manifest.manifest_digest !== runtime.manifestDigest ||
      manifest.interpreter.path !== runtime.executable ||
      manifest.interpreter.version !== runtime.pythonVersion ||
      manifest.rocs_commit !== runtime.rocsCommit
    )
      throw new ProcessBoundaryError("incompatible", "prepared runtime identity drift");
    await verified.reverifyInodes();
    if (performance.now() >= executionDeadline)
      throw new ProcessBoundaryError("timeout", "ROCS deadline exhausted before spawn");
    const output = await spawnBounded(
      {
        ...runtime,
        executable: verified.executable,
        cwd: verified.cwd,
        descriptorFds: { interpreter: verified.interpreterFd, root: verified.rootFd },
      },
      args,
      stdin,
      env,
      executionDeadline,
      finalDeadline,
    );
    return { ...output, finalDeadline };
  } finally {
    await verified.close();
  }
}

export function consumeProcessOutput<T>(output: BoundedProcessOutput, consume: () => T): T {
  let value: T;
  try {
    value = consume();
  } catch (error) {
    if (performance.now() >= output.finalDeadline)
      throw new ProcessBoundaryError(
        "timeout",
        "ROCS deadline exceeded during parsing or validation",
      );
    throw error;
  }
  if (performance.now() >= output.finalDeadline)
    throw new ProcessBoundaryError(
      "timeout",
      "ROCS deadline exceeded during parsing or validation",
    );
  return value;
}

function spawnBounded(
  runtime: PreparedInvocation,
  args: string[],
  stdin: Buffer | undefined,
  env: NodeJS.ProcessEnv,
  executionDeadline: number,
  finalDeadline: number,
): Promise<{ stdout: Buffer; stderr: Buffer; exitCode: number }> {
  let child: ChildProcess;
  try {
    child = spawn(runtime.executable, [...runtime.fixedArguments, ...args], {
      cwd: runtime.cwd,
      env,
      shell: false,
      detached: true,
      stdio: runtime.descriptorFds
        ? ["pipe", "pipe", "pipe", runtime.descriptorFds.interpreter, runtime.descriptorFds.root]
        : ["pipe", "pipe", "pipe"],
      windowsHide: true,
    });
  } catch (error) {
    throw new ProcessBoundaryError("unavailable", errorMessage(error));
  }
  if (!child.stdout || !child.stderr || !child.stdin) {
    killGroup(child, "SIGKILL");
    throw new ProcessBoundaryError("unavailable", "ROCS stdio unavailable");
  }

  const stdoutChunks: Buffer[] = [];
  const stderrChunks: Buffer[] = [];
  let stdoutBytes = 0;
  let stderrBytes = 0;
  let exitCode: number | null = null;
  let closed = false;
  let spawnError: unknown;
  let boundaryFailure: ProcessBoundaryError | undefined;
  let stopping: Promise<void> | undefined;
  let resolveClose!: () => void;
  let resolveBoundary!: () => void;
  const closedPromise = new Promise<void>((resolve) => {
    resolveClose = resolve;
  });
  const boundaryPromise = new Promise<void>((resolve) => {
    resolveBoundary = resolve;
  });

  const stopBuffering = () => {
    child.stdout?.removeAllListeners("data");
    child.stderr?.removeAllListeners("data");
    child.stdout?.pause();
    child.stderr?.pause();
    child.stdout?.destroy();
    child.stderr?.destroy();
  };
  const stop = (failure: ProcessBoundaryError) => {
    if (!boundaryFailure) boundaryFailure = failure;
    stopBuffering();
    if (!stopping) {
      stopping = terminateWithinDeadline(child, closedPromise, finalDeadline);
      void stopping.then(resolveBoundary);
    }
    return stopping;
  };
  const append = (stream: "stdout" | "stderr", raw: Buffer | string) => {
    if (boundaryFailure) return;
    const chunk = Buffer.isBuffer(raw) ? raw : Buffer.from(raw);
    const nextOut = stdoutBytes + (stream === "stdout" ? chunk.length : 0);
    const nextErr = stderrBytes + (stream === "stderr" ? chunk.length : 0);
    if (nextOut > STDOUT_CAP || nextErr > STDERR_CAP || nextOut + nextErr > COMBINED_CAP) {
      void stop(new ProcessBoundaryError("resource_exhausted", "ROCS process output cap exceeded"));
      return;
    }
    if (stream === "stdout") {
      stdoutBytes = nextOut;
      stdoutChunks.push(chunk);
    } else {
      stderrBytes = nextErr;
      stderrChunks.push(chunk);
    }
  };
  child.stdout.on("data", (chunk) => append("stdout", chunk));
  child.stderr.on("data", (chunk) => append("stderr", chunk));
  child.once("error", (error) => {
    spawnError = error;
    resolveClose();
  });
  child.once("close", (code) => {
    closed = true;
    exitCode = code;
    resolveClose();
  });

  const timeout = setTimeout(
    () => {
      void stop(new ProcessBoundaryError("timeout", "ROCS deadline exceeded"));
    },
    Math.max(0, executionDeadline - performance.now()),
  );
  timeout.unref();
  if (stdin) child.stdin.end(stdin);
  else child.stdin.end();

  return (async () => {
    await Promise.race([closedPromise, boundaryPromise]);
    if (stopping) await stopping;
    clearTimeout(timeout);
    // A bounded reap may intentionally give up; never await the child after the final deadline.
    if (boundaryFailure) throw boundaryFailure;
    if (spawnError) throw new ProcessBoundaryError("unavailable", errorMessage(spawnError));
    if (!closed) throw new ProcessBoundaryError("timeout", "ROCS bounded reap expired");
    if (performance.now() >= finalDeadline)
      throw new ProcessBoundaryError("timeout", "ROCS end-to-end deadline exceeded");
    return {
      stdout: Buffer.concat(stdoutChunks, stdoutBytes),
      stderr: Buffer.concat(stderrChunks, stderrBytes),
      exitCode: exitCode ?? 1,
    };
  })();
}

async function terminateWithinDeadline(
  child: ChildProcess,
  closed: Promise<void>,
  finalDeadline: number,
): Promise<void> {
  const pid = child.pid;
  killGroup(child, "SIGTERM");
  const termBudget = Math.min(TERM_MS, remaining(finalDeadline));
  await Promise.all([waitForClose(closed, termBudget), waitForGroupExit(pid, termBudget)]);
  if (!groupAlive(pid)) return;
  killGroup(child, "SIGKILL");
  const killBudget = Math.min(KILL_AND_REAP_MS, remaining(finalDeadline));
  await Promise.all([waitForClose(closed, killBudget), waitForGroupExit(pid, killBudget)]);
}

async function waitForGroupExit(pid: number | undefined, milliseconds: number): Promise<boolean> {
  if (milliseconds <= 0) return !groupAlive(pid);
  const deadline = performance.now() + milliseconds;
  while (groupAlive(pid) && performance.now() < deadline) {
    await new Promise((resolve) => setTimeout(resolve, Math.min(5, deadline - performance.now())));
  }
  return !groupAlive(pid);
}

function groupAlive(pid: number | undefined): boolean {
  if (typeof pid !== "number") return false;
  try {
    process.kill(-pid, 0);
    return true;
  } catch (error) {
    return (error as NodeJS.ErrnoException).code !== "ESRCH";
  }
}

function waitForClose(closed: Promise<void>, milliseconds: number): Promise<boolean> {
  if (milliseconds <= 0) return Promise.resolve(false);
  return new Promise((resolve) => {
    let settled = false;
    const timer = setTimeout(() => {
      if (!settled) {
        settled = true;
        resolve(false);
      }
    }, milliseconds);
    timer.unref();
    void closed.then(() => {
      if (!settled) {
        settled = true;
        clearTimeout(timer);
        resolve(true);
      }
    });
  });
}
function killGroup(child: ChildProcess, signal: NodeJS.Signals): void {
  try {
    if (typeof child.pid === "number") process.kill(-child.pid, signal);
  } catch {
    // ESRCH is success for bounded teardown; every other failure still expires at the same deadline.
  }
}
function remaining(deadline: number): number {
  return Math.max(0, deadline - performance.now());
}
function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message.slice(0, 4096) : "ROCS process failure";
}

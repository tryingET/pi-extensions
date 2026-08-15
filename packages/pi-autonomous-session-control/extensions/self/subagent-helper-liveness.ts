import type { ChildProcessByStdio } from "node:child_process";
import type { Readable } from "node:stream";

const CHILD_FORCE_KILL_GRACE_MS = 250;
const HELPER_FORCE_EXIT_GRACE_MS = 400;

export interface SubagentHelperLivenessController {
  writeProtocolLine(line: string): void;
  markTransportReady(): void;
  start(): void;
  handleChildClose(code: number | null, signal: NodeJS.Signals | null): void;
  handleChildError(): void;
}

export function createSubagentHelperLivenessController(options: {
  child: ChildProcessByStdio<null, Readable, Readable>;
  startupTimeoutMs: number;
  executionTimeoutMs: number;
  cleanupSync: () => void;
}): SubagentHelperLivenessController {
  const { child } = options;
  let childExited = false;
  let childStopRequested = false;
  let terminationSignal: NodeJS.Signals | undefined;
  let childForceKillHandle: ReturnType<typeof setTimeout> | null = null;
  let helperDeadlineHandle: ReturnType<typeof setTimeout> | null = null;
  let helperForceExitHandle: ReturnType<typeof setTimeout> | null = null;
  let helperDeadlineExpired = false;
  let forcedExitCode: number | undefined;
  let stdoutBackpressured = false;

  const clearChildForceKill = () => {
    if (!childForceKillHandle) return;
    clearTimeout(childForceKillHandle);
    childForceKillHandle = null;
  };

  const clearHelperDeadline = () => {
    if (!helperDeadlineHandle) return;
    clearTimeout(helperDeadlineHandle);
    helperDeadlineHandle = null;
  };

  const clearHelperForceExit = () => {
    if (!helperForceExitHandle) return;
    clearTimeout(helperForceExitHandle);
    helperForceExitHandle = null;
  };

  const scheduleHelperForceExit = (exitCode: number) => {
    forcedExitCode ??= exitCode;
    if (helperForceExitHandle) return;
    helperForceExitHandle = setTimeout(() => {
      options.cleanupSync();
      process.exit(forcedExitCode ?? exitCode);
    }, HELPER_FORCE_EXIT_GRACE_MS);
  };

  const killRawChild = (signal: NodeJS.Signals) => {
    try {
      if (process.platform !== "win32" && typeof child.pid === "number" && child.pid > 0) {
        process.kill(-child.pid, signal);
        return;
      }
      child.kill(signal);
    } catch {
      // Best effort raw-child group shutdown.
    }
  };

  const requestChildStop = (signal: NodeJS.Signals) => {
    terminationSignal = signal;
    if (childExited || childStopRequested) return;
    childStopRequested = true;
    killRawChild("SIGTERM");
    childForceKillHandle = setTimeout(() => {
      if (!childExited) killRawChild("SIGKILL");
    }, CHILD_FORCE_KILL_GRACE_MS);
    childForceKillHandle.unref?.();
  };

  const armDeadline = (timeoutMs: number) => {
    clearHelperDeadline();
    if (timeoutMs <= 0) return;
    helperDeadlineHandle = setTimeout(() => {
      helperDeadlineExpired = true;
      requestChildStop("SIGTERM");
      scheduleHelperForceExit(124);
    }, timeoutMs);
  };

  process.once("SIGTERM", () => {
    requestChildStop("SIGTERM");
    scheduleHelperForceExit(143);
  });
  process.once("SIGINT", () => {
    requestChildStop("SIGINT");
    scheduleHelperForceExit(130);
  });
  process.once("exit", () => {
    clearChildForceKill();
    clearHelperDeadline();
    options.cleanupSync();
    if (!childExited) killRawChild("SIGKILL");
  });
  process.stdout.on("drain", () => {
    stdoutBackpressured = false;
    child.stdout?.resume();
    if (childExited && !helperDeadlineExpired) clearHelperForceExit();
  });
  process.stdout.on("error", () => {
    requestChildStop("SIGTERM");
    scheduleHelperForceExit(1);
  });

  const finish = (exitCode: number) => {
    childExited = true;
    clearChildForceKill();
    clearHelperDeadline();
    process.exitCode = forcedExitCode ?? exitCode;
    if (stdoutBackpressured || process.stdout.writableNeedDrain) {
      scheduleHelperForceExit(process.exitCode);
    }
  };

  return {
    writeProtocolLine(line) {
      try {
        if (!process.stdout.write(line)) {
          stdoutBackpressured = true;
          child.stdout?.pause();
        }
      } catch {
        requestChildStop("SIGTERM");
        scheduleHelperForceExit(1);
      }
    },
    markTransportReady() {
      armDeadline(options.executionTimeoutMs);
    },
    start() {
      armDeadline(options.startupTimeoutMs);
    },
    handleChildClose(code, signal) {
      finish(signalToExitCode(terminationSignal) ?? code ?? signalToExitCode(signal) ?? 0);
    },
    handleChildError() {
      finish(signalToExitCode(terminationSignal) ?? 1);
    },
  };
}

function signalToExitCode(signal: NodeJS.Signals | null | undefined): number | undefined {
  switch (signal) {
    case "SIGINT":
      return 130;
    case "SIGTERM":
      return 143;
    default:
      return undefined;
  }
}

import type { ChildProcessWithoutNullStreams } from "node:child_process";

const INTERRUPT_GRACE_MS = 5_000;
const TERMINATION_GRACE_MS = 750;

/** Send SIGINT now, then SIGTERM and SIGKILL only if the caller does not cancel. */
export function interruptChild(child: ChildProcessWithoutNullStreams): () => void {
  return scheduleSignals(child, true);
}

/** Bound a result-finalization stall without interrupting already-finished user code. */
export function guardChild(child: ChildProcessWithoutNullStreams): () => void {
  return scheduleSignals(child, false);
}

function scheduleSignals(
  child: ChildProcessWithoutNullStreams,
  sendInterrupt: boolean,
): () => void {
  if (hasExited(child)) return () => {};

  let killTimer: NodeJS.Timeout | undefined;
  const terminateTimer = setTimeout(() => {
    signalChild(child, "SIGTERM");
    killTimer = setTimeout(() => signalChild(child, "SIGKILL"), TERMINATION_GRACE_MS);
    killTimer.unref();
  }, INTERRUPT_GRACE_MS);
  terminateTimer.unref();

  const cancel = () => {
    clearTimeout(terminateTimer);
    clearTimeout(killTimer);
    child.removeListener("close", cancel);
  };
  child.once("close", cancel);
  if (sendInterrupt) signalChild(child, "SIGINT");
  return cancel;
}

/** Terminate a child for reset, close, or an unrecoverable protocol failure. */
export async function terminateChild(child: ChildProcessWithoutNullStreams): Promise<void> {
  if (hasExited(child)) return;
  await new Promise<void>((resolve) => {
    const forceTimer = setTimeout(() => signalChild(child, "SIGKILL"), TERMINATION_GRACE_MS);
    child.once("close", () => {
      clearTimeout(forceTimer);
      resolve();
    });
    signalChild(child, "SIGTERM");
  });
}

function hasExited(child: ChildProcessWithoutNullStreams): boolean {
  return child.exitCode !== null || child.signalCode !== null;
}

function signalChild(child: ChildProcessWithoutNullStreams, signal: NodeJS.Signals): void {
  if (hasExited(child)) return;
  try {
    child.kill(signal);
  } catch {
    // A concurrent close is equivalent to successful escalation.
  }
}

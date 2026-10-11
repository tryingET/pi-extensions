// Linux host-proof subprocess supervision. spawn (not execFile, which ignores detached)
// creates a private process group for the Node child and ordinary unshare descendants.
// This is fixture lifecycle control, not a hostile-code sandbox or workstation runner.
import { spawn } from "node:child_process";

export async function runOwnerProof(
  command: string,
  args: string[],
  cwd: string,
  signal?: AbortSignal,
) {
  signal?.throwIfAborted();
  return new Promise<{ stdout: string; stderr: string }>((resolve, reject) => {
    const child = spawn(command, args, {
      cwd,
      detached: true,
      shell: false,
      stdio: ["ignore", "pipe", "pipe"],
    });
    const group = child.pid;
    const chunks = { stdout: [] as Buffer[], stderr: [] as Buffer[] };
    const bytes = { stdout: 0, stderr: 0 };
    let failure: Error | undefined;
    const stop = (reason: string) => {
      failure ??= new Error(reason);
      if (!group) return;
      try {
        process.kill(-group, "SIGKILL");
      } catch (error) {
        if ((error as NodeJS.ErrnoException).code !== "ESRCH") failure = error as Error;
      }
    };
    const abort = () => stop("Owner proof interrupted or deadline exceeded");
    const timer = setTimeout(abort, 30000);
    signal?.addEventListener("abort", abort, { once: true });
    process.once("SIGTERM", abort);
    process.once("SIGINT", abort);
    if (signal?.aborted) abort();
    for (const name of ["stdout", "stderr"] as const) {
      child[name].on("data", (chunk: Buffer) => {
        bytes[name] += chunk.length;
        if (bytes[name] > 65536) stop("Owner proof output limit");
        else chunks[name].push(chunk);
      });
    }
    child.on("error", (error) => {
      failure ??= error;
      stop("Owner proof process error");
    });
    child.on("exit", (code) => {
      // Exit precedes pipe closure: kill descendants before waiting on inherited pipes.
      if (code !== 0) stop(`Owner proof failed (exit ${code})`);
    });
    child.on("close", (code) => {
      clearTimeout(timer);
      signal?.removeEventListener("abort", abort);
      process.removeListener("SIGTERM", abort);
      process.removeListener("SIGINT", abort);
      if (failure) reject(failure);
      else if (code !== 0) reject(new Error(`Owner proof failed (exit ${code})`));
      else
        resolve({
          stdout: Buffer.concat(chunks.stdout).toString("utf8"),
          stderr: Buffer.concat(chunks.stderr).toString("utf8"),
        });
    });
  });
}

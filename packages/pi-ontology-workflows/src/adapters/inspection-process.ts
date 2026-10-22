import { spawn } from "node:child_process";

/** Wait for child/stdio closure before its private output directory can be removed. */
export function runInspectionProcess(
  command: string,
  args: string[],
  options: { cwd: string; env: NodeJS.ProcessEnv; timeout: number; signal?: AbortSignal },
): Promise<string> {
  options.signal?.throwIfAborted();
  return new Promise((resolve, reject) => {
    const grouped = process.platform !== "win32";
    const child = spawn(command, args, {
      cwd: options.cwd,
      env: options.env,
      detached: grouped,
      stdio: ["ignore", "pipe", "pipe"],
    });
    const stdout: Buffer[] = [];
    const stderr: Buffer[] = [];
    const bytes = { stdout: 0, stderr: 0 };
    let failure: Error | undefined;
    const stop = (error: Error) => {
      failure ??= error;
      if (grouped && child.pid) {
        try {
          process.kill(-child.pid, "SIGKILL");
        } catch (killError) {
          if ((killError as NodeJS.ErrnoException).code !== "ESRCH") child.kill("SIGKILL");
        }
      } else child.kill("SIGKILL");
    };
    const append = (stream: "stdout" | "stderr", chunk: Buffer) => {
      if (failure) return;
      bytes[stream] += chunk.length;
      if (bytes[stream] > 8 * 1024 * 1024) {
        stop(new Error("ROCS inspection process output limit exceeded"));
        return;
      }
      (stream === "stdout" ? stdout : stderr).push(chunk);
    };
    child.stdout.on("data", (chunk: Buffer) => append("stdout", chunk));
    child.stderr.on("data", (chunk: Buffer) => append("stderr", chunk));
    child.once("error", stop);
    const abort = () => stop(new Error("ROCS inspection aborted"));
    const timer = setTimeout(
      () => stop(new Error("ROCS inspection deadline exceeded")),
      options.timeout,
    );
    options.signal?.addEventListener("abort", abort, { once: true });
    if (options.signal?.aborted) abort();
    child.once("close", (code, signal) => {
      clearTimeout(timer);
      options.signal?.removeEventListener("abort", abort);
      const out = Buffer.concat(stdout).toString("utf8");
      const err = Buffer.concat(stderr).toString("utf8");
      if (failure) reject(failure);
      else if (code !== 0)
        reject(
          Object.assign(new Error(`ROCS invocation failed (${signal ?? code})`), {
            stdout: out,
            stderr: err,
          }),
        );
      else resolve(out);
    });
  });
}

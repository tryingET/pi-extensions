import { isAbsolute } from "node:path";
import type { ExecRunner, LaunchResult } from "../extensions/sidequestGhostty.ts";

/** Shared internal fixed viewer target; no login shell, task body, or debugging fallback. */
export async function launchRestrictedTaskSessionWindow(
  attempt: string,
  cwd: string,
  execRunner: ExecRunner,
): Promise<LaunchResult> {
  if (!/^[A-Za-z0-9_-]{1,128}$/.test(attempt) || !isAbsolute(cwd))
    throw new Error("invalid_task_session_target");
  const result = await execRunner(
    "/usr/bin/ghostty",
    [
      `--working-directory=${cwd}`,
      "-e",
      "/home/tryinget/.local/libexec/pi-task-sessions/view-v1",
      attempt,
    ],
    { cwd, timeout: 4000 },
  );
  // Command return only; not host admission, command-admission handshake, or placement proof.
  return {
    ok: result.code === 0 && !result.killed,
    effectDisposition: result.code === 0 && !result.killed ? "settled" : "effect_indeterminate",
    code: result.code,
    stdout: "",
    stderr: "",
    killed: Boolean(result.killed),
  };
}

// ---
// summary: "Plans and executes editor-open attempts for overlay Enter, classifying launch success without faking certainty."
// read_when:
//   - "Changing how /c opens a file-backed context item in an editor, or how launch success/failure is classified."
// ---
import { spawn } from "node:child_process";
import { join } from "node:path";

/**
 * Launch modes:
 * - "wait": request-and-ack launcher (zellij run, tab-capable +new-tab). Expected to exit;
 *   a host timeout kill is a FAILURE, never success.
 * - "detach": session constructor (ghostty -e). That process IS the window running the
 *   editor; it must never be waited on or signalled. Success = still alive after a short
 *   grace window, or a clean early exit-0 handoff.
 */
export type OpenFileMode = "wait" | "detach";

export interface OpenFileAttempt {
  label: string;
  command: string;
  args: string[];
  mode: OpenFileMode;
  /** wait mode: abort threshold in ms; hitting it fails this attempt. */
  timeoutMs?: number;
  /** detach mode: grace window in ms before treating the session as live. */
  graceMs?: number;
}

export interface WaitOutcome {
  code: number;
  killed: boolean;
  stdout?: string;
  stderr?: string;
}

export interface DetachOutcome {
  timedOut: boolean;
  code: number | null;
  error?: string;
}

export type WaitRunner = (attempt: OpenFileAttempt, cwd: string) => Promise<WaitOutcome>;
export type DetachRunner = (attempt: OpenFileAttempt, cwd: string) => Promise<DetachOutcome>;

export type OpenFileResult =
  | { ok: true; label: string; kind: "ack" | "detached" }
  | { ok: false; detail: string };

export const resolveEditorCommand = (env: NodeJS.ProcessEnv = process.env): string[] => {
  const rawEditor = (env.VISUAL ?? env.EDITOR ?? "vi").trim();
  const parts = rawEditor.split(/\s+/).filter((part) => part.length > 0);
  return parts.length > 0 ? parts : ["vi"];
};

const isZellij = (env: NodeJS.ProcessEnv): boolean => Boolean(env.ZELLIJ?.trim());

const isGhostty = (env: NodeJS.ProcessEnv): boolean =>
  env.TERM_PROGRAM?.trim().toLowerCase() === "ghostty" ||
  Boolean(env.GHOSTTY_BIN_DIR?.trim()) ||
  Boolean(env.GHOSTTY_RESOURCES_DIR?.trim());

const ghosttyBin = (env: NodeJS.ProcessEnv): string => {
  const binDir = env.GHOSTTY_BIN_DIR?.trim();
  return binDir ? join(binDir, "ghostty") : "ghostty";
};

const zellijAttempts = (
  filePath: string,
  cwd: string,
  env: NodeJS.ProcessEnv,
): OpenFileAttempt[] => {
  const sessionName = env.ZELLIJ_SESSION_NAME?.trim();
  const sessionPrefix = sessionName ? ["--session", sessionName] : [];
  const editorCommand = resolveEditorCommand(env);
  const attempts: OpenFileAttempt[] = [
    {
      label: "zellij-run",
      command: "zellij",
      mode: "wait",
      timeoutMs: 5000,
      args: [
        ...sessionPrefix,
        "run",
        "--direction",
        "down",
        "--cwd",
        cwd,
        "--",
        ...editorCommand,
        filePath,
      ],
    },
    {
      label: "zellij-action-edit",
      command: "zellij",
      mode: "wait",
      timeoutMs: 5000,
      args: [...sessionPrefix, "action", "edit", "--direction", "down", "--cwd", cwd, filePath],
    },
    {
      label: "zellij-edit",
      command: "zellij",
      mode: "wait",
      timeoutMs: 5000,
      args: [...sessionPrefix, "edit", "--direction", "down", "--cwd", cwd, filePath],
    },
  ];
  if (sessionPrefix.length > 0) {
    attempts.push({
      label: "zellij-run-no-session",
      command: "zellij",
      mode: "wait",
      timeoutMs: 5000,
      args: ["run", "--direction", "down", "--cwd", cwd, "--", ...editorCommand, filePath],
    });
  }
  return attempts;
};

const ghosttyAttempts = (
  filePath: string,
  cwd: string,
  env: NodeJS.ProcessEnv,
): OpenFileAttempt[] => {
  const bin = ghosttyBin(env);
  const editorCommand = resolveEditorCommand(env);
  const wd = `--working-directory=${cwd}`;
  const exec = ["-e", ...editorCommand, filePath];
  return [
    // Tab-capable builds: request-and-ack, expected to return.
    {
      label: "ghostty-new-tab",
      command: bin,
      mode: "wait",
      timeoutMs: 5000,
      args: ["+new-tab", wd, ...exec],
    },
    // Stock builds: ghostty -e IS the editor session. Detach; never signal it.
    {
      label: "ghostty-new-window",
      command: bin,
      mode: "detach",
      graceMs: 1500,
      args: [wd, ...exec],
    },
  ];
};

export const planOpenFile = (input: {
  filePath: string;
  cwd: string;
  env?: NodeJS.ProcessEnv;
}): OpenFileAttempt[] => {
  const env = input.env ?? process.env;
  const attempts: OpenFileAttempt[] = [];
  if (isZellij(env)) attempts.push(...zellijAttempts(input.filePath, input.cwd, env));
  if (isGhostty(env) || attempts.length === 0) {
    attempts.push(...ghosttyAttempts(input.filePath, input.cwd, env));
  }
  return attempts;
};

export const executeOpenFile = async (
  attempts: readonly OpenFileAttempt[],
  cwd: string,
  runners: { wait: WaitRunner; detach: DetachRunner },
): Promise<OpenFileResult> => {
  let lastError = "unknown error";
  for (const attempt of attempts) {
    if (attempt.mode === "detach") {
      const outcome = await runners.detach(attempt, cwd);
      if (outcome.error) {
        lastError = outcome.error;
        continue;
      }
      // Still running after the grace window: the editor session is live.
      if (outcome.timedOut) return { ok: true, label: attempt.label, kind: "detached" };
      if (outcome.code === 0) return { ok: true, label: attempt.label, kind: "ack" };
      lastError = `exit ${outcome.code}`;
      continue;
    }

    const outcome = await runners.wait(attempt, cwd);
    // A host timeout kill is a failure even when the normalized exit code is 0.
    if (outcome.code === 0 && !outcome.killed) {
      return { ok: true, label: attempt.label, kind: "ack" };
    }
    lastError = outcome.killed
      ? "timed out (killed)"
      : (outcome.stderr || outcome.stdout || `exit ${outcome.code}`).trim();
  }
  return { ok: false, detail: lastError };
};

export const spawnDetachRunner = (spawnFn: typeof spawn = spawn): DetachRunner => {
  return async (attempt, cwd) => {
    const graceMs = attempt.graceMs ?? 1500;
    let child: ReturnType<typeof spawn> | undefined;
    try {
      child = spawnFn(attempt.command, attempt.args, {
        cwd,
        detached: true,
        stdio: "ignore",
      });
    } catch (error) {
      return { timedOut: false, code: null, error: String(error) };
    }
    if (!child) return { timedOut: false, code: null, error: "spawn returned no child" };

    return await new Promise<DetachOutcome>((resolve) => {
      let settled = false;
      const finish = (outcome: DetachOutcome) => {
        if (settled) return;
        settled = true;
        clearTimeout(timer);
        child.unref();
        resolve(outcome);
      };
      const timer = setTimeout(() => {
        finish({ timedOut: true, code: child.exitCode });
      }, graceMs);
      child.once("error", (error) => {
        finish({ timedOut: false, code: null, error: String(error) });
      });
      child.once("exit", (code) => {
        finish({ timedOut: false, code });
      });
    });
  };
};

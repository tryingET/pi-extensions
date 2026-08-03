import { execFile as execFileCb, spawn } from "node:child_process";
import { promisify } from "node:util";
import type { GitCommandOptions, GitCommandResult, GitRunner } from "./types.ts";

const execFile = promisify(execFileCb);

function toText(value: unknown): string {
  if (typeof value === "string") {
    return value;
  }

  if (value instanceof Uint8Array) {
    return Buffer.from(value).toString("utf8");
  }

  return value == null ? "" : String(value);
}

async function runGitWithStdin(
  repoRoot: string,
  args: string[],
  options: GitCommandOptions,
): Promise<GitCommandResult> {
  return new Promise((resolve) => {
    const child = spawn("git", args, {
      cwd: repoRoot,
      env: options.env,
      stdio: ["pipe", "pipe", "pipe"],
    });
    let stdout = "";
    let stderr = "";
    let settled = false;
    child.stdout.setEncoding("utf8");
    child.stderr.setEncoding("utf8");
    child.stdout.on("data", (chunk: string) => {
      stdout += chunk;
    });
    child.stderr.on("data", (chunk: string) => {
      stderr += chunk;
    });
    child.on("error", (error) => {
      if (settled) return;
      settled = true;
      resolve({ stdout, stderr: stderr || error.message, code: 1 });
    });
    child.on("close", (code) => {
      if (settled) return;
      settled = true;
      resolve({ stdout, stderr, code: code ?? 1 });
    });
    child.stdin.end(options.stdin ?? "");
  });
}

export function createExecFileGitRunner(repoRoot: string): GitRunner {
  return async (args, options = {}) => {
    if (options.stdin !== undefined) {
      return runGitWithStdin(repoRoot, args, options);
    }

    try {
      const { stdout, stderr } = await execFile("git", args, {
        cwd: repoRoot,
        env: options.env,
        encoding: "utf8",
      });
      return {
        stdout: toText(stdout),
        stderr: toText(stderr),
        code: 0,
      } satisfies GitCommandResult;
    } catch (error: unknown) {
      const execError =
        error && typeof error === "object"
          ? (error as Partial<{
              stdout: string | Uint8Array;
              stderr: string | Uint8Array;
              message: string;
              code: number;
            }>)
          : undefined;

      return {
        stdout: toText(execError?.stdout),
        stderr: toText(execError?.stderr || execError?.message),
        code: execError?.code ?? 1,
      } satisfies GitCommandResult;
    }
  };
}

export async function execGitChecked(
  git: GitRunner,
  args: string[],
  options?: GitCommandOptions,
): Promise<GitCommandResult> {
  const result = await git(args, options);
  if (result.code !== 0) {
    const stderr = result.stderr.trim();
    throw new Error(stderr || `git ${args.join(" ")} failed with code ${result.code}`);
  }
  return result;
}

export async function execGitStdout(
  git: GitRunner,
  args: string[],
  options?: GitCommandOptions,
): Promise<string> {
  return (await execGitChecked(git, args, options)).stdout.trim();
}

import { execFile as execFileCb } from "node:child_process";
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

export function createExecFileGitRunner(repoRoot: string): GitRunner {
  return async (args, options = {}) => {
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

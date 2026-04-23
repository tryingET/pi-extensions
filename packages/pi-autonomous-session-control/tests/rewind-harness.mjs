import { execFile as execFileCb } from "node:child_process";
import { mkdirSync } from "node:fs";
import { access, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { promisify } from "node:util";
import { createExecFileGitRunner } from "../extensions/self/rewind/index.ts";

const execFile = promisify(execFileCb);

function toText(value) {
  if (typeof value === "string") {
    return value;
  }

  if (value instanceof Uint8Array) {
    return Buffer.from(value).toString("utf8");
  }

  return value == null ? "" : String(value);
}

export async function runGit(repoRoot, args) {
  try {
    const { stdout, stderr } = await execFile("git", args, {
      cwd: repoRoot,
      encoding: "utf8",
    });
    return {
      stdout: toText(stdout),
      stderr: toText(stderr),
      code: 0,
    };
  } catch (error) {
    const execError = error && typeof error === "object" ? error : undefined;
    return {
      stdout: toText(execError?.stdout),
      stderr: toText(execError?.stderr || execError?.message),
      code: execError?.code ?? 1,
    };
  }
}

export async function runGitChecked(repoRoot, args) {
  const result = await runGit(repoRoot, args);
  if (result.code !== 0) {
    throw new Error(
      result.stderr.trim() || `git ${args.join(" ")} failed with code ${result.code}`,
    );
  }
  return result;
}

export async function gitStdout(repoRoot, args) {
  return (await runGitChecked(repoRoot, args)).stdout.trim();
}

export async function createRewindGitHarness() {
  const workspace = await mkdtemp(path.join(tmpdir(), "asc-rewind-core-"));
  const repoRoot = path.join(workspace, "repo");
  mkdirSync(repoRoot, { recursive: true });

  await runGitChecked(repoRoot, ["init"]);
  await runGitChecked(repoRoot, ["config", "user.name", "ASC Rewind Test"]);
  await runGitChecked(repoRoot, ["config", "user.email", "asc-rewind@example.test"]);

  return {
    repoRoot,
    git: createExecFileGitRunner(repoRoot),
    async cleanup() {
      await rm(workspace, { recursive: true, force: true });
    },
    async writeRepoFile(relativePath, content) {
      const filePath = path.join(repoRoot, relativePath);
      mkdirSync(path.dirname(filePath), { recursive: true });
      await writeFile(filePath, content, "utf8");
    },
    async readRepoFile(relativePath) {
      return readFile(path.join(repoRoot, relativePath), "utf8");
    },
    async exists(relativePath) {
      try {
        await access(path.join(repoRoot, relativePath));
        return true;
      } catch {
        return false;
      }
    },
  };
}

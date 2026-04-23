import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { execGitChecked, execGitStdout } from "./git-runner.ts";
import { appendSnapshotToStore } from "./keepalive-store.ts";
import type { GitRunner, SnapshotRef } from "./types.ts";

export interface EnsureSnapshotOptions {
  lastExact?: SnapshotRef | null;
  appendToStore?: boolean;
}

export interface EnsureSnapshotResult {
  snapshot: SnapshotRef;
  reused: boolean;
}

export async function getRepoRoot(git: GitRunner): Promise<string> {
  return execGitStdout(git, ["rev-parse", "--show-toplevel"]);
}

export async function captureWorktreeTree(git: GitRunner): Promise<{ treeSha: string }> {
  await getRepoRoot(git);
  const tempDir = await mkdtemp(join(tmpdir(), "asc-rewind-"));
  const tempIndex = join(tempDir, "index");

  try {
    const env = { ...process.env, GIT_INDEX_FILE: tempIndex };
    await execGitChecked(git, ["add", "-A"], { env });
    const treeSha = await execGitStdout(git, ["write-tree"], { env });
    return { treeSha };
  } finally {
    await rm(tempDir, { recursive: true, force: true }).catch(() => {
      // Best effort cleanup for temporary index directory.
    });
  }
}

export async function getCommitTreeSha(git: GitRunner, commitSha: string): Promise<string> {
  return execGitStdout(git, ["show", "-s", "--format=%T", commitSha]);
}

export async function commitExists(git: GitRunner, commitSha: string): Promise<boolean> {
  const result = await git(["cat-file", "-e", `${commitSha}^{commit}`]);
  return result.code === 0;
}

export async function ensureSnapshotForTree(
  git: GitRunner,
  treeSha: string,
  options: EnsureSnapshotOptions = {},
): Promise<EnsureSnapshotResult> {
  const lastExact = options.lastExact ?? null;
  if (lastExact && lastExact.treeSha === treeSha) {
    return {
      snapshot: lastExact,
      reused: true,
    };
  }

  const commitSha = await execGitStdout(git, ["commit-tree", treeSha, "-m", "asc rewind snapshot"]);

  if (options.appendToStore !== false) {
    await appendSnapshotToStore(git, commitSha);
  }

  return {
    snapshot: {
      commitSha,
      treeSha,
    },
    reused: false,
  };
}

export async function ensureSnapshotForCurrentWorktree(
  git: GitRunner,
  options: EnsureSnapshotOptions = {},
): Promise<EnsureSnapshotResult> {
  const { treeSha } = await captureWorktreeTree(git);
  return ensureSnapshotForTree(git, treeSha, options);
}

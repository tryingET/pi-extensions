import { realpathSync } from "node:fs";
import { rm } from "node:fs/promises";
import path from "node:path";
import { execGitChecked } from "./git-runner.ts";
import {
  captureWorktreeTree,
  ensureSnapshotForTree,
  getCommitTreeSha,
  getRepoRoot,
} from "./git-snapshot.ts";
import type { GitRunner, RestoreExactResult, SnapshotRef } from "./types.ts";

export interface RestoreCommitOptions {
  lastExact?: SnapshotRef | null;
}

function canonicalizePath(value: string): string {
  const resolvedValue = path.resolve(value);
  try {
    return realpathSync.native(resolvedValue);
  } catch {
    return resolvedValue;
  }
}

export function isInsidePath(targetPath: string, parentPath: string): boolean {
  const resolvedTarget = canonicalizePath(targetPath);
  const resolvedParent = canonicalizePath(parentPath);
  const relativePath = path.relative(resolvedParent, resolvedTarget);
  return relativePath === "" || (!relativePath.startsWith("..") && !path.isAbsolute(relativePath));
}

export async function getDeletedPaths(
  git: GitRunner,
  currentTreeSha: string,
  targetTreeSha: string,
): Promise<string[]> {
  const result = await execGitChecked(git, [
    "diff",
    "--name-only",
    "--diff-filter=D",
    "-z",
    currentTreeSha,
    targetTreeSha,
    "--",
  ]);

  return result.stdout.split("\0").filter(Boolean);
}

export async function deletePathsFromWorkingTree(
  repoRoot: string,
  repoRelativePaths: string[],
): Promise<void> {
  for (const repoRelativePath of repoRelativePaths) {
    const absolutePath = path.resolve(repoRoot, repoRelativePath);
    if (!isInsidePath(absolutePath, repoRoot)) {
      throw new Error(`refusing to delete path outside repo root: ${repoRelativePath}`);
    }

    await rm(absolutePath, { recursive: true, force: true });
  }
}

export async function restoreCommitExactly(
  git: GitRunner,
  targetCommitSha: string,
  options: RestoreCommitOptions = {},
): Promise<RestoreExactResult> {
  const { treeSha: currentTreeSha } = await captureWorktreeTree(git);
  const targetTreeSha = await getCommitTreeSha(git, targetCommitSha);

  if (currentTreeSha === targetTreeSha) {
    return {
      changed: false,
      targetTreeSha,
    };
  }

  const { snapshot: undoSnapshot } = await ensureSnapshotForTree(git, currentTreeSha, {
    lastExact: options.lastExact ?? null,
  });
  const pathsToDelete = await getDeletedPaths(git, currentTreeSha, targetTreeSha);
  const repoRoot = await getRepoRoot(git);
  await deletePathsFromWorkingTree(repoRoot, pathsToDelete);
  await execGitChecked(git, ["restore", `--source=${targetCommitSha}`, "--worktree", "--", "."]);

  return {
    changed: true,
    undoCommitSha: undoSnapshot.commitSha,
    targetTreeSha,
  };
}

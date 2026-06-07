import { spawnSync } from "node:child_process";

import path from "node:path";

import { normalizeBranchRef } from "./finalize-codec.ts";

import type { AutoresearchFinalizationGitContext } from "./finalize-model.ts";

export function isAutoresearchSessionArtifactPath(filePath: string): boolean {
  return path.basename(filePath).startsWith("autoresearch.");
}

export function isAutoresearchDirtyLocalArtifactPath(filePath: string): boolean {
  const normalized = filePath.replaceAll("\\", "/").replace(/^\.\//u, "");
  if (normalized.startsWith(".autoresearch/")) return true;
  return !normalized.includes("/") && isAutoresearchSessionArtifactPath(normalized);
}

export function collectAutoresearchGitContext(
  cwd: string,
  options: { trunkRef?: string; allowDetached?: boolean; allowTrunk?: boolean } = {},
): AutoresearchFinalizationGitContext {
  const resolvedCwd = path.resolve(cwd);
  const sourceBranch = runGitCommand(resolvedCwd, ["branch", "--show-current"]);
  if (!sourceBranch) {
    if (options.allowDetached) {
      throw new Error("Detached HEAD — finalization planning requires a source branch.");
    }
    throw new Error("Detached HEAD — finalization planning requires a source branch.");
  }

  const trunkRef = normalizeBranchRef(options.trunkRef ?? "main");
  if (!options.allowTrunk && normalizeBranchRef(sourceBranch) === trunkRef) {
    throw new Error(`On trunk (${trunkRef}) — finalization planning requires a feature branch.`);
  }

  const finalTree = normalizeCommitRef(resolvedCwd, "HEAD", "HEAD");
  const baseRef = normalizeCommitRef(
    resolvedCwd,
    runGitCommand(resolvedCwd, ["merge-base", "HEAD", trunkRef]),
    `merge-base(HEAD, ${trunkRef})`,
  );

  return {
    sourceBranch,
    trunkRef,
    baseRef,
    finalTree,
  };
}

export function assertAutoresearchCleanWorktree(cwd: string): void {
  const porcelain = runGitCommand(cwd, ["status", "--porcelain=v1", "--untracked-files=all"], {
    trim: false,
  });
  const dirtyPaths = porcelain
    .split(/\r?\n/u)
    .map((line) => extractPorcelainPath(line))
    .filter((entry): entry is string => Boolean(entry))
    .filter((entry) => !isAutoresearchDirtyLocalArtifactPath(entry));
  if (dirtyPaths.length > 0) {
    throw new Error(
      `Working tree is not clean; clean or stash intentionally before materializing finalization branches. Dirty paths: ${dirtyPaths.join(", ")}`,
    );
  }
}

export function assertAutoresearchDestinationBranchesAvailable(
  cwd: string,
  branches: readonly string[],
): void {
  for (const branch of uniqueStrings(branches)) {
    const result = spawnGit(cwd, ["show-ref", "--verify", "--quiet", `refs/heads/${branch}`]);
    if (result.status === 0) {
      throw new Error(`Destination branch ${branch} already exists.`);
    }
  }
}

export function checkoutAutoresearchDetached(cwd: string, ref: string): void {
  runGitCommand(cwd, ["checkout", "--quiet", "--detach", ref], { trim: false });
}

export function checkoutAutoresearchBranch(cwd: string, branch: string, force = false): void {
  const args = ["checkout", "--quiet"];
  if (force) {
    args.push("-f");
  }
  args.push(branch);
  runGitCommand(cwd, args, { trim: false });
}

export function rollbackAutoresearchMaterializationBranches(
  cwd: string,
  branches: readonly string[],
): void {
  for (const branch of uniqueStrings(branches)) {
    spawnGit(cwd, ["branch", "-D", branch]);
  }
}

export function listBranchCommitFiles(cwd: string, branchName: string): string[] {
  const raw = runGitCommand(
    cwd,
    ["diff-tree", "--no-commit-id", "--name-only", "-z", "-r", branchName],
    {
      trim: false,
    },
  );
  return uniqueStrings(
    raw
      .split("\u0000")
      .map((entry) => entry.trim())
      .filter(Boolean),
  );
}

export function readSingleParentCommit(cwd: string, branchName: string): string | null {
  const line = runGitCommand(cwd, ["rev-list", "--parents", "-n", "1", branchName]);
  const parts = line.split(/\s+/u).filter(Boolean);
  if (parts.length !== 2) {
    return null;
  }
  return parts[1] ?? null;
}

export function tryResolveGitPathObject(cwd: string, ref: string, file: string): string | null {
  const result = spawnGit(cwd, ["rev-parse", "--verify", `${ref}:${file}`]);
  if (result.status !== 0) {
    return null;
  }
  return (result.stdout ?? "").trim() || null;
}

export function extractPorcelainPath(line: string): string | null {
  const trimmed = line.trim();
  if (!trimmed) {
    return null;
  }
  const pathText = line.slice(3).trim();
  if (!pathText) {
    return null;
  }
  const renameParts = pathText.split(/\s+->\s+/u);
  return renameParts.at(-1)?.trim() || null;
}

export function listEffectiveGroupFiles(
  cwd: string,
  fromCommit: string,
  toCommit: string,
): string[] {
  const raw = runGitCommand(cwd, ["diff", "--name-only", "-z", fromCommit, toCommit], {
    trim: false,
  });

  return uniqueStrings(
    raw
      .split("\u0000")
      .map((entry) => entry.trim())
      .filter(Boolean)
      .filter((entry) => !isAutoresearchSessionArtifactPath(entry)),
  );
}

export function ensureCommitReachableFrom(
  cwd: string,
  candidate: string,
  descendant: string,
  label: string,
): void {
  const result = spawnGit(cwd, ["merge-base", "--is-ancestor", candidate, descendant]);
  if (result.status === 0) {
    return;
  }
  throw new Error(`${label} is not reachable from source branch HEAD ${descendant}.`);
}

export function ensureCommitDescendsFrom(
  cwd: string,
  previousCommit: string,
  nextCommit: string,
  label: string,
): void {
  const result = spawnGit(cwd, ["merge-base", "--is-ancestor", previousCommit, nextCommit]);
  if (result.status === 0) {
    return;
  }
  throw new Error(`${label} does not descend from the prior finalization point ${previousCommit}.`);
}

export function normalizeCommitRef(cwd: string, ref: string, field: string): string {
  const normalized = ref.trim();
  if (!normalized) {
    throw new Error(`${field} must be a non-empty commit reference.`);
  }
  return runGitCommand(cwd, ["rev-parse", "--verify", `${normalized}^{commit}`]);
}

export function uniqueStrings(values: readonly string[]): string[] {
  const seen = new Set<string>();
  const unique: string[] = [];
  for (const value of values) {
    if (seen.has(value)) {
      continue;
    }
    seen.add(value);
    unique.push(value);
  }
  return unique;
}

export function runGitCommand(
  cwd: string,
  args: string[],
  options: { trim?: boolean } = {},
): string {
  const result = spawnGit(cwd, args);
  if (result.error) {
    throw new Error(result.error.message);
  }
  if (result.status !== 0) {
    const stderr = (result.stderr || result.stdout || "").trim();
    throw new Error(`git ${args.join(" ")} failed${stderr ? `: ${stderr}` : ""}`);
  }
  const stdout = result.stdout ?? "";
  return options.trim === false ? stdout : stdout.trim();
}

export function spawnGit(cwd: string, args: string[]) {
  return spawnSync("git", args, {
    cwd,
    encoding: "utf8",
    stdio: ["ignore", "pipe", "pipe"],
  });
}

// summary: verifies that an existing candidate path is one exact registered linked worktree of the admitted parent repository.
// read_when:
//   - changing candidate worktree reuse, Git repository identity, or parent worktree membership checks.

import { lstatSync, readFileSync, realpathSync } from "node:fs";
import { dirname, join, resolve } from "node:path";

export type CandidateGitReadResult = {
  ok: boolean;
  stdout: string;
};

export type CandidateGitReader = (cwd: string, args: string[]) => Promise<CandidateGitReadResult>;

export type CandidateWorktreeIdentityFailureReason =
  | "parent_common_directory_unverifiable"
  | "candidate_common_directory_unverifiable"
  | "common_directory_mismatch"
  | "candidate_dot_git_not_linked_file"
  | "candidate_git_directory_unverifiable"
  | "candidate_gitfile_mismatch"
  | "candidate_git_directory_not_linked_layout"
  | "candidate_gitdir_backref_mismatch"
  | "candidate_branch_unverifiable"
  | "candidate_branch_mismatch"
  | "candidate_head_unverifiable"
  | "parent_worktree_list_unverifiable"
  | "parent_worktree_list_malformed"
  | "candidate_path_unverifiable"
  | "candidate_not_registered_by_parent"
  | "candidate_worktree_record_ambiguous"
  | "candidate_worktree_record_mismatch";

export type CandidateWorktreeIdentityResult =
  | {
      ok: true;
      commonDirectory: string;
      gitDirectory: string;
      headOid: string;
    }
  | { ok: false; reason: CandidateWorktreeIdentityFailureReason };

type WorktreeRecord = Map<string, string | true>;

const ABSOLUTE_COMMON_DIRECTORY_ARGS = ["rev-parse", "--path-format=absolute", "--git-common-dir"];
const ABSOLUTE_GIT_DIRECTORY_ARGS = ["rev-parse", "--absolute-git-dir"];
const PORCELAIN_WORKTREE_LIST_ARGS = ["worktree", "list", "--porcelain", "-z"];
const KNOWN_WORKTREE_FIELDS = new Set([
  "worktree",
  "HEAD",
  "branch",
  "bare",
  "detached",
  "locked",
  "prunable",
]);
const HEAD_OID = /^[0-9a-f]{40,64}$/u;

function withoutOneFinalLineEnding(output: string): string | undefined {
  const value = output.endsWith("\r\n")
    ? output.slice(0, -2)
    : output.endsWith("\n")
      ? output.slice(0, -1)
      : output;
  return value && !/[\0\r\n]/u.test(value) ? value : undefined;
}

function resolveReportedGitPath(cwd: string, output: string): string | undefined {
  const value = withoutOneFinalLineEnding(output);
  if (!value) return undefined;
  try {
    return realpathSync(resolve(cwd, value));
  } catch {
    return undefined;
  }
}

function resolveExistingPath(path: string): string | undefined {
  try {
    return realpathSync(resolve(path));
  } catch {
    return undefined;
  }
}

function readPathFile(path: string, prefix = ""): string | undefined {
  try {
    const raw = readFileSync(path, "utf8");
    if (!raw.endsWith("\n") || raw.endsWith("\n\n") || raw.includes("\0")) return undefined;
    const value = raw.slice(0, -1);
    if (!value.startsWith(prefix) || /[\r\n]/u.test(value)) return undefined;
    return value.slice(prefix.length);
  } catch {
    return undefined;
  }
}

function parseWorktreeList(output: string): WorktreeRecord[] | undefined {
  if (!output.endsWith("\0\0")) return undefined;
  const body = output.slice(0, -2);
  if (!body) return [];
  const records: WorktreeRecord[] = [];
  for (const block of body.split("\0\0")) {
    const fields = block.split("\0");
    if (fields.length < 2 || !fields[0]?.startsWith("worktree ")) return undefined;
    const record: WorktreeRecord = new Map();
    for (const field of fields) {
      if (!field) return undefined;
      const separator = field.indexOf(" ");
      const key = separator < 0 ? field : field.slice(0, separator);
      const value = separator < 0 ? true : field.slice(separator + 1);
      if (!KNOWN_WORKTREE_FIELDS.has(key) || record.has(key) || value === "") return undefined;
      record.set(key, value);
    }
    if (typeof record.get("worktree") !== "string") return undefined;
    records.push(record);
  }
  return records;
}

function verifyLinkedGitDirectory(
  worktreePath: string,
  commonDirectory: string,
  gitDirectory: string,
): CandidateWorktreeIdentityFailureReason | undefined {
  const dotGit = join(worktreePath, ".git");
  try {
    const info = lstatSync(dotGit);
    if (!info.isFile() || info.isSymbolicLink()) return "candidate_dot_git_not_linked_file";
  } catch {
    return "candidate_dot_git_not_linked_file";
  }

  const gitfileTarget = readPathFile(dotGit, "gitdir: ");
  if (
    !gitfileTarget ||
    resolveExistingPath(resolve(worktreePath, gitfileTarget)) !== gitDirectory
  ) {
    return "candidate_gitfile_mismatch";
  }

  const worktreeAdminRoot = resolveExistingPath(join(commonDirectory, "worktrees"));
  if (!worktreeAdminRoot || dirname(gitDirectory) !== worktreeAdminRoot) {
    return "candidate_git_directory_not_linked_layout";
  }

  const backReference = readPathFile(join(gitDirectory, "gitdir"));
  if (!backReference || resolveExistingPath(resolve(gitDirectory, backReference)) !== dotGit) {
    return "candidate_gitdir_backref_mismatch";
  }
  return undefined;
}

export async function verifyCandidateWorktreeIdentity({
  runGit,
  repoRoot,
  worktreePath,
  branchName,
}: {
  runGit: CandidateGitReader;
  repoRoot: string;
  worktreePath: string;
  branchName: string;
}): Promise<CandidateWorktreeIdentityResult> {
  const parentCommonResult = await runGit(repoRoot, ABSOLUTE_COMMON_DIRECTORY_ARGS);
  const parentCommonDirectory = parentCommonResult.ok
    ? resolveReportedGitPath(repoRoot, parentCommonResult.stdout)
    : undefined;
  if (!parentCommonDirectory) {
    return { ok: false, reason: "parent_common_directory_unverifiable" };
  }

  const candidateCommonResult = await runGit(worktreePath, ABSOLUTE_COMMON_DIRECTORY_ARGS);
  const candidateCommonDirectory = candidateCommonResult.ok
    ? resolveReportedGitPath(worktreePath, candidateCommonResult.stdout)
    : undefined;
  if (!candidateCommonDirectory) {
    return { ok: false, reason: "candidate_common_directory_unverifiable" };
  }
  if (candidateCommonDirectory !== parentCommonDirectory) {
    return { ok: false, reason: "common_directory_mismatch" };
  }

  const candidateGitResult = await runGit(worktreePath, ABSOLUTE_GIT_DIRECTORY_ARGS);
  const candidateGitDirectory = candidateGitResult.ok
    ? resolveReportedGitPath(worktreePath, candidateGitResult.stdout)
    : undefined;
  if (!candidateGitDirectory) {
    return { ok: false, reason: "candidate_git_directory_unverifiable" };
  }
  const linkedGitFailure = verifyLinkedGitDirectory(
    worktreePath,
    parentCommonDirectory,
    candidateGitDirectory,
  );
  if (linkedGitFailure) return { ok: false, reason: linkedGitFailure };

  const branchResult = await runGit(worktreePath, ["symbolic-ref", "--quiet", "--short", "HEAD"]);
  const actualBranch = branchResult.ok ? withoutOneFinalLineEnding(branchResult.stdout) : undefined;
  if (!actualBranch) return { ok: false, reason: "candidate_branch_unverifiable" };
  if (actualBranch !== branchName) return { ok: false, reason: "candidate_branch_mismatch" };

  const headResult = await runGit(worktreePath, ["rev-parse", "--verify", "HEAD^{commit}"]);
  const headOid = headResult.ok ? withoutOneFinalLineEnding(headResult.stdout) : undefined;
  if (!headOid || !HEAD_OID.test(headOid)) {
    return { ok: false, reason: "candidate_head_unverifiable" };
  }

  const listResult = await runGit(repoRoot, PORCELAIN_WORKTREE_LIST_ARGS);
  if (!listResult.ok) {
    return { ok: false, reason: "parent_worktree_list_unverifiable" };
  }
  const records = parseWorktreeList(listResult.stdout);
  if (!records) return { ok: false, reason: "parent_worktree_list_malformed" };
  const canonicalCandidatePath = resolveExistingPath(worktreePath);
  if (!canonicalCandidatePath) {
    return { ok: false, reason: "candidate_path_unverifiable" };
  }
  const matching = records.filter((record) => {
    const listedPath = record.get("worktree");
    return (
      typeof listedPath === "string" && resolveExistingPath(listedPath) === canonicalCandidatePath
    );
  });
  if (matching.length === 0) {
    return { ok: false, reason: "candidate_not_registered_by_parent" };
  }
  if (matching.length !== 1) {
    return { ok: false, reason: "candidate_worktree_record_ambiguous" };
  }
  const record = matching[0];
  if (
    !record ||
    record.has("bare") ||
    record.has("detached") ||
    record.has("prunable") ||
    record.get("HEAD") !== headOid ||
    record.get("branch") !== `refs/heads/${branchName}`
  ) {
    return { ok: false, reason: "candidate_worktree_record_mismatch" };
  }

  return {
    ok: true,
    commonDirectory: parentCommonDirectory,
    gitDirectory: candidateGitDirectory,
    headOid,
  };
}

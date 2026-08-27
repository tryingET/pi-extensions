// summary: prepares bounded candidate worktrees and projects lifecycle admission bindings for visible mutation peers.
// read_when:
//   - changing candidate branch/workspace naming, git preparation, admission release, or registry binding fields.

import { createHash } from "node:crypto";
import { existsSync, lstatSync, mkdirSync, realpathSync } from "node:fs";
import { join, resolve } from "node:path";
import {
  type CandidateAdmissionReservation,
  releaseCandidateAdmission,
} from "../src/candidatePeerAdmission.ts";
import type { CandidatePeerSafeNaming } from "../src/candidatePeerRegistry.ts";
import {
  type CandidateWorkspaceResolution,
  candidatePathIsInside,
  candidateWorkspacePollutionBlocker,
  resolveCandidateWorkspaceRoot,
} from "../src/candidateWorkspacePlacement.ts";
import type { CandidatePeerSpawnRequest } from "./sidequestContracts.ts";
import type { ExecRunner, LaunchResult } from "./sidequestGhostty.ts";
import { runGhosttyLaunch, summarizeLaunchFailure } from "./sidequestLaunchResult.ts";

export type WorktreePrepareSuccess = {
  ok: true;
  parentCwd: string;
  repoRoot: string;
  worktreePath: string;
  branchName: string;
  baseRef: string;
  parentDirty: boolean;
  parentDirtyWarning?: string;
  reusedExisting: boolean;
  naming: CandidatePeerSafeNaming;
};

export type WorktreePrepareFailure = {
  ok: false;
  error: string;
  parentCwd: string;
  repoRoot?: string;
  worktreePath?: string;
  branchName?: string;
  baseRef?: string;
  parentDirty?: boolean;
  parentDirtyWarning?: string;
  naming?: CandidatePeerSafeNaming;
};

export type WorktreePrepareResult = WorktreePrepareSuccess | WorktreePrepareFailure;

const MAX_CANDIDATE_BRANCH_NAME_LENGTH = 96;
const MAX_CANDIDATE_WORKSPACE_NAME_LENGTH = 80;
const SAFE_NAME_HASH_LENGTH = 10;

function slugify(value: string, fallback: string): string {
  const slug = value
    .toLowerCase()
    .replace(/[^a-z0-9._-]+/g, "-")
    .replace(/^[._-]+|[._-]+$/g, "")
    .replace(/-{2,}/g, "-");
  return slug || fallback;
}

function clampSafeName(value: string, maxLength: number, fallback: string): string {
  if (value.length <= maxLength) return value;
  const hash = createHash("sha1").update(value).digest("hex").slice(0, SAFE_NAME_HASH_LENGTH);
  const suffix = `-${hash}`;
  const prefixLength = Math.max(1, maxLength - suffix.length);
  const prefix = value.slice(0, prefixLength).replace(/[\\/._-]+$/g, "") || fallback;
  return `${prefix.slice(0, prefixLength)}${suffix}`;
}

function candidateBranchNameBeforeClamp(value: string | undefined, objective: string): string {
  const raw = value?.trim() || `candidatepeer/${slugify(objective, "candidate")}`;
  const segments = raw
    .split(/[\\/]+/)
    .map((segment) => slugify(segment, ""))
    .filter((segment) => segment && segment !== "." && segment !== "..");
  return segments.join("/") || `candidatepeer/${slugify(objective, "candidate")}`;
}

function sanitizeBranchName(value: string | undefined, objective: string): string {
  return clampSafeName(
    candidateBranchNameBeforeClamp(value, objective),
    MAX_CANDIDATE_BRANCH_NAME_LENGTH,
    "candidatepeer",
  );
}

function candidateWorkspaceNameBeforeClamp(value: string | undefined, branchName: string): string {
  return slugify(value?.trim() || branchName.replace(/[\\/]+/g, "-"), "candidate");
}

function sanitizeWorkspaceName(value: string | undefined, branchName: string): string {
  return clampSafeName(
    candidateWorkspaceNameBeforeClamp(value, branchName),
    MAX_CANDIDATE_WORKSPACE_NAME_LENGTH,
    "candidate",
  );
}

function candidateWorkspaceSymlinkBlocker(path: string): string | undefined {
  let existing = resolve(path);
  while (!existsSync(existing)) {
    const parent = resolve(existing, "..");
    if (parent === existing) break;
    existing = parent;
  }
  try {
    if (lstatSync(existing).isSymbolicLink() || realpathSync(existing) !== existing) {
      return `candidate workspace path has a symlinked existing ancestor: ${existing}`;
    }
  } catch (error) {
    return `candidate workspace path ancestor cannot be verified: ${error instanceof Error ? error.message : String(error)}`;
  }
  return undefined;
}

async function runGit(execRunner: ExecRunner, cwd: string, args: string[]): Promise<LaunchResult> {
  return runGhosttyLaunch(execRunner, "git", ["-C", cwd, ...args], cwd);
}

export async function resolveCandidateRepoRoot(
  execRunner: ExecRunner,
  parentCwd: string,
): Promise<{ ok: true; repoRoot: string } | { ok: false; error: string }> {
  const result = await runGit(execRunner, parentCwd, ["rev-parse", "--show-toplevel"]);
  if (!result.ok) {
    return { ok: false, error: `failed to locate git repo: ${summarizeLaunchFailure(result)}` };
  }
  return { ok: true, repoRoot: resolve(result.stdout.split(/\r?\n/)[0]?.trim() || parentCwd) };
}

export function admissionRegistryBinding(admission: CandidateAdmissionReservation) {
  return {
    admissionId: admission.admissionId,
    permitPath: admission.permitPath,
    reservationBytes: admission.permit.reservationBytes,
    inventoryDigest: admission.pressure.inventoryDigest,
  };
}

export function releasePreparationFailure(
  admission: CandidateAdmissionReservation,
  reason: string,
  env: NodeJS.ProcessEnv,
  release: typeof releaseCandidateAdmission = releaseCandidateAdmission,
): string | undefined {
  try {
    release(
      {
        admissionId: admission.admissionId,
        outcome: "preparation_failed",
        terminalReceiptRef: `candidate-preparation-failed:${createHash("sha256").update(reason).digest("hex")}`,
      },
      env,
    );
    return undefined;
  } catch (error) {
    return error instanceof Error ? error.message : String(error);
  }
}

export async function prepareCandidatePeerWorktree({
  execRunner,
  pathExists,
  env,
  request,
  parentCwd,
  objective,
  admittedRepoRoot,
}: {
  execRunner: ExecRunner;
  pathExists: (path: string) => boolean;
  env: NodeJS.ProcessEnv;
  request: CandidatePeerSpawnRequest;
  parentCwd: string;
  objective: string;
  admittedRepoRoot?: string;
}): Promise<WorktreePrepareResult> {
  const baseRef = request.baseRef?.trim() || "HEAD";
  let repoRoot: string;
  if (admittedRepoRoot) {
    repoRoot = resolve(admittedRepoRoot);
  } else {
    const repoResult = await runGit(execRunner, parentCwd, ["rev-parse", "--show-toplevel"]);
    if (!repoResult.ok) {
      return {
        ok: false,
        error: `failed to locate git repo: ${summarizeLaunchFailure(repoResult)}`,
        parentCwd,
        baseRef,
      };
    }
    repoRoot = resolve(repoResult.stdout.split(/\r?\n/)[0]?.trim() || parentCwd);
  }
  const requestedBranchName = request.branchName?.trim();
  const branchNameBeforeClamp = candidateBranchNameBeforeClamp(request.branchName, objective);
  const branchName = sanitizeBranchName(request.branchName, objective);
  const requestedWorkspaceName = request.workspaceName?.trim();
  const workspaceNameBeforeClamp = candidateWorkspaceNameBeforeClamp(
    request.workspaceName,
    branchName,
  );
  const workspaceName = sanitizeWorkspaceName(request.workspaceName, branchName);
  let workspaceResolution: CandidateWorkspaceResolution;
  try {
    workspaceResolution = resolveCandidateWorkspaceRoot({
      requestedWorkspaceRoot: request.workspaceRoot,
      parentCwd,
      repoRoot,
      env,
    });
  } catch (error) {
    return {
      ok: false,
      error: error instanceof Error ? error.message : String(error),
      parentCwd,
      repoRoot,
      branchName,
      baseRef,
    };
  }
  const { workspaceRoot } = workspaceResolution;
  const worktreePath = resolve(workspaceRoot, workspaceName);
  const naming: CandidatePeerSafeNaming = {
    ...(requestedBranchName ? { requestedBranchName } : {}),
    branchName,
    branchNameClamped: branchNameBeforeClamp.length > MAX_CANDIDATE_BRANCH_NAME_LENGTH,
    ...(requestedWorkspaceName ? { requestedWorkspaceName } : {}),
    workspaceName,
    workspaceNameClamped: workspaceNameBeforeClamp.length > MAX_CANDIDATE_WORKSPACE_NAME_LENGTH,
    workspaceRoot,
  };

  const workspaceSymlinkBlocker = candidateWorkspaceSymlinkBlocker(workspaceRoot);
  if (workspaceSymlinkBlocker) {
    return {
      ok: false,
      error: workspaceSymlinkBlocker,
      parentCwd,
      repoRoot,
      worktreePath,
      branchName,
      baseRef,
      naming,
    };
  }

  const pollutionBlocker = await candidateWorkspacePollutionBlocker({
    runGit: (cwd, args) => runGit(execRunner, cwd, args),
    workspaceRoot,
  });
  if (pollutionBlocker) {
    return {
      ok: false,
      error: pollutionBlocker,
      parentCwd,
      repoRoot,
      worktreePath,
      branchName,
      baseRef,
      naming,
    };
  }

  if (candidatePathIsInside(repoRoot, worktreePath) || worktreePath === repoRoot) {
    return {
      ok: false,
      error: "candidate peer worktree path must not be inside the parent checkout",
      parentCwd,
      repoRoot,
      worktreePath,
      branchName,
      baseRef,
      naming,
    };
  }

  const gitDir = join(repoRoot, ".git");
  if (candidatePathIsInside(gitDir, worktreePath) || worktreePath === gitDir) {
    return {
      ok: false,
      error: "candidate peer worktree path must not be inside .git",
      parentCwd,
      repoRoot,
      worktreePath,
      branchName,
      baseRef,
      naming,
    };
  }

  if (!candidatePathIsInside(workspaceRoot, worktreePath) && worktreePath !== workspaceRoot) {
    return {
      ok: false,
      error: "candidate peer worktree path escaped workspaceRoot",
      parentCwd,
      repoRoot,
      worktreePath,
      branchName,
      baseRef,
      naming,
    };
  }

  const dirtyResult = await runGit(execRunner, repoRoot, ["status", "--porcelain"]);
  if (!dirtyResult.ok) {
    return {
      ok: false,
      error: `failed to inspect parent dirty state: ${summarizeLaunchFailure(dirtyResult)}`,
      parentCwd,
      repoRoot,
      worktreePath,
      branchName,
      baseRef,
      naming,
    };
  }

  const parentDirty = Boolean(dirtyResult.stdout.trim());
  const parentDirtyWarning = parentDirty
    ? "Parent checkout has uncommitted changes; this worktree is based on the selected base ref and does not include them."
    : undefined;
  if (parentDirty && request.requireCleanParent) {
    return {
      ok: false,
      error: "parent checkout has uncommitted changes and requireCleanParent is true",
      parentCwd,
      repoRoot,
      worktreePath,
      branchName,
      baseRef,
      parentDirty,
      parentDirtyWarning,
      naming,
    };
  }

  if (pathExists(worktreePath)) {
    if (!request.reuseExisting) {
      return {
        ok: false,
        error:
          "candidate peer worktree path already exists; pass reuseExisting only for a verified intended worktree",
        parentCwd,
        repoRoot,
        worktreePath,
        branchName,
        baseRef,
        parentDirty,
        parentDirtyWarning,
        naming,
      };
    }

    const insideResult = await runGit(execRunner, worktreePath, [
      "rev-parse",
      "--is-inside-work-tree",
    ]);
    const topResult = await runGit(execRunner, worktreePath, ["rev-parse", "--show-toplevel"]);
    const branchResult = await runGit(execRunner, worktreePath, [
      "rev-parse",
      "--abbrev-ref",
      "HEAD",
    ]);
    if (
      !insideResult.ok ||
      insideResult.stdout.trim() !== "true" ||
      !topResult.ok ||
      resolve(topResult.stdout.trim()) !== worktreePath ||
      !branchResult.ok ||
      branchResult.stdout.trim() !== branchName
    ) {
      return {
        ok: false,
        error: "existing candidate peer path is not the requested verified git worktree",
        parentCwd,
        repoRoot,
        worktreePath,
        branchName,
        baseRef,
        parentDirty,
        parentDirtyWarning,
        naming,
      };
    }

    return {
      ok: true,
      parentCwd,
      repoRoot,
      worktreePath,
      branchName,
      baseRef,
      parentDirty,
      parentDirtyWarning,
      reusedExisting: true,
      naming,
    };
  }

  try {
    mkdirSync(workspaceRoot, { recursive: true });
  } catch (error) {
    return {
      ok: false,
      error: `failed to create workspaceRoot: ${error instanceof Error ? error.message : String(error)}`,
      parentCwd,
      repoRoot,
      worktreePath,
      branchName,
      baseRef,
      parentDirty,
      parentDirtyWarning,
      naming,
    };
  }

  const createdWorkspaceBlocker = candidateWorkspaceSymlinkBlocker(workspaceRoot);
  if (createdWorkspaceBlocker) {
    return {
      ok: false,
      error: createdWorkspaceBlocker,
      parentCwd,
      repoRoot,
      worktreePath,
      branchName,
      baseRef,
      parentDirty,
      parentDirtyWarning,
      naming,
    };
  }

  const addResult = await runGit(execRunner, repoRoot, [
    "worktree",
    "add",
    worktreePath,
    "-b",
    branchName,
    baseRef,
  ]);
  if (!addResult.ok) {
    return {
      ok: false,
      error: `failed to create git worktree: ${summarizeLaunchFailure(addResult)}`,
      parentCwd,
      repoRoot,
      worktreePath,
      branchName,
      baseRef,
      parentDirty,
      parentDirtyWarning,
      naming,
    };
  }

  return {
    ok: true,
    parentCwd,
    repoRoot,
    worktreePath,
    branchName,
    baseRef,
    parentDirty,
    parentDirtyWarning,
    reusedExisting: false,
    naming,
  };
}

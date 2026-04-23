import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { execFileText, isBoundaryFailure } from "./boundaries.ts";
import type { WorkflowWorktreeSummary } from "./workflow.ts";

export interface WorkflowWorktreeTask {
  agent: string;
  cwd?: string;
}

export interface WorkflowWorktreeSetup {
  repoRoot: string;
  baseCommit: string;
  worktrees: WorkflowWorktreeInfo[];
}

export interface WorkflowWorktreeInfo {
  path: string;
  agentCwd: string;
  branch: string;
  index: number;
  nodeModulesLinked: boolean;
  syntheticPaths: string[];
}

export interface WorkflowWorktreeDiff {
  index: number;
  agent: string;
  branch: string;
  diffStat: string;
  filesChanged: number;
  insertions: number;
  deletions: number;
  patchPath: string;
}

export interface WorkflowWorktreeTaskCwdConflict {
  index: number;
  agent: string;
  cwd: string;
}

interface RepoState {
  repoRoot: string;
  cwdRelative: string;
  baseCommit: string;
}

function runGit(cwd: string, args: string[]): string {
  const result = execFileText("git", ["-C", cwd, ...args]);
  if (isBoundaryFailure(result)) {
    throw new Error(result.stderr?.trim() || result.stdout?.trim() || result.error);
  }
  return result.value;
}

function resolveRepoState(cwd: string): RepoState {
  const repoCheck = runGit(cwd, ["rev-parse", "--is-inside-work-tree"]).trim();
  if (repoCheck !== "true") {
    throw new Error("worktree isolation requires a git repository");
  }

  const repoRoot = runGit(cwd, ["rev-parse", "--show-toplevel"]).trim();
  const rawPrefix = runGit(cwd, ["rev-parse", "--show-prefix"]).trim();
  const cwdRelative = rawPrefix ? path.normalize(rawPrefix.replace(/[\\/]+$/, "")) : "";
  const status = runGit(repoRoot, ["status", "--porcelain"]);
  if (status.trim().length > 0) {
    throw new Error(
      "worktree isolation requires a clean git working tree. Commit or stash changes first.",
    );
  }

  return {
    repoRoot,
    cwdRelative: cwdRelative === "." ? "" : cwdRelative,
    baseCommit: runGit(repoRoot, ["rev-parse", "HEAD"]).trim(),
  };
}

function normalizeComparableCwd(cwd: string): string {
  const resolved = path.resolve(cwd);
  try {
    return fs.realpathSync(resolved);
  } catch {
    return resolved;
  }
}

export function findWorkflowWorktreeTaskCwdConflict(
  tasks: ReadonlyArray<WorkflowWorktreeTask>,
  sharedCwd: string,
): WorkflowWorktreeTaskCwdConflict | undefined {
  const normalizedSharedCwd = normalizeComparableCwd(sharedCwd);

  for (let index = 0; index < tasks.length; index += 1) {
    const task = tasks[index];
    if (!task?.cwd) {
      continue;
    }

    const taskCwd = path.isAbsolute(task.cwd) ? task.cwd : path.resolve(sharedCwd, task.cwd);
    if (normalizeComparableCwd(taskCwd) === normalizedSharedCwd) {
      continue;
    }

    return {
      index,
      agent: task.agent,
      cwd: task.cwd,
    };
  }

  return undefined;
}

export function formatWorkflowWorktreeTaskCwdConflict(
  conflict: WorkflowWorktreeTaskCwdConflict,
  sharedCwd: string,
): string {
  return `worktree isolation uses the shared cwd (${sharedCwd}); task ${conflict.index + 1} (${conflict.agent}) sets cwd to ${conflict.cwd}. Remove task-level cwd overrides or disable worktree.`;
}

function buildWorktreeBranch(runId: string, index: number): string {
  return `pi-orch-worktree-${runId}-${index}`;
}

function buildWorktreePath(runId: string, index: number): string {
  return path.join(os.tmpdir(), `pi-orch-worktree-${runId}-${index}`);
}

function linkNodeModulesIfPresent(repoRoot: string, worktreePath: string): boolean {
  const sourcePath = path.join(repoRoot, "node_modules");
  const linkPath = path.join(worktreePath, "node_modules");
  if (!fs.existsSync(sourcePath) || fs.existsSync(linkPath)) {
    return false;
  }

  try {
    fs.symlinkSync(sourcePath, linkPath);
    return true;
  } catch {
    return false;
  }
}

function createSingleWorkflowWorktree(input: {
  repoRoot: string;
  cwdRelative: string;
  runId: string;
  index: number;
  agent: string;
}): WorkflowWorktreeInfo {
  const branch = buildWorktreeBranch(input.runId, input.index);
  const worktreePath = buildWorktreePath(input.runId, input.index);
  runGit(input.repoRoot, ["worktree", "add", worktreePath, "-b", branch, "HEAD"]);

  const agentCwd = input.cwdRelative ? path.join(worktreePath, input.cwdRelative) : worktreePath;

  try {
    const nodeModulesLinked = linkNodeModulesIfPresent(input.repoRoot, worktreePath);
    return {
      path: worktreePath,
      agentCwd,
      branch,
      index: input.index,
      nodeModulesLinked,
      syntheticPaths: nodeModulesLinked ? ["node_modules"] : [],
    };
  } catch (error) {
    try {
      runGit(input.repoRoot, ["worktree", "remove", "--force", worktreePath]);
    } catch {
      // Best-effort rollback.
    }
    try {
      runGit(input.repoRoot, ["branch", "-D", branch]);
    } catch {
      // Best-effort rollback.
    }
    throw error;
  }
}

export function createWorkflowWorktrees(params: {
  cwd: string;
  runId: string;
  tasks: ReadonlyArray<WorkflowWorktreeTask>;
}): WorkflowWorktreeSetup {
  const repo = resolveRepoState(params.cwd);
  const worktrees: WorkflowWorktreeInfo[] = [];

  try {
    params.tasks.forEach((task, index) => {
      worktrees.push(
        createSingleWorkflowWorktree({
          repoRoot: repo.repoRoot,
          cwdRelative: repo.cwdRelative,
          runId: params.runId,
          index,
          agent: task.agent,
        }),
      );
    });
  } catch (error) {
    cleanupWorkflowWorktrees({
      repoRoot: repo.repoRoot,
      baseCommit: repo.baseCommit,
      worktrees,
    });
    throw error;
  }

  return {
    repoRoot: repo.repoRoot,
    baseCommit: repo.baseCommit,
    worktrees,
  };
}

function removeSyntheticPath(worktree: WorkflowWorktreeInfo, syntheticPath: string): void {
  const resolved = path.resolve(worktree.path, syntheticPath);
  const relative = path.relative(worktree.path, resolved);
  if (
    !relative ||
    relative === "." ||
    relative === ".." ||
    relative.startsWith(`..${path.sep}`) ||
    path.isAbsolute(relative)
  ) {
    return;
  }

  try {
    const stat = fs.lstatSync(resolved);
    if (stat.isSymbolicLink()) {
      fs.unlinkSync(resolved);
      return;
    }
    if (stat.isDirectory()) {
      fs.rmSync(resolved, { recursive: true, force: true });
      return;
    }
    fs.rmSync(resolved, { force: true });
  } catch (error) {
    const code =
      error && typeof error === "object" && "code" in error
        ? (error as { code?: unknown }).code
        : undefined;
    if (code !== "ENOENT") {
      throw error;
    }
  }
}

function removeSyntheticPathsBeforeDiff(worktree: WorkflowWorktreeInfo): void {
  const seen = new Set<string>();
  for (const syntheticPath of worktree.syntheticPaths) {
    if (seen.has(syntheticPath)) {
      continue;
    }
    seen.add(syntheticPath);
    removeSyntheticPath(worktree, syntheticPath);
  }
}

function parseNumstat(numstat: string): {
  filesChanged: number;
  insertions: number;
  deletions: number;
} {
  let filesChanged = 0;
  let insertions = 0;
  let deletions = 0;

  numstat
    .split("\n")
    .map((line) => line.trim())
    .filter(Boolean)
    .forEach((line) => {
      const [rawInsertions, rawDeletions] = line.split("\t");
      if (rawInsertions === undefined || rawDeletions === undefined) {
        return;
      }
      filesChanged += 1;
      if (/^\d+$/.test(rawInsertions)) {
        insertions += Number.parseInt(rawInsertions, 10);
      }
      if (/^\d+$/.test(rawDeletions)) {
        deletions += Number.parseInt(rawDeletions, 10);
      }
    });

  return { filesChanged, insertions, deletions };
}

function emptyDiff(
  worktree: WorkflowWorktreeInfo,
  agent: string,
  patchPath: string,
): WorkflowWorktreeDiff {
  return {
    index: worktree.index,
    agent,
    branch: worktree.branch,
    diffStat: "",
    filesChanged: 0,
    insertions: 0,
    deletions: 0,
    patchPath,
  };
}

function captureSingleWorktreeDiff(input: {
  setup: WorkflowWorktreeSetup;
  worktree: WorkflowWorktreeInfo;
  agent: string;
  patchPath: string;
}): WorkflowWorktreeDiff {
  removeSyntheticPathsBeforeDiff(input.worktree);
  runGit(input.worktree.path, ["add", "-A"]);

  const diffStat = runGit(input.worktree.path, [
    "diff",
    "--cached",
    "--stat",
    input.setup.baseCommit,
  ]).trim();
  const patch = runGit(input.worktree.path, ["diff", "--cached", input.setup.baseCommit]);
  const numstat = runGit(input.worktree.path, [
    "diff",
    "--cached",
    "--numstat",
    input.setup.baseCommit,
  ]);
  fs.writeFileSync(input.patchPath, patch, "utf-8");

  if (!patch.trim()) {
    return emptyDiff(input.worktree, input.agent, input.patchPath);
  }

  const parsed = parseNumstat(numstat);
  return {
    index: input.worktree.index,
    agent: input.agent,
    branch: input.worktree.branch,
    diffStat,
    filesChanged: parsed.filesChanged,
    insertions: parsed.insertions,
    deletions: parsed.deletions,
    patchPath: input.patchPath,
  };
}

function writeEmptyPatch(patchPath: string): void {
  try {
    fs.writeFileSync(patchPath, "", "utf-8");
  } catch {
    // Best-effort artifact capture.
  }
}

function hasWorktreeChanges(diff: WorkflowWorktreeDiff): boolean {
  return (
    diff.filesChanged > 0 ||
    diff.insertions > 0 ||
    diff.deletions > 0 ||
    diff.diffStat.trim().length > 0
  );
}

function safePatchAgentName(agent: string): string {
  return agent.replace(/[^\w.-]/g, "_");
}

export function diffWorkflowWorktrees(params: {
  setup: WorkflowWorktreeSetup;
  agents: string[];
  patchDir: string;
}): WorkflowWorktreeDiff[] {
  try {
    fs.mkdirSync(params.patchDir, { recursive: true });
  } catch {
    return [];
  }

  const diffs: WorkflowWorktreeDiff[] = [];
  params.setup.worktrees.forEach((worktree, index) => {
    const agent = params.agents[index] ?? `task-${index + 1}`;
    const patchPath = path.join(
      params.patchDir,
      `task-${index}-${safePatchAgentName(agent)}.patch`,
    );

    try {
      diffs.push(
        captureSingleWorktreeDiff({
          setup: params.setup,
          worktree,
          agent,
          patchPath,
        }),
      );
    } catch {
      writeEmptyPatch(patchPath);
      diffs.push(emptyDiff(worktree, agent, patchPath));
    }
  });

  return diffs;
}

export function formatWorkflowWorktreeDiffSummary(diffs: WorkflowWorktreeDiff[]): string {
  const changedDiffs = diffs.filter(hasWorktreeChanges);
  if (changedDiffs.length === 0) {
    return "";
  }

  const lines = ["Worktree changes:"];
  changedDiffs.forEach((diff) => {
    lines.push(
      `- Task ${diff.index + 1} (${diff.agent}): ${diff.filesChanged} files changed, +${diff.insertions} -${diff.deletions}`,
    );
    if (diff.diffStat.trim().length > 0) {
      diff.diffStat.split("\n").forEach((line) => {
        if (line.trim().length > 0) {
          lines.push(`  ${line}`);
        }
      });
    }
  });
  lines.push(`- Full patches: ${path.dirname(changedDiffs[0].patchPath)}`);

  return lines.join("\n");
}

export function buildWorkflowWorktreeSummary(params: {
  setup: WorkflowWorktreeSetup;
  agents: string[];
  patchDir: string;
}): WorkflowWorktreeSummary {
  const diffs = diffWorkflowWorktrees(params);
  return {
    changedTasks: diffs.filter(hasWorktreeChanges).length,
    ...(diffs.length > 0 ? { patchDir: params.patchDir } : {}),
    diffSummaryText: formatWorkflowWorktreeDiffSummary(diffs),
  };
}

export function cleanupWorkflowWorktrees(setup: WorkflowWorktreeSetup): void {
  for (let index = setup.worktrees.length - 1; index >= 0; index -= 1) {
    const worktree = setup.worktrees[index];
    if (!worktree) {
      continue;
    }

    try {
      runGit(setup.repoRoot, ["worktree", "remove", "--force", worktree.path]);
    } catch {
      // Best-effort cleanup.
    }
    try {
      runGit(setup.repoRoot, ["branch", "-D", worktree.branch]);
    } catch {
      // Best-effort cleanup.
    }
  }

  try {
    runGit(setup.repoRoot, ["worktree", "prune"]);
  } catch {
    // Best-effort cleanup.
  }
}

import { mkdirSync, renameSync, writeFileSync } from "node:fs";
import { homedir } from "node:os";
import { dirname, join, resolve } from "node:path";

export type CandidatePeerReportBack = "intercom" | "manual" | "none";
export type CandidatePeerLaunchStatus = "launched" | "launch_failed";

export type CandidatePeerCommandPacketCommand = {
  id: string;
  description: string;
  command: string;
  args: string[];
  cwd?: string;
  destructive: boolean;
};

export type CandidatePeerCommandPacket = {
  packetVersion: 1;
  peerRunId: string;
  generatedAt: string;
  archiveDir: string;
  registryPath: string;
  manualPreconditions: string[];
  commands: CandidatePeerCommandPacketCommand[];
};

export type CandidatePeerSafeNaming = {
  requestedBranchName?: string;
  branchName: string;
  branchNameClamped: boolean;
  requestedWorkspaceName?: string;
  workspaceName: string;
  workspaceNameClamped: boolean;
  workspaceRoot: string;
};

export type CandidatePeerRegistryInput = {
  peerRunId: string;
  tool: string;
  canonicalTool: string;
  parentCwd: string;
  repoRoot: string;
  worktreePath: string;
  branchName: string;
  baseRef: string;
  parentDirty: boolean;
  parentDirtyWarning?: string;
  reusedExisting: boolean;
  naming?: CandidatePeerSafeNaming;
  reportBack: CandidatePeerReportBack;
  parentPeerTarget?: string;
  filesInScope?: string[];
  offLimits?: string[];
  constraints?: string[];
  dod?: string[];
  launch: {
    status: CandidatePeerLaunchStatus;
    launchMode?: string;
    sessionMode?: string;
    cwd?: string;
    sourceSessionFile?: string;
    titleBase?: string;
    promptSummary?: string;
    launchNote?: string;
    failure?: string;
  };
  controllerSession?: {
    id?: string;
    name?: string;
    cwd?: string;
    sessionFile?: string;
  };
  processHints?: {
    controllerPid?: number;
  };
};

export type CandidatePeerRegistryRecord = CandidatePeerRegistryInput & {
  schemaVersion: 1;
  createdAt: string;
  updatedAt: string;
  registryPath: string;
  archiveDir: string;
  cleanupPacket: CandidatePeerCommandPacket;
};

function assertSafePeerRunId(peerRunId: string): string {
  if (!/^[a-z0-9._-]+$/i.test(peerRunId)) {
    throw new Error("peerRunId must be a path-safe identifier");
  }
  return peerRunId;
}

export function getCandidatePeerRegistryDir(env: NodeJS.ProcessEnv = process.env): string {
  const stateHome = env.XDG_STATE_HOME?.trim() || join(homedir(), ".local", "state");
  return join(stateHome, "pi-quests", "peer-registry");
}

export function getCandidatePeerArchiveDir(
  peerRunId: string,
  env: NodeJS.ProcessEnv = process.env,
): string {
  const stateHome = env.XDG_STATE_HOME?.trim() || join(homedir(), ".local", "state");
  return join(stateHome, "pi-quests", "archives", assertSafePeerRunId(peerRunId));
}

export function getCandidatePeerRegistryPath(
  peerRunId: string,
  env: NodeJS.ProcessEnv = process.env,
): string {
  return join(getCandidatePeerRegistryDir(env), `${assertSafePeerRunId(peerRunId)}.json`);
}

export function buildCandidatePeerCleanupPacket({
  peerRunId,
  repoRoot,
  worktreePath,
  branchName,
  registryPath,
  archiveDir,
  generatedAt = new Date().toISOString(),
}: {
  peerRunId: string;
  repoRoot: string;
  worktreePath: string;
  branchName: string;
  registryPath: string;
  archiveDir: string;
  generatedAt?: string;
}): CandidatePeerCommandPacket {
  return {
    packetVersion: 1,
    peerRunId,
    generatedAt,
    archiveDir,
    registryPath,
    manualPreconditions: [
      "Inspect the visible peer final report and candidate diff before cleanup.",
      "Do not run cleanup while the visible candidate peer is still editing the worktree.",
      "Archive commands must complete successfully before destructive cleanup commands.",
      "Verify repoRoot, worktreePath, and branchName exactly match the reviewed candidate lane.",
      "This packet does not kill processes, remove arbitrary directories, merge, push, open PRs, or mutate AK/KES/Oracle/Prompt Vault/ROCS.",
    ],
    commands: [
      {
        id: "archive-metadata-and-diff",
        description:
          "Create a deterministic archive directory containing registry metadata, git status, and binary-safe unstaged/staged diffs.",
        command: "sh",
        args: [
          "-c",
          [
            "set -eu",
            "archive_dir=$1",
            "registry_path=$2",
            "worktree_path=$3",
            "repo_root=$4",
            "branch_name=$5",
            'mkdir -p "$archive_dir"',
            'cp "$registry_path" "$archive_dir/metadata.json"',
            'test "$(git -C "$worktree_path" rev-parse --show-toplevel)" = "$worktree_path"',
            'test "$(git -C "$worktree_path" rev-parse --abbrev-ref HEAD)" = "$branch_name"',
            'git -C "$repo_root" show-ref --verify --quiet "refs/heads/$branch_name"',
            'git -C "$worktree_path" status --porcelain=v1 --branch > "$archive_dir/status.txt"',
            'git -C "$worktree_path" diff --binary > "$archive_dir/diff.patch"',
            'git -C "$worktree_path" diff --cached --binary > "$archive_dir/staged.diff.patch"',
            'git -C "$repo_root" rev-parse "$branch_name" > "$archive_dir/head.txt"',
            'git -C "$repo_root" bundle create "$archive_dir/branch.bundle" "$branch_name"',
          ].join("; "),
          "candidate-peer-archive",
          archiveDir,
          registryPath,
          worktreePath,
          repoRoot,
          branchName,
        ],
        cwd: repoRoot,
        destructive: false,
      },
      {
        id: "remove-worktree",
        description:
          "Remove only the exact git worktree recorded for this peer after archive evidence exists.",
        command: "git",
        args: ["-C", repoRoot, "worktree", "remove", "--force", worktreePath],
        cwd: repoRoot,
        destructive: true,
      },
      {
        id: "delete-candidate-branch",
        description:
          "Delete only the exact candidate branch recorded for this peer after worktree removal.",
        command: "git",
        args: ["-C", repoRoot, "branch", "-D", branchName],
        cwd: repoRoot,
        destructive: true,
      },
    ],
  };
}

export function createCandidatePeerRegistryRecord(
  input: CandidatePeerRegistryInput,
  env: NodeJS.ProcessEnv = process.env,
  now = new Date().toISOString(),
): CandidatePeerRegistryRecord {
  const registryPath = getCandidatePeerRegistryPath(input.peerRunId, env);
  const archiveDir = getCandidatePeerArchiveDir(input.peerRunId, env);
  const cleanupPacket = buildCandidatePeerCleanupPacket({
    peerRunId: input.peerRunId,
    repoRoot: input.repoRoot,
    worktreePath: input.worktreePath,
    branchName: input.branchName,
    registryPath,
    archiveDir,
    generatedAt: now,
  });

  return {
    schemaVersion: 1,
    createdAt: now,
    updatedAt: now,
    ...input,
    registryPath,
    archiveDir,
    cleanupPacket,
  };
}

export function writeCandidatePeerRegistryRecord(record: CandidatePeerRegistryRecord): string {
  const registryPath = resolve(record.registryPath);
  mkdirSync(dirname(registryPath), { recursive: true });
  const tempPath = `${registryPath}.${process.pid}.${Date.now()}.tmp`;
  writeFileSync(tempPath, `${JSON.stringify(record, null, 2)}\n`, { mode: 0o600 });
  renameSync(tempPath, registryPath);
  return registryPath;
}

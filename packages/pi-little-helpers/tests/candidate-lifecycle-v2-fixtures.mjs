import { execFileSync } from "node:child_process";
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";

export function git(cwd, ...args) {
  return execFileSync("git", ["-C", cwd, ...args], { encoding: "utf8" }).trim();
}

export function withTempDir(fn) {
  const dir = mkdtempSync(`${tmpdir()}/candidate-lifecycle-v2-`);
  return Promise.resolve(fn(dir)).finally(() => rmSync(dir, { recursive: true, force: true }));
}

export function registryRecord({
  peerRunId,
  repoRoot,
  worktreePath,
  branchName = "candidate/test",
  createdAt = "2026-07-13T00:00:00Z",
}) {
  return {
    schemaVersion: 1,
    peerRunId,
    tool: "candidate_peer_spawn",
    canonicalTool: "candidate_peer_spawn",
    parentCwd: repoRoot,
    repoRoot,
    worktreePath,
    branchName,
    baseRef: "HEAD",
    parentDirty: false,
    reusedExisting: false,
    reportBack: "intercom",
    launch: { status: "launched" },
    createdAt,
    updatedAt: createdAt,
    registryPath: "unused",
    archiveDir: "unused",
    cleanupPacket: {
      packetVersion: 1,
      peerRunId,
      generatedAt: createdAt,
      archiveDir: "unused",
      registryPath: "unused",
      manualPreconditions: [],
      commands: [],
    },
  };
}

export function writeRegistry(registryDir, record) {
  mkdirSync(registryDir, { recursive: true });
  writeFileSync(`${registryDir}/${record.peerRunId}.json`, `${JSON.stringify(record)}\n`);
}

export function adoptionInput(repoRoot, worktreePath, overrides = {}) {
  return {
    schemaVersion: 2,
    action: "adopt_existing_worktree",
    worktreePath,
    repoRoot,
    gitCommonDir: git(worktreePath, "rev-parse", "--path-format=absolute", "--git-common-dir"),
    branchName: git(worktreePath, "symbolic-ref", "--short", "HEAD"),
    headOid: git(worktreePath, "rev-parse", "HEAD"),
    actor: "owner:test",
    rationale: "bring this pre-existing verified candidate under lifecycle-v2 control",
    expiresAt: new Date(Date.now() + 60_000).toISOString(),
    ...overrides,
  };
}

export function setupLinkedWorktree(root) {
  const repoRoot = `${root}/owner`;
  const worktreePath = `${root}/candidate`;
  mkdirSync(repoRoot);
  execFileSync("git", ["init", "-b", "main", repoRoot]);
  git(repoRoot, "config", "user.email", "candidate@example.test");
  git(repoRoot, "config", "user.name", "Candidate Test");
  writeFileSync(`${repoRoot}/tracked.txt`, "base\n");
  git(repoRoot, "add", "tracked.txt");
  git(repoRoot, "commit", "-m", "base");
  git(repoRoot, "worktree", "add", "-b", "candidate/test", worktreePath, "HEAD");
  return { repoRoot, worktreePath };
}

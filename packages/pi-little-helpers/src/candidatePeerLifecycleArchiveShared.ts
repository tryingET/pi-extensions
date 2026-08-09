import { execFileSync, spawnSync } from "node:child_process";
import { createHash } from "node:crypto";
import {
  chmodSync,
  lstatSync,
  readdirSync,
  readFileSync,
  readlinkSync,
  realpathSync,
  writeFileSync,
} from "node:fs";
import { join, relative, resolve, sep } from "node:path";
import type { CandidateCleanupEffect } from "./candidatePeerLifecycleArchiveTypes.ts";
import type { CandidateLifecycleRecord } from "./candidatePeerLifecycleV2.ts";
import { stableJson } from "./candidatePeerLifecycleV2.ts";

export const REQUIRED_CLEANUP_EFFECTS: CandidateCleanupEffect[] = [
  "delete_branch",
  "remove_worktree",
];

export function sha256(value: string | Buffer): string {
  return createHash("sha256").update(value).digest("hex");
}

export function canonicalTimestamp(value: string, label: string): number {
  if (!/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/.test(value)) {
    throw new Error(`${label} must be a canonical UTC timestamp`);
  }
  const timestamp = Date.parse(value);
  if (!Number.isFinite(timestamp) || new Date(timestamp).toISOString() !== value) {
    throw new Error(`${label} must be a real canonical UTC timestamp`);
  }
  return timestamp;
}

export function exactCleanupEffects(effects: CandidateCleanupEffect[]): CandidateCleanupEffect[] {
  const normalized = [...new Set(effects)].sort();
  if (stableJson(normalized) !== stableJson(REQUIRED_CLEANUP_EFFECTS)) {
    throw new Error("cleanup authorization requires exactly remove_worktree and delete_branch");
  }
  return normalized;
}

export function run(
  command: string,
  args: string[],
  options: { cwd?: string; encoding?: BufferEncoding | null } = {},
): string | Buffer {
  return execFileSync(command, args, {
    cwd: options.cwd,
    encoding: options.encoding === null ? null : (options.encoding ?? "utf8"),
    maxBuffer: 1024 * 1024 * 1024,
  }) as string | Buffer;
}

export function writePrivate(path: string, value: string | Buffer): void {
  writeFileSync(path, value, { mode: 0o600, flag: "wx" });
}

export function fileManifest(root: string): Record<string, string> {
  const result: Record<string, string> = {};
  const stack = [root];
  while (stack.length > 0) {
    const current = stack.pop() as string;
    for (const entry of readdirSync(current, { withFileTypes: true }).sort((a, b) =>
      a.name.localeCompare(b.name),
    )) {
      const full = join(current, entry.name);
      const rel = relative(root, full);
      if (rel === "COMPLETE" || rel === "manifest.json") continue;
      if (entry.isDirectory() && !entry.isSymbolicLink()) stack.push(full);
      else if (entry.isSymbolicLink()) result[rel] = sha256(`symlink:${readlinkSync(full)}`);
      else result[rel] = sha256(readFileSync(full));
    }
  }
  return Object.fromEntries(Object.entries(result).sort(([a], [b]) => a.localeCompare(b)));
}

export function assertPrivateTree(root: string): void {
  const stack = [root];
  while (stack.length > 0) {
    const current = stack.pop() as string;
    const info = lstatSync(current);
    if (info.isDirectory()) {
      if ((info.mode & 0o077) !== 0) {
        throw new Error(`archive directory permissions are not owner-only: ${current}`);
      }
      for (const entry of readdirSync(current)) stack.push(join(current, entry));
    } else if ((info.mode & 0o077) !== 0) {
      throw new Error(`archive file permissions are not owner-only: ${current}`);
    }
  }
}

export function makePrivateTree(root: string): void {
  const stack = [root];
  while (stack.length > 0) {
    const current = stack.pop() as string;
    const info = lstatSync(current);
    if (info.isDirectory()) {
      chmodSync(current, 0o700);
      for (const entry of readdirSync(current)) stack.push(join(current, entry));
    } else if (!info.isSymbolicLink()) {
      chmodSync(current, 0o600);
    }
  }
}

export function activeProcessPids(worktreePath: string): number[] {
  const pids: number[] = [];
  for (const entry of readdirSync("/proc").filter((name) => /^\d+$/.test(name))) {
    const pid = Number(entry);
    if (pid === process.pid) continue;
    try {
      const cwd = realpathSync(`/proc/${entry}/cwd`);
      const command = readFileSync(`/proc/${entry}/cmdline`, "utf8").replaceAll("\0", " ");
      if (
        cwd === worktreePath ||
        cwd.startsWith(`${worktreePath}/`) ||
        command.includes(worktreePath)
      ) {
        pids.push(pid);
      }
    } catch {
      // Vanished or inaccessible processes are not positive activity evidence.
    }
  }
  return pids.sort((a, b) => a - b);
}

export function verifyPublishedArchive(
  record: CandidateLifecycleRecord,
  archiveDir = record.archive?.archiveDir,
): void {
  if (!record.archive || !archiveDir) throw new Error("missing archive receipt");
  const completePath = join(archiveDir, "COMPLETE");
  const complete = JSON.parse(readFileSync(completePath, "utf8")) as { archiveDigest?: string };
  if (complete.archiveDigest !== record.archive.archiveDigest) {
    throw new Error("published archive COMPLETE digest mismatch");
  }
  const expected = JSON.parse(readFileSync(join(archiveDir, "manifest.json"), "utf8")) as Record<
    string,
    string
  >;
  const actual = fileManifest(archiveDir);
  if (stableJson(expected) !== stableJson(actual)) {
    throw new Error("published archive object hash mismatch");
  }
  assertPrivateTree(archiveDir);
}

const GIT_OID = /^(?:[0-9a-f]{40}|[0-9a-f]{64})$/;

function branchLookupFailure(ref: string, detail: string, stderr = ""): Error {
  const suffix = stderr.trim() ? `: ${stderr.trim()}` : "";
  return new Error(`candidate exact branch lookup failed for ${ref} (${detail})${suffix}`);
}

function exactBranchRef(branchName: string): string {
  const ref = `refs/heads/${branchName}`;
  if (
    !branchName ||
    branchName.includes("\0") ||
    branchName.includes("\n") ||
    branchName.includes("\r")
  ) {
    throw branchLookupFailure(ref, "invalid exact branch name");
  }
  return ref;
}

function exactLooseBranchRefExists(repoRoot: string, ref: string): boolean {
  const commonDirProbe = spawnSync("git", ["-C", repoRoot, "rev-parse", "--git-common-dir"], {
    encoding: "utf8",
    maxBuffer: 1024 * 1024,
  });
  if (commonDirProbe.error) throw branchLookupFailure(ref, String(commonDirProbe.error));
  if (commonDirProbe.signal || commonDirProbe.status === null) {
    throw branchLookupFailure(
      ref,
      `git common-dir lookup terminated by ${commonDirProbe.signal ?? "unknown signal"}`,
    );
  }
  const commonDirRaw = commonDirProbe.stdout.trim();
  if (
    commonDirProbe.status !== 0 ||
    commonDirProbe.stderr !== "" ||
    !commonDirRaw ||
    commonDirRaw.includes("\0") ||
    commonDirRaw.includes("\n")
  ) {
    throw branchLookupFailure(
      ref,
      `git common-dir lookup exited ${commonDirProbe.status}`,
      commonDirProbe.stderr,
    );
  }

  let commonDir: string;
  try {
    commonDir = realpathSync(resolve(repoRoot, commonDirRaw));
  } catch (error) {
    throw branchLookupFailure(ref, `git common-dir resolution failed: ${String(error)}`);
  }
  const headsDir = resolve(commonDir, "refs", "heads");
  const looseRefPath = resolve(commonDir, ref);
  if (looseRefPath === headsDir || !looseRefPath.startsWith(`${headsDir}${sep}`)) {
    throw branchLookupFailure(ref, "exact loose ref path escapes refs/heads");
  }

  const components = relative(commonDir, looseRefPath).split(sep);
  let current = commonDir;
  for (const [index, component] of components.entries()) {
    current = join(current, component);
    try {
      const info = lstatSync(current);
      if (info.isSymbolicLink()) {
        throw branchLookupFailure(ref, `exact loose ref traverses a symlink: ${current}`);
      }
      if (index < components.length - 1 && !info.isDirectory()) {
        throw branchLookupFailure(ref, `exact loose ref parent is not a directory: ${current}`);
      }
      if (index === components.length - 1) {
        if (!info.isFile()) {
          throw branchLookupFailure(ref, `exact loose ref is not a regular file: ${current}`);
        }
        return true;
      }
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code === "ENOENT") return false;
      if (
        error instanceof Error &&
        error.message.startsWith("candidate exact branch lookup failed")
      ) {
        throw error;
      }
      throw branchLookupFailure(ref, `exact loose ref lookup failed: ${String(error)}`);
    }
  }
  return false;
}

function probeExactBranchOid(repoRoot: string, ref: string): string | undefined {
  const presence = spawnSync(
    "git",
    ["-C", repoRoot, "show-ref", "--verify", "--quiet", "--", ref],
    { encoding: "utf8", maxBuffer: 1024 * 1024 },
  );
  if (presence.error) throw branchLookupFailure(ref, String(presence.error));
  if (presence.signal || presence.status === null) {
    throw branchLookupFailure(ref, `git terminated by ${presence.signal ?? "unknown signal"}`);
  }
  if (presence.status === 1 && presence.stdout === "" && presence.stderr === "") return undefined;
  if (presence.status !== 0 || presence.stdout !== "" || presence.stderr !== "") {
    throw branchLookupFailure(ref, `git exited ${presence.status}`, presence.stderr);
  }

  const resolved = spawnSync("git", ["-C", repoRoot, "show-ref", "--verify", "--hash", "--", ref], {
    encoding: "utf8",
    maxBuffer: 1024 * 1024,
  });
  if (resolved.error) throw branchLookupFailure(ref, String(resolved.error));
  if (resolved.signal || resolved.status === null) {
    throw branchLookupFailure(ref, `git terminated by ${resolved.signal ?? "unknown signal"}`);
  }
  const match = /^(?<oid>[0-9a-f]{40}|[0-9a-f]{64})(?:\r?\n)?$/.exec(resolved.stdout);
  if (resolved.status !== 0 || resolved.stderr !== "" || !match?.groups?.oid) {
    throw branchLookupFailure(ref, `git exited ${resolved.status}`, resolved.stderr);
  }
  return match.groups.oid;
}

export function branchOid(repoRoot: string, branchName: string): string | undefined {
  const ref = exactBranchRef(branchName);
  const initialOid = probeExactBranchOid(repoRoot, ref);
  const looseRefExists = exactLooseBranchRefExists(repoRoot, ref);
  if (initialOid === undefined && looseRefExists) {
    throw branchLookupFailure(ref, "invalid exact loose ref exists");
  }
  if (initialOid !== undefined) return initialOid;

  const reprobedOid = probeExactBranchOid(repoRoot, ref);
  const reprobedLooseRefExists = exactLooseBranchRefExists(repoRoot, ref);
  if (reprobedOid === undefined && reprobedLooseRefExists) {
    throw branchLookupFailure(ref, "invalid exact loose ref appeared during lookup");
  }
  return reprobedOid;
}

export function compareAndDeleteBranch(
  repoRoot: string,
  branchName: string,
  expectedOid: string,
): void {
  const ref = exactBranchRef(branchName);
  if (!GIT_OID.test(expectedOid)) {
    throw new Error(`candidate exact branch compare-and-delete has an invalid OID for ${ref}`);
  }
  exactLooseBranchRefExists(repoRoot, ref);
  const deletion = spawnSync("git", ["-C", repoRoot, "update-ref", "-d", ref, expectedOid], {
    encoding: "utf8",
    maxBuffer: 1024 * 1024,
  });
  if (deletion.error) {
    throw new Error(
      `candidate exact branch compare-and-delete failed for ${ref}: ${deletion.error}`,
    );
  }
  if (deletion.signal || deletion.status === null) {
    throw new Error(
      `candidate exact branch compare-and-delete failed for ${ref}: git terminated by ${deletion.signal ?? "unknown signal"}`,
    );
  }
  if (deletion.status !== 0 || deletion.stdout !== "" || deletion.stderr !== "") {
    const detail =
      deletion.stderr.trim() || deletion.stdout.trim() || `git exited ${deletion.status}`;
    throw new Error(`candidate exact branch compare-and-delete failed for ${ref}: ${detail}`);
  }
}

export function candidateGitCommonDir(worktreePath: string): string {
  const raw = String(run("git", ["-C", worktreePath, "rev-parse", "--git-common-dir"])).trim();
  return realpathSync(resolve(worktreePath, raw));
}

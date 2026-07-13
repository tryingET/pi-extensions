import { execFileSync } from "node:child_process";
import { createHash, randomUUID } from "node:crypto";
import {
  chmodSync,
  existsSync,
  lstatSync,
  mkdirSync,
  mkdtempSync,
  readdirSync,
  readFileSync,
  readlinkSync,
  realpathSync,
  renameSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { join, relative } from "node:path";
import {
  appendLifecycleEvent,
  type CandidateDispositionReceipt,
  type CandidateLifecycleRecord,
  type CandidateReviewSnapshot,
  captureCandidateReviewSnapshot,
  digestObject,
  getCandidateLifecycleRoot,
  readLifecycleRecord,
  stableJson,
  unresolvedReviewBlockers,
  updateLifecycleRecord,
  withResourceLock,
  writeLockedLifecycleRecord,
} from "./candidatePeerLifecycleV2.ts";

export type CandidateArchiveReceipt = {
  archiveDir: string;
  archiveDigest: string;
  verifiedAt: string;
  restorationDigest: string;
  manifest: Record<string, string>;
};

export type CandidateCleanupEffect = "remove_worktree" | "delete_branch";

export type CandidateCleanupAuthorization = {
  schemaVersion: 2;
  resourceId: string;
  generationId: string;
  authorizedResourceVersion: number;
  aliases: string[];
  actor: string;
  issuedAt: string;
  expiresAt: string;
  nonce: string;
  dispositionDigest: string;
  reviewSnapshotDigest: string;
  integrationProofDigest?: string;
  targetOid?: string;
  archiveDigest: string;
  expectedWorktreeRealPath: string;
  expectedGitCommonDir: string;
  branchName: string;
  branchOid: string;
  effects: CandidateCleanupEffect[];
  authorizationDigest: string;
};

function sha256(value: string | Buffer): string {
  return createHash("sha256").update(value).digest("hex");
}

function run(
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

function writePrivate(path: string, value: string | Buffer): void {
  writeFileSync(path, value, { mode: 0o600, flag: "wx" });
}

function fileManifest(root: string): Record<string, string> {
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

function assertPrivateTree(root: string): void {
  const stack = [root];
  while (stack.length > 0) {
    const current = stack.pop() as string;
    const info = lstatSync(current);
    if (info.isDirectory()) {
      if ((info.mode & 0o077) !== 0)
        throw new Error(`archive directory permissions are not owner-only: ${current}`);
      for (const entry of readdirSync(current)) stack.push(join(current, entry));
    } else if ((info.mode & 0o077) !== 0) {
      throw new Error(`archive file permissions are not owner-only: ${current}`);
    }
  }
}

function makePrivateTree(root: string): void {
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

function pathBuffer(paths: string[]): Buffer {
  return Buffer.from(paths.length === 0 ? "" : `${paths.join("\0")}\0`, "utf8");
}

function archivePaths(
  snapshot: CandidateReviewSnapshot,
  disposition: CandidateDispositionReceipt,
): {
  preserve: string[];
  discardedIgnored: string[];
} {
  const untracked = snapshot.objects
    .filter((item) => item.source === "untracked")
    .map((item) => item.path);
  const ignored = snapshot.objects
    .filter((item) => item.source === "ignored")
    .map((item) => item.path);
  const discardedIgnored = [...new Set(disposition.discardIgnoredPaths ?? [])].sort();
  const ignoredSet = new Set(ignored);
  for (const path of discardedIgnored) {
    if (!ignoredSet.has(path))
      throw new Error(`ignored discard assertion does not match review snapshot: ${path}`);
  }
  const discardSet = new Set(discardedIgnored);
  return {
    preserve: [
      ...new Set([...untracked, ...ignored.filter((path) => !discardSet.has(path))]),
    ].sort(),
    discardedIgnored,
  };
}

function restorationComparable(
  snapshot: CandidateReviewSnapshot,
  discardedIgnored: string[],
): Record<string, unknown> {
  const discard = new Set(discardedIgnored);
  return {
    headOid: snapshot.headOid,
    indexTreeOid: snapshot.indexTreeOid,
    unstagedPatchSha256: snapshot.unstagedPatchSha256,
    stagedPatchSha256: snapshot.stagedPatchSha256,
    objects: snapshot.objects.filter(
      (item) => !(item.source === "ignored" && discard.has(item.path)),
    ),
  };
}

function verifyArchiveRestoration({
  stage,
  record,
  snapshot,
  discardedIgnored,
}: {
  stage: string;
  record: CandidateLifecycleRecord;
  snapshot: CandidateReviewSnapshot;
  discardedIgnored: string[];
}): string {
  const restoreParent = mkdtempSync(join(tmpdir(), "candidate-lifecycle-restore-"));
  const restorePath = join(restoreParent, "worktree");
  try {
    run("git", [
      "clone",
      "--quiet",
      "--branch",
      snapshot.branchName,
      join(stage, "branch.bundle"),
      restorePath,
    ]);
    const staged = readFileSync(join(stage, "staged.diff.patch"));
    const unstaged = readFileSync(join(stage, "diff.patch"));
    if (staged.length > 0)
      run("git", [
        "-C",
        restorePath,
        "apply",
        "--index",
        "--binary",
        join(stage, "staged.diff.patch"),
      ]);
    if (unstaged.length > 0)
      run("git", ["-C", restorePath, "apply", "--binary", join(stage, "diff.patch")]);
    run("tar", ["-xf", join(stage, "payload.tar"), "-C", restorePath]);
    const restoredRecord: CandidateLifecycleRecord = { ...record, worktreePath: restorePath };
    const restored = captureCandidateReviewSnapshot(restoredRecord);
    const expectedComparable = restorationComparable(snapshot, discardedIgnored);
    const actualComparable = restorationComparable(restored, []);
    if (stableJson(expectedComparable) !== stableJson(actualComparable)) {
      throw new Error("archive restoration manifest does not match reviewed candidate bytes");
    }
    return digestObject(actualComparable);
  } finally {
    rmSync(restoreParent, { recursive: true, force: true });
  }
}

export function createRestorationVerifiedArchive({
  record,
  expectedVersion,
  env = process.env,
}: {
  record: CandidateLifecycleRecord;
  expectedVersion: number;
  env?: NodeJS.ProcessEnv;
}): { record: CandidateLifecycleRecord; receipt: CandidateArchiveReceipt } {
  if (record.resourceVersion !== expectedVersion)
    throw new Error("archive expectedVersion does not match supplied record");
  if (!record.reviewSnapshot || !record.disposition)
    throw new Error("archive requires review snapshot and disposition");
  if (record.disposition.disposition === "deferred")
    throw new Error("deferred resources are not cleanup eligible");
  if (record.disposition.disposition === "accepted" && !record.integrationProof) {
    throw new Error("accepted resource requires exact integration proof before archive");
  }
  const unresolvedBlockers = unresolvedReviewBlockers(
    record.reviewSnapshot,
    record.disposition.discardIgnoredPaths,
  );
  if (unresolvedBlockers.length > 0) {
    throw new Error(`review snapshot has blockers: ${unresolvedBlockers.join(", ")}`);
  }
  const currentSnapshot = captureCandidateReviewSnapshot(record);
  if (currentSnapshot.contentDigest !== record.reviewSnapshot.contentDigest) {
    throw new Error("candidate content drifted after owner disposition");
  }
  const { preserve, discardedIgnored } = archivePaths(record.reviewSnapshot, record.disposition);
  const root = join(getCandidateLifecycleRoot(env), "archives", record.resourceId);
  mkdirSync(root, { recursive: true, mode: 0o700 });
  const archiveDir = join(root, record.generationId);
  const stage = `${archiveDir}.tmp.${process.pid}.${randomUUID()}`;
  if (existsSync(archiveDir))
    throw new Error(`archive already exists and must be verified/reused explicitly: ${archiveDir}`);
  mkdirSync(stage, { mode: 0o700 });
  try {
    writePrivate(join(stage, "lifecycle-record.json"), `${JSON.stringify(record, null, 2)}\n`);
    writePrivate(
      join(stage, "review-snapshot.json"),
      `${JSON.stringify(record.reviewSnapshot, null, 2)}\n`,
    );
    writePrivate(
      join(stage, "disposition.json"),
      `${JSON.stringify(record.disposition, null, 2)}\n`,
    );
    if (record.integrationProof) {
      writePrivate(
        join(stage, "integration-proof.json"),
        `${JSON.stringify(record.integrationProof, null, 2)}\n`,
      );
    }
    writePrivate(join(stage, "discarded-ignored-paths.z"), pathBuffer(discardedIgnored));
    writePrivate(join(stage, "payload.paths.z"), pathBuffer(preserve));
    writePrivate(
      join(stage, "diff.patch"),
      run("git", ["-C", record.worktreePath, "diff", "--binary", "--no-ext-diff"], {
        encoding: null,
      }) as Buffer,
    );
    writePrivate(
      join(stage, "staged.diff.patch"),
      run("git", ["-C", record.worktreePath, "diff", "--cached", "--binary", "--no-ext-diff"], {
        encoding: null,
      }) as Buffer,
    );
    run("tar", [
      "-C",
      record.worktreePath,
      "--null",
      "--verbatim-files-from",
      "-cf",
      join(stage, "payload.tar"),
      "-T",
      join(stage, "payload.paths.z"),
    ]);
    run("git", [
      "-C",
      record.repoRoots[0] ?? record.worktreePath,
      "bundle",
      "create",
      join(stage, "branch.bundle"),
      record.reviewSnapshot.branchName,
    ]);
    run("git", ["bundle", "verify", join(stage, "branch.bundle")]);
    const restorationDigest = verifyArchiveRestoration({
      stage,
      record,
      snapshot: record.reviewSnapshot,
      discardedIgnored,
    });
    const manifest = fileManifest(stage);
    writePrivate(join(stage, "manifest.json"), `${JSON.stringify(manifest, null, 2)}\n`);
    for (const [path, digest] of Object.entries(manifest)) {
      const full = join(stage, path);
      const actual = lstatSync(full).isSymbolicLink()
        ? sha256(`symlink:${readlinkSync(full)}`)
        : sha256(readFileSync(full));
      if (actual !== digest) throw new Error(`archive hash verification failed: ${path}`);
    }
    const archiveDigest = digestObject({
      manifest,
      restorationDigest,
      resourceId: record.resourceId,
      generationId: record.generationId,
    });
    writePrivate(
      join(stage, "COMPLETE"),
      `${JSON.stringify({ schemaVersion: 2, archiveDigest, restorationDigest })}\n`,
    );
    makePrivateTree(stage);
    assertPrivateTree(stage);
    renameSync(stage, archiveDir);
    const receipt: CandidateArchiveReceipt = {
      archiveDir,
      archiveDigest,
      verifiedAt: new Date().toISOString(),
      restorationDigest,
      manifest,
    };
    const next = updateLifecycleRecord({
      resourceId: record.resourceId,
      expectedVersion,
      event: "archive_verified",
      env,
      mutate(current) {
        if (!["rejected", "superseded", "integration_verified"].includes(current.state)) {
          throw new Error(`invalid state for archive: ${current.state}`);
        }
        if (current.reviewSnapshot?.contentDigest !== record.reviewSnapshot?.contentDigest)
          throw new Error("review binding changed before archive publication");
        current.state = "archive_verified";
        current.archive = { archiveDir, archiveDigest, verifiedAt: receipt.verifiedAt };
        return current;
      },
    });
    return { record: next, receipt };
  } catch (error) {
    rmSync(stage, { recursive: true, force: true });
    throw error;
  }
}

export function authorizeCandidateCleanup({
  record,
  expectedVersion,
  actor,
  expiresAt,
  effects,
  env = process.env,
}: {
  record: CandidateLifecycleRecord;
  expectedVersion: number;
  actor: string;
  expiresAt: string;
  effects: CandidateCleanupEffect[];
  env?: NodeJS.ProcessEnv;
}): CandidateLifecycleRecord {
  if (
    record.state !== "archive_verified" ||
    !record.archive ||
    !record.reviewSnapshot ||
    !record.disposition
  ) {
    throw new Error("cleanup authorization requires archive_verified record");
  }
  if (new Date(expiresAt).getTime() <= Date.now())
    throw new Error("cleanup authorization expiry must be in the future");
  const branchOid = String(
    run("git", [
      "-C",
      record.repoRoots[0] ?? record.worktreePath,
      "rev-parse",
      `refs/heads/${record.reviewSnapshot.branchName}`,
    ]),
  ).trim();
  if (branchOid !== record.reviewSnapshot.headOid)
    throw new Error("branch ref drifted before cleanup authorization");
  const unsigned = {
    schemaVersion: 2 as const,
    resourceId: record.resourceId,
    generationId: record.generationId,
    authorizedResourceVersion: expectedVersion + 1,
    aliases: [...record.aliases].sort(),
    actor,
    issuedAt: new Date().toISOString(),
    expiresAt,
    nonce: randomUUID(),
    dispositionDigest: record.disposition.receiptDigest,
    reviewSnapshotDigest: record.reviewSnapshot.snapshotDigest,
    integrationProofDigest: record.integrationProof?.proofDigest,
    targetOid: record.integrationProof?.targetOid,
    archiveDigest: record.archive.archiveDigest,
    expectedWorktreeRealPath: record.reviewSnapshot.worktreeRealPath,
    expectedGitCommonDir: record.reviewSnapshot.gitCommonDir,
    branchName: record.reviewSnapshot.branchName,
    branchOid,
    effects: [...new Set(effects)],
  };
  const authorization: CandidateCleanupAuthorization = {
    ...unsigned,
    authorizationDigest: digestObject(unsigned),
  };
  return updateLifecycleRecord({
    resourceId: record.resourceId,
    expectedVersion,
    event: "cleanup_authorized",
    env,
    mutate(current) {
      if (current.state !== "archive_verified")
        throw new Error(`invalid authorization state: ${current.state}`);
      current.state = "cleanup_authorized";
      current.cleanupAuthorization = authorization;
      return current;
    },
  });
}

function activeProcessPids(worktreePath: string): number[] {
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
      )
        pids.push(pid);
    } catch {
      // Vanished or inaccessible processes are not positive activity evidence.
    }
  }
  return pids.sort((a, b) => a - b);
}

function verifyPublishedArchive(record: CandidateLifecycleRecord): void {
  if (!record.archive) throw new Error("missing archive receipt");
  const completePath = join(record.archive.archiveDir, "COMPLETE");
  const complete = JSON.parse(readFileSync(completePath, "utf8")) as { archiveDigest?: string };
  if (complete.archiveDigest !== record.archive.archiveDigest)
    throw new Error("published archive COMPLETE digest mismatch");
  const expected = JSON.parse(
    readFileSync(join(record.archive.archiveDir, "manifest.json"), "utf8"),
  ) as Record<string, string>;
  const actual = fileManifest(record.archive.archiveDir);
  if (stableJson(expected) !== stableJson(actual))
    throw new Error("published archive object hash mismatch");
  assertPrivateTree(record.archive.archiveDir);
}

export function executeAuthorizedCandidateCleanup({
  resourceId,
  env = process.env,
}: {
  resourceId: string;
  env?: NodeJS.ProcessEnv;
}): CandidateLifecycleRecord {
  return withResourceLock(resourceId, "cleanup_execute", env, () => {
    const current = readLifecycleRecord(resourceId, env);
    if (current.state !== "cleanup_authorized")
      throw new Error(`resource is not cleanup_authorized: ${current.state}`);
    const auth = current.cleanupAuthorization as CandidateCleanupAuthorization | undefined;
    if (
      !auth ||
      auth.authorizationDigest !==
        digestObject(
          Object.fromEntries(Object.entries(auth).filter(([key]) => key !== "authorizationDigest")),
        )
    ) {
      throw new Error("cleanup authorization digest mismatch");
    }
    if (auth.authorizedResourceVersion !== current.resourceVersion)
      throw new Error("cleanup authorization resourceVersion mismatch");
    if (new Date(auth.expiresAt).getTime() <= Date.now())
      throw new Error("cleanup authorization expired");
    if (!current.reviewSnapshot || !current.archive || !current.disposition)
      throw new Error("cleanup bindings are incomplete");
    verifyPublishedArchive(current);
    const currentSnapshot = captureCandidateReviewSnapshot(current);
    if (currentSnapshot.contentDigest !== current.reviewSnapshot.contentDigest)
      throw new Error("candidate drifted after cleanup authorization");
    if (realpathSync(current.worktreePath) !== auth.expectedWorktreeRealPath)
      throw new Error("worktree realpath drifted");
    const pids = activeProcessPids(auth.expectedWorktreeRealPath);
    if (pids.length > 0) throw new Error(`candidate has active process leases: ${pids.join(",")}`);
    const repoRoot = current.repoRoots[0];
    if (!repoRoot) throw new Error("owner repo root is ambiguous or missing");
    const effects: Array<Record<string, unknown>> = [];
    let failure: unknown;
    try {
      if (auth.effects.includes("remove_worktree")) {
        run("git", ["-C", repoRoot, "worktree", "remove", "--force", current.worktreePath]);
        const receipt = {
          effect: "remove_worktree",
          at: new Date().toISOString(),
          worktreePath: current.worktreePath,
        };
        appendLifecycleEvent(resourceId, receipt, env);
        effects.push(receipt);
      }
      if (auth.effects.includes("delete_branch")) {
        const oid = String(
          run("git", ["-C", repoRoot, "rev-parse", `refs/heads/${auth.branchName}`]),
        ).trim();
        if (oid !== auth.branchOid) throw new Error("branch OID changed before exact deletion");
        run("git", ["-C", repoRoot, "branch", "-D", auth.branchName]);
        const receipt = {
          effect: "delete_branch",
          at: new Date().toISOString(),
          branchName: auth.branchName,
          branchOid: oid,
        };
        appendLifecycleEvent(resourceId, receipt, env);
        effects.push(receipt);
      }
    } catch (error) {
      failure = error;
    }
    const next = structuredClone(current);
    next.resourceVersion = current.resourceVersion + 1;
    next.state = failure ? "cleanup_partial" : "cleaned";
    next.terminalReceipt = failure
      ? { type: "cleanup_partial", effects, failure: String(failure), at: new Date().toISOString() }
      : {
          type: "cleaned",
          effects,
          at: new Date().toISOString(),
          archiveDigest: current.archive.archiveDigest,
          authorizationDigest: auth.authorizationDigest,
          receiptDigest: digestObject({
            resourceId,
            effects,
            archiveDigest: current.archive.archiveDigest,
            authorizationDigest: auth.authorizationDigest,
          }),
        };
    const saved = writeLockedLifecycleRecord(
      current,
      next,
      failure ? "cleanup_partial" : "cleaned",
      env,
    );
    if (failure)
      throw new Error(`candidate cleanup stopped after partial effects: ${String(failure)}`);
    return saved;
  });
}

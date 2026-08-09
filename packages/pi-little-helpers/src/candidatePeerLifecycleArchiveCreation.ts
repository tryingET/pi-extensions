import { randomUUID } from "node:crypto";
import {
  chmodSync,
  existsSync,
  lstatSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  readlinkSync,
  renameSync,
  rmSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { isAbsolute, join, relative, resolve, sep } from "node:path";
import {
  assertPrivateTree,
  fileManifest,
  makePrivateTree,
  run,
  sha256,
  writePrivate,
} from "./candidatePeerLifecycleArchiveShared.ts";
import type { CandidateArchiveReceipt } from "./candidatePeerLifecycleArchiveTypes.ts";
import type {
  CandidateDispositionReceipt,
  CandidateLifecycleRecord,
  CandidateReviewSnapshot,
} from "./candidatePeerLifecycleV2.ts";
import {
  assertCandidateGenerationId,
  assertCandidateResourceId,
  assertIntegrationProofCoversDisposition,
  captureCandidateReviewSnapshot,
  digestObject,
  getCandidateLifecycleRoot,
  stableJson,
  unresolvedReviewBlockers,
  updateLifecycleRecord,
} from "./candidatePeerLifecycleV2.ts";

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
    if (!ignoredSet.has(path)) {
      throw new Error(`ignored discard assertion does not match review snapshot: ${path}`);
    }
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
    objects: snapshot.objects
      .filter((item) => !(item.source === "ignored" && discard.has(item.path)))
      .map(({ source: _source, ...physicalObject }) => physicalObject),
  };
}

function restoreReviewedModes(
  restorePath: string,
  snapshot: CandidateReviewSnapshot,
  discardedIgnored: string[],
): void {
  const discarded = new Set(discardedIgnored);
  const objects = snapshot.objects
    .filter((item) => !(item.source === "ignored" && discarded.has(item.path)))
    .filter((item) => item.type === "file" || item.type === "directory")
    .sort((left, right) => {
      if (left.type !== right.type) return left.type === "file" ? -1 : 1;
      return right.path.split(sep).length - left.path.split(sep).length;
    });

  for (const item of objects) {
    if (item.mode === undefined) {
      throw new Error(`reviewed archive object omits its mode: ${item.path}`);
    }
    const full = resolve(restorePath, item.path);
    const rel = relative(restorePath, full);
    if (rel !== item.path || rel.startsWith(`..${sep}`) || isAbsolute(rel)) {
      throw new Error(`reviewed archive mode path escapes restoration root: ${item.path}`);
    }
    const info = lstatSync(full);
    if (
      (item.type === "file" && !info.isFile()) ||
      (item.type === "directory" && !info.isDirectory())
    ) {
      throw new Error(`reviewed archive object type changed during restoration: ${item.path}`);
    }
    chmodSync(full, item.mode);
  }
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
    if (staged.length > 0) {
      run("git", [
        "-C",
        restorePath,
        "apply",
        "--index",
        "--binary",
        join(stage, "staged.diff.patch"),
      ]);
    }
    if (unstaged.length > 0) {
      run("git", ["-C", restorePath, "apply", "--binary", join(stage, "diff.patch")]);
    }
    run("tar", ["-xpf", join(stage, "payload.tar"), "-C", restorePath]);
    restoreReviewedModes(restorePath, snapshot, discardedIgnored);
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
  assertCandidateResourceId(record.resourceId);
  assertCandidateGenerationId(record.generationId);
  if (record.resourceVersion !== expectedVersion) {
    throw new Error("archive expectedVersion does not match supplied record");
  }
  if (!record.reviewSnapshot || !record.disposition) {
    throw new Error("archive requires review snapshot and disposition");
  }
  if (record.disposition.disposition === "deferred") {
    throw new Error("deferred resources are not cleanup eligible");
  }
  if (record.disposition.disposition === "accepted") {
    const integrationProof = record.integrationProof;
    if (!integrationProof) {
      throw new Error("accepted resource requires exact integration proof before archive");
    }
    assertIntegrationProofCoversDisposition(
      record.disposition,
      record.reviewSnapshot,
      integrationProof,
    );
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
  if (existsSync(archiveDir)) {
    throw new Error(`archive already exists and must be verified/reused explicitly: ${archiveDir}`);
  }
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
      run("git", ["-C", record.worktreePath, "diff", "--binary", "--full-index", "--no-ext-diff"], {
        encoding: null,
      }) as Buffer,
    );
    writePrivate(
      join(stage, "staged.diff.patch"),
      run(
        "git",
        [
          "-C",
          record.worktreePath,
          "diff",
          "--cached",
          "--binary",
          "--full-index",
          "--no-ext-diff",
        ],
        { encoding: null },
      ) as Buffer,
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
        if (current.reviewSnapshot?.contentDigest !== record.reviewSnapshot?.contentDigest) {
          throw new Error("review binding changed before archive publication");
        }
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

import { execFileSync } from "node:child_process";
import { createHash, randomUUID } from "node:crypto";
import {
  chmodSync,
  closeSync,
  existsSync,
  lstatSync,
  mkdirSync,
  mkdtempSync,
  openSync,
  readdirSync,
  readFileSync,
  readlinkSync,
  readSync,
  realpathSync,
  renameSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { join, relative, resolve } from "node:path";
import { listCandidateAdmissionPermits } from "./candidatePeerAdmissionState.ts";
import {
  appendLifecycleEvent,
  assertCandidateGenerationId,
  assertCandidateResourceId,
  assertIntegrationProofCoversDisposition,
  type CandidateDispositionReceipt,
  type CandidateLifecycleRecord,
  type CandidateReviewSnapshot,
  captureCandidateReviewSnapshot,
  digestObject,
  getCandidateLifecycleEventsPath,
  getCandidateLifecycleRoot,
  readLifecycleRecord,
  stableJson,
  unresolvedReviewBlockers,
  updateLifecycleRecord,
  withResourceLock,
  writeLockedLifecycleRecord,
} from "./candidatePeerLifecycleV2.ts";
import { candidateCurrentInventoryBindingBlockers } from "./candidatePeerLifecycleV2Binding.ts";
import { inventoryCandidatePeerResources } from "./candidatePeerLifecycleV2Inventory.ts";
import { withCandidateRegistryMutationLock } from "./candidatePeerLifecycleV2State.ts";
import { getCandidatePeerRegistryDir } from "./candidatePeerRegistry.ts";
import { materializeTerminalCompaction } from "./candidatePeerTerminalRetentionMaterialization.ts";

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
  reissuedFromAuthorizationDigest?: string;
  effects: CandidateCleanupEffect[];
  authorizationDigest: string;
};

function sha256(value: string | Buffer): string {
  return createHash("sha256").update(value).digest("hex");
}

const REQUIRED_CLEANUP_EFFECTS: CandidateCleanupEffect[] = ["delete_branch", "remove_worktree"];

function canonicalTimestamp(value: string, label: string): number {
  if (!/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/.test(value)) {
    throw new Error(`${label} must be a canonical UTC timestamp`);
  }
  const timestamp = Date.parse(value);
  if (!Number.isFinite(timestamp) || new Date(timestamp).toISOString() !== value) {
    throw new Error(`${label} must be a real canonical UTC timestamp`);
  }
  return timestamp;
}

function exactCleanupEffects(effects: CandidateCleanupEffect[]): CandidateCleanupEffect[] {
  const normalized = [...new Set(effects)].sort();
  if (stableJson(normalized) !== stableJson(REQUIRED_CLEANUP_EFFECTS)) {
    throw new Error("cleanup authorization requires exactly remove_worktree and delete_branch");
  }
  return normalized;
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
  assertCandidateResourceId(record.resourceId);
  assertCandidateGenerationId(record.generationId);
  if (record.resourceVersion !== expectedVersion)
    throw new Error("archive expectedVersion does not match supplied record");
  if (!record.reviewSnapshot || !record.disposition)
    throw new Error("archive requires review snapshot and disposition");
  if (record.disposition.disposition === "deferred")
    throw new Error("deferred resources are not cleanup eligible");
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
        {
          encoding: null,
        },
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
  assertCandidateResourceId(record.resourceId);
  assertCandidateGenerationId(record.generationId);
  if (!actor.trim()) throw new Error("cleanup authorization requires an actor");
  const issuedAt = new Date().toISOString();
  if (canonicalTimestamp(expiresAt, "cleanup authorization expiry") <= Date.now()) {
    throw new Error("cleanup authorization expiry must be in the future");
  }
  const authorizedEffects = exactCleanupEffects(effects);
  if (
    record.state !== "archive_verified" ||
    !record.archive ||
    !record.reviewSnapshot ||
    !record.disposition
  ) {
    throw new Error("cleanup authorization requires archive_verified record");
  }
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
    actor: actor.trim(),
    issuedAt,
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
    effects: authorizedEffects,
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

function verifyPublishedArchive(
  record: CandidateLifecycleRecord,
  archiveDir = record.archive?.archiveDir,
): void {
  if (!record.archive || !archiveDir) throw new Error("missing archive receipt");
  const completePath = join(archiveDir, "COMPLETE");
  const complete = JSON.parse(readFileSync(completePath, "utf8")) as { archiveDigest?: string };
  if (complete.archiveDigest !== record.archive.archiveDigest)
    throw new Error("published archive COMPLETE digest mismatch");
  const expected = JSON.parse(readFileSync(join(archiveDir, "manifest.json"), "utf8")) as Record<
    string,
    string
  >;
  const actual = fileManifest(archiveDir);
  if (stableJson(expected) !== stableJson(actual))
    throw new Error("published archive object hash mismatch");
  assertPrivateTree(archiveDir);
}

type CleanupEffectEvent = {
  event: "cleanup_effect_intent" | "cleanup_effect_observed";
  effect: CandidateCleanupEffect;
  authorizationDigest: string;
  attemptId: string;
  at: string;
  recoveredAfterCrash?: boolean;
  worktreePath?: string;
  branchName?: string;
  branchOid?: string;
  observationDigest?: string;
};

const CLEANUP_EVENT_READ_CHUNK_BYTES = 64 * 1024;
const MAX_RELEVANT_CLEANUP_EVENT_BYTES = 16 * 1024 * 1024;
const MAX_EVENT_IDENTITY_BYTES = 256;
const MAX_EVENT_NESTING_DEPTH = 256;
const RELEVANT_CLEANUP_EVENTS = new Set([
  "cleanup_effect_intent",
  "cleanup_effect_observed",
  "cleaned",
]);

type CleanupEventScanResult = {
  events: Array<Record<string, unknown>>;
  finalEvent?: Record<string, unknown>;
};

type EventIdentityScanner = {
  state: "start" | "key" | "colon" | "value" | "primitive" | "comma" | "done";
  currentKey?: string;
  event?: string;
  eventSeen: boolean;
  malformed: boolean;
  stringRole?: "key" | "event-value" | "other-value";
  stringBytes: number[];
  stringEscaped: boolean;
  nestedClosers: number[];
  nestedString: boolean;
  nestedEscaped: boolean;
};

function newEventIdentityScanner(): EventIdentityScanner {
  return {
    state: "start",
    eventSeen: false,
    malformed: false,
    stringBytes: [],
    stringEscaped: false,
    nestedClosers: [],
    nestedString: false,
    nestedEscaped: false,
  };
}

function decodeIdentityString(scanner: EventIdentityScanner): string | undefined {
  try {
    const value = JSON.parse(`"${Buffer.from(scanner.stringBytes).toString("utf8")}"`);
    return typeof value === "string" ? value : undefined;
  } catch {
    scanner.malformed = true;
    return undefined;
  }
}

function scanTopLevelEventIdentity(scanner: EventIdentityScanner, bytes: Buffer): void {
  if (scanner.malformed) return;
  const whitespace = (byte: number): boolean =>
    byte === 0x20 || byte === 0x09 || byte === 0x0d || byte === 0x0a;
  for (const byte of bytes) {
    if (scanner.nestedClosers.length > 0) {
      if (scanner.nestedString) {
        if (scanner.nestedEscaped) scanner.nestedEscaped = false;
        else if (byte === 0x5c) scanner.nestedEscaped = true;
        else if (byte === 0x22) scanner.nestedString = false;
        continue;
      }
      if (byte === 0x22) scanner.nestedString = true;
      else if (byte === 0x7b || byte === 0x5b) {
        if (scanner.nestedClosers.length >= MAX_EVENT_NESTING_DEPTH) {
          scanner.malformed = true;
          return;
        }
        scanner.nestedClosers.push(byte === 0x7b ? 0x7d : 0x5d);
      } else if (byte === 0x7d || byte === 0x5d) {
        if (scanner.nestedClosers.pop() !== byte) {
          scanner.malformed = true;
          return;
        }
        if (scanner.nestedClosers.length === 0) scanner.state = "comma";
      }
      continue;
    }

    if (scanner.stringRole) {
      if (scanner.stringEscaped) {
        scanner.stringEscaped = false;
        if (scanner.stringRole !== "other-value") scanner.stringBytes.push(byte);
      } else if (byte === 0x5c) {
        scanner.stringEscaped = true;
        if (scanner.stringRole !== "other-value") scanner.stringBytes.push(byte);
      } else if (byte === 0x22) {
        const role = scanner.stringRole;
        const value = role === "other-value" ? undefined : decodeIdentityString(scanner);
        scanner.stringRole = undefined;
        scanner.stringBytes = [];
        if (scanner.malformed) return;
        if (role === "key") {
          scanner.currentKey = value;
          scanner.state = "colon";
        } else {
          if (role === "event-value") {
            if (scanner.eventSeen) {
              scanner.malformed = true;
              return;
            }
            scanner.eventSeen = true;
            scanner.event = value;
          }
          scanner.state = "comma";
        }
      } else if (scanner.stringRole !== "other-value") {
        if (scanner.stringBytes.length >= MAX_EVENT_IDENTITY_BYTES) {
          scanner.malformed = true;
          return;
        }
        scanner.stringBytes.push(byte);
      }
      continue;
    }

    if (scanner.state === "start") {
      if (whitespace(byte)) continue;
      if (byte !== 0x7b) scanner.malformed = true;
      else scanner.state = "key";
    } else if (scanner.state === "key") {
      if (whitespace(byte)) continue;
      if (byte === 0x7d) scanner.state = "done";
      else if (byte === 0x22) {
        scanner.stringRole = "key";
        scanner.stringBytes = [];
      } else scanner.malformed = true;
    } else if (scanner.state === "colon") {
      if (whitespace(byte)) continue;
      if (byte !== 0x3a) scanner.malformed = true;
      else scanner.state = "value";
    } else if (scanner.state === "value") {
      if (whitespace(byte)) continue;
      if (byte === 0x22) {
        scanner.stringRole = scanner.currentKey === "event" ? "event-value" : "other-value";
        scanner.stringBytes = [];
      } else if (byte === 0x7b || byte === 0x5b) {
        if (scanner.currentKey === "event") {
          scanner.malformed = true;
          return;
        }
        scanner.nestedClosers.push(byte === 0x7b ? 0x7d : 0x5d);
      } else {
        if (scanner.currentKey === "event") {
          scanner.malformed = true;
          return;
        }
        scanner.state = "primitive";
      }
    } else if (scanner.state === "primitive") {
      if (byte === 0x2c) scanner.state = "key";
      else if (byte === 0x7d) scanner.state = "done";
    } else if (scanner.state === "comma") {
      if (whitespace(byte)) continue;
      if (byte === 0x2c) scanner.state = "key";
      else if (byte === 0x7d) scanner.state = "done";
      else scanner.malformed = true;
    } else if (!whitespace(byte)) {
      scanner.malformed = true;
    }
    if (scanner.malformed) return;
  }
}

function readCleanupEvents(
  resourceId: string,
  env: NodeJS.ProcessEnv,
  path = getCandidateLifecycleEventsPath(resourceId, env),
): CleanupEventScanResult {
  if (!existsSync(path)) return { events: [] };

  const events: Array<Record<string, unknown>> = [];
  let finalEvent: Record<string, unknown> | undefined;
  const fd = openSync(path, "r");
  const buffer = Buffer.allocUnsafe(CLEANUP_EVENT_READ_CHUNK_BYTES);
  let lineChunks: Buffer[] = [];
  let lineBytes = 0;
  let lineRelevant: boolean | undefined;
  let identity = newEventIdentityScanner();

  const appendLineBytes = (bytes: Buffer): void => {
    if (bytes.length === 0) return;
    if (lineRelevant !== false && lineBytes + bytes.length <= MAX_RELEVANT_CLEANUP_EVENT_BYTES) {
      lineChunks.push(Buffer.from(bytes));
    } else if (lineBytes + bytes.length > MAX_RELEVANT_CLEANUP_EVENT_BYTES) {
      lineChunks = [];
    }
    scanTopLevelEventIdentity(identity, bytes);
    if (lineRelevant === undefined && identity.event !== undefined) {
      lineRelevant = RELEVANT_CLEANUP_EVENTS.has(identity.event);
      if (!lineRelevant) lineChunks = [];
    }
    lineBytes += bytes.length;
  };

  const finishLine = (): void => {
    if (lineBytes === 0) return;
    if (identity.malformed || identity.event === undefined) {
      throw new Error("malformed lifecycle event or non-unique top-level event identity");
    }
    const relevant = RELEVANT_CLEANUP_EVENTS.has(identity.event);
    let event: Record<string, unknown>;
    if (relevant) {
      if (lineBytes > MAX_RELEVANT_CLEANUP_EVENT_BYTES) {
        throw new Error("relevant cleanup lifecycle event exceeds bounded read limit");
      }
      try {
        event = JSON.parse(Buffer.concat(lineChunks, lineBytes).toString("utf8")) as Record<
          string,
          unknown
        >;
      } catch (error) {
        throw new Error(`malformed relevant cleanup lifecycle event: ${String(error)}`);
      }
      if (event.event !== identity.event) {
        throw new Error("relevant cleanup lifecycle event identity changed during decoding");
      }
    } else {
      event = { event: identity.event };
    }
    finalEvent = event;
    if (typeof event.event === "string" && RELEVANT_CLEANUP_EVENTS.has(event.event)) {
      events.push(event);
    }
    lineChunks = [];
    lineBytes = 0;
    lineRelevant = undefined;
    identity = newEventIdentityScanner();
  };

  try {
    for (;;) {
      const bytesRead = readSync(fd, buffer, 0, buffer.length, null);
      if (bytesRead === 0) break;
      let start = 0;
      while (start < bytesRead) {
        const newline = buffer.indexOf(0x0a, start);
        const end = newline === -1 || newline >= bytesRead ? bytesRead : newline;
        appendLineBytes(buffer.subarray(start, end));
        if (newline === -1 || newline >= bytesRead) break;
        finishLine();
        start = newline + 1;
      }
    }
    if (lineBytes > 0) finishLine();
  } finally {
    closeSync(fd);
  }
  return { events, finalEvent };
}

function branchOid(repoRoot: string, branchName: string): string | undefined {
  try {
    return String(run("git", ["-C", repoRoot, "rev-parse", `refs/heads/${branchName}`])).trim();
  } catch {
    return undefined;
  }
}

function candidateGitCommonDir(worktreePath: string): string {
  const raw = String(run("git", ["-C", worktreePath, "rev-parse", "--git-common-dir"])).trim();
  return realpathSync(resolve(worktreePath, raw));
}

export function reissueExpiredCandidateCleanupAuthorization({
  record,
  expectedVersion,
  actor,
  expiresAt,
  env = process.env,
}: {
  record: CandidateLifecycleRecord;
  expectedVersion: number;
  actor: string;
  expiresAt: string;
  env?: NodeJS.ProcessEnv;
}): CandidateLifecycleRecord {
  assertCandidateResourceId(record.resourceId);
  assertCandidateGenerationId(record.generationId);
  return withResourceLock(record.resourceId, "cleanup_authorization_reissue", env, () => {
    const current = readLifecycleRecord(record.resourceId, env);
    if (
      current.resourceVersion !== expectedVersion ||
      digestObject(current) !== digestObject(record)
    ) {
      throw new Error("cleanup reissue supplied record or expectedVersion is stale");
    }
    if (current.state !== "cleanup_authorized")
      throw new Error("cleanup authorization reissue requires cleanup_authorized state");
    if (!actor.trim()) throw new Error("cleanup authorization reissue requires an actor");
    const issuedAt = new Date().toISOString();
    const issuedAtMs = canonicalTimestamp(issuedAt, "cleanup authorization reissue time");
    const expiryMs = canonicalTimestamp(expiresAt, "reissued cleanup authorization expiry");
    if (expiryMs <= issuedAtMs)
      throw new Error("reissued cleanup authorization expiry must be in the future");
    if (expiryMs - issuedAtMs > 30 * 60 * 1000)
      throw new Error("reissued cleanup authorization expiry exceeds the 30 minute bound");

    const prior = current.cleanupAuthorization as CandidateCleanupAuthorization | undefined;
    if (!prior) throw new Error("cleanup authorization reissue requires a prior authorization");
    const priorUnsigned = Object.fromEntries(
      Object.entries(prior).filter(([key]) => key !== "authorizationDigest"),
    );
    if (prior.authorizationDigest !== digestObject(priorUnsigned))
      throw new Error("expired cleanup authorization digest mismatch");
    exactCleanupEffects(prior.effects);
    if (
      prior.resourceId !== current.resourceId ||
      prior.generationId !== current.generationId ||
      prior.authorizedResourceVersion !== current.resourceVersion ||
      stableJson(prior.aliases) !== stableJson([...current.aliases].sort())
    ) {
      throw new Error("expired cleanup authorization identity or lineage mismatch");
    }
    if (canonicalTimestamp(prior.expiresAt, "expired cleanup authorization expiry") > issuedAtMs)
      throw new Error("cleanup authorization cannot be reissued before expiry");
    if (
      !current.reviewSnapshot ||
      !current.archive ||
      current.disposition?.disposition !== "accepted" ||
      !current.integrationProof
    ) {
      throw new Error("cleanup authorization reissue bindings are incomplete");
    }
    if (current.terminalReceipt)
      throw new Error("cleanup authorization cannot be reissued after any terminal effect receipt");
    if (
      prior.reviewSnapshotDigest !== current.reviewSnapshot.snapshotDigest ||
      prior.dispositionDigest !== current.disposition.receiptDigest ||
      prior.integrationProofDigest !== current.integrationProof.proofDigest ||
      prior.targetOid !== current.integrationProof.targetOid ||
      prior.archiveDigest !== current.archive.archiveDigest ||
      prior.expectedWorktreeRealPath !== current.reviewSnapshot.worktreeRealPath ||
      prior.expectedGitCommonDir !== current.reviewSnapshot.gitCommonDir ||
      prior.branchName !== current.reviewSnapshot.branchName ||
      prior.branchOid !== current.reviewSnapshot.headOid
    ) {
      throw new Error("cleanup authorization reissue binding mismatch");
    }
    assertIntegrationProofCoversDisposition(
      current.disposition,
      current.reviewSnapshot,
      current.integrationProof,
    );
    verifyPublishedArchive(current);
    const eventScan = readCleanupEvents(current.resourceId, env);
    if (eventScan.events.length > 0)
      throw new Error("cleanup authorization cannot be reissued after cleanup effect activity");
    if (!existsSync(current.worktreePath))
      throw new Error("cleanup authorization reissue requires the exact candidate worktree");
    if (realpathSync(current.worktreePath) !== prior.expectedWorktreeRealPath)
      throw new Error("candidate worktree realpath drifted before cleanup authorization reissue");
    if (candidateGitCommonDir(current.worktreePath) !== prior.expectedGitCommonDir)
      throw new Error(
        "candidate Git common directory drifted before cleanup authorization reissue",
      );
    const repoRoot = current.repoRoots[0];
    if (!repoRoot) throw new Error("cleanup authorization reissue owner repo root is missing");
    const currentBranchOid = branchOid(repoRoot, prior.branchName);
    if (!currentBranchOid || currentBranchOid !== prior.branchOid)
      throw new Error("candidate branch identity drifted before cleanup authorization reissue");
    const currentSnapshot = captureCandidateReviewSnapshot(current);
    if (
      currentSnapshot.contentDigest !== current.reviewSnapshot.contentDigest ||
      currentSnapshot.headOid !== prior.branchOid ||
      currentSnapshot.branchName !== prior.branchName ||
      currentSnapshot.worktreeRealPath !== prior.expectedWorktreeRealPath ||
      currentSnapshot.gitCommonDir !== prior.expectedGitCommonDir
    ) {
      throw new Error("candidate drifted before cleanup authorization reissue");
    }
    const pids = activeProcessPids(prior.expectedWorktreeRealPath);
    if (pids.length > 0) throw new Error(`candidate has active process leases: ${pids.join(",")}`);
    if (expiryMs <= Date.now())
      throw new Error("reissued cleanup authorization expired during validation");

    const unsigned = {
      schemaVersion: 2 as const,
      resourceId: current.resourceId,
      generationId: current.generationId,
      authorizedResourceVersion: expectedVersion + 1,
      aliases: [...current.aliases].sort(),
      actor: actor.trim(),
      issuedAt,
      expiresAt,
      nonce: randomUUID(),
      dispositionDigest: current.disposition.receiptDigest,
      reviewSnapshotDigest: current.reviewSnapshot.snapshotDigest,
      integrationProofDigest: current.integrationProof.proofDigest,
      targetOid: current.integrationProof.targetOid,
      archiveDigest: current.archive.archiveDigest,
      expectedWorktreeRealPath: prior.expectedWorktreeRealPath,
      expectedGitCommonDir: prior.expectedGitCommonDir,
      branchName: prior.branchName,
      branchOid: prior.branchOid,
      reissuedFromAuthorizationDigest: prior.authorizationDigest,
      effects: exactCleanupEffects(prior.effects),
    };
    const authorization: CandidateCleanupAuthorization = {
      ...unsigned,
      authorizationDigest: digestObject(unsigned),
    };
    const next = structuredClone(current);
    next.resourceVersion = current.resourceVersion + 1;
    next.cleanupAuthorization = authorization;
    return writeLockedLifecycleRecord(current, next, "cleanup_authorization_reissued", env);
  });
}

function cleanupObservations(
  events: Array<Record<string, unknown>>,
  authorizationDigest: string,
): Map<CandidateCleanupEffect, CleanupEffectEvent> {
  const observations = new Map<CandidateCleanupEffect, CleanupEffectEvent>();
  for (const event of events) {
    if (
      event.event === "cleanup_effect_observed" &&
      event.authorizationDigest === authorizationDigest &&
      (event.effect === "remove_worktree" || event.effect === "delete_branch")
    ) {
      observations.set(event.effect, event as CleanupEffectEvent);
    }
  }
  return observations;
}

function appendCleanupObservation(
  resourceId: string,
  event: Omit<CleanupEffectEvent, "event" | "at" | "observationDigest">,
  env: NodeJS.ProcessEnv,
): CleanupEffectEvent {
  const unsigned = {
    event: "cleanup_effect_observed" as const,
    ...event,
    at: new Date().toISOString(),
  };
  const observation = { ...unsigned, observationDigest: digestObject(unsigned) };
  appendLifecycleEvent(resourceId, observation, env);
  return observation;
}

function assertCleanupAuthorization(
  current: CandidateLifecycleRecord,
): CandidateCleanupAuthorization {
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
  exactCleanupEffects(auth.effects);
  if (canonicalTimestamp(auth.expiresAt, "cleanup authorization expiry") <= Date.now())
    throw new Error("cleanup authorization expired");
  if (
    current.state === "cleanup_authorized"
      ? auth.authorizedResourceVersion !== current.resourceVersion
      : auth.authorizedResourceVersion >= current.resourceVersion
  ) {
    throw new Error("cleanup authorization resourceVersion lineage mismatch");
  }
  if (current.state === "cleanup_partial") {
    const partial = current.terminalReceipt as Record<string, unknown> | undefined;
    if (
      partial?.type !== "cleanup_partial" ||
      partial.authorizationDigest !== auth.authorizationDigest ||
      !Array.isArray(partial.effects)
    ) {
      throw new Error("cleanup_partial record is not bound to its authorization and effects");
    }
  }
  return auth;
}

export function executeAuthorizedCandidateCleanup({
  resourceId,
  env = process.env,
}: {
  resourceId: string;
  env?: NodeJS.ProcessEnv;
}): CandidateLifecycleRecord {
  assertCandidateResourceId(resourceId);
  return withCandidateRegistryMutationLock("cleanup_execute", env, () =>
    withResourceLock(resourceId, "cleanup_execute", env, () => {
      const current = readLifecycleRecord(resourceId, env);
      const currentInventory = inventoryCandidatePeerResources({
        registryDir: getCandidatePeerRegistryDir(env),
      });
      const inventoryBlockers = candidateCurrentInventoryBindingBlockers(current, currentInventory);
      if (inventoryBlockers.length > 0) {
        throw new Error(
          `candidate registry inventory drifted before cleanup: ${inventoryBlockers.join("; ")}`,
        );
      }
      const unregisteredEntrants = listCandidateAdmissionPermits(env).filter(
        (permit) =>
          permit.status === "reserved" &&
          permit.peerRunId &&
          permit.worktreePath === current.worktreePath &&
          !current.aliases.includes(permit.peerRunId),
      );
      if (unregisteredEntrants.length > 0) {
        throw new Error(
          `candidate admission entered the resource before registry publication: ${unregisteredEntrants
            .map((permit) => permit.peerRunId)
            .sort()
            .join(",")}`,
        );
      }
      if (!["cleanup_authorized", "cleanup_partial"].includes(current.state))
        throw new Error(`resource is not cleanup-authorized or retryable: ${current.state}`);
      const auth = assertCleanupAuthorization(current);
      if (!current.reviewSnapshot || !current.archive || !current.disposition)
        throw new Error("cleanup bindings are incomplete");
      verifyPublishedArchive(current);
      const repoRoot = current.repoRoots[0];
      if (!repoRoot) throw new Error("owner repo root is ambiguous or missing");
      let events = readCleanupEvents(resourceId, env).events;
      const observations = cleanupObservations(events, auth.authorizationDigest);
      const removeObserved = observations.has("remove_worktree");
      if (existsSync(current.worktreePath)) {
        const currentSnapshot = captureCandidateReviewSnapshot(current);
        if (currentSnapshot.contentDigest !== current.reviewSnapshot.contentDigest)
          throw new Error("candidate drifted after cleanup authorization");
        if (realpathSync(current.worktreePath) !== auth.expectedWorktreeRealPath)
          throw new Error("worktree realpath drifted");
        if (candidateGitCommonDir(current.worktreePath) !== auth.expectedGitCommonDir) {
          throw new Error("candidate Git common directory drifted before cleanup");
        }
        if (removeObserved)
          throw new Error("removed candidate worktree reappeared after observation");
        const pids = activeProcessPids(auth.expectedWorktreeRealPath);
        if (pids.length > 0)
          throw new Error(`candidate has active process leases: ${pids.join(",")}`);
      } else if (!removeObserved) {
        const intended = events.some(
          (event) =>
            event.event === "cleanup_effect_intent" &&
            event.effect === "remove_worktree" &&
            event.authorizationDigest === auth.authorizationDigest,
        );
        if (!intended) throw new Error("candidate worktree disappeared without cleanup intent");
      }

      const performEffect = (effect: CandidateCleanupEffect): CleanupEffectEvent => {
        const observed = observations.get(effect);
        if (observed) {
          const stillPresent =
            effect === "remove_worktree"
              ? existsSync(current.worktreePath)
              : branchOid(repoRoot, auth.branchName) !== undefined;
          if (stillPresent) throw new Error(`cleanup effect postcondition drifted: ${effect}`);
          return observed;
        }
        const priorIntent = [...events]
          .reverse()
          .find(
            (event) =>
              event.event === "cleanup_effect_intent" &&
              event.effect === effect &&
              event.authorizationDigest === auth.authorizationDigest,
          ) as CleanupEffectEvent | undefined;
        const effectPresent =
          effect === "remove_worktree"
            ? existsSync(current.worktreePath)
            : branchOid(repoRoot, auth.branchName) !== undefined;
        if (!priorIntent && !effectPresent) {
          throw new Error(`cleanup effect target disappeared without durable intent: ${effect}`);
        }
        const attemptId = priorIntent?.attemptId ?? randomUUID();
        if (!priorIntent) {
          const intent: CleanupEffectEvent = {
            event: "cleanup_effect_intent",
            effect,
            authorizationDigest: auth.authorizationDigest,
            attemptId,
            at: new Date().toISOString(),
          };
          appendLifecycleEvent(resourceId, intent, env);
          events = [...events, intent];
        }
        let recoveredAfterCrash = false;
        if (effect === "remove_worktree") {
          if (existsSync(current.worktreePath)) {
            run("git", ["-C", repoRoot, "worktree", "remove", "--force", current.worktreePath]);
          } else {
            recoveredAfterCrash = true;
          }
          return appendCleanupObservation(
            resourceId,
            {
              effect,
              authorizationDigest: auth.authorizationDigest,
              attemptId,
              recoveredAfterCrash,
              worktreePath: current.worktreePath,
            },
            env,
          );
        }
        const oid = branchOid(repoRoot, auth.branchName);
        if (oid !== undefined) {
          if (oid !== auth.branchOid) throw new Error("branch OID changed before exact deletion");
          run("git", ["-C", repoRoot, "branch", "-D", auth.branchName]);
        } else {
          recoveredAfterCrash = true;
        }
        return appendCleanupObservation(
          resourceId,
          {
            effect,
            authorizationDigest: auth.authorizationDigest,
            attemptId,
            recoveredAfterCrash,
            branchName: auth.branchName,
            branchOid: auth.branchOid,
          },
          env,
        );
      };

      let failure: unknown;
      try {
        observations.set("remove_worktree", performEffect("remove_worktree"));
        observations.set("delete_branch", performEffect("delete_branch"));
      } catch (error) {
        failure = error;
      }
      const effects = REQUIRED_CLEANUP_EFFECTS.map((effect) => observations.get(effect)).filter(
        (effect): effect is CleanupEffectEvent => Boolean(effect),
      );
      const next = structuredClone(current);
      next.resourceVersion = current.resourceVersion + 1;
      next.state = failure ? "cleanup_partial" : "cleaned";
      const receiptBase = {
        schemaVersion: 2,
        type: failure ? "cleanup_partial" : "cleaned",
        resourceId,
        generationId: current.generationId,
        effects,
        at: new Date().toISOString(),
        archiveDigest: current.archive.archiveDigest,
        authorizationDigest: auth.authorizationDigest,
        ...(failure ? { failure: String(failure) } : {}),
      };
      next.terminalReceipt = { ...receiptBase, receiptDigest: digestObject(receiptBase) };
      const saved = writeLockedLifecycleRecord(
        current,
        next,
        failure ? "cleanup_partial" : "cleaned",
        env,
      );
      if (failure)
        throw new Error(`candidate cleanup stopped after partial effects: ${String(failure)}`);
      return saved;
    }),
  );
}

function verifyCleanedCandidateTerminalRecordAt(
  record: CandidateLifecycleRecord,
  env: NodeJS.ProcessEnv,
  archiveDir?: string,
  eventsPath?: string,
): string {
  assertCandidateResourceId(record.resourceId);
  assertCandidateGenerationId(record.generationId);
  if (record.state !== "cleaned" || !record.archive || !record.cleanupAuthorization)
    throw new Error("candidate terminal record is not a cleaned lifecycle-v2 record");
  const auth = record.cleanupAuthorization as CandidateCleanupAuthorization;
  if (
    auth.authorizationDigest !==
    digestObject(
      Object.fromEntries(Object.entries(auth).filter(([key]) => key !== "authorizationDigest")),
    )
  )
    throw new Error("candidate terminal cleanup authorization digest mismatch");
  exactCleanupEffects(auth.effects);
  const receipt = record.terminalReceipt as Record<string, unknown> | undefined;
  if (!receipt || receipt.type !== "cleaned" || receipt.schemaVersion !== 2)
    throw new Error("candidate terminal receipt schema mismatch");
  const receiptDigest = receipt.receiptDigest;
  const unsigned = Object.fromEntries(
    Object.entries(receipt).filter(([key]) => key !== "receiptDigest"),
  );
  if (receiptDigest !== digestObject(unsigned))
    throw new Error("candidate terminal receipt digest mismatch");
  if (
    receipt.archiveDigest !== record.archive.archiveDigest ||
    receipt.authorizationDigest !== auth.authorizationDigest
  )
    throw new Error("candidate terminal receipt binding mismatch");
  if (
    receipt.resourceId !== record.resourceId ||
    receipt.generationId !== record.generationId ||
    !Array.isArray(receipt.effects) ||
    canonicalTimestamp(String(receipt.at), "candidate terminal receipt time") <
      canonicalTimestamp(auth.issuedAt, "cleanup authorization issue time")
  ) {
    throw new Error("candidate terminal receipt identity or chronology mismatch");
  }
  verifyPublishedArchive(record, archiveDir);
  const eventScan = readCleanupEvents(record.resourceId, env, eventsPath);
  const observations = cleanupObservations(eventScan.events, auth.authorizationDigest);
  for (const effect of REQUIRED_CLEANUP_EFFECTS) {
    const observation = observations.get(effect);
    if (!observation) throw new Error(`candidate terminal effect observation missing: ${effect}`);
    const unsignedObservation = Object.fromEntries(
      Object.entries(observation).filter(([key]) => key !== "observationDigest"),
    );
    if (observation.observationDigest !== digestObject(unsignedObservation))
      throw new Error(`candidate terminal effect observation digest mismatch: ${effect}`);
    const receiptedObservation = (receipt.effects as CleanupEffectEvent[]).find(
      (item) => item.effect === effect,
    );
    if (
      !receiptedObservation ||
      receiptedObservation.observationDigest !== observation.observationDigest
    ) {
      throw new Error(`candidate terminal receipt omits exact effect observation: ${effect}`);
    }
  }
  const repoRoot = record.repoRoots[0];
  if (!repoRoot || existsSync(record.worktreePath) || branchOid(repoRoot, auth.branchName))
    throw new Error("candidate terminal cleanup postconditions are not satisfied");
  const finalEvent = eventScan.finalEvent;
  if (finalEvent?.event !== "cleaned" || digestObject(finalEvent.record) !== digestObject(record))
    throw new Error("candidate terminal record is not the final cleaned lifecycle event");
  return digestObject(record);
}

export function verifyCleanedCandidateTerminalRecord(
  record: CandidateLifecycleRecord,
  env: NodeJS.ProcessEnv = process.env,
  options: { allowPendingCompaction?: boolean } = {},
): string {
  const compacted = materializeTerminalCompaction(record, env, {
    allowPending: options.allowPendingCompaction,
  });
  try {
    return verifyCleanedCandidateTerminalRecordAt(
      record,
      env,
      compacted?.archiveDir,
      compacted?.eventsPath,
    );
  } finally {
    compacted?.cleanup();
  }
}

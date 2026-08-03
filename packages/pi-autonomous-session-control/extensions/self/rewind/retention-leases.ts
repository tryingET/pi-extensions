import { createHash, randomUUID } from "node:crypto";
import { execGitChecked, execGitStdout } from "./git-runner.ts";
import { getStoreHead } from "./keepalive-store.ts";
import { EMPTY_TREE_SHA, type GitRunner } from "./types.ts";

const ACTIVE_REWIND_REF_PREFIX = "refs/pi-rewind/active-sessions/";
const ACTIVE_REWIND_EPOCH_REF = "refs/pi-rewind/active-sessions-epoch";
const LEASE_MARKER = "asc-rewind-active-session";
const ZERO_OID = "0000000000000000000000000000000000000000";
const FULL_SHA1 = /^[a-f0-9]{40}$/;

interface RewindRetentionLease {
  marker: typeof LEASE_MARKER;
  schemaVersion: 1;
  sessionId: string;
  pid: number;
  currentCommitSha?: string;
  undoCommitSha?: string;
  updatedAt: string;
}

export interface ActiveRewindLeaseHead {
  refName: string;
  objectId: string;
}

export interface ActiveRewindRetentionLeases {
  ownLeaseRef: string;
  ownLeaseObjectId: string;
  activeSessionCount: number;
  protectedCommitShas: string[];
  expectedRefHeads: ActiveRewindLeaseHead[];
}

function activeLeaseRef(sessionId: string, pid: number): string {
  const identity = createHash("sha256").update(`${sessionId}\0${pid}`).digest("hex");
  return `${ACTIVE_REWIND_REF_PREFIX}${identity}`;
}

function processIsAlive(pid: number): boolean {
  if (!Number.isSafeInteger(pid) || pid < 1) return false;
  try {
    process.kill(pid, 0);
    return true;
  } catch {
    return false;
  }
}

function validOptionalCommit(value: unknown): value is string | undefined {
  return value === undefined || (typeof value === "string" && FULL_SHA1.test(value));
}

function parseLease(message: string, refName: string): RewindRetentionLease | undefined {
  try {
    const value = JSON.parse(message) as RewindRetentionLease;
    if (
      value.marker !== LEASE_MARKER ||
      value.schemaVersion !== 1 ||
      !value.sessionId ||
      !Number.isSafeInteger(value.pid) ||
      value.pid < 1 ||
      activeLeaseRef(value.sessionId, value.pid) !== refName ||
      !validOptionalCommit(value.currentCommitSha) ||
      !validOptionalCommit(value.undoCommitSha) ||
      typeof value.updatedAt !== "string" ||
      !Number.isFinite(Date.parse(value.updatedAt))
    ) {
      return undefined;
    }
    return value;
  } catch {
    return undefined;
  }
}

async function createLeaseCommit(git: GitRunner, lease: RewindRetentionLease): Promise<string> {
  const args = ["commit-tree", EMPTY_TREE_SHA];
  for (const commitSha of new Set([lease.currentCommitSha, lease.undoCommitSha])) {
    if (commitSha) args.push("-p", commitSha);
  }
  args.push("-m", JSON.stringify(lease));
  return execGitStdout(git, args);
}

async function createEpochCommit(git: GitRunner): Promise<string> {
  return execGitStdout(git, [
    "commit-tree",
    EMPTY_TREE_SHA,
    "-m",
    `asc rewind active-session epoch ${randomUUID()}`,
  ]);
}

async function runRefTransaction(git: GitRunner, commands: string[]): Promise<void> {
  await execGitChecked(git, ["update-ref", "--stdin"], {
    stdin: ["start", ...commands, "prepare", "commit", ""].join("\n"),
  });
}

async function publishLease(
  git: GitRunner,
  refName: string,
  lease: RewindRetentionLease,
): Promise<string> {
  let lastError: unknown;
  for (let attempt = 0; attempt < 5; attempt += 1) {
    const previous = await getStoreHead(git, refName);
    const previousEpoch = await getStoreHead(git, ACTIVE_REWIND_EPOCH_REF);
    const objectId = await createLeaseCommit(git, lease);
    const nextEpoch = await createEpochCommit(git);
    try {
      await runRefTransaction(git, [
        `update ${refName} ${objectId} ${previous ?? ZERO_OID}`,
        `update ${ACTIVE_REWIND_EPOCH_REF} ${nextEpoch} ${previousEpoch ?? ZERO_OID}`,
      ]);
      return objectId;
    } catch (error) {
      lastError = error;
    }
  }
  const detail = lastError instanceof Error ? lastError.message : String(lastError);
  throw new Error(`failed to publish rewind active-session ref: ${detail}`);
}

async function listActiveRefHeads(git: GitRunner): Promise<ActiveRewindLeaseHead[]> {
  const output = await execGitStdout(git, [
    "for-each-ref",
    "--format=%(refname)%00%(objectname)",
    ACTIVE_REWIND_REF_PREFIX,
  ]);
  if (!output) return [];
  return output
    .split("\n")
    .map((line) => {
      const [refName, objectId] = line.split("\0");
      return { refName, objectId };
    })
    .filter(
      (value): value is ActiveRewindLeaseHead =>
        value.refName.startsWith(ACTIVE_REWIND_REF_PREFIX) && FULL_SHA1.test(value.objectId),
    )
    .sort((left, right) => left.refName.localeCompare(right.refName));
}

async function readLeaseAtHead(
  git: GitRunner,
  head: ActiveRewindLeaseHead,
): Promise<RewindRetentionLease | undefined> {
  try {
    const message = await execGitStdout(git, ["show", "-s", "--format=%B", head.objectId]);
    return parseLease(message, head.refName);
  } catch {
    return undefined;
  }
}

async function deleteLeaseAtHead(git: GitRunner, head: ActiveRewindLeaseHead): Promise<boolean> {
  for (let attempt = 0; attempt < 3; attempt += 1) {
    const current = await getStoreHead(git, head.refName);
    if (current !== head.objectId) return false;
    const previousEpoch = await getStoreHead(git, ACTIVE_REWIND_EPOCH_REF);
    const nextEpoch = await createEpochCommit(git);
    try {
      await runRefTransaction(git, [
        `delete ${head.refName} ${head.objectId}`,
        `update ${ACTIVE_REWIND_EPOCH_REF} ${nextEpoch} ${previousEpoch ?? ZERO_OID}`,
      ]);
      return true;
    } catch {
      // Re-read both identities before the next bounded attempt.
    }
  }
  return false;
}

export async function publishAndCollectActiveRewindLeases({
  git,
  sessionId,
  currentCommitSha,
  undoCommitSha,
  now = Date.now(),
}: {
  git: GitRunner;
  sessionId: string;
  currentCommitSha?: string;
  undoCommitSha?: string;
  now?: number;
}): Promise<ActiveRewindRetentionLeases> {
  if (!sessionId.trim()) throw new Error("rewind retention lease requires a session id");
  const ownLeaseRef = activeLeaseRef(sessionId, process.pid);
  await publishLease(git, ownLeaseRef, {
    marker: LEASE_MARKER,
    schemaVersion: 1,
    sessionId,
    pid: process.pid,
    currentCommitSha,
    undoCommitSha,
    updatedAt: new Date(now).toISOString(),
  });

  for (let scanAttempt = 0; scanAttempt < 5; scanAttempt += 1) {
    const epochBefore = await getStoreHead(git, ACTIVE_REWIND_EPOCH_REF);
    if (!epochBefore) throw new Error("rewind active-session epoch is missing after publication");
    const heads = await listActiveRefHeads(git);
    const protectedCommitShas = new Set<string>();
    let activeSessionCount = 0;
    let collectionChanged = false;

    for (const head of heads) {
      const lease = await readLeaseAtHead(git, head);
      if (!lease) {
        // Keep malformed owner refs and verify the namespace epoch during the store transaction.
        continue;
      }
      if (!processIsAlive(lease.pid)) {
        await deleteLeaseAtHead(git, head);
        collectionChanged = true;
        continue;
      }
      activeSessionCount += 1;
      if (lease.currentCommitSha) protectedCommitShas.add(lease.currentCommitSha);
      if (lease.undoCommitSha) protectedCommitShas.add(lease.undoCommitSha);
    }

    const epochAfter = await getStoreHead(git, ACTIVE_REWIND_EPOCH_REF);
    if (collectionChanged || epochAfter !== epochBefore) continue;
    const collectedOwnLease = heads.find((head) => head.refName === ownLeaseRef);
    if (!collectedOwnLease) continue;
    return {
      ownLeaseRef,
      ownLeaseObjectId: collectedOwnLease.objectId,
      activeSessionCount,
      protectedCommitShas: [...protectedCommitShas],
      expectedRefHeads: [{ refName: ACTIVE_REWIND_EPOCH_REF, objectId: epochAfter }, ...heads],
    };
  }

  throw new Error("rewind active-session refs did not stabilize during collection");
}

export async function removeRewindRetentionLease(
  git: GitRunner | null,
  refName: string | undefined,
  expectedObjectId: string | undefined,
): Promise<void> {
  if (!git || !refName || !expectedObjectId) return;
  await deleteLeaseAtHead(git, { refName, objectId: expectedObjectId });
}

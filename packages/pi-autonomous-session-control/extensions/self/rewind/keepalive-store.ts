import { execGitChecked, execGitStdout } from "./git-runner.ts";
import { EMPTY_TREE_SHA, type GitRunner, REWIND_STORE_REF } from "./types.ts";

const LEGACY_ZERO_SHA = "0000000000000000000000000000000000000000";

export type RewriteStoreResult = "rewritten" | "preserved-empty";

export interface RewriteStoreDetailedResult {
  status: RewriteStoreResult;
  previousStoreHead?: string;
  storeHead?: string;
}

export interface ExpectedRefHead {
  refName: string;
  objectId: string;
}

export async function getStoreHead(
  git: GitRunner,
  storeRef = REWIND_STORE_REF,
): Promise<string | undefined> {
  const result = await git(["rev-parse", "--verify", storeRef]);
  if (result.code !== 0) {
    return undefined;
  }

  const value = result.stdout.trim();
  return value.length > 0 ? value : undefined;
}

export async function createStoreKeepaliveCommit(
  git: GitRunner,
  snapshotCommitSha: string,
  previousStoreHead?: string,
): Promise<string> {
  const args = ["commit-tree", EMPTY_TREE_SHA];

  if (previousStoreHead) {
    args.push("-p", previousStoreHead);
  }

  args.push("-p", snapshotCommitSha, "-m", "asc rewind store");
  return execGitStdout(git, args);
}

export async function appendSnapshotToStore(
  git: GitRunner,
  snapshotCommitSha: string,
  options: {
    retryCount?: number;
    storeRef?: string;
  } = {},
): Promise<string> {
  const retryCount = options.retryCount ?? 5;
  const storeRef = options.storeRef ?? REWIND_STORE_REF;
  let lastError: unknown;

  for (let attempt = 0; attempt < retryCount; attempt += 1) {
    const oldHead = await getStoreHead(git, storeRef);
    const keepaliveCommitSha = await createStoreKeepaliveCommit(git, snapshotCommitSha, oldHead);

    try {
      if (oldHead) {
        await execGitChecked(git, ["update-ref", storeRef, keepaliveCommitSha, oldHead]);
      } else {
        await execGitChecked(git, ["update-ref", storeRef, keepaliveCommitSha, LEGACY_ZERO_SHA]);
      }
      return keepaliveCommitSha;
    } catch (error) {
      lastError = error;
    }
  }

  const detail = lastError instanceof Error ? lastError.message : String(lastError);
  throw new Error(`failed to update rewind store ref: ${detail}`);
}

export async function rewriteStoreToLiveSetDetailed(
  git: GitRunner,
  liveCommitShas: string[],
  storeRef = REWIND_STORE_REF,
  expectedRefHeads: ExpectedRefHead[] = [],
): Promise<RewriteStoreDetailedResult> {
  const uniqueLiveCommits = [...new Set(liveCommitShas.filter(Boolean))];
  const oldHead = await getStoreHead(git, storeRef);
  if (uniqueLiveCommits.length === 0) {
    return {
      status: "preserved-empty",
      previousStoreHead: oldHead,
      storeHead: oldHead,
    };
  }

  let head: string | undefined;
  for (const commitSha of uniqueLiveCommits) {
    head = await createStoreKeepaliveCommit(git, commitSha, head);
  }

  if (!head) {
    return {
      status: "preserved-empty",
      previousStoreHead: oldHead,
      storeHead: oldHead,
    };
  }

  if (expectedRefHeads.length > 0) {
    const transaction = [
      "start",
      ...expectedRefHeads.map(({ refName, objectId }) => `verify ${refName} ${objectId}`),
      `update ${storeRef} ${head} ${oldHead ?? LEGACY_ZERO_SHA}`,
      "prepare",
      "commit",
      "",
    ].join("\n");
    await execGitChecked(git, ["update-ref", "--stdin"], { stdin: transaction });
  } else if (oldHead) {
    await execGitChecked(git, ["update-ref", storeRef, head, oldHead]);
  } else {
    await execGitChecked(git, ["update-ref", storeRef, head, LEGACY_ZERO_SHA]);
  }
  return {
    status: "rewritten",
    previousStoreHead: oldHead,
    storeHead: head,
  };
}

export async function rewriteStoreToLiveSet(
  git: GitRunner,
  liveCommitShas: string[],
  storeRef = REWIND_STORE_REF,
): Promise<RewriteStoreResult> {
  return (await rewriteStoreToLiveSetDetailed(git, liveCommitShas, storeRef)).status;
}

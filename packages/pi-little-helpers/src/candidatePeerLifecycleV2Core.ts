import { execFileSync } from "node:child_process";
import { createHash, randomUUID } from "node:crypto";
import { lstatSync, mkdirSync, realpathSync, renameSync, writeFileSync } from "node:fs";
import { homedir } from "node:os";
import { dirname, isAbsolute, join, resolve } from "node:path";

export const CANDIDATE_LIFECYCLE_SCHEMA_VERSION = 2 as const;
export type CandidateLifecycleState =
  | "open"
  | "review_pending"
  | "deferred"
  | "accepted"
  | "rejected"
  | "superseded"
  | "missing_investigation"
  | "reconciled_missing"
  | "integration_verified"
  | "archive_pending"
  | "archive_verified"
  | "cleanup_authorized"
  | "cleanup_partial"
  | "cleanup_partial_review"
  | "cleaned"
  | "closed_with_retained_effects";

export type CandidateDisposition = "accepted" | "rejected" | "superseded" | "deferred";

export type CandidateLifecycleAdoptionInput = {
  schemaVersion: 2;
  action: "adopt_existing_worktree";
  worktreePath: string;
  repoRoot: string;
  gitCommonDir: string;
  branchName: string;
  headOid: string;
  actor: string;
  rationale: string;
  expiresAt: string;
};

export type CandidateLifecycleAdoptionReceipt = {
  authorization: CandidateLifecycleAdoptionInput;
  authorizationDigest: string;
  registryInventoryDigest: string;
  adoptedAt: string;
};

export type CandidateInventoryResource = {
  resourceId: string;
  generationId: string;
  worktreePath: string;
  worktreeRealPath?: string;
  exists: boolean;
  aliases: string[];
  repoRoots: string[];
  branchNames: string[];
  recordedHeads: string[];
  createdAt: string;
  updatedAt: string;
  sizeBytes?: number;
  anomalies: string[];
};

export type CandidateLifecycleInventory = {
  schemaVersion: 2;
  capturedAt: string;
  registryDir: string;
  registryRecordCount: number;
  resourceCount: number;
  existingResourceCount: number;
  missingResourceCount: number;
  totalMeasuredBytes: number;
  digest: string;
  resources: CandidateInventoryResource[];
};

export type CandidateSnapshotObject = {
  path: string;
  source: "tracked-change" | "untracked" | "ignored";
  type: "file" | "symlink" | "directory" | "missing";
  mode?: number;
  size?: number;
  sha256?: string;
  symlinkTarget?: string;
};

export type CandidateReviewSnapshot = {
  schemaVersion: 2;
  resourceId: string;
  generationId: string;
  capturedAt: string;
  worktreePath: string;
  worktreeRealPath: string;
  repoRoot: string;
  gitCommonDir: string;
  branchName: string;
  headOid: string;
  indexTreeOid: string;
  statusSha256: string;
  unstagedPatchSha256: string;
  stagedPatchSha256: string;
  aliases: string[];
  objects: CandidateSnapshotObject[];
  blockers: string[];
  contentDigest: string;
  snapshotDigest: string;
};

export type CandidateDispositionReceipt = {
  disposition: CandidateDisposition;
  actor: string;
  rationale: string;
  issuedAt: string;
  reviewSnapshotDigest: string;
  selectedCommits?: string[];
  selectedPaths?: string[];
  excludedPaths?: string[];
  discardIgnoredPaths?: string[];
  nextReviewAt?: string;
  validationRefs?: string[];
  receiptDigest: string;
};

export type CandidateIntegrationProof = {
  form: "commit_inclusion" | "patch_equivalence" | "content_coverage";
  actor: string;
  issuedAt: string;
  targetRepoRoot: string;
  targetOid: string;
  candidateRepoRoot?: string;
  candidateHeadOid?: string;
  selectedCommits: string[];
  targetIntegrationCommits?: string[];
  patchIds?: string[];
  coverageDigest?: string;
  selectedPaths?: string[];
  exclusions?: string[];
  validationRefs: string[];
  proofDigest: string;
};

export type CandidateLifecycleRecord = {
  schemaVersion: 2;
  resourceId: string;
  generationId: string;
  resourceVersion: number;
  state: CandidateLifecycleState;
  createdAt: string;
  updatedAt: string;
  worktreePath: string;
  aliases: string[];
  repoRoots: string[];
  branchNames: string[];
  migrationInventoryDigest: string;
  adoption?: CandidateLifecycleAdoptionReceipt;
  reviewSnapshot?: CandidateReviewSnapshot;
  disposition?: CandidateDispositionReceipt;
  integrationProof?: CandidateIntegrationProof;
  archive?: { archiveDir: string; archiveDigest: string; verifiedAt: string };
  cleanupAuthorization?: Record<string, unknown>;
  terminalReceipt?: Record<string, unknown>;
};

export function sha256(value: string | Buffer): string {
  return createHash("sha256").update(value).digest("hex");
}

function stableValue(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(stableValue);
  if (value && typeof value === "object") {
    return Object.fromEntries(
      Object.entries(value as Record<string, unknown>)
        .filter(([, item]) => item !== undefined)
        .sort(([a], [b]) => a.localeCompare(b))
        .map(([key, item]) => [key, stableValue(item)]),
    );
  }
  return value;
}

export function stableJson(value: unknown): string {
  return JSON.stringify(stableValue(value));
}

export function digestObject(value: unknown): string {
  return sha256(stableJson(value));
}

export function getCandidateLifecycleRoot(env: NodeJS.ProcessEnv = process.env): string {
  const stateHome = env.XDG_STATE_HOME?.trim() || join(homedir(), ".local", "state");
  return join(stateHome, "pi-quests", "candidate-lifecycle-v2");
}

export function assertCandidateResourceId(resourceId: string): string {
  if (!/^cpr-[a-f0-9]{24}$/.test(resourceId)) {
    throw new Error(
      "candidate lifecycle resource id must match cpr- plus 24 lowercase hex characters",
    );
  }
  return resourceId;
}

export function assertCandidateGenerationId(generationId: string): string {
  if (!/^gen-v1-[a-f0-9]{20}$/.test(generationId)) {
    throw new Error(
      "candidate lifecycle generation id must match gen-v1- plus 20 lowercase hex characters",
    );
  }
  return generationId;
}

export function getCandidateLifecycleRecordPath(
  resourceId: string,
  env: NodeJS.ProcessEnv = process.env,
): string {
  return join(
    getCandidateLifecycleRoot(env),
    "resources",
    assertCandidateResourceId(resourceId),
    "record.json",
  );
}

export function getCandidateLifecycleEventsPath(
  resourceId: string,
  env: NodeJS.ProcessEnv = process.env,
): string {
  return join(
    getCandidateLifecycleRoot(env),
    "resources",
    assertCandidateResourceId(resourceId),
    "events.jsonl",
  );
}

export function safeRealpath(path: string): string | undefined {
  try {
    return realpathSync(path);
  } catch {
    return undefined;
  }
}

export function lexicalPathExists(path: string): boolean {
  try {
    lstatSync(path);
    return true;
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") return false;
    throw error;
  }
}

export function assertOwnerOnlyDirectory(path: string): void {
  const normalized = resolve(path);
  if (!isAbsolute(path) || normalized !== path) {
    throw new Error(`lifecycle directory path is not absolute and normalized: ${path}`);
  }
  const missing: string[] = [];
  let cursor = normalized;
  while (!lexicalPathExists(cursor)) {
    missing.push(cursor);
    const parent = dirname(cursor);
    if (parent === cursor) throw new Error(`lifecycle directory has no existing ancestor: ${path}`);
    cursor = parent;
  }
  const ancestor = lstatSync(cursor);
  if (!ancestor.isDirectory() || ancestor.isSymbolicLink() || realpathSync(cursor) !== cursor) {
    throw new Error(`lifecycle directory ancestor is not canonical: ${cursor}`);
  }
  for (const directory of missing.reverse()) mkdirSync(directory, { mode: 0o700 });
  const info = lstatSync(normalized);
  if (!info.isDirectory() || info.isSymbolicLink() || realpathSync(normalized) !== normalized) {
    throw new Error(`lifecycle directory is not a canonical directory: ${path}`);
  }
  if ((info.mode & 0o077) !== 0) {
    throw new Error(`lifecycle directory is not owner-only: ${path}`);
  }
}

export function atomicJson(path: string, value: unknown): void {
  assertOwnerOnlyDirectory(dirname(path));
  const temp = `${path}.${process.pid}.${randomUUID()}.tmp`;
  writeFileSync(temp, `${JSON.stringify(value, null, 2)}\n`, { mode: 0o600, flag: "wx" });
  renameSync(temp, path);
}

export function git(
  cwd: string,
  args: string[],
  encoding: BufferEncoding | "buffer" = "utf8",
): string | Buffer {
  return execFileSync("git", ["-C", cwd, ...args], {
    encoding: encoding === "buffer" ? null : encoding,
    maxBuffer: 1024 * 1024 * 1024,
  }) as string | Buffer;
}

export function nulPaths(value: Buffer): string[] {
  return value.toString("utf8").split("\0").filter(Boolean).sort();
}

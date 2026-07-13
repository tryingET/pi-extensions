import { execFileSync } from "node:child_process";
import { createHash, randomUUID } from "node:crypto";
import {
  closeSync,
  existsSync,
  lstatSync,
  mkdirSync,
  openSync,
  readdirSync,
  readFileSync,
  readlinkSync,
  realpathSync,
  renameSync,
  statSync,
  unlinkSync,
  writeFileSync,
} from "node:fs";
import { homedir } from "node:os";
import { basename, dirname, isAbsolute, join, relative, resolve, sep } from "node:path";
import type { CandidatePeerRegistryRecord } from "./candidatePeerRegistry.ts";

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
  selectedCommits: string[];
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
  reviewSnapshot?: CandidateReviewSnapshot;
  disposition?: CandidateDispositionReceipt;
  integrationProof?: CandidateIntegrationProof;
  archive?: { archiveDir: string; archiveDigest: string; verifiedAt: string };
  cleanupAuthorization?: Record<string, unknown>;
  terminalReceipt?: Record<string, unknown>;
};

function sha256(value: string | Buffer): string {
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

export function getCandidateLifecycleRecordPath(
  resourceId: string,
  env: NodeJS.ProcessEnv = process.env,
): string {
  return join(getCandidateLifecycleRoot(env), "resources", resourceId, "record.json");
}

export function getCandidateLifecycleEventsPath(
  resourceId: string,
  env: NodeJS.ProcessEnv = process.env,
): string {
  return join(getCandidateLifecycleRoot(env), "resources", resourceId, "events.jsonl");
}

function safeRealpath(path: string): string | undefined {
  try {
    return realpathSync(path);
  } catch {
    return undefined;
  }
}

function directorySize(path: string): number {
  let total = 0;
  const stack = [path];
  while (stack.length > 0) {
    const current = stack.pop() as string;
    const entries = (() => {
      try {
        return readdirSync(current, { withFileTypes: true });
      } catch {
        return [];
      }
    })();
    for (const entry of entries) {
      const child = join(current, entry.name);
      try {
        const info = lstatSync(child);
        total += info.size;
        if (entry.isDirectory() && !entry.isSymbolicLink()) stack.push(child);
      } catch {
        // Inventory is observational; unreadable paths are represented by an anomaly later.
      }
    }
  }
  return total;
}

function readRegistryRecords(registryDir: string): CandidatePeerRegistryRecord[] {
  if (!existsSync(registryDir)) return [];
  return readdirSync(registryDir)
    .filter((name) => name.endsWith(".json"))
    .sort()
    .map(
      (name) =>
        JSON.parse(readFileSync(join(registryDir, name), "utf8")) as CandidatePeerRegistryRecord,
    );
}

export function inventoryCandidatePeerResources({
  registryDir,
  now = new Date().toISOString(),
  measureBytes = false,
}: {
  registryDir: string;
  now?: string;
  measureBytes?: boolean;
}): CandidateLifecycleInventory {
  const records = readRegistryRecords(registryDir);
  const groups = new Map<string, CandidatePeerRegistryRecord[]>();
  for (const record of records) {
    const key = resolve(record.worktreePath);
    const group = groups.get(key) ?? [];
    group.push(record);
    groups.set(key, group);
  }
  const resources = [...groups.entries()]
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([worktreePath, aliases]) => {
      const aliasIds = [...new Set(aliases.map((record) => record.peerRunId))].sort();
      const repoRoots = [...new Set(aliases.map((record) => resolve(record.repoRoot)))].sort();
      const branchNames = [...new Set(aliases.map((record) => record.branchName))].sort();
      const recordedHeads = [
        ...new Set(aliases.map((record) => record.baseRef).filter(Boolean)),
      ].sort();
      const exists = existsSync(worktreePath);
      const worktreeRealPath = exists ? safeRealpath(worktreePath) : undefined;
      const identitySeed = `${repoRoots.join("\0")}\0${worktreePath}`;
      const generationSeed = `${identitySeed}\0${branchNames.join("\0")}`;
      const anomalies: string[] = [];
      if (repoRoots.length !== 1) anomalies.push("multiple_repo_roots");
      if (branchNames.length !== 1) anomalies.push("multiple_branch_names");
      if (exists && !worktreeRealPath) anomalies.push("unresolvable_worktree_realpath");
      return {
        resourceId: `cpr-${sha256(identitySeed).slice(0, 24)}`,
        generationId: `gen-v1-${sha256(generationSeed).slice(0, 20)}`,
        worktreePath,
        worktreeRealPath,
        exists,
        aliases: aliasIds,
        repoRoots,
        branchNames,
        recordedHeads,
        createdAt: aliases.map((record) => record.createdAt).sort()[0] ?? now,
        updatedAt:
          aliases
            .map((record) => record.updatedAt)
            .sort()
            .at(-1) ?? now,
        sizeBytes: exists && measureBytes ? directorySize(worktreePath) : undefined,
        anomalies,
      } satisfies CandidateInventoryResource;
    });
  const unsigned = {
    schemaVersion: CANDIDATE_LIFECYCLE_SCHEMA_VERSION,
    capturedAt: now,
    registryDir: resolve(registryDir),
    registryRecordCount: records.length,
    resourceCount: resources.length,
    existingResourceCount: resources.filter((item) => item.exists).length,
    missingResourceCount: resources.filter((item) => !item.exists).length,
    totalMeasuredBytes: resources.reduce((sum, item) => sum + (item.sizeBytes ?? 0), 0),
    resources,
  };
  return { ...unsigned, digest: digestObject(unsigned) };
}

function assertOwnerOnlyDirectory(path: string): void {
  mkdirSync(path, { recursive: true, mode: 0o700 });
  const mode = statSync(path).mode & 0o777;
  if ((mode & 0o077) !== 0) throw new Error(`lifecycle directory is not owner-only: ${path}`);
}

function atomicJson(path: string, value: unknown): void {
  assertOwnerOnlyDirectory(dirname(path));
  const temp = `${path}.${process.pid}.${randomUUID()}.tmp`;
  writeFileSync(temp, `${JSON.stringify(value, null, 2)}\n`, { mode: 0o600, flag: "wx" });
  renameSync(temp, path);
}

export function migrateCandidateInventory(
  inventory: CandidateLifecycleInventory,
  env: NodeJS.ProcessEnv = process.env,
): CandidateLifecycleRecord[] {
  const results: CandidateLifecycleRecord[] = [];
  for (const resource of inventory.resources) {
    const path = getCandidateLifecycleRecordPath(resource.resourceId, env);
    if (existsSync(path)) {
      const existing = JSON.parse(readFileSync(path, "utf8")) as CandidateLifecycleRecord;
      if (
        existing.generationId !== resource.generationId ||
        existing.worktreePath !== resource.worktreePath
      ) {
        throw new Error(`resource identity drift for ${resource.resourceId}`);
      }
      results.push(existing);
      continue;
    }
    const record: CandidateLifecycleRecord = {
      schemaVersion: 2,
      resourceId: resource.resourceId,
      generationId: resource.generationId,
      resourceVersion: 1,
      state: resource.exists ? "review_pending" : "missing_investigation",
      createdAt: resource.createdAt,
      updatedAt: inventory.capturedAt,
      worktreePath: resource.worktreePath,
      aliases: resource.aliases,
      repoRoots: resource.repoRoots,
      branchNames: resource.branchNames,
      migrationInventoryDigest: inventory.digest,
    };
    atomicJson(path, record);
    appendLifecycleEvent(
      record.resourceId,
      { event: "migrated_v1", at: inventory.capturedAt, record },
      env,
    );
    results.push(record);
  }
  return results;
}

export function readLifecycleRecord(
  resourceId: string,
  env: NodeJS.ProcessEnv = process.env,
): CandidateLifecycleRecord {
  return JSON.parse(
    readFileSync(getCandidateLifecycleRecordPath(resourceId, env), "utf8"),
  ) as CandidateLifecycleRecord;
}

export function writeLockedLifecycleRecord(
  previous: CandidateLifecycleRecord,
  next: CandidateLifecycleRecord,
  event: string,
  env: NodeJS.ProcessEnv = process.env,
): CandidateLifecycleRecord {
  if (next.resourceId !== previous.resourceId || next.generationId !== previous.generationId) {
    throw new Error("immutable resource identity changed");
  }
  if (next.resourceVersion !== previous.resourceVersion + 1) {
    throw new Error("locked lifecycle write must increment resourceVersion exactly once");
  }
  next.updatedAt = new Date().toISOString();
  atomicJson(getCandidateLifecycleRecordPath(next.resourceId, env), next);
  appendLifecycleEvent(
    next.resourceId,
    { event, at: next.updatedAt, fromVersion: previous.resourceVersion, record: next },
    env,
  );
  return next;
}

export function updateLifecycleRecord({
  resourceId,
  expectedVersion,
  event,
  mutate,
  env = process.env,
}: {
  resourceId: string;
  expectedVersion: number;
  event: string;
  mutate: (record: CandidateLifecycleRecord) => CandidateLifecycleRecord;
  env?: NodeJS.ProcessEnv;
}): CandidateLifecycleRecord {
  return withResourceLock(resourceId, event, env, () => {
    const current = readLifecycleRecord(resourceId, env);
    if (current.resourceVersion !== expectedVersion) {
      throw new Error(
        `resourceVersion CAS failed: expected ${expectedVersion}, found ${current.resourceVersion}`,
      );
    }
    const next = mutate(structuredClone(current));
    if (next.resourceId !== current.resourceId || next.generationId !== current.generationId) {
      throw new Error("immutable resource identity changed");
    }
    next.resourceVersion = current.resourceVersion + 1;
    next.updatedAt = new Date().toISOString();
    atomicJson(getCandidateLifecycleRecordPath(resourceId, env), next);
    appendLifecycleEvent(
      resourceId,
      { event, at: next.updatedAt, fromVersion: current.resourceVersion, record: next },
      env,
    );
    return next;
  });
}

export function appendLifecycleEvent(
  resourceId: string,
  event: Record<string, unknown>,
  env: NodeJS.ProcessEnv = process.env,
): void {
  const path = getCandidateLifecycleEventsPath(resourceId, env);
  assertOwnerOnlyDirectory(dirname(path));
  const fd = openSync(path, "a", 0o600);
  try {
    writeFileSync(fd, `${JSON.stringify(event)}\n`);
  } finally {
    closeSync(fd);
  }
}

export function withResourceLock<T>(
  resourceId: string,
  operation: string,
  env: NodeJS.ProcessEnv,
  fn: () => T,
): T {
  const lockDir = join(getCandidateLifecycleRoot(env), "locks");
  assertOwnerOnlyDirectory(lockDir);
  const lockPath = join(lockDir, `${resourceId}.lock`);
  try {
    mkdirSync(lockPath, { mode: 0o700 });
  } catch {
    throw new Error(`candidate lifecycle resource is locked: ${resourceId}`);
  }
  try {
    atomicJson(join(lockPath, "lease.json"), {
      resourceId,
      operation,
      pid: process.pid,
      acquiredAt: new Date().toISOString(),
    });
    return fn();
  } finally {
    try {
      unlinkSync(join(lockPath, "lease.json"));
    } catch {
      // The lock directory remains fail-closed if its lease unexpectedly disappears.
    }
    try {
      // rmdirSync intentionally omitted from imports until cleanup to keep lock removal exact.
      execFileSync("rmdir", [lockPath]);
    } catch {
      // A non-empty lock is evidence requiring owner recovery, not permission to break it.
    }
  }
}

function git(
  cwd: string,
  args: string[],
  encoding: BufferEncoding | "buffer" = "utf8",
): string | Buffer {
  return execFileSync("git", ["-C", cwd, ...args], {
    encoding: encoding === "buffer" ? null : encoding,
    maxBuffer: 1024 * 1024 * 1024,
  }) as string | Buffer;
}

function nulPaths(value: Buffer): string[] {
  return value.toString("utf8").split("\0").filter(Boolean).sort();
}

function objectManifest(
  worktreeRoot: string,
  paths: Array<{ path: string; source: CandidateSnapshotObject["source"] }>,
): { objects: CandidateSnapshotObject[]; blockers: string[] } {
  const objects: CandidateSnapshotObject[] = [];
  const blockers: string[] = [];
  for (const item of paths.sort((a, b) => a.path.localeCompare(b.path))) {
    if (item.path.includes("\0") || isAbsolute(item.path) || item.path.split(sep).includes("..")) {
      blockers.push(`unsafe_path:${item.path}`);
      continue;
    }
    const fullPath = resolve(worktreeRoot, item.path);
    const rel = relative(worktreeRoot, fullPath);
    if (rel.startsWith("..") || isAbsolute(rel)) {
      blockers.push(`path_escape:${item.path}`);
      continue;
    }
    if (!existsSync(fullPath) && !safeRealpath(fullPath)) {
      objects.push({ path: item.path, source: item.source, type: "missing" });
      continue;
    }
    const info = lstatSync(fullPath);
    const mode = info.mode & 0o7777;
    if (info.isSymbolicLink()) {
      const target = readlinkSync(fullPath);
      const resolvedTarget = resolve(dirname(fullPath), target);
      const targetRel = relative(worktreeRoot, resolvedTarget);
      if (isAbsolute(target) || targetRel.startsWith("..") || isAbsolute(targetRel)) {
        blockers.push(`symlink_escape:${item.path}`);
      }
      objects.push({
        path: item.path,
        source: item.source,
        type: "symlink",
        mode,
        size: info.size,
        symlinkTarget: target,
        sha256: sha256(target),
      });
    } else if (info.isFile()) {
      objects.push({
        path: item.path,
        source: item.source,
        type: "file",
        mode,
        size: info.size,
        sha256: sha256(readFileSync(fullPath)),
      });
    } else if (info.isDirectory()) {
      if (existsSync(join(fullPath, ".git"))) blockers.push(`nested_repository:${item.path}`);
      objects.push({
        path: item.path,
        source: item.source,
        type: "directory",
        mode,
        size: info.size,
      });
    } else {
      blockers.push(`special_file:${item.path}`);
    }
  }
  return { objects, blockers };
}

export function captureCandidateReviewSnapshot(
  record: CandidateLifecycleRecord,
  now = new Date().toISOString(),
): CandidateReviewSnapshot {
  if (!existsSync(record.worktreePath)) throw new Error("candidate worktree is missing");
  const worktreeRealPath = realpathSync(record.worktreePath);
  const repoRoot = String(git(record.worktreePath, ["rev-parse", "--show-toplevel"])).trim();
  if (realpathSync(repoRoot) !== worktreeRealPath)
    throw new Error("recorded path is not the worktree root");
  const commonRaw = String(git(record.worktreePath, ["rev-parse", "--git-common-dir"])).trim();
  const gitCommonDir = realpathSync(resolve(record.worktreePath, commonRaw));
  const branchName = String(git(record.worktreePath, ["symbolic-ref", "--short", "HEAD"])).trim();
  const headOid = String(git(record.worktreePath, ["rev-parse", "HEAD"])).trim();
  const indexTreeOid = String(git(record.worktreePath, ["write-tree"])).trim();
  const status = git(
    record.worktreePath,
    ["status", "--porcelain=v1", "-z", "--branch", "--untracked-files=all"],
    "buffer",
  ) as Buffer;
  const unstagedPatch = git(
    record.worktreePath,
    ["diff", "--binary", "--no-ext-diff"],
    "buffer",
  ) as Buffer;
  const stagedPatch = git(
    record.worktreePath,
    ["diff", "--cached", "--binary", "--no-ext-diff"],
    "buffer",
  ) as Buffer;
  const changed = new Set([
    ...nulPaths(git(record.worktreePath, ["diff", "--name-only", "-z"], "buffer") as Buffer),
    ...nulPaths(
      git(record.worktreePath, ["diff", "--cached", "--name-only", "-z"], "buffer") as Buffer,
    ),
  ]);
  const untracked = nulPaths(
    git(
      record.worktreePath,
      ["ls-files", "--others", "--exclude-standard", "-z"],
      "buffer",
    ) as Buffer,
  );
  const ignored = nulPaths(
    git(
      record.worktreePath,
      ["ls-files", "--others", "--ignored", "--exclude-standard", "-z"],
      "buffer",
    ) as Buffer,
  );
  const manifest = objectManifest(record.worktreePath, [
    ...[...changed].map((path) => ({ path, source: "tracked-change" as const })),
    ...untracked.map((path) => ({ path, source: "untracked" as const })),
    ...ignored.map((path) => ({ path, source: "ignored" as const })),
  ]);
  const aliases = [...record.aliases].sort();
  const content = {
    headOid,
    indexTreeOid,
    statusSha256: sha256(status),
    unstagedPatchSha256: sha256(unstagedPatch),
    stagedPatchSha256: sha256(stagedPatch),
    aliases,
    objects: manifest.objects,
  };
  const unsigned = {
    schemaVersion: CANDIDATE_LIFECYCLE_SCHEMA_VERSION,
    resourceId: record.resourceId,
    generationId: record.generationId,
    capturedAt: now,
    worktreePath: record.worktreePath,
    worktreeRealPath,
    repoRoot,
    gitCommonDir,
    branchName,
    ...content,
    blockers: manifest.blockers,
    contentDigest: digestObject(content),
  };
  return { ...unsigned, snapshotDigest: digestObject(unsigned) };
}

export function createDispositionReceipt(
  input: Omit<CandidateDispositionReceipt, "receiptDigest">,
): CandidateDispositionReceipt {
  if (!input.actor.trim() || !input.rationale.trim())
    throw new Error("disposition requires actor and rationale");
  if (
    input.disposition === "accepted" &&
    !(input.selectedCommits?.length || input.selectedPaths?.length)
  ) {
    throw new Error("accepted disposition requires selected commits or paths");
  }
  if (input.disposition === "deferred" && !input.nextReviewAt)
    throw new Error("deferred disposition requires nextReviewAt");
  return { ...input, receiptDigest: digestObject(input) };
}

export function verifyCommitInclusionProof(
  input: Omit<CandidateIntegrationProof, "proofDigest" | "form">,
): CandidateIntegrationProof {
  const targetOid = String(
    git(input.targetRepoRoot, ["rev-parse", `${input.targetOid}^{commit}`]),
  ).trim();
  if (targetOid !== input.targetOid)
    throw new Error("targetOid must be the exact immutable commit OID");
  for (const commit of input.selectedCommits) {
    try {
      git(input.targetRepoRoot, ["merge-base", "--is-ancestor", commit, targetOid]);
    } catch {
      throw new Error(`selected commit is not included in target OID: ${commit}`);
    }
  }
  const proof = { ...input, form: "commit_inclusion" as const, targetOid };
  return { ...proof, proofDigest: digestObject(proof) };
}

export function reconcileMissingResource({
  record,
  expectedVersion,
  actor,
  recoverable,
  lost,
  evidence,
  env = process.env,
}: {
  record: CandidateLifecycleRecord;
  expectedVersion: number;
  actor: string;
  recoverable: string[];
  lost: string[];
  evidence: string[];
  env?: NodeJS.ProcessEnv;
}): CandidateLifecycleRecord {
  if (existsSync(record.worktreePath))
    throw new Error("resource is present; cannot reconcile missing");
  return updateLifecycleRecord({
    resourceId: record.resourceId,
    expectedVersion,
    event: "reconciled_missing",
    env,
    mutate(current) {
      if (current.state !== "missing_investigation")
        throw new Error(`invalid state for missing reconciliation: ${current.state}`);
      current.state = "reconciled_missing";
      current.terminalReceipt = {
        type: "reconciled_missing",
        actor,
        at: new Date().toISOString(),
        aliases: current.aliases,
        recoverable,
        lost,
        evidence,
        worktreePath: current.worktreePath,
        receiptDigest: digestObject({
          actor,
          recoverable,
          lost,
          evidence,
          worktreePath: current.worktreePath,
        }),
      };
      return current;
    },
  });
}

export function resourceName(resource: CandidateInventoryResource): string {
  return basename(resource.worktreePath);
}

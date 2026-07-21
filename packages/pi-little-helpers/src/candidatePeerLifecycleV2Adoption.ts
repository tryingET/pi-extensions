import { execFileSync } from "node:child_process";
import { randomUUID } from "node:crypto";
import {
  existsSync,
  lstatSync,
  mkdirSync,
  readFileSync,
  readdirSync,
  realpathSync,
  renameSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import { isAbsolute, join, resolve } from "node:path";
import {
  type CandidateLifecycleAdoptionInput,
  type CandidateLifecycleInventory,
  type CandidateLifecycleRecord,
  type CandidateReviewSnapshot,
  assertOwnerOnlyDirectory,
  digestObject,
  getCandidateLifecycleRoot,
  git,
  lexicalPathExists,
  safeRealpath,
  sha256,
  stableJson,
} from "./candidatePeerLifecycleV2Core.ts";
import { inventoryCandidatePeerResources } from "./candidatePeerLifecycleV2Inventory.ts";
import { captureCandidateReviewSnapshot } from "./candidatePeerLifecycleV2Review.ts";
import { withAdoptionLock, withResourceLock } from "./candidatePeerLifecycleV2State.ts";

const ADOPTION_INPUT_KEYS = [
  "action",
  "actor",
  "branchName",
  "expiresAt",
  "gitCommonDir",
  "headOid",
  "rationale",
  "repoRoot",
  "schemaVersion",
  "worktreePath",
] as const;

function canonicalUtcTimestamp(value: string, label: string): number {
  if (!/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/.test(value)) {
    throw new Error(`${label} must be a canonical UTC timestamp`);
  }
  const timestamp = Date.parse(value);
  if (!Number.isFinite(timestamp) || new Date(timestamp).toISOString() !== value) {
    throw new Error(`${label} must be a real canonical UTC timestamp`);
  }
  return timestamp;
}

function assertExactAdoptionInput(input: CandidateLifecycleAdoptionInput): void {
  if (!input || typeof input !== "object" || Array.isArray(input)) {
    throw new Error("adoption authorization must be an object");
  }
  const actualKeys = Object.keys(input).sort();
  if (stableJson(actualKeys) !== stableJson(ADOPTION_INPUT_KEYS)) {
    throw new Error(
      `adoption authorization must use the exact schema: ${ADOPTION_INPUT_KEYS.join(",")}`,
    );
  }
  if (input.schemaVersion !== 2 || input.action !== "adopt_existing_worktree") {
    throw new Error("adoption authorization schemaVersion/action mismatch");
  }
  for (const key of [
    "worktreePath",
    "repoRoot",
    "gitCommonDir",
    "branchName",
    "headOid",
    "actor",
    "rationale",
    "expiresAt",
  ] as const) {
    if (typeof input[key] !== "string" || !input[key]) {
      throw new Error(`adoption authorization requires non-empty ${key}`);
    }
  }
  if (input.actor !== input.actor.trim() || input.rationale !== input.rationale.trim()) {
    throw new Error(
      "adoption authorization actor and rationale must be canonical non-blank strings",
    );
  }
  if (!/^[a-f0-9]{40,64}$/.test(input.headOid)) {
    throw new Error("adoption authorization headOid must be an exact lowercase commit OID");
  }
}

function canonicalExistingDirectory(path: string, label: string): string {
  if (!isAbsolute(path) || resolve(path) !== path) {
    throw new Error(`${label} must be an absolute normalized path`);
  }
  let info: ReturnType<typeof lstatSync>;
  try {
    info = lstatSync(path);
  } catch {
    throw new Error(`${label} must identify an existing directory`);
  }
  if (!info.isDirectory() || info.isSymbolicLink() || realpathSync(path) !== path) {
    throw new Error(`${label} must be a canonical directory without symlink ambiguity`);
  }
  return path;
}

function parseWorktreeList(repoRoot: string): Array<Record<string, string | boolean>> {
  const raw = git(repoRoot, ["worktree", "list", "--porcelain", "-z"], "buffer") as Buffer;
  const records: Array<Record<string, string | boolean>> = [];
  let current: Record<string, string | boolean> | undefined;
  for (const field of raw.toString("utf8").split("\0")) {
    if (!field) continue;
    const separator = field.indexOf(" ");
    const key = separator < 0 ? field : field.slice(0, separator);
    const value = separator < 0 ? true : field.slice(separator + 1);
    if (key === "worktree") {
      current = { worktree: value };
      records.push(current);
    } else if (current) {
      current[key] = value;
    }
  }
  return records;
}

function assertAdoptionGitIdentity(
  input: CandidateLifecycleAdoptionInput,
  resourceId: string,
  generationId: string,
  capturedAt: string,
): CandidateReviewSnapshot {
  const worktreePath = canonicalExistingDirectory(input.worktreePath, "adoption worktreePath");
  const repoRoot = canonicalExistingDirectory(input.repoRoot, "adoption repoRoot");
  const expectedCommonDir = canonicalExistingDirectory(input.gitCommonDir, "adoption gitCommonDir");
  if (repoRoot === worktreePath) {
    throw new Error(
      "adoption repoRoot must be a durable owner worktree distinct from the candidate",
    );
  }
  const dotGit = lstatSync(join(worktreePath, ".git"));
  if (!dotGit.isFile() || dotGit.isSymbolicLink()) {
    throw new Error("adoption candidate must be a linked Git worktree");
  }
  const candidateTop = String(git(worktreePath, ["rev-parse", "--show-toplevel"])).trim();
  const ownerTop = String(git(repoRoot, ["rev-parse", "--show-toplevel"])).trim();
  if (candidateTop !== worktreePath || realpathSync(candidateTop) !== worktreePath) {
    throw new Error("adoption worktreePath is not the exact Git worktree root");
  }
  if (ownerTop !== repoRoot || realpathSync(ownerTop) !== repoRoot) {
    throw new Error("adoption repoRoot is not the exact owner Git worktree root");
  }
  const candidateCommonRaw = String(git(worktreePath, ["rev-parse", "--git-common-dir"])).trim();
  const ownerCommonRaw = String(git(repoRoot, ["rev-parse", "--git-common-dir"])).trim();
  const candidateCommonDir = realpathSync(resolve(worktreePath, candidateCommonRaw));
  const ownerCommonDir = realpathSync(resolve(repoRoot, ownerCommonRaw));
  if (candidateCommonDir !== expectedCommonDir || ownerCommonDir !== expectedCommonDir) {
    throw new Error("adoption Git common directory mismatch");
  }
  let branchName: string;
  try {
    branchName = String(git(worktreePath, ["symbolic-ref", "--quiet", "--short", "HEAD"])).trim();
  } catch {
    throw new Error("adoption candidate must not have detached HEAD");
  }
  const headOid = String(git(worktreePath, ["rev-parse", "--verify", "HEAD^{commit}"])).trim();
  const branchOid = String(
    git(repoRoot, ["rev-parse", "--verify", `refs/heads/${input.branchName}^{commit}`]),
  ).trim();
  if (branchName !== input.branchName) throw new Error("adoption branch mismatch");
  if (headOid !== input.headOid || branchOid !== input.headOid) {
    throw new Error("adoption HEAD or branch ref mismatch");
  }
  const listed = parseWorktreeList(repoRoot).filter((record) => record.worktree === worktreePath);
  if (
    listed.length !== 1 ||
    listed[0]?.detached === true ||
    listed[0]?.HEAD !== input.headOid ||
    listed[0]?.branch !== `refs/heads/${input.branchName}`
  ) {
    throw new Error("adoption candidate is not one exact registered Git worktree");
  }
  const status = git(
    worktreePath,
    ["status", "--porcelain=v1", "-z", "--untracked-files=all"],
    "buffer",
  ) as Buffer;
  if (status.length !== 0) throw new Error("adoption candidate worktree must be clean");
  const seed: CandidateLifecycleRecord = {
    schemaVersion: 2,
    resourceId,
    generationId,
    resourceVersion: 0,
    state: "review_pending",
    createdAt: "",
    updatedAt: "",
    worktreePath,
    aliases: [],
    repoRoots: [repoRoot],
    branchNames: [branchName],
    migrationInventoryDigest: "",
  };
  return captureCandidateReviewSnapshot(seed, capturedAt);
}

function assertNoRegistryAdoptionCollisions(
  inventory: CandidateLifecycleInventory,
  resourceId: string,
  generationId: string,
  worktreePath: string,
  repoRoot: string,
  branchName: string,
): void {
  for (const resource of inventory.resources) {
    if (resource.resourceId === resourceId) throw new Error("adoption registry resource collision");
    if (resource.generationId === generationId) {
      throw new Error("adoption registry generation collision");
    }
    const sameRepositoryBranch =
      resource.repoRoots.some((candidateRepoRoot) => resolve(candidateRepoRoot) === repoRoot) &&
      resource.branchNames.includes(branchName);
    if (
      resolve(resource.worktreePath) === worktreePath ||
      resource.worktreeRealPath === worktreePath ||
      sameRepositoryBranch
    ) {
      throw new Error("adoption registry duplicate for physical worktree identity");
    }
  }
}

function assertNoAdoptionCollisions(
  resourceId: string,
  generationId: string,
  worktreePath: string,
  repoRoot: string,
  branchName: string,
  env: NodeJS.ProcessEnv,
): void {
  const lifecycleRoot = getCandidateLifecycleRoot(env);
  const resourcesRoot = join(lifecycleRoot, "resources");
  assertOwnerOnlyDirectory(resourcesRoot);
  for (const entry of readdirSync(resourcesRoot, { withFileTypes: true })) {
    if (!entry.isDirectory() || entry.isSymbolicLink()) {
      throw new Error(`unexpected lifecycle resource entry: ${entry.name}`);
    }
    const path = join(resourcesRoot, entry.name, "record.json");
    if (!existsSync(path)) throw new Error(`lifecycle resource is incomplete: ${entry.name}`);
    const record = JSON.parse(readFileSync(path, "utf8")) as CandidateLifecycleRecord;
    if (record.resourceId === resourceId) throw new Error("adoption resource collision");
    if (record.generationId === generationId) throw new Error("adoption generation collision");
    const sameRepositoryBranch =
      record.repoRoots.some((candidateRepoRoot) => resolve(candidateRepoRoot) === repoRoot) &&
      record.branchNames.includes(branchName);
    if (
      resolve(record.worktreePath) === worktreePath ||
      safeRealpath(record.worktreePath) === worktreePath ||
      record.reviewSnapshot?.worktreeRealPath === worktreePath ||
      sameRepositoryBranch
    ) {
      throw new Error("adoption lifecycle duplicate for physical worktree identity");
    }
  }
  const archivesRoot = join(lifecycleRoot, "archives");
  if (lexicalPathExists(join(archivesRoot, resourceId))) {
    throw new Error("adoption archive resource collision");
  }
  if (lexicalPathExists(archivesRoot)) {
    const archiveRootInfo = lstatSync(archivesRoot);
    if (
      !archiveRootInfo.isDirectory() ||
      archiveRootInfo.isSymbolicLink() ||
      realpathSync(archivesRoot) !== archivesRoot
    ) {
      throw new Error("adoption archives root is not a canonical directory");
    }
    for (const entry of readdirSync(archivesRoot, { withFileTypes: true })) {
      if (lexicalPathExists(join(archivesRoot, entry.name, generationId))) {
        throw new Error("adoption archive generation collision");
      }
    }
  }
}


export function adoptExistingCandidateWorktree({
  input,
  registryDir,
  env = process.env,
  now = new Date().toISOString(),
  testHooks,
}: {
  input: CandidateLifecycleAdoptionInput;
  registryDir: string;
  env?: NodeJS.ProcessEnv;
  now?: string;
  testHooks?: {
    beforeAtomicPublication?: () => void;
    afterAtomicPublication?: () => void;
  };
}): CandidateLifecycleRecord {
  assertExactAdoptionInput(input);
  const adoptionTime = canonicalUtcTimestamp(now, "adoption time");
  const expiresAt = canonicalUtcTimestamp(input.expiresAt, "adoption authorization expiry");
  if (expiresAt <= adoptionTime || expiresAt <= Date.now()) {
    throw new Error("adoption authorization expired");
  }
  if (!isAbsolute(registryDir) || resolve(registryDir) !== registryDir) {
    throw new Error("adoption registryDir must be an absolute normalized path");
  }
  const identitySeed = `${input.repoRoot}\0${input.worktreePath}`;
  const generationSeed = `${identitySeed}\0${input.branchName}`;
  const resourceId = `cpr-${sha256(identitySeed).slice(0, 24)}`;
  const generationId = `gen-v1-${sha256(generationSeed).slice(0, 20)}`;
  const initialSnapshot = assertAdoptionGitIdentity(input, resourceId, generationId, now);
  const initialInventory = inventoryCandidatePeerResources({ registryDir, now });
  assertNoRegistryAdoptionCollisions(
    initialInventory,
    resourceId,
    generationId,
    input.worktreePath,
    input.repoRoot,
    input.branchName,
  );
  return withAdoptionLock(env, () => {
    assertNoAdoptionCollisions(
      resourceId,
      generationId,
      input.worktreePath,
      input.repoRoot,
      input.branchName,
      env,
    );
    const finalSnapshot = assertAdoptionGitIdentity(input, resourceId, generationId, now);
    if (finalSnapshot.snapshotDigest !== initialSnapshot.snapshotDigest) {
      throw new Error("adoption candidate identity or clean content drifted during verification");
    }
    const finalInventory = inventoryCandidatePeerResources({ registryDir, now });
    if (finalInventory.digest !== initialInventory.digest) {
      throw new Error("adoption registry inventory drifted during verification");
    }
    assertNoRegistryAdoptionCollisions(
      finalInventory,
      resourceId,
      generationId,
      input.worktreePath,
      input.repoRoot,
      input.branchName,
    );
    assertNoAdoptionCollisions(
      resourceId,
      generationId,
      input.worktreePath,
      input.repoRoot,
      input.branchName,
      env,
    );
    const authorization = structuredClone(input);
    const record: CandidateLifecycleRecord = {
      schemaVersion: 2,
      resourceId,
      generationId,
      resourceVersion: 1,
      state: "review_pending",
      createdAt: now,
      updatedAt: now,
      worktreePath: input.worktreePath,
      aliases: [],
      repoRoots: [input.repoRoot],
      branchNames: [input.branchName],
      migrationInventoryDigest: finalInventory.digest,
      reviewSnapshot: finalSnapshot,
      adoption: {
        authorization,
        authorizationDigest: digestObject(authorization),
        registryInventoryDigest: finalInventory.digest,
        adoptedAt: now,
      },
    };
    const lifecycleRoot = getCandidateLifecycleRoot(env);
    const resourcesRoot = join(lifecycleRoot, "resources");
    const stagingRoot = join(lifecycleRoot, "staging");
    assertOwnerOnlyDirectory(resourcesRoot);
    assertOwnerOnlyDirectory(stagingRoot);
    const finalDir = join(resourcesRoot, resourceId);
    const stage = join(stagingRoot, `${resourceId}.${process.pid}.${randomUUID()}.tmp`);
    // The exact resource lock spans provisional visibility through verification/rollback.
    // A hard process termination cannot run this catch path and leaves the lock fail-closed.
    return withResourceLock(resourceId, "adopt_existing_publish", env, () => {
      mkdirSync(stage, { mode: 0o700 });
      let published = false;
      try {
        const event = { event: "adopted_existing", at: now, record };
        writeFileSync(join(stage, "record.json"), `${JSON.stringify(record, null, 2)}\n`, {
          mode: 0o600,
          flag: "wx",
        });
        writeFileSync(join(stage, "events.jsonl"), `${JSON.stringify(event)}\n`, {
          mode: 0o600,
          flag: "wx",
        });
        const publicationSnapshot = assertAdoptionGitIdentity(input, resourceId, generationId, now);
        if (publicationSnapshot.snapshotDigest !== finalSnapshot.snapshotDigest) {
          throw new Error("adoption candidate drifted before atomic publication");
        }
        const publicationInventory = inventoryCandidatePeerResources({ registryDir, now });
        if (publicationInventory.digest !== initialInventory.digest) {
          throw new Error("adoption registry inventory drifted before atomic publication");
        }
        assertNoRegistryAdoptionCollisions(
          publicationInventory,
          resourceId,
          generationId,
          input.worktreePath,
          input.repoRoot,
          input.branchName,
        );
        assertNoAdoptionCollisions(
          resourceId,
          generationId,
          input.worktreePath,
          input.repoRoot,
          input.branchName,
          env,
        );
        if (expiresAt <= Date.now()) throw new Error("adoption authorization expired");
        testHooks?.beforeAtomicPublication?.();
        renameSync(stage, finalDir);
        published = true;
        testHooks?.afterAtomicPublication?.();

        assertOwnerOnlyDirectory(finalDir);
        const persistedRecord = JSON.parse(
          readFileSync(join(finalDir, "record.json"), "utf8"),
        ) as CandidateLifecycleRecord;
        if (stableJson(persistedRecord) !== stableJson(record)) {
          throw new Error("published adoption record changed during atomic publication");
        }
        if (readFileSync(join(finalDir, "events.jsonl"), "utf8") !== `${JSON.stringify(event)}\n`) {
          throw new Error("published adoption event changed during atomic publication");
        }
        const postPublicationSnapshot = assertAdoptionGitIdentity(
          input,
          resourceId,
          generationId,
          now,
        );
        if (postPublicationSnapshot.snapshotDigest !== finalSnapshot.snapshotDigest) {
          throw new Error("adoption candidate drifted across atomic publication");
        }
        const postPublicationInventory = inventoryCandidatePeerResources({ registryDir, now });
        if (postPublicationInventory.digest !== initialInventory.digest) {
          throw new Error("adoption registry inventory drifted across atomic publication");
        }
        assertNoRegistryAdoptionCollisions(
          postPublicationInventory,
          resourceId,
          generationId,
          input.worktreePath,
          input.repoRoot,
          input.branchName,
        );
        if (expiresAt <= Date.now()) throw new Error("adoption authorization expired");
        return record;
      } catch (error) {
        if (published) {
          const rollback = join(
            stagingRoot,
            `${resourceId}.${process.pid}.${randomUUID()}.rollback`,
          );
          try {
            renameSync(finalDir, rollback);
            rmSync(rollback, { recursive: true, force: true });
          } catch (rollbackError) {
            throw new AggregateError(
              [error, rollbackError],
              "post-publication adoption verification failed and atomic rollback failed",
            );
          }
        } else {
          rmSync(stage, { recursive: true, force: true });
        }
        throw error;
      }
    });
  });
}

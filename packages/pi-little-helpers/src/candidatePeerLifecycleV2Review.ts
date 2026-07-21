import { execFileSync } from "node:child_process";
import { existsSync, lstatSync, readFileSync, readlinkSync, realpathSync } from "node:fs";
import { dirname, isAbsolute, join, relative, resolve, sep } from "node:path";
import {
  CANDIDATE_LIFECYCLE_SCHEMA_VERSION,
  type CandidateDispositionReceipt,
  type CandidateIntegrationProof,
  type CandidateLifecycleRecord,
  type CandidateReviewSnapshot,
  type CandidateSnapshotObject,
  digestObject,
  git,
  nulPaths,
  safeRealpath,
  sha256,
  stableJson,
} from "./candidatePeerLifecycleV2Core.ts";

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
    ["diff", "--binary", "--full-index", "--no-ext-diff"],
    "buffer",
  ) as Buffer;
  const stagedPatch = git(
    record.worktreePath,
    ["diff", "--cached", "--binary", "--full-index", "--no-ext-diff"],
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
  // The caller validates review blockers against any explicit ignored-path discards.
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

export function unresolvedReviewBlockers(
  snapshot: CandidateReviewSnapshot,
  discardIgnoredPaths: string[] = [],
): string[] {
  const discard = new Set(discardIgnoredPaths);
  const ignored = new Set(
    snapshot.objects.filter((item) => item.source === "ignored").map((item) => item.path),
  );
  return snapshot.blockers.filter((blocker) => {
    const separator = blocker.indexOf(":");
    const kind = separator < 0 ? blocker : blocker.slice(0, separator);
    const path = separator < 0 ? "" : blocker.slice(separator + 1);
    return !(kind === "symlink_escape" && ignored.has(path) && discard.has(path));
  });
}

function exactSelection(actual: string[] = [], expected: string[] = []): boolean {
  return stableJson([...new Set(actual)].sort()) === stableJson([...new Set(expected)].sort());
}

export function assertIntegrationProofCoversDisposition(
  disposition: CandidateDispositionReceipt,
  reviewSnapshot: CandidateReviewSnapshot,
  proof: CandidateIntegrationProof,
): void {
  if (disposition.disposition !== "accepted") {
    throw new Error("integration proof requires an accepted disposition");
  }
  const selectedCommits = disposition.selectedCommits ?? [];
  const selectedPaths = disposition.selectedPaths ?? [];
  if (
    (selectedCommits.length > 0 && !exactSelection(proof.selectedCommits, selectedCommits)) ||
    (selectedPaths.length > 0 && !exactSelection(proof.selectedPaths, selectedPaths))
  ) {
    throw new Error("integration proof does not cover the exact accepted disposition selection");
  }
  if (
    !proof.candidateRepoRoot ||
    resolve(proof.candidateRepoRoot) !== resolve(reviewSnapshot.repoRoot) ||
    proof.candidateHeadOid !== reviewSnapshot.headOid
  ) {
    throw new Error(
      "integration proof candidate identity does not match the reviewed candidate HEAD",
    );
  }
  const reviewedHead = String(
    git(reviewSnapshot.repoRoot, ["rev-parse", `${reviewSnapshot.headOid}^{commit}`]),
  ).trim();
  if (reviewedHead !== reviewSnapshot.headOid) {
    throw new Error("reviewed candidate HEAD is not an exact immutable commit OID");
  }
  for (const commit of selectedCommits) {
    const exactCommit = String(
      git(reviewSnapshot.repoRoot, ["rev-parse", `${commit}^{commit}`]),
    ).trim();
    if (exactCommit !== commit || !/^[a-f0-9]{40}$/.test(commit)) {
      throw new Error(`accepted selected commit is not an exact candidate commit OID: ${commit}`);
    }
    try {
      git(reviewSnapshot.repoRoot, ["merge-base", "--is-ancestor", commit, reviewedHead]);
    } catch {
      throw new Error(
        `accepted selected commit is not contained in reviewed candidate HEAD: ${commit}`,
      );
    }
  }
}

export function verifyCommitInclusionProof(
  input: Omit<CandidateIntegrationProof, "proofDigest" | "form">,
): CandidateIntegrationProof {
  if (!input.selectedCommits.length) {
    throw new Error("commit-inclusion proof requires the accepted selected commits");
  }
  const targetOid = String(
    git(input.targetRepoRoot, ["rev-parse", `${input.targetOid}^{commit}`]),
  ).trim();
  if (targetOid !== input.targetOid)
    throw new Error("targetOid must be the exact immutable commit OID");
  for (const commit of input.selectedCommits) {
    const exactCommit = String(
      git(input.targetRepoRoot, ["rev-parse", `${commit}^{commit}`]),
    ).trim();
    if (exactCommit !== commit || !/^[a-f0-9]{40}$/.test(commit)) {
      throw new Error(`selected commit must be an exact immutable commit OID: ${commit}`);
    }
    try {
      git(input.targetRepoRoot, ["merge-base", "--is-ancestor", commit, targetOid]);
    } catch {
      throw new Error(`selected commit is not included in target OID: ${commit}`);
    }
  }
  const proof = { ...input, form: "commit_inclusion" as const, targetOid };
  return { ...proof, proofDigest: digestObject(proof) };
}

export function verifyPatchEquivalenceProof(input: {
  actor: string;
  issuedAt: string;
  candidateRepoRoot: string;
  candidateHeadOid: string;
  targetRepoRoot: string;
  targetOid: string;
  selectedPaths?: string[];
  exclusions?: string[];
  validationRefs: string[];
}): CandidateIntegrationProof {
  const targetOid = String(
    git(input.targetRepoRoot, ["rev-parse", `${input.targetOid}^{commit}`]),
  ).trim();
  const candidateHeadOid = String(
    git(input.candidateRepoRoot, ["rev-parse", `${input.candidateHeadOid}^{commit}`]),
  ).trim();
  if (targetOid !== input.targetOid || candidateHeadOid !== input.candidateHeadOid) {
    throw new Error("patch-equivalence proof requires exact immutable candidate and target OIDs");
  }
  const cherry = String(git(input.candidateRepoRoot, ["cherry", targetOid, candidateHeadOid]));
  const lines = cherry
    .trim()
    .split("\n")
    .map((line) => line.trim())
    .filter(Boolean);
  const nonEquivalent = lines.filter((line) => line.startsWith("+ "));
  if (nonEquivalent.length > 0) {
    throw new Error(
      `candidate commits are not patch-equivalent to target OID: ${nonEquivalent.join(", ")}`,
    );
  }
  const selectedCommits = lines.map((line) => line.slice(2).trim());
  if (selectedCommits.length === 0) {
    throw new Error(
      "patch-equivalence proof has no non-ancestor candidate commits; use commit inclusion",
    );
  }
  const patchIds = selectedCommits.map((commit) => {
    const patch = git(
      input.candidateRepoRoot,
      ["show", "--pretty=format:", "--binary", commit],
      "buffer",
    ) as Buffer;
    const result = execFileSync("git", ["patch-id", "--stable"], {
      cwd: input.candidateRepoRoot,
      input: patch,
      encoding: "utf8",
      maxBuffer: 1024 * 1024 * 1024,
    }).trim();
    const patchId = result.split(/\s+/)[0];
    if (!patchId) throw new Error(`could not derive stable patch-id for ${commit}`);
    return patchId;
  });
  const proof = {
    ...input,
    form: "patch_equivalence" as const,
    targetOid,
    candidateHeadOid,
    selectedCommits,
    patchIds,
  };
  return { ...proof, proofDigest: digestObject(proof) };
}

export function verifyAdditiveContentCoverageProof(input: {
  actor: string;
  issuedAt: string;
  candidateRepoRoot: string;
  candidateCommitOid: string;
  targetRepoRoot: string;
  targetIntegrationCommitOid: string;
  targetOid: string;
  selectedPaths: string[];
  validationRefs: string[];
}): CandidateIntegrationProof {
  const candidateCommitOid = String(
    git(input.candidateRepoRoot, ["rev-parse", `${input.candidateCommitOid}^{commit}`]),
  ).trim();
  const targetIntegrationCommitOid = String(
    git(input.targetRepoRoot, ["rev-parse", `${input.targetIntegrationCommitOid}^{commit}`]),
  ).trim();
  const targetOid = String(
    git(input.targetRepoRoot, ["rev-parse", `${input.targetOid}^{commit}`]),
  ).trim();
  if (
    candidateCommitOid !== input.candidateCommitOid ||
    targetIntegrationCommitOid !== input.targetIntegrationCommitOid ||
    targetOid !== input.targetOid
  ) {
    throw new Error("content-coverage proof requires exact immutable commit OIDs");
  }
  git(input.targetRepoRoot, ["merge-base", "--is-ancestor", targetIntegrationCommitOid, targetOid]);

  if (input.selectedPaths.length === 0) {
    throw new Error("content-coverage proof requires explicit selected paths");
  }
  const selectedPaths = [...input.selectedPaths].sort();
  if (new Set(selectedPaths).size !== selectedPaths.length) {
    throw new Error("content-coverage selected paths must be unique");
  }
  for (const path of selectedPaths) {
    if (
      !path ||
      path.includes("\0") ||
      path.includes("\\") ||
      isAbsolute(path) ||
      path.split("/").some((segment) => !segment || segment === "." || segment === "..")
    ) {
      throw new Error(`content-coverage selected path is not a canonical repository path: ${path}`);
    }
  }

  const treeManifest = (repoRoot: string, commit: string) =>
    selectedPaths.map((path) => {
      const raw = git(
        repoRoot,
        ["ls-tree", "-z", "--full-tree", commit, "--", `:(literal)${path}`],
        "buffer",
      ) as Buffer;
      const records = raw.toString("utf8").split("\0").filter(Boolean);
      if (records.length !== 1) {
        throw new Error(
          `content-coverage selected path must identify one extant tree entry: ${path}`,
        );
      }
      const separator = records[0]?.indexOf("\t") ?? -1;
      const header = separator < 0 ? [] : records[0]?.slice(0, separator).split(" ");
      const actualPath = separator < 0 ? "" : records[0]?.slice(separator + 1);
      const [mode, type, oid] = header;
      if (actualPath !== path || type !== "blob" || !mode || !/^[a-f0-9]{40}$/.test(oid ?? "")) {
        throw new Error(`content-coverage selected path is not an exact blob entry: ${path}`);
      }
      return { path, mode, type, oid };
    });

  const candidateManifest = treeManifest(input.candidateRepoRoot, candidateCommitOid);
  const integrationManifest = treeManifest(input.targetRepoRoot, targetIntegrationCommitOid);
  const targetManifest = treeManifest(input.targetRepoRoot, targetOid);
  if (
    stableJson(candidateManifest) !== stableJson(integrationManifest) ||
    stableJson(candidateManifest) !== stableJson(targetManifest)
  ) {
    throw new Error(
      "target integration commit and target OID do not exactly preserve reviewed candidate path content",
    );
  }
  const coverageDigest = digestObject(candidateManifest);
  const proof = {
    form: "content_coverage" as const,
    actor: input.actor,
    issuedAt: input.issuedAt,
    candidateRepoRoot: input.candidateRepoRoot,
    candidateHeadOid: candidateCommitOid,
    targetRepoRoot: input.targetRepoRoot,
    targetOid,
    selectedCommits: [],
    targetIntegrationCommits: [targetIntegrationCommitOid],
    selectedPaths,
    coverageDigest,
    validationRefs: input.validationRefs,
  };
  return { ...proof, proofDigest: digestObject(proof) };
}

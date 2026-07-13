import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import {
  existsSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  statSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import test from "node:test";
import {
  authorizeCandidateCleanup,
  createRestorationVerifiedArchive,
  executeAuthorizedCandidateCleanup,
} from "../src/candidatePeerLifecycleArchive.ts";
import {
  captureCandidateReviewSnapshot,
  createDispositionReceipt,
  getCandidateLifecycleRecordPath,
  getCandidateLifecycleRoot,
  inventoryCandidatePeerResources,
  migrateCandidateInventory,
  reconcileMissingResource,
  updateLifecycleRecord,
  verifyPatchEquivalenceProof,
  withResourceLock,
} from "../src/candidatePeerLifecycleV2.ts";

function git(cwd, ...args) {
  return execFileSync("git", ["-C", cwd, ...args], { encoding: "utf8" }).trim();
}

function withTempDir(fn) {
  const dir = mkdtempSync(`${tmpdir()}/candidate-lifecycle-v2-`);
  return Promise.resolve(fn(dir)).finally(() => rmSync(dir, { recursive: true, force: true }));
}

function registryRecord({
  peerRunId,
  repoRoot,
  worktreePath,
  branchName = "candidate/test",
  createdAt = "2026-07-13T00:00:00Z",
}) {
  return {
    schemaVersion: 1,
    peerRunId,
    tool: "candidate_peer_spawn",
    canonicalTool: "candidate_peer_spawn",
    parentCwd: repoRoot,
    repoRoot,
    worktreePath,
    branchName,
    baseRef: "HEAD",
    parentDirty: false,
    reusedExisting: false,
    reportBack: "intercom",
    launch: { status: "launched" },
    createdAt,
    updatedAt: createdAt,
    registryPath: "unused",
    archiveDir: "unused",
    cleanupPacket: {
      packetVersion: 1,
      peerRunId,
      generatedAt: createdAt,
      archiveDir: "unused",
      registryPath: "unused",
      manualPreconditions: [],
      commands: [],
    },
  };
}

function writeRegistry(registryDir, record) {
  mkdirSync(registryDir, { recursive: true });
  writeFileSync(`${registryDir}/${record.peerRunId}.json`, `${JSON.stringify(record)}\n`);
}

function setupLinkedWorktree(root) {
  const repoRoot = `${root}/owner`;
  const worktreePath = `${root}/candidate`;
  mkdirSync(repoRoot);
  execFileSync("git", ["init", "-b", "main", repoRoot]);
  git(repoRoot, "config", "user.email", "candidate@example.test");
  git(repoRoot, "config", "user.name", "Candidate Test");
  writeFileSync(`${repoRoot}/tracked.txt`, "base\n");
  git(repoRoot, "add", "tracked.txt");
  git(repoRoot, "commit", "-m", "base");
  git(repoRoot, "worktree", "add", "-b", "candidate/test", worktreePath, "HEAD");
  return { repoRoot, worktreePath };
}

test("v2 inventory groups aliases by physical worktree and migrates owner-only records", async () => {
  await withTempDir((root) => {
    const env = { XDG_STATE_HOME: `${root}/state` };
    const registryDir = `${root}/state/pi-quests/peer-registry`;
    const { repoRoot, worktreePath } = setupLinkedWorktree(root);
    writeRegistry(
      registryDir,
      registryRecord({ peerRunId: "candidatepeer-one", repoRoot, worktreePath }),
    );
    writeRegistry(
      registryDir,
      registryRecord({ peerRunId: "candidatepeer-two", repoRoot, worktreePath }),
    );
    writeRegistry(
      registryDir,
      registryRecord({
        peerRunId: "candidatepeer-missing",
        repoRoot,
        worktreePath: `${root}/missing`,
        branchName: "candidate/missing",
      }),
    );

    const inventory = inventoryCandidatePeerResources({ registryDir, now: "2026-07-13T01:00:00Z" });
    assert.equal(inventory.registryRecordCount, 3);
    assert.equal(inventory.resourceCount, 2);
    assert.equal(inventory.existingResourceCount, 1);
    assert.equal(inventory.missingResourceCount, 1);
    assert.deepEqual(inventory.resources.find((item) => item.exists).aliases, [
      "candidatepeer-one",
      "candidatepeer-two",
    ]);

    const records = migrateCandidateInventory(inventory, env);
    assert.equal(records.length, 2);
    const existing = records.find((item) => item.state === "review_pending");
    const missing = records.find((item) => item.state === "missing_investigation");
    assert.ok(existing);
    assert.ok(missing);
    assert.equal(statSync(getCandidateLifecycleRoot(env)).mode & 0o777, 0o700);
    assert.equal(
      statSync(getCandidateLifecycleRecordPath(existing.resourceId, env)).mode & 0o777,
      0o600,
    );

    assert.throws(
      () =>
        updateLifecycleRecord({
          resourceId: existing.resourceId,
          expectedVersion: 99,
          event: "invalid",
          env,
          mutate(record) {
            return record;
          },
        }),
      /CAS failed/,
    );
    withResourceLock(existing.resourceId, "outer", env, () => {
      assert.throws(
        () => withResourceLock(existing.resourceId, "inner", env, () => undefined),
        /is locked/,
      );
    });

    const reconciled = reconcileMissingResource({
      record: missing,
      expectedVersion: missing.resourceVersion,
      actor: "owner:test",
      recoverable: ["branch ref"],
      lost: [],
      evidence: ["registry sidecar"],
      env,
    });
    assert.equal(reconciled.state, "reconciled_missing");
    assert.equal(reconciled.terminalReceipt.type, "reconciled_missing");
  });
});

test("v2 rejected fixture restores byte-for-byte before exact authorized cleanup", async () => {
  await withTempDir((root) => {
    const env = { XDG_STATE_HOME: `${root}/state` };
    const registryDir = `${root}/state/pi-quests/peer-registry`;
    const { repoRoot, worktreePath } = setupLinkedWorktree(root);
    writeFileSync(`${worktreePath}/tracked.txt`, "unstaged candidate\n");
    writeFileSync(`${worktreePath}/staged.txt`, "staged candidate\n");
    git(worktreePath, "add", "staged.txt");
    writeFileSync(`${worktreePath}/untracked odd name.txt`, "unique bytes\n");
    writeRegistry(
      registryDir,
      registryRecord({ peerRunId: "candidatepeer-cleanup", repoRoot, worktreePath }),
    );
    const inventory = inventoryCandidatePeerResources({ registryDir });
    let record = migrateCandidateInventory(inventory, env)[0];

    const snapshot = captureCandidateReviewSnapshot(record, "2026-07-13T02:00:00Z");
    assert.equal(snapshot.blockers.length, 0);
    assert.ok(
      snapshot.objects.some((item) => item.path === "untracked odd name.txt" && item.sha256),
    );
    record = updateLifecycleRecord({
      resourceId: record.resourceId,
      expectedVersion: record.resourceVersion,
      event: "review_captured",
      env,
      mutate(current) {
        current.reviewSnapshot = snapshot;
        current.state = "review_pending";
        return current;
      },
    });
    const disposition = createDispositionReceipt({
      disposition: "rejected",
      actor: "owner:test",
      rationale: "synthetic rejected canary",
      issuedAt: "2026-07-13T02:01:00Z",
      reviewSnapshotDigest: snapshot.snapshotDigest,
      validationRefs: ["test fixture"],
    });
    record = updateLifecycleRecord({
      resourceId: record.resourceId,
      expectedVersion: record.resourceVersion,
      event: "disposition_rejected",
      env,
      mutate(current) {
        current.disposition = disposition;
        current.state = "rejected";
        return current;
      },
    });

    const archived = createRestorationVerifiedArchive({
      record,
      expectedVersion: record.resourceVersion,
      env,
    });
    record = archived.record;
    assert.equal(record.state, "archive_verified");
    assert.equal(existsSync(`${archived.receipt.archiveDir}/COMPLETE`), true);
    assert.equal(statSync(archived.receipt.archiveDir).mode & 0o777, 0o700);
    assert.match(
      readFileSync(`${archived.receipt.archiveDir}/manifest.json`, "utf8"),
      /payload\.tar/,
    );

    record = authorizeCandidateCleanup({
      record,
      expectedVersion: record.resourceVersion,
      actor: "owner:test",
      expiresAt: new Date(Date.now() + 60_000).toISOString(),
      effects: ["remove_worktree", "delete_branch"],
      env,
    });
    assert.equal(record.state, "cleanup_authorized");
    const cleaned = executeAuthorizedCandidateCleanup({ resourceId: record.resourceId, env });
    assert.equal(cleaned.state, "cleaned");
    assert.equal(existsSync(worktreePath), false);
    assert.throws(() => git(repoRoot, "rev-parse", "refs/heads/candidate/test"));
    assert.equal(existsSync(`${archived.receipt.archiveDir}/COMPLETE`), true);
  });
});

test("v2 archive fails closed on post-review drift", async () => {
  await withTempDir((root) => {
    const env = { XDG_STATE_HOME: `${root}/state` };
    const registryDir = `${root}/state/pi-quests/peer-registry`;
    const { repoRoot, worktreePath } = setupLinkedWorktree(root);
    writeRegistry(
      registryDir,
      registryRecord({ peerRunId: "candidatepeer-drift", repoRoot, worktreePath }),
    );
    let record = migrateCandidateInventory(
      inventoryCandidatePeerResources({ registryDir }),
      env,
    )[0];
    const snapshot = captureCandidateReviewSnapshot(record);
    record = updateLifecycleRecord({
      resourceId: record.resourceId,
      expectedVersion: record.resourceVersion,
      event: "review_and_reject",
      env,
      mutate(current) {
        current.reviewSnapshot = snapshot;
        current.disposition = createDispositionReceipt({
          disposition: "rejected",
          actor: "owner:test",
          rationale: "drift fixture",
          issuedAt: new Date().toISOString(),
          reviewSnapshotDigest: snapshot.snapshotDigest,
        });
        current.state = "rejected";
        return current;
      },
    });
    writeFileSync(`${worktreePath}/drift.txt`, "late bytes\n");
    assert.throws(
      () =>
        createRestorationVerifiedArchive({ record, expectedVersion: record.resourceVersion, env }),
      /drifted/,
    );
  });
});

test("v2 patch-equivalence proof binds distinct candidate and target OIDs", async () => {
  await withTempDir((root) => {
    const { repoRoot, worktreePath } = setupLinkedWorktree(root);
    writeFileSync(`${worktreePath}/equivalent.txt`, "same accepted bytes\n");
    git(worktreePath, "add", "equivalent.txt");
    git(worktreePath, "commit", "-m", "candidate implementation");
    const candidateHeadOid = git(worktreePath, "rev-parse", "HEAD");
    const patchPath = `${root}/candidate.patch`;
    writeFileSync(patchPath, execFileSync("git", ["-C", repoRoot, "diff", "main..candidate/test"]));
    execFileSync("git", ["-C", repoRoot, "apply", patchPath]);
    git(repoRoot, "add", "equivalent.txt");
    git(repoRoot, "commit", "-m", "integrated equivalent implementation");
    const targetOid = git(repoRoot, "rev-parse", "HEAD");

    const proof = verifyPatchEquivalenceProof({
      actor: "owner:test",
      issuedAt: new Date().toISOString(),
      candidateRepoRoot: repoRoot,
      candidateHeadOid,
      targetRepoRoot: repoRoot,
      targetOid,
      validationRefs: ["synthetic patch-equivalence canary"],
    });
    assert.equal(proof.form, "patch_equivalence");
    assert.deepEqual(proof.selectedCommits, [candidateHeadOid]);
    assert.equal(proof.patchIds.length, 1);
    assert.match(proof.proofDigest, /^[0-9a-f]{64}$/);
  });
});

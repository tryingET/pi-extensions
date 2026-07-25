import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import {
  existsSync,
  lstatSync,
  mkdirSync,
  mkdtempSync,
  readdirSync,
  readFileSync,
  rmSync,
  statSync,
  symlinkSync,
  truncateSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import test from "node:test";
import {
  authorizeCandidateCleanup,
  createRestorationVerifiedArchive,
  executeAuthorizedCandidateCleanup,
  reissueExpiredCandidateCleanupAuthorization,
  verifyCleanedCandidateTerminalRecord,
} from "../src/candidatePeerLifecycleArchive.ts";
import {
  adoptExistingCandidateWorktree,
  appendLifecycleEvent,
  assertIntegrationProofCoversDisposition,
  captureCandidateReviewSnapshot,
  createDispositionReceipt,
  digestObject,
  getCandidateLifecycleRecordPath,
  getCandidateLifecycleRoot,
  inventoryCandidatePeerResources,
  migrateCandidateInventory,
  reconcileMissingResource,
  updateLifecycleRecord,
  verifyAdditiveContentCoverageProof,
  verifyCommitInclusionProof,
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

function adoptionInput(repoRoot, worktreePath, overrides = {}) {
  return {
    schemaVersion: 2,
    action: "adopt_existing_worktree",
    worktreePath,
    repoRoot,
    gitCommonDir: git(worktreePath, "rev-parse", "--path-format=absolute", "--git-common-dir"),
    branchName: git(worktreePath, "symbolic-ref", "--short", "HEAD"),
    headOid: git(worktreePath, "rev-parse", "HEAD"),
    actor: "owner:test",
    rationale: "bring this pre-existing verified candidate under lifecycle-v2 control",
    expiresAt: new Date(Date.now() + 60_000).toISOString(),
    ...overrides,
  };
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

test("publication races and crashes atomically roll back adopted state", async () => {
  await withTempDir((root) => {
    for (const scenario of ["registry-race", "git-race", "post-publish-crash"]) {
      const scenarioRoot = `${root}/${scenario}`;
      mkdirSync(scenarioRoot);
      const env = { XDG_STATE_HOME: `${scenarioRoot}/state` };
      const registryDir = `${scenarioRoot}/state/pi-quests/peer-registry`;
      const { repoRoot, worktreePath } = setupLinkedWorktree(scenarioRoot);
      const input = adoptionInput(repoRoot, worktreePath);
      const hooks =
        scenario === "post-publish-crash"
          ? {
              afterAtomicPublication() {
                throw new Error("simulated post-publication crash");
              },
            }
          : {
              beforeAtomicPublication() {
                if (scenario === "registry-race") {
                  writeRegistry(
                    registryDir,
                    registryRecord({
                      peerRunId: "candidatepeer-racing-registration",
                      repoRoot,
                      worktreePath,
                    }),
                  );
                } else {
                  writeFileSync(`${worktreePath}/racing-drift.txt`, "late drift\n");
                }
              },
            };
      assert.throws(
        () =>
          adoptExistingCandidateWorktree({
            input,
            registryDir,
            env,
            testHooks: hooks,
          }),
        scenario === "registry-race"
          ? /registry inventory drifted across atomic publication/
          : scenario === "git-race"
            ? /must be clean/
            : /simulated post-publication crash/,
      );
      const resourcesRoot = `${getCandidateLifecycleRoot(env)}/resources`;
      assert.deepEqual(readdirSync(resourcesRoot), []);
      assert.deepEqual(readdirSync(`${getCandidateLifecycleRoot(env)}/staging`), []);
    }
  });
});

test("resource lock blocks lifecycle updates while adopted state is provisionally visible", async () => {
  await withTempDir((root) => {
    const env = { XDG_STATE_HOME: `${root}/state` };
    const registryDir = `${root}/state/pi-quests/peer-registry`;
    const { repoRoot, worktreePath } = setupLinkedWorktree(root);
    const input = adoptionInput(repoRoot, worktreePath);
    let updateWasBlocked = false;
    const record = adoptExistingCandidateWorktree({
      input,
      registryDir,
      env,
      testHooks: {
        afterAtomicPublication() {
          const resourcesRoot = `${getCandidateLifecycleRoot(env)}/resources`;
          const [resourceId] = readdirSync(resourcesRoot);
          assert.ok(resourceId);
          assert.throws(
            () =>
              updateLifecycleRecord({
                resourceId,
                expectedVersion: 1,
                event: "concurrent_update_must_not_land",
                env,
                mutate(current) {
                  current.state = "deferred";
                  return current;
                },
              }),
            /resource is locked/,
          );
          updateWasBlocked = true;
        },
      },
    });
    assert.equal(updateWasBlocked, true);
    const persisted = JSON.parse(
      readFileSync(getCandidateLifecycleRecordPath(record.resourceId, env), "utf8"),
    );
    assert.equal(persisted.resourceVersion, 1);
    assert.equal(persisted.state, "review_pending");
    assert.equal(
      readFileSync(
        `${getCandidateLifecycleRoot(env)}/resources/${record.resourceId}/events.jsonl`,
        "utf8",
      )
        .trim()
        .split("\n").length,
      1,
    );
  });
});

test("lifecycle publication roots reject symlink traversal", async () => {
  await withTempDir((root) => {
    const fixtureRoot = `${root}/fixture`;
    mkdirSync(fixtureRoot);
    const { repoRoot, worktreePath } = setupLinkedWorktree(fixtureRoot);
    const input = adoptionInput(repoRoot, worktreePath);
    for (const rootName of ["locks", "resources", "staging"]) {
      const env = { XDG_STATE_HOME: `${root}/state-${rootName}` };
      const lifecycleRoot = getCandidateLifecycleRoot(env);
      const target = `${root}/target-${rootName}`;
      mkdirSync(lifecycleRoot, { recursive: true });
      mkdirSync(target);
      symlinkSync(target, `${lifecycleRoot}/${rootName}`, "dir");
      assert.throws(
        () =>
          adoptExistingCandidateWorktree({
            input,
            registryDir: `${root}/registry-${rootName}`,
            env,
          }),
        /canonical/,
      );
    }
  });
});

test("owner adoption atomically creates native review_pending v2 state", async () => {
  await withTempDir((root) => {
    const env = { XDG_STATE_HOME: `${root}/state` };
    const registryDir = `${root}/state/pi-quests/peer-registry`;
    const { repoRoot, worktreePath } = setupLinkedWorktree(root);
    const input = adoptionInput(repoRoot, worktreePath);

    const record = adoptExistingCandidateWorktree({ input, registryDir, env });
    assert.equal(record.schemaVersion, 2);
    assert.equal(record.state, "review_pending");
    assert.equal(record.resourceVersion, 1);
    assert.deepEqual(record.aliases, []);
    assert.deepEqual(record.repoRoots, [repoRoot]);
    assert.deepEqual(record.branchNames, ["candidate/test"]);
    assert.equal(record.reviewSnapshot.worktreeRealPath, worktreePath);
    assert.equal(record.reviewSnapshot.gitCommonDir, input.gitCommonDir);
    assert.equal(record.reviewSnapshot.headOid, input.headOid);
    assert.equal(record.reviewSnapshot.resourceId, record.resourceId);
    assert.equal(record.reviewSnapshot.generationId, record.generationId);
    assert.deepEqual(record.adoption.authorization, input);
    assert.equal(record.adoption.authorizationDigest, digestObject(input));
    const resourceDir = `${getCandidateLifecycleRoot(env)}/resources/${record.resourceId}`;
    assert.equal(statSync(resourceDir).mode & 0o777, 0o700);
    assert.equal(statSync(`${resourceDir}/record.json`).mode & 0o777, 0o600);
    const events = readFileSync(`${resourceDir}/events.jsonl`, "utf8").trim().split("\n");
    assert.equal(events.length, 1);
    assert.equal(JSON.parse(events[0]).event, "adopted_existing");

    assert.throws(
      () => adoptExistingCandidateWorktree({ input, registryDir, env }),
      /resource collision/,
    );
  });
});

test("adoption rejects dirty, ambiguous, detached, mismatched, and expired identity", async () => {
  await withTempDir((root) => {
    const env = { XDG_STATE_HOME: `${root}/state` };
    const registryDir = `${root}/state/pi-quests/peer-registry`;
    const { repoRoot, worktreePath } = setupLinkedWorktree(root);
    const input = adoptionInput(repoRoot, worktreePath);

    assert.throws(
      () =>
        adoptExistingCandidateWorktree({
          input: { ...input, unexpected: true },
          registryDir,
          env,
        }),
      /exact schema/,
    );
    const ownerInput = adoptionInput(repoRoot, repoRoot);
    assert.throws(
      () => adoptExistingCandidateWorktree({ input: ownerInput, registryDir, env }),
      /distinct from the candidate/,
    );

    writeFileSync(`${worktreePath}/dirty.txt`, "not owner-bound\n");
    assert.throws(
      () => adoptExistingCandidateWorktree({ input, registryDir, env }),
      /must be clean/,
    );
    rmSync(`${worktreePath}/dirty.txt`);

    const symlinkPath = `${root}/candidate-link`;
    symlinkSync(worktreePath, symlinkPath);
    assert.throws(
      () =>
        adoptExistingCandidateWorktree({
          input: { ...input, worktreePath: symlinkPath },
          registryDir,
          env,
        }),
      /symlink ambiguity/,
    );
    assert.throws(
      () =>
        adoptExistingCandidateWorktree({
          input: { ...input, headOid: "0".repeat(40) },
          registryDir,
          env,
        }),
      /HEAD or branch ref mismatch/,
    );
    assert.throws(
      () =>
        adoptExistingCandidateWorktree({
          input: { ...input, gitCommonDir: repoRoot },
          registryDir,
          env,
        }),
      /common directory mismatch/,
    );
    git(repoRoot, "branch", "candidate/other", input.headOid);
    assert.throws(
      () =>
        adoptExistingCandidateWorktree({
          input: { ...input, branchName: "candidate/other" },
          registryDir,
          env,
        }),
      /branch mismatch/,
    );
    assert.throws(
      () =>
        adoptExistingCandidateWorktree({
          input: { ...input, expiresAt: "2026-01-01T00:00:00.000Z" },
          registryDir,
          env,
        }),
      /authorization expired/,
    );
    git(worktreePath, "checkout", "--detach");
    assert.throws(
      () => adoptExistingCandidateWorktree({ input, registryDir, env }),
      /must not have detached HEAD/,
    );
    assert.equal(existsSync(`${getCandidateLifecycleRoot(env)}/resources`), false);
  });
});

test("adoption rejects registry duplicates and generation collisions", async () => {
  await withTempDir((root) => {
    const registryRoot = `${root}/registry-case`;
    mkdirSync(registryRoot);
    const registryEnv = { XDG_STATE_HOME: `${registryRoot}/state` };
    const registryDir = `${registryRoot}/state/pi-quests/peer-registry`;
    const registered = setupLinkedWorktree(registryRoot);
    const registeredInput = adoptionInput(registered.repoRoot, registered.worktreePath);
    const registryAlias = `${registryRoot}/candidate-registry-alias`;
    symlinkSync(registered.worktreePath, registryAlias);
    writeRegistry(
      registryDir,
      registryRecord({
        peerRunId: "candidatepeer-already-registered",
        repoRoot: registered.repoRoot,
        worktreePath: registryAlias,
      }),
    );
    rmSync(registryAlias);
    assert.throws(
      () =>
        adoptExistingCandidateWorktree({ input: registeredInput, registryDir, env: registryEnv }),
      /registry duplicate/,
    );

    const collisionRoot = `${root}/collision-case`;
    mkdirSync(collisionRoot);
    const collisionEnv = { XDG_STATE_HOME: `${collisionRoot}/state` };
    const collisionRegistry = `${collisionRoot}/state/pi-quests/peer-registry`;
    const collision = setupLinkedWorktree(collisionRoot);
    const collisionInput = adoptionInput(collision.repoRoot, collision.worktreePath);
    const first = adoptExistingCandidateWorktree({
      input: collisionInput,
      registryDir: collisionRegistry,
      env: collisionEnv,
    });
    rmSync(`${getCandidateLifecycleRoot(collisionEnv)}/resources/${first.resourceId}`, {
      recursive: true,
    });
    const archivesRoot = `${getCandidateLifecycleRoot(collisionEnv)}/archives`;
    mkdirSync(archivesRoot, { recursive: true });
    const danglingArchiveResource = `${archivesRoot}/${first.resourceId}`;
    symlinkSync(`${collisionRoot}/missing-archive-resource`, danglingArchiveResource);
    assert.throws(
      () =>
        adoptExistingCandidateWorktree({
          input: collisionInput,
          registryDir: collisionRegistry,
          env: collisionEnv,
        }),
      /archive resource collision/,
    );
    assert.equal(lstatSync(danglingArchiveResource).isSymbolicLink(), true);
    rmSync(danglingArchiveResource);

    const unrelatedArchive = `${archivesRoot}/cpr-eeeeeeeeeeeeeeeeeeeeeeee`;
    mkdirSync(unrelatedArchive);
    const danglingArchiveGeneration = `${unrelatedArchive}/${first.generationId}`;
    symlinkSync(`${collisionRoot}/missing-archive-generation`, danglingArchiveGeneration);
    assert.throws(
      () =>
        adoptExistingCandidateWorktree({
          input: collisionInput,
          registryDir: collisionRegistry,
          env: collisionEnv,
        }),
      /archive generation collision/,
    );
    assert.equal(lstatSync(danglingArchiveGeneration).isSymbolicLink(), true);
    rmSync(danglingArchiveGeneration);

    const otherId = "cpr-ffffffffffffffffffffffff";
    const otherDir = `${getCandidateLifecycleRoot(collisionEnv)}/resources/${otherId}`;
    mkdirSync(otherDir, { recursive: true });
    const danglingLifecycleAlias = `${collisionRoot}/removed-lifecycle-alias`;
    symlinkSync(collision.worktreePath, danglingLifecycleAlias);
    rmSync(danglingLifecycleAlias);
    const stale = {
      ...first,
      resourceId: otherId,
      generationId: "gen-v1-eeeeeeeeeeeeeeeeeeee",
      worktreePath: danglingLifecycleAlias,
    };
    delete stale.reviewSnapshot;
    delete stale.adoption;
    writeFileSync(`${otherDir}/record.json`, JSON.stringify(stale));
    assert.throws(
      () =>
        adoptExistingCandidateWorktree({
          input: collisionInput,
          registryDir: collisionRegistry,
          env: collisionEnv,
        }),
      /lifecycle duplicate/,
    );

    stale.generationId = first.generationId;
    stale.repoRoots = [`${collisionRoot}/unrelated-owner`];
    stale.branchNames = ["candidate/unrelated"];
    writeFileSync(`${otherDir}/record.json`, JSON.stringify(stale));
    assert.throws(
      () =>
        adoptExistingCandidateWorktree({
          input: collisionInput,
          registryDir: collisionRegistry,
          env: collisionEnv,
        }),
      /generation collision/,
    );
  });
});

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

test("v2 cleanup skips a large irrelevant review event and preserves exact recovery", async () => {
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

    assert.throws(
      () =>
        authorizeCandidateCleanup({
          record,
          expectedVersion: record.resourceVersion,
          actor: "owner:test",
          expiresAt: new Date(Date.now() + 60_000).toISOString(),
          effects: [],
          env,
        }),
      /requires exactly remove_worktree and delete_branch/,
    );
    assert.throws(
      () =>
        authorizeCandidateCleanup({
          record,
          expectedVersion: record.resourceVersion,
          actor: "owner:test",
          expiresAt: "2026-02-30T00:00:00.000Z",
          effects: ["remove_worktree", "delete_branch"],
          env,
        }),
      /real canonical UTC timestamp/,
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
    const authorization = record.cleanupAuthorization;
    appendLifecycleEvent(
      record.resourceId,
      {
        event: "review_captured",
        at: new Date().toISOString(),
        record: { payload: "x".repeat(17 * 1024 * 1024) },
      },
      env,
    );
    const attemptId = "crash-after-remove-worktree";
    appendLifecycleEvent(
      record.resourceId,
      {
        at: new Date().toISOString(),
        effect: "remove_worktree",
        event: "cleanup_effect_intent",
        authorizationDigest: authorization.authorizationDigest,
        attemptId,
      },
      env,
    );
    git(repoRoot, "worktree", "remove", "--force", worktreePath);
    const observationBase = {
      event: "cleanup_effect_observed",
      effect: "remove_worktree",
      authorizationDigest: authorization.authorizationDigest,
      attemptId,
      at: new Date().toISOString(),
      recoveredAfterCrash: true,
      worktreePath,
    };
    const observation = {
      ...observationBase,
      observationDigest: digestObject(observationBase),
    };
    appendLifecycleEvent(record.resourceId, observation, env);
    record = updateLifecycleRecord({
      resourceId: record.resourceId,
      expectedVersion: record.resourceVersion,
      event: "cleanup_partial",
      env,
      mutate(current) {
        current.state = "cleanup_partial";
        current.terminalReceipt = {
          type: "cleanup_partial",
          authorizationDigest: authorization.authorizationDigest,
          effects: [observation],
        };
        return current;
      },
    });
    const cleaned = executeAuthorizedCandidateCleanup({ resourceId: record.resourceId, env });
    assert.equal(cleaned.state, "cleaned");
    assert.equal(verifyCleanedCandidateTerminalRecord(cleaned, env), digestObject(cleaned));
    assert.ok(
      statSync(`${getCandidateLifecycleRoot(env)}/resources/${record.resourceId}/events.jsonl`)
        .size >
        17 * 1024 * 1024,
    );
    assert.equal(existsSync(worktreePath), false);
    assert.throws(() => git(repoRoot, "rev-parse", "refs/heads/candidate/test"));
    assert.equal(existsSync(`${archived.receipt.archiveDir}/COMPLETE`), true);
    const eventsPath = `${getCandidateLifecycleRoot(env)}/resources/${record.resourceId}/events.jsonl`;
    const terminalSize = statSync(eventsPath).size;
    writeFileSync(eventsPath, `{"at":"now","event":"cleanup_effect_intent",]\n`, { flag: "a" });
    assert.throws(
      () => verifyCleanedCandidateTerminalRecord(cleaned, env),
      /malformed lifecycle event/,
    );
    truncateSync(eventsPath, terminalSize);

    writeFileSync(eventsPath, `{"event":"review_captured","event":"cleanup_effect_observed"}\n`, {
      flag: "a",
    });
    assert.throws(
      () => verifyCleanedCandidateTerminalRecord(cleaned, env),
      /non-unique top-level event identity/,
    );
    truncateSync(eventsPath, terminalSize);

    writeFileSync(
      eventsPath,
      `{"event":"review_captured","payload":${"[".repeat(257)}0${"]".repeat(257)}}\n`,
      { flag: "a" },
    );
    assert.throws(
      () => verifyCleanedCandidateTerminalRecord(cleaned, env),
      /malformed lifecycle event/,
    );
    truncateSync(eventsPath, terminalSize);

    appendLifecycleEvent(record.resourceId, { event: "post_cleaned_probe", at: "now" }, env);
    assert.throws(
      () => verifyCleanedCandidateTerminalRecord(cleaned, env),
      /not the final cleaned lifecycle event/,
    );
    truncateSync(eventsPath, terminalSize);

    writeFileSync(
      eventsPath,
      `${JSON.stringify({
        padding: "x".repeat(17 * 1024 * 1024),
        event: "cleanup_effect_observed",
      })}\n`,
      { flag: "a" },
    );
    assert.throws(
      () => verifyCleanedCandidateTerminalRecord(cleaned, env),
      /relevant cleanup lifecycle event exceeds bounded read limit/,
    );
  });
});

test("expired cleanup authorization reissues only from zero-effect accepted state", async () => {
  await withTempDir((root) => {
    const env = { XDG_STATE_HOME: `${root}/state` };
    const registryDir = `${root}/state/pi-quests/peer-registry`;
    const { repoRoot, worktreePath } = setupLinkedWorktree(root);
    writeRegistry(
      registryDir,
      registryRecord({ peerRunId: "candidatepeer-reissue", repoRoot, worktreePath }),
    );
    let record = migrateCandidateInventory(
      inventoryCandidatePeerResources({ registryDir }),
      env,
    )[0];
    const snapshot = captureCandidateReviewSnapshot(record);
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
    const headOid = git(worktreePath, "rev-parse", "HEAD");
    const disposition = createDispositionReceipt({
      disposition: "accepted",
      actor: "owner:test",
      rationale: "accepted reissue fixture",
      issuedAt: new Date().toISOString(),
      reviewSnapshotDigest: snapshot.snapshotDigest,
      selectedCommits: [headOid],
      validationRefs: ["test fixture"],
    });
    record = updateLifecycleRecord({
      resourceId: record.resourceId,
      expectedVersion: record.resourceVersion,
      event: "disposition_accepted",
      env,
      mutate(current) {
        current.disposition = disposition;
        current.state = "accepted";
        return current;
      },
    });
    const integrationProof = verifyCommitInclusionProof({
      actor: "owner:test",
      issuedAt: new Date().toISOString(),
      candidateRepoRoot: worktreePath,
      candidateHeadOid: headOid,
      targetRepoRoot: repoRoot,
      targetOid: headOid,
      selectedCommits: [headOid],
      validationRefs: ["test fixture"],
    });
    record = updateLifecycleRecord({
      resourceId: record.resourceId,
      expectedVersion: record.resourceVersion,
      event: "integration_verified",
      env,
      mutate(current) {
        current.integrationProof = integrationProof;
        current.state = "integration_verified";
        return current;
      },
    });
    record = createRestorationVerifiedArchive({
      record,
      expectedVersion: record.resourceVersion,
      env,
    }).record;
    record = authorizeCandidateCleanup({
      record,
      expectedVersion: record.resourceVersion,
      actor: "owner:test",
      expiresAt: new Date(Date.now() + 200).toISOString(),
      effects: ["remove_worktree", "delete_branch"],
      env,
    });
    const priorDigest = record.cleanupAuthorization.authorizationDigest;
    assert.throws(
      () =>
        reissueExpiredCandidateCleanupAuthorization({
          record,
          expectedVersion: record.resourceVersion,
          actor: "owner:test",
          expiresAt: new Date(Date.now() + 60_000).toISOString(),
          env,
        }),
      /cannot be reissued before expiry/,
    );
    Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, 250);
    const priorVersion = record.resourceVersion;
    record = reissueExpiredCandidateCleanupAuthorization({
      record,
      expectedVersion: record.resourceVersion,
      actor: "owner:test",
      expiresAt: new Date(Date.now() + 60_000).toISOString(),
      env,
    });
    assert.equal(record.resourceVersion, priorVersion + 1);
    assert.equal(record.state, "cleanup_authorized");
    assert.equal(record.cleanupAuthorization.reissuedFromAuthorizationDigest, priorDigest);
    assert.notEqual(record.cleanupAuthorization.authorizationDigest, priorDigest);
    const events = readFileSync(
      `${getCandidateLifecycleRoot(env)}/resources/${record.resourceId}/events.jsonl`,
      "utf8",
    )
      .trim()
      .split("\n")
      .map((line) => JSON.parse(line));
    assert.equal(events.at(-1).event, "cleanup_authorization_reissued");
    assert.equal(
      events.at(-1).record.cleanupAuthorization.reissuedFromAuthorizationDigest,
      priorDigest,
    );
    const cleaned = executeAuthorizedCandidateCleanup({ resourceId: record.resourceId, env });
    assert.equal(verifyCleanedCandidateTerminalRecord(cleaned, env), digestObject(cleaned));
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
    assert.throws(
      () =>
        assertIntegrationProofCoversDisposition(
          { disposition: "accepted", selectedCommits: [targetOid] },
          { repoRoot, headOid: candidateHeadOid },
          {
            form: "commit_inclusion",
            candidateRepoRoot: repoRoot,
            candidateHeadOid,
            selectedCommits: [targetOid],
          },
        ),
      /not contained in reviewed candidate HEAD/,
    );
  });
});

test("content coverage binds exact selected-path tree state through the target OID", async () => {
  await withTempDir((root) => {
    const { repoRoot, worktreePath } = setupLinkedWorktree(root);
    writeFileSync(`${worktreePath}/ordered.txt`, "alpha\nbeta\n");
    git(worktreePath, "add", "ordered.txt");
    git(worktreePath, "commit", "-m", "candidate ordered content");
    const candidateHeadOid = git(worktreePath, "rev-parse", "HEAD");

    writeFileSync(`${repoRoot}/ordered.txt`, "alpha\nbeta\n");
    git(repoRoot, "add", "ordered.txt");
    git(repoRoot, "commit", "-m", "integrate ordered content");
    const targetOid = git(repoRoot, "rev-parse", "HEAD");

    const proof = verifyAdditiveContentCoverageProof({
      actor: "owner:test",
      issuedAt: new Date().toISOString(),
      candidateRepoRoot: repoRoot,
      candidateCommitOid: candidateHeadOid,
      targetRepoRoot: repoRoot,
      targetIntegrationCommitOid: targetOid,
      targetOid,
      selectedPaths: ["ordered.txt"],
      validationRefs: ["exact tree coverage canary"],
    });
    assert.equal(proof.form, "content_coverage");
    assert.equal(proof.candidateHeadOid, candidateHeadOid);
    assert.deepEqual(proof.selectedCommits, []);
    assert.deepEqual(proof.selectedPaths, ["ordered.txt"]);
    assert.match(proof.coverageDigest, /^[0-9a-f]{64}$/);
  });
});

test("content coverage rejects reordered lines that share an addition multiset", async () => {
  await withTempDir((root) => {
    const { repoRoot, worktreePath } = setupLinkedWorktree(root);
    writeFileSync(`${worktreePath}/ordered.txt`, "alpha\nbeta\n");
    git(worktreePath, "add", "ordered.txt");
    git(worktreePath, "commit", "-m", "candidate order");
    const candidateHeadOid = git(worktreePath, "rev-parse", "HEAD");

    writeFileSync(`${repoRoot}/ordered.txt`, "beta\nalpha\n");
    git(repoRoot, "add", "ordered.txt");
    git(repoRoot, "commit", "-m", "wrong integration order");
    const targetOid = git(repoRoot, "rev-parse", "HEAD");

    assert.throws(
      () =>
        verifyAdditiveContentCoverageProof({
          actor: "owner:test",
          issuedAt: new Date().toISOString(),
          candidateRepoRoot: repoRoot,
          candidateCommitOid: candidateHeadOid,
          targetRepoRoot: repoRoot,
          targetIntegrationCommitOid: targetOid,
          targetOid,
          selectedPaths: ["ordered.txt"],
          validationRefs: ["adversarial reordered content"],
        }),
      /do not exactly preserve reviewed candidate path content/,
    );
  });
});

test("content coverage cannot omit selected content from an earlier candidate commit", async () => {
  await withTempDir((root) => {
    const { repoRoot, worktreePath } = setupLinkedWorktree(root);
    writeFileSync(`${worktreePath}/earlier.txt`, "accepted earlier bytes\n");
    git(worktreePath, "add", "earlier.txt");
    git(worktreePath, "commit", "-m", "candidate earlier content");
    writeFileSync(`${worktreePath}/tip.txt`, "accepted tip bytes\n");
    git(worktreePath, "add", "tip.txt");
    git(worktreePath, "commit", "-m", "candidate tip content");
    const candidateHeadOid = git(worktreePath, "rev-parse", "HEAD");

    writeFileSync(`${repoRoot}/tip.txt`, "accepted tip bytes\n");
    git(repoRoot, "add", "tip.txt");
    git(repoRoot, "commit", "-m", "incomplete integration");
    const targetOid = git(repoRoot, "rev-parse", "HEAD");

    assert.throws(
      () =>
        verifyAdditiveContentCoverageProof({
          actor: "owner:test",
          issuedAt: new Date().toISOString(),
          candidateRepoRoot: repoRoot,
          candidateCommitOid: candidateHeadOid,
          targetRepoRoot: repoRoot,
          targetIntegrationCommitOid: targetOid,
          targetOid,
          selectedPaths: ["earlier.txt", "tip.txt"],
          validationRefs: ["adversarial omitted earlier content"],
        }),
      /selected path must identify one extant tree entry: earlier.txt/,
    );
  });
});

test("integration proof cannot substitute an unrelated selected commit", () => {
  const selected = "a".repeat(40);
  const unrelated = "b".repeat(40);
  const disposition = {
    disposition: "accepted",
    selectedCommits: [selected],
  };
  const snapshot = { headOid: selected };
  const proof = {
    form: "commit_inclusion",
    selectedCommits: [unrelated],
  };
  assert.throws(
    () => assertIntegrationProofCoversDisposition(disposition, snapshot, proof),
    /exact accepted disposition selection/,
  );
});

test("candidate lifecycle resource ids cannot traverse owner state paths", () => {
  assert.throws(
    () => getCandidateLifecycleRecordPath("../outside", { XDG_STATE_HOME: "/tmp/state" }),
    /must match cpr-/,
  );
});

test("archive publication rejects a malformed generation path before filesystem effects", () => {
  assert.throws(
    () =>
      createRestorationVerifiedArchive({
        record: {
          resourceId: "cpr-aaaaaaaaaaaaaaaaaaaaaaaa",
          generationId: "../outside",
          resourceVersion: 1,
        },
        expectedVersion: 1,
        env: { XDG_STATE_HOME: "/tmp/state" },
      }),
    /generation id must match/,
  );
});

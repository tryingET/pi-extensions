import assert from "node:assert/strict";
import {
  existsSync,
  lstatSync,
  mkdirSync,
  readdirSync,
  readFileSync,
  rmSync,
  statSync,
  symlinkSync,
  writeFileSync,
} from "node:fs";
import test from "node:test";
import {
  adoptExistingCandidateWorktree,
  digestObject,
  getCandidateLifecycleRecordPath,
  getCandidateLifecycleRoot,
  inventoryCandidatePeerResources,
  migrateCandidateInventory,
  reconcileMissingResource,
  updateLifecycleRecord,
  withResourceLock,
} from "../src/candidatePeerLifecycleV2.ts";
import {
  adoptionInput,
  git,
  registryRecord,
  setupLinkedWorktree,
  withTempDir,
  writeRegistry,
} from "./candidate-lifecycle-v2-fixtures.mjs";

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

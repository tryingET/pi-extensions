import assert from "node:assert/strict";
import {
  chmodSync,
  existsSync,
  readFileSync,
  statSync,
  truncateSync,
  writeFileSync,
} from "node:fs";
import test from "node:test";
import {
  authorizeCandidateCleanup,
  createRestorationVerifiedArchive,
  executeAuthorizedCandidateCleanup,
  reissueExpiredCandidateCleanupAuthorization,
  verifyCleanedCandidateTerminalRecord,
} from "../src/candidatePeerLifecycleArchive.ts";
import {
  appendLifecycleEvent,
  captureCandidateReviewSnapshot,
  createDispositionReceipt,
  digestObject,
  getCandidateLifecycleRecordPath,
  getCandidateLifecycleRoot,
  inventoryCandidatePeerResources,
  migrateCandidateInventory,
  updateLifecycleRecord,
  verifyCommitInclusionProof,
} from "../src/candidatePeerLifecycleV2.ts";
import {
  git,
  registryRecord,
  setupLinkedWorktree,
  withTempDir,
  writeRegistry,
} from "./candidate-lifecycle-v2-fixtures.mjs";

test("archive restoration preserves reviewed modes under caller umask 077", async () => {
  await withTempDir((root) => {
    const env = { XDG_STATE_HOME: `${root}/state` };
    const registryDir = `${root}/state/pi-quests/peer-registry`;
    const { repoRoot, worktreePath } = setupLinkedWorktree(root);
    const trackedPath = `${worktreePath}/tracked.txt`;
    const executablePath = `${worktreePath}/restore-me.sh`;
    writeFileSync(trackedPath, "reviewed regular bytes\n");
    chmodSync(trackedPath, 0o644);
    writeFileSync(executablePath, "#!/bin/sh\necho restored\n");
    chmodSync(executablePath, 0o755);
    writeRegistry(
      registryDir,
      registryRecord({ peerRunId: "candidatepeer-umask-restore", repoRoot, worktreePath }),
    );
    let record = migrateCandidateInventory(
      inventoryCandidatePeerResources({ registryDir }),
      env,
    )[0];
    const snapshot = captureCandidateReviewSnapshot(record);
    assert.equal(snapshot.objects.find((item) => item.path === "tracked.txt")?.mode, 0o644);
    assert.equal(snapshot.objects.find((item) => item.path === "restore-me.sh")?.mode, 0o755);
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
          rationale: "exercise exact restoration modes under a restrictive caller umask",
          issuedAt: new Date().toISOString(),
          reviewSnapshotDigest: snapshot.snapshotDigest,
        });
        current.state = "rejected";
        return current;
      },
    });

    const priorUmask = process.umask(0o077);
    let archived;
    try {
      archived = createRestorationVerifiedArchive({
        record,
        expectedVersion: record.resourceVersion,
        env,
      });
    } finally {
      process.umask(priorUmask);
    }
    assert.equal(archived.record.state, "archive_verified");
    assert.match(archived.receipt.restorationDigest, /^[0-9a-f]{64}$/);
    assert.equal(statSync(trackedPath).mode & 0o777, 0o644);
    assert.equal(statSync(executablePath).mode & 0o777, 0o755);
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
    const originalEvents = readFileSync(eventsPath);
    const finalLineStart = originalEvents.lastIndexOf(0x0a, originalEvents.length - 2) + 1;
    for (const malformed of [
      '{"event":"historical","value":truX}',
      '{"event":"historical","value":}',
      '{"event":"historical","value":"unterminated}',
    ]) {
      writeFileSync(
        eventsPath,
        Buffer.concat([
          originalEvents.subarray(0, finalLineStart),
          Buffer.from(`${malformed}\n`),
          originalEvents.subarray(finalLineStart),
        ]),
      );
      assert.throws(
        () => verifyCleanedCandidateTerminalRecord(cleaned, env),
        /malformed lifecycle event/,
      );
    }
    const oversizedMalformed = Buffer.concat([
      Buffer.from('{"event":"historical","payload":"'),
      Buffer.alloc(17 * 1024 * 1024, 0x78),
      Buffer.from([0x5c, 0x71, 0x22, 0x7d, 0x0a]),
    ]);
    writeFileSync(
      eventsPath,
      Buffer.concat([
        originalEvents.subarray(0, finalLineStart),
        oversizedMalformed,
        originalEvents.subarray(finalLineStart),
      ]),
    );
    assert.throws(
      () => verifyCleanedCandidateTerminalRecord(cleaned, env),
      /malformed lifecycle event/,
    );
    writeFileSync(eventsPath, originalEvents);
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
        event: "cleanup_effect_observed",
        padding: "x".repeat(17 * 1024 * 1024),
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

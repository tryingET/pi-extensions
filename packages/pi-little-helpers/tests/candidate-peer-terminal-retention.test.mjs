// summary: verifies terminal candidate state compacts only through restoration-tested capsules and expiring exact authorization.
// read_when: changing candidate terminal registry stubs, lifecycle event/archive compaction, or retention authorization.
import assert from "node:assert/strict";
import { execFileSync, spawnSync } from "node:child_process";
import {
  appendFileSync,
  existsSync,
  mkdirSync,
  mkdtempSync,
  readdirSync,
  readFileSync,
  rmSync,
  statSync,
  symlinkSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";

import { releaseCandidateAdmission } from "../src/candidatePeerAdmission.ts";
import {
  candidateAdmissionPermitPath,
  getCandidateAdmissionRoot,
  writeAdmissionJson,
} from "../src/candidatePeerAdmissionState.ts";

import {
  authorizeCandidateCleanup,
  createRestorationVerifiedArchive,
  executeAuthorizedCandidateCleanup,
} from "../src/candidatePeerLifecycleArchive.ts";
import {
  appendLifecycleEvent,
  captureCandidateReviewSnapshot,
  createDispositionReceipt,
  digestObject,
  getCandidateLifecycleEventsPath,
  getCandidateLifecycleRecordPath,
  getCandidateLifecycleRoot,
  inventoryCandidatePeerResources,
  migrateCandidateInventory,
  readLifecycleRecord,
  reconcileMissingResource,
  updateLifecycleRecord,
} from "../src/candidatePeerLifecycleV2.ts";
import {
  createCandidatePeerRegistryRecord,
  getCandidatePeerRegistryDir,
  getCandidatePeerRegistryPath,
  writeCandidatePeerRegistryRecord,
} from "../src/candidatePeerRegistry.ts";
import {
  authorizeTerminalCandidateCompaction,
  executeAuthorizedTerminalCandidateCompaction,
  prepareTerminalCandidateCompaction,
  recoverTerminalCandidateCompactionLocks,
  verifyTerminalCandidateRecord,
} from "../src/candidatePeerTerminalRetention.ts";
import {
  getTerminalCompactionMarkerPath,
  getTerminalRetentionGenerationDir,
} from "../src/candidatePeerTerminalRetentionCore.ts";

function git(cwd, ...args) {
  return execFileSync("git", ["-C", cwd, ...args], { encoding: "utf8" }).trim();
}

function withState(fn) {
  const root = mkdtempSync(join(tmpdir(), "candidate-terminal-retention-"));
  try {
    return fn(root, { XDG_STATE_HOME: join(root, "state") });
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
}

function writeReservedAdmission({ env, admissionId, peerRunId, repoRoot, worktreePath }) {
  mkdirSync(join(getCandidateAdmissionRoot(env), "permits"), { recursive: true, mode: 0o700 });
  const now = new Date().toISOString();
  const permit = {
    schemaVersion: 2,
    admissionId,
    status: "reserved",
    canary: false,
    actor: "owner:test",
    taskRef: "AK-test",
    repoRoot,
    objective: "terminal retention test",
    objectiveDigest: "a".repeat(64),
    reservationBytes: 1,
    authorizedAt: now,
    expiresAt: new Date(Date.now() + 60_000).toISOString(),
    configDigest: "b".repeat(64),
    admissionStateDigest: "c".repeat(64),
    inventoryDigest: "d".repeat(64),
    reservedAt: now,
    peerRunId,
    worktreePath,
    branchName: "candidate/missing",
  };
  const path = candidateAdmissionPermitPath(admissionId, env);
  writeAdmissionJson(path, permit);
  return { path, permit };
}

function hardKillRetention(functionName, hookName, resourceId, env) {
  const moduleUrl = new URL("../src/candidatePeerTerminalRetention.ts", import.meta.url).href;
  const script = `
    const mod = await import(${JSON.stringify(moduleUrl)});
    mod[${JSON.stringify(functionName)}]({
      resourceId: ${JSON.stringify(resourceId)},
      testHooks: { [${JSON.stringify(hookName)}]: () => process.kill(process.pid, "SIGKILL") }
    });
    process.exit(97);
  `;
  const child = spawnSync(process.execPath, ["--input-type=module", "--eval", script], {
    encoding: "utf8",
    env: { ...process.env, ...env },
  });
  assert.equal(child.signal, "SIGKILL", child.stderr || child.stdout);
}

function setupLinkedWorktree(root) {
  const repoRoot = join(root, "owner");
  const worktreePath = join(root, "candidate");
  mkdirSync(repoRoot);
  execFileSync("git", ["init", "-b", "main", repoRoot]);
  git(repoRoot, "config", "user.email", "terminal@example.test");
  git(repoRoot, "config", "user.name", "Terminal Test");
  writeFileSync(join(repoRoot, "tracked.txt"), "base\n");
  git(repoRoot, "add", "tracked.txt");
  git(repoRoot, "commit", "-m", "base");
  git(repoRoot, "worktree", "add", "-b", "candidate/terminal", worktreePath, "HEAD");
  return { repoRoot, worktreePath };
}

function writeRegistry({ env, peerRunId, repoRoot, worktreePath, branchName }) {
  const record = createCandidatePeerRegistryRecord(
    {
      peerRunId,
      tool: "candidate_peer_spawn",
      canonicalTool: "candidate_peer_spawn",
      parentCwd: repoRoot,
      repoRoot,
      worktreePath,
      branchName,
      baseRef: git(repoRoot, "rev-parse", "HEAD"),
      parentDirty: false,
      reusedExisting: false,
      reportBack: "manual",
      launch: { status: "launched" },
    },
    env,
  );
  writeCandidatePeerRegistryRecord(record, env);
  return record;
}

function cleanedFixture(root, env, peerRunId = "candidatepeer-terminal-cleaned") {
  const { repoRoot, worktreePath } = setupLinkedWorktree(root);
  writeFileSync(join(worktreePath, "tracked.txt"), "rejected candidate\n");
  writeFileSync(join(worktreePath, "untracked.txt"), "unique recovery bytes\n");
  writeRegistry({
    env,
    peerRunId,
    repoRoot,
    worktreePath,
    branchName: "candidate/terminal",
  });
  let record = migrateCandidateInventory(
    inventoryCandidatePeerResources({ registryDir: getCandidatePeerRegistryDir(env) }),
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
  const disposition = createDispositionReceipt({
    disposition: "rejected",
    actor: "owner:test",
    rationale: "terminal compaction synthetic rejection",
    issuedAt: new Date().toISOString(),
    reviewSnapshotDigest: snapshot.snapshotDigest,
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
  record = createRestorationVerifiedArchive({
    record,
    expectedVersion: record.resourceVersion,
    env,
  }).record;
  record = authorizeCandidateCleanup({
    record,
    expectedVersion: record.resourceVersion,
    actor: "owner:test",
    expiresAt: new Date(Date.now() + 60_000).toISOString(),
    effects: ["remove_worktree", "delete_branch"],
    env,
  });
  appendLifecycleEvent(
    record.resourceId,
    { event: "retention_compression_fixture", payload: "x".repeat(2 * 1024 * 1024) },
    env,
  );
  const cleaned = executeAuthorizedCandidateCleanup({ resourceId: record.resourceId, env });
  return { cleaned, peerRunId, repoRoot, worktreePath };
}

test("cleaned terminal state compacts losslessly after separate exact authorization", () =>
  withState((root, env) => {
    const fixture = cleanedFixture(root, env);
    const record = fixture.cleaned;
    const eventsPath = getCandidateLifecycleEventsPath(record.resourceId, env);
    const archiveDir = record.archive.archiveDir;
    const registryPath = getCandidatePeerRegistryPath(fixture.peerRunId, env);
    const originalRegistry = readFileSync(registryPath, "utf8");
    const originalDigest = digestObject(record);
    assert.equal(verifyTerminalCandidateRecord(record, env), originalDigest);

    const prepared = prepareTerminalCandidateCompaction({ resourceId: record.resourceId, env });
    assert.equal(existsSync(eventsPath), true);
    assert.equal(existsSync(archiveDir), true);
    assert.equal(JSON.parse(readFileSync(registryPath, "utf8")).schemaVersion, 1);
    assert.ok(prepared.sourceBytes > prepared.capsuleSize);
    assert.equal(
      prepareTerminalCandidateCompaction({ resourceId: record.resourceId, env }).preparationDigest,
      prepared.preparationDigest,
    );

    const now = new Date().toISOString();
    assert.throws(
      () =>
        authorizeTerminalCandidateCompaction({
          resourceId: record.resourceId,
          actor: "owner:test",
          expiresAt: new Date(Date.parse(now) + 31 * 60 * 1000).toISOString(),
          env,
        }),
      /within 30 minutes/,
    );
    const authorization = authorizeTerminalCandidateCompaction({
      resourceId: record.resourceId,
      actor: "owner:test",
      expiresAt: new Date(Date.parse(now) + 60_000).toISOString(),
      env,
    });
    assert.match(authorization.authorizationDigest, /^[a-f0-9]{64}$/);

    const lateArchiveMember = join(archiveDir, "late-after-marker.txt");
    assert.throws(
      () =>
        executeAuthorizedTerminalCandidateCompaction({
          resourceId: record.resourceId,
          env,
          testHooks: {
            afterMarkerCommit() {
              writeFileSync(lateArchiveMember, "late archive bytes\n", { mode: 0o600 });
            },
          },
        }),
      /archive source member set drifted/,
    );
    assert.equal(existsSync(eventsPath), true);
    assert.equal(existsSync(archiveDir), true);
    assert.throws(() => verifyTerminalCandidateRecord(record, env), /archive object hash mismatch/);
    rmSync(lateArchiveMember);
    assert.equal(verifyTerminalCandidateRecord(record, env), originalDigest);

    const result = executeAuthorizedTerminalCandidateCompaction({
      resourceId: record.resourceId,
      env,
    });
    assert.equal(result.marker.terminalRecordDigest, originalDigest);
    assert.equal(result.garbageCollectionReceipt.removedEvents, true);
    assert.equal(result.garbageCollectionReceipt.removedArchive, true);
    assert.equal(existsSync(eventsPath), false);
    assert.equal(existsSync(archiveDir), false);
    assert.equal(readFileSync(registryPath, "utf8"), originalRegistry);
    assert.deepEqual(result.garbageCollectionReceipt.registryRecordsRetained, [fixture.peerRunId]);
    assert.equal(
      verifyTerminalCandidateRecord(readLifecycleRecord(record.resourceId, env), env),
      originalDigest,
    );

    const inventory = inventoryCandidatePeerResources({
      registryDir: getCandidatePeerRegistryDir(env),
    });
    assert.equal(inventory.registryRecordCount, 1);
    assert.deepEqual(inventory.resources[0].aliases, [fixture.peerRunId]);
    assert.equal(inventory.resources[0].resourceId, record.resourceId);

    appendFileSync(result.marker.capsulePath, "tamper");
    assert.throws(
      () => verifyTerminalCandidateRecord(readLifecycleRecord(record.resourceId, env), env),
      /capsule size or digest mismatch/,
    );
  }));

test("marker-first compaction resumes exact remaining effects after crash and authorization expiry", () =>
  withState((root, env) => {
    const peerRunId = "candidatepeer-terminal-missing";
    const repoRoot = join(root, "missing-owner");
    const worktreePath = join(root, "missing-candidate");
    mkdirSync(repoRoot);
    execFileSync("git", ["init", "-b", "main", repoRoot]);
    git(repoRoot, "config", "user.email", "missing@example.test");
    git(repoRoot, "config", "user.name", "Missing Test");
    writeFileSync(join(repoRoot, "tracked.txt"), "base\n");
    git(repoRoot, "add", "tracked.txt");
    git(repoRoot, "commit", "-m", "base");
    writeRegistry({
      env,
      peerRunId,
      repoRoot,
      worktreePath,
      branchName: "candidate/missing",
    });
    let record = migrateCandidateInventory(
      inventoryCandidatePeerResources({ registryDir: getCandidatePeerRegistryDir(env) }),
      env,
    )[0];
    record = reconcileMissingResource({
      record,
      expectedVersion: record.resourceVersion,
      actor: "owner:test",
      recoverable: ["registry identity"],
      lost: [],
      evidence: ["synthetic missing fixture"],
      env,
    });
    const eventsPath = getCandidateLifecycleEventsPath(record.resourceId, env);
    const originalEvents = readFileSync(eventsPath, "utf8");
    const terminalDigest = verifyTerminalCandidateRecord(record, env);

    const extraReceiptKey = structuredClone(record);
    extraReceiptKey.terminalReceipt.unexpected = true;
    assert.throws(
      () => verifyTerminalCandidateRecord(extraReceiptKey, env),
      /receipt schema mismatch/,
    );
    const impossibleReceiptTime = structuredClone(record);
    impossibleReceiptTime.terminalReceipt.at = "1970-01-01T00:00:00.000Z";
    assert.throws(
      () => verifyTerminalCandidateRecord(impossibleReceiptTime, env),
      /receipt digest or identity mismatch/,
    );
    const eventLines = originalEvents.trimEnd().split("\n");
    const lastEvent = JSON.parse(eventLines.at(-1));
    eventLines[eventLines.length - 1] = JSON.stringify({ ...lastEvent, unexpected: true });
    writeFileSync(eventsPath, `${eventLines.join("\n")}\n`, { mode: 0o600 });
    assert.throws(() => verifyTerminalCandidateRecord(record, env), /exact final lifecycle event/);
    writeFileSync(eventsPath, originalEvents, { mode: 0o600 });

    const publishedAdmission = writeReservedAdmission({
      env,
      admissionId: "cadm-terminal-published",
      peerRunId,
      repoRoot,
      worktreePath,
    });
    mkdirSync(worktreePath);
    assert.throws(
      () => verifyTerminalCandidateRecord(record, env),
      /worktree is present|has reappeared/,
    );
    rmSync(worktreePath, { recursive: true });

    hardKillRetention(
      "prepareTerminalCandidateCompaction",
      "afterCapsuleCommit",
      record.resourceId,
      env,
    );
    assert.throws(
      () => prepareTerminalCandidateCompaction({ resourceId: record.resourceId, env }),
      /registry mutation is locked/,
    );
    const preparationRecovery = recoverTerminalCandidateCompactionLocks({
      resourceId: record.resourceId,
      actor: "owner:test",
      env,
    });
    assert.deepEqual(
      preparationRecovery.recoveredLocks.map((lock) => lock.kind),
      ["resource", "registry"],
    );
    const retentionRoot = getTerminalRetentionGenerationDir(
      record.resourceId,
      record.generationId,
      env,
    );
    assert.equal(existsSync(join(retentionRoot, "terminal-capsule.tar.gz")), true);
    assert.equal(existsSync(join(retentionRoot, "preparation.json")), false);
    prepareTerminalCandidateCompaction({ resourceId: record.resourceId, env });
    assert.equal(existsSync(join(retentionRoot, "preparation.json")), true);
    assert.equal(
      readdirSync(retentionRoot).some((name) => name.startsWith(".prepare.")),
      false,
    );

    authorizeTerminalCandidateCompaction({
      resourceId: record.resourceId,
      actor: "owner:test",
      expiresAt: new Date(Date.now() + 500).toISOString(),
      env,
    });
    assert.throws(
      () =>
        executeAuthorizedTerminalCandidateCompaction({
          resourceId: record.resourceId,
          env,
          testHooks: {
            beforeMarkerPublication() {
              Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, 550);
            },
          },
        }),
      /authorization expired/,
    );
    assert.equal(existsSync(getTerminalCompactionMarkerPath(record.resourceId, env)), false);

    const lateAlias = "candidatepeer-terminal-missing-late-alias";
    writeRegistry({
      env,
      peerRunId: lateAlias,
      repoRoot,
      worktreePath,
      branchName: "candidate/missing",
    });
    assert.throws(
      () =>
        authorizeTerminalCandidateCompaction({
          resourceId: record.resourceId,
          actor: "owner:test",
          expiresAt: new Date(Date.now() + 1_000).toISOString(),
          env,
        }),
      /registry identity drifted/,
    );
    rmSync(getCandidatePeerRegistryPath(lateAlias, env));

    const unpublishedAdmission = writeReservedAdmission({
      env,
      admissionId: "cadm-terminal-unpublished",
      peerRunId: `${lateAlias}-bound`,
      repoRoot,
      worktreePath,
    });
    assert.throws(
      () =>
        authorizeTerminalCandidateCompaction({
          resourceId: record.resourceId,
          actor: "owner:test",
          expiresAt: new Date(Date.now() + 1_000).toISOString(),
          env,
        }),
      /admission entered before registry publication/,
    );
    rmSync(unpublishedAdmission.path);

    const expiresAt = new Date(Date.now() + 1_500).toISOString();
    authorizeTerminalCandidateCompaction({
      resourceId: record.resourceId,
      actor: "owner:test",
      expiresAt,
      env,
    });
    const registryPath = getCandidatePeerRegistryPath(peerRunId, env);
    const originalRegistry = readFileSync(registryPath, "utf8");
    appendFileSync(registryPath, " \n");
    assert.throws(
      () => executeAuthorizedTerminalCandidateCompaction({ resourceId: record.resourceId, env }),
      /source drifted/,
    );
    assert.equal(existsSync(getTerminalCompactionMarkerPath(record.resourceId, env)), false);
    writeFileSync(registryPath, originalRegistry, { mode: 0o600 });

    assert.throws(
      () =>
        executeAuthorizedTerminalCandidateCompaction({
          resourceId: record.resourceId,
          env,
          testHooks: {
            beforeMarkerCommit() {
              appendFileSync(eventsPath, '{"event":"late-before-marker"}\n');
            },
          },
        }),
      /source drifted/,
    );
    assert.equal(existsSync(getTerminalCompactionMarkerPath(record.resourceId, env)), false);
    writeFileSync(eventsPath, originalEvents, { mode: 0o600 });

    assert.throws(
      () =>
        executeAuthorizedTerminalCandidateCompaction({
          resourceId: record.resourceId,
          env,
          testHooks: {
            afterMarkerCommit() {
              appendFileSync(eventsPath, '{"event":"late-after-marker"}\n');
            },
          },
        }),
      /not capsule-bound/,
    );
    assert.equal(existsSync(getTerminalCompactionMarkerPath(record.resourceId, env)), true);
    assert.equal(existsSync(eventsPath), true);
    assert.throws(() => verifyTerminalCandidateRecord(record, env), /exact final lifecycle event/);
    writeFileSync(eventsPath, originalEvents, { mode: 0o600 });

    assert.throws(
      () =>
        executeAuthorizedTerminalCandidateCompaction({
          resourceId: record.resourceId,
          env,
          testHooks: {
            beforeGarbageCollection() {
              mkdirSync(worktreePath);
            },
          },
        }),
      /worktree is present|has reappeared/,
    );
    assert.equal(existsSync(eventsPath), true);
    assert.equal(existsSync(join(retentionRoot, "gc-receipt.json")), false);
    rmSync(worktreePath, { recursive: true });

    assert.throws(
      () =>
        executeAuthorizedTerminalCandidateCompaction({
          resourceId: record.resourceId,
          env,
          testHooks: {
            afterCapsuleMaterialization() {
              mkdirSync(worktreePath);
            },
          },
        }),
      /worktree is present|has reappeared/,
    );
    assert.equal(existsSync(eventsPath), true);
    assert.equal(existsSync(join(retentionRoot, "gc-receipt.json")), false);
    rmSync(worktreePath, { recursive: true });

    hardKillRetention(
      "executeAuthorizedTerminalCandidateCompaction",
      "beforeGarbageCollection",
      record.resourceId,
      env,
    );
    assert.throws(
      () => executeAuthorizedTerminalCandidateCompaction({ resourceId: record.resourceId, env }),
      /registry mutation is locked/,
    );
    const executionRecovery = recoverTerminalCandidateCompactionLocks({
      resourceId: record.resourceId,
      actor: "owner:test",
      env,
    });
    assert.equal(executionRecovery.recoveredLocks.length, 2);

    mkdirSync(worktreePath);
    assert.throws(
      () => executeAuthorizedTerminalCandidateCompaction({ resourceId: record.resourceId, env }),
      /worktree is present|has reappeared/,
    );
    assert.equal(existsSync(eventsPath), true);
    assert.equal(existsSync(join(retentionRoot, "gc-receipt.json")), false);
    rmSync(worktreePath, { recursive: true });

    const waitForExpiryMs = Math.max(1, Date.parse(expiresAt) - Date.now() + 25);
    Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, waitForExpiryMs);
    const resumed = executeAuthorizedTerminalCandidateCompaction({
      resourceId: record.resourceId,
      env,
    });
    assert.equal(resumed.garbageCollectionReceipt.removedEvents, true);
    assert.equal(resumed.garbageCollectionReceipt.removedArchive, false);
    assert.equal(existsSync(getCandidateLifecycleEventsPath(record.resourceId, env)), false);
    assert.equal(
      verifyTerminalCandidateRecord(readLifecycleRecord(record.resourceId, env), env),
      terminalDigest,
    );
    const released = releaseCandidateAdmission(
      {
        admissionId: publishedAdmission.permit.admissionId,
        outcome: "terminal_reconciled",
        terminalReceiptRef: getCandidateLifecycleRecordPath(record.resourceId, env),
      },
      env,
    );
    assert.equal(released.status, "released");
    assert.equal(released.terminalReceiptDigest, terminalDigest);

    const afterCompactionAlias = "candidatepeer-terminal-missing-after-compaction";
    writeRegistry({
      env,
      peerRunId: afterCompactionAlias,
      repoRoot,
      worktreePath,
      branchName: "candidate/missing",
    });
    assert.throws(
      () => verifyTerminalCandidateRecord(readLifecycleRecord(record.resourceId, env), env),
      /aliases do not exactly match/,
    );
    rmSync(getCandidatePeerRegistryPath(afterCompactionAlias, env));

    writeFileSync(eventsPath, originalEvents, { mode: 0o600 });
    assert.throws(
      () => verifyTerminalCandidateRecord(readLifecycleRecord(record.resourceId, env), env),
      /GC receipt does not match retired source state/,
    );
    rmSync(eventsPath);
    symlinkSync(join(root, "missing-event-target"), eventsPath);
    assert.throws(
      () => verifyTerminalCandidateRecord(readLifecycleRecord(record.resourceId, env), env),
      /GC receipt does not match retired source state/,
    );
    rmSync(eventsPath);
    assert.ok(
      statSync(
        join(
          getCandidateLifecycleRoot(env),
          "terminal-retention",
          record.resourceId,
          record.generationId,
          "gc-receipt.json",
        ),
      ).size > 0,
    );
  }));

test("partial archive quarantine deletion revalidates remaining bytes before resume", () =>
  withState((root, env) => {
    const fixture = cleanedFixture(root, env, "candidatepeer-terminal-partial-archive");
    const record = fixture.cleaned;
    const retentionRoot = join(
      getCandidateLifecycleRoot(env),
      "terminal-retention",
      record.resourceId,
      record.generationId,
    );
    const originalArchiveMembers = new Map(
      readdirSync(record.archive.archiveDir).map((name) => {
        const path = join(record.archive.archiveDir, name);
        return [name, { bytes: readFileSync(path), mode: statSync(path).mode & 0o777 }];
      }),
    );
    prepareTerminalCandidateCompaction({ resourceId: record.resourceId, env });
    authorizeTerminalCandidateCompaction({
      resourceId: record.resourceId,
      actor: "owner:test",
      expiresAt: new Date(Date.now() + 5_000).toISOString(),
      env,
    });
    let mutatedName;
    assert.throws(
      () =>
        executeAuthorizedTerminalCandidateCompaction({
          resourceId: record.resourceId,
          env,
          testHooks: {
            afterArchiveMemberRemoval(_name, index) {
              if (index !== 0) return;
              const quarantine = join(retentionRoot, "archive.gc");
              mutatedName = readdirSync(quarantine).sort()[0];
              appendFileSync(join(quarantine, mutatedName), "late unique archive bytes\n");
            },
          },
        }),
      /archive quarantine member .* is not capsule-bound/,
    );
    assert.ok(mutatedName);
    const original = originalArchiveMembers.get(mutatedName);
    assert.ok(original);
    writeFileSync(join(retentionRoot, "archive.gc", mutatedName), original.bytes, {
      mode: original.mode,
    });
    assert.equal(existsSync(record.archive.archiveDir), false);
    assert.equal(existsSync(join(retentionRoot, "archive.gc")), true);
    assert.equal(existsSync(join(retentionRoot, "gc-receipt.json")), false);

    const resumed = executeAuthorizedTerminalCandidateCompaction({
      resourceId: record.resourceId,
      env,
    });
    assert.equal(resumed.garbageCollectionReceipt.removedArchive, true);
    assert.equal(existsSync(join(retentionRoot, "archive.gc")), false);
    assert.equal(
      verifyTerminalCandidateRecord(readLifecycleRecord(record.resourceId, env), env),
      digestObject(record),
    );
  }));

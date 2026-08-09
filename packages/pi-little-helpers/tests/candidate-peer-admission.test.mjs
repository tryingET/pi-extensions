import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import {
  chmodSync,
  existsSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { test } from "node:test";
import { fileURLToPath } from "node:url";
import {
  activateCandidateAdmission,
  authorizeCandidateAdmission,
  bindCandidateAdmission,
  captureCandidateAdmissionPressure,
  expireCandidateAdmission,
  getCandidateAdmissionConfigPath,
  getCandidateAdmissionRoot,
  getCandidateSpawnHoldPath,
  readCandidateAdmissionConfig,
  releaseCandidateAdmission,
  reserveCandidateAdmission,
  writeCandidateAdmissionConfig,
} from "../src/candidatePeerAdmission.ts";
import {
  candidateAdmissionPermitPath,
  commitCandidateAdmissionActivation,
  recoverCandidateAdmissionActivation,
  writeAdmissionJson,
} from "../src/candidatePeerAdmissionState.ts";
import {
  digestObject,
  getCandidateLifecycleEventsPath,
  getCandidateLifecycleRecordPath,
  getCandidateLifecycleRoot,
} from "../src/candidatePeerLifecycleV2.ts";
import {
  createCandidatePeerRegistryRecord,
  writeCandidatePeerRegistryRecord,
} from "../src/candidatePeerRegistry.ts";

const MIB = 1024 * 1024;

function setup() {
  const root = mkdtempSync(join(tmpdir(), "candidate-admission-"));
  chmodSync(root, 0o700);
  const env = { ...process.env, XDG_STATE_HOME: root };
  const repoRoot = join(root, "repo");
  mkdirSync(repoRoot);
  assert.equal(spawnSync("git", ["init", "--quiet", repoRoot]).status, 0);
  const now = "2026-07-18T00:00:00.000Z";
  const limits = {
    maxUnresolvedResources: 8,
    maxUnresolvedBytes: 8 * MIB,
    maxUnresolvedAgeMs: 14 * 24 * 60 * 60 * 1000,
    maxActiveAdmissions: 4,
    warningUnresolvedResources: 6,
    warningUnresolvedBytes: 6 * MIB,
  };
  const config = {
    schemaVersion: 2,
    mode: "canary",
    ownerDecisionRef: "AK decision 60",
    createdAt: now,
    updatedAt: now,
    global: limits,
    repositories: { [repoRoot]: { ...limits, maxActiveAdmissions: 2 } },
  };
  writeCandidateAdmissionConfig(config, env);
  const holdPath = getCandidateSpawnHoldPath(env);
  mkdirSync(join(root, "pi-quests"), { recursive: true, mode: 0o700 });
  writeFileSync(
    holdPath,
    `${JSON.stringify({ schemaVersion: 1, status: "active", decisionRef: "AK decision 59" }, null, 2)}\n`,
    { mode: 0o600 },
  );
  return { root, env, repoRoot, now, config, holdPath };
}

function authorize({ env, repoRoot, now, objective = "Run exact canary", ...overrides }) {
  return authorizeCandidateAdmission(
    {
      repoRoot,
      objective,
      actor: "operator",
      taskRef: "AK task 4029",
      reservationBytes: MIB,
      expiresAt: "2026-07-18T01:00:00.000Z",
      ...overrides,
    },
    env,
    now,
  );
}

function writeTerminalRecord({ env, repoRoot, resourceId, worktreePath, peerRunId }) {
  const generationId = "gen-v1-bbbbbbbbbbbbbbbbbbbb";
  const path = getCandidateLifecycleRecordPath(resourceId, env);
  const eventsPath = getCandidateLifecycleEventsPath(resourceId, env);
  mkdirSync(dirname(path), { recursive: true, mode: 0o700 });
  const archiveDir = join(getCandidateLifecycleRoot(env), "archives", resourceId, generationId);
  mkdirSync(archiveDir, { recursive: true, mode: 0o700 });
  writeFileSync(join(archiveDir, "manifest.json"), "{}\n", { mode: 0o600 });
  writeFileSync(join(archiveDir, "COMPLETE"), '{"archiveDigest":"archive-test"}\n', {
    mode: 0o600,
  });
  const authorizationBase = {
    schemaVersion: 2,
    resourceId,
    generationId,
    authorizedResourceVersion: 2,
    aliases: [peerRunId],
    actor: "owner:test",
    issuedAt: "2026-07-18T00:01:00.000Z",
    expiresAt: "2026-07-18T01:00:00.000Z",
    nonce: "nonce-test",
    dispositionDigest: "disposition-test",
    reviewSnapshotDigest: "review-test",
    archiveDigest: "archive-test",
    expectedWorktreeRealPath: worktreePath,
    expectedGitCommonDir: join(repoRoot, ".git"),
    branchName: "candidatepeer/test",
    branchOid: "a".repeat(40),
    effects: ["delete_branch", "remove_worktree"],
  };
  const authorization = {
    ...authorizationBase,
    authorizationDigest: digestObject(authorizationBase),
  };
  const effects = ["delete_branch", "remove_worktree"].map((effect, index) => {
    const unsigned = {
      event: "cleanup_effect_observed",
      effect,
      authorizationDigest: authorization.authorizationDigest,
      attemptId: `attempt-${index}`,
      at: `2026-07-18T00:02:0${index}.000Z`,
      ...(effect === "delete_branch"
        ? { branchName: "candidatepeer/test", branchOid: "a".repeat(40) }
        : { worktreePath }),
    };
    return { ...unsigned, observationDigest: digestObject(unsigned) };
  });
  const receiptBase = {
    schemaVersion: 2,
    type: "cleaned",
    resourceId,
    generationId,
    effects,
    at: "2026-07-18T00:03:00.000Z",
    archiveDigest: "archive-test",
    authorizationDigest: authorization.authorizationDigest,
  };
  const record = {
    schemaVersion: 2,
    resourceId,
    generationId,
    resourceVersion: 3,
    state: "cleaned",
    createdAt: "2026-07-18T00:01:00.000Z",
    updatedAt: "2026-07-18T00:03:00.000Z",
    worktreePath,
    aliases: [peerRunId],
    repoRoots: [repoRoot],
    branchNames: ["candidatepeer/test"],
    migrationInventoryDigest: "inventory-test",
    archive: { archiveDir, archiveDigest: "archive-test", verifiedAt: "2026-07-18T00:01:30.000Z" },
    cleanupAuthorization: authorization,
    terminalReceipt: { ...receiptBase, receiptDigest: digestObject(receiptBase) },
  };
  const finalEvent = {
    event: "cleaned",
    at: record.updatedAt,
    fromVersion: record.resourceVersion - 1,
    record,
  };
  writeFileSync(path, `${JSON.stringify(record, null, 2)}\n`, { mode: 0o600 });
  writeFileSync(
    eventsPath,
    `${effects.map((effect) => JSON.stringify(effect)).join("\n")}\n${JSON.stringify(finalEvent)}\n`,
    { mode: 0o600 },
  );
  return { path, record, digest: digestObject(record) };
}

test("canary admission reserves, binds, releases, and supersedes only the spawn hold", () => {
  const { env, repoRoot, now, holdPath } = setup();
  const permit = authorize({ env, repoRoot, now });
  const reservation = reserveCandidateAdmission(
    { repoRoot, objective: "Run exact canary" },
    env,
    "2026-07-18T00:01:00.000Z",
  );
  assert.equal(reservation.admissionId, permit.admissionId);
  assert.equal(reservation.permit.canary, true);
  const worktreePath = join(repoRoot, "worktree");
  bindCandidateAdmission(
    {
      admissionId: permit.admissionId,
      peerRunId: "candidatepeer-test",
      worktreePath,
      branchName: "candidatepeer/test",
    },
    env,
  );
  assert.equal(
    captureCandidateAdmissionPressure(env, "2026-07-18T00:02:00.000Z").activeAdmissions,
    1,
  );
  const receipt = writeTerminalRecord({
    env,
    repoRoot,
    resourceId: "cpr-aaaaaaaaaaaaaaaaaaaaaaaa",
    worktreePath,
    peerRunId: "candidatepeer-test",
  });
  const released = releaseCandidateAdmission(
    {
      admissionId: permit.admissionId,
      outcome: "terminal_cleaned",
      terminalReceiptRef: receipt.path,
    },
    env,
    "2026-07-18T00:03:00.000Z",
  );
  const decisionPath = join(getCandidateAdmissionRoot(env), "decisions", "decision-60.json");
  mkdirSync(dirname(decisionPath), { recursive: true, mode: 0o700 });
  const decisionArtifact = {
    schemaVersion: 1,
    decisionRef: "AK decision 60",
    status: "accepted",
    taskRef: permit.taskRef,
    canaryAdmissionId: permit.admissionId,
    terminalReceiptDigest: released.terminalReceiptDigest,
    admissionConfigDigest: digestObject(readCandidateAdmissionConfig(env)),
    reviewedAt: "2026-07-18T00:03:30.000Z",
  };
  writeFileSync(decisionPath, `${JSON.stringify(decisionArtifact, null, 2)}\n`, { mode: 0o600 });
  const activationInput = {
    decisionRef: "AK decision 60",
    canaryAdmissionId: permit.admissionId,
    terminalReceiptRef: receipt.path,
    decisionArtifactPath: decisionPath,
    decisionArtifactDigest: digestObject(decisionArtifact),
  };
  activateCandidateAdmission(activationInput, env, "2026-07-18T00:04:00.000Z");
  const retry = activateCandidateAdmission(activationInput, env, "2026-07-18T00:05:00.000Z");
  assert.equal(retry.config.mode, "active");
  assert.equal(readCandidateAdmissionConfig(env).mode, "active");
  const hold = JSON.parse(readFileSync(holdPath, "utf8"));
  assert.equal(hold.status, "superseded_by_admission_v2");
  assert.equal(hold.preservedBoundary, "Historical v1 cleanup remains permanently non-executable.");
});

test("owner expiry records an authorized permit only at or after its canonical expiry", () => {
  const { env, repoRoot, now } = setup();
  const permit = authorize({ env, repoRoot, now });
  assert.throws(
    () => expireCandidateAdmission({ admissionId: permit.admissionId }, env, "not-a-date"),
    /canonical UTC timestamp/,
  );
  assert.throws(
    () =>
      expireCandidateAdmission(
        { admissionId: permit.admissionId },
        env,
        "2026-07-18T00:59:59.999Z",
      ),
    /unexpired candidate admission/,
  );

  assert.equal(captureCandidateAdmissionPressure(env, now).activeAdmissions, 0);
  const expiredAt = "2026-07-18T01:00:00.000Z";
  const expired = expireCandidateAdmission({ admissionId: permit.admissionId }, env, expiredAt);
  assert.equal(expired.status, "expired");
  assert.equal(expired.expiredAt, expiredAt);
  assert.deepEqual(
    JSON.parse(readFileSync(candidateAdmissionPermitPath(permit.admissionId, env), "utf8")),
    expired,
  );
  assert.equal(captureCandidateAdmissionPressure(env, expiredAt).activeAdmissions, 0);
  assert.throws(
    () => expireCandidateAdmission({ admissionId: permit.admissionId }, env, expiredAt),
    /already expired/,
  );

  const replacement = authorize({
    env,
    repoRoot,
    now: expiredAt,
    expiresAt: "2026-07-18T02:00:00.000Z",
  });
  const reservation = reserveCandidateAdmission(
    { repoRoot, objective: replacement.objective },
    env,
    "2026-07-18T01:00:00.001Z",
  );
  assert.equal(reservation.admissionId, replacement.admissionId);
  assert.equal(reservation.permit.status, "reserved");
});

test("candidate-admission-v2 exposes the owner expiry command", () => {
  const { root, env, repoRoot, now } = setup();
  const permit = authorize({ env, repoRoot, now });
  const inputPath = join(root, "expire-input.json");
  writeFileSync(inputPath, `${JSON.stringify({ admissionId: permit.admissionId })}\n`, {
    mode: 0o600,
  });
  const scriptPath = fileURLToPath(
    new URL("../scripts/candidate-admission-v2.mjs", import.meta.url),
  );
  const result = spawnSync(process.execPath, [scriptPath, "expire", "--input", inputPath], {
    encoding: "utf8",
    env,
  });
  assert.equal(result.status, 0, result.stderr);
  const output = JSON.parse(result.stdout);
  assert.equal(output.command, "expire");
  assert.equal(output.permit.status, "expired");
  assert.ok(output.permit.expiredAt);
});

test("owner expiry rejects authorized permits carrying reservation or binding fields", () => {
  const malformedFields = {
    reservedAt: "2026-07-18T00:01:00.000Z",
    peerRunId: "candidatepeer-malformed-authorized",
    worktreePath: "/tmp/malformed-authorized-worktree",
    branchName: "candidatepeer/malformed-authorized",
  };
  for (const [field, value] of Object.entries(malformedFields)) {
    const { env, repoRoot, now } = setup();
    const permit = authorize({ env, repoRoot, now });
    const path = candidateAdmissionPermitPath(permit.admissionId, env);
    writeAdmissionJson(path, { ...permit, [field]: value });

    assert.throws(
      () =>
        expireCandidateAdmission(
          { admissionId: permit.admissionId },
          env,
          "2026-07-18T01:00:00.000Z",
        ),
      /reservation or binding fields/,
      field,
    );
    const persisted = JSON.parse(readFileSync(path, "utf8"));
    assert.equal(persisted.status, "authorized", field);
    assert.equal(persisted[field], value, field);
  }
});

test("owner expiry rejects reserved, bound, and released permits", () => {
  const reservedSetup = setup();
  const reservedPermit = authorize(reservedSetup);
  reserveCandidateAdmission(
    { repoRoot: reservedSetup.repoRoot, objective: reservedPermit.objective },
    reservedSetup.env,
    "2026-07-18T00:01:00.000Z",
  );
  assert.throws(
    () =>
      expireCandidateAdmission(
        { admissionId: reservedPermit.admissionId },
        reservedSetup.env,
        "2026-07-18T01:00:00.000Z",
      ),
    /reserved candidate admission/,
  );

  const boundSetup = setup();
  const boundPermit = authorize(boundSetup);
  reserveCandidateAdmission(
    { repoRoot: boundSetup.repoRoot, objective: boundPermit.objective },
    boundSetup.env,
    "2026-07-18T00:01:00.000Z",
  );
  bindCandidateAdmission(
    {
      admissionId: boundPermit.admissionId,
      peerRunId: "candidatepeer-expiry-bound",
      worktreePath: join(boundSetup.repoRoot, "expiry-bound-worktree"),
      branchName: "candidatepeer/expiry-bound",
    },
    boundSetup.env,
  );
  assert.throws(
    () =>
      expireCandidateAdmission(
        { admissionId: boundPermit.admissionId },
        boundSetup.env,
        "2026-07-18T01:00:00.000Z",
      ),
    /bound candidate admission/,
  );

  const releasedSetup = setup();
  const releasedPermit = authorize(releasedSetup);
  reserveCandidateAdmission(
    { repoRoot: releasedSetup.repoRoot, objective: releasedPermit.objective },
    releasedSetup.env,
    "2026-07-18T00:01:00.000Z",
  );
  releaseCandidateAdmission(
    {
      admissionId: releasedPermit.admissionId,
      outcome: "preparation_failed",
      terminalReceiptRef: `candidate-preparation-failed:${"a".repeat(64)}`,
    },
    releasedSetup.env,
    "2026-07-18T00:02:00.000Z",
  );
  assert.throws(
    () =>
      expireCandidateAdmission(
        { admissionId: releasedPermit.admissionId },
        releasedSetup.env,
        "2026-07-18T01:00:00.000Z",
      ),
    /released candidate admission/,
  );
});

test("owner expiry requires owner-only state and the exclusive admission lock", () => {
  const ownerSetup = setup();
  const ownerPermit = authorize(ownerSetup);
  chmodSync(getCandidateAdmissionRoot(ownerSetup.env), 0o755);
  assert.throws(
    () =>
      expireCandidateAdmission(
        { admissionId: ownerPermit.admissionId },
        ownerSetup.env,
        "2026-07-18T01:00:00.000Z",
      ),
    /not owner-only/,
  );

  const lockedSetup = setup();
  const lockedPermit = authorize(lockedSetup);
  writeFileSync(join(getCandidateAdmissionRoot(lockedSetup.env), "admission.lock"), "held\n", {
    mode: 0o600,
  });
  assert.throws(
    () =>
      expireCandidateAdmission(
        { admissionId: lockedPermit.admissionId },
        lockedSetup.env,
        "2026-07-18T01:00:00.000Z",
      ),
    /lock is held or stale/,
  );
});

test("activation preflights hold ownership before mutating canary config", () => {
  const { env, config, holdPath } = setup();
  const beforeConfig = readCandidateAdmissionConfig(env);
  const beforeHold = JSON.parse(readFileSync(holdPath, "utf8"));
  chmodSync(dirname(holdPath), 0o755);
  assert.throws(
    () =>
      commitCandidateAdmissionActivation(
        {
          requestDigest: "a".repeat(64),
          activeConfig: { ...config, mode: "active" },
          activeHold: { ...beforeHold, status: "superseded_by_admission_v2" },
        },
        env,
      ),
    /not owner-only/,
  );
  assert.deepEqual(readCandidateAdmissionConfig(env), beforeConfig);
  assert.deepEqual(JSON.parse(readFileSync(holdPath, "utf8")), beforeHold);
});

test("activation journal rolls back a crash after only config publication", () => {
  const { env, config, holdPath } = setup();
  const requestDigest = "b".repeat(64);
  const configPath = getCandidateAdmissionConfigPath(env);
  const previousHold = JSON.parse(readFileSync(holdPath, "utf8"));
  const activeConfig = { ...config, mode: "active" };
  const activeHold = { ...previousHold, status: "superseded_by_admission_v2" };
  const unsigned = {
    schemaVersion: 1,
    requestDigest,
    configPath,
    holdPath,
    previousConfig: config,
    previousHold,
    activeConfig,
    activeHold,
    createdAt: "2026-07-18T00:04:00.000Z",
  };
  const journalPath = join(getCandidateAdmissionRoot(env), "activation.pending.json");
  writeAdmissionJson(journalPath, { ...unsigned, journalDigest: digestObject(unsigned) });
  writeAdmissionJson(configPath, activeConfig);

  assert.equal(recoverCandidateAdmissionActivation(requestDigest, env).status, "rolled_back");
  assert.equal(readCandidateAdmissionConfig(env).mode, "canary");
  assert.deepEqual(JSON.parse(readFileSync(holdPath, "utf8")), previousHold);
  assert.equal(existsSync(journalPath), false);
});

test("activation journal recognizes a fully published pair and rejects unexpected drift", () => {
  const complete = setup();
  const completeRequestDigest = "c".repeat(64);
  const completeConfigPath = getCandidateAdmissionConfigPath(complete.env);
  const completePreviousHold = JSON.parse(readFileSync(complete.holdPath, "utf8"));
  const completeActiveConfig = { ...complete.config, mode: "active" };
  const completeActiveHold = {
    ...completePreviousHold,
    status: "superseded_by_admission_v2",
  };
  const completeUnsigned = {
    schemaVersion: 1,
    requestDigest: completeRequestDigest,
    configPath: completeConfigPath,
    holdPath: complete.holdPath,
    previousConfig: complete.config,
    previousHold: completePreviousHold,
    activeConfig: completeActiveConfig,
    activeHold: completeActiveHold,
    createdAt: "2026-07-18T00:04:00.000Z",
  };
  const completeJournal = join(getCandidateAdmissionRoot(complete.env), "activation.pending.json");
  writeAdmissionJson(completeJournal, {
    ...completeUnsigned,
    journalDigest: digestObject(completeUnsigned),
  });
  writeAdmissionJson(completeConfigPath, completeActiveConfig);
  writeAdmissionJson(complete.holdPath, completeActiveHold);
  assert.equal(
    recoverCandidateAdmissionActivation(completeRequestDigest, complete.env).status,
    "completed",
  );
  assert.equal(existsSync(completeJournal), false);

  const drift = setup();
  const driftRequestDigest = "d".repeat(64);
  const driftConfigPath = getCandidateAdmissionConfigPath(drift.env);
  const driftPreviousHold = JSON.parse(readFileSync(drift.holdPath, "utf8"));
  const driftActiveConfig = { ...drift.config, mode: "active" };
  const driftActiveHold = { ...driftPreviousHold, status: "superseded_by_admission_v2" };
  const driftUnsigned = {
    schemaVersion: 1,
    requestDigest: driftRequestDigest,
    configPath: driftConfigPath,
    holdPath: drift.holdPath,
    previousConfig: drift.config,
    previousHold: driftPreviousHold,
    activeConfig: driftActiveConfig,
    activeHold: driftActiveHold,
    createdAt: "2026-07-18T00:04:00.000Z",
  };
  const driftJournal = join(getCandidateAdmissionRoot(drift.env), "activation.pending.json");
  writeAdmissionJson(driftJournal, {
    ...driftUnsigned,
    journalDigest: digestObject(driftUnsigned),
  });
  writeAdmissionJson(driftConfigPath, { ...drift.config, updatedAt: "unexpected" });
  assert.throws(
    () => recoverCandidateAdmissionActivation(driftRequestDigest, drift.env),
    /state drifted during recovery/,
  );
  assert.equal(existsSync(driftJournal), true);
});

test("reservation rejects inventory drift after owner authorization", () => {
  const { env, repoRoot, now } = setup();
  authorize({ env, repoRoot, now });
  const record = createCandidatePeerRegistryRecord(
    {
      peerRunId: "candidatepeer-drift",
      tool: "candidate_peer_spawn",
      canonicalTool: "candidate_peer_spawn",
      parentCwd: repoRoot,
      repoRoot,
      worktreePath: join(repoRoot, "missing-worktree"),
      branchName: "candidatepeer/drift",
      baseRef: "HEAD",
      parentDirty: false,
      reusedExisting: false,
      reportBack: "none",
      launch: { status: "launch_failed" },
    },
    env,
    "2026-07-18T00:00:30.000Z",
  );
  writeCandidatePeerRegistryRecord(record, env);
  assert.throws(
    () =>
      reserveCandidateAdmission(
        { repoRoot, objective: "Run exact canary" },
        env,
        "2026-07-18T00:01:00.000Z",
      ),
    /state drifted/,
  );
});

test("same-size worktree content drift invalidates authorization", () => {
  const { env, repoRoot, now } = setup();
  const worktreePath = join(repoRoot, "content-drift-worktree");
  mkdirSync(worktreePath);
  writeFileSync(join(worktreePath, "value.txt"), "AAAA");
  writeCandidatePeerRegistryRecord(
    createCandidatePeerRegistryRecord(
      {
        peerRunId: "candidatepeer-content-drift",
        tool: "candidate_peer_spawn",
        canonicalTool: "candidate_peer_spawn",
        parentCwd: repoRoot,
        repoRoot,
        worktreePath,
        branchName: "candidatepeer/content-drift",
        baseRef: "HEAD",
        parentDirty: false,
        reusedExisting: false,
        reportBack: "none",
        launch: { status: "launch_failed" },
      },
      env,
      now,
    ),
    env,
  );
  authorize({ env, repoRoot, now });
  writeFileSync(join(worktreePath, "value.txt"), "BBBB");
  assert.throws(
    () =>
      reserveCandidateAdmission(
        { repoRoot, objective: "Run exact canary" },
        env,
        "2026-07-18T00:01:00.000Z",
      ),
    /state drifted/,
  );
});

test("a bound admission retains its reserved byte charge", () => {
  const { env, repoRoot, now } = setup();
  const permit = authorize({ env, repoRoot, now });
  reserveCandidateAdmission(
    { repoRoot, objective: permit.objective },
    env,
    "2026-07-18T00:01:00.000Z",
  );
  const worktreePath = join(repoRoot, "reserved-worktree");
  mkdirSync(worktreePath);
  writeFileSync(join(worktreePath, "tiny.txt"), "x");
  bindCandidateAdmission(
    {
      admissionId: permit.admissionId,
      peerRunId: "candidatepeer-reserved",
      worktreePath,
      branchName: "candidatepeer/reserved",
    },
    env,
  );
  writeCandidatePeerRegistryRecord(
    createCandidatePeerRegistryRecord(
      {
        peerRunId: "candidatepeer-reserved",
        tool: "candidate_peer_spawn",
        canonicalTool: "candidate_peer_spawn",
        parentCwd: repoRoot,
        repoRoot,
        worktreePath,
        branchName: "candidatepeer/reserved",
        baseRef: "HEAD",
        parentDirty: false,
        reusedExisting: false,
        reportBack: "none",
        launch: { status: "launched" },
      },
      env,
      "2026-07-18T00:01:30.000Z",
    ),
    env,
  );
  const pressure = captureCandidateAdmissionPressure(env, "2026-07-18T00:02:00.000Z");
  assert.equal(pressure.activeAdmissions, 1);
  assert.ok(pressure.unresolvedBytes >= MIB);
});

test("release rejects fabricated terminal evidence", () => {
  const { env, repoRoot, now } = setup();
  const permit = authorize({ env, repoRoot, now });
  reserveCandidateAdmission(
    { repoRoot, objective: permit.objective },
    env,
    "2026-07-18T00:01:00.000Z",
  );
  bindCandidateAdmission(
    {
      admissionId: permit.admissionId,
      peerRunId: "candidatepeer-forged",
      worktreePath: join(repoRoot, "forged-worktree"),
      branchName: "candidatepeer/forged",
    },
    env,
  );
  assert.throws(
    () =>
      releaseCandidateAdmission(
        {
          admissionId: permit.admissionId,
          outcome: "terminal_cleaned",
          terminalReceiptRef: join(
            env.XDG_STATE_HOME,
            "pi-quests",
            "candidate-lifecycle-v2",
            "missing.json",
          ),
        },
        env,
        "2026-07-18T00:03:00.000Z",
      ),
    /ENOENT|owner artifact/,
  );
});

test("warnings require acknowledgement and hard limits cannot be acknowledged away", () => {
  const { env, repoRoot, now, config } = setup();
  const warningConfig = {
    ...config,
    global: { ...config.global, warningUnresolvedResources: 0 },
    repositories: {
      [repoRoot]: { ...config.repositories[repoRoot], warningUnresolvedResources: 0 },
    },
  };
  writeCandidateAdmissionConfig(warningConfig, env, undefined);
  assert.throws(() => authorize({ env, repoRoot, now }), /must bind actor, inventory/);
  const pressure = captureCandidateAdmissionPressure(env, now);
  assert.throws(
    () =>
      authorize({
        env,
        repoRoot,
        now,
        warningAcknowledgement: {
          actor: "operator",
          inventoryDigest: pressure.inventoryDigest,
          warnings: [
            "global unresolved resource warning threshold crossed",
            "repository unresolved resource warning threshold crossed",
          ],
          reason: "Malformed expiry must fail closed.",
          expiresAt: "not-a-date",
        },
      }),
    /canonical UTC timestamp/,
  );
  const first = authorize({
    env,
    repoRoot,
    now,
    warningAcknowledgement: {
      actor: "operator",
      inventoryDigest: pressure.inventoryDigest,
      warnings: [
        "global unresolved resource warning threshold crossed",
        "repository unresolved resource warning threshold crossed",
      ],
      reason: "Owner accepts one bounded canary against this exact inventory.",
      expiresAt: "2026-07-18T01:00:00.000Z",
    },
  });
  reserveCandidateAdmission(
    { repoRoot, objective: "Run exact canary" },
    env,
    "2026-07-18T00:01:00.000Z",
  );
  const digest = JSON.parse(readFileSync(getCandidateAdmissionConfigPath(env), "utf8"));
  writeCandidateAdmissionConfig(
    {
      ...digest,
      updatedAt: "2026-07-18T00:02:00.000Z",
      global: { ...digest.global, maxActiveAdmissions: 1 },
      repositories: {
        [repoRoot]: { ...digest.repositories[repoRoot], maxActiveAdmissions: 1 },
      },
    },
    env,
  );
  assert.throws(
    () =>
      authorize({
        env,
        repoRoot,
        now: "2026-07-18T00:03:00.000Z",
        objective: "Second candidate",
      }),
    /active admission hard limit exceeded/,
  );
  assert.ok(first.admissionId.startsWith("cadm-"));
});

test("active admission requires the hold to name the exact superseding decision", () => {
  const { env, repoRoot, now, config, holdPath } = setup();
  writeCandidateAdmissionConfig({ ...config, mode: "active" }, env);
  const permit = authorize({ env, repoRoot, now });
  assert.throws(
    () =>
      reserveCandidateAdmission(
        { repoRoot, objective: permit.objective },
        env,
        "2026-07-18T00:01:00.000Z",
      ),
    /superseding owner decision/,
  );
  writeFileSync(
    holdPath,
    `${JSON.stringify({ status: "superseded_by_admission_v2", supersededByDecisionRef: "AK decision 60" }, null, 2)}\n`,
    { mode: 0o600 },
  );
  const reserved = reserveCandidateAdmission(
    { repoRoot, objective: permit.objective },
    env,
    "2026-07-18T00:01:00.000Z",
  );
  assert.equal(reserved.permit.status, "reserved");
});

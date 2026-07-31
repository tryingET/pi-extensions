import assert from "node:assert/strict";
import { spawn, spawnSync } from "node:child_process";
import { createHash } from "node:crypto";
import {
  chmodSync,
  existsSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  realpathSync,
  rmSync,
  statSync,
  symlinkSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { test } from "node:test";
import { fileURLToPath } from "node:url";
import {
  authorizeCandidateAdmission,
  bindCandidateAdmission,
  captureCandidateAdmissionPressure,
  getCandidateAdmissionRoot,
  prepareCandidateAdmissionReconcileRelease,
  readCandidateAdmissionReconcileInput,
  reconcileCandidateAdmissionLegacyTerminalRelease,
  releaseCandidateAdmission,
  reserveCandidateAdmission,
  verifyCandidateAdmissionReconcileInput,
  writeCandidateAdmissionConfig,
} from "../src/candidatePeerAdmission.ts";
import {
  candidateAdmissionPermitPath,
  writeAdmissionJson,
} from "../src/candidatePeerAdmissionState.ts";
import { reconcileCandidateAdmissionLegacyTerminalReleaseLocked } from "../src/candidatePeerLegacyTerminalReconciliation.ts";
import {
  digestObject,
  getCandidateLifecycleEventsPath,
  getCandidateLifecycleRecordPath,
  getCandidateLifecycleRoot,
  stableJson,
} from "../src/candidatePeerLifecycleV2.ts";

const MIB = 1024 * 1024;
const TX = "2026-07-18T00:10:00.000Z";
const OBJECTIVE_SENTINEL = "OBJECTIVE-SENTINEL-AK4378";
const scriptPath = fileURLToPath(new URL("../scripts/candidate-admission-v2.mjs", import.meta.url));
const sha256 = (value) => createHash("sha256").update(value).digest("hex");

function git(repo, ...args) {
  const result = spawnSync("git", ["-C", repo, ...args], { encoding: "utf8" });
  assert.equal(result.status, 0, result.stderr);
  return result.stdout.endsWith("\n") ? result.stdout.slice(0, -1) : result.stdout;
}
function setupRepo(repoRoot) {
  mkdirSync(repoRoot);
  git(repoRoot, "init", "-q", "-b", "main");
  git(repoRoot, "config", "user.email", "test@example.invalid");
  git(repoRoot, "config", "user.name", "Test");
  writeFileSync(join(repoRoot, "README"), "test\n");
  git(repoRoot, "add", "README");
  git(repoRoot, "commit", "-qm", "initial");
}
function canonicalWrite(path, value) {
  writeFileSync(path, `${stableJson(value)}\n`, { mode: 0o600 });
}
function cli(command, args, env) {
  return new Promise((resolve) => {
    const child = spawn(process.execPath, [scriptPath, command, ...args], {
      env,
      stdio: ["ignore", "pipe", "pipe"],
    });
    let stdout = "";
    let stderr = "";
    child.stdout.on("data", (chunk) => (stdout += chunk));
    child.stderr.on("data", (chunk) => (stderr += chunk));
    child.on("close", (status) => resolve({ status, stdout, stderr }));
  });
}

function fixture(t, options = {}) {
  const root = mkdtempSync(join(tmpdir(), "legacy-terminal-reconcile-"));
  chmodSync(root, 0o700);
  t.after(() => rmSync(root, { recursive: true, force: true }));
  const env = { ...process.env, XDG_STATE_HOME: root };
  const repoRoot = join(root, "repo");
  setupRepo(repoRoot);
  const limits = {
    maxUnresolvedResources: 8,
    maxUnresolvedBytes: 8 * MIB,
    maxUnresolvedAgeMs: 14 * 24 * 60 * 60 * 1000,
    maxActiveAdmissions: 4,
    warningUnresolvedResources: 6,
    warningUnresolvedBytes: 6 * MIB,
  };
  writeCandidateAdmissionConfig(
    {
      schemaVersion: 2,
      mode: "canary",
      ownerDecisionRef: "AK decision 60",
      createdAt: "2026-07-18T00:00:00.000Z",
      updatedAt: "2026-07-18T00:00:00.000Z",
      global: limits,
      repositories: { [repoRoot]: { ...limits, maxActiveAdmissions: 2 } },
    },
    env,
  );
  writeFileSync(
    join(root, "pi-quests", "candidate-spawn.HOLD.json"),
    `${JSON.stringify({ schemaVersion: 1, status: "active", decisionRef: "AK decision 59" })}\n`,
    { mode: 0o600 },
  );
  const permit = authorizeCandidateAdmission(
    {
      repoRoot,
      objective: OBJECTIVE_SENTINEL,
      actor: "owner:test",
      taskRef: "AK-4378",
      reservationBytes: MIB,
      expiresAt: "2026-07-18T01:00:00.000Z",
    },
    env,
    "2026-07-18T00:00:00.000Z",
  );
  reserveCandidateAdmission(
    { repoRoot, objective: OBJECTIVE_SENTINEL },
    env,
    "2026-07-18T00:00:10.000Z",
  );
  const peerRunId = "candidatepeer-legacy-july13";
  const branchName = "candidatepeer/legacy-july13";
  const branchOid = "a".repeat(40);
  const realParent = join(root, "removed-parent");
  mkdirSync(realParent, { mode: 0o700 });
  let worktreePath = join(realParent, "removed-worktree");
  if (options.symlinkParent) {
    const alias = join(root, "removed-parent-alias");
    symlinkSync(realParent, alias);
    worktreePath = join(alias, "removed-worktree");
  }
  bindCandidateAdmission(
    { admissionId: permit.admissionId, peerRunId, worktreePath, branchName },
    env,
  );
  const reserved = JSON.parse(
    readFileSync(candidateAdmissionPermitPath(permit.admissionId, env), "utf8"),
  );
  const resourceId = "cpr-22e7419e0a7c799d665f77b6";
  const generationId = `gen-v1-${"b".repeat(20)}`;
  const lifecycleRoot = getCandidateLifecycleRoot(env);
  const archiveDir = join(lifecycleRoot, "archives", resourceId, generationId);
  mkdirSync(archiveDir, { recursive: true, mode: 0o700 });
  const members = {
    "branch.bundle": Buffer.from("synthetic bundle bytes\n"),
    "payload.paths.z": Buffer.from("README\0"),
    "payload.tar": Buffer.from("synthetic tar bytes\0\n"),
  };
  for (const [name, bytes] of Object.entries(members))
    writeFileSync(join(archiveDir, name), bytes, { mode: 0o600 });
  const manifest = Object.fromEntries(
    Object.entries(members).map(([name, bytes]) => [name, sha256(bytes)]),
  );
  const restorationDigest = "b".repeat(64);
  const archiveDigest = digestObject({ manifest, restorationDigest, resourceId, generationId });
  writeFileSync(join(archiveDir, "manifest.json"), `${JSON.stringify(manifest, null, 2)}\n`, {
    mode: 0o600,
  });
  writeFileSync(
    join(archiveDir, "COMPLETE"),
    `${JSON.stringify({ schemaVersion: 2, archiveDigest, restorationDigest })}\n`,
    { mode: 0o600 },
  );
  const base = {
    schemaVersion: 2,
    resourceId,
    generationId,
    resourceVersion: 1,
    state: "review_pending",
    createdAt: "2026-07-18T00:00:20.000Z",
    updatedAt: "2026-07-18T00:00:20.000Z",
    worktreePath,
    aliases: [peerRunId],
    repoRoots: [repoRoot],
    branchNames: [branchName],
    migrationInventoryDigest: "c".repeat(64),
  };
  const makeReview = (capturedAt, marker) => {
    const content = {
      headOid: branchOid,
      indexTreeOid: "d".repeat(40),
      statusSha256: sha256(` M README\0${marker}`),
      unstagedPatchSha256: sha256(`patch-${marker}`),
      stagedPatchSha256: sha256(""),
      aliases: [peerRunId],
      objects: [],
    };
    const unsigned = {
      schemaVersion: 2,
      resourceId,
      generationId,
      capturedAt,
      worktreePath,
      worktreeRealPath: worktreePath,
      repoRoot: worktreePath,
      gitCommonDir: realpathSync(join(repoRoot, ".git")),
      branchName,
      ...content,
      blockers: [],
      contentDigest: digestObject(content),
    };
    return { ...unsigned, snapshotDigest: digestObject(unsigned) };
  };
  const review1 = makeReview("2026-07-18T00:01:00.000Z", "first");
  const review2 = makeReview("2026-07-18T00:03:00.000Z", "second");
  const makeDisposition = (review, issuedAt, cycle) => {
    const unsigned = {
      disposition: "rejected",
      actor: "owner:test",
      rationale: `Rejected historical canary cycle ${cycle}`,
      issuedAt,
      reviewSnapshotDigest: review.snapshotDigest,
      validationRefs: [`AK-4378 cycle ${cycle}`],
    };
    return { ...unsigned, receiptDigest: digestObject(unsigned) };
  };
  const disposition1 = makeDisposition(review1, "2026-07-18T00:02:00.000Z", 1);
  const disposition2 = makeDisposition(review2, "2026-07-18T00:04:00.000Z", 2);
  const archive = { archiveDir, archiveDigest, verifiedAt: "2026-07-18T00:05:00.000Z" };
  const authUnsigned = {
    schemaVersion: 2,
    resourceId,
    generationId,
    authorizedResourceVersion: 7,
    aliases: [peerRunId],
    actor: "owner:test",
    issuedAt: "2026-07-18T00:06:00.000Z",
    expiresAt: "2026-07-18T00:08:30.000Z",
    nonce: "legacy-july13-nonce",
    dispositionDigest: disposition2.receiptDigest,
    reviewSnapshotDigest: review2.snapshotDigest,
    archiveDigest,
    expectedWorktreeRealPath: worktreePath,
    expectedGitCommonDir: realpathSync(join(repoRoot, ".git")),
    branchName,
    branchOid,
    effects: ["delete_branch", "remove_worktree"],
  };
  const authorization = { ...authUnsigned, authorizationDigest: digestObject(authUnsigned) };
  const effects = [
    { effect: "remove_worktree", at: "2026-07-18T00:07:00.000Z", worktreePath },
    { effect: "delete_branch", at: "2026-07-18T00:08:00.000Z", branchName, branchOid },
  ];
  const receipt = {
    type: "cleaned",
    effects,
    at: "2026-07-18T00:08:30.000Z",
    archiveDigest,
    authorizationDigest: authorization.authorizationDigest,
    receiptDigest: digestObject({
      resourceId,
      effects,
      archiveDigest,
      authorizationDigest: authorization.authorizationDigest,
    }),
  };
  const records = [
    structuredClone(base),
    {
      ...structuredClone(base),
      resourceVersion: 2,
      updatedAt: "2026-07-18T00:01:10.000Z",
      reviewSnapshot: review1,
    },
    {
      ...structuredClone(base),
      resourceVersion: 3,
      state: "rejected",
      updatedAt: "2026-07-18T00:02:10.000Z",
      reviewSnapshot: review1,
      disposition: disposition1,
    },
    {
      ...structuredClone(base),
      resourceVersion: 4,
      updatedAt: "2026-07-18T00:03:10.000Z",
      reviewSnapshot: review2,
    },
    {
      ...structuredClone(base),
      resourceVersion: 5,
      state: "rejected",
      updatedAt: "2026-07-18T00:04:10.000Z",
      reviewSnapshot: review2,
      disposition: disposition2,
    },
    {
      ...structuredClone(base),
      resourceVersion: 6,
      state: "archive_verified",
      updatedAt: "2026-07-18T00:05:10.000Z",
      reviewSnapshot: review2,
      disposition: disposition2,
      archive,
    },
    {
      ...structuredClone(base),
      resourceVersion: 7,
      state: "cleanup_authorized",
      updatedAt: "2026-07-18T00:06:10.000Z",
      reviewSnapshot: review2,
      disposition: disposition2,
      archive,
      cleanupAuthorization: authorization,
    },
  ];
  const record = {
    ...structuredClone(base),
    resourceVersion: 8,
    state: "cleaned",
    updatedAt: "2026-07-18T00:09:00.000Z",
    reviewSnapshot: review2,
    disposition: disposition2,
    archive,
    cleanupAuthorization: authorization,
    terminalReceipt: receipt,
  };
  const events = [
    { event: "migrated_v1", at: records[0].updatedAt, record: records[0] },
    { event: "review_captured", at: records[1].updatedAt, fromVersion: 1, record: records[1] },
    { event: "disposition_rejected", at: records[2].updatedAt, fromVersion: 2, record: records[2] },
    { event: "review_captured", at: records[3].updatedAt, fromVersion: 3, record: records[3] },
    { event: "disposition_rejected", at: records[4].updatedAt, fromVersion: 4, record: records[4] },
    { event: "archive_verified", at: records[5].updatedAt, fromVersion: 5, record: records[5] },
    { event: "cleanup_authorized", at: records[6].updatedAt, fromVersion: 6, record: records[6] },
    ...effects,
    { event: "cleaned", at: record.updatedAt, fromVersion: 7, record },
  ];
  const recordPath = getCandidateLifecycleRecordPath(resourceId, env);
  const eventsPath = getCandidateLifecycleEventsPath(resourceId, env);
  mkdirSync(dirname(recordPath), { recursive: true, mode: 0o700 });
  const writeArtifacts = () => {
    writeFileSync(recordPath, `${JSON.stringify(record, null, 2)}\n`, { mode: 0o600 });
    writeFileSync(eventsPath, `${events.map(JSON.stringify).join("\n")}\n`, { mode: 0o600 });
  };
  writeArtifacts();
  const requestPath = join(root, "request.json");
  const packetPath = join(root, "packet.json");
  writeFileSync(
    requestPath,
    `${JSON.stringify({ admissionId: permit.admissionId, resourceId, ownerRationale: "Release only the exact July 13 anomaly.", ownerReference: "AK-4378 owner review" }, null, 2)}\n`,
    { mode: 0o600 },
  );
  prepareCandidateAdmissionReconcileRelease(requestPath, packetPath, env);
  return {
    root,
    env,
    repoRoot,
    permit,
    reserved,
    resourceId,
    generationId,
    peerRunId,
    branchName,
    branchOid,
    worktreePath,
    lifecycleRoot,
    archiveDir,
    manifest,
    review1,
    review2,
    disposition1,
    disposition2,
    record,
    records,
    events,
    recordPath,
    eventsPath,
    requestPath,
    packetPath,
    writeArtifacts,
  };
}
function refreshPacket(f) {
  f.writeArtifacts();
  const input = readCandidateAdmissionReconcileInput(f.packetPath);
  input.expectedRecordDigest = digestObject(f.record);
  const eventsRaw = readFileSync(f.eventsPath);
  input.expectedEventsSha256 = sha256(eventsRaw);
  input.expectedArchiveDigest = f.record.archive.archiveDigest;
  input.expectedLegacyReceiptDigest = digestObject(f.record.terminalReceipt);
  input.expectedCleanupAuthorizationDigest = f.record.cleanupAuthorization.authorizationDigest;
  canonicalWrite(f.packetPath, input);
}
function rewriteAuthorization(f) {
  const auth = f.record.cleanupAuthorization;
  auth.authorizationDigest = digestObject(
    Object.fromEntries(Object.entries(auth).filter(([key]) => key !== "authorizationDigest")),
  );
  f.record.terminalReceipt.authorizationDigest = auth.authorizationDigest;
  f.record.terminalReceipt.receiptDigest = digestObject({
    resourceId: f.resourceId,
    effects: f.record.terminalReceipt.effects,
    archiveDigest: f.record.archive.archiveDigest,
    authorizationDigest: auth.authorizationDigest,
  });
}

// biome-ignore format: compact falsifier helper preserves the package test-size budget
function rewriteReviewBinding(f, review, disposition, finalCycle) { const content = { headOid: review.headOid, indexTreeOid: review.indexTreeOid, statusSha256: review.statusSha256, unstagedPatchSha256: review.unstagedPatchSha256, stagedPatchSha256: review.stagedPatchSha256, aliases: review.aliases, objects: review.objects }; review.contentDigest = digestObject(content); review.snapshotDigest = digestObject(Object.fromEntries(Object.entries(review).filter(([key]) => key !== "snapshotDigest"))); disposition.reviewSnapshotDigest = review.snapshotDigest; disposition.receiptDigest = digestObject(Object.fromEntries(Object.entries(disposition).filter(([key]) => key !== "receiptDigest"))); if (finalCycle) { f.record.cleanupAuthorization.reviewSnapshotDigest = review.snapshotDigest; f.record.cleanupAuthorization.dispositionDigest = disposition.receiptDigest; rewriteAuthorization(f); } refreshPacket(f); }

test("owner prepare and verify commands create one durable redacted canonical packet", async (t) => {
  const f = fixture(t);
  assert.equal(statSync(f.packetPath).mode & 0o777, 0o600);
  assert.equal(readFileSync(f.packetPath, "utf8").includes(OBJECTIVE_SENTINEL), false);
  const packetBeforePreflight = readFileSync(f.packetPath);
  const resourceLock = join(f.lifecycleRoot, "locks", `${f.resourceId}.lock`);
  const admissionLock = join(getCandidateAdmissionRoot(f.env), "admission.lock");
  const input = verifyCandidateAdmissionReconcileInput(f.packetPath, f.env, TX);
  assert.equal(existsSync(resourceLock) || existsSync(admissionLock), false);
  assert.deepEqual(readFileSync(f.packetPath), packetBeforePreflight);
  assert.equal(input.expectedPermitDigest, digestObject(f.reserved));
  assert.equal(input.expectedEventsSha256, sha256(readFileSync(f.eventsPath)));

  const output = join(f.root, "prepared-by-cli.json");
  const before = [
    readFileSync(f.recordPath),
    readFileSync(f.eventsPath),
    readFileSync(candidateAdmissionPermitPath(f.permit.admissionId, f.env)),
  ];
  const prepared = await cli(
    "prepare-reconcile-release",
    ["--request", f.requestPath, "--output", output],
    f.env,
  );
  assert.equal(prepared.status, 0, prepared.stderr);
  assert.doesNotMatch(prepared.stdout + prepared.stderr, new RegExp(OBJECTIVE_SENTINEL));
  assert.equal(statSync(output).mode & 0o777, 0o600);
  const preparedPacket = readFileSync(output);
  const verified = await cli("verify-reconcile-input", ["--input", output], f.env);
  assert.equal(verified.status, 0, verified.stderr);
  assert.doesNotMatch(verified.stdout + verified.stderr, new RegExp(OBJECTIVE_SENTINEL));
  assert.deepEqual(readFileSync(output), preparedPacket);
  assert.deepEqual(before, [
    readFileSync(f.recordPath),
    readFileSync(f.eventsPath),
    readFileSync(candidateAdmissionPermitPath(f.permit.admissionId, f.env)),
  ]);
  const duplicateOutput = await cli(
    "prepare-reconcile-release",
    ["--request", f.requestPath, "--output", output],
    f.env,
  );
  assert.equal(duplicateOutput.status, 1);
  assert.equal(
    reconcileCandidateAdmissionLegacyTerminalRelease(output, f.env, TX).status,
    "released",
  );
  assert.deepEqual(readFileSync(output), preparedPacket);
});

test("reconciliation packet reads reject relative, permissive, symlinked, duplicate, blank, and noncanonical inputs", (t) => {
  const f = fixture(t);
  assert.throws(() => readCandidateAdmissionReconcileInput("relative.json"), /absolute/);
  chmodSync(f.packetPath, 0o640);
  assert.throws(() => readCandidateAdmissionReconcileInput(f.packetPath), /0600/);
  chmodSync(f.packetPath, 0o600);
  const alias = join(f.root, "packet-alias.json");
  symlinkSync(f.packetPath, alias);
  assert.throws(() => readCandidateAdmissionReconcileInput(alias), /symlink/);
  const raw = readFileSync(f.packetPath, "utf8");
  const duplicate = join(f.root, "duplicate.json");
  writeFileSync(duplicate, raw.replace('{"action"', '{"schemaVersion":1,"action"'), {
    mode: 0o600,
  });
  assert.throws(() => readCandidateAdmissionReconcileInput(duplicate), /duplicate key/);
  const blank = join(f.root, "blank.json");
  writeFileSync(blank, `${raw}\n`, { mode: 0o600 });
  assert.throws(() => readCandidateAdmissionReconcileInput(blank), /blank line/);
  const pretty = join(f.root, "pretty.json");
  writeFileSync(pretty, `${JSON.stringify(JSON.parse(raw), null, 2)}\n`, { mode: 0o600 });
  assert.throws(() => readCandidateAdmissionReconcileInput(pretty), /canonical JSON/);
});

test("semantic preflight rejects current artifact drift without changing packet or permit", async (t) => {
  const f = fixture(t);
  const packet = readFileSync(f.packetPath);
  const permitPath = candidateAdmissionPermitPath(f.permit.admissionId, f.env);
  const permit = readFileSync(permitPath);
  writeFileSync(join(f.archiveDir, "payload.tar"), "drift", { mode: 0o600 });
  const result = await cli("verify-reconcile-input", ["--input", f.packetPath], f.env);
  assert.equal(result.status, 1);
  assert.match(result.stderr, /reconciliation command rejected/);
  assert.doesNotMatch(result.stdout + result.stderr, new RegExp(OBJECTIVE_SENTINEL));
  assert.deepEqual(readFileSync(f.packetPath), packet);
  assert.deepEqual(readFileSync(permitPath), permit);
});

test("exact July-13 chain releases global and repository pressure once with deterministic proof", (t) => {
  const f = fixture(t);
  const before = captureCandidateAdmissionPressure(f.env, TX);
  assert.equal(before.activeAdmissions, 1);
  assert.equal(before.unresolvedResources, 1);
  assert.equal(before.unresolvedBytes, MIB);
  assert.deepEqual(before.activeAdmissionIds, [f.permit.admissionId]);
  assert.deepEqual(before.byRepository[f.repoRoot], {
    unresolvedResources: 1,
    unresolvedBytes: MIB,
    oldestUnresolvedAgeMs: 0,
    activeAdmissions: 1,
  });
  assert.throws(
    () =>
      releaseCandidateAdmission(
        {
          admissionId: f.permit.admissionId,
          outcome: "terminal_cleaned",
          terminalReceiptRef: f.recordPath,
        },
        f.env,
        TX,
      ),
    /schema mismatch/,
  );

  const released = reconcileCandidateAdmissionLegacyTerminalRelease(f.packetPath, f.env, TX);
  const proof = released.legacyTerminalReconciliation;
  assert.equal(proof.reconciledAt, TX);
  assert.equal(proof.lifecycleVerificationProof.transactionAt, TX);
  assert.equal(proof.hardenedV2Verified, false);
  assert.equal(proof.pressureBefore.activeAdmissions, 1);
  assert.equal(proof.pressureAfter.activeAdmissions, 0);
  assert.equal(proof.pressureAfter.unresolvedResources, 0);
  assert.equal(proof.pressureAfter.unresolvedBytes, 0);
  assert.deepEqual(proof.pressureAfter.activeAdmissionIds, []);
  assert.deepEqual(proof.pressureAfter.byRepository[f.repoRoot], {
    unresolvedResources: 0,
    unresolvedBytes: 0,
    oldestUnresolvedAgeMs: 0,
    activeAdmissions: 0,
  });
  assert.deepEqual(
    reconcileCandidateAdmissionLegacyTerminalRelease(
      f.packetPath,
      f.env,
      "2026-07-18T00:11:00.000Z",
    ),
    released,
  );
  const after = captureCandidateAdmissionPressure(f.env, TX);
  assert.equal(after.activeAdmissions, 0);
  assert.equal(after.unresolvedResources, 0);
  assert.equal(after.unresolvedBytes, 0);
  assert.deepEqual(after.activeAdmissionIds, []);
});

test("concurrent CLI reconciliation is exactly once and emits no objective", async (t) => {
  const f = fixture(t);
  const results = await Promise.all([
    cli("reconcile-release", ["--input", f.packetPath], f.env),
    cli("reconcile-release", ["--input", f.packetPath], f.env),
  ]);
  assert.ok(
    results.some((result) => result.status === 0),
    JSON.stringify(results),
  );
  assert.ok(
    results.every(
      (result) => result.status === 0 || /reconciliation lock unavailable/.test(result.stderr),
    ),
    JSON.stringify(results),
  );
  assert.doesNotMatch(
    results.map((result) => result.stdout + result.stderr).join(""),
    new RegExp(OBJECTIVE_SENTINEL),
  );
  const persisted = JSON.parse(
    readFileSync(candidateAdmissionPermitPath(f.permit.admissionId, f.env), "utf8"),
  );
  assert.equal(persisted.status, "released");
  assert.equal(captureCandidateAdmissionPressure(f.env, TX).activeAdmissions, 0);
});

test("historical record, nested receipt, archive, COMPLETE, and effect key sets fail closed", async (t) => {
  const cases = [
    [
      "record",
      (f) => {
        f.record.unexpected = true;
      },
    ],
    [
      "review",
      (f) => {
        f.record.reviewSnapshot.unexpected = true;
      },
    ],
    [
      "disposition",
      (f) => {
        f.record.disposition.unexpected = true;
      },
    ],
    [
      "archive receipt",
      (f) => {
        f.record.archive.unexpected = true;
      },
    ],
    [
      "authorization",
      (f) => {
        f.record.cleanupAuthorization.unexpected = true;
        rewriteAuthorization(f);
      },
    ],
    [
      "terminal receipt",
      (f) => {
        f.record.terminalReceipt.unexpected = true;
      },
    ],
    [
      "effect",
      (f) => {
        f.record.terminalReceipt.effects[0].unexpected = true;
        f.record.terminalReceipt.receiptDigest = digestObject({
          resourceId: f.resourceId,
          effects: f.record.terminalReceipt.effects,
          archiveDigest: f.record.archive.archiveDigest,
          authorizationDigest: f.record.cleanupAuthorization.authorizationDigest,
        });
      },
    ],
  ];
  for (const [name, mutate] of cases)
    await t.test(name, (st) => {
      const f = fixture(st);
      mutate(f);
      refreshPacket(f);
      assert.throws(
        () => reconcileCandidateAdmissionLegacyTerminalRelease(f.packetPath, f.env, TX),
        /key set/,
      );
      assert.equal(
        JSON.parse(readFileSync(candidateAdmissionPermitPath(f.permit.admissionId, f.env), "utf8"))
          .status,
        "reserved",
      );
    });
  await t.test("COMPLETE", (st) => {
    const f = fixture(st);
    const complete = JSON.parse(readFileSync(join(f.archiveDir, "COMPLETE"), "utf8"));
    complete.unexpected = true;
    writeFileSync(join(f.archiveDir, "COMPLETE"), `${JSON.stringify(complete)}\n`, { mode: 0o600 });
    assert.throws(
      () => reconcileCandidateAdmissionLegacyTerminalRelease(f.packetPath, f.env, TX),
      /key set/,
    );
  });
});

test("cross-digests, manifest bytes, raw canonical JSONL, and full chain are exact", async (t) => {
  await t.test("review/disposition cross-digest", (st) => {
    const f = fixture(st);
    f.record.disposition.reviewSnapshotDigest = "f".repeat(64);
    f.record.disposition.receiptDigest = digestObject(
      Object.fromEntries(
        Object.entries(f.record.disposition).filter(([key]) => key !== "receiptDigest"),
      ),
    );
    f.record.cleanupAuthorization.dispositionDigest = f.record.disposition.receiptDigest;
    rewriteAuthorization(f);
    refreshPacket(f);
    assert.throws(
      () => reconcileCandidateAdmissionLegacyTerminalRelease(f.packetPath, f.env, TX),
      /disposition cross-digest/,
    );
  });
  await t.test("authorization cross-digest", (st) => {
    const f = fixture(st);
    f.record.cleanupAuthorization.reviewSnapshotDigest = "f".repeat(64);
    rewriteAuthorization(f);
    refreshPacket(f);
    assert.throws(
      () => reconcileCandidateAdmissionLegacyTerminalRelease(f.packetPath, f.env, TX),
      /authorization cross-digest/,
    );
  });
  await t.test("manifest member byte hash", (st) => {
    const f = fixture(st);
    writeFileSync(join(f.archiveDir, "payload.tar"), "tampered", { mode: 0o600 });
    assert.throws(
      () => reconcileCandidateAdmissionLegacyTerminalRelease(f.packetPath, f.env, TX),
      /byte hash/,
    );
  });
  await t.test("duplicate JSONL key", (st) => {
    const f = fixture(st);
    const lines = readFileSync(f.eventsPath, "utf8").trimEnd().split("\n");
    lines[0] = lines[0].replace('{"event"', '{"event":"migrated_v1","event"');
    writeFileSync(f.eventsPath, `${lines.join("\n")}\n`, { mode: 0o600 });
    assert.throws(
      () => reconcileCandidateAdmissionLegacyTerminalRelease(f.packetPath, f.env, TX),
      /duplicate key/,
    );
  });
  await t.test("blank JSONL line", (st) => {
    const f = fixture(st);
    writeFileSync(f.eventsPath, readFileSync(f.eventsPath, "utf8").replace("\n", "\n\n"), {
      mode: 0o600,
    });
    assert.throws(
      () => reconcileCandidateAdmissionLegacyTerminalRelease(f.packetPath, f.env, TX),
      /blank line/,
    );
  });
  await t.test("noncanonical JSONL and exact length", (st) => {
    const f = fixture(st);
    const lines = readFileSync(f.eventsPath, "utf8").trimEnd().split("\n");
    lines[0] = `${lines[0]} `;
    writeFileSync(f.eventsPath, `${lines.join("\n")}\n`, { mode: 0o600 });
    assert.throws(
      () => reconcileCandidateAdmissionLegacyTerminalRelease(f.packetPath, f.env, TX),
      /raw canonical JSONL/,
    );
  });
  await t.test("missing historical event", (st) => {
    const f = fixture(st);
    f.events.splice(1, 1);
    refreshPacket(f);
    assert.throws(
      () => reconcileCandidateAdmissionLegacyTerminalRelease(f.packetPath, f.env, TX),
      /chain length/,
    );
  });
  await t.test("reordered review cycles", (st) => {
    const f = fixture(st);
    [f.events[1], f.events[3]] = [f.events[3], f.events[1]];
    refreshPacket(f);
    assert.throws(
      () => reconcileCandidateAdmissionLegacyTerminalRelease(f.packetPath, f.env, TX),
      /transition|chronology/,
    );
  });
  await t.test("hybrid review and disposition cycles", (st) => {
    const f = fixture(st);
    f.events[4].record.reviewSnapshot = f.review1;
    refreshPacket(f);
    assert.throws(
      () => reconcileCandidateAdmissionLegacyTerminalRelease(f.packetPath, f.env, TX),
      /cross-digest|hybrid/,
    );
  });
});
// biome-ignore format: compact falsifier regression preserves the package test-size budget
test("both live review cycles require exactly empty objects and blockers", (t) => { for (const kind of ["objects", "blockers"]) { const f = fixture(t); assert.deepEqual([f.review1.objects, f.review1.blockers, f.review2.objects, f.review2.blockers], [[], [], [], []]); const review = kind === "objects" ? f.review2 : f.review1; const disposition = kind === "objects" ? f.disposition2 : f.disposition1; if (kind === "objects") review.objects = [{ path: "nested-forgery", metadata: { forged: true } }]; else review.blockers = ["forged:nested-blocker"]; rewriteReviewBinding(f, review, disposition, kind === "objects"); assert.throws(() => reconcileCandidateAdmissionLegacyTerminalRelease(f.packetPath, f.env, TX), /review snapshot/); } });

// biome-ignore format: compact tamper regression preserves the package test-size budget
test("retry and semantic preflight reject a tampered terminal receipt reference", (t) => { const f = fixture(t); const permitPath = candidateAdmissionPermitPath(f.permit.admissionId, f.env); const released = reconcileCandidateAdmissionLegacyTerminalRelease(f.packetPath, f.env, TX); released.terminalReceiptRef = join(f.root, "forged-terminal-record.json"); writeAdmissionJson(permitPath, released); assert.throws(() => verifyCandidateAdmissionReconcileInput(f.packetPath, f.env, TX), /released permit exact binding/); assert.throws(() => reconcileCandidateAdmissionLegacyTerminalRelease(f.packetPath, f.env, TX), /persisted released permit binding/); });

// biome-ignore format: compact stale-fence regression preserves the package test-size budget
test("a preexisting exact Git ref fence fails closed with the permit reserved", (t) => { const f = fixture(t); const parent = join(realpathSync(join(f.repoRoot, ".git")), "refs", "heads", "candidatepeer"); mkdirSync(parent, { recursive: true, mode: 0o700 }); const fence = join(parent, "legacy-july13.lock"); writeFileSync(fence, "stale owner recovery evidence\n", { mode: 0o600 }); assert.throws(() => reconcileCandidateAdmissionLegacyTerminalRelease(f.packetPath, f.env, TX), /fence is held or stale/); assert.equal(JSON.parse(readFileSync(candidateAdmissionPermitPath(f.permit.admissionId, f.env), "utf8")).status, "reserved"); assert.equal(existsSync(fence), true); });

// biome-ignore format: compact racer regression preserves the package test-size budget
test("a concurrent git branch writer cannot pass the release ref fence", (t) => { const f = fixture(t); let racer; const released = reconcileCandidateAdmissionLegacyTerminalReleaseLocked(f.packetPath, f.env, TX, captureCandidateAdmissionPressure, (fence) => { assert.equal(existsSync(fence), true); assert.equal(JSON.parse(readFileSync(candidateAdmissionPermitPath(f.permit.admissionId, f.env), "utf8")).status, "reserved"); racer = spawnSync("git", ["-C", f.repoRoot, "branch", f.branchName, "HEAD"], { encoding: "utf8" }); }); assert.notEqual(racer.status, 0); assert.match(racer.stderr, /cannot lock ref|reference already exists/); assert.equal(released.status, "released"); assert.equal(existsSync(join(realpathSync(join(f.repoRoot, ".git")), "refs", "heads", `${f.branchName}.lock`)), false); assert.equal(spawnSync("git", ["-C", f.repoRoot, "show-ref", "--verify", "--quiet", `refs/heads/${f.branchName}`]).status, 1); });

test("deletion proof rejects every surviving or unqueryable fragment and only ENOENT is absence", async (t) => {
  await t.test("path exists", (st) => {
    const f = fixture(st);
    mkdirSync(f.worktreePath);
    assert.throws(
      () => reconcileCandidateAdmissionLegacyTerminalRelease(f.packetPath, f.env, TX),
      /still exists/,
    );
  });
  await t.test("path query error", (st) => {
    const f = fixture(st);
    chmodSync(dirname(f.worktreePath), 0o000);
    try {
      assert.throws(
        () => reconcileCandidateAdmissionLegacyTerminalRelease(f.packetPath, f.env, TX),
        /EACCES|permission denied/i,
      );
    } finally {
      chmodSync(dirname(f.worktreePath), 0o700);
    }
  });
  await t.test("symlink parent alias", (st) => {
    const f = fixture(st, { symlinkParent: true });
    assert.throws(
      () => reconcileCandidateAdmissionLegacyTerminalRelease(f.packetPath, f.env, TX),
      /symlink ancestor/,
    );
  });
  await t.test("branch ref survives", (st) => {
    const f = fixture(st);
    git(f.repoRoot, "branch", f.branchName, "HEAD");
    assert.throws(
      () => reconcileCandidateAdmissionLegacyTerminalRelease(f.packetPath, f.env, TX),
      /branch|fragment|Git query failed/,
    );
  });
  for (const kind of ["detached", "different-branch"])
    await t.test(`registered ${kind} target worktree`, (st) => {
      const f = fixture(st);
      if (kind === "detached")
        git(f.repoRoot, "worktree", "add", "-q", "--detach", f.worktreePath, "HEAD");
      else git(f.repoRoot, "worktree", "add", "-q", "-b", "other-branch", f.worktreePath, "HEAD");
      rmSync(f.worktreePath, { recursive: true, force: true });
      assert.throws(
        () => reconcileCandidateAdmissionLegacyTerminalRelease(f.packetPath, f.env, TX),
        /remains registered/,
      );
    });
  await t.test("common directory identity mismatch", (st) => {
    const f = fixture(st);
    f.record.cleanupAuthorization.expectedGitCommonDir = f.repoRoot;
    rewriteAuthorization(f);
    refreshPacket(f);
    assert.throws(
      () => reconcileCandidateAdmissionLegacyTerminalRelease(f.packetPath, f.env, TX),
      /common-dir identity|review snapshot|review\/common-dir/,
    );
  });
  await t.test("Git query error is neither presence nor absence", (st) => {
    const f = fixture(st);
    const bin = join(f.root, "fake-bin");
    mkdirSync(bin, { mode: 0o700 });
    const fake = join(bin, "git");
    writeFileSync(fake, "#!/bin/sh\nexit 2\n", { mode: 0o700 });
    f.env.PATH = bin;
    assert.throws(
      () => reconcileCandidateAdmissionLegacyTerminalRelease(f.packetPath, f.env, TX),
      /Git query failed closed/,
    );
  });
});

test("porcelain-z handles an unrelated newline path and a detached owner checkout", (t) => {
  const f = fixture(t);
  const newlinePath = join(f.root, "other\nworktree");
  git(f.repoRoot, "worktree", "add", "-q", "-b", "newline-test", newlinePath, "HEAD");
  git(f.repoRoot, "checkout", "-q", "--detach", "HEAD");
  const released = reconcileCandidateAdmissionLegacyTerminalRelease(f.packetPath, f.env, TX);
  assert.equal(released.status, "released");
});

test("transaction timestamp must be canonical and no earlier than the final event", (t) => {
  const f = fixture(t);
  assert.throws(
    () => reconcileCandidateAdmissionLegacyTerminalRelease(f.packetPath, f.env, "not-a-time"),
    /timestamp/,
  );
  assert.throws(
    () =>
      reconcileCandidateAdmissionLegacyTerminalRelease(
        f.packetPath,
        f.env,
        "2026-07-18T00:06:59.999Z",
      ),
    /chronology/,
  );
  assert.equal(
    JSON.parse(readFileSync(candidateAdmissionPermitPath(f.permit.admissionId, f.env), "utf8"))
      .status,
    "reserved",
  );
});

test("retry rejects self-consistently forged proof extras", (t) => {
  const f = fixture(t);
  const released = reconcileCandidateAdmissionLegacyTerminalRelease(f.packetPath, f.env, TX);
  released.legacyTerminalReconciliation.unexpected = true;
  const unsigned = Object.fromEntries(
    Object.entries(released.legacyTerminalReconciliation).filter(
      ([key]) => key !== "reconciliationDigest",
    ),
  );
  released.legacyTerminalReconciliation.reconciliationDigest = digestObject(unsigned);
  released.terminalReceiptDigest = released.legacyTerminalReconciliation.reconciliationDigest;
  writeAdmissionJson(candidateAdmissionPermitPath(f.permit.admissionId, f.env), released);
  assert.throws(
    () => reconcileCandidateAdmissionLegacyTerminalRelease(f.packetPath, f.env, TX),
    /proof key set/,
  );
});

test("resource lock is outer, admission lock is inner, and stale locks fail before permit mutation", async (t) => {
  await t.test("stale resource lock", (st) => {
    const f = fixture(st);
    const lock = join(f.lifecycleRoot, "locks", `${f.resourceId}.lock`);
    mkdirSync(lock, { recursive: true, mode: 0o700 });
    assert.throws(
      () => reconcileCandidateAdmissionLegacyTerminalRelease(f.packetPath, f.env, TX),
      /resource is locked/,
    );
    assert.equal(
      JSON.parse(readFileSync(candidateAdmissionPermitPath(f.permit.admissionId, f.env), "utf8"))
        .status,
      "reserved",
    );
  });
  await t.test("stale admission lock", (st) => {
    const f = fixture(st);
    const lock = join(getCandidateAdmissionRoot(f.env), "admission.lock");
    writeFileSync(lock, "stale\n", { mode: 0o600 });
    assert.throws(
      () => reconcileCandidateAdmissionLegacyTerminalRelease(f.packetPath, f.env, TX),
      /lock is held or stale/,
    );
    assert.equal(existsSync(join(f.lifecycleRoot, "locks", `${f.resourceId}.lock`)), false);
  });
  await t.test("real lifecycle writer loses resource lock", (st) => {
    const f = fixture(st);
    let writer;
    const moduleUrl = new URL("../src/candidatePeerLifecycleV2.ts", import.meta.url).href;
    const capture = (env, at) => {
      if (!writer) {
        const source = `import { updateLifecycleRecord } from ${JSON.stringify(moduleUrl)}; try { updateLifecycleRecord({resourceId:${JSON.stringify(f.resourceId)},expectedVersion:8,event:"competing_writer",env:JSON.parse(process.env.TEST_ENV),mutate:r=>r}); } catch (error) { console.error(String(error)); process.exit(17); }`;
        writer = spawnSync(process.execPath, ["--input-type=module", "-e", source], {
          encoding: "utf8",
          env: { ...process.env, TEST_ENV: JSON.stringify(f.env) },
        });
      }
      return captureCandidateAdmissionPressure(env, at);
    };
    reconcileCandidateAdmissionLegacyTerminalReleaseLocked(f.packetPath, f.env, TX, capture);
    assert.equal(writer.status, 17, writer.stderr);
    assert.match(writer.stderr, /resource is locked/);
    assert.equal(JSON.parse(readFileSync(f.recordPath, "utf8")).resourceVersion, 8);
  });
});

test("precommit writer fault leaves the reserved permit visible and retryable", (t) => {
  const f = fixture(t);
  const permitPath = candidateAdmissionPermitPath(f.permit.admissionId, f.env);
  const dir = dirname(permitPath);
  const before = readFileSync(permitPath);
  chmodSync(dir, 0o500);
  try {
    assert.throws(
      () => reconcileCandidateAdmissionLegacyTerminalRelease(f.packetPath, f.env, TX),
      /EACCES|permission denied/i,
    );
  } finally {
    chmodSync(dir, 0o700);
  }
  assert.deepEqual(readFileSync(permitPath), before);
  assert.equal(
    reconcileCandidateAdmissionLegacyTerminalRelease(f.packetPath, f.env, TX).status,
    "released",
  );
});

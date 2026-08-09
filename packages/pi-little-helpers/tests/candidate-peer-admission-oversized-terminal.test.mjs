import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { chmodSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { test } from "node:test";
import {
  authorizeCandidateAdmission,
  bindCandidateAdmission,
  captureCandidateAdmissionPressure,
  getCandidateSpawnHoldPath,
  releaseCandidateAdmission,
  reserveCandidateAdmission,
  writeCandidateAdmissionConfig,
} from "../src/candidatePeerAdmission.ts";
import { candidateAdmissionPermitPath } from "../src/candidatePeerAdmissionState.ts";
import {
  digestObject,
  getCandidateLifecycleEventsPath,
  getCandidateLifecycleRecordPath,
  getCandidateLifecycleRoot,
} from "../src/candidatePeerLifecycleV2.ts";

const MIB = 1024 * 1024;
const OVERSIZED_REVIEW_OBJECTS = 60_000;
let fixtureSequence = 0;

function setup() {
  const root = mkdtempSync(join(tmpdir(), "candidate-admission-oversized-terminal-"));
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
  writeCandidateAdmissionConfig(
    {
      schemaVersion: 2,
      mode: "active",
      ownerDecisionRef: "AK decision 60",
      createdAt: now,
      updatedAt: now,
      global: limits,
      repositories: { [repoRoot]: { ...limits, maxActiveAdmissions: 2 } },
    },
    env,
  );
  const holdPath = getCandidateSpawnHoldPath(env);
  mkdirSync(dirname(holdPath), { recursive: true, mode: 0o700 });
  writeFileSync(
    holdPath,
    `${JSON.stringify({
      schemaVersion: 1,
      status: "superseded_by_admission_v2",
      supersededByDecisionRef: "AK decision 60",
    })}\n`,
    { mode: 0o600 },
  );
  const permit = authorizeCandidateAdmission(
    {
      repoRoot,
      objective: "Verify one oversized terminal event",
      actor: "operator:test",
      taskRef: "AK-4628",
      reservationBytes: MIB,
      expiresAt: "2026-07-18T01:00:00.000Z",
    },
    env,
    now,
  );
  reserveCandidateAdmission(
    { repoRoot, objective: permit.objective },
    env,
    "2026-07-18T00:01:00.000Z",
  );
  fixtureSequence += 1;
  const peerRunId = `candidatepeer-oversized-${fixtureSequence}`;
  const worktreePath = join(repoRoot, `missing-worktree-${fixtureSequence}`);
  bindCandidateAdmission(
    {
      admissionId: permit.admissionId,
      peerRunId,
      worktreePath,
      branchName: `candidatepeer/oversized-${fixtureSequence}`,
    },
    env,
  );
  return { root, env, repoRoot, permit, peerRunId, worktreePath };
}

function syntheticReviewSnapshot({ resourceId, generationId, repoRoot, worktreePath, peerRunId }) {
  const objects = Array.from({ length: OVERSIZED_REVIEW_OBJECTS }, (_, index) => ({
    path: `node_modules/oversized-fixture/${String(index).padStart(6, "0")}/${"nested-segment/".repeat(8)}artifact.js`,
    source: "ignored",
    type: "file",
    mode: 0o644,
    size: index + 1,
    sha256: "f".repeat(64),
  }));
  const aliases = [peerRunId];
  const content = {
    headOid: "a".repeat(40),
    indexTreeOid: "b".repeat(40),
    statusSha256: "c".repeat(64),
    unstagedPatchSha256: "d".repeat(64),
    stagedPatchSha256: "e".repeat(64),
    aliases,
    objects,
  };
  const unsigned = {
    schemaVersion: 2,
    resourceId,
    generationId,
    capturedAt: "2026-07-18T00:00:30.000Z",
    worktreePath,
    worktreeRealPath: worktreePath,
    repoRoot,
    gitCommonDir: join(repoRoot, ".git"),
    branchName: "candidatepeer/test",
    ...content,
    blockers: [],
    contentDigest: digestObject(content),
  };
  return { ...unsigned, snapshotDigest: digestObject(unsigned) };
}

function writeOversizedTerminalRecord({ env, repoRoot, peerRunId, worktreePath }) {
  const resourceId = `cpr-${fixtureSequence.toString(16).padStart(24, "0")}`;
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

  const reviewSnapshot = syntheticReviewSnapshot({
    resourceId,
    generationId,
    repoRoot,
    worktreePath,
    peerRunId,
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
    reviewSnapshotDigest: reviewSnapshot.snapshotDigest,
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
    reviewSnapshot,
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
  const finalEventJson = JSON.stringify(finalEvent);
  writeFileSync(path, `${JSON.stringify(record, null, 2)}\n`, { mode: 0o600 });
  writeFileSync(
    eventsPath,
    `${effects.map((effect) => JSON.stringify(effect)).join("\n")}\n${finalEventJson}\n`,
    { mode: 0o600 },
  );
  return {
    path,
    eventsPath,
    record,
    effects,
    finalEventJson,
    finalEventBytes: Buffer.byteLength(finalEventJson),
    digest: digestObject(record),
  };
}

function fixture() {
  const context = setup();
  return {
    ...context,
    terminal: writeOversizedTerminalRecord(context),
  };
}

function rewriteTerminalEvents(terminal, terminalLines) {
  writeFileSync(
    terminal.eventsPath,
    `${terminal.effects.map((effect) => JSON.stringify(effect)).join("\n")}\n${terminalLines.join("\n")}\n`,
    { mode: 0o600 },
  );
}

function release({ env, permit, terminal }) {
  return releaseCandidateAdmission(
    {
      admissionId: permit.admissionId,
      outcome: "terminal_cleaned",
      terminalReceiptRef: terminal.path,
    },
    env,
    "2026-07-18T00:03:00.000Z",
  );
}

test("ordinary release verifies one exact oversized cleaned event exactly once", () => {
  const context = fixture();
  try {
    assert.ok(context.terminal.finalEventBytes > 16 * MIB);
    assert.equal(captureCandidateAdmissionPressure(context.env).activeAdmissions, 1);
    const released = release(context);
    assert.equal(released.status, "released");
    assert.equal(released.terminalReceiptDigest, context.terminal.digest);
    assert.equal(captureCandidateAdmissionPressure(context.env).activeAdmissions, 0);

    const permitPath = candidateAdmissionPermitPath(context.permit.admissionId, context.env);
    const releasedBytes = readFileSync(permitPath, "utf8");
    assert.throws(() => release(context), /candidate admission is not reserved/);
    assert.equal(readFileSync(permitPath, "utf8"), releasedBytes);
    assert.equal(captureCandidateAdmissionPressure(context.env).activeAdmissions, 0);
  } finally {
    rmSync(context.root, { recursive: true, force: true });
  }
});

const failureScenarios = [
  { name: "truncated JSON", lines: (terminal) => [terminal.finalEventJson.slice(0, -64)] },
  { name: "malformed JSON", lines: (terminal) => [`${terminal.finalEventJson.slice(0, -1)},]`] },
  {
    name: "wrong resource identity",
    lines: (terminal) => [
      terminal.finalEventJson.replace(terminal.record.resourceId, `cpr-${"f".repeat(24)}`),
    ],
  },
  {
    name: "wrong generation identity",
    lines: (terminal) => [
      terminal.finalEventJson.replace(terminal.record.generationId, `gen-v1-${"c".repeat(20)}`),
    ],
  },
  {
    name: "wrong terminal timestamp",
    lines: (terminal) => [
      terminal.finalEventJson.replace(
        `"at":"${terminal.record.updatedAt}"`,
        '"at":"2026-07-18T00:04:00.000Z"',
      ),
    ],
  },
  {
    name: "wrong fromVersion",
    lines: (terminal) => [terminal.finalEventJson.replace('"fromVersion":2', '"fromVersion":1')],
  },
  {
    name: "reordered terminal keys",
    lines: (terminal) => [
      JSON.stringify({
        at: terminal.record.updatedAt,
        event: "cleaned",
        fromVersion: terminal.record.resourceVersion - 1,
        record: terminal.record,
      }),
    ],
  },
  {
    name: "event identity after the dynamic ceiling",
    lines: (terminal) => [
      JSON.stringify({
        at: terminal.record.updatedAt,
        fromVersion: terminal.record.resourceVersion - 1,
        record: terminal.record,
        event: "cleaned",
      }),
    ],
  },
  {
    name: "duplicate non-event key",
    lines: (terminal) => [
      terminal.finalEventJson.replace(
        `"at":"${terminal.record.updatedAt}"`,
        `"at":"${terminal.record.updatedAt}","at":"${terminal.record.updatedAt}"`,
      ),
    ],
  },
  {
    name: "overlong cleaned line",
    lines: (terminal) => [`${terminal.finalEventJson}${"x".repeat(8 * MIB)}`],
  },
  {
    name: "later lifecycle event",
    lines: (terminal) => [
      terminal.finalEventJson,
      JSON.stringify({ event: "post_cleaned_probe", at: "2026-07-18T00:04:00.000Z" }),
    ],
  },
  {
    name: "noncanonical whitespace",
    lines: (terminal) => [`${terminal.finalEventJson.slice(0, -1)} }`],
  },
  {
    name: "duplicate terminal events",
    lines: (terminal) => [terminal.finalEventJson, terminal.finalEventJson],
  },
  {
    name: "oversized non-cleaned relevant event",
    lines: (terminal) => [
      JSON.stringify({ event: "cleanup_effect_observed", padding: "x".repeat(17 * MIB) }),
      terminal.finalEventJson,
    ],
  },
];

for (const scenario of failureScenarios) {
  test(`ordinary release rejects ${scenario.name} without pressure mutation`, () => {
    const context = fixture();
    try {
      assert.ok(context.terminal.finalEventBytes > 16 * MIB);
      rewriteTerminalEvents(context.terminal, scenario.lines(context.terminal));
      const permitPath = candidateAdmissionPermitPath(context.permit.admissionId, context.env);
      const reservedBytes = readFileSync(permitPath, "utf8");

      assert.throws(
        () => release(context),
        /oversized cleaned lifecycle event does not match|malformed lifecycle event|cleaned lifecycle event is not unique|relevant cleanup lifecycle event exceeds bounded read limit|lifecycle event identity exceeds bounded read limit|candidate terminal record is not the final cleaned lifecycle event/,
      );
      assert.equal(readFileSync(permitPath, "utf8"), reservedBytes);
      assert.equal(captureCandidateAdmissionPressure(context.env).activeAdmissions, 1);
    } finally {
      rmSync(context.root, { recursive: true, force: true });
    }
  });
}

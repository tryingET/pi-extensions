// summary: "Tests rewind live-set planning, runtime configuration, keepalive rewrites, and CAS drift safety."
// read_when:
//   - "Changing rewind age, count, pinning, keepalive rewrite, or runtime retention policy."

import assert from "node:assert/strict";
import test from "node:test";
import {
  ASC_REWIND_OP_CUSTOM_TYPE,
  ASC_REWIND_TURN_CUSTOM_TYPE,
  DEFAULT_REWIND_MAX_AGE_DAYS,
  DEFAULT_REWIND_MAX_SNAPSHOTS,
  ensureSnapshotForCurrentWorktree,
  executeRewindStoreRetention,
  getStoreHead,
  planRetentionLiveSet,
  publishAndCollectActiveRewindLeases,
  REWIND_STORE_REF,
  resolveRewindRetentionConfig,
  rewriteStoreToLiveSetDetailed,
} from "../extensions/self/rewind/index.ts";
import { createRewindGitHarness, runGit } from "./rewind-harness.mjs";

// Pin git commit dates so commit-tree SHAs are deterministic. Without this, the lease commit built by
// publishAndCollectActiveRewindLeases includes wall-clock time at second resolution; two identical publishes
// that straddle a second boundary produce different SHAs and the idempotency assertion flakes under concurrency.
// Uses ??= so an explicit caller/CI override is respected. Scoped to this test file's process.
process.env.GIT_AUTHOR_DATE ??= "2026-04-22T00:00:00Z";
process.env.GIT_COMMITTER_DATE ??= "2026-04-22T00:00:00Z";

const DAY_MS = 24 * 60 * 60 * 1000;

test("rewind retention planning keeps current, undo, and pinned commits while pruning ordinary bindings", () => {
  const now = Date.parse("2026-04-22T00:00:00.000Z");

  const plan = planRetentionLiveSet(
    [
      { commitSha: "binding-fresh", timestamp: now - 1_000, kind: "binding" },
      { commitSha: "binding-stale", timestamp: now - 40 * DAY_MS, kind: "binding" },
      {
        commitSha: "binding-pinned",
        timestamp: now - 50 * DAY_MS,
        kind: "binding",
        pinned: true,
      },
      { commitSha: "current-commit", timestamp: now - 2_000, kind: "current" },
      { commitSha: "undo-commit", timestamp: now - 3_000, kind: "undo" },
    ],
    { maxSnapshots: 1, maxAgeDays: 30 },
    now,
  );

  assert.deepEqual(plan.pinnedCommitShas.sort(), [
    "binding-pinned",
    "current-commit",
    "undo-commit",
  ]);
  assert.deepEqual(plan.retainedCommitShas, ["binding-fresh"]);
  assert.deepEqual(plan.liveCommitShas.sort(), [
    "binding-fresh",
    "binding-pinned",
    "current-commit",
    "undo-commit",
  ]);
});

test("rewind retention defaults are bounded and explicit environment overrides fail closed", () => {
  const defaults = resolveRewindRetentionConfig({}, {});
  assert.equal(defaults.maxSnapshots, DEFAULT_REWIND_MAX_SNAPSHOTS);
  assert.equal(defaults.maxAgeDays, DEFAULT_REWIND_MAX_AGE_DAYS);
  assert.deepEqual(defaults.pinnedCommitShas, []);

  const pinned = "a".repeat(40);
  const overridden = resolveRewindRetentionConfig(
    {},
    {
      PI_ASC_REWIND_MAX_SNAPSHOTS: "7",
      PI_ASC_REWIND_MAX_AGE_DAYS: "12",
      PI_ASC_REWIND_PINNED_COMMITS: `${pinned},${pinned}`,
    },
  );
  assert.equal(overridden.maxSnapshots, 7);
  assert.equal(overridden.maxAgeDays, 12);
  assert.deepEqual(overridden.pinnedCommitShas, [pinned]);

  for (const [options, env] of [
    [{ maxSnapshots: -1 }, {}],
    [{ maxSnapshots: Number.MAX_SAFE_INTEGER + 1 }, {}],
    [{ maxAgeDays: 1.5 }, {}],
    [{}, { PI_ASC_REWIND_MAX_SNAPSHOTS: "-1" }],
    [{}, { PI_ASC_REWIND_MAX_AGE_DAYS: "1.5" }],
    [{}, { PI_ASC_REWIND_MAX_SNAPSHOTS: String(Number.MAX_SAFE_INTEGER + 1) }],
  ]) {
    assert.throws(() => resolveRewindRetentionConfig(options, env), /non-negative|safe integer/);
  }
  for (const invalidPin of ["short", "A".repeat(40), `${"a".repeat(39)}g`]) {
    assert.throws(
      () => resolveRewindRetentionConfig({}, { PI_ASC_REWIND_PINNED_COMMITS: invalidPin }),
      /full lowercase SHA-1/,
    );
  }
});

async function createSnapshot(harness, name, previous) {
  await harness.writeRepoFile("tracked.txt", `${name}\n`);
  return ensureSnapshotForCurrentWorktree(harness.git, {
    ...(previous ? { lastExact: previous.snapshot } : {}),
  });
}

async function isAncestor(harness, ancestor, descendant) {
  return (
    (await runGit(harness.repoRoot, ["merge-base", "--is-ancestor", ancestor, descendant])).code ===
    0
  );
}

test("runtime retention rewrites the store to current, undo, pinned, and bounded recent snapshots", async () => {
  const harness = await createRewindGitHarness();
  try {
    const old = await createSnapshot(harness, "old");
    const recent = await createSnapshot(harness, "recent", old);
    const current = await createSnapshot(harness, "current", recent);
    const undo = await createSnapshot(harness, "undo", current);
    const pinned = await createSnapshot(harness, "pinned", undo);
    const previousStoreHead = await getStoreHead(harness.git);
    const now = Date.parse("2026-08-03T00:00:00.000Z");
    const entries = [
      {
        type: "custom",
        id: "asc-rewind-turn-old",
        parentId: null,
        timestamp: new Date(now - 40 * DAY_MS).toISOString(),
        customType: ASC_REWIND_TURN_CUSTOM_TYPE,
        data: {
          v: 1,
          snapshots: [old.snapshot.commitSha],
          bindings: [["old-entry", 0]],
        },
      },
      {
        type: "custom",
        id: "asc-rewind-turn-recent",
        parentId: "asc-rewind-turn-old",
        timestamp: new Date(now - 1_000).toISOString(),
        customType: ASC_REWIND_TURN_CUSTOM_TYPE,
        data: {
          v: 1,
          snapshots: [recent.snapshot.commitSha],
          bindings: [["recent-entry", 0]],
        },
      },
    ];

    const result = await executeRewindStoreRetention({
      git: harness.git,
      entries,
      currentCommitSha: current.snapshot.commitSha,
      undoCommitSha: undo.snapshot.commitSha,
      config: resolveRewindRetentionConfig({
        maxSnapshots: 1,
        maxAgeDays: 30,
        pinnedCommitShas: [pinned.snapshot.commitSha],
        now: () => now,
      }),
    });

    assert.equal(result.status, "rewritten");
    assert.equal(result.previousStoreHead, previousStoreHead);
    assert.ok(result.storeHead);
    assert.notEqual(result.storeHead, previousStoreHead);
    assert.deepEqual(result.retainedCommitShas, [recent.snapshot.commitSha]);
    for (const commitSha of [
      recent.snapshot.commitSha,
      current.snapshot.commitSha,
      undo.snapshot.commitSha,
      pinned.snapshot.commitSha,
    ]) {
      assert.equal(await isAncestor(harness, commitSha, result.storeHead), true);
    }
    assert.equal(await isAncestor(harness, old.snapshot.commitSha, result.storeHead), false);
  } finally {
    await harness.cleanup();
  }
});

test("historical op current and undo snapshots remain ordinary while reconstructed state stays pinned", async () => {
  const harness = await createRewindGitHarness();
  try {
    const historicalCurrent = await createSnapshot(harness, "historical-current");
    const historicalUndo = await createSnapshot(harness, "historical-undo", historicalCurrent);
    const newerHistoricalCurrent = await createSnapshot(
      harness,
      "newer-historical-current",
      historicalUndo,
    );
    const newerHistoricalUndo = await createSnapshot(
      harness,
      "newer-historical-undo",
      newerHistoricalCurrent,
    );
    const reconstructedCurrent = await createSnapshot(
      harness,
      "reconstructed-current",
      newerHistoricalUndo,
    );
    const reconstructedUndo = await createSnapshot(
      harness,
      "reconstructed-undo",
      reconstructedCurrent,
    );
    const explicitPin = await createSnapshot(harness, "explicit-pin", reconstructedUndo);
    const previousStoreHead = await getStoreHead(harness.git);
    assert.ok(previousStoreHead);
    const previousReachableCount = Number(
      (await runGit(harness.repoRoot, ["rev-list", "--count", previousStoreHead])).stdout.trim(),
    );
    const now = Date.parse("2026-08-03T00:00:00.000Z");
    const entries = [
      {
        type: "custom",
        id: "asc-rewind-op-old",
        parentId: null,
        timestamp: new Date(now - 2 * DAY_MS).toISOString(),
        customType: ASC_REWIND_OP_CUSTOM_TYPE,
        data: {
          v: 1,
          snapshots: [historicalCurrent.snapshot.commitSha, historicalUndo.snapshot.commitSha],
          current: 0,
          undo: 1,
        },
      },
      {
        type: "custom",
        id: "asc-rewind-op-newer",
        parentId: "asc-rewind-op-old",
        timestamp: new Date(now - DAY_MS).toISOString(),
        customType: ASC_REWIND_OP_CUSTOM_TYPE,
        data: {
          v: 1,
          snapshots: [
            newerHistoricalCurrent.snapshot.commitSha,
            newerHistoricalUndo.snapshot.commitSha,
          ],
          current: 0,
          undo: 1,
        },
      },
      {
        type: "custom",
        id: "asc-rewind-op-latest",
        parentId: "asc-rewind-op-newer",
        timestamp: new Date(now).toISOString(),
        customType: ASC_REWIND_OP_CUSTOM_TYPE,
        data: {
          v: 1,
          snapshots: [
            reconstructedCurrent.snapshot.commitSha,
            reconstructedUndo.snapshot.commitSha,
          ],
          current: 0,
          undo: 1,
        },
      },
    ];

    const result = await executeRewindStoreRetention({
      git: harness.git,
      entries,
      currentCommitSha: reconstructedCurrent.snapshot.commitSha,
      undoCommitSha: reconstructedUndo.snapshot.commitSha,
      config: resolveRewindRetentionConfig({
        maxSnapshots: 0,
        maxAgeDays: 0,
        pinnedCommitShas: [explicitPin.snapshot.commitSha],
        now: () => now,
      }),
    });

    assert.equal(result.status, "rewritten");
    assert.ok(result.storeHead);
    assert.deepEqual(result.retainedCommitShas, []);
    assert.deepEqual(
      new Set(result.pinnedCommitShas),
      new Set([
        reconstructedCurrent.snapshot.commitSha,
        reconstructedUndo.snapshot.commitSha,
        explicitPin.snapshot.commitSha,
      ]),
    );
    for (const commitSha of [
      reconstructedCurrent.snapshot.commitSha,
      reconstructedUndo.snapshot.commitSha,
      explicitPin.snapshot.commitSha,
    ]) {
      assert.equal(await isAncestor(harness, commitSha, result.storeHead), true);
    }
    for (const commitSha of [
      historicalCurrent.snapshot.commitSha,
      historicalUndo.snapshot.commitSha,
      newerHistoricalCurrent.snapshot.commitSha,
      newerHistoricalUndo.snapshot.commitSha,
      previousStoreHead,
    ]) {
      assert.equal(await isAncestor(harness, commitSha, result.storeHead), false);
    }
    const rewrittenReachableCount = Number(
      (await runGit(harness.repoRoot, ["rev-list", "--count", result.storeHead])).stdout.trim(),
    );
    assert.ok(rewrittenReachableCount < previousReachableCount);
  } finally {
    await harness.cleanup();
  }
});

test("active-session ref verification rejects a stale lease plan before store replacement", async () => {
  const harness = await createRewindGitHarness();
  try {
    const firstSessionOld = await createSnapshot(harness, "first-session-old");
    const secondSessionCurrent = await createSnapshot(
      harness,
      "second-session-current",
      firstSessionOld,
    );
    await publishAndCollectActiveRewindLeases({
      git: harness.git,
      sessionId: "lease-race-session-a",
      currentCommitSha: firstSessionOld.snapshot.commitSha,
    });
    const staleSecondSessionView = await publishAndCollectActiveRewindLeases({
      git: harness.git,
      sessionId: "lease-race-session-b",
      currentCommitSha: secondSessionCurrent.snapshot.commitSha,
    });

    const firstSessionNew = await createSnapshot(
      harness,
      "first-session-new",
      secondSessionCurrent,
    );
    const freshFirstSessionView = await publishAndCollectActiveRewindLeases({
      git: harness.git,
      sessionId: "lease-race-session-a",
      currentCommitSha: firstSessionNew.snapshot.commitSha,
    });
    const firstSessionRewrite = await executeRewindStoreRetention({
      git: harness.git,
      entries: [],
      currentCommitSha: firstSessionNew.snapshot.commitSha,
      config: resolveRewindRetentionConfig({ maxSnapshots: 0, maxAgeDays: 0 }),
      activeSessionCommitShas: freshFirstSessionView.protectedCommitShas,
      expectedActiveLeaseHeads: freshFirstSessionView.expectedRefHeads,
    });
    assert.equal(firstSessionRewrite.status, "rewritten");
    assert.ok(firstSessionRewrite.storeHead);

    await assert.rejects(
      executeRewindStoreRetention({
        git: harness.git,
        entries: [],
        currentCommitSha: secondSessionCurrent.snapshot.commitSha,
        config: resolveRewindRetentionConfig({ maxSnapshots: 0, maxAgeDays: 0 }),
        activeSessionCommitShas: staleSecondSessionView.protectedCommitShas,
        expectedActiveLeaseHeads: staleSecondSessionView.expectedRefHeads,
      }),
      /cannot lock ref|failed|expected|verify/i,
    );

    assert.equal(await getStoreHead(harness.git), firstSessionRewrite.storeHead);
    assert.equal(
      await isAncestor(harness, firstSessionNew.snapshot.commitSha, firstSessionRewrite.storeHead),
      true,
    );
    assert.equal(
      await getStoreHead(harness.git, freshFirstSessionView.ownLeaseRef),
      freshFirstSessionView.ownLeaseObjectId,
    );

    const preAdditionView = await publishAndCollectActiveRewindLeases({
      git: harness.git,
      sessionId: "lease-race-session-a",
      currentCommitSha: firstSessionNew.snapshot.commitSha,
    });
    const addedSessionCurrent = await createSnapshot(
      harness,
      "added-session-current",
      firstSessionNew,
    );
    const postAdditionView = await publishAndCollectActiveRewindLeases({
      git: harness.git,
      sessionId: "lease-race-session-c",
      currentCommitSha: addedSessionCurrent.snapshot.commitSha,
    });
    const postAdditionRewrite = await executeRewindStoreRetention({
      git: harness.git,
      entries: [],
      currentCommitSha: addedSessionCurrent.snapshot.commitSha,
      config: resolveRewindRetentionConfig({ maxSnapshots: 0, maxAgeDays: 0 }),
      activeSessionCommitShas: postAdditionView.protectedCommitShas,
      expectedActiveLeaseHeads: postAdditionView.expectedRefHeads,
    });
    assert.ok(postAdditionRewrite.storeHead);

    await assert.rejects(
      executeRewindStoreRetention({
        git: harness.git,
        entries: [],
        currentCommitSha: firstSessionNew.snapshot.commitSha,
        config: resolveRewindRetentionConfig({ maxSnapshots: 0, maxAgeDays: 0 }),
        activeSessionCommitShas: preAdditionView.protectedCommitShas,
        expectedActiveLeaseHeads: preAdditionView.expectedRefHeads,
      }),
      /cannot lock ref|failed|expected|verify/i,
    );
    assert.equal(await getStoreHead(harness.git), postAdditionRewrite.storeHead);
    assert.equal(
      await isAncestor(
        harness,
        addedSessionCurrent.snapshot.commitSha,
        postAdditionRewrite.storeHead,
      ),
      true,
    );

    const fixedNow = Date.parse("2026-08-03T00:00:00.000Z");
    const preAbaView = await publishAndCollectActiveRewindLeases({
      git: harness.git,
      sessionId: "lease-race-session-a",
      currentCommitSha: firstSessionNew.snapshot.commitSha,
      now: fixedNow,
    });
    const postAbaView = await publishAndCollectActiveRewindLeases({
      git: harness.git,
      sessionId: "lease-race-session-a",
      currentCommitSha: firstSessionNew.snapshot.commitSha,
      now: fixedNow,
    });
    assert.equal(preAbaView.ownLeaseObjectId, postAbaView.ownLeaseObjectId);
    const preAbaEpoch = preAbaView.expectedRefHeads.find((head) =>
      head.refName.endsWith("active-sessions-epoch"),
    );
    const postAbaEpoch = postAbaView.expectedRefHeads.find((head) =>
      head.refName.endsWith("active-sessions-epoch"),
    );
    assert.ok(preAbaEpoch);
    assert.ok(postAbaEpoch);
    assert.notEqual(preAbaEpoch.objectId, postAbaEpoch.objectId);

    const postAbaRewrite = await executeRewindStoreRetention({
      git: harness.git,
      entries: [],
      currentCommitSha: firstSessionNew.snapshot.commitSha,
      config: resolveRewindRetentionConfig({ maxSnapshots: 0, maxAgeDays: 0 }),
      activeSessionCommitShas: postAbaView.protectedCommitShas,
      expectedActiveLeaseHeads: postAbaView.expectedRefHeads,
    });
    await assert.rejects(
      executeRewindStoreRetention({
        git: harness.git,
        entries: [],
        currentCommitSha: firstSessionNew.snapshot.commitSha,
        config: resolveRewindRetentionConfig({ maxSnapshots: 0, maxAgeDays: 0 }),
        activeSessionCommitShas: preAbaView.protectedCommitShas,
        expectedActiveLeaseHeads: preAbaView.expectedRefHeads,
      }),
      /cannot lock ref|failed|expected|verify/i,
    );
    assert.equal(await getStoreHead(harness.git), postAbaRewrite.storeHead);
  } finally {
    await harness.cleanup();
  }
});

test("empty retention preserves the store and concurrent ref drift fails the expected-old-OID CAS", async () => {
  const harness = await createRewindGitHarness();
  try {
    const first = await createSnapshot(harness, "first");
    const oldHead = await getStoreHead(harness.git);
    const empty = await rewriteStoreToLiveSetDetailed(harness.git, []);
    assert.equal(empty.status, "preserved-empty");
    assert.equal(empty.previousStoreHead, oldHead);
    assert.equal(empty.storeHead, oldHead);
    assert.equal(await getStoreHead(harness.git), oldHead);

    const raceTarget = await createSnapshot(harness, "race", first);
    const expectedOld = await getStoreHead(harness.git);
    let injected = false;
    const racingGit = async (args, options) => {
      if (!injected && args[0] === "update-ref" && args[1] === REWIND_STORE_REF) {
        injected = true;
        const raced = await harness.git(
          ["update-ref", REWIND_STORE_REF, raceTarget.snapshot.commitSha, args[3]],
          options,
        );
        assert.equal(raced.code, 0);
      }
      return harness.git(args, options);
    };

    await assert.rejects(
      rewriteStoreToLiveSetDetailed(racingGit, [first.snapshot.commitSha]),
      /failed|cannot lock ref|reference already exists|expected/i,
    );
    assert.equal(injected, true);
    assert.equal(await getStoreHead(harness.git), raceTarget.snapshot.commitSha);
    assert.notEqual(await getStoreHead(harness.git), expectedOld);
  } finally {
    await harness.cleanup();
  }
});

test("absent store ref creation uses zero-OID CAS and cannot overwrite a concurrent creator", async () => {
  const harness = await createRewindGitHarness();
  try {
    const first = await createSnapshot(harness, "absent-first");
    const raceTarget = await createSnapshot(harness, "absent-race", first);
    const testRef = "refs/pi-rewind/test-absent-store";
    assert.equal(await getStoreHead(harness.git, testRef), undefined);

    let injected = false;
    const racingGit = async (args, options) => {
      if (!injected && args[0] === "update-ref" && args[1] === testRef) {
        injected = true;
        const raced = await harness.git(
          ["update-ref", testRef, raceTarget.snapshot.commitSha, args[3]],
          options,
        );
        assert.equal(raced.code, 0);
      }
      return harness.git(args, options);
    };

    await assert.rejects(
      rewriteStoreToLiveSetDetailed(racingGit, [first.snapshot.commitSha], testRef),
      /failed|cannot lock ref|reference already exists|expected/i,
    );
    assert.equal(injected, true);
    assert.equal(await getStoreHead(harness.git, testRef), raceTarget.snapshot.commitSha);
  } finally {
    await harness.cleanup();
  }
});

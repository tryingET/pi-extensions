// summary: "Tests rewind runtime lifecycle hooks, navigation restores, and recovery projections."
// read_when:
//   - "Changing rewind commands, session hooks, prompts, or Replay Fabric events."

import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import test from "node:test";
import {
  ASC_REWIND_OP_CUSTOM_TYPE,
  ASC_REWIND_TURN_CUSTOM_TYPE,
  commitExists,
  ensureSnapshotForCurrentWorktree,
  getStoreHead,
  isAscRewindOpData,
  isAscRewindTurnData,
  registerRewindRuntime,
} from "../extensions/self/rewind/index.ts";
import { createRewindGitHarness, gitStdout, runGit, runGitChecked } from "./rewind-harness.mjs";

import {
  createPiHarness,
  SessionManagerStub,
  startRecordingReplayFabricServer,
  withReplayFabricEnv,
} from "./rewind-runtime-harness.mjs";

test("rewind runtime registers a diagnostic status command", async () => {
  const workspace = await mkdtemp(path.join(tmpdir(), "asc-rewind-status-"));

  try {
    const sessionManager = new SessionManagerStub({
      sessionFile: `${workspace}/status-session.jsonl`,
      id: "session-status",
      cwd: workspace,
    });
    const harness = createPiHarness(sessionManager);
    registerRewindRuntime(harness.pi);

    assert.equal(harness.commands.has("asc-rewind-status"), true);
    await harness.commands.get("asc-rewind-status").handler("", harness.ctx);
    assert.ok(
      harness.notifications.some(
        (item) => item.level === "warning" && item.message.includes("ASC rewind: unavailable"),
      ),
      "expected diagnostic command to report unavailable rewind state before session init",
    );
  } finally {
    await rm(workspace, { recursive: true, force: true });
  }
});

test("rewind runtime records exact user and assistant rewind points during a prompt", async () => {
  const gitHarness = await createRewindGitHarness();

  try {
    const sessionManager = new SessionManagerStub({
      sessionFile: `${gitHarness.repoRoot}/session.jsonl`,
      id: "session-1",
      cwd: gitHarness.repoRoot,
    });
    const harness = createPiHarness(sessionManager);
    registerRewindRuntime(harness.pi);

    await gitHarness.writeRepoFile("tracked.txt", "before\n");
    await harness.handlers.get("session_start")(
      { type: "session_start", reason: "startup" },
      harness.ctx,
    );

    const userEntry = sessionManager.appendMessage("user", "refactor the module");
    await harness.handlers.get("turn_start")(
      { type: "turn_start", turnIndex: 0, timestamp: Date.now() },
      harness.ctx,
    );

    await gitHarness.writeRepoFile("tracked.txt", "after\n");
    const assistantEntry = sessionManager.appendMessage("assistant", "done");
    await harness.handlers.get("turn_end")(
      {
        type: "turn_end",
        turnIndex: 0,
        message: assistantEntry.message,
        toolResults: [],
      },
      harness.ctx,
    );
    assert.equal(
      sessionManager
        .getEntries()
        .some(
          (entry) => entry.type === "custom" && entry.customType === ASC_REWIND_TURN_CUSTOM_TYPE,
        ),
      false,
      "agent/turn completion must not finalize before Pi reports full settlement",
    );
    await harness.handlers.get("agent_settled")({ type: "agent_settled" }, harness.ctx);

    const rewindEntry = sessionManager
      .getEntries()
      .find((entry) => entry.type === "custom" && entry.customType === ASC_REWIND_TURN_CUSTOM_TYPE);
    assert.ok(rewindEntry, "expected an ASC rewind turn entry");
    assert.equal(isAscRewindTurnData(rewindEntry.data), true);
    assert.deepEqual(
      rewindEntry.data.bindings.map(([entryId]) => entryId),
      [userEntry.id, assistantEntry.id],
    );
    for (const commitSha of rewindEntry.data.snapshots) {
      assert.equal(await commitExists(gitHarness.git, commitSha), true);
    }

    const storeHead = await getStoreHead(gitHarness.git);
    assert.ok(storeHead, "expected rewind snapshots to stay reachable through the keepalive ref");
    assert.ok(
      harness.statuses.some((item) => item.key === "asc-rewind" && typeof item.text === "string"),
      "expected rewind status to be published",
    );
  } finally {
    await gitHarness.cleanup();
  }
});

test("rewind runtime executes bounded retention after agent settlement and reports status", async () => {
  const gitHarness = await createRewindGitHarness();

  try {
    const sessionManager = new SessionManagerStub({
      sessionFile: `${gitHarness.repoRoot}/retention-session.jsonl`,
      id: "session-retention",
      cwd: gitHarness.repoRoot,
    });
    const harness = createPiHarness(sessionManager);
    registerRewindRuntime(harness.pi, {
      maxSnapshots: 0,
      maxAgeDays: 0,
      now: () => Date.parse("2026-08-03T00:00:00.000Z"),
    });

    await gitHarness.writeRepoFile("tracked.txt", "before retention\n");
    await harness.handlers.get("session_start")(
      { type: "session_start", reason: "startup" },
      harness.ctx,
    );
    sessionManager.appendMessage("user", "retain only current");
    await harness.handlers.get("turn_start")(
      { type: "turn_start", turnIndex: 0, timestamp: Date.now() },
      harness.ctx,
    );
    await gitHarness.writeRepoFile("tracked.txt", "after retention\n");
    const assistantEntry = sessionManager.appendMessage("assistant", "done");
    await harness.handlers.get("turn_end")(
      {
        type: "turn_end",
        turnIndex: 0,
        message: assistantEntry.message,
        toolResults: [],
      },
      harness.ctx,
    );
    await harness.handlers.get("agent_settled")({ type: "agent_settled" }, harness.ctx);

    const rewindEntry = sessionManager
      .getEntries()
      .find((entry) => entry.type === "custom" && entry.customType === ASC_REWIND_TURN_CUSTOM_TYPE);
    assert.ok(rewindEntry);
    assert.equal(rewindEntry.data.snapshots.length, 2);
    const [startSnapshot, currentSnapshot] = rewindEntry.data.snapshots;
    const storeHead = await getStoreHead(gitHarness.git);
    assert.ok(storeHead);
    assert.equal(
      (
        await runGit(gitHarness.repoRoot, [
          "merge-base",
          "--is-ancestor",
          currentSnapshot,
          storeHead,
        ])
      ).code,
      0,
    );
    assert.notEqual(
      (await runGit(gitHarness.repoRoot, ["merge-base", "--is-ancestor", startSnapshot, storeHead]))
        .code,
      0,
    );

    await harness.commands.get("asc-rewind-status").handler("", harness.ctx);
    assert.match(harness.notifications.at(-1).message, /retention: rewritten/);
    assert.match(harness.notifications.at(-1).message, /retention live snapshots: 1/);
    assert.match(harness.notifications.at(-1).message, /retention ordinary snapshots: 0/);
    assert.match(harness.notifications.at(-1).message, /retention active sessions: 1/);
    assert.doesNotMatch(harness.notifications.at(-1).message, /ordinary bindings/);
    assert.match(harness.notifications.at(-1).message, /maxSnapshots=0, maxAgeDays=0/);
  } finally {
    await gitHarness.cleanup();
  }
});

test("retention status counts deduplicated ordinary snapshots rather than ledger bindings", async () => {
  const gitHarness = await createRewindGitHarness();
  let harness;

  try {
    await gitHarness.writeRepoFile("tracked.txt", "ordinary snapshot\n");
    const ordinary = await ensureSnapshotForCurrentWorktree(gitHarness.git);
    await gitHarness.writeRepoFile("tracked.txt", "current snapshot\n");
    const current = await ensureSnapshotForCurrentWorktree(gitHarness.git, {
      lastExact: ordinary.snapshot,
    });
    const sessionManager = new SessionManagerStub({
      sessionFile: `${gitHarness.repoRoot}/retention-deduplicated-status.jsonl`,
      id: "retention-deduplicated-status",
      cwd: gitHarness.repoRoot,
    });
    sessionManager.appendCustomEntry(ASC_REWIND_TURN_CUSTOM_TYPE, {
      v: 1,
      snapshots: [ordinary.snapshot.commitSha],
      bindings: [
        ["ordinary-binding-one", 0],
        ["ordinary-binding-two", 0],
      ],
    });
    sessionManager.appendCustomEntry(ASC_REWIND_OP_CUSTOM_TYPE, {
      v: 1,
      snapshots: [current.snapshot.commitSha],
      current: 0,
    });
    harness = createPiHarness(sessionManager);
    registerRewindRuntime(harness.pi, { maxSnapshots: 1, maxAgeDays: 30 });
    await harness.handlers.get("session_start")(
      { type: "session_start", reason: "startup" },
      harness.ctx,
    );

    await harness.commands.get("asc-rewind-status").handler("", harness.ctx);
    assert.match(harness.notifications.at(-1).message, /rewind points: 2/);
    assert.match(harness.notifications.at(-1).message, /retention ordinary snapshots: 1/);
    assert.match(harness.notifications.at(-1).message, /retention live snapshots: 2/);
    assert.doesNotMatch(harness.notifications.at(-1).message, /ordinary bindings/);
  } finally {
    if (harness) {
      await harness.handlers.get("session_shutdown")({ type: "session_shutdown" }, harness.ctx);
    }
    await gitHarness.cleanup();
  }
});

test("cross-repository fork history is projected onto commits in the current repository", async () => {
  const sourceHarness = await createRewindGitHarness();
  const targetHarness = await createRewindGitHarness();
  let harness;

  try {
    await sourceHarness.writeRepoFile("tracked.txt", "foreign repository state\n");
    const foreign = await ensureSnapshotForCurrentWorktree(sourceHarness.git);
    assert.equal(await commitExists(targetHarness.git, foreign.snapshot.commitSha), false);

    const sessionManager = new SessionManagerStub({
      sessionFile: `${targetHarness.repoRoot}/cross-repository-fork.jsonl`,
      id: "cross-repository-fork",
      cwd: targetHarness.repoRoot,
    });
    const inheritedUser = sessionManager.appendMessage("user", "source repository turn");
    sessionManager.appendCustomEntry(ASC_REWIND_TURN_CUSTOM_TYPE, {
      v: 1,
      snapshots: [foreign.snapshot.commitSha],
      bindings: [[inheritedUser.id, 0]],
    });
    sessionManager.appendCustomEntry(ASC_REWIND_OP_CUSTOM_TYPE, {
      v: 1,
      snapshots: [foreign.snapshot.commitSha],
      current: 0,
    });

    harness = createPiHarness(sessionManager);
    registerRewindRuntime(harness.pi, { maxSnapshots: 1, maxAgeDays: 30 });
    await targetHarness.writeRepoFile("tracked.txt", "target repository start\n");
    await harness.handlers.get("session_start")(
      { type: "session_start", reason: "startup" },
      harness.ctx,
    );

    await harness.commands.get("asc-rewind-status").handler("", harness.ctx);
    assert.match(harness.notifications.at(-1).message, /rewind points: 0/);
    assert.doesNotMatch(harness.notifications.at(-1).message, /retention: failed/);

    sessionManager.appendMessage("user", "target repository turn");
    await harness.handlers.get("turn_start")(
      { type: "turn_start", turnIndex: 0, timestamp: Date.now() },
      harness.ctx,
    );
    await targetHarness.writeRepoFile("tracked.txt", "target repository current\n");
    const assistantEntry = sessionManager.appendMessage("assistant", "done");
    await harness.handlers.get("turn_end")(
      {
        type: "turn_end",
        turnIndex: 0,
        message: assistantEntry.message,
        toolResults: [],
      },
      harness.ctx,
    );
    await harness.handlers.get("agent_settled")({ type: "agent_settled" }, harness.ctx);

    const targetTurn = sessionManager
      .getEntries()
      .filter(
        (entry) => entry.type === "custom" && entry.customType === ASC_REWIND_TURN_CUSTOM_TYPE,
      )
      .at(-1);
    assert.ok(targetTurn);
    const [targetStart, targetCurrent] = targetTurn.data.snapshots;

    for (let attempt = 0; attempt < 2; attempt += 1) {
      await harness.handlers.get("session_start")(
        { type: "session_start", reason: "startup" },
        harness.ctx,
      );
    }

    const retentionWarnings = harness.notifications.filter(
      (notification) =>
        notification.level === "warning" &&
        notification.message.includes("ASC rewind retention failed closed"),
    );
    assert.deepEqual(retentionWarnings, []);
    await harness.commands.get("asc-rewind-status").handler("", harness.ctx);
    assert.match(harness.notifications.at(-1).message, /rewind points: 2/);
    assert.match(harness.notifications.at(-1).message, /retention: rewritten/);
    assert.match(harness.notifications.at(-1).message, /retention live snapshots: 2/);

    const storeHead = await getStoreHead(targetHarness.git);
    assert.ok(storeHead);
    for (const targetSnapshot of [targetStart, targetCurrent]) {
      assert.equal(
        (
          await runGit(targetHarness.repoRoot, [
            "merge-base",
            "--is-ancestor",
            targetSnapshot,
            storeHead,
          ])
        ).code,
        0,
      );
    }
    assert.equal(await commitExists(targetHarness.git, foreign.snapshot.commitSha), false);
  } finally {
    if (harness) {
      await harness.handlers.get("session_shutdown")({ type: "session_shutdown" }, harness.ctx);
    }
    await sourceHarness.cleanup();
    await targetHarness.cleanup();
  }
});

test("repository-global retention preserves every active session current and undo snapshot", async () => {
  const gitHarness = await createRewindGitHarness();
  let firstHarness;
  let secondHarness;

  try {
    await gitHarness.writeRepoFile("tracked.txt", "linked-worktree baseline\n");
    await runGitChecked(gitHarness.repoRoot, ["add", "tracked.txt"]);
    await runGitChecked(gitHarness.repoRoot, ["commit", "-m", "linked-worktree baseline"]);
    const linkedWorktreeRoot = `${gitHarness.repoRoot}-linked`;
    await runGitChecked(gitHarness.repoRoot, [
      "worktree",
      "add",
      "--detach",
      linkedWorktreeRoot,
      "HEAD",
    ]);

    await gitHarness.writeRepoFile("tracked.txt", "session A current\n");
    const firstCurrent = await ensureSnapshotForCurrentWorktree(gitHarness.git);
    await gitHarness.writeRepoFile("tracked.txt", "session A undo\n");
    const firstUndo = await ensureSnapshotForCurrentWorktree(gitHarness.git, {
      lastExact: firstCurrent.snapshot,
    });

    const firstSession = new SessionManagerStub({
      sessionFile: `${gitHarness.repoRoot}/active-session-a.jsonl`,
      id: "active-session-a",
      cwd: gitHarness.repoRoot,
    });
    firstSession.appendCustomEntry(ASC_REWIND_OP_CUSTOM_TYPE, {
      v: 1,
      snapshots: [firstCurrent.snapshot.commitSha, firstUndo.snapshot.commitSha],
      current: 0,
      undo: 1,
    });
    firstHarness = createPiHarness(firstSession);
    registerRewindRuntime(firstHarness.pi, { maxSnapshots: 0, maxAgeDays: 0 });
    await firstHarness.handlers.get("session_start")(
      { type: "session_start", reason: "startup" },
      firstHarness.ctx,
    );

    const secondSession = new SessionManagerStub({
      sessionFile: `${linkedWorktreeRoot}/active-session-b.jsonl`,
      id: "active-session-b",
      cwd: linkedWorktreeRoot,
    });
    secondHarness = createPiHarness(secondSession);
    registerRewindRuntime(secondHarness.pi, { maxSnapshots: 0, maxAgeDays: 0 });
    await secondHarness.handlers.get("session_start")(
      { type: "session_start", reason: "startup" },
      secondHarness.ctx,
    );
    await writeFile(path.join(linkedWorktreeRoot, "tracked.txt"), "session B start\n", "utf8");
    secondSession.appendMessage("user", "rewrite the repository-global store");
    await secondHarness.handlers.get("turn_start")(
      { type: "turn_start", turnIndex: 0, timestamp: Date.now() },
      secondHarness.ctx,
    );
    await writeFile(path.join(linkedWorktreeRoot, "tracked.txt"), "session B current\n", "utf8");
    const assistantEntry = secondSession.appendMessage("assistant", "done");
    await secondHarness.handlers.get("turn_end")(
      {
        type: "turn_end",
        turnIndex: 0,
        message: assistantEntry.message,
        toolResults: [],
      },
      secondHarness.ctx,
    );
    await secondHarness.handlers.get("agent_settled")({ type: "agent_settled" }, secondHarness.ctx);

    const storeHead = await getStoreHead(gitHarness.git);
    assert.ok(storeHead);
    for (const protectedSnapshot of [
      firstCurrent.snapshot.commitSha,
      firstUndo.snapshot.commitSha,
    ]) {
      assert.equal(
        (
          await runGit(gitHarness.repoRoot, [
            "merge-base",
            "--is-ancestor",
            protectedSnapshot,
            storeHead,
          ])
        ).code,
        0,
      );
    }
    await secondHarness.commands.get("asc-rewind-status").handler("", secondHarness.ctx);
    assert.match(secondHarness.notifications.at(-1).message, /retention active sessions: 2/);
    assert.match(secondHarness.notifications.at(-1).message, /retention ordinary snapshots: 0/);
  } finally {
    if (secondHarness) {
      await secondHarness.handlers.get("session_shutdown")(
        { type: "session_shutdown" },
        secondHarness.ctx,
      );
    }
    if (firstHarness) {
      await firstHarness.handlers.get("session_shutdown")(
        { type: "session_shutdown" },
        firstHarness.ctx,
      );
    }
    await gitHarness.cleanup();
  }
});

test("retention failure warns and reports the unchanged observed store head", async () => {
  const gitHarness = await createRewindGitHarness();
  let harness;

  try {
    await gitHarness.writeRepoFile("tracked.txt", "retention failure baseline\n");
    await ensureSnapshotForCurrentWorktree(gitHarness.git);
    const previousStoreHead = await getStoreHead(gitHarness.git);
    assert.ok(previousStoreHead);

    const sessionManager = new SessionManagerStub({
      sessionFile: `${gitHarness.repoRoot}/retention-failure.jsonl`,
      id: "retention-failure",
      cwd: gitHarness.repoRoot,
    });
    harness = createPiHarness(sessionManager);
    registerRewindRuntime(harness.pi, {
      maxSnapshots: 0,
      maxAgeDays: 0,
      pinnedCommitShas: ["f".repeat(40)],
    });
    await harness.handlers.get("session_start")(
      { type: "session_start", reason: "startup" },
      harness.ctx,
    );

    assert.equal(await getStoreHead(gitHarness.git), previousStoreHead);
    assert.ok(
      harness.notifications.some(
        (notification) =>
          notification.level === "warning" &&
          notification.message.includes("ASC rewind retention failed closed"),
      ),
    );
    await harness.commands.get("asc-rewind-status").handler("", harness.ctx);
    assert.match(harness.notifications.at(-1).message, /retention: failed/);
    assert.match(
      harness.notifications.at(-1).message,
      new RegExp(`retention store head: ${previousStoreHead}`),
    );
  } finally {
    if (harness) {
      await harness.handlers.get("session_shutdown")({ type: "session_shutdown" }, harness.ctx);
    }
    await gitHarness.cleanup();
  }
});

test("rewind runtime aliases the current exact state to compaction entries", async () => {
  const gitHarness = await createRewindGitHarness();

  try {
    const sessionManager = new SessionManagerStub({
      sessionFile: `${gitHarness.repoRoot}/session.jsonl`,
      id: "session-2",
      cwd: gitHarness.repoRoot,
    });
    const harness = createPiHarness(sessionManager);
    registerRewindRuntime(harness.pi);

    await gitHarness.writeRepoFile("tracked.txt", "baseline\n");
    await harness.handlers.get("session_start")(
      { type: "session_start", reason: "startup" },
      harness.ctx,
    );

    sessionManager.appendMessage("user", "compact this");
    await harness.handlers.get("turn_start")(
      { type: "turn_start", turnIndex: 0, timestamp: Date.now() },
      harness.ctx,
    );
    sessionManager.appendMessage("assistant", "compacted");
    await harness.handlers.get("turn_end")(
      {
        type: "turn_end",
        turnIndex: 0,
        message: { role: "assistant", content: [{ type: "text", text: "compacted" }] },
        toolResults: [],
      },
      harness.ctx,
    );
    await harness.handlers.get("agent_settled")({ type: "agent_settled" }, harness.ctx);

    const compactionEntry = sessionManager.appendCompaction();
    await harness.handlers.get("session_compact")(
      {
        type: "session_compact",
        compactionEntry,
        fromExtension: false,
      },
      harness.ctx,
    );

    const opEntry = sessionManager
      .getEntries()
      .find((entry) => entry.type === "custom" && entry.customType === ASC_REWIND_OP_CUSTOM_TYPE);
    assert.ok(opEntry, "expected an ASC rewind op entry");
    assert.equal(isAscRewindOpData(opEntry.data), true);
    assert.deepEqual(opEntry.data.bindings, [[compactionEntry.id, 0]]);
    assert.equal(opEntry.data.current, 0);
    assert.equal(await commitExists(gitHarness.git, opEntry.data.snapshots[0]), true);
  } finally {
    await gitHarness.cleanup();
  }
});

test("rewind runtime hooks built-in /fork without replacing it and persists resulting file state into the child session", async () => {
  const gitHarness = await createRewindGitHarness();

  try {
    await gitHarness.writeRepoFile("tracked.txt", "target state\n");
    const targetSnapshot = await ensureSnapshotForCurrentWorktree(gitHarness.git);
    await gitHarness.writeRepoFile("tracked.txt", "current state\n");

    const sessionManager = new SessionManagerStub({
      sessionFile: `${gitHarness.repoRoot}/parent-session.jsonl`,
      id: "session-parent",
      cwd: gitHarness.repoRoot,
    });
    const harness = createPiHarness(sessionManager);
    registerRewindRuntime(harness.pi);

    const userEntry = sessionManager.appendMessage("user", "Fork from here");
    sessionManager.appendCustomEntry(ASC_REWIND_TURN_CUSTOM_TYPE, {
      v: 1,
      snapshots: [targetSnapshot.snapshot.commitSha],
      bindings: [[userEntry.id, 0]],
    });

    await harness.handlers.get("session_start")(
      { type: "session_start", reason: "startup" },
      harness.ctx,
    );
    harness.enqueueSelection("Code only (restore files, keep conversation)");

    const result = await harness.handlers.get("session_before_fork")(
      { type: "session_before_fork", entryId: userEntry.id },
      harness.ctx,
    );

    assert.deepEqual(result, { skipConversationRestore: true });
    assert.equal(await gitHarness.readRepoFile("tracked.txt"), "target state\n");

    const previousSessionFile = sessionManager.getSessionFile();
    const childSessionManager = new SessionManagerStub({
      sessionFile: `${gitHarness.repoRoot}/child-session.jsonl`,
      id: "session-child",
      cwd: gitHarness.repoRoot,
      parentSession: previousSessionFile,
    });
    const childHarness = createPiHarness(childSessionManager);
    registerRewindRuntime(childHarness.pi);

    await childHarness.handlers.get("session_start")(
      {
        type: "session_start",
        reason: "fork",
        previousSessionFile,
      },
      childHarness.ctx,
    );

    const childOpEntry = childSessionManager
      .getEntries()
      .find((entry) => entry.type === "custom" && entry.customType === ASC_REWIND_OP_CUSTOM_TYPE);
    assert.ok(childOpEntry, "expected child session to receive resulting rewind state");
    assert.equal(isAscRewindOpData(childOpEntry.data), true);
    assert.equal(childOpEntry.data.current, 0);
    assert.equal(childOpEntry.data.snapshots[0], targetSnapshot.snapshot.commitSha);
    assert.equal(await commitExists(gitHarness.git, childOpEntry.data.snapshots[0]), true);
    if (typeof childOpEntry.data.undo === "number") {
      assert.equal(await commitExists(gitHarness.git, childOpEntry.data.snapshots[1]), true);
    }
  } finally {
    await gitHarness.cleanup();
  }
});

test("rewind runtime hooks built-in /tree and records summary aliases after restore", async () => {
  const gitHarness = await createRewindGitHarness();

  try {
    await gitHarness.writeRepoFile("tracked.txt", "target tree\n");
    const targetSnapshot = await ensureSnapshotForCurrentWorktree(gitHarness.git);
    await gitHarness.writeRepoFile("tracked.txt", "current tree\n");

    const sessionManager = new SessionManagerStub({
      sessionFile: `${gitHarness.repoRoot}/tree-session.jsonl`,
      id: "session-tree",
      cwd: gitHarness.repoRoot,
    });
    const harness = createPiHarness(sessionManager);
    registerRewindRuntime(harness.pi);

    const userEntry = sessionManager.appendMessage("user", "Tree target");
    sessionManager.appendCustomEntry(ASC_REWIND_TURN_CUSTOM_TYPE, {
      v: 1,
      snapshots: [targetSnapshot.snapshot.commitSha],
      bindings: [[userEntry.id, 0]],
    });

    await harness.handlers.get("session_start")(
      { type: "session_start", reason: "startup" },
      harness.ctx,
    );
    harness.enqueueSelection("Rewind files to that point");

    const beforeTreeResult = await harness.handlers.get("session_before_tree")(
      {
        type: "session_before_tree",
        preparation: {
          targetId: userEntry.id,
          oldLeafId: null,
          commonAncestorId: null,
          entriesToSummarize: [],
          userWantsSummary: false,
        },
        signal: new AbortController().signal,
      },
      harness.ctx,
    );

    assert.equal(beforeTreeResult, undefined);
    assert.equal(await gitHarness.readRepoFile("tracked.txt"), "target tree\n");

    await harness.handlers.get("session_tree")(
      {
        type: "session_tree",
        newLeafId: userEntry.id,
        oldLeafId: null,
        summaryEntry: { id: "summary-1" },
      },
      harness.ctx,
    );

    const opEntries = sessionManager
      .getEntries()
      .filter((entry) => entry.type === "custom" && entry.customType === ASC_REWIND_OP_CUSTOM_TYPE);
    const latestOp = opEntries.at(-1);
    assert.ok(latestOp, "expected a rewind op entry after tree navigation");
    assert.equal(isAscRewindOpData(latestOp.data), true);
    assert.deepEqual(latestOp.data.bindings, [["summary-1", 0]]);
    assert.equal(latestOp.data.current, 0);
    assert.equal(latestOp.data.snapshots[0], targetSnapshot.snapshot.commitSha);
    assert.equal(await commitExists(gitHarness.git, latestOp.data.snapshots[0]), true);
  } finally {
    await gitHarness.cleanup();
  }
});

test("rewind runtime shows tree rewind prompt and fails loudly when git is unavailable", async () => {
  const workspace = await mkdtemp(path.join(tmpdir(), "asc-rewind-non-git-"));

  try {
    const sessionManager = new SessionManagerStub({
      sessionFile: `${workspace}/non-git-session.jsonl`,
      id: "session-non-git",
      cwd: workspace,
    });
    const harness = createPiHarness(sessionManager);
    registerRewindRuntime(harness.pi);

    const userEntry = sessionManager.appendMessage("user", "Tree target outside git");

    await harness.handlers.get("session_start")(
      { type: "session_start", reason: "startup" },
      harness.ctx,
    );
    harness.enqueueSelection("Rewind files to that point");

    const beforeTreeResult = await harness.handlers.get("session_before_tree")(
      {
        type: "session_before_tree",
        preparation: {
          targetId: userEntry.id,
          oldLeafId: null,
          commonAncestorId: null,
          entriesToSummarize: [],
          userWantsSummary: false,
        },
        signal: new AbortController().signal,
      },
      harness.ctx,
    );

    assert.deepEqual(beforeTreeResult, { cancel: true });
    assert.deepEqual(harness.selectionPrompts.at(-1), {
      title: "Restore Options",
      options: ["Keep current files", "Rewind files to that point", "Cancel navigation"],
    });
    assert.ok(
      harness.notifications.some(
        (item) =>
          item.level === "error" &&
          item.message.includes("file rewind is unavailable") &&
          item.message.includes("git worktree"),
      ),
      "expected actionable git-unavailable notification",
    );
  } finally {
    await rm(workspace, { recursive: true, force: true });
  }
});

test("rewind runtime fails loudly when tree rewind is requested without an exact point", async () => {
  const gitHarness = await createRewindGitHarness();

  try {
    await gitHarness.writeRepoFile("tracked.txt", "current tree\n");

    const sessionManager = new SessionManagerStub({
      sessionFile: `${gitHarness.repoRoot}/tree-missing-rewind-session.jsonl`,
      id: "session-tree-missing-rewind",
      cwd: gitHarness.repoRoot,
    });
    const harness = createPiHarness(sessionManager);
    registerRewindRuntime(harness.pi);

    const userEntry = sessionManager.appendMessage("user", "Tree target without snapshot");

    await harness.handlers.get("session_start")(
      { type: "session_start", reason: "startup" },
      harness.ctx,
    );
    harness.enqueueSelection("Rewind files to that point");

    const beforeTreeResult = await harness.handlers.get("session_before_tree")(
      {
        type: "session_before_tree",
        preparation: {
          targetId: userEntry.id,
          oldLeafId: null,
          commonAncestorId: null,
          entriesToSummarize: [],
          userWantsSummary: false,
        },
        signal: new AbortController().signal,
      },
      harness.ctx,
    );

    assert.deepEqual(beforeTreeResult, { cancel: true });
    assert.deepEqual(harness.selectionPrompts.at(-1), {
      title: "Restore Options",
      options: ["Keep current files", "Rewind files to that point", "Cancel navigation"],
    });
    assert.ok(
      harness.notifications.some(
        (item) =>
          item.level === "error" &&
          item.message.includes("no exact rewind point") &&
          item.message.includes("Choose Keep current files"),
      ),
      "expected actionable missing rewind point notification",
    );
  } finally {
    await gitHarness.cleanup();
  }
});

test("rewind runtime projects bounded recovery milestones into Replay Fabric when configured", async () => {
  const gitHarness = await createRewindGitHarness();
  const replayFabric = await startRecordingReplayFabricServer();

  try {
    await withReplayFabricEnv(replayFabric.url, async () => {
      await gitHarness.writeRepoFile("tracked.txt", "target tree\n");
      await runGitChecked(gitHarness.repoRoot, ["add", "tracked.txt"]);
      await runGitChecked(gitHarness.repoRoot, ["commit", "-m", "target"]);
      const headCommit = await gitStdout(gitHarness.repoRoot, ["rev-parse", "HEAD"]);
      const targetSnapshot = await ensureSnapshotForCurrentWorktree(gitHarness.git);
      await gitHarness.writeRepoFile("tracked.txt", "current tree\n");

      const sessionManager = new SessionManagerStub({
        sessionFile: `${gitHarness.repoRoot}/projection-session.jsonl`,
        id: "session-projection",
        cwd: gitHarness.repoRoot,
      });
      const harness = createPiHarness(sessionManager);
      registerRewindRuntime(harness.pi);

      const userEntry = sessionManager.appendMessage("user", "Tree target");
      sessionManager.appendCustomEntry(ASC_REWIND_TURN_CUSTOM_TYPE, {
        v: 1,
        snapshots: [targetSnapshot.snapshot.commitSha],
        bindings: [[userEntry.id, 0]],
      });

      await harness.handlers.get("session_start")(
        { type: "session_start", reason: "startup" },
        harness.ctx,
      );
      harness.enqueueSelection("Rewind files to that point");

      await harness.handlers.get("session_before_tree")(
        {
          type: "session_before_tree",
          preparation: {
            targetId: userEntry.id,
            oldLeafId: null,
            commonAncestorId: null,
            entriesToSummarize: [],
            userWantsSummary: false,
          },
          signal: new AbortController().signal,
        },
        harness.ctx,
      );

      assert.equal(replayFabric.requests.length, 2);
      assert.deepEqual(
        replayFabric.requests.map((request) => request.eventKind),
        ["restore.started", "restore.completed"],
      );
      assert.deepEqual(
        replayFabric.requests.map((request) => request.source),
        ["asc-rewind-test", "asc-rewind-test"],
      );
      assert.deepEqual(
        replayFabric.requests.map((request) => request.restoreMode),
        ["tree-restore", "tree-restore"],
      );
      assert.ok(
        replayFabric.requests.every((request) => request.sessionId === "session-projection"),
      );
      assert.ok(replayFabric.requests.every((request) => request.repoPath === gitHarness.repoRoot));
      assert.ok(replayFabric.requests.every((request) => typeof request.artifactRef === "string"));

      for (const request of replayFabric.requests) {
        const artifactPath = path.join(gitHarness.repoRoot, request.artifactRef);
        const manifestText = await readFile(artifactPath, "utf8");
        const manifest = JSON.parse(manifestText);
        assert.equal(manifest.eventKind, request.eventKind);
        assert.equal(manifest.sessionId, "session-projection");
        assert.equal(manifest.restoreMode, "tree-restore");
        assert.deepEqual(request.metadata.artifactProvenance, {
          artifactRef: request.artifactRef,
          repoRelativePath: request.artifactRef,
          headCommit,
          contentSha256: createHash("sha256").update(manifestText).digest("hex"),
        });
      }
    });
  } finally {
    await replayFabric.close();
    await gitHarness.cleanup();
  }
});

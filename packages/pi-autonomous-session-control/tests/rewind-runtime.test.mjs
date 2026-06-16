import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { mkdtemp, readFile, rm } from "node:fs/promises";
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
import { createRewindGitHarness, gitStdout, runGitChecked } from "./rewind-harness.mjs";

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
    await harness.handlers.get("agent_end")(
      { type: "agent_end", messages: [assistantEntry.message] },
      harness.ctx,
    );

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
    await harness.handlers.get("agent_end")({ type: "agent_end", messages: [] }, harness.ctx);

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

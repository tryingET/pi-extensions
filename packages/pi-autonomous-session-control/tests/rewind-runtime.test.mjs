import assert from "node:assert/strict";
import { mkdirSync, writeFileSync } from "node:fs";
import { readFile } from "node:fs/promises";
import { createServer } from "node:http";
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
import { createRewindGitHarness } from "./rewind-harness.mjs";

class SessionManagerStub {
  constructor({ sessionFile, id, cwd, parentSession }) {
    this.sessionFile = sessionFile;
    this.header = {
      type: "session",
      version: 3,
      id,
      timestamp: new Date().toISOString(),
      cwd,
      parentSession,
    };
    this.entries = [];
    this.leafId = null;
    this.flush();
  }

  flush() {
    mkdirSync(path.dirname(this.sessionFile), { recursive: true });
    const lines = `${[this.header, ...this.entries].map((entry) => JSON.stringify(entry)).join("\n")}
`;
    writeFileSync(this.sessionFile, lines);
  }

  appendMessage(role, text) {
    const entry = {
      type: "message",
      id: `${role}-${this.entries.length + 1}`,
      parentId: this.leafId,
      timestamp: new Date().toISOString(),
      message: {
        role,
        content: [{ type: "text", text }],
      },
    };
    this.entries.push(entry);
    this.leafId = entry.id;
    this.flush();
    return entry;
  }

  appendCompaction(summary = "summary") {
    const entry = {
      type: "compaction",
      id: `compaction-${this.entries.length + 1}`,
      parentId: this.leafId,
      timestamp: new Date().toISOString(),
      summary,
      firstKeptEntryId: this.entries[0]?.id ?? null,
      tokensBefore: 10,
      fromHook: true,
    };
    this.entries.push(entry);
    this.leafId = entry.id;
    this.flush();
    return entry;
  }

  appendCustomEntry(customType, data) {
    const entry = {
      type: "custom",
      id: `${customType}-${this.entries.length + 1}`,
      parentId: this.leafId,
      timestamp: new Date().toISOString(),
      customType,
      data,
    };
    this.entries.push(entry);
    this.leafId = entry.id;
    this.flush();
    return entry;
  }

  getCwd() {
    return this.header.cwd;
  }

  getSessionId() {
    return this.header.id;
  }

  getSessionFile() {
    return this.sessionFile;
  }

  getHeader() {
    return { parentSession: this.header.parentSession };
  }

  getEntries() {
    return [...this.entries];
  }

  getBranch() {
    return [...this.entries];
  }

  getEntry(entryId) {
    return this.entries.find((entry) => entry.id === entryId);
  }

  getLeafId() {
    return this.leafId;
  }

  getLeafEntry() {
    return this.entries.find((entry) => entry.id === this.leafId);
  }
}

function createPiHarness(sessionManager, hasUI = true) {
  const handlers = new Map();
  const notifications = [];
  const selections = [];
  const statuses = [];

  const pi = {
    on(eventName, handler) {
      handlers.set(eventName, handler);
    },
    appendEntry(customType, data) {
      sessionManager.appendCustomEntry(customType, data);
    },
  };

  const ctx = {
    cwd: sessionManager.getCwd(),
    hasUI,
    sessionManager,
    isIdle: () => true,
    signal: undefined,
    abort() {},
    hasPendingMessages: () => false,
    shutdown() {},
    getContextUsage: () => undefined,
    compact() {},
    getSystemPrompt: () => "",
    ui: {
      notify(message, level = "info") {
        notifications.push({ message, level });
      },
      setStatus(key, text) {
        statuses.push({ key, text });
      },
      theme: {
        fg(_color, text) {
          return text;
        },
      },
      select: async () => selections.shift(),
      confirm: async () => false,
      input: async () => undefined,
      onTerminalInput: () => () => {},
      setWorkingMessage() {},
      setHiddenThinkingLabel() {},
      setWidget() {},
      setFooter() {},
      setHeader() {},
      setTitle() {},
      custom: async () => undefined,
      pasteToEditor() {},
      setEditorText() {},
      getEditorText: () => "",
      editor: async () => undefined,
      setEditorComponent() {},
      getAllThemes: () => [],
      getTheme: () => undefined,
      setTheme: () => ({ success: false }),
      getToolsExpanded: () => false,
      setToolsExpanded() {},
    },
  };

  return {
    ctx,
    handlers,
    notifications,
    pi,
    selections,
    statuses,
    enqueueSelection(choice) {
      selections.push(choice);
    },
  };
}

async function withReplayFabricEnv(baseUrl, fn) {
  const previousUrl = process.env.ASC_REWIND_REPLAY_FABRIC_URL;
  const previousSource = process.env.ASC_REWIND_REPLAY_FABRIC_SOURCE;
  process.env.ASC_REWIND_REPLAY_FABRIC_URL = baseUrl;
  process.env.ASC_REWIND_REPLAY_FABRIC_SOURCE = "asc-rewind-test";

  try {
    await fn();
  } finally {
    if (previousUrl === undefined) {
      delete process.env.ASC_REWIND_REPLAY_FABRIC_URL;
    } else {
      process.env.ASC_REWIND_REPLAY_FABRIC_URL = previousUrl;
    }

    if (previousSource === undefined) {
      delete process.env.ASC_REWIND_REPLAY_FABRIC_SOURCE;
    } else {
      process.env.ASC_REWIND_REPLAY_FABRIC_SOURCE = previousSource;
    }
  }
}

async function startRecordingReplayFabricServer() {
  const requests = [];
  const server = createServer(async (req, res) => {
    if (req.method !== "POST" || req.url !== "/api/milestones/recovery") {
      res.writeHead(404);
      res.end();
      return;
    }

    const chunks = [];
    for await (const chunk of req) {
      chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk));
    }
    requests.push(JSON.parse(Buffer.concat(chunks).toString("utf8")));
    res.writeHead(201, { "content-type": "application/json" });
    res.end(JSON.stringify({ ok: true }));
  });

  await new Promise((resolve) => {
    server.listen(0, "127.0.0.1", () => resolve());
  });

  const address = server.address();
  if (!address || typeof address === "string") {
    throw new Error("expected TCP listener");
  }

  return {
    requests,
    async close() {
      await new Promise((resolve, reject) => {
        server.close((error) => {
          if (error) reject(error);
          else resolve();
        });
      });
    },
    url: `http://127.0.0.1:${address.port}`,
  };
}

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
    harness.enqueueSelection("Restore files to that point");

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

test("rewind runtime projects bounded recovery milestones into Replay Fabric when configured", async () => {
  const gitHarness = await createRewindGitHarness();
  const replayFabric = await startRecordingReplayFabricServer();

  try {
    await withReplayFabricEnv(replayFabric.url, async () => {
      await gitHarness.writeRepoFile("tracked.txt", "target tree\n");
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
      harness.enqueueSelection("Restore files to that point");

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
      assert.ok(replayFabric.requests.every((request) => typeof request.artifactRef === "string"));

      for (const request of replayFabric.requests) {
        const artifactPath = path.join(gitHarness.repoRoot, request.artifactRef);
        const manifest = JSON.parse(await readFile(artifactPath, "utf8"));
        assert.equal(manifest.eventKind, request.eventKind);
        assert.equal(manifest.sessionId, "session-projection");
        assert.equal(manifest.restoreMode, "tree-restore");
      }
    });
  } finally {
    await replayFabric.close();
    await gitHarness.cleanup();
  }
});

// summary: Verifies focus-bound two-phase editor refinement and fail-closed transaction behavior.
// read_when:
//   - Changing the external Pi editor bridge or its safety protocol.

import assert from "node:assert/strict";
import { mkdir, mkdtemp, readFile, rm, stat, writeFile } from "node:fs/promises";
import { createConnection } from "node:net";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, it, test } from "node:test";
import {
  createEditorRefineBridge,
  isUniqueSessionPresence,
  niriSessionFocusProof,
  normalizeEditorText,
  sha256Text,
} from "../src/editor-refine-bridge.js";

const SESSION_ID = "019fe323-e3ee-72ba-93ca-ba88e19182cf";
const PUBLISHER_ID = "11111111-2222-4333-8444-555555555555";
const TRANSACTION_ID = "a".repeat(32);
const PROCESS_START_TIME = "12345";

async function openClient(path) {
  const socket = createConnection(path);
  socket.setEncoding("utf8");
  await new Promise((resolve, reject) => {
    socket.once("connect", resolve);
    socket.once("error", reject);
  });

  let buffer = "";
  const queued = [];
  const waiters = [];
  socket.on("data", (chunk) => {
    buffer += chunk;
    let newline = buffer.indexOf("\n");
    while (newline >= 0) {
      const value = JSON.parse(buffer.slice(0, newline));
      buffer = buffer.slice(newline + 1);
      const waiter = waiters.shift();
      if (waiter) waiter.resolve(value);
      else queued.push(value);
      newline = buffer.indexOf("\n");
    }
  });
  socket.on("error", (error) => {
    const waiter = waiters.shift();
    if (waiter) waiter.reject(error);
  });

  return {
    socket,
    send(payload) {
      socket.write(`${JSON.stringify(payload)}\n`);
    },
    next() {
      if (queued.length > 0) return Promise.resolve(queued.shift());
      return new Promise((resolve, reject) => waiters.push({ resolve, reject }));
    },
    close() {
      socket.destroy();
    },
  };
}

function targetFields() {
  return {
    session_id: SESSION_ID,
    publisher_id: PUBLISHER_ID,
    pid: process.pid,
    process_start_time: PROCESS_START_TIME,
  };
}

function snapshotRequest(mode = "light", transactionId = TRANSACTION_ID) {
  return {
    v: 1,
    type: "snapshot",
    transaction_id: transactionId,
    mode,
    ...targetFields(),
  };
}

function commitRequest(snapshot, replacement) {
  const normalized = normalizeEditorText(replacement);
  return {
    v: 1,
    type: "commit",
    ...targetFields(),
    transaction_id: snapshot.transaction_id,
    expected_editor_sha256: snapshot.editor_sha256,
    replacement: normalized,
    replacement_sha256: sha256Text(normalized),
  };
}

describe("niriSessionFocusProof", () => {
  it("requires exact Ghostty process, surface, focus, session suffix, and epoch", async () => {
    const token = SESSION_ID.replaceAll("-", "");
    const presence = {
      pid: process.pid,
      cwd: "/repo/project",
      ghosttyAncestorPid: 771,
      ghosttyFamily: "main",
      ghosttySurfaceIdNormalized: "42",
      terminalKey: "ghostty:main:42",
    };
    const execFile = async () => ({
      stdout: JSON.stringify({
        id: 91,
        pid: 771,
        app_id: "com.mitchellh.ghostty",
        is_focused: true,
        title: `π - project · gs:main:42 · ${token}`,
        focus_timestamp: { secs: 12, nanos: 34 },
      }),
    });
    assert.deepEqual(await niriSessionFocusProof(SESSION_ID, presence, { execFile }), {
      windowId: 91,
      focusEpoch: "12:34",
      terminalKey: "ghostty:main:42",
    });

    const wrongSurface = async () => ({
      stdout: JSON.stringify({
        id: 91,
        pid: 771,
        app_id: "com.mitchellh.ghostty",
        is_focused: true,
        title: `π - project · gs:main:99 · ${token}`,
        focus_timestamp: { secs: 12, nanos: 34 },
      }),
    });
    assert.equal(
      await niriSessionFocusProof(SESSION_ID, presence, { execFile: wrongSurface }),
      null,
    );
  });
});

test("isUniqueSessionPresence rejects duplicate logical-session publishers", async () => {
  const root = await mkdtemp(join(tmpdir(), "presence-"));
  const directory = join(root, "pi-session-presence");
  await mkdir(directory, { mode: 0o700 });
  const presence = {
    schemaVersion: 2,
    source: "@tryinget/pi-little-helpers/session-presence",
    sessionId: SESSION_ID,
    pid: process.pid,
    cwd: "/repo/project",
    ghosttyAncestorPid: 771,
    ghosttyFamily: "main",
    ghosttySurfaceIdNormalized: "42",
    terminalKey: "ghostty:main:42",
    terminalBound: true,
  };
  await writeFile(join(directory, `${process.pid}.json`), JSON.stringify(presence));
  assert.equal(await isUniqueSessionPresence(root, SESSION_ID, process.pid, "/repo/project"), true);

  const duplicate = { ...presence, pid: process.ppid };
  await writeFile(join(directory, `${process.ppid}.json`), JSON.stringify(duplicate));
  assert.equal(
    await isUniqueSessionPresence(root, SESSION_ID, process.pid, "/repo/project"),
    false,
  );
  await rm(root, { recursive: true, force: true });
});

describe("createEditorRefineBridge", () => {
  let root;
  let bridge;
  let editorText;
  let setCount;
  let focusProof;
  let focusGate;
  let focusGateEntered;
  let editorActive;
  let editorGeneration;
  let processIdentityCurrent;
  let idle;
  let pending;
  let clock;
  let notifications;
  let notificationThrows;
  let statuses;

  beforeEach(async () => {
    root = await mkdtemp(join(tmpdir(), "er-"));
    editorText = "this is the whole editor";
    setCount = 0;
    focusProof = {
      windowId: 91,
      focusEpoch: "12:34",
      terminalKey: "ghostty:main:42",
    };
    focusGate = undefined;
    focusGateEntered = undefined;
    editorActive = true;
    editorGeneration = 0;
    processIdentityCurrent = true;
    idle = true;
    pending = false;
    clock = 1_000;
    notifications = [];
    notificationThrows = false;
    statuses = [];
    bridge = createEditorRefineBridge({
      sessionId: SESSION_ID,
      publisherId: PUBLISHER_ID,
      runtimeDir: root,
      processStartTime: PROCESS_START_TIME,
      getEditorText: () => editorText,
      setEditorText: (text) => {
        setCount += 1;
        editorText = text;
        editorGeneration += 1;
      },
      getEditorGeneration: () => editorGeneration,
      isEditorActive: () => editorActive,
      isIdle: () => idle,
      hasPendingMessages: () => pending,
      getFocusProof: async () => {
        focusGateEntered?.();
        await focusGate;
        return focusProof;
      },
      isProcessIdentityCurrent: async () => processIdentityCurrent,
      now: () => clock,
      notify: (...args) => {
        if (notificationThrows) throw new Error("notification failed");
        notifications.push(args);
      },
      setStatus: (value) => statuses.push(value),
    });
    await bridge.start();
  });

  afterEach(async () => {
    await bridge?.stop();
    await rm(root, { recursive: true, force: true });
  });

  it("snapshots and commits exactly once with hash-only outcome recovery", async () => {
    const metadata = await stat(bridge.socketPath);
    assert.equal(metadata.mode & 0o777, 0o600);
    const descriptorMetadata = await stat(bridge.descriptorPath);
    assert.equal(descriptorMetadata.mode & 0o777, 0o600);
    const descriptor = JSON.parse(await readFile(bridge.descriptorPath, "utf8"));
    assert.equal(descriptor.type, "pi-editor-refine-endpoint");
    assert.equal(descriptor.session_id, SESSION_ID);
    assert.equal(descriptor.publisher_id, PUBLISHER_ID);
    assert.equal(descriptor.pid, process.pid);
    assert.equal(descriptor.process_start_time, PROCESS_START_TIME);
    assert.equal(descriptor.socket_path, bridge.socketPath);

    const client = await openClient(bridge.socketPath);
    client.send(snapshotRequest());
    const snapshot = await client.next();
    assert.equal(snapshot.ok, true);
    assert.equal(snapshot.text, editorText);
    assert.equal(snapshot.editor_sha256, sha256Text(editorText));
    assert.equal(snapshot.session_id, SESSION_ID);
    assert.equal(snapshot.publisher_id, PUBLISHER_ID);
    assert.equal(snapshot.editor_generation, 0);
    assert.equal(snapshot.focus_epoch, "12:34");

    client.send(commitRequest(snapshot, "This is the whole editor."));
    const committed = await client.next();
    assert.equal(committed.ok, true);
    assert.equal(committed.effect, "applied");
    assert.equal(editorText, "This is the whole editor.");
    assert.equal(setCount, 1);
    assert.equal(notifications.length, 1);
    assert.deepEqual(statuses, ["refining light…", undefined]);
    client.close();

    const statusClient = await openClient(bridge.socketPath);
    statusClient.send({
      v: 1,
      type: "status",
      transaction_id: TRANSACTION_ID,
      ...targetFields(),
    });
    const status = await statusClient.next();
    assert.equal(status.found, true);
    assert.equal(status.retry_safe, false);
    assert.equal(status.outcome.status, "committed");
    assert.equal(status.outcome.input_sha256, sha256Text("this is the whole editor"));
    assert.equal(status.outcome.output_sha256, sha256Text("This is the whole editor."));
    assert.equal(JSON.stringify(status).includes("whole editor"), false);
    statusClient.close();

    const replayClient = await openClient(bridge.socketPath);
    replayClient.send(snapshotRequest());
    const replay = await replayClient.next();
    assert.equal(replay.code, "transaction_replayed");
    assert.equal(setCount, 1);
    replayClient.close();
  });

  it("fails closed on queued frames after a protocol error", async () => {
    const client = await openClient(bridge.socketPath);
    const invalid = { ...snapshotRequest(), unexpected: true };
    const laterSnapshot = snapshotRequest("rewrite", "f".repeat(32));
    const fabricatedCommit = {
      ...targetFields(),
      v: 1,
      type: "commit",
      transaction_id: laterSnapshot.transaction_id,
      expected_editor_sha256: sha256Text(editorText),
      replacement: "must not be applied",
      replacement_sha256: sha256Text("must not be applied"),
    };
    const frames = [snapshotRequest(), invalid, laterSnapshot, fabricatedCommit]
      .map((frame) => JSON.stringify(frame))
      .join("\n");
    client.socket.write(`${frames}\n`);
    const result = await client.next();
    assert.equal(result.ok, false);
    assert.equal(result.code, "too_many_frames");
    await new Promise((resolve) => setTimeout(resolve, 20));
    assert.equal(editorText, "this is the whole editor");
    assert.equal(setCount, 0);
    client.close();
  });

  it("cancels an in-flight commit when a later frame terminates the connection", async () => {
    const client = await openClient(bridge.socketPath);
    client.send(snapshotRequest());
    const snapshot = await client.next();

    let releaseFocus;
    focusGate = new Promise((resolve) => {
      releaseFocus = resolve;
    });
    const focusEntered = new Promise((resolve) => {
      focusGateEntered = resolve;
    });
    client.send(commitRequest(snapshot, "must not be applied"));
    await focusEntered;

    client.send(snapshotRequest("rewrite", "f".repeat(32)));
    const result = await client.next();
    assert.equal(result.code, "too_many_frames");
    assert.equal(result.effect, "none");
    releaseFocus();
    await new Promise((resolve) => setTimeout(resolve, 20));
    assert.equal(editorText, "this is the whole editor");
    assert.equal(setCount, 0);
    client.close();
  });

  it("keeps an applied effect applied when notification delivery fails", async () => {
    const client = await openClient(bridge.socketPath);
    client.send(snapshotRequest());
    const snapshot = await client.next();
    notificationThrows = true;
    client.send(commitRequest(snapshot, "Applied despite notification failure"));
    const result = await client.next();
    assert.equal(result.ok, true);
    assert.equal(result.effect, "applied");
    assert.equal(editorText, "Applied despite notification failure");
    assert.equal(setCount, 1);
    client.close();
  });

  it("rejects an unchanged replacement so success always has one undo unit", async () => {
    const client = await openClient(bridge.socketPath);
    client.send(snapshotRequest());
    const snapshot = await client.next();
    client.send(commitRequest(snapshot, editorText));
    const result = await client.next();
    assert.equal(result.code, "replacement_unchanged");
    assert.equal(result.effect, "none");
    assert.equal(setCount, 0);
    client.close();
  });

  it("serializes repeated start and stop while removing exact endpoint files", async () => {
    const [firstPath, secondPath] = await Promise.all([bridge.start(), bridge.start()]);
    assert.equal(firstPath, secondPath);
    const descriptorPath = bridge.descriptorPath;
    const socketPath = bridge.socketPath;

    await Promise.all([bridge.stop(), bridge.stop()]);
    await assert.rejects(stat(descriptorPath), { code: "ENOENT" });
    await assert.rejects(stat(socketPath), { code: "ENOENT" });

    assert.equal(await bridge.start(), socketPath);
  });

  it("rejects editor drift before mutation", async () => {
    const client = await openClient(bridge.socketPath);
    client.send(snapshotRequest());
    const snapshot = await client.next();
    editorText = `${editorText} changed by operator`;

    client.send(commitRequest(snapshot, "Replacement"));
    const result = await client.next();
    assert.equal(result.ok, false);
    assert.equal(result.code, "editor_changed");
    assert.equal(result.effect, "none");
    assert.equal(setCount, 0);
    client.close();
  });

  it("rejects ABA edits through the monotonic editor generation", async () => {
    const client = await openClient(bridge.socketPath);
    client.send(snapshotRequest());
    const snapshot = await client.next();
    const original = editorText;
    editorText = "temporary edit";
    editorGeneration += 1;
    editorText = original;
    editorGeneration += 1;

    client.send(commitRequest(snapshot, "Replacement"));
    const result = await client.next();
    assert.equal(result.code, "editor_changed");
    assert.equal(setCount, 0);
    client.close();
  });

  it("rechecks focus and deadline before commit", async () => {
    const focusClient = await openClient(bridge.socketPath);
    focusClient.send(snapshotRequest());
    const focusSnapshot = await focusClient.next();
    focusProof = null;
    focusClient.send(commitRequest(focusSnapshot, "Replacement"));
    const focusResult = await focusClient.next();
    assert.equal(focusResult.code, "session_not_focused");
    assert.equal(setCount, 0);
    focusClient.close();

    focusProof = {
      windowId: 91,
      focusEpoch: "12:34",
      terminalKey: "ghostty:main:42",
    };
    const epochClient = await openClient(bridge.socketPath);
    epochClient.send(snapshotRequest("light", "d".repeat(32)));
    const epochSnapshot = await epochClient.next();
    focusProof = {
      windowId: 91,
      focusEpoch: "13:0",
      terminalKey: "ghostty:main:42",
    };
    epochClient.send(commitRequest(epochSnapshot, "Replacement"));
    const epochResult = await epochClient.next();
    assert.equal(epochResult.code, "focus_changed");
    assert.equal(setCount, 0);
    epochClient.close();

    focusProof = {
      windowId: 91,
      focusEpoch: "12:34",
      terminalKey: "ghostty:main:42",
    };
    const expiryClient = await openClient(bridge.socketPath);
    expiryClient.send(snapshotRequest("light", "b".repeat(32)));
    const expirySnapshot = await expiryClient.next();
    clock = expirySnapshot.deadline_ms + 1;
    expiryClient.send(commitRequest(expirySnapshot, "Replacement"));
    const expiryResult = await expiryClient.next();
    assert.equal(expiryResult.code, "snapshot_expired");
    assert.equal(setCount, 0);
    expiryClient.close();
  });

  it("rejects inactive editors and changed process identity", async () => {
    editorActive = false;
    const inactive = await openClient(bridge.socketPath);
    inactive.send(snapshotRequest());
    assert.equal((await inactive.next()).code, "editor_not_active");
    inactive.close();

    editorActive = true;
    processIdentityCurrent = false;
    const replaced = await openClient(bridge.socketPath);
    replaced.send(snapshotRequest("light", "e".repeat(32)));
    assert.equal((await replaced.next()).code, "process_identity");
    replaced.close();
  });

  it("rejects busy sessions and concurrent transactions", async () => {
    idle = false;
    const busyClient = await openClient(bridge.socketPath);
    busyClient.send(snapshotRequest());
    const busy = await busyClient.next();
    assert.equal(busy.code, "session_busy");
    busyClient.close();

    idle = true;
    const first = await openClient(bridge.socketPath);
    first.send(snapshotRequest());
    await first.next();
    const second = await openClient(bridge.socketPath);
    second.send(snapshotRequest("rewrite", "c".repeat(32)));
    const collision = await second.next();
    assert.equal(collision.code, "bridge_busy");
    second.close();
    first.close();
  });

  it("reports readback mismatch as effect-indeterminate and never retries", async () => {
    bridge = await (async () => {
      await bridge.stop();
      const replacementBridge = createEditorRefineBridge({
        sessionId: SESSION_ID,
        publisherId: PUBLISHER_ID,
        runtimeDir: root,
        processStartTime: PROCESS_START_TIME,
        getEditorText: () => editorText,
        setEditorText: () => {
          setCount += 1;
          editorText = "unexpected readback";
          editorGeneration += 1;
        },
        getEditorGeneration: () => editorGeneration,
        isEditorActive: () => true,
        isIdle: () => true,
        hasPendingMessages: () => false,
        getFocusProof: async () => ({
          windowId: 91,
          focusEpoch: "12:34",
          terminalKey: "ghostty:main:42",
        }),
        isProcessIdentityCurrent: async () => true,
        now: () => clock,
      });
      await replacementBridge.start();
      return replacementBridge;
    })();

    const client = await openClient(bridge.socketPath);
    client.send(snapshotRequest());
    const snapshot = await client.next();
    client.send(commitRequest(snapshot, "Expected replacement"));
    const result = await client.next();
    assert.equal(result.code, "readback_mismatch");
    assert.equal(result.effect, "indeterminate");
    assert.equal(setCount, 1);
    client.close();

    const statusClient = await openClient(bridge.socketPath);
    statusClient.send({
      v: 1,
      type: "status",
      transaction_id: TRANSACTION_ID,
      ...targetFields(),
    });
    const status = await statusClient.next();
    assert.equal(status.outcome.status, "effect_indeterminate");
    statusClient.close();
  });

  it("normalizes host editor line endings and tabs before hashing", () => {
    assert.equal(normalizeEditorText("a\r\nb\tc"), "a\nb    c");
  });
});

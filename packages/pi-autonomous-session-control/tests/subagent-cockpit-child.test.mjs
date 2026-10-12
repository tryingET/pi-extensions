import assert from "node:assert/strict";
import { unlinkSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import test from "node:test";
import { setTimeout as delay } from "node:timers/promises";
import { AgentSession, SessionManager } from "@earendil-works/pi-coding-agent";
import {
  closeCockpitChannel,
  mutateChannel,
  readChannel,
} from "../extensions/self/subagent-cockpit-channel.ts";
import childExtension from "../extensions/self/subagent-cockpit-child.ts";
import { GUIDANCE_CUSTOM_TYPE } from "../extensions/self/subagent-cockpit-trace.ts";
import { writeSessionStatus } from "../extensions/self/subagent-session.ts";
import { fixture, withChannelEnv } from "./subagent-cockpit-harness.mjs";

function nativeHarness(f, changes = {}) {
  writeFileSync(
    f.binding.sessionFile,
    `${JSON.stringify({
      type: "session",
      version: 3,
      id: "child-session",
      cwd: f.root,
      timestamp: new Date().toISOString(),
    })}\n`,
    { mode: 0o600 },
  );
  const manager = SessionManager.open(f.binding.sessionFile, undefined, f.root);
  const handlers = new Map();
  const pi = {
    on(name, handler) {
      handlers.set(name, handler);
    },
    sendUserMessage() {
      throw new Error("Must never use idle/user command delivery");
    },
    sendMessage() {
      throw new Error("Must use native boundary draft");
    },
  };
  withChannelEnv(f.dir, () => childExtension(pi));
  const ctx = { cwd: f.root, mode: "json", sessionManager: manager, ...changes };
  return {
    manager,
    ctx,
    handlers,
    emit(type, extras = {}) {
      return handlers.get(type)?.({ type, ...extras }, ctx);
    },
    boundary(type = "turn_end", extras = {}) {
      return handlers.get(type)(
        {
          type,
          entries: [],
          continue: false,
          outcome: "completed",
          context: { pendingMessages: [], canContinue: false },
          ...extras,
        },
        ctx,
      );
    },
    commit(result) {
      for (const draft of result?.entries ?? []) {
        if (draft.type === "custom_message")
          manager.appendCustomMessageEntry(
            draft.customType,
            draft.content,
            draft.display,
            draft.details,
          );
        else if (draft.type === "custom") manager.appendCustomEntry(draft.customType, draft.data);
      }
    },
  };
}

test("native turn draft is literal; receipt delivered only after SDK context commit", () => {
  const f = fixture();
  try {
    const h = nativeHarness(f);
    h.emit("session_start");
    assert.equal(f.snapshot().steeringSupported, true);
    // biome-ignore lint/suspicious/noTemplateCurlyInString: Guidance must preserve literal shell syntax.
    const literal = "/reload\n/skill:test ${shell} @file\u2028still literal";
    const request = f.send({ message: literal });
    assert.equal(request.ok, true);
    const existing = { type: "custom", customType: "another-extension", data: {} };
    const result = h.boundary("turn_end", { entries: [existing] });
    assert.equal(result.continue, true);
    assert.equal(result.entries[0], existing);
    assert.deepEqual(result.entries[1], {
      type: "custom_message",
      customType: GUIDANCE_CUSTOM_TYPE,
      content: literal,
      display: false,
      details: {
        requestId: request.requestId,
        dispatchId: f.binding.dispatchId,
        attemptId: f.binding.attemptId,
      },
    });
    assert.equal(readChannel(f.dir).requests[0].status, "queued");
    // A second boundary never republishes a staged draft.
    assert.equal(h.boundary(), undefined);
    h.commit(result);
    const projection = h.manager.buildSessionProjection();
    assert.equal(projection.messages.at(-1).content, literal);
    h.emit("turn_start");
    assert.equal(readChannel(f.dir).requests[0].status, "delivered");
    assert.match(readChannel(f.dir).requests[0].reason, /compliance is not implied/);
    h.emit("agent_settled", { aborted: false });
    assert.equal(f.send().ok, false);
    assert.equal(readChannel(f.dir).requests[0].status, "delivered");
    h.emit("session_start");
    assert.equal(readChannel(f.dir).phase, "closed");
  } finally {
    f.cleanup();
  }
});

test("final boundary enqueue race: before is continued, after fence is rejected, no resurrection", () => {
  const f = fixture();
  try {
    const h = nativeHarness(f);
    h.emit("session_start");
    f.send();
    const continuation = h.boundary("agent_before_settle");
    assert.equal(continuation.continue, true);
    assert.equal(readChannel(f.dir).phase, "open");
    h.commit(continuation);
    h.emit("turn_start");
    assert.equal(h.boundary("agent_before_settle"), undefined);
    assert.equal(readChannel(f.dir).phase, "closing");
    assert.equal(f.send().status, "rejected");
    h.emit("agent_settled", { aborted: false });
    assert.equal(readChannel(f.dir).phase, "closed");
    assert.equal(h.boundary(), undefined);
    h.emit("message_end", {
      message: { role: "assistant", content: [{ type: "text", text: "late" }] },
    });
    assert.equal(
      f.snapshot().events.some((event) => event.text === "late"),
      false,
    );
  } finally {
    f.cleanup();
  }
});

test("uncommitted draft is not reported delivered; external parent closure blocks later continuation", () => {
  const f = fixture();
  try {
    const h = nativeHarness(f);
    h.emit("session_start");
    f.send();
    assert.equal(h.boundary().continue, true);
    // Simulate another extension removing the proposal before SDK commits.
    h.emit("turn_start");
    assert.equal(readChannel(f.dir).requests[0].status, "queued");
    closeCockpitChannel(f.dir, "parent transport finalized");
    assert.equal(readChannel(f.dir).requests[0].status, "expired");
    assert.equal(h.boundary(), undefined);
    assert.equal(h.manager.getBranch().length, 0);
    assert.equal(f.send().ok, false);
  } finally {
    f.cleanup();
  }
});

for (const variation of [
  "stale-attempt",
  "wrong-repo",
  "wrong-session-file",
  "wrong-mode",
  "already-closed",
]) {
  test(`child fails closed: ${variation}`, () => {
    const f = fixture();
    try {
      const h = nativeHarness(
        f,
        variation === "wrong-repo"
          ? { cwd: f.binding.sessionsDir }
          : variation === "wrong-mode"
            ? { mode: "tui" }
            : {},
      );
      if (variation === "wrong-session-file")
        h.ctx.sessionManager = { getSessionFile: () => "/foreign", getBranch: () => [] };
      if (variation === "already-closed") closeCockpitChannel(f.dir, "closed before bootstrap");
      h.emit("session_start");
      if (
        ["wrong-repo", "wrong-session-file", "wrong-mode", "already-closed"].includes(variation)
      ) {
        assert.equal(f.send().ok, false);
      } else {
        assert.equal(f.send().ok, true);
        if (variation === "stale-attempt")
          writeSessionStatus(f.binding.sessionsDir, "child", { ...f.fields, attemptId: "next" });
        const result = h.boundary("turn_end", { outcome: "completed" });
        assert.equal(result, undefined);
        assert.equal(readChannel(f.dir).requests[0].status, "expired");
        assert.equal(readChannel(f.dir).phase, "closed");
      }
      assert.equal(h.boundary(), undefined);
    } finally {
      f.cleanup();
    }
  });
}

for (const recovery of ["retry", "overflow"]) {
  test(`error turn_end preserves control through actual SDK ${recovery} post-run recovery`, async () => {
    const f = fixture();
    try {
      const h = nativeHarness(f);
      h.emit("session_start");
      const request = f.send({ message: "literal guidance after recovery" });
      assert.equal(h.boundary("turn_end", { outcome: "error" }), undefined);
      assert.equal(readChannel(f.dir).phase, "open");
      assert.equal(readChannel(f.dir).requests[0].status, "queued");
      // Exercise installed Pi's post-run decision implementation (offline stubs
      // for the provider retry/compaction operations, not a live LLM proof).
      let recovered = false;
      const host = {
        _lastAssistantMessage: { stopReason: "error" },
        _lastAssistantToolResults: [],
        _agentRunAbortRequested: false,
        _retryAttempt: 0,
        _isRetryableError: () => recovery === "retry",
        _prepareRetry: async () => {
          recovered = true;
          return true;
        },
        _checkCompaction: async () => {
          recovered = true;
          return true;
        },
        agent: { hasQueuedMessages: () => false },
      };
      assert.equal(await AgentSession.prototype._handlePostAgentRun.call(host), true);
      assert.equal(recovered, true);
      h.emit("message_start", { message: { role: "assistant" } });
      h.emit("message_end", {
        message: { role: "assistant", content: [{ type: "text", text: "recovered" }] },
      });
      const result = h.boundary("turn_end", { outcome: "completed" });
      assert.equal(result.continue, true);
      assert.equal(result.entries[0].details.requestId, request.requestId);
      h.commit(result);
      h.emit("turn_start");
      assert.equal(readChannel(f.dir).requests[0].status, "delivered");
      assert.ok(f.snapshot().events.some((event) => event.text === "recovered"));
      h.emit("agent_settled", { aborted: false });
      assert.equal(f.send().ok, false);
    } finally {
      f.cleanup();
    }
  });
}

test("abort turn_end waits for authoritative settlement; exhausted error rejects without resurrecting", () => {
  const f = fixture();
  try {
    const h = nativeHarness(f);
    h.emit("session_start");
    f.send();
    assert.equal(h.boundary("turn_end", { outcome: "aborted" }), undefined);
    assert.equal(readChannel(f.dir).phase, "open");
    assert.equal(h.boundary("agent_before_settle", { outcome: "error" }), undefined);
    assert.equal(readChannel(f.dir).phase, "closing");
    assert.equal(readChannel(f.dir).requests[0].status, "rejected");
    assert.equal(f.send().ok, false);
    h.emit("agent_settled", { aborted: true });
    assert.equal(readChannel(f.dir).phase, "closed");
  } finally {
    f.cleanup();
  }
});

test("contended final boundary reacquires and considers an enqueue winner", async () => {
  const f = fixture();
  try {
    const h = nativeHarness(f);
    h.emit("session_start");
    const request = f.send();
    const lock = join(f.dir, "lock");
    writeFileSync(lock, "writer finishing accepted enqueue", { mode: 0o600 });
    const resultPromise = h.boundary("agent_before_settle");
    assert.equal(typeof resultPromise.then, "function");
    await delay(30);
    unlinkSync(lock);
    const result = await resultPromise;
    assert.equal(result.continue, true);
    assert.equal(result.entries[0].details.requestId, request.requestId);
    h.commit(result);
    h.emit("turn_start");
    assert.equal(readChannel(f.dir).requests[0].status, "delivered");
  } finally {
    f.cleanup();
  }
});

test("final lock timeout explicitly rejects accepted guidance, fences late writers, and never takes over lock", async () => {
  const f = fixture();
  try {
    const h = nativeHarness(f);
    h.emit("session_start");
    f.send();
    const lock = join(f.dir, "lock");
    writeFileSync(lock, "suspended writer", { mode: 0o600 });
    const start = performance.now();
    assert.equal(await h.boundary("agent_before_settle"), undefined);
    assert.ok(performance.now() - start < 1000);
    assert.equal(f.snapshot().receipts[0].status, "rejected");
    assert.match(f.snapshot().receipts[0].reason, /contention/);
    assert.equal(f.snapshot().steeringSupported, false);
    unlinkSync(lock);
    h.emit("agent_settled", { aborted: false });
    assert.equal(readChannel(f.dir).requests[0].status, "rejected");
    // A suspended writer resumes after the monotonic fence. Its control record
    // is retained, explicitly rejected, and cannot create a native continuation.
    mutateChannel(f.dir, (c) =>
      c.requests.push({ ...c.requests[0], requestId: "late-writer", status: "queued" }),
    );
    assert.equal(readChannel(f.dir).requests[1].status, "rejected");
    assert.equal(h.boundary(), undefined);
    assert.equal(f.send().ok, false);
    h.emit("agent_settled", { aborted: false });
    assert.equal(readChannel(f.dir).phase, "closed");
    assert.equal(readChannel(f.dir).requests[0].status, "rejected");
  } finally {
    f.cleanup();
  }
});

test("lost child credential closes control at telemetry boundary without resuming it", () => {
  const f = fixture();
  try {
    const h = nativeHarness(f);
    h.emit("session_start");
    f.send();
    mutateChannel(f.dir, (c) => {
      c.nonce = "replacement";
      for (const r of c.requests) r.nonce = c.nonce;
    });
    h.emit("message_start", { message: { role: "user", content: "late" } });
    assert.equal(readChannel(f.dir).phase, "closed");
    assert.equal(f.snapshot().steeringSupported, false);
    assert.equal(h.boundary(), undefined);
  } finally {
    f.cleanup();
  }
});

test("tool partial updates are throttled while final results always publish", () => {
  const f = fixture();
  try {
    const h = nativeHarness(f);
    h.emit("session_start");
    h.emit("tool_execution_start", { toolCallId: "fast", toolName: "bash", args: {} });
    for (let i = 0; i < 100; i++)
      h.emit("tool_execution_update", {
        toolCallId: "fast",
        toolName: "bash",
        args: {},
        partialResult: { index: i },
      });
    assert.match(f.snapshot().events.at(-1).detail, /"index":0/);
    h.emit("tool_execution_end", {
      toolCallId: "fast",
      toolName: "bash",
      result: { final: "complete" },
      isError: false,
    });
    assert.match(f.snapshot().events.at(-1).detail, /complete/);
  } finally {
    f.cleanup();
  }
});

test("queued request expires before a boundary; aborted settlement rejects undelivered guidance", () => {
  const f = fixture();
  try {
    const h = nativeHarness(f);
    h.emit("session_start");
    f.send();
    mutateChannel(f.dir, (c) => {
      c.requests[0].expiresAt = 0;
    });
    assert.equal(h.boundary(), undefined);
    assert.equal(readChannel(f.dir).requests[0].status, "expired");
    f.send();
    h.emit("agent_settled", { aborted: true });
    assert.equal(readChannel(f.dir).requests[1].status, "rejected");
    assert.equal(readChannel(f.dir).phase, "closed");
  } finally {
    f.cleanup();
  }
});

test("late SDK commit proof reconciles a closure/receipt race without reopening control", () => {
  const f = fixture();
  try {
    const h = nativeHarness(f);
    h.manager.appendMessage({ role: "user", content: "task", timestamp: Date.now() });
    h.manager.appendMessage({
      role: "assistant",
      content: [{ type: "text", text: "answer" }],
      timestamp: Date.now(),
      api: "test",
      model: "test",
      provider: "test",
      stopReason: "stop",
    });
    h.emit("session_start");
    f.send();
    const proposal = h.boundary();
    closeCockpitChannel(f.dir, "parent closed during SDK draft commit");
    assert.equal(readChannel(f.dir).requests[0].status, "expired");
    h.commit(proposal);
    assert.equal(f.snapshot().receipts[0].status, "delivered");
    assert.equal(readChannel(f.dir).phase, "closed");
    assert.equal(f.send().ok, false);
    assert.equal(h.boundary(), undefined);
  } finally {
    f.cleanup();
  }
});

test("a native pending continuation does not prematurely close the steering window", () => {
  const f = fixture();
  try {
    const h = nativeHarness(f);
    h.emit("session_start");
    h.boundary("agent_before_settle", { continue: true });
    assert.equal(readChannel(f.dir).phase, "open");
    assert.equal(f.send().ok, true);
  } finally {
    f.cleanup();
  }
});

test("native telemetry publishes partial assistant and complete tool details without thinking", () => {
  const f = fixture();
  try {
    const h = nativeHarness(f);
    h.emit("session_start");
    h.emit("message_start", { message: { role: "user", content: "objective" } });
    h.emit("message_start", { message: { role: "assistant" } });
    h.emit("message_update", {
      assistantMessageEvent: { type: "text_delta", delta: "partial" },
      message: {
        role: "assistant",
        content: [
          { type: "thinking", thinking: "private thought" },
          { type: "text", text: "partial" },
        ],
      },
    });
    assert.equal(f.snapshot().events.at(-1).kind, "assistant_stream");
    assert.equal(f.snapshot().events.at(-1).text, "partial");
    h.emit("message_end", {
      message: { role: "assistant", content: [{ type: "text", text: "final" }] },
    });
    h.emit("tool_execution_start", {
      toolCallId: "call-1",
      toolName: "bash",
      args: { command: "pwd" },
    });
    h.emit("tool_execution_update", {
      toolCallId: "call-1",
      toolName: "bash",
      args: {},
      partialResult: { content: "partial tool" },
    });
    h.emit("tool_execution_end", {
      toolCallId: "call-1",
      toolName: "bash",
      result: { content: [{ type: "text", text: "\x1b[31mresult" }] },
      isError: false,
    });
    const snapshot = f.snapshot();
    assert.equal(snapshot.events.filter((e) => e.id === "assistant-1").length, 1);
    assert.equal(snapshot.events.at(-1).kind, "tool_end");
    assert.match(snapshot.events.at(-1).detail, /pwd/);
    assert.match(snapshot.events.at(-1).detail, /result/);
    assert.equal(JSON.stringify(snapshot).includes("private thought"), false);
  } finally {
    f.cleanup();
  }
});

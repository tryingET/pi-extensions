/**
summary: "Tests activity snapshot initialization, tool detail summaries, terminal transitions, and extension event wiring."
read_when:
  - "Changing telemetry states, tool progress extraction, session settlement, or registered lifecycle hooks."
*/
import assert from "node:assert/strict";
import test from "node:test";
import activityStripExtension from "../extensions/activity-strip.js";
import { createSessionTelemetry } from "../src/client/session-telemetry.mjs";
import {
  createInitialSnapshot,
  describeToolCall,
  summarizeToolResult,
} from "../src/common/telemetry.mjs";

test("createInitialSnapshot seeds an idle session", () => {
  const snapshot = createInitialSnapshot({ cwd: "/tmp/demo", sessionName: "alpha" });
  assert.equal(snapshot.state, "idle");
  assert.equal(snapshot.repoLabel, "alpha");
  assert.equal(snapshot.processId, process.pid);
  assert.equal(snapshot.agentActive, false);
  assert.ok(snapshot.sessionId.length > 0);
});

test("session start adopts Pi's exact session identity for fail-closed window matching", async () => {
  const telemetry = createSessionTelemetry({ cwd: "/tmp/demo" });
  await telemetry.onSessionStart({
    cwd: "/tmp/demo",
    sessionManager: {
      getSessionId: () => "019fa4d0-7142-7fb4-8d30-f98e951f0513",
    },
  });
  assert.equal(telemetry.getSnapshot().sessionId, "019fa4d0-7142-7fb4-8d30-f98e951f0513");
  await telemetry.shutdown();
});

test("describeToolCall highlights bash and read details", () => {
  const bash = describeToolCall("bash", { command: "npm run verify && npm test" });
  assert.equal(bash.phase, "Running bash");
  assert.match(bash.detail, /npm run verify/);

  const read = describeToolCall("read", { path: "/tmp/example/file.txt" });
  assert.equal(read.phase, "Reading file");
  assert.match(read.detail, /file.txt/);
});

test("summarizeToolResult surfaces structured content and error details", () => {
  const ok = summarizeToolResult("bash", { stdout: "first\nsecond\nfinal line" }, false);
  assert.equal(ok.state, "thinking");
  assert.equal(ok.detail, "final line");

  const structured = summarizeToolResult(
    "read",
    { content: [{ type: "text", text: "line one\nstructured final line" }], details: {} },
    false,
  );
  assert.equal(structured.detail, "structured final line");
  assert.doesNotMatch(structured.detail, /\[object Object\]/);

  const error = summarizeToolResult(
    "edit",
    {
      content: [{ type: "text", text: "fallback error" }],
      details: { error: { message: "nested exact-match failure" } },
    },
    true,
  );
  assert.equal(error.state, "error");
  assert.match(error.detail, /nested exact-match failure/);
  assert.doesNotMatch(error.detail, /\[object Object\]/);
});

test("activity telemetry reaches terminal state only when the agent settles", async () => {
  const telemetry = createSessionTelemetry({ cwd: "/tmp/demo" });
  telemetry.onBeforeAgentStart({ prompt: "work" });
  assert.equal(telemetry.getSnapshot().agentActive, true);
  telemetry.onToolExecutionStart({ toolName: "read", args: { path: "README.md" } });
  telemetry.onToolExecutionUpdate({
    partialResult: { content: [{ type: "text", text: "structured progress" }] },
  });
  assert.equal(telemetry.getSnapshot().detail, "structured progress");

  telemetry.onAgentSettled();
  assert.equal(telemetry.getSnapshot().agentActive, false);
  assert.equal(telemetry.getSnapshot().phase, "Done");
  await telemetry.shutdown();
});

test("activity-strip wires terminal completion to agent_settled, not agent_end", () => {
  const handlers = new Map();
  activityStripExtension({
    on(name, handler) {
      handlers.set(name, handler);
    },
    registerCommand() {},
  });

  assert.equal(handlers.has("agent_settled"), true);
  assert.equal(handlers.has("agent_end"), false);
});

test("heartbeat republish keeps liveness without advancing lastEventAt", async () => {
  const published = [];
  const telemetry = createSessionTelemetry({
    cwd: "/tmp/demo",
    transport: {
      publish: async (session) => {
        published.push({ ...session });
      },
      remove: async () => {},
    },
  });
  await telemetry.onSessionStart({ cwd: "/tmp/demo" });
  const eventAt = telemetry.getSnapshot().lastEventAt;
  await new Promise((resolve) => setTimeout(resolve, 30));
  telemetry.onBeforeAgentStart({ prompt: "work" });
  const workingAt = telemetry.getSnapshot().lastEventAt;
  assert.ok(workingAt >= eventAt);

  // Simulate a wedged stream: no further events, only heartbeat flushes.
  const before = telemetry.getSnapshot().lastEventAt;
  await new Promise((resolve) => setTimeout(resolve, 20));
  await telemetry.shutdown();
  const after = telemetry.getSnapshot().lastEventAt;
  assert.equal(after, before);
  assert.ok(published.length > 0);
  const last = published[published.length - 1];
  assert.ok(last.updatedAt >= last.lastEventAt);
});

test("publisher delivery is serialized and shutdown removal follows in-flight publication", async () => {
  let releaseFirst;
  const firstGate = new Promise((resolve) => {
    releaseFirst = resolve;
  });
  const events = [];
  let concurrent = 0;
  let maxConcurrent = 0;
  let publishCount = 0;
  const telemetry = createSessionTelemetry({
    cwd: "/tmp/demo",
    transport: {
      publish: async (session) => {
        publishCount += 1;
        concurrent += 1;
        maxConcurrent = Math.max(maxConcurrent, concurrent);
        events.push(`publish:${session.publisherSequence}:start`);
        if (publishCount === 1) await firstGate;
        events.push(`publish:${session.publisherSequence}:finish`);
        concurrent -= 1;
      },
      remove: async () => events.push("remove"),
    },
  });

  const starting = telemetry.onSessionStart({ cwd: "/tmp/demo" });
  telemetry.onBeforeAgentStart({ prompt: "newer state" });
  await new Promise((resolve) => setTimeout(resolve, 150));
  assert.equal(maxConcurrent, 1);
  releaseFirst();
  await starting;
  await telemetry.shutdown();

  assert.equal(maxConcurrent, 1);
  assert.equal(events.at(-1), "remove");
  assert.ok(publishCount >= 2);
});

test("session start binds only an admitted interactive terminal surface", async () => {
  const telemetry = createSessionTelemetry({
    cwd: "/tmp/demo",
    env: { TERM_PROGRAM: "ghostty", GHOSTTY_SURFACE_ID: "17" },
    stdinIsTTY: true,
    resolveTerminalIdentity: () => ({
      terminalKind: "ghostty-surface",
      terminalKey: "ghostty:main:17",
      terminalFamily: "main",
      terminalSurfaceId: "17",
    }),
    transport: { publish: async () => {}, remove: async () => {} },
  });
  await telemetry.onSessionStart({ cwd: "/tmp/demo", hasUI: true });
  assert.equal(telemetry.getSnapshot().terminalKey, "ghostty:main:17");
  await telemetry.shutdown();
});

test("provider error on turn end surfaces as error, not silent done", async () => {
  const telemetry = createSessionTelemetry({
    cwd: "/tmp/demo",
    transport: { publish: async () => {}, remove: async () => {} },
  });
  await telemetry.onSessionStart({ cwd: "/tmp/demo" });
  telemetry.onBeforeAgentStart({ prompt: "deploy" });
  telemetry.onTurnEnd({ message: { stopReason: "error", errorMessage: "rate limited" } });
  assert.equal(telemetry.getSnapshot().state, "error");
  assert.equal(telemetry.getSnapshot().errorMessage, "rate limited");
  telemetry.onAgentSettled();
  assert.equal(telemetry.getSnapshot().state, "error");
  assert.equal(telemetry.getSnapshot().phase, "Stopped");
  await telemetry.shutdown();
});

test("aborted runs settle as stopped rather than done", async () => {
  const telemetry = createSessionTelemetry({
    cwd: "/tmp/demo",
    transport: { publish: async () => {}, remove: async () => {} },
  });
  await telemetry.onSessionStart({ cwd: "/tmp/demo" });
  telemetry.onBeforeAgentStart({ prompt: "deploy" });
  telemetry.onTurnEnd({ message: { stopReason: "aborted" } });
  telemetry.onAgentSettled();
  assert.equal(telemetry.getSnapshot().state, "success");
  assert.equal(telemetry.getSnapshot().phase, "Stopped");
  await telemetry.shutdown();
});

test("lost state transitions are retried with a bounded backoff", async () => {
  let failures = 2;
  const published = [];
  let removeCalls = 0;
  const telemetry = createSessionTelemetry({
    cwd: "/tmp/demo",
    transport: {
      publish: async (session) => {
        if (failures > 0) {
          failures -= 1;
          throw new Error("broker unavailable");
        }
        published.push({ ...session });
      },
      remove: async () => {
        removeCalls += 1;
      },
    },
  });
  await telemetry.onSessionStart({ cwd: "/tmp/demo" });
  telemetry.onBeforeAgentStart({ prompt: "work" });
  await new Promise((resolve) => setTimeout(resolve, 1200));
  assert.ok(published.length > 0);
  assert.equal(published[0].state, "thinking");
  await telemetry.shutdown();
  assert.equal(removeCalls, 1);
});

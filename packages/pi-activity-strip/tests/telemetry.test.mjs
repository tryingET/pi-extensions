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

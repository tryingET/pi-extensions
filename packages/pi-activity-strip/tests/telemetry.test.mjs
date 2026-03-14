import assert from "node:assert/strict";
import test from "node:test";
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

test("summarizeToolResult surfaces bash output and errors", () => {
  const ok = summarizeToolResult("bash", { stdout: "first\nsecond\nfinal line" }, false);
  assert.equal(ok.state, "thinking");
  assert.equal(ok.detail, "final line");

  const error = summarizeToolResult("edit", { message: "no exact match" }, true);
  assert.equal(error.state, "error");
  assert.match(error.detail, /no exact match/);
});

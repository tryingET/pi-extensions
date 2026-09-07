// ---
// summary: "verifies Claude Code transcript state derivation and hook event mapping"
// read_when:
//   - "changing Claude Code telemetry, its state machine, or hook event handling"
// ---

import assert from "node:assert/strict";
import test from "node:test";
import {
  CLAUDE_EVENT_MAX_AGE_MS,
  CLAUDE_EVENT_SCHEMA,
  claudeEventPath,
  claudeEventRecord,
  isSessionEndEvent,
  mergeClaudeEvent,
} from "../src/common/claude-events.mjs";
import { parseClaudeTranscriptTail } from "../src/common/claude-transcript.mjs";

const sessionId = "9e3dc376-ca33-4ad3-af0b-4415926927fe";
const line = (value) => JSON.stringify(value);
const assistant = (blocks, at, stop = "tool_use") =>
  line({
    type: "assistant",
    sessionId,
    cwd: "/home/x/repo",
    gitBranch: "main",
    timestamp: at,
    message: { content: blocks, stop_reason: stop },
  });

test("transcript state comes from the newest timestamped record", () => {
  const base = [
    line({ type: "ai-title", aiTitle: "a topic", sessionId }),
    line({ type: "last-prompt", lastPrompt: "please do the thing", sessionId }),
    line({ type: "mode", mode: "normal", sessionId }),
  ];

  const running = parseClaudeTranscriptTail(
    [
      ...base,
      assistant([{ type: "text", text: "working on it" }], "2026-09-06T22:00:00.000Z"),
      assistant(
        [
          {
            type: "tool_use",
            name: "Bash",
            input: { description: "run the suite", command: "npm test" },
          },
        ],
        "2026-09-06T22:00:05.000Z",
      ),
      line({ type: "mode", mode: "normal", sessionId }),
    ].join("\n"),
  );
  assert.equal(running.state, "tool");
  assert.equal(running.toolName, "Bash");
  assert.equal(running.toolTarget, "run the suite");
  assert.equal(running.title, "a topic");
  assert.equal(running.lastPrompt, "please do the thing");
  assert.equal(running.assistantPreview, "working on it");
  assert.equal(running.cwd, "/home/x/repo");
  assert.equal(running.gitBranch, "main");
  assert.equal(running.lastEventAt, Date.parse("2026-09-06T22:00:05.000Z"));

  const finished = parseClaudeTranscriptTail(
    [
      ...base,
      assistant([{ type: "tool_use", name: "Bash", input: {} }], "2026-09-06T22:00:05.000Z"),
      line({
        type: "system",
        subtype: "turn_duration",
        sessionId,
        messageCount: 42,
        timestamp: "2026-09-06T22:00:09.000Z",
      }),
    ].join("\n"),
  );
  assert.equal(finished.state, "idle", "a completed turn is not activity");
  assert.equal(finished.turnIndex, 42);

  const resumed = parseClaudeTranscriptTail(
    [
      assistant(
        [{ type: "tool_use", name: "Read", input: { file_path: "/a/b.ts" } }],
        "2026-09-06T22:00:05.000Z",
      ),
      line({ type: "user", sessionId, timestamp: "2026-09-06T22:00:06.000Z", toolUseResult: {} }),
    ].join("\n"),
  );
  assert.equal(resumed.state, "thinking", "a returned tool result means the model resumed");

  const ended = parseClaudeTranscriptTail(
    assistant([{ type: "text", text: "all done" }], "2026-09-06T22:00:07.000Z", "end_turn"),
  );
  assert.equal(ended.state, "idle");
});

test("transcript parsing survives fragments, attachments, and empty input", () => {
  const fragment = `"cut":"line"}\n${assistant([{ type: "text", text: "hi" }], "2026-09-06T22:00:00.000Z")}`;
  assert.equal(parseClaudeTranscriptTail(fragment).assistantPreview, "hi");
  assert.equal(parseClaudeTranscriptTail("").state, "idle");
  assert.equal(parseClaudeTranscriptTail("").lastEventAt, 0);
  assert.equal(parseClaudeTranscriptTail("not json at all").lastEventAt, 0);

  const withAttachment = [
    assistant(
      [{ type: "tool_use", name: "Bash", input: { command: "ls" } }],
      "2026-09-06T22:00:05.000Z",
    ),
    line({ type: "attachment", sessionId, timestamp: "2026-09-06T22:00:06.000Z", attachment: {} }),
  ].join("\n");
  assert.equal(
    parseClaudeTranscriptTail(withAttachment).state,
    "tool",
    "an attachment is context, not activity",
  );
});

test("hook payloads map to ribbon state and refuse records without an identity", () => {
  const at = 1_788_800_000_000;
  const options = { now: at, env: {} };
  const tool = claudeEventRecord(
    {
      hook_event_name: "PreToolUse",
      session_id: sessionId,
      cwd: "/home/x/repo",
      tool_name: "Bash",
      tool_input: { description: "run the suite" },
    },
    options,
  );
  assert.equal(tool.schema, CLAUDE_EVENT_SCHEMA);
  assert.equal(tool.state, "tool");
  assert.equal(tool.toolName, "Bash");
  assert.equal(tool.toolTarget, "run the suite");
  assert.equal(tool.at, at);

  const approval = claudeEventRecord(
    {
      hook_event_name: "Notification",
      session_id: sessionId,
      notification_type: "permission_prompt",
    },
    options,
  );
  assert.equal(approval.state, "waiting");
  assert.equal(approval.detail, "waiting for approval");
  assert.equal(
    claudeEventRecord(
      { hook_event_name: "Notification", session_id: sessionId, notification_type: "idle_prompt" },
      options,
    ).detail,
    "waiting for input",
  );
  assert.equal(
    claudeEventRecord(
      { hook_event_name: "PostToolUseFailure", session_id: sessionId, tool_name: "Bash" },
      options,
    ).state,
    "error",
  );
  assert.equal(
    claudeEventRecord({ hook_event_name: "Stop", session_id: sessionId }, options).state,
    "idle",
  );
  assert.equal(
    claudeEventRecord(
      { hook_event_name: "PostToolUse", session_id: sessionId, tool_name: "Bash" },
      options,
    ).state,
    "thinking",
  );
  assert.equal(isSessionEndEvent({ event: "SessionEnd" }), true);
  assert.equal(isSessionEndEvent({ event: "Stop" }), false);

  assert.equal(claudeEventRecord({ hook_event_name: "Stop", session_id: "nope" }, options), null);
  assert.equal(claudeEventRecord({ session_id: sessionId }, options), null);
  assert.equal(claudeEventRecord({}, options), null);
});

test("event file paths admit only exact session ids", () => {
  assert.equal(claudeEventPath(sessionId, "/state").endsWith(`${sessionId}.json`), true);
  assert.equal(
    claudeEventPath(sessionId.toUpperCase(), "/state").endsWith(`${sessionId}.json`),
    true,
  );
  assert.equal(claudeEventPath("../escape", "/state"), "");
  assert.equal(claudeEventPath("", "/state"), "");
});

test("a newer hook event overrides the transcript, and a stale or older one never does", () => {
  const now = 1_788_800_000_000;
  const telemetry = parseClaudeTranscriptTail(
    assistant([{ type: "text", text: "thinking about it" }], new Date(now - 10_000).toISOString()),
  );
  assert.equal(telemetry.state, "thinking");

  const waiting = {
    schema: CLAUDE_EVENT_SCHEMA,
    state: "waiting",
    toolName: "",
    toolTarget: "",
    detail: "waiting for approval",
    at: now - 1000,
  };
  const merged = mergeClaudeEvent(telemetry, waiting, now);
  assert.equal(merged.state, "waiting");
  assert.equal(merged.assistantPreview, "waiting for approval");
  assert.equal(merged.lastEventAt, now - 1000);

  assert.equal(
    mergeClaudeEvent(telemetry, { ...waiting, at: now - 60_000 }, now).state,
    "thinking",
    "an event older than the transcript never wins",
  );
  assert.equal(
    mergeClaudeEvent(telemetry, { ...waiting, at: now - CLAUDE_EVENT_MAX_AGE_MS - 1 }, now).state,
    "thinking",
    "an expired event is ignored",
  );
  assert.equal(mergeClaudeEvent(telemetry, null, now).state, "thinking");
  assert.equal(mergeClaudeEvent(telemetry, { ...waiting, schema: "other" }, now).state, "thinking");
});

test("the hook settings fragment covers only low-frequency events and merges without duplicating", async () => {
  const { CLAUDE_HOOK_EVENTS, claudeHookSettings, mergeClaudeHookSettings } = await import(
    "../src/common/claude-hook-config.mjs"
  );
  const command = "/usr/bin/node /pkg/bin/hook.mjs";
  const fragment = claudeHookSettings(command);
  assert.deepEqual(Object.keys(fragment.hooks).sort(), [...CLAUDE_HOOK_EVENTS].sort());
  assert.equal(
    CLAUDE_HOOK_EVENTS.includes("PreToolUse"),
    false,
    "nothing may run per tool call; the transcript already reports tool state",
  );
  assert.deepEqual(fragment.hooks.Stop, [{ matcher: "", hooks: [{ type: "command", command }] }]);
  assert.throws(() => claudeHookSettings("  "), /hook command is required/);

  const existing = {
    theme: "auto",
    hooks: {
      Stop: [{ matcher: "", hooks: [{ type: "command", command: "/other/tool" }] }],
    },
  };
  const merged = mergeClaudeHookSettings(existing, command);
  assert.equal(merged.theme, "auto", "unrelated settings are preserved");
  assert.equal(merged.hooks.Stop.length, 2, "an unrelated hook on the same event is kept");
  assert.equal(merged.hooks.Stop[0].hooks[0].command, "/other/tool");
  assert.equal(merged.hooks.SessionStart.length, 1);

  const twice = mergeClaudeHookSettings(merged, command);
  assert.equal(twice.hooks.Stop.length, 2, "merging again never duplicates our entry");
  assert.equal(twice.hooks.SessionStart.length, 1);
});

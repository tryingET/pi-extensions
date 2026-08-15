/**
 * Tests for the telemetry collector: event mapping, payload-free boundaries,
 * follow-up/subagent extraction, and double-completion guards.
 */

import assert from "node:assert/strict";
import test from "node:test";
import { createTelemetryCollector } from "../src/collector.ts";

function makeStepClock(start, step) {
  let t = start;
  return () => {
    t += step;
    return t;
  };
}

function harness() {
  const recorded = [];
  const collector = createTelemetryCollector({
    dir: "/tmp/unused",
    now: makeStepClock(1_000, 10),
    append: async (_dir, event) => {
      recorded.push(event);
    },
  });
  return { collector, recorded };
}

test("collector: tool call round trip records name, ok, duration, and error signature", () => {
  const { collector, recorded } = harness();
  collector.handle({
    type: "tool_call",
    toolName: "bash",
    toolCallId: "t1",
    input: { command: "npm run check" },
  });
  collector.handle({
    type: "tool_execution_end",
    toolName: "bash",
    toolCallId: "t1",
    isError: true,
    result: { content: [{ type: "text", text: "Error: ENOENT file 42 missing" }] },
  });

  const tool = recorded.find((event) => event.kind === "tool_call");
  assert.ok(tool);
  assert.equal(tool.tool, "bash");
  assert.equal(tool.ok, false);
  assert.ok(tool.durationMs >= 0);
  assert.equal(tool.errorSignature, "Error: ENOENT file N missing");
});

test("collector: duplicate completion events record exactly once", () => {
  const { collector, recorded } = harness();
  collector.handle({
    type: "tool_call",
    toolName: "bash",
    toolCallId: "t1",
    input: { command: "ls" },
  });
  collector.handle({
    type: "tool_result",
    toolName: "bash",
    toolCallId: "t1",
    isError: false,
    content: [],
  });
  collector.handle({
    type: "tool_execution_end",
    toolName: "bash",
    toolCallId: "t1",
    isError: false,
    result: {},
  });

  assert.equal(recorded.filter((event) => event.kind === "tool_call").length, 1);
});

test("collector: SKILL.md reads become skill loads without tool_call duplication of payload", () => {
  const { collector, recorded } = harness();
  collector.handle({
    type: "tool_call",
    toolName: "read",
    toolCallId: "t2",
    input: { path: "/home/x/.pi/agent/skills/pi-session-jsonl/SKILL.md" },
  });
  collector.handle({
    type: "tool_execution_end",
    toolName: "read",
    toolCallId: "t2",
    isError: false,
    result: {},
  });

  const skill = recorded.find((event) => event.kind === "skill_load");
  assert.ok(skill);
  assert.equal(skill.skill, "pi-session-jsonl");
  const tool = recorded.find((event) => event.kind === "tool_call");
  assert.ok(tool);
  assert.equal(tool.tool, "read");
  // No payload text may leak into telemetry records.
  assert.ok(!JSON.stringify(recorded).includes("SKILL.md"));
});

test("collector: vault tools are classified as vault_query", () => {
  const { collector, recorded } = harness();
  collector.handle({
    type: "tool_call",
    toolName: "vault_query",
    toolCallId: "t3",
    input: { intent_text: "x" },
  });
  collector.handle({
    type: "tool_execution_end",
    toolName: "vault_query",
    toolCallId: "t3",
    isError: false,
    result: {},
  });

  assert.ok(recorded.find((event) => event.kind === "vault_query"));
  assert.ok(!recorded.find((event) => event.kind === "tool_call"));
});

test("collector: self tool results surface follow-up outcomes", () => {
  const { collector, recorded } = harness();
  collector.handle({
    type: "tool_call",
    toolName: "self",
    toolCallId: "t4",
    input: { query: "continue safely" },
  });
  collector.handle({
    type: "tool_execution_end",
    toolName: "self",
    toolCallId: "t4",
    isError: false,
    result: {
      details: {
        data: {
          userMessageSent: false,
          userMessageBlockedReason: "self_driving_budget_exhausted",
          dispatchMode: "agent_continuation",
        },
      },
    },
  });

  const followUp = recorded.find((event) => event.kind === "follow_up");
  assert.ok(followUp);
  assert.equal(followUp.sent, false);
  assert.equal(followUp.blockedReason, "self_driving_budget_exhausted");
});

test("collector: dispatch_subagent records profile and outcome", () => {
  const { collector, recorded } = harness();
  collector.handle({
    type: "tool_call",
    toolName: "dispatch_subagent",
    toolCallId: "t5",
    input: { profile: "reviewer", objective: "review things" },
  });
  collector.handle({
    type: "tool_execution_end",
    toolName: "dispatch_subagent",
    toolCallId: "t5",
    isError: false,
    result: {},
  });

  const subagent = recorded.find((event) => event.kind === "subagent");
  assert.ok(subagent);
  assert.equal(subagent.profile, "reviewer");
  assert.equal(subagent.ok, true);
  // Objectives are payloads and must never be recorded.
  assert.ok(!JSON.stringify(recorded).includes("review things"));
});

test("collector: compaction lifecycle records begin and end", () => {
  const { collector, recorded } = harness();
  collector.handle({ type: "session_before_compact", reason: "threshold", willRetry: false });
  collector.handle({
    type: "session_compact",
    reason: "threshold",
    willRetry: false,
    fromExtension: true,
    compactionEntry: { tokensBefore: 292055, summary: "x".repeat(7666) },
  });

  const begin = recorded.find((event) => event.kind === "compaction_begin");
  const end = recorded.find((event) => event.kind === "compaction");
  assert.ok(begin);
  assert.ok(end);
  assert.equal(end.fromExtension, true);
  assert.equal(end.tokensBefore, 292055);
  assert.equal(end.summaryChars, 7666);
});

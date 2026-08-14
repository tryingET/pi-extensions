/**
summary: "Tests owner-scoped model generation for clean, self-contained fresh-session handoffs."
read_when:
  - "Changing handoff generation, compacted-branch selection, or generated prompt validation."
*/
import assert from "node:assert/strict";
import { describe, it } from "node:test";

import {
  generateSessionCompactionHandoffPrompt,
  getSessionHandoffMessages,
} from "../extensions/session-compaction/handoff-generation.js";

const REQUIRED_PREFIX = "You are a fresh, stateless Pi coding session.";

function message(id, role, content, timestamp = 1) {
  return { id, type: "message", message: { role, content, timestamp } };
}

function createContext({ branch, responseText = `${REQUIRED_PREFIX}\n\nDo the work.` } = {}) {
  const calls = [];
  const signal = new AbortController().signal;
  return {
    calls,
    ctx: {
      cwd: "/repo/example",
      model: { provider: "openai", id: "gpt-4o", api: "openai-responses", reasoning: true },
      signal,
      sessionManager: {
        getBranch() {
          return branch ?? [message("u1", "user", "Implement the next verified slice.")];
        },
      },
      modelRegistry: {
        async complete(model, input, options) {
          calls.push({ model, input, options });
          return { content: [{ type: "text", text: responseText }] };
        },
      },
    },
  };
}

describe("session handoff message selection", () => {
  it("uses all message entries when the branch has not been compacted", () => {
    const branch = [
      message("u1", "user", "first"),
      { id: "meta", type: "custom", value: "ignored" },
      message("a1", "assistant", "second", 2),
    ];

    assert.deepEqual(getSessionHandoffMessages(branch), [branch[0].message, branch[2].message]);
  });

  it("uses the latest compaction summary, its kept messages, and later messages", () => {
    const branch = [
      message("old", "user", "discarded"),
      message("keep", "assistant", "kept", 2),
      {
        id: "compact-1",
        type: "compaction",
        summary: "older summary",
        firstKeptEntryId: "old",
        tokensBefore: 10,
        timestamp: "2026-08-04T00:00:00.000Z",
      },
      message("after-1", "user", "discarded by newer compaction", 3),
      message("keep-2", "assistant", "kept by newer compaction", 4),
      {
        id: "compact-2",
        type: "compaction",
        summary: "latest summary",
        firstKeptEntryId: "keep-2",
        tokensBefore: 20,
        timestamp: "2026-08-04T01:00:00.000Z",
      },
      message("after-2", "user", "latest request", 5),
    ];

    const selected = getSessionHandoffMessages(branch);
    assert.equal(selected.length, 3);
    assert.equal(selected[0].role, "compactionSummary");
    assert.equal(selected[0].summary, "latest summary");
    assert.equal(selected[1].content, "kept by newer compaction");
    assert.equal(selected[2].content, "latest request");
  });
});

describe("session handoff prompt generation", () => {
  it("uses the active host model registry with low reasoning and live branch context", async () => {
    const { ctx, calls } = createContext();
    const prompt = await generateSessionCompactionHandoffPrompt({
      ctx,
      goal: " Implement task 4660 from verified state. ",
      runtimeContext: "Git HEAD: abc123\nAK ready tasks: task 4660",
    });

    assert.equal(prompt, `${REQUIRED_PREFIX}\n\nDo the work.`);
    assert.equal(calls.length, 1);
    assert.deepEqual(calls[0].model, ctx.model);
    assert.equal(calls[0].options.reasoningEffort, "low");
    assert.equal("reasoning" in calls[0].options, false);
    assert.equal(calls[0].options.signal, ctx.signal);
    assert.match(calls[0].input.systemPrompt, /pi-session-compaction handoff generator/);
    const request = calls[0].input.messages[0].content[0].text;
    assert.match(request, /Working directory: \/repo\/example/);
    assert.match(request, /Operator goal for the fresh session: Implement task 4660/);
    assert.match(request, /Git HEAD: abc123/);
    assert.match(request, /AK ready tasks: task 4660/);
    assert.match(request, /Implement the next verified slice/);
  });

  it("fails closed before model invocation when required host context is missing", async () => {
    await assert.rejects(
      generateSessionCompactionHandoffPrompt({ ctx: {}, goal: "continue" }),
      /no active Pi model/,
    );
    await assert.rejects(
      generateSessionCompactionHandoffPrompt({
        ctx: { model: {} },
        goal: "continue",
      }),
      /modelRegistry\.complete is unavailable/,
    );
    await assert.rejects(
      generateSessionCompactionHandoffPrompt({
        ctx: {
          model: {},
          modelRegistry: { complete: async () => ({ content: [] }) },
          sessionManager: { getBranch: () => [] },
        },
        goal: "continue",
      }),
      /no conversation to hand off/,
    );
  });

  it("requires a non-empty goal", async () => {
    const { ctx, calls } = createContext();
    await assert.rejects(generateSessionCompactionHandoffPrompt({ ctx, goal: "  " }), /goal/);
    assert.equal(calls.length, 0);
  });

  it("rejects output without the exact fresh-session prefix", async () => {
    const { ctx } = createContext({ responseText: "Here is your handoff." });
    await assert.rejects(
      generateSessionCompactionHandoffPrompt({ ctx, goal: "continue" }),
      /prefix contract/,
    );
  });

  it("rejects generated prompts beyond the launch boundary", async () => {
    const { ctx } = createContext({
      responseText: `${REQUIRED_PREFIX}${"x".repeat(96 * 1024)}`,
    });
    await assert.rejects(
      generateSessionCompactionHandoffPrompt({ ctx, goal: "continue" }),
      /96 KiB/,
    );
  });
});

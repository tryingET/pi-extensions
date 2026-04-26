import assert from "node:assert/strict";
import test from "node:test";
import {
  buildAssistantMessageProvenance,
  extractLatestAssistantMessageProvenance,
  findLatestAssistantMessageEntry,
  formatAssistantMessageProvenanceSummary,
} from "../src/provenance-core.js";

function assistantEntry(overrides = {}) {
  return {
    type: "message",
    id: "entry-2",
    parentId: "entry-1",
    timestamp: "2026-04-26T06:35:26.075Z",
    message: {
      role: "assistant",
      provider: "openai-codex",
      model: "gpt-5.5",
      api: "openai-codex-responses",
      responseId: "resp_123",
      timestamp: 1777185319548,
      stopReason: "stop",
      usage: {
        input: 10,
        output: 20,
        cacheRead: 30,
        cacheWrite: 0,
        totalTokens: 60,
        cost: { input: 1, output: 2, cacheRead: 3, cacheWrite: 0, total: 6 },
      },
      content: [{ type: "text", text: "hello" }],
      ...overrides,
    },
  };
}

test("findLatestAssistantMessageEntry returns the latest assistant message entry", () => {
  const entries = [
    { type: "message", id: "user-1", message: { role: "user", content: "hi" } },
    assistantEntry({ model: "old-model" }),
    { type: "model_change", id: "model-1", provider: "x", modelId: "y" },
    { ...assistantEntry({ model: "new-model" }), id: "entry-3" },
  ];

  assert.equal(findLatestAssistantMessageEntry(entries)?.id, "entry-3");
});

test("buildAssistantMessageProvenance copies only minimal provenance fields", () => {
  const provenance = buildAssistantMessageProvenance(assistantEntry(), {
    sessionId: "session-1",
    sessionFile: "/tmp/session.jsonl",
    captureTime: "2026-04-26T07:00:00.000Z",
  });

  assert.deepEqual(provenance.pi_session, {
    session_id: "session-1",
    session_file: "/tmp/session.jsonl",
    message_entry_id: "entry-2",
    message_parent_id: "entry-1",
    entry_timestamp: "2026-04-26T06:35:26.075Z",
  });
  assert.equal(provenance.assistant_message.provider, "openai-codex");
  assert.equal(provenance.assistant_message.model, "gpt-5.5");
  assert.equal(provenance.assistant_message.api, "openai-codex-responses");
  assert.equal(provenance.assistant_message.response_id, "resp_123");
  assert.equal(provenance.assistant_message.stop_reason, "stop");
  assert.equal(provenance.assistant_message.usage.totalTokens, 60);
  assert.equal("content" in provenance.assistant_message, false);
});

test("extractLatestAssistantMessageProvenance reads session manager identity", () => {
  const sessionManager = {
    getEntries: () => [assistantEntry()],
    getSessionId: () => "session-1",
    getSessionFile: () => "/tmp/session.jsonl",
  };

  const provenance = extractLatestAssistantMessageProvenance(sessionManager, {
    captureTime: "2026-04-26T07:00:00.000Z",
  });

  assert.equal(provenance?.pi_session.session_id, "session-1");
  assert.equal(provenance?.pi_session.session_file, "/tmp/session.jsonl");
});

test("extractLatestAssistantMessageProvenance returns undefined without assistant entries", () => {
  const sessionManager = {
    getEntries: () => [{ type: "message", id: "user-1", message: { role: "user" } }],
  };

  assert.equal(extractLatestAssistantMessageProvenance(sessionManager), undefined);
});

test("formatAssistantMessageProvenanceSummary is compact and source-oriented", () => {
  const provenance = buildAssistantMessageProvenance(assistantEntry(), {
    sessionId: "session-1",
    sessionFile: "/tmp/session.jsonl",
    captureTime: "2026-04-26T07:00:00.000Z",
  });

  assert.equal(
    formatAssistantMessageProvenanceSummary(provenance),
    "openai-codex/gpt-5.5 via openai-codex-responses (stop) at entry-2",
  );
});

test("buildAssistantMessageProvenance fails when provider/model/api are absent", () => {
  assert.throws(
    () => buildAssistantMessageProvenance(assistantEntry({ provider: undefined })),
    /missing provider, model, or api/,
  );
});

/**
summary: "Tests last-assistant-message extraction, truncation, fallback, rendering, and managed-block stripping."
read_when:
  - "Changing last-assistant-message.js or the managed summary block contract."
*/
import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { stripManagedSummaryBlocks } from "../extensions/session-compaction/handler.js";
import {
  collectLastAssistantMessage,
  extractLastAssistantMessage,
  extractPreviousLastAssistantMessage,
  LAST_ASSISTANT_MESSAGE_HEADING,
  MAX_LAST_ASSISTANT_MESSAGE_CHARS,
  renderLastAssistantMessageBlock,
} from "../extensions/session-compaction/last-assistant-message.js";

describe("extractLastAssistantMessage", () => {
  it("returns the newest assistant text message", () => {
    const entry = extractLastAssistantMessage([
      { role: "user", content: "hello" },
      { role: "assistant", content: [{ type: "text", text: "first answer" }] },
      { role: "user", content: "again" },
      { role: "assistant", content: [{ type: "text", text: "second answer" }] },
    ]);
    assert.equal(entry.text, "second answer");
    assert.equal(entry.truncated, false);
    assert.equal(entry.fromPrevious, false);
  });

  it("ignores thinking and toolCall parts", () => {
    const entry = extractLastAssistantMessage([
      {
        role: "assistant",
        content: [
          { type: "thinking", thinking: "internal" },
          { type: "toolCall", name: "bash", arguments: { command: "ls" } },
          { type: "text", text: "visible answer" },
        ],
      },
    ]);
    assert.equal(entry.text, "visible answer");
  });

  it("skips assistant messages with no visible text", () => {
    const entry = extractLastAssistantMessage([
      { role: "assistant", content: [{ type: "thinking", thinking: "only thinking" }] },
      { role: "assistant", content: [{ type: "text", text: "has text" }] },
    ]);
    assert.equal(entry.text, "has text");
  });

  it("truncates over-cap messages with a marker", () => {
    const long = "x".repeat(MAX_LAST_ASSISTANT_MESSAGE_CHARS + 100);
    const entry = extractLastAssistantMessage([{ role: "assistant", content: long }]);
    assert.equal(entry.truncated, true);
    assert.ok(entry.text.startsWith("x".repeat(100)));
    assert.ok(entry.text.includes("truncated at"));
    assert.ok(entry.text.length < long.length);
  });

  it("returns undefined when there is no assistant message", () => {
    assert.equal(extractLastAssistantMessage([{ role: "user", content: "hello" }]), undefined);
    assert.equal(extractLastAssistantMessage([]), undefined);
    assert.equal(extractLastAssistantMessage(undefined), undefined);
  });
});

describe("previous-summary fallback", () => {
  const block = `${LAST_ASSISTANT_MESSAGE_HEADING}\nprevious assistant text`;

  it("extracts a previous managed block", () => {
    const entry = extractPreviousLastAssistantMessage(`# Summary\n\n${block}\n\n## Next\n- step`);
    assert.equal(entry.text, "previous assistant text");
    assert.equal(entry.fromPrevious, true);
  });

  it("returns undefined without the block", () => {
    assert.equal(extractPreviousLastAssistantMessage("# Summary\n- nothing"), undefined);
    assert.equal(extractPreviousLastAssistantMessage(""), undefined);
  });

  it("collect prefers current messages over the previous summary", () => {
    const entry = collectLastAssistantMessage({
      messages: [{ role: "assistant", content: "current" }],
      previousSummary: block,
    });
    assert.equal(entry.text, "current");
    assert.equal(entry.fromPrevious, false);
  });

  it("collect falls back to the previous summary when the span has no assistant message", () => {
    const entry = collectLastAssistantMessage({
      messages: [{ role: "user", content: "question only" }],
      previousSummary: block,
    });
    assert.equal(entry.text, "previous assistant text");
    assert.equal(entry.fromPrevious, true);
  });
});

describe("render and managed-block stripping", () => {
  it("renders the heading plus verbatim text", () => {
    const rendered = renderLastAssistantMessageBlock({ text: "exact words" });
    assert.equal(rendered, `${LAST_ASSISTANT_MESSAGE_HEADING}\nexact words`);
  });

  it("returns undefined for empty entries", () => {
    assert.equal(renderLastAssistantMessageBlock(undefined), undefined);
    assert.equal(renderLastAssistantMessageBlock({ text: "   " }), undefined);
  });

  it("stripManagedSummaryBlocks removes the managed block so re-compaction does not duplicate it", () => {
    const summary = `# Summary\n- point\n\n${LAST_ASSISTANT_MESSAGE_HEADING}\nold text\n\n## Files touched (cumulative)\n- a.ts`;
    const stripped = stripManagedSummaryBlocks(summary);
    assert.ok(!stripped.includes("Last assistant message"));
    assert.ok(!stripped.includes("old text"));
    assert.ok(stripped.includes("# Summary"));
    assert.ok(stripped.includes("point"));
  });
});

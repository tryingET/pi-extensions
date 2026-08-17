/**
summary: "Tests renewed recency for repeated exact user prompts."
read_when:
  - "Changing prompt deduplication or repeated-instruction priority."
*/
import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { dedupePromptsByLatestText } from "../extensions/session-compaction/prompt-selection.js";

describe("dedupePromptsByLatestText", () => {
  it("keeps the latest occurrence of an exact repeated prompt", () => {
    const prompts = dedupePromptsByLatestText([
      { text: "Run the focused tests", timestamp: 1_000 },
      { text: "Unrelated", timestamp: 2_000 },
      { text: "Run the focused tests", timestamp: 3_000, isCommand: true },
    ]);
    assert.deepEqual(
      prompts.map((prompt) => [prompt.text, prompt.timestamp]),
      [
        ["Unrelated", 2_000],
        ["Run the focused tests", 3_000],
      ],
    );
    assert.equal(prompts[1].isCommand, true);
  });

  it("keeps capability flags learned from either occurrence", () => {
    const prompts = dedupePromptsByLatestText([
      { text: "/skill:testing", timestamp: 1_000, isSkill: true, skillName: "testing" },
      { text: "/skill:testing", timestamp: 2_000, isCommand: true },
    ]);
    assert.equal(prompts.length, 1);
    assert.equal(prompts[0].isSkill, true);
    assert.equal(prompts[0].isCommand, true);
    assert.equal(prompts[0].skillName, "testing");
    assert.equal(prompts[0].timestamp, 2_000);
  });
});

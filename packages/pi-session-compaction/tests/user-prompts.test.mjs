import assert from "node:assert/strict";
import { describe, it } from "node:test";

import {
  collectCurrentUserPrompts,
  createTrackedCommandStore,
  extractCustomInstructionPrompt,
  extractPreviousUserPrompts,
  extractUserPrompts,
  formatCompactInstruction,
  formatUserPrompts,
  mergeUserPrompts,
  parseSkillBlock,
  renderEssentialUserPromptsBlock,
} from "../extensions/session-compaction/user-prompts.js";

function userMessage(content, timestamp = 1000) {
  return { role: "user", content, timestamp };
}

function assistantMessage(content, timestamp = 1000) {
  return { role: "assistant", content, timestamp };
}

describe("skill-block parsing", () => {
  it("parses expanded skill blocks and recovers user text", () => {
    const parsed = parseSkillBlock(`<skill name="frontend-design" location="/path/to/skill">
Skill content.
</skill>

Create a dark theme button`);

    assert.deepEqual(parsed, {
      name: "frontend-design",
      userMessage: "Create a dark theme button",
    });
  });

  it("returns null for ordinary messages", () => {
    assert.equal(parseSkillBlock("regular user message"), null);
    assert.equal(parseSkillBlock("/skill:frontend-design args"), null);
  });
});

describe("current user prompt extraction", () => {
  it("extracts ordinary user messages and ignores assistant messages", () => {
    const prompts = extractUserPrompts([
      userMessage("Hello", 3000),
      assistantMessage("Hi", 4000),
      userMessage([{ type: "text", text: "World" }], 1000),
    ]);

    assert.deepEqual(
      prompts.map((prompt) => prompt.text),
      ["World", "Hello"],
    );
  });

  it("formats expanded skill blocks as slash skill invocations", () => {
    const prompts = extractUserPrompts([
      userMessage(
        `<skill name="frontend-design" location="/path/to/skill">
Skill content.
</skill>

Create a dark button`,
        1000,
      ),
    ]);

    assert.equal(prompts[0].text, "/skill:frontend-design Create a dark button");
    assert.equal(prompts[0].isSkill, true);
    assert.equal(prompts[0].skillName, "frontend-design");
  });

  it("uses tracked slash command text when timestamps match", () => {
    const prompts = extractUserPrompts(
      [userMessage("Expanded template content", 2000)],
      [{ original: "/review --strict", timestamp: 2100 }],
    );

    assert.equal(prompts[0].text, "/review --strict");
    assert.equal(prompts[0].isTemplate, true);
  });

  it("does not use tracked command text outside the timestamp window", () => {
    const prompts = extractUserPrompts(
      [userMessage("Expanded template content", 10_000)],
      [{ original: "/review --strict", timestamp: 1000 }],
    );

    assert.equal(prompts[0].text, "Expanded template content");
    assert.equal(prompts[0].isTemplate, undefined);
  });

  it("adds /compact customInstructions as a preserved command entry", () => {
    assert.equal(
      formatCompactInstruction("--preset cheap focus on tests"),
      "/compact --preset cheap focus on tests",
    );
    assert.deepEqual(extractCustomInstructionPrompt("  "), undefined);

    const prompts = collectCurrentUserPrompts({
      messages: [userMessage("Please continue", 1000)],
      customInstructions: "-p current keep command detail",
      customInstructionsTimestamp: 2000,
    });

    assert.deepEqual(
      prompts.map((prompt) => prompt.text),
      ["Please continue", "/compact -p current keep command detail"],
    );
  });
});

describe("previous user prompt extraction", () => {
  it("extracts the target h2 essential prompts section", () => {
    const prompts = extractPreviousUserPrompts(`## Brief
Earlier summary

## Essential user prompts / commands + arguments used
1. Read the settings file
2. /skill:frontend-design Create button
3. /compact --preset cheap focus

## Status
Done`);

    assert.deepEqual(
      prompts.map((prompt) => prompt.text),
      [
        "Read the settings file",
        "/skill:frontend-design Create button",
        "/compact --preset cheap focus",
      ],
    );
    assert.equal(prompts[1].isSkill, true);
    assert.equal(prompts[2].isCommand, true);
  });

  it("extracts legacy h3 sections and turn-prefix sections", () => {
    const legacy = extractPreviousUserPrompts(`## Context

### Essential user prompts / commands + arguments used
1. /template:review
2. Plain prompt`);
    assert.deepEqual(
      legacy.map((prompt) => prompt.text),
      ["/template:review", "Plain prompt"],
    );

    const turnPrefix = extractPreviousUserPrompts(`## Context for Suffix
### User prompts in this turn
1. /skill:testing
2. Fix this`);
    assert.deepEqual(
      turnPrefix.map((prompt) => prompt.text),
      ["/skill:testing", "Fix this"],
    );
  });

  it("returns an empty array when no prompt section exists", () => {
    assert.deepEqual(extractPreviousUserPrompts("## Status\nNo prompts here"), []);
  });
});

describe("prompt formatting and tracked command store", () => {
  it("deduplicates by exact text while merging previous and current prompts", () => {
    const merged = mergeUserPrompts(
      [
        { text: "First", timestamp: 1000 },
        { text: "Second", timestamp: 2000 },
      ],
      [
        { text: "Second", timestamp: 3000 },
        { text: "Third", timestamp: 4000 },
      ],
    );

    assert.deepEqual(
      merged.map((prompt) => prompt.text),
      ["First", "Second", "Third"],
    );
    assert.equal(formatUserPrompts([]), "1. (none)");
    assert.equal(formatUserPrompts(merged), "1. First\n2. Second\n3. Third");
    assert.equal(
      renderEssentialUserPromptsBlock(merged),
      "## Essential user prompts / commands + arguments used\n1. First\n2. Second\n3. Third",
    );
  });

  it("tracks, prunes, and clears matched slash commands", () => {
    const store = createTrackedCommandStore({
      maxTrackedCommands: 2,
      timestampMatchWindowMs: 3000,
    });

    assert.equal(store.trackInput("not a command", 1000), false);
    assert.equal(store.trackInput("/first", 1000), true);
    store.trackInput("/second", 2000);
    store.trackInput("/third", 3000);

    assert.deepEqual(
      store.trackedCommands.map((command) => command.original),
      ["/third", "/second"],
    );

    store.clearMatched([userMessage("expanded", 3100)]);
    assert.deepEqual(store.trackedCommands, []);
  });
});

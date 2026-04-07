import assert from "node:assert/strict";
import test from "node:test";
import { DEFAULT_SUBAGENT_MODEL, resolveSubagentModel } from "../extensions/self.ts";

test("resolveSubagentModel prefers PI_SUBAGENT_MODEL override", () => {
  const previous = process.env.PI_SUBAGENT_MODEL;
  process.env.PI_SUBAGENT_MODEL = "github-copilot/gpt-4o";

  try {
    assert.equal(
      resolveSubagentModel({
        model: { provider: "anthropic", id: "claude-sonnet-4-20250514" },
      }),
      "github-copilot/gpt-4o",
    );
  } finally {
    if (previous === undefined) {
      delete process.env.PI_SUBAGENT_MODEL;
    } else {
      process.env.PI_SUBAGENT_MODEL = previous;
    }
  }
});

test("resolveSubagentModel uses the current session model when available", () => {
  const previous = process.env.PI_SUBAGENT_MODEL;
  delete process.env.PI_SUBAGENT_MODEL;

  try {
    assert.equal(
      resolveSubagentModel({
        model: { provider: "openrouter", id: "anthropic/claude-sonnet-4" },
      }),
      "openrouter/anthropic/claude-sonnet-4",
    );
  } finally {
    if (previous === undefined) {
      delete process.env.PI_SUBAGENT_MODEL;
    } else {
      process.env.PI_SUBAGENT_MODEL = previous;
    }
  }
});

test("resolveSubagentModel falls back to the fixed default when no current model is available", () => {
  const previous = process.env.PI_SUBAGENT_MODEL;
  delete process.env.PI_SUBAGENT_MODEL;

  try {
    assert.equal(resolveSubagentModel(), DEFAULT_SUBAGENT_MODEL);
    assert.equal(resolveSubagentModel({ model: { provider: "openai" } }), DEFAULT_SUBAGENT_MODEL);
    assert.equal(resolveSubagentModel({ model: { id: "gpt-5.4" } }), DEFAULT_SUBAGENT_MODEL);
  } finally {
    if (previous === undefined) {
      delete process.env.PI_SUBAGENT_MODEL;
    } else {
      process.env.PI_SUBAGENT_MODEL = previous;
    }
  }
});

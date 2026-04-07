import assert from "node:assert/strict";
import test from "node:test";
import {
  DEFAULT_SUBAGENT_MODEL,
  resolveSubagentModel,
  resolveSubagentModelSelection,
} from "../extensions/self.ts";

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

    const selection = resolveSubagentModelSelection({
      model: { provider: "anthropic", id: "claude-sonnet-4-20250514" },
    });
    assert.equal(selection.requestedModel, "github-copilot/gpt-4o");
    assert.equal(selection.effectiveModel, "github-copilot/gpt-4o");
    assert.equal(selection.source, "env_override");
    assert.equal(selection.warning, undefined);
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

    const selection = resolveSubagentModelSelection({
      model: { provider: "openrouter", id: "anthropic/claude-sonnet-4" },
    });
    assert.equal(selection.requestedModel, "openrouter/anthropic/claude-sonnet-4");
    assert.equal(selection.effectiveModel, "openrouter/anthropic/claude-sonnet-4");
    assert.equal(selection.source, "session");
    assert.equal(selection.warning, undefined);
  } finally {
    if (previous === undefined) {
      delete process.env.PI_SUBAGENT_MODEL;
    } else {
      process.env.PI_SUBAGENT_MODEL = previous;
    }
  }
});

test("resolveSubagentModel preserves numeric-suffix provider aliases for pi-multi-pass-backed subscriptions", () => {
  const previous = process.env.PI_SUBAGENT_MODEL;
  delete process.env.PI_SUBAGENT_MODEL;

  try {
    assert.equal(
      resolveSubagentModel({
        model: { provider: "openai-codex-2", id: "gpt-5.4" },
      }),
      "openai-codex-2/gpt-5.4",
    );

    const selection = resolveSubagentModelSelection({
      model: { provider: "openai-codex-2", id: "gpt-5.4" },
    });
    assert.equal(selection.requestedModel, "openai-codex-2/gpt-5.4");
    assert.equal(selection.effectiveModel, "openai-codex-2/gpt-5.4");
    assert.equal(selection.source, "session");
    assert.equal(selection.warning, undefined);
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

    const selection = resolveSubagentModelSelection({ model: { provider: "openai" } });
    assert.equal(selection.requestedModel, DEFAULT_SUBAGENT_MODEL);
    assert.equal(selection.effectiveModel, DEFAULT_SUBAGENT_MODEL);
    assert.equal(selection.source, "default");
    assert.equal(selection.warning, undefined);
  } finally {
    if (previous === undefined) {
      delete process.env.PI_SUBAGENT_MODEL;
    } else {
      process.env.PI_SUBAGENT_MODEL = previous;
    }
  }
});

/**
summary: "Tests compaction config and instruction parsing, span derivation, summary assembly, fallback paths, and aborts."
read_when:
  - "Changing the session compaction handler, prompt contract, model fallback, split-turn behavior, or preserved artifacts."
*/
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { describe, it } from "node:test";

import {
  buildSummaryUserPrompt,
  DEFAULT_COMPACTION_PROMPT_CONTRACT,
  DEFAULT_CONFIG,
  deriveSummaryEntrySpans,
  parseCompactInstructions,
  parseConfig,
  runSessionCompaction,
  stripManagedSummaryBlocks,
} from "../extensions/session-compaction/handler.js";

function createModel(overrides = {}) {
  return {
    id: "claude-sonnet-4",
    name: "Claude Sonnet 4",
    label: "Claude Sonnet",
    provider: "anthropic",
    reasoning: true,
    contextWindow: 200_000,
    headers: { "x-model": "header" },
    ...overrides,
  };
}

function createContext(models = [createModel()], currentModel = models[0], registryOverrides = {}) {
  const notifications = [];
  return {
    notifications,
    ctx: {
      hasUI: true,
      ui: {
        notify(message) {
          notifications.push(message);
        },
      },
      cwd: "/repo",
      model: currentModel,
      modelRegistry: {
        getAll() {
          return models;
        },
        getAvailable() {
          return models;
        },
        isUsingOAuth() {
          return false;
        },
        async getApiKeyAndHeaders(model) {
          return { ok: true, apiKey: `key:${model.provider}`, headers: { registry: "ok" } };
        },
        ...registryOverrides,
      },
    },
  };
}

function userEntry(id, text, timestamp = 1000) {
  return {
    id,
    type: "message",
    message: {
      role: "user",
      content: [{ type: "text", text }],
      timestamp,
    },
  };
}

function assistantEntry(id, text, timestamp = 2000) {
  return {
    id,
    type: "message",
    message: {
      role: "assistant",
      content: [{ type: "text", text }],
      timestamp,
      usage: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0, totalTokens: 0 },
      stopReason: "stop",
    },
  };
}

function compactionEntry(id, summary, firstKeptEntryId) {
  return {
    id,
    type: "compaction",
    summary,
    firstKeptEntryId,
    tokensBefore: 100,
    timestamp: new Date().toISOString(),
  };
}

function toolCallEntry(id, name, args) {
  return {
    id: `call-entry-${id}`,
    type: "message",
    message: {
      role: "assistant",
      content: [{ type: "toolCall", id, name, arguments: args }],
      timestamp: 1,
    },
  };
}

function toolResultEntry(id, text = "ok", timestamp = 10) {
  return {
    id: `result-entry-${id}`,
    type: "message",
    message: {
      role: "toolResult",
      toolCallId: id,
      content: [{ type: "text", text }],
      isError: false,
      timestamp,
    },
  };
}

function createEvent(overrides = {}) {
  const history = userEntry("history-user", "Fix the failing tests", 1000);
  const kept = assistantEntry("kept-assistant", "Investigating", 2000);
  return {
    type: "session_before_compact",
    customInstructions: undefined,
    signal: new AbortController().signal,
    branchEntries: [history, kept],
    preparation: {
      firstKeptEntryId: kept.id,
      messagesToSummarize: [history.message],
      turnPrefixMessages: [],
      isSplitTurn: false,
      tokensBefore: 321,
      previousSummary: undefined,
      fileOps: {
        read: new Set(),
        write: new Set(),
        edit: new Set(),
        delete: new Set(),
        move: [],
      },
      settings: {
        enabled: true,
        reserveTokens: 800,
        keepRecentTokens: 400,
      },
    },
    ...overrides,
  };
}

function assistantResponse(text, stopReason = "stop") {
  return {
    role: "assistant",
    content: [{ type: "text", text }],
    stopReason,
    timestamp: Date.now(),
  };
}

function createDeps(overrides = {}) {
  return {
    complete: async () => assistantResponse("summary"),
    loadConfig: async () => ({
      includeFilesTouched: false,
      defaultPreset: "current",
      presets: {},
    }),
    loadCompactionPrompt: async () => "Use target shape",
    getTrackedCommands: () => [],
    ...overrides,
  };
}

function promptTextFromContext(context) {
  return context.messages[0].content[0].text;
}

describe("session compaction handler parsing and config", () => {
  it("parses compact preset directives and malformed directives", () => {
    assert.deepEqual(parseCompactInstructions("focus on tests"), {
      usesPresetDirective: false,
      focusText: "focus on tests",
    });
    assert.deepEqual(parseCompactInstructions("--preset cheap focus on tests"), {
      usesPresetDirective: true,
      presetQuery: "cheap",
      focusText: "focus on tests",
    });
    assert.deepEqual(parseCompactInstructions("-p cheap focus on tests"), {
      usesPresetDirective: true,
      presetQuery: "cheap",
      focusText: "focus on tests",
    });
    assert.deepEqual(parseCompactInstructions("--preset"), { usesPresetDirective: true });
    assert.deepEqual(parseCompactInstructions("--preset=cheap"), { usesPresetDirective: true });
  });

  it("parses default config, includeFilesTouched, defaultPreset, and presets", () => {
    assert.deepEqual(parseConfig({}), DEFAULT_CONFIG);
    assert.deepEqual(
      parseConfig({
        includeFilesTouched: { inCompactionSummary: false },
        defaultPreset: "fast",
        presets: { fast: { model: "openai/gpt-5", thinkingLevel: "medium" } },
      }),
      {
        includeFilesTouched: false,
        includeLastAssistantMessage: true,
        defaultPreset: "fast",
        presets: { fast: { model: "openai/gpt-5", thinkingLevel: "medium" } },
      },
    );
    assert.throws(() => parseConfig({ presets: [] }), /presets must be an object/);
  });

  it("derives repeated compaction and split-turn spans from stock boundaries", () => {
    const entries = [
      userEntry("dropped", "Old"),
      userEntry("kept-after-prev", "Still in context"),
      assistantEntry("assistant-after-prev", "Still here"),
      compactionEntry("old-compaction", "older", "kept-after-prev"),
      userEntry("turn-start", "Current turn start"),
      assistantEntry("first-kept", "Kept suffix"),
    ];

    const nonSplit = deriveSummaryEntrySpans({
      branchEntries: entries,
      firstKeptEntryId: "first-kept",
      isSplitTurn: false,
    });
    assert.deepEqual(
      nonSplit.historyEntries.map((entry) => entry.id),
      ["kept-after-prev", "assistant-after-prev", "old-compaction", "turn-start"],
    );

    const split = deriveSummaryEntrySpans({
      branchEntries: entries,
      firstKeptEntryId: "first-kept",
      isSplitTurn: true,
    });
    assert.deepEqual(
      split.turnPrefixEntries.map((entry) => entry.id),
      ["turn-start"],
    );
  });

  it("assembles update, prompt-preservation, files-touched, and serialized-conversation prompt sections", () => {
    const prompt = buildSummaryUserPrompt({
      mode: "history",
      promptContract: "Use sections",
      serializedConversation: "[user] hello",
      previousSummary: "Older summary",
      focusText: "focus detail",
      essentialUserPromptsBlock: "## Essential user prompts / commands + arguments used\n1. hello",
      filesTouchedManifestBlock:
        "## Files touched\nR=read, W=write, E=edit, M=move/rename, D=delete\n\n```text\nR  a.ts\n```",
    });

    assert.match(prompt, /## Update instructions/);
    assert.match(prompt, /## User compaction note/);
    assert.match(prompt, /## Preserve exactly: essential user prompts and commands/);
    assert.match(prompt, /## Authoritative files touched for this summarized span/);
    assert.match(prompt, /## Serialized conversation/);
  });

  it("keeps a typed valuable-discovery promotion section in prompt contracts", () => {
    assert.match(
      DEFAULT_COMPACTION_PROMPT_CONTRACT,
      /## Valuable discoveries and promotion status/,
    );
    assert.match(DEFAULT_COMPACTION_PROMPT_CONTRACT, /Source for each insight/);
    assert.match(DEFAULT_COMPACTION_PROMPT_CONTRACT, /Owner surface for promotion/);
    assert.match(
      DEFAULT_COMPACTION_PROMPT_CONTRACT,
      /Do not imply this summary or JSONL is durable authority/,
    );

    const liveContract = readFileSync(
      new URL("../extensions/session-compaction/compaction-prompt.md", import.meta.url),
      "utf8",
    );
    assert.match(liveContract, /## Valuable discoveries and promotion status/);
    assert.match(liveContract, /Source for each insight/);
    assert.match(liveContract, /Do not imply this summary or JSONL is durable authority/);
  });

  it("strips stale previous managed prompt and files-touched blocks", () => {
    assert.equal(
      stripManagedSummaryBlocks(
        [
          "## Brief",
          "Keep this",
          "",
          "## Essential user prompts / commands + arguments used",
          "1. stale prompt",
          "",
          "## Files touched (cumulative)",
          "R=read, W=write, E=edit, M=move/rename, D=delete",
          "",
          "```text",
          "R  stale.ts",
          "```",
        ].join("\n"),
      ),
      "## Brief\nKeep this",
    );
  });
});

describe("session compaction handler runtime", () => {
  it("returns a normal compaction result with summary, boundary, tokens, and model details", async () => {
    const { ctx } = createContext();
    const event = createEvent();

    const result = await runSessionCompaction(
      event,
      ctx,
      createDeps({ complete: async () => assistantResponse("handler summary") }),
    );

    assert.ok(result && "compaction" in result);
    assert.equal(
      result.compaction.summary,
      [
        "handler summary",
        "",
        "## Essential user prompts / commands + arguments used",
        "1. Fix the failing tests",
        "",
        "## Last assistant message (verbatim)",
        "Investigating",
      ].join("\n"),
    );
    assert.equal(result.compaction.firstKeptEntryId, "kept-assistant");
    assert.equal(result.compaction.tokensBefore, 321);
    assert.deepEqual(result.compaction.details, {
      model: "anthropic/claude-sonnet-4",
      thinkingLevel: "off",
    });
  });

  it("uses the production host-owned completion seam with no extension-owned auth", async () => {
    let observed;
    const { ctx } = createContext([createModel({ api: "custom-api" })], undefined, {
      async complete(model, context, options) {
        observed = { receiver: this, model, context, options };
        return assistantResponse("host summary");
      },
    });
    const deps = createDeps();
    delete deps.complete;

    const result = await runSessionCompaction(createEvent(), ctx, deps);

    assert.ok(result && "compaction" in result);
    assert.equal(observed.receiver, ctx.modelRegistry);
    assert.equal(observed.model, ctx.model);
    assert.equal(observed.options.maxTokens, 800);
    assert.equal(observed.options.signal instanceof AbortSignal, true);
    assert.equal("apiKey" in observed.options, false);
    assert.equal("headers" in observed.options, false);
    assert.equal("env" in observed.options, false);
  });

  it("returns undefined instead of breaking stock compaction when no model or host auth is available", async () => {
    const { ctx } = createContext();
    ctx.model = undefined;
    assert.equal(await runSessionCompaction(createEvent(), ctx, createDeps()), undefined);

    const unavailable = createContext([createModel()], undefined, {
      async complete() {
        throw new Error("missing host auth");
      },
    });
    const unavailableDeps = createDeps();
    delete unavailableDeps.complete;
    assert.equal(
      await runSessionCompaction(createEvent(), unavailable.ctx, unavailableDeps),
      undefined,
    );
  });

  it("uses an explicit preset path through the resolver", async () => {
    const current = createModel({ provider: "openai", id: "gpt-5" });
    const fast = createModel({ provider: "openai-codex", id: "gpt-5-mini" });
    const { ctx } = createContext([current, fast], current);
    const event = createEvent({ customInstructions: "--preset fast focus on parser regressions" });

    let selectedModel;
    let promptText = "";
    const result = await runSessionCompaction(
      event,
      ctx,
      createDeps({
        complete: async (model, context) => {
          selectedModel = model;
          promptText = promptTextFromContext(context);
          return assistantResponse("preset summary");
        },
        loadConfig: async () => ({
          includeFilesTouched: false,
          defaultPreset: "current",
          presets: { fast: { model: "openai-codex/gpt-5-mini", thinkingLevel: "medium" } },
        }),
      }),
    );

    assert.ok(result && "compaction" in result);
    assert.equal(selectedModel, fast);
    assert.deepEqual(result.compaction.details, {
      model: "openai-codex/gpt-5-mini",
      presetName: "fast",
      thinkingLevel: "medium",
    });
    assert.match(promptText, /focus on parser regressions/);
    assert.match(promptText, /\/compact --preset fast focus on parser regressions/);
  });

  it("uses configured defaultPreset and falls back to current model when defaultPreset fails", async () => {
    const current = createModel({ provider: "openai", id: "gpt-5" });
    const fast = createModel({ provider: "openai-codex", id: "gpt-5-mini" });
    const configured = createContext([current, fast], current);
    let selectedId = "";
    await runSessionCompaction(
      createEvent(),
      configured.ctx,
      createDeps({
        complete: async (model) => {
          selectedId = model.id;
          return assistantResponse("default preset summary");
        },
        loadConfig: async () => ({
          includeFilesTouched: false,
          defaultPreset: "fast",
          presets: { fast: { model: "openai-codex/gpt-5-mini" } },
        }),
      }),
    );
    assert.equal(selectedId, "gpt-5-mini");

    const fallback = createContext([current], current);
    selectedId = "";
    const result = await runSessionCompaction(
      createEvent(),
      fallback.ctx,
      createDeps({
        complete: async (model) => {
          selectedId = model.id;
          return assistantResponse("fallback summary");
        },
        loadConfig: async () => ({
          includeFilesTouched: false,
          defaultPreset: "fast",
          presets: { fast: { model: "openai-codex/gpt-5-mini" } },
        }),
      }),
    );
    assert.ok(result && "compaction" in result);
    assert.equal(selectedId, "gpt-5");
    assert.match(fallback.notifications[0], /falling back to the current session model/i);
  });

  it("falls back from parsed preset request failure but cancels if the fallback also fails", async () => {
    const { ctx, notifications } = createContext();
    const result = await runSessionCompaction(
      createEvent({ customInstructions: "--preset missing keep tests" }),
      ctx,
      createDeps({ complete: async () => assistantResponse("fallback summary") }),
    );
    assert.ok(result && "compaction" in result);
    assert.match(notifications[0], /Preset compaction path failed/);

    const cancelResult = await runSessionCompaction(
      createEvent({ customInstructions: "--preset missing keep tests" }),
      ctx,
      createDeps({ complete: async () => assistantResponse("", "error") }),
    );
    assert.deepEqual(cancelResult, { cancel: true });
  });

  it("produces split-turn context and appends the final manifest exactly once", async () => {
    const { ctx } = createContext();
    const oldUser = userEntry("old-user", "Previous turn");
    const oldAssistant = assistantEntry("old-assistant", "Previous answer");
    const toolCall = toolCallEntry("read-1", "read", { path: "src/a.ts" });
    const toolResult = toolResultEntry("read-1");
    const currentUser = userEntry("current-user", "Current turn start");
    const kept = assistantEntry("kept", "Kept suffix");
    const event = createEvent({
      branchEntries: [oldUser, oldAssistant, toolCall, toolResult, currentUser, kept],
      preparation: {
        ...createEvent().preparation,
        firstKeptEntryId: kept.id,
        messagesToSummarize: [oldUser.message, oldAssistant.message],
        turnPrefixMessages: [currentUser.message],
        isSplitTurn: true,
        tokensBefore: 999,
        previousSummary:
          "Earlier summary\n\n## Files touched\nR=read, W=write, E=edit, M=move/rename, D=delete\n\n```text\nR  stale.ts\n```",
      },
    });

    let callIndex = 0;
    const result = await runSessionCompaction(
      event,
      ctx,
      createDeps({
        complete: async () => {
          callIndex += 1;
          return assistantResponse(callIndex === 1 ? "history summary" : "turn summary");
        },
        loadConfig: async () => ({
          includeFilesTouched: true,
          defaultPreset: "current",
          presets: {},
        }),
      }),
    );

    assert.ok(result && "compaction" in result);
    assert.equal(callIndex, 2);
    assert.match(result.compaction.summary, /\*\*Turn Context \(split turn\):\*\*/);
    assert.match(result.compaction.summary, /history summary/);
    assert.match(result.compaction.summary, /turn summary/);
    assert.equal((result.compaction.summary.match(/## Files touched/g) ?? []).length, 1);
    assert.match(result.compaction.summary, /R {2}src\/a\.ts/);
    assert.equal(result.compaction.summary.includes("stale.ts"), false);
  });

  it("includes and dedupes essential user prompts, recovered skills, timestamp-matched commands, and compact instructions", async () => {
    const { ctx } = createContext();
    const previousSummary = [
      "## Brief",
      "Prior",
      "",
      "## Essential user prompts / commands + arguments used",
      "1. Previous exact prompt",
      "2. Same prompt",
    ].join("\n");
    const skillText =
      '<skill name="frontend-design" location="/skill">\nSkill content\n</skill>\n\nCreate button';
    const entries = [
      userEntry("ordinary", "Same prompt", 1000),
      userEntry("skill", skillText, 2000),
      userEntry("template", "Expanded command body", 3000),
      assistantEntry("kept", "Keep", 4000),
    ];
    const event = createEvent({
      customInstructions: "--preset current preserve compact command",
      branchEntries: entries,
      preparation: {
        ...createEvent().preparation,
        firstKeptEntryId: "kept",
        messagesToSummarize: entries.slice(0, 3).map((entry) => entry.message),
        previousSummary,
      },
    });

    const result = await runSessionCompaction(
      event,
      ctx,
      createDeps({
        getTrackedCommands: () => [{ original: "/review --strict", timestamp: 3050 }],
      }),
    );

    assert.ok(result && "compaction" in result);
    const summary = result.compaction.summary;
    assert.match(summary, /Previous exact prompt/);
    assert.match(summary, /Same prompt/);
    assert.match(summary, /\/skill:frontend-design Create button/);
    assert.match(summary, /\/review --strict/);
    assert.match(summary, /\/compact --preset current preserve compact command/);
    assert.equal((summary.match(/Same prompt/g) ?? []).length, 1);
  });

  it("returns cancel on abort handling", async () => {
    const { ctx } = createContext();
    const controller = new AbortController();
    controller.abort();
    assert.deepEqual(
      await runSessionCompaction(createEvent({ signal: controller.signal }), ctx, createDeps()),
      { cancel: true },
    );

    const result = await runSessionCompaction(
      createEvent(),
      ctx,
      createDeps({ complete: async () => assistantResponse("", "aborted") }),
    );
    assert.deepEqual(result, { cancel: true });
  });
});

// ---
// summary: covers baseline dispatch profile composition, parent context capture, model context, name safety, errors, and timeouts.
// read_when:
//   - changing the core dispatch_subagent request-to-spawn contract.
// ---

import assert from "node:assert/strict";
import { resolve } from "node:path";
import test from "node:test";
import { SUBAGENT_PROFILES, setup } from "./dispatch-subagent-harness.mjs";

test("dispatch_subagent keeps stable host context ahead of profile and task variation", async () => {
  const harness = await setup();

  try {
    const result = await harness.tool.execute(
      "tc-1",
      {
        profile: "reviewer",
        objective: "Review changes",
      },
      null,
      null,
      { cwd: process.cwd() },
    );

    const def = harness.getCapturedDef();
    assert.equal(def.systemPrompt, undefined);
    assert.ok(def.userPrompt.startsWith(`${SUBAGENT_PROFILES.reviewer.systemPrompt}\n\n`));
    assert.match(def.userPrompt, /DISPATCH TASK CONTRACT/);
    assert.match(def.userPrompt, /"objective": "Review changes"/);
    assert.equal(def.userPrompt.match(/"objective": "Review changes"/g)?.length, 1);
    assert.doesNotMatch(def.userPrompt, /"mutationPolicy"/);

    assert.equal(result.details.prompt_applied, false);
    assert.equal(result.details.prompt_name, undefined);
    assert.equal(result.details.prompt_source, undefined);
  } finally {
    await harness.cleanup();
  }
});

test("dispatch_subagent does not impose a package-owned objective character limit", async () => {
  const harness = await setup();
  const objective = `Review the complete supplied context.\n${"x".repeat(32_000)}`;

  try {
    const result = await harness.tool.execute(
      "tc-unbounded-objective",
      {
        profile: "reviewer",
        objective,
      },
      null,
      null,
      { cwd: process.cwd() },
    );

    const def = harness.getCapturedDef();
    assert.equal(def.objective, objective);
    assert.equal(def.taskContract.objective, objective);
    assert.equal(result.details.objective, objective);
  } finally {
    await harness.cleanup();
  }
});
test("dispatch_subagent records the current live session key on spawned sessions when available", async () => {
  const harness = await setup();

  try {
    await harness.tool.execute(
      "tc-session-scope",
      {
        profile: "reviewer",
        objective: "Review changes",
      },
      null,
      null,
      { cwd: process.cwd(), sessionKey: "live-session-42" },
    );

    const def = harness.getCapturedDef();
    assert.equal(def.parentSessionKey, "live-session-42");
    assert.equal(def.parentRepoRoot, resolve(process.cwd(), "../.."));
  } finally {
    await harness.cleanup();
  }
});
test("dispatch_subagent passes execution context to modelProvider", async () => {
  const harness = await setup(undefined, (ctx) => {
    const provider = ctx?.model?.provider;
    const modelId = ctx?.model?.id;
    return `${provider}/${modelId}`;
  });

  try {
    await harness.tool.execute(
      "tc-model-context",
      {
        profile: "reviewer",
        objective: "Review changes",
      },
      null,
      null,
      {
        cwd: process.cwd(),
        model: { provider: "anthropic", id: "claude-sonnet-4-20250514" },
      },
    );

    assert.equal(harness.getCapturedModel(), "anthropic/claude-sonnet-4-20250514");
  } finally {
    await harness.cleanup();
  }
});
test("dispatch_subagent sanitizes session name to prevent path traversal", async () => {
  const harness = await setup();

  try {
    await harness.tool.execute(
      "tc-7",
      {
        profile: "reviewer",
        objective: "Review changes",
        name: "../../outside",
      },
      null,
      null,
      { cwd: process.cwd() },
    );

    const def = harness.getCapturedDef();
    assert.ok(def.sessionFile.startsWith(harness.state.sessionsDir));
    assert.match(def.sessionFile, /\.\._\.\._outside\.jsonl$/);
  } finally {
    await harness.cleanup();
  }
});
test("dispatch_subagent converts thrown spawner errors into structured tool errors", async () => {
  const harness = await setup(async () => {
    throw new Error("spawn exploded");
  });

  try {
    const error = await harness.tool
      .execute(
        "tc-8",
        {
          profile: "reviewer",
          objective: "Review changes",
        },
        null,
        null,
        { cwd: process.cwd() },
      )
      .then(
        () => assert.fail("expected dispatch_subagent to throw a tool error"),
        (caught) => caught,
      );

    assert.equal(error.name, "DispatchSubagentToolError");
    assert.equal(error.result.details.status, "error");
    assert.equal(error.result.details.exitCode, 1);
    assert.match(error.result.text, /spawn exploded/);
  } finally {
    await harness.cleanup();
  }
});
test("dispatch_subagent passes timeout to spawner def", async () => {
  const harness = await setup();

  try {
    await harness.tool.execute(
      "tc-9",
      {
        profile: "reviewer",
        objective: "Review changes",
        timeout: 60, // 60 seconds
      },
      null,
      null,
      { cwd: process.cwd() },
    );

    const def = harness.getCapturedDef();
    assert.equal(def.timeout, 60000); // Converted to milliseconds
  } finally {
    await harness.cleanup();
  }
});
test("dispatch_subagent uses default timeout when not specified", async () => {
  const harness = await setup();

  try {
    const result = await harness.tool.execute(
      "tc-10",
      {
        profile: "reviewer",
        objective: "Review changes",
      },
      null,
      null,
      { cwd: process.cwd() },
    );

    const def = harness.getCapturedDef();
    assert.equal(def.timeout, undefined); // Default applied in spawnSubagent
    assert.equal(result.details.executionTimeoutSeconds, 14_400);
  } finally {
    await harness.cleanup();
  }
});

test("dispatch_subagent returns cache measurements in model-visible output", async () => {
  const cache = {
    firstTurn: {
      promptTokens: 100,
      freshInputTokens: 100,
      cacheReadTokens: 0,
      cacheWriteTokens: 0,
      uncachedTokens: 100,
      cacheReadRatio: 0,
      outputTokens: 5,
      cost: 0.01,
    },
    aggregate: {
      promptTokens: 200,
      freshInputTokens: 110,
      cacheReadTokens: 90,
      cacheWriteTokens: 0,
      uncachedTokens: 110,
      cacheReadRatio: 0.45,
      outputTokens: 8,
      cost: 0.02,
    },
  };
  const harness = await setup(async () => ({
    output: "measured",
    exitCode: 0,
    elapsed: 1500,
    status: "done",
    usage: {
      turns: 2,
      input: 110,
      output: 8,
      cacheRead: 90,
      cacheWrite: 0,
      cost: 0.02,
      contextTokens: 108,
      cache,
    },
  }));

  try {
    const result = await harness.tool.execute(
      "tc-cache-measurement",
      { profile: "reviewer", objective: "Review changes" },
      null,
      null,
      { cwd: process.cwd() },
    );

    assert.deepEqual(result.details.usage.cache, cache);
    assert.match(result.content[0].text, /first prompt=100 tokens, uncached=100/);
    assert.match(result.content[0].text, /run cache-read ratio=45\.0%/);
    assert.match(result.content[0].text, /result quality\/overlap are not separately inferable/);
  } finally {
    await harness.cleanup();
  }
});

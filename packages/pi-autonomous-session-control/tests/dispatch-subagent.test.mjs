// ---
// summary: covers baseline dispatch profile composition, parent context capture, model context, name safety, errors, and timeouts.
// read_when:
//   - changing the core dispatch_subagent request-to-spawn contract.
// ---

import assert from "node:assert/strict";
import { resolve } from "node:path";
import test from "node:test";
import { SUBAGENT_PROFILES, setup } from "./dispatch-subagent-harness.mjs";

test("dispatch_subagent keeps legacy profile/systemPrompt behavior when no prompt envelope is provided", async () => {
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
    assert.ok(def.systemPrompt.startsWith(`${SUBAGENT_PROFILES.reviewer.systemPrompt}\n\n`));
    assert.match(def.systemPrompt, /DISPATCH TASK CONTRACT/);
    assert.match(def.systemPrompt, /"objective": "Review changes"/);
    assert.doesNotMatch(def.systemPrompt, /"mutationPolicy"/);

    assert.equal(result.details.prompt_applied, false);
    assert.equal(result.details.prompt_name, undefined);
    assert.equal(result.details.prompt_source, undefined);
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
    await harness.tool.execute(
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
  } finally {
    await harness.cleanup();
  }
});

import assert from "node:assert/strict";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";
import { createAscExecutionRuntime, registerDispatchSubagentTool } from "../execution.ts";

test("createAscExecutionRuntime exposes the ASC execution contract for non-tool consumers", async () => {
  const sessionsDir = await mkdtemp(join(tmpdir(), "asc-public-runtime-"));
  const updates = [];
  let capturedDef;
  let capturedModel;
  let capturedCtx;
  let capturedState;

  const runtime = createAscExecutionRuntime({
    sessionsDir,
    modelProvider: () => "test/model",
    spawner: async (def, model, ctx, state) => {
      capturedDef = def;
      capturedModel = model;
      capturedCtx = ctx;
      capturedState = state;
      return {
        output: "runtime ok",
        exitCode: 0,
        elapsed: 1200,
        status: "done",
      };
    },
  });

  try {
    const result = await runtime.execute(
      {
        profile: "custom",
        objective: "Review the integration seam",
        systemPrompt: "Base prompt",
        timeout: 60,
        prompt_name: "nexus",
        prompt_content: "Use the smallest stable public seam.",
        prompt_tags: ["phase:execution", "scope:public-contract"],
      },
      { cwd: process.cwd() },
      (update) => updates.push(update),
    );

    assert.equal(runtime.state.sessionsDir, sessionsDir);
    assert.equal(capturedModel, "test/model");
    assert.deepEqual(capturedCtx, { cwd: process.cwd() });
    assert.equal(capturedState, runtime.state);
    assert.equal(capturedDef.timeout, 60000);
    assert.equal(
      capturedDef.systemPrompt,
      [
        "[Prompt Envelope]",
        "name: nexus",
        "source: vault-client",
        "tags: phase:execution, scope:public-contract",
        "Use the smallest stable public seam.",
        "",
        "---",
        "",
        "Base prompt",
      ].join("\n"),
    );

    assert.deepEqual(updates, [
      {
        text: "Dispatching custom subagent...",
        details: {
          profile: "custom",
          objective: "Review the integration seam",
          status: "spawning",
        },
      },
    ]);

    assert.equal(result.ok, true);
    assert.equal(result.details.status, "done");
    assert.equal(result.details.prompt_applied, true);
    assert.equal(result.details.prompt_name, "nexus");
    assert.deepEqual(result.details.prompt_tags, ["phase:execution", "scope:public-contract"]);
    assert.equal(result.details.fullOutput, "runtime ok");
    assert.match(result.text, /^✓ \[custom\] done in 1s/);
  } finally {
    await rm(sessionsDir, { recursive: true, force: true });
  }
});

test("registerDispatchSubagentTool binds dispatch_subagent to the shared ASC runtime", async () => {
  const sessionsDir = await mkdtemp(join(tmpdir(), "asc-public-tool-"));
  let tool;

  const runtime = createAscExecutionRuntime({
    sessionsDir,
    modelProvider: () => "test/model",
    spawner: async () => ({
      output: "tool ok",
      exitCode: 0,
      elapsed: 250,
      status: "done",
    }),
  });

  const pi = {
    registerTool(definition) {
      tool = definition;
    },
  };

  registerDispatchSubagentTool(pi, runtime);

  try {
    assert.equal(tool.name, "dispatch_subagent");

    const result = await tool.execute(
      "tc-public-tool",
      {
        profile: "reviewer",
        objective: "Review the exported contract",
      },
      null,
      null,
      { cwd: process.cwd() },
    );

    assert.equal(result.details.status, "done");
    assert.equal(result.details.prompt_applied, false);
    assert.match(result.content[0].text, /^✓ \[reviewer\] done in 0s/);
  } finally {
    await rm(sessionsDir, { recursive: true, force: true });
  }
});

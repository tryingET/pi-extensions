import assert from "node:assert/strict";
import { cp, mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import test from "node:test";
import { pathToFileURL } from "node:url";
import { loadExecutionSeamCase } from "../../../governance/execution-seam-cases/index.mjs";
import { createAscExecutionRuntime, getDispatchSubagentDisplayOutput } from "../execution.ts";
import { registerDispatchSubagentTool } from "../extensions/self/subagent.ts";

const timeoutEmptyOutputCase = loadExecutionSeamCase("timeout-empty-output");
const timeoutWhitespaceOutputCase = loadExecutionSeamCase("timeout-whitespace-output");
const assistantProtocolParseErrorCase = loadExecutionSeamCase("assistant-protocol-parse-error");

function escapeRegExp(value) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

async function withFakePiOnPath(scriptBody, run) {
  const tempDir = await mkdtemp(join(tmpdir(), "asc-public-runtime-fake-pi-"));
  const binDir = join(tempDir, "bin");
  const fakePiPath = join(binDir, "pi");
  const previousPath = process.env.PATH;

  await mkdir(binDir, { recursive: true });
  await writeFile(fakePiPath, scriptBody, { mode: 0o755 });
  process.env.PATH = `${binDir}:${previousPath || ""}`;

  try {
    return await run(tempDir);
  } finally {
    if (previousPath === undefined) delete process.env.PATH;
    else process.env.PATH = previousPath;
    await rm(tempDir, { recursive: true, force: true });
  }
}

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

test("execution entrypoint stays headless-importable without package-local node_modules", async () => {
  const fixtureRoot = await mkdtemp(join(tmpdir(), "asc-public-runtime-headless-"));
  const packageRoot = join(fixtureRoot, "package");
  const requiredFiles = [
    "execution.ts",
    "extensions/self/edge-contract-kernel.ts",
    "extensions/self/resolvers/helpers.ts",
    "extensions/self/subagent-edge-contract.ts",
    "extensions/self/subagent-profiles.ts",
    "extensions/self/subagent-prompt-envelope.ts",
    "extensions/self/session-context.ts",
    "extensions/self/subagent-runtime.ts",
    "extensions/self/subagent-session-name.ts",
    "extensions/self/subagent-session.ts",
    "extensions/self/subagent-spawn.ts",
  ];

  try {
    for (const relativePath of requiredFiles) {
      const sourcePath = join(process.cwd(), relativePath);
      const destinationPath = join(packageRoot, relativePath);
      await mkdir(dirname(destinationPath), { recursive: true });
      await cp(sourcePath, destinationPath);
    }

    await import(`${pathToFileURL(join(packageRoot, "execution.ts")).href}?headless=${Date.now()}`);
  } finally {
    await rm(fixtureRoot, { recursive: true, force: true });
  }
});

test("createAscExecutionRuntime forwards AbortSignal to the ASC spawner", async () => {
  const sessionsDir = await mkdtemp(join(tmpdir(), "asc-public-runtime-signal-"));
  let capturedSignal;

  const runtime = createAscExecutionRuntime({
    sessionsDir,
    modelProvider: () => "test/model",
    spawner: async (_def, _model, _ctx, _state, signal) => {
      capturedSignal = signal;
      return {
        output: "signal ok",
        exitCode: 0,
        elapsed: 50,
        status: "done",
      };
    },
  });

  try {
    const controller = new AbortController();
    const result = await runtime.execute(
      {
        profile: "reviewer",
        objective: "Verify signal forwarding",
      },
      { cwd: process.cwd() },
      undefined,
      controller.signal,
    );

    assert.equal(capturedSignal, controller.signal);
    assert.equal(result.details.status, "done");
  } finally {
    await rm(sessionsDir, { recursive: true, force: true });
  }
});

test("createAscExecutionRuntime shapes timeout results without output deterministically", async () => {
  const sessionsDir = await mkdtemp(join(tmpdir(), "asc-public-runtime-timeout-"));

  const runtime = createAscExecutionRuntime({
    sessionsDir,
    modelProvider: () => "test/model",
    spawner: async () => ({ ...timeoutEmptyOutputCase.spawnerResult }),
  });

  try {
    const result = await runtime.execute(
      {
        profile: "reviewer",
        objective: "Verify timeout shaping",
      },
      { cwd: process.cwd() },
    );

    assert.equal(result.ok, false);
    assert.equal(result.details.status, timeoutEmptyOutputCase.expected.publicStatus);
    assert.equal(result.details.failureKind, timeoutEmptyOutputCase.expected.failureKind);
    assert.equal(
      getDispatchSubagentDisplayOutput(result),
      timeoutEmptyOutputCase.expected.executionLikeOutput,
    );
    assert.equal(result.details.displayOutput, timeoutEmptyOutputCase.expected.executionLikeOutput);
    assert.match(
      result.text,
      new RegExp(escapeRegExp(timeoutEmptyOutputCase.expected.publicResultTextIncludes)),
    );
  } finally {
    await rm(sessionsDir, { recursive: true, force: true });
  }
});

test("createAscExecutionRuntime keeps whitespace-only transport output from blanking the fallback body", async () => {
  const sessionsDir = await mkdtemp(join(tmpdir(), "asc-public-runtime-timeout-whitespace-"));

  const runtime = createAscExecutionRuntime({
    sessionsDir,
    modelProvider: () => "test/model",
    spawner: async () => ({ ...timeoutWhitespaceOutputCase.spawnerResult }),
  });

  try {
    const result = await runtime.execute(
      {
        profile: "reviewer",
        objective: "Verify whitespace timeout shaping",
      },
      { cwd: process.cwd() },
    );

    assert.equal(result.details.fullOutput, timeoutWhitespaceOutputCase.spawnerResult.output);
    assert.equal(
      result.details.displayOutput,
      timeoutWhitespaceOutputCase.expected.executionLikeOutput,
    );
    assert.equal(
      getDispatchSubagentDisplayOutput(result),
      timeoutWhitespaceOutputCase.expected.executionLikeOutput,
    );
    assert.match(
      result.text,
      new RegExp(escapeRegExp(timeoutWhitespaceOutputCase.expected.publicResultTextIncludes)),
    );
  } finally {
    await rm(sessionsDir, { recursive: true, force: true });
  }
});

test("createAscExecutionRuntime replays the parse-error casebook against the live pi JSON seam", async () => {
  await withFakePiOnPath("#!/usr/bin/env bash\nprintf '{not-json\\n'\n", async (tempRoot) => {
    const sessionsDir = join(tempRoot, "sessions");
    const runtime = createAscExecutionRuntime({
      sessionsDir,
      modelProvider: () => "test/model",
    });

    const result = await runtime.execute(
      {
        profile: "custom",
        objective: "Verify parse-error shaping",
        tools: "read",
        systemPrompt: "test prompt",
        name: "parse-error-casebook",
        timeout: 1,
      },
      { cwd: tempRoot },
    );

    assert.equal(result.ok, false);
    assert.equal(
      result.details.status,
      assistantProtocolParseErrorCase.dispatchResult.details.status,
    );
    assert.equal(
      result.details.failureKind,
      assistantProtocolParseErrorCase.dispatchResult.details.failureKind,
    );
    assert.equal(
      result.details.fullOutput,
      assistantProtocolParseErrorCase.expected.executionLikeOutput,
    );
    assert.equal(
      result.details.displayOutput,
      assistantProtocolParseErrorCase.expected.executionLikeOutput,
    );
    assert.equal(
      getDispatchSubagentDisplayOutput(result),
      assistantProtocolParseErrorCase.expected.executionLikeOutput,
    );
    assert.equal(
      result.details.executionState?.protocol?.kind,
      assistantProtocolParseErrorCase.dispatchResult.details.executionState.protocol.kind,
    );
    assert.equal(
      result.details.executionState?.protocol?.errorMessage,
      assistantProtocolParseErrorCase.dispatchResult.details.executionState.protocol.errorMessage,
    );
    assert.match(
      result.text,
      new RegExp(escapeRegExp(assistantProtocolParseErrorCase.expected.executionLikeOutput)),
    );
  });
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

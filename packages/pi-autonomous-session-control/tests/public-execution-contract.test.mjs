// summary: "Tests the published ASC execution seam, failure shaping, receipts, and tool binding."
// read_when:
//   - "Changing public execution exports, runtime results, or dispatch integration."

import assert from "node:assert/strict";
import { cp, mkdir, mkdtemp, readFile, rm, stat, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";
import { fileURLToPath, pathToFileURL } from "node:url";
import { loadExecutionSeamCase } from "../../../governance/execution-seam-cases/index.mjs";
import { createAscExecutionRuntime, getDispatchSubagentDisplayOutput } from "../execution.ts";
import { writeDispatchEffectReceipt } from "../extensions/self/effect-receipt.ts";
import { registerDispatchSubagentTool } from "../extensions/self/subagent.ts";

const packageRoot = fileURLToPath(new URL("..", import.meta.url));

const timeoutEmptyOutputCase = loadExecutionSeamCase("timeout-empty-output");
const timeoutWhitespaceOutputCase = loadExecutionSeamCase("timeout-whitespace-output");
const assistantProtocolParseErrorCase = loadExecutionSeamCase("assistant-protocol-parse-error");
const assistantProtocolIncompleteCase = loadExecutionSeamCase("assistant-protocol-incomplete");

function escapeRegExp(value) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

async function withCompiledRuntimeFixture(helperSource, run) {
  const fixtureRoot = await mkdtemp(join(tmpdir(), "asc-compiled-runtime-fixture-"));
  const fixturePackageRoot = join(
    fixtureRoot,
    "node_modules",
    "@tryinget",
    "pi-autonomous-session-control",
  );
  const helperPath = join(
    fixturePackageRoot,
    "dist",
    "extensions",
    "self",
    "subagent-pi-json-filter-v2.js",
  );

  try {
    await mkdir(fixturePackageRoot, { recursive: true });
    await Promise.all([
      cp(join(packageRoot, "package.json"), join(fixturePackageRoot, "package.json")),
      cp(join(packageRoot, "dist"), join(fixturePackageRoot, "dist"), { recursive: true }),
    ]);
    if (helperSource === null) {
      await rm(helperPath);
    } else {
      await writeFile(helperPath, helperSource, "utf8");
    }
    const runtimeModule = await import(
      `${pathToFileURL(join(fixturePackageRoot, "dist", "execution.js")).href}?fixture=${Date.now()}-${Math.random()}`
    );
    return await run({ fixtureRoot, runtimeModule });
  } finally {
    await rm(fixtureRoot, { recursive: true, force: true });
  }
}

test("ASC effect receipts publish privately without overwrite or unsafe attempt ids", async () => {
  const sessionsDir = await mkdtemp(join(tmpdir(), "asc-effect-receipt-"));
  try {
    const params = {
      sessionsDir,
      sessionName: "receipt-test",
      dispatchId: "dispatch-test",
      attemptId: "attempt-test",
      disposition: "settled",
    };
    const receipt = writeDispatchEffectReceipt(params);
    assert.equal(receipt.sessionName, params.sessionName);
    assert.equal((await stat(receipt.receiptPath)).mode & 0o777, 0o600);
    assert.throws(() => writeDispatchEffectReceipt(params), /EEXIST/);
    assert.throws(
      () => writeDispatchEffectReceipt({ ...params, attemptId: "../escape" }),
      /filename-safe attempt id/,
    );
  } finally {
    await rm(sessionsDir, { recursive: true, force: true });
  }
});

test("public execution export target stays published, compiled, and typechecked", async () => {
  const [packageJson, tsconfigJson, runtimeTsconfigJson] = await Promise.all([
    readFile(join(packageRoot, "package.json"), "utf8"),
    readFile(join(packageRoot, "tsconfig.json"), "utf8"),
    readFile(join(packageRoot, "tsconfig.runtime.json"), "utf8"),
  ]);
  const packageDefinition = JSON.parse(packageJson);
  const tsconfig = JSON.parse(tsconfigJson);
  const runtimeTsconfig = JSON.parse(runtimeTsconfigJson);

  assert.equal(packageDefinition.exports?.["./execution"], "./dist/execution.js");
  assert.ok(packageDefinition.files?.includes("dist"));
  assert.ok(tsconfig.include?.includes("execution.ts"));
  assert.ok(runtimeTsconfig.include?.includes("execution.ts"));
  assert.ok(runtimeTsconfig.include?.includes("extensions/self/subagent-pi-json-filter.ts"));
  assert.ok(runtimeTsconfig.include?.includes("extensions/self/subagent-pi-json-filter-v2.ts"));
  assert.ok(runtimeTsconfig.include?.includes("extensions/self/subagent-protocol-v2.ts"));
});

async function withFakePiOnPath(scriptBody, run, version = "0.80.6") {
  const tempDir = await mkdtemp(join(tmpdir(), "asc-public-runtime-fake-pi-"));
  const binDir = join(tempDir, "bin");
  const fakePiPath = join(binDir, "pi");
  const scenarioPath = join(binDir, "pi-scenario");
  const previousPath = process.env.PATH;

  await mkdir(binDir, { recursive: true });
  await writeFile(scenarioPath, scriptBody, { mode: 0o755 });
  await writeFile(
    fakePiPath,
    `#!/usr/bin/env bash\nif [[ "$1" == "--version" ]]; then printf '%s\\n' ${JSON.stringify(version)}; exit 0; fi\nexec ${JSON.stringify(scenarioPath)} "$@"\n`,
    { mode: 0o755 },
  );
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
        env: {
          PI_PROVENANCE_REVIEW_LANE_ID: "lane-1",
          PI_PROVENANCE_OUTPUT_FILE: "/tmp/lane-1.json",
        },
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
    assert.deepEqual(capturedDef.env, {
      PI_PROVENANCE_REVIEW_LANE_ID: "lane-1",
      PI_PROVENANCE_OUTPUT_FILE: "/tmp/lane-1.json",
    });
    const expectedBasePrompt = [
      "[Prompt Envelope]",
      "name: nexus",
      "source: vault-client",
      "tags: phase:execution, scope:public-contract",
      "Use the smallest stable public seam.",
      "",
      "---",
      "",
      "Base prompt",
    ].join("\n");
    assert.equal(capturedDef.systemPrompt, undefined);
    assert.ok(capturedDef.userPrompt.startsWith(`${expectedBasePrompt}\n\n`));
    assert.match(capturedDef.userPrompt, /DISPATCH TASK CONTRACT/);
    assert.match(capturedDef.userPrompt, /"objective": "Review the integration seam"/);

    assert.equal(updates.length, 1);
    assert.equal(updates[0].text, "Dispatching custom subagent...");
    assert.equal(updates[0].details.profile, "custom");
    assert.equal(updates[0].details.objective, "Review the integration seam");
    assert.equal(updates[0].details.status, "spawning");
    assert.equal(updates[0].details.progressPhase, "spawning");
    assert.equal(updates[0].details.progressSequence, 1);
    assert.equal(typeof updates[0].details.dispatchId, "string");
    assert.equal(typeof updates[0].details.attemptId, "string");

    assert.equal(result.ok, true);
    assert.equal(result.details.status, "done");
    assert.equal(result.details.prompt_applied, true);
    assert.equal(result.details.prompt_name, "nexus");
    assert.deepEqual(result.details.prompt_tags, ["phase:execution", "scope:public-contract"]);
    assert.equal(result.details.fullOutput, "runtime ok");
    assert.equal(result.details.effectReceipt.disposition, "settled");
    assert.equal(result.details.effectReceipt.dispatchId, result.details.dispatchId);
    assert.equal(result.details.effectReceipt.attemptId, result.details.attemptId);
    assert.deepEqual(
      JSON.parse(await readFile(result.details.effectReceipt.receiptPath, "utf8")),
      result.details.effectReceipt,
    );
    assert.match(result.text, /^✓ \[custom\] done in 1s/);
  } finally {
    await rm(sessionsDir, { recursive: true, force: true });
  }
});

test("createAscExecutionRuntime rejects unapproved request env before spawn without leaking activeCount", async () => {
  const sessionsDir = await mkdtemp(join(tmpdir(), "asc-public-runtime-env-policy-"));
  let spawnerCalled = false;

  const runtime = createAscExecutionRuntime({
    sessionsDir,
    modelProvider: () => "test/model",
    spawner: async () => {
      spawnerCalled = true;
      return {
        output: "should not spawn",
        exitCode: 0,
        elapsed: 1,
        status: "done",
      };
    },
  });

  try {
    for (const key of ["PATH", "NODE_OPTIONS", "PI_CODING_AGENT_DIR"]) {
      const result = await runtime.execute(
        {
          profile: "reviewer",
          objective: "Verify env policy failure shaping",
          env: { [key]: "malicious" },
        },
        { cwd: process.cwd() },
      );

      assert.equal(result.ok, false);
      assert.equal(result.details.status, "error");
      assert.equal(result.details.reason, "env_policy_failed");
      assert.equal(result.details.failureKind, "env_policy_failed");
      assert.equal(result.details.activeCount, 0);
      assert.equal(runtime.state.activeCount, 0);
      assert.match(result.text, /Invalid dispatch_subagent env/);
      assert.match(result.text, new RegExp(`Rejected request env key: ${key}`));
    }

    assert.equal(spawnerCalled, false);
  } finally {
    await rm(sessionsDir, { recursive: true, force: true });
  }
});

test("createAscExecutionRuntime returns structured model-selection errors without leaking activeCount", async () => {
  const sessionsDir = await mkdtemp(join(tmpdir(), "asc-public-runtime-model-failure-"));
  let spawnerCalled = false;

  const runtime = createAscExecutionRuntime({
    sessionsDir,
    modelProvider: () => {
      throw new Error("model provider exploded");
    },
    spawner: async () => {
      spawnerCalled = true;
      return {
        output: "should not spawn",
        exitCode: 0,
        elapsed: 1,
        status: "done",
      };
    },
  });

  try {
    const result = await runtime.execute(
      {
        profile: "reviewer",
        objective: "Verify model failure shaping",
      },
      { cwd: process.cwd() },
    );

    assert.equal(spawnerCalled, false);
    assert.equal(runtime.state.activeCount, 0);
    assert.equal(result.ok, false);
    assert.equal(result.details.status, "error");
    assert.equal(result.details.reason, "model_selection_failed");
    assert.equal(result.details.failureKind, "model_selection_failed");
    assert.equal(result.details.activeCount, 0);
    assert.equal(typeof result.details.maxConcurrent, "number");
    assert.equal(result.details.displayOutput, result.details.fullOutput);
    assert.equal(result.details.effectReceipt.disposition, "confirmed_no_effects");
    assert.equal(result.details.effectReceipt.dispatchId, result.details.dispatchId);
    assert.equal(result.details.effectReceipt.attemptId, result.details.attemptId);
    assert.deepEqual(
      JSON.parse(await readFile(result.details.effectReceipt.receiptPath, "utf8")),
      result.details.effectReceipt,
    );
    assert.match(result.text, /^✗ \[reviewer\] error before spawn/);
    assert.match(result.text, /model provider exploded/);
  } finally {
    await rm(sessionsDir, { recursive: true, force: true });
  }
});

test("createAscExecutionRuntime rejects whitespace-only model strings before spawn", async () => {
  const sessionsDir = await mkdtemp(join(tmpdir(), "asc-public-runtime-empty-model-"));
  let spawnerCalled = false;

  const runtime = createAscExecutionRuntime({
    sessionsDir,
    modelProvider: () => ({
      requestedModel: "   ",
      effectiveModel: "test/model",
      source: "session",
    }),
    spawner: async () => {
      spawnerCalled = true;
      return {
        output: "should not spawn",
        exitCode: 0,
        elapsed: 1,
        status: "done",
      };
    },
  });

  try {
    const result = await runtime.execute(
      {
        profile: "reviewer",
        objective: "Verify empty model failure shaping",
      },
      { cwd: process.cwd() },
    );

    assert.equal(spawnerCalled, false);
    assert.equal(runtime.state.activeCount, 0);
    assert.equal(result.ok, false);
    assert.equal(result.details.status, "error");
    assert.equal(result.details.reason, "model_selection_failed");
    assert.equal(result.details.failureKind, "model_selection_failed");
    assert.equal(result.details.activeCount, 0);
    assert.equal(typeof result.details.maxConcurrent, "number");
    assert.match(result.text, /^✗ \[reviewer\] error before spawn/);
    assert.match(result.text, /empty requested model string/);
  } finally {
    await rm(sessionsDir, { recursive: true, force: true });
  }
});

test("compiled execution entrypoint stays headless-importable without package-local node_modules", async () => {
  const fixtureRoot = await mkdtemp(join(tmpdir(), "asc-public-runtime-headless-"));
  const fixturePackageRoot = join(fixtureRoot, "package");

  try {
    await mkdir(fixturePackageRoot, { recursive: true });
    await Promise.all([
      cp(join(packageRoot, "package.json"), join(fixturePackageRoot, "package.json")),
      cp(join(packageRoot, "dist"), join(fixturePackageRoot, "dist"), { recursive: true }),
    ]);

    await import(
      `${pathToFileURL(join(fixturePackageRoot, "dist", "execution.js")).href}?headless=${Date.now()}`
    );
  } finally {
    await rm(fixtureRoot, { recursive: true, force: true });
  }
});

test("compiled owned transport persists conservative effect receipts across bootstrap ambiguity", async (t) => {
  const scenarios = [
    {
      name: "missing-helper",
      helperSource: null,
      expectedFailureKind: "subagent_helper_bootstrap_failed",
      expectedIntent: false,
      expectedDisposition: "confirmed_no_effects",
    },
    {
      name: "malformed-before-intent",
      helperSource: `process.stdout.write("{not-json\\n");\nprocess.exitCode = 1;\n`,
      expectedFailureKind: "assistant_protocol_parse_error",
      expectedIntent: undefined,
      expectedDisposition: "effect_indeterminate",
    },
    {
      name: "readiness-before-intent",
      helperSource: `process.stdout.write(${JSON.stringify(
        `${JSON.stringify({
          type: "transport_ready",
          settlementMode: "agent_settled",
          piVersion: "0.80.6",
        })}\n`,
      )});\nprocess.exitCode = 1;\n`,
      expectedFailureKind: "assistant_protocol_parse_error",
      expectedIntent: undefined,
      expectedDisposition: "effect_indeterminate",
    },
    {
      name: "intent-overflow",
      helperSource: `process.stdout.write(${JSON.stringify(
        `${JSON.stringify({ type: "raw_child_spawn_intent" })}\n`,
      )});\nprocess.exitCode = 1;\n`,
      eventBufferBytes: "0",
      expectedFailureKind: "assistant_protocol_parse_error",
      expectedIntent: undefined,
      expectedDisposition: "effect_indeterminate",
    },
  ];

  for (const scenario of scenarios) {
    await t.test(scenario.name, async () => {
      await withCompiledRuntimeFixture(
        scenario.helperSource,
        async ({ fixtureRoot, runtimeModule }) => {
          const previousEventBuffer = process.env.PI_SUBAGENT_EVENT_BUFFER_BYTES;
          if (scenario.eventBufferBytes === undefined) {
            delete process.env.PI_SUBAGENT_EVENT_BUFFER_BYTES;
          } else {
            process.env.PI_SUBAGENT_EVENT_BUFFER_BYTES = scenario.eventBufferBytes;
          }
          try {
            const runtime = runtimeModule.createAscExecutionRuntime({
              sessionsDir: join(fixtureRoot, "sessions"),
              modelProvider: () => "test/model",
            });
            const result = await runtime.execute(
              { profile: "reviewer", objective: `Verify ${scenario.name}` },
              { cwd: fixtureRoot },
            );

            assert.equal(result.ok, false);
            assert.equal(result.details.failureKind, scenario.expectedFailureKind);
            assert.equal(
              result.details.executionState?.transport.rawChildSpawnIntent,
              scenario.expectedIntent,
            );
            assert.equal(result.details.effectReceipt.disposition, scenario.expectedDisposition);
            assert.deepEqual(
              JSON.parse(await readFile(result.details.effectReceipt.receiptPath, "utf8")),
              result.details.effectReceipt,
            );
          } finally {
            if (previousEventBuffer === undefined) {
              delete process.env.PI_SUBAGENT_EVENT_BUFFER_BYTES;
            } else {
              process.env.PI_SUBAGENT_EVENT_BUFFER_BYTES = previousEventBuffer;
            }
          }
        },
      );
    });
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

test("createAscExecutionRuntime replays the incomplete-protocol casebook against a clean transport exit", async () => {
  const rawEvent = JSON.stringify({
    type: "message_update",
    assistantMessageEvent: { type: "text_delta", delta: "partial output" },
  });
  await withFakePiOnPath(
    `#!/usr/bin/env bash\nprintf '%s\\n' '${rawEvent}'\n`,
    async (tempRoot) => {
      const runtime = createAscExecutionRuntime({
        sessionsDir: join(tempRoot, "sessions"),
        modelProvider: () => "test/model",
      });
      const result = await runtime.execute(
        {
          profile: "custom",
          objective: "Verify incomplete protocol shaping",
          tools: "read",
          systemPrompt: "test prompt",
          name: "incomplete-protocol-casebook",
          timeout: 1,
        },
        { cwd: tempRoot },
      );

      assert.equal(result.ok, false);
      assert.equal(
        result.details.status,
        assistantProtocolIncompleteCase.dispatchResult.details.status,
      );
      assert.equal(
        result.details.failureKind,
        assistantProtocolIncompleteCase.expected.failureKind,
      );
      assert.equal(
        result.details.displayOutput,
        assistantProtocolIncompleteCase.expected.executionLikeOutput,
      );
      assert.equal(
        result.details.executionState?.protocol?.kind,
        assistantProtocolIncompleteCase.dispatchResult.details.executionState.protocol.kind,
      );
    },
  );
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

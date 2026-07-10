import assert from "node:assert/strict";
import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";
import { executeToolExpectFailure, setup } from "./dispatch-subagent-harness.mjs";

test("dispatch_subagent returns a structured model-selection error without leaking activeCount", async () => {
  const harness = await setup(undefined, () => {
    throw new Error("model provider exploded");
  });

  try {
    const result = await executeToolExpectFailure(
      harness.tool,
      "tc-model-provider-throw",
      {
        profile: "reviewer",
        objective: "Review changes",
      },
      null,
      null,
      { cwd: process.cwd() },
    );

    assert.equal(result.details.status, "error");
    assert.equal(result.details.reason, "model_selection_failed");
    assert.equal(result.details.failureKind, "model_selection_failed");
    assert.equal(result.details.activeCount, 0);
    assert.equal(typeof result.details.maxConcurrent, "number");
    assert.equal(harness.state.activeCount, 0);
    assert.equal(harness.getCapturedDef(), undefined);
    assert.equal(harness.getCapturedModel(), undefined);
    assert.match(result.content[0].text, /Model selection failed before subagent spawn/);
    assert.match(result.content[0].text, /model provider exploded/);
  } finally {
    await harness.cleanup();
  }
});
test("dispatch_subagent rejects whitespace-only model strings before spawn without leaking activeCount", async () => {
  const harness = await setup(undefined, () => "   ");

  try {
    const result = await executeToolExpectFailure(
      harness.tool,
      "tc-model-provider-empty-string",
      {
        profile: "reviewer",
        objective: "Review changes",
      },
      null,
      null,
      { cwd: process.cwd() },
    );

    assert.equal(result.details.status, "error");
    assert.equal(result.details.reason, "model_selection_failed");
    assert.equal(result.details.failureKind, "model_selection_failed");
    assert.equal(result.details.activeCount, 0);
    assert.equal(typeof result.details.maxConcurrent, "number");
    assert.equal(harness.state.activeCount, 0);
    assert.equal(harness.getCapturedDef(), undefined);
    assert.equal(harness.getCapturedModel(), undefined);
    assert.match(result.content[0].text, /empty model string/);
  } finally {
    await harness.cleanup();
  }
});
test("dispatch_subagent allows PI_PROVENANCE request env through to the spawner", async () => {
  const harness = await setup();

  try {
    const result = await harness.tool.execute(
      "tc-env-provenance-allowed",
      {
        profile: "reviewer",
        objective: "Review changes",
        env: {
          PI_PROVENANCE_REVIEW_LANE_ID: "lane-dispatch",
          PI_PROVENANCE_OUTPUT_FILE: "/tmp/lane-dispatch.json",
        },
      },
      null,
      null,
      { cwd: process.cwd() },
    );

    assert.equal(result.details.status, "done");
    assert.deepEqual(harness.getCapturedDef().env, {
      PI_PROVENANCE_REVIEW_LANE_ID: "lane-dispatch",
      PI_PROVENANCE_OUTPUT_FILE: "/tmp/lane-dispatch.json",
    });
  } finally {
    await harness.cleanup();
  }
});
test("dispatch_subagent rejects dangerous request env before spawn without leaking activeCount", async () => {
  for (const key of ["PATH", "NODE_OPTIONS", "PI_CODING_AGENT_DIR"]) {
    const harness = await setup();

    try {
      const result = await executeToolExpectFailure(
        harness.tool,
        `tc-env-reject-${key}`,
        {
          profile: "reviewer",
          objective: "Review changes",
          env: {
            [key]: "malicious",
          },
        },
        null,
        null,
        { cwd: process.cwd() },
      );

      assert.equal(result.details.status, "error");
      assert.equal(result.details.reason, "env_policy_failed");
      assert.equal(result.details.failureKind, "env_policy_failed");
      assert.equal(result.details.activeCount, 0);
      assert.equal(harness.state.activeCount, 0);
      assert.equal(harness.getCapturedDef(), undefined);
      assert.match(result.content[0].text, /Invalid dispatch_subagent env/);
      assert.match(result.content[0].text, new RegExp(`Rejected request env key: ${key}`));
    } finally {
      await harness.cleanup();
    }
  }
});
test("dispatch_subagent rejects empty requested/effective model selections before spawn", async () => {
  const cases = [
    {
      name: "requested",
      selection: { requestedModel: "   ", effectiveModel: "test/model", source: "session" },
      message: /empty requested model string/,
    },
    {
      name: "effective",
      selection: { requestedModel: "test/model", effectiveModel: "   ", source: "session" },
      message: /empty effective model string/,
    },
  ];

  for (const testCase of cases) {
    const harness = await setup(undefined, () => testCase.selection);

    try {
      const result = await executeToolExpectFailure(
        harness.tool,
        `tc-model-provider-empty-${testCase.name}`,
        {
          profile: "reviewer",
          objective: "Review changes",
        },
        null,
        null,
        { cwd: process.cwd() },
      );

      assert.equal(result.details.status, "error");
      assert.equal(result.details.reason, "model_selection_failed");
      assert.equal(result.details.failureKind, "model_selection_failed");
      assert.equal(result.details.activeCount, 0);
      assert.equal(typeof result.details.maxConcurrent, "number");
      assert.equal(harness.state.activeCount, 0);
      assert.equal(harness.getCapturedDef(), undefined);
      assert.equal(harness.getCapturedModel(), undefined);
      assert.match(result.content[0].text, testCase.message);
    } finally {
      await harness.cleanup();
    }
  }
});
test("dispatch_subagent auto-loads pi-multi-pass when the current model uses a numeric-suffix provider alias", async () => {
  const previous = process.env.PI_MULTI_PASS_EXTENSION;
  const extensionDir = await mkdtemp(join(tmpdir(), "subagent-multi-pass-extension-"));
  const extensionPath = join(extensionDir, "multi-sub.ts");
  await writeFile(extensionPath, "export default () => {};\n");

  process.env.PI_MULTI_PASS_EXTENSION = extensionPath;
  const harness = await setup(undefined, () => ({
    requestedModel: "openai-codex-2/gpt-5.4",
    effectiveModel: "openai-codex-2/gpt-5.4",
    source: "session",
  }));

  try {
    const result = await harness.tool.execute(
      "tc-model-normalization",
      {
        profile: "reviewer",
        objective: "Review changes",
      },
      null,
      null,
      { cwd: process.cwd(), model: { provider: "openai-codex-2", id: "gpt-5.4" } },
    );

    assert.equal(harness.getCapturedModel(), "openai-codex-2/gpt-5.4");
    assert.deepEqual(harness.getCapturedDef().extensionSources, [extensionPath]);
    assert.equal(result.details.requestedModel, "openai-codex-2/gpt-5.4");
    assert.equal(result.details.effectiveModel, "openai-codex-2/gpt-5.4");
    assert.deepEqual(result.details.loadedExtensions, [extensionPath]);
  } finally {
    if (previous === undefined) {
      delete process.env.PI_MULTI_PASS_EXTENSION;
    } else {
      process.env.PI_MULTI_PASS_EXTENSION = previous;
    }
    await rm(extensionDir, { recursive: true, force: true });
    await harness.cleanup();
  }
});
test("dispatch_subagent uses context provider for extension inference when effective model id is bare", async () => {
  const previous = process.env.PI_MULTI_PASS_EXTENSION;
  const extensionDir = await mkdtemp(join(tmpdir(), "subagent-bare-model-extension-"));
  const extensionPath = join(extensionDir, "multi-sub.ts");
  await writeFile(extensionPath, "export default () => {};\n");
  process.env.PI_MULTI_PASS_EXTENSION = extensionPath;

  const anthropicHarness = await setup(undefined, () => "claude-sonnet-4-5");
  const aliasHarness = await setup(undefined, () => "gpt-5.2");
  try {
    await anthropicHarness.tool.execute(
      "tc-bare-anthropic-model",
      { profile: "reviewer", objective: "Review bare model inference" },
      null,
      null,
      { cwd: process.cwd(), model: { provider: "anthropic", id: "claude-sonnet-4-5" } },
    );
    assert.deepEqual(anthropicHarness.getCapturedDef().extensionSources, []);

    await aliasHarness.tool.execute(
      "tc-bare-alias-model",
      { profile: "reviewer", objective: "Review bare alias inference" },
      null,
      null,
      { cwd: process.cwd(), model: { provider: "openai-codex-2", id: "gpt-5.2" } },
    );
    assert.deepEqual(aliasHarness.getCapturedDef().extensionSources, [extensionPath]);
  } finally {
    if (previous === undefined) delete process.env.PI_MULTI_PASS_EXTENSION;
    else process.env.PI_MULTI_PASS_EXTENSION = previous;
    await anthropicHarness.cleanup();
    await aliasHarness.cleanup();
    await rm(extensionDir, { recursive: true, force: true });
  }
});

test("dispatch_subagent loads explicit child extensions for extension-provided tools", async () => {
  const previous = process.env.PI_VAULT_CLIENT_EXTENSION;
  const extensionDir = await mkdtemp(join(tmpdir(), "subagent-vault-extension-"));
  const extensionPath = join(extensionDir, "vault.ts");
  await writeFile(extensionPath, "export default () => {};\n");

  process.env.PI_VAULT_CLIENT_EXTENSION = extensionPath;
  const harness = await setup();

  try {
    const result = await harness.tool.execute(
      "tc-child-extension-request",
      {
        profile: "reviewer",
        objective: "Use vault tools",
        extensions: ["vault-client"],
      },
      null,
      null,
      { cwd: process.cwd() },
    );

    assert.deepEqual(harness.getCapturedDef().extensionSources, [extensionPath]);
    assert.deepEqual(result.details.loadedExtensions, [extensionPath]);
  } finally {
    if (previous === undefined) {
      delete process.env.PI_VAULT_CLIENT_EXTENSION;
    } else {
      process.env.PI_VAULT_CLIENT_EXTENSION = previous;
    }
    await rm(extensionDir, { recursive: true, force: true });
    await harness.cleanup();
  }
});
test("dispatch_subagent fails clearly when a subscription-backed alias needs pi-multi-pass but the child bootstrap is unavailable", async () => {
  const previous = process.env.PI_MULTI_PASS_EXTENSION;
  process.env.PI_MULTI_PASS_EXTENSION = "/tmp/does-not-exist-pi-multi-pass.ts";
  const harness = await setup(undefined, () => ({
    requestedModel: "openai-codex-2/gpt-5.4",
    effectiveModel: "openai-codex-2/gpt-5.4",
    source: "session",
  }));

  try {
    const result = await executeToolExpectFailure(
      harness.tool,
      "tc-missing-multi-pass",
      {
        profile: "reviewer",
        objective: "Review changes",
      },
      null,
      null,
      { cwd: process.cwd(), model: { provider: "openai-codex-2", id: "gpt-5.4" } },
    );

    assert.equal(result.details.failureKind, "extension_bootstrap_missing");
    assert.match(result.content[0].text, /pi-multi-pass extension/);
  } finally {
    if (previous === undefined) {
      delete process.env.PI_MULTI_PASS_EXTENSION;
    } else {
      process.env.PI_MULTI_PASS_EXTENSION = previous;
    }
    await harness.cleanup();
  }
});

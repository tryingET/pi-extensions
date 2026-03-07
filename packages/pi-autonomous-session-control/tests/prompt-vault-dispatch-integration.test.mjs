import assert from "node:assert/strict";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";
import {
  createSubagentState,
  registerSubagentTool,
  SUBAGENT_PROFILES,
} from "../extensions/self/subagent.ts";

function toPromptEnvelope(vaultPayload) {
  return {
    prompt_name: vaultPayload.name,
    prompt_content: vaultPayload.content,
    prompt_tags: vaultPayload.tags,
    prompt_source: vaultPayload.source ?? "vault-client",
  };
}

async function setup() {
  const sessionsDir = await mkdtemp(join(tmpdir(), "prompt-vault-integration-test-"));
  const state = createSubagentState(sessionsDir);

  let registeredTool;
  let capturedDef;

  const pi = {
    registerTool(definition) {
      registeredTool = definition;
    },
  };

  const spawner = async (def) => {
    capturedDef = def;
    return {
      output: "ok",
      exitCode: 0,
      elapsed: 100,
      status: "done",
    };
  };

  registerSubagentTool(pi, state, () => "test/model", spawner);

  return {
    tool: registeredTool,
    getCapturedDef: () => capturedDef,
    cleanup: async () => {
      await rm(sessionsDir, { recursive: true, force: true });
    },
  };
}

test("mock vault payload applies envelope and preserves provenance through dispatch_subagent", async () => {
  const harness = await setup();

  try {
    const vaultPayload = {
      name: "meta-orchestration",
      content: "Choose the right phase and execution mode before acting.",
      tags: ["phase:validation", "formalization:bounded"],
      source: "vault-client",
    };

    const result = await harness.tool.execute(
      "tc-vault-1",
      {
        profile: "reviewer",
        objective: "Review architecture plan",
        ...toPromptEnvelope(vaultPayload),
      },
      null,
      null,
      { cwd: process.cwd() },
    );

    const def = harness.getCapturedDef();
    assert.match(def.systemPrompt, /^\[Prompt Envelope\]/);
    assert.match(def.systemPrompt, /name: meta-orchestration/);
    assert.match(def.systemPrompt, /source: vault-client/);
    assert.match(def.systemPrompt, /Choose the right phase and execution mode before acting\./);
    assert.match(def.systemPrompt, /---\n\nYou are a code reviewer agent/);

    assert.equal(result.details.prompt_applied, true);
    assert.equal(result.details.prompt_name, "meta-orchestration");
    assert.equal(result.details.prompt_source, "vault-client");
    assert.deepEqual(result.details.prompt_tags, ["phase:validation", "formalization:bounded"]);
    assert.equal(result.details.prompt_warning, undefined);
  } finally {
    await harness.cleanup();
  }
});

test("mock vault payload without content fails soft and keeps legacy reviewer prompt", async () => {
  const harness = await setup();

  try {
    const vaultPayload = {
      name: "meta-orchestration",
      content: "",
      tags: ["phase:validation"],
      source: "vault-client",
    };

    const result = await harness.tool.execute(
      "tc-vault-2",
      {
        profile: "reviewer",
        objective: "Review architecture plan",
        ...toPromptEnvelope(vaultPayload),
      },
      null,
      null,
      { cwd: process.cwd() },
    );

    const def = harness.getCapturedDef();
    assert.equal(def.systemPrompt, SUBAGENT_PROFILES.reviewer.systemPrompt);
    assert.equal(result.details.prompt_applied, false);
    assert.equal(result.details.prompt_name, "meta-orchestration");
    assert.equal(result.details.prompt_source, "vault-client");
    assert.equal(
      result.details.prompt_warning,
      "prompt_content was provided but empty; no prompt was injected. Provide non-empty prompt_content to apply a prompt envelope.",
    );
  } finally {
    await harness.cleanup();
  }
});

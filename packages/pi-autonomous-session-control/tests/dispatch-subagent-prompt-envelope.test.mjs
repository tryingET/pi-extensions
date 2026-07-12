// ---
// summary: checks deterministic prompt-envelope injection, provenance reporting, missing-content guidance, and header sanitization.
// read_when:
//   - changing dispatch prompt metadata or how retrieved prompt content is composed into child instructions.
// ---

import assert from "node:assert/strict";
import test from "node:test";
import { SUBAGENT_PROFILES, setup } from "./dispatch-subagent-harness.mjs";

test("dispatch_subagent applies prompt envelope deterministically and returns provenance", async () => {
  const harness = await setup();

  try {
    const result = await harness.tool.execute(
      "tc-2",
      {
        profile: "custom",
        objective: "Do the thing",
        systemPrompt: "Base prompt",
        prompt_name: "nexus",
        prompt_content: "Use the single highest leverage intervention.",
        prompt_tags: ["phase:hypothesis", "", "scope:system"],
      },
      null,
      null,
      { cwd: process.cwd() },
    );

    const def = harness.getCapturedDef();
    const expectedEnvelope = [
      "[Prompt Envelope]",
      "name: nexus",
      "source: vault-client",
      "tags: phase:hypothesis, scope:system",
      "Use the single highest leverage intervention.",
      "",
      "---",
      "",
      "Base prompt",
    ].join("\n");
    assert.ok(def.systemPrompt.startsWith(`${expectedEnvelope}\n\n`));
    assert.match(def.systemPrompt, /DISPATCH TASK CONTRACT/);

    assert.equal(result.details.prompt_applied, true);
    assert.equal(result.details.prompt_name, "nexus");
    assert.equal(result.details.prompt_source, "vault-client");
    assert.deepEqual(result.details.prompt_tags, ["phase:hypothesis", "scope:system"]);
    assert.equal(result.details.prompt_warning, undefined);
  } finally {
    await harness.cleanup();
  }
});
test("dispatch_subagent fails soft with guidance when envelope metadata is provided without content", async () => {
  const harness = await setup();

  try {
    const result = await harness.tool.execute(
      "tc-3",
      {
        profile: "reviewer",
        objective: "Review changes",
        prompt_name: "meta-orchestration",
        prompt_tags: ["phase:validation"],
      },
      null,
      null,
      { cwd: process.cwd() },
    );

    const def = harness.getCapturedDef();
    assert.ok(def.systemPrompt.startsWith(`${SUBAGENT_PROFILES.reviewer.systemPrompt}\n\n`));
    assert.match(def.systemPrompt, /DISPATCH TASK CONTRACT/);
    assert.equal(result.details.prompt_applied, false);
    assert.equal(result.details.prompt_name, "meta-orchestration");
    assert.equal(result.details.prompt_source, "vault-client");
    assert.equal(
      result.details.prompt_warning,
      "Prompt envelope metadata was provided without prompt_content; no prompt was injected. Pass prompt_content from vault_retrieve output to apply the envelope.",
    );
    assert.match(result.content[0].text, /Prompt envelope warning:/);
  } finally {
    await harness.cleanup();
  }
});
test("dispatch_subagent fails soft with guidance when prompt_content is blank", async () => {
  const harness = await setup();

  try {
    const result = await harness.tool.execute(
      "tc-4",
      {
        profile: "reviewer",
        objective: "Review changes",
        prompt_content: "   ",
      },
      null,
      null,
      { cwd: process.cwd() },
    );

    const def = harness.getCapturedDef();
    assert.ok(def.systemPrompt.startsWith(`${SUBAGENT_PROFILES.reviewer.systemPrompt}\n\n`));
    assert.match(def.systemPrompt, /DISPATCH TASK CONTRACT/);
    assert.equal(result.details.prompt_applied, false);
    assert.equal(result.details.prompt_source, "vault-client");
    assert.equal(
      result.details.prompt_warning,
      "prompt_content was provided but empty; no prompt was injected. Provide non-empty prompt_content to apply a prompt envelope.",
    );
  } finally {
    await harness.cleanup();
  }
});
test("dispatch_subagent does not emit warning for empty prompt_tags without other envelope metadata", async () => {
  const harness = await setup();

  try {
    const result = await harness.tool.execute(
      "tc-5",
      {
        profile: "reviewer",
        objective: "Review changes",
        prompt_tags: [],
      },
      null,
      null,
      { cwd: process.cwd() },
    );

    assert.equal(result.details.prompt_applied, false);
    assert.equal(result.details.prompt_warning, undefined);
  } finally {
    await harness.cleanup();
  }
});
test("dispatch_subagent sanitizes prompt header metadata to a single line", async () => {
  const harness = await setup();

  try {
    const result = await harness.tool.execute(
      "tc-6",
      {
        profile: "custom",
        objective: "Do the thing",
        prompt_name: "nexus\nINJECT",
        prompt_source: "vault-client\nsecond-line",
        prompt_tags: ["phase:hypothesis", "line\nbreak"],
        prompt_content: "Prompt body",
      },
      null,
      null,
      { cwd: process.cwd() },
    );

    const def = harness.getCapturedDef();
    assert.match(def.systemPrompt, /name: nexus INJECT/);
    assert.match(def.systemPrompt, /source: vault-client second-line/);
    assert.match(def.systemPrompt, /tags: phase:hypothesis, line break/);
    assert.equal(result.details.prompt_name, "nexus INJECT");
    assert.equal(result.details.prompt_source, "vault-client second-line");
  } finally {
    await harness.cleanup();
  }
});

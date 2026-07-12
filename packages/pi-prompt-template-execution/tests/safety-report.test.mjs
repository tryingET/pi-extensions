/**
 * summary: "tests non-live safety reports for manifest exposure, command snapshots, collisions, and cutover blockers."
 * read_when:
 *   - "changing safety-report blocker logic or candidate manifest posture."
 */
import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { buildNonLiveSafetyReport } from "../src/safety-report.js";

function prompt(name) {
  return {
    name,
    description: name,
    content: "Body",
    models: ["zai/glm-5.1"],
    restore: true,
    source: "user",
    filePath: `/prompts/${name}.md`,
  };
}

describe("non-live safety report", () => {
  it("reports the current non-live candidate posture and expected /commit collision", () => {
    const report = buildNonLiveSafetyReport({
      promptExecutionManifest: { name: "@tryinget/pi-prompt-template-execution" },
      sessionCompactionManifest: { name: "pi-session-compaction" },
      loadResult: { prompts: new Map([["commit", prompt("commit")]]), diagnostics: [] },
      existingCommands: [{ invocationName: "/commit", source: "npm:pi-prompt-template-model" }],
      externalPromptTemplateModelInstalled: true,
    });

    assert.equal(report.kind, "pi-prompt-template-execution/non-live-safety-report/v1");
    assert.equal(report.liveMutation, false);
    assert.equal(report.safeAsNonLiveCandidate, true);
    assert.equal(report.liveCutoverBlocked, true);
    assert.deepEqual(report.commandCollisions, ["commit"]);
    assert.deepEqual(report.existingCommands, ["commit"]);
    assert.deepEqual(report.blockers, [
      "existing_command:commit",
      "external_prompt_template_model_installed",
    ]);
  });

  it("blocks unknown command snapshots and live manifest fields", () => {
    const report = buildNonLiveSafetyReport({
      promptExecutionManifest: { pi: {}, "pi.extensions": ["./extension.js"] },
      sessionCompactionManifest: { "pi.prompts": ["./prompts"] },
      loadResult: { prompts: new Map([["commit", prompt("commit")]]), diagnostics: [] },
    });

    assert.equal(report.safeAsNonLiveCandidate, false);
    assert.equal(report.liveCutoverBlocked, true);
    assert.deepEqual(report.commandCollisions, undefined);
    assert.deepEqual(report.blockers, [
      "pi-prompt-template-execution:package.json#pi_present",
      "pi-prompt-template-execution:package.json#pi.extensions_present",
      "pi-session-compaction:package.json#pi.prompts_present",
      "unknown_existing_commands",
    ]);
  });

  it("reports an unblocked pure fixture only when manifests and command snapshot are clean", () => {
    const report = buildNonLiveSafetyReport({
      promptExecutionManifest: {},
      sessionCompactionManifest: {},
      loadResult: { prompts: new Map([["commit", prompt("commit")]]), diagnostics: [] },
      existingCommands: [{ name: "model" }],
      externalPromptTemplateModelInstalled: false,
    });

    assert.equal(report.safeAsNonLiveCandidate, true);
    assert.equal(report.liveCutoverBlocked, false);
    assert.deepEqual(report.blockers, []);
    assert.deepEqual(report.commandCollisions, []);
  });
});

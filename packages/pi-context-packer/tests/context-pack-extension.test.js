/**
summary: "Test Pi extension registration, wrappers, redaction, and runtime smoke commands."
read_when:
  - "You change context-packer extension tools, commands, contracts, or host configuration."
*/

import assert from "node:assert/strict";
import { mkdir, mkdtemp, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";

import contextPackerExtension from "../extensions/context-pack.ts";

const createHarness = () => {
  const commands = new Map();
  const tools = new Map();
  const sourceInfo = {
    path: "/test/context-pack.ts",
    source: "extension",
    scope: "temporary",
    origin: "test",
  };
  const pi = {
    registerCommand(name, definition) {
      commands.set(name, { name, source: "extension", sourceInfo, ...definition });
    },
    registerTool(definition) {
      tools.set(definition.name, definition);
    },
    getAllTools() {
      return [...tools.values()].map((tool) => ({
        name: tool.name,
        description: tool.description,
        parameters: tool.parameters,
        sourceInfo,
      }));
    },
    getCommands() {
      return [...commands.values()];
    },
  };
  contextPackerExtension(pi);
  return { commands, tools };
};

test("context-packer extension registers command and all model-callable tools", async () => {
  const { commands, tools } = createHarness();

  assert.equal(commands.has("context-pack"), true);
  assert.equal(commands.has("context-packer-release-smoke"), true);
  assert.deepEqual(
    [...tools.keys()],
    ["context_plan", "context_pack", "context_dogfood_evaluate", "context_dogfood_summarize"],
  );
  assert.equal(tools.get("context_dogfood_evaluate").parameters.additionalProperties, false);
  assert.equal(tools.get("context_dogfood_summarize").parameters.additionalProperties, false);
  assert.match(tools.get("context_plan").description, /repo-bounded AGENTS\/CLAUDE/);
  assert.match(
    tools.get("context_plan").promptGuidelines.join("\n"),
    /repo-bounded AGENTS\/CLAUDE/,
  );
  assert.match(tools.get("context_pack").description, /repo-bounded AGENTS\/CLAUDE/);
  assert.match(tools.get("context_pack").promptSnippet, /repo-bounded AGENTS\/CLAUDE/);
  assert.doesNotMatch(
    [
      tools.get("context_plan").description,
      tools.get("context_plan").promptGuidelines.join("\n"),
      tools.get("context_pack").description,
      tools.get("context_pack").promptSnippet,
    ].join("\n"),
    /AGENTS files|AGENTS\/docs\/git|docs\/AGENTS\/AK/,
  );

  const result = await tools.get("context_dogfood_evaluate").execute("tool-call-1", {
    observation: {
      kind: "context_pack_dogfood_observation_v1",
      prediction: {
        expectedLowLevelCallsAvoided: 1,
        packetUtilityRecommendationStatus: "use_packet",
      },
      observation: {
        activityType: "validation",
        actualLowLevelReadSearchStatusCalls: 0,
        actualLowLevelCallsAvoided: 1,
        validationCommandsRun: 0,
        duplicateReadsObserved: false,
        omissionFollowupsUsed: [],
        recommendationMatchedOutcome: true,
        notes: "extension smoke",
      },
    },
  });

  assert.match(result.content[0].text, /Status: matched/);
  assert.match(result.content[0].text, /Activity type: validation/);
  assert.match(result.content[0].text, /Validation commands run: 0/);
  assert.equal(result.details.dogfoodObservationEvaluation.status, "matched");
  assert.equal(
    result.details.runtimeContract.registeredToolContract,
    "context-packer-registered-tools-v1",
  );
  assert.equal(result.details.runtimeContract.runtimeBuild, "code-migration-v1");

  const aggregate = await tools.get("context_dogfood_summarize").execute("tool-call-2", {
    evaluations: [result.details.dogfoodObservationEvaluation],
  });

  assert.match(aggregate.content[0].text, /Context-pack dogfood aggregate evaluation/);
  assert.equal(aggregate.details.dogfoodAggregateEvaluation.validReceiptCount, 1);
  assert.equal(
    aggregate.details.runtimeContract.registeredToolContract,
    "context-packer-registered-tools-v1",
  );
  assert.equal(
    aggregate.details.dogfoodAggregateEvaluation.totals.validationCommandsRecordedCount,
    1,
  );
  assert.equal(
    aggregate.details.dogfoodAggregateEvaluation.totals.validationCommandsMissingCount,
    0,
  );
  assert.equal(aggregate.details.dogfoodAggregateEvaluation.activityTypeCounts.validation, 1);
});

test("context_plan honors an already-aborted tool signal", async () => {
  const { tools } = createHarness();
  const controller = new AbortController();
  controller.abort(new DOMException("operator cancelled", "AbortError"));

  await assert.rejects(
    tools
      .get("context_plan")
      .execute(
        "tool-call-cancelled-plan",
        { objective: "Plan docs context" },
        controller.signal,
        undefined,
        { cwd: process.cwd() },
      ),
    { name: "AbortError" },
  );
});

test("context-packer release smoke command executes registered tool closures", async () => {
  const { commands } = createHarness();
  const command = commands.get("context-packer-release-smoke");

  await command.handler("", {
    cwd: process.cwd(),
    hasUI: false,
    getSystemPrompt: () => "",
    getContextUsage: () => ({ usedTokens: 0, maxTokens: 100000 }),
  });
});

test("context_plan extension returns compact redacted details", async () => {
  const root = await mkdtemp(join(tmpdir(), "pi-context-plan-extension-redaction-"));
  await mkdir(join(root, "docs"), { recursive: true });
  await writeFile(join(root, "AGENTS.md"), "# AGENTS\n", "utf8");
  await writeFile(join(root, "docs", "note.md"), "# Note\n", "utf8");
  const sentinel = "EXTENSION_PLAN_SECRET_SENTINEL";
  const { tools } = createHarness();

  const result = await tools.get("context_plan").execute(
    "tool-call-plan-redaction",
    {
      objective: `Plan source-owned context for ${sentinel}`,
      cwd: root,
      repoRoot: root,
      seeds: [
        { kind: "path", value: "docs/note.md", note: `note-${sentinel}` },
        { kind: "symbol", value: `symbol${sentinel}` },
        { kind: "prompt", value: `prompt-${sentinel}` },
        { kind: "free_text", value: `free-${sentinel}` },
      ],
      providers: { docs: "required", prompt_vault: "required" },
    },
    undefined,
    undefined,
    { cwd: root },
  );

  assert.match(result.content[0].text, /Context plan for:/);
  assert.match(result.content[0].text, new RegExp(sentinel));
  assert.equal(result.details.ok, true);
  assert.equal(result.details.plan, undefined);
  assert.equal(result.details.objective, undefined);
  assert.equal(result.details.cwd, undefined);
  assert.equal(result.details.repoRoot, undefined);
  assert.equal(
    result.details.runtimeContract.registeredToolContract,
    "context-packer-registered-tools-v1",
  );
  assert.equal(result.details.runtimeContract.requiresCompactContextPlanDetails, true);
  assert.equal(result.details.redaction.rawObjectiveOmitted, true);
  assert.equal(result.details.redaction.rawQueriesOmitted, true);
  assert.equal(result.details.redaction.rawSeedsOmitted, true);
  assert.equal(result.details.redaction.rawSeedNotesOmitted, true);
  const docsPlan = result.details.providers.find((provider) => provider.provider === "docs");
  assert.equal(docsPlan.posture, "selected");
  assert.equal(docsPlan.proposedQueries[0].seedKindCounts.path, 1);
  assert.equal(docsPlan.proposedQueries[0].queryOmitted, true);
  assert.equal(docsPlan.proposedQueries[0].rawSeedsOmitted, true);
  assert.ok(result.details.nonAuthorizations.some((item) => item.includes("does not mutate")));

  const serializedDetails = JSON.stringify(result.details);
  assert.equal(serializedDetails.includes(root), false);
  assert.equal(serializedDetails.includes(sentinel), false);
  assert.equal(serializedDetails.includes("docs/note.md"), false);
  assert.equal(serializedDetails.includes("symbolEXTENSION"), false);
  assert.equal(serializedDetails.includes("note-EXTENSION"), false);
  assert.equal(serializedDetails.includes("prompt-EXTENSION"), false);
  assert.equal(serializedDetails.includes("free-EXTENSION"), false);
});

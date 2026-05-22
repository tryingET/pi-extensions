import assert from "node:assert/strict";
import test from "node:test";

import contextPackerExtension from "../extensions/context-pack.ts";

const createHarness = () => {
  const commands = new Map();
  const tools = new Map();
  const pi = {
    registerCommand(name, definition) {
      commands.set(name, definition);
    },
    registerTool(definition) {
      tools.set(definition.name, definition);
    },
  };
  contextPackerExtension(pi);
  return { commands, tools };
};

test("context-packer extension registers command and all model-callable tools", async () => {
  const { commands, tools } = createHarness();

  assert.equal(commands.has("context-pack"), true);
  assert.deepEqual(
    [...tools.keys()],
    ["context_plan", "context_pack", "context_dogfood_evaluate", "context_dogfood_summarize"],
  );
  assert.equal(tools.get("context_dogfood_evaluate").parameters.additionalProperties, false);
  assert.equal(tools.get("context_dogfood_summarize").parameters.additionalProperties, false);

  const result = await tools.get("context_dogfood_evaluate").execute("tool-call-1", {
    observation: {
      kind: "context_pack_dogfood_observation_v1",
      prediction: {
        expectedLowLevelCallsAvoided: 1,
        packetUtilityRecommendationStatus: "use_packet",
      },
      observation: {
        actualLowLevelReadSearchStatusCalls: 0,
        actualLowLevelCallsAvoided: 1,
        duplicateReadsObserved: false,
        omissionFollowupsUsed: [],
        recommendationMatchedOutcome: true,
        notes: "extension smoke",
      },
    },
  });

  assert.match(result.content[0].text, /Status: matched/);
  assert.equal(result.details.dogfoodObservationEvaluation.status, "matched");

  const aggregate = await tools.get("context_dogfood_summarize").execute("tool-call-2", {
    evaluations: [result.details.dogfoodObservationEvaluation],
  });

  assert.match(aggregate.content[0].text, /Context-pack dogfood aggregate evaluation/);
  assert.equal(aggregate.details.dogfoodAggregateEvaluation.validReceiptCount, 1);
});

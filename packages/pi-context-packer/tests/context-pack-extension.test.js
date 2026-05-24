import assert from "node:assert/strict";
import { mkdir, mkdtemp, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
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
        validationCommandsRun: 0,
        duplicateReadsObserved: false,
        omissionFollowupsUsed: [],
        recommendationMatchedOutcome: true,
        notes: "extension smoke",
      },
    },
  });

  assert.match(result.content[0].text, /Status: matched/);
  assert.match(result.content[0].text, /Validation commands run: 0/);
  assert.equal(result.details.dogfoodObservationEvaluation.status, "matched");

  const aggregate = await tools.get("context_dogfood_summarize").execute("tool-call-2", {
    evaluations: [result.details.dogfoodObservationEvaluation],
  });

  assert.match(aggregate.content[0].text, /Context-pack dogfood aggregate evaluation/);
  assert.equal(aggregate.details.dogfoodAggregateEvaluation.validReceiptCount, 1);
  assert.equal(
    aggregate.details.dogfoodAggregateEvaluation.totals.validationCommandsRecordedCount,
    1,
  );
  assert.equal(
    aggregate.details.dogfoodAggregateEvaluation.totals.validationCommandsMissingCount,
    0,
  );
});

test("context_pack extension passes trusted SCI read-only env only from host configuration", async () => {
  const root = await mkdtemp(join(tmpdir(), "pi-context-pack-extension-sci-"));
  await mkdir(join(root, "src"), { recursive: true });
  await writeFile(join(root, "AGENTS.md"), "# AGENTS\n", "utf8");
  await writeFile(join(root, "src", "example.js"), "export const target = 1;\n", "utf8");
  const { tools } = createHarness();
  const context = { cwd: root };
  const params = {
    objective: "Use code context for implementation",
    cwd: root,
    repoRoot: root,
    seeds: [{ kind: "path", value: "src/example.js" }],
    providers: { agents: "off", docs: "off", git: "off", sci: "required" },
  };
  const previousSafe = process.env.PI_CONTEXT_PACKER_SCI_READ_ONLY_SAFE;
  const previousCli = process.env.PI_CONTEXT_PACKER_SCI_CLI;

  try {
    delete process.env.PI_CONTEXT_PACKER_SCI_READ_ONLY_SAFE;
    process.env.PI_CONTEXT_PACKER_SCI_CLI = "/definitely/missing/context-packer-sci";
    const blocked = await tools
      .get("context_pack")
      .execute("tool-call-3", params, undefined, undefined, context);
    assert.match(JSON.stringify(blocked.details.omissions), /read-only safety was not confirmed/);

    process.env.PI_CONTEXT_PACKER_SCI_READ_ONLY_SAFE = "true";
    const enabled = await tools
      .get("context_pack")
      .execute("tool-call-4", params, undefined, undefined, context);
    assert.doesNotMatch(
      JSON.stringify(enabled.details.omissions),
      /read-only safety was not confirmed/,
    );
    assert.match(
      JSON.stringify(enabled.details.omissions),
      /SCI read_file unavailable|created or exposed \.ontology/,
    );
  } finally {
    if (previousSafe === undefined) delete process.env.PI_CONTEXT_PACKER_SCI_READ_ONLY_SAFE;
    else process.env.PI_CONTEXT_PACKER_SCI_READ_ONLY_SAFE = previousSafe;
    if (previousCli === undefined) delete process.env.PI_CONTEXT_PACKER_SCI_CLI;
    else process.env.PI_CONTEXT_PACKER_SCI_CLI = previousCli;
  }
});

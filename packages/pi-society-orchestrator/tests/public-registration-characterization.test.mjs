// summary: freezes the orchestrator extension and loop engine public registration contract before file splitting.
// read_when:
//   - splitting society-orchestrator.ts or loops/engine.ts, or changing public tools, commands, schemas, or host registration behavior.
import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import test from "node:test";

import registerSocietyOrchestrator from "../extensions/society-orchestrator.ts";
import { registerLoopTools } from "../src/loops/engine.ts";

function sha256(value) {
  return createHash("sha256").update(JSON.stringify(value)).digest("hex");
}

function createHarness() {
  const tools = [];
  const commands = [];
  const events = [];
  return {
    tools,
    commands,
    events,
    pi: {
      events: {
        on() {
          return () => {};
        },
        emit() {},
      },
      on(name, handler) {
        events.push([name, handler]);
      },
      registerTool(definition) {
        tools.push(definition);
      },
      registerCommand(name, definition) {
        commands.push([name, definition]);
      },
    },
  };
}

const COMMANDS = [
  ["cognitive", "List available cognitive tools from the vault"],
  ["agents-team", "Select routing scope"],
  ["runtime-status", "Inspect runtime truth and routing status"],
  ["runtime-boundary-telemetry", "Inspect lower-plane boundary execution telemetry"],
  ["evidence", "Show recent evidence via ak evidence search"],
  ["workflow", "Seed a workflow_execute call in the editor: /workflow [objective]"],
  ["workflows", "Show workflow wrapper usage and examples"],
  ["ontology", "Search ontology concepts"],
  ["loop", "Execute a loop: /loop <type> <objective>"],
  [
    "transcendent-iteration",
    "Dispatch Transcendent Iteration v4 through the governed orchestrator binding",
  ],
  [
    "loop-tree",
    "Show loop runs in a /tree-like editor-area navigator. Use /loop-runs for a non-interactive snapshot.",
  ],
  ["loop-runs", "Show loop runs as a non-interactive text snapshot"],
  [
    "loop-checkpoints",
    "Inspect seven-day checkpoint retention; use /loop-checkpoints prune to apply cleanup",
  ],
  ["loops", "List available loop types"],
];

const TOOL_CONTRACTS = [
  [
    "direction_controller_readback",
    ["repo", "intent"],
    ["intent"],
    "511647f61a4224efab3ecf97188ec1d421148c9f013b8c40cd1e96899600c859",
    "ed6edc5796247dbb77ae97f583e48a9aa9bd8a143e3493bf8fa234ef786ec535",
  ],
  [
    "society_query",
    ["query"],
    ["query"],
    "d61f12232d2c1c240a43dea24875e2f3684ad130debe88f646f8f1f445c3470a",
    "8f855ef9586caa3d9e2e9ee025850ae1429112941ef57c978074a30f38ce54bb",
  ],
  [
    "orchestrator_boundary_telemetry",
    ["limit"],
    [],
    "93f1dd45ec830bde48c5bba74fd2aef7f9c4964092fa487a01211d46a5893cc3",
    "629251323df0352d64799b3c5429900231653446ea21a54ed579d010e5e40e84",
  ],
  [
    "cognitive_dispatch",
    ["context", "agent", "cognitive_tool"],
    ["context"],
    "41b63d17175dcd5e5795e72e600e5cd1687d9fc08b4718f834605e623f54a7db",
    "ac7c992624a8c0dda57fa09e03fa4044b6ec496fc9cc04cab43a221e1ba6cf92",
  ],
  [
    "evidence_record",
    ["check_type", "result", "task_id", "details"],
    ["check_type", "result"],
    "2f7a044ae2384ad1846123e2bb1ab1c2d41145ebc23794bd84577ba47a01b8a4",
    "b8c12d369bbd59e169fe37b82e3ebf0a92be507b6927502cc0435defeba19b8a",
  ],
  [
    "ontology_context",
    ["concept", "search"],
    [],
    "f1d485f73ac8763d8eebfee7451b6621aba7bb0a6e4c3a7e9d6f9324f0316420",
    "3bf6f4604cdf2feed4c8be99fc8af0332bff2b82d13d55424deec511703449dd",
  ],
  [
    "ts_quality_release_workflow",
    ["action", "cwd", "version", "apply", "externalMutationApproved", "timeoutMs"],
    ["version"],
    "6b73f8ceb7c7a6a2d113b43e076cb20e103ab0387782a5511e16aacffba2e941",
    "24ee8a654259b34367d33dab2cbd8ccc637fad58410e1540d458576506217489",
  ],
  [
    "autoresearch_live_supervision",
    [
      "action",
      "taskId",
      "cwd",
      "objective",
      "candidateCount",
      "candidateObjectives",
      "candidatePacketDirectory",
      "scenarios",
      "hypotheses",
      "candidateCountPerCell",
      "parentPeerTarget",
      "launchAuthorizationToken",
      "level3CandidateBindings",
      "level3CandidateResultPacketDirectory",
      "candidateResults",
      "candidateResultPacketPaths",
      "sourceReview",
      "selectedLaneId",
      "selectedCellId",
      "dirtyFiles",
      "reviewedAtEpochMs",
      "applyAuthorizationToken",
      "finalizerAuthorizationToken",
      "cleanupAuthorizationToken",
      "integrationCloseout",
      "cleanupPeerRunIds",
      "cleanupPeerTabsOrSessions",
      "cleanupWorktrees",
      "cleanupBranches",
      "validation",
      "runnerManifestPath",
      "checkpointConfirmation",
      "completedActionCount",
      "level3ManifestPath",
      "level3Manifest",
      "level4ReceiptPath",
      "maxAutomatedActions",
      "maxParallelCandidatePeers",
      "allowMeasureExportReview",
      "allowReviewGeneration",
      "maxIterations",
      "maxWallClockMinutes",
      "benchmarkCommand",
      "checksCommand",
      "metricName",
      "metricUnit",
      "direction",
      "metricThreshold",
      "reconfigure",
      "filesInScope",
      "offLimits",
      "constraints",
      "planner",
      "materializeDspxIntent",
      "runDspxProgramGen",
      "dspxProgramGenTimeoutSeconds",
      "dspxIntentPath",
      "dspxOutdir",
      "dspxBehaviorPath",
      "intervalSeconds",
    ],
    [],
    "e2db0783a845826a9529d67ba7e471fab4263b6693341af4ff9b08e3e4d38d69",
    "cd7b20cfcd2cfcf21d16d417ecba621ed0090169300bc48c7b5534fc84ef676b",
  ],
  [
    "autoresearch_manifest_campaign_supervision",
    ["action", "taskId", "cwd", "manifestPath"],
    ["manifestPath"],
    "c721aaa2e280443d62b83e60e8a5bf42e0f6e706afdfe1bb57914a82a1d039a8",
    "185dcb98c15e1b5e667f6c980213bfa758574639ac953f198feb7619f863555a",
  ],
  [
    "autoresearch_self_hosting_supervision",
    ["action", "taskId", "cwd"],
    ["cwd"],
    "a09d0f71a4f29b5dc165486bc31408ccb874110d54e08671af57629e978d8642",
    "73b68279e6993d9b9b65406c0a2396bea24e335624ea80571c9824f38753b51a",
  ],
  [
    "autoresearch_learning_kes_adapter",
    ["action", "packetPath", "sessionId"],
    ["packetPath"],
    "1ffa7ba9d652fbae60efebbf462cb18530da19c2bb394bd73e6603e60d2c200e",
    "6be29600100e8cb2f8336847c19d42cbc992ec27977bea650dcfd3edf9799aec",
  ],
  [
    "workflow_execute",
    ["request"],
    ["request"],
    "cebcc0a21ec3de0475b2428c6c54cfab2ce16007182a9bf1191ac8322bd6acfa",
    "e757452375bdc62aafc112a85bff4e3d510f3f4123f262545a956ec4a9e88ab7",
  ],
  [
    "loop_execute",
    [
      "loop",
      "objective",
      "continue_after_failure",
      "loop_timeout_seconds",
      "phase_timeout_seconds",
      "resume_run_id",
      "expected_failed_phase",
      "recovery_mode",
    ],
    ["loop", "objective"],
    "c0c916607d4c2decb9f3257acf5d6bf24ccdc63316f632e7cbb587a489c8a65a",
    "a476a7be8c1a75f7b6fdcbaa4944f12ea23968c1625b3089144bea6374bc1c33",
  ],
  [
    "vault_execute_template",
    [
      "template_name",
      "objective",
      "transfer_mode",
      "repo",
      "packet_key",
      "packet_id",
      "packet_source",
      "packet_source_sha256",
      "expected_task_ids",
      "expected_dependencies",
      "authorization_block_ref",
      "task_id",
      "decision_id",
      "actor",
      "task_scope_sha256",
      "task_intent_sha256",
      "template_version",
      "template_content_sha256",
      "continue_after_failure",
      "loop_timeout_seconds",
      "phase_timeout_seconds",
      "resume_run_id",
      "expected_failed_phase",
      "recovery_mode",
    ],
    ["template_name", "objective"],
    "3824fa1da36aa0fad7b973aec4863d39a57c50821fc30c50d464f01dd3bdbc44",
    "1e8cbc96cf967211b2c6e642a2dea0f4501aca02adf50b4f7321c9031d54b7f8",
  ],
];

test("orchestrator freezes exact public tool, command, and event registration order", () => {
  const harness = createHarness();
  registerSocietyOrchestrator(harness.pi);

  assert.deepEqual(
    harness.tools.map((tool) => tool.name),
    TOOL_CONTRACTS.map(([name]) => name),
  );
  assert.deepEqual(
    harness.commands.map(([name, command]) => [name, command.description]),
    COMMANDS,
  );
  assert.deepEqual(
    harness.events.map(([name]) => name),
    ["session_start", "input"],
  );
  assert.ok(harness.tools.every((tool) => typeof tool.execute === "function"));
  assert.ok(harness.commands.every(([, command]) => typeof command.handler === "function"));
  assert.deepEqual(
    harness.tools.map((tool) => [
      tool.name,
      typeof tool.renderCall === "function",
      typeof tool.renderResult === "function",
    ]),
    [
      ["direction_controller_readback", true, true],
      ["society_query", true, true],
      ["orchestrator_boundary_telemetry", true, true],
      ["cognitive_dispatch", true, true],
      ["evidence_record", false, false],
      ["ontology_context", false, false],
      ["ts_quality_release_workflow", true, true],
      ["autoresearch_live_supervision", true, true],
      ["autoresearch_manifest_campaign_supervision", true, true],
      ["autoresearch_self_hosting_supervision", true, true],
      ["autoresearch_learning_kes_adapter", true, true],
      ["workflow_execute", true, true],
      ["loop_execute", true, true],
      ["vault_execute_template", true, true],
    ],
  );
});

test("orchestrator freezes representative renderer output", () => {
  const harness = createHarness();
  registerSocietyOrchestrator(harness.pi);
  const tools = new Map(harness.tools.map((tool) => [tool.name, tool]));
  const theme = {
    bold(text) {
      return text;
    },
    fg(_color, text) {
      return text;
    },
  };

  const societyQuery = tools.get("society_query");
  assert.equal(
    societyQuery.renderCall({ query: "SELECT 123" }, theme).text,
    "society_query SELECT 123",
  );
  assert.equal(
    societyQuery.renderResult({ content: [{ type: "text", text: "diagnostic row" }] }, {}, theme)
      .text,
    "diagnostic row",
  );

  const loopExecute = tools.get("loop_execute");
  assert.equal(
    loopExecute.renderCall({ loop: "kaizen", objective: "improve tests" }, theme).text,
    "loop_execute kaizen — improve tests",
  );
  assert.equal(
    loopExecute.renderResult(
      {
        content: [{ type: "text", text: "done" }],
        details: { ok: true, result: { plugin: "kaizen", elapsed: 2_400 } },
      },
      {},
      theme,
    ).text,
    "✓ kaizen 2s",
  );
});

test("orchestrator freezes complete JSON schemas and public tool descriptions", () => {
  const harness = createHarness();
  registerSocietyOrchestrator(harness.pi);

  assert.deepEqual(
    harness.tools.map((tool) => [
      tool.name,
      Object.keys(tool.parameters.properties ?? {}),
      tool.parameters.required ?? [],
      sha256(tool.parameters),
      sha256({
        label: tool.label,
        description: tool.description,
        promptSnippet: tool.promptSnippet,
        promptGuidelines: tool.promptGuidelines,
      }),
    ]),
    TOOL_CONTRACTS,
  );
});

test("orchestrator and loop command adapters preserve representative current messages", async () => {
  const harness = createHarness();
  registerSocietyOrchestrator(harness.pi);
  const commands = new Map(harness.commands);
  const notifications = [];
  const editorText = [];
  const ctx = {
    hasUI: true,
    ui: {
      notify(message, type) {
        notifications.push({ message, type });
      },
      setEditorText(value) {
        editorText.push(value);
      },
    },
  };

  await commands.get("workflow").handler("audit package seams", ctx);
  assert.deepEqual(notifications.shift(), {
    message: "Seeded workflow_execute chain for: audit package seams",
    type: "info",
  });
  assert.match(editorText.shift(), /^workflow_execute\(\{\n {2}"request": \{/);

  await commands.get("loop").handler("", ctx);
  assert.deepEqual(notifications.shift(), {
    message:
      "Usage: /loop <type> <objective>\n\nAvailable: ooda, strategic, kaizen, adkar, transcendent",
    type: "warning",
  });

  await commands.get("loop").handler("mito retain behavior", ctx);
  assert.deepEqual(notifications.shift(), {
    message:
      "The `mito` loop name was retired because it collided with Prof. Binner's MITO. Use `strategic` instead.",
    type: "error",
  });
  assert.equal(
    editorText.shift(),
    'loop_execute({ loop: "strategic", objective: "retain behavior" })',
  );
});

test("compat registration adapters propagate a host malformed-schema rejection unchanged", () => {
  const orchestratorHostError = new TypeError("host rejected malformed society_query schema");
  assert.throws(
    () =>
      registerSocietyOrchestrator({
        events: {
          on() {
            return () => {};
          },
          emit() {},
        },
        on() {},
        registerCommand() {},
        registerTool(tool) {
          if (tool.name === "society_query") throw orchestratorHostError;
        },
      }),
    (error) => error === orchestratorHostError,
  );

  const loopHostError = new TypeError("host rejected malformed loop_execute schema");
  assert.throws(
    () =>
      registerLoopTools({
        registerTool(tool) {
          assert.equal(tool.name, "loop_execute");
          throw loopHostError;
        },
      }),
    (error) => error === loopHostError,
  );
});

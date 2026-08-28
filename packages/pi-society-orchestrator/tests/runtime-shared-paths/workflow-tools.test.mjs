import assert from "node:assert/strict";
import test from "node:test";
import extension from "../../extensions/society-orchestrator.ts";

test("manifest campaign supervision tool advertises exact-anchor evidence-only boundaries", () => {
  const tools = new Map();

  extension({
    registerTool(tool) {
      tools.set(tool.name, tool);
    },
    registerCommand() {},
    on() {},
  });

  const tool = tools.get("autoresearch_manifest_campaign_supervision");
  assert.ok(tool, "expected autoresearch_manifest_campaign_supervision to register");
  assert.match(tool.description, /Observe one exact manifest-driven pi-autoresearch campaign/);
  assert.ok(
    tool.promptGuidelines.some((line) =>
      /one-shot observation or bounded AK evidence projection/.test(line),
    ),
  );
  assert.ok(
    tool.promptGuidelines.some((line) =>
      /does not add polling, stage execution, or task lifecycle mutation/.test(line),
    ),
  );

  const parameterContract = JSON.stringify(tool.parameters);
  assert.equal(parameterContract.includes("intervalSeconds"), false);
  assert.equal(parameterContract.includes("stage"), false);
  assert.equal(parameterContract.includes("buildId"), false);
});

test("workflow_execute fails closed when the governed cognitive tool is unavailable", async (t) => {
  const cases = [
    {
      name: "boundary failure",
      lookupResult: { ok: false, error: "prompt plane unavailable" },
      expectedReason: "boundary_failure",
      expectedError: /prompt plane unavailable/,
    },
    {
      name: "lookup exception",
      lookupError: new Error("prompt plane crashed"),
      expectedReason: "lookup_exception",
      expectedError: /prompt plane crashed/,
    },
    {
      name: "missing template",
      lookupResult: { ok: true, value: null },
      expectedReason: "not_found",
      expectedError: /was not found/,
    },
    {
      name: "empty prepared content",
      lookupResult: {
        ok: true,
        value: { name: "controlled", type: "cognitive", description: "", content: "  " },
      },
      expectedReason: "empty_content",
      expectedError: /empty content/,
    },
  ];

  for (const testCase of cases) {
    await t.test(testCase.name, async () => {
      const tools = new Map();
      const lookups = [];
      let workflowFactoryCalls = 0;
      extension(
        {
          registerTool(tool) {
            tools.set(tool.name, tool);
          },
          registerCommand() {},
          on() {},
        },
        {
          async workflowCognitiveToolLookup(name, context, signal) {
            lookups.push({ name, context, signal });
            if (testCase.lookupError) throw testCase.lookupError;
            return testCase.lookupResult;
          },
          workflowExecutorFactory() {
            workflowFactoryCalls += 1;
            throw new Error("workflow executor must not be constructed");
          },
        },
      );

      const workflow = tools.get("workflow_execute");
      assert.ok(workflow, "expected workflow_execute to register");
      const result = await workflow.execute(
        "workflow-fail-closed",
        {
          request: {
            mode: "chain",
            steps: [{ kind: "step", agent: "builder", objective: "must not dispatch" }],
          },
        },
        undefined,
        undefined,
        { cwd: "/tmp/workflow-fail-closed", model: undefined },
      );

      assert.deepEqual(lookups, [
        {
          name: "controlled",
          context: { cwd: "/tmp/workflow-fail-closed" },
          signal: undefined,
        },
      ]);
      assert.equal(workflowFactoryCalls, 0);
      assert.equal(result.details.ok, false);
      assert.equal(result.details.errorCode, "workflow_cognitive_tool_unavailable");
      assert.equal(result.details.mode, "chain");
      assert.equal(result.details.status, "blocked");
      assert.equal(result.details.stepCount, 0);
      assert.equal(result.details.cognitiveTool, "controlled");
      assert.equal(result.details.lookupFailure, testCase.expectedReason);
      assert.equal(result.details.dispatchedSteps, 0);
      assert.match(result.content[0].text, /Workflow execution blocked/);
      assert.match(result.content[0].text, testCase.expectedError);
    });
  }
});

test("workflow_execute preserves cancellation after cognitive lookup resolves", async (t) => {
  for (const testCase of [
    {
      name: "successful lookup result",
      lookupResult: {
        ok: true,
        value: {
          name: "controlled",
          type: "cognitive",
          description: "",
          content: "CONTROLLED FRAMEWORK",
        },
      },
    },
    {
      name: "boundary failure result",
      lookupResult: { ok: false, error: "prompt plane unavailable after cancellation" },
    },
  ]) {
    await t.test(testCase.name, async () => {
      const tools = new Map();
      const controller = new AbortController();
      let workflowFactoryCalls = 0;
      extension(
        {
          registerTool(tool) {
            tools.set(tool.name, tool);
          },
          registerCommand() {},
          on() {},
        },
        {
          async workflowCognitiveToolLookup() {
            controller.abort("operator cancelled workflow");
            return testCase.lookupResult;
          },
          workflowExecutorFactory() {
            workflowFactoryCalls += 1;
            throw new Error("workflow executor must not be constructed after cancellation");
          },
        },
      );

      await assert.rejects(
        tools.get("workflow_execute").execute(
          "workflow-cancelled-after-lookup",
          {
            request: {
              mode: "chain",
              steps: [{ kind: "step", agent: "builder", objective: "must not dispatch" }],
            },
          },
          controller.signal,
          undefined,
          { cwd: "/tmp/workflow-cancelled", model: undefined },
        ),
        (error) => error === "operator cancelled workflow",
      );
      assert.equal(workflowFactoryCalls, 0);
    });
  }
});

test("workflow_execute validates before cognitive lookup or executor construction", async () => {
  const tools = new Map();
  let lookupCalls = 0;
  let workflowFactoryCalls = 0;
  extension(
    {
      registerTool(tool) {
        tools.set(tool.name, tool);
      },
      registerCommand() {},
      on() {},
    },
    {
      async workflowCognitiveToolLookup() {
        lookupCalls += 1;
        throw new Error("must not look up an invalid workflow");
      },
      workflowExecutorFactory() {
        workflowFactoryCalls += 1;
        throw new Error("must not construct an executor for an invalid workflow");
      },
    },
  );

  const result = await tools.get("workflow_execute").execute(
    "workflow-invalid-before-lookup",
    {
      request: {
        mode: "chain",
        steps: [{ kind: "step", agent: "builder", objective: "" }],
      },
    },
    undefined,
    undefined,
    { cwd: "/tmp/workflow-invalid", model: undefined },
  );

  assert.equal(result.details.errorCode, "workflow_validation_failed");
  assert.equal(lookupCalls, 0);
  assert.equal(workflowFactoryCalls, 0);
});

test("workflow_execute preserves governed cognitive content exactly on success", async () => {
  const tools = new Map();
  const governedContent = "  CONTROLLED FRAMEWORK\nKeep deliberate whitespace.\n";
  let executionParams;
  let workflowFactoryCalls = 0;
  extension(
    {
      registerTool(tool) {
        tools.set(tool.name, tool);
      },
      registerCommand() {},
      on() {},
    },
    {
      async workflowCognitiveToolLookup() {
        return {
          ok: true,
          value: {
            name: "controlled",
            type: "cognitive",
            description: "",
            content: governedContent,
          },
        };
      },
      workflowExecutorFactory() {
        workflowFactoryCalls += 1;
        return {
          async execute(params) {
            executionParams = params;
            return {
              mode: "chain",
              status: "done",
              steps: [],
              aggregatedOutput: "workflow complete",
            };
          },
        };
      },
    },
  );

  const result = await tools.get("workflow_execute").execute(
    "workflow-governed-success",
    {
      request: {
        mode: "chain",
        steps: [{ kind: "step", agent: "builder", objective: "bounded success fixture" }],
      },
    },
    undefined,
    undefined,
    { cwd: "/tmp/workflow-governed-success", model: undefined },
  );

  assert.equal(result.details.ok, true);
  assert.equal(workflowFactoryCalls, 1);
  assert.equal(executionParams.cognitiveToolContent, governedContent);
});

test("workflow command seeds a workflow_execute call into the editor", async () => {
  const commands = new Map();

  extension({
    registerTool() {},
    registerCommand(name, command) {
      commands.set(name, command);
    },
    on() {},
  });

  const command = commands.get("workflow");
  assert.ok(command, "expected workflow command to register");

  const notifications = [];
  let editorText = "";
  await command.handler("Inspect the current repo for workflow entry points", {
    hasUI: true,
    cwd: process.cwd(),
    ui: {
      setEditorText(text) {
        editorText = text;
      },
      notify(message, level) {
        notifications.push({ message, level });
      },
    },
  });

  assert.match(editorText, /^workflow_execute\(/);
  assert.match(editorText, /"mode": "chain"/);
  assert.match(editorText, /Inspect the current repo for workflow entry points/);
  assert.match(editorText, /Review the findings from:/);
  assert.deepEqual(notifications, [
    {
      message:
        "Seeded workflow_execute chain for: Inspect the current repo for workflow entry points",
      level: "info",
    },
  ]);
});

test("workflows command shows wrapper usage and examples", async () => {
  const commands = new Map();

  extension({
    registerTool() {},
    registerCommand(name, command) {
      commands.set(name, command);
    },
    on() {},
  });

  const command = commands.get("workflows");
  assert.ok(command, "expected workflows command to register");

  const editors = [];
  await command.handler("", {
    hasUI: true,
    cwd: process.cwd(),
    ui: {
      async editor(title, text) {
        editors.push({ title, text });
      },
    },
  });

  assert.equal(editors.length, 1);
  assert.equal(editors[0]?.title, "Workflow wrappers");
  assert.match(editors[0]?.text || "", /Thin command adapters over `workflow_execute`/);
  assert.match(editors[0]?.text || "", /dispatch_subagent/);
  assert.match(editors[0]?.text || "", /cognitive_dispatch/);
  assert.match(editors[0]?.text || "", /loop_execute/);
  assert.match(editors[0]?.text || "", /workflow_execute/);
  assert.match(editors[0]?.text || "", /DSPy \/ DSPx/);
  assert.match(editors[0]?.text || "", /subagents are the execution units underneath/);
  assert.match(editors[0]?.text || "", /reserve worktree mode for eligible mutation cases/);
});
